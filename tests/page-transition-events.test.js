import assert from 'node:assert/strict';
import test from 'node:test';
import { setupPageTransitionEvents } from '../scripts/components/page-transition-events.js';

function makeNode(href = null) {
    const classes = new Set();
    return {
        href,
        listeners: {},
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name)
        },
        addEventListener(name, callback) { this.listeners[name] = callback; },
        getAttribute(name) { return name === 'href' ? this.href : null; }
    };
}

function setup({ withOverlay = true, links = true, transitionToPage } = {}) {
    const desktop = links ? makeNode('/home/') : null;
    const mobile = links ? makeNode(null) : null;
    const logo = links ? makeNode('../') : null;
    const overlay = withOverlay ? makeNode() : null;
    const bodyClasses = new Set(['is-transitioning']);
    const documentObject = {
        body: { classList: { remove: name => bodyClasses.delete(name), contains: name => bodyClasses.has(name) } },
        getElementById: id => ({
            'desktop-nav-tab-home': desktop,
            'mobile-nav-tab-home': mobile,
            'page-transition-overlay': overlay
        })[id] || null,
        querySelector: () => logo
    };
    const timers = [];
    const windowObject = {
        listeners: {},
        location: { href: '' },
        transitionToPage,
        addEventListener(name, callback) { this.listeners[name] = callback; }
    };
    setupPageTransitionEvents({
        documentObject,
        windowObject,
        setTimeoutFn: (callback, delay) => timers.push({ callback, delay })
    });
    return { bodyClasses, desktop, logo, mobile, overlay, timers, windowObject };
}

test('home links delegate navigation to the shared transition when available', () => {
    const destinations = [];
    const fixture = setup({ transitionToPage: destination => destinations.push(destination) });
    let prevented = false;
    let stopped = false;
    fixture.desktop.listeners.click({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
    assert.deepEqual(destinations, ['/home/']);
    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.deepEqual(fixture.timers, []);
});

test('home links animate the overlay before navigating when no shared transition exists', () => {
    const fixture = setup();
    fixture.logo.listeners.click({ preventDefault() {}, stopPropagation() {} });
    assert.equal(fixture.overlay.classList.contains('is-active'), true);
    assert.equal(fixture.overlay.classList.contains('is-loaded'), false);
    assert.equal(fixture.timers[0].delay, 500);
    fixture.timers[0].callback();
    assert.equal(fixture.windowObject.location.href, '../');
});

test('back-forward cache pageshow resets the transition overlay', () => {
    const fixture = setup();
    fixture.windowObject.listeners.pageshow({ persisted: false });
    assert.equal(fixture.bodyClasses.has('is-transitioning'), true);
    fixture.windowObject.listeners.pageshow({ persisted: true });
    assert.equal(fixture.bodyClasses.has('is-transitioning'), false);
    assert.equal(fixture.overlay.classList.contains('is-loaded'), true);
    assert.equal(fixture.overlay.classList.contains('is-active'), false);
});
