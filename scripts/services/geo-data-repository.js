import {
    CIRCLES_GEOJSON_PATH,
    EUGENE_GEOJSON_PATH,
    FLORENCE_GEOJSON_PATH
} from '../config/app-config.js';

const DATASET_PATHS = Object.freeze({
    circles: CIRCLES_GEOJSON_PATH,
    eugene: EUGENE_GEOJSON_PATH,
    florence: FLORENCE_GEOJSON_PATH
});

const datasetRequests = new Map();

function validateFeatureCollection(datasetId, data) {
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error(`Invalid GeoJSON FeatureCollection for ${datasetId}`);
    }
    return data;
}

export function getGeoDatasetPath(datasetId) {
    const path = DATASET_PATHS[datasetId];
    if (!path) throw new Error(`Unknown map dataset: ${datasetId}`);
    return path;
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

export async function loadGeoDatasets(datasetIds = Object.keys(DATASET_PATHS), options) {
    const entries = await Promise.all(
        datasetIds.map(async datasetId => [datasetId, await loadGeoDataset(datasetId, options)])
    );
    return Object.fromEntries(entries);
}
