const SOURCE_ID = 'supplemental-surface-water';
const FILL_LAYER_ID = 'supplemental-surface-water-fill';
const MAX_MAP_ZOOM = 20;
export const SUPPLEMENTAL_SURFACE_WATER_ENABLED = true;

const fillOpacity = [
    'case',
    ['==', ['get', 'kind'], 'river'],
    0.9,
    ['interpolate', ['linear'], ['zoom'],
        6, 0.92,
        10, 0.9,
        12, 0.55,
        13, 0
    ]
];

export function addSurfaceWaterLayer(map, isLightMapMode) {
    if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
            type: 'geojson',
            data: new URL('../../geojson/eugene-lane-surface-water.geojson', import.meta.url).href,
            attribution: 'Water polygons: USGS NHDPlus High Resolution'
        });
    }

    if (!map.getLayer(FILL_LAYER_ID)) {
        // Draw water above the basemap's land fills and below roads and labels.
        const firstRoadLayer = map.getStyle()?.layers?.find(layer =>
            /^(road|bridge|tunnel)_/.test(layer.id)
        );
        map.addLayer({
            id: FILL_LAYER_ID,
            type: 'fill',
            source: SOURCE_ID,
            minzoom: 6,
            maxzoom: MAX_MAP_ZOOM,
            filter: ['>=', ['get', 'area_sq_km'], 1],
            paint: {
                'fill-color': isLightMapMode ? '#88bdd8' : '#315d74',
                'fill-opacity': fillOpacity
            }
        }, firstRoadLayer?.id);
    } else {
        map.setPaintProperty(FILL_LAYER_ID, 'fill-color', isLightMapMode ? '#88bdd8' : '#315d74');
        map.setPaintProperty(FILL_LAYER_ID, 'fill-opacity', fillOpacity);
    }
}
