import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeMapRuntime } from '../scripts/map/map-runtime.js';

test('map runtime leaves state untouched when the map container is absent', () => {
    const state = { map: null };
    const documentObject = { getElementById: () => null };

    const result = initializeMapRuntime({
        maplibregl: {},
        state,
        mapLayerLifecycle: {},
        documentObject
    });

    assert.equal(result, null);
    assert.equal(state.map, null);
});
