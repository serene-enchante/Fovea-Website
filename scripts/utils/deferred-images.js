export function activateDeferredImages(container) {
    if (!container?.querySelectorAll) return;

    container.querySelectorAll('img[data-src]').forEach(image => {
        image.src = image.dataset.src;
        image.removeAttribute('data-src');
    });
}
