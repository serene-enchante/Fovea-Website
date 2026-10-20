import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapLayoutDownloadActions } from '../scripts/map/map-layout-downloads.js';

test('exports a cached layout as a PDF through the injected legacy share callback', async () => {
    const calls = [];
    class FakePdf {
        constructor(options) { calls.push(['pdf-options', options]); }
        addImage(...args) { calls.push(['image', ...args]); }
        setProperties(properties) { calls.push(['properties', properties]); }
        output(type) { calls.push(['output', type]); return 'pdf-blob'; }
    }
    const actions = createMapLayoutDownloadActions({
        hasCachedLayout: () => true,
        renderLayout: async () => ({ toDataURL: (...args) => `data:${args.join(':')}` }),
        getFilename: extension => `map.${extension}`,
        convertCanvasToTiff: () => 'tiff-blob',
        shareFile: async (...args) => calls.push(['share', ...args]),
        notify: message => calls.push(['notify', message]),
        windowObject: { jspdf: { jsPDF: FakePdf } }
    });
    const triggerButton = {};

    await actions.downloadGeoPdf(triggerButton);

    assert.deepEqual(calls[0], ['pdf-options', { orientation: 'landscape', unit: 'mm', format: 'a4' }]);
    assert.deepEqual(calls.find(call => call[0] === 'share'), ['share', null, 'pdf-blob', 'map.pdf', triggerButton]);
    assert.deepEqual(calls.at(-1), ['notify', 'Exported map.pdf']);
});

test('loads jsPDF only when the PDF export action is invoked', async () => {
    const calls = [];
    class FakePdf {
        constructor() { calls.push('construct'); }
        addImage() {}
        setProperties() {}
        output() { return 'lazy-pdf-blob'; }
    }
    const actions = createMapLayoutDownloadActions({
        hasCachedLayout: () => true,
        renderLayout: async () => ({ toDataURL: () => 'data:image/jpeg;base64,map' }),
        getFilename: extension => `map.${extension}`,
        convertCanvasToTiff: () => null,
        shareFile: async (_event, blob) => calls.push(blob),
        notify() {},
        windowObject: {},
        loadJsPdf: async () => ({ jsPDF: FakePdf })
    });

    await actions.downloadGeoPdf();

    assert.deepEqual(calls, ['construct', 'lazy-pdf-blob']);
});

test('exports TIFF using the injected converter and notifies when rendering is required', async () => {
    const calls = [];
    const canvas = {};
    const actions = createMapLayoutDownloadActions({
        hasCachedLayout: () => false,
        renderLayout: async () => canvas,
        getFilename: extension => `map.${extension}`,
        convertCanvasToTiff: value => {
            assert.equal(value, canvas);
            return 'tiff-blob';
        },
        shareFile: async (...args) => calls.push(['share', ...args]),
        notify: message => calls.push(['notify', message]),
        windowObject: {}
    });

    await actions.downloadGeoTiff();

    assert.deepEqual(calls, [
        ['notify', 'Rendering map layout...'],
        ['share', null, 'tiff-blob', 'map.tif', null],
        ['notify', 'Exported map.tif']
    ]);
});

test('falls back to a PNG when jsPDF is unavailable', async () => {
    const calls = [];
    const actions = createMapLayoutDownloadActions({
        hasCachedLayout: () => true,
        renderLayout: async () => ({
            toBlob: callback => callback('png-blob')
        }),
        getFilename: () => 'map.pdf',
        convertCanvasToTiff: () => null,
        shareFile: async (...args) => calls.push(['share', ...args]),
        notify: message => calls.push(['notify', message]),
        windowObject: {}
    });

    await actions.downloadGeoPdf();
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(calls, [
        ['share', null, 'png-blob', 'map-layout.png', null],
        ['notify', 'Exported map-layout.png']
    ]);
});
