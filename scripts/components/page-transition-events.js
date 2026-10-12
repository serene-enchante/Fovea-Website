export function setupPageTransitionEvents({
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    setTimeoutFn = globalThis.setTimeout
} = {}) {
    const homeLinks = [
        documentObject.getElementById('desktop-nav-tab-home'),
        documentObject.getElementById('mobile-nav-tab-home'),
        documentObject.querySelector('.header-logo-container a')
    ].filter(Boolean);
    const overlay = documentObject.getElementById('page-transition-overlay');
    if (homeLinks.length === 0) return;

    homeLinks.forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const destination = link.getAttribute('href') || '../';
            if (windowObject.transitionToPage) {
                windowObject.transitionToPage(destination);
            } else if (overlay) {
                overlay.classList.remove('is-loaded');
                overlay.classList.add('is-active');
                setTimeoutFn(() => {
                    windowObject.location.href = destination;
                }, 500);
            } else {
                windowObject.location.href = destination;
            }
        });
    });

    windowObject.addEventListener('pageshow', event => {
        if (!event.persisted) return;
        documentObject.body.classList.remove('is-transitioning');
        if (overlay) {
            overlay.classList.add('is-loaded');
            overlay.classList.remove('is-active');
        }
    });
}
