import assert from 'node:assert/strict';
import test from 'node:test';
import { setupSidebarCapsuleEvents } from '../scripts/components/sidebar-capsule-events.js';

function createCapsule(tab, active = false) {
    let clickHandler;
    const classes = new Set(active ? ['is-active'] : []);
    return {
        tab,
        addEventListener(name, handler) { if (name === 'click') clickHandler = handler; },
        getAttribute(name) { return name === 'data-tab' ? tab : null; },
        classList: {
            contains: name => classes.has(name),
            add: name => classes.add(name),
            remove: name => classes.delete(name)
        },
        click(event = {}) { clickHandler(event); },
        isActive() { return classes.has('is-active'); }
    };
}

test('switches capsules and returns an active capsule to overview', () => {
    const items = createCapsule('items');
    const organizers = createCapsule('organizers');
    const capsules = [items, organizers];
    const state = { activeTab: 'overview' };
    let renders = 0;
    setupSidebarCapsuleEvents({
        state,
        documentObject: { querySelectorAll: () => capsules },
        onRender: () => renders++
    });
    const event = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };

    organizers.click(event);
    assert.equal(state.activeTab, 'organizers');
    assert.equal(organizers.isActive(), true);
    assert.equal(items.isActive(), false);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
    organizers.click();
    assert.equal(state.activeTab, 'overview');
    assert.equal(organizers.isActive(), false);
    assert.equal(renders, 2);
});

test('reports unsupported capsule views without changing active state', () => {
    const settings = createCapsule('settings');
    const messages = [];
    let renders = 0;
    const state = { activeTab: 'overview' };
    setupSidebarCapsuleEvents({
        state,
        documentObject: { querySelectorAll: () => [settings] },
        onRender: () => renders++,
        notify: message => messages.push(message)
    });

    settings.click();
    assert.deepEqual(messages, ['Settings view is not available (coming soon)']);
    assert.equal(state.activeTab, 'overview');
    assert.equal(renders, 0);
});
