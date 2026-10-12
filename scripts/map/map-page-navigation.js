export function setupMapPageNavigation({
    state,
    circleId,
    normalizeZoneId,
    clearBirdObservations,
    selectSubject,
    switchToCirclesFeature,
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    setTimeoutFn = globalThis.setTimeout
}) {
    const isGitHubLoggedIn = Boolean(
        windowObject.localStorage.getItem('github_token') ||
        windowObject.sessionStorage.getItem('github_token') ||
        windowObject.localStorage.getItem('gh_user')
    );
    const editButton = documentObject.getElementById('btn-edit-item');
    if (editButton) {
        editButton.style.display = isGitHubLoggedIn ? '' : 'none';
        editButton.addEventListener('click', event => {
            event.stopPropagation();
            const target = state.currentId && state.currentId !== circleId
                ? normalizeZoneId(state.currentId)
                : circleId;
            windowObject.location.href = `/editor/?id=${encodeURIComponent(target)}`;
        });
    }

    const backButton = documentObject.getElementById('btn-capsule-back');
    if (!backButton) return;

    const executeBackNavigation = () => {
        if (state.selectedBird) {
            clearBirdObservations();
            selectSubject(state.currentId, true, true);
        } else if (!state.isCirclesFeature && (state.currentId === circleId || !state.currentId)) {
            switchToCirclesFeature();
        } else {
            selectSubject(circleId);
        }
    };

    backButton.addEventListener('click', event => {
        const list = documentObject.getElementById('sidebar-zone-list');
        const canAnimate = windowObject.innerWidth <= 768 && list
            && !list.classList.contains('fly-out-right')
            && !list.classList.contains('fly-in-left-active');
        if (!canAnimate) {
            executeBackNavigation();
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        list.classList.add('fly-out-right');
        setTimeoutFn(() => {
            executeBackNavigation();
            list.classList.remove('fly-out-right');
            list.classList.add('fly-in-left-start');
            list.offsetHeight;
            list.classList.add('fly-in-left-active');
            setTimeoutFn(() => {
                list.classList.remove('fly-in-left-start', 'fly-in-left-active');
            }, 250);
        }, 200);
    });
}
