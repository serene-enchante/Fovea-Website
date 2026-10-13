import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapFeatureNavigation } from '../scripts/map/map-feature-navigation.js';

function createHarness(stateOverrides = {}) {
    const calls = [];
    const eugene = { properties: { cid: 'Eugene' }, geometry: 'eugene-geometry' };
    const state = {
        circlesFeatures: [eugene],
        isCirclesFeature: true,
        currentId: '04',
        ...stateOverrides
    };
    const navigation = createMapFeatureNavigation({
        state,
        switchToFeature: (...args) => calls.push(['switch', ...args]),
        selectSubject: (...args) => calls.push(['select', ...args]),
        getBbox: feature => `bounds:${feature.geometry}`,
        notify: message => calls.push(['notify', message])
    });
    return { calls, eugene, navigation };
}

test('sidebar circle selection finds its feature and navigates to the matching dataset', () => {
    const { calls, navigation } = createHarness();

    navigation.selectCircle('Eugene');

    assert.deepEqual(calls, [['switch', 'eugene', 'bounds:eugene-geometry']]);
});

test('map circle clicks use the clicked feature and report circles without data', () => {
    const { calls, navigation } = createHarness();

    navigation.handleMapFeatureClick({
        feature: { properties: { cid: 'Florence' }, geometry: 'florence-geometry' },
        featureId: 'florence'
    });
    navigation.handleMapFeatureClick({
        feature: { properties: { cid: 'Oakridge' }, geometry: 'oakridge-geometry' },
        featureId: 'oakridge'
    });

    assert.deepEqual(calls, [
        ['switch', 'florence', 'bounds:florence-geometry'],
        ['notify', 'There is no data for this count circle']
    ]);
});

test('zone clicks select the zone or return to the current dataset overview', () => {
    const { calls, navigation } = createHarness({ isCirclesFeature: false, currentId: '04' });

    navigation.handleMapFeatureClick({ feature: { properties: {} }, featureId: '05' });
    navigation.handleMapFeatureClick({ feature: { properties: {} }, featureId: '04' });

    assert.deepEqual(calls, [
        ['select', '05', true],
        ['select', 'ecbc-circle']
    ]);
});
