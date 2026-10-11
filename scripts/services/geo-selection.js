import { normalizeZoneId } from '../utils/format-utils.js';

export function zoneIdsMatch(left, right) {
    if (left == null || right == null) return false;
    return String(left).toLowerCase() === String(right).toLowerCase()
        || normalizeZoneId(left) === normalizeZoneId(right);
}

export function findFeatureByZoneId(features, zoneId) {
    return features.find(feature => zoneIdsMatch(feature.properties?.zid, zoneId));
}

/**
 * Create an export-safe FeatureCollection for the active map selection.
 * Circle views export their complete feature set; zone views export the
 * selected zone when it is present. The returned data never shares object
 * references with map state.
 */
export function getSelectedGeoJSONData({ features = [], currentId, isCirclesFeature, circleId }) {
    let selectedFeatures = features;

    if (!isCirclesFeature && currentId && currentId !== circleId) {
        const target = findFeatureByZoneId(features, currentId);
        if (target) selectedFeatures = [target];
    }

    return {
        type: 'FeatureCollection',
        features: JSON.parse(JSON.stringify(selectedFeatures))
    };
}
