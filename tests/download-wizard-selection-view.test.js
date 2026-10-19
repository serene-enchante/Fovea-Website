import assert from 'node:assert/strict';
import test from 'node:test';
import { createDownloadWizardSelectionView } from '../scripts/components/download-wizard-selection-view.js';

function makeElement() {
    const listeners = {};
    const element = {
        listeners,
        children: [],
        dataset: {},
        style: {},
        className: '',
        value: '',
        textContent: '',
        innerHTML: '',
        attributes: {},
        addEventListener(type, callback) { listeners[type] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; },
        appendChild(child) { this.children.push(child); child.parent = this; return child; },
        remove() { this.parent?.children.splice(this.parent.children.indexOf(this), 1); },
        focus() { this.focused = true; },
        fire(type, event = {}) { listeners[type]?.({ preventDefault() {}, ...event }); }
    };
    let html = '';
    Object.defineProperty(element, 'innerHTML', {
        get: () => html,
        set(value) {
            html = value;
            if (value === '') this.children.length = 0;
        }
    });
    return element;
}

function makeHarness() {
    const circleGrid = makeElement();
    const zoneGrid = makeElement();
    const circleInput = makeElement();
    const circleClear = makeElement();
    const zoneInput = makeElement();
    const zoneClear = makeElement();
    const circleName = makeElement();
    const fullCircleCard = makeElement();
    const elements = {
        'circle-cards-grid': circleGrid,
        'zone-cards-grid': zoneGrid,
        'circle-search-input': circleInput,
        'circle-search-clear': circleClear,
        'zone-search-input': zoneInput,
        'zone-search-clear': zoneClear,
        'step-2-circle-name': circleName,
        'btn-download-full-circle': fullCircleCard
    };
    const documentObject = {
        getElementById: id => elements[id] || null,
        createElement: () => makeElement(),
        querySelectorAll(selector) {
            if (selector === '#zone-cards-grid .wizard-item-card') {
                return zoneGrid.children.filter(element => element.className.includes('wizard-item-card'));
            }
            return [];
        },
        querySelector(selector) {
            if (selector === '#zone-cards-grid .wizard-no-results') {
                return zoneGrid.children.find(element => element.className === 'wizard-no-results') || null;
            }
            return null;
        }
    };
    const circles = [
        { id: 'eugene', name: 'Eugene & <Friends>', subtitle: 'Oregon', thumbnail: 'eugene.png', hasData: true },
        { id: 'florence', name: 'Florence', subtitle: 'Coast', thumbnail: 'florence.png', hasData: true }
    ];
    const calls = [];
    const state = { selectedCircle: circles[0] };
    const view = createDownloadWizardSelectionView({
        state,
        circles,
        documentObject,
        resolveAssetPath: path => `root/${path}`,
        escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
        onSelectCircle: circle => calls.push(['circle', circle]),
        onSelectZone: zone => calls.push(['zone', zone])
    });

    return { view, state, calls, circles, circleGrid, zoneGrid, circleInput, circleClear, zoneInput, zoneClear, circleName, fullCircleCard };
}

test('renders escaped circle cards and delegates mouse and keyboard selection', () => {
    const harness = makeHarness();
    harness.view.renderCirclesList(harness.circles);

    const firstCard = harness.circleGrid.children[0];
    assert.match(firstCard.innerHTML, /Eugene &amp; &lt;Friends&gt;/);
    assert.match(firstCard.innerHTML, /src="root\/eugene.png"/);
    assert.match(firstCard.className, /is-selected/);
    firstCard.fire('click');
    firstCard.fire('keydown', { key: 'Enter' });
    assert.deepEqual(harness.calls, [['circle', harness.circles[0]], ['circle', harness.circles[0]]]);
});

test('renders zones and filters circle and zone cards with clear controls', () => {
    const harness = makeHarness();
    const features = [
        { properties: { zid: '01' } },
        { properties: { zid: '02' } }
    ];
    harness.view.setupSearchBars();
    harness.view.renderZonesList(features);

    assert.equal(harness.circleName.textContent, 'Eugene & <Friends>');
    assert.match(harness.zoneGrid.children[0].innerHTML, /Zone 01/);
    harness.zoneGrid.children[1].fire('click');
    harness.fullCircleCard.onclick();
    assert.deepEqual(harness.calls, [['zone', features[1]], ['zone', null]]);

    harness.circleInput.value = 'flor';
    harness.circleInput.fire('input', { target: harness.circleInput });
    assert.equal(harness.circleGrid.children.length, 1);
    assert.match(harness.circleGrid.children[0].innerHTML, /Florence/);
    assert.equal(harness.circleClear.style.display, 'flex');
    harness.circleClear.fire('click');
    assert.equal(harness.circleInput.focused, true);
    assert.equal(harness.circleGrid.children.length, 2);

    harness.zoneInput.value = '02';
    harness.zoneInput.fire('input', { target: harness.zoneInput });
    assert.equal(harness.zoneGrid.children[0].style.display, 'none');
    assert.equal(harness.zoneGrid.children[1].style.display, 'flex');
    harness.zoneInput.value = '99';
    harness.zoneInput.fire('input', { target: harness.zoneInput });
    assert.ok(harness.zoneGrid.children.some(element => element.className === 'wizard-no-results'));
    harness.zoneInput.value = '01';
    harness.zoneInput.fire('input', { target: harness.zoneInput });
    assert.equal(harness.zoneGrid.children.some(element => element.className === 'wizard-no-results'), false);
});
