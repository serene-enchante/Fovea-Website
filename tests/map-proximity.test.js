import assert from 'node:assert/strict';
import test from 'node:test';
import { setupProximityTracking } from '../scripts/map/map-proximity.js';
import { state } from '../scripts/state.js';

test('tracks cursor proximity through the shared map proximity controller', () => {
    const globalKeys = ['window', 'requestAnimationFrame'];
    const originalGlobals = new Map(globalKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    const stateKeys = ['map', 'labelData'];
    const originalState = Object.fromEntries(stateKeys.map(key => [key, state[key]]));
    const listeners = new Map();
    const featureStates = [];
    const canvas = {
        addEventListener: (name, listener) => listeners.set(name, listener),
        getBoundingClientRect: () => ({ left: 0, top: 0 })
    };

    try {
        globalThis.window = { innerWidth: 1024 };
        globalThis.requestAnimationFrame = callback => callback();
        Object.assign(state, {
            map: {
                getCanvas: () => canvas,
                getZoom: () => 10,
                project: () => ({ x: 20, y: 30 }),
                setFeatureState: (...args) => featureStates.push(args)
            },
            labelData: [
                { id: '04', lng: 0, lat: 0 },
                { id: '', lng: 0, lat: 0 }
            ]
        });
        delete state._proximityListenerAttached;

        setupProximityTracking();
        setupProximityTracking();
        listeners.get('mousemove')({ clientX: 20, clientY: 30 });
        listeners.get('mouseleave')();

        assert.deepEqual(featureStates, [
            [{ source: 'zones', id: '04' }, { proximity: 1 }],
            [{ source: 'zones', id: '04' }, { proximity: 0 }]
        ]);
        assert.equal(listeners.size, 2);
        assert.equal(Object.hasOwn(state, '_proximityListenerAttached'), false);
    } finally {
        for (const key of stateKeys) {
            if (originalState[key] === undefined) delete state[key];
            else state[key] = originalState[key];
        }
        for (const key of globalKeys) {
            const descriptor = originalGlobals.get(key);
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});
