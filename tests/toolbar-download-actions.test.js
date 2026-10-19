import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolbarDownloadActions } from '../scripts/components/toolbar-download-actions.js';

function makeElement() {
    const listeners = {};
    return {
        listeners,
        addEventListener(type, callback) { listeners[type] = callback; },
        click(event = {}) { return this.listeners.click?.(event); }
    };
}

function makeHarness(overrides = {}) {
    const buttons = Object.fromEntries(
        ['geojson', 'kmz', 'gpx', 'geopdf', 'geotiff'].map(format => [`download-${format}`, makeElement()])
    );
    const calls = [];
    const state = { allFeatures: ['features'], currentId: '04', currentFeature: 'eugene', isCirclesFeature: false };
    const geojson = { type: 'FeatureCollection', features: [{ properties: { name: 'Test Area' } }] };
    const actions = createToolbarDownloadActions({
        state,
        getSelectedGeoJSONData: () => geojson,
        getFilename: ext => `map.${ext}`,
        renderLayout: async options => {
            calls.push(['render', options]);
            return {
                toDataURL: () => 'data:image/jpeg;base64,map',
                toBlob: callback => callback(new Blob(['png'], { type: 'image/png' }))
            };
        },
        downloadPdf: button => calls.push(['pdf', button]),
        downloadTiff: button => calls.push(['tiff', button]),
        convertCanvasToTiff: () => new Blob(['tiff'], { type: 'image/tiff' }),
        shareFile: async (...args) => calls.push(['share', ...args]),
        notify: message => calls.push(['notify', message]),
        geojsonToGpx: () => '<gpx/>',
        geojsonToKml: () => '<kml/>',
        documentObject: { getElementById: id => buttons[id] || null },
        windowObject: {},
        zipConstructor: undefined,
        ...overrides
    });
    return { actions, calls, buttons, geojson, state };
}

test('compatible-app exports create GeoJSON, KML, GPX, PDF fallback, and TIFF blobs', async () => {
    const h = makeHarness();
    const geojson = await h.actions.generateAppSpatialBlob('geojson');
    const kmzFallback = await h.actions.generateAppSpatialBlob('kmz');
    const gpx = await h.actions.generateAppSpatialBlob('gpx');
    const pdfFallback = await h.actions.generateAppSpatialBlob('geopdf');
    const tiff = await h.actions.generateAppSpatialBlob('geotiff');

    assert.equal(geojson.filename, 'map.geojson');
    assert.equal(JSON.parse(await geojson.blob.text()).features[0].properties.name, 'Test Area');
    assert.equal(kmzFallback.filename, 'map.kml');
    assert.equal(await kmzFallback.blob.text(), '<kml/>');
    assert.equal(gpx.filename, 'map.gpx');
    assert.equal(await gpx.blob.text(), '<gpx/>');
    assert.equal(pdfFallback.filename, 'map-layout.png');
    assert.equal(pdfFallback.blob.type, 'image/png');
    assert.equal(tiff.filename, 'map.tif');
    assert.equal(tiff.blob.type, 'image/tiff');
    assert.deepEqual(h.calls.filter(([kind]) => kind === 'render').map(([, options]) => options), [
        { features: ['features'], targetFeatureId: '04', currentFeature: 'eugene', isCirclesFeature: false },
        { features: ['features'], targetFeatureId: '04', currentFeature: 'eugene', isCirclesFeature: false }
    ]);
});

test('spatial download controls share generated files and delegate PDF/TIFF actions', async () => {
    const h = makeHarness();
    h.actions.setupSpatialDownloadButtons();
    const clickEvent = { type: 'click' };
    await h.buttons['download-kmz'].click(clickEvent);
    await h.buttons['download-gpx'].click(clickEvent);
    await h.buttons['download-geopdf'].click();
    await h.buttons['download-geotiff'].click();

    const shares = h.calls.filter(([kind]) => kind === 'share');
    assert.equal(shares.length, 2);
    assert.equal(shares[0][1], clickEvent);
    assert.equal(shares[0][2].type, 'application/vnd.google-earth.kml+xml');
    assert.equal(shares[0][3], 'map.kmz');
    assert.equal(shares[1][2].type, 'application/gpx+xml');
    assert.deepEqual(h.calls.filter(([kind]) => kind === 'notify'), [
        ['notify', 'Exported map.kmz'],
        ['notify', 'Exported map.gpx']
    ]);
    assert.deepEqual(h.calls.filter(([kind]) => kind === 'pdf' || kind === 'tiff'), [
        ['pdf', h.buttons['download-geopdf']],
        ['tiff', h.buttons['download-geotiff']]
    ]);
});
