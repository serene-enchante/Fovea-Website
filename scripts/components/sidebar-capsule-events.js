export function activateSidebarTab(tab, { state, documentObject = globalThis.document, onRender = () => {} }) {
    if (!documentObject) return;
    documentObject.querySelectorAll('.sidebar-capsule').forEach(item => item.classList.remove('is-active'));
    state.activeTab = tab;
    if (tab !== 'overview') {
        documentObject.querySelector?.(`.sidebar-capsule[data-tab="${tab}"]`)?.classList.add('is-active');
    }
    onRender();
}

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

            const nextTab = capsule.classList.contains('is-active') ? 'overview' : (tab || 'items');
            activateSidebarTab(nextTab, { state, documentObject, onRender });
        });
    });
}
