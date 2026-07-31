import { getThemeAccent, getThemeAccentLight } from "../utils/color-utils.js";
import { normalizeZoneId } from "../utils/format-utils.js";
import { state } from '../maps-tile.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { showToast } from '../components/toast-view.js'; // Might be needed for selectMapStyleByIndex

// Exported feature expressions & layer logic
export function toExpression(f) {
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

export function updatePlaceLabelsFilter() {
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

export function updateAllFeatureStyles() {
    if (!state.map || !state.map.getSource('zones')) return;
    
    // Dynamically filter circle place names from basemap on circles overview view
    try {
        updatePlaceLabelsFilter();
    } catch(e) { console.warn("Error updating place labels filter:", e); }
    
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

    // Determine geometry styling based on active basemap (thick black outline & transparent deep blue fill for Esri Street/Topo, white for Dark/Satellite)
    const isLightBasemap = state.currentBaseLayer === "esri-street" || state.currentBaseLayer === "esri-topo";
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
        defaultFillColor = '#0d47a1';
        defaultFillOpacity = 0.22;
    } else if (isSatelliteBasemap) {
        defaultFillColor = '#000000'; // black fill for satellite only
        defaultFillOpacity = 0.75; // unselected black fill opacity increased significantly for satellite
    }

    const defaultLineColor = isLightBasemap ? '#000000' : '#ffffff';
    const dimLineColor = isLightBasemap ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.25)';
    const defaultLineWidth = isLightBasemap ? 2.8 : 1.0;

    const noDataFillColor = isLightBasemap ? '#8e8e93' : defaultFillColor;
    const noDataFillOpacity = isLightBasemap ? 0.30 : (isSatelliteBasemap ? 0.60 : 0.02);
    const noDataLineColor = isLightBasemap ? 'rgba(80, 80, 80, 0.60)' : dimLineColor;

    const hoverFillColor = isLightBasemap ? '#1e293b' : '#3f3f46';
    const hoverFillOpacity = isLightBasemap ? 0.10 : (isSatelliteBasemap ? 0.88 : 0.05);
    const noDataHoverFillOpacity = isLightBasemap ? 0.06 : (isSatelliteBasemap ? 0.75 : 0.02);

    const selectedFillColor = getThemeAccent();
    const selectedFillOpacity = 0.0;
    const selectedLineColor = getThemeAccentLight();
    const unselectedOutlineOpacity = isSatelliteBasemap ? 0.70 : 0.18; // significantly increased unselected outline opacity for satellite

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

export function rebuildHtmlLabels() {
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
    const isLightBasemap = state.currentBaseLayer === 'esri-street' || state.currentBaseLayer === 'esri-topo';

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
        el.style.color = isLightBasemap ? '#111' : '#c8c8c8';
        el.style.textShadow = isLightBasemap
            ? '0 0 4px rgba(255,255,255,0.95), 0 0 6px rgba(255,255,255,0.9)'
            : '0 0 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)';
    });
}

export function setupMapLayers(state) {
    state.map.on('style.load', () => {
        state.map.setProjection({ type: 'globe' });

        // 1. Add raster sources programmatically
        try {
            state.map.addSource('satellite-tiles', {
                type: 'raster',
                tiles: [
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                ],
                tileSize: 128,
                maxzoom: 18
            });
        } catch(e) { console.warn("Error adding satellite-tiles source:", e); }

        try {
            state.map.addSource('esri-street-tiles', {
                type: 'raster',
                tiles: [
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                ],
                tileSize: 256,
                maxzoom: 18
            });
        } catch(e) { console.warn("Error adding esri-street-tiles source:", e); }

        try {
            state.map.addSource('esri-topo-tiles', {
                type: 'raster',
                tiles: [
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                ],
                tileSize: 256,
                maxzoom: 18
            });
        } catch(e) { console.warn("Error adding esri-topo-tiles source:", e); }

        try {
            state.map.addSource('dark-tiles', {
                type: 'raster',
                tiles: [
                    "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
                    "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
                    "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
                    "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
                ],
                tileSize: 128,
                maxzoom: 19
            });
        } catch(e) { console.warn("Error adding dark-tiles source:", e); }

        // 2. Add raster layers on top of vector layers (initially hidden unless active)
        const activeLayerId = state.currentBaseLayer || "dark";

        // Insert satellite layer below road network/labels so street lines and labels render as an overlay on top of satellite imagery
        const beforeId = state.map.getLayer('tunnel_service_case') ? 'tunnel_service_case' :
                         (state.map.getLayer('road_service_case') ? 'road_service_case' :
                         (state.map.getLayer('waterway_label') ? 'waterway_label' : undefined));

        try {
            state.map.addLayer({
                id: 'base-satellite',
                type: 'raster',
                source: 'satellite-tiles',
                minzoom: 0,
                maxzoom: 22,
                layout: { visibility: activeLayerId === 'satellite' ? 'visible' : 'none' }
            }, beforeId);
        } catch(e) { console.warn("Error adding base-satellite layer:", e); }

        try {
            state.map.addLayer({
                id: 'base-esri-street',
                type: 'raster',
                source: 'esri-street-tiles',
                minzoom: 0,
                maxzoom: 22,
                layout: { visibility: activeLayerId === 'esri-street' ? 'visible' : 'none' }
            });
        } catch(e) { console.warn("Error adding base-esri-street layer:", e); }

        try {
            state.map.addLayer({
                id: 'base-esri-topo',
                type: 'raster',
                source: 'esri-topo-tiles',
                minzoom: 0,
                maxzoom: 22,
                layout: { visibility: activeLayerId === 'esri-topo' ? 'visible' : 'none' }
            });
        } catch(e) { console.warn("Error adding base-esri-topo layer:", e); }

        try {
            state.map.addLayer({
                id: 'base-dark-raster',
                type: 'raster',
                source: 'dark-tiles',
                minzoom: 0,
                maxzoom: 22,
                layout: { visibility: activeLayerId === 'dark-raster' ? 'visible' : 'none' }
            });
        } catch(e) { console.warn("Error adding base-dark-raster layer:", e); }

        // 3. Tweak vector styles to brighten land, forest green parks, and enlarge road/label names
        try {
            // Reset filter cache and view state so they are re-cached and re-applied to the fresh style
            state._lastHiddenCircleNames = null;
            state._originalPlaceFilters = null;

            // Cache original road colors so we can restore them when switching back from Satellite hybrid map
            state._originalRoadColors = {};
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
                    state._originalRoadColors[lId] = state.map.getPaintProperty(lId, 'line-color');
                }
            });

            // Brighten land covers (originally very dark #0e0e0e) to slate-charcoal (#1a1b1e) to separate from black map boundaries
            const landColor = '#1a1b1e';
            const landLayers = ['background', 'landcover', 'park_national_park', 'park_nature_reserve', 'landuse'];
            landLayers.forEach(lId => {
                if (state.map.getLayer(lId)) {
                    if (lId === 'background') {
                        state.map.setPaintProperty(lId, 'background-color', landColor);
                    } else {
                        state.map.setPaintProperty(lId, 'fill-color', landColor);
                    }
                }
            });

            // Tweak parks to have a very subtle forest-green tint (#161c18)
            const parkLayers = ['park_national_park', 'park_nature_reserve'];
            parkLayers.forEach(lId => {
                if (state.map.getLayer(lId)) {
                    state.map.setPaintProperty(lId, 'fill-color', '#161c18');
                }
            });

            // Tweak waterway color for compatibility
            if (state.map.getLayer('waterway')) {
                state.map.setPaintProperty('waterway', 'line-color', '#242a30');
            }

            // 4. Substantially enlarge road names and brighten them
            if (state.map.getLayer('roadname_minor')) {
                state.map.setLayoutProperty('roadname_minor', 'text-size', 11.5);
                state.map.setPaintProperty('roadname_minor', 'text-color', 'rgba(165, 165, 165, 0.85)');
            }
            if (state.map.getLayer('roadname_sec')) {
                state.map.setLayoutProperty('roadname_sec', 'text-size', {
                    stops: [[14, 11], [16, 13.5], [18, 15.5]]
                });
                state.map.setPaintProperty('roadname_sec', 'text-color', 'rgba(185, 185, 185, 0.9)');
            }
            if (state.map.getLayer('roadname_pri')) {
                state.map.setLayoutProperty('roadname_pri', 'text-size', {
                    stops: [[13, 11], [15, 13], [16, 14.5], [18, 16.5]]
                });
                state.map.setPaintProperty('roadname_pri', 'text-color', 'rgba(215, 215, 215, 0.95)');
            }
            if (state.map.getLayer('roadname_major')) {
                // Major roads text was `#383838` (practically invisible black). Set to readable `#ebebeb`.
                state.map.setLayoutProperty('roadname_major', 'text-size', {
                    stops: [[13, 11.5], [15, 13.5], [16, 15], [18, 17.5]]
                });
                state.map.setPaintProperty('roadname_major', 'text-color', 'rgba(235, 235, 235, 1)');
            }

            // 5. Style place, town, and city labels in elegant slate-blue and restore standard casing (Mixed Case)
            const placeLayers = [
                'place_city_r5',
                'place_city_r6',
                'place_town',
                'place_village',
                'place_suburb',
                'place_neighbourhood',
                'place_hamlet'
            ];

            const placeColors = {
                'place_city_r5': '#b6d3e6', // Brightest warm sky-blue
                'place_city_r6': '#a2c2d6', // Muted ice-blue
                'place_town': '#8eb1c7',     // Muted slate-blue
                'place_village': '#7d9eb3',  // Muted slate-blue
                'place_suburb': '#6e8c9f',   // Muted gray-blue
                'place_neighbourhood': '#607a8b', // Muted dark gray-blue
                'place_hamlet': '#526877'     // Muted dark gray-blue
            };

            if (state.map.getLayer('place_town')) {
                state.map.setLayoutProperty('place_town', 'text-size', {
                    stops: [[8, 11.5], [10, 13], [13, 15.5], [14, 17]]
                });
            }
            if (state.map.getLayer('place_city_r6')) {
                state.map.setLayoutProperty('place_city_r6', 'text-size', {
                    stops: [[8, 13], [10, 15.5], [13, 19], [14, 21.5]]
                });
            }
            if (state.map.getLayer('place_city_r5')) {
                state.map.setLayoutProperty('place_city_r5', 'text-size', {
                    stops: [[8, 15], [10, 17.5], [13, 21], [14, 23.5]]
                });
            }

            placeLayers.forEach(lId => {
                if (state.map.getLayer(lId)) {
                    const color = placeColors[lId] || '#e2bd7e';
                    state.map.setPaintProperty(lId, 'text-color', color);
                    state.map.setLayoutProperty(lId, 'text-transform', 'none');
                }
            });

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
                    } else if (state._originalRoadColors && state._originalRoadColors[lId] !== undefined) {
                        state.map.setPaintProperty(lId, 'line-color', state._originalRoadColors[lId]);
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

export function selectMapStyleByIndex(index) {
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

