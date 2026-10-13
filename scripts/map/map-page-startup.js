export async function runMapPageStartup({
    state,
    storageObject = globalThis.localStorage,
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    schedule = globalThis.setTimeout,
    getInitialId,
    loadFeatures,
    renderSidebarList,
    initializeMap,
    setupPageUi,
    selectSubject,
    notify,
    updateHeader,
    logError = (...args) => console.error(...args)
}) {
    const triggerEntrance = () => {
        documentObject.body.classList.remove('is-transitioning');

        if (state.map) {
            state.map.resize();
            selectSubject(state.currentId, true, false);
        }

        const overlay = documentObject.getElementById('page-transition-overlay');
        if (overlay) {
            overlay.classList.add('is-loaded');
            overlay.classList.remove('is-active');
        }
    };

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

        renderSidebarList();
        initializeMap();
        setupPageUi();
        selectSubject(initialId, true, false);

        if (initialId === 'Oakridge' || initialId === 'Cottage Grove') {
            schedule(() => notify('There is no data for this count circle'), 800);
        }

        if (!state.map) {
            triggerEntrance();
        } else if (state.map.loaded && state.map.loaded()) {
            schedule(triggerEntrance, 80);
        } else {
            state.map.once('load', () => schedule(triggerEntrance, 80));
            state.map.once('idle', () => schedule(triggerEntrance, 80));
            schedule(triggerEntrance, 400);
        }
    } catch (error) {
        logError('Error initializing maps tile page:', error);
        updateHeader('Error loading map data');
        triggerEntrance();
    }
}
