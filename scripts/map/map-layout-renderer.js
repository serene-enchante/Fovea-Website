import { state } from '../state.js';
import { loadQrCodeLibrary } from './map-vendor-loader.js';
import { displayZoneId, normalizeZoneId } from '../utils/format-utils.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { getLayoutScaleBar } from '../utils/map-print-math.js';
import { getBbox } from '../utils/geometry-math.js';
import { loadQrCodeImage } from '../services/qr-image-service.js';
import { getFeatureCenter } from '../utils/map-print-geometry.js';
import { MAP_PROVIDER_URLS } from '../config/map-provider-config.js';

// ──────────────────────────────────────────────────────────────
// Headless offscreen MapLibre renderer for PDF / TIFF export
// ──────────────────────────────────────────────────────────────

const ESRI_TOPO_TILE_URL = MAP_PROVIDER_URLS.esri.topoTiles;

// Offscreen map viewport dimensions (used by the hidden MapLibre canvas) — 3800px width with safe WebGL headroom
const OFFSCREEN_MAP_WIDTH = 3800;
const OFFSCREEN_MAP_HEIGHT = 2500;

// Final layout canvas dimensions (4:3 ratio, 4000×3000 high-res print layout)
const LAYOUT_WIDTH = 4000;
const LAYOUT_HEIGHT = 3000;
const WEB_MERCATOR_RADIUS = 6378137;

function toWebMercator({ lng, lat }) {
    const clampedLat = Math.max(-85.0511287798066, Math.min(85.0511287798066, lat));
    return {
        x: WEB_MERCATOR_RADIUS * lng * Math.PI / 180,
        y: WEB_MERCATOR_RADIUS * Math.log(Math.tan(Math.PI / 4 + clampedLat * Math.PI / 360))
    };
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
export async function renderHeadlessMap(bounds, geojsonOverlay = null, maxZoom = 18) {
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
        const mapNorthwest = toWebMercator(offscreenMap.unproject([0, 0]));
        const mapSoutheast = toWebMercator(offscreenMap.unproject([
            OFFSCREEN_MAP_WIDTH,
            OFFSCREEN_MAP_HEIGHT
        ]));
        const geoReference = {
            minX: mapNorthwest.x,
            maxX: mapSoutheast.x,
            minY: mapSoutheast.y,
            maxY: mapNorthwest.y,
            projectedCrs: 3857
        };

        // 10. Copy the canvas pixels to a new standalone canvas before destroying the map
        const resultCanvas = document.createElement("canvas");
        resultCanvas.width = mapCanvas.width;
        resultCanvas.height = mapCanvas.height;
        const resultCtx = resultCanvas.getContext("2d");
        resultCtx.drawImage(mapCanvas, 0, 0);

        // 11. Destroy the headless map instance
        offscreenMap.remove();

        return { canvas: resultCanvas, zoneLabels: zoneLabels, geoReference };
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
    const qrCodeLibraryPromise = loadQrCodeLibrary().catch(() => null);

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
            return zid && (zid.toLowerCase() === featureId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(featureId));
        });
    }

    const targetBounds = (isCircle || !targetFeature)
        ? getBbox(allFeatures)
        : getBbox([targetFeature]);

    // Build GeoJSON overlay for zone polygons
    const overlayGeojson = {
        type: "FeatureCollection",
        features: allFeatures.filter(f => f.geometry)
    };

    // Maximum zoom: use 18 for specific zones, 20 for full circle
    const maxZoom = (isCircle || !targetFeature) ? 20 : 18;

    // Render the headless map at 3800×2500
    const { canvas: mapCanvas, zoneLabels, geoReference: mapGeoReference } = await renderHeadlessMap(
        targetBounds,
        overlayGeojson,
        maxZoom
    );

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
    layoutCanvas.geoReference = mapGeoReference && {
        modelPixelScale: [
            (mapGeoReference.maxX - mapGeoReference.minX) / mapW,
            (mapGeoReference.maxY - mapGeoReference.minY) / mapH,
            0
        ],
        modelTiepoint: [mapX, mapY, 0, mapGeoReference.minX, mapGeoReference.maxY, 0],
        projectedCrs: mapGeoReference.projectedCrs
    };

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
    const QRCodeLibrary = await qrCodeLibraryPromise;
    if (QRCodeLibrary) {
        try {
            const qrContainer = document.createElement("div");
            new QRCodeLibrary(qrContainer, {
                text: qrUrl,
                width: 200,
                height: 200,
                correctLevel: QRCodeLibrary.CorrectLevel.M
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
    const bbox = getBbox(allFeatures);
    const boundsText = `Spatial Extent (WGS84): [${bbox[0][0].toFixed(4)}°W, ${bbox[0][1].toFixed(4)}°N] to [${bbox[1][0].toFixed(4)}°W, ${bbox[1][1].toFixed(4)}°N]`;
    ctx.fillText(boundsText, mapMargin, footY + 40);

    ctx.fillStyle = "#6b7280";
    ctx.font = "26px system-ui, sans-serif";
    ctx.fillText("Printed with Fovea | Esri World Topographic Basemap © Esri, DeLorme, NAVTEQ", mapMargin, footY + 86);

    return layoutCanvas;
}
