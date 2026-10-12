import { CIRCLE_ID } from './config/app-config.js';
import { FLORENCE_ZONE_BIRDS } from './config/florence-zone-guide.js';
import { loadGeoDataset } from './services/geo-data-repository.js';
import { getEbirdUrl } from './services/ebird-links.js';
import { fetchBirdObservations, fetchTaxonDefaultPhoto } from './services/observations-client.js';
import { getInitialIdFromUrl, getSelectedGeoJSONData } from './services/bird-data-service.js';
import { handleSpatialFileShare as shareSpatialFile } from './services/file-download-service.js';
import { launchAppWithStoreFallback } from './services/app-launch-service.js';
import { canvasToTiffBlob, geojsonToGpx, geojsonToKml } from './services/format-converters.js';
import { findPointInsidePolygon, getBbox, isPointInGeoJSONGeometry } from './utils/geometry-math.js';
import { displayZoneId, formatArea, formatDate, normalizeZoneId, zoneImagePath } from './utils/format-utils.js';
import {
    checkUserLocationZone as updateLocationZone,
    createMapInstance,
    switchBaseMap as applyBaseMap,
    toggleLocationTracking as trackUserLocation
} from './map/map-init.js';
import { setupMapLayers, addZoneFeatureLayers, buildZoneFeatureData, selectMapStyleByIndex, updateAllFeatureStyles as updateMapFeatureStyles, updateLabelZoomVisibility, rebuildHtmlLabels as rebuildMapHtmlLabels } from './map/map-layers.js';
import { setupMapCanvasEvents, setupMapHoverEvents } from './map/map-events.js';
import { setupProximityGlowCanvas } from './map/map-proximity.js';
import { setupMapViewportEffects } from './map/map-viewport.js';
import {
    cancelDownloadViewPreload,
    disposeRasterCache,
    getFeatureCenter,
    getOrRenderLayoutCanvas,
    hasCachedLayoutCanvas,
    scheduleDownloadViewPreload
} from './map/map-rendering.js';
import { setupSearch } from './map/map-search.js';
import { adjustHeaderFontSize, getFitPadding, updateHeader } from './components/header-view.js';
import { syncSidebarTabs } from './components/sidebar-tabs.js';
import { activateSidebarTab, setupSidebarCapsuleEvents } from './components/sidebar-capsule-events.js';
import { getSuggestSelectionLabel, setupSuggestFormAndDrawing } from './components/feedback-form.js';
import { setupSidebarScrollListener, updateKeyboardTileFocus } from './components/sidebar-list.js';
import { openImageLightbox, setupImageLightbox } from './components/image-lightbox.js';
import { setupHelpModeSystem } from './components/map-modals.js';
import { setupMobileBottomNav } from './components/bottom-nav-view.js';
import { showToast } from './components/toast-view.js';
import { setupActionButtons as setupToolbarActionButtons, setupViewToggleMenu, updateAllAppsModalHeaderTitle, updateShareModalDescription, toggleFullscreen, getActiveDownloadFilename, generateAppSpatialBlob } from './components/toolbar-actions.js';
import { closeAvenzaModal, closeAllAppsModal, closeAllModals as closeModalsView } from './components/modal-view.js';
import { handleAppDirectOpen } from './components/avenza-modal-view.js';
import { setMobileSnapState, setupListSwipeBack, setupMobileResizeBar, setupSwipeNavigation, updateControlPositions } from './components/mobile-view.js';
import { createFeatureTransitionController, selectSubject as selectMapSubject } from './map/map-selection.js';
import { state } from './state.js';

const FALLBACK_IMAGE = "../images/wetlands.jpg";

// MapLibre prototype polyfill for Leaflet legacy compatibility
if (typeof maplibregl !== 'undefined' && maplibregl.Map) {
    maplibregl.Map.prototype.invalidateSize = function() {
        this.resize();
    };
}

function updateAllFeatureStyles() {
    updateMapFeatureStyles({ updateAdditionalLayers: updateBirdObservationsLayerStyles });
}

Object.assign(state, {
    allFeatures: [],
    circlesFeatures: [],
    eugeneFeatures: [],
    florenceFeatures: [],
    currentFeature: "circles", // "circles", "eugene", "florence"
    isCirclesFeature: true,
    currentId: CIRCLE_ID,
    activeTab: "overview",
    isSwipeTransitionActive: false,
    map: null,
    geoJsonLayer: null,
    featureLayersMap: new Map(), // maps zoneId/cid -> leaflet layer
    lastZoneClickTime: 0,
    userLocationMarker: null,
    userLocationAccuracy: null,
    isLocating: false,
    locateControl: null,
    fullscreenControl: null,
    layersControl: null,
    focusedTileIndex: -1,
    lastNavSource: "click",
    baseMapsList: [],
    currentBaseLayer: "default",
    snapState: "default"
});





// --- Client-Side Exporter Helpers (GeoJSON, KMZ, GPX) ---


function handleSpatialFileShare(event, fileOrBlob, fileName, triggerButton = null) {
  return shareSpatialFile(
    event,
    fileOrBlob,
    fileName,
    triggerButton,
    (message, isError) => showToast(message, isError),
    { compatibilityProfile: 'legacy-map' }
  );
}

/**
 * Dynamically updates the Avenza modal title to match selection type (Zones vs Circles).
 */


/**
 * Returns count circle thumbnail/logo for the current selection (matching top-left header logo).
 */


/**
 * Opens the blackout instruction modal dynamically configured for any app (Avenza, Gaia GPS, CalTopo, OsmAnd).
 */



function switchBaseMap(baseMapId) {
    return applyBaseMap(baseMapId, { state, updateStyles: updateAllFeatureStyles });
}

// ──────────────────────────────────────────────────────────────
// Headless offscreen MapLibre renderer for PDF / TIFF exports
// No dependency on the on-screen map DOM or state.map
// ──────────────────────────────────────────────────────────────


/**
 * Fast & exact Pole of Inaccessibility (Polylabel) algorithm.
 * Finds the most distant internal point from the polygon outline (maximum clearance from all borders).
 * Guaranteed to place labels in the widest, most spacious part of any polygon (even concave/complex).
 */


/**
 * Helper to compute the most spacious interior point for a GeoJSON feature (maximum border clearance).
 */


/**
 * Create a headless offscreen MapLibre GL instance, render Esri Topo tiles
 * with optional zone polygon overlays, and return a standalone canvas copy + zone label positions.
 */


/**
 * Render a full cartographic print layout canvas using a headless offscreen MapLibre instance.
 * Completely independent of the on-screen map.
 * @returns {Promise<HTMLCanvasElement>} The final 4000×3000 layout canvas
 */


async function downloadGeoPdf(triggerButton = null) {
    const isReady = hasCachedLayoutCanvas();
    if (!isReady) {
        showToast("Rendering map layout...");
    }

    const canvas = await getOrRenderLayoutCanvas();
    const filename = getActiveDownloadFilename("pdf");
    
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
        await handleSpatialFileShare(null, pdfBlob, filename, triggerButton);
        showToast(`Exported ${filename}`);
    } else {
        canvas.toBlob(async (blob) => {
            await handleSpatialFileShare(null, blob, filename.replace(/\.pdf$/, "-layout.png"), triggerButton);
            showToast(`Exported ${filename.replace(/\.pdf$/, "-layout.png")}`);
        }, "image/png");
    }
}

async function downloadGeoTiff(triggerButton = null) {
    const isReady = hasCachedLayoutCanvas();
    if (!isReady) {
        showToast("Rendering map layout...");
    }

    const canvas = await getOrRenderLayoutCanvas();
    const filename = getActiveDownloadFilename("tif");
    const tiffBlob = canvasToTiffBlob(canvas);
    await handleSpatialFileShare(null, tiffBlob, filename, triggerButton);
    showToast(`Exported ${filename}`);
}

async function loadFeaturesForMapView(featureName) {
    const datasetId = featureName === 'florence' ? 'florence'
        : featureName === 'eugene' ? 'eugene'
            : 'circles';
    const dataset = await loadGeoDataset(datasetId);
    const features = dataset.features;

    if (datasetId === 'circles') {
        state.circlesFeatures = features;
    } else if (datasetId === 'florence') {
        state.florenceFeatures = features;
    } else {
        state.eugeneFeatures = features;
    }

    return features;
}

const featureTransitionController = createFeatureTransitionController({
    state,
    loadFeatures: loadFeaturesForMapView,
    rebuildFeatures: rebuildGeoJsonLayer,
    selectSubject,
    disposeRasterCache,
    getFitPadding,
    showToast,
    isSuggestLocked: () => document.body.classList.contains('is-suggest-locked')
});
const { switchToFeature, switchToCirclesFeature } = featureTransitionController;

function selectSubject(id, triggerMapZoom = true, animate = true) {
    return selectMapSubject(id, triggerMapZoom, animate, {
        updateHeader,
        renderSidebarList,
        updateAllFeatureStyles,
        disposeRasterCache,
        scheduleSelectionPreload: scheduleDownloadViewPreload,
        clearBirdObservations
    });
}

let currentBirdPopup = null;

function clearBirdObservations() {
    state.selectedBird = null;
    state.selectedBirdObservations = [];
    state.selectedBirdPhotoUrl = "";
    state.selectedBirdPhotoCredit = "";
    if (currentBirdPopup) {
        currentBirdPopup.remove();
        currentBirdPopup = null;
    }
    if (state.map && state.map.getSource('bird-observations')) {
        state.map.getSource('bird-observations').setData({
            type: 'FeatureCollection',
            features: []
        });
    }
}

function updateBirdObservationsLayerStyles() {
    if (!state.map) return;
    const isLightMode = document.body.classList.contains("theme-light") || (document.documentElement.getAttribute("data-theme") === "light");
    const color = isLightMode ? "#000000" : "#ffffff";

    if (state.map.getLayer('bird-observations-points')) {
        state.map.setPaintProperty('bird-observations-points', 'circle-color', color);
        state.map.setPaintProperty('bird-observations-points', 'circle-stroke-width', 0);
        state.map.setPaintProperty('bird-observations-points', 'circle-stroke-color', 'transparent');
        state.map.setPaintProperty('bird-observations-points', 'circle-radius', 5);
        state.map.setPaintProperty('bird-observations-points', 'circle-opacity', 0.95);
    }
    if (state.map.getLayer('bird-observations-glow')) {
        state.map.setPaintProperty('bird-observations-glow', 'circle-color', color);
        state.map.setPaintProperty('bird-observations-glow', 'circle-opacity', isLightMode ? 0.15 : 0.25);
    }
}

function setupBirdObservationsLayer() {
    if (!state.map) return;

    if (!state.map.getSource('bird-observations')) {
        state.map.addSource('bird-observations', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });
    }

    const isLightMode = document.body.classList.contains("theme-light") || (document.documentElement.getAttribute("data-theme") === "light");
    const color = isLightMode ? "#000000" : "#ffffff";

    if (!state.map.getLayer('bird-observations-glow')) {
        state.map.addLayer({
            id: 'bird-observations-glow',
            type: 'circle',
            source: 'bird-observations',
            paint: {
                'circle-radius': 11,
                'circle-color': color,
                'circle-opacity': isLightMode ? 0.15 : 0.25,
                'circle-blur': 0.6
            }
        });
    }

    if (!state.map.getLayer('bird-observations-points')) {
        state.map.addLayer({
            id: 'bird-observations-points',
            type: 'circle',
            source: 'bird-observations',
            paint: {
                'circle-radius': 5,
                'circle-color': color,
                'circle-stroke-width': 0,
                'circle-stroke-color': 'transparent',
                'circle-opacity': 0.95
            }
        });

        // Hover cursor
        state.map.on('mouseenter', 'bird-observations-points', () => {
            state.map.getCanvas().style.cursor = 'pointer';
        });
        state.map.on('mouseleave', 'bird-observations-points', () => {
            state.map.getCanvas().style.cursor = '';
        });

        // Click popup
        state.map.on('click', 'bird-observations-points', (e) => {
            if (!e.features || !e.features[0]) return;
            const feat = e.features[0];
            const props = feat.properties;
            const coords = feat.geometry.coordinates.slice();

            if (currentBirdPopup) currentBirdPopup.remove();

            currentBirdPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: 'bird-observation-popup' })
                .setLngLat(coords)
                .setHTML(`
                    <div>
                        ${props.photoUrl ? `<img src="${props.photoUrl}" alt="${props.species}" class="bird-obs-popup__img" />` : ""}
                        <div class="bird-obs-popup__title">${props.species}</div>
                        <div class="bird-obs-popup__meta">
                            <div>Observed by <strong>${props.user}</strong></div>
                            <div>Date: ${props.date}</div>
                            ${props.place ? `<div>${props.place}</div>` : ""}
                        </div>
                        <a href="${props.uri}" target="_blank" rel="noopener noreferrer" class="bird-obs-popup__link">
                            View on iNaturalist &rarr;
                        </a>
                    </div>
                `)
                .addTo(state.map);
        });
    }
}

async function selectBird(birdName) {
    state.selectedBird = birdName;
    updateHeader(birdName);

    const backBtn = document.getElementById("btn-capsule-back");
    if (backBtn) {
        backBtn.disabled = false;
        backBtn.classList.remove("is-disabled");
        backBtn.setAttribute("aria-label", "Back to Zone");
        backBtn.setAttribute("title", "Back to Zone");
    }

    renderSidebarList();

    if (!state.map) return;

    const targetFeature = state.allFeatures.find(f => {
        const zid = f.properties?.zid;
        return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
    });

    if (!targetFeature) return;

    setupBirdObservationsLayer();

    try {
        const bbox = getBbox(targetFeature);
        const data = await fetchBirdObservations(birdName, bbox);

        if (state.selectedBird !== birdName) return;

        const results = data.results || [];
        const features = [];

        results.forEach(obs => {
            if (!obs.location) return;
            const [lat, lng] = obs.location.split(',').map(Number);
            if (isNaN(lat) || isNaN(lng)) return;

            let isInside = true;
            try {
                if (typeof turf !== "undefined" && turf.booleanPointInPolygon && turf.point) {
                    const pt = turf.point([lng, lat]);
                    isInside = turf.booleanPointInPolygon(pt, targetFeature);
                }
            } catch (e) {
                isInside = true;
            }

            if (isInside) {
                const photo = (obs.photos && obs.photos.length > 0) ? (obs.photos[0].url || "").replace("square", "medium") : "";
                features.push({
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [lng, lat]
                    },
                    properties: {
                        id: obs.id,
                        user: obs.user?.login || "Observer",
                        date: obs.observed_on || obs.created_at_details?.date || "Recent",
                        place: obs.place_guess || "",
                        photoUrl: photo,
                        uri: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`,
                        species: birdName
                    }
                });
            }
        });

        const geojson = {
            type: "FeatureCollection",
            features: features
        };

        state.selectedBirdObservations = features;

        if (state.map.getSource('bird-observations')) {
            state.map.getSource('bird-observations').setData(geojson);
        }

        let featuredPhotoUrl = "";
        let photoCredit = "";

        // First check if any zone observation has a photo
        for (const feat of features) {
            if (feat.properties.photoUrl) {
                featuredPhotoUrl = feat.properties.photoUrl.replace("square", "large").replace("medium", "large");
                photoCredit = `Photo by ${feat.properties.user} via iNaturalist`;
                break;
            }
        }

        // If no observation in zone has a photo, check if any returned observation in wider query had a photo or fetch default taxon photo
        if (!featuredPhotoUrl) {
            for (const r of results) {
                if (r.photos && r.photos.length > 0) {
                    featuredPhotoUrl = (r.photos[0].url || "").replace("square", "large").replace("medium", "large");
                    photoCredit = `Photo by ${r.user?.login || "iNaturalist user"} via iNaturalist`;
                    break;
                }
            }
        }

        if (!featuredPhotoUrl) {
            const defaultPhoto = await fetchTaxonDefaultPhoto(birdName);
            if (defaultPhoto) {
                featuredPhotoUrl = (defaultPhoto.medium_url || defaultPhoto.url || "").replace("square", "large").replace("medium", "large");
                photoCredit = defaultPhoto.attribution || "Photo via iNaturalist";
            }
        }

        state.selectedBirdPhotoUrl = featuredPhotoUrl;
        state.selectedBirdPhotoCredit = photoCredit;

        if (state.activeTab === "observations") {
            renderSidebarList();
        } else {
            updateSidebarBirdPanel(birdName, features, featuredPhotoUrl, photoCredit);
        }

    } catch (err) {
        console.error("iNaturalist error:", err);
        const listContainer = document.getElementById("sidebar-zone-list");
        const statusEl = listContainer ? listContainer.querySelector(".sidebar-bird-panel__status") : null;
        if (statusEl) {
            statusEl.textContent = "Could not load observations from iNaturalist.";
        }
    }
}

function renderObservationsList(listContainer) {
    const observations = state.selectedBirdObservations || [];
    if (observations.length === 0) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "sidebar-empty-state";
        emptyEl.innerHTML = `
            <svg class="sidebar-empty-state__icon" width="34" height="34" viewBox="0 0 512 512" fill="currentColor">
                <path d="M128 32h32c17.7 0 32 14.3 32 32V96H96V64c0-17.7 14.3-32 32-32zm64 96V448c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V388.9c0-34.6 9.4-68.6 27.2-98.3C40.9 267.8 49.7 242.4 53 216L60.5 156c2-16 15.6-28 31.8-28H192zm227.8 0c16.1 0 29.8 12 31.8 28L459 216c3.3 26.4 12.1 51.8 25.8 74.6c17.8 29.7 27.2 63.7 27.2 98.3V448c0 17.7-14.3 32-32 32H352c-17.7 0-32-14.3-32-32V128h99.8zM320 64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32V96H320V64zm-32 64V288H224V128h64z"/>
            </svg>
            <div class="sidebar-empty-state__text">no items found</div>
        `;
        listContainer.appendChild(emptyEl);
        return;
    }

    const introEl = document.createElement("div");
    introEl.className = "sidebar-birds-intro";
    introEl.textContent = `All recorded iNaturalist observations of ${state.selectedBird} in this zone area.`;
    listContainer.appendChild(introEl);

    observations.forEach(f => {
        const props = f.properties;
        const coords = f.geometry.coordinates;
        const item = document.createElement("div");
        item.className = "sidebar-bird-obs-item";
        item.innerHTML = `
            ${props.photoUrl ? `<img src="${props.photoUrl}" alt="${props.species}" class="sidebar-bird-obs-item__thumb" />` : `
                <div class="sidebar-bird-obs-item__thumb" style="display:flex;align-items:center;justify-content:center;color:#64748b;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                </div>
            `}
            <div class="sidebar-bird-obs-item__info">
                <div class="sidebar-bird-obs-item__user">${props.user}</div>
                <div class="sidebar-bird-obs-item__date">${props.date}</div>
            </div>
        `;
        item.addEventListener("click", () => {
            if (state.map) {
                state.map.flyTo({ center: coords, zoom: Math.max(state.map.getZoom(), 13.5), speed: 1.2 });
                if (currentBirdPopup) currentBirdPopup.remove();
                currentBirdPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: 'bird-observation-popup' })
                    .setLngLat(coords)
                    .setHTML(`
                        <div>
                            ${props.photoUrl ? `<img src="${props.photoUrl}" alt="${props.species}" class="bird-obs-popup__img" />` : ""}
                            <div class="bird-obs-popup__title">${props.species}</div>
                            <div class="bird-obs-popup__meta">
                                <div>Observed by <strong>${props.user}</strong></div>
                                <div>Date: ${props.date}</div>
                                ${props.place ? `<div>${props.place}</div>` : ""}
                            </div>
                            <a href="${props.uri}" target="_blank" rel="noopener noreferrer" class="bird-obs-popup__link">
                                View on iNaturalist &rarr;
                            </a>
                        </div>
                    `)
                    .addTo(state.map);
            }
        });
        listContainer.appendChild(item);
    });
}

function renderSidebarBirdPanel(listContainer, birdName) {
    const targetFeature = state.allFeatures.find(f => {
        const zid = f.properties?.zid;
        return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
    });
    const zid = targetFeature ? displayZoneId(targetFeature.properties?.zid) : "";
    const ebirdUrl = getEbirdUrl(birdName);
    const observations = state.selectedBirdObservations || [];
    const featuredPhotoUrl = state.selectedBirdPhotoUrl || "";
    const photoCredit = state.selectedBirdPhotoCredit || "";

    const panel = document.createElement("div");
    panel.className = "sidebar-bird-panel";
    panel.innerHTML = `
        <!-- Big Media Image Container (populated from observation or species photo) -->
        <div class="sidebar-about-media sidebar-bird-media" style="${featuredPhotoUrl ? 'display: block;' : 'display: none;'} cursor: pointer;">
            <img src="${featuredPhotoUrl}" alt="${birdName}" loading="eager" decoding="async" />
        </div>

        <a href="${ebirdUrl}" target="_blank" rel="noopener noreferrer" class="sidebar-bird-panel__ebird-btn" title="View species on eBird">
            <span>View species on eBird</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
        </a>

        <div class="sidebar-overview-preview sidebar-overview-preview--birds" style="margin-top: 0.25rem;">
            <div class="sidebar-overview-preview__header sidebar-overview-preview__header--birds">
                <span class="sidebar-overview-preview__title">Observations</span>
                <span class="sidebar-bird-panel__count-badge">${observations.length > 0 ? `${observations.length} found` : ''}</span>
            </div>

            <div class="sidebar-bird-panel__status" style="${observations.length > 0 ? 'display: none;' : 'display: block;'} font-size: 0.85rem; color: var(--subtext-color, #94a3b8); padding: 0.25rem 0.5rem;">
                ${observations.length === 0 ? 'No recent observations recorded in this zone area.' : ''}
            </div>

            <div class="sidebar-bird-panel__list"></div>

            <button type="button" class="sidebar-overview-preview__footer sidebar-overview-preview__footer--obs" style="${observations.length > 0 ? 'display: flex;' : 'display: none;'}" title="View all observations">
                <span class="sidebar-overview-preview__action">View all (${observations.length}) &rarr;</span>
            </button>
        </div>
    `;

    const mediaDiv = panel.querySelector(".sidebar-bird-media");
    if (mediaDiv && featuredPhotoUrl) {
        mediaDiv.onclick = () => {
            openImageLightbox(featuredPhotoUrl, birdName, `${birdName} (observed in Area)`, photoCredit || "Photo via iNaturalist");
        };
    }

    const obsListEl = panel.querySelector(".sidebar-bird-panel__list");
    if (obsListEl && observations.length > 0) {
        const previewObs = observations.slice(0, 5);
        previewObs.forEach(f => {
            const props = f.properties;
            const coords = f.geometry.coordinates;
            const item = document.createElement("div");
            item.className = "sidebar-bird-obs-item";
            item.innerHTML = `
                ${props.photoUrl ? `<img src="${props.photoUrl}" alt="${props.species}" class="sidebar-bird-obs-item__thumb" />` : `
                    <div class="sidebar-bird-obs-item__thumb" style="display:flex;align-items:center;justify-content:center;color:#64748b;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
                    </div>
                `}
                <div class="sidebar-bird-obs-item__info">
                    <div class="sidebar-bird-obs-item__user">${props.user}</div>
                    <div class="sidebar-bird-obs-item__date">${props.date}</div>
                </div>
            `;
            item.addEventListener("click", () => {
                if (state.map) {
                    state.map.flyTo({ center: coords, zoom: Math.max(state.map.getZoom(), 13.5), speed: 1.2 });
                    if (currentBirdPopup) currentBirdPopup.remove();
                    currentBirdPopup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, className: 'bird-observation-popup' })
                        .setLngLat(coords)
                        .setHTML(`
                            <div>
                                ${props.photoUrl ? `<img src="${props.photoUrl}" alt="${props.species}" class="bird-obs-popup__img" />` : ""}
                                <div class="bird-obs-popup__title">${props.species}</div>
                                <div class="bird-obs-popup__meta">
                                    <div>Observed by <strong>${props.user}</strong></div>
                                    <div>Date: ${props.date}</div>
                                    ${props.place ? `<div>${props.place}</div>` : ""}
                                </div>
                                <a href="${props.uri}" target="_blank" rel="noopener noreferrer" class="bird-obs-popup__link">
                                    View on iNaturalist &rarr;
                                </a>
                            </div>
                        `)
                        .addTo(state.map);
                }
            });
            obsListEl.appendChild(item);
        });
    }

    const viewAllBtn = panel.querySelector(".sidebar-overview-preview__footer--obs");
    if (viewAllBtn) {
        viewAllBtn.onclick = () => {
            state.activeTab = "observations";
            renderSidebarList();
        };
    }

    const headerTitle = panel.querySelector(".sidebar-overview-preview__title");
    if (headerTitle) {
        headerTitle.onclick = () => {
            state.activeTab = "observations";
            renderSidebarList();
        };
    }

    listContainer.appendChild(panel);
}

function updateSidebarBirdPanel(birdName, features, featuredPhotoUrl, photoCredit) {
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    if (state.selectedBird !== birdName) return;

    if (state.activeTab === "observations") {
        renderObservationsList(listContainer);
        return;
    }

    listContainer.innerHTML = "";
    renderSidebarBirdPanel(listContainer, birdName);
}

function renderOverviewTab(listContainer, isCirclesFeature, isCircle, targetFeature) {
    const activateTab = tab => activateSidebarTab(tab, {
        state,
        documentObject: document,
        onRender: renderSidebarList
    });
    const overviewEl = document.createElement("div");
    overviewEl.className = "sidebar-about-wrapper";

    let previewHeaderTitle = "";
    let previewActionText = "";
    let previewTilesHtml = "";
    let descText = "";
    let imgSrc = "";
    let imgAlt = "";

    let birdsPreviewHtml = "";
    let zoneBirdsData = null;

    if (state.currentFeature === "florence") {
        if (!isCirclesFeature && !isCircle && targetFeature) {
            const zid = displayZoneId(targetFeature.properties?.zid);
            zoneBirdsData = FLORENCE_ZONE_BIRDS[zid] || FLORENCE_ZONE_BIRDS[String(parseInt(zid, 10))];
        }
    }

    if (zoneBirdsData && zoneBirdsData.birds && zoneBirdsData.birds.length > 0) {
        const previewBirds = zoneBirdsData.birds.slice(0, 5);
        previewBirds.forEach(bird => {
            const ebirdUrl = getEbirdUrl(bird.name);
            birdsPreviewHtml += `
                <div class="overview-preview-item overview-preview-item--bird" data-bird-name="${bird.name}" title="Select ${bird.name} to view observations on map">
                    <span class="overview-preview-item__name">${bird.name}</span>
                    <a href="${ebirdUrl}" target="_blank" rel="noopener noreferrer" class="overview-preview-item__ext-link" title="Open on eBird" onclick="event.stopPropagation();">
                        <svg class="overview-preview-item__ext" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </div>
            `;
        });
    }

    if (isCirclesFeature) {
        // --- 1. ALL CIRCLES OVERVIEW ---
        const NO_DATA_CIRCLES = new Set(["Oakridge", "Cottage Grove"]);
        const sortedCircles = [...state.circlesFeatures].sort((a, b) => {
            const cidA = String(a.properties?.cid || "");
            const cidB = String(b.properties?.cid || "");
            const noDataA = NO_DATA_CIRCLES.has(cidA) ? 1 : 0;
            const noDataB = NO_DATA_CIRCLES.has(cidB) ? 1 : 0;
            if (noDataA !== noDataB) return noDataA - noDataB;
            return cidA.localeCompare(cidB, undefined, { sensitivity: "base" });
        });

        previewHeaderTitle = "Count Circles";
        previewActionText = `View all (${sortedCircles.length}) &rarr;`;

        sortedCircles.forEach(feature => {
            const props = feature.properties || {};
            const cid = props.cid || "Circle";

            previewTilesHtml += `
                <div class="overview-preview-item" data-cid="${cid}">
                    <span class="overview-preview-item__name">${cid}</span>
                </div>
            `;
        });

        imgSrc = "../images/ccba.jpg";
        imgAlt = "Audubon Christmas Bird Count Circles";
        descText = "Coordinated by the Coast to Cascades Bird Alliance, our regional counts span from coastal estuaries in Florence to Willamette Valley wetlands in Eugene, tracking winter bird populations through community science.";

    } else if (isCircle || !targetFeature) {
        // --- 2. SINGLE COUNT CIRCLE OVERVIEW (Eugene / Florence CBC) ---
        const sortedFeatures = [...state.allFeatures].sort((a, b) => {
            const zidA = String(a.properties?.zid || "");
            const zidB = String(b.properties?.zid || "");
            return zidA.localeCompare(zidB, undefined, { numeric: true, sensitivity: "base" });
        });

        const circleTitle = state.currentFeature === "florence" ? "Florence Christmas Bird Count" : "Eugene Christmas Bird Count";
        previewHeaderTitle = "Circle Zones";
        previewActionText = `View all (${sortedFeatures.length}) &rarr;`;

        sortedFeatures.forEach(feature => {
            const props = feature.properties || {};
            const zid = displayZoneId(props.zid);

            previewTilesHtml += `
                <div class="overview-preview-item" data-zid="${String(props.zid)}">
                    <span class="overview-preview-item__name">Zone ${zid}</span>
                </div>
            `;
        });

        imgAlt = `${circleTitle} Overview`;
        if (state.currentFeature === "florence") {
            imgSrc = "../images/fcbc.jpg";
            descText = "Sponsored by the Coast to Cascades Bird Alliance since 1980, the Florence count explores the Siuslaw estuary, ocean beaches, and coastal dunes, documenting thousands of wintering shorebirds, seabirds, and waterfowl each December.";
        } else {
            imgSrc = "../images/ecbc.jpg";
            descText = "Founded in 1942, the Eugene Christmas Bird Count spans 27 zones across the southern Willamette Valley—from Fern Ridge to Spencer Butte—where field and backyard counters tally over 130 winter species annually.";
        }

    } else {
        // --- 3. SPECIFIC ZONE OVERVIEW (Zone 04, etc.) ---
        const props = targetFeature.properties || {};
        const zid = displayZoneId(props.zid);
        imgSrc = zoneImagePath(props.zid);
        imgAlt = `Zone ${zid} Image`;
    }

    overviewEl.innerHTML = `
        <div class="sidebar-about-content">
            ${descText ? `<p class="sidebar-about-text">${descText}</p>` : ""}

            <!-- Image Right Below Description -->
            ${imgSrc ? `
                <div class="sidebar-about-media">
                    <img src="${imgSrc}" alt="${imgAlt}" loading="eager" decoding="async" />
                </div>
            ` : ""}

            <!-- Organizers Section Below Image -->
            <div class="sidebar-overview-people">
                <div class="sidebar-overview-people__header">
                    <span class="sidebar-overview-people__title">Organizers</span>
                </div>
                <table class="sidebar-overview-people__table">
                    <thead>
                        <tr>
                            <th class="sidebar-overview-people__th-role">Roles</th>
                            <th class="sidebar-overview-people__th-name">Name</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="sidebar-overview-people__td-role">Job Title</td>
                            <td class="sidebar-overview-people__td-name">
                                <div class="sidebar-overview-people__person">
                                    <span class="sidebar-overview-people__person-name">Name</span>
                                    <div class="sidebar-overview-people__actions">
                                        <button type="button" class="sidebar-overview-people__icon-btn" title="Email" aria-label="Email">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                                            </svg>
                                        </button>
                                        <button type="button" class="sidebar-overview-people__icon-btn" title="Phone" aria-label="Phone">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z"/>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Birds Section in Zone Overview -->
            ${zoneBirdsData && zoneBirdsData.birds && zoneBirdsData.birds.length > 0 ? `
                <div class="sidebar-overview-preview sidebar-overview-preview--birds">
                    <div class="sidebar-overview-preview__header sidebar-overview-preview__header--birds">
                        <span class="sidebar-overview-preview__title">Birds</span>
                    </div>
                    <div class="sidebar-overview-preview__list">
                        ${birdsPreviewHtml}
                    </div>
                    <button type="button" class="sidebar-overview-preview__footer sidebar-overview-preview__footer--birds" title="Go to Birds tab">
                        <span class="sidebar-overview-preview__action">View all (${zoneBirdsData.birds.length}) &rarr;</span>
                    </button>
                </div>
            ` : ""}

            <!-- Feature Tiles Preview Section (Circle level only) -->
            ${previewTilesHtml ? `
                <div class="sidebar-overview-preview">
                    <div class="sidebar-overview-preview__header">
                        <span class="sidebar-overview-preview__title">${previewHeaderTitle}</span>
                    </div>
                    <div class="sidebar-overview-preview__list">
                        ${previewTilesHtml}
                    </div>
                    <button type="button" class="sidebar-overview-preview__footer" title="Go to ${previewHeaderTitle} tab">
                        <span class="sidebar-overview-preview__action">${previewActionText}</span>
                    </button>
                </div>
            ` : ""}

            <!-- Resources Section -->
            <div class="sidebar-overview-resources">
                <div class="sidebar-overview-resources__header">
                    <span class="sidebar-overview-resources__title">Resources</span>
                </div>
                <div class="sidebar-overview-resources__empty">No resources available</div>
            </div>
        </div>
    `;

        const birdPreviewTiles = overviewEl.querySelectorAll(".overview-preview-item--bird");
    birdPreviewTiles.forEach(tile => {
        const bName = tile.getAttribute("data-bird-name");
        tile.addEventListener("click", () => {
            if (bName) selectBird(bName);
        });
    });

    // Click handlers for Birds preview footer & header
    const birdsFooterBtn = overviewEl.querySelector(".sidebar-overview-preview__footer--birds");
    if (birdsFooterBtn) {
        birdsFooterBtn.addEventListener("click", () => activateTab("birds"));
    }

    const birdsHeader = overviewEl.querySelector(".sidebar-overview-preview__header--birds");
    if (birdsHeader) {
        birdsHeader.style.cursor = "pointer";
        birdsHeader.addEventListener("click", () => activateTab("birds"));
    }

    // Click handler for preview footer button (switches to list tab)
    const footerBtn = overviewEl.querySelector(".sidebar-overview-preview:not(.sidebar-overview-preview--birds) .sidebar-overview-preview__footer");
    if (footerBtn) {
        footerBtn.addEventListener("click", () => activateTab("items"));
    }

    const orgHeader = overviewEl.querySelector(".sidebar-overview-people__header");
    if (orgHeader) {
        orgHeader.style.cursor = "pointer";
        orgHeader.addEventListener("click", () => activateTab("organizers"));
    }

    const resHeader = overviewEl.querySelector(".sidebar-overview-resources__header");
    if (resHeader) {
        resHeader.style.cursor = "pointer";
        resHeader.addEventListener("click", () => activateTab("resources"));
    }

    // Click & hover handlers for preview tiles
    if (isCirclesFeature) {
        const tiles = overviewEl.querySelectorAll(".overview-preview-item");
        tiles.forEach(tile => {
            const cid = tile.getAttribute("data-cid");
            tile.addEventListener("mouseenter", () => {
                if (state.map && state.map.getSource('zones')) {
                    state.map.setFeatureState({ source: 'zones', id: cid }, { hover: true });
                }
            });
            tile.addEventListener("mouseleave", () => {
                if (state.map && state.map.getSource('zones')) {
                    state.map.setFeatureState({ source: 'zones', id: cid }, { hover: false });
                }
            });
            tile.addEventListener("click", () => {
                const feature = state.circlesFeatures.find(f => f.properties?.cid === cid);
                const bbox = feature ? getBbox(feature) : null;
                if (cid === "Eugene") {
                    switchToFeature("eugene", bbox);
                } else if (cid === "Florence") {
                    switchToFeature("florence", bbox);
                } else if (cid === "Oakridge" || cid === "Cottage Grove") {
                    showToast("There is no data for this count circle");
                }
            });
        });
    } else {
        const tiles = overviewEl.querySelectorAll(".overview-preview-item[data-zid]");
        tiles.forEach(tile => {
            const zid = tile.getAttribute("data-zid");
            tile.addEventListener("mouseenter", () => {
                const isSelected = state.currentId !== CIRCLE_ID && (zid === state.currentId || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                if (!isSelected && state.map && state.map.getSource('zones')) {
                    state.map.setFeatureState({ source: 'zones', id: zid }, { hover: true });
                }
            });
            tile.addEventListener("mouseleave", () => {
                const isSelected = state.currentId !== CIRCLE_ID && (zid === state.currentId || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                if (!isSelected && state.map && state.map.getSource('zones')) {
                    state.map.setFeatureState({ source: 'zones', id: zid }, { hover: false });
                }
            });
            tile.addEventListener("click", () => {
                selectSubject(zid);
            });
        });
    }

    // Lightbox for media image
    const img = overviewEl.querySelector(".sidebar-about-media img");
    const mediaDiv = overviewEl.querySelector(".sidebar-about-media");
    if (img) {
        img.addEventListener("error", () => {
            if (imgSrc !== FALLBACK_IMAGE && !isCircle) {
                img.src = FALLBACK_IMAGE;
            } else {
                if (mediaDiv) mediaDiv.style.display = "none";
            }
        });
    }

    const isZonePhoto = !isCirclesFeature && !isCircle && Boolean(targetFeature);
    const photoCredit = isZonePhoto ? "Photo Contributed by Pete Baki" : "Photo Contributed by NA";

    if (mediaDiv && img) {
        mediaDiv.addEventListener("click", () => {
            openImageLightbox(img.src, imgAlt, descText, photoCredit);
        });
    }

    listContainer.appendChild(overviewEl);
}

function renderOrganizersList(listContainer) {
    const item = document.createElement("div");
    item.className = "tile-zone-item tile-zone-item--organizer";
    item.innerHTML = `
        <div class="tile-zone-item__thumb tile-zone-item__thumb--organizer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        </div>
        <div class="tile-zone-item__info">
            <div class="tile-zone-item__title">Name</div>
            <div class="tile-zone-item__meta">
                <span class="tile-zone-item__meta-item">Job Title</span>
            </div>
        </div>
        <div class="tile-zone-item__actions">
            <button type="button" class="sidebar-overview-people__icon-btn" title="Email" aria-label="Email">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
            </button>
            <button type="button" class="sidebar-overview-people__icon-btn" title="Phone" aria-label="Phone">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z"/>
                </svg>
            </button>
        </div>
    `;
    listContainer.appendChild(item);
}

function renderResourcesList(listContainer) {
    const emptyEl = document.createElement("div");
    emptyEl.className = "sidebar-empty-state";
    emptyEl.innerHTML = `
        <svg class="sidebar-empty-state__icon" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
        <div class="sidebar-empty-state__text">no items found</div>
    `;
    listContainer.appendChild(emptyEl);
}

function renderBirdsList(listContainer) {
    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
    let zoneBirdsData = null;

    if (state.currentFeature === "florence" && !state.isCirclesFeature && !isCircle) {
        const targetFeature = state.allFeatures.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
        });
        if (targetFeature) {
            const zid = displayZoneId(targetFeature.properties?.zid);
            zoneBirdsData = FLORENCE_ZONE_BIRDS[zid] || FLORENCE_ZONE_BIRDS[String(parseInt(zid, 10))];
        }
    }

    if (!zoneBirdsData || !zoneBirdsData.birds || zoneBirdsData.birds.length === 0) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "sidebar-empty-state";
        emptyEl.innerHTML = `
            <svg class="sidebar-empty-state__icon" width="34" height="34" viewBox="0 0 512 512" fill="currentColor">
                <path d="M128 32h32c17.7 0 32 14.3 32 32V96H96V64c0-17.7 14.3-32 32-32zm64 96V448c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V388.9c0-34.6 9.4-68.6 27.2-98.3C40.9 267.8 49.7 242.4 53 216L60.5 156c2-16 15.6-28 31.8-28H192zm227.8 0c16.1 0 29.8 12 31.8 28L459 216c3.3 26.4 12.1 51.8 25.8 74.6c17.8 29.7 27.2 63.7 27.2 98.3V448c0 17.7-14.3 32-32 32H352c-17.7 0-32-14.3-32-32V128h99.8zM320 64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32V96H320V64zm-32 64V288H224V128h64z"/>
            </svg>
            <div class="sidebar-empty-state__text">no items found</div>
        `;
        listContainer.appendChild(emptyEl);
        return;
    }

    if (zoneBirdsData.desc) {
        const introEl = document.createElement("div");
        introEl.className = "sidebar-birds-intro";
        introEl.textContent = zoneBirdsData.desc;
        listContainer.appendChild(introEl);
    }

    zoneBirdsData.birds.forEach(bird => {
        const ebirdUrl = getEbirdUrl(bird.name);
        const item = document.createElement("div");
        item.className = "tile-zone-item tile-zone-item--no-thumb tile-zone-item--bird-link";
        item.title = `Select ${bird.name} to view observations on map`;
        item.innerHTML = `
            <div class="tile-zone-item__info">
                <div class="tile-zone-item__title">
                    <span>${bird.name}</span>
                    <a href="${ebirdUrl}" target="_blank" rel="noopener noreferrer" class="tile-zone-item__ext-btn" title="Open ${bird.name} on eBird" onclick="event.stopPropagation();">
                        <svg class="tile-zone-item__ext-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </div>
            </div>
        `;
        item.addEventListener("click", () => {
            selectBird(bird.name);
        });
        listContainer.appendChild(item);
    });
}

function renderSidebarList() {
    const isOverview = syncSidebarTabs(state, document);
    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;

    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    if (state.selectedBird) {
        if (state.activeTab === "observations") {
            renderObservationsList(listContainer);
        } else {
            renderSidebarBirdPanel(listContainer, state.selectedBird);
        }
        return;
    }

    if (state.activeTab === "birds") {
        renderBirdsList(listContainer);
        return;
    }

    if (state.activeTab === "organizers") {
        renderOrganizersList(listContainer);
        return;
    }

    if (state.activeTab === "resources") {
        renderResourcesList(listContainer);
        return;
    }

    if (state.isCirclesFeature) {
        if (isOverview) {
            renderOverviewTab(listContainer, true, false, null);
            return;
        }

        const NO_DATA_CIRCLES = new Set(["Oakridge", "Cottage Grove"]);
        const sortedCircles = [...state.circlesFeatures].sort((a, b) => {
            const cidA = String(a.properties?.cid || "");
            const cidB = String(b.properties?.cid || "");
            const noDataA = NO_DATA_CIRCLES.has(cidA) ? 1 : 0;
            const noDataB = NO_DATA_CIRCLES.has(cidB) ? 1 : 0;
            if (noDataA !== noDataB) return noDataA - noDataB;
            return cidA.localeCompare(cidB, undefined, { sensitivity: "base" });
        });

        sortedCircles.forEach(feature => {
            const props = feature.properties || {};
            const cid = props.cid || "Circle";
            const item = document.createElement("div");
            item.className = "tile-zone-item";
            item.setAttribute("data-id", cid);

            let thumbImg = "";
            let isLogo = false;
            let isNotAvailable = false;
            if (cid === "Eugene") {
                thumbImg = "../images/logo-small.png";
                isLogo = true;
            } else if (cid === "Florence") {
                thumbImg = "../images/florence.png";
                isLogo = true;
            } else if (cid === "Oakridge" || cid === "Cottage Grove") {
                isNotAvailable = true;
            } else {
                thumbImg = "../images/wetlands.jpg";
            }

            let thumbHtml = "";
            if (isNotAvailable) {
                thumbHtml = `
                    <div class="tile-zone-item__thumb-placeholder" title="No data available">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                        </svg>
                    </div>
                `;
            } else {
                thumbHtml = `
                    <div class="tile-zone-item__thumb ${isLogo ? "tile-zone-item__thumb--logo" : ""}">
                        <img src="${thumbImg}" alt="${cid}" loading="eager">
                    </div>
                `;
            }

            item.innerHTML = `
                ${thumbHtml}
                <div class="tile-zone-item__info">
                    <div class="tile-zone-item__title">${cid}</div>
                </div>
            `;

            item.addEventListener("mouseenter", () => {
                if (state.map && state.map.getSource('zones')) {
                    state.map.setFeatureState({ source: 'zones', id: cid }, { hover: true });
                }
            });
            item.addEventListener("mouseleave", () => {
                if (state.map && state.map.getSource('zones')) {
                    state.map.setFeatureState({ source: 'zones', id: cid }, { hover: false });
                }
            });

            item.addEventListener("click", () => {
                const feature = state.circlesFeatures.find(f => f.properties.cid === cid);
                const bbox = feature ? getBbox(feature) : null;
                if (cid === "Eugene") {
                    switchToFeature("eugene", bbox);
                } else if (cid === "Florence") {
                    switchToFeature("florence", bbox);
                } else if (cid === "Oakridge" || cid === "Cottage Grove") {
                    showToast("There is no data for this count circle");
                }
            });
            listContainer.appendChild(item);
        });
        return;
    }

    let targetFeature = null;
    if (!isCircle) {
        targetFeature = state.allFeatures.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
        });
    }

    if (isOverview) {
        renderOverviewTab(listContainer, false, isCircle, targetFeature);
        return;
    }

    if (!isCircle && targetFeature) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "sidebar-empty-state";
        emptyEl.innerHTML = `
            <svg class="sidebar-empty-state__icon" width="34" height="34" viewBox="0 0 512 512" fill="currentColor">
                <path d="M128 32h32c17.7 0 32 14.3 32 32V96H96V64c0-17.7 14.3-32 32-32zm64 96V448c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V388.9c0-34.6 9.4-68.6 27.2-98.3C40.9 267.8 49.7 242.4 53 216L60.5 156c2-16 15.6-28 31.8-28H192zm227.8 0c16.1 0 29.8 12 31.8 28L459 216c3.3 26.4 12.1 51.8 25.8 74.6c17.8 29.7 27.2 63.7 27.2 98.3V448c0 17.7-14.3 32-32 32H352c-17.7 0-32-14.3-32-32V128h99.8zM320 64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32V96H320V64zm-32 64V288H224V128h64z"/>
            </svg>
            <div class="sidebar-empty-state__text">no items found</div>
        `;
        listContainer.appendChild(emptyEl);
        return;
    }

    const sortedFeatures = [...state.allFeatures].sort((a, b) => {
        const zidA = String(a.properties?.zid || "");
        const zidB = String(b.properties?.zid || "");
        return zidA.localeCompare(zidB, undefined, { numeric: true, sensitivity: "base" });
    });

    sortedFeatures.forEach(feature => {
        const props = feature.properties || {};
        const zid = displayZoneId(props.zid);
        const item = document.createElement("div");
        item.className = "tile-zone-item";
        item.setAttribute("data-id", String(props.zid));

        const imgPath = zoneImagePath(props.zid);
        item.innerHTML = `
            <div class="tile-zone-item__thumb">
                <img src="${imgPath}" alt="Zone ${zid}" loading="eager">
            </div>
            <div class="tile-zone-item__info">
                <div class="tile-zone-item__title">Zone ${zid}</div>
            </div>
        `;

        const img = item.querySelector("img");
        if (img) {
            img.addEventListener("error", () => {
                img.src = FALLBACK_IMAGE;
            });
        }

        item.addEventListener("mouseenter", () => {
            const featureId = String(props.zid || "");
            const isSelected = state.currentId !== CIRCLE_ID && (featureId === state.currentId || normalizeZoneId(featureId) === normalizeZoneId(state.currentId));
            if (!isSelected && state.map && state.map.getSource('zones')) {
                state.map.setFeatureState({ source: 'zones', id: featureId }, { hover: true });
            }
        });
        item.addEventListener("mouseleave", () => {
            const featureId = String(props.zid || "");
            const isSelected = state.currentId !== CIRCLE_ID && (featureId === state.currentId || normalizeZoneId(featureId) === normalizeZoneId(state.currentId));
            if (!isSelected && state.map && state.map.getSource('zones')) {
                state.map.setFeatureState({ source: 'zones', id: featureId }, { hover: false });
            }
        });

        item.addEventListener("click", () => selectSubject(String(props.zid)));
        listContainer.appendChild(item);
    });

    if (state.lastNavSource === "keyboard") {
        state.focusedTileIndex = 0;
        updateKeyboardTileFocus(0);
    } else {
        state.focusedTileIndex = -1;
        updateKeyboardTileFocus(-1);
    }
}

function setupMapEffectsAndFullscreen(mapWrapper) {
    if (!mapWrapper) return;

    const triggerMobileHomeAnimation = () => {
        if (window.innerWidth <= 768) {
            const targets = document.querySelectorAll(".intro-header, .maps-tile-header, .maps-tile-sidebar");
            targets.forEach(el => {
                el.classList.remove("animate-mobile-slide-down");
                void el.offsetWidth;
                el.classList.add("animate-mobile-slide-down");
            });
        }
    };

    const handleResize = () => {
        updateControlPositions();
        adjustHeaderFontSize();
        if (state.map) {
            state.map.invalidateSize();
            setTimeout(() => state.map.invalidateSize(), 50);
            setTimeout(() => state.map.invalidateSize(), 200);
            setTimeout(() => state.map.invalidateSize(), 400);
        }
        updateLabelZoomVisibility();
    };

    setupMapViewportEffects(mapWrapper, {
        onResize: handleResize,
        onMobileHomeAnimation: triggerMobileHomeAnimation
    });
}



// Cursor proximity glow: set feature-state 'proximity' (0–1) based on
// screen-space distance from cursor to each zone center point
function setupProximityTracking() {
    if (state._proximityListenerAttached) return;
    state._proximityListenerAttached = true;

    const RADIUS = 280;   // px — radial gradient falloff distance
    let rafPending = false;
    let lastCx = -9999, lastCy = -9999;

    const canvas = state.map.getCanvas();

    canvas.addEventListener('mousemove', (e) => {
        if (window.innerWidth <= 768) return;
        if (state.map && state.map.getZoom() >= 14.0) return;
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        // Skip tiny micro-movements to avoid thrashing feature state
        if (Math.abs(cx - lastCx) < 3 && Math.abs(cy - lastCy) < 3) return;
        lastCx = cx; lastCy = cy;

        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            if (!state.labelData || !state.map) return;
            state.labelData.forEach(d => {
                const pt = state.map.project([d.lng, d.lat]);
                const dist = Math.hypot(cx - pt.x, cy - pt.y);
                // Smooth quadratic falloff for more natural gradient feel
                const linear = Math.max(0, 1 - dist / RADIUS);
                const proximity = linear * linear * (3 - 2 * linear); // smoothstep
                state.map.setFeatureState({ source: 'zones', id: d.id }, { proximity });
            });
        });
    });

    canvas.addEventListener('mouseleave', () => {
        lastCx = -9999; lastCy = -9999;
        if (!state.labelData || !state.map) return;
        state.labelData.forEach(d => {
            state.map.setFeatureState({ source: 'zones', id: d.id }, { proximity: 0 });
        });
    });
}

// Canvas overlay: draws zone outlines bright, masked by radial gradient at cursor.
// This gives true per-segment glow — only the line pixels within the gradient radius
// are revealed, rather than MapLibre's per-feature opacity which affects whole zones.


// HTML label overlay — repositions div labels on every map render


function rebuildGeoJsonLayer() {
    if (!state.map) return;
    const { geojsonData, labelData } = buildZoneFeatureData(state.allFeatures, state.isCirclesFeature);
    state.labelData = labelData;

    if (state.map.getSource('zones')) {
        state.map.getSource('zones').setData(geojsonData);
        updateLabelZoomVisibility();
        updateAllFeatureStyles();
    } else {
        addZoneFeatureLayers(state.map, geojsonData);

        // Register map move/zoom listeners for HTML label repositioning (once)
        if (!state._labelListenersAttached) {
            state._labelListenersAttached = true;
            state.map.on('move', rebuildMapHtmlLabels);
            state.map.on('zoom', rebuildMapHtmlLabels);
            state.map.on('render', rebuildMapHtmlLabels);
        }
        setupProximityTracking();
        setupProximityGlowCanvas();
        updateLabelZoomVisibility();
        updateAllFeatureStyles();
        
        setupMapHoverEvents({
            map: state.map,
            state,
            onFeatureClick: ({ feature, featureId }) => {
                const props = feature.properties || {};
                if (state.isCirclesFeature) {
                    if (props.cid === "Eugene") {
                        switchToFeature("eugene", getBbox([feature]));
                    } else if (props.cid === "Florence") {
                        switchToFeature("florence", getBbox([feature]));
                    } else if (props.cid === "Oakridge" || props.cid === "Cottage Grove") {
                        showToast("There is no data for this count circle");
                    }
                } else if (state.currentId === featureId) {
                    selectSubject(CIRCLE_ID);
                } else {
                    selectSubject(featureId, true);
                }
            }
        });
    }

    if (state.isLocating && state.userLocationMarker) {
        updateLocationZone(state.userLocationMarker.getLngLat());
    }

    updateAllFeatureStyles();
}

function initializeMap() {
    const mapContainer = document.getElementById("tile-map");
    const mapWrapper = document.getElementById("map-wrapper");
    if (!mapContainer) return;

    const isLightMode = document.body.classList.contains("theme-light") || state.currentBaseLayer === "esri-street" || (document.documentElement.getAttribute("data-theme") === "light");
    const defaultVectorStyle = isLightMode
        ? "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

    state.map = createMapInstance(maplibregl, {
        container: 'tile-map',
        preserveDrawingBuffer: true,
        maxZoom: 20,
        minZoom: 0,
        maxTileCacheSize: 2500,
        prefetchZoomDelta: 8,
        projection: { type: 'globe' },
        dragPan: {
            linearity: 0.15,
            deceleration: 1000
        },
        style: defaultVectorStyle,
        center: [-123.11, 44.05],
        zoom: 11,
        attributionControl: false
    });

    // Set initial background color
    const initialTileMapEl = document.getElementById("tile-map");
    if (initialTileMapEl) {
        const bg = isLightMode ? "#f8f9fa" : "#000000";
        initialTileMapEl.style.setProperty("background-color", bg, "important");
        initialTileMapEl.style.setProperty("background", bg, "important");
    }

    // Configure smooth inertial scroll zoom rates for trackpad and mouse wheel (Google Earth style)
    if (state.map.scrollZoom) {
        state.map.scrollZoom.setWheelZoomRate(1 / 750);
        state.map.scrollZoom.setZoomRate(1 / 150);
    }
    
    setupMapLayers(state);

    try {
        state.map.setProjection({ type: 'globe' });
    } catch(e) {
        console.warn("Immediate setProjection not supported yet:", e);
    }

    // Disable rotation on mobile (touch devices) – preserve pinch-to-zoom only
    if (/Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) || window.innerWidth <= 768) {
        state.map.touchZoomRotate.disableRotation();
    }

    state.baseMapsList = [
        { id: "default", name: "Default", layerId: "base-dark-vector" },
        { id: "satellite", name: "Satellite Map", layerId: "base-satellite" },
        { id: "esri-street", name: "Street Map", layerId: "base-esri-street" },
        { id: "esri-topo", name: "Topo Map", layerId: "base-esri-topo" }
    ];

    // Create custom controls container
    let controlContainer = document.querySelector(".map-ctrl-container");
    if (!controlContainer) {
        controlContainer = document.createElement("div");
        controlContainer.className = "map-ctrl-container";

        const topLeft = document.createElement("div");
        topLeft.className = "map-ctrl-panel map-ctrl-panel--left";
        controlContainer.appendChild(topLeft);

        const topRight = document.createElement("div");
        topRight.className = "map-ctrl-panel map-ctrl-panel--right";
        controlContainer.appendChild(topRight);

        mapWrapper.appendChild(controlContainer);
    }

    const topLeft = controlContainer.querySelector(".map-ctrl-panel.map-ctrl-panel--left");

    // 1. Zoom Control
    const zoomDiv = document.createElement("div");
    zoomDiv.className = "map-ctrl-zoom map-ctrl-bar map-ctrl";
    
    const zoomInBtn = document.createElement("a");
    zoomInBtn.className = "map-ctrl-zoom-in";
    zoomInBtn.href = "#";
    zoomInBtn.title = "Zoom in";
    zoomInBtn.role = "button";
    zoomInBtn.setAttribute("aria-label", "Zoom in");
    zoomInBtn.textContent = "+";
    zoomInBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.map) state.map.zoomIn();
    });
    
    const zoomOutBtn = document.createElement("a");
    zoomOutBtn.className = "map-ctrl-zoom-out";
    zoomOutBtn.href = "#";
    zoomOutBtn.title = "Zoom out";
    zoomOutBtn.role = "button";
    zoomOutBtn.setAttribute("aria-label", "Zoom out");
    zoomOutBtn.innerHTML = "&#x2212;";
    zoomOutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.map) state.map.zoomOut();
    });

    zoomDiv.appendChild(zoomInBtn);
    zoomDiv.appendChild(zoomOutBtn);
    topLeft.appendChild(zoomDiv);

    // 2. Locate Control
    const locateDiv = document.createElement("div");
    locateDiv.className = "map-ctrl-bar map-ctrl map-ctrl-locate";
    
    const locateBtn = document.createElement("a");
    locateBtn.className = "map-ctrl-locate-btn";
    locateBtn.href = "#";
    locateBtn.title = "Show My Location";
    locateBtn.role = "button";
    locateBtn.setAttribute("aria-label", "Show My Location");
    locateBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="8"></circle>
            <line x1="12" y1="2" x2="12" y2="4"></line>
            <line x1="12" y1="20" x2="12" y2="22"></line>
            <line x1="2" y1="12" x2="4" y2="12"></line>
            <line x1="20" y1="12" x2="22" y2="12"></line>
            <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
        </svg>
    `;
    locateBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        trackUserLocation(state);
    });
    locateDiv.appendChild(locateBtn);
    topLeft.appendChild(locateDiv);

    // 3. Fullscreen Control
    const fsDiv = document.createElement("div");
    fsDiv.className = "map-ctrl-bar map-ctrl map-ctrl-fullscreen";
    
    const fsBtn = document.createElement("a");
    fsBtn.className = "map-ctrl-fullscreen-btn";
    fsBtn.href = "#";
    fsBtn.title = "Toggle Fullscreen";
    fsBtn.role = "button";
    fsBtn.setAttribute("aria-label", "Toggle Fullscreen");
    fsBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
        </svg>
    `;
    fsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
    });
    fsDiv.appendChild(fsBtn);
    topLeft.appendChild(fsDiv);

    // 4. Map Style Control (Custom Reimplementation)
    const layersDiv = document.createElement("div");
    layersDiv.className = "map-ctrl-bar map-ctrl map-ctrl-styles";
    
    const layersBtn = document.createElement("a");
    layersBtn.className = "map-ctrl-styles__toggle";
    layersBtn.href = "#";
    layersBtn.title = "Map Elements";
    layersBtn.role = "button";
    layersBtn.setAttribute("aria-label", "Map Elements");
    layersBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
    `;
    layersDiv.appendChild(layersBtn);

    const listContainer = document.createElement("div");
    listContainer.className = "map-ctrl-styles__list";
    listContainer.innerHTML = `
        <div class="map-ctrl-styles__header">
            <div class="modal-title-wrapper">
                <span class="modal-title">Map Elements</span>
                <button type="button" class="modal-close-btn" aria-label="Close Map Elements">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-capsules-wrapper">
                <div class="modal-capsules-scroll">
                    <button type="button" class="modal-capsule modal-capsule--icon is-active" data-tab="basemaps" title="Select Basemaps">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                            <polyline points="2 17 12 22 22 17"></polyline>
                            <polyline points="2 12 12 17 22 12"></polyline>
                        </svg>
                    </button>
                    <button type="button" class="modal-capsule" data-tab="layers">Our Layers</button>

                </div>
                <button type="button" class="modal-search-toggle-btn" aria-label="Search items">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-search-expanded">
                <div class="modal-search-input-container">
                    <svg class="modal-search-input-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" class="modal-search-input" placeholder="Search items..." autocomplete="off" />
                </div>
                <button type="button" class="modal-search-close-btn" aria-label="Close search">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
        <div class="map-ctrl-styles__body"></div>
    `;
    layersDiv.appendChild(listContainer);
    topLeft.appendChild(layersDiv);

    let activeTab = "basemaps";
    let searchQuery = "";

    const headerEl = listContainer.querySelector(".map-ctrl-styles__header");
    const bodyEl = listContainer.querySelector(".map-ctrl-styles__body");
    const searchInput = listContainer.querySelector(".modal-search-input");
    const searchToggleBtn = listContainer.querySelector(".modal-search-toggle-btn");
    const searchCloseBtn = listContainer.querySelector(".modal-search-close-btn");

    const renderContent = () => {
        if (!bodyEl) return;
        bodyEl.innerHTML = "";
        const query = searchQuery.toLowerCase().trim();

        const layers = [];
        if (state.isCirclesFeature || state.currentFeature === "circles") {
            layers.push({
                id: "circles", name: "Coast to Cascades Bird Alliance", isChild: false, image: "../images/wetlands.jpg", isLogo: false,
                action: () => selectSubject(CIRCLE_ID, true)
            });
        } else {
            const isFlorence = state.currentFeature === "florence";
            layers.push({
                id: "circle", name: isFlorence ? "Florence Christmas Bird Count Circle" : "Eugene Christmas Bird Count Circle", isChild: false, 
                image: isFlorence ? "../images/florence.png" : "../images/logo-small.png", isLogo: true,
                action: () => selectSubject(CIRCLE_ID, true)
            });
            if (state.currentId && state.currentId !== CIRCLE_ID) {
                const targetZone = state.allFeatures.find(f => {
                    const zid = f.properties?.zid;
                    return zid && (String(zid).toLowerCase() === String(state.currentId).toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                });
                const zidDisplay = targetZone ? displayZoneId(targetZone.properties.zid) : state.currentId;
                const zoneImg = zoneImagePath(state.currentId);
                layers.push({
                    id: "selected-zone",
                    name: `Zone ${zidDisplay}`,
                    isChild: true,
                    image: zoneImg,
                    feature: targetZone,
                    isLogo: false,
                    action: () => selectSubject(state.currentId, true)
                });
            }
        }

        const maxItems = Math.max(layers.length, 3);
        const estimatedHeight = 76 + 20 + (maxItems * 68);
        listContainer.style.setProperty("height", `${estimatedHeight}px`, "important");

        if (activeTab === "layers") {
            const filtered = layers.filter(l => l.name.toLowerCase().includes(query));
            if (filtered.length === 0) {
                bodyEl.innerHTML = `<div class="modal-no-results">No layers found</div>`;
            } else {
                filtered.forEach(l => {
                    const isCircleOverview = !state.currentId || state.currentId === CIRCLE_ID;
                    const isRowActive = l.id === "selected-zone" || (l.id === "circle" && isCircleOverview) || (l.id === "circles" && state.isCirclesFeature);
                    
                    const row = document.createElement("div");
                    row.className = `tile-zone-item ${l.isChild ? 'is-child' : ''} ${isRowActive ? 'is-active' : ''}`;
                    row.innerHTML = `
                        <div class="tile-zone-item__thumb ${l.isLogo ? 'tile-zone-item__thumb--logo' : ''}">
                            <img src="${l.image}" alt="${l.name}" loading="lazy">
                        </div>
                        <div class="tile-zone-item__info">
                            <div class="tile-zone-item__title">${l.name}</div>
                        </div>
                    `;

                    const img = row.querySelector("img");
                    if (img) {
                        img.addEventListener("error", () => {
                            img.src = FALLBACK_IMAGE;
                        });
                    }

                    row.addEventListener("click", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        l.action();
                    });
                    bodyEl.appendChild(row);
                });
            }
        } else {
            const basemaps = [
                { id: "default", name: "Default", thumbnailClass: "default-map-thumbnail", layerId: "base-dark-vector" },
                { id: "satellite", name: "Satellite Map", thumbnailClass: "satellite-thumbnail", layerId: "base-satellite" },
                { id: "esri-street", name: "Street Map", thumbnailClass: "esri-street-thumbnail", layerId: "base-esri-street" },
                { id: "esri-topo", name: "Topo Map", thumbnailClass: "esri-topo-thumbnail", layerId: "base-esri-topo" }
            ];

            const filtered = basemaps.filter(b => b.name.toLowerCase().includes(query));
            if (filtered.length === 0) {
                bodyEl.innerHTML = `<div class="modal-no-results">No basemaps found</div>`;
            } else {
                filtered.forEach(b => {
                    const isSelected = state.currentBaseLayer === b.id || (b.id === 'default' && (!state.currentBaseLayer || state.currentBaseLayer === 'dark'));
                    const row = document.createElement("div");
                    row.className = `tile-zone-item ${isSelected ? 'is-active' : ''}`;
                    row.innerHTML = `
                        <div class="tile-zone-item__thumb">
                            <span class="thumbnail ${b.thumbnailClass}"></span>
                        </div>
                        <div class="tile-zone-item__info">
                            <div class="tile-zone-item__title">${b.name}</div>
                        </div>
                    `;
                    row.addEventListener("click", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        
                        switchBaseMap(b.id);
                        renderContent();
                    });
                    bodyEl.appendChild(row);
                });
            }
        }
    };

    state.refreshLayersModal = () => {
        renderContent();
    };

    renderContent();

    layersBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isExpanded = layersDiv.classList.contains("map-ctrl-styles--expanded");
        if (isExpanded) {
            layersDiv.classList.remove("map-ctrl-styles--expanded");
        } else {
            layersDiv.classList.add("map-ctrl-styles--expanded");
            renderContent();
        }
    });

    const closeBtn = listContainer.querySelector(".modal-close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            layersDiv.classList.remove("map-ctrl-styles--expanded");
        });
    }

    const capsules = listContainer.querySelectorAll(".modal-capsule");
    capsules.forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            const tab = btn.getAttribute("data-tab");
            if (tab === "tools") {
                showToast("Tools view is not available (coming soon)");
                return;
            }
            if (tab === "settings") {
                showToast("Settings view is not available (coming soon)");
                return;
            }
            if (tab === activeTab) return;

            activeTab = tab;
            capsules.forEach(c => {
                if (c.getAttribute("data-tab") === tab) {
                    c.classList.add("is-active");
                } else {
                    c.classList.remove("is-active");
                }
            });

            renderContent();
        });
    });

    searchToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        headerEl.classList.add("is-searching");
        if (searchInput) {
            searchInput.focus();
        }
    });

    searchCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        headerEl.classList.remove("is-searching");
        if (searchInput) {
            searchInput.value = "";
        }
        searchQuery = "";
        renderContent();
    });

    searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value;
        renderContent();
    });

    document.addEventListener("click", (e) => {
        if (!layersDiv.contains(e.target)) {
            layersDiv.classList.remove("map-ctrl-styles--expanded");
            headerEl.classList.remove("is-searching");
            if (searchInput) {
                searchInput.value = "";
            }
            searchQuery = "";
        }
    });

    updateControlPositions();

    setupMapCanvasEvents({
        map: state.map,
        state,
        onSelectCircles: () => selectSubject(CIRCLE_ID),
        onSwitchToCircles: switchToCirclesFeature,
        onLoad: rebuildGeoJsonLayer
    });

    setupMapEffectsAndFullscreen(mapWrapper);
}

function closeAllModals() {
    closeModalsView({ onBeforeClose: cancelDownloadViewPreload });
}











    function checkGitHubAuth() {
        // Check GitHub auth session state (placeholder for future GitHub OAuth integration)
        const isGitHubLoggedIn = Boolean(
            localStorage.getItem("github_token") ||
            sessionStorage.getItem("github_token") ||
            localStorage.getItem("gh_user")
        );
        const editBtn = document.getElementById("btn-edit-item");
        if (editBtn) {
            editBtn.style.display = isGitHubLoggedIn ? "" : "none";
        }
    }
    checkGitHubAuth();

    const editBtn = document.getElementById("btn-edit-item");
    if (editBtn) {
        editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            let target = state.currentId;
            if (target && target !== CIRCLE_ID) {
                target = normalizeZoneId(target);
            } else {
                target = CIRCLE_ID;
            }
            window.location.href = `/editor/?id=${encodeURIComponent(target)}`;
        });
    }

    const capsuleBackBtn = document.getElementById("btn-capsule-back");
    if (capsuleBackBtn) {
        capsuleBackBtn.addEventListener("click", (e) => {
            const list = document.getElementById("sidebar-zone-list");
            
            // On mobile, if we have the list container and aren't already animating, trigger the transition
            if (window.innerWidth <= 768 && list && !list.classList.contains("fly-out-right") && !list.classList.contains("fly-in-left-active")) {
                e.preventDefault();
                e.stopPropagation();
                
                list.classList.add("fly-out-right");
                
                setTimeout(() => {
                    executeBackNavigation();
                    
                    // Reset class and trigger fly-in from left
                    list.classList.remove("fly-out-right");
                    list.classList.add("fly-in-left-start");
                    list.offsetHeight; // Force reflow
                    list.classList.add("fly-in-left-active");
                    
                    setTimeout(() => {
                        list.classList.remove("fly-in-left-start", "fly-in-left-active");
                    }, 250);
                }, 200);
            } else {
                executeBackNavigation();
            }
        });
    }

    function executeBackNavigation() {
        if (state.selectedBird) {
            clearBirdObservations();
            selectSubject(state.currentId, true, true);
            return;
        }

        if (!state.isCirclesFeature && (state.currentId === CIRCLE_ID || !state.currentId)) {
            switchToCirclesFeature();
        } else {
            selectSubject(CIRCLE_ID);
        }
    }

function setupCapsules() {
    setupSidebarCapsuleEvents({
        state,
        documentObject: document,
        onRender: renderSidebarList,
        notify: showToast
    });
}

async function init() {
    const triggerEntrance = () => {
        document.body.classList.remove("is-transitioning");

        if (state.map) {
            state.map.resize();
            selectSubject(state.currentId, true, false);
        }

        // Fade from white screen overlay once elements are loaded behind the scenes
        const overlay = document.getElementById("page-transition-overlay");
        if (overlay) {
            overlay.classList.add("is-loaded");
            overlay.classList.remove("is-active");
        }
    };

    try {
        const storedTheme = localStorage.getItem("fovea-theme") || "dark";
        const isSystemLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
        const isLight = storedTheme === "light" || (storedTheme === "auto" && isSystemLight);

        if (isLight) {
            document.documentElement.setAttribute("data-theme", "light");
            document.documentElement.classList.add("theme-light");
            document.body.classList.add("theme-light");
            state.currentBaseLayer = "default";
        } else {
            document.documentElement.setAttribute("data-theme", "dark");
            document.documentElement.classList.remove("theme-light");
            document.body.classList.remove("theme-light");
            state.currentBaseLayer = "default";
        }

        const initialId = getInitialIdFromUrl();
        const initialFeature = state.isCirclesFeature ? 'circles' : state.currentFeature;
        state.allFeatures = await loadFeaturesForMapView(initialFeature);

        renderSidebarList();
        initializeMap();
        setupToolbarActionButtons({
            shareFile: handleSpatialFileShare,
            notify: showToast,
            downloadPdf: button => downloadGeoPdf(button),
            downloadTiff: button => downloadGeoTiff(button),
            closeModals: closeAllModals
        });
        setupSearch();
        setupCapsules();
        setupSwipeNavigation();
        setupListSwipeBack();
        setupImageLightbox();
        setupMobileResizeBar();
        setupHelpModeSystem({ renderSidebarList });
        setupSidebarScrollListener();
        setupMobileBottomNav();
        setupViewToggleMenu();

        selectSubject(initialId, true, false);

        if (initialId === "Oakridge" || initialId === "Cottage Grove") {
            setTimeout(() => {
                showToast("There is no data for this count circle");
            }, 800);
        }

        if (state.map) {
            if (state.map.loaded && state.map.loaded()) {
                setTimeout(triggerEntrance, 80);
            } else {
                state.map.once("load", () => {
                    setTimeout(triggerEntrance, 80);
                });
                state.map.once("idle", () => {
                    setTimeout(triggerEntrance, 80);
                });
                // Reliable safety timeout fallback
                setTimeout(triggerEntrance, 400);
            }
        } else {
            triggerEntrance();
        }
    } catch (err) {
        console.error("Error initializing maps tile page:", err);
        updateHeader("Error loading map data");
        triggerEntrance();
    }
}



if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

// Desktop & mobile back home transition listener
(function () {
    const bars = [
        document.getElementById("desktop-nav-tab-home"),
        document.getElementById("mobile-nav-tab-home"),
        document.querySelector(".header-logo-container a")
    ].filter(Boolean);
    const overlay = document.getElementById("page-transition-overlay");
    if (bars.length === 0) return;

    bars.forEach(bar => {
        bar.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            const dest = bar.getAttribute("href") || "../";
            if (window.transitionToPage) {
                window.transitionToPage(dest);
            } else if (overlay) {
                overlay.classList.remove("is-loaded");
                overlay.classList.add("is-active");
                setTimeout(function () {
                    window.location.href = dest;
                }, 500);
            } else {
                window.location.href = dest;
            }
        });
    });

    // Reset page states if user navigates back using browser Back button (bfcache reset)
    window.addEventListener("pageshow", function (event) {
        if (event.persisted) {
            document.body.classList.remove("is-transitioning");
            if (overlay) {
                overlay.classList.add("is-loaded");
                overlay.classList.remove("is-active");
            }
        }
    });
})();
