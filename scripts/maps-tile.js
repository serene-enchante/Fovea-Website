import { CIRCLE_ID } from './config/app-config.js';
import { loadGeoDataset } from './services/geo-data-repository.js';
import { getEbirdUrl } from './services/ebird-links.js';
import { fetchBirdObservations, fetchTaxonDefaultPhoto } from './services/observations-client.js';
import { getInitialIdFromUrl, getSelectedGeoJSONData } from './services/bird-data-service.js';
import { handleSpatialFileShare as shareSpatialFile } from './services/file-download-service.js';
import { launchAppWithStoreFallback } from './services/app-launch-service.js';
import { canvasToTiffBlob, geojsonToGpx, geojsonToKml } from './services/format-converters.js';
import { findPointInsidePolygon, getBbox, isPointInGeoJSONGeometry } from './utils/geometry-math.js';
import { displayZoneId, formatArea, formatDate, normalizeZoneId, zoneImagePath } from './utils/format-utils.js';
import { getThemeAccent, getThemeAccentLight } from './utils/color-utils.js';
import {
    checkUserLocationZone as updateLocationZone,
    createMapInstance,
    switchBaseMap as applyBaseMap,
    toggleLocationTracking as trackUserLocation
} from './map/map-init.js';
import { setupMapLayers, addZoneFeatureLayers, buildZoneFeatureData, selectMapStyleByIndex, updatePlaceLabelsFilter, updateLabelZoomVisibility } from './map/map-layers.js';
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
    if (!state.map || !state.map.getSource('zones')) return;
    
    // Dynamically filter circle place names from basemap on circles overview view
    try {
        updatePlaceLabelsFilter();
        updateBirdObservationsLayerStyles();
    } catch(e) { console.warn("Error updating map layer styles:", e); }
    
    // We update all features state based on currentId
    state.allFeatures.forEach(feature => {
        const props = feature.properties || {};
        const key = state.isCirclesFeature ? String(props.cid || "") : String(props.zid || "");
        const isSelected = state.currentId !== CIRCLE_ID && (key === state.currentId || normalizeZoneId(key) === normalizeZoneId(state.currentId));
        state.map.setFeatureState(
            { source: 'zones', id: key },
            { selected: isSelected }
        );
    });

    // Determine geometry styling based on active basemap (thick black outline & transparent deep blue fill for Light Mode/Esri Street/Topo, white for Dark/Satellite)
    const isLightModeTheme = document.body.classList.contains("theme-light") || (document.documentElement.getAttribute("data-theme") === "light");
    const isLightBasemap = state.currentBaseLayer === "esri-street" || state.currentBaseLayer === "esri-topo" || (state.currentBaseLayer === "default" && isLightModeTheme);
    const isSatelliteBasemap = state.currentBaseLayer === "satellite";
    const mapWrapper = document.getElementById("map-wrapper");
    const mapArea = document.querySelector(".maps-tile-map-area");
    [document.body, mapArea, mapWrapper].forEach(el => {
        if (el) {
            if (isLightBasemap) {
                el.classList.add("is-light-basemap");
            } else {
                el.classList.remove("is-light-basemap");
            }
        }
    });

    let defaultFillColor = '#ffffff';
    let defaultFillOpacity = 0.07;

    if (isLightBasemap) {
        defaultFillColor = '#000000';
        defaultFillOpacity = 0.04;
    } else if (isSatelliteBasemap) {
        defaultFillColor = '#000000'; // black fill for satellite only
        defaultFillOpacity = 0.75; // unselected black fill opacity increased significantly for satellite
    }

    const defaultLineColor = isLightBasemap ? '#000000' : '#ffffff';
    const dimLineColor = isLightBasemap ? '#000000' : 'rgba(255, 255, 255, 0.25)';
    const defaultLineWidth = isLightBasemap ? 1.8 : 1.0;

    const noDataFillColor = isLightBasemap ? '#000000' : defaultFillColor;
    const noDataFillOpacity = isLightBasemap ? 0.04 : (isSatelliteBasemap ? 0.60 : 0.02);
    const noDataLineColor = isLightBasemap ? '#000000' : dimLineColor;

    const hoverFillColor = isLightBasemap ? '#000000' : '#3f3f46';
    const hoverFillOpacity = isLightBasemap ? 0.10 : (isSatelliteBasemap ? 0.88 : 0.05);
    const noDataHoverFillOpacity = isLightBasemap ? 0.10 : (isSatelliteBasemap ? 0.75 : 0.02);

    const selectedFillColor = getThemeAccent();
    const selectedFillOpacity = isLightBasemap ? 0.15 : 0.0;
    const selectedLineColor = isLightBasemap ? getThemeAccent() : getThemeAccentLight();
    const unselectedOutlineOpacity = isLightBasemap ? 1.0 : (isSatelliteBasemap ? 0.70 : 0.18);

    if (state.map.getLayer('zones-fill')) {
        state.map.setPaintProperty('zones-fill', 'fill-color', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], selectedFillColor,
            ['interpolate', ['linear'], ['coalesce', ['feature-state', 'hoverAlpha'], 0],
                0, ['match', ['get', 'cid'], ['Oakridge', 'Cottage Grove'], noDataFillColor, defaultFillColor],
                1, hoverFillColor
            ]
        ]);
        const dimFillOpacity = defaultFillOpacity * 0.25;
        const dimNoDataFillOpacity = noDataFillOpacity * 0.25;
        state.map.setPaintProperty('zones-fill', 'fill-opacity', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], selectedFillOpacity,
            ['interpolate', ['linear'], ['coalesce', ['feature-state', 'hoverAlpha'], 0],
                0, ['interpolate', ['linear'], ['coalesce', ['feature-state', 'proximity'], 0],
                    0, ['match', ['get', 'cid'], ['Oakridge', 'Cottage Grove'], dimNoDataFillOpacity, dimFillOpacity],
                    1, ['match', ['get', 'cid'], ['Oakridge', 'Cottage Grove'], noDataFillOpacity, defaultFillOpacity]
                ],
                1, ['match', ['get', 'cid'], ['Oakridge', 'Cottage Grove'], noDataHoverFillOpacity, hoverFillOpacity]
            ]
        ]);
        state.map.setPaintProperty('zones-fill', 'fill-color-transition', { duration: 0 });
        state.map.setPaintProperty('zones-fill', 'fill-opacity-transition', { duration: 0 });
    }

    if (state.map.getLayer('zones-outline')) {
        state.map.setPaintProperty('zones-outline', 'line-color', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], selectedLineColor,
            ['match', ['get', 'cid'], 'Oakridge', true, 'Cottage Grove', true, false], noDataLineColor,
            defaultLineColor
        ]);
        state.map.setPaintProperty('zones-outline', 'line-width', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], (isLightBasemap ? 4.5 : 3.2),
            defaultLineWidth
        ]);
        state.map.setPaintProperty('zones-outline', 'line-opacity', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 1.0,
            unselectedOutlineOpacity  // dynamic outline opacity based on basemap
        ]);
        state.map.setPaintProperty('zones-outline', 'line-color-transition', { duration: 0 });
        state.map.setPaintProperty('zones-outline', 'line-width-transition', { duration: 0 });
        state.map.setPaintProperty('zones-outline', 'line-opacity-transition', { duration: 0 });
    }

    if (state.map.getLayer('zones-outline-highlight')) {
        state.map.setPaintProperty('zones-outline-highlight', 'line-color', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], selectedLineColor,
            'transparent'
        ]);
        state.map.setPaintProperty('zones-outline-highlight', 'line-width', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], (isLightBasemap ? 4.5 : 3.2),
            0.0
        ]);
        state.map.setPaintProperty('zones-outline-highlight', 'line-color-transition', { duration: 250 });
        state.map.setPaintProperty('zones-outline-highlight', 'line-width-transition', { duration: 250 });
    }

    // Refresh HTML label colors for basemap change
    rebuildHtmlLabels();
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

const FLORENCE_ZONE_BIRDS = {
    "01": {
        title: "Area 1 - Heceta Head, Cape Creek, East Lily Lake",
        desc: "Covers Cape Creek Road above the lighthouse, coastal bluffs, and east Lily Lake. Note: Team 2 also checks Lily Lake (compare numbers for high counts). Includes Bones Nursery on Hwy 101.",
        birds: [
            { name: "Black Oystercatcher", note: "Rocky coastline - only area in circle that has it" },
            { name: "American Dipper", note: "Cape Creek - probably only area in circle that has it" },
            { name: "Peregrine Falcon", note: "Heceta Head cliffs" },
            { name: "Northern Pygmy-Owl", note: "Forest edges" },
            { name: "Surfbird", note: "Rocky shoreline" },
            { name: "Black Turnstone", note: "Rocky intertidal" },
            { name: "Alcids (Murres, Guillemots, Murrelets)", note: "Ocean seawatch" },
            { name: "Canada Jay", note: "Conifer forest" },
            { name: "Hutton's Vireo", note: "Mixed woodland" },
            { name: "Townsend's Warbler", note: "Conifer canopy" },
            { name: "Swamp Sparrow", note: "Lily Lake marshes" },
            { name: "Lincoln's Sparrow", note: "Lily Lake edges" },
            { name: "Greater / Lesser Scaup", note: "Lily Lake open water" }
        ]
    },
    "02": {
        title: "Area 2 - Baker Beach, Baker Swamp, Cape Mtn. Loop",
        desc: "Outer beach, Baker Swamp, and Cape Mountain loop trail. Check China Creek sand flats and footprints for Snowy Plover. Baker Swamp has rail habitat (best results by playing recordings at ground level).",
        birds: [
            { name: "Snowy Plover", note: "Outer beach footprints & sand flats - likely only area that has it" },
            { name: "Lapland Longspur", note: "China Creek sand flats" },
            { name: "Snow Bunting", note: "China Creek sand flats" },
            { name: "Virginia Rail", note: "Baker Swamp" },
            { name: "Sora", note: "Baker Swamp" },
            { name: "Mountain Quail", note: "Cape Mountain loop" },
            { name: "Ruffed Grouse", note: "Cape Mountain loop" },
            { name: "Northern Shrike", note: "Open dunes & scrub" },
            { name: "Red-shouldered Hawk", note: "Swamp & forest edge" },
            { name: "Merlin", note: "Open beach & dunes" },
            { name: "American Pipit", note: "Outer beach & dunes" },
            { name: "Western Bluebird", note: "Around C&M stables / pastures" },
            { name: "Townsend's Solitaire", note: "Cape Mountain ridge" },
            { name: "Evening Grosbeak", note: "Cape Mountain conifer woods" },
            { name: "Red Crossbill", note: "Cape Mountain loop" },
            { name: "Brown Creeper", note: "Mature forest" },
            { name: "Canada Jay", note: "Cape Mountain forest" },
            { name: "Hutton's Vireo", note: "Cape Mountain woods" },
            { name: "Marsh Wren", note: "Baker Swamp reeds" },
            { name: "Swamp Sparrow", note: "Baker Swamp" },
            { name: "Geese", note: "Pasture west of Hwy 101 by stables" }
        ]
    },
    "03": {
        title: "Area 3 - Upper North Fork & Houghton Landing",
        desc: "Upper North Fork valley and Houghton Landing (former county park, now ODFW). Rain brings in great waterfowl variety and shorebirds. Accessible via Minerva junction.",
        birds: [
            { name: "Greater Scaup", note: "North Fork open water" },
            { name: "Lesser Scaup", note: "North Fork open water" },
            { name: "Canvasback", note: "Flooded pastures & sloughs" },
            { name: "Redhead", note: "Flooded fields & river" },
            { name: "Ruddy Duck", note: "River & marsh pools" },
            { name: "Eurasian Wigeon", note: "Waterfowl flocks" },
            { name: "Greater Yellowlegs", note: "Wet pastures & mudflats" },
            { name: "Long-billed Dowitcher", note: "Flooded fields" },
            { name: "American Kestrel", note: "Open valley pastures" },
            { name: "American Pipit", note: "Agricultural fields" },
            { name: "Swamp Sparrow", note: "River sloughs & brush" }
        ]
    },
    "04": {
        title: "Area 4 - Lower North Fork, Bender Landing, Block Rd",
        desc: "North Fork starting at Munsel Lake junction, Bender Landing, and Block Rd. Excellent waterfowl and raptor habitat after rain. Check marsh south of Bender Landing.",
        birds: [
            { name: "Greater Scaup", note: "River & sloughs" },
            { name: "Lesser Scaup", note: "River & sloughs" },
            { name: "Canvasback", note: "Flooded pastures & river" },
            { name: "Redhead", note: "Flooded fields & sloughs" },
            { name: "Ruddy Duck", note: "River & marsh pools" },
            { name: "Eurasian Wigeon", note: "Flooded fields with wigeon flocks" },
            { name: "Greater Yellowlegs", note: "Wet valley pastures" },
            { name: "Long-billed Dowitcher", note: "Flooded fields" },
            { name: "American Kestrel", note: "Fence lines & open fields" },
            { name: "American Pipit", note: "Open fields" },
            { name: "Swamp Sparrow", note: "Marsh south of Bender Landing" }
        ]
    },
    "05": {
        title: "Area 5 - North Jetty & West Florence",
        desc: "North Jetty seawatch and West Florence neighborhoods. Check jetty rocks for rocky shorebirds and sea ducks, and telephone wires along Rhododendron Dr. for doves.",
        birds: [
            { name: "Black Scoter", note: "Jetty waters (female often present)" },
            { name: "Surf Scoter", note: "Jetty waters & ocean" },
            { name: "White-winged Scoter", note: "Jetty waters & ocean" },
            { name: "Harlequin Duck", note: "Rough surf at jetty tips" },
            { name: "Long-tailed Duck", note: "Jetty channel & ocean" },
            { name: "Black Turnstone", note: "Jetty rocks" },
            { name: "Surfbird", note: "Jetty rocks" },
            { name: "Sanderling", note: "Ocean beaches & flats" },
            { name: "Red Phalarope", note: "Ocean seawatch" },
            { name: "Black-legged Kittiwake", note: "Ocean seawatch" },
            { name: "Northern Fulmar", note: "Ocean seawatch" },
            { name: "Bonaparte's Gull", note: "Seawatch & river mouth" },
            { name: "Shearwaters", note: "Ocean seawatch" },
            { name: "Alcids (Murres, Guillemots, Auklets)", note: "Ocean seawatch" },
            { name: "Horned Grebe", note: "Jetty channel" },
            { name: "Red-breasted Merganser", note: "River mouth & bay" },
            { name: "Herring Gull", note: "Beach & jetty" },
            { name: "Iceland (Thayer's) Gull", note: "Beach & jetty" },
            { name: "California Gull", note: "Beach & jetty" },
            { name: "Mourning Dove", note: "Wires along north Rhododendron Dr." },
            { name: "Eurasian Collared-Dove", note: "Wires along north Rhododendron Dr." },
            { name: "Townsend's Warbler", note: "West Florence neighborhood trees" },
            { name: "Palm Warbler", note: "Coastal brush & neighborhood edges" },
            { name: "Killdeer", note: "Florence Airport open tarmac" }
        ]
    },
    "06": {
        title: "Area 6 - East Florence, Munsel Lake, Lower North Fork",
        desc: "Munsel Lake, Clear Lake, Munsel Creek, Florence Golf Links, and neighborhood feeder routes. Check brushy patches behind LDS Church and school grounds for songbirds.",
        birds: [
            { name: "California Scrub-Jay", note: "Neighborhoods - often found only in Area 6" },
            { name: "Greater Scaup", note: "Munsel Lake" },
            { name: "Lesser Scaup", note: "Munsel Lake" },
            { name: "Ruddy Duck", note: "Munsel Lake" },
            { name: "Townsend's Warbler", note: "Munsel boat ramp & school edges" },
            { name: "Western Meadowlark", note: "Golf course edge & clubhouse pond" },
            { name: "Red-breasted Sapsucker", note: "Munsel Creek woods" },
            { name: "Accipiters (Sharp-shinned / Cooper's)", note: "Neighborhoods & feeders" },
            { name: "Hutton's Vireo", note: "Mixed woodland" },
            { name: "White-throated Sparrow", note: "Behind LDS Church & feeders" },
            { name: "Purple Finch", note: "Neighborhood trees & feeders" },
            { name: "Pine Siskin", note: "Conifers & feeders" },
            { name: "Killdeer", note: "High School & LCC open fields" }
        ]
    },
    "07": {
        title: "Area 7 - Duncan Island & Upper Siuslaw Valley",
        desc: "Duncan Island and Hwy 126 corridor to Tiernan Landing. Note: Do not drive on Duncan Island Rd; park on bridge and walk. Check river flocks along Bernhardt Rd.",
        birds: [
            { name: "Virginia Rail & Sora", note: "Duncan Island marsh (play recordings at first light / high tide)" },
            { name: "White-tailed Kite", note: "Upper valley pastures" },
            { name: "Common Merganser", note: "Siuslaw River flocks" },
            { name: "Greater & Lesser Scaup", note: "Siuslaw River along Bernhardt Rd." },
            { name: "Wood Duck", note: "Sloughs between Tiernan Landing & Phey Rd." },
            { name: "Western Bluebird", note: "C&D Dock area & Tiernan Landing" },
            { name: "Wilson's Snipe", note: "Wet riverfront pastures" },
            { name: "Northern Shrike", note: "Pasture fence lines & scrub" },
            { name: "Red-shouldered Hawk", note: "River valley forest edge" },
            { name: "Bald Eagle", note: "Siuslaw River" },
            { name: "Barn Owl", note: "Local barns & outbuildings" },
            { name: "American Kestrel", note: "Open fields & wires" },
            { name: "Black Phoebe", note: "River banks & docks" },
            { name: "Hutton's Vireo", note: "Riparian woodland" },
            { name: "Townsend's Warbler", note: "Conifer trees" },
            { name: "Swamp Sparrow", note: "Sloughs near Tiernan Landing" },
            { name: "Lincoln's Sparrow", note: "Duncan Island brush" },
            { name: "Red Crossbill", note: "Conifers up Bernhardt Rd." }
        ]
    },
    "08": {
        title: "Area 8 - Glenada, Canary Rd., South Inlet",
        desc: "Woahink Lake park peninsula, pastures along east Canary Rd., South Inlet mudflats, and Glenada waterfront. Check lower tides off Glenada park.",
        birds: [
            { name: "Mountain Quail", note: "Woahink Lake park forest" },
            { name: "American Wigeon", note: "South Inlet & Glenada waterfront" },
            { name: "Eurasian Wigeon", note: "South Inlet wigeon flocks" },
            { name: "Wilson's Snipe", note: "Canary Rd. pastures & South Inlet" },
            { name: "Greater Yellowlegs", note: "South Inlet mudflats" },
            { name: "Long-billed Dowitcher", note: "South Inlet mudflats" },
            { name: "Western Bluebird", note: "Pastures along east Canary Rd." },
            { name: "American Pipit", note: "Canary Rd. pastures" },
            { name: "Black Phoebe", note: "South Inlet & waterfront" },
            { name: "Anna's Hummingbird", note: "Glenada residential gardens" },
            { name: "Orange-crowned Warbler", note: "Glenada shrubs" },
            { name: "Townsend's Warbler", note: "Glenada park parking area" },
            { name: "White-throated Sparrow", note: "Neighborhood brush & feeders" },
            { name: "Cedar Waxwing", note: "Fruiting shrubs" },
            { name: "Lesser Goldfinch", note: "Glenada weed patches & feeders" }
        ]
    },
    "09": {
        title: "Area 9 - South Jetty Rd",
        desc: "South Jetty road corridor, open dunes, and jetty mouth. Best area in circle for Northern Shrike, Savannah Sparrow, and American Bittern (dogpond / Lot 3 main dike).",
        birds: [
            { name: "American Bittern", note: "Dogpond & Lot 3 main dike at first light" },
            { name: "Northern Shrike", note: "South Jetty Rd dunes & scrub" },
            { name: "Savannah Sparrow", note: "Dune grasses along South Jetty Rd" },
            { name: "Marsh Wren", note: "Dune swale marshes" },
            { name: "Black Scoter", note: "Jetty mouth & surf (female often present)" },
            { name: "Surf Scoter", note: "Jetty mouth & ocean" },
            { name: "White-winged Scoter", note: "Jetty mouth & ocean" },
            { name: "Long-tailed Duck", note: "Rough water at ends of jetties" },
            { name: "Harlequin Duck", note: "Jetty tip surf" },
            { name: "Black Turnstone", note: "Jetty rocks" },
            { name: "Surfbird", note: "Jetty rocks" },
            { name: "Sanderling", note: "Ocean beaches & flats" },
            { name: "Black-legged Kittiwake", note: "Ocean seawatch" },
            { name: "Northern Fulmar", note: "Ocean seawatch" },
            { name: "Bonaparte's Gull", note: "Seawatch & river mouth" },
            { name: "Shearwaters", note: "Ocean seawatch" },
            { name: "Red Phalarope", note: "Ocean seawatch" },
            { name: "Alcids (Murres, Guillemots, Auklets)", note: "Ocean seawatch" },
            { name: "Herring Gull", note: "Beach & jetty" },
            { name: "Iceland (Thayer's) Gull", note: "Beach & jetty" },
            { name: "California Gull", note: "Beach & jetty" }
        ]
    },
    "10": {
        title: "Area 10 - Sutton Lake, Mercer Lake, Enchanted Valley",
        desc: "Sutton Lake, Mercer Lake, and Enchanted Valley. Woody marshes at creek crossings host rails, warblers, and phoebes.",
        birds: [
            { name: "Ruddy Duck", note: "Sutton & Mercer Lakes" },
            { name: "Lesser Scaup", note: "Sutton & Mercer Lakes" },
            { name: "Greater Scaup", note: "Sutton & Mercer Lakes" },
            { name: "Virginia Rail & Sora", note: "Woody creek crossings" },
            { name: "Pileated Woodpecker", note: "Enchanted Valley mature forest" },
            { name: "Red Crossbill", note: "Enchanted Valley conifers" },
            { name: "Orange-crowned Warbler", note: "Marsh brush & creek crossings" },
            { name: "Townsend's Warbler", note: "Conifer canopy" },
            { name: "Hutton's Vireo", note: "Mixed woodland" },
            { name: "Swamp Sparrow", note: "Creek crossing marshes" },
            { name: "Black Phoebe", note: "Lake shores & creek mouths" }
        ]
    },
    "11": {
        title: "Area 11 - Old Town to Cushman",
        desc: "Historic Old Town, Port of Florence docks, new nature trail, and Hwy 126 to Cushman. Check below Saxon's stilt house at lower tides for shorebirds and egrets.",
        birds: [
            { name: "Townsend's Warbler", note: "Old Town mini-park & Port swale trees" },
            { name: "Least Sandpiper", note: "Port docks at high tide & Saxon's flats" },
            { name: "Spotted Sandpiper", note: "Port docks & river log booms" },
            { name: "Western Sandpiper", note: "Port of Florence docks" },
            { name: "Common Merganser", note: "Siuslaw River" },
            { name: "Great Egret", note: "Saxon's stilt house mudflats" }
        ]
    },
    "12": {
        title: "Area 12 - Sutton Creek, Heceta Beach, Alder Dune",
        desc: "Sutton Creek campground & overlook platform, Heceta Beach town and sands, and Alder Dune big-tree forest. Best chance in circle for Brown Creeper.",
        birds: [
            { name: "Brown Creeper", note: "Alder Dune Campground mature forest" },
            { name: "Tundra Swan", note: "Sutton Creek overlook" },
            { name: "Hutton's Vireo", note: "Sutton Creek campground woods" },
            { name: "Sanderling", note: "Heceta Beach northbound in morning" },
            { name: "Snow Bunting", note: "Heceta Beach open sands" },
            { name: "Snowy Plover", note: "Heceta Beach sands" },
            { name: "Small Songbird Flocks", note: "Sutton overlook platform creekside" }
        ]
    },
    "13": {
        title: "Area 13 - Haich Iktattuu / Waite Ranch",
        desc: "McKenzie River Trust restored tidal wetland property (Haich Iktattuu, formerly Waite Ranch). Requires prior permit & parking pass. Superb raptor and waterfowl habitat.",
        birds: [
            { name: "Short-eared Owl", note: "Restored tidal marsh & grasslands" },
            { name: "White-tailed Kite", note: "Marsh & pasture perches" },
            { name: "Northern Shrike", note: "Marsh edge shrubs" },
            { name: "Cackling Goose", note: "Restored wetland pools" },
            { name: "Common Merganser", note: "Tidal channels" },
            { name: "Greater & Lesser Scaup", note: "Tidal sloughs" },
            { name: "Ring-billed Gull", note: "Tidal mudflats" },
            { name: "Savannah Sparrow", note: "Marsh grasses" },
            { name: "Lincoln's Sparrow", note: "Wetland brush" },
            { name: "Swamp Sparrow", note: "Marsh reeds & cattails" }
        ]
    }
};


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


function rebuildHtmlLabels() {
    if (!state.map || !state.labelData) return;

    const overlay = document.getElementById('map-label-overlay');
    if (!overlay) return;

    const zoom = state.map.getZoom();
    const isMobile = window.innerWidth <= 768;
    const isCirclesView = state.isCirclesFeature || state.currentFeature === 'circles';

    // Separate zoom cutoffs for Circles Overview vs Zone Views on mobile
    let circleCutoff;
    let zoneCutoff;

    if (isMobile) {
        // In Circles Overview view: show circle labels at zoom >= 8.0
        // Middle ground for Count Circle with Zones view: show zone labels at zoom >= 9.85
        circleCutoff = isCirclesView ? 8.0 : 9.5;
        zoneCutoff = 9.85;
    } else {
        circleCutoff = 7.5;
        zoneCutoff = 9.0;
    }
    const isLightModeTheme = document.body.classList.contains("theme-light") || (document.documentElement.getAttribute("data-theme") === "light");
    const isLightBasemap = state.currentBaseLayer === 'esri-street' || state.currentBaseLayer === 'esri-topo' || (state.currentBaseLayer === 'default' && isLightModeTheme);

    // Remove labels that no longer match current feature set
    const currentIds = new Set(state.labelData.map(d => d.id));
    const existing = overlay.querySelectorAll('.map-zone-label');
    existing.forEach(el => {
        if (!currentIds.has(el.dataset.labelId)) el.remove();
    });

    state.labelData.forEach(d => {
        const { id, lng, lat, text, degWidth, textLen, isCircle } = d;

        // Determine visibility based on zoom + size thresholds (mirrors old MapLibre interpolation)
        let visible = false;
        if (zoom >= circleCutoff) {
            if (isCircle) {
                // Pick the size-fit threshold for the current zoom range
                let factor;
                if (zoom >= 14)          { visible = true; }
                else if (zoom >= 12)     { factor = 0.00015; }
                else if (zoom >= 11)     { factor = 0.0006; }
                else if (zoom >= zoneCutoff) { factor = 0.0012; }
                else if (zoom >= 8)      { factor = 0.0024; }
                else                     { factor = 0.010; }  // circleCutoff..8
                if (factor !== undefined) visible = degWidth >= textLen * factor;
            } else {
                // zid features only show at higher zooms
                let factor;
                if (zoom >= 14)      { visible = true; }
                else if (zoom >= 12) { factor = 0.00015; }
                else if (zoom >= 11) { factor = 0.0006; }
                else if (zoom >= zoneCutoff) { factor = 0.0012; }
                if (factor !== undefined) visible = degWidth >= textLen * factor;
            }
        }

        // Project geo coords to screen pixel coords
        const pt = state.map.project([lng, lat]);
        const canvas = state.map.getCanvas();

        let el = overlay.querySelector(`.map-zone-label[data-label-id="${id}"]`);
        if (!el) {
            el = document.createElement('div');
            el.className = 'map-zone-label';
            el.dataset.labelId = id;
            el.textContent = text;
            overlay.appendChild(el);
        }

        // Font size: interpolate with zoom
        let fontSize = 0;
        if (visible) {
            if (zoom <= 8) fontSize = isCircle ? 17 : 15;
            else if (zoom <= 10) fontSize = isCircle ? 18 : 16;
            else if (zoom <= 11) fontSize = isCircle ? 19 : 17;
            else if (zoom <= 12) fontSize = isCircle ? 20 : 18;
            else fontSize = isCircle ? 22 : 20;
        }

        el.style.left = `${pt.x}px`;
        el.style.top = `${pt.y}px`;
        el.style.fontSize = `${fontSize}px`;
        el.style.opacity = fontSize > 0 ? '1' : '0';
        el.style.pointerEvents = 'none';
        el.style.color = isLightBasemap ? '#000000' : '#c8c8c8';
        el.style.textShadow = isLightBasemap
            ? 'none'
            : '0 0 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)';
    });
}

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
            state.map.on('move', rebuildHtmlLabels);
            state.map.on('zoom', rebuildHtmlLabels);
            state.map.on('render', rebuildHtmlLabels);
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
