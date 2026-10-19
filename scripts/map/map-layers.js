import { getThemeAccent, getThemeAccentLight } from "../utils/color-utils.js";
import { normalizeZoneId } from "../utils/format-utils.js";
import { state } from '../state.js';
import { rebuildHtmlLabels } from './map-html-labels.js';
import { applyVectorThemeStyles } from './map-vector-theme-styles.js';
import { createPlaceLabelFilterController, toExpression } from './map-place-label-filter.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { showToast } from '../components/toast-view.js'; // Might be needed for selectMapStyleByIndex
import { findPointInsidePolygon, getBbox } from '../utils/geometry-math.js';
import { CARTO_SUBDOMAINS, MAP_PROVIDER_URLS } from '../config/map-provider-config.js';

export { rebuildHtmlLabels, updateLabelZoomVisibility } from './map-html-labels.js';

let originalRoadColors = {};

export function getOriginalRoadColor(layerId) {
    return originalRoadColors[layerId];
}

const placeLabelFilterController = createPlaceLabelFilterController(state);
export const updatePlaceLabelsFilter = placeLabelFilterController.updatePlaceLabelsFilter;
export { toExpression };

export function updateAllFeatureStyles({ updateAdditionalLayers = () => {} } = {}) {
    if (!state.map || !state.map.getSource('zones')) return;
    
    // Dynamically filter circle place names from basemap on circles overview view
    try {
        updatePlaceLabelsFilter();
        updateAdditionalLayers();
    } catch(e) { console.warn("Error updating map layer styles:", e); }
    
    // We update all features state based on currentId
    (state.allFeatures || []).forEach(feature => {
        const props = feature.properties || {};
        const key = state.isCirclesFeature ? String(props.cid || "") : String(props.zid || "");
        if (!key) return;
        const isSelected = state.currentId !== CIRCLE_ID && (key === state.currentId || normalizeZoneId(key) === normalizeZoneId(state.currentId));
        try {
            state.map.setFeatureState(
                { source: 'zones', id: key },
                { selected: isSelected }
            );
        } catch (e) {
            // Feature state can be unavailable while vector tiles are loading.
        }
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

export function addRasterBaseLayers(map, activeLayerId = 'dark') {
    const sources = [
        ['satellite-tiles', {
            type: 'raster',
            tiles: [MAP_PROVIDER_URLS.esri.satelliteTiles],
            tileSize: 128,
            maxzoom: 18
        }],
        ['esri-street-tiles', {
            type: 'raster',
            tiles: [MAP_PROVIDER_URLS.esri.streetTiles],
            tileSize: 256,
            maxzoom: 18
        }],
        ['esri-topo-tiles', {
            type: 'raster',
            tiles: [MAP_PROVIDER_URLS.esri.topoTiles],
            tileSize: 256,
            maxzoom: 18
        }],
        ['dark-tiles', {
            type: 'raster',
            tiles: CARTO_SUBDOMAINS.map(subdomain => MAP_PROVIDER_URLS.carto.darkRasterTiles.replace('{s}', subdomain)),
            tileSize: 128,
            maxzoom: 19
        }]
    ];
    sources.forEach(([id, source]) => {
        try {
            map.addSource(id, source);
        } catch (error) {
            console.warn(`Error adding ${id} source:`, error);
        }
    });

    const satelliteUnderlayId = map.getLayer('tunnel_service_case') ? 'tunnel_service_case'
        : map.getLayer('road_service_case') ? 'road_service_case'
            : map.getLayer('waterway_label') ? 'waterway_label' : undefined;
    const layers = [
        { id: 'base-satellite', source: 'satellite-tiles', visibleFor: 'satellite', beforeId: satelliteUnderlayId },
        { id: 'base-esri-street', source: 'esri-street-tiles', visibleFor: 'esri-street' },
        { id: 'base-esri-topo', source: 'esri-topo-tiles', visibleFor: 'esri-topo' },
        { id: 'base-dark-raster', source: 'dark-tiles', visibleFor: 'dark-raster' }
    ];
    layers.forEach(({ id, source, visibleFor, beforeId }) => {
        try {
            const layer = {
                id,
                type: 'raster',
                source,
                minzoom: 0,
                maxzoom: 22,
                layout: { visibility: activeLayerId === visibleFor ? 'visible' : 'none' }
            };
            if (beforeId) map.addLayer(layer, beforeId);
            else map.addLayer(layer);
        } catch (error) {
            console.warn(`Error adding ${id} layer:`, error);
        }
    });
}

export function setupMapLayers(state) {
    state.map.on('style.load', () => {
        state.map.setProjection({ type: 'globe' });

        // Add the raster base-map sources and overlays through the map layer boundary.
        addRasterBaseLayers(state.map, state.currentBaseLayer || "dark");

        // 3. Tweak vector styles to brighten land, forest green parks, and enlarge road/label names
        try {
            // Reset filter cache and view state so they are re-cached and re-applied to the fresh style
            placeLabelFilterController.reset();

            // Cache original road colors so we can restore them when switching back from Satellite hybrid map
            originalRoadColors = {};
            const cacheRoadLayers = [
                'road_service_case', 'road_minor_case', 'road_pri_case_ramp', 'road_trunk_case_ramp', 'road_mot_case_ramp',
                'road_sec_case_noramp', 'road_pri_case_noramp', 'road_trunk_case_noramp', 'road_mot_case_noramp', 'road_path',
                'road_service_fill', 'road_minor_fill', 'road_pri_fill_ramp', 'road_trunk_fill_ramp', 'road_mot_fill_ramp',
                'road_sec_fill_noramp', 'road_pri_fill_noramp', 'road_trunk_fill_noramp', 'road_mot_fill_noramp',
                'tunnel_service_case', 'tunnel_minor_case', 'tunnel_sec_case', 'tunnel_pri_case', 'tunnel_trunk_case', 'tunnel_mot_case',
                'tunnel_path', 'tunnel_service_fill', 'tunnel_minor_fill', 'tunnel_sec_fill', 'tunnel_pri_fill', 'tunnel_trunk_fill',
                'tunnel_mot_fill', 'tunnel_rail', 'tunnel_rail_dash', 'rail', 'rail_dash',
                'bridge_service_case', 'bridge_minor_case', 'bridge_sec_case', 'bridge_pri_case', 'bridge_trunk_case', 'bridge_mot_case',
                'bridge_path', 'bridge_service_fill', 'bridge_minor_fill', 'bridge_sec_fill', 'bridge_pri_fill', 'bridge_trunk_fill',
                'bridge_mot_fill'
            ];
            cacheRoadLayers.forEach(lId => {
                if (state.map.getLayer(lId)) {
                    originalRoadColors[lId] = state.map.getPaintProperty(lId, 'line-color');
                }
            });

            const isLightMapMode = document.body.classList.contains("theme-light") || (document.documentElement.getAttribute("data-theme") === "light");

            applyVectorThemeStyles(state.map, isLightMapMode);

            // Set initial road network line opacity dynamically: semi-transparent white on satellite, solid default on dark
            const isSatelliteInitial = (state.currentBaseLayer || 'dark') === 'satellite';
            const initialRoadLayers = [
                'road_service_case', 'road_minor_case', 'road_pri_case_ramp', 'road_trunk_case_ramp', 'road_mot_case_ramp',
                'road_sec_case_noramp', 'road_pri_case_noramp', 'road_trunk_case_noramp', 'road_mot_case_noramp', 'road_path',
                'road_service_fill', 'road_minor_fill', 'road_pri_fill_ramp', 'road_trunk_fill_ramp', 'road_mot_fill_ramp',
                'road_sec_fill_noramp', 'road_pri_fill_noramp', 'road_trunk_fill_noramp', 'road_mot_fill_noramp',
                'tunnel_service_case', 'tunnel_minor_case', 'tunnel_sec_case', 'tunnel_pri_case', 'tunnel_trunk_case', 'tunnel_mot_case',
                'tunnel_path', 'tunnel_service_fill', 'tunnel_minor_fill', 'tunnel_sec_fill', 'tunnel_pri_fill', 'tunnel_trunk_fill',
                'tunnel_mot_fill', 'tunnel_rail', 'tunnel_rail_dash', 'rail', 'rail_dash',
                'bridge_service_case', 'bridge_minor_case', 'bridge_sec_case', 'bridge_pri_case', 'bridge_trunk_case', 'bridge_mot_case',
                'bridge_path', 'bridge_service_fill', 'bridge_minor_fill', 'bridge_sec_fill', 'bridge_pri_fill', 'bridge_trunk_fill',
                'bridge_mot_fill'
            ];
            initialRoadLayers.forEach(lId => {
                if (state.map.getLayer(lId)) {
                    state.map.setPaintProperty(lId, 'line-opacity', isSatelliteInitial ? 0.35 : 1.0);
                    if (isSatelliteInitial) {
                        state.map.setPaintProperty(lId, 'line-color', '#ffffff');
                    } else if (originalRoadColors[lId] !== undefined) {
                        state.map.setPaintProperty(lId, 'line-color', originalRoadColors[lId]);
                    }
                }
            });

            // Run place filter initially
            updatePlaceLabelsFilter();
        } catch(e) {
            console.error("Error applying styling tweaks to vector layers:", e);
        }
    });
}

export function selectMapStyleByIndex(index, {
    state: mapState = state,
    documentObject = globalThis.document,
    notify = showToast
} = {}) {
    if (!mapState.baseMapsList || mapState.baseMapsList.length === 0 || !mapState.map) return;
    if (index < 0 || index >= mapState.baseMapsList.length) return;

    const targetItem = mapState.baseMapsList[index];
    mapState.baseMapsList.forEach(item => {
        if (item === targetItem) {
            if (!mapState.map.hasLayer(item.layer)) {
                mapState.map.addLayer(item.layer);
            }
        } else {
            if (mapState.map.hasLayer(item.layer)) {
                mapState.map.removeLayer(item.layer);
            }
        }
    });

    const layersControlEl = documentObject?.querySelector('.map-ctrl-styles');
    if (layersControlEl) {
        const inputs = layersControlEl.querySelectorAll('input[type="radio"]');
        if (inputs && inputs[index]) {
            inputs[index].checked = true;
        }
    }

    notify(`Map Style: ${targetItem.name}`);
}



export function addZoneFeatureLayers(map, geojsonData) {
    map.addSource('zones', {
        type: 'geojson',
        data: geojsonData,
        promoteId: 'feature_id'
    });
    const beforeId = map.getLayer('place_hamlet') ? 'place_hamlet' : undefined;
    const addLayer = layer => beforeId ? map.addLayer(layer, beforeId) : map.addLayer(layer);

    addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones',
        paint: {
            'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], getThemeAccent(), '#ffffff'],
            'fill-opacity': [
                'case',
                ['boolean', ['feature-state', 'selected'], false], 0.0,
                ['match', ['get', 'cid'], 'Oakridge', 0.02, 'Cottage Grove', 0.02, 0.07]
            ],
            'fill-color-transition': { duration: 0 },
            'fill-opacity-transition': { duration: 0 }
        }
    });

    addLayer({
        id: 'zones-outline',
        type: 'line',
        source: 'zones',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': [
                'case',
                ['boolean', ['feature-state', 'selected'], false], getThemeAccentLight(),
                ['match', ['get', 'cid'], 'Oakridge', 'rgba(255, 255, 255, 0.25)', 'Cottage Grove', 'rgba(255, 255, 255, 0.25)', '#ffffff']
            ],
            'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.2, 1.0],
            'line-color-transition': { duration: 0 },
            'line-width-transition': { duration: 0 },
            'line-opacity-transition': { duration: 0 }
        }
    });

    addLayer({
        id: 'zones-outline-highlight',
        type: 'line',
        source: 'zones',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], getThemeAccentLight(), 'transparent'],
            'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3.2, 0.0],
            'line-color-transition': { duration: 250 },
            'line-width-transition': { duration: 250 }
        }
    });

    addLayer({
        id: 'zones-collision-labels',
        type: 'symbol',
        source: 'zones',
        layout: {
            'text-field': ['get', 'feature_id'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 8, 14, 12, 18, 14, 20],
            'text-ignore-placement': false,
            'text-allow-overlap': false,
            'text-padding': 10
        },
        paint: { 'text-color': 'rgba(0,0,0,0)', 'text-halo-color': 'rgba(0,0,0,0)' }
    });
}

export function buildZoneFeatureData(features, isCirclesView) {
    const grouped = {};
    (features || []).forEach(feature => {
        const properties = feature.properties || {};
        const id = isCirclesView ? String(properties.cid || '') : String(properties.zid || '');
        if (!id) return;

        if (!grouped[id]) {
            grouped[id] = {
                type: 'Feature',
                id,
                properties: { ...properties, feature_id: id },
                geometry: { type: 'MultiPolygon', coordinates: [] }
            };
        }

        const geometry = feature.geometry;
        if (geometry?.type === 'Polygon') grouped[id].geometry.coordinates.push(geometry.coordinates);
        else if (geometry?.type === 'MultiPolygon') grouped[id].geometry.coordinates.push(...geometry.coordinates);
        else if (geometry) grouped[id].geometry = geometry;
    });

    const geojsonData = { type: 'FeatureCollection', features: Object.values(grouped) };
    const labelData = geojsonData.features.map(feature => {
        const bounds = getBbox([feature]);
        const insidePoint = findPointInsidePolygon(feature.geometry);
        const center = insidePoint || [
            (bounds[0][0] + bounds[1][0]) / 2,
            (bounds[0][1] + bounds[1][1]) / 2
        ];
        const text = isCirclesView ? String(feature.properties.cid || '') : String(feature.properties.zid || '');
        return {
            id: feature.id,
            lng: center[0],
            lat: center[1],
            text,
            degWidth: bounds[1][0] - bounds[0][0],
            textLen: text.length,
            isCircle: !!feature.properties.cid && !feature.properties.zid
        };
    });

    return { geojsonData, labelData };
}
