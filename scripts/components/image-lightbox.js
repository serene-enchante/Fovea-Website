export function openImageLightbox(src, alt = "Enlarged view", text = "", credit = "", documentObject = globalThis.document) {
    if (!documentObject) return;
    const modal = documentObject.getElementById("image-lightbox-modal");
    const img = documentObject.getElementById("lightbox-img");
    const textEl = documentObject.getElementById("lightbox-text");
    const creditEl = documentObject.getElementById("lightbox-credit");
    if (modal && img) {
        img.src = src;
        img.alt = alt;
        if (textEl) {
            textEl.textContent = text;
            textEl.style.display = text ? "block" : "none";
        }
        if (creditEl) {
            creditEl.textContent = credit;
            creditEl.style.display = credit ? "block" : "none";
        }
        modal.setAttribute("aria-hidden", "false");
        modal.classList.add("is-open");
    }
}

export function setupImageLightbox({ documentObject = globalThis.document } = {}) {
    if (!documentObject) return;
    const modal = documentObject.getElementById("image-lightbox-modal");
    if (!modal) return;

    const closeModal = () => {
        modal.setAttribute("aria-hidden", "true");
        modal.classList.remove("is-open");
    };

    modal.querySelectorAll("[data-modal-close]").forEach(closeElement => {
        closeElement.addEventListener("click", event => {
            event.stopPropagation();
            closeModal();
        });
    });

    documentObject.addEventListener("keydown", event => {
        if (event.key === "Escape" && modal.getAttribute("aria-hidden") === "false") closeModal();
    });
}
