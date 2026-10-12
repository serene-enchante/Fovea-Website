import assert from 'node:assert/strict';
import test from 'node:test';
import { MAP_HELP_CONTENT } from '../scripts/config/map-help-content.js';

test('map help content has complete, unique selector entries', () => {
    assert.ok(MAP_HELP_CONTENT.length >= 20);
    const selectors = new Set();
    for (const item of MAP_HELP_CONTENT) {
        assert.ok(item.selector);
        assert.ok(item.title);
        assert.ok(item.desc);
        assert.equal(selectors.has(item.selector), false, `duplicate selector: ${item.selector}`);
        selectors.add(item.selector);
        if (item.shortcut) assert.equal(typeof item.shortcut, 'string');
    }
});
