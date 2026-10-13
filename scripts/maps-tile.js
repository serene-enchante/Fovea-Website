import { CIRCLE_ID } from './config/app-config.js';
import { loadGeoDataset } from './services/geo-data-repository.js';
import { fetchBirdObservations, fetchTaxonDefaultPhoto } from './services/observations-client.js';
import { getInitialIdFromUrl } from './services/bird-data-service.js';
import { handleSpatialFileShare as shareSpatialFile } from './services/file-download-service.js';
import { canvasToTiffBlob } from './services/format-converters.js';
import { getBbox } from './utils/geometry-math.js';
import { normalizeZoneId } from './utils/format-utils.js';
import {
    checkUserLocationZone as updateLocationZone,
    switchBaseMap as applyBaseMap,
    toggleLocationTracking as trackUserLocation
} from './map/map-init.js';
import { updateAllFeatureStyles as updateMapFeatureStyles, updateLabelZoomVisibility } from './map/map-layers.js';
import { initializeMapRuntime } from './map/map-runtime.js';
import { createMapLayoutDownloadActions } from './map/map-layout-downloads.js';
import { createMapFeatureRepository } from './map/map-feature-repository.js';
import { runMapPageStartup } from './map/map-page-startup.js';
import { createMapFeatureNavigation } from './map/map-feature-navigation.js';
import { setupMapPageUi } from './map/map-page-ui.js';
import { setupMapPageNavigation } from './map/map-page-navigation.js';
import { setupPageTransitionEvents } from './components/page-transition-events.js';
import { createMapLayerLifecycle } from './map/map-layer-lifecycle.js';
import {
    disposeRasterCache,
    getOrRenderLayoutCanvas,
    hasCachedLayoutCanvas,
    scheduleDownloadViewPreload
} from './map/map-rendering.js';
import { adjustHeaderFontSize, getFitPadding, updateHeader } from './components/header-view.js';
import { syncSidebarTabs } from './components/sidebar-tabs.js';
import { activateSidebarTab } from './components/sidebar-capsule-events.js';
import { updateKeyboardTileFocus } from './components/sidebar-list.js';
import { openImageLightbox } from './components/image-lightbox.js';
import { renderBirdObservationsList, renderSidebarBirdPanel as renderBirdSidebarPanel } from './components/bird-observation-view.js';
import { renderBirdSpeciesList } from './components/bird-species-list.js';
import { renderOrganizersList, renderResourcesList } from './components/sidebar-static-views.js';
import { renderMapFeatureList } from './components/map-feature-list.js';
import { renderSidebarOverview } from './components/sidebar-overview-view.js';
import { createSidebarController } from './components/sidebar-controller.js';
import { clearBirdObservations, createBirdSelectionController } from './map/bird-selection-controller.js';
import { setupBirdObservationsLayer, updateBirdObservationsLayerStyles } from './map/bird-observation-layers.js';
import { showToast } from './components/toast-view.js';
import { toggleFullscreen, getActiveDownloadFilename } from './components/toolbar-actions.js';
import { updateControlPositions } from './components/mobile-view.js';
import { createFeatureTransitionController, selectSubject as selectMapSubject } from './map/map-selection.js';
import { state } from './state.js';

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

const mapFeatureRepository = createMapFeatureRepository({ state, loadGeoDataset });
const { loadFeaturesForMapView } = mapFeatureRepository;

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
const featureNavigation = createMapFeatureNavigation({
    state,
    switchToFeature,
    selectSubject,
    getBbox,
    notify: showToast
});
const mapLayerLifecycle = createMapLayerLifecycle({
    state,
    updateLabelZoomVisibility,
    updateFeatureStyles: updateAllFeatureStyles,
    updateLocationZone,
    onFeatureClick: featureNavigation.handleMapFeatureClick
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
    onSelectCircle: featureNavigation.selectCircle,
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
    return runMapPageStartup({
        state,
        storageObject: localStorage,
        documentObject: document,
        windowObject: window,
        schedule: setTimeout,
        getInitialId: getInitialIdFromUrl,
        loadFeatures: loadFeaturesForMapView,
        renderSidebarList,
        initializeMap,
        setupPageUi: () => setupMapPageUi({
                state,
                renderSidebarList,
                updateKeyboardFocus: updateKeyboardTileFocus,
                onToggleFullscreen: toggleFullscreen,
                notify: showToast,
                shareFile: handleSpatialFileShare,
                downloadPdf: button => downloadGeoPdf(button),
                downloadTiff: button => downloadGeoTiff(button),
                documentObject: document,
                windowObject: window,
                navigatorObject: navigator,
                MutationObserverClass: MutationObserver
            }),
        selectSubject,
        notify: showToast,
        updateHeader
    });
}



if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

setupPageTransitionEvents({ documentObject: document, windowObject: window });
