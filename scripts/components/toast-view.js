export function showToast(message, isError = false) {
    let toast = document.getElementById("toast-notification");
    const container = document.querySelector(".maps-tile-map-area") || document.body;
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        toast.className = "toast-notification";
        container.appendChild(toast);
    } else if (toast.parentElement !== container) {
        container.appendChild(toast);
    }

    toast.innerHTML = `<span>${message}</span>`;

    if (isError) {
        toast.classList.add("toast-notification--disabled");
    } else {
        toast.classList.remove("toast-notification--disabled");
    }
    toast.classList.add("is-visible");
    if (window._toastTimer) clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2800);
}
