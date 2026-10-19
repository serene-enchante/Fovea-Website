import assert from 'node:assert/strict';
import test from 'node:test';
import { createDownloadWizardAppHandoff } from '../scripts/components/download-wizard-app-handoff.js';

function element() {
    const classes = new Set();
    const listeners = {};
    return {
        classes,
        listeners,
        dataset: {},
        attributes: {},
        classList: {
            add: (...items) => items.forEach(item => classes.add(item)),
            remove: (...items) => items.forEach(item => classes.delete(item)),
            contains: item => classes.has(item)
        },
        addEventListener(type, callback) { listeners[type] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; },
        querySelectorAll() { return this.closeButtons || []; }
    };
}

function harness() {
    const modal = element();
    const appCard = element();
    appCard.dataset.app = 'test-app';
    const downloadButton = element();
    const openButton = element();
    const icon = element();
    const target = element();
    const thumbnail = element();
    const heading1 = element();
    const heading2 = element();
    const stepText = element();
    const closeButton = element();
    modal.closeButtons = [closeButton];
    const elements = {
        'avenza-instruction-modal': modal,
        'avenza-modal-download-btn': downloadButton,
        'avenza-modal-open-btn': openButton,
        'avenza-modal-app-icon': icon,
        'avenza-target-name': target,
        'avenza-selection-thumb': thumbnail,
        'avenza-step1-heading': heading1,
        'avenza-step2-heading': heading2,
        'avenza-step2-text': stepText
    };
    const windowListeners = {};
    const documentObject = {
        getElementById: id => elements[id] || null,
        querySelectorAll: selector => selector === '.wizard-app-card' ? [appCard] : []
    };
    const windowObject = {
        location: {},
        addEventListener: (type, callback) => { windowListeners[type] = callback; }
    };
    const blob = { file: true };
    const calls = [];
    const state = {
        selectedCircle: { name: 'Test Circle', thumbnail: 'circle.png' },
        selectedZone: { properties: { zid: '4' } },
        activeGeneratedBlob: null,
        activeGeneratedFilename: null
    };
    const handoff = createDownloadWizardAppHandoff({
        state,
        appInstructions: { 'test-app': {
            appName: 'Test App', ext: 'json', formatKey: 'geojson', iconSrc: 'app.png',
            scheme: 'test://open', step1Heading: 'Step one', step2Heading: 'Step two', step2Text: '<b>Instructions</b>'
        } },
        getExportGeoJSON: () => ({ type: 'FeatureCollection', features: [] }),
        getDownloadFilename: ext => `map.${ext}`,
        generateGeoPdfBlob: () => Promise.resolve({ blob, filename: 'map.pdf' }),
        generateGeoTiffBlob: () => Promise.resolve({ blob, filename: 'map.tif' }),
        geojsonToKml: () => '<kml/>',
        geojsonToGpx: () => '<gpx/>',
        downloadBlob: (...args) => calls.push(['download', ...args]),
        showToast: message => calls.push(['toast', message]),
        resolveAssetPath: path => `root/${path}`,
        documentObject,
        windowObject,
        consoleObject: { error: (...args) => calls.push(['error', ...args]) },
        BlobConstructor: class BlobMock {}
    });
    return { handoff, state, calls, blob, modal, appCard, downloadButton, openButton, icon, target, thumbnail, heading1, heading2, stepText, closeButton, windowListeners, windowObject };
}

test('app card click prepares export in background and opens the instruction modal', async () => {
    const h = harness();
    h.handoff.setupAppCards();
    h.appCard.listeners.click();

    assert.equal(h.modal.classes.has('is-open'), true);
    assert.equal(h.modal.attributes['aria-hidden'], 'false');
    assert.equal(h.icon.src, 'root/app.png');
    assert.equal(h.target.textContent, 'Zone 04');
    assert.equal(h.thumbnail.src, 'root/circle.png');
    assert.equal(h.heading1.textContent, 'Step one');
    assert.equal(h.heading2.textContent, 'Step two');
    await h.downloadButton.onclick();
    assert.equal(h.state.activeGeneratedBlob.constructor.name, 'BlobMock');
    assert.deepEqual(h.calls.find(([type]) => type === 'download'), ['download', h.state.activeGeneratedBlob, 'map.json']);
    assert.deepEqual(h.calls.filter(([type]) => type === 'toast').at(-1), ['toast', 'Downloaded map.json']);
});

test('modal open action launches the configured scheme and close controls dismiss it', () => {
    const h = harness();
    h.handoff.handleAppCardClick('test-app');
    const event = { preventDefault() { this.prevented = true; } };
    h.openButton.onclick(event);
    assert.equal(event.prevented, true);
    assert.equal(h.windowObject.location.href, 'test://open');

    h.handoff.setupModalEvents();
    h.closeButton.listeners.click();
    assert.equal(h.modal.classes.has('is-open'), false);
    assert.equal(h.modal.attributes['aria-hidden'], 'true');
    h.handoff.handleAppCardClick('test-app');
    h.windowListeners.keydown({ key: 'Escape' });
    assert.equal(h.modal.classes.has('is-open'), false);
});
