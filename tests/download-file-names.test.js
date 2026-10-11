import assert from 'node:assert/strict';
import test from 'node:test';

import { getDownloadFilename } from '../scripts/services/download-file-names.js';

const circleId = 'ecbc-circle';

test('names an overview export after the circles dataset', () => {
    assert.equal(
        getDownloadFilename({ currentFeature: 'circles', currentId: circleId, circleId }, 'geojson'),
        'circles-wgs84.geojson'
    );
});

test('names circle and selected-zone exports for each local count', () => {
    assert.equal(
        getDownloadFilename({ currentFeature: 'eugene', currentId: circleId, circleId }, 'pdf'),
        'Eugene-04-wgs84.pdf'
    );
    assert.equal(
        getDownloadFilename({ currentFeature: 'eugene', currentId: '04', circleId }, 'kmz'),
        'Eugene-Zone-04.kmz'
    );
    assert.equal(
        getDownloadFilename({ currentFeature: 'florence', currentId: circleId, circleId }, 'gpx'),
        'Florence-00-wgs84.gpx'
    );
    assert.equal(
        getDownloadFilename({ currentFeature: 'florence', currentId: '01', circleId }, 'tif'),
        'Florence-Zone-01.tif'
    );
});
