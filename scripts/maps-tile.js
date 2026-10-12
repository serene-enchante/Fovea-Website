import { CIRCLE_ID } from './config/app-config.js';
import { loadGeoDataset } from './services/geo-data-repository.js';
import { fetchBirdObservations, fetchTaxonDefaultPhoto } from './services/observations-client.js';
import { getInitialIdFromUrl, getSelectedGeoJSONData } from './services/bird-data-service.js';
import { handleSpatialFileShare as shareSpatialFile } from './services/file-download-service.js';
import { launchAppWithStoreFallback } from './services/app-launch-service.js';
import { canvasToTiffBlob, geojsonToGpx, geojsonToKml } from './services/format-converters.js';
import { findPointInsidePolygon, getBbox, isPointInGeoJSONGeometry } from './utils/geometry-math.js';
import { formatArea, formatDate, normalizeZoneId } from './utils/format-utils.js';
import {
    checkUserLocationZone as updateLocationZone,
    switchBaseMap as applyBaseMap,
    toggleLocationTracking as trackUserLocation
} from './map/map-init.js';
import { selectMapStyleByIndex, updateAllFeatureStyles as updateMapFeatureStyles, updateLabelZoomVisibility } from './map/map-layers.js';
import { initializeMapRuntime } from './map/map-runtime.js';
import { createMapLayoutDownloadActions } from './map/map-layout-downloads.js';
import { setupMapPageNavigation } from './map/map-page-navigation.js';
import { setupPageTransitionEvents } from './components/page-transition-events.js';
import { createMapLayerLifecycle } from './map/map-layer-lifecycle.js';
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
import { setupActionButtons as setupToolbarActionButtons, setupViewToggleMenu, updateAllAppsModalHeaderTitle, updateShareModalDescription, toggleFullscreen, performDirectCopyLink, getActiveDownloadFilename, generateAppSpatialBlob } from './components/toolbar-actions.js';
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


const { downloadGeoPdf, downloadGeoTiff } = createMapLayoutDownloadActions({
    hasCachedLayout: hasCachedLayoutCanvas,
    renderLayout: getOrRenderLayoutCanvas,
    getFilename: getActiveDownloadFilename,
    convertCanvasToTiff: canvasToTiffBlob,
    shareFile: handleSpatialFileShare,
    notify: showToast
});

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
    rebuildFeatures: (...args) => mapLayerLifecycle.rebuildGeoJsonLayer(...args),
    selectSubject,
    disposeRasterCache,
    getFitPadding,
    showToast,
    isSuggestLocked: () => document.body.classList.contains('is-suggest-locked')
});
const { switchToFeature, switchToCirclesFeature } = featureTransitionController;
const mapLayerLifecycle = createMapLayerLifecycle({
    state,
    updateLabelZoomVisibility,
    updateFeatureStyles: updateAllFeatureStyles,
    updateLocationZone,
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


function initializeMap() {
    return initializeMapRuntime({
        maplibregl,
        state,
        mapLayerLifecycle,
        onSelectSubject: selectSubject,
        onSelectCircles: () => selectSubject(CIRCLE_ID),
        onSwitchToCircles: switchToCirclesFeature,
        onSwitchBaseMap: switchBaseMap,
        onLocate: trackUserLocation,
        onToggleFullscreen: toggleFullscreen,
        updateControlPositions,
        notify: showToast,
        adjustHeaderFontSize,
        updateLabelZoomVisibility
    });
}













setupMapPageNavigation({
    state,
    circleId: CIRCLE_ID,
    normalizeZoneId,
    clearBirdObservations,
    selectSubject,
    switchToCirclesFeature
});


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
        setupSearch({ state, documentObject: document, windowObject: window, setMobileSnapState });
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
        setupHelpModeSystem({
            state,
            renderSidebarList,
            updateKeyboardFocus: updateKeyboardTileFocus,
            onToggleFullscreen: toggleFullscreen,
            onCopyLink: performDirectCopyLink,
            onSelectMapStyle: selectMapStyleByIndex,
            notify: showToast,
            documentObject: document,
            windowObject: window,
            navigatorObject: navigator,
            MutationObserverClass: MutationObserver
        });
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

setupPageTransitionEvents({ documentObject: document, windowObject: window });
