import { createMapInstance } from './map-init.js';
import { setupMapLayers } from './map-layers.js';
import { setupMapCanvasEvents } from './map-events.js';
import { setupMapNavigationControls } from './map-controls.js';
import { setupMapStyleControl } from './map-style-control.js';
import { setupMapEffectsAndFullscreen } from './map-viewport.js';

export function initializeMapRuntime({
    maplibregl,
    state,
    mapLayerLifecycle,
    onSelectSubject,
    onSelectCircles,
    onSwitchToCircles,
    onSwitchBaseMap,
    onLocate,
    onToggleFullscreen,
    updateControlPositions,
    notify,
    adjustHeaderFontSize,
    updateLabelZoomVisibility,
    fallbackImage = '../images/wetlands.jpg',
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    navigatorObject = globalThis.navigator
}) {
    const mapContainer = documentObject.getElementById('tile-map');
    const mapWrapper = documentObject.getElementById('map-wrapper');
    if (!mapContainer) return null;

    const isLightMode = documentObject.body.classList.contains('theme-light')
        || state.currentBaseLayer === 'esri-street'
        || documentObject.documentElement.getAttribute('data-theme') === 'light';
    const defaultVectorStyle = isLightMode
        ? 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
        : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

    state.map = createMapInstance(maplibregl, {
        container: 'tile-map',
        preserveDrawingBuffer: true,
        maxZoom: 20,
        minZoom: 0,
        maxTileCacheSize: 2500,
        prefetchZoomDelta: 8,
        projection: { type: 'globe' },
        dragPan: { linearity: 0.15, deceleration: 1000 },
        style: defaultVectorStyle,
        center: [-123.11, 44.05],
        zoom: 11,
        attributionControl: false
    });

    const background = isLightMode ? '#f8f9fa' : '#000000';
    mapContainer.style.setProperty('background-color', background, 'important');
    mapContainer.style.setProperty('background', background, 'important');

    if (state.map.scrollZoom) {
        state.map.scrollZoom.setWheelZoomRate(1 / 750);
        state.map.scrollZoom.setZoomRate(1 / 150);
    }

    setupMapLayers(state);

    try {
        state.map.setProjection({ type: 'globe' });
    } catch (error) {
        console.warn('Immediate setProjection not supported yet:', error);
    }

    if (/Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigatorObject.userAgent) || windowObject.innerWidth <= 768) {
        state.map.touchZoomRotate.disableRotation();
    }

    state.baseMapsList = [
        { id: 'default', name: 'Default', layerId: 'base-dark-vector' },
        { id: 'satellite', name: 'Satellite Map', layerId: 'base-satellite' },
        { id: 'esri-street', name: 'Street Map', layerId: 'base-esri-street' },
        { id: 'esri-topo', name: 'Topo Map', layerId: 'base-esri-topo' }
    ];

    const { topLeft } = setupMapNavigationControls({
        mapWrapper,
        state,
        documentObject,
        onLocate,
        onToggleFullscreen
    });

    setupMapStyleControl({
        topLeft,
        state,
        documentObject,
        onSelectSubject,
        onSwitchBaseMap,
        notify,
        fallbackImage
    });

    updateControlPositions();

    setupMapCanvasEvents({
        map: state.map,
        state,
        onSelectCircles,
        onSwitchToCircles,
        onLoad: mapLayerLifecycle.rebuildGeoJsonLayer
    });

    setupMapEffectsAndFullscreen(mapWrapper, {
        state,
        updateControlPositions,
        adjustHeaderFontSize,
        updateLabelZoomVisibility,
        windowObject,
        documentObject
    });

    return state.map;
}
