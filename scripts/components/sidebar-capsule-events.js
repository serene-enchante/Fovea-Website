export function setupSidebarCapsuleEvents({
    state,
    documentObject = globalThis.document,
    onRender = () => {},
    notify = () => {}
}) {
    if (!documentObject) return;

    const capsules = documentObject.querySelectorAll('.sidebar-capsule');
    capsules.forEach(capsule => {
        capsule.addEventListener('click', event => {
            event?.preventDefault?.();
            event?.stopPropagation?.();

            const tab = capsule.getAttribute('data-tab');
            if (tab === 'tools' || tab === 'settings') {
                notify(`${tab === 'tools' ? 'Tools' : 'Settings'} view is not available (coming soon)`);
                return;
            }

            if (capsule.classList.contains('is-active')) {
                capsules.forEach(item => item.classList.remove('is-active'));
                state.activeTab = 'overview';
            } else {
                capsules.forEach(item => item.classList.remove('is-active'));
                capsule.classList.add('is-active');
                state.activeTab = tab || 'items';
            }
            onRender();
        });
    });
}
