import assert from 'node:assert/strict';
import test from 'node:test';
import { renderBirdSpeciesList } from '../scripts/components/bird-species-list.js';

test('renders the Florence zone bird guide and delegates bird selection', () => {
    const appended = [];
    const documentObject = {
        createElement: () => ({ addEventListener(name, handler) { this[name] = handler; } })
    };
    const state = {
        currentFeature: 'florence',
        currentId: '01',
        isCirclesFeature: false,
        allFeatures: [{ properties: { zid: '01' } }]
    };
    const selected = [];

    renderBirdSpeciesList({ appendChild: element => appended.push(element) }, {
        state,
        onSelectBird: name => selected.push(name),
        documentObject
    });

    assert.equal(appended[0].className, 'sidebar-birds-intro');
    assert.match(appended[0].textContent, /Cape Creek Road/);
    assert.equal(appended[1].className, 'tile-zone-item tile-zone-item--no-thumb tile-zone-item--bird-link');
    assert.match(appended[1].innerHTML, /Black Oystercatcher/);
    assert.match(appended[1].innerHTML, /ebird\.org/);
    appended[1].click();
    assert.deepEqual(selected, ['Black Oystercatcher']);
});

test('renders the empty state outside a Florence bird guide zone', () => {
    const appended = [];
    renderBirdSpeciesList({ appendChild: element => appended.push(element) }, {
        state: { currentFeature: 'eugene', currentId: '04', isCirclesFeature: false, allFeatures: [] },
        documentObject: { createElement: () => ({}) }
    });

    assert.equal(appended.length, 1);
    assert.equal(appended[0].className, 'sidebar-empty-state');
});
