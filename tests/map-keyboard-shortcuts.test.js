import assert from 'node:assert/strict';
import test from 'node:test';
import { setupMapKeyboardShortcuts } from '../scripts/components/map-keyboard-shortcuts.js';

function makeButton(style = {}) {
    return { style, clicks: 0, click() { this.clicks += 1; } };
}

function setup() {
    const listeners = {};
    const buttons = Object.fromEntries([
        'btn-help', 'btn-search-toggle', 'btn-download-files', 'btn-edit-item',
        'btn-suggest', 'btn-capsule-back', 'image-lightbox-modal'
    ].map(id => [id, makeButton(id === 'btn-edit-item' ? { display: '' } : {})]));
    buttons['image-lightbox-modal'].classList = { contains: () => false, remove() {} };
    buttons['image-lightbox-modal'].setAttribute = () => {};
    const tab = makeButton();
    const tiles = [makeButton(), makeButton()];
    const state = {
        isHelpModeActive: false,
        lastNavSource: null,
        activeTab: 'items',
        focusedTileIndex: -1,
        map: {
            zoomInCalls: 0,
            zoomOutCalls: 0,
            pans: [],
            zoomIn() { this.zoomInCalls += 1; },
            zoomOut() { this.zoomOutCalls += 1; },
            panBy(...args) { this.pans.push(args); }
        }
    };
    const documentObject = {
        activeElement: null,
        addEventListener(name, callback) { listeners[name] = callback; },
        getElementById: id => buttons[id] || null,
        querySelector: () => null,
        querySelectorAll(selector) {
            if (selector.includes('sidebar-capsule:not')) return [tab];
            if (selector === '#sidebar-zone-list .tile-zone-item') return tiles;
            if (selector === '.sidebar-capsule') return [];
            return [];
        }
    };
    const calls = { focus: [], help: [], styles: [], fullscreen: 0, copy: 0, render: 0 };
    setupMapKeyboardShortcuts({
        state,
        documentObject,
        renderSidebarList: () => { calls.render += 1; },
        setHelpMode: (...args) => calls.help.push(args),
        updateKeyboardFocus: index => {
            const clampedIndex = Math.max(0, Math.min(index, tiles.length - 1));
            calls.focus.push(clampedIndex);
            state.focusedTileIndex = clampedIndex;
        },
        onToggleFullscreen: () => { calls.fullscreen += 1; },
        onCopyLink: () => { calls.copy += 1; },
        onSelectMapStyle: index => calls.styles.push(index)
    });
    const key = (keyValue, { shiftKey = false, code = '' } = {}) => {
        let prevented = false;
        listeners.keydown({ key: keyValue, shiftKey, code, preventDefault() { prevented = true; } });
        return prevented;
    };
    return { buttons, calls, documentObject, key, listeners, state, tab, tiles };
}

test('keyboard shortcuts delegate help, fullscreen, copy, and map styles', () => {
    const fixture = setup();
    fixture.key('h');
    fixture.key('H', { shiftKey: true });
    fixture.key('f', { shiftKey: true });
    fixture.key('c', { shiftKey: true });
    fixture.key('@', { shiftKey: true });
    assert.deepEqual(fixture.calls.help, [[true, true]]);
    assert.equal(fixture.buttons['btn-help'].clicks, 1);
    assert.equal(fixture.calls.fullscreen, 1);
    assert.equal(fixture.calls.copy, 1);
    assert.deepEqual(fixture.calls.styles, [1]);
});

test('keyboard tile navigation and map panning preserve state and focus callbacks', () => {
    const fixture = setup();
    fixture.listeners.mousedown();
    assert.equal(fixture.state.lastNavSource, 'click');
    fixture.key('ArrowUp');
    fixture.key('s');
    fixture.key('ArrowRight');
    fixture.key('ArrowLeft', { shiftKey: true });
    fixture.key('+');
    fixture.key('-', { shiftKey: true });

    assert.deepEqual(fixture.calls.focus, [1, 1]);
    assert.equal(fixture.tiles[1].clicks, 1);
    assert.deepEqual(fixture.state.map.pans, [[[-120, 0], { animate: true }]]);
    assert.equal(fixture.state.map.zoomInCalls, 1);
    assert.equal(fixture.state.map.zoomOutCalls, 1);
    assert.equal(fixture.state.lastNavSource, 'keyboard');
});

test('Escape closes an open lightbox before falling back to the capsule back action', () => {
    const fixture = setup();
    const lightbox = fixture.buttons['image-lightbox-modal'];
    let isOpen = true;
    lightbox.classList.contains = () => isOpen;
    lightbox.classList.remove = () => { isOpen = false; };

    fixture.key('Escape');
    assert.equal(isOpen, false);
    assert.equal(fixture.buttons['btn-capsule-back'].clicks, 0);
    fixture.key('Escape');
    assert.equal(fixture.buttons['btn-capsule-back'].clicks, 1);
});
