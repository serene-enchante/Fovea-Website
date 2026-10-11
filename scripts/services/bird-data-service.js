import { state } from '../state.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { normalizeZoneId } from '../utils/format-utils.js';
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
    const params = new URLSearchParams(window.location.search);
    const circleParam = params.get("circle") || params.get("cid");
    if (circleParam) {
        const cName = circleParam.trim();
        const lowerName = cName.toLowerCase();
        if (lowerName === "eugene") {
            state.currentFeature = "eugene";
            state.isCirclesFeature = false;
            return CIRCLE_ID;
        } else if (lowerName === "florence") {
            state.currentFeature = "florence";
            state.isCirclesFeature = false;
            return CIRCLE_ID;
        } else {
            state.currentFeature = "circles";
            state.isCirclesFeature = true;
            return cName;
        }
    }

    const feature = (params.get("feature") || "").toLowerCase();
    if (feature === "circles") {
        state.currentFeature = "circles";
        state.isCirclesFeature = true;
    } else if (feature === "florence") {
        state.currentFeature = "florence";
        state.isCirclesFeature = false;
    } else if (feature === "eugene") {
        state.currentFeature = "eugene";
        state.isCirclesFeature = false;
    } else {
        state.currentFeature = "circles";
        state.isCirclesFeature = true;
    }

    const zone = params.get("zone");
    if (zone) return zone.trim();
    const id = params.get("id");
    return id ? id.trim() : CIRCLE_ID;
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
