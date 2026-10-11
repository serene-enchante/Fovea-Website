import { isPointInGeoJSONGeometry } from '../utils/geometry-math.js';
import { displayZoneId } from '../utils/format-utils.js';
import { showToast } from '../components/toast-view.js';
import { state } from '../state.js';
import { updateAllFeatureStyles } from './map-layers.js';

export function createMapInstance(mapLibre, options) {
    if (typeof mapLibre?.Map !== 'function') {
        throw new Error('MapLibre is unavailable');
    }
    return new mapLibre.Map(options);
}

export function switchBaseMap(baseMapId, { state: mapState = state, updateStyles = updateAllFeatureStyles } = {}) {
    if (!mapState.map || !mapState.baseMapsList) return;
    const targetId = baseMapId === 'dark' || baseMapId === 'default' ? 'default' : baseMapId;
    const targetMap = mapState.baseMapsList.find(item => item.id === targetId) || mapState.baseMapsList[0];
    if (!targetMap) return;

    mapState.baseMapsList.forEach(item => {
        if (mapState.map.getLayer(item.layerId)) {
            mapState.map.setLayoutProperty(item.layerId, 'visibility', item.id === targetId ? 'visible' : 'none');
        }
        const lowResLayerId = `${item.layerId}-low`;
        if (mapState.map.getLayer(lowResLayerId)) {
            mapState.map.setLayoutProperty(lowResLayerId, 'visibility', item.id === targetId ? 'visible' : 'none');
        }
    });
    mapState.currentBaseLayer = targetId;

    if (targetId === 'default') {
        ['base-satellite', 'base-esri-street', 'base-esri-topo', 'base-dark-raster'].forEach(layerId => {
            if (mapState.map.getLayer(layerId)) mapState.map.setLayoutProperty(layerId, 'visibility', 'none');
        });
    }

    const isSatellite = targetId === 'satellite';
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
    roadLayers.forEach(layerId => {
        if (!mapState.map.getLayer(layerId)) return;
        mapState.map.setPaintProperty(layerId, 'line-opacity', isSatellite ? 0.35 : 1.0);
        if (isSatellite) mapState.map.setPaintProperty(layerId, 'line-color', '#ffffff');
        else if (mapState._originalRoadColors?.[layerId] !== undefined) {
            mapState.map.setPaintProperty(layerId, 'line-color', mapState._originalRoadColors[layerId]);
        }
    });

    const isLightMode = document.body.classList.contains('theme-light') || targetId === 'esri-street' || targetId === 'esri-topo';
    const tileMap = document.getElementById('tile-map');
    if (tileMap) {
        const background = isLightMode ? '#f8f9fa' : '#000000';
        tileMap.style.setProperty('background-color', background, 'important');
        tileMap.style.setProperty('background', background, 'important');
    }
    const mapWrapper = document.getElementById('map-wrapper');
    if (mapWrapper) {
        if (targetId === 'esri-street' || targetId === 'esri-topo' || (targetId === 'default' && isLightMode)) {
            mapWrapper.classList.add('is-light-basemap');
        } else {
            mapWrapper.classList.remove('is-light-basemap');
        }
    }
    updateStyles();
}

let watchId = null;
let activeGeolocation = null;

function createAccuracyCircle(lng, lat, radiusMeters, pointCount = 64) {
    const coordinates = [];
    const earthRadius = 6371008.8;
    const angularRadius = Math.max(0, radiusMeters) / earthRadius;
    const latitude = lat * Math.PI / 180;
    const longitude = lng * Math.PI / 180;

    for (let index = 0; index <= pointCount; index += 1) {
        const bearing = index / pointCount * Math.PI * 2;
        const destinationLatitude = Math.asin(
            Math.sin(latitude) * Math.cos(angularRadius) +
            Math.cos(latitude) * Math.sin(angularRadius) * Math.cos(bearing)
        );
        const destinationLongitude = longitude + Math.atan2(
            Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(latitude),
            Math.cos(angularRadius) - Math.sin(latitude) * Math.sin(destinationLatitude)
        );
        coordinates.push([destinationLongitude * 180 / Math.PI, destinationLatitude * 180 / Math.PI]);
    }

    return {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [coordinates] }
    };
}

export function updateUserLocationOnMap(lng, lat, accuracy, mapState = state, onLocationUpdated = checkUserLocationZone) {
    if (!mapState.map || !Number.isFinite(lng) || !Number.isFinite(lat)) return;

    if (!mapState.userLocationMarker) {
        const markerElement = document.createElement('div');
        markerElement.className = 'user-location-marker';
        markerElement.setAttribute('aria-label', 'Your location');
        markerElement.innerHTML = '<span class="user-location-dot"></span>';
        mapState.userLocationMarker = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
            .setLngLat([lng, lat])
            .addTo(mapState.map);
    } else {
        mapState.userLocationMarker.setLngLat([lng, lat]);
    }

    const circleFeature = createAccuracyCircle(lng, lat, Number.isFinite(accuracy) ? accuracy : 0);
    const accuracySource = mapState.map.getSource('user-accuracy-source');
    if (accuracySource) {
        accuracySource.setData(circleFeature);
    } else if (mapState.map.isStyleLoaded()) {
        mapState.map.addSource('user-accuracy-source', {
            type: 'geojson',
            data: circleFeature
        });
        mapState.map.addLayer({
            id: 'user-accuracy-layer',
            type: 'fill',
            source: 'user-accuracy-source',
            paint: {
                'fill-color': '#64b5f6',
                'fill-opacity': 0.16,
                'fill-outline-color': '#64b5f6'
            }
        });
    } else {
        mapState.map.once('load', () => {
            if (!mapState.isLocating || !mapState.map || mapState.map.getSource('user-accuracy-source')) return;
            mapState.map.addSource('user-accuracy-source', {
                type: 'geojson',
                data: circleFeature
            });
            mapState.map.addLayer({
                id: 'user-accuracy-layer',
                type: 'fill',
                source: 'user-accuracy-source',
                paint: {
                    'fill-color': '#64b5f6',
                    'fill-opacity': 0.16,
                    'fill-outline-color': '#64b5f6'
                }
            });
        });
    }

    mapState.userLocationAccuracy = accuracy;
    onLocationUpdated(mapState.userLocationMarker.getLngLat());
}

export function checkUserLocationZone(latlng, mapState = state) {
    const badge = document.getElementById("user-location-badge");
    if (!badge) return;

    if (!mapState.isLocating || !latlng) {
        badge.classList.remove("is-visible");
        badge.innerHTML = "";
        return;
    }

    const lng = latlng.lng;
    const lat = latlng.lat;

    let foundFeature = null;
    for (let f of mapState.allFeatures) {
        if (isPointInGeoJSONGeometry(lng, lat, f.geometry)) {
            foundFeature = f;
            break;
        }
    }

    if (foundFeature) {
        const props = foundFeature.properties || {};
        let zoneName = "";
        if (mapState.isCirclesFeature) {
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

export function toggleLocationTracking(mapState = state, {
    geolocation = globalThis.navigator?.geolocation,
    notify = showToast,
    checkLocation = latlng => checkUserLocationZone(latlng, mapState)
} = {}) {
    if (!mapState.map) return;
    const locateControlEl = document.querySelector(".map-ctrl-locate");

    if (mapState.isLocating) {
        mapState.isLocating = false;
        if (watchId !== null) {
            activeGeolocation?.clearWatch(watchId);
            watchId = null;
            activeGeolocation = null;
        }
        if (mapState.userLocationMarker) {
            mapState.userLocationMarker.remove();
            mapState.userLocationMarker = null;
        }
        if (mapState.map.getSource('user-accuracy-source')) {
            if (mapState.map.getLayer('user-accuracy-layer')) mapState.map.removeLayer('user-accuracy-layer');
            mapState.map.removeSource('user-accuracy-source');
        }
        if (locateControlEl) locateControlEl.classList.remove("is-active");
        checkLocation(null);
    } else {
        mapState.isLocating = true;
        if (locateControlEl) locateControlEl.classList.add("is-active");
        
        if (!geolocation) {
            notify("Geolocation is not supported by your browser");
            mapState.isLocating = false;
            if (locateControlEl) locateControlEl.classList.remove("is-active");
            return;
        }

        activeGeolocation = geolocation;
        watchId = geolocation.watchPosition(
            (position) => {
                const lng = position.coords.longitude;
                const lat = position.coords.latitude;
                const accuracy = position.coords.accuracy;
                updateUserLocationOnMap(lng, lat, accuracy, mapState, checkLocation);
            },
            (error) => {
                console.error("Location error:", error);
                mapState.isLocating = false;
                watchId = null;
                activeGeolocation = null;
                if (locateControlEl) locateControlEl.classList.remove("is-active");
                checkLocation(null);
                notify("Unable to access device location");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }
}
