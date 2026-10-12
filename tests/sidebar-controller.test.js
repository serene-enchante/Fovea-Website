import assert from 'node:assert/strict';
import test from 'node:test';
import { createSidebarController } from '../scripts/components/sidebar-controller.js';

function makeController(overrides = {}) {
    const calls = [];
    const container = { innerHTML: 'stale' };
    const state = { currentId: 'ecbc-circle', activeTab: 'items', circlesFeatures: [], allFeatures: [], ...overrides.state };
    const dependencies = {
        state,
        documentObject: { getElementById: () => container, createElement: () => ({}) },
        syncTabs: () => false,
        renderBirdObservations: () => calls.push(['bird-observations']),
        renderBirdPanel: (...args) => calls.push(['bird-panel', ...args]),
        renderBirdSpecies: (...args) => calls.push(['bird-species', ...args]),
        renderOrganizers: () => calls.push(['organizers']),
        renderResources: () => calls.push(['resources']),
        renderOverview: (...args) => calls.push(['overview', ...args]),
        renderMapFeatureList: (...args) => calls.push(['feature-list', ...args]),
        onSelectBird: () => {},
        onSelectCircle: () => {},
        onSelectZone: () => {},
        onActivateTab: () => {},
        onFeatureHover: () => {},
        onOpenImageLightbox: () => {},
        onUpdateKeyboardFocus: index => calls.push(['keyboard-focus', index]),
        ...overrides.dependencies
    };
    return { controller: createSidebarController(dependencies), calls, container, state };
}

test('routes the selected bird observations tab through its view renderer', () => {
    const { controller, calls, container } = makeController({ state: { selectedBird: 'Osprey', activeTab: 'observations' } });

    controller.renderSidebarList();

    assert.equal(container.innerHTML, '');
    assert.deepEqual(calls, [['bird-observations']]);
});

test('routes circle views to overview or feature lists and preserves callback wiring', () => {
    const { controller, calls } = makeController({
        state: { isCirclesFeature: true },
        dependencies: { syncTabs: () => true }
    });
    controller.renderSidebarList();
    assert.equal(calls[0][0], 'overview');
    assert.equal(calls[0][2].isCirclesFeature, true);

    calls.length = 0;
    const second = makeController({ state: { isCirclesFeature: true } });
    second.controller.renderSidebarList();
    assert.equal(second.calls[0][0], 'feature-list');
    assert.equal(second.calls[0][2].isCirclesFeature, true);
});

test('renders zones and resets keyboard focus after a sidebar render', () => {
    const { controller, calls, state } = makeController({
        state: { lastNavSource: 'keyboard' }
    });

    controller.renderSidebarList();

    assert.equal(calls[0][0], 'feature-list');
    assert.equal(state.focusedTileIndex, 0);
    assert.deepEqual(calls[1], ['keyboard-focus', 0]);
});
