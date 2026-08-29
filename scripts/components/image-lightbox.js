export function openImageLightbox(src, alt = "Enlarged view", text = "", credit = "") {
    const modal = document.getElementById("image-lightbox-modal");
    const img = document.getElementById("lightbox-img");
    const textEl = document.getElementById("lightbox-text");
    const creditEl = document.getElementById("lightbox-credit");
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