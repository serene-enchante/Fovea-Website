import { CIRCLE_ID } from '../config/app-config.js';

export function createMapFeatureNavigation({
    state,
    switchToFeature,
    selectSubject,
    getBbox,
    notify,
    circleId = CIRCLE_ID
}) {
    function selectCircle(cid, feature = null) {
        const circle = feature || state.circlesFeatures.find(item => item.properties?.cid === cid);
        const bbox = circle ? getBbox(circle) : null;

        if (cid === 'Eugene') return switchToFeature('eugene', bbox);
        if (cid === 'Florence') return switchToFeature('florence', bbox);
        if (cid === 'Oakridge' || cid === 'Cottage Grove') {
            return notify('There is no data for this count circle');
        }
    }

    function handleMapFeatureClick({ feature, featureId }) {
        const properties = feature.properties || {};
        if (state.isCirclesFeature) {
            return selectCircle(properties.cid, feature);
        }
        if (state.currentId === featureId) {
            return selectSubject(circleId);
        }
        return selectSubject(featureId, true);
    }

    return { selectCircle, handleMapFeatureClick };
}
