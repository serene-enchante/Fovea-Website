/**
 * Active map datasets served by the website. Keep historical or source files
 * out of this catalog; this is the runtime contract for the browser and a
 * portable starting point for the future data service.
 */
export const MAP_DATASETS = Object.freeze({
    circles: Object.freeze({
        id: 'circles',
        label: 'Coast to Cascades Bird Alliance',
        path: '../geojson/circles-wgs84.geojson'
    }),
    eugene: Object.freeze({
        id: 'eugene',
        label: 'Eugene Christmas Bird Count',
        path: '../geojson/Eugene-04-wgs84.geojson'
    }),
    florence: Object.freeze({
        id: 'florence',
        label: 'Florence Christmas Bird Count',
        path: '../geojson/Florence-00-wgs84.geojson'
    })
});

export const MAP_DATASET_IDS = Object.freeze(Object.keys(MAP_DATASETS));

export function getMapDataset(datasetId) {
    const dataset = MAP_DATASETS[datasetId];
    if (!dataset) throw new Error(`Unknown map dataset: ${datasetId}`);
    return dataset;
}
