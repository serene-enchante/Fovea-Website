import { getMapDataset, MAP_DATASET_IDS } from '../config/map-data-manifest.js';

const datasetRequests = new Map();

export function clearGeoDataCache() {
    datasetRequests.clear();
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

export async function loadGeoDataset(datasetId, { signal } = {}) {
    const path = getGeoDatasetPath(datasetId);
    const cachedRequest = datasetRequests.get(datasetId);
    if (cachedRequest) return cachedRequest;

    const request = fetch(path, { signal })
        .then(async response => {
            if (!response.ok) {
                throw new Error(`${datasetId} data fetch failed (${response.status})`);
            }
            return validateFeatureCollection(datasetId, await response.json());
        })
        .catch(error => {
            datasetRequests.delete(datasetId);
            throw error;
        });

    datasetRequests.set(datasetId, request);
    return request;
}

export async function loadGeoDatasets(datasetIds = MAP_DATASET_IDS, options) {
    const entries = await Promise.all(
        datasetIds.map(async datasetId => [datasetId, await loadGeoDataset(datasetId, options)])
    );
    return Object.fromEntries(entries);
}
