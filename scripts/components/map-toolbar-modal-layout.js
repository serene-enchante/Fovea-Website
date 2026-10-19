export function setupMapToolbarModalLayout({
    modals,
    documentObject = globalThis.document,
    windowObject = globalThis.window
}) {
    const reparentModals = () => {
        const mapWrapper = documentObject.getElementById('map-wrapper')
            || documentObject.querySelector('.maps-tile-map-area');
        const actionsRow = documentObject.querySelector('.maps-tile-header__actions');
        if (!actionsRow) return;

        if (windowObject.innerWidth <= 768) {
            if (actionsRow.parentElement !== documentObject.body) {
                documentObject.body.appendChild(actionsRow);
            }
            modals.forEach(modal => {
                if (modal && modal.parentElement !== actionsRow) actionsRow.appendChild(modal);
            });
        } else if (mapWrapper) {
            if (actionsRow.parentElement !== mapWrapper) mapWrapper.appendChild(actionsRow);
            modals.forEach(modal => {
                if (modal && modal.parentElement !== actionsRow) actionsRow.appendChild(modal);
            });
        }
    };

    reparentModals();
    windowObject.addEventListener('resize', reparentModals);
    return () => windowObject.removeEventListener('resize', reparentModals);
}
