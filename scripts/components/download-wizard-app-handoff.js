import { loadJsZipLibrary } from '../map/map-vendor-loader.js';

export function createDownloadWizardAppHandoff({
    state,
    appInstructions,
    getExportGeoJSON,
    getDownloadFilename,
    generateGeoPdfBlob,
    generateGeoTiffBlob,
    geojsonToKml,
    geojsonToGpx,
    downloadBlob,
    showToast,
    resolveAssetPath = path => path,
    zipConstructor = globalThis.JSZip,
    loadJsZip = loadJsZipLibrary,
    BlobConstructor = globalThis.Blob,
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    consoleObject = globalThis.console
}) {
    async function getZipConstructor() {
        if (typeof zipConstructor === 'function') return zipConstructor;
        if (typeof windowObject?.JSZip === 'function') return windowObject.JSZip;
        try {
            return await loadJsZip();
        } catch {
            return null;
        }
    }

    function createExportPromise(config, filename, geojson) {
        if (config.formatKey === 'geopdf' || config.ext === 'pdf') return generateGeoPdfBlob(null, true);
        if (config.formatKey === 'geotiff' || config.ext === 'tif') return generateGeoTiffBlob(null, true);

        if (config.formatKey === 'kmz') {
            return (async () => {
                const kmlContent = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ''));
                const Zip = await getZipConstructor();
                if (typeof Zip === 'function') {
                    const zip = new Zip();
                    zip.file('doc.kml', kmlContent);
                    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.google-earth.kmz' });
                    return { blob, filename };
                }
                return {
                    blob: new BlobConstructor([kmlContent], { type: 'application/vnd.google-earth.kml+xml' }),
                    filename: filename.replace(/\.kmz$/i, '.kml')
                };
            })();
        }

        if (config.formatKey === 'gpx') {
            const gpxContent = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ''));
            return Promise.resolve({ blob: new BlobConstructor([gpxContent], { type: 'application/gpx+xml' }), filename });
        }

        return Promise.resolve({ blob: new BlobConstructor([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' }), filename });
    }

    function setupAppCards() {
        documentObject.querySelectorAll('.wizard-app-card').forEach(card => {
            card.addEventListener('click', () => handleAppCardClick(card.dataset.app));
        });
    }

    function handleAppCardClick(appKey) {
        const config = appInstructions[appKey] || appInstructions.avenza;
        const geojson = getExportGeoJSON();
        const filename = getDownloadFilename(config.ext);
        const blobPromise = createExportPromise(config, filename, geojson);

        state.activeGeneratedBlobPromise = blobPromise;
        state.activeGeneratedBlob = null;
        state.activeGeneratedFilename = filename;

        blobPromise.then(result => {
            state.activeGeneratedBlob = result.blob;
            if (result.filename) state.activeGeneratedFilename = result.filename;
        }).catch(error => {
            consoleObject.error('Background export error:', error);
        });

        openInstructionModal(config, filename);
    }

    function openInstructionModal(config, filename) {
        const modal = documentObject.getElementById('avenza-instruction-modal');
        if (!modal) return;

        const appIcon = documentObject.getElementById('avenza-modal-app-icon');
        if (appIcon) {
            appIcon.src = resolveAssetPath(config.iconSrc);
            appIcon.alt = config.appName;
        }

        const targetName = documentObject.getElementById('avenza-target-name');
        if (targetName) {
            targetName.textContent = state.selectedZone
                ? `Zone ${String(state.selectedZone.properties?.zid || '0').padStart(2, '0')}`
                : (state.selectedCircle?.name || 'Count Circle');
        }

        const selectionThumb = documentObject.getElementById('avenza-selection-thumb');
        if (selectionThumb) selectionThumb.src = resolveAssetPath(state.selectedCircle?.thumbnail || 'images/logo-small.png');

        const step1Heading = documentObject.getElementById('avenza-step1-heading');
        if (step1Heading) step1Heading.textContent = config.step1Heading;
        const step2Heading = documentObject.getElementById('avenza-step2-heading');
        if (step2Heading) step2Heading.textContent = config.step2Heading;
        const step2Text = documentObject.getElementById('avenza-step2-text');
        if (step2Text) step2Text.innerHTML = config.step2Text;

        const modalDownloadButton = documentObject.getElementById('avenza-modal-download-btn');
        if (modalDownloadButton) {
            modalDownloadButton.classList.remove('is-downloaded', 'is-preparing');
            const defaultHtml = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Download File</span>
            `;
            modalDownloadButton.innerHTML = defaultHtml;
            modalDownloadButton.onclick = async () => {
                if (modalDownloadButton.classList.contains('is-preparing')) return;

                let blob = state.activeGeneratedBlob;
                let targetFilename = state.activeGeneratedFilename || filename;
                if (!(typeof BlobConstructor === 'function' && blob instanceof BlobConstructor)) {
                    showToast('Rendering map layout...');
                    modalDownloadButton.classList.add('is-preparing');
                    modalDownloadButton.innerHTML = `
                        <svg class="spin-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line>
                            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                            <line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line>
                            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                        </svg><span>Preparing...</span>`;

                    try {
                        if (state.activeGeneratedBlobPromise) {
                            const result = await state.activeGeneratedBlobPromise;
                            blob = result.blob;
                            if (result.filename) targetFilename = result.filename;
                        }
                        state.activeGeneratedBlob = blob;
                        state.activeGeneratedFilename = targetFilename;
                    } catch (error) {
                        consoleObject.error('Modal download error:', error);
                        showToast('Error generating download file.');
                        modalDownloadButton.classList.remove('is-preparing');
                        modalDownloadButton.innerHTML = defaultHtml;
                        return;
                    }
                    modalDownloadButton.classList.remove('is-preparing');
                }

                downloadBlob(blob, targetFilename);
                modalDownloadButton.classList.add('is-downloaded');
                modalDownloadButton.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Downloaded</span>';
                showToast(`Downloaded ${targetFilename}`);
            };
        }

        const openButton = documentObject.getElementById('avenza-modal-open-btn');
        if (openButton) {
            openButton.textContent = `Open in ${config.appName}`;
            openButton.onclick = event => {
                event.preventDefault();
                windowObject.location.href = config.scheme;
            };
        }

        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
    }

    function setupModalEvents() {
        const modal = documentObject.getElementById('avenza-instruction-modal');
        if (!modal) return;

        modal.querySelectorAll('[data-modal-close]').forEach(element => {
            element.addEventListener('click', () => closeModal(modal));
        });
        windowObject.addEventListener('keydown', event => {
            if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal(modal);
        });
    }

    function closeModal(modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    }

    return { setupAppCards, handleAppCardClick, setupModalEvents };
}
