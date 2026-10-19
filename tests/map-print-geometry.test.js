import assert from 'node:assert/strict';
import test from 'node:test';
import { getFeatureCenter, polylabel } from '../scripts/utils/map-print-geometry.js';

test('polylabel returns an interior point near the center of a rectangle', () => {
    const ring = [[0, 0], [4, 0], [4, 2], [0, 2], [0, 0]];
    const center = polylabel([ring]);

    assert.ok(center[0] >= 1 && center[0] <= 3);
    assert.ok(Math.abs(center[1] - 1) < 0.001);
});

test('feature center handles points and selects the largest multipolygon part', () => {
    assert.deepEqual(getFeatureCenter({ geometry: { type: 'Point', coordinates: [12, 34] } }), [12, 34]);

    const center = getFeatureCenter({
        geometry: {
            type: 'MultiPolygon',
            coordinates: [
                [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
                [[[3, 0], [7, 0], [7, 2], [3, 2], [3, 0]]]
            ]
        }
    });

    assert.ok(center[0] > 3 && center[0] < 7);
    assert.ok(center[1] > 0 && center[1] < 2);
});

test('feature center returns null when geometry has no supported polygon or point', () => {
    assert.equal(getFeatureCenter(null), null);
    assert.equal(getFeatureCenter({ geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }), null);
});
