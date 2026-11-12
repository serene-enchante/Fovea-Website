const SOURCE_ID = 'supplemental-surface-water';
const FILL_LAYER_ID = 'supplemental-surface-water-fill';
export const SUPPLEMENTAL_SURFACE_WATER_ENABLED = false;

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
            minzoom: 5,
            paint: {
                'fill-color': isLightMapMode ? '#a8cbdf' : '#31556b',
                'fill-opacity': isLightMapMode ? 0.9 : 0.88,
                'fill-outline-color': isLightMapMode ? '#8cb7ce' : '#426d84'
            }
        }, firstRoadLayer?.id);
    } else {
        map.setPaintProperty(FILL_LAYER_ID, 'fill-color', isLightMapMode ? '#a8cbdf' : '#31556b');
        map.setPaintProperty(FILL_LAYER_ID, 'fill-opacity', isLightMapMode ? 0.9 : 0.88);
        map.setPaintProperty(FILL_LAYER_ID, 'fill-outline-color', isLightMapMode ? '#8cb7ce' : '#426d84');
    }
}
