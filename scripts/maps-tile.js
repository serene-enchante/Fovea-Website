import { CIRCLE_ID } from './config/app-config.js';
import { parseMapRoute, serializeMapRoute } from './map/map-route-state.js';
import { loadGeoDataset } from './services/geo-data-repository.js';
import { findFeatureByZoneId, getSelectedGeoJSONData as createSelectedGeoJSONData } from './services/geo-selection.js';
import { getDownloadFilename } from './services/download-file-names.js';
import { handleSpatialFileShare as shareSpatialFile } from './services/file-download-service.js';
import { launchAppWithStoreFallback } from './services/app-launch-service.js';
import { resolveAppInstructionConfig } from './services/app-instruction-config.js';
import { canvasToTiffBlob, geojsonToGpx, geojsonToKml } from './services/format-converters.js';
import { loadQrCodeImage } from './services/qr-image-service.js';
import { getAppSelectionTitle, getSelectionThumbnail } from './map/app-selection-presentation.js';
import { findPointInsidePolygon, getBbox, isPointInGeoJSONGeometry } from './utils/geometry-math.js';
import { getLayoutScaleBar } from './utils/map-print-math.js';
import { displayZoneId, formatArea, formatDate, normalizeZoneId, zoneImagePath } from './utils/format-utils.js';
import { getThemeAccent, getThemeAccentLight } from './utils/color-utils.js';
import {
    checkUserLocationZone as updateLocationZone,
    createMapInstance,
    switchBaseMap as applyBaseMap,
    toggleLocationTracking as trackUserLocation
} from './map/map-init.js';
import { setupMapLayers, addZoneFeatureLayers, buildZoneFeatureData } from './map/map-layers.js';
import { setupMapCanvasEvents, setupMapHoverEvents } from './map/map-events.js';
import { setupMapViewportEffects } from './map/map-viewport.js';
import { updateMapControlPositions } from './map/map-control-layout.js';
import { adjustHeaderFontSize, getFitPadding, updateHeader } from './components/header-view.js';
import { syncSidebarTabs } from './components/sidebar-tabs.js';
import { activateSidebarTab, setupSidebarCapsuleEvents } from './components/sidebar-capsule-events.js';
import { getSuggestSelectionLabel } from './components/feedback-form.js';
import { setupSidebarScrollListener, updateKeyboardTileFocus } from './components/sidebar-list.js';
import { openImageLightbox, setupImageLightbox } from './components/image-lightbox.js';
import { setMobileSnapState, setupMobileResizeBar, setupSwipeNavigation } from './components/mobile-view.js';
import { createFeatureTransitionController, selectSubject as selectMapSubject } from './map/map-selection.js';
import { state } from './state.js';

const FALLBACK_IMAGE = "../images/wetlands.jpg";

// MapLibre prototype polyfill for Leaflet legacy compatibility
if (typeof maplibregl !== 'undefined' && maplibregl.Map) {
    maplibregl.Map.prototype.invalidateSize = function() {
        this.resize();
    };
}

const MAP_STYLES = {
    default: {
        color: "#ffffff",
        weight: 1.0,
        fillColor: "#ffffff",
        fillOpacity: 0.07
    },
    hover: {
        get color() { return getThemeAccent(); },
        weight: 1.8,
        get fillColor() { return getThemeAccent(); },
        fillOpacity: 0.2
    },
    selected: {
        get color() { return getThemeAccentLight(); },
        weight: 2.2,
        get fillColor() { return getThemeAccent(); },
        fillOpacity: 0.35
    }
};


function toExpression(f) {
    if (!f) return null;
    if (!Array.isArray(f)) return f;
    
    const op = f[0];
    if (op === 'all' || op === 'any' || op === 'none') {
        return [op, ...f.slice(1).map(toExpression)];
    }
    
    // If it's already an expression (e.g. second element is an array), return as is
    if (Array.isArray(f[1])) {
        return f;
    }
    
    const key = f[1];
    if (op === '==' || op === '!=' || op === '>' || op === '>=' || op === '<' || op === '<=') {
        return [op, ['get', key], f[2]];
    }
    if (op === 'has') {
        return ['has', key];
    }
    if (op === '!has') {
        return ['!', ['has', key]];
    }
    if (op === 'in') {
        return ['in', ['get', key], ['literal', f.slice(2)]];
    }
    if (op === '!in') {
        return ['!', ['in', ['get', key], ['literal', f.slice(2)]]];
    }
    
    return f;
}

function updatePlaceLabelsFilter() {
    if (!state.map) return;

    // Lazily cache original place filters if not done already for this style
    if (!state._originalPlaceFilters) {
        state._originalPlaceFilters = {};
        const placeLayersForFilter = [
            'place_city_r5',
            'place_city_r6',
            'place_town',
            'place_villages',
            'place_suburbs',
            'place_hamlet',
            'place_city_dot_r7',
            'place_city_dot_r4',
            'place_city_dot_r2',
            'place_city_dot_z7',
            'place_capital_dot_z7'
        ];
        
        let foundAny = false;
        placeLayersForFilter.forEach(lId => {
            if (state.map.getLayer(lId)) {
                state._originalPlaceFilters[lId] = state.map.getFilter(lId) || null;
                foundAny = true;
            }
        });

        if (!foundAny) {
            // Style layers are not available yet (still loading), return and try again on next draw/update
            delete state._originalPlaceFilters;
            return;
        }
    }

    const isCirclesView = !!(state.isCirclesFeature || state.currentFeature === 'circles');
    
    // Only apply the filter update if the view type changed to save performance
    if (state._lastHiddenCircleNames === isCirclesView) return;
    state._lastHiddenCircleNames = isCirclesView;

    const circleNames = ['Eugene', 'Florence', 'Cottage Grove', 'Oakridge'];
    console.log("Applying duplicate circles filter. Hide circle names:", isCirclesView);

    Object.keys(state._originalPlaceFilters).forEach(lId => {
        if (state.map.getLayer(lId)) {
            const origFilter = toExpression(state._originalPlaceFilters[lId]);
            if (isCirclesView) {
                // If it's a circle overview, exclude the circle names from showing in the basemap
                let newFilter;
                const exclusion = [
                    'all',
                    ['match', ['get', 'name'], 'Eugene', false, 'Florence', false, 'Cottage Grove', false, 'Oakridge', false, true],
                    ['match', ['get', 'name_en'], 'Eugene', false, 'Florence', false, 'Cottage Grove', false, 'Oakridge', false, true]
                ];
                
                if (!origFilter) {
                    newFilter = exclusion;
                } else if (origFilter[0] === 'all') {
                    newFilter = [...origFilter, ...exclusion.slice(1)];
                } else {
                    newFilter = ['all', origFilter, ...exclusion.slice(1)];
                }
                state.map.setFilter(lId, newFilter);
            } else {
                // Restore original filter
                if (origFilter === null) {
                    state.map.setFilter(lId, undefined);
                } else {
                    state.map.setFilter(lId, origFilter);
                }
            }
        }
    });
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

const EUGENE_ZONE_DESCRIPTIONS = {
    "01": "Comprises northern agricultural plains and foothill margins, featuring open grass fields, hedgerows, and oak savanna that host wintering raptors and sparrows.",
    "02": "Features low-elevation floodplain terrain, combining riparian hardwood woodlands, seasonal sloughs, and agricultural pastures favored by foraging winter songbirds and waterfowl.",
    "03A": "Encompasses urban wetland basins and river backwaters, featuring willow thickets, emergent marshes, and open water channels attractive to dabbling ducks and grebes.",
    "03B": "Covers a major river confluence area, characterized by gravel bars, riparian cottonwood gallery, and mixed woodlands that support wintering mergansers and eagles.",
    "04": "Features riverfront riparian greenways and suburban edges, blending mature black cottonwoods, shrub buffers, and open parks that shelter diverse winter passerines.",
    "05A": "Centering urban river corridors and wooded park slopes, this zone combines city parklands, mixed canopy, and waterways hosting wintering woodland species.",
    "05B": "Comprises urban stream corridors, canalways, and suburban residential gardens, providing canopy cover and foraging habitat for wintering thrushes, finches, and sparrows.",
    "06A": "Features eastern foothill slopes and tributary creek ravines, dominated by mixed conifer-hardwood forests that shelter wintering kinglets, creepers, and woodpeckers.",
    "06B": "Follows a broad river corridor, offering mature alder and cedar floodplains, gravel islands, and side channels for wintering river birds and waterfowl.",
    "07": "Encompasses river valley bottomlands and agricultural groves, blending riparian woodlands, oxbows, and open pastures attractive to wintering passerines.",
    "08": "Features rolling oak savanna, open prairie meadows, and upland conifer ridges, offering prime foraging terrain for wintering bluebirds and hunting raptors.",
    "09": "Dominates southern upland ridge slopes, featuring dense Douglas fir forest, fern-covered ravines, and foothill woods hosting wintering forest birds.",
    "10": "Spans high-elevation rocky crests, conifer-covered slopes, southern foothill ravines, and residential woods, combining mixed fir-madrone canopy, brushy edges, and open ridgelines that attract wintering finches, nuthatches, towhees, and jays.",
    "10A": "Covers high-elevation rocky crests and conifer-covered slopes, featuring mixed fir-madrone woods and open ridgelines that attract wintering finches and nuthatches.",
    "10B": "Spans southern foothill ravines and residential woods, combining mixed evergreen canopy, brushy ravines, and garden edges favored by wintering towhees and jays.",
    "11A": "Features southwestern agricultural foothills, with rolling pastures, seasonal ponds, and oak-pine savanna supporting wintering sparrows and meadow birds.",
    "11B": "Spans wooded southwestern hillside ravines and suburban margins, offering mixed conifer groves and brushy thickets that shelter wintering songbirds.",
    "12A": "Follows a rural stream drainage, characterized by low-elevation wet pastures, willow margins, and open agricultural fields favored by wintering harriers.",
    "12B": "Encompasses native wet prairie basins and vernal swales, featuring open grasslands and scattered oak groves where wintering snipe and shrikes forage.",
    "13A": "Features extensive freshwater marshlands and vernal ponds, offering emergent reedbeds, willow corridors, and shallow waters that attract diverse winter waterfowl.",
    "13B": "Spans restored wetland drainage channels and low-lying wet meadows, providing rich foraging habitat for wintering shorebirds, dabblers, and marsh birds.",
    "14": "Covers open reservoir shoreline and marshy embayments, featuring shallow mudflats, emergent vegetation, and open waters hosting wintering grebes and loons.",
    "15": "Encompasses vast wetland basins and open water impoundments, with emergent marshes and flooded fields supporting large concentrations of wintering waterfowl.",
    "16": "Features extensive restored wet prairie and seasonal swales, providing open foraging expanses and hunting perches for wintering northern harriers and owls.",
    "17": "Dominates open agricultural flatlands and grass seed fields, featuring drainage ditches and fencerows where wintering raptors and open-country flocks gather.",
    "18": "Covers rural-urban transition flats, blending agricultural fields, brushy roadside hedgerows, and drainage ditches favored by wintering sparrow flocks.",
    "19": "Spans urban residential neighborhoods and community parklands, featuring neighborhood tree canopy, drainage swales, and garden habitats for wintering suburban birds.",
    "20A": "Features river tailraces, open water spillways, and dense riparian gallery, providing sheltered foraging and roosting waters for wintering diving ducks.",
    "20B": "Encompasses braided river channels and floodplain gravel bars, flanked by mature riparian forest that provides winter roosts for bald eagles.",
    "21": "Covers eastern reservoir embayments and agricultural fringes, combining sheltered marshy coves and oak woodlands that host wintering ducks and raptors."
};

const FLORENCE_ZONE_DESCRIPTIONS = {
    "01": "Covers rugged coastal ocean headlands and rocky sea cliffs, featuring marine waters, coastal spruce forests, and offshore habitats for pelagic seabirds.",
    "02": "Features coastal freshwater wetland basins and shore pine groves, providing sheltered waters and emergent reedbeds for wintering grebes and diving ducks.",
    "03": "Dominates upper coastal rainforest watersheds, featuring steep mossy hemlock ravines, cedar stands, and clear tributary streams for wintering forest birds.",
    "04": "Covers tidal riverfront waterfronts and harbor channels, featuring intertidal mudflats, dock pilings, and open estuarine waters frequented by wintering gulls.",
    "05": "Features ocean beach surf zones and coastal sand spits, offering exposed wave-swept beaches and sandy dunes for wintering shorebirds and sea ducks.",
    "06": "Encompasses freshwater lake shores and coastal residential woodlands, combining sheltered shorelines and native coastal scrub for wintering passerines.",
    "07": "Follows coastal river canyon bends, featuring tidal riverbanks, steep conifer slopes, and quiet backwater channels hosting wintering mergansers and eagles.",
    "08": "Covers large freshwater coastal lake expanses and marshy borders, with emergent vegetation and spruce margins rich in wintering waterfowl.",
    "09": "Encompasses open coastal sand dunes, deflation plain wetlands, and beach surf zones, hosting wintering plovers, sanderlings, and coastal raptors.",
    "10": "Features freshwater dune-fringed water bodies and evergreen coastal woods, combining coastal scrub and shore pine forests for winter water and forest birds.",
    "11": "Covers deep coastal freshwater embayments and cedar swamp margins, flanked by mature conifer forest hosting wintering divers and woodland birds.",
    "12": "Spans ocean beachfronts, sandy coastal foredunes, and ocean surf lines, providing expansive foraging habitat for wintering gulls, scoters, and shorebirds.",
    "13": "Features tidal river sloughs and brackish marsh islands, offering intertidal mudflats and shallow waters attractive to wintering herons and waders."
};

function getZoneDescription(targetFeature, isFlorence) {
    if (!targetFeature) return "";
    const props = targetFeature.properties || {};
    const zid = displayZoneId(props.zid);
    const normalizedZid = zid.replace(/^0+/, "");
    
    const descriptions = isFlorence ? FLORENCE_ZONE_DESCRIPTIONS : EUGENE_ZONE_DESCRIPTIONS;
    if (descriptions[zid]) return descriptions[zid];
    if (descriptions[normalizedZid]) return descriptions[normalizedZid];
    if (descriptions["0" + normalizedZid]) return descriptions["0" + normalizedZid];

    return props.description || `Survey Zone ${zid} Christmas Bird Count designated boundary and field observation area.`;
}

function showToast(message, isError = false) {
    let toast = document.getElementById("toast-notification");
    const container = document.querySelector(".maps-tile-map-area") || document.body;
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        toast.className = "toast-notification";
        container.appendChild(toast);
    } else if (toast.parentElement !== container) {
        container.appendChild(toast);
    }

    toast.innerHTML = `<span>${message}</span>`;

    if (isError) {
        toast.classList.add("toast-notification--disabled");
    } else {
        toast.classList.remove("toast-notification--disabled");
    }
    toast.classList.add("is-visible");
    if (window._toastTimer) clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2800);
}

// --- Client-Side Exporter Helpers (GeoJSON, KMZ, GPX) ---
function getActiveDownloadFilename(ext) {
    return getDownloadFilename({
        currentFeature: state.currentFeature,
        currentId: state.currentId,
        circleId: CIRCLE_ID
    }, ext);
}

function getSelectedGeoJSONData() {
    return createSelectedGeoJSONData({
        features: state.allFeatures,
        currentId: state.currentId,
        isCirclesFeature: state.isCirclesFeature,
        circleId: CIRCLE_ID
    });
}

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
 * Generates/retrieves the active spatial dataset as a Blob for a given format key.
 */
async function generateAppSpatialBlob(formatKey) {
  const geojson = getSelectedGeoJSONData();
  const filename = getActiveDownloadFilename(formatKey === "geopdf" ? "pdf" : formatKey);

  if (formatKey === "geopdf") {
    const canvas = await getOrRenderLayoutCanvas();
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
        creator: "Fovea Web Map Layout Engine"
      });
      return { blob: pdf.output("blob"), filename };
    } else {
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve({ blob, filename: filename.replace(/\.pdf$/, "-layout.png") });
        }, "image/png");
      });
    }
  } else if (formatKey === "geotiff" || formatKey === "tif") {
    const canvas = await getOrRenderLayoutCanvas();
    const tiffBlob = canvasToTiffBlob(canvas);
    return { blob: tiffBlob, filename: getActiveDownloadFilename("tif") };
  } else if (formatKey === "gpx") {
    const gpxStr = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ""));
    const blob = new Blob([gpxStr], { type: "application/gpx+xml" });
    return { blob, filename: filename.endsWith(".gpx") ? filename : `${filename}.gpx` };
  } else if (formatKey === "kmz") {
    const kmlStr = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ""));
    if (typeof JSZip !== "undefined") {
      const zip = new JSZip();
      zip.file("doc.kml", kmlStr);
      const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });
      return { blob, filename };
    } else {
      const blob = new Blob([kmlStr], { type: "application/vnd.google-earth.kml+xml" });
      return { blob, filename: filename.replace(/\.kmz$/i, ".kml") };
    }
  } else {
    // Default GeoJSON
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    return { blob, filename };
  }
}

/**
 * Dynamically updates the Avenza modal title to match selection type (Zones vs Circles).
 */
function updateAvenzaModalHeaderTitle(targetAppName = "Avenza Maps") {
  const modalTitleEl = document.getElementById("avenza-modal-title");
  if (!modalTitleEl) return;
  const title = getAppSelectionTitle({ ...state, features: state.allFeatures, circleId: CIRCLE_ID });
  modalTitleEl.innerHTML = title.circleName
    ? `Import <span class="avenza-target-name">${title.targetName}</span> of the <span class="avenza-target-name">${title.circleName}</span> into ${targetAppName}`
    : `Import the <span class="avenza-target-name">${title.targetName}</span> into ${targetAppName}`;
}

/**
 * Returns count circle thumbnail/logo for the current selection (matching top-left header logo).
 */
function getActiveSelectionThumbnail() {
  return getSelectionThumbnail(state);
}

/**
 * Opens the blackout instruction modal dynamically configured for any app (Avenza, Gaia GPS, CalTopo, OsmAnd).
 */
async function openAppInstructionModal(appKeyOrName, mapFileUrlOrBlob = null, filename = null, triggerCard = null) {
  const { config, normalizedKey: normKey } = resolveAppInstructionConfig(appKeyOrName);

  let blobPromise = null;
  if (mapFileUrlOrBlob instanceof Blob) {
    blobPromise = Promise.resolve({ blob: mapFileUrlOrBlob, filename: filename || `map.${config.ext}` });
    window._pendingAppBlob = mapFileUrlOrBlob;
  } else {
    window._pendingAppBlob = null;
    blobPromise = generateAppSpatialBlob(config.formatKey);
  }

  const finalFilename = filename || `map.${config.ext}`;
  window._pendingAppBlobPromise = blobPromise;
  window._pendingAppFilename = finalFilename;
  window._pendingAppScheme = config.scheme;
  window._pendingAppFormatKey = config.formatKey;
  window._pendingAppKey = config.appKey || normKey;

  // Background resolution
  blobPromise.then(res => {
    window._pendingAppBlob = res.blob;
    if (res.filename) window._pendingAppFilename = res.filename;
  }).catch(err => {
    console.error("Background map generation error:", err);
  });

  const appIconEl = document.getElementById("avenza-modal-app-icon");
  if (appIconEl) {
    appIconEl.src = config.iconSrc;
    appIconEl.alt = config.appName;
  }

  updateAvenzaModalHeaderTitle(config.appName);

  const selectionThumbEl = document.getElementById("avenza-selection-thumb");
  if (selectionThumbEl) selectionThumbEl.src = getActiveSelectionThumbnail();

  const step1Heading = document.getElementById("avenza-step1-heading");
  if (step1Heading) step1Heading.textContent = config.step1Heading;

  const downloadBtn = document.getElementById("avenza-modal-download-btn");
  if (downloadBtn) {
    downloadBtn.classList.remove("is-downloaded", "is-preparing");
    downloadBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Download</span>
    `;
  }

  const step2Heading = document.getElementById("avenza-step2-heading");
  if (step2Heading) step2Heading.textContent = config.step2Heading;

  const step2Text = document.getElementById("avenza-step2-text");
  if (step2Text) step2Text.innerHTML = config.step2Text;

  const step3Heading = document.getElementById("avenza-step3-heading");
  if (step3Heading) step3Heading.textContent = config.step3Heading;

  const step3Text = document.getElementById("avenza-step3-text");
  if (step3Text) step3Text.innerHTML = config.step3Text;

  const continueBtn = document.getElementById("btn-avenza-continue");
  if (continueBtn) {
    const continueSpan = continueBtn.querySelector("span");
    if (continueSpan) continueSpan.textContent = config.continueBtnText;
  }

  const avenzaModal = document.getElementById("avenza-instruction-modal");
  if (avenzaModal) {
    avenzaModal.setAttribute("aria-hidden", "false");
    avenzaModal.classList.add("is-open");
    document.body.classList.add("has-active-modal", "has-avenza-modal");

    const bottomNav = document.querySelector(".mobile-bottom-nav-container");
    if (bottomNav) {
      bottomNav.classList.add("is-hidden-entirely");
      bottomNav.style.setProperty("display", "none", "important");
    }
  }
}

/**
 * Direct Avenza Maps Deep Link Importer (Legacy Wrapper)
 */
async function openInAvenzaWithFallback(mapFileUrlOrBlob, filename, triggerCard = null) {
  await openAppInstructionModal("Avenza Maps", mapFileUrlOrBlob, filename, triggerCard);
}

/**
 * Executes direct app handshake for Suggested Apps (Avenza, Gaia GPS, CalTopo, OsmAnd).
 */
async function handleAppDirectOpen(appName, triggerCard = null) {
  try {
    await openAppInstructionModal(appName, null, null, triggerCard);
  } catch (err) {
    if (typeof showToast === "function") {
      showToast(`Could not open instructions for ${appName}`);
    }
  }
}

function saveBlob(blob, filename, triggerButton = null) {
  return handleSpatialFileShare(null, blob, filename, triggerButton);
}

function switchBaseMap(baseMapId) {
    return applyBaseMap(baseMapId, { state, updateStyles: updateAllFeatureStyles });
}

// ──────────────────────────────────────────────────────────────
// Headless offscreen MapLibre renderer for PDF / TIFF exports
// No dependency on the on-screen map DOM or state.map
// ──────────────────────────────────────────────────────────────

const ESRI_TOPO_TILE_URL_PRINT = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
const OFFSCREEN_MAP_WIDTH = 3800;
const OFFSCREEN_MAP_HEIGHT = 2500;
const LAYOUT_WIDTH = 4000;
const LAYOUT_HEIGHT = 3000;

/**
 * Fast & exact Pole of Inaccessibility (Polylabel) algorithm.
 * Finds the most distant internal point from the polygon outline (maximum clearance from all borders).
 * Guaranteed to place labels in the widest, most spacious part of any polygon (even concave/complex).
 */
function polylabel(polygon, precision = 0.0005) {
    const outerRing = polygon[0];
    if (!outerRing || outerRing.length < 3) return null;

    // Bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < outerRing.length; i++) {
        const p = outerRing[i];
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const cellSize = Math.min(width, height);
    const h = cellSize / 2;

    if (cellSize === 0) return [minX, minY];

    // Signed distance from point to polygon (positive if inside, negative if outside)
    function pointToPolygonDist(px, py) {
        let inside = false;
        let minDistSq = Infinity;

        for (let k = 0; k < polygon.length; k++) {
            const ring = polygon[k];
            for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
                const a = ring[i];
                const b = ring[j];

                if ((a[1] > py !== b[1] > py) &&
                    (px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0])) {
                    inside = !inside;
                }

                // Distance to segment [a, b]
                let dx = b[0] - a[0];
                let dy = b[1] - a[1];
                let distSq;
                if (dx === 0 && dy === 0) {
                    distSq = (px - a[0]) ** 2 + (py - a[1]) ** 2;
                } else {
                    const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)));
                    const projX = a[0] + t * dx;
                    const projY = a[1] + t * dy;
                    distSq = (px - projX) ** 2 + (py - projY) ** 2;
                }

                if (distSq < minDistSq) minDistSq = distSq;
            }
        }

        const dist = Math.sqrt(minDistSq);
        return inside ? dist : -dist;
    }

    // Cell object constructor
    function createCell(x, y, h) {
        const d = pointToPolygonDist(x, y);
        return {
            x: x,
            y: y,
            h: h,
            d: d,
            max: d + h * Math.SQRT2
        };
    }

    // Priority queue of cells
    const cellQueue = [];
    
    // Initial best cell at centroid
    let sumX = 0, sumY = 0, totalPts = outerRing.length;
    for (let i = 0; i < totalPts; i++) {
        sumX += outerRing[i][0];
        sumY += outerRing[i][1];
    }
    let bestCell = createCell(sumX / totalPts, sumY / totalPts, 0);

    // Initial grid of cells covering the bbox
    for (let x = minX; x < maxX; x += cellSize) {
        for (let y = minY; y < maxY; y += cellSize) {
            const cell = createCell(x + h, y + h, h);
            cellQueue.push(cell);
            if (cell.d > bestCell.d) bestCell = cell;
        }
    }

    // Sort descending by max potential
    cellQueue.sort((a, b) => b.max - a.max);

    // Subdivide and search
    let iter = 0;
    while (cellQueue.length > 0 && iter < 1000) {
        iter++;
        const cell = cellQueue.shift();

        if (cell.d > bestCell.d) {
            bestCell = cell;
        }

        // Stop if cell's max potential cannot beat bestCell
        if (cell.max - bestCell.d <= precision) continue;

        // Subdivide cell into 4 smaller cells
        const subH = cell.h / 2;
        const sub1 = createCell(cell.x - subH, cell.y - subH, subH);
        const sub2 = createCell(cell.x + subH, cell.y - subH, subH);
        const sub3 = createCell(cell.x - subH, cell.y + subH, subH);
        const sub4 = createCell(cell.x + subH, cell.y + subH, subH);

        [sub1, sub2, sub3, sub4].forEach(sub => {
            if (sub.max > bestCell.d) {
                // Insert into sorted queue
                let inserted = false;
                for (let i = 0; i < cellQueue.length; i++) {
                    if (sub.max > cellQueue[i].max) {
                        cellQueue.splice(i, 0, sub);
                        inserted = true;
                        break;
                    }
                }
                if (!inserted) cellQueue.push(sub);
            }
        });
    }

    return [bestCell.x, bestCell.y];
}

/**
 * Helper to compute the most spacious interior point for a GeoJSON feature (maximum border clearance).
 */
function getFeatureCenter(feature) {
    if (!feature || !feature.geometry) return null;
    const geom = feature.geometry;
    if (geom.type === "Point") return geom.coordinates;

    const polygons = geom.type === "Polygon" ? [geom.coordinates] : 
                     (geom.type === "MultiPolygon" ? geom.coordinates : []);
    
    if (polygons.length === 0) return null;

    // Pick the polygon with largest bbox area if MultiPolygon
    let mainPoly = polygons[0];
    if (polygons.length > 1) {
        let maxBboxArea = 0;
        polygons.forEach(p => {
            if (p[0] && p[0].length >= 3) {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                p[0].forEach(c => {
                    if (c[0] < minX) minX = c[0];
                    if (c[1] < minY) minY = c[1];
                    if (c[0] > maxX) maxX = c[0];
                    if (c[1] > maxY) maxY = c[1];
                });
                const area = (maxX - minX) * (maxY - minY);
                if (area > maxBboxArea) {
                    maxBboxArea = area;
                    mainPoly = p;
                }
            }
        });
    }

    return polylabel(mainPoly);
}

/**
 * Create a headless offscreen MapLibre GL instance, render Esri Topo tiles
 * with optional zone polygon overlays, and return a standalone canvas copy + zone label positions.
 */
async function renderHeadlessMap(bounds, geojsonOverlay = null, maxZoom = 18) {
    const container = document.createElement("div");
    container.style.cssText = `
        position: fixed; left: -9999px; top: 0;
        width: ${OFFSCREEN_MAP_WIDTH}px; height: ${OFFSCREEN_MAP_HEIGHT}px;
        z-index: -99999; visibility: hidden; pointer-events: none;
    `;
    document.body.appendChild(container);

    try {
        const style = {
            version: 8,
            sources: {
                "esri-topo": {
                    type: "raster",
                    tiles: [ESRI_TOPO_TILE_URL_PRINT],
                    tileSize: 256,
                    maxzoom: 18
                }
            },
            layers: [
                { id: "esri-topo-layer", type: "raster", source: "esri-topo" }
            ]
        };

        const offscreenMap = new maplibregl.Map({
            container: container,
            style: style,
            preserveDrawingBuffer: true,
            interactive: false,
            attributionControl: false,
            maxZoom: 20,
            minZoom: 0
        });

        await new Promise((resolve) => {
            offscreenMap.on("load", resolve);
            offscreenMap.on("error", (e) => {
                console.warn("Offscreen map error:", e);
                resolve();
            });
            setTimeout(resolve, 5000);
        });

        if (geojsonOverlay) {
            try {
                offscreenMap.addSource("zone-polygons", {
                    type: "geojson",
                    data: geojsonOverlay
                });
                offscreenMap.addLayer({
                    id: "zone-polygons-outline",
                    type: "line",
                    source: "zone-polygons",
                    paint: {
                        "line-color": "#dc2626",
                        "line-width": 4.5,
                        "line-opacity": 0.9
                    }
                });
            } catch (e) {
                console.warn("Could not add zone polygon overlay:", e);
            }
        }

        offscreenMap.fitBounds(bounds, { padding: 180, maxZoom: maxZoom, animate: false });

        await new Promise((resolve) => {
            let checkCount = 0;
            const checkIdle = () => {
                checkCount++;
                if (offscreenMap.areTilesLoaded() || checkCount > 40) {
                    offscreenMap.off("idle", checkIdle);
                    resolve();
                }
            };
            offscreenMap.on("idle", checkIdle);
            offscreenMap.triggerRepaint();
            setTimeout(resolve, 4000);
        });

        // Project zone / circle centers to pixel coordinates before destroying map
        const zoneLabels = [];
        if (geojsonOverlay && Array.isArray(geojsonOverlay.features)) {
            geojsonOverlay.features.forEach(f => {
                const props = f.properties || {};
                let label = "";
                let isCircle = false;
                if (props.cid) {
                    label = String(props.cid);
                    isCircle = true;
                } else if (props.zid) {
                    label = typeof displayZoneId === "function" ? displayZoneId(props.zid) : String(props.zid);
                } else if (props.name) {
                    label = String(props.name);
                }

                if (!label) return;

                const center = getFeatureCenter(f);
                if (center) {
                    try {
                        const pt = offscreenMap.project(center);
                        if (pt && typeof pt.x === "number" && typeof pt.y === "number") {
                            zoneLabels.push({
                                label: label,
                                x: pt.x,
                                y: pt.y,
                                isCircle: isCircle
                            });
                        }
                    } catch (e) {}
                }
            });
        }

        const mapCanvas = offscreenMap.getCanvas();
        const resultCanvas = document.createElement("canvas");
        resultCanvas.width = mapCanvas.width;
        resultCanvas.height = mapCanvas.height;
        const resultCtx = resultCanvas.getContext("2d");
        resultCtx.drawImage(mapCanvas, 0, 0);

        offscreenMap.remove();
        return { canvas: resultCanvas, zoneLabels: zoneLabels };
    } finally {
        if (container.parentNode) {
            container.parentNode.removeChild(container);
        }
    }
}

/**
 * Render a full cartographic print layout canvas using a headless offscreen MapLibre instance.
 * Completely independent of the on-screen map.
 * @returns {Promise<HTMLCanvasElement>} The final 4000×3000 layout canvas
 */
async function renderMapLayoutCanvas() {
    const allFeatures = state.allFeatures || [];
    const featureId = state.currentId;
    const featureName = state.currentFeature || "eugene";
    const isCircles = state.isCirclesFeature;
    const qrUrl = window.location.href;

    const isCircle = !featureId || featureId === CIRCLE_ID;
    let targetFeature = null;
    if (!isCircle) {
        targetFeature = allFeatures.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === featureId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(featureId));
        });
    }

    const targetBounds = (isCircle || !targetFeature)
        ? getBbox(allFeatures)
        : getBbox([targetFeature]);

    const overlayGeojson = {
        type: "FeatureCollection",
        features: allFeatures.filter(f => f.geometry)
    };

    const maxZoom = (isCircle || !targetFeature) ? 20 : 18;
    const { canvas: mapCanvas, zoneLabels } = await renderHeadlessMap(targetBounds, overlayGeojson, maxZoom);

    const layoutCanvas = document.createElement("canvas");
    const width = LAYOUT_WIDTH;
    const height = LAYOUT_HEIGHT;
    layoutCanvas.width = width;
    layoutCanvas.height = height;
    const ctx = layoutCanvas.getContext("2d");

    // 1. Outer white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // 2. Define inner map frame layout box (4000×3000 scaled)
    const mapMargin = 100;
    const headerHeight = 180;
    const footerHeight = 120;

    const mapX = mapMargin;
    const mapY = mapMargin + headerHeight;
    const mapW = width - (mapMargin * 2);
    const mapH = height - mapY - footerHeight - mapMargin;

    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(mapX, mapY, mapW, mapH);

    if (mapCanvas) {
        try {
            ctx.drawImage(mapCanvas, mapX, mapY, mapW, mapH);
        } catch (err) {
            console.warn("Could not draw map canvas:", err);
        } finally {
            try {
                mapCanvas.width = 0;
                mapCanvas.height = 0;
            } catch (e) {}
        }
    }

    // Draw red zone / circle labels directly (no circle background)
    if (zoneLabels && zoneLabels.length > 0) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        zoneLabels.forEach(({ label, x, y, isCircle }) => {
            const canvasX = mapX + x;
            const canvasY = mapY + y;

            // Only render label if inside the map boundary with margin
            if (canvasX >= mapX + 35 && canvasX <= mapX + mapW - 35 &&
                canvasY >= mapY + 35 && canvasY <= mapY + mapH - 35) {

                if (isCircle) {
                    // Count circle regional labels (e.g. Eugene, Florence, Oakridge, Cottage Grove)
                    const text = label;
                    ctx.font = "bold 52px system-ui, -apple-system, sans-serif";
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 10;
                    ctx.lineJoin = "round";
                    ctx.strokeText(text, canvasX, canvasY);
                    ctx.fillStyle = "#dc2626";
                    ctx.fillText(text, canvasX, canvasY);
                } else {
                    // Survey zone number labels (e.g. 1, 06, 14A)
                    const fontSize = label.length > 2 ? 40 : 48;
                    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;

                    // White text halo outline for contrast over terrain contours
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 8;
                    ctx.lineJoin = "round";
                    ctx.strokeText(label, canvasX, canvasY);

                    // Bold red zone number text
                    ctx.fillStyle = "#dc2626";
                    ctx.fillText(label, canvasX, canvasY);
                }
            }
        });
        ctx.restore();
    }

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.strokeRect(mapX, mapY, mapW, mapH);

    // 3. Header Typography
    const hasSpecificZone = featureId && featureId !== CIRCLE_ID;

    ctx.fillStyle = "#111827";
    ctx.font = "bold 76px system-ui, -apple-system, sans-serif";
    const headerTitleText = isCircles
        ? "COAST TO CASCADES BIRD ALLIANCE"
        : (featureName === "florence" ? "FLORENCE CHRISTMAS BIRD COUNT" : "EUGENE CHRISTMAS BIRD COUNT");
    ctx.fillText(headerTitleText, mapMargin, mapMargin + 75);

    if (hasSpecificZone) {
        ctx.fillStyle = "#dc2626";
        ctx.font = "bold 50px system-ui, -apple-system, sans-serif";
        const subTitleText = `SURVEY ZONE ${displayZoneId(featureId)}`;
        ctx.fillText(subTitleText, mapMargin, mapMargin + 150);
    }

    ctx.fillStyle = "#374151";
    ctx.font = "44px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";
    const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    ctx.fillText(dateStr, mapMargin + mapW, mapMargin + 75);
    ctx.font = "34px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.fillText("Base Map: Esri World Topography", mapMargin + mapW, mapMargin + 140);
    ctx.textAlign = "left";

    // 4. Overlays
    // North Arrow
    const naX = mapX + mapW - 125;
    const naY = mapY + 140;
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.beginPath();
    ctx.arc(naX, naY, 66, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.moveTo(naX, naY - 46);
    ctx.lineTo(naX + 20, naY + 13);
    ctx.lineTo(naX, naY + 3);
    ctx.fill();

    ctx.fillStyle = "#9ca3af";
    ctx.beginPath();
    ctx.moveTo(naX, naY - 46);
    ctx.lineTo(naX - 20, naY + 13);
    ctx.lineTo(naX, naY + 3);
    ctx.fill();

    ctx.fillStyle = "#111827";
    ctx.font = "bold 33px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("N", naX, naY - 53);
    ctx.restore();

    // Scale Bar
    const scaleInfo = getLayoutScaleBar(targetBounds, mapW);

    const barX = mapX + 50;
    const barY = mapY + mapH - 165;
    const barW = Math.max(430, scaleInfo.pxWidth + 100);
    const barH = 115;

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3.5;
    ctx.strokeRect(barX, barY, barW, barH);

    const lineStartX = barX + 50;
    const lineEndX = lineStartX + scaleInfo.pxWidth;
    const lineY = barY + 75;

    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(lineStartX, lineY);
    ctx.lineTo(lineEndX, lineY);
    ctx.moveTo(lineStartX, lineY - 13);
    ctx.lineTo(lineStartX, lineY + 13);
    ctx.moveTo(lineEndX, lineY - 13);
    ctx.lineTo(lineEndX, lineY + 13);
    const midX = (lineStartX + lineEndX) / 2;
    ctx.moveTo(midX, lineY - 8);
    ctx.lineTo(midX, lineY + 8);
    ctx.stroke();

    ctx.fillStyle = "#111827";
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("0", lineStartX, lineY - 20);
    ctx.fillText(`${scaleInfo.miles} mi`, lineEndX, lineY - 20);
    ctx.textAlign = "left";

    // QR Code
    const qrX = mapX + mapW - 290;
    const qrY = mapY + mapH - 315;
    const qrBoxW = 250;
    const qrBoxH = 275;

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillRect(qrX, qrY, qrBoxW, qrBoxH);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3.5;
    ctx.strokeRect(qrX, qrY, qrBoxW, qrBoxH);

    let qrDrawn = false;
    if (typeof QRCode !== "undefined") {
        try {
            const qrContainer = document.createElement("div");
            new QRCode(qrContainer, {
                text: qrUrl,
                width: 200,
                height: 200,
                correctLevel: QRCode.CorrectLevel.M
            });
            const qrCanvas = qrContainer.querySelector("canvas");
            const qrImg = qrContainer.querySelector("img");
            if (qrCanvas) {
                ctx.drawImage(qrCanvas, qrX + 25, qrY + 20, 200, 200);
                qrDrawn = true;
            } else if (qrImg && qrImg.complete) {
                ctx.drawImage(qrImg, qrX + 25, qrY + 20, 200, 200);
                qrDrawn = true;
            }
        } catch (e) {
            console.warn("QRCode generation error:", e);
        }
    }

    if (!qrDrawn) {
        const qrImage = await loadQrCodeImage(qrUrl);
        if (qrImage) {
            ctx.drawImage(qrImage, qrX + 25, qrY + 20, 200, 200);
        }
    }

    ctx.fillStyle = "#111827";
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("SCAN FOR ONLINE MAP", qrX + (qrBoxW / 2), qrY + 252);
    ctx.textAlign = "left";

    // 5. Footer Text
    const footY = height - footerHeight - mapMargin + 30;

    ctx.fillStyle = "#374151";
    ctx.font = "31px system-ui, sans-serif";
    const bbox = getBbox(allFeatures);
    const boundsText = `Spatial Extent (WGS84): [${bbox[0][0].toFixed(4)}°W, ${bbox[0][1].toFixed(4)}°N] to [${bbox[1][0].toFixed(4)}°W, ${bbox[1][1].toFixed(4)}°N]`;
    ctx.fillText(boundsText, mapMargin, footY + 40);

    ctx.fillStyle = "#6b7280";
    ctx.font = "26px system-ui, sans-serif";
    ctx.fillText("Printed with Fovea | Esri World Topographic Basemap © Esri, DeLorme, NAVTEQ", mapMargin, footY + 86);

    return layoutCanvas;
}

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

function scheduleDownloadViewPreload() {
    cancelDownloadViewPreload();
    downloadViewPreloadTimer = setTimeout(() => {
        downloadViewPreloadTimer = null;
        preloadMapLayout();
    }, DOWNLOAD_VIEW_PRELOAD_DELAY_MS);
}

function cancelDownloadViewPreload() {
    if (downloadViewPreloadTimer) {
        clearTimeout(downloadViewPreloadTimer);
        downloadViewPreloadTimer = null;
    }
}

const scheduleSelectionPreload = scheduleDownloadViewPreload;
const cancelSelectionPreload = cancelDownloadViewPreload;

function getRasterCacheKey() {
    const cid = state.currentFeature || "eugene";
    const zid = state.currentId;
    const isCirc = state.isCirclesFeature;
    return `${cid}:${zid || "full"}:${isCirc ? "circles" : "zone"}`;
}

function disposeRasterCache() {
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

function preloadMapLayout() {
    cancelSelectionPreload();
    const key = getRasterCacheKey();
    const now = Date.now();

    if (activeRasterCache.key === key && (now - activeRasterCache.createdAt < RASTER_CACHE_TTL_MS)) {
        if (activeRasterCache.promise) return activeRasterCache.promise;
        if (activeRasterCache.canvas) return Promise.resolve(activeRasterCache.canvas);
    }

    disposeRasterCache();

    activeRasterCache.key = key;
    activeRasterCache.createdAt = now;

    const renderPromise = renderMapLayoutCanvas()
        .then(canvas => {
            if (activeRasterCache.key === key) {
                activeRasterCache.canvas = canvas;
                activeRasterCache.promise = null;
                activeRasterCache.timerId = setTimeout(disposeRasterCache, RASTER_CACHE_TTL_MS);
            } else {
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

async function getOrRenderLayoutCanvas() {
    const key = getRasterCacheKey();
    const now = Date.now();

    if (activeRasterCache.key === key && (now - activeRasterCache.createdAt < RASTER_CACHE_TTL_MS)) {
        if (activeRasterCache.canvas) return activeRasterCache.canvas;
        if (activeRasterCache.promise) return await activeRasterCache.promise;
    }

    return await preloadMapLayout();
}

async function downloadGeoPdf(triggerButton = null) {
    const key = getRasterCacheKey();
    const isReady = activeRasterCache.key === key && !!activeRasterCache.canvas;
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
    const key = getRasterCacheKey();
    const isReady = activeRasterCache.key === key && !!activeRasterCache.canvas;
    if (!isReady) {
        showToast("Rendering map layout...");
    }

    const canvas = await getOrRenderLayoutCanvas();
    const filename = getActiveDownloadFilename("tif");
    const tiffBlob = canvasToTiffBlob(canvas);
    await handleSpatialFileShare(null, tiffBlob, filename, triggerButton);
    showToast(`Exported ${filename}`);
}

function getInitialIdFromUrl() {
    const route = parseMapRoute(window.location.search, CIRCLE_ID);
    state.currentFeature = route.currentFeature;
    state.isCirclesFeature = route.isCirclesFeature;
    return route.initialId;
}

function updateUrl(id) {
    const url = new URL(window.location.href);
    const targetFeature = findFeatureByZoneId(state.allFeatures, id);
    const selectedId = targetFeature?.properties?.zid || id;
    url.search = serializeMapRoute(url.search, {
        currentFeature: state.currentFeature,
        isCirclesFeature: state.isCirclesFeature,
        id: selectedId,
        circleId: CIRCLE_ID,
        displayZoneId
    });
    window.history.replaceState({}, "", url.toString());
}

function updateControlPositions() {
    if (!state.map) return;
    updateMapControlPositions({ documentObject: document, isMobile: window.innerWidth <= 768 });
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

const EBIRD_SPECIES_CODES = {
    "Black Oystercatcher": "blkoys",
    "American Dipper": "amedip",
    "Peregrine Falcon": "perfal",
    "Northern Pygmy-Owl": "nopowl",
    "Surfbird": "surfbi",
    "Black Turnstone": "blkturn",
    "Alcids (Murres, Guillemots, Murrelets)": "comorc",
    "Alcids (Murres, Guillemots, Auklets)": "comorc",
    "Canada Jay": "gryjay",
    "Hutton's Vireo": "hutvir",
    "Townsend's Warbler": "towwar",
    "Swamp Sparrow": "swaspa",
    "Lincoln's Sparrow": "linspa",
    "Greater / Lesser Scaup": "scaup1",
    "Greater & Lesser Scaup": "scaup1",
    "Greater Scaup": "gresca",
    "Lesser Scaup": "lessca",
    "Snowy Plover": "snoplo5",
    "Lapland Longspur": "laplon",
    "Snow Bunting": "snobun",
    "Virginia Rail": "virrai",
    "Sora": "sora",
    "Virginia Rail & Sora": "virrai",
    "Mountain Quail": "mouqua",
    "Ruffed Grouse": "rufgro",
    "Northern Shrike": "norshr4",
    "Red-shouldered Hawk": "reshaw",
    "Merlin": "merlin",
    "American Pipit": "amepip",
    "Western Bluebird": "wesblu",
    "Townsend's Solitaire": "towsol",
    "Evening Grosbeak": "evegro",
    "Red Crossbill": "redcro",
    "Brown Creeper": "brocre",
    "Marsh Wren": "marwre",
    "Geese": "cangoo",
    "Canvasback": "canvas",
    "Redhead": "redhea",
    "Ruddy Duck": "rudduc",
    "Eurasian Wigeon": "eurwig",
    "Greater Yellowlegs": "greyel",
    "Long-billed Dowitcher": "lobdow",
    "American Kestrel": "amekes",
    "Black Scoter": "blksco2",
    "Surf Scoter": "sursco",
    "White-winged Scoter": "whwsco2",
    "Harlequin Duck": "harduc",
    "Long-tailed Duck": "lotduc",
    "Sanderling": "sander",
    "Red Phalarope": "redpha1",
    "Black-legged Kittiwake": "bklkit",
    "Northern Fulmar": "norful",
    "Bonaparte's Gull": "bongul",
    "Shearwaters": "shtshe",
    "Horned Grebe": "horgre",
    "Red-breasted Merganser": "rebmer",
    "Herring Gull": "hergul",
    "Iceland (Thayer's) Gull": "thagul",
    "California Gull": "calgul",
    "Mourning Dove": "moudov",
    "Eurasian Collared-Dove": "eucdov",
    "Palm Warbler": "palwar",
    "Killdeer": "killde",
    "California Scrub-Jay": "casjay",
    "Western Meadowlark": "wesmea",
    "Red-breasted Sapsucker": "rebsap",
    "Accipiters (Sharp-shinned / Cooper's)": "coohaw",
    "White-throated Sparrow": "whtspa",
    "Purple Finch": "purfin",
    "Pine Siskin": "pinsis",
    "Common Merganser": "commer",
    "Wood Duck": "wooduc",
    "Wilson's Snipe": "wilsni1",
    "White-tailed Kite": "whtkit",
    "Bald Eagle": "baleag",
    "Barn Owl": "brnowl",
    "Black Phoebe": "blkpho",
    "American Wigeon": "amewig",
    "Anna's Hummingbird": "annhum",
    "Orange-crowned Warbler": "orcwar",
    "Cedar Waxwing": "cedwax",
    "Lesser Goldfinch": "lesgol",
    "American Bittern": "amebit",
    "Savannah Sparrow": "savspa",
    "Pileated Woodpecker": "pilwoo",
    "Least Sandpiper": "leasan",
    "Spotted Sandpiper": "sposan",
    "Western Sandpiper": "wessan",
    "Great Egret": "greegr",
    "Tundra Swan": "tunswa",
    "Small Songbird Flocks": "pinsis",
    "Short-eared Owl": "sheowl",
    "Cackling Goose": "cacgoo1",
    "Ring-billed Gull": "ribgul"
};

function getEbirdUrl(birdName) {
    if (!birdName) return "https://ebird.org/explore";
    const code = EBIRD_SPECIES_CODES[birdName] || EBIRD_SPECIES_CODES[birdName.trim()];
    if (code) {
        return `https://ebird.org/species/${code}`;
    }
    return `https://ebird.org/species/${encodeURIComponent(birdName.toLowerCase().replace(/[^a-z0-9]/g, ""))}`;
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

function getCleanTaxonName(birdName) {
    if (!birdName) return "";
    let clean = birdName.trim();
    if (clean.includes("(")) clean = clean.split("(")[0].trim();
    if (clean.includes("&")) clean = clean.split("&")[0].trim();
    if (clean.includes("/")) clean = clean.split("/")[0].trim();
    return clean || birdName;
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
        const [[swlng, swlat], [nelng, nelat]] = bbox;
        const cleanName = getCleanTaxonName(birdName);
        const encodedName = encodeURIComponent(cleanName);
        let url = `https://api.inaturalist.org/v1/observations?taxon_name=${encodedName}&nelat=${nelat}&nelng=${nelng}&swlat=${swlat}&swlng=${swlng}&per_page=100&order=desc&order_by=observed_on`;

        let resp = await fetch(url);
        let data = resp.ok ? await resp.json() : null;

        if (!data || !data.results || data.results.length === 0) {
            url = `https://api.inaturalist.org/v1/observations?q=${encodedName}&nelat=${nelat}&nelng=${nelng}&swlat=${swlat}&swlng=${swlng}&per_page=100&order=desc&order_by=observed_on`;
            const fallbackResp = await fetch(url);
            if (fallbackResp.ok) {
                const fallbackData = await fallbackResp.json();
                if (fallbackData && fallbackData.results && fallbackData.results.length > 0) {
                    data = fallbackData;
                }
            }
        }

        if (!data) throw new Error("Failed to fetch observations");

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
            try {
                const taxonResp = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodedName}`);
                if (taxonResp.ok) {
                    const taxonData = await taxonResp.json();
                    if (taxonData && taxonData.results && taxonData.results.length > 0) {
                        const defaultPhoto = taxonData.results[0].default_photo;
                        if (defaultPhoto) {
                            featuredPhotoUrl = (defaultPhoto.medium_url || defaultPhoto.url || "").replace("square", "large").replace("medium", "large");
                            photoCredit = defaultPhoto.attribution || "Photo via iNaturalist";
                        }
                    }
                }
            } catch (e) {}
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
        const isFlorence = state.currentFeature === "florence";
        imgSrc = zoneImagePath(props.zid);
        imgAlt = `Zone ${zid} Image`;
        descText = getZoneDescription(targetFeature, isFlorence);
    }

    overviewEl.innerHTML = `
        <div class="sidebar-about-content">
            <!-- Description at Top -->
            <p class="sidebar-about-text">${descText}</p>

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

function selectMapStyleByIndex(index) {
    if (!state.baseMapsList || state.baseMapsList.length === 0 || !state.map) return;
    if (index < 0 || index >= state.baseMapsList.length) return;

    const targetItem = state.baseMapsList[index];
    state.baseMapsList.forEach(item => {
        if (item === targetItem) {
            if (!state.map.hasLayer(item.layer)) {
                state.map.addLayer(item.layer);
            }
        } else {
            if (state.map.hasLayer(item.layer)) {
                state.map.removeLayer(item.layer);
            }
        }
    });

    const layersControlEl = document.querySelector('.map-ctrl-styles');
    if (layersControlEl) {
        const inputs = layersControlEl.querySelectorAll('input[type="radio"]');
        if (inputs && inputs[index]) {
            inputs[index].checked = true;
        }
    }

    showToast(`Map Style: ${targetItem.name}`);
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

function toggleFullscreen() {
    const mapWrapper = document.getElementById("map-wrapper");
    if (!mapWrapper) return;

    const handleResize = () => {
        if (state.map) {
            state.map.invalidateSize();
            setTimeout(() => state.map.invalidateSize(), 50);
            setTimeout(() => state.map.invalidateSize(), 200);
            setTimeout(() => state.map.invalidateSize(), 400);
        }
    };

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

    if (!document.fullscreenElement && !mapWrapper.classList.contains("is-fullscreen")) {
        if (mapWrapper.requestFullscreen) {
            mapWrapper.requestFullscreen().catch(() => {
                mapWrapper.classList.add("is-fullscreen");
                handleResize();
            });
        } else {
            mapWrapper.classList.add("is-fullscreen");
            handleResize();
        }
    } else {
        if (document.exitFullscreen && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {
                mapWrapper.classList.remove("is-fullscreen");
                triggerMobileHomeAnimation();
                handleResize();
            });
        } else {
            mapWrapper.classList.remove("is-fullscreen");
            triggerMobileHomeAnimation();
        }
    }
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
function setupProximityGlowCanvas() {
    if (state._glowCanvasAttached) return;
    state._glowCanvasAttached = true;

    const mapCanvas = state.map.getCanvas();
    const container = document.getElementById('tile-map');

    const glowCanvas = document.createElement('canvas');
    glowCanvas.id = 'map-glow-canvas';
    glowCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;';
    container.appendChild(glowCanvas);

    const ctx = glowCanvas.getContext('2d');
    const RADIUS = 240; // CSS px — radial gradient falloff
    let cx = -9999, cy = -9999;
    let rafPending = false;
    let ditherPattern = null;

    function getDitherPattern() {
        if (ditherPattern) return ditherPattern;
        const nCanvas = document.createElement('canvas');
        nCanvas.width = 128;
        nCanvas.height = 128;
        const nCtx = nCanvas.getContext('2d');
        const imgData = nCtx.createImageData(128, 128);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = Math.floor((Math.random() - 0.5) * 45);
            const val = Math.min(255, Math.max(0, 128 + noise));
            data[i] = val;     // R
            data[i+1] = val;   // G
            data[i+2] = val;   // B
            data[i+3] = 18;    // ~7% dither alpha
        }
        nCtx.putImageData(imgData, 0, 0);
        ditherPattern = ctx.createPattern(nCanvas, 'repeat');
        return ditherPattern;
    }

    function syncSize() {
        const rect = mapCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        const physicalW = Math.round(w * dpr);
        const physicalH = Math.round(h * dpr);
        if (glowCanvas.width !== physicalW || glowCanvas.height !== physicalH) {
            glowCanvas.width = physicalW;
            glowCanvas.height = physicalH;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawGlow() {
        syncSize();
        const rect = mapCanvas.getBoundingClientRect();
        const w = Math.round(rect.width), h = Math.round(rect.height);
        ctx.clearRect(0, 0, w, h);
        if (window.innerWidth <= 768 || cx < 0 || !state.allFeatures?.length) return;

        // Smooth zoom fade out between zoom 11.5 and 14.0
        const currentZoom = state.map ? state.map.getZoom() : 10;
        if (currentZoom >= 14.0) return;
        const zoomFadeAlpha = currentZoom <= 11.5 ? 1.0 : Math.max(0, 1 - (currentZoom - 11.5) / 2.5);

        const isLight = state.currentBaseLayer === 'esri-street' || state.currentBaseLayer === 'esri-topo';
        const lineAlpha = (isLight ? 0.45 : 0.45) * zoomFadeAlpha;
        const lineColor = isLight ? `rgba(0, 0, 0, ${lineAlpha.toFixed(3)})` : `rgba(255, 255, 255, ${lineAlpha.toFixed(3)})`;
        const lineW = isLight ? 2.8 : 0.9;

        // --- Pass 1: Radial Fill Gradient clipped to currently hovered feature polygon ---
        const activeHoverId = state._hoveredFeatureId;
        if (activeHoverId) {
            const feat = state.allFeatures.find(f => {
                const props = f.properties || {};
                const idKey = state.isCirclesFeature ? String(props.cid || '') : String(props.zid || '');
                return idKey === String(activeHoverId) || String(f.id) === String(activeHoverId);
            });
            if (feat && !isFeatureSelected(feat)) {
                ctx.save();
                ctx.beginPath();
                _drawFeaturePath(feat);
                ctx.clip(); // Mask strictly to hovered feature boundary

                const fillRadius = 340; // px — radial spotlight radius
                const fillGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, fillRadius);
                const maxAlpha = (isLight ? 0.15 : 0.15) * zoomFadeAlpha;
                const numStops = 12;

                for (let i = 0; i <= numStops; i++) {
                    const step = i / numStops;
                    // Exponential perceptual ease-out curve to smooth color steps
                    const alpha = maxAlpha * Math.pow(1 - step, 2.2);
                    const colorStr = isLight ? `rgba(0, 0, 0, ${alpha.toFixed(4)})` : `rgba(255, 255, 255, ${alpha.toFixed(4)})`;
                    fillGrad.addColorStop(step, colorStr);
                }

                ctx.fillStyle = fillGrad;
                ctx.fillRect(0, 0, w, h);

                // --- Apply Noise Dithering to eliminate all visible band lines ---
                const pattern = getDitherPattern();
                if (pattern) {
                    ctx.globalCompositeOperation = 'overlay';
                    ctx.fillStyle = pattern;
                    ctx.fillRect(0, 0, w, h);
                    ctx.globalCompositeOperation = 'source-over';
                }

                ctx.restore();
            }
        }

        // --- Pass 2: Line Outline Proximity Glow ---
        ctx.save();

        // Draw crisp line matching exact regular map line thickness
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineW;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        _drawAllRings();
        ctx.stroke();

        // --- Mask: keep only line pixels within cursor radius ---
        ctx.globalCompositeOperation = 'destination-in';
        const t = cx, u = cy;
        const grad = ctx.createRadialGradient(t, u, 0, t, u, RADIUS);
        // Smoothstep-ish stops for a natural gradient feel
        grad.addColorStop(0,    'rgba(0,0,0,1)');
        grad.addColorStop(0.45, 'rgba(0,0,0,0.95)');
        grad.addColorStop(0.75, 'rgba(0,0,0,0.5)');
        grad.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.restore();
    }

    function isFeatureSelected(feat) {
        if (!feat || !state.currentId || state.currentId === CIRCLE_ID) return false;
        const props = feat.properties || {};
        const key = state.isCirclesFeature ? String(props.cid || '') : String(props.zid || '');
        return key === state.currentId || normalizeZoneId(key) === normalizeZoneId(state.currentId);
    }

    function _drawFeaturePath(feat) {
        const geom = feat?.geometry;
        if (!geom) return;
        const polys = geom.type === 'Polygon'      ? [geom.coordinates]
                    : geom.type === 'MultiPolygon' ? geom.coordinates
                    : [];
        polys.forEach(poly => {
            poly.forEach(ring => {
                ring.forEach((coord, i) => {
                    const p = state.map.project(coord);
                    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
            });
        });
    }

    function _drawAllRings() {
        state.allFeatures.forEach(feat => {
            if (!isFeatureSelected(feat)) {
                _drawFeaturePath(feat);
            }
        });
    }

    function scheduleRedraw() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; drawGlow(); });
    }

    mapCanvas.addEventListener('mousemove', (e) => {
        if (window.innerWidth <= 768) return;
        const rect = mapCanvas.getBoundingClientRect();
        cx = e.clientX - rect.left;
        cy = e.clientY - rect.top;
        scheduleRedraw();
    });

    mapCanvas.addEventListener('mouseleave', () => {
        cx = -9999; cy = -9999;
        scheduleRedraw();
    });

    // Redraw when map pans/zooms so lines stay aligned
    state.map.on('render', () => { if (cx >= 0) scheduleRedraw(); });
}

// HTML label overlay — repositions div labels on every map render
function updateLabelZoomVisibility() {
    rebuildHtmlLabels();
}

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

const MAP_VIEWER_APPS = [
    {
        name: "Avenza Maps",
        aliases: ["avenza", "avenzamaps"],
        formats: ["geopdf", "geotiff", "kmz", "gpx"]
    },
    {
        name: "OsmAnd Maps",
        aliases: ["osmand", "osmandmaps", "osmand+"],
        formats: ["gpx", "geojson", "kmz"]
    },
    {
        name: "Gaia GPS",
        aliases: ["gaia", "gaiagps"],
        formats: ["gpx", "kmz", "geojson"]
    },
    {
        name: "AllTrails",
        aliases: ["alltrails", "all trails"],
        formats: ["gpx", "kmz"]
    },
    {
        name: "CalTopo",
        aliases: ["caltopo", "sarsoft"],
        formats: ["gpx", "kmz", "geopdf", "geojson"]
    },
    {
        name: "onX Maps",
        aliases: ["onx", "onxhunt", "onxoffroad", "onxmaps"],
        formats: ["gpx", "kmz"]
    },
    {
        name: "Google Earth",
        aliases: ["google earth", "googleearth", "earth"],
        formats: ["kmz", "geojson"]
    },
    {
        name: "QGIS",
        aliases: ["qgis", "quantum gis"],
        formats: ["geojson", "kmz", "gpx", "geopdf", "geotiff"]
    },
    {
        name: "ArcGIS / Field Maps",
        aliases: ["arcgis", "esri", "field maps"],
        formats: ["geojson", "geopdf", "geotiff", "kmz", "gpx"]
    },
    {
        name: "Garmin Explore / BaseCamp",
        aliases: ["garmin", "basecamp", "garmin explore"],
        formats: ["gpx", "kmz"]
    },
    {
        name: "Locus Map",
        aliases: ["locus", "locusmap"],
        formats: ["gpx", "kmz", "geotiff"]
    },
    {
        name: "Organic Maps / Maps.me",
        aliases: ["organic maps", "mapsme", "maps.me"],
        formats: ["kmz", "gpx"]
    }
];

function closeAvenzaModal() {
    const avenzaModal = document.getElementById("avenza-instruction-modal");
    if (avenzaModal) {
        avenzaModal.setAttribute("aria-hidden", "true");
        avenzaModal.classList.remove("is-open");
    }
    document.body.classList.remove("has-avenza-modal");

    const isAnyOtherModalOpen = document.querySelector(".maps-tile-modal.is-open:not(#avenza-instruction-modal)");
    if (!isAnyOtherModalOpen) {
        const bottomNav = document.querySelector(".mobile-bottom-nav-container");
        if (bottomNav) {
            bottomNav.classList.remove("is-hidden-entirely");
            bottomNav.style.removeProperty("display");
        }
    }
}

function closeAllAppsModal() {
    const allAppsModal = document.getElementById("all-apps-modal");
    if (allAppsModal) {
        allAppsModal.setAttribute("aria-hidden", "true");
        allAppsModal.classList.remove("is-open");
    }
}

function closeAllModals() {
    cancelDownloadViewPreload();
    const avenzaModal = document.getElementById("avenza-instruction-modal");
    if (avenzaModal) {
        avenzaModal.setAttribute("aria-hidden", "true");
        avenzaModal.classList.remove("is-open");
    }
    document.body.classList.remove("has-avenza-modal");

    const bottomNav = document.querySelector(".mobile-bottom-nav-container");
    if (bottomNav) {
        bottomNav.classList.remove("is-hidden-entirely");
        bottomNav.style.removeProperty("display");
    }

    const downloadModal = document.getElementById("downloads-modal");
    if (downloadModal) {
        downloadModal.setAttribute("aria-hidden", "true");
        downloadModal.classList.remove("is-open");
    }

    const copyModal = document.getElementById("copy-link-modal");
    if (copyModal) {
        copyModal.setAttribute("aria-hidden", "true");
        copyModal.classList.remove("is-open");
    }

    const helpModal = document.getElementById("help-modal");
    if (helpModal) {
        helpModal.setAttribute("aria-hidden", "true");
        helpModal.classList.remove("is-open");
    }

    const suggestModal = document.getElementById("suggest-modal");
    if (suggestModal) {
        suggestModal.setAttribute("aria-hidden", "true");
        suggestModal.classList.remove("is-open");
    }

    const allAppsModal = document.getElementById("all-apps-modal");
    if (allAppsModal) {
        allAppsModal.setAttribute("aria-hidden", "true");
        allAppsModal.classList.remove("is-open");
    }

    if (typeof window.updateActionButtonsState === "function") {
        window.updateActionButtonsState();
    }
}

function setupAllAppsLiveSearch() {
    const searchInput = document.getElementById("all-apps-search-input");
    const clearBtn = document.getElementById("all-apps-search-clear");
    const grid = document.getElementById("all-apps-grid");
    const noResults = document.getElementById("all-apps-no-results");

    if (!searchInput || !grid) return;

    const filterApps = () => {
        const query = searchInput.value.trim().toLowerCase();
        if (clearBtn) clearBtn.style.display = query ? "flex" : "none";

        const cards = grid.querySelectorAll(".suggested-app-card");
        let visibleCount = 0;

        cards.forEach(card => {
            const appName = (card.getAttribute("data-app-name") || "").toLowerCase();
            const label = card.querySelector(".suggested-app-label")?.textContent.toLowerCase() || "";

            if (!query || appName.includes(query) || label.includes(query)) {
                card.style.display = "";
                visibleCount++;
            } else {
                card.style.display = "none";
            }
        });

        if (noResults) {
            noResults.style.display = visibleCount === 0 ? "block" : "none";
        }
    };

    searchInput.addEventListener("input", filterApps);
    if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            searchInput.value = "";
            filterApps();
            searchInput.focus();
        });
    }
}

function updateAllAppsModalHeaderTitle() {
  const modalTitleEl = document.getElementById("all-apps-modal-title");
  if (!modalTitleEl) return;

  const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
  const circleName = state.currentFeature === "florence" ? "Florence Count Circle" : "Eugene Count Circle";

  if (state.isCirclesFeature) {
    modalTitleEl.innerHTML = `Download the <span class="avenza-target-name">Coast to Cascades Bird Alliance</span> to compatible apps`;
    return;
  }

  if (isCircle) {
    modalTitleEl.innerHTML = `Download the <span class="avenza-target-name">${circleName}</span> to compatible apps`;
    return;
  }

  const targetFeature = (state.allFeatures || []).find(f => {
    const zid = f.properties?.zid;
    return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || (typeof normalizeZoneId === "function" && normalizeZoneId(zid) === normalizeZoneId(state.currentId)));
  });

  const zoneName = (targetFeature && targetFeature.properties?.zid) 
    ? `Zone ${displayZoneId(targetFeature.properties.zid)}`
    : "Zone";

  modalTitleEl.innerHTML = `Download <span class="avenza-target-name">${zoneName}</span> of the <span class="avenza-target-name">${circleName}</span> to compatible apps`;
}

function updateShareModalDescription() {
    const descEl = document.querySelector(".maps-tile-copy-desc");
    if (!descEl) return;

    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
    const circleName = state.currentFeature === "florence" ? "Florence Count Circle" : "Eugene Count Circle";

    if (state.isCirclesFeature) {
        descEl.innerHTML = `Copy the link to the <span class="avenza-target-name">Coast to Cascades Bird Alliance</span> map:`;
        return;
    }

    if (isCircle) {
        descEl.innerHTML = `Copy the link to the <span class="avenza-target-name">${circleName}</span>:`;
        return;
    }

    const targetFeature = (state.allFeatures || []).find(f => {
        const zid = f.properties?.zid;
        return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || (typeof normalizeZoneId === "function" && normalizeZoneId(zid) === normalizeZoneId(state.currentId)));
    });

    const zoneName = (targetFeature && targetFeature.properties?.zid) 
        ? `Zone ${displayZoneId(targetFeature.properties.zid)}`
        : "Zone";

    descEl.innerHTML = `Copy the link to <span class="avenza-target-name">${zoneName}</span> of the <span class="avenza-target-name">${circleName}</span>:`;
}

function setupSuggestedAppCards() {
    setupAllAppsLiveSearch();
    const viewAllBtn = document.getElementById("btn-view-all-apps");
    const allAppsModal = document.getElementById("all-apps-modal");

    if (viewAllBtn && allAppsModal) {
        viewAllBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllModals();
            updateAllAppsModalHeaderTitle();
            allAppsModal.setAttribute("aria-hidden", "false");
            allAppsModal.classList.add("is-open");
            const searchInput = document.getElementById("all-apps-search-input");
            if (searchInput) {
                searchInput.value = "";
                const event = new Event("input");
                searchInput.dispatchEvent(event);
            }
        });
    }

    document.querySelectorAll(".suggested-app-card:not(#btn-view-all-apps)").forEach(card => {
        const iconWrap = card.querySelector(".suggested-app-icon-wrap");

        if (iconWrap) {
            card.addEventListener("mousemove", (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = ((y - centerY) / centerY) * -12;
                const rotateY = ((x - centerX) / centerX) * 12;

                iconWrap.style.transition = "transform 0.08s ease-out, box-shadow 0.15s ease";
                iconWrap.style.transform = `perspective(400px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.08, 1.08, 1.08) translateZ(6px)`;
                if (!card.classList.contains("is-active")) {
                    iconWrap.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.55), 0 0 14px rgba(255, 255, 255, 0.14)";
                }
            });

            card.addEventListener("mouseleave", () => {
                iconWrap.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease";
                iconWrap.style.transform = "perspective(400px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1) translateZ(0px)";
                iconWrap.style.boxShadow = card.classList.contains("is-active")
                    ? "0 0 0 1.5px rgba(var(--accent-rgb), 0.5), 0 8px 24px rgba(0, 0, 0, 0.6)"
                    : "0 4px 12px rgba(0, 0, 0, 0.4)";
            });
        }

        card.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const appName = card.getAttribute("data-app-name");
            if (!appName) return;

            const wasActive = card.classList.contains("is-active");
            document.querySelectorAll(".suggested-app-card").forEach(c => c.classList.remove("is-active"));

            if (!wasActive) {
                card.classList.add("is-active");
            }
            await handleAppDirectOpen(appName, card);
        });
    });
}

function setupDownloadAppSearch() {
    setupSuggestedAppCards();
    const searchInput = document.getElementById("download-app-search");
    const clearBtn = document.getElementById("download-app-search-clear");
    const autocompleteBox = document.getElementById("download-app-autocomplete");
    if (!searchInput || !autocompleteBox) return;

    const searchBox = document.querySelector(".maps-tile-download-search-box");
    const setupBoxProximity = (element, threshold = 140, spotlightSize = 200) => {
        if (!element) return;
        element.style.setProperty("--mouse-x", "50%");
        element.style.setProperty("--mouse-y", "50%");
        element.style.setProperty("--glow-opacity", "0");
        element.style.setProperty("--spotlight-size", `${spotlightSize}px`);

        window.addEventListener("mousemove", (e) => {
            if (window.getComputedStyle(element).display === "none") {
                element.style.setProperty("--glow-opacity", "0");
                return;
            }
            const rect = element.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
            const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
            const dist = Math.sqrt(dx * dx + dy * dy);

            element.style.setProperty("--mouse-x", `${x}px`);
            element.style.setProperty("--mouse-y", `${y}px`);

            let opacity = 0;
            if (dist <= threshold) {
                opacity = Math.pow(1 - dist / threshold, 1.2);
            }
            element.style.setProperty("--glow-opacity", opacity.toFixed(3));
        });
    };

    setupBoxProximity(autocompleteBox, 140, 200);

    const allDownloadButtons = {
        "geojson": document.getElementById("download-geojson"),
        "kmz": document.getElementById("download-kmz"),
        "gpx": document.getElementById("download-gpx"),
        "geopdf": document.getElementById("download-geopdf"),
        "geotiff": document.getElementById("download-geotiff")
    };

    const filterFormatsByApp = (appFormats) => {
        if (!appFormats) {
            Object.values(allDownloadButtons).forEach(btn => {
                if (btn) {
                    btn.classList.remove("is-dimmed", "is-filtered-match");
                }
            });
            return;
        }

        Object.entries(allDownloadButtons).forEach(([formatKey, btn]) => {
            if (btn) {
                if (appFormats.includes(formatKey)) {
                    btn.classList.remove("is-dimmed");
                    btn.classList.add("is-filtered-match");
                } else {
                    btn.classList.add("is-dimmed");
                    btn.classList.remove("is-filtered-match");
                }
            }
        });
    };

    const updateAutocomplete = () => {
        const query = searchInput.value.trim().toLowerCase();
        if (clearBtn) {
            clearBtn.style.display = query ? "flex" : "none";
        }

        if (!query) {
            autocompleteBox.style.display = "none";
            autocompleteBox.innerHTML = "";
            filterFormatsByApp(null);
            document.querySelectorAll(".suggested-app-card").forEach(c => c.classList.remove("is-active"));
            return;
        }

        const matches = MAP_VIEWER_APPS.filter(app => 
            app.name.toLowerCase().includes(query) || 
            app.aliases.some(a => a.includes(query))
        );

        // Sync active state on suggested app cards with search query
        document.querySelectorAll(".suggested-app-card").forEach(card => {
            const cardAppName = card.getAttribute("data-app-name") || "";
            const isMatch = matches.some(m => m.name.toLowerCase() === cardAppName.toLowerCase());
            card.classList.toggle("is-active", isMatch && query.length > 0);
        });

        if (matches.length === 0) {
            autocompleteBox.style.display = "block";
            autocompleteBox.innerHTML = `<div class="download-autocomplete-scroll-container"><div style="padding:0.6rem; font-size:0.8rem; color:rgba(255,255,255,0.4); text-align:center;">No matching viewer app found</div></div>`;
            filterFormatsByApp(null);
            return;
        }

        autocompleteBox.style.display = "block";
        const itemsHtml = matches.map(app => `
            <div class="download-autocomplete-item" data-app-name="${app.name}">
                <span class="download-autocomplete-item__name">${app.name}</span>
                <div class="download-autocomplete-item__formats">
                    ${app.formats.map(f => `<span class="download-format-pill">${f.toUpperCase()}</span>`).join("")}
                </div>
            </div>
        `).join("");

        autocompleteBox.innerHTML = `<div class="download-autocomplete-scroll-container">${itemsHtml}</div>`;

        autocompleteBox.querySelectorAll(".download-autocomplete-item").forEach(item => {
            item.addEventListener("click", (e) => {
                e.stopPropagation();
                const selectedName = item.getAttribute("data-app-name");
                const selectedApp = MAP_VIEWER_APPS.find(a => a.name === selectedName);
                if (selectedApp) {
                    searchInput.value = selectedApp.name;
                    autocompleteBox.style.display = "none";
                    if (clearBtn) clearBtn.style.display = "flex";
                    filterFormatsByApp(selectedApp.formats);
                    if (typeof showToast === "function") {
                        showToast(`Filtered formats for ${selectedApp.name}`);
                    }
                }
            });
        });

        if (matches.length > 0) {
            filterFormatsByApp(matches[0].formats);
        }
    };

    // Wire 3D angle-shift tilt hover effect & click handlers for Suggested App cards
    document.querySelectorAll(".suggested-app-card").forEach(card => {
        const iconWrap = card.querySelector(".suggested-app-icon-wrap");

        if (iconWrap) {
            card.addEventListener("mousemove", (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                // Balanced angle shift calculation (max tilt +-12deg)
                const rotateX = ((y - centerY) / centerY) * -12;
                const rotateY = ((x - centerX) / centerX) * 12;

                iconWrap.style.transition = "transform 0.08s ease-out, box-shadow 0.15s ease";
                iconWrap.style.transform = `perspective(400px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.08, 1.08, 1.08) translateZ(6px)`;
                if (!card.classList.contains("is-active")) {
                    iconWrap.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.55), 0 0 14px rgba(255, 255, 255, 0.14)";
                }
            });

            card.addEventListener("mouseleave", () => {
                iconWrap.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease";
                iconWrap.style.transform = "perspective(400px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1) translateZ(0px)";
                iconWrap.style.boxShadow = card.classList.contains("is-active")
                    ? "0 0 0 1.5px rgba(var(--accent-rgb), 0.5), 0 8px 24px rgba(0, 0, 0, 0.6)"
                    : "0 4px 12px rgba(0, 0, 0, 0.4)";
            });
        }

        card.addEventListener("click", async (e) => {
            e.stopPropagation();
            const appName = card.getAttribute("data-app-name");
            if (!appName) return;

            const selectedApp = MAP_VIEWER_APPS.find(a => 
                a.name.toLowerCase() === appName.toLowerCase() || 
                a.aliases.some(alias => alias.toLowerCase() === appName.toLowerCase())
            );

            const wasActive = card.classList.contains("is-active");
            document.querySelectorAll(".suggested-app-card").forEach(c => c.classList.remove("is-active"));

            if (wasActive) {
                searchInput.value = "";
                if (clearBtn) clearBtn.style.display = "none";
                autocompleteBox.style.display = "none";
                filterFormatsByApp(null);
            } else {
                card.classList.add("is-active");
                if (selectedApp) {
                    searchInput.value = selectedApp.name;
                    if (clearBtn) clearBtn.style.display = "flex";
                    autocompleteBox.style.display = "none";
                    filterFormatsByApp(selectedApp.formats);
                } else {
                    searchInput.value = appName;
                    if (clearBtn) clearBtn.style.display = "flex";
                }
                
                // Execute direct app handshake workflow (Blob fetch -> Web Share -> Fallback Download)
                await handleAppDirectOpen(appName, card);
            }
        });
    });

    searchInput.addEventListener("input", updateAutocomplete);
    searchInput.addEventListener("focus", updateAutocomplete);

    if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            searchInput.value = "";
            updateAutocomplete();
            searchInput.focus();
        });
    }

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".maps-tile-download-search-wrapper")) {
            autocompleteBox.style.display = "none";
        }
    });
}

function setupActionButtons() {
    const downloadModal = document.getElementById("downloads-modal");
    const copyModal = document.getElementById("copy-link-modal");
    const helpModal = document.getElementById("help-modal");
    const suggestModal = document.getElementById("suggest-modal");
    const downloadBtn = document.getElementById("btn-download-files");
    const copyBtn = document.getElementById("btn-copy-link");
    const helpBtn = document.getElementById("btn-help");
    const suggestBtn = document.getElementById("btn-suggest");

    const handleModalReparenting = () => {
        const mapWrapper = document.getElementById("map-wrapper") || document.querySelector(".maps-tile-map-area");
        const actionsRow = document.querySelector(".maps-tile-header__actions");
        const modals = [downloadModal, copyModal, helpModal, suggestModal];

        if (window.innerWidth <= 768) {
            if (actionsRow && actionsRow.parentElement !== document.body) {
                document.body.appendChild(actionsRow);
            }
            modals.forEach(m => {
                if (m && m.parentElement !== actionsRow) {
                    actionsRow.appendChild(m);
                }
            });
        } else if (mapWrapper) {
            if (actionsRow && actionsRow.parentElement !== mapWrapper) {
                mapWrapper.appendChild(actionsRow);
            }
            if (actionsRow) {
                modals.forEach(m => {
                    if (m && m.parentElement !== actionsRow) {
                        actionsRow.appendChild(m);
                    }
                });
            }
        }
    };
    handleModalReparenting();
    window.addEventListener("resize", handleModalReparenting);

    const toolbar = document.querySelector(".maps-tile-header__actions");
    if (toolbar) {
        const threshold = 140; // px — proximity threshold distance
        window.addEventListener("mousemove", (e) => {
            const rect = toolbar.getBoundingClientRect();
            
            // Calculate relative mouse coordinates inside toolbar coordinate space
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Calculate shortest distance from cursor to toolbar bounding box
            const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
            const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
            const dist = Math.sqrt(dx * dx + dy * dy);

            toolbar.style.setProperty("--mouse-x", `${x}px`);
            toolbar.style.setProperty("--mouse-y", `${y}px`);

            // Compute proximity opacity (1.0 inside toolbar, tapering down to 0.0 at threshold distance)
            let opacity = 0;
            if (dist <= threshold) {
                opacity = Math.pow(1 - dist / threshold, 1.2);
            }

            toolbar.style.setProperty("--glow-opacity", opacity.toFixed(3));
        });
    }

    window.updateActionButtonsState = () => {
        const isDownloadOpen = downloadModal && downloadModal.getAttribute("aria-hidden") === "false";
        const isCopyOpen = copyModal && copyModal.getAttribute("aria-hidden") === "false";
        const isHelpOpen = helpModal && helpModal.getAttribute("aria-hidden") === "false";
        const isSuggestOpen = suggestModal && suggestModal.getAttribute("aria-hidden") === "false";

        if (downloadBtn) downloadBtn.classList.toggle("is-active", !!isDownloadOpen);
        if (copyBtn) copyBtn.classList.toggle("is-active", !!isCopyOpen);
        if (helpBtn) helpBtn.classList.toggle("is-active", !!isHelpOpen);
        if (suggestBtn) suggestBtn.classList.toggle("is-active", !!isSuggestOpen);

        if (isDownloadOpen || isCopyOpen || isHelpOpen || isSuggestOpen) {
            document.body.classList.add("has-active-modal");
        } else {
            document.body.classList.remove("has-active-modal");
        }
    };



    const avenzaModal = document.getElementById("avenza-instruction-modal");
    const avenzaContinueBtn = document.getElementById("btn-avenza-continue");
    const avenzaDownloadBtn = document.getElementById("avenza-modal-download-btn");

    if (avenzaDownloadBtn) {
        avenzaDownloadBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            let blob = window._pendingAppBlob || window._pendingAvenzaBlob;
            let filename = window._pendingAppFilename || window._pendingAvenzaFilename || "map.pdf";
            let formatKey = window._pendingAppFormatKey || "geopdf";

            if (!(blob instanceof Blob)) {
                if (typeof showToast === "function") showToast("Rendering map layout...");
                avenzaDownloadBtn.classList.add("is-preparing");
                const originalHtml = avenzaDownloadBtn.innerHTML;
                avenzaDownloadBtn.innerHTML = `
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
                    if (window._pendingAppBlobPromise) {
                        const res = await window._pendingAppBlobPromise;
                        blob = res.blob;
                        if (res.filename) filename = res.filename;
                    } else {
                        const { blob: generatedBlob, filename: genFilename } = await generateAppSpatialBlob(formatKey);
                        blob = generatedBlob;
                        if (genFilename) filename = genFilename;
                    }
                    window._pendingAppBlob = blob;
                    window._pendingAppFilename = filename;
                } catch (err) {
                    console.error("Error generating map download:", err);
                    if (typeof showToast === "function") showToast("Error generating download file.");
                    avenzaDownloadBtn.classList.remove("is-preparing");
                    avenzaDownloadBtn.innerHTML = originalHtml;
                    return;
                }
                avenzaDownloadBtn.classList.remove("is-preparing");
            }

            const downloadBlob = new Blob([blob], { type: "application/octet-stream" });
            const url = URL.createObjectURL(downloadBlob);
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
            }, 100);

            avenzaDownloadBtn.classList.add("is-downloaded");
            avenzaDownloadBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Downloaded</span>
            `;
            if (typeof showToast === "function") showToast(`Downloaded ${filename}`);
        });
    }

    if (avenzaContinueBtn && avenzaModal) {
        avenzaContinueBtn.addEventListener("click", () => {
            // Launch target app directly with App Store fallback if app is not installed
            const scheme = window._pendingAppScheme || "avenzamaps://";
            const appKey = window._pendingAppKey || "avenza";
            launchAppWithStoreFallback(scheme, appKey);
        });
    }

    // Bind data-modal-close listeners across all modals (including avenza-instruction-modal)
    document.querySelectorAll("[data-modal-close]").forEach(closeEl => {
        closeEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const parentModal = closeEl.closest(".maps-tile-modal, .avenza-instruction-modal");
            if (parentModal && parentModal.id === "avenza-instruction-modal") {
                closeAvenzaModal();
            } else if (parentModal && parentModal.id === "all-apps-modal") {
                closeAllAppsModal();
            } else {
                closeAllModals();
            }
        });
    });

    window.transitionToPage = function(dest) {
        const overlay = document.getElementById("page-transition-overlay");
        if (overlay) {
            overlay.classList.remove("is-loaded");
            overlay.classList.add("is-active");
            setTimeout(() => {
                window.location.href = dest;
            }, 500);
        } else {
            window.location.href = dest;
        }
    };

    const handleToolsClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget) e.currentTarget.blur();
        window.transitionToPage("../tools/");
    };

    const handleSettingsClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget) e.currentTarget.blur();
        window.transitionToPage("../settings/");
    };

    ["desktop-nav-tab-tools", "mobile-nav-tab-tools"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", handleToolsClick);
    });

    ["desktop-nav-tab-settings", "mobile-nav-tab-settings"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", handleSettingsClick);
    });

    const modalBackBtn = document.getElementById("btn-modal-back");
    if (modalBackBtn) {
        modalBackBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllModals();
        });
    }

    if (copyBtn && copyModal) {
        const copyInput = document.getElementById("copy-link-input");
        const copyActionBtn = document.getElementById("btn-modal-copy-action");
        const copyBtnLabel = document.getElementById("copy-btn-label");

        copyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = copyModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                updateShareModalDescription();
                const currentUrl = window.location.href;
                if (copyInput) copyInput.value = currentUrl.replace(/^(https?:\/\/)/i, "");
                const qrImg = document.getElementById("copy-link-qr-code");
                if (qrImg) {
                    const qrWrapper = qrImg.parentElement;
                    if (qrWrapper) {
                        qrWrapper.classList.add("loading");
                    }
                    qrImg.style.opacity = "0";
                    qrImg.onload = () => {
                        if (qrWrapper) qrWrapper.classList.remove("loading");
                        qrImg.style.opacity = "1";
                    };
                    qrImg.onerror = () => {
                        if (qrWrapper) qrWrapper.classList.remove("loading");
                        qrImg.style.opacity = "0.3";
                    };
                    const isLightMode = document.body.classList.contains("theme-light") || (document.documentElement.getAttribute("data-theme") === "light");
                    const qrColor = isLightMode ? "000000" : "b8b8b8";
                    qrImg.src = `https://quickchart.io/qr?text=${encodeURIComponent(currentUrl)}&light=00000000&dark=${qrColor}&size=500&margin=0`;
                }
                copyModal.setAttribute("aria-hidden", "false");
                copyModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        if (copyActionBtn && copyInput) {
            copyActionBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(window.location.href);
                    showToast("Link copied to clipboard!");
                } catch (err) {
                    copyInput.select();
                    document.execCommand("copy");
                    showToast("Link copied to clipboard!");
                }
                if (copyBtnLabel) {
                    copyBtnLabel.textContent = "Copied!";
                    setTimeout(() => {
                        copyBtnLabel.textContent = "Copy";
                    }, 2000);
                }
            });
        }

        copyModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllModals();
            });
        });
    }

    if (downloadBtn && downloadModal) {
        setupDownloadAppSearch();
        downloadBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = downloadModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                downloadModal.setAttribute("aria-hidden", "false");
                downloadModal.classList.add("is-open");
                // Wait 0.5s after user clicks downloads view button before beginning preemptive rendering
                scheduleDownloadViewPreload();
            } else {
                cancelDownloadViewPreload();
            }
            window.updateActionButtonsState();
        });

        downloadModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                cancelDownloadViewPreload();
                closeAllModals();
            });
        });

        const geojsonBtn = document.getElementById("download-geojson");
        if (geojsonBtn) {
            geojsonBtn.addEventListener("click", async (e) => {
                const geojson = getSelectedGeoJSONData();
                const filename = getActiveDownloadFilename("geojson");
                const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
                await handleSpatialFileShare(e, blob, filename, geojsonBtn);
                showToast(`Exported ${filename}`);
            });
        }

        const kmzBtn = document.getElementById("download-kmz");
        if (kmzBtn) {
            kmzBtn.addEventListener("click", async (e) => {
                const geojson = getSelectedGeoJSONData();
                const filename = getActiveDownloadFilename("kmz");
                const kmlStr = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ""));
                let blob;
                if (typeof JSZip !== "undefined") {
                    const zip = new JSZip();
                    zip.file("doc.kml", kmlStr);
                    blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });
                } else {
                    blob = new Blob([kmlStr], { type: "application/vnd.google-earth.kml+xml" });
                }
                await handleSpatialFileShare(e, blob, filename, kmzBtn);
                showToast(`Exported ${filename}`);
            });
        }

        const gpxBtn = document.getElementById("download-gpx");
        if (gpxBtn) {
            gpxBtn.addEventListener("click", async (e) => {
                const geojson = getSelectedGeoJSONData();
                const filename = getActiveDownloadFilename("gpx");
                const gpxStr = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ""));
                const blob = new Blob([gpxStr], { type: "application/gpx+xml" });
                await handleSpatialFileShare(e, blob, filename, gpxBtn);
                showToast(`Exported ${filename}`);
            });
        }

        const geopdfBtn = document.getElementById("download-geopdf");
        if (geopdfBtn) {
            geopdfBtn.addEventListener("click", async () => {
                await downloadGeoPdf(geopdfBtn);
            });
        }

        const geotiffBtn = document.getElementById("download-geotiff");
        if (geotiffBtn) {
            geotiffBtn.addEventListener("click", async () => {
                await downloadGeoTiff(geotiffBtn);
            });
        }
    }

    if (helpBtn && helpModal) {
        helpBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = helpModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                helpModal.setAttribute("aria-hidden", "false");
                helpModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        helpModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllModals();
            });
        });
    }

    if (suggestBtn && suggestModal) {
        suggestBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = suggestModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                suggestModal.setAttribute("aria-hidden", "false");
                suggestModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        suggestModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                if (closeEl.classList.contains("modal__backdrop") && document.body.classList.contains("is-suggest-locked")) {
                    return;
                }
                closeAllModals();
            });
        });
    }

    document.addEventListener("click", (e) => {
        if (!e.isTrusted) return;
        if (e.target && (e.target.tagName === "A" || e.target.closest("a[download]"))) return;
        if (window.innerWidth >= 769) {
            if (downloadModal && downloadModal.getAttribute("aria-hidden") === "false") {
                if (!downloadModal.contains(e.target) && !downloadBtn.contains(e.target)) {
                    closeAllModals();
                }
            }
            if (copyModal && copyModal.getAttribute("aria-hidden") === "false") {
                if (!copyModal.contains(e.target) && !copyBtn.contains(e.target)) {
                    closeAllModals();
                }
            }
            if (helpModal && helpModal.getAttribute("aria-hidden") === "false") {
                if (!helpModal.contains(e.target) && !helpBtn.contains(e.target)) {
                    closeAllModals();
                }
            }
            if (suggestModal && suggestModal.getAttribute("aria-hidden") === "false") {
                if (!suggestModal.contains(e.target) && !suggestBtn.contains(e.target)
                    && !document.body.classList.contains("is-annotation-mode")
                    && !document.body.classList.contains("is-suggest-locked")
                    && !window._preventSuggestClose) {
                    closeAllModals();
                }
            }
        }
    });

    setupSuggestFormAndDrawing(closeAllModals);
}

function setupSuggestFormAndDrawing(closeAllModals) {
    const markerBtn = document.getElementById("btn-draw-marker");
    const lineBtn = document.getElementById("btn-draw-line");
    const polygonBtn = document.getElementById("btn-draw-polygon");
    const statusEl = document.getElementById("suggest-annotation-status");
    const suggestForm = document.getElementById("suggest-form");
    const suggestModal = document.getElementById("suggest-modal");

    if (!suggestForm) return;

    const MAX_ITEMS = 5;

    // Multi-feature collections (up to 5 of each)
    let markers = [];           // Array<[lng, lat]>
    let lines = [];             // Array<Array<[lng, lat]>>
    let polygons = [];          // Array<Array<[lng, lat]>>

    // In-progress drafting buffers
    let activeLineCoords = [];  // Array<[lng, lat]>
    let activePolyCoords = [];  // Array<[lng, lat]>
    let currentDrawingMode = null; // 'marker' | 'line' | 'polygon' | null

    // SVG icons
    const PIN_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
    const LINE_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19L19 4"></path><circle cx="4" cy="19" r="2"></circle><circle cx="19" cy="4" r="2"></circle></svg>`;
    const POLYGON_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;
    const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const CLEAR_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    const updateStatusText = () => {
        if (!statusEl) return;

        const items = [];
        if (markers.length > 0) {
            items.push(`<span class="suggest-status-badge" data-action="clear-markers" title="Click to clear markers">${markers.length === 1 ? '1 Marker' : `${markers.length} Markers`} &times;</span>`);
        }
        if (lines.length > 0) {
            items.push(`<span class="suggest-status-badge" data-action="clear-lines" title="Click to clear lines">${lines.length === 1 ? '1 Line' : `${lines.length} Lines`} &times;</span>`);
        }
        if (polygons.length > 0) {
            items.push(`<span class="suggest-status-badge" data-action="clear-polygons" title="Click to clear polygons">${polygons.length === 1 ? '1 Polygon' : `${polygons.length} Polygons`} &times;</span>`);
        }

        if (items.length > 0) {
            statusEl.innerHTML = items.join(" ");
            // Bind click-to-clear on badge chips
            statusEl.querySelectorAll("[data-action]").forEach(chip => {
                chip.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const action = chip.getAttribute("data-action");
                    if (action === "clear-markers") {
                        markers = [];
                        if (typeof showToast === "function") showToast("Markers cleared");
                    } else if (action === "clear-lines") {
                        lines = [];
                        if (typeof showToast === "function") showToast("Lines cleared");
                    } else if (action === "clear-polygons") {
                        polygons = [];
                        if (typeof showToast === "function") showToast("Polygons cleared");
                    }
                    updateAnnotationSource();
                    updateButtonsUI();
                    updateStatusText();
                    updateSuggestLockState();
                });
            });
        } else {
            statusEl.textContent = "No location pinned on map";
        }
    };

    const updateSuggestLockState = () => {
        const titleInput = document.getElementById("suggest-input-title");
        const msgInput = document.getElementById("suggest-input-message");
        const hasTitle = titleInput && titleInput.value.trim().length > 0;
        const hasMsg = msgInput && msgInput.value.trim().length > 0;
        const hasAnnotation = Boolean(
            (markers && markers.length > 0) ||
            (lines && lines.length > 0) ||
            (polygons && polygons.length > 0) ||
            (activeLineCoords && activeLineCoords.length > 0) ||
            (activePolyCoords && activePolyCoords.length > 0) ||
            currentDrawingMode
        );
        const isLocked = Boolean(hasTitle || hasMsg || hasAnnotation);

        state.isSuggestLocked = isLocked;
        const exitBtn = document.getElementById("suggest-exit-btn");
        const exitTextSpan = exitBtn ? exitBtn.querySelector(".suggest-exit-text") : null;

        if (isLocked) {
            document.body.classList.add("is-suggest-locked");
            if (exitBtn) {
                const selLabel = getSuggestSelectionLabel();
                if (exitTextSpan) {
                    exitTextSpan.textContent = `Exit Suggest Mode for "${selLabel}" (loses progress)`;
                }
                exitBtn.setAttribute("aria-label", `Exit Suggest Mode for "${selLabel}" (loses progress)`);
            }
        } else {
            document.body.classList.remove("is-suggest-locked");
        }
    };
    window.updateSuggestLockState = updateSuggestLockState;

    const titleInput = document.getElementById("suggest-input-title");
    const msgInput = document.getElementById("suggest-input-message");
    if (titleInput) titleInput.addEventListener("input", updateSuggestLockState);
    if (msgInput) msgInput.addEventListener("input", updateSuggestLockState);

    const updateButtonsUI = () => {
        // Marker Button
        if (markerBtn) {
            if (currentDrawingMode === "marker") {
                markerBtn.innerHTML = `${PIN_ICON}<span>Placing Marker...</span>`;
                markerBtn.classList.add("is-active");
                markerBtn.classList.remove("is-clear-mode");
            } else if (markers.length >= MAX_ITEMS) {
                markerBtn.innerHTML = `${CLEAR_ICON}<span>Clear Markers</span>`;
                markerBtn.classList.add("is-clear-mode");
                markerBtn.classList.remove("is-active");
            } else {
                markerBtn.innerHTML = `${PIN_ICON}<span>Add a Marker</span>`;
                markerBtn.classList.remove("is-clear-mode", "is-active");
            }
        }

        // Line Button
        if (lineBtn) {
            if (currentDrawingMode === "line") {
                lineBtn.innerHTML = `${CHECK_ICON}<span>Finish Line (${activeLineCoords.length} pts)</span>`;
                lineBtn.classList.add("is-active");
                lineBtn.classList.remove("is-clear-mode");
            } else if (lines.length >= MAX_ITEMS) {
                lineBtn.innerHTML = `${CLEAR_ICON}<span>Clear Lines</span>`;
                lineBtn.classList.add("is-clear-mode");
                lineBtn.classList.remove("is-active");
            } else {
                lineBtn.innerHTML = `${LINE_ICON}<span>Add Line</span>`;
                lineBtn.classList.remove("is-clear-mode", "is-active");
            }
        }

        // Polygon Button
        if (polygonBtn) {
            if (currentDrawingMode === "polygon") {
                polygonBtn.innerHTML = `${CHECK_ICON}<span>Finish Polygon (${activePolyCoords.length} pts)</span>`;
                polygonBtn.classList.add("is-active");
                polygonBtn.classList.remove("is-clear-mode");
            } else if (polygons.length >= MAX_ITEMS) {
                polygonBtn.innerHTML = `${CLEAR_ICON}<span>Clear Polygons</span>`;
                polygonBtn.classList.add("is-clear-mode");
                polygonBtn.classList.remove("is-active");
            } else {
                polygonBtn.innerHTML = `${POLYGON_ICON}<span>Add Polygon</span>`;
                polygonBtn.classList.remove("is-clear-mode", "is-active");
            }
        }
    };

    const ensureAnnotationLayers = (map) => {
        if (!map) return;
        const primaryColor = getThemeAccent();

        if (!map.getSource("suggest-annotation-source")) {
            map.addSource("suggest-annotation-source", {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] }
            });
        }

        // Polygon Fill Layer
        if (!map.getLayer("suggest-annotation-polygon-fill-layer")) {
            map.addLayer({
                id: "suggest-annotation-polygon-fill-layer",
                type: "fill",
                source: "suggest-annotation-source",
                filter: ["==", "$type", "Polygon"],
                paint: {
                    "fill-color": primaryColor,
                    "fill-opacity": 0.28
                }
            });
        }

        // Polygon Outline Layer
        if (!map.getLayer("suggest-annotation-polygon-stroke-layer")) {
            map.addLayer({
                id: "suggest-annotation-polygon-stroke-layer",
                type: "line",
                source: "suggest-annotation-source",
                filter: ["==", "$type", "Polygon"],
                paint: {
                    "line-color": primaryColor,
                    "line-width": 3,
                    "line-opacity": 0.95
                }
            });
        }

        // Line Halo Layer
        if (!map.getLayer("suggest-annotation-line-halo-layer")) {
            map.addLayer({
                id: "suggest-annotation-line-halo-layer",
                type: "line",
                source: "suggest-annotation-source",
                filter: ["==", "$type", "LineString"],
                paint: {
                    "line-color": "#000000",
                    "line-width": 6,
                    "line-opacity": 0.35
                }
            });
        }

        // Line Layer
        if (!map.getLayer("suggest-annotation-line-layer")) {
            map.addLayer({
                id: "suggest-annotation-line-layer",
                type: "line",
                source: "suggest-annotation-source",
                filter: ["==", "$type", "LineString"],
                paint: {
                    "line-color": primaryColor,
                    "line-width": 3.5,
                    "line-opacity": 0.95
                }
            });
        }

        // Vertices Layer
        if (!map.getLayer("suggest-annotation-vertex-layer")) {
            map.addLayer({
                id: "suggest-annotation-vertex-layer",
                type: "circle",
                source: "suggest-annotation-source",
                filter: ["all", ["==", "$type", "Point"], ["==", "kind", "vertex"]],
                paint: {
                    "circle-radius": 5,
                    "circle-color": "#ffffff",
                    "circle-stroke-color": primaryColor,
                    "circle-stroke-width": 2.5
                }
            });
        }

        // Marker Symbol Layer
        if (!map.hasImage("suggest-pin-icon")) {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
                <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30S36 31.5 36 18C36 8.06 27.94 0 18 0z" fill="${primaryColor}"/>
                <circle cx="18" cy="18" r="7" fill="${primaryColor}"/>
            </svg>`;
            const blob = new Blob([svg], { type: "image/svg+xml" });
            const url = URL.createObjectURL(blob);
            const img = new Image(36, 48);
            img.onload = () => {
                if (!map.hasImage("suggest-pin-icon")) {
                    map.addImage("suggest-pin-icon", img);
                }
                if (!map.getLayer("suggest-annotation-point-layer")) {
                    map.addLayer({
                        id: "suggest-annotation-point-layer",
                        type: "symbol",
                        source: "suggest-annotation-source",
                        filter: ["all", ["==", "$type", "Point"], ["==", "kind", "marker"]],
                        layout: {
                            "icon-image": "suggest-pin-icon",
                            "icon-size": 0.55,
                            "icon-anchor": "bottom",
                            "icon-allow-overlap": true
                        }
                    });
                }
                URL.revokeObjectURL(url);
            };
            img.src = url;
        } else if (!map.getLayer("suggest-annotation-point-layer")) {
            map.addLayer({
                id: "suggest-annotation-point-layer",
                type: "symbol",
                source: "suggest-annotation-source",
                filter: ["all", ["==", "$type", "Point"], ["==", "kind", "marker"]],
                layout: {
                    "icon-image": "suggest-pin-icon",
                    "icon-size": 0.55,
                    "icon-anchor": "bottom",
                    "icon-allow-overlap": true
                }
            });
        }
    };

    const updateAnnotationSource = () => {
        if (!state.map) return;
        ensureAnnotationLayers(state.map);

        const features = [];

        // 1. All placed markers
        markers.forEach((coord, idx) => {
            features.push({
                type: "Feature",
                properties: { kind: "marker", index: idx },
                geometry: { type: "Point", coordinates: coord }
            });
        });

        // 2. All placed lines + in-progress line
        lines.forEach((line) => {
            if (line.length >= 2) {
                features.push({
                    type: "Feature",
                    properties: { kind: "line" },
                    geometry: { type: "LineString", coordinates: line }
                });
            }
            line.forEach(coord => {
                features.push({
                    type: "Feature",
                    properties: { kind: "vertex" },
                    geometry: { type: "Point", coordinates: coord }
                });
            });
        });

        if (activeLineCoords.length > 0) {
            if (activeLineCoords.length >= 2) {
                features.push({
                    type: "Feature",
                    properties: { kind: "line" },
                    geometry: { type: "LineString", coordinates: activeLineCoords }
                });
            }
            activeLineCoords.forEach(coord => {
                features.push({
                    type: "Feature",
                    properties: { kind: "vertex" },
                    geometry: { type: "Point", coordinates: coord }
                });
            });
        }

        // 3. All placed polygons + in-progress polygon
        polygons.forEach((poly) => {
            if (poly.length >= 3) {
                const ring = [...poly, poly[0]];
                features.push({
                    type: "Feature",
                    properties: { kind: "polygon" },
                    geometry: { type: "Polygon", coordinates: [ring] }
                });
            }
            poly.forEach(coord => {
                features.push({
                    type: "Feature",
                    properties: { kind: "vertex" },
                    geometry: { type: "Point", coordinates: coord }
                });
            });
        });

        if (activePolyCoords.length > 0) {
            if (activePolyCoords.length >= 3) {
                const ring = [...activePolyCoords, activePolyCoords[0]];
                features.push({
                    type: "Feature",
                    properties: { kind: "polygon" },
                    geometry: { type: "Polygon", coordinates: [ring] }
                });
            } else if (activePolyCoords.length === 2) {
                features.push({
                    type: "Feature",
                    properties: { kind: "line" },
                    geometry: { type: "LineString", coordinates: activePolyCoords }
                });
            }
            activePolyCoords.forEach(coord => {
                features.push({
                    type: "Feature",
                    properties: { kind: "vertex" },
                    geometry: { type: "Point", coordinates: coord }
                });
            });
        }

        const geojson = {
            type: "FeatureCollection",
            features: features
        };

        if (state.map.getSource("suggest-annotation-source")) {
            state.map.getSource("suggest-annotation-source").setData(geojson);
        }
    };

    const resetDrawingStateOnly = () => {
        currentDrawingMode = null;
        activeLineCoords = [];
        activePolyCoords = [];
        if (state.map && state.map.getCanvas()) state.map.getCanvas().style.cursor = "";
        if (state.map && state.map.doubleClickZoom) state.map.doubleClickZoom.enable();
        document.body.classList.remove("is-annotation-mode");
        updateButtonsUI();
        updateStatusText();
    };

    const clearAllAnnotations = (silent = false) => {
        markers = [];
        lines = [];
        polygons = [];
        resetDrawingStateOnly();
        if (state.map && state.map.getSource("suggest-annotation-source")) {
            state.map.getSource("suggest-annotation-source").setData({
                type: "FeatureCollection",
                features: []
            });
        }
        updateStatusText();
        updateSuggestLockState();
        if (!silent && typeof showToast === "function") showToast("All annotations cleared");
    };

    const suggestExitBtn = document.getElementById("suggest-exit-btn");
    if (suggestExitBtn) {
        suggestExitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (titleInput) titleInput.value = "";
            if (msgInput) msgInput.value = "";
            clearAllAnnotations(true);
            updateSuggestLockState();
            if (typeof closeAllModals === "function") closeAllModals();
            if (typeof showToast === "function") showToast("Suggest mode exited (progress discarded)");
        });
    }

    const finishDrawingLine = () => {
        if (activeLineCoords.length < 2) {
            if (typeof showToast === "function") showToast("Click map to add at least 2 points for a line.");
            return;
        }
        lines.push([...activeLineCoords]);
        resetDrawingStateOnly();
        updateAnnotationSource();
        updateSuggestLockState();
        if (suggestModal) {
            suggestModal.setAttribute("aria-hidden", "false");
            suggestModal.classList.add("is-open");
            if (window.updateActionButtonsState) window.updateActionButtonsState();
        }
        if (typeof showToast === "function") showToast("Line added to map!");
    };

    const finishDrawingPolygon = () => {
        if (activePolyCoords.length < 3) {
            if (typeof showToast === "function") showToast("Click map to add at least 3 corners for a polygon.");
            return;
        }
        polygons.push([...activePolyCoords]);
        resetDrawingStateOnly();
        updateAnnotationSource();
        updateSuggestLockState();
        if (suggestModal) {
            suggestModal.setAttribute("aria-hidden", "false");
            suggestModal.classList.add("is-open");
            if (window.updateActionButtonsState) window.updateActionButtonsState();
        }
        if (typeof showToast === "function") showToast("Polygon added to map!");
    };

    const cancelCurrentDrawing = () => {
        resetDrawingStateOnly();
        updateAnnotationSource();
        updateSuggestLockState();
    };

    const annotationExitBtn = document.getElementById("annotation-exit-btn");
    if (annotationExitBtn) {
        annotationExitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentDrawingMode === "line" && activeLineCoords.length >= 2) {
                finishDrawingLine();
            } else if (currentDrawingMode === "polygon" && activePolyCoords.length >= 3) {
                finishDrawingPolygon();
            } else {
                cancelCurrentDrawing();
            }
        });
    }

    // Press X to exit drawing mode
    document.addEventListener("keydown", (e) => {
        if ((e.key === "x" || e.key === "X") && document.body.classList.contains("is-annotation-mode")) {
            e.preventDefault();
            if (currentDrawingMode === "line" && activeLineCoords.length >= 2) {
                finishDrawingLine();
            } else if (currentDrawingMode === "polygon" && activePolyCoords.length >= 3) {
                finishDrawingPolygon();
            } else {
                cancelCurrentDrawing();
            }
        }
    });

    const startDrawingMode = (mode, msg) => {
        if (!state.map) {
            if (typeof showToast === "function") showToast("Map is not available");
            return;
        }
        currentDrawingMode = mode;
        activeLineCoords = [];
        activePolyCoords = [];

        updateButtonsUI();
        updateStatusText();

        if (state.map.getCanvas()) state.map.getCanvas().style.cursor = "crosshair";
        if (state.map.doubleClickZoom) state.map.doubleClickZoom.disable();
        document.body.classList.add("is-annotation-mode");
        if (typeof showToast === "function") showToast(msg);
    };

    if (state.map) {
        state.map.on("click", (e) => {
            if (!currentDrawingMode) return;
            const pt = [e.lngLat.lng, e.lngLat.lat];

            if (currentDrawingMode === "marker") {
                if (markers.length < MAX_ITEMS) {
                    markers.push(pt);
                    updateAnnotationSource();
                    window._preventSuggestClose = true;
                    setTimeout(() => { window._preventSuggestClose = false; }, 0);
                    resetDrawingStateOnly();
                    updateSuggestLockState();

                    if (suggestModal) {
                        suggestModal.setAttribute("aria-hidden", "false");
                        suggestModal.classList.add("is-open");
                        if (window.updateActionButtonsState) window.updateActionButtonsState();
                    }
                    if (typeof showToast === "function") showToast("Marker added to map!");
                } else {
                    if (typeof showToast === "function") showToast("Maximum of 5 markers reached.");
                }
            } else if (currentDrawingMode === "line") {
                activeLineCoords.push(pt);
                updateAnnotationSource();
                window._preventSuggestClose = true;
                setTimeout(() => { window._preventSuggestClose = false; }, 0);
                updateButtonsUI();
                updateStatusText();
                updateSuggestLockState();
            } else if (currentDrawingMode === "polygon") {
                activePolyCoords.push(pt);
                updateAnnotationSource();
                window._preventSuggestClose = true;
                setTimeout(() => { window._preventSuggestClose = false; }, 0);
                updateButtonsUI();
                updateStatusText();
                updateSuggestLockState();
            }
        });

        state.map.on("dblclick", (e) => {
            if (!currentDrawingMode) return;
            e.preventDefault();
            if (currentDrawingMode === "line") {
                if (activeLineCoords.length >= 2) {
                    finishDrawingLine();
                } else {
                    cancelCurrentDrawing();
                    if (typeof showToast === "function") showToast("Line cancelled (need at least 2 points)");
                }
            } else if (currentDrawingMode === "polygon") {
                if (activePolyCoords.length >= 3) {
                    finishDrawingPolygon();
                } else {
                    cancelCurrentDrawing();
                    if (typeof showToast === "function") showToast("Polygon cancelled (need at least 3 corners)");
                }
            }
        });
    }

    if (markerBtn) {
        markerBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentDrawingMode === "marker") {
                cancelCurrentDrawing();
            } else if (markers.length >= MAX_ITEMS) {
                // Clear all markers
                markers = [];
                updateAnnotationSource();
                updateButtonsUI();
                updateStatusText();
                updateSuggestLockState();
                if (typeof showToast === "function") showToast("Markers cleared");
            } else {
                startDrawingMode("marker", "Click anywhere on the map to place a marker!");
            }
        });
    }

    if (lineBtn) {
        lineBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentDrawingMode === "line") {
                if (activeLineCoords.length >= 2) {
                    finishDrawingLine();
                } else {
                    cancelCurrentDrawing();
                    if (typeof showToast === "function") showToast("Line cancelled (need at least 2 points)");
                }
            } else if (lines.length >= MAX_ITEMS) {
                // Clear all lines
                lines = [];
                updateAnnotationSource();
                updateButtonsUI();
                updateStatusText();
                updateSuggestLockState();
                if (typeof showToast === "function") showToast("Lines cleared");
            } else {
                startDrawingMode("line", "Click on map to add line points. Click Finish or dbl-click when done.");
            }
        });
    }

    if (polygonBtn) {
        polygonBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentDrawingMode === "polygon") {
                if (activePolyCoords.length >= 3) {
                    finishDrawingPolygon();
                } else {
                    cancelCurrentDrawing();
                    if (typeof showToast === "function") showToast("Polygon cancelled (need at least 3 corners)");
                }
            } else if (polygons.length >= MAX_ITEMS) {
                // Clear all polygons
                polygons = [];
                updateAnnotationSource();
                updateButtonsUI();
                updateStatusText();
                updateSuggestLockState();
                if (typeof showToast === "function") showToast("Polygons cleared");
            } else {
                startDrawingMode("polygon", "Click on map to add polygon corners. Click Finish or dbl-click when done.");
            }
        });
    }

    const finalizePendingDrawing = () => {
        let changed = false;

        // Finalize pending line if any
        if (activeLineCoords && activeLineCoords.length > 0) {
            if (activeLineCoords.length >= 2) {
                lines.push([...activeLineCoords]);
                changed = true;
            } else if (activeLineCoords.length === 1) {
                markers.push([...activeLineCoords[0]]);
                changed = true;
            }
            activeLineCoords = [];
        }

        // Finalize pending polygon if any
        if (activePolyCoords && activePolyCoords.length > 0) {
            if (activePolyCoords.length >= 3) {
                polygons.push([...activePolyCoords]);
                changed = true;
            } else if (activePolyCoords.length === 2) {
                lines.push([...activePolyCoords]);
                changed = true;
            } else if (activePolyCoords.length === 1) {
                markers.push([...activePolyCoords[0]]);
                changed = true;
            }
            activePolyCoords = [];
        }

        if (changed || currentDrawingMode) {
            resetDrawingStateOnly();
            updateAnnotationSource();
            updateSuggestLockState();
        }
    };

    const submitBtnEl = document.getElementById("btn-submit-suggestion");
    if (submitBtnEl) {
        submitBtnEl.addEventListener("click", () => {
            finalizePendingDrawing();
        });
    }

    suggestForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        finalizePendingDrawing();
        const titleInput = document.getElementById("suggest-input-title");
        const msgInput = document.getElementById("suggest-input-message");
        const submitBtn = document.getElementById("btn-submit-suggestion");

        const title = titleInput ? titleInput.value.trim() : "";
        const description = msgInput ? msgInput.value.trim() : "";

        if (!title || !description) {
            if (typeof showToast === "function") showToast("Please fill in all required fields.");
            return;
        }

        const geojsonFeatures = [];

        // Markers
        markers.forEach((coord) => {
            geojsonFeatures.push({
                type: "Feature",
                properties: { kind: "marker" },
                geometry: {
                    type: "Point",
                    coordinates: coord
                }
            });
        });

        // Lines
        lines.forEach((line) => {
            if (line && line.length >= 2) {
                geojsonFeatures.push({
                    type: "Feature",
                    properties: { kind: "line" },
                    geometry: {
                        type: "LineString",
                        coordinates: line
                    }
                });
            }
        });

        // Polygons
        polygons.forEach((poly) => {
            if (poly && poly.length >= 3) {
                const ring = [...poly, poly[0]];
                geojsonFeatures.push({
                    type: "Feature",
                    properties: { kind: "polygon" },
                    geometry: {
                        type: "Polygon",
                        coordinates: [ring]
                    }
                });
            }
        });

        const selectionLabel = getSuggestSelectionLabel();
        let submittedTitle = title;
        if (selectionLabel) {
            if (!title.toLowerCase().startsWith(selectionLabel.toLowerCase())) {
                submittedTitle = `${selectionLabel} - ${title}`;
            }
        }

        const payload = {
            title: submittedTitle,
            description: description,
            geojson: {
                type: "FeatureCollection",
                features: geojsonFeatures
            }
        };

        const ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbz7MxHqTniRl88_VFM7FOdbOwD0jt7AfSZ4v3fMB6sJLIeNseFdFJFoWQnA3RysLFiY_w/exec";

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Submitting...</span>`;
        }

        try {
            await fetch(ENDPOINT_URL, {
                method: "POST",
                mode: "no-cors",
                headers: {
                    "Content-Type": "text/plain;charset=utf-8"
                },
                body: JSON.stringify(payload)
            });

            if (typeof showToast === "function") showToast("Suggestion submitted! Thank you for your feedback.");

            if (titleInput) titleInput.value = "";
            if (msgInput) msgInput.value = "";

            clearAllAnnotations(true);
            updateSuggestLockState();

            if (closeAllModals) closeAllModals();
        } catch (error) {
            console.error("Failed to submit suggestion:", error);
            if (typeof showToast === "function") showToast("Failed to submit suggestion. Please try again.");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span>Submit</span>`;
            }
        }
    });
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

async function performDirectCopyLink() {
    const url = window.location.href;
    try {
        await navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard!");
    } catch (err) {
        const tempInput = document.createElement("input");
        tempInput.value = url;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showToast("Link copied to clipboard!");
    }
}

function setupSearch() {
    const header = document.getElementById("sidebar-header");
    const toggleBtn = document.getElementById("btn-search-toggle");
    const closeBtn = document.getElementById("btn-search-close");
    const searchInput = document.getElementById("sidebar-search-input");
    const listContainer = document.getElementById("sidebar-zone-list");

    if (!header || !toggleBtn || !closeBtn || !searchInput || !listContainer) return;

    let savedSnapState = null;

    const openSearch = (e) => {
        if (e) e.preventDefault();

        if (window.innerWidth <= 768) {
            savedSnapState = state.snapState || "default";
            setMobileSnapState("selection-full", true);
        }

        header.classList.add("is-searching");
        header.classList.add("is-search-active");
        searchInput.value = "";
        filterList("");
        searchInput.focus();
        setTimeout(() => searchInput.focus(), 100);
    };

    const closeSearch = () => {
        header.classList.remove("is-searching");
        header.classList.remove("is-search-active");
        searchInput.value = "";
        filterList("");

        if (window.innerWidth <= 768 && savedSnapState) {
            setMobileSnapState(savedSnapState, true);
            savedSnapState = null;
        }
    };

    const filterList = (query) => {
        const q = query.trim().toLowerCase();
        const items = listContainer.querySelectorAll(".tile-zone-item");
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            const id = (item.getAttribute("data-id") || "").toLowerCase();
            if (!q || text.includes(q) || id.includes(q)) {
                item.style.display = "";
            } else {
                item.style.display = "none";
            }
        });
    };

    toggleBtn.addEventListener("click", openSearch);
    toggleBtn.addEventListener("touchend", (e) => {
        e.preventDefault();
        openSearch(e);
    });
    closeBtn.addEventListener("click", closeSearch);

    searchInput.addEventListener("input", (e) => {
        filterList(e.target.value);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeSearch();
        }
    });

    searchInput.addEventListener("focus", () => {
        if (window.innerWidth <= 768) {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
        }
    });

    searchInput.addEventListener("blur", () => {
        if (window.innerWidth <= 768) {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
        }
    });
}

function setupCapsules() {
    setupSidebarCapsuleEvents({
        state,
        documentObject: document,
        onRender: renderSidebarList,
        notify: showToast
    });
}

function setupListSwipeBack() {
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;

    let startX = 0;
    let startY = 0;
    let isTracking = false;
    let listWidth = 0;
    let indicatorTimer = null;

    listContainer.addEventListener("touchstart", (e) => {
        if (window.innerWidth > 768) return;
        
        const backBtn = document.getElementById("btn-capsule-back");
        if (!backBtn || backBtn.disabled || backBtn.classList.contains("is-disabled")) {
            isTracking = false;
            return;
        }

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        listWidth = listContainer.offsetWidth;
        isTracking = false;
        
        if (indicatorTimer) {
            clearTimeout(indicatorTimer);
            indicatorTimer = null;
        }
        const indicator = document.getElementById("swipe-back-indicator");
        if (indicator) indicator.classList.remove("is-visible");
        
        listContainer.style.transition = "none";
    }, { passive: true });

    listContainer.addEventListener("touchmove", (e) => {
        if (window.innerWidth > 768) return;
        const touch = e.touches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;

        if (!isTracking) {
            const backBtn = document.getElementById("btn-capsule-back");
            const canGoBack = backBtn && !backBtn.disabled && !backBtn.classList.contains("is-disabled");
            
            if (canGoBack && diffX > 10 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
                isTracking = true;
            }
        }

        if (isTracking) {
            if (e.cancelable) {
                e.preventDefault();
            }
            const translateX = Math.max(0, diffX);
            const opacity = Math.max(0.3, 1 - (translateX / (listWidth || 300)));
            
            listContainer.style.transform = `translateX(${translateX}px)`;
            listContainer.style.opacity = opacity;

            // Show indicator only when dragged 1/4 (25%) of the list width AND held for 0.1s
            const threshold = Math.min(80, listWidth * 0.25);
            const indicator = document.getElementById("swipe-back-indicator");
            if (indicator) {
                if (translateX >= threshold) {
                    if (!indicatorTimer) {
                        indicatorTimer = setTimeout(() => {
                            if (isTracking) {
                                indicator.classList.add("is-visible");
                            }
                        }, 100);
                    }
                } else {
                    if (indicatorTimer) {
                        clearTimeout(indicatorTimer);
                        indicatorTimer = null;
                    }
                    indicator.classList.remove("is-visible");
                }
            }
        }
    }, { passive: false });

    listContainer.addEventListener("touchend", (e) => {
        if (window.innerWidth > 768) return;
        
        if (indicatorTimer) {
            clearTimeout(indicatorTimer);
            indicatorTimer = null;
        }
        const indicator = document.getElementById("swipe-back-indicator");
        if (indicator) indicator.classList.remove("is-visible");

        if (!isTracking) {
            const touch = e.changedTouches[0];
            const diffX = touch.clientX - startX;
            const diffY = touch.clientY - startY;
            // Swiping left (right-to-left) inside feature tiles area -> open search
            if (diffX < -50 && Math.abs(diffX) > Math.abs(diffY) * 1.4 && Math.abs(diffY) < 70) {
                const header = document.getElementById("sidebar-header");
                const isSearching = header && header.classList.contains("is-searching");
                if (!isSearching) {
                    const searchToggle = document.getElementById("btn-search-toggle");
                    if (searchToggle) {
                        searchToggle.click();
                    }
                }
            }
            return;
        }
        isTracking = false;
        
        const touch = e.changedTouches[0];
        const diffX = touch.clientX - startX;
        const threshold = Math.min(80, listWidth * 0.25);

        if (diffX > threshold) {
            // Commit navigation
            listContainer.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
            listContainer.style.transform = "translateX(100%)";
            listContainer.style.opacity = "0";

            setTimeout(() => {
                const backBtn = document.getElementById("btn-capsule-back");
                if (backBtn) {
                    state.isSwipeTransitionActive = true;
                    backBtn.click();
                    state.isSwipeTransitionActive = false;
                }

                // Animate the new content from the left
                listContainer.style.transition = "none";
                listContainer.style.transform = "translateX(-100%)";
                listContainer.style.opacity = "0";

                listContainer.offsetHeight; // force reflow

                listContainer.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
                listContainer.style.transform = "translateX(0)";
                listContainer.style.opacity = "1";

                setTimeout(() => {
                    listContainer.style.transition = "";
                    listContainer.style.transform = "";
                    listContainer.style.opacity = "";
                }, 250);
            }, 200);
        } else {
            // Cancel and bounce back
            listContainer.style.transition = "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)";
            listContainer.style.transform = "translateX(0)";
            listContainer.style.opacity = "1";

            setTimeout(() => {
                listContainer.style.transition = "";
                listContainer.style.transform = "";
                listContainer.style.opacity = "";
            }, 200);
        }
    }, { passive: true });
}

function setupHelpModeSystem() {
    const toggleInput = document.getElementById("toggle-help-mode");
    const tooltip = document.getElementById("help-mode-tooltip");
    const highlight = document.getElementById("help-mode-highlight");

    const setHelpMode = (active, isFromKey = false) => {
        state.isHelpModeActive = active;
        if (toggleInput) toggleInput.checked = active;
        if (active) {
            document.body.classList.add("is-help-mode-active");
            tagElements();
            if (isFromKey) showToast("Interactive Help Mode: Enabled");
        } else {
            document.body.classList.remove("is-help-mode-active");
            if (tooltip) tooltip.setAttribute("aria-hidden", "true");
            if (highlight) highlight.setAttribute("aria-hidden", "true");
            if (isFromKey) showToast("Interactive Help Mode: Disabled");
        }
        if (window.updateActionButtonsState) window.updateActionButtonsState();
    };

    if (toggleInput) {
        toggleInput.addEventListener("change", (e) => {
            setHelpMode(e.target.checked, false);
        });
    }

    const docLink = document.querySelector(".help-doc-link");
    if (docLink) {
        docLink.addEventListener("click", (e) => {
            e.preventDefault();
            showToast("Documentation not available (coming soon)");
        });
    }

    document.addEventListener("mousedown", () => {
        state.lastNavSource = "click";
    }, true);

    document.addEventListener("keydown", (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
        if (activeTag === "input" || activeTag === "textarea") return;

        // Open Help Modal (Shift + H)
        if (e.shiftKey && (e.key === "h" || e.key === "H")) {
            e.preventDefault();
            const helpBtn = document.getElementById("btn-help");
            if (helpBtn) helpBtn.click();
            return;
        }

        // Toggle Interactive Help Mode (H key)
        if (!e.shiftKey && (e.key === "h" || e.key === "H")) {
            setHelpMode(!state.isHelpModeActive, true);
            return;
        }

        // Toggle Fullscreen (Shift + F)
        if (e.shiftKey && (e.key === "f" || e.key === "F")) {
            e.preventDefault();
            toggleFullscreen();
            return;
        }

        // Open Search Field (F key)
        if (!e.shiftKey && (e.key === "f" || e.key === "F")) {
            e.preventDefault();
            const searchToggle = document.getElementById("btn-search-toggle");
            if (searchToggle) searchToggle.click();
            return;
        }

        // Open Download Modal (Shift + G)
        if (e.shiftKey && (e.key === "g" || e.key === "G")) {
            e.preventDefault();
            const downloadBtn = document.getElementById("btn-download-files");
            if (downloadBtn) downloadBtn.click();
            return;
        }

        // Edit Item (Shift + X)
        if (e.shiftKey && (e.key === "x" || e.key === "X")) {
            e.preventDefault();
            const editBtn = document.getElementById("btn-edit-item");
            if (editBtn && editBtn.style.display !== "none") editBtn.click();
            return;
        }

        // Suggest Edit (Shift + Z)
        if (e.shiftKey && (e.key === "z" || e.key === "Z")) {
            e.preventDefault();
            const suggestBtn = document.getElementById("btn-suggest");
            if (suggestBtn) suggestBtn.click();
            return;
        }

        // Copy Link (Shift + C)
        if (e.shiftKey && (e.key === "c" || e.key === "C")) {
            e.preventDefault();
            performDirectCopyLink();
            return;
        }

        // Back Navigation (Escape key)
        if (e.key === "Escape" || e.key === "Esc") {
            state.lastNavSource = "keyboard";
            const lightbox = document.getElementById("image-lightbox-modal");
            if (lightbox && lightbox.classList.contains("is-open")) {
                lightbox.classList.remove("is-open");
                lightbox.setAttribute("aria-hidden", "true");
                return;
            }
            const openModal = document.querySelector(".maps-tile-modal[aria-hidden='false']");
            if (openModal) {
                openModal.setAttribute("aria-hidden", "true");
                return;
            }
            const backBtn = document.getElementById("btn-capsule-back");
            if (backBtn) backBtn.click();
            return;
        }

        // Overview Information (` key)
        if (e.key === "`" || e.key === "~") {
            state.lastNavSource = "keyboard";
            const capsules = document.querySelectorAll(".sidebar-capsule");
            capsules.forEach(c => c.classList.remove("is-active"));
            state.activeTab = "overview";
            renderSidebarList();
            return;
        }

        // Class Tabs Navigation (Numbers 1-9 without Shift)
        if (!e.shiftKey && e.key >= "1" && e.key <= "9") {
            state.lastNavSource = "keyboard";
            const index = parseInt(e.key, 10) - 1;
            const classTabs = document.querySelectorAll('.sidebar-capsule:not(.sidebar-capsule--icon)');
            if (classTabs && classTabs[index]) {
                classTabs[index].click();
            }
            return;
        }

        // Shift + 1-9 Map Style Navigation
        if (e.shiftKey && (e.code.startsWith("Digit") || (e.key >= "1" && e.key <= "9") || "!@#$%^&*(".includes(e.key))) {
            let digitNum = 0;
            if (e.code.startsWith("Digit")) {
                digitNum = parseInt(e.code.replace("Digit", ""), 10);
            } else if (e.key >= "1" && e.key <= "9") {
                digitNum = parseInt(e.key, 10);
            } else {
                const shiftMap = { "!": 1, "@": 2, "#": 3, "$": 4, "%": 5, "^": 6, "&": 7, "*": 8, "(": 9 };
                digitNum = shiftMap[e.key] || 0;
            }
            if (digitNum >= 1 && digitNum <= 9) {
                e.preventDefault();
                selectMapStyleByIndex(digitNum - 1);
                return;
            }
        }

        // Map Zoom (+, -, Shift+E zoom in, Shift+Q zoom out)
        const k = e.key.toLowerCase();
        if (e.key === "+" || e.key === "=" || (e.shiftKey && k === "e")) {
            e.preventDefault();
            if (state.map) state.map.zoomIn();
            return;
        }
        if (e.key === "-" || e.key === "_" || (e.shiftKey && k === "q")) {
            e.preventDefault();
            if (state.map) state.map.zoomOut();
            return;
        }

        // WASD & Arrow Feature Tile Navigation OR Shift + WASD/Arrow Map Panning
        if (k === "w" || e.key === "ArrowUp") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([0, -120], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            if (state.focusedTileIndex === -1) {
                const tiles = document.querySelectorAll("#sidebar-zone-list .tile-zone-item");
                updateKeyboardTileFocus(tiles ? tiles.length - 1 : 0);
            } else {
                updateKeyboardTileFocus(state.focusedTileIndex - 1);
            }
            return;
        }
        if (k === "s" || e.key === "ArrowDown") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([0, 120], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            if (state.focusedTileIndex === -1) {
                updateKeyboardTileFocus(0);
            } else {
                updateKeyboardTileFocus(state.focusedTileIndex + 1);
            }
            return;
        }
        if (k === "a" || e.key === "ArrowLeft") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([-120, 0], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            const backBtn = document.getElementById("btn-capsule-back");
            if (backBtn) backBtn.click();
            return;
        }
        if (k === "d" || e.key === "ArrowRight") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([120, 0], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            const tiles = document.querySelectorAll("#sidebar-zone-list .tile-zone-item");
            if (tiles && tiles.length > 0) {
                const targetIdx = state.focusedTileIndex >= 0 ? state.focusedTileIndex : 0;
                if (tiles[targetIdx]) tiles[targetIdx].click();
            }
            return;
        }
    });

    const helpDictionary = [
        { selector: "#desktop-nav-tab-home, #mobile-nav-tab-home", title: "Home Tab", desc: "Click this bar to navigate back to the Fovea homepage." },
        { selector: "#mobile-nav-tab-explore", title: "Explore Tab", desc: "Switch to map-full view to explore the map on mobile." },
        { selector: "#desktop-nav-tab-tools, #mobile-nav-tab-tools", title: "Tools Tab", desc: "Access various tools to assist with bird data collection, processing, and spatial analysis." },
        { selector: "#desktop-nav-tab-settings, #mobile-nav-tab-settings", title: "Settings Tab", desc: "Configure options, visual display preferences, and map style layers." },
        { selector: "#header-logo-container, .logo--header", title: "Organization Logo", desc: "Click the organization logo to navigate to the home directory of the organization which the currently selected feature belongs to." },
        { selector: "#header-title", title: "Selection Title", desc: "Displays the name of the currently selected feature." },
        { selector: "#btn-copy-link", title: "Share", desc: "Generates and copies a direct URL share link for the current view.", shortcut: "Shift + C" },
        { selector: "#btn-download-files", title: "Download Files", desc: "Access spatial GIS, PDF maps, and survey dataset files for this selection.", shortcut: "Shift + G" },
        { selector: "#btn-edit-item", title: "Edit Item", desc: "Opens the spatial data editor interface for updating boundaries.", shortcut: "Shift + X" },
        { selector: "#btn-suggest", title: "Suggest Edit", desc: "Submit suggestions, feedback, or pin map annotations.", shortcut: "Shift + Z" },
        { selector: "#btn-help", title: "Help & Guide", desc: "Opens user documentation and toggles Interactive Tooltip Mode.", shortcut: "Shift + H" },
        { selector: '#btn-capsule-back', title: "Back Navigation", desc: "Return to the previous higher-level overview (circle or list).", shortcut: "Esc or A / Left Arrow" },
        { selector: '[data-tab="overview"], [data-tab="about"]', title: "Overview Tab", desc: "View feature list preview, detailed descriptions, spatial summaries, and photographs.", shortcut: "` (Backtick)" },
        { selector: '.sidebar-capsule:not(.sidebar-capsule--icon)', title: "Class Tab", desc: "Class tabs filter the subfeatures of the current selection by type, which is reflected in the feature tiles column.", shortcut: "1 - 9" },
        { selector: "#btn-search-toggle", title: "Search Tool", desc: "Expand full-row search bar to filter count circles and survey zones.", shortcut: "F" },
        { selector: "#mobile-resize-bar", title: "Resize Handle", desc: "Drag vertically to adjust split screen map and list proportions." },
        { selector: ".map-ctrl-zoom", title: "Zoom Controls", desc: "Zoom in (+) or out (-) on the interactive map view.", shortcut: "+ / - or Shift + E / Q" },
        { selector: ".map-ctrl-locate", title: "Location Tracking", desc: "Locate your current live GPS position on the survey map." },
        { selector: ".map-ctrl-fullscreen", title: "Fullscreen Toggle", desc: "Expand map view to fill your entire screen display.", shortcut: "Shift + F" },
        { selector: ".map-ctrl-styles", title: "Map Elements", desc: "Select the basemap and toggle overlay layers for the map frame.", shortcut: "Shift + 1 - 9" },
        { selector: ".map-ctrl-styles__list .tile-zone-item", title: "Map Element Option", desc: "Select this basemap or overlay layer to update the active map display." },
        { selector: '.modal-capsule[data-tab="basemaps"]', title: "Basemaps Tab", desc: "View and select the underlying style of the interactive map." },
        { selector: '.modal-capsule[data-tab="layers"]', title: "Class Tab", desc: "Class tabs filter the subfeatures of the current selection by type, which is reflected in the feature tiles column.", shortcut: "1 - 9" },
        { selector: ".modal-search-toggle-btn", title: "Element Search", desc: "Toggle a text search box to filter the visible list items below." },
        { selector: ".modal-search-input", title: "Search Text Input", desc: "Type to filter layers or basemaps matching your keywords." },
        { selector: ".tile-zone-item", title: "Feature Tile", desc: "A feature tile represents a sub feature of the currently selected item. Click it to select the feature.", shortcut: "WASD or Arrows (W/S to navigate, D to select)" },
        { selector: "#tile-map, #map-wrapper", title: "Map Frame", desc: "Interactive spatial map view showing bird count circles and survey zone boundaries.", shortcut: "Shift + WASD or Arrow Keys" }
    ];

    const tagElements = () => {
        helpDictionary.forEach(item => {
            const els = document.querySelectorAll(item.selector);
            els.forEach(el => {
                el.setAttribute("data-help-title", item.title);
                el.setAttribute("data-help-desc", item.desc);
                if (item.shortcut) {
                    el.setAttribute("data-help-shortcut", item.shortcut);
                } else {
                    el.removeAttribute("data-help-shortcut");
                }
            });
        });
    };

    tagElements();

    const observer = new MutationObserver(() => {
        if (state.isHelpModeActive) {
            tagElements();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const resolveHelpTarget = (eventTarget) => {
        let target = eventTarget.closest("[data-help-title]");
        let title = target ? target.getAttribute("data-help-title") : null;
        let desc = target ? target.getAttribute("data-help-desc") : null;
        let shortcut = target ? target.getAttribute("data-help-shortcut") : null;

        if (!target) {
            for (const item of helpDictionary) {
                const matched = eventTarget.closest(item.selector);
                if (matched) {
                    target = matched;
                    title = item.title;
                    desc = item.desc;
                    shortcut = item.shortcut || null;
                    target.setAttribute("data-help-title", title);
                    target.setAttribute("data-help-desc", desc);
                    if (shortcut) target.setAttribute("data-help-shortcut", shortcut);
                    break;
                }
            }
        }
        if (target && (target.id === "tile-map" || target.id === "map-wrapper" || title === "Map Frame")) {
            if (eventTarget.closest(".map-ctrl-container, .map-ctrl-panel")) {
                return { target: null, title: null, desc: null, shortcut: null };
            }
        }

        return { target, title, desc, shortcut };
    };

    const isTouchDevice = () => {
        return window.matchMedia("(pointer: coarse)").matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0) || window.innerWidth <= 768;
    };

    document.addEventListener("mousemove", (e) => {
        if (!state.isHelpModeActive || isTouchDevice()) return;

        const { target, title, desc, shortcut } = resolveHelpTarget(e.target);
        if (target) {
            if (tooltip) {
                tooltip.innerHTML = `
                    <div class="help-mode-tooltip__title">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        <span>${title}</span>
                    </div>
                    <p class="help-mode-tooltip__desc">${desc}</p>
                    ${shortcut ? `
                        <div class="help-mode-tooltip__shortcut">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M8 16h8"></path></svg>
                            <span class="help-mode-tooltip__shortcut-label">Shortcut:</span>
                            <span class="help-mode-tooltip__shortcut-val">${shortcut}</span>
                        </div>
                    ` : ""}
                `;

                tooltip.setAttribute("aria-hidden", "false");

                const tooltipWidth = tooltip.offsetWidth || 240;
                const tooltipHeight = tooltip.offsetHeight || 80;

                let posX = e.clientX + 15;
                let posY = e.clientY + 15;

                if (posX + tooltipWidth > window.innerWidth - 10) {
                    posX = e.clientX - tooltipWidth - 15;
                }
                if (posY + tooltipHeight > window.innerHeight - 10) {
                    posY = e.clientY - tooltipHeight - 15;
                }

                tooltip.style.left = `${posX}px`;
                tooltip.style.top = `${posY}px`;
            }

            if (highlight) {
                const rect = target.getBoundingClientRect();
                const pad = 3;
                highlight.style.left = `${rect.left - pad}px`;
                highlight.style.top = `${rect.top - pad}px`;
                highlight.style.width = `${rect.width + pad * 2}px`;
                highlight.style.height = `${rect.height + pad * 2}px`;
                highlight.setAttribute("aria-hidden", "false");
            }
        } else {
            if (tooltip) tooltip.setAttribute("aria-hidden", "true");
            if (highlight) highlight.setAttribute("aria-hidden", "true");
        }
    });

    const mobileExitBtn = document.getElementById("mobile-help-exit-btn");
    if (mobileExitBtn) {
        mobileExitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            setHelpMode(false, false);
        });
    }

    const handleHelpClick = (e) => {
        if (!state.isHelpModeActive || !isTouchDevice()) return;

        const helpModal = document.getElementById("help-modal");
        if (helpModal && helpModal.contains(e.target)) return;
        if (mobileExitBtn && mobileExitBtn.contains(e.target)) return;

        const { target, title, desc, shortcut } = resolveHelpTarget(e.target);
        if (target) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (tooltip) {
                tooltip.innerHTML = `
                    <div class="help-mode-tooltip__title">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        <span>${title}</span>
                    </div>
                    <p class="help-mode-tooltip__desc">${desc}</p>
                    ${shortcut ? `
                        <div class="help-mode-tooltip__shortcut">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M8 16h8"></path></svg>
                            <span class="help-mode-tooltip__shortcut-label">Shortcut:</span>
                            <span class="help-mode-tooltip__shortcut-val">${shortcut}</span>
                        </div>
                    ` : ""}
                `;
                tooltip.setAttribute("aria-hidden", "false");

                const rect = target.getBoundingClientRect();
                const tooltipWidth = tooltip.offsetWidth || 240;
                const tooltipHeight = tooltip.offsetHeight || 80;

                let posX = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                let posY = rect.bottom + 10;

                if (posX < 10) posX = 10;
                if (posX + tooltipWidth > window.innerWidth - 10) posX = window.innerWidth - tooltipWidth - 10;
                if (posY + tooltipHeight > window.innerHeight - 10) posY = rect.top - tooltipHeight - 10;
                if (posY < 10) posY = 10;

                tooltip.style.left = `${posX}px`;
                tooltip.style.top = `${posY}px`;
            }

            if (highlight) {
                const rect = target.getBoundingClientRect();
                const pad = 3;
                highlight.style.left = `${rect.left - pad}px`;
                highlight.style.top = `${rect.top - pad}px`;
                highlight.style.width = `${rect.width + pad * 2}px`;
                highlight.style.height = `${rect.height + pad * 2}px`;
                highlight.setAttribute("aria-hidden", "false");
            }
        }
    };

    document.addEventListener("click", handleHelpClick, true);
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
        setupActionButtons();
        setupSearch();
        setupCapsules();
        setupSwipeNavigation();
        setupListSwipeBack();
        setupImageLightbox();
        setupMobileResizeBar();
        setupHelpModeSystem();
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

function setupViewToggleMenu() {
    const toggleBtn = document.getElementById("header-view-toggle");
    const menuEl = document.getElementById("header-view-menu");
    const labelEl = document.getElementById("header-view-toggle-label");
    const iconWrapEl = document.getElementById("header-view-toggle-icon");
    if (!toggleBtn || !menuEl) return;

    let isOpen = false;

    function openMenu() {
        isOpen = true;
        menuEl.setAttribute("aria-hidden", "false");
        toggleBtn.setAttribute("aria-expanded", "true");
    }

    function closeMenu() {
        isOpen = false;
        menuEl.setAttribute("aria-hidden", "true");
        toggleBtn.setAttribute("aria-expanded", "false");
    }

    toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    const items = menuEl.querySelectorAll(".header-view-menu__item");
    items.forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            const val = item.dataset.value;
            
            // Update active state inside popup
            items.forEach(i => {
                const isActive = i.dataset.value === val;
                i.classList.toggle("is-active", isActive);
                const checkSvg = i.querySelector(".header-view-menu__check");
                if (checkSvg) checkSvg.style.display = isActive ? "block" : "none";
            });

            // Update toggle button icon
            if (iconWrapEl) {
                const itemIcon = item.querySelector(".header-view-menu__icon");
                if (itemIcon) {
                    iconWrapEl.innerHTML = itemIcon.outerHTML;
                    const clonedSvg = iconWrapEl.querySelector("svg");
                    if (clonedSvg) {
                        clonedSvg.setAttribute("width", "12");
                        clonedSvg.setAttribute("height", "12");
                    }
                }
            }

            // Update toggle label text
            if (labelEl) {
                const labelMap = {
                    auto: "Auto",
                    map: "Map",
                    graph: "Graph",
                    table: "Table",
                    image: "Image",
                    people: "People",
                    network: "Network"
                };
                labelEl.textContent = labelMap[val] || (val.charAt(0).toUpperCase() + val.slice(1));
            }

            // Close popup
            closeMenu();
        });
    });

    // Close on click outside
    document.addEventListener("click", (e) => {
        if (isOpen && !toggleBtn.contains(e.target) && !menuEl.contains(e.target)) {
            closeMenu();
        }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (isOpen && e.key === "Escape") {
            closeMenu();
        }
    });
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


function setupMobileBottomNav() {
    const nav = document.querySelector(".mobile-bottom-nav");
    if (!nav) return;

    const baseItems = nav.querySelectorAll(".mobile-bottom-nav__base .mobile-bottom-nav-item");
    const exploreTab = document.getElementById("mobile-nav-tab-explore");
    const capsule = nav.querySelector(".mobile-bottom-nav__capsule");
    const overlay = nav.querySelector(".mobile-bottom-nav__overlay");

    if (!baseItems.length || !capsule || !overlay) return;

    // Explore tab: on mobile, do nothing to snap state when already on the maps page.
    if (exploreTab) {
        exploreTab.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    let activeIndex = -1;
    baseItems.forEach((item, index) => {
        if (item.classList.contains("is-active")) {
            activeIndex = index;
        }
    });

    const prevIndexStr = sessionStorage.getItem("prev-nav-index");
    let prevIndex = prevIndexStr !== null ? parseInt(prevIndexStr, 10) : -1;
    sessionStorage.removeItem("prev-nav-index");

    function updateCapsule(targetEl, immediate = false) {
        if (!targetEl) return;
        
        if (immediate) {
            capsule.style.transition = "none";
            overlay.style.transition = "none";
        } else {
            capsule.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.16, 1, 0.3, 1), height 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
            overlay.style.transition = "clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1), -webkit-clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
        }

        const navRect = nav.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        const left = targetRect.left - navRect.left;
        const top = targetRect.top - navRect.top;
        const width = targetRect.width;
        const height = targetRect.height;

        capsule.style.transform = `translate(${left}px, ${top}px)`;
        capsule.style.width = `${width}px`;
        capsule.style.height = `${height}px`;

        nav.style.setProperty("--active-x", `${left + width / 2}px`);
        nav.style.setProperty("--active-y", `${top + height / 2}px`);

        const clipVal = `inset(${top}px ${navRect.width - (left + width)}px ${navRect.height - (top + height)}px ${left}px round 17px)`;
        overlay.style.clipPath = clipVal;
        overlay.style.webkitClipPath = clipVal;

        if (immediate) {
            capsule.offsetHeight;
            capsule.style.transition = "";
            overlay.style.transition = "";
        }
    }

    if (prevIndex !== -1 && prevIndex !== activeIndex && baseItems[prevIndex]) {
        updateCapsule(baseItems[prevIndex], true);
        requestAnimationFrame(() => {
            updateCapsule(baseItems[activeIndex]);
        });
    } else if (activeIndex !== -1) {
        updateCapsule(baseItems[activeIndex], true);
    }

    // Touch Dragging Logic for the capsule (bound to nav to bypass z-index blocking)
    let isDragging = false;
    let hasMoved = false;
    let startX = 0;
    let initialLeft = 0;
    let currentLeft = 0;

    baseItems.forEach((item, index) => {
        item.addEventListener("click", (e) => {
            if (hasMoved) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            sessionStorage.setItem("prev-nav-index", index);
            updateCapsule(item);
        });
    });

    nav.addEventListener("touchstart", (e) => {
        const touch = e.touches[0];
        const capsuleRect = capsule.getBoundingClientRect();
        
        // Check if touch starts within the bounds of the active capsule
        if (
            touch.clientX >= capsuleRect.left &&
            touch.clientX <= capsuleRect.right &&
            touch.clientY >= capsuleRect.top &&
            touch.clientY <= capsuleRect.bottom
        ) {
            isDragging = true;
            hasMoved = false;
            capsule.style.cursor = "grabbing";
            capsule.classList.add("is-dragging");
            startX = touch.clientX;
            
            const style = window.getComputedStyle(capsule);
            const DOMMatrixClass = window.DOMMatrix || window.WebKitCSSMatrix || window.MSCSSMatrix;
            const matrix = new DOMMatrixClass(style.transform);
            initialLeft = matrix.m41;
            currentLeft = initialLeft;

            capsule.style.transition = "none";
            overlay.style.transition = "none";
        }
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
        if (!isDragging) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        
        if (Math.abs(deltaX) > 4) {
            hasMoved = true;
        }

        let newLeft = initialLeft + deltaX;

        const navRect = nav.getBoundingClientRect();
        const capsuleRect = capsule.getBoundingClientRect();
        const paddingLeft = 4;
        const minLeft = paddingLeft;
        const maxLeft = navRect.width - paddingLeft - capsuleRect.width;

        if (newLeft < minLeft) newLeft = minLeft;
        if (newLeft > maxLeft) newLeft = maxLeft;

        currentLeft = newLeft;

        capsule.style.transform = `translate(${newLeft}px, 4px)`;

        const top = 4;
        const width = capsuleRect.width;
        const height = capsuleRect.height;

        nav.style.setProperty("--active-x", `${newLeft + width / 2}px`);
        nav.style.setProperty("--active-y", `${top + height / 2}px`);
        const clipVal = `inset(${top}px ${navRect.width - (newLeft + width)}px ${navRect.height - (top + height)}px ${newLeft}px round 17px)`;
        overlay.style.clipPath = clipVal;
        overlay.style.webkitClipPath = clipVal;
    }, { passive: true });

    window.addEventListener("touchend", () => {
        if (!isDragging) return;
        isDragging = false;
        capsule.style.cursor = "grab";
        capsule.classList.remove("is-dragging");

        capsule.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.16, 1, 0.3, 1), height 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease";
        overlay.style.transition = "clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1), -webkit-clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1)";

        const navRect = nav.getBoundingClientRect();
        const capsuleRect = capsule.getBoundingClientRect();
        const capsuleCenter = currentLeft + capsuleRect.width / 2;

        let closestItem = null;
        let closestDist = Infinity;
        let closestIndex = -1;

        baseItems.forEach((item, index) => {
            const itemRect = item.getBoundingClientRect();
            const itemLeft = itemRect.left - navRect.left;
            const itemCenter = itemLeft + itemRect.width / 2;
            const dist = Math.abs(capsuleCenter - itemCenter);
            
            if (dist < closestDist) {
                closestDist = dist;
                closestItem = item;
                closestIndex = index;
            }
        });

        if (closestItem) {
            sessionStorage.setItem("prev-nav-index", closestIndex);
            
            const itemRect = closestItem.getBoundingClientRect();
            const left = itemRect.left - navRect.left;
            const top = itemRect.top - navRect.top;
            const width = itemRect.width;
            const height = itemRect.height;

            capsule.style.transform = `translate(${left}px, ${top}px)`;
            capsule.style.width = `${width}px`;
            capsule.style.height = `${height}px`;

            nav.style.setProperty("--active-x", `${left + width / 2}px`);
            nav.style.setProperty("--active-y", `${top + height / 2}px`);

            const clipVal = `inset(${top}px ${navRect.width - (left + width)}px ${navRect.height - (top + height)}px ${left}px round 17px)`;
            overlay.style.clipPath = clipVal;
            overlay.style.webkitClipPath = clipVal;

            if (hasMoved) {
                closestItem.click();
            }
        }
        
        // Reset hasMoved after a short delay to allow click cancellation to execute first
        setTimeout(() => {
            hasMoved = false;
        }, 50);
    });

    window.addEventListener("resize", () => {
        const activeTab = nav.querySelector(".mobile-bottom-nav__base .mobile-bottom-nav-item.is-active");
        if (activeTab) {
            updateCapsule(activeTab, true);
        }
    });
}
