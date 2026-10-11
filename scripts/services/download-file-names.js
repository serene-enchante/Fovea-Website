import { displayZoneId } from '../utils/format-utils.js';

/**
 * Build the stable public filename for an exported map view.
 * The input is plain selection state so downloads can be tested without a DOM
 * or shared application state.
 */
export function getDownloadFilename({ currentFeature, currentId, circleId }, extension) {
    let base = 'map-data';
    const hasZoneSelection = currentId && currentId !== circleId;

    if (currentFeature === 'circles') {
        base = 'circles-wgs84';
    } else if (currentFeature === 'florence') {
        base = hasZoneSelection
            ? `Florence-Zone-${displayZoneId(currentId)}`
            : 'Florence-00-wgs84';
    } else {
        base = hasZoneSelection
            ? `Eugene-Zone-${displayZoneId(currentId)}`
            : 'Eugene-05-wgs84';
    }

    return `${base}.${extension}`;
}
