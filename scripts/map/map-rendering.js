import { state } from '../state.js';
import { canvasToTiffBlob } from '../services/format-converters.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { showToast } from '../components/toast-view.js';
import { renderMapLayoutCanvas } from './map-layout-renderer.js';

export { renderHeadlessMap, renderMapLayoutCanvas } from './map-layout-renderer.js';
export { polylabel, getFeatureCenter } from '../utils/map-print-geometry.js';

// ──────────────────────────────────────────────────────────────
// Pre-render Cache & Garbage Management Engine
// ──────────────────────────────────────────────────────────────

const RASTER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL
const DOWNLOAD_VIEW_PRELOAD_DELAY_MS = 500; // 0.5s wait after opening downloads view

let activeRasterCache = {
    key: null,
    promise: null,
    canvas: null,
    createdAt: 0,
    timerId: null
};

let downloadViewPreloadTimer = null;

/**
 * Schedules background raster rendering 0.5s after user opens downloads view (both desktop & mobile)
 */
export function scheduleDownloadViewPreload() {
    cancelDownloadViewPreload();
    downloadViewPreloadTimer = setTimeout(() => {
        downloadViewPreloadTimer = null;
        preloadMapLayout({
            features: state.allFeatures,
            targetFeatureId: state.currentId,
            currentFeature: state.currentFeature,
            isCirclesFeature: state.isCirclesFeature
        });
    }, DOWNLOAD_VIEW_PRELOAD_DELAY_MS);
}

/**
 * Cancels pending download view preload timer
 */
export function cancelDownloadViewPreload() {
    if (downloadViewPreloadTimer) {
        clearTimeout(downloadViewPreloadTimer);
        downloadViewPreloadTimer = null;
    }
}

// Backwards compatibility alias
export const scheduleSelectionPreload = scheduleDownloadViewPreload;
export const cancelSelectionPreload = cancelDownloadViewPreload;

/**
 * Generates a deterministic cache key from layout rendering options
 */
export function getRasterCacheKey({
    targetFeatureId,
    currentFeature,
    isCirclesFeature
} = {}) {
    const cid = currentFeature || state.currentFeature || "eugene";
    const zid = targetFeatureId !== undefined ? targetFeatureId : state.currentId;
    const isCirc = isCirclesFeature !== undefined ? isCirclesFeature : state.isCirclesFeature;
    return `${cid}:${zid || "full"}:${isCirc ? "circles" : "zone"}`;
}

/**
 * Reclaims memory by zeroing out canvas dimensions and clearing all references.
 */
export function disposeRasterCache() {
    cancelSelectionPreload();
    if (activeRasterCache.timerId) {
        clearTimeout(activeRasterCache.timerId);
        activeRasterCache.timerId = null;
    }
    if (activeRasterCache.canvas) {
        try {
            activeRasterCache.canvas.width = 0;
            activeRasterCache.canvas.height = 0;
        } catch (e) {}
    }
    activeRasterCache.key = null;
    activeRasterCache.promise = null;
    activeRasterCache.canvas = null;
    activeRasterCache.createdAt = 0;
}

/**
 * Pre-renders the map layout in the background as soon as subject is identified.
 * Disposes previous stale renders to prevent memory leaks.
 */
export function preloadMapLayout(options = {}) {
    cancelSelectionPreload();
    const key = getRasterCacheKey(options);
    const now = Date.now();

    // Check if we already have an active/pending render for this exact subject within TTL
    if (activeRasterCache.key === key && (now - activeRasterCache.createdAt < RASTER_CACHE_TTL_MS)) {
        if (activeRasterCache.promise) return activeRasterCache.promise;
        if (activeRasterCache.canvas) return Promise.resolve(activeRasterCache.canvas);
    }

    // Different subject or expired — dispose previous render first
    disposeRasterCache();

    activeRasterCache.key = key;
    activeRasterCache.createdAt = now;

    // Start rendering in background
    const renderPromise = renderMapLayoutCanvas(options)
        .then(canvas => {
            if (activeRasterCache.key === key) {
                activeRasterCache.canvas = canvas;
                activeRasterCache.promise = null;
                // Schedule TTL garbage collection
                activeRasterCache.timerId = setTimeout(disposeRasterCache, RASTER_CACHE_TTL_MS);
            } else {
                // User moved on to a different selection while rendering — immediately reclaim canvas buffer
                try {
                    canvas.width = 0;
                    canvas.height = 0;
                } catch (e) {}
            }
            return canvas;
        })
        .catch(err => {
            if (activeRasterCache.key === key) {
                disposeRasterCache();
            }
            throw err;
        });

    activeRasterCache.promise = renderPromise;
    return renderPromise;
}

/**
 * Retrieves the layout canvas — using pre-rendered canvas if available,
 * awaiting pending preload promise if running, or initiating a new render if missing.
 */
export async function getOrRenderLayoutCanvas(options = {}) {
    const key = getRasterCacheKey(options);
    const now = Date.now();

    if (activeRasterCache.key === key && (now - activeRasterCache.createdAt < RASTER_CACHE_TTL_MS)) {
        if (activeRasterCache.canvas) {
            return activeRasterCache.canvas;
        }
        if (activeRasterCache.promise) {
            return await activeRasterCache.promise;
        }
    }

    return await preloadMapLayout(options);
}

export function hasCachedLayoutCanvas(options = {}) {
    const key = getRasterCacheKey(options);
    return activeRasterCache.key === key
        && (Date.now() - activeRasterCache.createdAt < RASTER_CACHE_TTL_MS)
        && !!activeRasterCache.canvas;
}

export async function downloadGeoPdf(filename, triggerButton = null) {
    try {
        if (triggerButton) {
            triggerButton.disabled = true;
            triggerButton.classList.add("is-preparing");
        }
        const options = {
            features: state.allFeatures,
            targetFeatureId: state.currentId,
            currentFeature: state.currentFeature,
            isCirclesFeature: state.isCirclesFeature
        };

        const isReady = activeRasterCache.key === getRasterCacheKey(options) && !!activeRasterCache.canvas;
        if (!isReady) {
            showToast("Rendering map layout...");
        }

        const canvas = await getOrRenderLayoutCanvas(options);
        
        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: "landscape",
                unit: "mm",
                format: "a4"
            });
            
            const imgData = canvas.toDataURL("image/jpeg", 0.92);
            pdf.addImage(imgData, "JPEG", 0, 0, 297, 210);
            
            pdf.setProperties({
                title: filename.replace(/\.pdf$/, ""),
                subject: "GeoPDF Map Layout Export - Esri Topo Basemap",
                keywords: "GeoPDF, GIS, Map, Esri Topo, Fovea",
                creator: "Fovea Web Map Layout Engine"
            });

            const pdfBlob = pdf.output("blob");
            triggerDirectDownload(pdfBlob, filename);
            showToast(`Exported ${filename}`);
        } else {
            canvas.toBlob((blob) => {
                triggerDirectDownload(blob, filename.replace(/\.pdf$/, "-layout.png"));
                showToast(`Exported ${filename.replace(/\.pdf$/, "-layout.png")}`);
            }, "image/png");
        }
    } catch (e) {
        console.error("PDF generation failed:", e);
        showToast("Error generating PDF layout.");
    } finally {
        if (triggerButton) {
            triggerButton.disabled = false;
            triggerButton.classList.remove("is-preparing");
        }
    }
}

export async function downloadGeoTiff(filename, triggerButton = null) {
    try {
        if (triggerButton) {
            triggerButton.disabled = true;
            triggerButton.classList.add("is-preparing");
        }
        const options = {
            features: state.allFeatures,
            targetFeatureId: state.currentId,
            currentFeature: state.currentFeature,
            isCirclesFeature: state.isCirclesFeature
        };

        const isReady = activeRasterCache.key === getRasterCacheKey(options) && !!activeRasterCache.canvas;
        if (!isReady) {
            showToast("Rendering map layout...");
        }

        const canvas = await getOrRenderLayoutCanvas(options);
        const tiffBlob = canvasToTiffBlob(canvas);
        triggerDirectDownload(tiffBlob, filename);
        showToast(`Exported ${filename}`);
    } catch (e) {
        console.error("TIFF generation failed:", e);
        showToast("Error generating TIFF layout.");
    } finally {
        if (triggerButton) {
            triggerButton.disabled = false;
            triggerButton.classList.remove("is-preparing");
        }
    }
}

function triggerDirectDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    a.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}
