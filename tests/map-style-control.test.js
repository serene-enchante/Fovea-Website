import assert from 'node:assert/strict';
import test from 'node:test';
import { setupMapStyleControl } from '../scripts/map/map-style-control.js';

function makeNode() {
    const classes = new Set();
    return {
        children: [],
        listeners: {},
        attributes: {},
        style: { setProperty() {} },
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name)
        },
        appendChild(node) { this.children.push(node); },
        addEventListener(name, callback) { this.listeners[name] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; },
        getAttribute(name) { return this.attributes[name]; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        contains() { return true; },
        focus() {}
    };
}

function setupFixture() {
    const elements = [];
    const listContainer = makeNode();
    const header = makeNode();
    const body = makeNode();
    const searchInput = makeNode();
    const searchToggle = makeNode();
    const searchClose = makeNode();
    const close = makeNode();
    const basemapsTab = Object.assign(makeNode(), { attributes: { 'data-tab': 'basemaps' } });
    const layersTab = Object.assign(makeNode(), { attributes: { 'data-tab': 'layers' } });
    basemapsTab.getAttribute = name => basemapsTab.attributes[name];
    layersTab.getAttribute = name => layersTab.attributes[name];
    listContainer.querySelector = selector => ({
        '.map-ctrl-styles__header': header,
        '.map-ctrl-styles__body': body,
        '.modal-search-input': searchInput,
        '.modal-search-toggle-btn': searchToggle,
        '.modal-search-close-btn': searchClose,
        '.modal-close-btn': close
    })[selector] || null;
    listContainer.querySelectorAll = selector => selector === '.modal-capsule' ? [basemapsTab, layersTab] : [];

    let created = 0;
    const documentObject = {
        addEventListener() {},
        createElement: () => {
            created += 1;
            if (created === 3) return listContainer;
            const element = makeNode();
            elements.push(element);
            return element;
        }
    };
    const selected = [];
    const switched = [];
    const state = {
        isCirclesFeature: true,
        currentFeature: 'circles',
        currentId: 'ecbc-circle',
        circlesFeatures: [],
        allFeatures: [],
        currentBaseLayer: 'default'
    };
    const topLeft = makeNode();
    const control = setupMapStyleControl({
        topLeft,
        state,
        documentObject,
        onSelectSubject: (...args) => selected.push(args),
        onSwitchBaseMap: id => switched.push(id),
        notify: message => switched.push(message)
    });
    return { control, elements, topLeft, body, layersTab, searchInput, selected, switched, state };
}

test('renders map layers and basemaps through injected selection actions', () => {
    const fixture = setupFixture();
    const { control, body, layersTab, selected, switched } = fixture;

    layersTab.listeners.click({ preventDefault() {}, stopPropagation() {} });
    const layerRow = body.children.at(-1);
    assert.match(layerRow.innerHTML, /Coast to Cascades Bird Alliance/);
    assert.match(layerRow.innerHTML, /wetlands-thumb\.webp/);
    layerRow.listeners.click({ preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(selected, [['ecbc-circle', true]]);

    control.renderContent();
    assert.match(control.layersDiv.className, /map-ctrl-styles/);
    assert.ok(control.listContainer.style);
    assert.equal(switched.length, 0);
});

test('filters the map layers tab and exposes a no-results state', () => {
    const fixture = setupFixture();
    fixture.layersTab.listeners.click({ preventDefault() {}, stopPropagation() {} });
    fixture.searchInput.value = 'does not exist';
    fixture.searchInput.listeners.input();
    assert.match(fixture.body.innerHTML, /No layers found/);
});
