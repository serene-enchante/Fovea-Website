import assert from 'node:assert/strict';
import test from 'node:test';

import { canvasToTiffBlob, geojsonToGpx, geojsonToKml } from '../scripts/services/format-converters.js';

const features = {
    type: 'FeatureCollection',
    features: [
        {
            type: 'Feature',
            properties: { name: 'A & B' },
            geometry: { type: 'Point', coordinates: [-123.1, 44.1] }
        },
        {
            type: 'Feature',
            properties: { zid: '04' },
            geometry: { type: 'Polygon', coordinates: [[[-123.2, 44], [-123, 44], [-123, 44.2], [-123.2, 44]]] }
        }
    ]
};

test('converts GeoJSON features to KML with escaped labels', () => {
    const kml = geojsonToKml(features, 'Export & Map');

    assert.match(kml, /<name>Export &amp; Map<\/name>/);
    assert.match(kml, /<name>A &amp; B<\/name>/);
    assert.match(kml, /<Point><coordinates>-123\.1,44\.1<\/coordinates><\/Point>/);
    assert.match(kml, /<Polygon>/);
});

test('converts GeoJSON points and polygons to GPX waypoints and tracks', () => {
    const gpx = geojsonToGpx(features, 'Export & Map');

    assert.match(gpx, /<name>Export &amp; Map<\/name>/);
    assert.match(gpx, /<wpt lat="44\.1" lon="-123\.1">/);
    assert.match(gpx, /<trk>\s*<name>04<\/name>/);
    assert.match(gpx, /<trkpt lat="44" lon="-123\.2"\/>/);
});

test('encodes canvas pixels as an RGB TIFF', async () => {
    const canvas = {
        width: 1,
        height: 1,
        getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray([12, 34, 56, 255]) }) })
    };

    const blob = canvasToTiffBlob(canvas);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    assert.equal(blob.type, 'image/tiff');
    assert.deepEqual([...bytes.slice(0, 11)], [0x49, 0x49, 42, 0, 11, 0, 0, 0, 12, 34, 56]);
});
