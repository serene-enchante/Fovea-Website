import assert from 'node:assert/strict';
import test from 'node:test';
import { state } from '../scripts/state.js';
import { generateAppSpatialBlob } from '../scripts/components/toolbar-actions.js';

const zoneFeature = {
    type: 'Feature',
    properties: { zid: '04', name: 'Zone Four' },
    geometry: {
        type: 'Polygon',
        coordinates: [[[1, 2], [3, 2], [3, 4], [1, 2]]]
    }
};

async function withZoneSelection(run) {
    const previous = {
        allFeatures: state.allFeatures,
        currentFeature: state.currentFeature,
        isCirclesFeature: state.isCirclesFeature,
        currentId: state.currentId
    };
    Object.assign(state, {
        allFeatures: [zoneFeature],
        currentFeature: 'eugene',
        isCirclesFeature: false,
        currentId: '04'
    });
    try {
        await run();
    } finally {
        Object.assign(state, previous);
    }
}

test('compatible-app KML and GPX exports use the shared format converters', async () => {
    await withZoneSelection(async () => {
        const kml = await generateAppSpatialBlob('kmz');
        const gpx = await generateAppSpatialBlob('gpx');

        assert.equal(kml.filename, 'Eugene-Zone-04.kml');
        assert.match(await kml.blob.text(), /<name>Zone Four<\/name>/);
        assert.equal(gpx.filename, 'Eugene-Zone-04.gpx');
        assert.match(await gpx.blob.text(), /lat="2" lon="1"/);
    });
});
