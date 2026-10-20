import { markMapStartup } from './map-startup-metrics.js';

export async function runMapPageStartup({
    state,
    storageObject = globalThis.localStorage,
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    schedule = globalThis.setTimeout,
    getInitialId,
    loadFeatures,
    initializeMap,
    setupPageUi,
    selectSubject,
    notify,
    updateHeader,
    logError = (...args) => console.error(...args)
}) {
    markMapStartup('startup-start');
    let pageReadyMarked = false;
    let themeStylesReady = !windowObject?.__foveaMapThemeStylesReady;
    let mapResizedForEntrance = false;
    let selectionRestoredAfterMapLoad = false;

    const finalizeStartupView = () => {
        if (!pageReadyMarked && themeStylesReady) {
            markMapStartup('page-ready');
            pageReadyMarked = true;
        }

        if (state.map) {
            const mapIsLoaded = typeof state.map.loaded === 'function' && state.map.loaded();
            if (!mapResizedForEntrance || (mapIsLoaded && !selectionRestoredAfterMapLoad)) {
                state.map.resize();
                mapResizedForEntrance = true;
            }
            if (mapIsLoaded && !selectionRestoredAfterMapLoad) {
                selectionRestoredAfterMapLoad = true;
                selectSubject(state.currentId, true, false, { mapViewOnly: true });
            }
        }
    };

    if (!themeStylesReady) {
        Promise.resolve(windowObject.__foveaMapThemeStylesReady)
            .catch(() => {})
            .then(() => {
                themeStylesReady = true;
                if (state.map) finalizeStartupView();
            });
    }

    try {
        const storedTheme = storageObject.getItem('fovea-theme') || 'dark';
        const isSystemLight = windowObject.matchMedia
            && windowObject.matchMedia('(prefers-color-scheme: light)').matches;
        const isLight = storedTheme === 'light' || (storedTheme === 'auto' && isSystemLight);

        documentObject.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
        documentObject.documentElement.classList.toggle('theme-light', isLight);
        documentObject.body.classList.toggle('theme-light', isLight);
        state.currentBaseLayer = 'default';

        const initialId = getInitialId();
        const initialFeature = state.isCirclesFeature ? 'circles' : state.currentFeature;
        state.allFeatures = await loadFeatures(initialFeature);
        markMapStartup('dataset-ready');

        initializeMap();
        markMapStartup('map-initialized');
        setupPageUi();
        markMapStartup('page-ui-ready');
        selectSubject(initialId, true, false);
        markMapStartup('initial-selection-ready');

        if (initialId === 'Oakridge' || initialId === 'Cottage Grove') {
            schedule(() => notify('There is no data for this count circle'), 800);
        }

        if (!state.map) {
            finalizeStartupView();
        } else if (state.map.loaded && state.map.loaded()) {
            schedule(finalizeStartupView, 80);
        } else {
            state.map.once('load', () => schedule(finalizeStartupView, 80));
            state.map.once('idle', () => schedule(finalizeStartupView, 80));
            schedule(finalizeStartupView, 400);
        }
    } catch (error) {
        logError('Error initializing maps tile page:', error);
        updateHeader('Error loading map data');
        finalizeStartupView();
    }
}
