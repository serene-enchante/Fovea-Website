const enabled = new URLSearchParams(globalThis.location?.search ?? '').has('fovea-perf');

export function markMapStartup(stage) {
    if (!enabled || typeof globalThis.performance?.mark !== 'function') return;
    globalThis.performance.mark(`fovea-map:${stage}`);
}
