import test from 'node:test';
import assert from 'node:assert/strict';
import { FLORENCE_ZONE_BIRDS } from '../scripts/config/florence-zone-guide.js';

test('keeps the Florence zone guide available for every numbered zone', () => {
    assert.deepEqual(Object.keys(FLORENCE_ZONE_BIRDS).sort(), Array.from({ length: 13 }, (_, index) => String(index + 1).padStart(2, '0')));

    for (const [zoneId, guide] of Object.entries(FLORENCE_ZONE_BIRDS)) {
        assert.match(guide.title, new RegExp(`Area ${Number(zoneId)} -`));
        assert.ok(guide.desc.length > 0);
        assert.ok(guide.birds.length > 0);
        assert.ok(guide.birds.every(bird => bird.name && bird.note));
    }
});
