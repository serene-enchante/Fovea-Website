function pointFeature(kind, coordinates, extraProperties = {}) {
    return {
        type: 'Feature',
        properties: { kind, ...extraProperties },
        geometry: { type: 'Point', coordinates }
    };
}

function lineFeature(coordinates) {
    return {
        type: 'Feature',
        properties: { kind: 'line' },
        geometry: { type: 'LineString', coordinates }
    };
}

function polygonFeature(coordinates) {
    return {
        type: 'Feature',
        properties: { kind: 'polygon' },
        geometry: { type: 'Polygon', coordinates: [[...coordinates, coordinates[0]]] }
    };
}

function featureCollection(features) {
    return { type: 'FeatureCollection', features };
}

export function buildAnnotationFeatureCollection({
    markers = [],
    lines = [],
    polygons = [],
    activeLineCoords = [],
    activePolyCoords = []
} = {}) {
    const features = [];

    markers.forEach((coordinates, index) => {
        features.push(pointFeature('marker', coordinates, { index }));
    });

    lines.forEach(coordinates => {
        if (coordinates.length >= 2) features.push(lineFeature(coordinates));
        coordinates.forEach(point => features.push(pointFeature('vertex', point)));
    });
    if (activeLineCoords.length > 0) {
        if (activeLineCoords.length >= 2) features.push(lineFeature(activeLineCoords));
        activeLineCoords.forEach(point => features.push(pointFeature('vertex', point)));
    }

    polygons.forEach(coordinates => {
        if (coordinates.length >= 3) features.push(polygonFeature(coordinates));
        coordinates.forEach(point => features.push(pointFeature('vertex', point)));
    });
    if (activePolyCoords.length > 0) {
        if (activePolyCoords.length >= 3) features.push(polygonFeature(activePolyCoords));
        else if (activePolyCoords.length === 2) features.push(lineFeature(activePolyCoords));
        activePolyCoords.forEach(point => features.push(pointFeature('vertex', point)));
    }

    return featureCollection(features);
}

export function buildSuggestionFeatureCollection({ markers = [], lines = [], polygons = [] } = {}) {
    const features = [];
    markers.forEach(coordinates => features.push(pointFeature('marker', coordinates)));
    lines.forEach(coordinates => {
        if (coordinates?.length >= 2) features.push(lineFeature(coordinates));
    });
    polygons.forEach(coordinates => {
        if (coordinates?.length >= 3) features.push(polygonFeature(coordinates));
    });
    return featureCollection(features);
}
