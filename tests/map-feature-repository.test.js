import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapFeatureRepository } from '../scripts/map/map-feature-repository.js';

test('loads the requested dataset and stores features in the matching state field', async () => {
    const state = {};
    const requests = [];
    const features = [{ id: 'one' }];
    const repository = createMapFeatureRepository({
        state,
        loadGeoDataset: async datasetId => {
            requests.push(datasetId);
            return { features };
        }
    });

    for (const [viewName, datasetName, stateField] of [
        ['circles', 'circles', 'circlesFeatures'],
        ['eugene', 'eugene', 'eugeneFeatures'],
        ['florence', 'florence', 'florenceFeatures'],
        ['unknown', 'circles', 'circlesFeatures']
    ]) {
        const result = await repository.loadFeaturesForMapView(viewName);
        assert.equal(result, features);
        assert.equal(state[stateField], features);
        assert.equal(requests.at(-1), datasetName);
    }

    assert.deepEqual(requests, ['circles', 'eugene', 'florence', 'circles']);
});
