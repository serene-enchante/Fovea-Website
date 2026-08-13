import { state } from '../state.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { getBbox } from '../utils/geometry-math.js';
import { displayZoneId } from '../utils/format-utils.js';
import { canvasToTiffBlob } from '../services/format-converters.js';
import { handleSpatialFileShare } from '../services/file-download-service.js';
import { switchBaseMap } from './map-init.js';
import { selectSubject } from './map-selection.js';
import { adjustHeaderFontSize } from '../components/header-view.js';
import { updateControlPositions, updateLabelZoomVisibility, getActiveDownloadFilename } from '../maps-tile.js';

// We need a toast fallback if it's not imported. It's usually global or we can define a stub.
const showToast = window.showToast || ((msg) => console.log(msg));

export getLayoutScaleBar(map, layoutMapWidth) {
    if (!map) return { miles: 1, pxWidth: 150 };
    const canvas = map.getCanvas();
    const cX = canvas.width / 2;
    const cY = canvas.height / 2;
    
    const samplePx = 200;
    const p1 = map.unproject([cX - (samplePx / 2), cY]);
    const p2 = map.unproject([cX + (samplePx / 2), cY]);
    
    let distMiles = 1;
    if (typeof turf !== "undefined" && turf.distance) {
        distMiles = turf.distance([p1.lng, p1.lat], [p2.lng, p2.lat], { units: "miles" });
    } else {
        const lat1 = p1.lat * Math.PI / 180;
        const lat2 = p2.lat * Math.PI / 180;
        const dLat = (p2.lat - p1.lat) * Math.PI / 180;
        const dLon = (p2.lng - p1.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distMiles = 3958.8 * c;
    }

    const milesPerLayoutPx = distMiles / (samplePx * (layoutMapWidth / canvas.width));
    const targetPx = 200;
    const approxMiles = targetPx * milesPerLayoutPx;
    
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

    const scaleBarPx = Math.max(100, Math.min(450, chosenMiles / milesPerLayoutPx));
    return { miles: chosenMiles, pxWidth: scaleBarPx };
}


export loadQrCodeImage(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&format=png&data=${encodeURIComponent(dataUrl)}`;
        setTimeout(() => resolve(null), 1500);
    });
}


export renderMapLayoutCanvas() {
    showToast("Rendering Esri Topo Print Layout...");
    
    // Remember current active basemap to restore later
    const previousBaseLayer = state.currentBaseLayer || "dark";
    
    // Get map wrapper and tile-map elements to temporarily resize to high resolution print canvas size
    const mapWrapper = document.getElementById("map-wrapper");
    const tileMap = document.getElementById("tile-map");
    let origStyle = "";
    let origTileStyle = "";
    if (mapWrapper && tileMap) {
        origStyle = mapWrapper.getAttribute("style") || "";
        origTileStyle = tileMap.getAttribute("style") || "";
        
        // Temporarily size mapWrapper to 2280x1500 (landscape printing canvas size) and push offscreen
        mapWrapper.style.setProperty("position", "fixed", "important");
        mapWrapper.style.setProperty("left", "-9999px", "important");
        mapWrapper.style.setProperty("top", "0px", "important");
        mapWrapper.style.setProperty("width", "2280px", "important");
        mapWrapper.style.setProperty("height", "1500px", "important");
        mapWrapper.style.setProperty("z-index", "-99999", "important");
        
        // Also force tile-map to override mobile's 100vh rule to match wrapper dimensions
        tileMap.style.setProperty("width", "2280px", "important");
        tileMap.style.setProperty("height", "1500px", "important");
        
        if (state.map) {
            state.map.resize();
        }
    }

    try {
        // Switch basemap to Esri Topo if not already active
        if (state.currentBaseLayer !== "esri-topo") {
            switchBaseMap("esri-topo");
        }

        // Fit map bounds to the current selected feature on the print viewport layout with generous margins (padding)
        if (state.map) {
            const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
            let targetFeature = null;
            if (!isCircle) {
                targetFeature = state.allFeatures.find(f => {
                    const zid = f.properties?.zid;
                    return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                });
            }
            
            // padding: 120 adds a clean margin of 120 pixels around the feature so it doesn't touch the map frame borders
            if (isCircle || !targetFeature) {
                state.map.fitBounds(getBbox(state.allFeatures), { padding: 120, animate: false });
            } else {
                state.map.fitBounds(getBbox([targetFeature]), { padding: 120, maxZoom: 14, animate: false });
            }
        }

        // Wait for MapLibre to load and render Esri Topo tiles
        await new Promise((resolve) => {
            let checkCount = 0;
            const checkIdle = () => {
                checkCount++;
                if ((state.map && state.map.areTilesLoaded()) || checkCount > 35) {
                    if (state.map) state.map.off('idle', checkIdle);
                    resolve();
                }
            };
            if (state.map) {
                state.map.on('idle', checkIdle);
                state.map.triggerRepaint();
            }
            setTimeout(resolve, 1500); // Failsafe timeout for network tiles
        });

        const mapCanvas = state.map ? state.map.getCanvas() : null;

        // High resolution layout canvas (2400 x 1800 px - 4:3 ratio, print-optimized quality)
        const layoutCanvas = document.createElement("canvas");
        const width = 2400;
        const height = 1800;
        layoutCanvas.width = width;
        layoutCanvas.height = height;
        const ctx = layoutCanvas.getContext("2d");

        // 1. Pure White outer canvas background (Paper Print-Friendly)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        // 2. Define inner map frame layout box
        const mapMargin = 60;
        const headerHeight = 110;
        const footerHeight = 70;

        const mapX = mapMargin;
        const mapY = mapMargin + headerHeight;
        const mapW = width - (mapMargin * 2);
        const mapH = height - mapY - footerHeight - mapMargin;

        // Background for map box (clean off-white for topo rendering)
        ctx.fillStyle = "#f9fafb";
        ctx.fillRect(mapX, mapY, mapW, mapH);

        // Draw MapLibre WebGL canvas image into map box (no stretching needed as viewport is exactly 2280x1500)
        if (mapCanvas) {
            try {
                ctx.drawImage(mapCanvas, mapX, mapY, mapW, mapH);
            } catch (err) {
                console.warn("Could not draw map canvas directly:", err);
            }
        }

        // Inner map frame border - Crisp minimal dark border
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 3;
        ctx.strokeRect(mapX, mapY, mapW, mapH);

        // 3. Header Text (No border box around header text!)
        const hasSpecificZone = state.currentId && state.currentId !== CIRCLE_ID;

        // Header Title Text (Crisp Dark Typography for Paper Printing)
        ctx.fillStyle = "#111827";
        ctx.font = "bold 46px system-ui, -apple-system, sans-serif";
        const headerTitleText = state.isCirclesFeature 
            ? "COAST TO CASCADES BIRD ALLIANCE" 
            : (state.currentFeature === "florence" ? "FLORENCE CHRISTMAS BIRD COUNT" : "EUGENE CHRISTMAS BIRD COUNT");
        ctx.fillText(headerTitleText, mapMargin, mapMargin + 45);

        // Subtitle / Selection Name (ONLY if specific zone, remove "COUNT CIRCLE MAP")
        if (hasSpecificZone) {
            ctx.fillStyle = "#059669";
            ctx.font = "bold 30px system-ui, -apple-system, sans-serif";
            const subTitleText = `SURVEY ZONE ${displayZoneId(state.currentId)}`;
            ctx.fillText(subTitleText, mapMargin, mapMargin + 90);
        }

        // Date & Basemap Metadata (Right-aligned, no box)
        ctx.fillStyle = "#374151";
        ctx.font = "26px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "right";
        const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        ctx.fillText(dateStr, mapMargin + mapW, mapMargin + 45);
        ctx.font = "20px system-ui, -apple-system, sans-serif";
        ctx.fillStyle = "#6b7280";
        ctx.fillText("Base Map: Esri World Topography", mapMargin + mapW, mapMargin + 85);
        ctx.textAlign = "left";

        // 4. Minimal Cartographic Map Overlays
        // North Arrow Emblem (Minimalist Print Style)
        const naX = mapX + mapW - 75;
        const naY = mapY + 85;
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath();
        ctx.arc(naX, naY, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // North Pointer Needle
        ctx.fillStyle = "#111827";
        ctx.beginPath();
        ctx.moveTo(naX, naY - 28);
        ctx.lineTo(naX + 12, naY + 8);
        ctx.lineTo(naX, naY + 2);
        ctx.fill();

        ctx.fillStyle = "#9ca3af";
        ctx.beginPath();
        ctx.moveTo(naX, naY - 28);
        ctx.lineTo(naX - 12, naY + 8);
        ctx.lineTo(naX, naY + 2);
        ctx.fill();

        ctx.fillStyle = "#111827";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("N", naX, naY - 32);
        ctx.restore();

        // Actual Calculated Scale Bar in Miles (Bottom Left of Map Area)
        const scaleInfo = getLayoutScaleBar(state.map, mapW);

        const barX = mapX + 30;
        const barY = mapY + mapH - 100;
        const barW = Math.max(260, scaleInfo.pxWidth + 60);
        const barH = 70;

        // Scale Box
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.fillRect(barX, barY, barW, barH);
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barW, barH);

        // Scale Bar Line & Ticks
        const lineStartX = barX + 30;
        const lineEndX = lineStartX + scaleInfo.pxWidth;
        const lineY = barY + 45;

        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lineStartX, lineY);
        ctx.lineTo(lineEndX, lineY);
        ctx.moveTo(lineStartX, lineY - 8);
        ctx.lineTo(lineStartX, lineY + 8);
        ctx.moveTo(lineEndX, lineY - 8);
        ctx.lineTo(lineEndX, lineY + 8);
        const midX = (lineStartX + lineEndX) / 2;
        ctx.moveTo(midX, lineY - 5);
        ctx.lineTo(midX, lineY + 5);
        ctx.stroke();

        // Scale Bar Numerical Labels
        ctx.fillStyle = "#111827";
        ctx.font = "bold 16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("0", lineStartX, lineY - 12);
        ctx.fillText(`${scaleInfo.miles} mi`, lineEndX, lineY - 12);
        ctx.textAlign = "left";

        // QR Code Box Overlay (Bottom Right of Map Area)
        const qrX = mapX + mapW - 175;
        const qrY = mapY + mapH - 190;
        const qrBoxW = 150;
        const qrBoxH = 165;

        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.fillRect(qrX, qrY, qrBoxW, qrBoxH);
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 2;
        ctx.strokeRect(qrX, qrY, qrBoxW, qrBoxH);

        let qrDrawn = false;
        if (typeof QRCode !== "undefined") {
            try {
                const qrContainer = document.createElement("div");
                new QRCode(qrContainer, {
                    text: window.location.href,
                    width: 120,
                    height: 120,
                    correctLevel: QRCode.CorrectLevel.M
                });
                const qrCanvas = qrContainer.querySelector("canvas");
                const qrImg = qrContainer.querySelector("img");
                if (qrCanvas) {
                    ctx.drawImage(qrCanvas, qrX + 15, qrY + 12, 120, 120);
                    qrDrawn = true;
                } else if (qrImg && qrImg.complete) {
                    ctx.drawImage(qrImg, qrX + 15, qrY + 12, 120, 120);
                    qrDrawn = true;
                }
            } catch (e) {
                console.warn("QRCode generation error:", e);
            }
        }

        if (!qrDrawn) {
            const qrImage = await loadQrCodeImage(window.location.href);
            if (qrImage) {
                ctx.drawImage(qrImage, qrX + 15, qrY + 12, 120, 120);
            }
        }

        ctx.fillStyle = "#111827";
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("SCAN FOR ONLINE MAP", qrX + (qrBoxW / 2), qrY + 152);
        ctx.textAlign = "left";

        // 5. Clean Footer Text (No border box around footer text!)
        const footY = height - footerHeight - mapMargin + 18;

        ctx.fillStyle = "#374151";
        ctx.font = "19px system-ui, sans-serif";
        const bbox = getBbox(state.allFeatures);
        const boundsText = `Spatial Extent (WGS84): [${bbox[0][0].toFixed(4)}°W, ${bbox[0][1].toFixed(4)}°N] to [${bbox[1][0].toFixed(4)}°W, ${bbox[1][1].toFixed(4)}°N]`;
        ctx.fillText(boundsText, mapMargin, footY + 24);

        ctx.fillStyle = "#6b7280";
        ctx.font = "16px system-ui, sans-serif";
        ctx.fillText("Printed with Fovea | Esri World Topographic Basemap © Esri, DeLorme, NAVTEQ", mapMargin, footY + 52);

        return layoutCanvas;
    } finally {
        // Restore previous basemap if changed
        if (previousBaseLayer !== "esri-topo") {
            switchBaseMap(previousBaseLayer);
        }
        
        // Restore map wrapper and tile-map size/display
        if (mapWrapper && tileMap) {
            if (origStyle) {
                mapWrapper.setAttribute("style", origStyle);
            } else {
                mapWrapper.removeAttribute("style");
            }
            if (origTileStyle) {
                tileMap.setAttribute("style", origTileStyle);
            } else {
                tileMap.removeAttribute("style");
            }
            if (state.map) {
                state.map.resize();
            }
        }
        
        // Restore original viewport zoom and bounds for screen
        selectSubject(state.currentId, true, false);
    }
}



export downloadGeoPdf(triggerButton = null) {
    const canvas = await renderMapLayoutCanvas();
    const filename = getActiveDownloadFilename("pdf");
    
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
        await handleSpatialFileShare(null, pdfBlob, filename, triggerButton);
        showToast(`Exported ${filename}`);
    } else {
        canvas.toBlob(async (blob) => {
            await handleSpatialFileShare(null, blob, filename.replace(/\.pdf$/, "-layout.png"), triggerButton);
            showToast(`Exported ${filename.replace(/\.pdf$/, "-layout.png")}`);
        }, "image/png");
    }
}


export downloadGeoTiff(triggerButton = null) {
    const canvas = await renderMapLayoutCanvas();
    const filename = getActiveDownloadFilename("tif");
    const tiffBlob = canvasToTiffBlob(canvas);
    await handleSpatialFileShare(null, tiffBlob, filename, triggerButton);
    showToast(`Exported ${filename}`);
}


export setupMapEffectsAndFullscreen(mapWrapper) {
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

