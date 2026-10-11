import assert from 'node:assert/strict';
import test from 'node:test';
import { addRasterBaseLayers, addZoneFeatureLayers, buildZoneFeatureData } from '../scripts/map/map-layers.js';

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
