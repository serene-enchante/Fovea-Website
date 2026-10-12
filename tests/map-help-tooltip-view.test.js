import assert from 'node:assert/strict';
import test from 'node:test';
import {
    hideHelpTooltip,
    highlightHelpTarget,
    positionHelpTooltipAtPointer,
    positionHelpTooltipAtTarget,
    renderHelpTooltip
} from '../scripts/components/map-help-tooltip-view.js';

function makeTooltip({ width = 120, height = 60 } = {}) {
    return {
        offsetWidth: width,
        offsetHeight: height,
        style: {},
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; }
    };
}

test('tooltip rendering includes its title, description, and optional shortcut', () => {
    const tooltip = makeTooltip();
    renderHelpTooltip(tooltip, { title: 'Map frame', desc: 'Explore the map', shortcut: 'Shift + 1' });
    assert.match(tooltip.innerHTML, /Map frame/);
    assert.match(tooltip.innerHTML, /Explore the map/);
    assert.match(tooltip.innerHTML, /Shift \+ 1/);
    assert.equal(tooltip.attributes['aria-hidden'], 'false');
});

test('pointer tooltip placement moves left and up when it would overflow', () => {
    const tooltip = makeTooltip();
    positionHelpTooltipAtPointer(tooltip, { clientX: 380, clientY: 280 }, { innerWidth: 400, innerHeight: 300 });
    assert.equal(tooltip.style.left, '245px');
    assert.equal(tooltip.style.top, '205px');
});

test('touch tooltip placement clamps to the viewport and highlights the target', () => {
    const tooltip = makeTooltip();
    const target = { getBoundingClientRect: () => ({ left: 0, top: 0, right: 20, bottom: 10, width: 20, height: 10 }) };
    const windowObject = { innerWidth: 400, innerHeight: 300 };
    positionHelpTooltipAtTarget(tooltip, target, windowObject);
    assert.equal(tooltip.style.left, '10px');
    assert.equal(tooltip.style.top, '20px');

    const highlight = makeTooltip();
    highlightHelpTarget(highlight, target);
    assert.deepEqual(highlight.style, { left: '-3px', top: '-3px', width: '26px', height: '16px' });
    assert.equal(highlight.attributes['aria-hidden'], 'false');
    hideHelpTooltip(tooltip, highlight);
    assert.equal(tooltip.attributes['aria-hidden'], 'true');
    assert.equal(highlight.attributes['aria-hidden'], 'true');
});
