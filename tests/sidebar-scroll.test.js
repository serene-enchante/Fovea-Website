import assert from 'node:assert/strict';
import test from 'node:test';
import { setupSidebarScrollListener } from '../scripts/components/sidebar-list.js';

function makeElement() {
    const classes = new Set();
    let scroll;
    return {
        classes,
        addEventListener(name, listener) { if (name === 'scroll') scroll = listener; },
        fireScroll(scrollTop) { scroll({ currentTarget: { scrollTop } }); },
        classList: {
            toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); }
        }
    };
}

test('updates sidebar scroll state and hides the mobile nav after scrolling', () => {
    const scrollBox = makeElement();
    const header = makeElement();
    const sidebar = makeElement();
    const bottomNav = makeElement();
    const body = makeElement();
    const documentObject = {
        body,
        getElementById: id => id === 'sidebar-zone-list' ? scrollBox : header,
        querySelector: selector => selector === '.maps-tile-sidebar' ? sidebar : bottomNav
    };
    const windowObject = { innerWidth: 400 };

    setupSidebarScrollListener({ documentObject, windowObject });
    scrollBox.fireScroll(20);
    assert.equal(header.classes.has('is-scrolled'), true);
    assert.equal(sidebar.classes.has('is-scrolled'), true);
    assert.equal(body.classes.has('sidebar-is-scrolled'), true);
    assert.equal(bottomNav.classes.has('is-hidden'), true);

    windowObject.innerWidth = 1200;
    scrollBox.fireScroll(0);
    assert.equal(header.classes.has('is-scrolled'), false);
    assert.equal(bottomNav.classes.has('is-hidden'), true);
});
