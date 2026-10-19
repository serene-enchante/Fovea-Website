import assert from 'node:assert/strict';
import test from 'node:test';

import { runWithRequestTimeout } from '../scripts/services/request-timeout.js';

test('aborts the provider operation when its time limit expires', async () => {
    let operationSignal;
    await assert.rejects(runWithRequestTimeout(signal => {
        operationSignal = signal;
        return new Promise(() => {});
    }, { timeoutMs: 5 }), { name: 'TimeoutError' });
    assert.equal(operationSignal.aborted, true);
});

test('forwards caller cancellation and preserves its reason', async () => {
    const caller = new AbortController();
    const reason = new Error('selection changed');
    const request = runWithRequestTimeout(signal => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }), { signal: caller.signal, timeoutMs: 1000 });

    caller.abort(reason);
    await assert.rejects(request, error => error === reason);
});

test('clears its timeout after the operation finishes', async () => {
    const cleared = [];
    const result = await runWithRequestTimeout(async () => 'done', {
        timeoutMs: 10,
        setTimeoutFn: () => 42,
        clearTimeoutFn: id => cleared.push(id)
    });

    assert.equal(result, 'done');
    assert.deepEqual(cleared, [42]);
});
