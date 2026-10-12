import { state } from '../state.js';
import { openBirdObservationPopup } from '../components/bird-observation-view.js';

function isLightTheme(documentObject) {
    return documentObject?.body?.classList?.contains('theme-light') ||
        documentObject?.documentElement?.getAttribute('data-theme') === 'light';
}

export function updateBirdObservationsLayerStyles(mapState = state, documentObject = globalThis.document) {
    if (!mapState.map) return;
    const light = isLightTheme(documentObject);
    const color = light ? '#000000' : '#ffffff';

    if (mapState.map.getLayer('bird-observations-points')) {
        mapState.map.setPaintProperty('bird-observations-points', 'circle-color', color);
        mapState.map.setPaintProperty('bird-observations-points', 'circle-stroke-width', 0);
        mapState.map.setPaintProperty('bird-observations-points', 'circle-stroke-color', 'transparent');
        mapState.map.setPaintProperty('bird-observations-points', 'circle-radius', 5);
        mapState.map.setPaintProperty('bird-observations-points', 'circle-opacity', 0.95);
    }
    if (mapState.map.getLayer('bird-observations-glow')) {
        mapState.map.setPaintProperty('bird-observations-glow', 'circle-color', color);
        mapState.map.setPaintProperty('bird-observations-glow', 'circle-opacity', light ? 0.15 : 0.25);
    }
}

export function setupBirdObservationsLayer({
    state: mapState = state,
    documentObject = globalThis.document,
    onOpenPopup = openBirdObservationPopup
} = {}) {
    if (!mapState.map) return;

    const map = mapState.map;
    if (!map.getSource('bird-observations')) {
        map.addSource('bird-observations', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });
    }

    const light = isLightTheme(documentObject);
    const color = light ? '#000000' : '#ffffff';
    if (!map.getLayer('bird-observations-glow')) {
        map.addLayer({
            id: 'bird-observations-glow',
            type: 'circle',
            source: 'bird-observations',
            paint: {
                'circle-radius': 11,
                'circle-color': color,
                'circle-opacity': light ? 0.15 : 0.25,
                'circle-blur': 0.6
            }
        });
    }

    if (map.getLayer('bird-observations-points')) return;
    map.addLayer({
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

    map.on('mouseenter', 'bird-observations-points', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'bird-observations-points', () => {
        map.getCanvas().style.cursor = '';
    });
    map.on('click', 'bird-observations-points', event => {
        if (event.features?.[0]) onOpenPopup(event.features[0]);
    });
}
