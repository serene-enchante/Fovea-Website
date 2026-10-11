import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapInstance, switchBaseMap } from '../scripts/map/map-init.js';

test('creates the live map through the injected MapLibre constructor', () => {
    const options = { container: 'tile-map', zoom: 11 };
    let receivedOptions;
    class FakeMap {
        constructor(value) {
            receivedOptions = value;
        }
    }

    const map = createMapInstance({ Map: FakeMap }, options);

    assert.ok(map instanceof FakeMap);
    assert.equal(receivedOptions, options);
});

test('fails clearly when MapLibre is not available', () => {
    assert.throws(() => createMapInstance({}, {}), /MapLibre is unavailable/);
});

test('switches basemap visibility and keeps theme styling in sync', () => {
    const layoutChanges = [];
    const paintChanges = [];
    const styleChanges = [];
    const map = {
        getLayer: id => ({ id }),
        setLayoutProperty: (...args) => layoutChanges.push(args),
        setPaintProperty: (...args) => paintChanges.push(args)
    };
    const backgrounds = [];
    const wrapperClasses = [];
    const originalDocument = globalThis.document;
    globalThis.document = {
        body: { classList: { contains: () => false } },
        getElementById(id) {
            if (id === 'tile-map') return { style: { setProperty: (...args) => backgrounds.push(args) } };
            return { classList: { add: value => wrapperClasses.push(['add', value]), remove: value => wrapperClasses.push(['remove', value]) } };
        }
    };

    try {
        const state = {
            map,
            baseMapsList: [
                { id: 'default', layerId: 'base-dark-vector' },
                { id: 'satellite', layerId: 'base-satellite' },
                { id: 'esri-street', layerId: 'base-esri-street' },
                { id: 'esri-topo', layerId: 'base-esri-topo' }
            ],
            _originalRoadColors: { road_service_case: '#123456' }
        };

        switchBaseMap('satellite', { state, updateStyles: () => styleChanges.push('updated') });

        assert.equal(state.currentBaseLayer, 'satellite');
        assert.ok(layoutChanges.some(([id, key, value]) => id === 'base-satellite' && key === 'visibility' && value === 'visible'));
        assert.ok(layoutChanges.some(([id, key, value]) => id === 'base-esri-street' && key === 'visibility' && value === 'none'));
        assert.ok(paintChanges.some(([id, key, value]) => id === 'road_service_case' && key === 'line-opacity' && value === 0.35));
        assert.ok(paintChanges.some(([id, key, value]) => id === 'road_service_case' && key === 'line-color' && value === '#ffffff'));
        assert.deepEqual(backgrounds[0].slice(0, 2), ['background-color', '#000000']);
        assert.deepEqual(wrapperClasses, [['remove', 'is-light-basemap']]);
        assert.deepEqual(styleChanges, ['updated']);
    } finally {
        globalThis.document = originalDocument;
    }
});
