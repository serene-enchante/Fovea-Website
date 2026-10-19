const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function createDownloadWizardRasterCache({
    getCacheKey,
    getRenderOptions,
    renderLayoutCanvas,
    getPageUrl = () => globalThis.location.href,
    ttlMs = DEFAULT_TTL_MS,
    now = Date.now,
    schedule = globalThis.setTimeout,
    cancel = globalThis.clearTimeout
}) {
    let cache = {
        key: null,
        promise: null,
        canvas: null,
        createdAt: 0,
        timerId: null
    };

    function dispose() {
        if (cache.timerId) {
            cancel(cache.timerId);
            cache.timerId = null;
        }
        if (cache.canvas) {
            try {
                cache.canvas.width = 0;
                cache.canvas.height = 0;
            } catch {}
        }
        cache.key = null;
        cache.promise = null;
        cache.canvas = null;
        cache.createdAt = 0;
    }

    function preload() {
        const key = getCacheKey();
        const currentTime = now();
        if (cache.key === key && currentTime - cache.createdAt < ttlMs) {
            if (cache.promise) return cache.promise;
            if (cache.canvas) return Promise.resolve(cache.canvas);
        }

        dispose();
        cache.key = key;
        cache.createdAt = currentTime;

        const renderPromise = renderLayoutCanvas({ ...getRenderOptions(), pageUrl: getPageUrl() })
            .then(canvas => {
                if (cache.key === key) {
                    cache.canvas = canvas;
                    cache.promise = null;
                    cache.timerId = schedule(dispose, ttlMs);
                } else {
                    try {
                        canvas.width = 0;
                        canvas.height = 0;
                    } catch {}
                }
                return canvas;
            })
            .catch(error => {
                if (cache.key === key) dispose();
                throw error;
            });

        cache.promise = renderPromise;
        return renderPromise;
    }

    async function getOrRender() {
        const key = getCacheKey();
        if (cache.key === key && now() - cache.createdAt < ttlMs) {
            if (cache.canvas) return cache.canvas;
            if (cache.promise) return await cache.promise;
        }
        return await preload();
    }

    function hasCachedCanvas() {
        return cache.key === getCacheKey() && Boolean(cache.canvas);
    }

    return { dispose, preload, getOrRender, hasCachedCanvas };
}
