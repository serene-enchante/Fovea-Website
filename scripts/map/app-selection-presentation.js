import { displayZoneId } from '../utils/format-utils.js';
import { findFeatureByZoneId } from '../services/geo-selection.js';

export function getSelectionThumbnail({ currentFeature, isCirclesFeature }) {
    if (isCirclesFeature || currentFeature === 'circles') return '../images/whiteLane-Audubon-favicon.webp';
    if (currentFeature === 'florence') return '../images/florence.webp';
    return '../images/logo-small.webp';
}

/**
 * Return text-only title parts so modal views keep DOM rendering separate from
 * selection rules. `circleName` is set only for a zone-level selection.
 */
export function getAppSelectionTitle({ features = [], currentFeature, currentId, isCirclesFeature, circleId }) {
    if (isCirclesFeature) {
        return { targetName: 'Coast to Cascades Bird Alliance', circleName: null };
    }

    const circleName = currentFeature === 'florence' ? 'Florence Count Circle' : 'Eugene Count Circle';
    if (!currentId || currentId === circleId) {
        return { targetName: circleName, circleName: null };
    }

    const targetFeature = findFeatureByZoneId(features, currentId);
    const zoneName = targetFeature?.properties?.zid
        ? `Zone ${displayZoneId(targetFeature.properties.zid)}`
        : 'Zone';
    return { targetName: zoneName, circleName };
}
