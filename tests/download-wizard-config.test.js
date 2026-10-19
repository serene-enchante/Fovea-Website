import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_INSTRUCTION_CONFIGS, COUNT_CIRCLES } from '../scripts/config/download-wizard-config.js';

test('download wizard config keeps supported circle datasets and app instructions', () => {
    assert.deepEqual(COUNT_CIRCLES.filter(circle => circle.hasData).map(circle => circle.id), ['eugene', 'florence']);
    assert.equal(COUNT_CIRCLES.find(circle => circle.id === 'eugene').totalZones, 29);
    assert.deepEqual(Object.keys(APP_INSTRUCTION_CONFIGS), ['avenza', 'gaia', 'caltopo', 'osmand']);
    assert.equal(APP_INSTRUCTION_CONFIGS.caltopo.formatKey, 'gpx');
    assert.equal(APP_INSTRUCTION_CONFIGS.osmand.scheme, 'osmand://');
});
