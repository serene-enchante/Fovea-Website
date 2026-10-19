import { state } from '../state.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { parseMapRoute } from '../map/map-route-state.js';
import { getSelectedGeoJSONData as createSelectedGeoJSONData } from './geo-selection.js';

export function getSelectedGeoJSONData() {
    return createSelectedGeoJSONData({
        features: state.allFeatures,
        currentId: state.currentId,
        isCirclesFeature: state.isCirclesFeature,
        circleId: CIRCLE_ID
    });
}

export function getInitialIdFromUrl() {
    const route = parseMapRoute(window.location.search, CIRCLE_ID);
    state.currentFeature = route.currentFeature;
    state.isCirclesFeature = route.isCirclesFeature;
    return route.initialId;
}
