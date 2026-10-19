import assert from 'node:assert/strict';
import test from 'node:test';

import { CARTO_SUBDOMAINS, MAP_PROVIDER_URLS } from '../scripts/config/map-provider-config.js';
import { addRasterBaseLayers } from '../scripts/map/map-layers.js';

test('keeps production MapLibre styles and raster provider URLs in one config', () => {
    assert.match(MAP_PROVIDER_URLS.carto.lightVectorStyle, /^https:\/\/basemaps\.cartocdn\.com\//);
    assert.match(MAP_PROVIDER_URLS.carto.darkVectorStyle, /^https:\/\/basemaps\.cartocdn\.com\//);
    assert.match(MAP_PROVIDER_URLS.esri.topoTiles, /World_Topo_Map/);
    assert.deepEqual(CARTO_SUBDOMAINS, ['a', 'b', 'c', 'd']);
    assert.ok(Object.isFrozen(MAP_PROVIDER_URLS));
});

test('builds raster layer sources from the canonical provider config', () => {
    const sources = new Map();
    const map = {
        addSource(id, source) { sources.set(id, source); },
        addLayer() {},
        getLayer() { return undefined; }
    };
    addRasterBaseLayers(map);

    assert.deepEqual(sources.get('satellite-tiles').tiles, [MAP_PROVIDER_URLS.esri.satelliteTiles]);
    assert.deepEqual(sources.get('esri-street-tiles').tiles, [MAP_PROVIDER_URLS.esri.streetTiles]);
    assert.deepEqual(sources.get('esri-topo-tiles').tiles, [MAP_PROVIDER_URLS.esri.topoTiles]);
    assert.deepEqual(sources.get('dark-tiles').tiles, CARTO_SUBDOMAINS.map(subdomain =>
        MAP_PROVIDER_URLS.carto.darkRasterTiles.replace('{s}', subdomain)
    ));
});
