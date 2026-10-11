import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_INSTRUCTION_CONFIGS } from '../scripts/config/app-config.js';
import { resolveAppInstructionConfig } from '../scripts/services/app-instruction-config.js';

test('resolves configured app names and aliases', () => {
    assert.deepEqual(resolveAppInstructionConfig('Avenza Maps'), {
        config: APP_INSTRUCTION_CONFIGS.avenza,
        normalizedKey: 'avenzamaps'
    });
    assert.deepEqual(resolveAppInstructionConfig('Gaia GPS'), {
        config: APP_INSTRUCTION_CONFIGS.gaia,
        normalizedKey: 'gaiagps'
    });
});

test('creates a usable fallback configuration for an unknown app', () => {
    const { config, normalizedKey } = resolveAppInstructionConfig('Trail Maps');

    assert.equal(normalizedKey, 'trailmaps');
    assert.equal(config.scheme, 'trailmaps://');
    assert.equal(config.formatKey, 'gpx');
    assert.equal(config.continueBtnText, 'Continue to Trail Maps');
});
