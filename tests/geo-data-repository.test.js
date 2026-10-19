import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';

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

function featureCollection(name, datasetId = 'eugene') {
    return {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: datasetId === 'circles' ? { cid: name } : { zid: name },
            geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [0, 1], [1, 1], [0, 0]]]] }
        }]
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
    assert.equal(getGeoDatasetPath('eugene'), '../geojson/Eugene-05-wgs84.geojson');
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
        const datasetId = path.includes('circles') ? 'circles' : path.includes('Florence') ? 'florence' : 'eugene';
        return jsonResponse(featureCollection(path, datasetId));
    };

    const datasets = await loadGeoDatasets(['circles', 'florence']);

    assert.deepEqual(Object.keys(datasets), ['circles', 'florence']);
    assert.equal(datasets.circles.features[0].properties.cid, '../geojson/circles-wgs84.geojson');
    assert.equal(datasets.florence.features[0].properties.zid, '../geojson/Florence-00-wgs84.geojson');
    assert.deepEqual(requestedPaths, [
        '../geojson/circles-wgs84.geojson',
        '../geojson/Florence-00-wgs84.geojson'
    ]);
});

test('shares one request for concurrent loads of the same dataset', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
        requestCount += 1;
        return jsonResponse(featureCollection('Eugene', 'eugene'));
    };

    const [first, second] = await Promise.all([
        loadGeoDataset('eugene'),
        loadGeoDataset('eugene')
    ]);

    assert.equal(requestCount, 1);
    assert.strictEqual(first, second);
});

test('aborts the underlying fetch when its only consumer cancels', async () => {
    let requestSignal;
    let fetchStarted;
    const started = new Promise(resolve => { fetchStarted = resolve; });
    globalThis.fetch = async (_path, { signal }) => {
        requestSignal = signal;
        fetchStarted();
        return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
    };

    const controller = new AbortController();
    const loading = loadGeoDataset('eugene', { signal: controller.signal });
    await started;
    controller.abort();

    await assert.rejects(loading, error => error.name === 'AbortError');
    assert.equal(requestSignal.aborted, true);
});

test('keeps a shared fetch alive while another consumer still needs the dataset', async () => {
    let resolveFetch;
    let requestSignal;
    let requestCount = 0;
    globalThis.fetch = (_path, { signal }) => {
        requestCount += 1;
        requestSignal = signal;
        return new Promise(resolve => { resolveFetch = resolve; });
    };

    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = loadGeoDataset('eugene', { signal: firstController.signal });
    const second = loadGeoDataset('eugene', { signal: secondController.signal });
    const firstResult = assert.rejects(first, error => error.name === 'AbortError');
    firstController.abort();

    await firstResult;
    assert.equal(requestCount, 1);
    assert.equal(requestSignal.aborted, false);
    resolveFetch(jsonResponse(featureCollection('Eugene', 'eugene')));
    assert.equal((await second).features[0].properties.zid, 'Eugene');
});

test('rejects malformed GeoJSON and permits a later retry', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
        requestCount += 1;
        return requestCount === 1
            ? jsonResponse({ type: 'FeatureCollection', features: 'not-an-array' })
            : jsonResponse(featureCollection('Florence', 'florence'));
    };

    await assert.rejects(loadGeoDataset('florence'), /Invalid GeoJSON FeatureCollection/);
    const data = await loadGeoDataset('florence');

    assert.equal(requestCount, 2);
    assert.equal(data.features[0].properties.zid, 'Florence');
});

test('rejects active datasets with missing IDs or unsupported geometry types', async () => {
    globalThis.fetch = async () => jsonResponse({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }]
    });
    await assert.rejects(loadGeoDataset('circles'), /Invalid circles feature at index 0/);
});

test('rejects failed responses and does not cache the failure', async () => {
    let requestCount = 0;
    globalThis.fetch = async () => {
        requestCount += 1;
        return requestCount === 1
            ? jsonResponse({ error: 'temporarily unavailable' }, 503)
            : jsonResponse(featureCollection('Circles', 'circles'));
    };

    await assert.rejects(loadGeoDataset('circles'), /circles data fetch failed \(503\)/);
    const data = await loadGeoDataset('circles');

    assert.equal(requestCount, 2);
    assert.equal(data.features[0].properties.cid, 'Circles');
});

test('active GeoJSON datasets satisfy their manifest-backed property and geometry contracts', async () => {
    globalThis.fetch = async path => {
        const dataset = JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
        return jsonResponse(dataset);
    };

    const loaded = await loadGeoDatasets();
    assert.equal(loaded.circles.features.length, 4);
    assert.equal(loaded.eugene.features.length, 29);
    assert.equal(loaded.florence.features.length, 13);

    for (const dataset of Object.values(MAP_DATASETS)) {
        const file = await readFile(new URL(`../geojson/${dataset.fileName}`, import.meta.url));
        const source = await readFile(new URL(`../${dataset.sourceFile}`, import.meta.url));
        const parsed = JSON.parse(file.toString('utf8'));
        const bounds = getFeatureCollectionBounds(parsed);

        assert.ok(source.byteLength > 0, `${dataset.id} source file is present`);
        assert.equal(createHash('sha256').update(file).digest('hex'), dataset.sha256, `${dataset.id} checksum`);
        assert.deepEqual(bounds.map(value => Number(value.toFixed(9))), dataset.bounds.map(value => Number(value.toFixed(9))));
        assert.equal(dataset.path, `../geojson/${dataset.fileName}`);
        assert.ok(Object.isFrozen(dataset.bounds));
    }
});

test('versioned schemas expose the active dataset, observation, feedback, and export contracts', async () => {
    const names = ['circles', 'zones', 'bird-observations', 'feedback-payload', 'export-request'];
    const schemas = await Promise.all(names.map(async name => JSON.parse(await readFile(new URL(`../schemas/v1/${name}.schema.json`, import.meta.url), 'utf8'))));
    for (const [index, schema] of schemas.entries()) {
        assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
        assert.equal(schema.$id, `https://fovea.org/schemas/v1/${names[index]}.schema.json`);
    }
    assert.deepEqual(schemas[0].properties.features.items.properties.properties.required, ['cid']);
    assert.deepEqual(schemas[1].properties.features.items.properties.properties.required, ['zid']);
    assert.deepEqual(schemas[3].required, ['title', 'description', 'geojson']);
    assert.deepEqual(schemas[4].properties.format.enum, ['geojson', 'kml', 'gpx', 'pdf', 'tiff']);
});

function getFeatureCollectionBounds(collection) {
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    const visit = value => {
        if (!Array.isArray(value)) return;
        if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
            bounds[0] = Math.min(bounds[0], value[0]);
            bounds[1] = Math.min(bounds[1], value[1]);
            bounds[2] = Math.max(bounds[2], value[0]);
            bounds[3] = Math.max(bounds[3], value[1]);
            return;
        }
        value.forEach(visit);
    };
    collection.features.forEach(feature => visit(feature.geometry.coordinates));
    return bounds;
}
