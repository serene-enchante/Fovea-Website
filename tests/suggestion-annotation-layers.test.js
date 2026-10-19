import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureSuggestionAnnotationLayers } from '../scripts/components/suggestion-annotation-layers.js';

test('creates the annotation source and layers once while reusing the loaded marker image', () => {
    const sources = new Map();
    const layers = new Map();
    const map = {
        getSource: id => sources.get(id),
        addSource: (id, source) => sources.set(id, source),
        getLayer: id => layers.get(id),
        addLayer: layer => layers.set(layer.id, layer),
        hasImage: id => id === 'suggest-pin-icon'
    };

    ensureSuggestionAnnotationLayers(map);
    ensureSuggestionAnnotationLayers(map);

    assert.deepEqual([...sources.keys()], ['suggest-annotation-source']);
    assert.deepEqual([...layers.keys()], [
        'suggest-annotation-polygon-fill-layer',
        'suggest-annotation-polygon-stroke-layer',
        'suggest-annotation-line-halo-layer',
        'suggest-annotation-line-layer',
        'suggest-annotation-vertex-layer',
        'suggest-annotation-point-layer'
    ]);
    assert.equal(layers.get('suggest-annotation-point-layer').source, 'suggest-annotation-source');
});

test('does nothing when the map is unavailable', () => {
    assert.doesNotThrow(() => ensureSuggestionAnnotationLayers(null));
});
