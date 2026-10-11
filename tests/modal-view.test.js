import assert from 'node:assert/strict';
import test from 'node:test';
import { closeAllAppsModal, closeAllModals, closeAvenzaModal } from '../scripts/components/modal-view.js';

function createModalHarness() {
    const elements = new Map();
    const makeElement = id => {
        const attributes = new Map([['aria-hidden', 'false']]);
        const classes = new Set(['is-open', ...(id === 'mobile-bottom-nav-container' ? ['is-hidden-entirely'] : [])]);
        const styleRemoved = [];
        const element = {
            id, attributes, classes, styleRemoved,
            setAttribute: (name, value) => attributes.set(name, value),
            classList: {
                add: name => classes.add(name),
                remove: name => classes.delete(name)
            },
            style: { removeProperty: name => styleRemoved.push(name) }
        };
        elements.set(id, element);
        return element;
    };
    const ids = ['avenza-instruction-modal', 'all-apps-modal', 'downloads-modal', 'copy-link-modal', 'help-modal', 'suggest-modal', 'mobile-bottom-nav-container'];
    ids.forEach(makeElement);
    const bodyClasses = new Set(['has-avenza-modal']);
    return {
        elements,
        bodyClasses,
        documentObject: {
            body: { classList: { remove: name => bodyClasses.delete(name) } },
            getElementById: id => elements.get(id) || null,
            querySelector: selector => selector.includes('.mobile-bottom-nav-container') ? elements.get('mobile-bottom-nav-container') : null
        }
    };
}

test('closes the Avenza and compatible-app modals with shared helpers', () => {
    const { documentObject, elements, bodyClasses } = createModalHarness();
    closeAvenzaModal(documentObject);
    assert.equal(elements.get('avenza-instruction-modal').attributes.get('aria-hidden'), 'true');
    assert.equal(bodyClasses.has('has-avenza-modal'), false);
    assert.equal(elements.get('mobile-bottom-nav-container').classes.has('is-hidden-entirely'), false);
    assert.deepEqual(elements.get('mobile-bottom-nav-container').styleRemoved, ['display']);

    closeAllAppsModal(documentObject);
    assert.equal(elements.get('all-apps-modal').attributes.get('aria-hidden'), 'true');
    assert.equal(elements.get('all-apps-modal').classes.has('is-open'), false);
});

test('closes all modal views after the injected cleanup and refreshes UI state', () => {
    const { documentObject, elements } = createModalHarness();
    const calls = [];
    closeAllModals({
        documentObject,
        windowObject: {
            updateActionButtonsState: () => calls.push('buttons'),
            renderSidebarList: () => calls.push('sidebar')
        },
        onBeforeClose: () => calls.push('cleanup')
    });

    for (const id of ['avenza-instruction-modal', 'downloads-modal', 'copy-link-modal', 'help-modal', 'suggest-modal', 'all-apps-modal']) {
        assert.equal(elements.get(id).attributes.get('aria-hidden'), 'true');
        assert.equal(elements.get(id).classes.has('is-open'), false);
    }
    assert.deepEqual(calls, ['cleanup', 'buttons', 'sidebar']);
});
