// Production map composition root. Feature behavior lives in the imported modules.
import { CIRCLE_ID } from '../config/app-config.js';
import { loadGeoDataset } from '../services/geo-data-repository.js';
import { fetchBirdObservations, fetchTaxonDefaultPhoto } from '../services/observations-client.js';
import { getInitialIdFromUrl } from '../services/bird-data-service.js';
import { handleSpatialFileShare as shareSpatialFile } from '../services/file-download-service.js';
import { canvasToTiffBlob } from '../services/format-converters.js';
import { getBbox } from '../utils/geometry-math.js';
import { displayZoneId, normalizeZoneId } from '../utils/format-utils.js';
import {
    checkUserLocationZone as updateLocationZone,
    switchBaseMap as applyBaseMap,
    toggleLocationTracking as trackUserLocation
} from '../map/map-init.js';
import { updateAllFeatureStyles as updateMapFeatureStyles, updateLabelZoomVisibility } from '../map/map-layers.js';
import { initializeMapRuntime } from '../map/map-runtime.js';
import { createMapLayoutDownloadActions } from '../map/map-layout-downloads.js';
import { createMapFeatureRepository } from '../map/map-feature-repository.js';
import { runMapPageStartup } from '../map/map-page-startup.js';
import { createMapFeatureNavigation } from '../map/map-feature-navigation.js';
import { setupMapPageUi } from '../map/map-page-ui.js';
import { setupMapPageNavigation } from '../map/map-page-navigation.js';
import { setupPageTransitionEvents } from '../components/page-transition-events.js';
import { createMapLayerLifecycle } from '../map/map-layer-lifecycle.js';
import {
    disposeRasterCache,
    getOrRenderLayoutCanvas,
    hasCachedLayoutCanvas,
    scheduleDownloadViewPreload
} from '../map/map-rendering.js';
import { adjustHeaderFontSize, getFitPadding, updateHeader } from '../components/header-view.js';
import { syncSidebarTabs } from '../components/sidebar-tabs.js';
import { activateSidebarTab } from '../components/sidebar-capsule-events.js';
import { updateKeyboardTileFocus } from '../components/sidebar-list.js';
import { openImageLightbox } from '../components/image-lightbox.js';
import { renderBirdObservationsList, renderSidebarBirdPanel as renderBirdSidebarPanel } from '../components/bird-observation-view.js';
import { renderBirdSpeciesList } from '../components/bird-species-list.js';
import { renderOrganizersList, renderResourcesList } from '../components/sidebar-static-views.js';
import { renderMapFeatureList } from '../components/map-feature-list.js';
import { renderSidebarOverview } from '../components/sidebar-overview-view.js';
import { createSidebarController } from '../components/sidebar-controller.js';
import { clearBirdObservations, createBirdSelectionController } from '../map/bird-selection-controller.js';
import { setupBirdObservationsLayer, updateBirdObservationsLayerStyles } from '../map/bird-observation-layers.js';
import { showToast } from '../components/toast-view.js';
import { toggleFullscreen, getActiveDownloadFilename } from '../components/toolbar-actions.js';
import { updateControlPositions } from '../components/mobile-view.js';
import { createFeatureTransitionController, createMapSelectionController } from '../map/map-selection.js';
import { updateMapRouteUrl } from '../map/map-route-state.js';
import { findFeatureByZoneId } from '../services/geo-selection.js';
import { state } from '../state.js';

// Keep map and observation layer styling synchronized through one adapter.
function updateAllFeatureStyles() {
    updateMapFeatureStyles({ updateAdditionalLayers: updateBirdObservationsLayerStyles });
}

// Preserve legacy map download metadata while using the shared file service.
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

function switchBaseMap(baseMapId) {
    return applyBaseMap(baseMapId, { state, updateStyles: updateAllFeatureStyles });
}

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
const mapSelectionController = createMapSelectionController();

const featureTransitionController = createFeatureTransitionController({
    state,
    loadFeatures: loadFeaturesForMapView,
    rebuildFeatures: (...args) => mapLayerLifecycle.rebuildGeoJsonLayer(...args),
    selectSubject,
    disposeRasterCache,
    getFitPadding,
    schedule: setTimeout,
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
    return mapSelectionController.selectSubject(id, triggerMapZoom, animate, {
        state,
        documentObject: document,
        windowObject: window,
        schedule: setTimeout,
        updateHeader,
        renderSidebarList,
        updateAllFeatureStyles,
        disposeRasterCache,
        scheduleSelectionPreload: scheduleDownloadViewPreload,
        getFitPadding,
        clearBirdObservations,
        updateUrl: selectedId => updateMapRouteUrl({
            state,
            id: selectedId,
            windowObject: window,
            circleId: CIRCLE_ID,
            displayZoneId,
            findFeatureByZoneId
        })
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
