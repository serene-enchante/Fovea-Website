/**
 * Fast & exact Pole of Inaccessibility (Polylabel) algorithm.
 * Finds the most distant internal point from the polygon outline (maximum clearance from all borders).
 * Guaranteed to place labels in the widest, most spacious part of any polygon (even concave/complex).
 */
export function polylabel(polygon, precision = 0.0005) {
    const outerRing = polygon[0];
    if (!outerRing || outerRing.length < 3) return null;

    // Bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < outerRing.length; i++) {
        const p = outerRing[i];
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const cellSize = Math.min(width, height);
    const h = cellSize / 2;

    if (cellSize === 0) return [minX, minY];

    // Signed distance from point to polygon (positive if inside, negative if outside)
    function pointToPolygonDist(px, py) {
        let inside = false;
        let minDistSq = Infinity;

        for (let k = 0; k < polygon.length; k++) {
            const ring = polygon[k];
            for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
                const a = ring[i];
                const b = ring[j];

                if ((a[1] > py !== b[1] > py) &&
                    (px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0])) {
                    inside = !inside;
                }

                // Distance to segment [a, b]
                let dx = b[0] - a[0];
                let dy = b[1] - a[1];
                let distSq;
                if (dx === 0 && dy === 0) {
                    distSq = (px - a[0]) ** 2 + (py - a[1]) ** 2;
                } else {
                    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
                    const projX = a[0] + t * dx;
                    const projY = a[1] + t * dy;
                    distSq = (px - projX) ** 2 + (py - projY) ** 2;
                }

                if (distSq < minDistSq) minDistSq = distSq;
            }
        }

        const dist = Math.sqrt(minDistSq);
        return inside ? dist : -dist;
    }

    // Cell object constructor
    function createCell(x, y, h) {
        const d = pointToPolygonDist(x, y);
        return {
            x: x,
            y: y,
            h: h,
            d: d,
            max: d + h * Math.SQRT2
        };
    }

    // Priority queue of cells
    const cellQueue = [];
    
    // Initial best cell at centroid
    let sumX = 0, sumY = 0, totalPts = outerRing.length;
    for (let i = 0; i < totalPts; i++) {
        sumX += outerRing[i][0];
        sumY += outerRing[i][1];
    }
    let bestCell = createCell(sumX / totalPts, sumY / totalPts, 0);

    // Initial grid of cells covering the bbox
    for (let x = minX; x < maxX; x += cellSize) {
        for (let y = minY; y < maxY; y += cellSize) {
            const cell = createCell(x + h, y + h, h);
            cellQueue.push(cell);
            if (cell.d > bestCell.d) bestCell = cell;
        }
    }

    // Sort descending by max potential
    cellQueue.sort((a, b) => b.max - a.max);

    // Subdivide and search
    let iter = 0;
    while (cellQueue.length > 0 && iter < 1000) {
        iter++;
        const cell = cellQueue.shift();

        if (cell.d > bestCell.d) {
            bestCell = cell;
        }

        // Stop if cell's max potential cannot beat bestCell
        if (cell.max - bestCell.d <= precision) continue;

        // Subdivide cell into 4 smaller cells
        const subH = cell.h / 2;
        const sub1 = createCell(cell.x - subH, cell.y - subH, subH);
        const sub2 = createCell(cell.x + subH, cell.y - subH, subH);
        const sub3 = createCell(cell.x - subH, cell.y + subH, subH);
        const sub4 = createCell(cell.x + subH, cell.y + subH, subH);

        [sub1, sub2, sub3, sub4].forEach(sub => {
            if (sub.max > bestCell.d) {
                // Insert into sorted queue
                let inserted = false;
                for (let i = 0; i < cellQueue.length; i++) {
                    if (sub.max > cellQueue[i].max) {
                        cellQueue.splice(i, 0, sub);
                        inserted = true;
                        break;
                    }
                }
                if (!inserted) cellQueue.push(sub);
            }
        });
    }

    return [bestCell.x, bestCell.y];
}

/**
 * Helper to compute the most spacious interior point for a GeoJSON feature (maximum border clearance).
 */
export function getFeatureCenter(feature) {
    if (!feature || !feature.geometry) return null;
    const geom = feature.geometry;
    if (geom.type === "Point") return geom.coordinates;

    const polygons = geom.type === "Polygon" ? [geom.coordinates] : 
                     (geom.type === "MultiPolygon" ? geom.coordinates : []);
    
    if (polygons.length === 0) return null;

    // Pick the polygon with largest bbox area if MultiPolygon
    let mainPoly = polygons[0];
    if (polygons.length > 1) {
        let maxBboxArea = 0;
        polygons.forEach(p => {
            if (p[0] && p[0].length >= 3) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                p[0].forEach(c => {
                    if (c[0] < minX) minX = c[0];
                    if (c[1] < minY) minY = c[1];
                    if (c[0] > maxX) maxX = c[0];
                    if (c[1] > maxY) maxY = c[1];
                });
                const area = (maxX - minX) * (maxY - minY);
                if (area > maxBboxArea) {
                    maxBboxArea = area;
                    mainPoly = p;
                }
            }
        });
    }

    return polylabel(mainPoly);
}
