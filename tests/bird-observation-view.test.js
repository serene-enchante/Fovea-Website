import assert from 'node:assert/strict';
import test from 'node:test';
import { clearBirdObservationPopup, createBirdObservationItem, openBirdObservationPopup, renderSidebarBirdPanel } from '../scripts/components/bird-observation-view.js';
import { state } from '../scripts/state.js';

test('shares observation cards and popup lifecycle between list and map clicks', () => {
    const originalMaplibre = Object.getOwnPropertyDescriptor(globalThis, 'maplibregl');
    const originalMap = state.map;
    const popupRecords = [];
    const flyToCalls = [];
    const map = {
        getZoom: () => 12,
        flyTo: options => flyToCalls.push(options)
    };
    const feature = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-123.1, 44.1] },
        properties: { species: 'Osprey', user: 'Ada', date: '2026-01-01', photoUrl: '/osprey.jpg', place: 'River', uri: 'https://example.test/obs/1' }
    };

    globalThis.maplibregl = {
        Popup: class {
            constructor(options) { this.options = options; this.removed = false; popupRecords.push(this); }
            setLngLat(coords) { this.coords = coords; return this; }
            setHTML(html) { this.html = html; return this; }
            addTo(targetMap) { this.map = targetMap; return this; }
            remove() { this.removed = true; }
        }
    };
    state.map = map;

    try {
        let clickHandler;
        const item = createBirdObservationItem(feature, {
            createElement: () => ({
                addEventListener: (name, handler) => { if (name === 'click') clickHandler = handler; }
            })
        });
        assert.equal(item.className, 'sidebar-bird-obs-item');
        clickHandler();
        assert.deepEqual(flyToCalls, [{ center: [-123.1, 44.1], zoom: 13.5, speed: 1.2 }]);
        assert.equal(popupRecords[0].map, map);
        assert.match(popupRecords[0].html, /Osprey/);
        assert.match(popupRecords[0].html, /Ada/);

        openBirdObservationPopup(feature);
        assert.equal(popupRecords[0].removed, true);
        clearBirdObservationPopup();
        assert.equal(popupRecords[1].removed, true);
    } finally {
        state.map = originalMap;
        if (originalMaplibre) Object.defineProperty(globalThis, 'maplibregl', originalMaplibre);
        else delete globalThis.maplibregl;
    }
});

test('renders the bird summary panel and delegates observation navigation', () => {
    const stateKeys = ['selectedBirdObservations', 'selectedBirdPhotoUrl', 'selectedBirdPhotoCredit', 'activeTab'];
    const originalState = Object.fromEntries(stateKeys.map(key => [key, state[key]]));
    const header = {};
    const footer = {};
    const selectors = new Map([
        ['.sidebar-bird-media', null],
        ['.sidebar-bird-panel__list', { appendChild() {} }],
        ['.sidebar-overview-preview__footer--obs', footer],
        ['.sidebar-overview-preview__title', header]
    ]);
    const panel = { querySelector: selector => selectors.get(selector) || null };
    let appendedPanel = null;
    const container = { appendChild: node => { appendedPanel = node; } };
    const documentObject = { createElement: () => panel };
    let renderCount = 0;

    Object.assign(state, {
        selectedBirdObservations: [],
        selectedBirdPhotoUrl: '',
        selectedBirdPhotoCredit: '',
        activeTab: 'birds'
    });

    try {
        renderSidebarBirdPanel(container, 'Osprey', {
            documentObject,
            onRenderObservations: () => { renderCount += 1; }
        });

        assert.equal(appendedPanel, panel);
        assert.match(panel.innerHTML, /View species on eBird/);
        assert.match(panel.innerHTML, /No recent observations recorded/);
        footer.onclick();
        header.onclick();
        assert.equal(state.activeTab, 'observations');
        assert.equal(renderCount, 2);
    } finally {
        for (const key of stateKeys) {
            if (originalState[key] === undefined) delete state[key];
            else state[key] = originalState[key];
        }
    }
});
