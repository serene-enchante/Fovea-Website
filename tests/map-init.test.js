import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createMapInstance,
    switchBaseMap,
    toggleLocationTracking,
    updateUserLocationOnMap
} from '../scripts/map/map-init.js';

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

test('starts and stops geolocation and removes the marker and accuracy layer', () => {
    const calls = [];
    const classes = [];
    const originalDocument = globalThis.document;
    globalThis.document = {
        querySelector: () => ({ classList: {
            add: value => classes.push(['add', value]),
            remove: value => classes.push(['remove', value])
        } })
    };
    const geolocation = {
        watchPosition(success, error, options) {
            calls.push(['watch', options]);
            return 42;
        },
        clearWatch(id) { calls.push(['clear', id]); }
    };
    const state = {
        map: {
            getSource: id => id === 'user-accuracy-source' ? {} : undefined,
            getLayer: id => id === 'user-accuracy-layer' ? {} : undefined,
            removeLayer: id => calls.push(['remove-layer', id]),
            removeSource: id => calls.push(['remove-source', id])
        },
        isLocating: false,
        userLocationMarker: { remove: () => calls.push(['remove-marker']) },
        allFeatures: []
    };
    const checked = [];

    try {
        toggleLocationTracking(state, { geolocation, checkLocation: value => checked.push(value) });
        assert.equal(state.isLocating, true);
        toggleLocationTracking(state, { geolocation, checkLocation: value => checked.push(value) });
    } finally {
        globalThis.document = originalDocument;
    }

    assert.equal(state.isLocating, false);
    assert.equal(state.userLocationMarker, null);
    assert.deepEqual(calls.map(([name]) => name), ['watch', 'clear', 'remove-marker', 'remove-layer', 'remove-source']);
    assert.deepEqual(calls[1], ['clear', 42]);
    assert.deepEqual(checked, [null]);
    assert.deepEqual(classes, [['add', 'is-active'], ['remove', 'is-active']]);
});

test('renders and updates the user marker and accuracy polygon', () => {
    const originalDocument = globalThis.document;
    const originalMapLibre = globalThis.maplibregl;
    let markerElement;
    let accuracyFeature;
    class FakeMarker {
        constructor(options) { markerElement = options.element; }
        setLngLat(value) { this.position = value; return this; }
        addTo(map) { this.map = map; return this; }
        getLngLat() { return { lng: this.position[0], lat: this.position[1] }; }
    }
    globalThis.document = { createElement: () => ({ setAttribute() {}, className: '', innerHTML: '' }) };
    globalThis.maplibregl = { Marker: FakeMarker };
    const map = {
        isStyleLoaded: () => true,
        getSource: () => undefined,
        addSource: (id, source) => { accuracyFeature = source.data; },
        addLayer: () => {}
    };
    const state = { map, isLocating: true, allFeatures: [] };
    const checked = [];

    try {
        updateUserLocationOnMap(-123, 44, 100, state, value => checked.push(value));
    } finally {
        globalThis.document = originalDocument;
        globalThis.maplibregl = originalMapLibre;
    }

    assert.equal(state.userLocationAccuracy, 100);
    assert.deepEqual(state.userLocationMarker.getLngLat(), { lng: -123, lat: 44 });
    assert.equal(markerElement.className, 'user-location-marker');
    assert.equal(accuracyFeature.geometry.type, 'Polygon');
    assert.equal(accuracyFeature.geometry.coordinates[0].length, 65);
    assert.deepEqual(checked, [{ lng: -123, lat: 44 }]);
});
