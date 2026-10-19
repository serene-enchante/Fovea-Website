import { getThemeAccent } from '../utils/color-utils.js';

export function ensureSuggestionAnnotationLayers(map) {
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
}
