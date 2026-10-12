export function createMapLayoutDownloadActions({
    hasCachedLayout,
    renderLayout,
    getFilename,
    convertCanvasToTiff,
    shareFile,
    notify,
    windowObject = globalThis.window
}) {
    async function downloadGeoPdf(triggerButton = null) {
        if (!hasCachedLayout()) notify('Rendering map layout...');

        const canvas = await renderLayout();
        const filename = getFilename('pdf');
        const jsPDF = windowObject.jspdf?.jsPDF;

        if (jsPDF) {
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
            pdf.setProperties({
                title: filename.replace(/\.pdf$/, ''),
                subject: 'GeoPDF Map Layout Export - Esri Topo Basemap',
                keywords: 'GeoPDF, GIS, Map, Esri Topo, Fovea',
                creator: 'Fovea Web Map Layout Engine'
            });
            await shareFile(null, pdf.output('blob'), filename, triggerButton);
            notify(`Exported ${filename}`);
            return;
        }

        canvas.toBlob(async blob => {
            const fallbackFilename = filename.replace(/\.pdf$/, '-layout.png');
            await shareFile(null, blob, fallbackFilename, triggerButton);
            notify(`Exported ${fallbackFilename}`);
        }, 'image/png');
    }

    async function downloadGeoTiff(triggerButton = null) {
        if (!hasCachedLayout()) notify('Rendering map layout...');

        const canvas = await renderLayout();
        const filename = getFilename('tif');
        await shareFile(null, convertCanvasToTiff(canvas), filename, triggerButton);
        notify(`Exported ${filename}`);
    }

    return { downloadGeoPdf, downloadGeoTiff };
}
