import assert from 'node:assert/strict';
import test from 'node:test';
import { CIRCLE_ID } from '../scripts/config/app-config.js';
import { setupMapCanvasEvents, setupMapHoverEvents } from '../scripts/map/map-events.js';

test('registers canvas click and load behavior through callbacks', () => {
    const listeners = new Map();
    const calls = [];
    const map = {
        on(event, handler) { listeners.set(event, handler); },
        queryRenderedFeatures(point, options) {
            calls.push(['query', point, options]);
            return [];
        },
        setProjection(value) { calls.push(['projection', value]); },
        dragPan: { enable(value) { calls.push(['dragPan', value]); } }
    };
    const state = { lastZoneClickTime: 0, isCirclesFeature: false, currentId: 'sample' };

    setupMapCanvasEvents({
        map,
        state,
        onSelectCircles: () => calls.push(['select']),
        onSwitchToCircles: () => calls.push(['switch']),
        onLoad: () => calls.push(['load'])
    });

    listeners.get('click')({ point: { x: 1, y: 2 } });
    listeners.get('load')();

    assert.deepEqual(calls, [
        ['query', { x: 1, y: 2 }, { layers: ['zones-fill'] }],
        ['select'],
        ['projection', { type: 'globe' }],
        ['dragPan', { linearity: 0.15, deceleration: 1000 }],
        ['load']
    ]);
});

test('canvas click ignores zone hits and routes circle context correctly', () => {
    let click;
    let queryResults = [{ id: '04' }];
    const calls = [];
    const map = {
        on(event, handler) { if (event === 'click') click = handler; },
        queryRenderedFeatures() { return queryResults; }
    };
    const state = { lastZoneClickTime: 0, isCirclesFeature: false, currentId: CIRCLE_ID };
    setupMapCanvasEvents({
        map,
        state,
        onSelectCircles: () => calls.push('select'),
        onSwitchToCircles: () => calls.push('switch')
    });

    click({ point: {} });
    queryResults = [];
    click({ point: {} });
    assert.deepEqual(calls, ['switch']);
});

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
    assert.equal('_zoneEventsAttached' in state, false);

    setupMapHoverEvents({ map, state, onFeatureClick: () => assert.fail('must not attach again') });
    assert.equal(listeners.size, 3);
});
