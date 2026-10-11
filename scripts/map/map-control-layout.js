export function updateMapControlPositions({ documentObject = globalThis.document, isMobile }) {
    if (!documentObject) return;

    const topLeft = documentObject.querySelector('.map-ctrl-container .map-ctrl-panel.map-ctrl-panel--left');
    const topRight = documentObject.querySelector('.map-ctrl-container .map-ctrl-panel.map-ctrl-panel--right');
    const zoomCtrl = documentObject.querySelector('.map-ctrl-zoom');
    const locateCtrl = documentObject.querySelector('.map-ctrl-locate');
    const fullscreenCtrl = documentObject.querySelector('.map-ctrl-fullscreen');
    const layersCtrl = documentObject.querySelector('.map-ctrl-styles');

    if (isMobile) {
        if (topRight && zoomCtrl) topRight.appendChild(zoomCtrl);
        if (topLeft) {
            if (layersCtrl) topLeft.appendChild(layersCtrl);
            if (locateCtrl) topLeft.appendChild(locateCtrl);
            if (fullscreenCtrl) topLeft.appendChild(fullscreenCtrl);
        }
    } else if (topLeft) {
        if (zoomCtrl) topLeft.appendChild(zoomCtrl);
        if (fullscreenCtrl) topLeft.appendChild(fullscreenCtrl);
        if (locateCtrl) topLeft.appendChild(locateCtrl);
        if (layersCtrl) topLeft.appendChild(layersCtrl);
    }
}
