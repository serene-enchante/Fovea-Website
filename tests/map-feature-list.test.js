import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMapFeatureList } from '../scripts/components/map-feature-list.js';

function createDocument() {
    return {
        createElement: () => ({
            listeners: {},
            setAttribute(name, value) { this[name] = value; },
            addEventListener(name, handler) { this.listeners[name] = handler; },
            querySelector: () => null
        })
    };
}

test('renders zone rows in natural ID order and delegates hover and selection', () => {
    const rows = [];
    const featureStates = [];
    const selected = [];
    const map = {
        getSource: () => ({}),
        setFeatureState: (...args) => featureStates.push(args)
    };

    renderMapFeatureList({ appendChild: row => rows.push(row) }, {
        features: [
            { properties: { zid: '10' } },
            { properties: { zid: '2' } }
        ],
        currentId: '02',
        map,
        onSelectZone: id => selected.push(id),
        documentObject: createDocument()
    });

    assert.deepEqual(rows.map(row => row['data-id']), ['2', '10']);
    rows[0].listeners.mouseenter();
    rows[0].listeners.mouseleave();
    rows[0].listeners.click();
    assert.deepEqual(featureStates, []);
    assert.deepEqual(selected, ['2']);
});

test('sorts count circles and delegates hover and available-circle selection', () => {
    const rows = [];
    const selected = [];
    const featureStates = [];
    renderMapFeatureList({ appendChild: row => rows.push(row) }, {
        isCirclesFeature: true,
        features: [
            { properties: { cid: 'Oakridge' } },
            { properties: { cid: 'Florence' } },
            { properties: { cid: 'Eugene' } }
        ],
        map: { getSource: () => ({}), setFeatureState: (...args) => featureStates.push(args) },
        onSelectCircle: (id, feature) => selected.push([id, feature]),
        documentObject: createDocument()
    });

    assert.deepEqual(rows.map(row => row['data-id']), ['Eugene', 'Florence', 'Oakridge']);
    rows[1].listeners.mouseenter();
    rows[1].listeners.click();
    assert.equal(featureStates[0][0].id, 'Florence');
    assert.equal(selected[0][0], 'Florence');
});
