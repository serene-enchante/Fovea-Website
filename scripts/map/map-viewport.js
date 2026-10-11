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
