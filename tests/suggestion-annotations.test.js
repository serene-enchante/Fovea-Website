import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildAnnotationFeatureCollection,
    buildSuggestionFeatureCollection
} from '../scripts/services/suggestion-annotations.js';

test('builds preview GeoJSON for stored and in-progress annotations', () => {
    const marker = [-123, 44];
    const line = [[-123, 44], [-122, 45]];
    const polygon = [[-124, 43], [-122, 43], [-123, 45]];
    const preview = buildAnnotationFeatureCollection({
        markers: [marker],
        lines: [line],
        polygons: [polygon],
        activeLineCoords: [[-121, 44], [-120, 45]],
        activePolyCoords: [[-119, 44], [-118, 45]]
    });

    assert.equal(preview.type, 'FeatureCollection');
    assert.deepEqual(preview.features.map(feature => feature.properties.kind), [
        'marker', 'line', 'vertex', 'vertex', 'line', 'vertex', 'vertex',
        'polygon', 'vertex', 'vertex', 'vertex', 'line', 'vertex', 'vertex'
    ]);
    assert.equal(preview.features[0].properties.index, 0);
    assert.deepEqual(preview.features.find(feature => feature.properties.kind === 'polygon').geometry.coordinates[0], [
        ...polygon, polygon[0]
    ]);
});

test('builds submission GeoJSON without preview vertices or incomplete drafts', () => {
    const marker = [-123, 44];
    const line = [[-123, 44], [-122, 45]];
    const polygon = [[-124, 43], [-122, 43], [-123, 45]];
    const submission = buildSuggestionFeatureCollection({
        markers: [marker],
        lines: [line, [[0, 0]]],
        polygons: [polygon, [[1, 1], [2, 2]]]
    });

    assert.equal(submission.type, 'FeatureCollection');
    assert.deepEqual(submission.features.map(feature => feature.properties.kind), ['marker', 'line', 'polygon']);
    assert.equal(submission.features[0].properties.index, undefined);
    assert.deepEqual(submission.features[2].geometry.coordinates[0], [...polygon, polygon[0]]);
});
