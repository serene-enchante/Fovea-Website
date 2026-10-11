import { state } from '../state.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { normalizeZoneId } from '../utils/format-utils.js';
import { parseMapRoute } from '../map/map-route-state.js';
import { loadGeoDatasets } from './geo-data-repository.js';

export function getSelectedGeoJSONData() {
    let features = state.allFeatures || [];
    if (!state.isCirclesFeature && state.currentId && state.currentId !== CIRCLE_ID) {
        const target = features.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
        });
        if (target) {
            features = [target];
        }
    }
    return {
        type: "FeatureCollection",
        features: JSON.parse(JSON.stringify(features))
    };
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
