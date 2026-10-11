import assert from 'node:assert/strict';
import test from 'node:test';

import { getAppSelectionTitle, getSelectionThumbnail } from '../scripts/map/app-selection-presentation.js';

const circleId = 'ecbc-circle';
const features = [{ type: 'Feature', properties: { zid: '04' }, geometry: null }];

test('presents titles for overview, count-circle, and zone selections', () => {
    assert.deepEqual(
        getAppSelectionTitle({ features, currentFeature: 'circles', currentId: circleId, isCirclesFeature: true, circleId }),
        { targetName: 'Coast to Cascades Bird Alliance', circleName: null }
    );
    assert.deepEqual(
        getAppSelectionTitle({ features, currentFeature: 'florence', currentId: circleId, isCirclesFeature: false, circleId }),
        { targetName: 'Florence Count Circle', circleName: null }
    );
    assert.deepEqual(
        getAppSelectionTitle({ features, currentFeature: 'eugene', currentId: '4', isCirclesFeature: false, circleId }),
        { targetName: 'Zone 04', circleName: 'Eugene Count Circle' }
    );
});

test('returns the current selection thumbnail', () => {
    assert.equal(getSelectionThumbnail({ currentFeature: 'circles', isCirclesFeature: true }), '../images/whiteLane-Audubon-favicon-152.png');
    assert.equal(getSelectionThumbnail({ currentFeature: 'florence', isCirclesFeature: false }), '../images/florence.png');
    assert.equal(getSelectionThumbnail({ currentFeature: 'eugene', isCirclesFeature: false }), '../images/logo-small.png');
});
