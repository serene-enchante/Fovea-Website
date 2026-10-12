import assert from 'node:assert/strict';
import test from 'node:test';
import { setupMapNavigationControls } from '../scripts/map/map-controls.js';

function createDocument() {
    const elements = [];
    return {
        elements,
        querySelector: () => null,
        createElement: tagName => {
            const element = {
                tagName,
                children: [],
                listeners: {},
                appendChild(child) { this.children.push(child); },
                addEventListener(name, listener) { this.listeners[name] = listener; },
                setAttribute(name, value) { this[name] = value; },
                querySelector(selector) {
                    const className = selector.split('.').filter(Boolean).pop();
                    return this.children.flatMap(child => [child, ...child.children]).find(child => child.className?.includes(className)) || null;
                }
            };
            elements.push(element);
            return element;
        }
    };
}

test('creates zoom, locate, and fullscreen controls with injected actions', () => {
    const documentObject = createDocument();
    const zoomCalls = [];
    const actions = [];
    const state = { map: { zoomIn: () => zoomCalls.push('in'), zoomOut: () => zoomCalls.push('out') } };
    const wrapper = { children: [], appendChild(child) { this.children.push(child); } };
    const controls = setupMapNavigationControls({
        mapWrapper: wrapper,
        state,
        documentObject,
        onLocate: value => actions.push(['locate', value]),
        onToggleFullscreen: () => actions.push(['fullscreen'])
    });

    assert.equal(wrapper.children[0], controls.controlContainer);
    assert.equal(controls.topLeft.children.length, 3);
    const invoke = className => {
        const button = documentObject.elements.find(element => element.className === className);
        const event = { preventDefault() {}, stopPropagation() {} };
        button.listeners.click(event);
    };
    invoke('map-ctrl-zoom-in');
    invoke('map-ctrl-zoom-out');
    invoke('map-ctrl-locate-btn');
    invoke('map-ctrl-fullscreen-btn');

    assert.deepEqual(zoomCalls, ['in', 'out']);
    assert.deepEqual(actions, [['locate', state], ['fullscreen']]);
});
