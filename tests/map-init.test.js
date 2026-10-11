import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapInstance } from '../scripts/map/map-init.js';

test('creates the live map through the injected MapLibre constructor', () => {
    const options = { container: 'tile-map', zoom: 11 };
    let receivedOptions;
    class FakeMap {
        constructor(value) {
            receivedOptions = value;
        }
    }

    const map = createMapInstance({ Map: FakeMap }, options);

    assert.ok(map instanceof FakeMap);
    assert.equal(receivedOptions, options);
});

test('fails clearly when MapLibre is not available', () => {
    assert.throws(() => createMapInstance({}, {}), /MapLibre is unavailable/);
});
