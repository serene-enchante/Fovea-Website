import assert from 'node:assert/strict';
import test from 'node:test';
import { createDownloadWizardStepper } from '../scripts/components/download-wizard-stepper.js';

function makeElement(dataset = {}) {
    const listeners = {};
    const classes = new Set();
    return {
        dataset,
        listeners,
        classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name)
        },
        style: {},
        children: {},
        addEventListener: (type, callback) => { listeners[type] = callback; },
        querySelector(selector) { return this.children?.[selector] ?? null; },
        click: (...args) => listeners.click?.(...args)
    };
}

function makeHarness(overrides = {}) {
    const stepNodes = [1, 2, 3].map(step => {
        const node = makeElement({ step: String(step) });
        node.children['.stepper-step__node'] = { textContent: '', innerHTML: '' };
        node.children['.stepper-step__label'] = { textContent: '' };
        return node;
    });
    const backButton = makeElement({ targetStep: '1' });
    const changeButton = makeElement();
    const views = [1, 2, 3].map(() => makeElement());
    const progress = { style: {} };
    const elements = {
        'wizard-change-selection-btn': changeButton,
        'stepper-track-progress': progress,
        'step-1-view': views[0],
        'step-2-view': views[1],
        'step-3-view': views[2]
    };
    const documentObject = {
        querySelectorAll(selector) {
            if (selector === '.stepper-step') return stepNodes;
            if (selector === '.wizard-back-btn') return [backButton];
            if (selector === '.wizard-step-view') return views;
            return [];
        },
        getElementById: id => elements[id] || null
    };
    const windowListeners = {};
    const scrollCalls = [];
    const windowObject = {
        addEventListener: (type, callback) => { windowListeners[type] = callback; },
        scrollTo: (...args) => scrollCalls.push(args)
    };
    const state = { currentStep: 1, selectedCircle: null, selectedZone: null };
    const disposeCalls = [];
    const stepper = createDownloadWizardStepper({
        state,
        documentObject,
        windowObject,
        disposeRasterCache: () => disposeCalls.push('dispose'),
        resolveAssetPath: path => `root/${path}`,
        escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;'),
        ...overrides
    });

    return { stepper, state, stepNodes, backButton, changeButton, views, progress, disposeCalls, scrollCalls, windowListeners };
}

test('gates step navigation and disposes raster cache when leaving step three', () => {
    const harness = makeHarness();
    harness.stepper.setup();

    harness.stepNodes[2].click();
    assert.equal(harness.state.currentStep, 1);

    harness.state.selectedCircle = { id: 'eugene', name: 'Eugene', totalZones: 29, thumbnail: 'eugene.png' };
    harness.stepNodes[1].click();
    assert.equal(harness.state.currentStep, 2);
    assert.equal(harness.progress.style.width, '50%');
    assert.equal(harness.views[1].classList.contains('is-visible'), true);
    assert.equal(harness.disposeCalls.length, 1);

    harness.stepNodes[2].click();
    assert.equal(harness.state.currentStep, 2);
    harness.state.selectedZone = { properties: { zid: '04' } };
    harness.stepNodes[2].click();
    assert.equal(harness.state.currentStep, 3);
    assert.equal(harness.progress.style.width, '100%');

    harness.backButton.click();
    assert.equal(harness.state.currentStep, 1);
    assert.equal(harness.disposeCalls.length, 2);
    assert.deepEqual(harness.scrollCalls.at(-1), [{ top: 0, behavior: 'smooth' }]);
    assert.equal(typeof harness.windowListeners.beforeunload, 'function');
});

test('renders the selected circle and zone in the stepper with injected escaping and asset paths', () => {
    const harness = makeHarness();
    harness.state.selectedCircle = {
        id: 'eugene', name: 'Eugene & Friends', totalZones: 29, thumbnail: 'eugene.png'
    };
    harness.state.selectedZone = { properties: { zid: '4' } };
    harness.state.currentStep = 2;

    harness.stepper.updateStepperUI();

    assert.equal(harness.stepNodes[0].children['.stepper-step__label'].textContent, 'Eugene & Friends');
    assert.equal(harness.stepNodes[0].children['.stepper-step__node'].innerHTML, '<img src="root/eugene.png" alt="Eugene &amp; Friends">');
    assert.equal(harness.stepNodes[1].children['.stepper-step__label'].textContent, 'Zone 04');
    assert.equal(harness.stepNodes[1].classList.contains('is-active'), true);
    assert.equal(harness.stepNodes[0].classList.contains('is-completed'), true);
});
