import assert from 'node:assert/strict';
import test from 'node:test';
import { createBirdSelectionController } from '../scripts/map/bird-selection-controller.js';

test('loads and maps observations for the selected zone and updates the active sidebar view', async () => {
    const backButton = {
        classList: { remove() {} },
        setAttribute() {}
    };
    const sourceUpdates = [];
    const state = {
        map: {
            getSource: () => ({ setData: data => sourceUpdates.push(data) })
        },
        allFeatures: [{ properties: { zid: '19A' }, geometry: { type: 'Polygon' } }],
        currentId: '19a',
        activeTab: 'observations'
    };
    const calls = [];
    let defaultPhotoCalls = 0;
    const controller = createBirdSelectionController({
        state,
        fetchObservations: async (birdName, bbox) => {
            calls.push(['fetch', birdName, bbox]);
            return {
                results: [
                    { id: 4, location: '44.1,-123.2', user: { login: 'Ada' }, observed_on: '2026-01-02', photos: [{ url: 'https://img.test/square.jpg' }] },
                    { id: 5, location: 'invalid', photos: [] }
                ]
            };
        },
        fetchDefaultPhoto: async () => { defaultPhotoCalls += 1; return null; },
        getBbox: feature => { calls.push(['bbox', feature]); return [[-124, 43], [-122, 45]]; },
        updateHeader: birdName => calls.push(['header', birdName]),
        renderSidebarList: () => calls.push(['render']),
        updateSidebarBirdPanel: () => calls.push(['panel']),
        setupObservationsLayer: () => calls.push(['layer']),
        documentObject: {
            getElementById: id => id === 'btn-capsule-back' ? backButton : null
        },
        turfObject: null
    });

    await controller.selectBird('Osprey');

    assert.equal(state.selectedBird, 'Osprey');
    assert.equal(state.selectedBirdObservations.length, 1);
    assert.deepEqual(state.selectedBirdObservations[0].geometry.coordinates, [-123.2, 44.1]);
    assert.equal(state.selectedBirdObservations[0].properties.user, 'Ada');
    assert.equal(state.selectedBirdPhotoUrl, 'https://img.test/large.jpg');
    assert.equal(state.selectedBirdPhotoCredit, 'Photo by Ada via iNaturalist');
    assert.equal(sourceUpdates[0].features.length, 1);
    assert.equal(defaultPhotoCalls, 0);
    assert.equal(calls.filter(([name]) => name === 'render').length, 2);
    assert.equal(backButton.disabled, false);
});

test('ignores observations when the selected bird changes during the request', async () => {
    let resolveObservations;
    const state = {
        map: { getSource: () => ({ setData() { throw new Error('stale data should not render'); } }) },
        allFeatures: [{ properties: { zid: '04' } }],
        currentId: '04',
        selectedBirdObservations: []
    };
    const controller = createBirdSelectionController({
        state,
        fetchObservations: () => new Promise(resolve => { resolveObservations = resolve; }),
        fetchDefaultPhoto: async () => null,
        getBbox: () => null,
        updateHeader() {},
        renderSidebarList() {},
        updateSidebarBirdPanel() { throw new Error('stale panel should not render'); },
        setupObservationsLayer() {},
        documentObject: { getElementById: () => null },
        turfObject: null
    });

    const request = controller.selectBird('Osprey');
    state.selectedBird = 'Robin';
    resolveObservations({ results: [{ id: 1, location: '44,-123' }] });
    await request;

    assert.deepEqual(state.selectedBirdObservations, []);
});

test('falls back to the default taxon photo when observations have no photos', async () => {
    const state = {
        map: { getSource: () => ({ setData() {} }) },
        allFeatures: [{ properties: { zid: '04' } }],
        currentId: '04',
        activeTab: 'birds'
    };
    let updatedPanel;
    const controller = createBirdSelectionController({
        state,
        fetchObservations: async () => ({ results: [] }),
        fetchDefaultPhoto: async () => ({ url: 'https://img.test/square.jpg', attribution: 'Photo credit' }),
        getBbox: () => null,
        updateHeader() {},
        renderSidebarList() {},
        updateSidebarBirdPanel: (...args) => { updatedPanel = args; },
        setupObservationsLayer() {},
        documentObject: { getElementById: () => null },
        turfObject: null
    });

    await controller.selectBird('Osprey');

    assert.equal(state.selectedBirdPhotoUrl, 'https://img.test/large.jpg');
    assert.equal(state.selectedBirdPhotoCredit, 'Photo credit');
    assert.equal(updatedPanel[0], 'Osprey');
    assert.deepEqual(updatedPanel[1], []);
});
