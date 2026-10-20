import assert from 'node:assert/strict';
import test from 'node:test';
import { runMapPageStartup } from '../scripts/map/map-page-startup.js';

function classList() {
    const classes = new Set();
    return {
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        toggle: (name, force) => {
            if (force) classes.add(name);
            else classes.delete(name);
        },
        contains: name => classes.has(name)
    };
}

function createDocument() {
    const attributes = {};
    const bodyClasses = classList();
    const rootClasses = classList();
    const overlayClasses = classList();
    return {
        body: { classList: bodyClasses },
        documentElement: {
            classList: rootClasses,
            setAttribute: (name, value) => { attributes[name] = value; }
        },
        getElementById: id => id === 'page-transition-overlay'
            ? { classList: overlayClasses }
            : null,
        attributes,
        bodyClasses,
        rootClasses,
        overlayClasses
    };
}

test('starts the map page in order and waits briefly for the loaded map before entrance', async () => {
    const calls = [];
    const timers = [];
    const state = {
        isCirclesFeature: false,
        currentFeature: 'eugene',
        currentId: '04',
        map: { loaded: () => true, resize: () => calls.push('resize') }
    };
    const documentObject = createDocument();

    await runMapPageStartup({
        state,
        storageObject: { getItem: () => 'auto' },
        documentObject,
        windowObject: { matchMedia: () => ({ matches: true }) },
        schedule: (callback, delay) => timers.push({ callback, delay }),
        getInitialId: () => '04',
        loadFeatures: async name => {
            calls.push(`load:${name}`);
            return ['feature'];
        },
        initializeMap: () => calls.push('map'),
        setupPageUi: () => calls.push('ui'),
        selectSubject: (...args) => calls.push(['select', ...args]),
        notify: message => calls.push(['notify', message]),
        updateHeader: message => calls.push(['header', message])
    });

    assert.equal(documentObject.attributes['data-theme'], 'light');
    assert.equal(documentObject.rootClasses.contains('theme-light'), true);
    assert.equal(state.currentBaseLayer, 'default');
    assert.deepEqual(state.allFeatures, ['feature']);
    assert.deepEqual(calls.slice(0, 4), ['load:eugene', 'map', 'ui', ['select', '04', true, false]]);
    assert.equal(calls.includes('sidebar'), false, 'startup leaves the initial sidebar render to the selection flow');
    assert.deepEqual(timers.map(timer => timer.delay), [80]);

    timers[0].callback();
    timers[0].callback();
    assert.equal(documentObject.bodyClasses.contains('is-transitioning'), false);
    assert.equal(documentObject.overlayClasses.contains('is-loaded'), true);
    assert.equal(documentObject.overlayClasses.contains('is-active'), false);
    assert.deepEqual(calls.slice(-2), ['resize', ['select', '04', true, false, { mapViewOnly: true }]]);
    assert.equal(calls.filter(call => call === 'resize').length, 1, 'repeated entrance signals should resize the map once');
    assert.equal(calls.filter(call => Array.isArray(call) && call[0] === 'select').length, 2, 'startup restores the selected map view only once');
});

test('reports startup data failures and removes the transition overlay state', async () => {
    const calls = [];
    const documentObject = createDocument();
    documentObject.bodyClasses.add('is-transitioning');
    documentObject.overlayClasses.add('is-active');

    await runMapPageStartup({
        state: { isCirclesFeature: true, currentFeature: 'circles', currentId: 'ecbc-circle', map: null },
        storageObject: { getItem: () => 'dark' },
        documentObject,
        windowObject: {},
        getInitialId: () => 'ecbc-circle',
        loadFeatures: async () => { throw new Error('offline'); },
        renderSidebarList: () => {},
        initializeMap: () => {},
        setupPageUi: () => {},
        selectSubject: (...args) => calls.push(['select', ...args]),
        notify: () => {},
        updateHeader: message => calls.push(['header', message]),
        logError: (...args) => calls.push(['error', ...args])
    });

    assert.equal(calls[0][0], 'error');
    assert.deepEqual(calls[1], ['header', 'Error loading map data']);
    assert.equal(documentObject.bodyClasses.contains('is-transitioning'), false);
    assert.equal(documentObject.overlayClasses.contains('is-loaded'), true);
    assert.equal(documentObject.overlayClasses.contains('is-active'), false);
});
