import { addZoneFeatureLayers, buildZoneFeatureData, rebuildHtmlLabels } from './map-layers.js';
import { setupMapHoverEvents } from './map-events.js';
import { setupProximityGlowCanvas, setupProximityTracking } from './map-proximity.js';

export function createMapLayerLifecycle({
    state,
    updateLabelZoomVisibility,
    updateFeatureStyles,
    updateLocationZone,
    onFeatureClick,
    buildFeatureData = buildZoneFeatureData,
    addFeatureLayers = addZoneFeatureLayers,
    renderHtmlLabels = rebuildHtmlLabels,
    setupHoverEvents = setupMapHoverEvents,
    setupProximityTracker = setupProximityTracking,
    setupProximityGlow = setupProximityGlowCanvas
}) {
    let labelListenersAttached = false;

    function rebuildGeoJsonLayer() {
        if (!state.map) return;
        const { geojsonData, labelData } = buildFeatureData(state.allFeatures, state.isCirclesFeature);
        state.labelData = labelData;

        const source = state.map.getSource('zones');
        if (source) {
            source.setData(geojsonData);
            updateLabelZoomVisibility();
            updateFeatureStyles();
        } else {
            addFeatureLayers(state.map, geojsonData);

            if (!labelListenersAttached) {
                labelListenersAttached = true;
                state.map.on('move', renderHtmlLabels);
                state.map.on('zoom', renderHtmlLabels);
                state.map.on('render', renderHtmlLabels);
            }
            setupProximityTracker();
            setupProximityGlow();
            updateLabelZoomVisibility();
            updateFeatureStyles();
            setupHoverEvents({ map: state.map, state, onFeatureClick });
        }

        if (state.isLocating && state.userLocationMarker) {
            updateLocationZone(state.userLocationMarker.getLngLat());
        }
        updateFeatureStyles();
    }

    return { rebuildGeoJsonLayer };
}
