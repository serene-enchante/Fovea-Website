import assert from 'node:assert/strict';
import test from 'node:test';
import { setupMapHoverEvents } from '../scripts/map/map-events.js';

test('registers zone hover and click events once and delegates valid clicks', () => {
    const listeners = new Map();
    const map = {
        on(event, layer, handler) { listeners.set(`${event}:${layer}`, handler); },
        setFeatureState() {},
        getCanvas() { return { style: {} }; }
    };
    const state = {};
    const selections = [];
    setupMapHoverEvents({
        map,
        state,
        onFeatureClick: value => selections.push(value)
    });

    listeners.get('click:zones-fill')({ features: [{ id: '04', properties: { zid: '04' } }] });
    listeners.get('click:zones-fill')({ features: [] });

    assert.deepEqual([...listeners.keys()], [
        'mousemove:zones-fill', 'mouseleave:zones-fill', 'click:zones-fill'
    ]);
    assert.equal(selections.length, 1);
    assert.equal(selections[0].featureId, '04');
    assert.equal(selections[0].feature.properties.zid, '04');
    assert.equal(typeof state.lastZoneClickTime, 'number');

    setupMapHoverEvents({ map, state, onFeatureClick: () => assert.fail('must not attach again') });
    assert.equal(listeners.size, 3);
});
