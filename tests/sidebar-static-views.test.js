import assert from 'node:assert/strict';
import test from 'node:test';
import { renderOrganizersList, renderResourcesList } from '../scripts/components/sidebar-static-views.js';

test('renders the organizers placeholder card with contact actions', () => {
    let appended;
    renderOrganizersList({ appendChild: element => { appended = element; } }, { createElement: () => ({}) });

    assert.equal(appended.className, 'tile-zone-item tile-zone-item--organizer');
    assert.match(appended.innerHTML, /aria-label="Email"/);
    assert.match(appended.innerHTML, /aria-label="Phone"/);
});

test('renders the empty resources state', () => {
    let appended;
    renderResourcesList({ appendChild: element => { appended = element; } }, { createElement: () => ({}) });

    assert.equal(appended.className, 'sidebar-empty-state');
    assert.match(appended.innerHTML, /no items found/);
});
