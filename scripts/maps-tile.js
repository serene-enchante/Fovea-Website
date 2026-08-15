// MapLibre prototype polyfill for Leaflet legacy compatibility
if (typeof maplibregl !== 'undefined' && maplibregl.Map) {
    maplibregl.Map.prototype.invalidateSize = function() {
        this.resize();
    };
}

// --- Utils ---
import { getThemeAccent, getThemeAccentLight } from './utils/color-utils.js';
import { FALLBACK_IMAGE, normalizeZoneId, displayZoneId, zoneImagePath } from './utils/format-utils.js';
import { getBbox, findPointInsidePolygon } from './utils/geometry-math.js';

// --- Config ---
import { EUGENE_GEOJSON_PATH, FLORENCE_GEOJSON_PATH, CIRCLES_GEOJSON_PATH, CIRCLE_ID } from './config/app-config.js';

// --- Services ---
import { geojsonToKml, geojsonToGpx, canvasToTiffBlob } from './services/format-converters.js';
import { handleSpatialFileShare } from './services/file-download-service.js';

// --- Map Layers ---
import { updateAllFeatureStyles, rebuildHtmlLabels, setupMapLayers, selectMapStyleByIndex } from './map/map-layers.js';

// --- Components ---
import { showToast } from './components/toast-view.js';
import { adjustHeaderFontSize, updateHeader, getFitPadding } from './components/header-view.js';
import { launchAppWithStoreFallback, handleAppDirectOpen } from './components/avenza-modal-view.js';
import { setupMobileBottomNav } from './components/bottom-nav-view.js';
import { closeAllModals } from './components/modal-view.js';





import { switchToFeature, switchToCirclesFeature, selectSubject } from './map/map-selection.js';
import { state } from "./state.js";
import { getLayoutScaleBar, renderMapLayoutCanvas, setupMapEffectsAndFullscreen, downloadGeoPdf, downloadGeoTiff } from './map/map-rendering.js';
import { switchBaseMap, checkUserLocationZone, toggleLocationTracking, preloadGlobalLowResTiles } from "./map/map-init.js";
import { setupSearch, setupAllAppsLiveSearch } from './map/map-search.js';
import { setupImageLightbox, setupHelpModeSystem } from './components/map-modals.js';
import { setupMapHoverEvents } from './map/map-events.js';
import { loadBirdData, getSelectedGeoJSONData } from './services/bird-data-service.js';



// --- Client-Side Exporter Helpers (GeoJSON, KMZ, GPX) ---
export function getActiveDownloadFilename(ext) {
    let base = "map-data";
    if (state.currentFeature === "circles") {
        base = "circles-wgs84";
    } else if (state.currentFeature === "florence") {
        base = (state.currentId && state.currentId !== CIRCLE_ID) 
            ? `Florence-Zone-${displayZoneId(state.currentId)}` 
            : "Florence-00-wgs84";
    } else {
        base = (state.currentId && state.currentId !== CIRCLE_ID) 
            ? `Eugene-Zone-${displayZoneId(state.currentId)}` 
            : "Eugene-01-wgs84";
    }
    return `${base}.${ext}`;
}





/**
 * Suggested App Handshake Architecture & Format Preferences
 * Maps mobile navigation and mapping applications to their optimal spatial file formats and MIME types.
 */


/**
 * Generates/retrieves the active spatial dataset as a Blob for a given format key.
 */
export async function generateAppSpatialBlob(formatKey) {
  const geojson = getSelectedGeoJSONData();
  const filename = getActiveDownloadFilename(formatKey === "geopdf" ? "pdf" : formatKey);

  if (formatKey === "geopdf") {
    const canvas = await renderMapLayoutCanvas();
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
        creator: "Fovea Web Map Layout Engine"
      });
      return { blob: pdf.output("blob"), filename };
    } else {
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve({ blob, filename: filename.replace(/\.pdf$/, "-layout.png") });
        }, "image/png");
      });
    }
  } else if (formatKey === "gpx") {
    const gpxStr = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ""));
    const blob = new Blob([gpxStr], { type: "application/gpx+xml" });
    return { blob, filename: filename.endsWith(".gpx") ? filename : `${filename}.gpx` };
  } else if (formatKey === "kmz") {
    const kmlStr = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ""));
    if (typeof JSZip !== "undefined") {
      const zip = new JSZip();
      zip.file("doc.kml", kmlStr);
      const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });
      return { blob, filename };
    } else {
      const blob = new Blob([kmlStr], { type: "application/vnd.google-earth.kml+xml" });
      return { blob, filename: filename.replace(/\.kmz$/i, ".kml") };
    }
  } else {
    // Default GeoJSON
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    return { blob, filename };
  }
}

/**
 * APP INSTRUCTION CONFIGURATIONS
 * Dynamic instruction modal settings for suggested mapping apps (Avenza, Gaia GPS, CalTopo, OsmAnd).
 */













export function updateUrl(id) {
    const url = new URL(window.location.href);
    url.searchParams.delete("id");

    if (state.isCirclesFeature) {
        url.searchParams.set("feature", "circles");
        url.searchParams.delete("zone");
    } else {
        url.searchParams.set("feature", state.currentFeature);
        if (id && id !== CIRCLE_ID) {
            let zid = id;
            const targetFeature = state.allFeatures.find(f => {
                const fzid = f.properties?.zid;
                return fzid && (fzid.toLowerCase() === id.toLowerCase() || normalizeZoneId(fzid) === normalizeZoneId(id));
            });
            if (targetFeature && targetFeature.properties?.zid) {
                zid = displayZoneId(targetFeature.properties.zid);
            }
            url.searchParams.set("zone", zid);
        } else {
            url.searchParams.delete("zone");
        }
    }
    window.history.replaceState({}, "", url.toString());
}

export function updateControlPositions() {
    if (!state.map) return;
    const isMobile = window.innerWidth <= 768;
    const topLeft = document.querySelector(".map-ctrl-container .map-ctrl-panel.map-ctrl-panel--left");
    const topRight = document.querySelector(".map-ctrl-container .map-ctrl-panel.map-ctrl-panel--right");
    const zoomCtrl = document.querySelector(".map-ctrl-zoom");
    const locateCtrl = document.querySelector(".map-ctrl-locate");
    const fsCtrl = document.querySelector(".map-ctrl-fullscreen");
    const layersCtrl = document.querySelector(".map-ctrl-styles");

    if (isMobile) {
        // Zoom → top-right panel
        if (topRight && zoomCtrl) topRight.appendChild(zoomCtrl);
        // Mobile bottom-right row, left-to-right: map styles → location → fullscreen
        if (topLeft) {
            if (layersCtrl) topLeft.appendChild(layersCtrl);
            if (locateCtrl) topLeft.appendChild(locateCtrl);
            if (fsCtrl) topLeft.appendChild(fsCtrl);
        }
    } else {
        // All → bottom-left, stacked vertically. flex-direction:column-reverse means
        // first appended = visually at bottom. Order from bottom to top:
        // zoom (bottom) → fullscreen → locate → map styles (top)
        if (topLeft) {
            if (zoomCtrl) topLeft.appendChild(zoomCtrl);
            if (fsCtrl) topLeft.appendChild(fsCtrl);
            if (locateCtrl) topLeft.appendChild(locateCtrl);
            if (layersCtrl) topLeft.appendChild(layersCtrl);
        }
    }
}






window.renderSidebarList = renderSidebarList;
export function renderSidebarList() {
    const itemsCapsule = document.querySelector('.sidebar-capsule[data-tab="items"]');
    if (itemsCapsule) {
        itemsCapsule.textContent = state.isCirclesFeature ? "Circles" : "Circle Zones";
    }

    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    if (state.isCirclesFeature) {
        if (state.activeTab === "about") {
            const aboutEl = document.createElement("div");
            aboutEl.className = "sidebar-about-wrapper";
            aboutEl.innerHTML = `
                <div class="sidebar-about-content">
                    <div class="sidebar-about-media">
                        <img src="../images/wetlands.jpg" alt="Audubon Circles" loading="eager" />
                    </div>
                    <p class="sidebar-about-text">Audubon Christmas Bird Count regional count circles. Click a circle to explore its subdivided survey zones.</p>
                </div>
            `;
            listContainer.appendChild(aboutEl);
            return;
        }

        const NO_DATA_CIRCLES = new Set(["Oakridge", "Cottage Grove"]);
        const sortedCircles = [...state.circlesFeatures].sort((a, b) => {
            const cidA = String(a.properties?.cid || "");
            const cidB = String(b.properties?.cid || "");
            const noDataA = NO_DATA_CIRCLES.has(cidA) ? 1 : 0;
            const noDataB = NO_DATA_CIRCLES.has(cidB) ? 1 : 0;
            if (noDataA !== noDataB) return noDataA - noDataB;
            return cidA.localeCompare(cidB, undefined, { sensitivity: "base" });
        });

        sortedCircles.forEach(feature => {
            const props = feature.properties || {};
            const cid = props.cid || "Circle";
            const item = document.createElement("div");
            item.className = "tile-zone-item";
            item.setAttribute("data-id", cid);

            let thumbImg = "";
            let isLogo = false;
            let isNotAvailable = false;
            if (cid === "Eugene") {
                thumbImg = "../images/logo-small.png";
                isLogo = true;
            } else if (cid === "Florence") {
                thumbImg = "../images/florence.png";
                isLogo = true;
            } else if (cid === "Oakridge" || cid === "Cottage Grove") {
                isNotAvailable = true;
            } else {
                thumbImg = "../images/wetlands.jpg";
            }

            let thumbHtml = "";
            if (isNotAvailable) {
                thumbHtml = `
                    <div class="tile-zone-item__thumb-placeholder" title="No data available">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                        </svg>
                    </div>
                `;
            } else {
                thumbHtml = `
                    <div class="tile-zone-item__thumb ${isLogo ? "tile-zone-item__thumb--logo" : ""}">
                        <img src="${thumbImg}" alt="${cid}" loading="eager">
                    </div>
                `;
            }

            item.innerHTML = `
                ${thumbHtml}
                <div class="tile-zone-item__info">
                    <div class="tile-zone-item__title">${cid}</div>
                </div>
            `;

            item.addEventListener("mouseenter", () => {
                if (state.map && state.map.getSource('zones')) {
                    state.map.setFeatureState({ source: 'zones', id: cid }, { hover: true });
                }
            });
            item.addEventListener("mouseleave", () => {
                if (state.map && state.map.getSource('zones')) {
                    state.map.setFeatureState({ source: 'zones', id: cid }, { hover: false });
                }
            });

            item.addEventListener("click", () => {
                const feature = state.circlesFeatures.find(f => f.properties.cid === cid);
                const bbox = feature ? getBbox(feature) : null;
                if (cid === "Eugene") {
                    switchToFeature("eugene");
                } else if (cid === "Florence") {
                    switchToFeature("florence");
                } else if (cid === "Oakridge" || cid === "Cottage Grove") {
                    showToast("There is no data for this count circle");
                }
            });
            listContainer.appendChild(item);
        });
        return;
    }

    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
    let targetFeature = null;
    if (!isCircle) {
        targetFeature = state.allFeatures.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
        });
    }

    if (state.activeTab === "about") {
        const aboutEl = document.createElement("div");
        aboutEl.className = "sidebar-about-wrapper";

        let descText = "";
        let imgSrc = "";
        let imgAlt = "";

        if (isCircle || !targetFeature) {
            const circleTitle = state.currentFeature === "florence" ? "Florence Christmas Bird Count" : "Eugene Christmas Bird Count";
            descText = `The ${circleTitle} circle is a 15-mile diameter count circle in Oregon. Explore the survey zones to view spatial boundaries, detailed historical summaries, and field maps.`;
            imgSrc = "../images/wetlands.jpg";
            imgAlt = `${circleTitle} Overview`;
        } else {
            const props = targetFeature.properties || {};
            const zid = displayZoneId(props.zid);
            descText = props.description || "Zone description not available.";
            imgSrc = zoneImagePath(props.zid);
            imgAlt = `Zone ${zid} Image`;
        }

        aboutEl.innerHTML = `
            <div class="sidebar-about-content">
                ${imgSrc ? `
                    <div class="sidebar-about-media">
                        <img src="${imgSrc}" alt="${imgAlt}" loading="lazy" />
                    </div>
                ` : ""}
                <p class="sidebar-about-text">${descText}</p>
            </div>
        `;

        const img = aboutEl.querySelector("img");
        const mediaDiv = aboutEl.querySelector(".sidebar-about-media");
        if (img) {
            img.addEventListener("error", () => {
                if (imgSrc !== FALLBACK_IMAGE && !isCircle) {
                    img.src = FALLBACK_IMAGE;
                } else {
                    if (mediaDiv) mediaDiv.style.display = "none";
                }
            });
        }

        if (mediaDiv && img) {
            mediaDiv.addEventListener("click", () => {
                openImageLightbox(img.src, imgAlt, descText);
            });
        }

        listContainer.appendChild(aboutEl);
        return;
    }

    if (!isCircle && targetFeature) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "sidebar-empty-state";
        emptyEl.innerHTML = `
            <svg class="sidebar-empty-state__icon" width="34" height="34" viewBox="0 0 512 512" fill="currentColor">
                <path d="M128 32h32c17.7 0 32 14.3 32 32V96H96V64c0-17.7 14.3-32 32-32zm64 96V448c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V388.9c0-34.6 9.4-68.6 27.2-98.3C40.9 267.8 49.7 242.4 53 216L60.5 156c2-16 15.6-28 31.8-28H192zm227.8 0c16.1 0 29.8 12 31.8 28L459 216c3.3 26.4 12.1 51.8 25.8 74.6c17.8 29.7 27.2 63.7 27.2 98.3V448c0 17.7-14.3 32-32 32H352c-17.7 0-32-14.3-32-32V128h99.8zM320 64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32V96H320V64zm-32 64V288H224V128h64z"/>
            </svg>
            <div class="sidebar-empty-state__text">no items found</div>
        `;
        listContainer.appendChild(emptyEl);
        return;
    }

    const sortedFeatures = [...state.allFeatures].sort((a, b) => {
        const zidA = String(a.properties?.zid || "");
        const zidB = String(b.properties?.zid || "");
        return zidA.localeCompare(zidB, undefined, { numeric: true, sensitivity: "base" });
    });

    sortedFeatures.forEach(feature => {
        const props = feature.properties || {};
        const zid = displayZoneId(props.zid);
        const item = document.createElement("div");
        item.className = "tile-zone-item";
        item.setAttribute("data-id", String(props.zid));

        const imgPath = zoneImagePath(props.zid);
        item.innerHTML = `
            <div class="tile-zone-item__thumb">
                <img src="${imgPath}" alt="Zone ${zid}" loading="eager">
            </div>
            <div class="tile-zone-item__info">
                <div class="tile-zone-item__title">Zone ${zid}</div>
            </div>
        `;

        const img = item.querySelector("img");
        if (img) {
            img.addEventListener("error", () => {
                img.src = FALLBACK_IMAGE;
            });
        }

        item.addEventListener("mouseenter", () => {
            const featureId = String(props.zid || "");
            const isSelected = state.currentId !== CIRCLE_ID && (featureId === state.currentId || normalizeZoneId(featureId) === normalizeZoneId(state.currentId));
            if (!isSelected && state.map && state.map.getSource('zones')) {
                state.map.setFeatureState({ source: 'zones', id: featureId }, { hover: true });
            }
        });
        item.addEventListener("mouseleave", () => {
            const featureId = String(props.zid || "");
            const isSelected = state.currentId !== CIRCLE_ID && (featureId === state.currentId || normalizeZoneId(featureId) === normalizeZoneId(state.currentId));
            if (!isSelected && state.map && state.map.getSource('zones')) {
                state.map.setFeatureState({ source: 'zones', id: featureId }, { hover: false });
            }
        });

        item.addEventListener("click", () => selectSubject(String(props.zid)));
        listContainer.appendChild(item);
    });

    if (state.lastNavSource === "keyboard") {
        state.focusedTileIndex = 0;
        updateKeyboardTileFocus(0);
    } else {
        state.focusedTileIndex = -1;
        updateKeyboardTileFocus(-1);
    }
}

function updateKeyboardTileFocus(newIndex) {
    const tiles = document.querySelectorAll("#sidebar-zone-list .tile-zone-item");
    if (!tiles || tiles.length === 0) return;
    if (newIndex < -1) newIndex = -1;
    if (newIndex >= tiles.length) newIndex = tiles.length - 1;
    state.focusedTileIndex = newIndex;
    tiles.forEach((tile, idx) => {
        const cid = tile.getAttribute("data-id");
        const isSelected = state.currentId !== CIRCLE_ID && (cid === state.currentId || (typeof normalizeZoneId === "function" && normalizeZoneId(cid) === normalizeZoneId(state.currentId)));

        if (newIndex >= 0 && idx === newIndex) {
            tile.classList.add("is-hovered");
            if (!isSelected && state.map && state.map.getSource('zones')) {
                state.map.setFeatureState({ source: 'zones', id: cid }, { hover: true });
            }
        } else {
            tile.classList.remove("is-hovered");
            if (!isSelected && state.map && state.map.getSource('zones')) {
                state.map.setFeatureState({ source: 'zones', id: cid }, { hover: false });
            }
        }
    });
}


function toggleFullscreen() {
    const mapWrapper = document.getElementById("map-wrapper");
    if (!mapWrapper) return;

    const handleResize = () => {
        if (state.map) {
            state.map.invalidateSize();
            setTimeout(() => state.map.invalidateSize(), 50);
            setTimeout(() => state.map.invalidateSize(), 200);
            setTimeout(() => state.map.invalidateSize(), 400);
        }
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

    if (!document.fullscreenElement && !mapWrapper.classList.contains("is-fullscreen")) {
        if (mapWrapper.requestFullscreen) {
            mapWrapper.requestFullscreen().catch(() => {
                mapWrapper.classList.add("is-fullscreen");
                handleResize();
            });
        } else {
            mapWrapper.classList.add("is-fullscreen");
            handleResize();
        }
    } else {
        if (document.exitFullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {
                mapWrapper.classList.remove("is-fullscreen");
                triggerMobileHomeAnimation();
                handleResize();
            });
        } else {
            mapWrapper.classList.remove("is-fullscreen");
            triggerMobileHomeAnimation();
        }
    }
}

export function highlightTileItem(key) {
    if (key == null) return;
    key = String(key);
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    const items = listContainer.querySelectorAll(".tile-zone-item");
    items.forEach(item => {
        const dataId = item.getAttribute("data-id") || "";
        const matches = dataId.toLowerCase() === key.toLowerCase() || (normalizeZoneId(dataId) === normalizeZoneId(key) && key !== CIRCLE_ID);
        if (matches) {
            item.classList.add("is-hovered");
        } else {
            item.classList.remove("is-hovered");
        }
    });
}

export function unhighlightTileItem() {
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    const items = listContainer.querySelectorAll(".tile-zone-item");
    items.forEach(item => {
        item.classList.remove("is-hovered");
    });
}

// Cursor proximity glow: set feature-state 'proximity' (0–1) based on
// screen-space distance from cursor to each zone center point
function setupProximityTracking() {
    if (state._proximityListenerAttached) return;
    state._proximityListenerAttached = true;

    const RADIUS = 280;   // px — radial gradient falloff distance
    let rafPending = false;
    let lastCx = -9999, lastCy = -9999;

    const canvas = state.map.getCanvas();

    canvas.addEventListener('mousemove', (e) => {
        if (window.innerWidth <= 768) return;
        if (state.map && state.map.getZoom() >= 14.0) return;
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        // Skip tiny micro-movements to avoid thrashing feature state
        if (Math.abs(cx - lastCx) < 3 && Math.abs(cy - lastCy) < 3) return;
        lastCx = cx; lastCy = cy;

        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            if (!state.labelData || !state.map) return;
            state.labelData.forEach(d => {
                const pt = state.map.project([d.lng, d.lat]);
                const dist = Math.hypot(cx - pt.x, cy - pt.y);
                // Smooth quadratic falloff for more natural gradient feel
                const linear = Math.max(0, 1 - dist / RADIUS);
                const proximity = linear * linear * (3 - 2 * linear); // smoothstep
                state.map.setFeatureState({ source: 'zones', id: d.id }, { proximity });
            });
        });
    });

    canvas.addEventListener('mouseleave', () => {
        lastCx = -9999; lastCy = -9999;
        if (!state.labelData || !state.map) return;
        state.labelData.forEach(d => {
            state.map.setFeatureState({ source: 'zones', id: d.id }, { proximity: 0 });
        });
    });
}

// Canvas overlay: draws zone outlines bright, masked by radial gradient at cursor.
// This gives true per-segment glow — only the line pixels within the gradient radius
// are revealed, rather than MapLibre's per-feature opacity which affects whole zones.
function setupProximityGlowCanvas() {
    if (state._glowCanvasAttached) return;
    state._glowCanvasAttached = true;

    const mapCanvas = state.map.getCanvas();
    const container = document.getElementById('tile-map');

    const glowCanvas = document.createElement('canvas');
    glowCanvas.id = 'map-glow-canvas';
    glowCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;';
    container.appendChild(glowCanvas);

    const ctx = glowCanvas.getContext('2d');
    const RADIUS = 240; // CSS px — radial gradient falloff
    let cx = -9999, cy = -9999;
    let rafPending = false;
    let ditherPattern = null;

    function getDitherPattern() {
        if (ditherPattern) return ditherPattern;
        const nCanvas = document.createElement('canvas');
        nCanvas.width = 128;
        nCanvas.height = 128;
        const nCtx = nCanvas.getContext('2d');
        const imgData = nCtx.createImageData(128, 128);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = Math.floor((Math.random() - 0.5) * 45);
            const val = Math.min(255, Math.max(0, 128 + noise));
            data[i] = val;     // R
            data[i+1] = val;   // G
            data[i+2] = val;   // B
            data[i+3] = 18;    // ~7% dither alpha
        }
        nCtx.putImageData(imgData, 0, 0);
        ditherPattern = ctx.createPattern(nCanvas, 'repeat');
        return ditherPattern;
    }

    function syncSize() {
        const rect = mapCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        const physicalW = Math.round(w * dpr);
        const physicalH = Math.round(h * dpr);
        if (glowCanvas.width !== physicalW || glowCanvas.height !== physicalH) {
            glowCanvas.width = physicalW;
            glowCanvas.height = physicalH;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawGlow() {
        syncSize();
        const rect = mapCanvas.getBoundingClientRect();
        const w = Math.round(rect.width), h = Math.round(rect.height);
        ctx.clearRect(0, 0, w, h);
        if (window.innerWidth <= 768 || cx < 0 || !state.allFeatures?.length) return;

        // Smooth zoom fade out between zoom 11.5 and 14.0
        const currentZoom = state.map ? state.map.getZoom() : 10;
        if (currentZoom >= 14.0) return;
        const zoomFadeAlpha = currentZoom <= 11.5 ? 1.0 : Math.max(0, 1 - (currentZoom - 11.5) / 2.5);

        const isLight = state.currentBaseLayer === 'esri-street' || state.currentBaseLayer === 'esri-topo';
        const lineAlpha = (isLight ? 0.45 : 0.45) * zoomFadeAlpha;
        const lineColor = isLight ? `rgba(0, 0, 0, ${lineAlpha.toFixed(3)})` : `rgba(255, 255, 255, ${lineAlpha.toFixed(3)})`;
        const lineW = isLight ? 2.8 : 0.9;

        // --- Pass 1: Radial Fill Gradient clipped to currently hovered feature polygon ---
        const activeHoverId = state._hoveredFeatureId;
        if (activeHoverId) {
            const feat = state.allFeatures.find(f => {
                const props = f.properties || {};
                const idKey = state.isCirclesFeature ? String(props.cid || '') : String(props.zid || '');
                return idKey === String(activeHoverId) || String(f.id) === String(activeHoverId);
            });
            if (feat && !isFeatureSelected(feat)) {
                ctx.save();
                ctx.beginPath();
                _drawFeaturePath(feat);
                ctx.clip(); // Mask strictly to hovered feature boundary

                const fillRadius = 340; // px — radial spotlight radius
                const fillGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, fillRadius);
                const maxAlpha = (isLight ? 0.15 : 0.15) * zoomFadeAlpha;
                const numStops = 12;

                for (let i = 0; i <= numStops; i++) {
                    const step = i / numStops;
                    // Exponential perceptual ease-out curve to smooth color steps
                    const alpha = maxAlpha * Math.pow(1 - step, 2.2);
                    const colorStr = isLight ? `rgba(0, 0, 0, ${alpha.toFixed(4)})` : `rgba(255, 255, 255, ${alpha.toFixed(4)})`;
                    fillGrad.addColorStop(step, colorStr);
                }

                ctx.fillStyle = fillGrad;
                ctx.fillRect(0, 0, w, h);

                // --- Apply Noise Dithering to eliminate all visible band lines ---
                const pattern = getDitherPattern();
                if (pattern) {
                    ctx.globalCompositeOperation = 'overlay';
                    ctx.fillStyle = pattern;
                    ctx.fillRect(0, 0, w, h);
                    ctx.globalCompositeOperation = 'source-over';
                }

                ctx.restore();
            }
        }

        // --- Pass 2: Line Outline Proximity Glow ---
        ctx.save();

        // Draw crisp line matching exact regular map line thickness
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineW;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        _drawAllRings();
        ctx.stroke();

        // --- Mask: keep only line pixels within cursor radius ---
        ctx.globalCompositeOperation = 'destination-in';
        const t = cx, u = cy;
        const grad = ctx.createRadialGradient(t, u, 0, t, u, RADIUS);
        // Smoothstep-ish stops for a natural gradient feel
        grad.addColorStop(0,    'rgba(0,0,0,1)');
        grad.addColorStop(0.45, 'rgba(0,0,0,0.95)');
        grad.addColorStop(0.75, 'rgba(0,0,0,0.5)');
        grad.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.restore();
    }

    function isFeatureSelected(feat) {
        if (!feat || !state.currentId || state.currentId === CIRCLE_ID) return false;
        const props = feat.properties || {};
        const key = state.isCirclesFeature ? String(props.cid || '') : String(props.zid || '');
        return key === state.currentId || normalizeZoneId(key) === normalizeZoneId(state.currentId);
    }

    function _drawFeaturePath(feat) {
        const geom = feat?.geometry;
        if (!geom) return;
        const polys = geom.type === 'Polygon'      ? [geom.coordinates]
                    : geom.type === 'MultiPolygon' ? geom.coordinates
                    : [];
        polys.forEach(poly => {
            poly.forEach(ring => {
                ring.forEach((coord, i) => {
                    const p = state.map.project(coord);
                    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
            });
        });
    }

    function _drawAllRings() {
        state.allFeatures.forEach(feat => {
            if (!isFeatureSelected(feat)) {
                _drawFeaturePath(feat);
            }
        });
    }

    function scheduleRedraw() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; drawGlow(); });
    }

    mapCanvas.addEventListener('mousemove', (e) => {
        if (window.innerWidth <= 768) return;
        const rect = mapCanvas.getBoundingClientRect();
        cx = e.clientX - rect.left;
        cy = e.clientY - rect.top;
        scheduleRedraw();
    });

    mapCanvas.addEventListener('mouseleave', () => {
        cx = -9999; cy = -9999;
        scheduleRedraw();
    });

    // Redraw when map pans/zooms so lines stay aligned
    state.map.on('render', () => { if (cx >= 0) scheduleRedraw(); });
}

// HTML label overlay — repositions div labels on every map render
export function updateLabelZoomVisibility() {
    rebuildHtmlLabels();
}


export function rebuildGeoJsonLayer() {
    if (!state.map) return;
    
    const grouped = {};
    state.allFeatures.forEach(f => {
        const props = f.properties || {};
        const newId = state.isCirclesFeature ? String(props.cid || "") : String(props.zid || "");
        if (!newId) return;

        if (!grouped[newId]) {
            grouped[newId] = {
                type: "Feature",
                id: newId,
                properties: {
                    ...props,
                    feature_id: newId
                },
                geometry: {
                    type: "MultiPolygon",
                    coordinates: []
                }
            };
        }

        const geom = f.geometry;
        if (geom) {
            if (geom.type === "Polygon") {
                grouped[newId].geometry.coordinates.push(geom.coordinates);
            } else if (geom.type === "MultiPolygon") {
                grouped[newId].geometry.coordinates.push(...geom.coordinates);
            } else {
                grouped[newId].geometry = geom;
            }
        }
    });

    const geojsonData = {
        type: "FeatureCollection",
        features: Object.values(grouped)
    };

    // Build a separate geojson collection with exactly one Point per unique ID
    const labelFeatures = [];
    Object.keys(grouped).forEach(newId => {
        const feat = grouped[newId];
        const bbox = getBbox([feat]);
        const insidePt = findPointInsidePolygon(feat.geometry);
        let centerLng, centerLat;
        if (insidePt) {
            centerLng = insidePt[0];
            centerLat = insidePt[1];
        } else {
            centerLng = (bbox[0][0] + bbox[1][0]) / 2;
            centerLat = (bbox[0][1] + bbox[1][1]) / 2;
        }

        const degWidth = bbox[1][0] - bbox[0][0];
        const textVal = state.isCirclesFeature ? String(feat.properties.cid || "") : String(feat.properties.zid || "");

        labelFeatures.push({
            type: "Feature",
            id: newId,
            properties: {
                ...feat.properties,
                feature_id: newId,
                deg_width: degWidth,
                text_len: textVal.length
            },
            geometry: {
                type: "Point",
                coordinates: [centerLng, centerLat]
            }
        });
    });

    // Store label data on state for HTML overlay rendering
    state.labelData = labelFeatures.map(f => ({
        id: f.id,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        text: state.isCirclesFeature ? String(f.properties.cid || '') : String(f.properties.zid || ''),
        degWidth: f.properties.deg_width,
        textLen: f.properties.text_len,
        isCircle: !!f.properties.cid && !f.properties.zid
    }));

    if (state.map.getSource('zones')) {
        state.map.getSource('zones').setData(geojsonData);
        updateLabelZoomVisibility();
        updateAllFeatureStyles();
    } else {
        state.map.addSource('zones', {
            type: 'geojson',
            data: geojsonData,
            promoteId: 'feature_id'
        });
        const beforeId = state.map.getLayer('place_hamlet') ? 'place_hamlet' : undefined;

        state.map.addLayer({
            id: 'zones-fill',
            type: 'fill',
            source: 'zones',
            paint: {
                'fill-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], getThemeAccent(),
                    '#ffffff'
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 0.0,
                    ['match', ['get', 'cid'], 'Oakridge', true, 'Cottage Grove', true, false], 0.02,
                    0.07
                ],
                'fill-color-transition': { duration: 0 },
                'fill-opacity-transition': { duration: 0 }
            }
        }, beforeId);

        state.map.addLayer({
            id: 'zones-outline',
            type: 'line',
            source: 'zones',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], getThemeAccentLight(),
                    ['match', ['get', 'cid'], 'Oakridge', true, 'Cottage Grove', true, false], 'rgba(255, 255, 255, 0.25)',
                    '#ffffff'
                ],
                'line-width': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 2.2,
                    1.0
                ],
                'line-color-transition': { duration: 0 },
                'line-width-transition': { duration: 0 },
                'line-opacity-transition': { duration: 0 }
            }
        }, beforeId);

        state.map.addLayer({
            id: 'zones-outline-highlight',
            type: 'line',
            source: 'zones',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], getThemeAccentLight(),
                    'transparent'
                ],
                'line-width': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 3.2,
                    0.0
                ],
                'line-color-transition': { duration: 250 },
                'line-width-transition': { duration: 250 }
            }
        }, beforeId);

        state.map.addLayer({
            id: 'zones-collision-labels',
            type: 'symbol',
            source: 'zones',
            layout: {
                'text-field': ['get', 'feature_id'],
                'text-size': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    8, 14,
                    12, 18,
                    14, 20
                ],
                'text-ignore-placement': false,
                'text-allow-overlap': false,
                'text-padding': 10
            },
            paint: {
                'text-color': 'rgba(0,0,0,0)',
                'text-halo-color': 'rgba(0,0,0,0)'
            }
        }, beforeId);

        // Register map move/zoom listeners for HTML label repositioning (once)
        if (!state._labelListenersAttached) {
            state._labelListenersAttached = true;
            state.map.on('move', rebuildHtmlLabels);
            state.map.on('zoom', rebuildHtmlLabels);
            state.map.on('render', rebuildHtmlLabels);
        }
        setupProximityTracking();
        setupProximityGlowCanvas();
        updateLabelZoomVisibility();
        updateAllFeatureStyles();
        
        setupMapHoverEvents();
    }

    if (state.isLocating && state.userLocationMarker) {
        checkUserLocationZone(state.userLocationMarker.getLngLat());
    }

    updateAllFeatureStyles();
}



function initializeMap() {
    // Start preloading global low-resolution tiles in background
    try {
        preloadGlobalLowResTiles();
    } catch (e) {
        console.warn("Tile preloading failed:", e);
    }

    const mapContainer = document.getElementById("tile-map");
    const mapWrapper = document.getElementById("map-wrapper");
    if (!mapContainer) return;

    state.map = new maplibregl.Map({
        container: 'tile-map',
        preserveDrawingBuffer: true,
        maxZoom: 20,
        minZoom: 0,
        maxTileCacheSize: 2500,
        prefetchZoomDelta: 8,
        projection: { type: 'globe' },
        dragPan: {
            linearity: 0.15,
            deceleration: 1000
        },
        style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        center: [-123.11, 44.05],
        zoom: 11,
        attributionControl: false
    });

    // Set initial background color to match black
    const initialTileMapEl = document.getElementById("tile-map");
    if (initialTileMapEl) {
        initialTileMapEl.style.setProperty("background-color", "#000000", "important");
        initialTileMapEl.style.setProperty("background", "#000000", "important");
    }

    // Configure smooth inertial scroll zoom rates for trackpad and mouse wheel (Google Earth style)
    if (state.map.scrollZoom) {
        state.map.scrollZoom.setWheelZoomRate(1 / 750);
        state.map.scrollZoom.setZoomRate(1 / 150);
    }
    setupMapLayers(state);
    

    try {
        state.map.setProjection({ type: 'globe' });
    } catch(e) {
        console.warn("Immediate setProjection not supported yet:", e);
    }

    // Disable rotation on mobile (touch devices) – preserve pinch-to-zoom only
    if (/Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) || window.innerWidth <= 768) {
        state.map.touchZoomRotate.disableRotation();
    }

    state.baseMapsList = [
        { id: "dark", name: "Dark Map", layerId: "base-dark-vector" },
        { id: "dark-raster", name: "Dark Map (Raster)", layerId: "base-dark-raster" },
        { id: "satellite", name: "Satellite Map", layerId: "base-satellite" },
        { id: "esri-street", name: "Street Map", layerId: "base-esri-street" },
        { id: "esri-topo", name: "Topo Map", layerId: "base-esri-topo" }
    ];

    // Create custom controls container
    let controlContainer = document.querySelector(".map-ctrl-container");
    if (!controlContainer) {
        controlContainer = document.createElement("div");
        controlContainer.className = "map-ctrl-container";

        const topLeft = document.createElement("div");
        topLeft.className = "map-ctrl-panel map-ctrl-panel--left";
        controlContainer.appendChild(topLeft);

        const topRight = document.createElement("div");
        topRight.className = "map-ctrl-panel map-ctrl-panel--right";
        controlContainer.appendChild(topRight);

        mapWrapper.appendChild(controlContainer);
    }

    const topLeft = controlContainer.querySelector(".map-ctrl-panel.map-ctrl-panel--left");

    // 1. Zoom Control
    const zoomDiv = document.createElement("div");
    zoomDiv.className = "map-ctrl-zoom map-ctrl-bar map-ctrl";
    
    const zoomInBtn = document.createElement("a");
    zoomInBtn.className = "map-ctrl-zoom-in";
    zoomInBtn.href = "#";
    zoomInBtn.title = "Zoom in";
    zoomInBtn.role = "button";
    zoomInBtn.setAttribute("aria-label", "Zoom in");
    zoomInBtn.textContent = "+";
    zoomInBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.map) state.map.zoomIn();
    });
    
    const zoomOutBtn = document.createElement("a");
    zoomOutBtn.className = "map-ctrl-zoom-out";
    zoomOutBtn.href = "#";
    zoomOutBtn.title = "Zoom out";
    zoomOutBtn.role = "button";
    zoomOutBtn.setAttribute("aria-label", "Zoom out");
    zoomOutBtn.innerHTML = "&#x2212;";
    zoomOutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.map) state.map.zoomOut();
    });

    zoomDiv.appendChild(zoomInBtn);
    zoomDiv.appendChild(zoomOutBtn);
    topLeft.appendChild(zoomDiv);

    // 2. Locate Control
    const locateDiv = document.createElement("div");
    locateDiv.className = "map-ctrl-bar map-ctrl map-ctrl-locate";
    
    const locateBtn = document.createElement("a");
    locateBtn.className = "map-ctrl-locate-btn";
    locateBtn.href = "#";
    locateBtn.title = "Show My Location";
    locateBtn.role = "button";
    locateBtn.setAttribute("aria-label", "Show My Location");
    locateBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="8"></circle>
            <line x1="12" y1="2" x2="12" y2="4"></line>
            <line x1="12" y1="20" x2="12" y2="22"></line>
            <line x1="2" y1="12" x2="4" y2="12"></line>
            <line x1="20" y1="12" x2="22" y2="12"></line>
            <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
        </svg>
    `;
    locateBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleLocationTracking();
    });
    locateDiv.appendChild(locateBtn);
    topLeft.appendChild(locateDiv);

    // 3. Fullscreen Control
    const fsDiv = document.createElement("div");
    fsDiv.className = "map-ctrl-bar map-ctrl map-ctrl-fullscreen";
    
    const fsBtn = document.createElement("a");
    fsBtn.className = "map-ctrl-fullscreen-btn";
    fsBtn.href = "#";
    fsBtn.title = "Toggle Fullscreen";
    fsBtn.role = "button";
    fsBtn.setAttribute("aria-label", "Toggle Fullscreen");
    fsBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
        </svg>
    `;
    fsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
    });
    fsDiv.appendChild(fsBtn);
    topLeft.appendChild(fsDiv);

    // 4. Map Style Control (Custom Reimplementation)
    const layersDiv = document.createElement("div");
    layersDiv.className = "map-ctrl-bar map-ctrl map-ctrl-styles";
    
    const layersBtn = document.createElement("a");
    layersBtn.className = "map-ctrl-styles__toggle";
    layersBtn.href = "#";
    layersBtn.title = "Map Elements";
    layersBtn.role = "button";
    layersBtn.setAttribute("aria-label", "Map Elements");
    layersBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
    `;
    layersDiv.appendChild(layersBtn);

    const listContainer = document.createElement("div");
    listContainer.className = "map-ctrl-styles__list";
    listContainer.innerHTML = `
        <div class="map-ctrl-styles__header">
            <div class="modal-title-wrapper" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-left: 2px;">
                <span class="modal-title" style="font-size: 0.95rem; font-weight: 700; color: #ffffff; text-transform: none; letter-spacing: normal;">Map Elements</span>
                <button type="button" class="modal-close-btn" aria-label="Close Map Elements" style="background: transparent; border: none; padding: 4px; cursor: pointer; color: rgba(255, 255, 255, 0.45); display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; border-radius: 50%;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-capsules-wrapper">
                <div class="modal-capsules-scroll">
                    <button type="button" class="modal-capsule modal-capsule--icon is-active" data-tab="basemaps" title="Select Basemaps">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                            <polyline points="2 17 12 22 22 17"></polyline>
                            <polyline points="2 12 12 17 22 12"></polyline>
                        </svg>
                    </button>
                    <button type="button" class="modal-capsule" data-tab="layers">Our Layers</button>

                </div>
                <button type="button" class="modal-search-toggle-btn" aria-label="Search items">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-search-expanded">
                <div class="modal-search-input-container">
                    <svg class="modal-search-input-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" class="modal-search-input" placeholder="Search items..." autocomplete="off" />
                </div>
                <button type="button" class="modal-search-close-btn" aria-label="Close search">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
        <div class="map-ctrl-styles__body"></div>
    `;
    layersDiv.appendChild(listContainer);
    topLeft.appendChild(layersDiv);

    let activeTab = "basemaps";
    let searchQuery = "";

    const headerEl = listContainer.querySelector(".map-ctrl-styles__header");
    const bodyEl = listContainer.querySelector(".map-ctrl-styles__body");
    const searchInput = listContainer.querySelector(".modal-search-input");
    const searchToggleBtn = listContainer.querySelector(".modal-search-toggle-btn");
    const searchCloseBtn = listContainer.querySelector(".modal-search-close-btn");

    const renderContent = () => {
        if (!bodyEl) return;
        bodyEl.innerHTML = "";
        const query = searchQuery.toLowerCase().trim();

        const layers = [];
        if (state.isCirclesFeature || state.currentFeature === "circles") {
            layers.push({
                id: "circles", name: "Coast to Cascades Bird Alliance", isChild: false, image: "../images/wetlands.jpg", isLogo: false,
                action: () => selectSubject(CIRCLE_ID, true)
            });
        } else {
            const isFlorence = state.currentFeature === "florence";
            layers.push({
                id: "circle", name: isFlorence ? "Florence Christmas Bird Count Circle" : "Eugene Christmas Bird Count Circle", isChild: false, 
                image: isFlorence ? "../images/florence.png" : "../images/logo-small.png", isLogo: true,
                action: () => selectSubject(CIRCLE_ID, true)
            });
            if (state.currentId && state.currentId !== CIRCLE_ID) {
                const targetZone = state.allFeatures.find(f => {
                    const zid = f.properties?.zid;
                    return zid && (String(zid).toLowerCase() === String(state.currentId).toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                });
                const zidDisplay = targetZone ? displayZoneId(targetZone.properties.zid) : state.currentId;
                const zoneImg = zoneImagePath(state.currentId);
                layers.push({
                    id: "selected-zone",
                    name: `Zone ${zidDisplay}`,
                    isChild: true,
                    image: zoneImg,
                    feature: targetZone,
                    isLogo: false,
                    action: () => selectSubject(state.currentId, true)
                });
            }
        }

        const maxItems = Math.max(layers.length, 3);
        const estimatedHeight = 76 + 20 + (maxItems * 68);
        listContainer.style.setProperty("height", `${estimatedHeight}px`, "important");

        if (activeTab === "layers") {
            const filtered = layers.filter(l => l.name.toLowerCase().includes(query));
            if (filtered.length === 0) {
                bodyEl.innerHTML = `<div class="modal-no-results">No layers found</div>`;
            } else {
                filtered.forEach(l => {
                    const isCircleOverview = !state.currentId || state.currentId === CIRCLE_ID;
                    const isRowActive = l.id === "selected-zone" || (l.id === "circle" && isCircleOverview) || (l.id === "circles" && state.isCirclesFeature);
                    
                    const row = document.createElement("div");
                    row.className = `tile-zone-item ${l.isChild ? 'is-child' : ''} ${isRowActive ? 'is-active' : ''}`;
                    row.innerHTML = `
                        <div class="tile-zone-item__thumb ${l.isLogo ? 'tile-zone-item__thumb--logo' : ''}">
                            <img src="${l.image}" alt="${l.name}" loading="lazy">
                        </div>
                        <div class="tile-zone-item__info">
                            <div class="tile-zone-item__title">${l.name}</div>
                        </div>
                    `;

                    const img = row.querySelector("img");
                    if (img) {
                        img.addEventListener("error", () => {
                            img.src = FALLBACK_IMAGE;
                        });
                    }

                    row.addEventListener("click", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        l.action();
                    });
                    bodyEl.appendChild(row);
                });
            }
        } else {
            const basemaps = [
                { id: "dark", name: "Dark Map", thumbnailClass: "dark-map-thumbnail", layerId: "base-dark-vector" },
                { id: "dark-raster", name: "Dark Map (Raster)", thumbnailClass: "dark-map-thumbnail", layerId: "base-dark-raster" },
                { id: "satellite", name: "Satellite Map", thumbnailClass: "satellite-thumbnail", layerId: "base-satellite" },
                { id: "esri-street", name: "Street Map", thumbnailClass: "esri-street-thumbnail", layerId: "base-esri-street" },
                { id: "esri-topo", name: "Topo Map", thumbnailClass: "esri-topo-thumbnail", layerId: "base-esri-topo" }
            ];

            const filtered = basemaps.filter(b => b.name.toLowerCase().includes(query));
            if (filtered.length === 0) {
                bodyEl.innerHTML = `<div class="modal-no-results">No basemaps found</div>`;
            } else {
                filtered.forEach(b => {
                    const isSelected = state.currentBaseLayer === b.id;
                    const row = document.createElement("div");
                    row.className = `tile-zone-item ${isSelected ? 'is-active' : ''}`;
                    row.innerHTML = `
                        <div class="tile-zone-item__thumb">
                            <span class="thumbnail ${b.thumbnailClass}"></span>
                        </div>
                        <div class="tile-zone-item__info">
                            <div class="tile-zone-item__title">${b.name}</div>
                        </div>
                    `;
                    row.addEventListener("click", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        
                        switchBaseMap(b.id);
                        renderContent();
                    });
                    bodyEl.appendChild(row);
                });
            }
        }
    };

    state.refreshLayersModal = () => {
        renderContent();
    };

    renderContent();

    layersBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isExpanded = layersDiv.classList.contains("map-ctrl-styles--expanded");
        if (isExpanded) {
            layersDiv.classList.remove("map-ctrl-styles--expanded");
        } else {
            layersDiv.classList.add("map-ctrl-styles--expanded");
            renderContent();
        }
    });

    const closeBtn = listContainer.querySelector(".modal-close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            layersDiv.classList.remove("map-ctrl-styles--expanded");
        });
    }

    const capsules = listContainer.querySelectorAll(".modal-capsule");
    capsules.forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            const tab = btn.getAttribute("data-tab");
            if (tab === "tools") {
                showToast("Tools view is not available (coming soon)");
                return;
            }
            if (tab === "settings") {
                showToast("Settings view is not available (coming soon)");
                return;
            }
            if (tab === activeTab) return;

            activeTab = tab;
            capsules.forEach(c => {
                if (c.getAttribute("data-tab") === tab) {
                    c.classList.add("is-active");
                } else {
                    c.classList.remove("is-active");
                }
            });

            renderContent();
        });
    });

    searchToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        headerEl.classList.add("is-searching");
        if (searchInput) {
            searchInput.focus();
        }
    });

    searchCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        headerEl.classList.remove("is-searching");
        if (searchInput) {
            searchInput.value = "";
        }
        searchQuery = "";
        renderContent();
    });

    searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value;
        renderContent();
    });

    document.addEventListener("click", (e) => {
        if (!layersDiv.contains(e.target)) {
            layersDiv.classList.remove("map-ctrl-styles--expanded");
            headerEl.classList.remove("is-searching");
            if (searchInput) {
                searchInput.value = "";
            }
            searchQuery = "";
        }
    });

    updateControlPositions();

    state.map.on("click", (e) => {
        if (Date.now() - state.lastZoneClickTime < 250) {
            return;
        }
        
        const features = state.map.queryRenderedFeatures(e.point, { layers: ['zones-fill'] });
        if (features.length === 0) {
            if (!state.isCirclesFeature && state.currentId === CIRCLE_ID) {
                switchToCirclesFeature();
            } else {
                selectSubject(CIRCLE_ID);
            }
        }
    });

    state.map.on("load", () => {
        state.map.setProjection({ type: 'globe' });
        state.map.dragPan.enable({
            linearity: 0.15,
            deceleration: 1000
        });
        rebuildGeoJsonLayer();
    });

    setupMapEffectsAndFullscreen(mapWrapper);
}

const MAP_VIEWER_APPS = [
    {
        name: "Avenza Maps",
        aliases: ["avenza", "avenzamaps"],
        formats: ["geopdf", "geotiff", "kmz", "gpx"]
    },
    {
        name: "OsmAnd Maps",
        aliases: ["osmand", "osmandmaps", "osmand+"],
        formats: ["gpx", "geojson", "kmz"]
    },
    {
        name: "Gaia GPS",
        aliases: ["gaia", "gaiagps"],
        formats: ["gpx", "kmz", "geojson"]
    },
    {
        name: "AllTrails",
        aliases: ["alltrails", "all trails"],
        formats: ["gpx", "kmz"]
    },
    {
        name: "CalTopo",
        aliases: ["caltopo", "sarsoft"],
        formats: ["gpx", "kmz", "geopdf", "geojson"]
    },
    {
        name: "onX Maps",
        aliases: ["onx", "onxhunt", "onxoffroad", "onxmaps"],
        formats: ["gpx", "kmz"]
    },
    {
        name: "Google Earth",
        aliases: ["google earth", "googleearth", "earth"],
        formats: ["kmz", "geojson"]
    },
    {
        name: "QGIS",
        aliases: ["qgis", "quantum gis"],
        formats: ["geojson", "kmz", "gpx", "geopdf", "geotiff"]
    },
    {
        name: "ArcGIS / Field Maps",
        aliases: ["arcgis", "esri", "field maps"],
        formats: ["geojson", "geopdf", "geotiff", "kmz", "gpx"]
    },
    {
        name: "Garmin Explore / BaseCamp",
        aliases: ["garmin", "basecamp", "garmin explore"],
        formats: ["gpx", "kmz"]
    },
    {
        name: "Locus Map",
        aliases: ["locus", "locusmap"],
        formats: ["gpx", "kmz", "geotiff"]
    },
    {
        name: "Organic Maps / Maps.me",
        aliases: ["organic maps", "mapsme", "maps.me"],
        formats: ["kmz", "gpx"]
    }
];



function updateAllAppsModalHeaderTitle() {
  const modalTitleEl = document.getElementById("all-apps-modal-title");
  if (!modalTitleEl) return;

  const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
  const circleName = state.currentFeature === "florence" ? "Florence Count Circle" : "Eugene Count Circle";

  if (state.isCirclesFeature) {
    modalTitleEl.innerHTML = `Download the <span class="avenza-target-name">Coast to Cascades Bird Alliance</span> to compatible apps`;
    return;
  }

  if (isCircle) {
    modalTitleEl.innerHTML = `Download the <span class="avenza-target-name">${circleName}</span> to compatible apps`;
    return;
  }

  const targetFeature = (state.allFeatures || []).find(f => {
    const zid = f.properties?.zid;
    return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || (typeof normalizeZoneId === "function" && normalizeZoneId(zid) === normalizeZoneId(state.currentId)));
  });

  const zoneName = (targetFeature && targetFeature.properties?.zid) 
    ? `Zone ${displayZoneId(targetFeature.properties.zid)}`
    : "Zone";

  modalTitleEl.innerHTML = `Download <span class="avenza-target-name">${zoneName}</span> of the <span class="avenza-target-name">${circleName}</span> to compatible apps`;
}

function updateShareModalDescription() {
    const descEl = document.querySelector(".maps-tile-copy-desc");
    if (!descEl) return;

    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
    const circleName = state.currentFeature === "florence" ? "Florence Count Circle" : "Eugene Count Circle";

    if (state.isCirclesFeature) {
        descEl.innerHTML = `Copy the link to the <span class="avenza-target-name">Coast to Cascades Bird Alliance</span> map:`;
        return;
    }

    if (isCircle) {
        descEl.innerHTML = `Copy the link to the <span class="avenza-target-name">${circleName}</span>:`;
        return;
    }

    const targetFeature = (state.allFeatures || []).find(f => {
        const zid = f.properties?.zid;
        return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || (typeof normalizeZoneId === "function" && normalizeZoneId(zid) === normalizeZoneId(state.currentId)));
    });

    const zoneName = (targetFeature && targetFeature.properties?.zid) 
        ? `Zone ${displayZoneId(targetFeature.properties.zid)}`
        : "Zone";

    descEl.innerHTML = `Copy the link to <span class="avenza-target-name">${zoneName}</span> of the <span class="avenza-target-name">${circleName}</span>:`;
}

function setupSuggestedAppCards() {
    setupAllAppsLiveSearch();
    const viewAllBtn = document.getElementById("btn-view-all-apps");
    const allAppsModal = document.getElementById("all-apps-modal");

    if (viewAllBtn && allAppsModal) {
        viewAllBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllModals();
            updateAllAppsModalHeaderTitle();
            allAppsModal.setAttribute("aria-hidden", "false");
            allAppsModal.classList.add("is-open");
            const searchInput = document.getElementById("all-apps-search-input");
            if (searchInput) {
                searchInput.value = "";
                const event = new Event("input");
                searchInput.dispatchEvent(event);
            }
        });
    }

    document.querySelectorAll(".suggested-app-card:not(#btn-view-all-apps)").forEach(card => {
        const iconWrap = card.querySelector(".suggested-app-icon-wrap");

        if (iconWrap) {
            card.addEventListener("mousemove", (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = ((y - centerY) / centerY) * -12;
                const rotateY = ((x - centerX) / centerX) * 12;

                iconWrap.style.transition = "transform 0.08s ease-out, box-shadow 0.15s ease";
                iconWrap.style.transform = `perspective(400px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.08, 1.08, 1.08) translateZ(6px)`;
                if (!card.classList.contains("is-active")) {
                    iconWrap.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.55), 0 0 14px rgba(255, 255, 255, 0.14)";
                }
            });

            card.addEventListener("mouseleave", () => {
                iconWrap.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease";
                iconWrap.style.transform = "perspective(400px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1) translateZ(0px)";
                iconWrap.style.boxShadow = card.classList.contains("is-active")
                    ? "0 0 0 1.5px rgba(var(--accent-rgb), 0.5), 0 8px 24px rgba(0, 0, 0, 0.6)"
                    : "0 4px 12px rgba(0, 0, 0, 0.4)";
            });
        }

        card.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const appName = card.getAttribute("data-app-name");
            if (!appName) return;

            const wasActive = card.classList.contains("is-active");
            document.querySelectorAll(".suggested-app-card").forEach(c => c.classList.remove("is-active"));

            if (!wasActive) {
                card.classList.add("is-active");
            }
            closeAllModals();
            await handleAppDirectOpen(appName, card);
        });
    });
}

function setupDownloadAppSearch() {
    setupSuggestedAppCards();
    const searchInput = document.getElementById("download-app-search");
    const clearBtn = document.getElementById("download-app-search-clear");
    const autocompleteBox = document.getElementById("download-app-autocomplete");
    if (!searchInput || !autocompleteBox) return;

    const searchBox = document.querySelector(".maps-tile-download-search-box");
    const setupBoxProximity = (element, threshold = 140, spotlightSize = 200) => {
        if (!element) return;
        element.style.setProperty("--mouse-x", "50%");
        element.style.setProperty("--mouse-y", "50%");
        element.style.setProperty("--glow-opacity", "0");
        element.style.setProperty("--spotlight-size", `${spotlightSize}px`);

        window.addEventListener("mousemove", (e) => {
            if (window.getComputedStyle(element).display === "none") {
                element.style.setProperty("--glow-opacity", "0");
                return;
            }
            const rect = element.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
            const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
            const dist = Math.sqrt(dx * dx + dy * dy);

            element.style.setProperty("--mouse-x", `${x}px`);
            element.style.setProperty("--mouse-y", `${y}px`);

            let opacity = 0;
            if (dist <= threshold) {
                opacity = Math.pow(1 - dist / threshold, 1.2);
            }
            element.style.setProperty("--glow-opacity", opacity.toFixed(3));
        });
    };

    setupBoxProximity(autocompleteBox, 140, 200);

    const allDownloadButtons = {
        "geojson": document.getElementById("download-geojson"),
        "kmz": document.getElementById("download-kmz"),
        "gpx": document.getElementById("download-gpx"),
        "geopdf": document.getElementById("download-geopdf"),
        "geotiff": document.getElementById("download-geotiff")
    };

    const filterFormatsByApp = (appFormats) => {
        if (!appFormats) {
            Object.values(allDownloadButtons).forEach(btn => {
                if (btn) {
                    btn.classList.remove("is-dimmed", "is-filtered-match");
                }
            });
            return;
        }

        Object.entries(allDownloadButtons).forEach(([formatKey, btn]) => {
            if (btn) {
                if (appFormats.includes(formatKey)) {
                    btn.classList.remove("is-dimmed");
                    btn.classList.add("is-filtered-match");
                } else {
                    btn.classList.add("is-dimmed");
                    btn.classList.remove("is-filtered-match");
                }
            }
        });
    };

    const updateAutocomplete = () => {
        const query = searchInput.value.trim().toLowerCase();
        if (clearBtn) {
            clearBtn.style.display = query ? "flex" : "none";
        }

        if (!query) {
            autocompleteBox.style.display = "none";
            autocompleteBox.innerHTML = "";
            filterFormatsByApp(null);
            document.querySelectorAll(".suggested-app-card").forEach(c => c.classList.remove("is-active"));
            return;
        }

        const matches = MAP_VIEWER_APPS.filter(app => 
            app.name.toLowerCase().includes(query) || 
            app.aliases.some(a => a.includes(query))
        );

        // Sync active state on suggested app cards with search query
        document.querySelectorAll(".suggested-app-card").forEach(card => {
            const cardAppName = card.getAttribute("data-app-name") || "";
            const isMatch = matches.some(m => m.name.toLowerCase() === cardAppName.toLowerCase());
            card.classList.toggle("is-active", isMatch && query.length > 0);
        });

        if (matches.length === 0) {
            autocompleteBox.style.display = "block";
            autocompleteBox.innerHTML = `<div class="download-autocomplete-scroll-container"><div style="padding:0.6rem; font-size:0.8rem; color:rgba(255,255,255,0.4); text-align:center;">No matching viewer app found</div></div>`;
            filterFormatsByApp(null);
            return;
        }

        autocompleteBox.style.display = "block";
        const itemsHtml = matches.map(app => `
            <div class="download-autocomplete-item" data-app-name="${app.name}">
                <span class="download-autocomplete-item__name">${app.name}</span>
                <div class="download-autocomplete-item__formats">
                    ${app.formats.map(f => `<span class="download-format-pill">${f.toUpperCase()}</span>`).join("")}
                </div>
            </div>
        `).join("");

        autocompleteBox.innerHTML = `<div class="download-autocomplete-scroll-container">${itemsHtml}</div>`;

        autocompleteBox.querySelectorAll(".download-autocomplete-item").forEach(item => {
            item.addEventListener("click", (e) => {
                e.stopPropagation();
                const selectedName = item.getAttribute("data-app-name");
                const selectedApp = MAP_VIEWER_APPS.find(a => a.name === selectedName);
                if (selectedApp) {
                    searchInput.value = selectedApp.name;
                    autocompleteBox.style.display = "none";
                    if (clearBtn) clearBtn.style.display = "flex";
                    filterFormatsByApp(selectedApp.formats);
                    if (typeof showToast === "function") {
                        showToast(`Filtered formats for ${selectedApp.name}`);
                    }
                }
            });
        });

        if (matches.length > 0) {
            filterFormatsByApp(matches[0].formats);
        }
    };

    // Wire 3D angle-shift tilt hover effect & click handlers for Suggested App cards
    document.querySelectorAll(".suggested-app-card").forEach(card => {
        const iconWrap = card.querySelector(".suggested-app-icon-wrap");

        if (iconWrap) {
            card.addEventListener("mousemove", (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                // Balanced angle shift calculation (max tilt +-12deg)
                const rotateX = ((y - centerY) / centerY) * -12;
                const rotateY = ((x - centerX) / centerX) * 12;

                iconWrap.style.transition = "transform 0.08s ease-out, box-shadow 0.15s ease";
                iconWrap.style.transform = `perspective(400px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.08, 1.08, 1.08) translateZ(6px)`;
                if (!card.classList.contains("is-active")) {
                    iconWrap.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.55), 0 0 14px rgba(255, 255, 255, 0.14)";
                }
            });

            card.addEventListener("mouseleave", () => {
                iconWrap.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease";
                iconWrap.style.transform = "perspective(400px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1) translateZ(0px)";
                iconWrap.style.boxShadow = card.classList.contains("is-active")
                    ? "0 0 0 1.5px rgba(var(--accent-rgb), 0.5), 0 8px 24px rgba(0, 0, 0, 0.6)"
                    : "0 4px 12px rgba(0, 0, 0, 0.4)";
            });
        }

        card.addEventListener("click", async (e) => {
            e.stopPropagation();
            const appName = card.getAttribute("data-app-name");
            if (!appName) return;

            const selectedApp = MAP_VIEWER_APPS.find(a => 
                a.name.toLowerCase() === appName.toLowerCase() || 
                a.aliases.some(alias => alias.toLowerCase() === appName.toLowerCase())
            );

            const wasActive = card.classList.contains("is-active");
            document.querySelectorAll(".suggested-app-card").forEach(c => c.classList.remove("is-active"));

            if (wasActive) {
                searchInput.value = "";
                if (clearBtn) clearBtn.style.display = "none";
                autocompleteBox.style.display = "none";
                filterFormatsByApp(null);
            } else {
                card.classList.add("is-active");
                if (selectedApp) {
                    searchInput.value = selectedApp.name;
                    if (clearBtn) clearBtn.style.display = "flex";
                    autocompleteBox.style.display = "none";
                    filterFormatsByApp(selectedApp.formats);
                } else {
                    searchInput.value = appName;
                    if (clearBtn) clearBtn.style.display = "flex";
                }
                
                // Execute direct app handshake workflow (Blob fetch -> Web Share -> Fallback Download)
                await handleAppDirectOpen(appName, card);
            }
        });
    });

    searchInput.addEventListener("input", updateAutocomplete);
    searchInput.addEventListener("focus", updateAutocomplete);

    if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            searchInput.value = "";
            updateAutocomplete();
            searchInput.focus();
        });
    }

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".maps-tile-download-search-wrapper")) {
            autocompleteBox.style.display = "none";
        }
    });
}

function setupActionButtons() {
    const downloadModal = document.getElementById("downloads-modal");
    const copyModal = document.getElementById("copy-link-modal");
    const helpModal = document.getElementById("help-modal");
    const suggestModal = document.getElementById("suggest-modal");
    const downloadBtn = document.getElementById("btn-download-files");
    const copyBtn = document.getElementById("btn-copy-link");
    const helpBtn = document.getElementById("btn-help");
    const suggestBtn = document.getElementById("btn-suggest");

    const handleModalReparenting = () => {
        const mapWrapper = document.getElementById("map-wrapper") || document.querySelector(".maps-tile-map-area");
        const actionsRow = document.querySelector(".maps-tile-header__actions");
        const modals = [downloadModal, copyModal, helpModal, suggestModal];

        if (window.innerWidth <= 768) {
            if (actionsRow && actionsRow.parentElement !== document.body) {
                document.body.appendChild(actionsRow);
            }
            modals.forEach(m => {
                if (m && m.parentElement !== actionsRow) {
                    actionsRow.appendChild(m);
                }
            });
        } else if (mapWrapper) {
            if (actionsRow && actionsRow.parentElement !== mapWrapper) {
                mapWrapper.appendChild(actionsRow);
            }
            if (actionsRow) {
                modals.forEach(m => {
                    if (m && m.parentElement !== actionsRow) {
                        actionsRow.appendChild(m);
                    }
                });
            }
        }
    };
    handleModalReparenting();
    window.addEventListener("resize", handleModalReparenting);

    const toolbar = document.querySelector(".maps-tile-header__actions");
    if (toolbar) {
        const threshold = 140; // px — proximity threshold distance
        window.addEventListener("mousemove", (e) => {
            const rect = toolbar.getBoundingClientRect();
            
            // Calculate relative mouse coordinates inside toolbar coordinate space
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Calculate shortest distance from cursor to toolbar bounding box
            const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
            const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
            const dist = Math.sqrt(dx * dx + dy * dy);

            toolbar.style.setProperty("--mouse-x", `${x}px`);
            toolbar.style.setProperty("--mouse-y", `${y}px`);

            // Compute proximity opacity (1.0 inside toolbar, tapering down to 0.0 at threshold distance)
            let opacity = 0;
            if (dist <= threshold) {
                opacity = Math.pow(1 - dist / threshold, 1.2);
            }

            toolbar.style.setProperty("--glow-opacity", opacity.toFixed(3));
        });
    }

    window.updateActionButtonsState = () => {
        const isDownloadOpen = downloadModal && downloadModal.getAttribute("aria-hidden") === "false";
        const isCopyOpen = copyModal && copyModal.getAttribute("aria-hidden") === "false";
        const isHelpOpen = helpModal && helpModal.getAttribute("aria-hidden") === "false";
        const isSuggestOpen = suggestModal && suggestModal.getAttribute("aria-hidden") === "false";

        if (downloadBtn) downloadBtn.classList.toggle("is-active", !!isDownloadOpen);
        if (copyBtn) copyBtn.classList.toggle("is-active", !!isCopyOpen);
        if (helpBtn) helpBtn.classList.toggle("is-active", !!isHelpOpen);
        if (suggestBtn) suggestBtn.classList.toggle("is-active", !!isSuggestOpen);

        if (isDownloadOpen || isCopyOpen || isHelpOpen || isSuggestOpen) {
            document.body.classList.add("has-active-modal");
        } else {
            document.body.classList.remove("has-active-modal");
        }
    };



    const avenzaModal = document.getElementById("avenza-instruction-modal");
    const avenzaContinueBtn = document.getElementById("btn-avenza-continue");
    const avenzaDownloadBtn = document.getElementById("avenza-modal-download-btn");

    if (avenzaDownloadBtn) {
        avenzaDownloadBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            let blob = window._pendingAppBlob || window._pendingAvenzaBlob;
            let filename = window._pendingAppFilename || window._pendingAvenzaFilename || "map.pdf";
            let formatKey = window._pendingAppFormatKey || "geopdf";

            if (!(blob instanceof Blob)) {
                const { blob: generatedBlob, filename: genFilename } = await generateAppSpatialBlob(formatKey);
                blob = generatedBlob;
                if (genFilename) filename = genFilename;
                window._pendingAppBlob = blob;
            }

            const downloadBlob = new Blob([blob], { type: "application/octet-stream" });
            const url = URL.createObjectURL(downloadBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            avenzaDownloadBtn.classList.add("is-downloaded");
            avenzaDownloadBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Downloaded</span>
            `;
        });
    }

    if (avenzaContinueBtn && avenzaModal) {
        avenzaContinueBtn.addEventListener("click", () => {
            // Launch target app directly with App Store fallback if app is not installed
            const scheme = window._pendingAppScheme || "avenzamaps://";
            const appKey = window._pendingAppKey || "avenza";
            launchAppWithStoreFallback(scheme, appKey);
        });
    }

    // Bind data-modal-close listeners across all modals (including avenza-instruction-modal)
    document.querySelectorAll("[data-modal-close]").forEach(closeEl => {
        closeEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllModals();
        });
    });

    const handleToolsClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget) e.currentTarget.blur();
        showToast("Tools view is not available (coming soon)");
    };

    const handleSettingsClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget) e.currentTarget.blur();
        showToast("Settings view is not available (coming soon)");
    };

    ["desktop-nav-tab-tools", "mobile-nav-tab-tools"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", handleToolsClick);
    });

    ["desktop-nav-tab-settings", "mobile-nav-tab-settings"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", handleSettingsClick);
    });

    const modalBackBtn = document.getElementById("btn-modal-back");
    if (modalBackBtn) {
        modalBackBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllModals();
        });
    }

    if (copyBtn && copyModal) {
        const copyInput = document.getElementById("copy-link-input");
        const copyActionBtn = document.getElementById("btn-modal-copy-action");
        const copyBtnLabel = document.getElementById("copy-btn-label");

        copyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = copyModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                updateShareModalDescription();
                const currentUrl = window.location.href;
                if (copyInput) copyInput.value = currentUrl.replace(/^(https?:\/\/)/i, "");
                const qrImg = document.getElementById("copy-link-qr-code");
                if (qrImg) {
                    const qrWrapper = qrImg.parentElement;
                    if (qrWrapper) {
                        qrWrapper.classList.add("loading");
                    }
                    qrImg.style.opacity = "0";
                    qrImg.onload = () => {
                        if (qrWrapper) qrWrapper.classList.remove("loading");
                        qrImg.style.opacity = "1";
                    };
                    qrImg.onerror = () => {
                        if (qrWrapper) qrWrapper.classList.remove("loading");
                        qrImg.style.opacity = "0.3";
                    };
                    qrImg.src = `https://quickchart.io/qr?text=${encodeURIComponent(currentUrl)}&light=00000000&dark=b8b8b8&size=500&margin=0`;
                }
                copyModal.setAttribute("aria-hidden", "false");
                copyModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        if (copyActionBtn && copyInput) {
            copyActionBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(window.location.href);
                    showToast("Link copied to clipboard!");
                } catch (err) {
                    copyInput.select();
                    document.execCommand("copy");
                    showToast("Link copied to clipboard!");
                }
                if (copyBtnLabel) {
                    copyBtnLabel.textContent = "Copied!";
                    setTimeout(() => {
                        copyBtnLabel.textContent = "Copy";
                    }, 2000);
                }
            });
        }

        copyModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllModals();
            });
        });
    }

    if (downloadBtn && downloadModal) {
        setupDownloadAppSearch();
        downloadBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = downloadModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                downloadModal.setAttribute("aria-hidden", "false");
                downloadModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        downloadModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllModals();
            });
        });

        const geojsonBtn = document.getElementById("download-geojson");
        if (geojsonBtn) {
            geojsonBtn.addEventListener("click", async (e) => {
                const geojson = getSelectedGeoJSONData();
                const filename = getActiveDownloadFilename("geojson");
                const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
                await handleSpatialFileShare(e, blob, filename, geojsonBtn);
                showToast(`Exported ${filename}`);
            });
        }

        const kmzBtn = document.getElementById("download-kmz");
        if (kmzBtn) {
            kmzBtn.addEventListener("click", async (e) => {
                const geojson = getSelectedGeoJSONData();
                const filename = getActiveDownloadFilename("kmz");
                const kmlStr = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ""));
                let blob;
                if (typeof JSZip !== "undefined") {
                    const zip = new JSZip();
                    zip.file("doc.kml", kmlStr);
                    blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });
                } else {
                    blob = new Blob([kmlStr], { type: "application/vnd.google-earth.kml+xml" });
                }
                await handleSpatialFileShare(e, blob, filename, kmzBtn);
                showToast(`Exported ${filename}`);
            });
        }

        const gpxBtn = document.getElementById("download-gpx");
        if (gpxBtn) {
            gpxBtn.addEventListener("click", async (e) => {
                const geojson = getSelectedGeoJSONData();
                const filename = getActiveDownloadFilename("gpx");
                const gpxStr = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ""));
                const blob = new Blob([gpxStr], { type: "application/gpx+xml" });
                await handleSpatialFileShare(e, blob, filename, gpxBtn);
                showToast(`Exported ${filename}`);
            });
        }

        const geopdfBtn = document.getElementById("download-geopdf");
        if (geopdfBtn) {
            geopdfBtn.addEventListener("click", async () => {
                await downloadGeoPdf(geopdfBtn);
            });
        }

        const geotiffBtn = document.getElementById("download-geotiff");
        if (geotiffBtn) {
            geotiffBtn.addEventListener("click", async () => {
                await downloadGeoTiff(geotiffBtn);
            });
        }
    }

    if (helpBtn && helpModal) {
        helpBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = helpModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                helpModal.setAttribute("aria-hidden", "false");
                helpModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        helpModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllModals();
            });
        });
    }

    if (suggestBtn && suggestModal) {
        suggestBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = suggestModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                suggestModal.setAttribute("aria-hidden", "false");
                suggestModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        suggestModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllModals();
            });
        });
    }

    document.addEventListener("click", (e) => {
        if (window.innerWidth >= 769) {
            if (downloadModal && downloadModal.getAttribute("aria-hidden") === "false") {
                if (!downloadModal.contains(e.target) && !downloadBtn.contains(e.target)) {
                    closeAllModals();
                }
            }
            if (copyModal && copyModal.getAttribute("aria-hidden") === "false") {
                if (!copyModal.contains(e.target) && !copyBtn.contains(e.target)) {
                    closeAllModals();
                }
            }
            if (helpModal && helpModal.getAttribute("aria-hidden") === "false") {
                if (!helpModal.contains(e.target) && !helpBtn.contains(e.target)) {
                    closeAllModals();
                }
            }
            if (suggestModal && suggestModal.getAttribute("aria-hidden") === "false") {
                if (!suggestModal.contains(e.target) && !suggestBtn.contains(e.target)
                    && !document.body.classList.contains("is-annotation-mode")
                    && !window._preventSuggestClose) {
                    closeAllModals();
                }
            }
        }
    });

    setupSuggestFormAndDrawing(closeAllModals);
}

function setupSuggestFormAndDrawing(closeAllModals) {
    const markerBtn = document.getElementById("btn-draw-marker");
    const lineBtn = document.getElementById("btn-draw-line");
    const polygonBtn = document.getElementById("btn-draw-polygon");
    const statusEl = document.getElementById("suggest-annotation-status");
    const suggestForm = document.getElementById("suggest-form");
    const suggestModal = document.getElementById("suggest-modal");

    if (!suggestForm) return;

    let currentMode = null;
    let drawnCoords = [];
    let markerPlaced = false;

    // SVG icons
    const PIN_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
    const CLEAR_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    const setMarkerBtnToAdd = () => {
        if (!markerBtn) return;
        markerBtn.innerHTML = `${PIN_ICON}<span>Add a Marker</span>`;
        markerBtn.classList.remove("is-clear-mode");
    };

    const setMarkerBtnToClear = () => {
        if (!markerBtn) return;
        markerBtn.innerHTML = `${CLEAR_ICON}<span>Clear Marker</span>`;
        markerBtn.classList.add("is-clear-mode");
    };

    const clearAnnotation = (silent = false) => {
        drawnCoords = [];
        markerPlaced = false;
        currentMode = null;
        if (state.map && state.map.getCanvas()) state.map.getCanvas().style.cursor = "";
        document.body.classList.remove("is-annotation-mode");
        if (state.map && state.map.getSource("suggest-annotation-source")) {
            state.map.getSource("suggest-annotation-source").setData({
                type: "FeatureCollection",
                features: []
            });
        }
        if (statusEl) statusEl.textContent = "No location pinned on map";
        setMarkerBtnToAdd();
        if (!silent) showToast("Marker cleared");
    };

    const annotationExitBtn = document.getElementById("annotation-exit-btn");
    if (annotationExitBtn) {
        annotationExitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearAnnotation();
        });
    }

    // Press X to exit annotation mode
    document.addEventListener("keydown", (e) => {
        if ((e.key === "x" || e.key === "X") && document.body.classList.contains("is-annotation-mode")) {
            e.preventDefault();
            clearAnnotation();
        }
    });

    const resetDrawingMode = () => {
        currentMode = null;
        if (state.map && state.map.getCanvas()) state.map.getCanvas().style.cursor = "";
        document.body.classList.remove("is-annotation-mode");
        [markerBtn, lineBtn, polygonBtn].forEach(btn => {
            if (btn) btn.classList.remove("is-active");
        });
    };

    const updateAnnotationSource = () => {
        if (!state.map) return;
        let feature = null;
        if (drawnCoords.length > 0) {
            feature = {
                type: "Feature",
                geometry: { type: "Point", coordinates: drawnCoords[0] }
            };
        }

        const geojson = {
            type: "FeatureCollection",
            features: feature ? [feature] : []
        };

        if (state.map.getSource("suggest-annotation-source")) {
            state.map.getSource("suggest-annotation-source").setData(geojson);
        } else {
            state.map.addSource("suggest-annotation-source", {
                type: "geojson",
                data: geojson
            });

            // Build a green location-pin SVG and register it as a MapLibre image
            const addMarkerLayer = () => {
                if (!state.map.hasImage("suggest-pin-icon")) {
                    const primaryColor = getThemeAccent();
                    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
                        <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30S36 31.5 36 18C36 8.06 27.94 0 18 0z" fill="${primaryColor}"/>
                        <circle cx="18" cy="18" r="7" fill="${primaryColor}"/>
                    </svg>`;
                    const blob = new Blob([svg], { type: "image/svg+xml" });
                    const url = URL.createObjectURL(blob);
                    const img = new Image(36, 48);
                    img.onload = () => {
                        if (!state.map.hasImage("suggest-pin-icon")) {
                            state.map.addImage("suggest-pin-icon", img);
                        }
                        if (!state.map.getLayer("suggest-annotation-point-layer")) {
                            state.map.addLayer({
                                id: "suggest-annotation-point-layer",
                                type: "symbol",
                                source: "suggest-annotation-source",
                                filter: ["==", "$type", "Point"],
                                layout: {
                                    "icon-image": "suggest-pin-icon",
                                    "icon-size": 0.55,
                                    "icon-anchor": "bottom",
                                    "icon-allow-overlap": true
                                }
                            });
                        }
                        URL.revokeObjectURL(url);
                    };
                    img.src = url;
                } else {
                    state.map.addLayer({
                        id: "suggest-annotation-point-layer",
                        type: "symbol",
                        source: "suggest-annotation-source",
                        filter: ["==", "$type", "Point"],
                        layout: {
                            "icon-image": "suggest-pin-icon",
                            "icon-size": 0.55,
                            "icon-anchor": "bottom",
                            "icon-allow-overlap": true
                        }
                    });
                }
            };

            addMarkerLayer();
        }
    };

    if (state.map) {
        state.map.on("click", (e) => {
            if (!currentMode) return;
            const pt = [e.lngLat.lng, e.lngLat.lat];

            if (currentMode === "marker") {
                drawnCoords = [pt];
                updateAnnotationSource();
                window._preventSuggestClose = true;  // block modal-close on this same click
                setTimeout(() => { window._preventSuggestClose = false; }, 0);
                resetDrawingMode();
                markerPlaced = true;
                if (statusEl) {
                    statusEl.innerHTML = `<span class="suggest-status-badge">Marker: ${pt[1].toFixed(4)}°, ${pt[0].toFixed(4)}°</span>`;
                }
                setMarkerBtnToClear();

                if (suggestModal) {
                    suggestModal.setAttribute("aria-hidden", "false");
                    suggestModal.classList.add("is-open");
                    if (window.updateActionButtonsState) window.updateActionButtonsState();
                }
                showToast("Marker added to map!");
            }
        });
    }

    const startDrawing = (mode, btnEl, msg) => {
        if (!state.map) {
            showToast("Map is not available");
            return;
        }
        resetDrawingMode();
        currentMode = mode;
        drawnCoords = [];
        if (btnEl) btnEl.classList.add("is-active");
        if (state.map.getCanvas()) state.map.getCanvas().style.cursor = "crosshair";
        document.body.classList.add("is-annotation-mode");
        showToast(msg);
    };

    if (markerBtn) {
        markerBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (markerPlaced) {
                // Toggle to clear mode
                clearAnnotation();
            } else {
                startDrawing("marker", markerBtn, "Click anywhere on the map to place a marker!");
            }
        });
    }

    if (lineBtn) {
        lineBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showToast("Feature not available (coming soon)");
        });
    }

    if (polygonBtn) {
        polygonBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showToast("Feature not available (coming soon)");
        });
    }

    suggestForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const titleInput = document.getElementById("suggest-input-title");
        const msgInput = document.getElementById("suggest-input-message");

        const title = titleInput ? titleInput.value.trim() : "";
        const message = msgInput ? msgInput.value.trim() : "";

        if (!title || !message) {
            showToast("Please fill in all required fields.");
            return;
        }

        // Placeholder submit action
        showToast("Suggestion submitted! Thank you for your feedback.");

        // Reset form & clear annotation
        if (titleInput) titleInput.value = "";
        if (msgInput) msgInput.value = "";

        clearAnnotation(true); // silent — submit toast already shown

        // Close modal
        if (closeAllModals) closeAllModals();
    });
}


    function checkGitHubAuth() {
        // Check GitHub auth session state (placeholder for future GitHub OAuth integration)
        const isGitHubLoggedIn = Boolean(
            localStorage.getItem("github_token") ||
            sessionStorage.getItem("github_token") ||
            localStorage.getItem("gh_user")
        );
        const editBtn = document.getElementById("btn-edit-item");
        if (editBtn) {
            editBtn.style.display = isGitHubLoggedIn ? "" : "none";
        }
    }
    checkGitHubAuth();

    const editBtn = document.getElementById("btn-edit-item");
    if (editBtn) {
        editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            let target = state.currentId;
            if (target && target !== CIRCLE_ID) {
                target = normalizeZoneId(target);
            } else {
                target = CIRCLE_ID;
            }
            window.location.href = `/editor/?id=${encodeURIComponent(target)}`;
        });
    }

    const capsuleBackBtn = document.getElementById("btn-capsule-back");
    if (capsuleBackBtn) {
        capsuleBackBtn.addEventListener("click", (e) => {
            const list = document.getElementById("sidebar-zone-list");
            
            // On mobile, if we have the list container and aren't already animating, trigger the transition
            if (window.innerWidth <= 768 && list && !list.classList.contains("fly-out-right") && !list.classList.contains("fly-in-left-active")) {
                e.preventDefault();
                e.stopPropagation();
                
                list.classList.add("fly-out-right");
                
                setTimeout(() => {
                    executeBackNavigation();
                    
                    // Reset class and trigger fly-in from left
                    list.classList.remove("fly-out-right");
                    list.classList.add("fly-in-left-start");
                    list.offsetHeight; // Force reflow
                    list.classList.add("fly-in-left-active");
                    
                    setTimeout(() => {
                        list.classList.remove("fly-in-left-start", "fly-in-left-active");
                    }, 250);
                }, 200);
            } else {
                executeBackNavigation();
            }
        });
    }

    function executeBackNavigation() {
        if (!state.isCirclesFeature && (state.currentId === CIRCLE_ID || !state.currentId)) {
            switchToCirclesFeature();
        } else {
            selectSubject(CIRCLE_ID);
        }
    }

async function performDirectCopyLink() {
    const url = window.location.href;
    try {
        await navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard!");
    } catch (err) {
        const tempInput = document.createElement("input");
        tempInput.value = url;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showToast("Link copied to clipboard!");
    }
}



function setupCapsules() {
    const capsules = document.querySelectorAll(".sidebar-capsule");
    capsules.forEach(cap => {
        cap.addEventListener("click", (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const tab = cap.getAttribute("data-tab");
            if (tab === "tools") {
                showToast("Tools view is not available (coming soon)");
                return;
            }
            if (tab === "settings") {
                showToast("Settings view is not available (coming soon)");
                return;
            }
            capsules.forEach(c => c.classList.remove("is-active"));
            cap.classList.add("is-active");
            state.activeTab = tab || "items";
            renderSidebarList();
        });
    });
}

function updateBottomNavVisibilityForSnapState(snapState) {
    const bottomNavContainer = document.querySelector(".mobile-bottom-nav-container");
    if (bottomNavContainer) {
        if (snapState === "map-full") {
            bottomNavContainer.classList.add("is-hidden-entirely");
        } else {
            bottomNavContainer.classList.remove("is-hidden-entirely");
        }
    }
}

export function setMobileSnapState(snapState, animate = true) {
    const mapArea = document.querySelector(".maps-tile-map-area");
    const sidebar = document.querySelector(".maps-tile-sidebar");
    const resizeBar = document.getElementById("mobile-resize-bar");
    const headerEl = document.querySelector(".maps-tile-header");
    const sidebarHeaderEl = document.getElementById("sidebar-header");
    
    if (!mapArea || !sidebar || !resizeBar || !headerEl || !sidebarHeaderEl) return;

    updateBottomNavVisibilityForSnapState(snapState);

    state.snapState = snapState;

    if (animate) {
        mapArea.style.setProperty("transition", "height 0.32s cubic-bezier(0.16, 1, 0.3, 1)", "important");
        sidebar.style.setProperty("transition", "height 0.32s cubic-bezier(0.16, 1, 0.3, 1)", "important");
    } else {
        mapArea.style.setProperty("transition", "none", "important");
        sidebar.style.setProperty("transition", "none", "important");
    }

    if (snapState === "selection-full") {
        sidebar.classList.add("is-selection-full");
        document.body.classList.add("is-selection-full");
        const resizeBarHeight = resizeBar.offsetHeight || 18;
        mapArea.style.setProperty("height", "0px", "important");
        sidebar.style.setProperty("height", `calc(100% - ${resizeBarHeight}px)`, "important");
    } else if (snapState === "map-full") {
        sidebar.classList.remove("is-selection-full");
        document.body.classList.remove("is-selection-full");
        const headerHeight = headerEl.offsetHeight || 80;
        const subHeaderHeight = sidebarHeaderEl.offsetHeight || 50;
        const totalHeaderHeight = headerHeight + subHeaderHeight;
        const resizeBarHeight = resizeBar.offsetHeight || 18;
        
        sidebar.style.setProperty("height", `${totalHeaderHeight}px`, "important");
        mapArea.style.setProperty("height", `calc(100% - ${totalHeaderHeight + resizeBarHeight}px)`, "important");
    } else {
        sidebar.classList.remove("is-selection-full");
        document.body.classList.remove("is-selection-full");
        mapArea.style.setProperty("height", "calc(50% - 9px)", "important");
        sidebar.style.setProperty("height", "calc(50% - 9px)", "important");
    }

    setTimeout(() => {
        if (state.map) {
            state.map.resize();
        }
    }, animate ? 350 : 0);
}

function setupSwipeNavigation() {
    const headerEl = document.querySelector(".maps-tile-header");
    const sidebarHeaderEl = document.getElementById("sidebar-header");
    const scrollContainer = document.querySelector(".sidebar-capsules-scroll");
    
    const targets = [headerEl, sidebarHeaderEl].filter(Boolean);
    if (targets.length === 0) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isVerticalSwiping = false;

    const handleTouchStart = (e) => {
        if (window.innerWidth > 768) return;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        startTime = Date.now();
        isVerticalSwiping = false;
    };

    const handleTouchMove = (e) => {
        if (window.innerWidth > 768) return;
        if (!startX || !startY) return;
        
        const touch = e.touches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;

        if (!isVerticalSwiping && Math.abs(diffY) > 10 && Math.abs(diffY) > Math.abs(diffX) * 1.5) {
            isVerticalSwiping = true;
        }

        if (isVerticalSwiping) {
            if (e.cancelable) {
                e.preventDefault();
            }
        }
    };

    const handleTouchEnd = (e) => {
        if (window.innerWidth > 768) return;
        const touch = e.changedTouches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;
        const elapsedTime = Date.now() - startTime;

        startX = 0;
        startY = 0;

        // Vertical swipe to change snap states
        if (Math.abs(diffY) > 40 && Math.abs(diffY) > Math.abs(diffX) * 1.5 && elapsedTime < 300) {
            let currentState = state.snapState || "default";
            let newState = currentState;

            const mapArea = document.querySelector(".maps-tile-map-area");
            const main = document.querySelector(".maps-tile-main");

            if (diffY < 0) {
                // Swipe UP -> moves drawer UP (less map space)
                if (currentState === "map-full") {
                    newState = "default";
                } else if (currentState === "default") {
                    newState = "selection-full";
                } else if (currentState === "custom" && mapArea && main) {
                    const defaultHeight = (main.offsetHeight * 0.5) - 9;
                    if (mapArea.offsetHeight > defaultHeight + 10) {
                        newState = "default";
                    } else {
                        newState = "selection-full";
                    }
                }
            } else {
                // Swipe DOWN -> moves drawer DOWN (more map space)
                if (currentState === "selection-full") {
                    newState = "default";
                } else if (currentState === "default") {
                    newState = "map-full";
                } else if (currentState === "custom" && mapArea && main) {
                    const defaultHeight = (main.offsetHeight * 0.5) - 9;
                    if (mapArea.offsetHeight < defaultHeight - 10) {
                        newState = "default";
                    } else {
                        newState = "map-full";
                    }
                }
            }

            if (newState !== currentState) {
                setMobileSnapState(newState, true);
            }
            return;
        }

        // Horizontal swipe to change class tabs
        if (Math.abs(diffX) > 40 && Math.abs(diffY) < 40 && elapsedTime < 300) {
            const header = document.getElementById("sidebar-header");
            const isSearching = header && header.classList.contains("is-searching");

            if (!scrollContainer) return;
            const tabs = Array.from(scrollContainer.querySelectorAll(".sidebar-capsule"));
            if (tabs.length === 0) return;

            if (isSearching) {
                if (diffX > 0) {
                    // Swiped right -> escape search and go to the last class tab
                    const searchClose = document.getElementById("btn-search-close");
                    if (searchClose) {
                        searchClose.click();
                    }
                    const lastTab = tabs[tabs.length - 1];
                    if (lastTab) {
                        lastTab.click();
                        lastTab.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest",
                            inline: "center"
                        });
                    }
                }
                return;
            }

            if (tabs.length <= 1) return;
            const activeIndex = tabs.findIndex(tab => tab.classList.contains("is-active"));
            if (activeIndex === -1) return;

            let newIndex = activeIndex;
            if (diffX < 0) {
                // Swiped left (finger moves right to left) -> next tab
                newIndex = activeIndex + 1;
            } else {
                // Swiped right (finger moves left to right) -> previous tab
                newIndex = activeIndex - 1;
            }

            if (newIndex >= 0 && newIndex < tabs.length) {
                tabs[newIndex].click();
                tabs[newIndex].scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "center"
                });
            } else if (newIndex === tabs.length) {
                const searchToggle = document.getElementById("btn-search-toggle");
                if (searchToggle) {
                    searchToggle.click();
                }
            }
        }
    };

    targets.forEach(el => {
        el.addEventListener("touchstart", handleTouchStart, { passive: true });
        el.addEventListener("touchmove", handleTouchMove, { passive: false });
        el.addEventListener("touchend", handleTouchEnd, { passive: true });
    });
}

function setupListSwipeBack() {
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;

    let startX = 0;
    let startY = 0;
    let isTracking = false;
    let listWidth = 0;
    let indicatorTimer = null;

    listContainer.addEventListener("touchstart", (e) => {
        if (window.innerWidth > 768) return;
        
        const backBtn = document.getElementById("btn-capsule-back");
        if (!backBtn || !backBtn.classList.contains("is-visible")) {
            isTracking = false;
            return;
        }

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        listWidth = listContainer.offsetWidth;
        isTracking = false;
        
        if (indicatorTimer) {
            clearTimeout(indicatorTimer);
            indicatorTimer = null;
        }
        const indicator = document.getElementById("swipe-back-indicator");
        if (indicator) indicator.classList.remove("is-visible");
        
        listContainer.style.transition = "none";
    }, { passive: true });

    listContainer.addEventListener("touchmove", (e) => {
        if (window.innerWidth > 768) return;
        const touch = e.touches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;

        if (!isTracking) {
            const backBtn = document.getElementById("btn-capsule-back");
            const canGoBack = backBtn && backBtn.classList.contains("is-visible");
            
            if (canGoBack && diffX > 10 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
                isTracking = true;
            }
        }

        if (isTracking) {
            if (e.cancelable) {
                e.preventDefault();
            }
            const translateX = Math.max(0, diffX);
            const opacity = Math.max(0.3, 1 - (translateX / (listWidth || 300)));
            
            listContainer.style.transform = `translateX(${translateX}px)`;
            listContainer.style.opacity = opacity;

            // Show indicator only when dragged 1/4 (25%) of the list width AND held for 0.1s
            const threshold = Math.min(80, listWidth * 0.25);
            const indicator = document.getElementById("swipe-back-indicator");
            if (indicator) {
                if (translateX >= threshold) {
                    if (!indicatorTimer) {
                        indicatorTimer = setTimeout(() => {
                            if (isTracking) {
                                indicator.classList.add("is-visible");
                            }
                        }, 100);
                    }
                } else {
                    if (indicatorTimer) {
                        clearTimeout(indicatorTimer);
                        indicatorTimer = null;
                    }
                    indicator.classList.remove("is-visible");
                }
            }
        }
    }, { passive: false });

    listContainer.addEventListener("touchend", (e) => {
        if (window.innerWidth > 768) return;
        
        if (indicatorTimer) {
            clearTimeout(indicatorTimer);
            indicatorTimer = null;
        }
        const indicator = document.getElementById("swipe-back-indicator");
        if (indicator) indicator.classList.remove("is-visible");

        if (!isTracking) {
            const touch = e.changedTouches[0];
            const diffX = touch.clientX - startX;
            const diffY = touch.clientY - startY;
            // Swiping left (right-to-left) inside feature tiles area -> open search
            if (diffX < -50 && Math.abs(diffX) > Math.abs(diffY) * 1.4 && Math.abs(diffY) < 70) {
                const header = document.getElementById("sidebar-header");
                const isSearching = header && header.classList.contains("is-searching");
                if (!isSearching) {
                    const searchToggle = document.getElementById("btn-search-toggle");
                    if (searchToggle) {
                        searchToggle.click();
                    }
                }
            }
            return;
        }
        isTracking = false;
        
        const touch = e.changedTouches[0];
        const diffX = touch.clientX - startX;
        const threshold = Math.min(80, listWidth * 0.25);

        if (diffX > threshold) {
            // Commit navigation
            listContainer.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
            listContainer.style.transform = "translateX(100%)";
            listContainer.style.opacity = "0";

            setTimeout(() => {
                const backBtn = document.getElementById("btn-capsule-back");
                if (backBtn) {
                    state.isSwipeTransitionActive = true;
                    backBtn.click();
                    state.isSwipeTransitionActive = false;
                }

                // Animate the new content from the left
                listContainer.style.transition = "none";
                listContainer.style.transform = "translateX(-100%)";
                listContainer.style.opacity = "0";

                listContainer.offsetHeight; // force reflow

                listContainer.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
                listContainer.style.transform = "translateX(0)";
                listContainer.style.opacity = "1";

                setTimeout(() => {
                    listContainer.style.transition = "";
                    listContainer.style.transform = "";
                    listContainer.style.opacity = "";
                }, 250);
            }, 200);
        } else {
            // Cancel and bounce back
            listContainer.style.transition = "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)";
            listContainer.style.transform = "translateX(0)";
            listContainer.style.opacity = "1";

            setTimeout(() => {
                listContainer.style.transition = "";
                listContainer.style.transform = "";
                listContainer.style.opacity = "";
            }, 200);
        }
    }, { passive: true });
}

function openImageLightbox(src, alt = "Enlarged view", text = "") {
    const modal = document.getElementById("image-lightbox-modal");
    const img = document.getElementById("lightbox-img");
    const textEl = document.getElementById("lightbox-text");
    if (modal && img) {
        img.src = src;
        img.alt = alt;
        if (textEl) {
            textEl.textContent = text;
            textEl.style.display = text ? "block" : "none";
        }
        modal.setAttribute("aria-hidden", "false");
        modal.classList.add("is-open");
    }
}


function setupMobileResizeBar() {
    const resizeBar = document.getElementById("mobile-resize-bar");
    const mapArea = document.querySelector(".maps-tile-map-area");
    const sidebar = document.querySelector(".maps-tile-sidebar");
    const main = document.querySelector(".maps-tile-main");

    if (!resizeBar || !mapArea || !sidebar || !main) return;

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialMapHeight = 0;
    let initialSidebarHeight = 0;
    let isVerticalDragApproved = false;

    const startDrag = (e) => {
        if (window.innerWidth > 768) return;
        
        // Prevent drag initialization when clicking actual buttons or tabs
        if (e.target.closest('.action-btn') || e.target.closest('.sidebar-capsule')) {
            return;
        }

        isDragging = true;
        const touch = e.touches ? e.touches[0] : e;
        dragStartX = touch.clientX;
        dragStartY = touch.clientY;
        
        initialMapHeight = mapArea.offsetHeight;
        initialSidebarHeight = sidebar.offsetHeight;
        
        // If they touched the resize bar directly, vertical drag is approved immediately.
        // Otherwise (selection title or tabs), we wait for a gesture direction threshold.
        const isResizeBar = e.currentTarget === resizeBar;
        isVerticalDragApproved = isResizeBar;

        document.body.style.userSelect = "none";
        document.body.style.cursor = "ns-resize";
        mapArea.style.setProperty("transition", "none", "important");
        sidebar.style.setProperty("transition", "none", "important");
    };

    const doDrag = (e) => {
        if (!isDragging || window.innerWidth > 768) return;

        const touch = e.touches ? e.touches[0] : e;
        const clientX = touch.clientX;
        const clientY = touch.clientY;

        const deltaX = clientX - dragStartX;
        const deltaY = clientY - dragStartY;

        // If not yet approved, check threshold
        if (!isVerticalDragApproved) {
            if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX) * 1.3) {
                isVerticalDragApproved = true;
                // Reset dragStartY to current touch point to avoid a jump
                dragStartY = clientY;
                return;
            }
            if (Math.abs(deltaX) > 8) {
                // If it is a clear horizontal gesture, cancel vertical dragging to let horizontal scroll work
                isDragging = false;
                return;
            }
            return;
        }

        // Prevent browser scrolling while dragging vertical drawer
        if (e.cancelable) {
            e.preventDefault();
        }

        const headerEl = document.querySelector(".maps-tile-header");
        const sidebarHeaderEl = document.getElementById("sidebar-header");
        if (!headerEl || !sidebarHeaderEl) return;

        const mainRect = main.getBoundingClientRect();

        // Calculate new map height relative to dragStartY
        const currentDeltaY = clientY - dragStartY;
        const targetMapHeight = initialMapHeight + currentDeltaY;
        
        const headerHeight = headerEl.offsetHeight || 80;
        const subHeaderHeight = sidebarHeaderEl.offsetHeight || 50;
        const totalHeaderHeight = headerHeight + subHeaderHeight;
        const resizeBarHeight = resizeBar.offsetHeight || 18;

        const maxMapHeight = mainRect.height - totalHeaderHeight - resizeBarHeight;
        const clampedMapHeight = Math.max(0, Math.min(maxMapHeight, targetMapHeight));

        let mapPercentage = (clampedMapHeight / mainRect.height) * 100;
        let sidebarPercentage = ((mainRect.height - clampedMapHeight - resizeBarHeight) / mainRect.height) * 100;

        if (mapPercentage < 5) {
            mapArea.style.setProperty("height", "0px", "important");
            sidebar.style.setProperty("height", `calc(100% - ${resizeBarHeight}px)`, "important");
            sidebar.classList.add("is-selection-full");
            document.body.classList.add("is-selection-full");
            state.snapState = "selection-full";
        } else if (clampedMapHeight >= maxMapHeight - 15) {
            sidebar.style.setProperty("height", `${totalHeaderHeight}px`, "important");
            mapArea.style.setProperty("height", `calc(100% - ${totalHeaderHeight + resizeBarHeight}px)`, "important");
            sidebar.classList.remove("is-selection-full");
            document.body.classList.remove("is-selection-full");
            state.snapState = "map-full";
        } else {
            mapArea.style.setProperty("height", `${mapPercentage.toFixed(2)}%`, "important");
            sidebar.style.setProperty("height", `${sidebarPercentage.toFixed(2)}%`, "important");
            sidebar.classList.remove("is-selection-full");
            document.body.classList.remove("is-selection-full");
            state.snapState = "custom";
        }

        // Live update bottom nav bar visibility during vertical drag
        updateBottomNavVisibilityForSnapState(state.snapState);

        if (state.map) {
            state.map.resize();
        }
    };

    const stopDrag = () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
            mapArea.style.removeProperty("transition");
            sidebar.style.removeProperty("transition");
            if (state.map) {
                state.map.resize();
            }
        }
    };

    // Attach startDrag to all mobile resize triggers
    const headerEl = document.querySelector(".maps-tile-header");
    const sidebarHeaderEl = document.getElementById("sidebar-header");

    const triggers = [resizeBar, headerEl, sidebarHeaderEl].filter(Boolean);
    triggers.forEach(el => {
        el.addEventListener("mousedown", startDrag);
        el.addEventListener("touchstart", startDrag, { passive: true });
    });

    window.addEventListener("mousemove", doDrag);
    window.addEventListener("touchmove", doDrag, { passive: false });

    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchend", stopDrag);

    // On mobile, default to 50/50 split view instead of large-map view
    if (window.innerWidth <= 768) {
        setMobileSnapState("default", false);
    }
}


async function init() {
    const triggerEntrance = () => {
        document.body.classList.remove("is-transitioning");
        const overlay = document.getElementById("page-transition-overlay");
        if (overlay) overlay.classList.remove("is-active");

        // Wait 500ms for nav tabs to finish sliding up (map frame reaches full height),
        // then fade out the map placeholder.
        setTimeout(() => {
            const placeholder = document.getElementById("map-loading-placeholder");
            if (placeholder) {
                placeholder.classList.add("is-faded");
                setTimeout(() => {
                    placeholder.style.display = "none";
                }, 500);
            }

            // Once the map container reaches full height, resize the map and refit bounds
            // without any animation so the zoom level matches exactly.
            if (state.map) {
                state.map.resize();
                selectSubject(state.currentId, true, false);
            }
        }, 500);
    };

    try {
        const initialId = await loadBirdData();

        renderSidebarList();
        initializeMap();
        setupActionButtons();
        setupSearch();
        setupCapsules();
        setupSwipeNavigation();
        setupListSwipeBack();
        setupImageLightbox();
        setupMobileResizeBar();
        setupHelpModeSystem();
        setupSidebarScrollListener();
        setupMobileBottomNav();
        setupViewToggleMenu();

        selectSubject(initialId, true, false);

        if (initialId === "Oakridge" || initialId === "Cottage Grove") {
            setTimeout(() => {
                showToast("There is no data for this count circle");
            }, 800);
        }

        if (state.map) {
            state.map.once("load", () => {
                setTimeout(triggerEntrance, 150);
            });
            // Safety timeout fallback
            setTimeout(triggerEntrance, 1000);
        } else {
            triggerEntrance();
        }
    } catch (err) {
        console.error("Error initializing maps tile page:", err);
        updateHeader("Error loading map data");
        triggerEntrance();
    }
}

function setupSidebarScrollListener() {
    const scrollBox = document.getElementById("sidebar-zone-list");
    const header = document.getElementById("sidebar-header");
    const sidebar = document.querySelector(".maps-tile-sidebar");

    if (!scrollBox || !header || !sidebar) return;

    // On mobile the sidebar itself is the scroll container (unified layout).
    // On desktop the scrollBox (zone list) is the scroll container.
    const isMobile = () => window.innerWidth <= 768;
    const getScrollTarget = () => isMobile() ? sidebar : scrollBox;

    const bottomNav = document.querySelector(".mobile-bottom-nav");

    const onScroll = (e) => {
        const target = e.currentTarget;
        const scrollTop = target.scrollTop;
        const scrolled = scrollTop > 4;

        header.classList.toggle("is-scrolled", scrolled);
        sidebar.classList.toggle("is-scrolled", scrolled);
        // body class lets the resize bar ::after gradient fire (sibling of sidebar)
        document.body.classList.toggle("sidebar-is-scrolled", scrolled);

        // Hide mobile bottom nav when scrolling down, show only when back at the top
        if (isMobile() && bottomNav) {
            if (scrollTop > 12) {
                bottomNav.classList.add("is-hidden");
            } else {
                bottomNav.classList.remove("is-hidden");
            }
        }
    };

    // Attach to both — only one will actually be scrolling at a time
    sidebar.addEventListener("scroll", onScroll, { passive: true });
    scrollBox.addEventListener("scroll", onScroll, { passive: true });
}



function setupViewToggleMenu() {
    const toggleBtn = document.getElementById("header-view-toggle");
    const menuEl = document.getElementById("header-view-menu");
    const labelEl = document.getElementById("header-view-toggle-label");
    const iconWrapEl = document.getElementById("header-view-toggle-icon");
    if (!toggleBtn || !menuEl) return;

    let isOpen = false;

    function openMenu() {
        isOpen = true;
        menuEl.setAttribute("aria-hidden", "false");
        toggleBtn.setAttribute("aria-expanded", "true");
    }

    function closeMenu() {
        isOpen = false;
        menuEl.setAttribute("aria-hidden", "true");
        toggleBtn.setAttribute("aria-expanded", "false");
    }

    toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    const items = menuEl.querySelectorAll(".header-view-menu__item");
    items.forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            const val = item.dataset.value;
            
            // Update active state inside popup
            items.forEach(i => {
                const isActive = i.dataset.value === val;
                i.classList.toggle("is-active", isActive);
                const checkSvg = i.querySelector(".header-view-menu__check");
                if (checkSvg) checkSvg.style.display = isActive ? "block" : "none";
            });

            // Update toggle button icon
            if (iconWrapEl) {
                const itemIcon = item.querySelector(".header-view-menu__icon");
                if (itemIcon) {
                    iconWrapEl.innerHTML = itemIcon.outerHTML;
                    const clonedSvg = iconWrapEl.querySelector("svg");
                    if (clonedSvg) {
                        clonedSvg.setAttribute("width", "12");
                        clonedSvg.setAttribute("height", "12");
                    }
                }
            }

            // Update toggle label text
            if (labelEl) {
                const labelMap = {
                    auto: "Auto",
                    map: "Map",
                    graph: "Graph",
                    table: "Table",
                    image: "Image",
                    people: "People",
                    network: "Network"
                };
                labelEl.textContent = labelMap[val] || (val.charAt(0).toUpperCase() + val.slice(1));
            }

            // Close popup
            closeMenu();
        });
    });

    // Close on click outside
    document.addEventListener("click", (e) => {
        if (isOpen && !toggleBtn.contains(e.target) && !menuEl.contains(e.target)) {
            closeMenu();
        }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (isOpen && e.key === "Escape") {
            closeMenu();
        }
    });
}

document.addEventListener("DOMContentLoaded", init);

// Desktop & mobile back home transition listener
(function () {
    const bars = [
        document.getElementById("desktop-nav-tab-home"),
        document.getElementById("mobile-nav-tab-home")
    ].filter(Boolean);
    const overlay = document.getElementById("page-transition-overlay");
    if (bars.length === 0 || !overlay) return;

    bars.forEach(bar => {
        bar.addEventListener("click", function (e) {
            e.preventDefault();
            const dest = bar.getAttribute("href") || "../";

            // Step 1: Simultaneously trigger grey bar pull down and whole screen fade to black
            document.body.classList.add("is-transitioning");
            overlay.classList.add("is-active");

            // Step 2: Navigate after the combined 500ms transitions finish
            setTimeout(function () {
                window.location.href = dest;
            }, 500);
        });
    });

    // Reset page states if user navigates back using browser Back button (bfcache reset)
    window.addEventListener("pageshow", function (event) {
        if (event.persisted) {
            document.body.classList.remove("is-transitioning");
            overlay.classList.remove("is-active");
        }
    });
})();


