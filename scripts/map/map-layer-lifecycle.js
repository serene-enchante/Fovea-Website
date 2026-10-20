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
    requestFrame = callback => globalThis.requestAnimationFrame(callback),
    setupHoverEvents = setupMapHoverEvents,
    setupProximityTracker = setupProximityTracking,
    setupProximityGlow = setupProximityGlowCanvas
}) {
    let labelListenersAttached = false;
    let labelRenderScheduled = false;

    function scheduleHtmlLabelRender() {
        if (labelRenderScheduled) return;
        labelRenderScheduled = true;
        requestFrame(() => {
            labelRenderScheduled = false;
            renderHtmlLabels();
        });
    }

    function rebuildGeoJsonLayer() {
        if (!state.map) return;
        const { geojsonData, labelData } = buildFeatureData(state.allFeatures, state.isCirclesFeature);
        state.labelData = labelData;

        const source = state.map.getSource('zones');
        if (source) {
            source.setData(geojsonData);
            updateLabelZoomVisibility();
        } else {
            addFeatureLayers(state.map, geojsonData);

            if (!labelListenersAttached) {
                labelListenersAttached = true;
                // MapLibre can emit move and zoom for the same camera frame. Coalesce
                // those events and avoid running label work for unrelated map renders.
                state.map.on('move', scheduleHtmlLabelRender);
                state.map.on('zoom', scheduleHtmlLabelRender);
            }
            setupProximityTracker();
            setupProximityGlow();
            updateLabelZoomVisibility();
            setupHoverEvents({ map: state.map, state, onFeatureClick });
        }

        if (state.isLocating && state.userLocationMarker) {
            updateLocationZone(state.userLocationMarker.getLngLat());
        }
        updateFeatureStyles();
    }

    return { rebuildGeoJsonLayer };
}
