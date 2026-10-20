import assert from 'node:assert/strict';
import test from 'node:test';
import { clearBirdObservations, createBirdSelectionController } from '../scripts/map/bird-selection-controller.js';

test('clears selected bird state, popup, and observation source data', () => {
    const sourceUpdates = [];
    const state = {
        selectedBird: 'Osprey',
        selectedBirdObservations: [{ properties: { species: 'Osprey' } }],
        selectedBirdPhotoUrl: '/osprey.jpg',
        selectedBirdPhotoCredit: 'Credit',
        map: { getSource: name => name === 'bird-observations' ? { setData: data => sourceUpdates.push(data) } : null }
    };

    clearBirdObservations(state);

    assert.equal(state.selectedBird, null);
    assert.deepEqual(state.selectedBirdObservations, []);
    assert.equal(state.selectedBirdPhotoUrl, '');
    assert.equal(state.selectedBirdPhotoCredit, '');
    assert.deepEqual(sourceUpdates, [{ type: 'FeatureCollection', features: [] }]);
});

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

test('loads Turf only when needed and keeps the observation polygon filter', async () => {
    let turfLoadCount = 0;
    const state = {
        map: { getSource: () => ({ setData() {} }) },
        allFeatures: [{ properties: { zid: '04' }, geometry: { type: 'Polygon' } }],
        currentId: '04',
        activeTab: 'birds'
    };
    const controller = createBirdSelectionController({
        state,
        fetchObservations: async () => ({
            results: [
                { id: 1, location: '44,-123', photos: [] },
                { id: 2, location: '45,-122', photos: [] }
            ]
        }),
        fetchDefaultPhoto: async () => null,
        getBbox: () => null,
        updateHeader() {},
        renderSidebarList() {},
        updateSidebarBirdPanel() {},
        setupObservationsLayer() {},
        documentObject: { getElementById: () => null },
        turfObject: null,
        loadTurfLibrary: async () => {
            turfLoadCount += 1;
            return {
                point: coordinates => coordinates,
                booleanPointInPolygon: point => point[0] === -123
            };
        }
    });

    await controller.selectBird('Osprey');

    assert.equal(turfLoadCount, 1);
    assert.deepEqual(state.selectedBirdObservations.map(feature => feature.properties.id), [1]);
});

test('aborts old observation requests when the selected bird changes', async () => {
    const pendingSignals = new Map();
    const updatedPanels = [];
    const errors = [];
    const state = {
        map: { getSource: () => ({ setData() {} }) },
        allFeatures: [{ properties: { zid: '04' } }],
        currentId: '04',
        selectedBirdObservations: [],
        activeTab: 'birds'
    };
    const controller = createBirdSelectionController({
        state,
        fetchObservations: (birdName, _bounds, { signal }) => {
            if (birdName === 'Robin') return Promise.resolve({ results: [] });
            pendingSignals.set(birdName, signal);
            return new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
            });
        },
        fetchDefaultPhoto: async () => null,
        getBbox: () => null,
        updateHeader() {},
        renderSidebarList() {},
        updateSidebarBirdPanel: (...args) => updatedPanels.push(args),
        setupObservationsLayer() {},
        documentObject: { getElementById: () => null },
        turfObject: null,
        onError: (...args) => errors.push(args)
    });

    const oldRequest = controller.selectBird('Osprey');
    const newRequest = controller.selectBird('Robin');
    await Promise.all([oldRequest, newRequest]);

    assert.equal(pendingSignals.get('Osprey').aborted, true);
    assert.equal(state.selectedBird, 'Robin');
    assert.equal(updatedPanels.length, 1);
    assert.equal(updatedPanels[0][0], 'Robin');
    assert.deepEqual(errors, []);
});

test('clearing bird selection aborts its pending observation request', async () => {
    let pendingSignal;
    const state = {
        map: { getSource: () => ({ setData() {} }) },
        allFeatures: [{ properties: { zid: '04' } }],
        currentId: '04',
        activeTab: 'observations'
    };
    const selection = createBirdSelectionController({
        state,
        fetchObservations: (_birdName, _bounds, { signal }) => {
            pendingSignal = signal;
            return new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
            });
        },
        fetchDefaultPhoto: async () => null,
        getBbox: () => null,
        updateHeader() {},
        renderSidebarList() {},
        updateSidebarBirdPanel() {},
        setupObservationsLayer() {},
        documentObject: { getElementById: () => null },
        turfObject: null
    });

    const loading = selection.selectBird('Osprey');
    clearBirdObservations(state);
    await loading;

    assert.equal(pendingSignal.aborted, true);
    assert.equal(state.selectedBird, null);
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
