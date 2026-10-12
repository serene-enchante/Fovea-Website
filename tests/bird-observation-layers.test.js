import assert from 'node:assert/strict';
import test from 'node:test';
import { setupBirdObservationsLayer, updateBirdObservationsLayerStyles } from '../scripts/map/bird-observation-layers.js';

test('sets up observation source, theme-aware layers, and map interactions', () => {
    const sources = new Map();
    const layers = new Map();
    const listeners = new Map();
    const paints = new Map();
    const cursor = { style: {} };
    const popups = [];
    let lightTheme = true;
    const documentObject = {
        body: { classList: { contains: name => name === 'theme-light' && lightTheme } },
        documentElement: { getAttribute: () => null }
    };
    const map = {
        getSource: id => sources.get(id),
        addSource: (id, source) => sources.set(id, source),
        getLayer: id => layers.get(id),
        addLayer: layer => layers.set(layer.id, layer),
        setPaintProperty: (...args) => paints.set(`${args[0]}:${args[1]}`, args[2]),
        on: (event, layer, handler) => listeners.set(event, handler),
        getCanvas: () => cursor
    };
    const mapState = { map };

    setupBirdObservationsLayer({ state: mapState, documentObject, onOpenPopup: feature => popups.push(feature) });

    assert.equal(sources.get('bird-observations').data.features.length, 0);
    assert.equal(layers.get('bird-observations-points').paint['circle-color'], '#000000');
    assert.equal(layers.get('bird-observations-glow').paint['circle-opacity'], 0.15);
    listeners.get('mouseenter')();
    assert.equal(cursor.style.cursor, 'pointer');
    listeners.get('mouseleave')();
    assert.equal(cursor.style.cursor, '');
    listeners.get('click')({ features: [] });
    const feature = { properties: { species: 'Osprey' } };
    listeners.get('click')({ features: [feature] });
    assert.deepEqual(popups, [feature]);

    lightTheme = false;
    updateBirdObservationsLayerStyles(mapState, documentObject);
    assert.equal(paints.get('bird-observations-points:circle-color'), '#ffffff');
    assert.equal(paints.get('bird-observations-glow:circle-opacity'), 0.25);
});
