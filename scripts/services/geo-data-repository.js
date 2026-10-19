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

function createDatasetRequest(datasetId, paths, cacheKey) {
    const request = {
        datasetId,
        cacheKey,
        controller: new AbortController(),
        consumers: 0,
        settled: false,
        promise: null
    };
    request.promise = Promise.resolve().then(async () => {
        let lastError;
        for (const path of paths) {
            try {
                const response = await fetch(path, { signal: request.controller.signal });
                if (!response.ok) throw new Error(`${datasetId} data fetch failed (${response.status})`);
                return validateFeatureCollection(datasetId, await response.json());
            } catch (error) {
                if (request.controller.signal.aborted) throw error;
                lastError = error;
            }
        }
        throw lastError || new Error(`Could not fetch ${datasetId} data`);
    })
        .catch(error => {
            if (datasetRequests.get(cacheKey) === request) datasetRequests.delete(cacheKey);
            throw error;
        })
        .finally(() => {
            request.settled = true;
        });
    datasetRequests.set(cacheKey, request);
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
            if (datasetRequests.get(request.cacheKey) === request) datasetRequests.delete(request.cacheKey);
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

export async function loadGeoDataset(datasetId, { signal, paths } = {}) {
    const candidates = paths || [getGeoDatasetPath(datasetId)];
    if (!Array.isArray(candidates) || candidates.length === 0 || candidates.some(path => typeof path !== 'string' || !path)) {
        throw new Error(`Invalid data paths for ${datasetId}`);
    }
    if (signal?.aborted) throw createAbortError();
    const cacheKey = `${datasetId}:${candidates.join('|')}`;
    let request = datasetRequests.get(cacheKey);
    if (!request || request.controller.signal.aborted) request = createDatasetRequest(datasetId, candidates, cacheKey);
    return consumeDatasetRequest(request, signal);
}

export async function loadGeoDatasets(datasetIds = MAP_DATASET_IDS, options) {
    const entries = await Promise.all(
        datasetIds.map(async datasetId => [datasetId, await loadGeoDataset(datasetId, options)])
    );
    return Object.fromEntries(entries);
}
