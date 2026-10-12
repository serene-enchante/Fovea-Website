import assert from 'node:assert/strict';
import test from 'node:test';
import { setupMapPageNavigation } from '../scripts/map/map-page-navigation.js';

function makeNode() {
    const classes = new Set();
    return {
        style: {},
        listeners: {},
        classList: {
            add: name => classes.add(name),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name)
        },
        addEventListener(name, callback) { this.listeners[name] = callback; }
    };
}

function setup({ state: stateOverrides = {}, width = 1024, githubToken = null } = {}) {
    const editButton = makeNode();
    const backButton = makeNode();
    const list = makeNode();
    const elements = {
        'btn-edit-item': editButton,
        'btn-capsule-back': backButton,
        'sidebar-zone-list': list
    };
    const timers = [];
    const selected = [];
    const cleared = [];
    const switched = [];
    const appState = { currentId: 'ecbc-circle', isCirclesFeature: true, selectedBird: null, ...stateOverrides };
    const windowObject = {
        innerWidth: width,
        localStorage: { getItem: key => key === 'github_token' ? githubToken : null },
        sessionStorage: { getItem: () => null },
        location: { href: '' }
    };
    setupMapPageNavigation({
        state: appState,
        circleId: 'ecbc-circle',
        normalizeZoneId: id => String(id).toUpperCase(),
        clearBirdObservations: () => cleared.push(true),
        selectSubject: (...args) => selected.push(args),
        switchToCirclesFeature: () => switched.push(true),
        documentObject: { getElementById: id => elements[id] || null },
        windowObject,
        setTimeoutFn: (callback, delay) => timers.push({ callback, delay })
    });
    return { appState, backButton, cleared, editButton, list, selected, switched, timers, windowObject };
}

test('editor action is hidden without a session and opens the normalized current zone', () => {
    const fixture = setup({ state: { currentId: '19a' }, githubToken: 'token' });
    assert.equal(fixture.editButton.style.display, '');
    fixture.editButton.listeners.click({ stopPropagation() {} });
    assert.equal(fixture.windowObject.location.href, '/editor/?id=19A');

    const loggedOut = setup();
    assert.equal(loggedOut.editButton.style.display, 'none');
});

test('mobile back navigation animates before returning from a bird selection', () => {
    const fixture = setup({ width: 390, state: { currentId: '19a', isCirclesFeature: false, selectedBird: 'warbler' } });
    let prevented = false;
    let stopped = false;
    fixture.backButton.listeners.click({ preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });

    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.deepEqual(fixture.timers.map(timer => timer.delay), [200]);
    fixture.timers[0].callback();
    assert.deepEqual(fixture.cleared, [true]);
    assert.deepEqual(fixture.selected, [['19a', true, true]]);
    assert.ok(fixture.list.classList.contains('fly-in-left-active'));
    assert.equal(fixture.timers[1].delay, 250);
    fixture.timers[1].callback();
    assert.equal(fixture.list.classList.contains('fly-in-left-active'), false);
});

test('back navigation returns from a local circle to the all-circles view', () => {
    const fixture = setup({ state: { currentId: 'ecbc-circle', isCirclesFeature: false } });
    fixture.backButton.listeners.click({});
    assert.deepEqual(fixture.switched, [true]);
    assert.deepEqual(fixture.selected, []);
});
