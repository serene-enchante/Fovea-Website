import assert from 'node:assert/strict';
import test from 'node:test';

import { getSelectedGeoJSONData } from '../scripts/services/geo-selection.js';

const CIRCLE_ID = 'ecbc-circle';
const features = [
    { type: 'Feature', properties: { zid: '04', label: 'Four' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    { type: 'Feature', properties: { zid: '05A', label: 'Five A' }, geometry: { type: 'Point', coordinates: [1, 1] } }
];

test('exports all features from a circles view without sharing map-state references', () => {
    const result = getSelectedGeoJSONData({
        features, currentId: CIRCLE_ID, isCirclesFeature: true, circleId: CIRCLE_ID
    });

    assert.equal(result.features.length, 2);
    assert.notStrictEqual(result.features, features);
    assert.notStrictEqual(result.features[0], features[0]);
});

test('exports one selected zone using normalized zone IDs', () => {
    const result = getSelectedGeoJSONData({
        features, currentId: '4', isCirclesFeature: false, circleId: CIRCLE_ID
    });

    assert.deepEqual(result.features.map(feature => feature.properties.zid), ['04']);
});

test('exports the active feature set when a selected zone has no matching feature', () => {
    const result = getSelectedGeoJSONData({
        features, currentId: '99', isCirclesFeature: false, circleId: CIRCLE_ID
    });

    assert.equal(result.features.length, 2);
});
