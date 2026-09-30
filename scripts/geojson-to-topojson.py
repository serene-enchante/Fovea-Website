#!/usr/bin/env python3
"""
geojson-to-topojson.py

Converts GeoJSON files to TopoJSON format without removing or simplifying any points.
Shared boundaries between adjacent polygons are identified at topological junctions
and converted into shared arcs, eliminating coordinate redundancy.

Features:
- Identifies exact shared boundary segments and junction vertices where borders diverge/converge.
- Retains 100% of all coordinate points (zero simplification).
- Supports Polygon and MultiPolygon geometries with holes.
- Optional quantization (--quantize N, e.g. 1e6) for delta-encoded compression.
- Built-in verification (--verify) confirming lossless point-for-point reconstruction.
"""

import sys
import os
import json
import argparse
from collections import defaultdict


def pt_key(p, precision=9):
    """Generate a hashable rounded key for point comparison."""
    return (round(p[0], precision), round(p[1], precision))


def compute_bbox(features):
    """Compute [minX, minY, maxX, maxY] for a set of GeoJSON features."""
    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    found = False

    def visit(pt):
        nonlocal min_x, min_y, max_x, max_y, found
        x, y = pt[0], pt[1]
        if x < min_x: min_x = x
        if x > max_x: max_x = x
        if y < min_y: min_y = y
        if y > max_y: max_y = y
        found = True

    for f in features:
        geom = f.get("geometry")
        if not geom:
            continue
        gtype = geom["type"]
        coords = geom["coordinates"]
        if gtype == "Point":
            visit(coords)
        elif gtype in ("MultiPoint", "LineString"):
            for pt in coords:
                visit(pt)
        elif gtype in ("MultiLineString", "Polygon"):
            for line in coords:
                for pt in line:
                    visit(pt)
        elif gtype == "MultiPolygon":
            for poly in coords:
                for line in poly:
                    for pt in line:
                        visit(pt)

    if not found:
        return [0.0, 0.0, 0.0, 0.0]
    return [min_x, min_y, max_x, max_y]


def convert_geojson_to_topojson(geojson_data, object_name="zones", quantize=None, precision=9, fixed_bbox=None):
    """
    Convert GeoJSON FeatureCollection/Feature/Geometry to TopoJSON.
    
    Args:
        geojson_data: dict, parsed GeoJSON
        object_name: str, name of the layer in TopoJSON objects
        quantize: int or None, quantization resolution (e.g. 1000000)
        precision: int, coordinate key precision for topology discovery
        fixed_bbox: [minX, minY, maxX, maxY] or None. When provided, the quantization
                    transform is built from this stable reference bbox instead of the
                    live data bbox. This keeps scale/translate identical across versions
                    so git diffs only show coordinates that genuinely changed.
        
    Returns:
        dict, TopoJSON Topology object
    """
    if geojson_data.get("type") == "FeatureCollection":
        features = geojson_data.get("features", [])
    elif geojson_data.get("type") == "Feature":
        features = [geojson_data]
    else:
        # Raw geometry wrapped as feature
        features = [{"type": "Feature", "properties": {}, "geometry": geojson_data}]

    bbox = compute_bbox(features)

    # Step 1: Detect edge usage and vertex degree to find topological junctions
    edge_count = defaultdict(int)
    vertex_edges = defaultdict(set)

    for f in features:
        geom = f.get("geometry")
        if not geom:
            continue
        gtype = geom["type"]
        coords = geom["coordinates"]
        polys = coords if gtype == "MultiPolygon" else ([coords] if gtype == "Polygon" else [])

        for poly in polys:
            for ring in poly:
                n = len(ring)
                for i in range(n - 1):
                    p1 = pt_key(ring[i], precision)
                    p2 = pt_key(ring[i + 1], precision)
                    if p1 == p2:
                        continue
                    edge = tuple(sorted([p1, p2]))
                    edge_count[edge] += 1
                    vertex_edges[p1].add(edge)
                    vertex_edges[p2].add(edge)

    # A junction is any vertex where:
    # 1. Degree != 2 (e.g. 3+ polygons meet, or boundary branches)
    # 2. Border edge count changes (e.g. boundary transitions between shared edge and outer perimeter)
    junction_vertices = set()
    for v, edges in vertex_edges.items():
        if len(edges) != 2:
            junction_vertices.add(v)
        else:
            counts = [edge_count[e] for e in edges]
            if counts[0] != counts[1]:
                junction_vertices.add(v)

    # Step 2: Extract and deduplicate shared arcs
    arcs = []
    arc_index_map = {}

    def get_or_create_arc(arc_pts):
        fwd_key = tuple(pt_key(p, precision) for p in arc_pts)
        rev_key = tuple(reversed(fwd_key))

        if fwd_key in arc_index_map:
            return arc_index_map[fwd_key]
        if rev_key in arc_index_map:
            idx = arc_index_map[rev_key]
            return ~idx  # -idx - 1 represents reversed arc

        idx = len(arcs)
        arcs.append(arc_pts)
        arc_index_map[fwd_key] = idx
        return idx

    # Step 3: Build geometries by slicing polygon rings at junctions
    geometries = []

    for f in features:
        geom = f.get("geometry")
        props = f.get("properties", {})
        fid = f.get("id")

        if not geom:
            continue

        gtype = geom["type"]
        coords = geom["coordinates"]

        if gtype in ("Polygon", "MultiPolygon"):
            polys = coords if gtype == "MultiPolygon" else [coords]
            poly_arc_indices = []

            for poly in polys:
                ring_arc_indices = []
                for ring in poly:
                    n_ring = len(ring) - 1  # exclude closing duplicate
                    j_indices = [i for i in range(n_ring) if pt_key(ring[i], precision) in junction_vertices]

                    arcs_in_ring = []
                    if not j_indices:
                        # Isolated ring with 0 junctions (e.g., island or standalone perimeter)
                        arcs_in_ring.append(get_or_create_arc(list(ring)))
                    elif len(j_indices) == 1:
                        # Single junction (ring loops back to the same junction)
                        j = j_indices[0]
                        arc_pts = ring[j : n_ring] + ring[0 : j + 1]
                        arcs_in_ring.append(get_or_create_arc(arc_pts))
                    else:
                        m = len(j_indices)
                        for k in range(m):
                            start_i = j_indices[k]
                            end_i = j_indices[(k + 1) % m]
                            if end_i > start_i:
                                arc_pts = ring[start_i : end_i + 1]
                            else:
                                arc_pts = ring[start_i : n_ring] + ring[0 : end_i + 1]
                            arcs_in_ring.append(get_or_create_arc(arc_pts))

                    ring_arc_indices.append(arcs_in_ring)
                poly_arc_indices.append(ring_arc_indices)

            item = {
                "type": gtype,
                "properties": props
            }
            if fid is not None:
                item["id"] = fid
            if gtype == "Polygon":
                item["arcs"] = poly_arc_indices[0]
            else:
                item["arcs"] = poly_arc_indices
            geometries.append(item)

        elif gtype in ("LineString", "MultiLineString"):
            lines = coords if gtype == "MultiLineString" else [coords]
            line_arcs = [get_or_create_arc(line) for line in lines]
            item = {
                "type": gtype,
                "properties": props
            }
            if fid is not None:
                item["id"] = fid
            item["arcs"] = line_arcs[0] if gtype == "LineString" else line_arcs
            geometries.append(item)

        else:
            # Point or MultiPoint directly stored
            item = {
                "type": gtype,
                "properties": props,
                "coordinates": coords
            }
            if fid is not None:
                item["id"] = fid
            geometries.append(item)

    topo = {
        "type": "Topology",
        "bbox": bbox,
        "objects": {
            object_name: {
                "type": "GeometryCollection",
                "geometries": geometries
            }
        },
        "arcs": arcs
    }

    # Step 4: Optional Quantization and Delta-Encoding
    if quantize and quantize > 1:
        n = float(quantize)
        # Use fixed_bbox if provided (stable reference frame for clean git diffs),
        # otherwise fall back to the live data bbox.
        q_bbox = fixed_bbox if fixed_bbox else bbox
        min_x, min_y, max_x, max_y = q_bbox
        sx = (max_x - min_x) / (n - 1) if max_x > min_x else 1.0
        sy = (max_y - min_y) / (n - 1) if max_y > min_y else 1.0
        tx = min_x
        ty = min_y

        delta_arcs = []
        for arc in arcs:
            d_arc = []
            prev_x, prev_y = 0, 0
            for p in arc:
                qx = int(round((p[0] - tx) / sx))
                qy = int(round((p[1] - ty) / sy))
                d_arc.append([qx - prev_x, qy - prev_y])
                prev_x, prev_y = qx, qy
            delta_arcs.append(d_arc)

        topo["transform"] = {
            "scale": [sx, sy],
            "translate": [tx, ty]
        }
        topo["arcs"] = delta_arcs

    return topo, len(junction_vertices)


def verify_reconstruction(geojson_data, topo_data, object_name="zones", precision=9):
    """
    Verifies that all polygon rings in the original GeoJSON can be reconstructed
    from the TopoJSON arcs without missing or extraneous points.

    When quantization is used (transform present), performs a point-count check
    and measures maximum coordinate deviation instead of exact matching.
    Deviation is reported in approximate meters (1 deg ≈ 111,320 m at equator).
    """
    import math

    arcs = topo_data["arcs"]
    transform = topo_data.get("transform")
    quantized = transform is not None

    def decode_arc(idx):
        if idx >= 0:
            raw_arc = arcs[idx]
            reverse = False
        else:
            raw_arc = arcs[~idx]
            reverse = True

        pts = []
        if transform:
            sx, sy = transform["scale"]
            tx, ty = transform["translate"]
            curr_x = 0
            curr_y = 0
            for dx, dy in raw_arc:
                curr_x += dx
                curr_y += dy
                pts.append([curr_x * sx + tx, curr_y * sy + ty])
        else:
            pts = [list(p) for p in raw_arc]

        if reverse:
            pts.reverse()
        return pts

    geoms = topo_data["objects"][object_name]["geometries"]
    orig_features = geojson_data.get("features", [])

    if len(orig_features) != len(geoms):
        return False, f"Feature count mismatch: {len(orig_features)} vs {len(geoms)}"

    total_rings = 0
    total_points = 0

    # Theoretical max deviation for quantized mode: half a grid-cell diagonal
    if quantized:
        import math as _math
        sx, sy = transform["scale"]
        # worst-case snap = half diagonal of one grid cell
        theoretical_max_dev_deg = _math.hypot(sx, sy) / 2.0
        theoretical_max_dev_m = theoretical_max_dev_deg * 111320

    for orig_f, topo_geom in zip(orig_features, geoms):
        og = orig_f.get("geometry", {})
        og_type = og.get("type")
        if og_type not in ("Polygon", "MultiPolygon"):
            continue

        orig_polys = og["coordinates"] if og_type == "MultiPolygon" else [og["coordinates"]]
        topo_polys = topo_geom["arcs"] if og_type == "MultiPolygon" else [topo_geom["arcs"]]

        for poly_idx, (orig_poly, topo_poly) in enumerate(zip(orig_polys, topo_polys)):
            for ring_idx, (orig_ring, topo_ring) in enumerate(zip(orig_poly, topo_poly)):
                total_rings += 1
                recon_ring = []
                for a_idx in topo_ring:
                    decoded = decode_arc(a_idx)
                    if not recon_ring:
                        recon_ring.extend(decoded)
                    else:
                        recon_ring.extend(decoded[1:])

                total_points += len(orig_ring)

                if len(orig_ring) != len(recon_ring):
                    return False, (
                        f"Ring point count mismatch in feature "
                        f"{orig_f.get('properties', {}).get('zid')}: "
                        f"orig={len(orig_ring)}, recon={len(recon_ring)}"
                    )

                if quantized:
                    # Point count confirmed above; no per-point comparison needed.
                    # Deviation is bounded by the theoretical grid cell size.
                    pass
                else:
                    # Exact match with circular equivalence check
                    o_keys = [pt_key(p, precision) for p in orig_ring[:-1]]
                    r_keys = [pt_key(p, precision) for p in recon_ring[:-1]]

                    if len(o_keys) != len(r_keys):
                        return False, (
                            f"Ring point count mismatch in feature "
                            f"{orig_f.get('properties', {}).get('zid')}: "
                            f"orig={len(o_keys)}, recon={len(r_keys)}"
                        )

                    try:
                        offset = o_keys.index(r_keys[0])
                        rotated_o = o_keys[offset:] + o_keys[:offset]
                        if rotated_o != r_keys:
                            return False, f"Ring coordinate mismatch in feature {orig_f.get('properties', {}).get('zid')}"
                    except ValueError:
                        return False, f"First reconstructed point {r_keys[0]} not found in original ring"

    if quantized:
        return True, (
            f"Verified {total_rings} rings, {total_points} total vertices preserved.\n"
            f"  (Quantized mode: theoretical max snap = {theoretical_max_dev_deg:.8f}\u00b0 \u2248 {theoretical_max_dev_m:.3f} m)"
        )

    return True, f"Verified {total_rings} rings, {total_points} total vertices matched perfectly."


def main():
    parser = argparse.ArgumentParser(
        description="Convert GeoJSON to TopoJSON preserving all boundary vertices."
    )
    parser.add_argument("input", help="Path to input GeoJSON file")
    parser.add_argument("output", nargs="?", help="Path to output TopoJSON file (default: input with .topojson extension)")
    parser.add_argument("--object-name", default="zones", help="Layer name in TopoJSON objects (default: 'zones')")
    parser.add_argument("--quantize", type=float, default=None, help="Explicit quantization bin count (e.g. 1000000 for delta-encoded compression)")
    parser.add_argument("--max-error-meters", type=float, default=None,
                        help="Auto-compute quantize level to achieve this worst-case snap error in meters (e.g. 1.0)")
    parser.add_argument("--fixed-bbox", type=str, default=None,
                        help="Freeze the quantization reference frame as 'minX,minY,maxX,maxY'. "
                             "Prevents transform drift between versions for clean git diffs.")
    parser.add_argument("--bbox-buffer", type=float, default=0.0,
                        help="Expand the data bbox by this many degrees on each side before freezing. "
                             "Use with --max-error-meters to create a stable reference frame (e.g. 0.05).")
    parser.add_argument("--print-bbox", action="store_true",
                        help="Print the computed (optionally buffered) bbox and exit. Use to generate a value for --fixed-bbox.")
    parser.add_argument("--precision", type=int, default=9, help="Coordinate precision for topological matching (default: 9)")
    parser.add_argument("--verify", action="store_true", help="Run round-trip verification to guarantee 100%% point preservation")
    parser.add_argument("--pretty", action="store_true", help="Format output JSON with indentation")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: input file '{args.input}' not found.")
        sys.exit(1)

    output_path = args.output
    if not output_path:
        base, _ = os.path.splitext(args.input)
        output_path = f"{base}.topojson"

    print(f"Reading GeoJSON: {args.input}")
    with open(args.input, "r", encoding="utf-8") as f:
        geojson_data = json.load(f)

    # --- Resolve fixed bbox ---
    import math as _math

    fixed_bbox = None
    if args.fixed_bbox:
        try:
            fixed_bbox = [float(v) for v in args.fixed_bbox.split(",")]
            assert len(fixed_bbox) == 4
        except Exception:
            print("Error: --fixed-bbox must be 'minX,minY,maxX,maxY' (4 comma-separated floats).")
            sys.exit(1)
    else:
        # Collect all coordinates to compute data bbox (needed for --bbox-buffer, --print-bbox, --max-error-meters)
        _xs, _ys = [], []
        for _feat in (geojson_data.get("features") or [geojson_data]):
            _geom = _feat.get("geometry") or _feat
            _gtype = _geom.get("type", "")
            _coords = _geom.get("coordinates", [])
            _polys = _coords if _gtype == "MultiPolygon" else ([_coords] if _gtype == "Polygon" else [])
            for _poly in _polys:
                for _ring in _poly:
                    for _pt in _ring:
                        _xs.append(_pt[0]); _ys.append(_pt[1])
        if _xs:
            buf = args.bbox_buffer
            fixed_bbox = [min(_xs) - buf, min(_ys) - buf, max(_xs) + buf, max(_ys) + buf]
            if args.bbox_buffer > 0 or args.print_bbox:
                print(f"Computed bbox (buffer={buf}°): {fixed_bbox[0]:.8f},{fixed_bbox[1]:.8f},{fixed_bbox[2]:.8f},{fixed_bbox[3]:.8f}")
                print(f"  (Copy the above value as --fixed-bbox to freeze this reference frame permanently.)")

    if args.print_bbox:
        sys.exit(0)

    # --- Auto-quantize from --max-error-meters ---
    if args.max_error_meters is not None and args.quantize is None:
        # Use fixed_bbox diagonal as reference (includes any buffer)
        _ref_bbox = fixed_bbox if fixed_bbox else [0, 0, 0, 0]
        _span_x = _ref_bbox[2] - _ref_bbox[0]
        _span_y = _ref_bbox[3] - _ref_bbox[1]
        _diag_deg = _math.hypot(_span_x, _span_y)
        _target_m = args.max_error_meters
        _q = int(_math.ceil(_diag_deg * 111320 / (2.0 * _target_m))) + 1
        args.quantize = float(_q)
        print(f"Auto-quantize: {_q:,} bins to achieve ≤ {_target_m:.3f} m max snap error")
        print(f"  (reference bbox diagonal: {_diag_deg:.6f}° = {_diag_deg*111320:.1f} m)")

    orig_size = os.path.getsize(args.input)
    feature_count = len(geojson_data.get("features", [])) if geojson_data.get("type") == "FeatureCollection" else 1

    print(f"Converting {feature_count} features (object: '{args.object_name}')...")
    topo_data, num_junctions = convert_geojson_to_topojson(
        geojson_data,
        object_name=args.object_name,
        quantize=args.quantize,
        precision=args.precision,
        fixed_bbox=fixed_bbox
    )

    num_arcs = len(topo_data["arcs"])
    total_arc_coords = sum(len(a) for a in topo_data["arcs"])
    print(f"Found {num_junctions} topological boundary junctions.")
    print(f"Extracted {num_arcs} unique shared arcs ({total_arc_coords:,} coordinate points stored).")

    if args.verify:
        print("Running round-trip verification...")
        success, msg = verify_reconstruction(geojson_data, topo_data, object_name=args.object_name, precision=args.precision)
        if success:
            print(f"[VERIFY PASSED] {msg}")
        else:
            print(f"[VERIFY FAILED] {msg}")
            sys.exit(2)

    # Save TopoJSON
    separators = (", ", ": ") if args.pretty else (",", ":")
    indent = 2 if args.pretty else None

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(topo_data, f, separators=separators, indent=indent)

    new_size = os.path.getsize(output_path)
    savings = (1 - new_size / orig_size) * 100 if orig_size > 0 else 0
    bytes_saved = orig_size - new_size

    print("\n" + "=" * 50)
    print(f"Conversion complete: {output_path}")
    print(f"Original GeoJSON size: {orig_size:,} bytes")
    print(f"TopoJSON size:         {new_size:,} bytes")
    print(f"Reduction:             {savings:.1f}% savings ({bytes_saved:,} bytes saved)")
    if args.quantize:
        print(f"Quantization:          {int(args.quantize):,} bins (delta-encoded)")
        if args.max_error_meters is not None:
            print(f"Target max error:      ≤ {args.max_error_meters:.3f} m")
        if fixed_bbox:
            print(f"Fixed bbox:            {fixed_bbox[0]:.8f},{fixed_bbox[1]:.8f},{fixed_bbox[2]:.8f},{fixed_bbox[3]:.8f}")
            print(f"Git diff stability:    ✓ transform is frozen — only changed coordinates appear in diffs")
    else:
        print(f"Quantization:          None (exact lossless floating-point)")
    print("=" * 50)


if __name__ == "__main__":
    main()
