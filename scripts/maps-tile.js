import { CIRCLE_ID } from './config/app-config.js';
import { loadGeoDataset } from './services/geo-data-repository.js';
import { fetchBirdObservations, fetchTaxonDefaultPhoto } from './services/observations-client.js';
import { getInitialIdFromUrl, getSelectedGeoJSONData } from './services/bird-data-service.js';
import { handleSpatialFileShare as shareSpatialFile } from './services/file-download-service.js';
import { launchAppWithStoreFallback } from './services/app-launch-service.js';
import { canvasToTiffBlob, geojsonToGpx, geojsonToKml } from './services/format-converters.js';
import { findPointInsidePolygon, getBbox, isPointInGeoJSONGeometry } from './utils/geometry-math.js';
import { displayZoneId, formatArea, formatDate, normalizeZoneId, zoneImagePath } from './utils/format-utils.js';
import {
    checkUserLocationZone as updateLocationZone,
    createMapInstance,
    switchBaseMap as applyBaseMap,
    toggleLocationTracking as trackUserLocation
} from './map/map-init.js';
import { setupMapLayers, addZoneFeatureLayers, buildZoneFeatureData, selectMapStyleByIndex, updateAllFeatureStyles as updateMapFeatureStyles, updateLabelZoomVisibility, rebuildHtmlLabels as rebuildMapHtmlLabels } from './map/map-layers.js';
import { setupMapCanvasEvents, setupMapHoverEvents } from './map/map-events.js';
import { setupProximityGlowCanvas, setupProximityTracking } from './map/map-proximity.js';
import { setupMapEffectsAndFullscreen } from './map/map-viewport.js';
import {
    cancelDownloadViewPreload,
    disposeRasterCache,
    getFeatureCenter,
    getOrRenderLayoutCanvas,
    hasCachedLayoutCanvas,
    scheduleDownloadViewPreload
} from './map/map-rendering.js';
import { setupSearch } from './map/map-search.js';
import { adjustHeaderFontSize, getFitPadding, updateHeader } from './components/header-view.js';
import { syncSidebarTabs } from './components/sidebar-tabs.js';
import { activateSidebarTab, setupSidebarCapsuleEvents } from './components/sidebar-capsule-events.js';
import { getSuggestSelectionLabel, setupSuggestFormAndDrawing } from './components/feedback-form.js';
import { setupSidebarScrollListener, updateKeyboardTileFocus } from './components/sidebar-list.js';
import { openImageLightbox, setupImageLightbox } from './components/image-lightbox.js';
import { renderBirdObservationsList, renderSidebarBirdPanel as renderBirdSidebarPanel } from './components/bird-observation-view.js';
import { renderBirdSpeciesList } from './components/bird-species-list.js';
import { renderOrganizersList, renderResourcesList } from './components/sidebar-static-views.js';
import { renderMapFeatureList } from './components/map-feature-list.js';
import { renderSidebarOverview } from './components/sidebar-overview-view.js';
import { createSidebarController } from './components/sidebar-controller.js';
import { clearBirdObservations, createBirdSelectionController } from './map/bird-selection-controller.js';
import { setupBirdObservationsLayer, updateBirdObservationsLayerStyles } from './map/bird-observation-layers.js';
import { setupHelpModeSystem } from './components/map-modals.js';
import { setupMobileBottomNav } from './components/bottom-nav-view.js';
import { showToast } from './components/toast-view.js';
import { setupActionButtons as setupToolbarActionButtons, setupViewToggleMenu, updateAllAppsModalHeaderTitle, updateShareModalDescription, toggleFullscreen, getActiveDownloadFilename, generateAppSpatialBlob } from './components/toolbar-actions.js';
import { closeAvenzaModal, closeAllAppsModal, closeAllModals as closeModalsView } from './components/modal-view.js';
import { handleAppDirectOpen } from './components/avenza-modal-view.js';
import { setMobileSnapState, setupListSwipeBack, setupMobileResizeBar, setupSwipeNavigation, updateControlPositions } from './components/mobile-view.js';
import { createFeatureTransitionController, selectSubject as selectMapSubject } from './map/map-selection.js';
import { state } from './state.js';

const FALLBACK_IMAGE = "../images/wetlands.jpg";

// MapLibre prototype polyfill for Leaflet legacy compatibility
if (typeof maplibregl !== 'undefined' && maplibregl.Map) {
    maplibregl.Map.prototype.invalidateSize = function() {
        this.resize();
    };
}

function updateAllFeatureStyles() {
    updateMapFeatureStyles({ updateAdditionalLayers: updateBirdObservationsLayerStyles });
}

Object.assign(state, {
    allFeatures: [],
    circlesFeatures: [],
    eugeneFeatures: [],
    florenceFeatures: [],
    currentFeature: "circles", // "circles", "eugene", "florence"
    isCirclesFeature: true,
    currentId: CIRCLE_ID,
    activeTab: "overview",
    isSwipeTransitionActive: false,
    map: null,
    geoJsonLayer: null,
    featureLayersMap: new Map(), // maps zoneId/cid -> leaflet layer
    lastZoneClickTime: 0,
    userLocationMarker: null,
    userLocationAccuracy: null,
    isLocating: false,
    locateControl: null,
    fullscreenControl: null,
    layersControl: null,
    focusedTileIndex: -1,
    lastNavSource: "click",
    baseMapsList: [],
    currentBaseLayer: "default",
    snapState: "default"
});





// --- Client-Side Exporter Helpers (GeoJSON, KMZ, GPX) ---


function handleSpatialFileShare(event, fileOrBlob, fileName, triggerButton = null) {
  return shareSpatialFile(
    event,
    fileOrBlob,
    fileName,
    triggerButton,
    (message, isError) => showToast(message, isError),
    { compatibilityProfile: 'legacy-map' }
  );
}

/**
 * Dynamically updates the Avenza modal title to match selection type (Zones vs Circles).
 */


/**
 * Returns count circle thumbnail/logo for the current selection (matching top-left header logo).
 */


/**
 * Opens the blackout instruction modal dynamically configured for any app (Avenza, Gaia GPS, CalTopo, OsmAnd).
 */



function switchBaseMap(baseMapId) {
    return applyBaseMap(baseMapId, { state, updateStyles: updateAllFeatureStyles });
}

// ──────────────────────────────────────────────────────────────
// Headless offscreen MapLibre renderer for PDF / TIFF exports
// No dependency on the on-screen map DOM or state.map
// ──────────────────────────────────────────────────────────────


/**
 * Fast & exact Pole of Inaccessibility (Polylabel) algorithm.
 * Finds the most distant internal point from the polygon outline (maximum clearance from all borders).
 * Guaranteed to place labels in the widest, most spacious part of any polygon (even concave/complex).
 */


/**
 * Helper to compute the most spacious interior point for a GeoJSON feature (maximum border clearance).
 */


/**
 * Create a headless offscreen MapLibre GL instance, render Esri Topo tiles
 * with optional zone polygon overlays, and return a standalone canvas copy + zone label positions.
 */


/**
 * Render a full cartographic print layout canvas using a headless offscreen MapLibre instance.
 * Completely independent of the on-screen map.
 * @returns {Promise<HTMLCanvasElement>} The final 4000×3000 layout canvas
 */


async function downloadGeoPdf(triggerButton = null) {
    const isReady = hasCachedLayoutCanvas();
    if (!isReady) {
        showToast("Rendering map layout...");
    }

    const canvas = await getOrRenderLayoutCanvas();
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

async function downloadGeoTiff(triggerButton = null) {
    const isReady = hasCachedLayoutCanvas();
    if (!isReady) {
        showToast("Rendering map layout...");
    }

    const canvas = await getOrRenderLayoutCanvas();
    const filename = getActiveDownloadFilename("tif");
    const tiffBlob = canvasToTiffBlob(canvas);
    await handleSpatialFileShare(null, tiffBlob, filename, triggerButton);
    showToast(`Exported ${filename}`);
}

async function loadFeaturesForMapView(featureName) {
    const datasetId = featureName === 'florence' ? 'florence'
        : featureName === 'eugene' ? 'eugene'
            : 'circles';
    const dataset = await loadGeoDataset(datasetId);
    const features = dataset.features;

    if (datasetId === 'circles') {
        state.circlesFeatures = features;
    } else if (datasetId === 'florence') {
        state.florenceFeatures = features;
    } else {
        state.eugeneFeatures = features;
    }

    return features;
}

const featureTransitionController = createFeatureTransitionController({
    state,
    loadFeatures: loadFeaturesForMapView,
    rebuildFeatures: rebuildGeoJsonLayer,
    selectSubject,
    disposeRasterCache,
    getFitPadding,
    showToast,
    isSuggestLocked: () => document.body.classList.contains('is-suggest-locked')
});
const { switchToFeature, switchToCirclesFeature } = featureTransitionController;

function selectSubject(id, triggerMapZoom = true, animate = true) {
    return selectMapSubject(id, triggerMapZoom, animate, {
        updateHeader,
        renderSidebarList,
        updateAllFeatureStyles,
        disposeRasterCache,
        scheduleSelectionPreload: scheduleDownloadViewPreload,
        clearBirdObservations
    });
}

let selectBirdHandler;
const selectBird = (...args) => selectBirdHandler(...args);
const sidebarController = createSidebarController({
    state,
    documentObject: document,
    syncTabs: syncSidebarTabs,
    renderBirdObservations: renderBirdObservationsList,
    renderBirdPanel: renderBirdSidebarPanel,
    renderBirdSpecies: renderBirdSpeciesList,
    renderOrganizers: renderOrganizersList,
    renderResources: renderResourcesList,
    renderOverview: renderSidebarOverview,
    renderMapFeatureList,
    onSelectBird: birdName => selectBird(birdName),
    onSelectCircle: (cid, feature = null) => {
        const circle = feature || state.circlesFeatures.find(item => item.properties?.cid === cid);
        const bbox = circle ? getBbox(circle) : null;
        if (cid === "Eugene") switchToFeature("eugene", bbox);
        else if (cid === "Florence") switchToFeature("florence", bbox);
        else if (cid === "Oakridge" || cid === "Cottage Grove") showToast("There is no data for this count circle");
    },
    onSelectZone: id => selectSubject(id),
    onActivateTab: tab => activateSidebarTab(tab, { state, documentObject: document, onRender: renderSidebarList }),
    onFeatureHover: (id, hover) => {
        if (state.map?.getSource('zones')) state.map.setFeatureState({ source: 'zones', id }, { hover });
    },
    onOpenImageLightbox: openImageLightbox,
    onUpdateKeyboardFocus: updateKeyboardTileFocus
});
const { renderSidebarList } = sidebarController;

selectBirdHandler = createBirdSelectionController({
    state,
    fetchObservations: fetchBirdObservations,
    fetchDefaultPhoto: fetchTaxonDefaultPhoto,
    getBbox,
    updateHeader,
    renderSidebarList,
    updateSidebarBirdPanel: sidebarController.updateBirdPanel,
    setupObservationsLayer: setupBirdObservationsLayer
}).selectBird;

// Cursor proximity glow: set feature-state 'proximity' (0–1) based on
// screen-space distance from cursor to each zone center point
// Canvas overlay: draws zone outlines bright, masked by radial gradient at cursor.
// This gives true per-segment glow — only the line pixels within the gradient radius
// are revealed, rather than MapLibre's per-feature opacity which affects whole zones.


// HTML label overlay — repositions div labels on every map render


function rebuildGeoJsonLayer() {
    if (!state.map) return;
    const { geojsonData, labelData } = buildZoneFeatureData(state.allFeatures, state.isCirclesFeature);
    state.labelData = labelData;

    if (state.map.getSource('zones')) {
        state.map.getSource('zones').setData(geojsonData);
        updateLabelZoomVisibility();
        updateAllFeatureStyles();
    } else {
        addZoneFeatureLayers(state.map, geojsonData);

        // Register map move/zoom listeners for HTML label repositioning (once)
        if (!state._labelListenersAttached) {
            state._labelListenersAttached = true;
            state.map.on('move', rebuildMapHtmlLabels);
            state.map.on('zoom', rebuildMapHtmlLabels);
            state.map.on('render', rebuildMapHtmlLabels);
        }
        setupProximityTracking();
        setupProximityGlowCanvas();
        updateLabelZoomVisibility();
        updateAllFeatureStyles();
        
        setupMapHoverEvents({
            map: state.map,
            state,
            onFeatureClick: ({ feature, featureId }) => {
                const props = feature.properties || {};
                if (state.isCirclesFeature) {
                    if (props.cid === "Eugene") {
                        switchToFeature("eugene", getBbox([feature]));
                    } else if (props.cid === "Florence") {
                        switchToFeature("florence", getBbox([feature]));
                    } else if (props.cid === "Oakridge" || props.cid === "Cottage Grove") {
                        showToast("There is no data for this count circle");
                    }
                } else if (state.currentId === featureId) {
                    selectSubject(CIRCLE_ID);
                } else {
                    selectSubject(featureId, true);
                }
            }
        });
    }

    if (state.isLocating && state.userLocationMarker) {
        updateLocationZone(state.userLocationMarker.getLngLat());
    }

    updateAllFeatureStyles();
}

function initializeMap() {
    const mapContainer = document.getElementById("tile-map");
    const mapWrapper = document.getElementById("map-wrapper");
    if (!mapContainer) return;

    const isLightMode = document.body.classList.contains("theme-light") || state.currentBaseLayer === "esri-street" || (document.documentElement.getAttribute("data-theme") === "light");
    const defaultVectorStyle = isLightMode
        ? "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

    state.map = createMapInstance(maplibregl, {
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
        style: defaultVectorStyle,
        center: [-123.11, 44.05],
        zoom: 11,
        attributionControl: false
    });

    // Set initial background color
    const initialTileMapEl = document.getElementById("tile-map");
    if (initialTileMapEl) {
        const bg = isLightMode ? "#f8f9fa" : "#000000";
        initialTileMapEl.style.setProperty("background-color", bg, "important");
        initialTileMapEl.style.setProperty("background", bg, "important");
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
        { id: "default", name: "Default", layerId: "base-dark-vector" },
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
        trackUserLocation(state);
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
            <div class="modal-title-wrapper">
                <span class="modal-title">Map Elements</span>
                <button type="button" class="modal-close-btn" aria-label="Close Map Elements">
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
                { id: "default", name: "Default", thumbnailClass: "default-map-thumbnail", layerId: "base-dark-vector" },
                { id: "satellite", name: "Satellite Map", thumbnailClass: "satellite-thumbnail", layerId: "base-satellite" },
                { id: "esri-street", name: "Street Map", thumbnailClass: "esri-street-thumbnail", layerId: "base-esri-street" },
                { id: "esri-topo", name: "Topo Map", thumbnailClass: "esri-topo-thumbnail", layerId: "base-esri-topo" }
            ];

            const filtered = basemaps.filter(b => b.name.toLowerCase().includes(query));
            if (filtered.length === 0) {
                bodyEl.innerHTML = `<div class="modal-no-results">No basemaps found</div>`;
            } else {
                filtered.forEach(b => {
                    const isSelected = state.currentBaseLayer === b.id || (b.id === 'default' && (!state.currentBaseLayer || state.currentBaseLayer === 'dark'));
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

    setupMapCanvasEvents({
        map: state.map,
        state,
        onSelectCircles: () => selectSubject(CIRCLE_ID),
        onSwitchToCircles: switchToCirclesFeature,
        onLoad: rebuildGeoJsonLayer
    });

    setupMapEffectsAndFullscreen(mapWrapper, {
        state,
        updateControlPositions,
        adjustHeaderFontSize,
        updateLabelZoomVisibility
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
        if (state.selectedBird) {
            clearBirdObservations();
            selectSubject(state.currentId, true, true);
            return;
        }

        if (!state.isCirclesFeature && (state.currentId === CIRCLE_ID || !state.currentId)) {
            switchToCirclesFeature();
        } else {
            selectSubject(CIRCLE_ID);
        }
    }


async function init() {
    const triggerEntrance = () => {
        document.body.classList.remove("is-transitioning");

        if (state.map) {
            state.map.resize();
            selectSubject(state.currentId, true, false);
        }

        // Fade from white screen overlay once elements are loaded behind the scenes
        const overlay = document.getElementById("page-transition-overlay");
        if (overlay) {
            overlay.classList.add("is-loaded");
            overlay.classList.remove("is-active");
        }
    };

    try {
        const storedTheme = localStorage.getItem("fovea-theme") || "dark";
        const isSystemLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
        const isLight = storedTheme === "light" || (storedTheme === "auto" && isSystemLight);

        if (isLight) {
            document.documentElement.setAttribute("data-theme", "light");
            document.documentElement.classList.add("theme-light");
            document.body.classList.add("theme-light");
            state.currentBaseLayer = "default";
        } else {
            document.documentElement.setAttribute("data-theme", "dark");
            document.documentElement.classList.remove("theme-light");
            document.body.classList.remove("theme-light");
            state.currentBaseLayer = "default";
        }

        const initialId = getInitialIdFromUrl();
        const initialFeature = state.isCirclesFeature ? 'circles' : state.currentFeature;
        state.allFeatures = await loadFeaturesForMapView(initialFeature);

        renderSidebarList();
        initializeMap();
        setupToolbarActionButtons({
            shareFile: handleSpatialFileShare,
            notify: showToast,
            downloadPdf: button => downloadGeoPdf(button),
            downloadTiff: button => downloadGeoTiff(button),
            closeModals: () => closeModalsView({ onBeforeClose: cancelDownloadViewPreload })
        });
        setupSearch();
        setupSidebarCapsuleEvents({
            state,
            documentObject: document,
            onRender: renderSidebarList,
            notify: showToast
        });
        setupSwipeNavigation();
        setupListSwipeBack();
        setupImageLightbox();
        setupMobileResizeBar();
        setupHelpModeSystem({ renderSidebarList });
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
            if (state.map.loaded && state.map.loaded()) {
                setTimeout(triggerEntrance, 80);
            } else {
                state.map.once("load", () => {
                    setTimeout(triggerEntrance, 80);
                });
                state.map.once("idle", () => {
                    setTimeout(triggerEntrance, 80);
                });
                // Reliable safety timeout fallback
                setTimeout(triggerEntrance, 400);
            }
        } else {
            triggerEntrance();
        }
    } catch (err) {
        console.error("Error initializing maps tile page:", err);
        updateHeader("Error loading map data");
        triggerEntrance();
    }
}



if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

// Desktop & mobile back home transition listener
(function () {
    const bars = [
        document.getElementById("desktop-nav-tab-home"),
        document.getElementById("mobile-nav-tab-home"),
        document.querySelector(".header-logo-container a")
    ].filter(Boolean);
    const overlay = document.getElementById("page-transition-overlay");
    if (bars.length === 0) return;

    bars.forEach(bar => {
        bar.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            const dest = bar.getAttribute("href") || "../";
            if (window.transitionToPage) {
                window.transitionToPage(dest);
            } else if (overlay) {
                overlay.classList.remove("is-loaded");
                overlay.classList.add("is-active");
                setTimeout(function () {
                    window.location.href = dest;
                }, 500);
            } else {
                window.location.href = dest;
            }
        });
    });

    // Reset page states if user navigates back using browser Back button (bfcache reset)
    window.addEventListener("pageshow", function (event) {
        if (event.persisted) {
            document.body.classList.remove("is-transitioning");
            if (overlay) {
                overlay.classList.add("is-loaded");
                overlay.classList.remove("is-active");
            }
        }
    });
})();
