function createTimeoutError() {
    return typeof DOMException === 'function'
        ? new DOMException('The request timed out', 'TimeoutError')
        : Object.assign(new Error('The request timed out'), { name: 'TimeoutError' });
}

function getAbortReason(signal) {
    if (signal.reason) return signal.reason;
    return typeof DOMException === 'function'
        ? new DOMException('The request was aborted', 'AbortError')
        : Object.assign(new Error('The request was aborted'), { name: 'AbortError' });
}

/** Run an async provider operation with caller cancellation and a time limit. */
export async function runWithRequestTimeout(operation, {
    signal,
    timeoutMs = 15_000,
    AbortControllerConstructor = globalThis.AbortController,
    setTimeoutFn = globalThis.setTimeout,
    clearTimeoutFn = globalThis.clearTimeout
} = {}) {
    const controller = new AbortControllerConstructor();
    const abortPromise = new Promise((_, reject) => {
        controller.signal.addEventListener('abort', () => {
            reject(getAbortReason(controller.signal));
        }, { once: true });
    });
    const onCallerAbort = () => controller.abort(signal.reason);
    const timeoutId = setTimeoutFn(() => controller.abort(createTimeoutError()), timeoutMs);

    if (signal?.aborted) onCallerAbort();
    else signal?.addEventListener('abort', onCallerAbort, { once: true });

    try {
        return await Promise.race([
            Promise.resolve().then(() => operation(controller.signal)),
            abortPromise
        ]);
    } finally {
        clearTimeoutFn(timeoutId);
        signal?.removeEventListener('abort', onCallerAbort);
    }
}
