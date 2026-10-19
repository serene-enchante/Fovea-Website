import assert from 'node:assert/strict';
import test from 'node:test';
import { applyVectorThemeStyles } from '../scripts/map/map-vector-theme-styles.js';

function createMapRecorder() {
    const paint = new Map();
    const layout = new Map();
    return {
        paint,
        layout,
        map: {
            getLayer: () => true,
            setPaintProperty: (layer, property, value) => paint.set(`${layer}:${property}`, value),
            setLayoutProperty: (layer, property, value) => layout.set(`${layer}:${property}`, value)
        }
    };
}

test('applies light vector styles to land, parks, roads, and place labels', () => {
    const { map, paint, layout } = createMapRecorder();

    applyVectorThemeStyles(map, true);

    assert.equal(paint.get('background:background-color'), '#d9dce1');
    assert.equal(paint.get('park_national_park:fill-color'), '#c8decb');
    assert.equal(paint.get('waterway:line-color'), '#8eb6cd');
    assert.equal(paint.get('roadname_major:text-color'), '#000000');
    assert.equal(paint.get('roadname_major:text-halo-width'), 0);
    assert.equal(paint.get('place_town:text-color'), '#000000');
    assert.equal(layout.get('place_town:text-transform'), 'none');
});

test('applies dark vector styles to land, parks, roads, and place labels', () => {
    const { map, paint, layout } = createMapRecorder();

    applyVectorThemeStyles(map, false);

    assert.equal(paint.get('background:background-color'), '#1a1b1e');
    assert.equal(paint.get('park_national_park:fill-color'), '#161c18');
    assert.equal(paint.get('waterway:line-color'), '#242a30');
    assert.equal(paint.get('roadname_major:text-color'), 'rgba(235, 235, 235, 1)');
    assert.equal(paint.get('place_town:text-color'), '#8eb1c7');
    assert.equal(layout.get('place_town:text-transform'), 'none');
});
