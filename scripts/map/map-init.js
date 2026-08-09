import { state } from '../state.js';
import { MAP_STYLES } from '../config/map-styles.js';
import { updateAllFeatureStyles } from './map-layers.js';

export function switchBaseMap(baseMapId) {
    if (!state.map || !state.baseMapsList) return;
    const targetMap = state.baseMapsList.find(b => b.id === baseMapId);
    if (!targetMap) return;
    
    state.baseMapsList.forEach(bm => {
        if (state.map.getLayer(bm.layerId)) {
            state.map.setLayoutProperty(bm.layerId, 'visibility', bm.layerId === targetMap.layerId ? 'visible' : 'none');
        }
        const lowResLayerId = `${bm.layerId}-low`;
        if (state.map.getLayer(lowResLayerId)) {
            state.map.setLayoutProperty(lowResLayerId, 'visibility', bm.layerId === targetMap.layerId ? 'visible' : 'none');
        }
    });
    state.currentBaseLayer = baseMapId;

    // Apply road network line opacity dynamically: semi-transparent on satellite, solid on dark
    const isSatellite = baseMapId === 'satellite';
    const roadLayers = [
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
    roadLayers.forEach(lId => {
        if (state.map.getLayer(lId)) {
            state.map.setPaintProperty(lId, 'line-opacity', isSatellite ? 0.35 : 1.0);
            if (isSatellite) {
                state.map.setPaintProperty(lId, 'line-color', '#ffffff');
            } else if (state._originalRoadColors && state._originalRoadColors[lId] !== undefined) {
                state.map.setPaintProperty(lId, 'line-color', state._originalRoadColors[lId]);
            }
        }
    });

    const tileMapEl = document.getElementById("tile-map");
    if (tileMapEl) {
        tileMapEl.style.setProperty("background-color", "#000000", "important");
        tileMapEl.style.setProperty("background", "#000000", "important");
    }

    const mapWrapper = document.getElementById("map-wrapper");
    if (mapWrapper) {
        if (baseMapId === "esri-street" || baseMapId === "esri-topo") {
            mapWrapper.classList.add("is-light-basemap");
        } else {
            mapWrapper.classList.remove("is-light-basemap");
        }
    }

    if (typeof updateAllFeatureStyles === "function") {
        updateAllFeatureStyles();
    }
}
