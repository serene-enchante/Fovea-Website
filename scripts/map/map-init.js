import { isPointInGeoJSONGeometry } from '../utils/geometry-math.js';
import { displayZoneId } from '../utils/format-utils.js';
import { showToast } from '../components/toast-view.js';
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

let watchId = null;

// Stub for missing function from original code
function updateUserLocationOnMap(lng, lat, accuracy) {
    console.warn("updateUserLocationOnMap called but not fully implemented.", lng, lat, accuracy);
}

export function checkUserLocationZone(latlng) {
    const badge = document.getElementById("user-location-badge");
    if (!badge) return;

    if (!state.isLocating || !latlng) {
        badge.classList.remove("is-visible");
        badge.innerHTML = "";
        return;
    }

    const lng = latlng.lng;
    const lat = latlng.lat;

    let foundFeature = null;
    for (let f of state.allFeatures) {
        if (isPointInGeoJSONGeometry(lng, lat, f.geometry)) {
            foundFeature = f;
            break;
        }
    }

    if (foundFeature) {
        const props = foundFeature.properties || {};
        let zoneName = "";
        if (state.isCirclesFeature) {
            zoneName = props.cid || "Circle";
        } else {
            const zid = displayZoneId(props.zid);
            zoneName = `Zone ${zid}`;
        }
        badge.innerHTML = `<span class="map-location-badge__dot"></span><span>You are in ${zoneName}</span>`;
        badge.classList.add("is-visible");
    } else {
        badge.classList.remove("is-visible");
        badge.innerHTML = "";
    }
}

export function toggleLocationTracking() {
    if (!state.map) return;
    const locateControlEl = document.querySelector(".map-ctrl-locate");

    if (state.isLocating) {
        state.isLocating = false;
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
        if (state.userLocationMarker) {
            state.userLocationMarker.remove();
            state.userLocationMarker = null;
        }
        if (state.map.getSource('user-accuracy-source')) {
            if (state.map.getLayer('user-accuracy-layer')) state.map.removeLayer('user-accuracy-layer');
            state.map.removeSource('user-accuracy-source');
        }
        if (locateControlEl) locateControlEl.classList.remove("is-active");
        checkUserLocationZone(null);
    } else {
        state.isLocating = true;
        if (locateControlEl) locateControlEl.classList.add("is-active");
        
        if (!navigator.geolocation) {
            showToast("Geolocation is not supported by your browser");
            state.isLocating = false;
            if (locateControlEl) locateControlEl.classList.remove("is-active");
            return;
        }

        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const lng = position.coords.longitude;
                const lat = position.coords.latitude;
                const accuracy = position.coords.accuracy;
                updateUserLocationOnMap(lng, lat, accuracy);
            },
            (error) => {
                console.error("Location error:", error);
                state.isLocating = false;
                if (locateControlEl) locateControlEl.classList.remove("is-active");
                checkUserLocationZone(null);
                showToast("Unable to access device location");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }
}

export function preloadGlobalLowResTiles() {
    const tileUrls = [];
    
    // 1. Dark tiles (balanced across a, b, c, d subdomains)
    const darkSubdomains = ['a', 'b', 'c', 'd'];
    for (let z = 0; z <= 2; z++) {
        const limit = Math.pow(2, z);
        for (let x = 0; x < limit; x++) {
            for (let y = 0; y < limit; y++) {
                const subdomain = darkSubdomains[(x + y) % 4];
                tileUrls.push(`https://${subdomain}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`);
            }
        }
    }
    
    // 2. Satellite, Street, Topo tiles
    const templates = [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
    ];
    
    templates.forEach(template => {
        for (let z = 0; z <= 2; z++) {
            const limit = Math.pow(2, z);
            for (let x = 0; x < limit; x++) {
                for (let y = 0; y < limit; y++) {
                    tileUrls.push(template.replace("{z}", z).replace("{y}", y).replace("{x}", x));
                }
            }
        }
    });

    // Load all in parallel via browser cache preloading
    tileUrls.forEach(url => {
        const img = new Image();
        img.src = url;
    });
}
