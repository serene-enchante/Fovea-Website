import assert from 'node:assert/strict';
import test from 'node:test';
import { createDownloadWizardRasterCache } from '../scripts/map/download-wizard-raster-cache.js';

function createCacheHarness() {
    let key = 'eugene:full';
    let now = 100;
    let nextTimerId = 1;
    const calls = [];
    const timers = new Map();
    const canvases = [];
    const cache = createDownloadWizardRasterCache({
        getCacheKey: () => key,
        getRenderOptions: () => ({ currentFeature: key.split(':')[0] }),
        getPageUrl: () => 'https://example.test/download-wizard',
        ttlMs: 500,
        now: () => now,
        schedule(callback, delay) {
            const id = nextTimerId++;
            timers.set(id, { callback, delay });
            return id;
        },
        cancel: id => timers.delete(id),
        renderLayoutCanvas(options) {
            calls.push(options);
            const canvas = { width: 100, height: 50 };
            canvases.push(canvas);
            return Promise.resolve(canvas);
        }
    });
    return {
        cache,
        calls,
        canvases,
        timers,
        setKey(value) { key = value; },
        advance(ms) { now += ms; }
    };
}

test('reuses a pending and completed wizard raster for the same selection', async () => {
    const { cache, calls, timers } = createCacheHarness();

    const pending = cache.preload();
    assert.equal(cache.preload(), pending);
    const canvas = await pending;

    assert.equal(await cache.getOrRender(), canvas);
    assert.equal(cache.hasCachedCanvas(), true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].currentFeature, 'eugene');
    assert.equal(calls[0].pageUrl, 'https://example.test/download-wizard');
    assert.equal([...timers.values()][0].delay, 500);
});

test('disposes stale canvases and renders the newly selected wizard view', async () => {
    const harness = createCacheHarness();
    const first = await harness.cache.preload();
    harness.setKey('florence:04');

    assert.equal(harness.cache.hasCachedCanvas(), false);
    const second = await harness.cache.getOrRender();

    assert.notEqual(second, first);
    assert.equal(first.width, 0);
    assert.equal(first.height, 0);
    assert.equal(harness.calls.length, 2);
    assert.equal(harness.calls[1].currentFeature, 'florence');
});

test('disposal cancels its expiry timer and releases the cached canvas', async () => {
    const { cache, canvases, timers } = createCacheHarness();
    await cache.preload();
    const timerId = [...timers.keys()][0];

    cache.dispose();

    assert.equal(timers.has(timerId), false);
    assert.equal(canvases[0].width, 0);
    assert.equal(canvases[0].height, 0);
    assert.equal(cache.hasCachedCanvas(), false);
});
