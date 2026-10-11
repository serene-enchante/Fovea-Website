import assert from 'node:assert/strict';
import test from 'node:test';

import { getBbox } from '../scripts/utils/geometry-math.js';

test('calculates bounds for polygons, multi-polygons, and points', () => {
    const features = [
        { geometry: { type: 'Polygon', coordinates: [[[1, 2], [3, 2], [3, 4], [1, 2]]] } },
        { geometry: { type: 'MultiPolygon', coordinates: [[[[5, 6], [7, 6], [7, 8], [5, 6]]]] } },
        { geometry: { type: 'Point', coordinates: [0, 9] } }
    ];

    assert.deepEqual(getBbox(features), [[0, 2], [7, 9]]);
});

test('returns the historical fallback bounds when no geometry is available', () => {
    assert.deepEqual(getBbox([]), [[-123.3, 43.9], [-122.9, 44.2]]);
});
