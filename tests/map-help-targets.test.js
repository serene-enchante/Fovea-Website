import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveHelpTarget, tagHelpElements } from '../scripts/components/map-help-targets.js';

function makeElement({ id = '', existingShortcut = null } = {}) {
    const attributes = {};
    if (existingShortcut) attributes['data-help-shortcut'] = existingShortcut;
    return {
        id,
        attributes,
        setAttribute(name, value) { attributes[name] = value; },
        getAttribute(name) { return attributes[name] ?? null; },
        removeAttribute(name) { delete attributes[name]; }
    };
}

test('help tagging updates configured attributes and removes obsolete shortcuts', () => {
    const element = makeElement({ existingShortcut: 'old binding' });
    tagHelpElements([
        { selector: '.with-shortcut', title: 'With shortcut', desc: 'Description', shortcut: 'Shift + A' },
        { selector: '.without-shortcut', title: 'Without shortcut', desc: 'Another description' }
    ], { querySelectorAll: () => [element] });

    assert.equal(element.getAttribute('data-help-title'), 'Without shortcut');
    assert.equal(element.getAttribute('data-help-desc'), 'Another description');
    assert.equal(element.getAttribute('data-help-shortcut'), null);
});

test('help target resolution lazily tags a matching closest element', () => {
    const target = makeElement();
    const eventTarget = {
        closest(selector) {
            if (selector === '[data-help-title]') return null;
            if (selector === '.target') return target;
            return null;
        }
    };
    const resolved = resolveHelpTarget(eventTarget, [
        { selector: '.target', title: 'Target', desc: 'Target details', shortcut: 'T' }
    ]);

    assert.equal(resolved.target, target);
    assert.equal(resolved.title, 'Target');
    assert.equal(target.getAttribute('data-help-shortcut'), 'T');
});

test('map help target resolution suppresses tooltips for map controls', () => {
    const mapFrame = makeElement({ id: 'tile-map' });
    const eventTarget = {
        closest(selector) {
            if (selector === '[data-help-title]') return mapFrame;
            if (selector === '.map-ctrl-container, .map-ctrl-panel') return {};
            return null;
        }
    };
    assert.deepEqual(resolveHelpTarget(eventTarget, []), {
        target: null, title: null, desc: null, shortcut: null
    });
});
