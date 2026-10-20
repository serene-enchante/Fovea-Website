import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapSelectionController } from '../scripts/map/map-selection.js';
import { CIRCLE_ID } from '../scripts/config/app-config.js';

function createHarness({ isCirclesFeature = false, features = [] } = {}) {
    const fitCalls = [];
    const sideEffects = [];
    const map = { fitBounds: (...args) => fitCalls.push(args) };
    const state = { isCirclesFeature, allFeatures: features, map, currentId: CIRCLE_ID };
    const controller = createMapSelectionController();
    const callbacks = {
        state,
        documentObject: {
            body: { classList: { contains: () => false } }
        },
        windowObject: {},
        schedule: () => sideEffects.push('schedule'),
        updateHeader: () => sideEffects.push('header'),
        renderSidebarList: () => sideEffects.push('sidebar'),
        updateAllFeatureStyles: () => sideEffects.push('styles'),
        disposeRasterCache: () => sideEffects.push('dispose'),
        getFitPadding: extra => ({ bottom: 300 + (extra || 0) }),
        updateUrl: () => sideEffects.push('url')
    };
    return { controller, callbacks, fitCalls, sideEffects };
}

test('startup map-view restoration only refits the selected zone', () => {
    const feature = {
        properties: { zid: '04' },
        geometry: { type: 'Polygon', coordinates: [[[-123, 44], [-122.9, 44], [-122.9, 44.1], [-123, 44.1], [-123, 44]]] }
    };
    const harness = createHarness({ features: [feature] });

    harness.controller.selectSubject('04', true, false, harness.callbacks, { mapViewOnly: true });

    assert.equal(harness.fitCalls.length, 1);
    assert.deepEqual(harness.fitCalls[0][0], [[-123, 44], [-122.9, 44.1]]);
    assert.deepEqual(harness.fitCalls[0][1], {
        padding: { bottom: 320 }, maxZoom: 14, animate: false, speed: 0.8, curve: 1.4
    });
    assert.deepEqual(harness.sideEffects, []);
});

test('startup map-view restoration fits all data for circles views', () => {
    const harness = createHarness({ isCirclesFeature: true, features: [] });

    harness.controller.selectSubject(CIRCLE_ID, true, false, harness.callbacks, { mapViewOnly: true });

    assert.equal(harness.fitCalls.length, 1);
    assert.deepEqual(harness.fitCalls[0][1], {
        padding: { bottom: 300 }, animate: false, speed: 0.8, curve: 1.4
    });
    assert.deepEqual(harness.sideEffects, []);
});
