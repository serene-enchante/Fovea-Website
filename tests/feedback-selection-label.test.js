import assert from 'node:assert/strict';
import test from 'node:test';
import { CIRCLE_ID } from '../scripts/config/app-config.js';
import { getSuggestSelectionLabel } from '../scripts/components/feedback-form.js';
import { state } from '../scripts/state.js';

test('uses the shared selection label for circles, circles, and zones', () => {
    const original = {
        currentFeature: state.currentFeature,
        isCirclesFeature: state.isCirclesFeature,
        currentId: state.currentId,
        allFeatures: state.allFeatures
    };
    try {
        state.currentFeature = 'circles';
        state.isCirclesFeature = true;
        state.currentId = CIRCLE_ID;
        state.allFeatures = [];
        assert.equal(getSuggestSelectionLabel(), 'Coast to Cascades');

        state.currentFeature = 'florence';
        state.isCirclesFeature = false;
        assert.equal(getSuggestSelectionLabel(), 'Florence CBC');

        state.currentId = '04';
        state.allFeatures = [{ properties: { zid: 'Zone 4' } }];
        assert.equal(getSuggestSelectionLabel(), 'Zone 04');
    } finally {
        Object.assign(state, original);
    }
});
