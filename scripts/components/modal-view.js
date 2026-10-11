

export function closeAvenzaModal(documentObject = globalThis.document) {
    if (!documentObject) return;
    const avenzaModal = documentObject.getElementById("avenza-instruction-modal");
    if (avenzaModal) {
        avenzaModal.setAttribute("aria-hidden", "true");
        avenzaModal.classList.remove("is-open");
    }
    documentObject.body.classList.remove("has-avenza-modal");

    const isAnyOtherModalOpen = documentObject.querySelector(".maps-tile-modal.is-open:not(#avenza-instruction-modal)");
    if (!isAnyOtherModalOpen) {
        const bottomNav = documentObject.querySelector(".mobile-bottom-nav-container");
        if (bottomNav) {
            bottomNav.classList.remove("is-hidden-entirely");
            bottomNav.style.removeProperty("display");
        }
    }
}

export function closeAllAppsModal(documentObject = globalThis.document) {
    if (!documentObject) return;
    const allAppsModal = documentObject.getElementById("all-apps-modal");
    if (allAppsModal) {
        allAppsModal.setAttribute("aria-hidden", "true");
        allAppsModal.classList.remove("is-open");
    }
}

export function closeAllModals({
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    onBeforeClose = () => {}
} = {}) {
    if (!documentObject) return;
    onBeforeClose();
    const avenzaModal = documentObject.getElementById("avenza-instruction-modal");
    if (avenzaModal) {
        avenzaModal.setAttribute("aria-hidden", "true");
        avenzaModal.classList.remove("is-open");
    }
    documentObject.body.classList.remove("has-avenza-modal");

    const bottomNav = documentObject.querySelector(".mobile-bottom-nav-container");
    if (bottomNav) {
        bottomNav.classList.remove("is-hidden-entirely");
        bottomNav.style.removeProperty("display");
    }

    const downloadModal = documentObject.getElementById("downloads-modal");
    if (downloadModal) {
        downloadModal.setAttribute("aria-hidden", "true");
        downloadModal.classList.remove("is-open");
    }

    const copyModal = documentObject.getElementById("copy-link-modal");
    if (copyModal) {
        copyModal.setAttribute("aria-hidden", "true");
        copyModal.classList.remove("is-open");
    }

    const helpModal = documentObject.getElementById("help-modal");
    if (helpModal) {
        helpModal.setAttribute("aria-hidden", "true");
        helpModal.classList.remove("is-open");
    }

    const suggestModal = documentObject.getElementById("suggest-modal");
    if (suggestModal) {
        suggestModal.setAttribute("aria-hidden", "true");
        suggestModal.classList.remove("is-open");
    }

    const allAppsModal = documentObject.getElementById("all-apps-modal");
    if (allAppsModal) {
        allAppsModal.setAttribute("aria-hidden", "true");
        allAppsModal.classList.remove("is-open");
    }

    if (typeof windowObject?.updateActionButtonsState === "function") {
        windowObject.updateActionButtonsState();
    }

    if (typeof windowObject?.renderSidebarList === "function") {
        windowObject.renderSidebarList();
    }
}
