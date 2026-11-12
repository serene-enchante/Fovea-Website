import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addSurfaceWaterLayer, SUPPLEMENTAL_SURFACE_WATER_ENABLED } from '../scripts/map/map-surface-water.js';

test('enables the major-lake fallback while native basemap detail is absent', () => {
    assert.equal(SUPPLEMENTAL_SURFACE_WATER_ENABLED, true);
});

test('ships detailed major lakes and named Willamette and McKenzie channel polygons', () => {
    const collection = JSON.parse(readFileSync(new URL('../geojson/eugene-lane-surface-water.geojson', import.meta.url)));
    const fernRidge = collection.features.find(feature =>
        feature.properties.kind === 'waterbody' && feature.properties.area_sq_km > 20
    );
    assert.ok(fernRidge, 'expected a large lake polygon for Fern Ridge');
    assert.equal(fernRidge.geometry.type, 'Polygon');
    const countCoordinates = value => Array.isArray(value) && typeof value[0] === 'number'
        ? 1
        : Array.isArray(value) ? value.reduce((sum, part) => sum + countCoordinates(part), 0) : 0;
    assert.ok(countCoordinates(fernRidge.geometry.coordinates) > 1000,
        'expected the detailed shoreline geometry without aggressive simplification');
    const lakes = collection.features.filter(feature => feature.properties.kind === 'waterbody');
    const rivers = collection.features.filter(feature => feature.properties.kind === 'river');
    assert.equal(lakes.length, 12);
    assert.equal(rivers.length, 3);
    assert.ok(collection.features.every(feature => feature.properties.area_sq_km >= 1));
    assert.deepEqual(rivers.map(feature => feature.properties.name).sort(), [
        'McKenzie River', 'McKenzie River', 'Willamette River'
    ]);
    assert.ok(rivers.every(feature => feature.geometry.type === 'Polygon'));
    assert.ok(rivers.every(feature => countCoordinates(feature.geometry.coordinates) > 5000),
        'keep the river channel outlines unsimplified to avoid triangular artifacts');
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
    assert.equal('minzoom' in layer, false);
    assert.equal('maxzoom' in layer, false);
    assert.deepEqual(layer.filter, ['>=', ['get', 'area_sq_km'], 1]);
    assert.equal(layer.paint['fill-color'], '#88bdd8');
    assert.equal(layer.paint['fill-opacity'], 0.9);
});

test('updates the existing water overlay for dark theme without duplicating it', () => {
    const map = createMap();
    addSurfaceWaterLayer(map, true);
    addSurfaceWaterLayer(map, false);

    assert.equal(map.sources.size, 1);
    assert.equal(map.layers.length, 1);
    assert.equal(map.paint.get('supplemental-surface-water-fill:fill-color'), '#315d74');
    assert.equal(map.paint.get('supplemental-surface-water-fill:fill-opacity'), 0.9);
});
