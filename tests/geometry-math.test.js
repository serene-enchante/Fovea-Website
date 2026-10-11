import assert from 'node:assert/strict';
import test from 'node:test';

import { findPointInsidePolygon, getBbox, isPointInGeoJSONGeometry } from '../scripts/utils/geometry-math.js';

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

test('finds a usable interior point for supported geometries', () => {
    const polygon = {
        type: 'Polygon',
        coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]]
    };

    assert.deepEqual(findPointInsidePolygon({ type: 'Point', coordinates: [1, 2] }), [1, 2]);
    assert.deepEqual(findPointInsidePolygon(polygon), [2, 2]);
    assert.equal(findPointInsidePolygon({ type: 'LineString', coordinates: [] }), null);
});

test('tests points against polygon and multi-polygon geometries', () => {
    const polygon = { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]] };
    const multiPolygon = { type: 'MultiPolygon', coordinates: [[[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]]] };

    assert.equal(isPointInGeoJSONGeometry(2, 2, polygon), true);
    assert.equal(isPointInGeoJSONGeometry(5, 5, polygon), false);
    assert.equal(isPointInGeoJSONGeometry(11, 11, multiPolygon), true);
});
