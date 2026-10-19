import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createMapInstance,
    switchBaseMap,
    toggleLocationTracking,
    updateUserLocationOnMap,
    checkUserLocationZone
} from '../scripts/map/map-init.js';

test('creates the live map through the injected MapLibre constructor', () => {
    const options = { container: 'tile-map', zoom: 11 };
    let receivedOptions;
    let resizeCount = 0;
    class FakeMap {
        constructor(value) {
            receivedOptions = value;
        }
        resize() { resizeCount += 1; }
    }

    const map = createMapInstance({ Map: FakeMap }, options);

    assert.ok(map instanceof FakeMap);
    assert.equal(receivedOptions, options);
    assert.equal(typeof FakeMap.prototype.invalidateSize, 'function');
    map.invalidateSize();
    assert.equal(resizeCount, 1);
});

test('preserves a MapLibre invalidateSize implementation when already provided', () => {
    const invalidateSize = function() { return 'custom'; };
    class FakeMap {
        resize() { throw new Error('the existing implementation should be preserved'); }
    }
    FakeMap.prototype.invalidateSize = invalidateSize;

    createMapInstance({ Map: FakeMap }, {});

    assert.equal(FakeMap.prototype.invalidateSize, invalidateSize);
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
    const documentObject = {
        body: { classList: { contains: () => false } },
        getElementById(id) {
            if (id === 'tile-map') return { style: { setProperty: (...args) => backgrounds.push(args) } };
            return { classList: { add: value => wrapperClasses.push(['add', value]), remove: value => wrapperClasses.push(['remove', value]) } };
        }
    };

    const state = {
        map,
        baseMapsList: [
            { id: 'default', layerId: 'base-dark-vector' },
            { id: 'satellite', layerId: 'base-satellite' },
            { id: 'esri-street', layerId: 'base-esri-street' },
            { id: 'esri-topo', layerId: 'base-esri-topo' }
        ]
    };

    switchBaseMap('satellite', {
        state,
        documentObject,
        updateStyles: () => styleChanges.push('updated'),
        getRoadColor: layerId => layerId === 'road_service_case' ? '#123456' : undefined
    });

    assert.equal(state.currentBaseLayer, 'satellite');
    assert.ok(layoutChanges.some(([id, key, value]) => id === 'base-satellite' && key === 'visibility' && value === 'visible'));
    assert.ok(layoutChanges.some(([id, key, value]) => id === 'base-esri-street' && key === 'visibility' && value === 'none'));
    assert.ok(paintChanges.some(([id, key, value]) => id === 'road_service_case' && key === 'line-opacity' && value === 0.35));
    assert.ok(paintChanges.some(([id, key, value]) => id === 'road_service_case' && key === 'line-color' && value === '#ffffff'));
    assert.deepEqual(backgrounds[0].slice(0, 2), ['background-color', '#000000']);
    assert.deepEqual(wrapperClasses, [['remove', 'is-light-basemap']]);
    assert.deepEqual(styleChanges, ['updated']);
    switchBaseMap('default', {
        state,
        documentObject,
        updateStyles: () => styleChanges.push('updated'),
        getRoadColor: layerId => layerId === 'road_service_case' ? '#123456' : undefined
    });
    assert.ok(paintChanges.some(([id, key, value]) => id === 'road_service_case' && key === 'line-color' && value === '#123456'));
    assert.equal('_originalRoadColors' in state, false);
});

test('starts and stops geolocation and removes the marker and accuracy layer', () => {
    const calls = [];
    const classes = [];
    const documentObject = {
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

    toggleLocationTracking(state, { geolocation, documentObject, checkLocation: value => checked.push(value) });
    assert.equal(state.isLocating, true);
    toggleLocationTracking(state, { geolocation, documentObject, checkLocation: value => checked.push(value) });

    assert.equal(state.isLocating, false);
    assert.equal(state.userLocationMarker, null);
    assert.deepEqual(calls.map(([name]) => name), ['watch', 'clear', 'remove-marker', 'remove-layer', 'remove-source']);
    assert.deepEqual(calls[1], ['clear', 42]);
    assert.deepEqual(checked, [null]);
    assert.deepEqual(classes, [['add', 'is-active'], ['remove', 'is-active']]);
});

test('renders and updates the user marker and accuracy polygon', () => {
    let markerElement;
    let accuracyFeature;
    class FakeMarker {
        constructor(options) { markerElement = options.element; }
        setLngLat(value) { this.position = value; return this; }
        addTo(map) { this.map = map; return this; }
        getLngLat() { return { lng: this.position[0], lat: this.position[1] }; }
    }
    const documentObject = { createElement: () => ({ setAttribute() {}, className: '', innerHTML: '' }) };
    const mapLibre = { Marker: FakeMarker };
    const map = {
        isStyleLoaded: () => true,
        getSource: () => undefined,
        addSource: (id, source) => { accuracyFeature = source.data; },
        addLayer: () => {}
    };
    const state = { map, isLocating: true, allFeatures: [] };
    const checked = [];

    updateUserLocationOnMap(-123, 44, 100, state, value => checked.push(value), { documentObject, mapLibre });

    assert.equal(state.userLocationAccuracy, 100);
    assert.deepEqual(state.userLocationMarker.getLngLat(), { lng: -123, lat: 44 });
    assert.equal(markerElement.className, 'user-location-marker');
    assert.equal(accuracyFeature.geometry.type, 'Polygon');
    assert.equal(accuracyFeature.geometry.coordinates[0].length, 65);
    assert.deepEqual(checked, [{ lng: -123, lat: 44 }]);
});

test('updates the location badge through an injected document', () => {
    const classes = [];
    const badge = {
        innerHTML: '',
        classList: {
            add: value => classes.push(['add', value]),
            remove: value => classes.push(['remove', value])
        }
    };
    const documentObject = { getElementById: id => id === 'user-location-badge' ? badge : null };
    const state = {
        isLocating: true,
        isCirclesFeature: false,
        allFeatures: [{
            properties: { zid: '04' },
            geometry: { type: 'Polygon', coordinates: [[[-124, 43], [-122, 43], [-122, 45], [-124, 45], [-124, 43]]] }
        }]
    };

    checkUserLocationZone({ lng: -123, lat: 44 }, state, documentObject);

    assert.match(badge.innerHTML, /You are in Zone 04/);
    assert.deepEqual(classes, [['add', 'is-visible']]);
});
