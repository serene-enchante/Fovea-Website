import { renderMapLayoutCanvas } from './map/map-rendering.js';
import { canvasToTiffBlob } from './services/format-converters.js';
import { geojsonToGpx, geojsonToKml } from './services/download-wizard-formatters.js';
import { APP_INSTRUCTION_CONFIGS, COUNT_CIRCLES } from './config/download-wizard-config.js';
import { createDownloadWizardRasterCache } from './map/download-wizard-raster-cache.js';
import { loadGeoDataset } from './services/geo-data-repository.js';
import { createDownloadWizardStepper } from './components/download-wizard-stepper.js';
import { createDownloadWizardSelectionView } from './components/download-wizard-selection-view.js';

/**
 * download-wizard.js
 * Controller for Fovea's Download Wizard tool.
 * Provides a 3-step guided workflow:
 *  Step 1: Select Count Circle
 *  Step 2: Select Zone (or skip to Full Circle)
 *  Step 3: Choose Compatible App or Direct Format
 */

function getRootPrefix() {
    const navScript = document.querySelector('script[data-root]');
    if (navScript && navScript.getAttribute('data-root')) {
        return navScript.getAttribute('data-root');
    }
    const path = window.location.pathname;
    if (path.includes('/tools/download-wizard')) return '../../';
    if (path.includes('/download-wizard')) return '../';
    return './';
}

function resolveAssetPath(relativePath) {
    if (!relativePath) return '';
    const cleanPath = relativePath.replace(/^(\.\.\/)+/, '').replace(/^(\.\/)+/, '');
    return `${getRootPrefix()}${cleanPath}`;
}

async function fetchGeoJsonFile(datasetId, filenameOrPath) {
    const filename = filenameOrPath.split('/').pop();
    const root = getRootPrefix();
    const candidatePaths = [
        `${root}geojson/${filename}`,
        `../../geojson/${filename}`,
        `../geojson/${filename}`,
        `./geojson/${filename}`,
        `/geojson/${filename}`
    ];

    return loadGeoDataset(datasetId, { paths: candidatePaths });
}

// Wizard State
const state = {
    currentStep: 1,
    selectedCircle: null,
    selectedZone: null,
    loadedFeatures: [],
    loadedGeoJSON: null,
    activeGeneratedBlob: null,
    activeGeneratedFilename: null
};

/**
 * Initializes the Download Wizard
 */
export function initDownloadWizard() {
    setupStepper();
    setupSearchBars();
    renderCirclesList(COUNT_CIRCLES);
    setupAppCards();
    setupDirectDownloadButtons();
    setupModalEvents();

    // Check if circle pre-selected from URL (e.g. ?circle=eugene&zone=04)
    const params = new URLSearchParams(window.location.search);
    const circleParam = params.get("circle");
    const zoneParam = params.get("zone");

    if (circleParam) {
        const found = COUNT_CIRCLES.find(c => c.id.toLowerCase() === circleParam.toLowerCase());
        if (found) {
            selectCircle(found, false).then(() => {
                if (zoneParam) {
                    if (zoneParam.toLowerCase() === "full" || zoneParam.toLowerCase() === "all") {
                        selectZone(null);
                    } else {
                        const targetZ = state.loadedFeatures.find(f => {
                            const zid = String(f.properties?.zid || "").toLowerCase();
                            return zid === zoneParam.toLowerCase() || zid === zoneParam.padStart(2, "0").toLowerCase();
                        });
                        if (targetZ) selectZone(targetZ);
                    }
                }
            });
        }
    }
}

// ──────────────────────────────────────────────────────────────
// Pre-render Cache & Garbage Management for Download Wizard
// ──────────────────────────────────────────────────────────────

const wizardRasterCache = createDownloadWizardRasterCache({
    getCacheKey: () => {
        const circleId = state.selectedCircle?.id || 'eugene';
        const zoneId = state.selectedZone ? (state.selectedZone.properties?.zid || '0') : 'full';
        return `${circleId}:${zoneId}`;
    },
    getRenderOptions: () => ({
        features: state.loadedFeatures.length > 0 ? state.loadedFeatures : (state.loadedGeoJSON?.features || []),
        targetFeatureId: state.selectedZone ? (state.selectedZone.properties?.zid || null) : null,
        currentFeature: state.selectedCircle?.id || 'eugene',
        isCirclesFeature: false
    }),
    renderLayoutCanvas: renderMapLayoutCanvas,
    getPageUrl: () => window.location.href
});
const {
    dispose: disposeWizardRasterCache,
    preload: preloadWizardRaster,
    getOrRender: getOrRenderWizardCanvas,
    hasCachedCanvas: hasWizardRasterCanvas
} = wizardRasterCache;

const {
    setup: setupStepper,
    setStep,
    updateStepperUI
} = createDownloadWizardStepper({
    state,
    disposeRasterCache: disposeWizardRasterCache,
    resolveAssetPath,
    escapeHtml
});

const {
    setupSearchBars,
    renderCirclesList,
    renderZonesList,
    filterZonesList
} = createDownloadWizardSelectionView({
    state,
    circles: COUNT_CIRCLES,
    onSelectCircle: circle => selectCircle(circle),
    onSelectZone: zone => selectZone(zone),
    resolveAssetPath,
    escapeHtml
});

/**
 * Handle circle selection and GeoJSON data loading
 */
async function selectCircle(circle, advance = true) {
    if (!circle.hasData) {
        showToast("There is no data for this count circle");
        return;
    }

    disposeWizardRasterCache();

    state.selectedCircle = circle;
    state.selectedZone = null;

    // Update selected styling in Step 1
    document.querySelectorAll("#circle-cards-grid .wizard-item-card").forEach(c => c.classList.remove("is-selected"));

    // Fetch GeoJSON features for this circle
    try {
        const geojson = await fetchGeoJsonFile(circle.id, circle.geojsonPath);
        state.loadedGeoJSON = geojson;

        if (circle.totalZones > 0) {
            state.loadedFeatures = (geojson.features || []).filter(f => f.properties && f.properties.zid);
            // Sort zones numerically
            state.loadedFeatures.sort((a, b) => {
                const numA = parseInt(a.properties.zid, 10) || 0;
                const numB = parseInt(b.properties.zid, 10) || 0;
                return numA - numB;
            });
            renderZonesList(state.loadedFeatures);
            if (advance) setStep(2);
        } else {
            // Full Circle only (e.g. Cottage Grove / Oakridge)
            if (circle.circleFid && geojson.features) {
                const targetFeature = geojson.features.find(f => f.properties?.fid === circle.circleFid);
                state.loadedFeatures = targetFeature ? [targetFeature] : geojson.features;
            } else {
                state.loadedFeatures = geojson.features || [];
            }
            selectZone(null); // Direct to step 3 for full circle
        }
    } catch(err) {
        console.error("Error loading circle data:", err);
        showToast("Error loading circle data. Please try again.");
    }
}

/**
 * Handle zone selection and update Step 3 summary
 */
function selectZone(zoneFeature = null) {
    state.selectedZone = zoneFeature;

    // Update Step 3 Summary
    const summaryTarget = document.getElementById("wizard-summary-target");
    const summaryPill = document.getElementById("wizard-summary-pill");

    if (summaryTarget && state.selectedCircle) {
        summaryTarget.textContent = state.selectedCircle.name;
    }
    if (summaryPill) {
        if (zoneFeature) {
            const zid = String(zoneFeature.properties?.zid || "0").padStart(2, "0");
            summaryPill.textContent = `Zone ${zid}`;
        } else {
            summaryPill.textContent = "Full Circle";
        }
    }

    setStep(3);
    // Pre-render immediately in background as soon as subject is identified
    preloadWizardRaster();
}

/**
 * Extracts active GeoJSON feature collection for export
 */
function getExportGeoJSON() {
    if (state.selectedZone) {
        return {
            type: "FeatureCollection",
            name: `${state.selectedCircle.name}-Zone-${state.selectedZone.properties.zid}`,
            features: [state.selectedZone]
        };
    }
    return {
        type: "FeatureCollection",
        name: `${state.selectedCircle.name}-Count-Circle`,
        features: state.loadedFeatures.length > 0 ? state.loadedFeatures : (state.loadedGeoJSON?.features || [])
    };
}

/**
 * Returns formatted download filename
 */
function getDownloadFilename(ext) {
    const circleName = (state.selectedCircle?.name || "Count-Circle").replace(/\s+/g, "-");
    if (state.selectedZone) {
        const zid = String(state.selectedZone.properties?.zid || "0").padStart(2, "0");
        return `${circleName}-Zone-${zid}.${ext}`;
    }
    return `${circleName}-Full-Circle.${ext}`;
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);
}

/**
 * Triggers browser download for a Blob
 */
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    a.addEventListener("click", (e) => e.stopPropagation());
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 200);
}

/**
 * Generates a GeoPDF layout Blob using headless offscreen MapLibre
 */
async function generateGeoPdfBlob(targetBtn = null, silent = false) {
    if (targetBtn) {
        targetBtn.disabled = true;
        targetBtn.classList.add("is-preparing");
    }
    try {
        const isReady = hasWizardRasterCanvas();
        if (!silent && !isReady) {
            showToast("Rendering map layout...");
        }

        const canvas = await getOrRenderWizardCanvas();
        const filename = getDownloadFilename("pdf");

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
                title: filename.replace(/\.pdf$/i, ""),
                subject: "GeoPDF Map Layout Export - Esri Topo Basemap",
                keywords: "GeoPDF, GIS, Map, Esri Topo, Fovea",
                creator: "Fovea Web Map Layout Engine"
            });
            return { blob: pdf.output("blob"), filename };
        } else {
            return new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    resolve({ blob, filename: filename.replace(/\.pdf$/i, "-layout.png") });
                }, "image/png");
            });
        }
    } finally {
        if (targetBtn) {
            targetBtn.disabled = false;
            targetBtn.classList.remove("is-preparing");
        }
    }
}

/**
 * Generates a GeoTIFF layout Blob using headless offscreen MapLibre
 */
async function generateGeoTiffBlob(targetBtn = null, silent = false) {
    if (targetBtn) {
        targetBtn.disabled = true;
        targetBtn.classList.add("is-preparing");
    }
    try {
        const isReady = hasWizardRasterCanvas();
        if (!silent && !isReady) {
            showToast("Rendering map layout...");
        }

        const canvas = await getOrRenderWizardCanvas();
        const filename = getDownloadFilename("tif");
        const blob = canvasToTiffBlob(canvas);
        return { blob, filename };
    } finally {
        if (targetBtn) {
            targetBtn.disabled = false;
            targetBtn.classList.remove("is-preparing");
        }
    }
}

/**
 * Setup Direct Spatial Download Buttons
 */
function setupDirectDownloadButtons() {
    // GeoJSON Download
    const geojsonBtn = document.getElementById("download-format-geojson");
    if (geojsonBtn) {
        geojsonBtn.addEventListener("click", () => {
            const geojson = getExportGeoJSON();
            const filename = getDownloadFilename("geojson");
            const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
            downloadBlob(blob, filename);
            showToast(`Downloaded ${filename}`);
        });
    }

    // KMZ / KML Download
    const kmzBtn = document.getElementById("download-format-kmz");
    if (kmzBtn) {
        kmzBtn.addEventListener("click", async () => {
            const geojson = getExportGeoJSON();
            const filename = getDownloadFilename("kmz");
            const kmlContent = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ""));

            if (typeof JSZip !== "undefined") {
                const zip = new JSZip();
                zip.file("doc.kml", kmlContent);
                const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });
                downloadBlob(blob, filename);
                showToast(`Downloaded ${filename}`);
            } else {
                const kmlBlob = new Blob([kmlContent], { type: "application/vnd.google-earth.kml+xml" });
                const kmlName = filename.replace(/\.kmz$/i, ".kml");
                downloadBlob(kmlBlob, kmlName);
                showToast(`Downloaded ${kmlName}`);
            }
        });
    }

    // GPX Download
    const gpxBtn = document.getElementById("download-format-gpx");
    if (gpxBtn) {
        gpxBtn.addEventListener("click", () => {
            const geojson = getExportGeoJSON();
            const filename = getDownloadFilename("gpx");
            const gpxContent = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ""));
            const blob = new Blob([gpxContent], { type: "application/gpx+xml" });
            downloadBlob(blob, filename);
            showToast(`Downloaded ${filename}`);
        });
    }

    // KML Download
    const kmlBtn = document.getElementById("download-format-kml");
    if (kmlBtn) {
        kmlBtn.addEventListener("click", () => {
            const geojson = getExportGeoJSON();
            const filename = getDownloadFilename("kml");
            const kmlContent = geojsonToKml(geojson, filename.replace(/\.kml$/i, ""));
            const blob = new Blob([kmlContent], { type: "application/vnd.google-earth.kml+xml" });
            downloadBlob(blob, filename);
            showToast(`Downloaded ${filename}`);
        });
    }

    // GeoTIFF Download
    const geotiffBtn = document.getElementById("download-format-geotiff");
    if (geotiffBtn) {
        geotiffBtn.addEventListener("click", async () => {
            try {
                const { blob, filename } = await generateGeoTiffBlob(geotiffBtn);
                downloadBlob(blob, filename);
                showToast(`Downloaded ${filename}`);
            } catch (err) {
                console.error("GeoTIFF download error:", err);
                showToast("Error generating GeoTIFF.");
            }
        });
    }

    // GeoPDF Download
    const geopdfBtn = document.getElementById("download-format-geopdf");
    if (geopdfBtn) {
        geopdfBtn.addEventListener("click", async () => {
            try {
                const { blob, filename } = await generateGeoPdfBlob(geopdfBtn);
                downloadBlob(blob, filename);
                showToast(`Downloaded ${filename}`);
            } catch (err) {
                console.error("GeoPDF download error:", err);
                showToast("Error generating GeoPDF.");
            }
        });
    }
}

/**
 * Setup App cards in Step 3
 */
function setupAppCards() {
    document.querySelectorAll(".wizard-app-card").forEach(card => {
        card.addEventListener("click", () => {
            const appKey = card.dataset.app;
            handleAppCardClick(appKey);
        });
    });
}

/**
 * Handle Compatible App Card click -> Opens instruction popup immediately & renders in background
 */
function handleAppCardClick(appKey) {
    const config = APP_INSTRUCTION_CONFIGS[appKey] || APP_INSTRUCTION_CONFIGS.avenza;
    const geojson = getExportGeoJSON();
    const filename = getDownloadFilename(config.ext);

    let blobPromise = null;
    if (config.formatKey === "geopdf" || config.ext === "pdf") {
        blobPromise = generateGeoPdfBlob(null, true);
    } else if (config.formatKey === "geotiff" || config.ext === "tif") {
        blobPromise = generateGeoTiffBlob(null, true);
    } else if (config.formatKey === "kmz") {
        blobPromise = (async () => {
            const kmlContent = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ""));
            if (typeof JSZip !== "undefined") {
                const zip = new JSZip();
                zip.file("doc.kml", kmlContent);
                const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });
                return { blob, filename };
            } else {
                return { blob: new Blob([kmlContent], { type: "application/vnd.google-earth.kml+xml" }), filename: filename.replace(/\.kmz$/i, ".kml") };
            }
        })();
    } else if (config.formatKey === "gpx") {
        const gpxContent = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ""));
        blobPromise = Promise.resolve({ blob: new Blob([gpxContent], { type: "application/gpx+xml" }), filename });
    } else {
        blobPromise = Promise.resolve({ blob: new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" }), filename });
    }

    state.activeGeneratedBlobPromise = blobPromise;
    state.activeGeneratedBlob = null;
    state.activeGeneratedFilename = filename;

    blobPromise.then(res => {
        state.activeGeneratedBlob = res.blob;
        if (res.filename) state.activeGeneratedFilename = res.filename;
    }).catch(err => {
        console.error("Background export error:", err);
    });

    // Open popup instantly without delay
    openAppInstructionModal(config, filename);
}

/**
 * Opens App Instruction Modal
 */
function openAppInstructionModal(config, filename) {
    const modal = document.getElementById("avenza-instruction-modal");
    if (!modal) return;

    // Set App Icon
    const appIconEl = document.getElementById("avenza-modal-app-icon");
    if (appIconEl) {
        appIconEl.src = resolveAssetPath(config.iconSrc);
        appIconEl.alt = config.appName;
    }

    // Set Target Name
    const targetNameEl = document.getElementById("avenza-target-name");
    if (targetNameEl) {
        targetNameEl.textContent = state.selectedZone
            ? `Zone ${String(state.selectedZone.properties?.zid || "0").padStart(2, "0")}`
            : (state.selectedCircle?.name || "Count Circle");
    }

    // Set Selection Logo Thumbnail
    const selectionThumb = document.getElementById("avenza-selection-thumb");
    if (selectionThumb) {
        selectionThumb.src = resolveAssetPath(state.selectedCircle?.thumbnail || "images/logo-small.png");
    }

    // Set Step Texts
    const step1Heading = document.getElementById("avenza-step1-heading");
    if (step1Heading) step1Heading.textContent = config.step1Heading;

    const step2Heading = document.getElementById("avenza-step2-heading");
    if (step2Heading) step2Heading.textContent = config.step2Heading;

    const step2Text = document.getElementById("avenza-step2-text");
    if (step2Text) step2Text.innerHTML = config.step2Text;

    // Download Button handler in Modal
    const modalDownloadBtn = document.getElementById("avenza-modal-download-btn");
    if (modalDownloadBtn) {
        modalDownloadBtn.classList.remove("is-downloaded", "is-preparing");
        const defaultHtml = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download File</span>
        `;
        modalDownloadBtn.innerHTML = defaultHtml;

        modalDownloadBtn.onclick = async () => {
            if (modalDownloadBtn.classList.contains("is-preparing")) return;

            let blob = state.activeGeneratedBlob;
            let targetFilename = state.activeGeneratedFilename || filename;

            if (!(blob instanceof Blob)) {
                showToast("Rendering map layout...");
                modalDownloadBtn.classList.add("is-preparing");
                modalDownloadBtn.innerHTML = `
                    <svg class="spin-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="2" x2="12" y2="6"></line>
                        <line x1="12" y1="18" x2="12" y2="22"></line>
                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                        <line x1="2" y1="12" x2="6" y2="12"></line>
                        <line x1="18" y1="12" x2="22" y2="12"></line>
                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                    </svg>
                    <span>Preparing...</span>
                `;

                try {
                    if (state.activeGeneratedBlobPromise) {
                        const res = await state.activeGeneratedBlobPromise;
                        blob = res.blob;
                        if (res.filename) targetFilename = res.filename;
                    }
                    state.activeGeneratedBlob = blob;
                    state.activeGeneratedFilename = targetFilename;
                } catch (err) {
                    console.error("Modal download error:", err);
                    showToast("Error generating download file.");
                    modalDownloadBtn.classList.remove("is-preparing");
                    modalDownloadBtn.innerHTML = defaultHtml;
                    return;
                }
                modalDownloadBtn.classList.remove("is-preparing");
            }

            downloadBlob(blob, targetFilename);
            modalDownloadBtn.classList.add("is-downloaded");
            modalDownloadBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Downloaded</span>
            `;
            showToast(`Downloaded ${targetFilename}`);
        };
    }

    // Direct Launch App button
    const openBtn = document.getElementById("avenza-modal-open-btn");
    if (openBtn) {
        openBtn.textContent = `Open in ${config.appName}`;
        openBtn.onclick = (e) => {
            e.preventDefault();
            window.location.href = config.scheme;
        };
    }

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
}


/**
 * Setup modal close triggers
 */
function setupModalEvents() {
    const modal = document.getElementById("avenza-instruction-modal");
    if (!modal) return;

    modal.querySelectorAll("[data-modal-close]").forEach(el => {
        el.addEventListener("click", () => {
            modal.classList.remove("is-open");
            modal.setAttribute("aria-hidden", "true");
        });
    });

    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.classList.contains("is-open")) {
            modal.classList.remove("is-open");
            modal.setAttribute("aria-hidden", "true");
        }
    });
}

/**
 * Toast Notification Helper
 */
function showToast(message) {
    let toast = document.getElementById("toast-notification");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("is-visible");
    if (window._wizardToastTimer) clearTimeout(window._wizardToastTimer);
    window._wizardToastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2800);
}

// Initialize on DOM ready
if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initDownloadWizard);
    } else {
        initDownloadWizard();
    }
}
