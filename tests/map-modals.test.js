import assert from 'node:assert/strict';
import test from 'node:test';
import { setupHelpModeSystem } from '../scripts/components/map-modals.js';

function makeNode() {
    const node = {
        checked: false,
        style: {},
        listeners: {},
        classes: new Set(),
        attributes: {},
        classList: {
            add: name => node.classes.add(name),
            remove: name => node.classes.delete(name),
            contains: name => node.classes.has(name)
        },
        addEventListener(name, callback) { this.listeners[name] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; }
    };
    return node;
}

function setup() {
    const toggle = makeNode();
    const tooltip = makeNode();
    const highlight = makeNode();
    const docLink = makeNode();
    const nodes = {
        'toggle-help-mode': toggle,
        'help-mode-tooltip': tooltip,
        'help-mode-highlight': highlight
    };
    const listeners = {};
    let observerCallback;
    let observerOptions;
    const state = { isHelpModeActive: false };
    const notifications = [];
    const fullscreenCalls = [];
    let actionStateUpdates = 0;
    const documentObject = {
        body: { classList: { add: name => bodyClasses.add(name), remove: name => bodyClasses.delete(name) } },
        activeElement: null,
        getElementById: id => nodes[id] || null,
        querySelector: () => docLink,
        querySelectorAll: () => [],
        addEventListener(name, callback, capture) { listeners[`${name}:${Boolean(capture)}`] = callback; }
    };
    const bodyClasses = new Set();
    class Observer {
        constructor(callback) { observerCallback = callback; }
        observe(_target, options) { observerOptions = options; }
    }
    const windowObject = {
        innerWidth: 1024,
        innerHeight: 768,
        matchMedia: () => ({ matches: false }),
        updateActionButtonsState() { actionStateUpdates += 1; }
    };
    setupHelpModeSystem({
        state,
        documentObject,
        windowObject,
        navigatorObject: { maxTouchPoints: 0 },
        MutationObserverClass: Observer,
        notify: message => notifications.push(message),
        renderSidebarList() {},
        updateKeyboardFocus() {},
        onToggleFullscreen: () => fullscreenCalls.push(true),
        onCopyLink() {},
        onSelectMapStyle() {}
    });
    return {
        actionStateUpdates, bodyClasses, docLink, documentObject, fullscreenCalls,
        get observerCallback() { return observerCallback; },
        get observerOptions() { return observerOptions; },
        listeners, notifications, state, toggle, tooltip
    };
}

test('help-mode setup uses injected browser and action dependencies', () => {
    const fixture = setup();
    fixture.toggle.listeners.change({ target: { checked: true } });
    assert.equal(fixture.state.isHelpModeActive, true);
    assert.equal(fixture.bodyClasses.has('is-help-mode-active'), true);
    assert.deepEqual(fixture.observerOptions, { childList: true, subtree: true });

    let prevented = false;
    fixture.docLink.listeners.click({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.deepEqual(fixture.notifications, ['Documentation not available (coming soon)']);

    fixture.listeners['keydown:false']({ key: 'f', shiftKey: true, code: '', preventDefault() {} });
    assert.deepEqual(fixture.fullscreenCalls, [true]);
});

test('keyboard help toggle and dynamic content observer follow injected state', () => {
    const fixture = setup();
    fixture.listeners['keydown:false']({ key: 'h', shiftKey: false, code: '', preventDefault() {} });
    assert.equal(fixture.state.isHelpModeActive, true);
    assert.deepEqual(fixture.notifications, ['Interactive Help Mode: Enabled']);
    fixture.observerCallback();
    assert.equal(fixture.bodyClasses.has('is-help-mode-active'), true);
});
