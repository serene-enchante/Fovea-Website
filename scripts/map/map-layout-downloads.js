import { loadJsPdfLibrary } from './map-vendor-loader.js';

export function createMapLayoutDownloadActions({
    hasCachedLayout,
    renderLayout,
    getFilename,
    convertCanvasToTiff,
    shareFile,
    notify,
    windowObject = globalThis.window,
    loadJsPdf = loadJsPdfLibrary
}) {
    async function getJsPdfConstructor() {
        if (windowObject?.jspdf?.jsPDF) return windowObject.jspdf.jsPDF;
        try {
            return (await loadJsPdf()).jsPDF;
        } catch {
            return null;
        }
    }

    async function downloadGeoPdf(triggerButton = null) {
        if (!hasCachedLayout()) notify('Rendering map layout...');

        const canvas = await renderLayout();
        const filename = getFilename('pdf');
        const jsPDF = await getJsPdfConstructor();

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

    async function printRaster(triggerButton = null) {
        const printWindow = windowObject?.open?.('', '_blank');
        if (!printWindow) {
            notify('Allow pop-ups to print this map.');
            return;
        }

        if (triggerButton) {
            triggerButton.disabled = true;
            triggerButton.classList?.add('is-preparing');
        }

        try {
            if (!hasCachedLayout()) notify('Rendering map layout...');
            const canvas = await renderLayout();
            const document = printWindow.document;
            document.open();
            document.write('<!doctype html><html><head><title>Print map</title><style>@page{size:landscape;margin:8mm}html,body{margin:0;width:100%;height:100%;display:grid;place-items:center}img{display:block;max-width:100%;max-height:100%;object-fit:contain}</style></head><body><img alt="Map layout"></body></html>');
            document.close();
            const image = document.querySelector('img');
            image.onload = () => {
                printWindow.addEventListener?.('afterprint', () => printWindow.close(), { once: true });
                printWindow.focus?.();
                printWindow.print();
            };
            image.onerror = () => {
                printWindow.close();
                notify('Error preparing map for printing.');
            };
            image.src = canvas.toDataURL('image/png');
        } catch (error) {
            printWindow.close?.();
            console.error('Map printing failed:', error);
            notify('Error preparing map for printing.');
        } finally {
            if (triggerButton) {
                triggerButton.disabled = false;
                triggerButton.classList?.remove('is-preparing');
            }
        }
    }

    return { downloadGeoPdf, downloadGeoTiff, printRaster };
}
