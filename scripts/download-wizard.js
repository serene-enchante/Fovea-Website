import { renderMapLayoutCanvas } from './map/map-rendering.js';
import { canvasToTiffBlob } from './services/format-converters.js';

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

async function fetchGeoJsonFile(filenameOrPath) {
    const filename = filenameOrPath.split('/').pop();
    const root = getRootPrefix();
    const candidatePaths = [
        `${root}geojson/${filename}`,
        `../../geojson/${filename}`,
        `../geojson/${filename}`,
        `./geojson/${filename}`,
        `/geojson/${filename}`
    ];

    let lastErr = null;
    for (const p of candidatePaths) {
        try {
            const res = await fetch(p);
            if (res.ok) {
                return await res.json();
            }
        } catch(e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error(`Could not fetch ${filename}`);
}

// Available Count Circles Catalog
const COUNT_CIRCLES = [
    {
        id: "eugene",
        name: "Eugene",
        subtitle: "Lane County, Oregon · 27 Zones",
        totalZones: 27,
        geojsonPath: "geojson/Eugene-02-wgs84.geojson",
        thumbnail: "images/logo-small.png",
        hasData: true
    },
    {
        id: "florence",
        name: "Florence",
        subtitle: "Coastal Oregon · 14 Zones",
        totalZones: 14,
        geojsonPath: "geojson/Florence-00-wgs84.geojson",
        thumbnail: "images/florence.png",
        hasData: true
    },
    {
        id: "cottage-grove",
        name: "Cottage Grove",
        subtitle: "Lane County, Oregon · No Data",
        totalZones: 0,
        geojsonPath: "geojson/circles-wgs84.geojson",
        circleFid: 2,
        hasData: false
    },
    {
        id: "oakridge",
        name: "Oakridge",
        subtitle: "Cascade Foothills · No Data",
        totalZones: 0,
        geojsonPath: "geojson/circles-wgs84.geojson",
        circleFid: 3,
        hasData: false
    }
];

// App Instructions Configuration (Identical to Maps Page)
const APP_INSTRUCTION_CONFIGS = {
    avenza: {
        appName: "Avenza Maps",
        scheme: "avenzamaps://",
        formatKey: "geopdf",
        ext: "pdf",
        iconSrc: "images/app_icons/avenza.webp",
        step1Heading: "Download the GeoPDF",
        step2Heading: "Open in Avenza Maps",
        step2Text: "Tap <strong class=\"avenza-ui-badge\">Download</strong> above, then select <strong class=\"avenza-ui-badge\">Open in Avenza Maps</strong> from the share sheet."
    },

    gaia: {
        appName: "Gaia GPS",
        scheme: "gaiagps://",
        formatKey: "gpx",
        ext: "gpx",
        iconSrc: "images/app_icons/gaia.webp",
        step1Heading: "Download the GPX File",
        step2Heading: "Import into Gaia GPS",
        step2Text: "Tap <strong class=\"avenza-ui-badge\">Download</strong> above, then tap <strong class=\"avenza-ui-badge\">Open in Gaia GPS</strong> to import the boundary."
    },
    caltopo: {
        appName: "CalTopo",
        scheme: "caltopo://",
        formatKey: "gpx",
        ext: "gpx",
        iconSrc: "images/app_icons/caltopo.webp",
        step1Heading: "Download the GPX File",
        step2Heading: "Import into CalTopo",
        step2Text: "Download the file and open it with CalTopo to overlay the zone on USGS quad or custom layers."
    },
    osmand: {
        appName: "OsmAnd Maps",
        scheme: "osmand://",
        formatKey: "gpx",
        ext: "gpx",
        iconSrc: "images/app_icons/osmandmaps.webp",
        step1Heading: "Download the GPX File",
        step2Heading: "Open with OsmAnd",
        step2Text: "Tap <strong class=\"avenza-ui-badge\">Download</strong>, then choose <strong class=\"avenza-ui-badge\">OsmAnd Maps</strong> to import the boundary track."
    }
};

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

const WIZARD_RASTER_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

let wizardRasterCache = {
    key: null,
    promise: null,
    canvas: null,
    createdAt: 0,
    timerId: null
};

function getWizardCacheKey() {
    const cid = state.selectedCircle?.id || "eugene";
    const zid = state.selectedZone ? (state.selectedZone.properties?.zid || "0") : "full";
    return `${cid}:${zid}`;
}

function disposeWizardRasterCache() {
    if (wizardRasterCache.timerId) {
        clearTimeout(wizardRasterCache.timerId);
        wizardRasterCache.timerId = null;
    }
    if (wizardRasterCache.canvas) {
        try {
            wizardRasterCache.canvas.width = 0;
            wizardRasterCache.canvas.height = 0;
        } catch (e) {}
    }
    wizardRasterCache.key = null;
    wizardRasterCache.promise = null;
    wizardRasterCache.canvas = null;
    wizardRasterCache.createdAt = 0;
}

function preloadWizardRaster() {
    const key = getWizardCacheKey();
    const now = Date.now();

    if (wizardRasterCache.key === key && (now - wizardRasterCache.createdAt < WIZARD_RASTER_TTL_MS)) {
        if (wizardRasterCache.promise) return wizardRasterCache.promise;
        if (wizardRasterCache.canvas) return Promise.resolve(wizardRasterCache.canvas);
    }

    disposeWizardRasterCache();

    wizardRasterCache.key = key;
    wizardRasterCache.createdAt = now;

    const renderPromise = renderMapLayoutCanvas({
        features: state.loadedFeatures.length > 0 ? state.loadedFeatures : (state.loadedGeoJSON?.features || []),
        targetFeatureId: state.selectedZone ? (state.selectedZone.properties?.zid || null) : null,
        currentFeature: state.selectedCircle?.id || "eugene",
        isCirclesFeature: false,
        pageUrl: window.location.href
    })
    .then(canvas => {
        if (wizardRasterCache.key === key) {
            wizardRasterCache.canvas = canvas;
            wizardRasterCache.promise = null;
            wizardRasterCache.timerId = setTimeout(disposeWizardRasterCache, WIZARD_RASTER_TTL_MS);
        } else {
            try {
                canvas.width = 0;
                canvas.height = 0;
            } catch (e) {}
        }
        return canvas;
    })
    .catch(err => {
        if (wizardRasterCache.key === key) {
            disposeWizardRasterCache();
        }
        throw err;
    });

    wizardRasterCache.promise = renderPromise;
    return renderPromise;
}

async function getOrRenderWizardCanvas() {
    const key = getWizardCacheKey();
    const now = Date.now();

    if (wizardRasterCache.key === key && (now - wizardRasterCache.createdAt < WIZARD_RASTER_TTL_MS)) {
        if (wizardRasterCache.canvas) return wizardRasterCache.canvas;
        if (wizardRasterCache.promise) return await wizardRasterCache.promise;
    }

    return await preloadWizardRaster();
}

/**
 * Stepper logic
 */
function setupStepper() {
    const stepNodes = document.querySelectorAll(".stepper-step");
    stepNodes.forEach(node => {
        node.addEventListener("click", () => {
            const stepNum = parseInt(node.dataset.step, 10);
            if (stepNum === 1) {
                setStep(1);
            } else if (stepNum === 2 && state.selectedCircle && state.selectedCircle.totalZones > 0) {
                setStep(2);
            } else if (stepNum === 3 && state.selectedCircle && (state.selectedZone !== null || state.currentStep === 3)) {
                setStep(3);
            }
        });
    });

    document.querySelectorAll(".wizard-back-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetStep = parseInt(btn.dataset.targetStep, 10) || (state.currentStep - 1);
            if (targetStep >= 1) setStep(targetStep);
        });
    });

    const changeBtn = document.getElementById("wizard-change-selection-btn");
    if (changeBtn) {
        changeBtn.addEventListener("click", () => {
            setStep(state.selectedCircle && state.selectedCircle.totalZones > 0 ? 2 : 1);
        });
    }

    window.addEventListener("beforeunload", disposeWizardRasterCache);
}

/**
 * Changes active wizard step
 */
function setStep(stepNum) {
    if (stepNum < 3) {
        disposeWizardRasterCache();
    }

    state.currentStep = stepNum;

    // Update step views visibility
    document.querySelectorAll(".wizard-step-view").forEach(v => v.classList.remove("is-visible"));
    const targetView = document.getElementById(`step-${stepNum}-view`);
    if (targetView) targetView.classList.add("is-visible");

    // Update stepper bar UI
    updateStepperUI();

    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Dynamically updates stepper nodes with logos, names, and numbers
 */
function updateStepperUI() {
    const stepNum = state.currentStep;
    const stepNodes = document.querySelectorAll(".stepper-step");

    stepNodes.forEach(node => {
        const nStep = parseInt(node.dataset.step, 10);
        node.classList.remove("is-active", "is-completed", "has-logo", "is-selected-zone");
        const nodeEl = node.querySelector(".stepper-step__node");
        const labelEl = node.querySelector(".stepper-step__label");

        if (nStep === 1) {
            if (state.selectedCircle) {
                if (labelEl) labelEl.textContent = state.selectedCircle.name;
                node.classList.add("has-logo");
                if (nodeEl) nodeEl.innerHTML = `<img src="${resolveAssetPath(state.selectedCircle.thumbnail)}" alt="${escapeHtml(state.selectedCircle.name)}">`;
            } else {
                if (labelEl) labelEl.textContent = "chose count circle";
                if (nodeEl) nodeEl.textContent = "1";
            }
        } else if (nStep === 2) {
            if (state.selectedZone !== null) {
                const zid = state.selectedZone?.properties?.zid;
                const displayZid = zid ? String(zid).padStart(2, "0") : "00";
                if (labelEl) labelEl.textContent = `Zone ${displayZid}`;
                node.classList.add("is-selected-zone");
                if (nodeEl) nodeEl.innerHTML = `<span style="font-size: 0.76rem; font-weight: 800; color: #000000; line-height: 1;">${displayZid}</span>`;
            } else if (state.currentStep === 3 && state.selectedCircle) {
                // Full circle selected in step 3
                if (labelEl) labelEl.textContent = "full circle";
                node.classList.add("is-selected-zone");
                if (nodeEl) nodeEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5"><circle cx="12" cy="12" r="9"></circle></svg>`;
            } else {
                if (labelEl) labelEl.textContent = "select zone";
                if (nodeEl) nodeEl.textContent = "2";
            }
        } else if (nStep === 3) {
            if (labelEl) labelEl.textContent = "download files";
            if (nodeEl) nodeEl.textContent = "3";
        }

        if (nStep === stepNum) {
            node.classList.add("is-active");
        } else if (nStep < stepNum) {
            node.classList.add("is-completed");
        }
    });

    // Update progress track fill
    const trackProgress = document.getElementById("stepper-track-progress");
    if (trackProgress) {
        const progressWidths = { 1: "0%", 2: "50%", 3: "100%" };
        trackProgress.style.width = progressWidths[stepNum] || "0%";
    }
}

/**
 * Setup live search inputs with clear buttons
 */
function setupSearchBars() {
    // Circle Search
    const circleInput = document.getElementById("circle-search-input");
    const circleClear = document.getElementById("circle-search-clear");
    if (circleInput) {
        circleInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (circleClear) circleClear.style.display = query ? "flex" : "none";
            const filtered = COUNT_CIRCLES.filter(c => 
                c.name.toLowerCase().includes(query) || c.subtitle.toLowerCase().includes(query)
            );
            renderCirclesList(filtered);
        });
    }
    if (circleClear && circleInput) {
        circleClear.addEventListener("click", () => {
            circleInput.value = "";
            circleClear.style.display = "none";
            circleInput.focus();
            renderCirclesList(COUNT_CIRCLES);
        });
    }

    // Zone Search
    const zoneInput = document.getElementById("zone-search-input");
    const zoneClear = document.getElementById("zone-search-clear");
    if (zoneInput) {
        zoneInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (zoneClear) zoneClear.style.display = query ? "flex" : "none";
            filterZonesList(query);
        });
    }
    if (zoneClear && zoneInput) {
        zoneClear.addEventListener("click", () => {
            zoneInput.value = "";
            zoneClear.style.display = "none";
            zoneInput.focus();
            filterZonesList("");
        });
    }
}

/**
 * Renders Step 1 Count Circles Grid
 */
function renderCirclesList(circles) {
    const container = document.getElementById("circle-cards-grid");
    if (!container) return;

    container.innerHTML = "";

    if (circles.length === 0) {
        container.innerHTML = `<div class="wizard-no-results">No count circles match your search.</div>`;
        return;
    }

    circles.forEach(circle => {
        const card = document.createElement("div");
        card.className = `wizard-item-card ${state.selectedCircle?.id === circle.id ? 'is-selected' : ''} ${!circle.hasData ? 'is-disabled' : ''}`;
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");

        let thumbHtml = "";
        if (!circle.hasData) {
            thumbHtml = `
                <div class="wizard-circle-thumb wizard-circle-thumb--no-data" title="No data available">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                    </svg>
                </div>
            `;
        } else {
            thumbHtml = `
                <div class="wizard-circle-thumb wizard-circle-thumb--logo">
                    <img src="${resolveAssetPath(circle.thumbnail)}" alt="${escapeHtml(circle.name)}" loading="eager">
                </div>
            `;
        }

        card.innerHTML = `
            <div class="wizard-item-card__left">
                ${thumbHtml}
                <div class="wizard-item-card__info">
                    <h3 class="wizard-item-card__title">${escapeHtml(circle.name)}</h3>
                    <span class="wizard-item-card__desc">${escapeHtml(circle.subtitle)}</span>
                </div>
            </div>
            <div class="wizard-item-card__arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </div>
        `;

        card.addEventListener("click", () => selectCircle(circle));
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectCircle(circle);
            }
        });

        container.appendChild(card);
    });
}

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
        const geojson = await fetchGeoJsonFile(circle.geojsonPath);
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
 * Renders Step 2 Zones List
 */
function renderZonesList(features) {
    const container = document.getElementById("zone-cards-grid");
    const circleNameEl = document.getElementById("step-2-circle-name");
    if (circleNameEl && state.selectedCircle) {
        circleNameEl.textContent = state.selectedCircle.name;
    }

    const fullCircleCard = document.getElementById("btn-download-full-circle");
    if (fullCircleCard) {
        fullCircleCard.onclick = () => selectZone(null);
    }

    if (!container) return;
    container.innerHTML = "";

    if (features.length === 0) {
        container.innerHTML = `<div class="wizard-no-results">No zones available for this circle.</div>`;
        return;
    }

    features.forEach(feature => {
        const zid = feature.properties?.zid || "0";
        const displayZid = String(zid).padStart(2, "0");
        const card = document.createElement("div");
        card.className = "wizard-item-card";
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.dataset.zid = displayZid;

        card.innerHTML = `
            <div class="wizard-item-card__left">
                <div class="wizard-item-card__info">
                    <h3 class="wizard-item-card__title">Zone ${displayZid}</h3>
                </div>
            </div>
            <div class="wizard-item-card__arrow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </div>
        `;

        card.addEventListener("click", () => selectZone(feature));
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectZone(feature);
            }
        });

        container.appendChild(card);
    });
}

/**
 * Filters zones by query
 */
function filterZonesList(query) {
    const cards = document.querySelectorAll("#zone-cards-grid .wizard-item-card");
    let visibleCount = 0;
    cards.forEach(card => {
        const zid = card.dataset.zid || "";
        const title = `zone ${zid}`.toLowerCase();
        if (title.includes(query) || zid.includes(query)) {
            card.style.display = "flex";
            visibleCount++;
        } else {
            card.style.display = "none";
        }
    });

    let noResultsEl = document.querySelector("#zone-cards-grid .wizard-no-results");
    if (visibleCount === 0) {
        if (!noResultsEl) {
            noResultsEl = document.createElement("div");
            noResultsEl.className = "wizard-no-results";
            noResultsEl.textContent = "No zones match your search.";
            document.getElementById("zone-cards-grid").appendChild(noResultsEl);
        }
    } else if (noResultsEl) {
        noResultsEl.remove();
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

/**
 * Converts GeoJSON to standard KML XML string
 */
function geojsonToKml(geojson, docName = "CBC Boundary") {
    let placemarks = "";
    const features = geojson.features || (geojson.type === "Feature" ? [geojson] : []);

    features.forEach((feat, idx) => {
        const props = feat.properties || {};
        const title = props.zid ? `Zone ${props.zid}` : props.cid ? `${props.cid} Circle` : `Feature ${idx + 1}`;
        const desc = props.name || props.description || `Christmas Bird Count boundary for ${title}`;
        let geomKml = "";

        if (feat.geometry) {
            const gType = feat.geometry.type;
            const coords = feat.geometry.coordinates;

            if (gType === "Polygon") {
                geomKml = polygonToKml(coords);
            } else if (gType === "MultiPolygon") {
                geomKml = "<MultiGeometry>" + coords.map(p => polygonToKml(p)).join("") + "</MultiGeometry>";
            } else if (gType === "Point") {
                geomKml = `<Point><coordinates>${coords[0]},${coords[1]},0</coordinates></Point>`;
            } else if (gType === "LineString") {
                const lineStr = coords.map(c => `${c[0]},${c[1]},0`).join(" ");
                geomKml = `<LineString><coordinates>${lineStr}</coordinates></LineString>`;
            }
        }

        if (geomKml) {
            placemarks += `
    <Placemark>
      <name>${escapeXml(title)}</name>
      <description>${escapeXml(desc)}</description>
      <Style>
        <LineStyle><color>ff00aaff</color><width>3</width></LineStyle>
        <PolyStyle><color>4000aaff</color></PolyStyle>
      </Style>
      ${geomKml}
    </Placemark>`;
        }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(docName)}</name>
    ${placemarks}
  </Document>
</kml>`;
}

function polygonToKml(coords) {
    let out = "<Polygon><tessellate>1</tessellate>";
    if (coords && coords.length > 0) {
        const outer = coords[0].map(c => `${c[0]},${c[1]},0`).join(" ");
        out += `<outerBoundaryIs><LinearRing><coordinates>${outer}</coordinates></LinearRing></outerBoundaryIs>`;
        for (let i = 1; i < coords.length; i++) {
            const inner = coords[i].map(c => `${c[0]},${c[1]},0`).join(" ");
            out += `<innerBoundaryIs><LinearRing><coordinates>${inner}</coordinates></LinearRing></innerBoundaryIs>`;
        }
    }
    out += "</Polygon>";
    return out;
}

/**
 * Converts GeoJSON to standard GPX XML string
 */
function geojsonToGpx(geojson, trackName = "CBC Survey Boundary") {
    let trkSegments = "";
    const features = geojson.features || (geojson.type === "Feature" ? [geojson] : []);

    features.forEach((feat) => {
        if (!feat.geometry) return;
        const gType = feat.geometry.type;
        const coords = feat.geometry.coordinates;

        const processRing = (ring) => {
            let pts = "";
            ring.forEach(pt => {
                pts += `      <trkpt lat="${pt[1]}" lon="${pt[0]}"></trkpt>\n`;
            });
            return `    <trkseg>\n${pts}    </trkseg>\n`;
        };

        if (gType === "Polygon" && coords.length > 0) {
            trkSegments += processRing(coords[0]);
        } else if (gType === "MultiPolygon") {
            coords.forEach(poly => {
                if (poly.length > 0) trkSegments += processRing(poly[0]);
            });
        } else if (gType === "LineString") {
            trkSegments += processRing(coords);
        }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fovea Spatial Tools - https://fovea.org" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(trackName)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(trackName)}</name>
${trkSegments}  </trk>
</gpx>`;
}

function escapeXml(unsafe) {
    if (!unsafe) return "";
    return String(unsafe).replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
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
        const key = getWizardCacheKey();
        const isReady = wizardRasterCache.key === key && !!wizardRasterCache.canvas;
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
        const key = getWizardCacheKey();
        const isReady = wizardRasterCache.key === key && !!wizardRasterCache.canvas;
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
