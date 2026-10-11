import assert from 'node:assert/strict';
import test from 'node:test';
import { canSwipeBack } from '../scripts/components/mobile-view.js';

test('allows list swipe-back only when the back button is enabled', () => {
    const button = {
        disabled: false,
        classes: new Set(),
        classList: { contains(name) { return button.classes.has(name); } }
    };

    assert.equal(canSwipeBack(null), false);
    assert.equal(canSwipeBack(button), true);
    button.disabled = true;
    assert.equal(canSwipeBack(button), false);
    button.disabled = false;
    button.classes.add('is-disabled');
    assert.equal(canSwipeBack(button), false);
});
