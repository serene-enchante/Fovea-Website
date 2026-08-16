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
import { updateAllFeatureStyles, rebuildHtmlLabels, setupMapLayers, selectMapStyleByIndex , updateLabelZoomVisibility } from './map/map-layers.js';

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
import { setupSuggestFormAndDrawing } from './components/feedback-form.js';
import { openImageLightbox } from './components/image-lightbox.js';
import {
    renderSidebarList,
    updateKeyboardTileFocus,
    highlightTileItem,
    unhighlightTileItem,
    setupSidebarScrollListener
} from './components/sidebar-list.js';

export {
    renderSidebarList,
    updateKeyboardTileFocus,
    highlightTileItem,
    unhighlightTileItem,
    setupSidebarScrollListener
};
import {
    updateControlPositions,
    updateBottomNavVisibilityForSnapState,
    setMobileSnapState,
    setupSwipeNavigation,
    setupListSwipeBack,
    setupMobileResizeBar
} from './components/mobile-view.js';

export {
    updateControlPositions,
    updateBottomNavVisibilityForSnapState,
    setMobileSnapState,
    setupSwipeNavigation,
    setupListSwipeBack,
    setupMobileResizeBar
};
import { setupMapHoverEvents } from './map/map-events.js';
import { setupProximityTracking, setupProximityGlowCanvas } from './map/map-proximity.js';
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


