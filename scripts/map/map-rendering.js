import { state } from '../state.js';
import { canvasToTiffBlob } from '../services/format-converters.js';
import { handleSpatialFileShare } from '../services/file-download-service.js';
import { FALLBACK_IMAGE, displayZoneId } from '../utils/format-utils.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { showToast } from '../components/toast-view.js';
import { updateControlPositions } from '../components/mobile-view.js';
import { adjustHeaderFontSize } from '../components/header-view.js';

// ──────────────────────────────────────────────────────────────
// Headless offscreen MapLibre renderer for PDF / TIFF export
// ──────────────────────────────────────────────────────────────

const ESRI_TOPO_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";

// Offscreen map viewport dimensions (used by the hidden MapLibre canvas) — 3800px width with safe WebGL headroom
const OFFSCREEN_MAP_WIDTH = 3800;
const OFFSCREEN_MAP_HEIGHT = 2500;

// Final layout canvas dimensions (4:3 ratio, 4000×3000 high-res print layout)
const LAYOUT_WIDTH = 4000;
const LAYOUT_HEIGHT = 3000;

/**
 * Compute bounding box from GeoJSON features.
 * Returns [[minLng, minLat], [maxLng, maxLat]].
 */
function computeBbox(features) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    const processCoord = (coord) => {
        if (coord[0] < minLng) minLng = coord[0];
        if (coord[1] < minLat) minLat = coord[1];
        if (coord[0] > maxLng) maxLng = coord[0];
        if (coord[1] > maxLat) maxLat = coord[1];
    };
    const processGeom = (geom) => {
        if (!geom) return;
        if (geom.type === "Polygon") {
            geom.coordinates[0].forEach(processCoord);
        } else if (geom.type === "MultiPolygon") {
            geom.coordinates.forEach(poly => poly[0].forEach(processCoord));
        } else if (geom.type === "Point") {
            processCoord(geom.coordinates);
        }
    };
    if (Array.isArray(features)) {
        features.forEach(f => processGeom(f.geometry));
    } else {
        processGeom(features.geometry);
    }
    if (minLng === Infinity) return [[-123.3, 43.9], [-122.9, 44.2]];
    return [[minLng, minLat], [maxLng, maxLat]];
}

/**
 * Normalize a zone ID for comparison (strips leading zeroes).
 */
function normalizeZoneIdLocal(value) {
    if (!value) return "";
    const upper = String(value).toUpperCase().trim();
    const match = upper.match(/^0*(\d+)([A-Z]?)$/);
    if (!match) return upper;
    return `${Number(match[1])}${match[2]}`;
}

/**
 * Calculate a scale bar from geographic bounds and layout pixel width.
 * Pure math — no dependency on any map instance.
 */
export function getLayoutScaleBar(bounds, layoutMapWidth) {
    if (!bounds || !bounds[0] || !bounds[1]) return { miles: 1, pxWidth: 250 };

    const [[minLng, minLat], [maxLng, maxLat]] = bounds;
    const centerLat = (minLat + maxLat) / 2;

    // Haversine distance across the full visible longitude span at center latitude
    const lat1Rad = centerLat * Math.PI / 180;
    const dLon = (maxLng - minLng) * Math.PI / 180;
    const a = Math.cos(lat1Rad) * Math.cos(lat1Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const totalMiles = 3958.8 * c; // Earth radius in miles

    const milesPerPx = totalMiles / layoutMapWidth;
    const targetPx = 330;
    const approxMiles = targetPx * milesPerPx;

    const niceIncrements = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 50, 100];
    let chosenMiles = niceIncrements[0];
    let minDiff = Math.abs(approxMiles - chosenMiles);
    for (let i = 1; i < niceIncrements.length; i++) {
        const diff = Math.abs(approxMiles - niceIncrements[i]);
        if (diff < minDiff) {
            minDiff = diff;
            chosenMiles = niceIncrements[i];
        }
    }

    const scaleBarPx = Math.max(160, Math.min(750, chosenMiles / milesPerPx));
    return { miles: chosenMiles, pxWidth: scaleBarPx };
}

/**
 * Load a QR code image from the qrserver.com API (fallback if QRCode lib not available).
 */
function loadQrCodeImage(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&format=png&data=${encodeURIComponent(url)}`;
        setTimeout(() => resolve(null), 3000);
    });
}

/**
 * Fast & exact Pole of Inaccessibility (Polylabel) algorithm.
 * Finds the most distant internal point from the polygon outline (maximum clearance from all borders).
 * Guaranteed to place labels in the widest, most spacious part of any polygon (even concave/complex).
 */
function polylabel(polygon, precision = 0.0005) {
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
function getFeatureCenter(feature) {
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

/**
 * Create a headless offscreen MapLibre GL instance, render Esri Topo tiles
 * with optional zone polygon overlays, and return the WebGL canvas + zone label positions.
 *
 * @param {Array} bounds - [[minLng, minLat], [maxLng, maxLat]]
 * @param {Object|null} geojsonOverlay - Full GeoJSON FeatureCollection for polygon overlays
 * @param {number} maxZoom - Maximum zoom level for fitBounds
 * @returns {Promise<{canvas: HTMLCanvasElement, zoneLabels: Array}>} The rendered map canvas and projected zone label points
 */
async function renderHeadlessMap(bounds, geojsonOverlay = null, maxZoom = 18) {
    // 1. Create a hidden offscreen container (3800×2500 px with safe WebGL headroom)
    const container = document.createElement("div");
    container.style.cssText = `
        position: fixed; left: -9999px; top: 0;
        width: ${OFFSCREEN_MAP_WIDTH}px; height: ${OFFSCREEN_MAP_HEIGHT}px;
        z-index: -99999; visibility: hidden; pointer-events: none;
    `;
    document.body.appendChild(container);

    try {
        // 2. Build an inline MapLibre style with Esri Topo raster source baked in
        const style = {
            version: 8,
            sources: {
                "esri-topo": {
                    type: "raster",
                    tiles: [ESRI_TOPO_TILE_URL],
                    tileSize: 256,
                    maxzoom: 18
                }
            },
            layers: [
                { id: "esri-topo-layer", type: "raster", source: "esri-topo" }
            ]
        };

        // 3. Instantiate a fresh MapLibre map in the hidden container
        const offscreenMap = new maplibregl.Map({
            container: container,
            style: style,
            preserveDrawingBuffer: true,
            interactive: false,
            attributionControl: false,
            maxZoom: 20,
            minZoom: 0
        });

        // 4. Wait for style to load
        await new Promise((resolve, reject) => {
            offscreenMap.on("load", resolve);
            offscreenMap.on("error", (e) => {
                console.warn("Offscreen map error:", e);
                resolve(); // Continue even on error
            });
            setTimeout(resolve, 5000); // Failsafe
        });

        // 5. Add zone polygon overlay if provided (red outlines, no fill)
        if (geojsonOverlay) {
            try {
                offscreenMap.addSource("zone-polygons", {
                    type: "geojson",
                    data: geojsonOverlay
                });
                offscreenMap.addLayer({
                    id: "zone-polygons-outline",
                    type: "line",
                    source: "zone-polygons",
                    paint: {
                        "line-color": "#dc2626",
                        "line-width": 4.5,
                        "line-opacity": 0.9
                    }
                });
            } catch (e) {
                console.warn("Could not add zone polygon overlay:", e);
            }
        }

        // 6. Fit to the target bounds with padding
        offscreenMap.fitBounds(bounds, { padding: 180, maxZoom: maxZoom, animate: false });

        // 7. Wait for tiles to fully load and render
        await new Promise((resolve) => {
            let checkCount = 0;
            const checkIdle = () => {
                checkCount++;
                if (offscreenMap.areTilesLoaded() || checkCount > 40) {
                    offscreenMap.off("idle", checkIdle);
                    resolve();
                }
            };
            offscreenMap.on("idle", checkIdle);
            offscreenMap.triggerRepaint();
            setTimeout(resolve, 4000); // Failsafe for slow network tiles
        });

        // 8. Project zone / circle centers to pixel coordinates before destroying map
        const zoneLabels = [];
        if (geojsonOverlay && Array.isArray(geojsonOverlay.features)) {
            geojsonOverlay.features.forEach(f => {
                const props = f.properties || {};
                let label = "";
                let isCircle = false;
                if (props.cid) {
                    label = String(props.cid);
                    isCircle = true;
                } else if (props.zid) {
                    label = typeof displayZoneId === "function" ? displayZoneId(props.zid) : String(props.zid);
                } else if (props.name) {
                    label = String(props.name);
                }

                if (!label) return;

                const center = getFeatureCenter(f);
                if (center) {
                    try {
                        const pt = offscreenMap.project(center);
                        if (pt && typeof pt.x === "number" && typeof pt.y === "number") {
                            zoneLabels.push({
                                label: label,
                                x: pt.x,
                                y: pt.y,
                                isCircle: isCircle
                            });
                        }
                    } catch (e) {}
                }
            });
        }

        // 9. Grab the WebGL canvas
        const mapCanvas = offscreenMap.getCanvas();

        // 10. Copy the canvas pixels to a new standalone canvas before destroying the map
        const resultCanvas = document.createElement("canvas");
        resultCanvas.width = mapCanvas.width;
        resultCanvas.height = mapCanvas.height;
        const resultCtx = resultCanvas.getContext("2d");
        resultCtx.drawImage(mapCanvas, 0, 0);

        // 11. Destroy the headless map instance
        offscreenMap.remove();

        return { canvas: resultCanvas, zoneLabels: zoneLabels };
    } finally {
        // Always clean up the offscreen container
        if (container.parentNode) {
            container.parentNode.removeChild(container);
        }
    }
}

/**
 * Render a full cartographic print layout canvas using a headless offscreen MapLibre instance.
 * Completely independent of the on-screen map — can be invoked from any page.
 *
 * @param {Object} options
 * @param {Array} options.features - GeoJSON features array (zone polygons)
 * @param {string|null} options.targetFeatureId - Specific zone ID, or null/CIRCLE_ID for full circle
 * @param {string} options.currentFeature - "eugene" | "florence" | "circles"
 * @param {boolean} options.isCirclesFeature - Whether showing all circles overview
 * @param {string} [options.pageUrl] - URL for QR code (defaults to window.location.href)
 * @returns {Promise<HTMLCanvasElement>} The final 4000×3000 layout canvas
 */
export async function renderMapLayoutCanvas({
    features,
    targetFeatureId,
    currentFeature,
    isCirclesFeature,
    pageUrl
} = {}) {
    // Resolve defaults from state if not provided (backward compatibility)
    const allFeatures = features || state.allFeatures || [];
    const featureId = targetFeatureId !== undefined ? targetFeatureId : state.currentId;
    const featureName = currentFeature || state.currentFeature || "eugene";
    const isCircles = isCirclesFeature !== undefined ? isCirclesFeature : state.isCirclesFeature;
    const qrUrl = pageUrl || window.location.href;

    // Determine target feature and bounds
    const isCircle = !featureId || featureId === CIRCLE_ID;
    let targetFeature = null;
    if (!isCircle) {
        targetFeature = allFeatures.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === featureId.toLowerCase() || normalizeZoneIdLocal(zid) === normalizeZoneIdLocal(featureId));
        });
    }

    const targetBounds = (isCircle || !targetFeature)
        ? computeBbox(allFeatures)
        : computeBbox([targetFeature]);

    // Build GeoJSON overlay for zone polygons
    const overlayGeojson = {
        type: "FeatureCollection",
        features: allFeatures.filter(f => f.geometry)
    };

    // Maximum zoom: use 18 for specific zones, 20 for full circle
    const maxZoom = (isCircle || !targetFeature) ? 20 : 18;

    // Render the headless map at 3800×2500
    const { canvas: mapCanvas, zoneLabels } = await renderHeadlessMap(targetBounds, overlayGeojson, maxZoom);

    // Build the final layout canvas (4000 × 3000)
    const layoutCanvas = document.createElement("canvas");
    const width = LAYOUT_WIDTH;
    const height = LAYOUT_HEIGHT;
    layoutCanvas.width = width;
    layoutCanvas.height = height;
    const ctx = layoutCanvas.getContext("2d");

    // 1. Pure White outer canvas background (Paper Print-Friendly)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // 2. Define inner map frame layout box (4000×3000 scaled)
    const mapMargin = 100;
    const headerHeight = 180;
    const footerHeight = 120;

    const mapX = mapMargin;
    const mapY = mapMargin + headerHeight;
    const mapW = width - (mapMargin * 2);
    const mapH = height - mapY - footerHeight - mapMargin;

    // Background for map box (clean off-white for topo rendering)
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(mapX, mapY, mapW, mapH);

    // Draw the headless map canvas into the layout map box
    if (mapCanvas) {
        try {
            ctx.drawImage(mapCanvas, mapX, mapY, mapW, mapH);
        } catch (err) {
            console.warn("Could not draw map canvas:", err);
        } finally {
            // Reclaim intermediate offscreen map canvas buffer immediately
            try {
                mapCanvas.width = 0;
                mapCanvas.height = 0;
            } catch (e) {}
        }
    }

    // Draw red zone / circle labels directly (no circle background)
    if (zoneLabels && zoneLabels.length > 0) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        zoneLabels.forEach(({ label, x, y, isCircle }) => {
            const canvasX = mapX + x;
            const canvasY = mapY + y;

            // Only render label if inside the map boundary with margin
            if (canvasX >= mapX + 35 && canvasX <= mapX + mapW - 35 &&
                canvasY >= mapY + 35 && canvasY <= mapY + mapH - 35) {

                if (isCircle) {
                    // Count circle regional labels (e.g. Eugene, Florence, Oakridge, Cottage Grove)
                    const text = label;
                    ctx.font = "bold 52px system-ui, -apple-system, sans-serif";
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 10;
                    ctx.lineJoin = "round";
                    ctx.strokeText(text, canvasX, canvasY);
                    ctx.fillStyle = "#dc2626";
                    ctx.fillText(text, canvasX, canvasY);
                } else {
                    // Survey zone number labels (e.g. 1, 06, 14A)
                    const fontSize = label.length > 2 ? 40 : 48;
                    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;

                    // White text halo outline for contrast over terrain contours
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 8;
                    ctx.lineJoin = "round";
                    ctx.strokeText(label, canvasX, canvasY);

                    // Bold red zone number text
                    ctx.fillStyle = "#dc2626";
                    ctx.fillText(label, canvasX, canvasY);
                }
            }
        });
        ctx.restore();
    }

    // Inner map frame border - Crisp minimal dark border
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.strokeRect(mapX, mapY, mapW, mapH);

    // 3. Header Text
    const hasSpecificZone = featureId && featureId !== CIRCLE_ID;

    // Header Title Text (Crisp Dark Typography for Paper Printing)
    ctx.fillStyle = "#111827";
    ctx.font = "bold 76px system-ui, -apple-system, sans-serif";
    const headerTitleText = isCircles
        ? "COAST TO CASCADES BIRD ALLIANCE"
        : (featureName === "florence" ? "FLORENCE CHRISTMAS BIRD COUNT" : "EUGENE CHRISTMAS BIRD COUNT");
    ctx.fillText(headerTitleText, mapMargin, mapMargin + 75);

    // Subtitle / Selection Name (ONLY if specific zone)
    if (hasSpecificZone) {
        ctx.fillStyle = "#dc2626";
        ctx.font = "bold 50px system-ui, -apple-system, sans-serif";
        const subTitleText = `SURVEY ZONE ${displayZoneId(featureId)}`;
        ctx.fillText(subTitleText, mapMargin, mapMargin + 150);
    }

    // Date & Basemap Metadata (Right-aligned, no box)
    ctx.fillStyle = "#374151";
    ctx.font = "44px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";
    const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    ctx.fillText(dateStr, mapMargin + mapW, mapMargin + 75);
    ctx.font = "34px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.fillText("Base Map: Esri World Topography", mapMargin + mapW, mapMargin + 140);
    ctx.textAlign = "left";

    // 4. Minimal Cartographic Map Overlays (4000×3000 Scaled)
    // North Arrow Emblem
    const naX = mapX + mapW - 125;
    const naY = mapY + 140;
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.beginPath();
    ctx.arc(naX, naY, 66, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.stroke();

    // North Pointer Needle
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.moveTo(naX, naY - 46);
    ctx.lineTo(naX + 20, naY + 13);
    ctx.lineTo(naX, naY + 3);
    ctx.fill();

    ctx.fillStyle = "#9ca3af";
    ctx.beginPath();
    ctx.moveTo(naX, naY - 46);
    ctx.lineTo(naX - 20, naY + 13);
    ctx.lineTo(naX, naY + 3);
    ctx.fill();

    ctx.fillStyle = "#111827";
    ctx.font = "bold 33px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", naX, naY - 53);
    ctx.restore();

    // Actual Calculated Scale Bar in Miles
    const scaleInfo = getLayoutScaleBar(targetBounds, mapW);

    const barX = mapX + 50;
    const barY = mapY + mapH - 165;
    const barW = Math.max(430, scaleInfo.pxWidth + 100);
    const barH = 115;

    // Scale Box
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3.5;
    ctx.strokeRect(barX, barY, barW, barH);

    // Scale Bar Line & Ticks
    const lineStartX = barX + 50;
    const lineEndX = lineStartX + scaleInfo.pxWidth;
    const lineY = barY + 75;

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(lineStartX, lineY);
    ctx.lineTo(lineEndX, lineY);
    ctx.moveTo(lineStartX, lineY - 13);
    ctx.lineTo(lineStartX, lineY + 13);
    ctx.moveTo(lineEndX, lineY - 13);
    ctx.lineTo(lineEndX, lineY + 13);
    const midX = (lineStartX + lineEndX) / 2;
    ctx.moveTo(midX, lineY - 8);
    ctx.lineTo(midX, lineY + 8);
    ctx.stroke();

    // Scale Bar Numerical Labels
    ctx.fillStyle = "#111827";
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("0", lineStartX, lineY - 20);
    ctx.fillText(`${scaleInfo.miles} mi`, lineEndX, lineY - 20);
    ctx.textAlign = "left";

    // QR Code Box Overlay (Bottom Right of Map Area)
    const qrX = mapX + mapW - 290;
    const qrY = mapY + mapH - 315;
    const qrBoxW = 250;
    const qrBoxH = 275;

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillRect(qrX, qrY, qrBoxW, qrBoxH);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3.5;
    ctx.strokeRect(qrX, qrY, qrBoxW, qrBoxH);

    let qrDrawn = false;
    if (typeof QRCode !== "undefined") {
        try {
            const qrContainer = document.createElement("div");
            new QRCode(qrContainer, {
                text: qrUrl,
                width: 200,
                height: 200,
                correctLevel: QRCode.CorrectLevel.M
            });
            const qrCanvas = qrContainer.querySelector("canvas");
            const qrImg = qrContainer.querySelector("img");
            if (qrCanvas) {
                ctx.drawImage(qrCanvas, qrX + 25, qrY + 20, 200, 200);
                qrDrawn = true;
            } else if (qrImg && qrImg.complete) {
                ctx.drawImage(qrImg, qrX + 25, qrY + 20, 200, 200);
                qrDrawn = true;
            }
        } catch (e) {
            console.warn("QRCode generation error:", e);
        }
    }

    if (!qrDrawn) {
        const qrImage = await loadQrCodeImage(qrUrl);
        if (qrImage) {
            ctx.drawImage(qrImage, qrX + 25, qrY + 20, 200, 200);
        }
    }

    ctx.fillStyle = "#111827";
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SCAN FOR ONLINE MAP", qrX + (qrBoxW / 2), qrY + 252);
    ctx.textAlign = "left";

    // 5. Clean Footer Text
    const footY = height - footerHeight - mapMargin + 30;
    ctx.fillStyle = "#374151";
    ctx.font = "31px system-ui, sans-serif";
    const bbox = computeBbox(allFeatures);
    const boundsText = `Spatial Extent (WGS84): [${bbox[0][0].toFixed(4)}°W, ${bbox[0][1].toFixed(4)}°N] to [${bbox[1][0].toFixed(4)}°W, ${bbox[1][1].toFixed(4)}°N]`;
    ctx.fillText(boundsText, mapMargin, footY + 40);

    ctx.fillStyle = "#6b7280";
    ctx.font = "26px system-ui, sans-serif";
    ctx.fillText("Printed with Fovea | Esri World Topographic Basemap © Esri, DeLorme, NAVTEQ", mapMargin, footY + 86);

    return layoutCanvas;
}

export function setupMapEffectsAndFullscreen(mapWrapper) {
    if (!mapWrapper) return;

    mapWrapper.onmousemove = e => {
        if (window.innerWidth <= 768) return;
        const rect = mapWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        mapWrapper.style.setProperty("--mouse-x", `${x}px`);
        mapWrapper.style.setProperty("--mouse-y", `${y}px`);
    };

    mapWrapper.onmouseleave = () => {
        mapWrapper.style.setProperty("--mouse-x", `-1000px`);
        mapWrapper.style.setProperty("--mouse-y", `-1000px`);
    };

    const triggerMobileHomeAnimation = () => {
        if (window.innerWidth <= 768) {
            const targets = document.querySelectorAll(".intro-header, .maps-tile-header, .maps-tile-sidebar");
            targets.forEach(el => {
                el.classList.remove("animate-mobile-slide-down");
                void el.offsetWidth;
                el.classList.add("animate-mobile-slide-down");
            });
        }
    };

    const handleResize = () => {
        updateControlPositions();
        adjustHeaderFontSize();
        if (state.map) {
            state.map.invalidateSize();
            setTimeout(() => state.map.invalidateSize(), 50);
            setTimeout(() => state.map.invalidateSize(), 200);
            setTimeout(() => state.map.invalidateSize(), 400);
        }
        updateLabelZoomVisibility();
    };

    document.addEventListener("fullscreenchange", () => {
        if (!document.fullscreenElement) {
            mapWrapper.classList.remove("is-fullscreen");
            triggerMobileHomeAnimation();
        } else {
            mapWrapper.classList.add("is-fullscreen");
        }
        handleResize();
    });

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
}

// ──────────────────────────────────────────────────────────────
// Pre-render Cache & Garbage Management Engine
// ──────────────────────────────────────────────────────────────

const RASTER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
const DOWNLOAD_VIEW_PRELOAD_DELAY_MS = 500; // 0.5s wait after opening downloads view

let activeRasterCache = {
    key: null,
    promise: null,
    canvas: null,
    createdAt: 0,
    timerId: null
};

let downloadViewPreloadTimer = null;

/**
 * Schedules background raster rendering 0.5s after user opens downloads view (both desktop & mobile)
 */
export function scheduleDownloadViewPreload() {
    cancelDownloadViewPreload();
    downloadViewPreloadTimer = setTimeout(() => {
        downloadViewPreloadTimer = null;
        preloadMapLayout({
            features: state.allFeatures,
            targetFeatureId: state.currentId,
            currentFeature: state.currentFeature,
            isCirclesFeature: state.isCirclesFeature
        });
    }, DOWNLOAD_VIEW_PRELOAD_DELAY_MS);
}

/**
 * Cancels pending download view preload timer
 */
export function cancelDownloadViewPreload() {
    if (downloadViewPreloadTimer) {
        clearTimeout(downloadViewPreloadTimer);
        downloadViewPreloadTimer = null;
    }
}

// Backwards compatibility alias
export const scheduleSelectionPreload = scheduleDownloadViewPreload;
export const cancelSelectionPreload = cancelDownloadViewPreload;

/**
 * Generates a deterministic cache key from layout rendering options
 */
export function getRasterCacheKey({
    targetFeatureId,
    currentFeature,
    isCirclesFeature
} = {}) {
    const cid = currentFeature || state.currentFeature || "eugene";
    const zid = targetFeatureId !== undefined ? targetFeatureId : state.currentId;
    const isCirc = isCirclesFeature !== undefined ? isCirclesFeature : state.isCirclesFeature;
    return `${cid}:${zid || "full"}:${isCirc ? "circles" : "zone"}`;
}

/**
 * Reclaims memory by zeroing out canvas dimensions and clearing all references.
 */
export function disposeRasterCache() {
    cancelSelectionPreload();
    if (activeRasterCache.timerId) {
        clearTimeout(activeRasterCache.timerId);
        activeRasterCache.timerId = null;
    }
    if (activeRasterCache.canvas) {
        try {
            activeRasterCache.canvas.width = 0;
            activeRasterCache.canvas.height = 0;
        } catch (e) {}
    }
    activeRasterCache.key = null;
    activeRasterCache.promise = null;
    activeRasterCache.canvas = null;
    activeRasterCache.createdAt = 0;
}

/**
 * Pre-renders the map layout in the background as soon as subject is identified.
 * Disposes previous stale renders to prevent memory leaks.
 */
export function preloadMapLayout(options = {}) {
    cancelSelectionPreload();
    const key = getRasterCacheKey(options);
    const now = Date.now();

    // Check if we already have an active/pending render for this exact subject within TTL
    if (activeRasterCache.key === key && (now - activeRasterCache.createdAt < RASTER_CACHE_TTL_MS)) {
        if (activeRasterCache.promise) return activeRasterCache.promise;
        if (activeRasterCache.canvas) return Promise.resolve(activeRasterCache.canvas);
    }

    // Different subject or expired — dispose previous render first
    disposeRasterCache();

    activeRasterCache.key = key;
    activeRasterCache.createdAt = now;

    // Start rendering in background
    const renderPromise = renderMapLayoutCanvas(options)
        .then(canvas => {
            if (activeRasterCache.key === key) {
                activeRasterCache.canvas = canvas;
                activeRasterCache.promise = null;
                // Schedule TTL garbage collection
                activeRasterCache.timerId = setTimeout(disposeRasterCache, RASTER_CACHE_TTL_MS);
            } else {
                // User moved on to a different selection while rendering — immediately reclaim canvas buffer
                try {
                    canvas.width = 0;
                    canvas.height = 0;
                } catch (e) {}
            }
            return canvas;
        })
        .catch(err => {
            if (activeRasterCache.key === key) {
                disposeRasterCache();
            }
            throw err;
        });

    activeRasterCache.promise = renderPromise;
    return renderPromise;
}

/**
 * Retrieves the layout canvas — using pre-rendered canvas if available,
 * awaiting pending preload promise if running, or initiating a new render if missing.
 */
export async function getOrRenderLayoutCanvas(options = {}) {
    const key = getRasterCacheKey(options);
    const now = Date.now();

    if (activeRasterCache.key === key && (now - activeRasterCache.createdAt < RASTER_CACHE_TTL_MS)) {
        if (activeRasterCache.canvas) {
            return activeRasterCache.canvas;
        }
        if (activeRasterCache.promise) {
            return await activeRasterCache.promise;
        }
    }

    return await preloadMapLayout(options);
}

export async function downloadGeoPdf(filename, triggerButton = null) {
    try {
        if (triggerButton) {
            triggerButton.disabled = true;
            triggerButton.classList.add("is-preparing");
        }
        const options = {
            features: state.allFeatures,
            targetFeatureId: state.currentId,
            currentFeature: state.currentFeature,
            isCirclesFeature: state.isCirclesFeature
        };

        const isReady = activeRasterCache.key === getRasterCacheKey(options) && !!activeRasterCache.canvas;
        if (!isReady) {
            showToast("Rendering map layout...");
        }

        const canvas = await getOrRenderLayoutCanvas(options);
        
        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: "landscape",
                unit: "mm",
                format: "a4"
            });
            
            const imgData = canvas.toDataURL("image/jpeg", 0.92);
            pdf.addImage(imgData, "JPEG", 0, 0, 297, 210);
            
            pdf.setProperties({
                title: filename.replace(/\.pdf$/, ""),
                subject: "GeoPDF Map Layout Export - Esri Topo Basemap",
                keywords: "GeoPDF, GIS, Map, Esri Topo, Fovea",
                creator: "Fovea Web Map Layout Engine"
            });

            const pdfBlob = pdf.output("blob");
            triggerDirectDownload(pdfBlob, filename);
            showToast(`Exported ${filename}`);
        } else {
            canvas.toBlob((blob) => {
                triggerDirectDownload(blob, filename.replace(/\.pdf$/, "-layout.png"));
                showToast(`Exported ${filename.replace(/\.pdf$/, "-layout.png")}`);
            }, "image/png");
        }
    } catch (e) {
        console.error("PDF generation failed:", e);
        showToast("Error generating PDF layout.");
    } finally {
        if (triggerButton) {
            triggerButton.disabled = false;
            triggerButton.classList.remove("is-preparing");
        }
    }
}

export async function downloadGeoTiff(filename, triggerButton = null) {
    try {
        if (triggerButton) {
            triggerButton.disabled = true;
            triggerButton.classList.add("is-preparing");
        }
        const options = {
            features: state.allFeatures,
            targetFeatureId: state.currentId,
            currentFeature: state.currentFeature,
            isCirclesFeature: state.isCirclesFeature
        };

        const isReady = activeRasterCache.key === getRasterCacheKey(options) && !!activeRasterCache.canvas;
        if (!isReady) {
            showToast("Rendering map layout...");
        }

        const canvas = await getOrRenderLayoutCanvas(options);
        const tiffBlob = canvasToTiffBlob(canvas);
        triggerDirectDownload(tiffBlob, filename);
        showToast(`Exported ${filename}`);
    } catch (e) {
        console.error("TIFF generation failed:", e);
        showToast("Error generating TIFF layout.");
    } finally {
        if (triggerButton) {
            triggerButton.disabled = false;
            triggerButton.classList.remove("is-preparing");
        }
    }
}

function triggerDirectDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    a.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}


