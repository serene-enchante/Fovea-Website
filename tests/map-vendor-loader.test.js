import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapVendorLoader } from '../scripts/map/map-vendor-loader.js';

test('loads Turf once on demand and shares concurrent requests', async () => {
    const scripts = [];
    const globalObject = {};
    const loader = createMapVendorLoader({
        globalObject,
        documentObject: {
            createElement: () => ({}),
            head: { appendChild: script => scripts.push(script) }
        }
    });

    const firstLoad = loader.loadTurfLibrary();
    const secondLoad = loader.loadTurfLibrary();
    assert.equal(firstLoad, secondLoad);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].async, true);
    assert.match(scripts[0].src, /@turf\/turf@6\/turf\.min\.js$/);

    const turf = { point() {}, booleanPointInPolygon() {} };
    globalObject.turf = turf;
    scripts[0].onload();
    assert.equal(await firstLoad, turf);
    assert.equal(await loader.loadTurfLibrary(), turf);
    assert.equal(scripts.length, 1);
});

test('retries Turf after a failed script request', async () => {
    const scripts = [];
    const loader = createMapVendorLoader({
        globalObject: {},
        documentObject: {
            createElement: () => ({}),
            head: { appendChild: script => scripts.push(script) }
        }
    });

    const firstLoad = loader.loadTurfLibrary();
    scripts[0].onerror();
    await assert.rejects(firstLoad, /Failed to load Turf/);

    const retry = loader.loadTurfLibrary();
    assert.equal(scripts.length, 2);
    scripts[1].onerror();
    await assert.rejects(retry, /Failed to load Turf/);
});

test('resolves each optional vendor from its expected browser global', async () => {
    const scripts = [];
    const globalObject = {};
    const loader = createMapVendorLoader({
        globalObject,
        documentObject: {
            createElement: () => ({}),
            head: { appendChild: script => scripts.push(script) }
        }
    });
    const cases = [
        ['loadJsPdfLibrary', 'jspdf', { jsPDF() {} }],
        ['loadJsZipLibrary', 'JSZip', function JSZip() {}],
        ['loadQrCodeLibrary', 'QRCode', function QRCode() {}]
    ];

    for (const [method, globalName, library] of cases) {
        const loading = loader[method]();
        globalObject[globalName] = library;
        scripts.at(-1).onload();
        assert.equal(await loading, library);
    }

    assert.equal(scripts.length, 3);
});
