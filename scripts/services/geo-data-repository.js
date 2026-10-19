import { getMapDataset, MAP_DATASET_IDS } from '../config/map-data-manifest.js';

const datasetRequests = new Map();

export function clearGeoDataCache() {
    for (const request of datasetRequests.values()) request.controller.abort();
    datasetRequests.clear();
}

function createAbortError() {
    return typeof DOMException === 'function'
        ? new DOMException('The dataset request was aborted', 'AbortError')
        : Object.assign(new Error('The dataset request was aborted'), { name: 'AbortError' });
}

function validateFeatureCollection(datasetId, data) {
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error(`Invalid GeoJSON FeatureCollection for ${datasetId}`);
    }
    for (const [index, feature] of data.features.entries()) {
        const geometryType = feature?.geometry?.type;
        if (feature?.type !== 'Feature' || !feature.properties || typeof feature.properties !== 'object'
            || !['Polygon', 'MultiPolygon'].includes(geometryType) || !Array.isArray(feature.geometry.coordinates)) {
            throw new Error(`Invalid ${datasetId} feature at index ${index}`);
        }

        if (datasetId === 'circles' && (typeof feature.properties.cid !== 'string' || !feature.properties.cid.trim())) {
            throw new Error(`Invalid circle ID at ${datasetId} feature index ${index}`);
        }
        if (datasetId !== 'circles' && (typeof feature.properties.zid !== 'string' || !feature.properties.zid.trim())) {
            throw new Error(`Invalid zone ID at ${datasetId} feature index ${index}`);
        }
        if (datasetId === 'eugene' && 'id' in feature.properties
            && feature.properties.id !== null && typeof feature.properties.id !== 'string') {
            throw new Error(`Invalid legacy zone ID at ${datasetId} feature index ${index}`);
        }
    }
    return data;
}

export function getGeoDatasetPath(datasetId) {
    return getMapDataset(datasetId).path;
}

function createDatasetRequest(datasetId, path) {
    const request = {
        datasetId,
        controller: new AbortController(),
        consumers: 0,
        settled: false,
        promise: null
    };
    request.promise = Promise.resolve()
        .then(() => fetch(path, { signal: request.controller.signal }))
        .then(async response => {
            if (!response.ok) {
                throw new Error(`${datasetId} data fetch failed (${response.status})`);
            }
            return validateFeatureCollection(datasetId, await response.json());
        })
        .catch(error => {
            if (datasetRequests.get(datasetId) === request) datasetRequests.delete(datasetId);
            throw error;
        })
        .finally(() => {
            request.settled = true;
        });
    datasetRequests.set(datasetId, request);
    return request;
}

function consumeDatasetRequest(request, signal) {
    if (signal?.aborted) return Promise.reject(createAbortError());
    request.consumers += 1;

    let released = false;
    const release = () => {
        if (released) return;
        released = true;
        request.consumers -= 1;
        if (!request.settled && request.consumers === 0) {
            if (datasetRequests.get(request.datasetId) === request) datasetRequests.delete(request.datasetId);
            request.controller.abort();
        }
    };

    if (!signal) return request.promise.finally(release);

    return new Promise((resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener('abort', onAbort);
            release();
            reject(createAbortError());
        };
        signal.addEventListener('abort', onAbort, { once: true });
        request.promise.then(
            value => {
                signal.removeEventListener('abort', onAbort);
                release();
                resolve(value);
            },
            error => {
                signal.removeEventListener('abort', onAbort);
                release();
                reject(error);
            }
        );
    });
}

export async function loadGeoDataset(datasetId, { signal } = {}) {
    const path = getGeoDatasetPath(datasetId);
    if (signal?.aborted) throw createAbortError();
    let request = datasetRequests.get(datasetId);
    if (!request || request.controller.signal.aborted) request = createDatasetRequest(datasetId, path);
    return consumeDatasetRequest(request, signal);
}

export async function loadGeoDatasets(datasetIds = MAP_DATASET_IDS, options) {
    const entries = await Promise.all(
        datasetIds.map(async datasetId => [datasetId, await loadGeoDataset(datasetId, options)])
    );
    return Object.fromEntries(entries);
}
