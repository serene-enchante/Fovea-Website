import assert from 'node:assert/strict';
import test from 'node:test';
import { setupAllAppsLiveSearch, setupSearch } from '../scripts/map/map-search.js';

function makeNode({ textContent = '', attributes = {} } = {}) {
    const node = {
        textContent,
        value: '',
        style: {},
        attributes,
        listeners: {},
        classes: new Set(),
        addEventListener(name, callback) { this.listeners[name] = callback; },
        classList: {
            add: name => node.classes.add(name),
            remove: name => node.classes.delete(name)
        },
        getAttribute(name) { return this.attributes[name] ?? null; },
        querySelectorAll(selector) { return this.childrenBySelector?.[selector] || []; },
        querySelector(selector) { return this.childrenBySelector?.[selector] || null; },
        focus() { this.focused = true; }
    };
    return node;
}

function makeSearchFixture({ width = 1024 } = {}) {
    const header = makeNode();
    const toggle = makeNode();
    const close = makeNode();
    const input = makeNode();
    const list = makeNode();
    const items = [
        makeNode({ textContent: 'Zone 01 - Wetland', attributes: { 'data-id': '01' } }),
        makeNode({ textContent: 'Zone 12 - Forest', attributes: { 'data-id': '12' } })
    ];
    list.querySelectorAll = selector => selector === '.tile-zone-item' ? items : [];
    const elements = {
        'sidebar-header': header,
        'btn-search-toggle': toggle,
        'btn-search-close': close,
        'sidebar-search-input': input,
        'sidebar-zone-list': list
    };
    const snapCalls = [];
    const timers = [];
    const scrollCalls = [];
    const appState = { snapState: 'selection-half' };
    const documentObject = { body: { scrollTop: 12 }, getElementById: id => elements[id] || null };
    const windowObject = { innerWidth: width, scrollTo: (...args) => scrollCalls.push(args) };
    setupSearch({
        state: appState,
        documentObject,
        windowObject,
        setMobileSnapState: (...args) => snapCalls.push(args),
        setTimeoutFn: (callback, delay) => timers.push({ callback, delay })
    });
    return { appState, close, documentObject, header, input, items, list, scrollCalls, snapCalls, timers, toggle };
}

test('sidebar search filters by label or ID and Escape closes and restores all rows', () => {
    const fixture = makeSearchFixture();
    fixture.toggle.listeners.click({ preventDefault() {} });
    assert.equal(fixture.input.focused, true);
    fixture.input.listeners.input({ target: { value: '12' } });
    assert.equal(fixture.items[0].style.display, 'none');
    assert.equal(fixture.items[1].style.display, '');

    fixture.input.listeners.keydown({ key: 'Escape' });
    assert.equal(fixture.input.value, '');
    assert.equal(fixture.items[0].style.display, '');
    assert.equal(fixture.items[1].style.display, '');
    assert.equal(fixture.header.classes.has('is-search-active'), false);
});

test('mobile sidebar search restores the previous snap state and scroll position', () => {
    const fixture = makeSearchFixture({ width: 390 });
    fixture.toggle.listeners.click({ preventDefault() {} });
    assert.deepEqual(fixture.snapCalls[0], ['selection-full', true]);
    assert.equal(fixture.timers[0].delay, 100);
    fixture.timers[0].callback();
    assert.equal(fixture.input.focused, true);

    fixture.input.listeners.focus();
    assert.deepEqual(fixture.scrollCalls[0], [0, 0]);
    assert.equal(fixture.documentObject.body.scrollTop, 0);
    fixture.close.listeners.click();
    assert.deepEqual(fixture.snapCalls[1], ['selection-half', true]);
});

test('suggested-app search shows matching cards and clears the query', () => {
    const input = makeNode();
    const clear = makeNode();
    const noResults = makeNode();
    const matching = makeNode({ attributes: { 'data-app-name': 'avenza' } });
    const other = makeNode({ attributes: { 'data-app-name': 'gaia' } });
    matching.querySelector = () => makeNode({ textContent: 'Avenza Maps' });
    other.querySelector = () => makeNode({ textContent: 'Gaia GPS' });
    const grid = makeNode();
    grid.querySelectorAll = () => [matching, other];
    const elements = {
        'all-apps-search-input': input,
        'all-apps-search-clear': clear,
        'all-apps-grid': grid,
        'all-apps-no-results': noResults
    };
    setupAllAppsLiveSearch({ documentObject: { getElementById: id => elements[id] || null } });

    input.value = 'avenza';
    input.listeners.input();
    assert.equal(matching.style.display, '');
    assert.equal(other.style.display, 'none');
    assert.equal(clear.style.display, 'flex');
    assert.equal(noResults.style.display, 'none');

    clear.listeners.click({ stopPropagation() {} });
    assert.equal(input.value, '');
    assert.equal(other.style.display, '');
    assert.equal(clear.style.display, 'none');
    assert.equal(input.focused, true);
});
