import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addSurfaceWaterLayer } from '../scripts/map/map-surface-water.js';

test('ships Fern Ridge Lake without the malformed river-area polygons', () => {
    const collection = JSON.parse(readFileSync(new URL('../geojson/eugene-lane-surface-water.geojson', import.meta.url)));
    const fernRidge = collection.features.find(feature =>
        feature.properties.kind === 'waterbody' && feature.properties.area_sq_km > 20
    );
    assert.ok(fernRidge, 'expected a large lake polygon for Fern Ridge');
    assert.equal(fernRidge.geometry.type, 'Polygon');
    assert.ok(collection.features.every(feature => feature.properties.kind === 'waterbody'));
    const coordinates = [];
    const visitCoordinates = value => {
        if (Array.isArray(value) && typeof value[0] === 'number') coordinates.push(value);
        else if (Array.isArray(value)) value.forEach(visitCoordinates);
    };
    collection.features.forEach(feature => visitCoordinates(feature.geometry.coordinates));
    assert.ok(coordinates.every(([longitude, latitude]) =>
        longitude >= -124 && longitude <= -122 && latitude >= 43 && latitude <= 45
    ), 'expected WGS84 longitude/latitude coordinates in the Eugene area');
});

function createMap() {
    const sources = new Map();
    const layers = [];
    const paint = new Map();
    return {
        sources,
        layers,
        paint,
        getSource: id => sources.get(id),
        addSource: (id, source) => sources.set(id, source),
        getLayer: id => layers.find(layer => layer.id === id),
        getStyle: () => ({ layers: [{ id: 'landuse', type: 'fill' }, { id: 'road_minor_fill', type: 'line' }] }),
        addLayer: (layer, beforeId) => layers.push({ ...layer, beforeId }),
        setPaintProperty: (id, key, value) => paint.set(`${id}:${key}`, value)
    };
}

test('adds local water polygons below road layers with light theme styling', () => {
    const map = createMap();
    addSurfaceWaterLayer(map, true);

    assert.ok(map.sources.has('supplemental-surface-water'));
    assert.match(map.sources.get('supplemental-surface-water').data, /eugene-lane-surface-water\.geojson$/);
    const layer = map.getLayer('supplemental-surface-water-fill');
    assert.equal(layer.beforeId, 'road_minor_fill');
    assert.equal(layer.paint['fill-color'], '#a8cbdf');
    assert.equal(layer.paint['fill-opacity'], 0.9);
});

test('updates the existing water overlay for dark theme without duplicating it', () => {
    const map = createMap();
    addSurfaceWaterLayer(map, true);
    addSurfaceWaterLayer(map, false);

    assert.equal(map.sources.size, 1);
    assert.equal(map.layers.length, 1);
    assert.equal(map.paint.get('supplemental-surface-water-fill:fill-color'), '#31556b');
    assert.equal(map.paint.get('supplemental-surface-water-fill:fill-opacity'), 0.88);
});
