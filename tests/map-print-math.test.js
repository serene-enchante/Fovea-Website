import assert from 'node:assert/strict';
import test from 'node:test';

import { getLayoutScaleBar } from '../scripts/utils/map-print-math.js';

test('uses a bounded, readable scale for valid map bounds', () => {
    const scale = getLayoutScaleBar([[-123.2, 44], [-123, 44.2]], 1000);

    assert.ok(scale.miles > 0);
    assert.ok(scale.pxWidth >= 160 && scale.pxWidth <= 750);
});

test('falls back when bounds are unavailable', () => {
    assert.deepEqual(getLayoutScaleBar(null, 1000), { miles: 1, pxWidth: 250 });
});
