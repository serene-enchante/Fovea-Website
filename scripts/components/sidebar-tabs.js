import { CIRCLE_ID } from '../config/app-config.js';

export function syncSidebarTabs(state, documentObject = globalThis.document) {
    if (!documentObject) return state.activeTab === 'overview' || state.activeTab === 'about';

    const isBirdSelected = Boolean(state.selectedBird);
    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
    const isSpecificZone = !state.isCirclesFeature && !isCircle && !isBirdSelected;

    const setDisplay = (tab, display) => {
        const capsule = documentObject.querySelector(`.sidebar-capsule[data-tab="${tab}"]`);
        if (capsule) capsule.style.display = display;
        return capsule;
    };

    setDisplay('observations', isBirdSelected ? 'inline-flex' : 'none');
    setDisplay('birds', isSpecificZone ? 'inline-flex' : 'none');
    setDisplay('organizers', isBirdSelected ? 'none' : 'inline-flex');
    setDisplay('resources', isBirdSelected ? 'none' : 'inline-flex');

    if (!isSpecificZone && state.activeTab === 'birds' && !isBirdSelected) state.activeTab = 'overview';

    const itemsCapsule = setDisplay('items', (isSpecificZone || isBirdSelected) ? 'none' : 'inline-flex');
    if (itemsCapsule) itemsCapsule.textContent = state.isCirclesFeature ? 'Circles' : 'Circle Zones';

    if ((isSpecificZone || isBirdSelected) && state.activeTab === 'items') state.activeTab = 'overview';
    if (!isBirdSelected && state.activeTab === 'observations') state.activeTab = 'overview';

    const isOverview = state.activeTab === 'overview' || state.activeTab === 'about';
    documentObject.querySelectorAll('.sidebar-capsule').forEach(capsule => {
        const tab = capsule.getAttribute('data-tab');
        if (!isOverview && tab === state.activeTab) capsule.classList.add('is-active');
        else capsule.classList.remove('is-active');
    });

    return isOverview;
}
