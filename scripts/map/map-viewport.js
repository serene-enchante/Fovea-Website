export function setupMapViewportEffects(mapWrapper, {
    windowObject = globalThis.window,
    documentObject = globalThis.document,
    onResize = () => {},
    onMobileHomeAnimation = () => {}
} = {}) {
    if (!mapWrapper || !windowObject || !documentObject) return;

    mapWrapper.onmousemove = event => {
        if (windowObject.innerWidth <= 768) return;
        const rect = mapWrapper.getBoundingClientRect();
        mapWrapper.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
        mapWrapper.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
    };

    mapWrapper.onmouseleave = () => {
        mapWrapper.style.setProperty('--mouse-x', '-1000px');
        mapWrapper.style.setProperty('--mouse-y', '-1000px');
    };

    documentObject.addEventListener('fullscreenchange', () => {
        if (!documentObject.fullscreenElement) {
            mapWrapper.classList.remove('is-fullscreen');
            onMobileHomeAnimation();
        } else {
            mapWrapper.classList.add('is-fullscreen');
        }
        onResize();
    });

    windowObject.addEventListener('resize', onResize);
    windowObject.addEventListener('orientationchange', onResize);
}

export function setupMapEffectsAndFullscreen(mapWrapper, {
    state,
    updateControlPositions = () => {},
    adjustHeaderFontSize = () => {},
    updateLabelZoomVisibility = () => {},
    windowObject = globalThis.window,
    documentObject = globalThis.document,
    schedule = globalThis.setTimeout
} = {}) {
    const triggerMobileHomeAnimation = () => {
        if (windowObject.innerWidth > 768) return;
        const targets = documentObject.querySelectorAll('.intro-header, .maps-tile-header, .maps-tile-sidebar');
        targets.forEach(element => {
            element.classList.remove('animate-mobile-slide-down');
            void element.offsetWidth;
            element.classList.add('animate-mobile-slide-down');
        });
    };

    const handleResize = () => {
        updateControlPositions();
        adjustHeaderFontSize();
        if (state.map) {
            state.map.invalidateSize();
            schedule(() => state.map.invalidateSize(), 50);
            schedule(() => state.map.invalidateSize(), 200);
            schedule(() => state.map.invalidateSize(), 400);
        }
        updateLabelZoomVisibility();
    };

    setupMapViewportEffects(mapWrapper, {
        windowObject,
        documentObject,
        onResize: handleResize,
        onMobileHomeAnimation: triggerMobileHomeAnimation
    });
}
