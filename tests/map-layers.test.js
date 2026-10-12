import assert from 'node:assert/strict';
import test from 'node:test';
import { addRasterBaseLayers, addZoneFeatureLayers, buildZoneFeatureData, rebuildHtmlLabels, selectMapStyleByIndex, updateAllFeatureStyles } from '../scripts/map/map-layers.js';
import { state } from '../scripts/state.js';

test('selects a map style, updates its radio control, and notifies the user', () => {
    const visible = new Set(['layer-dark']);
    const operations = [];
    const inputs = [{ checked: false }, { checked: false }];
    const state = {
        map: {
            hasLayer: layer => visible.has(layer),
            addLayer(layer) { visible.add(layer); operations.push(['add', layer]); },
            removeLayer(layer) { visible.delete(layer); operations.push(['remove', layer]); }
        },
        baseMapsList: [
            { name: 'Dark', layer: 'layer-dark' },
            { name: 'Satellite', layer: 'layer-satellite' }
        ]
    };
    const messages = [];

    selectMapStyleByIndex(1, {
        state,
        documentObject: { querySelector: () => ({ querySelectorAll: () => inputs }) },
        notify: message => messages.push(message)
    });

    assert.deepEqual(operations, [['remove', 'layer-dark'], ['add', 'layer-satellite']]);
    assert.deepEqual([...visible], ['layer-satellite']);
    assert.equal(inputs[1].checked, true);
    assert.deepEqual(messages, ['Map Style: Satellite']);
});

test('registers all raster sources and makes only the selected base layer visible', () => {
    const sources = new Map();
    const layers = [];
    const map = {
        addSource(id, source) { sources.set(id, source); },
        addLayer(layer, beforeId) { layers.push({ layer, beforeId }); },
        getLayer(id) { return ['tunnel_service_case'].includes(id) ? { id } : undefined; }
    };

    addRasterBaseLayers(map, 'esri-topo');

    assert.deepEqual([...sources.keys()], [
        'satellite-tiles', 'esri-street-tiles', 'esri-topo-tiles', 'dark-tiles'
    ]);
    assert.equal(sources.get('dark-tiles').tiles.length, 4);
    assert.deepEqual(layers.map(({ layer }) => [layer.id, layer.layout.visibility]), [
        ['base-satellite', 'none'],
        ['base-esri-street', 'none'],
        ['base-esri-topo', 'visible'],
        ['base-dark-raster', 'none']
    ]);
    assert.equal(layers[0].beforeId, 'tunnel_service_case');
    assert.equal(layers[1].beforeId, undefined);
});

test('adds the GeoJSON source and production zone layers below place labels', () => {
    let source;
    const layers = [];
    const map = {
        addSource(id, value) { source = { id, value }; },
        addLayer(layer, beforeId) { layers.push({ layer, beforeId }); },
        getLayer(id) { return id === 'place_hamlet' ? { id } : undefined; }
    };
    const data = { type: 'FeatureCollection', features: [] };

    addZoneFeatureLayers(map, data);

    assert.equal(source.id, 'zones');
    assert.equal(source.value.data, data);
    assert.equal(source.value.promoteId, 'feature_id');
    assert.deepEqual(layers.map(({ layer }) => layer.id), [
        'zones-fill', 'zones-outline', 'zones-outline-highlight', 'zones-collision-labels'
    ]);
    assert.ok(layers.every(item => item.beforeId === 'place_hamlet'));
    assert.deepEqual(layers[0].layer.paint['fill-opacity'], [
        'case', ['boolean', ['feature-state', 'selected'], false], 0.0,
        ['match', ['get', 'cid'], 'Oakridge', 0.02, 'Cottage Grove', 0.02, 0.07]
    ]);
});

test('groups features by their active ID and builds matching HTML label data', () => {
    const polygon = (xOffset = 0) => ({
        type: 'Polygon',
        coordinates: [[[xOffset, 0], [xOffset + 1, 0], [xOffset + 1, 1], [xOffset, 1], [xOffset, 0]]]
    });
    const { geojsonData, labelData } = buildZoneFeatureData([
        { type: 'Feature', properties: { zid: '04', cid: 'Eugene', name: 'first' }, geometry: polygon() },
        { type: 'Feature', properties: { zid: '04', cid: 'Eugene', name: 'second' }, geometry: polygon(2) },
        { type: 'Feature', properties: { zid: '05', cid: 'Eugene' }, geometry: polygon(4) }
    ], false);

    assert.deepEqual(geojsonData.features.map(feature => feature.id), ['04', '05']);
    assert.equal(geojsonData.features[0].geometry.type, 'MultiPolygon');
    assert.equal(geojsonData.features[0].geometry.coordinates.length, 2);
    assert.equal(geojsonData.features[0].properties.name, 'first');
    assert.deepEqual(labelData.map(({ id, text, isCircle }) => ({ id, text, isCircle })), [
        { id: '04', text: '04', isCircle: false },
        { id: '05', text: '05', isCircle: false }
    ]);
    assert.ok(labelData.every(({ lng, lat, degWidth, textLen }) =>
        Number.isFinite(lng) && Number.isFinite(lat) && degWidth > 0 && textLen === 2));
});

test('applies the production light-theme feature colors and updates supplemental layers', () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const stateKeys = ['map', 'allFeatures', 'isCirclesFeature', 'currentFeature', 'currentId', 'currentBaseLayer', '_originalPlaceFilters', '_lastHiddenCircleNames', 'labelData'];
    const originalState = Object.fromEntries(stateKeys.map(key => [key, state[key]]));
    const paints = new Map();
    const featureStates = [];
    const classes = new Set();
    let supplementalUpdateCount = 0;

    try {
        globalThis.document = {
            body: { classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: () => false } },
            documentElement: { getAttribute: name => name === 'data-theme' ? 'light' : null },
            querySelector: () => null,
            getElementById: () => null
        };
        Object.assign(state, {
            map: {
                getSource: id => id === 'zones' ? {} : null,
                getLayer: id => ['zones-fill', 'zones-outline', 'zones-outline-highlight'].includes(id) ? { id } : null,
                setFeatureState: (...args) => featureStates.push(args),
                setPaintProperty: (layer, property, value) => paints.set(`${layer}:${property}`, value)
            },
            allFeatures: [{ properties: { zid: '04' } }],
            isCirclesFeature: false,
            currentFeature: 'eugene',
            currentId: '04',
            currentBaseLayer: 'default',
            _originalPlaceFilters: undefined,
            _lastHiddenCircleNames: undefined,
            labelData: []
        });

        updateAllFeatureStyles({ updateAdditionalLayers: () => supplementalUpdateCount++ });

        assert.equal(supplementalUpdateCount, 1);
        assert.deepEqual(featureStates, [[{ source: 'zones', id: '04' }, { selected: true }]]);
        assert.equal(classes.has('is-light-basemap'), true);
        assert.ok(JSON.stringify(paints.get('zones-fill:fill-opacity')).includes('0.15'));
        assert.equal(paints.get('zones-outline:line-color')[2], '#64b5f6');
    } finally {
        for (const key of stateKeys) {
            if (originalState[key] === undefined) delete state[key];
            else state[key] = originalState[key];
        }
        if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
        else delete globalThis.document;
    }
});

test('renders HTML labels with the production light-theme default-basemap colors', () => {
    const originals = ['document', 'window'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
    const stateKeys = ['map', 'labelData', 'isCirclesFeature', 'currentFeature', 'currentBaseLayer'];
    const originalState = Object.fromEntries(stateKeys.map(key => [key, state[key]]));
    const label = { style: {}, dataset: { labelId: '04' } };
    const overlay = {
        querySelectorAll: () => [],
        querySelector: () => label,
        appendChild: () => {}
    };

    try {
        globalThis.document = {
            body: { classList: { contains: () => false } },
            documentElement: { getAttribute: name => name === 'data-theme' ? 'light' : null },
            getElementById: () => overlay,
            createElement: () => label
        };
        globalThis.window = { innerWidth: 1024 };
        Object.assign(state, {
            map: { getZoom: () => 10, project: () => ({ x: 20, y: 30 }), getCanvas: () => ({}) },
            labelData: [{ id: '04', lng: 0, lat: 0, text: '04', degWidth: 1, textLen: 2, isCircle: false }],
            isCirclesFeature: false,
            currentFeature: 'eugene',
            currentBaseLayer: 'default'
        });

        rebuildHtmlLabels();

        assert.equal(label.style.color, '#000000');
        assert.equal(label.style.textShadow, 'none');
    } finally {
        for (const key of stateKeys) {
            if (originalState[key] === undefined) delete state[key];
            else state[key] = originalState[key];
        }
        for (const [key, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    }
});
