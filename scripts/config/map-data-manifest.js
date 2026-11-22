/**
 * Active map datasets served by the website. Keep historical or source files
 * out of this catalog; this is the runtime contract for the browser and a
 * portable starting point for the future data service.
 */
function createDataset({ bounds, fileName, ...metadata }) {
    return Object.freeze({
        ...metadata,
        fileName,
        path: `../geojson/${fileName}`,
        bounds: Object.freeze(bounds)
    });
}

export const MAP_DATASETS = Object.freeze({
    circles: createDataset({
        id: 'circles',
        label: 'Coast to Cascades Bird Alliance',
        version: '01',
        schemaVersion: 1,
        fileName: 'circles-wgs84.geojson',
        sourceFile: 'geojson/circles.qmd',
        bounds: [-124.22899596558963, 43.6246712529044, -122.30015129319682, 44.177500356253326],
        sha256: 'c784cae96a8c33ffeb87a3efd54702715f9a117644176a053c394d8ebccf2aca'
    }),
    eugene: createDataset({
        id: 'eugene',
        label: 'Eugene Christmas Bird Count',
        version: '06',
        schemaVersion: 1,
        fileName: 'Eugene-06-wgs84.geojson',
        sourceFile: 'geojson/Eugene-06.geojson',
        bounds: [-123.32828288852082, 43.96024965537785, -123.01206812392554, 44.17750212734705],
        sha256: '2937f26936e2cf4985009368cad1f940fbfd8e10bf0ed9e71354183990c07f5b'
    }),
    florence: createDataset({
        id: 'florence',
        label: 'Florence Christmas Bird Count',
        version: '03',
        schemaVersion: 1,
        fileName: 'Florence-03-wgs84.geojson',
        sourceFile: 'geojson/Florence-03.geojson',
        bounds: [-124.22898764468006, 43.92593135812209, -123.92785884200298, 44.14317328631742],
        sha256: '9af7bfb0a393ac355fa105e0f266372f3849db1947394868eac86adadc373d8a'
    })
});

export const MAP_DATASET_IDS = Object.freeze(Object.keys(MAP_DATASETS));

export function getMapDataset(datasetId) {
    const dataset = MAP_DATASETS[datasetId];
    if (!dataset) throw new Error(`Unknown map dataset: ${datasetId}`);
    return dataset;
}
