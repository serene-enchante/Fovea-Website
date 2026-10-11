import assert from 'node:assert/strict';
import test from 'node:test';
import { createFeatureTransitionController } from '../scripts/map/map-selection.js';

function createHarness(loadFeatures) {
    const state = { map: {}, currentFeature: 'circles', isCirclesFeature: true, allFeatures: [] };
    const effects = [];
    const controller = createFeatureTransitionController({
        state,
        loadFeatures,
        rebuildFeatures: () => effects.push('rebuild'),
        selectSubject: (...args) => effects.push(['select', ...args]),
        disposeRasterCache: () => effects.push('dispose'),
        getFitPadding: () => 12,
        showToast: (...args) => effects.push(['toast', ...args]),
        isSuggestLocked: () => false
    });
    return { state, effects, controller };
}

test('loads an area dataset before swapping map state and rendering selection', async () => {
    const features = [{ properties: { zid: '04' } }];
    const harness = createHarness(async datasetId => {
        assert.equal(datasetId, 'eugene');
        return features;
    });

    await harness.controller.switchToFeature('eugene');

    assert.equal(harness.state.currentFeature, 'eugene');
    assert.equal(harness.state.isCirclesFeature, false);
    assert.equal(harness.state.allFeatures, features);
    assert.deepEqual(harness.effects, ['dispose', 'rebuild', ['select', 'ecbc-circle', false]]);
});

test('discards an older dataset response after a newer navigation request', async () => {
    const pending = new Map();
    const harness = createHarness(datasetId => new Promise(resolve => pending.set(datasetId, resolve)));
    const areaChange = harness.controller.switchToFeature('eugene');
    const circlesChange = harness.controller.switchToCirclesFeature();

    const circles = [{ properties: { cid: 'Eugene' } }];
    pending.get('circles')(circles);
    await circlesChange;
    pending.get('eugene')([{ properties: { zid: '04' } }]);
    await areaChange;

    assert.equal(harness.state.currentFeature, 'circles');
    assert.equal(harness.state.allFeatures, circles);
    assert.deepEqual(harness.effects, ['dispose', 'dispose', 'rebuild', ['select', 'ecbc-circle', true]]);
});
