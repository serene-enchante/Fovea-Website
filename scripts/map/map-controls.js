export function setupMapNavigationControls({
    mapWrapper,
    state,
    documentObject = globalThis.document,
    onLocate = () => {},
    onToggleFullscreen = () => {}
}) {
    let controlContainer = documentObject.querySelector('.map-ctrl-container');
    if (!controlContainer) {
        controlContainer = documentObject.createElement('div');
        controlContainer.className = 'map-ctrl-container';

        const topLeftPanel = documentObject.createElement('div');
        topLeftPanel.className = 'map-ctrl-panel map-ctrl-panel--left';
        controlContainer.appendChild(topLeftPanel);

        const topRightPanel = documentObject.createElement('div');
        topRightPanel.className = 'map-ctrl-panel map-ctrl-panel--right';
        controlContainer.appendChild(topRightPanel);
        mapWrapper.appendChild(controlContainer);
    }

    const topLeft = controlContainer.querySelector('.map-ctrl-panel.map-ctrl-panel--left');

    const zoomControl = documentObject.createElement('div');
    zoomControl.className = 'map-ctrl-zoom map-ctrl-bar map-ctrl';

    const zoomInButton = documentObject.createElement('a');
    zoomInButton.className = 'map-ctrl-zoom-in';
    zoomInButton.href = '#';
    zoomInButton.title = 'Zoom in';
    zoomInButton.role = 'button';
    zoomInButton.setAttribute('aria-label', 'Zoom in');
    zoomInButton.textContent = '+';
    zoomInButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (state.map) state.map.zoomIn();
    });

    const zoomOutButton = documentObject.createElement('a');
    zoomOutButton.className = 'map-ctrl-zoom-out';
    zoomOutButton.href = '#';
    zoomOutButton.title = 'Zoom out';
    zoomOutButton.role = 'button';
    zoomOutButton.setAttribute('aria-label', 'Zoom out');
    zoomOutButton.innerHTML = '&#x2212;';
    zoomOutButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (state.map) state.map.zoomOut();
    });
    zoomControl.appendChild(zoomInButton);
    zoomControl.appendChild(zoomOutButton);
    topLeft.appendChild(zoomControl);

    const locateControl = documentObject.createElement('div');
    locateControl.className = 'map-ctrl-bar map-ctrl map-ctrl-locate';
    const locateButton = documentObject.createElement('a');
    locateButton.className = 'map-ctrl-locate-btn';
    locateButton.href = '#';
    locateButton.title = 'Show My Location';
    locateButton.role = 'button';
    locateButton.setAttribute('aria-label', 'Show My Location');
    locateButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="8"></circle>
            <line x1="12" y1="2" x2="12" y2="4"></line>
            <line x1="12" y1="20" x2="12" y2="22"></line>
            <line x1="2" y1="12" x2="4" y2="12"></line>
            <line x1="20" y1="12" x2="22" y2="12"></line>
            <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
        </svg>
    `;
    locateButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onLocate(state);
    });
    locateControl.appendChild(locateButton);
    topLeft.appendChild(locateControl);

    const fullscreenControl = documentObject.createElement('div');
    fullscreenControl.className = 'map-ctrl-bar map-ctrl map-ctrl-fullscreen';
    const fullscreenButton = documentObject.createElement('a');
    fullscreenButton.className = 'map-ctrl-fullscreen-btn';
    fullscreenButton.href = '#';
    fullscreenButton.title = 'Toggle Fullscreen';
    fullscreenButton.role = 'button';
    fullscreenButton.setAttribute('aria-label', 'Toggle Fullscreen');
    fullscreenButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
        </svg>
    `;
    fullscreenButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onToggleFullscreen();
    });
    fullscreenControl.appendChild(fullscreenButton);
    topLeft.appendChild(fullscreenControl);

    return { controlContainer, topLeft };
}
