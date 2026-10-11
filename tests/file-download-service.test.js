import assert from 'node:assert/strict';
import test from 'node:test';

import { getIosShareFileMetadata } from '../scripts/services/file-download-service.js';

test('uses standard iOS MIME metadata for modular downloads', () => {
    assert.deepEqual(
        getIosShareFileMetadata('Eugene-Zone-04.gpx', 'application/gpx+xml'),
        { mimeType: 'application/xml', shareName: 'Eugene-Zone-04.gpx' }
    );
    assert.deepEqual(
        getIosShareFileMetadata('Eugene-Zone-04.geojson', 'application/geo+json'),
        { mimeType: 'application/json', shareName: 'Eugene-Zone-04.geojson' }
    );
});

test('preserves the legacy map share metadata while it migrates to the service', () => {
    assert.deepEqual(
        getIosShareFileMetadata('Eugene-Zone-04.geojson', 'application/geo+json', 'legacy-map'),
        { mimeType: 'application/json', shareName: 'Eugene-Zone-04.json' }
    );
    assert.deepEqual(
        getIosShareFileMetadata('Eugene-Zone-04.kmz', 'application/vnd.google-earth.kmz', 'legacy-map'),
        { mimeType: 'application/zip', shareName: 'Eugene-Zone-04.kmz' }
    );
    assert.deepEqual(
        getIosShareFileMetadata('Eugene-Zone-04.tif', 'image/tiff', 'legacy-map'),
        { mimeType: 'image/png', shareName: 'Eugene-Zone-04.tif' }
    );
});
