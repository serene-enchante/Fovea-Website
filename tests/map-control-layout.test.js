import assert from 'node:assert/strict';
import test from 'node:test';
import { updateMapControlPositions } from '../scripts/map/map-control-layout.js';

function createLayoutHarness() {
    const selectors = [
        '.map-ctrl-container .map-ctrl-panel.map-ctrl-panel--left',
        '.map-ctrl-container .map-ctrl-panel.map-ctrl-panel--right',
        '.map-ctrl-zoom', '.map-ctrl-locate', '.map-ctrl-fullscreen', '.map-ctrl-styles'
    ];
    const elements = new Map(selectors.slice(2).map(selector => [selector, { selector }]));
    for (const selector of selectors.slice(0, 2)) {
        elements.set(selector, { children: [], appendChild(child) { this.children.push(child.selector); } });
    }
    return {
        documentObject: { querySelector: selector => elements.get(selector) },
        elements
    };
}

test('places controls in the responsive mobile panels', () => {
    const { documentObject, elements } = createLayoutHarness();
    updateMapControlPositions({ documentObject, isMobile: true });
    assert.deepEqual(elements.get('.map-ctrl-container .map-ctrl-panel.map-ctrl-panel--right').children, [
        '.map-ctrl-zoom'
    ]);
    assert.deepEqual(elements.get('.map-ctrl-container .map-ctrl-panel.map-ctrl-panel--left').children, [
        '.map-ctrl-styles', '.map-ctrl-locate', '.map-ctrl-fullscreen'
    ]);
});

test('stacks controls in desktop order in the left panel', () => {
    const { documentObject, elements } = createLayoutHarness();
    updateMapControlPositions({ documentObject, isMobile: false });
    assert.deepEqual(elements.get('.map-ctrl-container .map-ctrl-panel.map-ctrl-panel--left').children, [
        '.map-ctrl-zoom', '.map-ctrl-fullscreen', '.map-ctrl-locate', '.map-ctrl-styles'
    ]);
    assert.deepEqual(elements.get('.map-ctrl-container .map-ctrl-panel.map-ctrl-panel--right').children, []);
});
