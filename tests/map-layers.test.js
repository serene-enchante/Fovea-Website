import assert from 'node:assert/strict';
import test from 'node:test';
import { addRasterBaseLayers } from '../scripts/map/map-layers.js';

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
