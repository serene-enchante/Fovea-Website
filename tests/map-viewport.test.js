import assert from 'node:assert/strict';
import test from 'node:test';
import { setupMapEffectsAndFullscreen, setupMapViewportEffects } from '../scripts/map/map-viewport.js';

test('tracks desktop pointer position and resets it when leaving the map', () => {
    const properties = [];
    const mapWrapper = {
        style: { setProperty: (...args) => properties.push(args) },
        getBoundingClientRect: () => ({ left: 10, top: 20 })
    };
    const windowObject = { innerWidth: 1024, addEventListener() {} };
    setupMapViewportEffects(mapWrapper, {
        windowObject,
        documentObject: { addEventListener() {} }
    });

    mapWrapper.onmousemove({ clientX: 30, clientY: 55 });
    mapWrapper.onmouseleave();
    assert.deepEqual(properties, [
        ['--mouse-x', '20px'], ['--mouse-y', '35px'],
        ['--mouse-x', '-1000px'], ['--mouse-y', '-1000px']
    ]);
});

test('connects resize and fullscreen events to injected effects', () => {
    const windowListeners = new Map();
    const documentListeners = new Map();
    const classes = new Set();
    const calls = [];
    const mapWrapper = {
        classList: {
            add(value) { classes.add(value); },
            remove(value) { classes.delete(value); }
        }
    };
    const windowObject = {
        innerWidth: 400,
        addEventListener(name, listener) { windowListeners.set(name, listener); }
    };
    const documentObject = {
        fullscreenElement: {},
        addEventListener(name, listener) { documentListeners.set(name, listener); }
    };
    setupMapViewportEffects(mapWrapper, {
        windowObject,
        documentObject,
        onResize: () => calls.push('resize'),
        onMobileHomeAnimation: () => calls.push('animate')
    });

    documentListeners.get('fullscreenchange')();
    assert.equal(classes.has('is-fullscreen'), true);
    documentObject.fullscreenElement = null;
    documentListeners.get('fullscreenchange')();
    windowListeners.get('resize')();
    windowListeners.get('orientationchange')();

    assert.equal(classes.has('is-fullscreen'), false);
    assert.deepEqual(calls, ['resize', 'animate', 'resize', 'resize', 'resize']);
});

test('owns map resize, delayed invalidation, and mobile home animation', () => {
    const windowListeners = new Map();
    const documentListeners = new Map();
    const animations = [];
    const calls = [];
    const targets = [{
        offsetWidth: 10,
        classList: {
            remove: name => animations.push(['remove', name]),
            add: name => animations.push(['add', name])
        }
    }];
    const scheduled = [];
    const state = { map: { invalidateSize: () => calls.push('invalidate') } };
    const mapWrapper = { classList: { add() {}, remove() {} } };
    const windowObject = {
        innerWidth: 400,
        addEventListener: (name, listener) => windowListeners.set(name, listener)
    };
    const documentObject = {
        fullscreenElement: {},
        querySelectorAll: () => targets,
        addEventListener: (name, listener) => documentListeners.set(name, listener)
    };

    setupMapEffectsAndFullscreen(mapWrapper, {
        state,
        windowObject,
        documentObject,
        schedule: (callback, delay) => scheduled.push([callback, delay]),
        updateControlPositions: () => calls.push('controls'),
        adjustHeaderFontSize: () => calls.push('header'),
        updateLabelZoomVisibility: () => calls.push('labels')
    });

    windowListeners.get('resize')();
    documentObject.fullscreenElement = null;
    documentListeners.get('fullscreenchange')();
    assert.deepEqual(calls, ['controls', 'header', 'invalidate', 'labels', 'controls', 'header', 'invalidate', 'labels']);
    assert.deepEqual(scheduled.map(([, delay]) => delay), [50, 200, 400, 50, 200, 400]);
    assert.deepEqual(animations, [
        ['remove', 'animate-mobile-slide-down'],
        ['add', 'animate-mobile-slide-down']
    ]);
});
