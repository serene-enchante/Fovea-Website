import assert from 'node:assert/strict';
import test from 'node:test';

import { darkenHexColor, getThemeAccent, getThemeAccentLight, hexToRgba } from '../scripts/utils/color-utils.js';

test('formats hex colors for map rendering', () => {
    assert.equal(darkenHexColor('#abc', 0.5), '#555e66');
    assert.equal(hexToRgba('#abc', 0.25), 'rgba(170, 187, 204, 0.25)');
});

test('uses stable accent fallbacks outside the browser', () => {
    assert.equal(getThemeAccent(), '#64b5f6');
    assert.equal(getThemeAccentLight(), '#91cfff');
});
