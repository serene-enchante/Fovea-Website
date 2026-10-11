import assert from 'node:assert/strict';
import test from 'node:test';
import { CIRCLE_ID } from '../scripts/config/app-config.js';
import { syncSidebarTabs } from '../scripts/components/sidebar-tabs.js';

function createDocument() {
    const capsules = ['observations', 'birds', 'organizers', 'resources', 'items'].map(tab => {
        const capsule = {
            tab,
            style: {},
            textContent: '',
            active: false,
            getAttribute(name) { return name === 'data-tab' ? this.tab : null; },
            classList: {
                add() { capsule.active = true; },
                remove() { capsule.active = false; }
            }
        };
        return capsule;
    });
    return {
        capsules,
        querySelector(selector) {
            const tab = selector.match(/data-tab="([^"]+)"/)?.[1];
            return capsules.find(capsule => capsule.tab === tab) || null;
        },
        querySelectorAll() { return capsules; }
    };
}

test('normalizes unavailable sidebar tabs and updates capsule visibility', () => {
    const documentObject = createDocument();
    const state = {
        activeTab: 'birds', selectedBird: null, currentId: CIRCLE_ID, isCirclesFeature: true
    };

    assert.equal(syncSidebarTabs(state, documentObject), true);
    assert.equal(state.activeTab, 'overview');
    assert.equal(documentObject.querySelector('[data-tab="birds"]').style.display, 'none');
    assert.equal(documentObject.querySelector('[data-tab="items"]').textContent, 'Circles');
});

test('shows observations for a selected bird and marks its active tab', () => {
    const documentObject = createDocument();
    const state = {
        activeTab: 'observations', selectedBird: { name: 'Osprey' }, currentId: CIRCLE_ID,
        isCirclesFeature: false
    };

    assert.equal(syncSidebarTabs(state, documentObject), false);
    assert.equal(documentObject.querySelector('[data-tab="observations"]').style.display, 'inline-flex');
    assert.equal(documentObject.querySelector('[data-tab="organizers"]').style.display, 'none');
    assert.equal(documentObject.querySelector('[data-tab="observations"]').active, true);
});
