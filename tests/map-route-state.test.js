import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMapRoute, serializeMapRoute } from '../scripts/map/map-route-state.js';

const CIRCLE_ID = 'circle';

test('parses established and canonical deep links', () => {
    assert.deepEqual(parseMapRoute('?circle=Eugene', CIRCLE_ID), {
        currentFeature: 'eugene', isCirclesFeature: false, initialId: CIRCLE_ID
    });
    assert.deepEqual(parseMapRoute('?cid=Florence', CIRCLE_ID), {
        currentFeature: 'florence', isCirclesFeature: false, initialId: CIRCLE_ID
    });
    assert.deepEqual(parseMapRoute('?circle=North+Coast', CIRCLE_ID), {
        currentFeature: 'circles', isCirclesFeature: true, initialId: 'North Coast'
    });
    assert.deepEqual(parseMapRoute('?feature=eugene&zone=04', CIRCLE_ID), {
        currentFeature: 'eugene', isCirclesFeature: false, initialId: '04'
    });
    assert.deepEqual(parseMapRoute('?feature=florence&id=01', CIRCLE_ID), {
        currentFeature: 'florence', isCirclesFeature: false, initialId: '01'
    });
});

test('falls back safely for missing or unknown map routes', () => {
    assert.deepEqual(parseMapRoute('', CIRCLE_ID), {
        currentFeature: 'circles', isCirclesFeature: true, initialId: CIRCLE_ID
    });
    assert.deepEqual(parseMapRoute('?feature=unknown&zone=04', CIRCLE_ID), {
        currentFeature: 'circles', isCirclesFeature: true, initialId: '04'
    });
});

test('serializes a zone selection as a canonical deep link', () => {
    assert.equal(
        serializeMapRoute('?source=newsletter&id=stale', {
            currentFeature: 'eugene', isCirclesFeature: false, id: '4', circleId: CIRCLE_ID,
            displayZoneId: value => `0${value}`
        }),
        'source=newsletter&feature=eugene&zone=04'
    );
});

test('clears legacy link parameters when the user changes map selection', () => {
    assert.equal(
        serializeMapRoute('?circle=Eugene&feature=eugene&zone=04', {
            currentFeature: 'florence', isCirclesFeature: false, id: CIRCLE_ID, circleId: CIRCLE_ID
        }),
        'feature=florence'
    );
    assert.equal(
        serializeMapRoute('?cid=Florence&feature=florence&zone=01', {
            currentFeature: 'circles', isCirclesFeature: true, id: CIRCLE_ID, circleId: CIRCLE_ID
        }),
        'feature=circles'
    );
});
