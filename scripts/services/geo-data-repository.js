import { getMapDataset, MAP_DATASET_IDS } from '../config/map-data-manifest.js';

const datasetRequests = new Map();

export function clearGeoDataCache() {
    datasetRequests.clear();
}

function validateFeatureCollection(datasetId, data) {
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error(`Invalid GeoJSON FeatureCollection for ${datasetId}`);
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
