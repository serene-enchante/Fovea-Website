import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaceLabelFilterController, toExpression } from '../scripts/map/map-place-label-filter.js';

test('converts legacy place filters to MapLibre expressions recursively', () => {
    assert.deepEqual(toExpression([
        'all',
        ['==', 'class', 'city'],
        ['!in', 'name', 'Eugene', 'Florence']
    ]), [
        'all',
        ['==', ['get', 'class'], 'city'],
        ['!', ['in', ['get', 'name'], ['literal', ['Eugene', 'Florence']]]]
    ]);
    assert.deepEqual(toExpression(['==', ['get', 'class'], 'city']), ['==', ['get', 'class'], 'city']);
});

test('caches original filters, hides duplicate circle names, and restores them', () => {
    const filters = new Map([
        ['place_city_r5', ['==', 'class', 'city']],
        ['place_town', null]
    ]);
    const changes = [];
    const map = {
        getLayer: id => filters.has(id),
        getFilter: id => filters.get(id),
        setFilter(id, filter) {
            changes.push([id, filter]);
            filters.set(id, filter);
        }
    };
    const state = { map, isCirclesFeature: true, currentFeature: 'circles' };
    const controller = createPlaceLabelFilterController(state);

    controller.updatePlaceLabelsFilter();
    assert.equal(changes.length, 2);
    assert.deepEqual(changes[0], ['place_city_r5', [
        'all',
        ['==', ['get', 'class'], 'city'],
        ['match', ['get', 'name'], 'Eugene', false, 'Florence', false, 'Cottage Grove', false, 'Oakridge', false, true],
        ['match', ['get', 'name_en'], 'Eugene', false, 'Florence', false, 'Cottage Grove', false, 'Oakridge', false, true]
    ]]);
    assert.deepEqual(changes[1], ['place_town', [
        'all',
        ['match', ['get', 'name'], 'Eugene', false, 'Florence', false, 'Cottage Grove', false, 'Oakridge', false, true],
        ['match', ['get', 'name_en'], 'Eugene', false, 'Florence', false, 'Cottage Grove', false, 'Oakridge', false, true]
    ]]);

    controller.updatePlaceLabelsFilter();
    assert.equal(changes.length, 2, 'does not reapply the filter while the view is unchanged');

    state.isCirclesFeature = false;
    state.currentFeature = 'eugene';
    controller.updatePlaceLabelsFilter();
    assert.deepEqual(changes.slice(2), [
        ['place_city_r5', ['==', ['get', 'class'], 'city']],
        ['place_town', undefined]
    ]);

    controller.reset();
    filters.set('place_city_r5', ['==', 'class', 'town']);
    state.isCirclesFeature = true;
    controller.updatePlaceLabelsFilter();
    assert.deepEqual(changes.at(-2)[1][1], ['==', ['get', 'class'], 'town']);
});
