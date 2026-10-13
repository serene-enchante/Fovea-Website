import assert from 'node:assert/strict';
import test from 'node:test';
import { state } from '../scripts/state.js';

test('shared map state starts with the production map page defaults', () => {
    assert.equal(state.activeTab, 'overview');
    assert.equal(state.currentBaseLayer, 'default');
    assert.equal(state.currentFeature, 'circles');
    assert.equal(state.isCirclesFeature, true);
});
