import assert from 'node:assert/strict';
import test from 'node:test';
import { updateKeyboardTileFocus } from '../scripts/components/sidebar-list.js';

function makeTile(id) {
    const classes = new Set();
    return {
        classes,
        getAttribute: name => name === 'data-id' ? id : null,
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name)
        }
    };
}

test('clamps keyboard focus and avoids changing selected feature state', () => {
    const selectedTile = makeTile('04');
    const nextTile = makeTile('05');
    const tiles = [selectedTile, nextTile];
    const featureStates = [];
    const state = {
        currentId: '04',
        focusedTileIndex: -1,
        map: {
            getSource: () => ({}),
            setFeatureState: (...args) => featureStates.push(args)
        }
    };
    const documentObject = { querySelectorAll: () => tiles };

    updateKeyboardTileFocus(20, { state, documentObject });
    assert.equal(state.focusedTileIndex, 1);
    assert.equal(selectedTile.classes.has('is-hovered'), false);
    assert.equal(nextTile.classes.has('is-hovered'), true);
    assert.deepEqual(featureStates, [[{ source: 'zones', id: '05' }, { hover: true }]]);

    updateKeyboardTileFocus(-2, { state, documentObject });
    assert.equal(state.focusedTileIndex, -1);
    assert.equal(nextTile.classes.has('is-hovered'), false);
});
