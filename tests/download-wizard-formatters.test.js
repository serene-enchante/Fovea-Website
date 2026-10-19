import assert from 'node:assert/strict';
import test from 'node:test';
import { geojsonToGpx, geojsonToKml } from '../scripts/services/download-wizard-formatters.js';

test('wizard KML keeps its styled placemarks and escapes names and descriptions', () => {
    const geojson = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { zid: '19A', name: 'Marsh & Meadow' },
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [[-123, 44], [-122, 44], [-122, 45], [-123, 44]],
                    [[-122.8, 44.2], [-122.7, 44.2], [-122.8, 44.2]]
                ]
            }
        }]
    };

    const kml = geojsonToKml(geojson, 'Eugene & Florence');

    assert.match(kml, /<name>Eugene &amp; Florence<\/name>/);
    assert.match(kml, /<name>Zone 19A<\/name>/);
    assert.match(kml, /Marsh &amp; Meadow/);
    assert.match(kml, /<LineStyle><color>ff00aaff<\/color><width>3<\/width><\/LineStyle>/);
    assert.match(kml, /<innerBoundaryIs>/);
});

test('wizard GPX exports exterior polygon rings and escapes the track name', () => {
    const geojson = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { zid: '04' },
            geometry: {
                type: 'Polygon',
                coordinates: [
                    [[-123, 44], [-122, 44], [-122, 45], [-123, 44]],
                    [[-122.8, 44.2], [-122.7, 44.2], [-122.8, 44.2]]
                ]
            }
        }]
    };

    const gpx = geojsonToGpx(geojson, 'Zone & Circle');

    assert.match(gpx, /<name>Zone &amp; Circle<\/name>/);
    assert.match(gpx, /creator="Fovea Spatial Tools/);
    assert.equal((gpx.match(/<trkseg>/g) || []).length, 1);
    assert.match(gpx, /<trkpt lat="44" lon="-123"><\/trkpt>/);
    assert.match(gpx, /<time>[^<]+<\/time>/);
});
