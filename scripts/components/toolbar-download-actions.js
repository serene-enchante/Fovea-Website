export function createToolbarDownloadActions({
    state,
    getSelectedGeoJSONData,
    getFilename,
    renderLayout,
    downloadPdf,
    downloadTiff,
    convertCanvasToTiff,
    shareFile,
    notify,
    geojsonToGpx,
    geojsonToKml,
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    BlobConstructor = globalThis.Blob,
    zipConstructor = globalThis.JSZip
}) {
    function setupSpatialDownloadButtons({
        shareFile: share = shareFile,
        notify: notifyUser = notify,
        downloadPdf: exportPdf = downloadPdf,
        downloadTiff: exportTiff = downloadTiff
    } = {}) {
        const geojsonBtn = documentObject.getElementById('download-geojson');
        if (geojsonBtn) {
            geojsonBtn.addEventListener('click', async event => {
                const geojson = getSelectedGeoJSONData();
                const filename = getFilename('geojson');
                const blob = new BlobConstructor([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
                await share(event, blob, filename, geojsonBtn);
                notifyUser(`Exported ${filename}`);
            });
        }

        const kmzBtn = documentObject.getElementById('download-kmz');
        if (kmzBtn) {
            kmzBtn.addEventListener('click', async event => {
                const geojson = getSelectedGeoJSONData();
                const filename = getFilename('kmz');
                const kmlContent = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ''));
                let blob;
                if (typeof zipConstructor === 'function') {
                    const zip = new zipConstructor();
                    zip.file('doc.kml', kmlContent);
                    blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' });
                } else {
                    blob = new BlobConstructor([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
                }
                await share(event, blob, filename, kmzBtn);
                notifyUser(`Exported ${filename}`);
            });
        }

        const gpxBtn = documentObject.getElementById('download-gpx');
        if (gpxBtn) {
            gpxBtn.addEventListener('click', async event => {
                const geojson = getSelectedGeoJSONData();
                const filename = getFilename('gpx');
                const gpxContent = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ''));
                const blob = new BlobConstructor([gpxContent], { type: 'application/gpx+xml' });
                await share(event, blob, filename, gpxBtn);
                notifyUser(`Exported ${filename}`);
            });
        }

        const geopdfBtn = documentObject.getElementById('download-geopdf');
        if (geopdfBtn) geopdfBtn.addEventListener('click', async () => exportPdf(geopdfBtn));

        const geotiffBtn = documentObject.getElementById('download-geotiff');
        if (geotiffBtn) geotiffBtn.addEventListener('click', async () => exportTiff(geotiffBtn));
    }

    async function generateAppSpatialBlob(formatKey) {
        const geojson = getSelectedGeoJSONData();
        const filename = getFilename(formatKey === 'geopdf' ? 'pdf' : formatKey);

        if (formatKey === 'geopdf') {
            const canvas = await renderLayout({
                features: state.allFeatures,
                targetFeatureId: state.currentId,
                currentFeature: state.currentFeature,
                isCirclesFeature: state.isCirclesFeature
            });
            const jsPDF = windowObject.jspdf?.jsPDF;
            if (jsPDF) {
                const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
                pdf.setProperties({
                    title: filename.replace(/\.pdf$/, ''),
                    subject: 'GeoPDF Map Layout Export - Esri Topo Basemap',
                    creator: 'Fovea Web Map Layout Engine'
                });
                return { blob: pdf.output('blob'), filename };
            }

            return new Promise(resolve => {
                canvas.toBlob(blob => resolve({ blob, filename: filename.replace(/\.pdf$/, '-layout.png') }), 'image/png');
            });
        }

        if (formatKey === 'geotiff' || formatKey === 'tif') {
            const canvas = await renderLayout({
                features: state.allFeatures,
                targetFeatureId: state.currentId,
                currentFeature: state.currentFeature,
                isCirclesFeature: state.isCirclesFeature
            });
            return { blob: convertCanvasToTiff(canvas), filename: getFilename('tif') };
        }

        if (formatKey === 'gpx') {
            const gpxContent = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ''));
            const blob = new BlobConstructor([gpxContent], { type: 'application/gpx+xml' });
            return { blob, filename: filename.endsWith('.gpx') ? filename : `${filename}.gpx` };
        }

        if (formatKey === 'kmz') {
            const kmlContent = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ''));
            if (typeof zipConstructor === 'function') {
                const zip = new zipConstructor();
                zip.file('doc.kml', kmlContent);
                return {
                    blob: await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' }),
                    filename
                };
            }
            return {
                blob: new BlobConstructor([kmlContent], { type: 'application/vnd.google-earth.kml+xml' }),
                filename: filename.replace(/\.kmz$/i, '.kml')
            };
        }

        const blob = new BlobConstructor([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
        return { blob, filename };
    }

    return { setupSpatialDownloadButtons, generateAppSpatialBlob };
}
