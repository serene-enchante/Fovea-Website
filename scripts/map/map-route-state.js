const KNOWN_FEATURES = new Set(['circles', 'eugene', 'florence']);

function toSearchParams(search) {
    return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

function getFeatureRoute(feature) {
    return KNOWN_FEATURES.has(feature) ? feature : 'circles';
}

/**
 * Parse current and legacy map URLs into the small piece of state needed to
 * load the first map view. This module deliberately has no DOM or map
 * dependency so all entry points share the same deep-link contract.
 */
export function parseMapRoute(search, circleId) {
    const params = toSearchParams(search);
    const circleParam = params.get('circle') || params.get('cid');

    if (circleParam?.trim()) {
        const legacyCircle = circleParam.trim();
        const feature = getFeatureRoute(legacyCircle.toLowerCase());

        return feature === 'circles'
            ? { currentFeature: 'circles', isCirclesFeature: true, initialId: legacyCircle }
            : { currentFeature: feature, isCirclesFeature: false, initialId: circleId };
    }

    const currentFeature = getFeatureRoute((params.get('feature') || '').toLowerCase());
    const selectedId = params.get('zone') || params.get('id');

    return {
        currentFeature,
        isCirclesFeature: currentFeature === 'circles',
        initialId: selectedId?.trim() || circleId
    };
}

/**
 * Return a canonical map query string while preserving unrelated parameters.
 * `circle` and `cid` were accepted by older links, but are removed after a
 * user changes selection because they take precedence when a page reloads.
 */
export function serializeMapRoute(search, { currentFeature, isCirclesFeature, id, circleId, displayZoneId = value => value }) {
    const params = toSearchParams(search);
    params.delete('circle');
    params.delete('cid');
    params.delete('id');

    if (isCirclesFeature) {
        params.set('feature', 'circles');
        params.delete('zone');
        return params.toString();
    }

    params.set('feature', getFeatureRoute(currentFeature));
    if (id && id !== circleId) {
        params.set('zone', displayZoneId(id));
    } else {
        params.delete('zone');
    }
    return params.toString();
}
