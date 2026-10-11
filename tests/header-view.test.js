import assert from 'node:assert/strict';
import test from 'node:test';
import { balancedHeaderHTML } from '../scripts/components/header-view.js';

test('balances longer header titles across two lines and escapes markup', () => {
    assert.equal(
        balancedHeaderHTML('Coast <to> Cascades & Count Circles'),
        'Coast &lt;to&gt; Cascades<br>&amp; Count Circles'
    );
});

test('keeps short header titles on one line', () => {
    assert.equal(balancedHeaderHTML('Florence CBC'), 'Florence CBC');
});
