export function createMapFeatureRepository({ state, loadGeoDataset }) {
    async function loadFeaturesForMapView(featureName, options) {
        const datasetId = featureName === 'florence' ? 'florence'
            : featureName === 'eugene' ? 'eugene'
                : 'circles';
        const dataset = await loadGeoDataset(datasetId, options);
        const features = dataset.features;

        if (datasetId === 'circles') {
            state.circlesFeatures = features;
        } else if (datasetId === 'florence') {
            state.florenceFeatures = features;
        } else {
            state.eugeneFeatures = features;
        }

        return features;
    }

    return { loadFeaturesForMapView };
}
