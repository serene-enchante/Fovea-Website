import assert from 'node:assert/strict';
import test from 'node:test';

import { formatArea, zoneImagePath } from '../scripts/utils/format-utils.js';

test('uses the expected zone image aliases', () => {
    assert.equal(zoneImagePath('06A'), '../images/zone-images/z06-01.jpg');
    assert.equal(zoneImagePath('1'), '../images/zone-images/z01-01.jpg');
    assert.equal(zoneImagePath('20B'), '../images/zone-images/20B-01.jpg');
});

test('formats valid areas and rejects non-numeric values', () => {
    assert.equal(formatArea('10.5'), '10.5');
    assert.equal(formatArea('unknown'), '-');
});
