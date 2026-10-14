import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapLayerLifecycle } from '../scripts/map/map-layer-lifecycle.js';

test('builds map layers, binds them once, and delegates map feature clicks', () => {
    const calls = [];
    const listeners = [];
    let source = null;
    let hoverOptions;
    const map = {
        getSource: id => id === 'zones' ? source : null,
        on: (name, listener) => listeners.push([name, listener])
    };
    const state = { map, allFeatures: [{ properties: { zid: '04' } }], isCirclesFeature: false, isLocating: true,
        userLocationMarker: { getLngLat: () => ({ lng: -123, lat: 44 }) } };
    const lifecycle = createMapLayerLifecycle({
        state,
        buildFeatureData: (...args) => { calls.push(['build', ...args]); return { geojsonData: { features: [] }, labelData: ['label'] }; },
        addFeatureLayers: (targetMap, data) => { calls.push(['add-layers', targetMap, data]); source = { setData: data => calls.push(['set-data', data]) }; },
        renderHtmlLabels: () => calls.push(['labels']),
        updateLabelZoomVisibility: () => calls.push(['label-zoom']),
        updateFeatureStyles: () => calls.push(['styles']),
        updateLocationZone: value => calls.push(['location', value]),
        onFeatureClick: event => calls.push(['click', event]),
        setupProximityTracker: () => calls.push(['proximity']),
        setupProximityGlow: () => calls.push(['glow']),
        setupHoverEvents: options => { hoverOptions = options; calls.push(['hover']); }
    });

    lifecycle.rebuildGeoJsonLayer();
    assert.deepEqual(state.labelData, ['label']);
    assert.equal('_labelListenersAttached' in state, false);
    assert.deepEqual(listeners.map(([name]) => name), ['move', 'zoom', 'render']);
    assert.deepEqual(calls.map(([name]) => name), ['build', 'add-layers', 'proximity', 'glow', 'label-zoom', 'hover', 'location', 'styles']);
    const click = { feature: { properties: { cid: 'Eugene' } }, featureId: '04' };
    hoverOptions.onFeatureClick(click);
    assert.deepEqual(calls.at(-1), ['click', click]);

    source = { setData: data => calls.push(['set-data', data]) };
    lifecycle.rebuildGeoJsonLayer();
    assert.equal(calls.filter(([name]) => name === 'hover').length, 1);
    assert.equal(calls.filter(([name]) => name === 'set-data').length, 1);
    assert.equal(calls.filter(([name]) => name === 'styles').length, 2);
    assert.deepEqual(calls.slice(-5).map(([name]) => name), ['build', 'set-data', 'label-zoom', 'location', 'styles']);
});
