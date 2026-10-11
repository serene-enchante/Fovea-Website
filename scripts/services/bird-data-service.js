import { state } from '../state.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { parseMapRoute } from '../map/map-route-state.js';
import { loadGeoDatasets } from './geo-data-repository.js';
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

export async function loadBirdData() {
        const { circles: circlesData, eugene: eugeneData, florence: florenceData } = await loadGeoDatasets();

        state.circlesFeatures = Array.isArray(circlesData.features) ? circlesData.features : [];
        state.eugeneFeatures = Array.isArray(eugeneData.features) ? eugeneData.features : [];
        state.florenceFeatures = Array.isArray(florenceData.features) ? florenceData.features : [];

        const initialId = getInitialIdFromUrl();
        if (state.isCirclesFeature) {
            state.allFeatures = state.circlesFeatures;
        } else if (state.currentFeature === "florence") {
            state.allFeatures = state.florenceFeatures;
        } else {
            state.allFeatures = state.eugeneFeatures;
        }
    
    return initialId;
}
