const TURF_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js';
const JS_PDF_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const JS_ZIP_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
const QR_CODE_SCRIPT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

export function createMapVendorLoader({
    documentObject = globalThis.document,
    globalObject = globalThis
} = {}) {
    const pendingLibraries = new Map();

    function loadLibrary(name, url, readGlobal, isLoaded) {
        const library = readGlobal();
        if (isLoaded(library)) return Promise.resolve(library);
        if (pendingLibraries.has(name)) return pendingLibraries.get(name);

        const pending = new Promise((resolve, reject) => {
            if (!documentObject?.createElement || !documentObject.head) {
                reject(new Error(`Cannot load ${name} without a document head.`));
                return;
            }

            const script = documentObject.createElement('script');
            const timeoutId = setTimeout(() => {
                script.remove?.();
                reject(new Error(`Timed out loading ${name}.`));
            }, 10000);
            script.async = true;
            script.src = url;
            script.onload = () => {
                clearTimeout(timeoutId);
                const loadedLibrary = readGlobal();
                if (isLoaded(loadedLibrary)) resolve(loadedLibrary);
                else reject(new Error(`${name} loaded without defining its global.`));
            };
            script.onerror = () => {
                clearTimeout(timeoutId);
                reject(new Error(`Failed to load ${name}.`));
            };
            try {
                documentObject.head.appendChild(script);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        }).catch(error => {
            pendingLibraries.delete(name);
            throw error;
        });

        pendingLibraries.set(name, pending);
        return pending;
    }

    return {
        loadTurfLibrary: () => loadLibrary('Turf', TURF_SCRIPT_URL, () => globalObject.turf, Boolean),
        loadJsPdfLibrary: () => loadLibrary('jsPDF', JS_PDF_SCRIPT_URL, () => globalObject.jspdf, library => Boolean(library?.jsPDF)),
        loadJsZipLibrary: () => loadLibrary('JSZip', JS_ZIP_SCRIPT_URL, () => globalObject.JSZip, Boolean),
        loadQrCodeLibrary: () => loadLibrary('QRCode', QR_CODE_SCRIPT_URL, () => globalObject.QRCode, Boolean)
    };
}

export const {
    loadTurfLibrary,
    loadJsPdfLibrary,
    loadJsZipLibrary,
    loadQrCodeLibrary
} = createMapVendorLoader();
