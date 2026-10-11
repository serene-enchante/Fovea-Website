import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import {
    clearGeoDataCache,
    getGeoDatasetPath,
    loadGeoDataset,
    loadGeoDatasets
} from '../scripts/services/geo-data-repository.js';
import { getMapDataset, MAP_DATASET_IDS, MAP_DATASETS } from '../scripts/config/map-data-manifest.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
    clearGeoDataCache();
    globalThis.fetch = originalFetch;
});

function featureCollection(name) {
    return {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { name }, geometry: null }]
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/geo+json' }
    });
}

test('returns the canonical path for every map dataset', () => {
    assert.equal(getGeoDatasetPath('circles'), '../geojson/circles-wgs84.geojson');
    assert.equal(getGeoDatasetPath('eugene'), '../geojson/Eugene-04-wgs84.geojson');
    assert.equal(getGeoDatasetPath('florence'), '../geojson/Florence-00-wgs84.geojson');
    assert.throws(() => getGeoDatasetPath('unknown'), /Unknown map dataset/);
});

test('defines active datasets in one immutable manifest', () => {
    assert.deepEqual(MAP_DATASET_IDS, ['circles', 'eugene', 'florence']);
    assert.equal(getMapDataset('eugene'), MAP_DATASETS.eugene);
    assert.equal(MAP_DATASETS.florence.label, 'Florence Christmas Bird Count');
    assert.ok(Object.isFrozen(MAP_DATASETS));
    assert.ok(Object.isFrozen(MAP_DATASETS.circles));
    assert.throws(() => getMapDataset('unknown'), /Unknown map dataset/);
});

test('loads and validates the requested datasets', async () => {
    const requestedPaths = [];
    globalThis.fetch = async path => {
        requestedPaths.push(path);
        return jsonResponse(featureCollection(path));
    };

    const datasets = await loadGeoDatasets(['circles', 'florence']);

    assert.deepEqual(Object.keys(datasets), ['circles', 'florence']);
    assert.equal(datasets.circles.features[0].properties.name, '../geojson/circles-wgs84.geojson');
    assert.equal(datasets.florence.features[0].properties.name, '../geojson/Florence-00-wgs84.geojson');
    assert.deepEqual(requestedPaths, [
        '../geojson/circles-wgs84.geojson',
        '../geojson/Florence-00-wgs84.geojson'
    ]);
});

test('shares one request for concurrent loads of the same dataset', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
        requestCount += 1;
        return jsonResponse(featureCollection('Eugene'));
    };

    const [first, second] = await Promise.all([
        loadGeoDataset('eugene'),
        loadGeoDataset('eugene')
    ]);

    assert.equal(requestCount, 1);
    assert.strictEqual(first, second);
});

test('rejects malformed GeoJSON and permits a later retry', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
        requestCount += 1;
        return requestCount === 1
            ? jsonResponse({ type: 'FeatureCollection', features: 'not-an-array' })
            : jsonResponse(featureCollection('Florence'));
    };

    await assert.rejects(loadGeoDataset('florence'), /Invalid GeoJSON FeatureCollection/);
    const data = await loadGeoDataset('florence');

    assert.equal(requestCount, 2);
    assert.equal(data.features[0].properties.name, 'Florence');
});

test('rejects failed responses and does not cache the failure', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
        requestCount += 1;
        return requestCount === 1
            ? jsonResponse({ error: 'temporarily unavailable' }, 503)
            : jsonResponse(featureCollection('Circles'));
    };

    await assert.rejects(loadGeoDataset('circles'), /circles data fetch failed \(503\)/);
    const data = await loadGeoDataset('circles');

    assert.equal(requestCount, 2);
    assert.equal(data.features[0].properties.name, 'Circles');
});
