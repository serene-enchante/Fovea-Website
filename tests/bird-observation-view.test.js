import assert from 'node:assert/strict';
import test from 'node:test';
import { clearBirdObservationPopup, createBirdObservationItem, openBirdObservationPopup } from '../scripts/components/bird-observation-view.js';
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
