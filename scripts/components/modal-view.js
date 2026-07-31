

export function closeAllModals() {
    const avenzaModal = document.getElementById("avenza-instruction-modal");
    if (avenzaModal) {
        avenzaModal.setAttribute("aria-hidden", "true");
        avenzaModal.classList.remove("is-open");
    }
    document.body.classList.remove("has-avenza-modal");

    const bottomNav = document.querySelector(".mobile-bottom-nav-container");
    if (bottomNav) {
        bottomNav.classList.remove("is-hidden-entirely");
        bottomNav.style.removeProperty("display");
    }

    const downloadModal = document.getElementById("downloads-modal");
    if (downloadModal) {
        downloadModal.setAttribute("aria-hidden", "true");
        downloadModal.classList.remove("is-open");
    }

    const copyModal = document.getElementById("copy-link-modal");
    if (copyModal) {
        copyModal.setAttribute("aria-hidden", "true");
        copyModal.classList.remove("is-open");
    }

    const helpModal = document.getElementById("help-modal");
    if (helpModal) {
        helpModal.setAttribute("aria-hidden", "true");
        helpModal.classList.remove("is-open");
    }

    const suggestModal = document.getElementById("suggest-modal");
    if (suggestModal) {
        suggestModal.setAttribute("aria-hidden", "true");
        suggestModal.classList.remove("is-open");
    }

    const allAppsModal = document.getElementById("all-apps-modal");
    if (allAppsModal) {
        allAppsModal.setAttribute("aria-hidden", "true");
        allAppsModal.classList.remove("is-open");
    }

    if (typeof window.updateActionButtonsState === "function") {
        window.updateActionButtonsState();
    }

    if (typeof window.renderSidebarList === "function") {
        window.renderSidebarList();
    }
}
