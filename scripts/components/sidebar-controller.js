import { CIRCLE_ID } from '../config/app-config.js';
import { normalizeZoneId } from '../utils/format-utils.js';

export function createSidebarController({
    state,
    documentObject = globalThis.document,
    syncTabs,
    renderBirdObservations,
    renderBirdPanel,
    renderBirdSpecies,
    renderOrganizers,
    renderResources,
    renderOverview,
    renderMapFeatureList,
    onSelectBird,
    onSelectCircle,
    onSelectZone,
    onActivateTab,
    onFeatureHover,
    onOpenImageLightbox,
    onUpdateKeyboardFocus = () => {}
}) {
    function renderSidebarList() {
        const isOverview = syncTabs(state, documentObject);
        const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
        const listContainer = documentObject.getElementById('sidebar-zone-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';

        if (state.selectedBird) {
            if (state.activeTab === 'observations') renderBirdObservations(listContainer);
            else renderBirdPanel(listContainer, state.selectedBird, { onRenderObservations: renderSidebarList });
            return;
        }

        if (state.activeTab === 'birds') {
            renderBirdSpecies(listContainer, { state, onSelectBird, documentObject });
            return;
        }
        if (state.activeTab === 'organizers') {
            renderOrganizers(listContainer);
            return;
        }
        if (state.activeTab === 'resources') {
            renderResources(listContainer);
            return;
        }

        if (state.isCirclesFeature) {
            if (isOverview) {
                renderOverview(listContainer, { state, isCirclesFeature: true, isCircle: false, targetFeature: null,
                    onActivateTab, onSelectBird, onSelectCircle, onSelectZone, onFeatureHover, onOpenImageLightbox, documentObject });
            } else {
                renderMapFeatureList(listContainer, {
                    features: state.circlesFeatures,
                    isCirclesFeature: true,
                    map: state.map,
                    onSelectCircle,
                    documentObject
                });
            }
            return;
        }

        let targetFeature = null;
        if (!isCircle) {
            targetFeature = state.allFeatures.find(feature => {
                const zoneId = feature.properties?.zid;
                return zoneId && (zoneId.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zoneId) === normalizeZoneId(state.currentId));
            });
        }

        if (isOverview) {
            renderOverview(listContainer, { state, isCirclesFeature: false, isCircle, targetFeature,
                onActivateTab, onSelectBird, onSelectCircle, onSelectZone, onFeatureHover, onOpenImageLightbox, documentObject });
            return;
        }

        if (!isCircle && targetFeature) {
            const emptyEl = documentObject.createElement('div');
            emptyEl.className = 'sidebar-empty-state';
            emptyEl.innerHTML = `
                <svg class="sidebar-empty-state__icon" width="34" height="34" viewBox="0 0 512 512" fill="currentColor">
                    <path d="M128 32h32c17.7 0 32 14.3 32 32V96H96V64c0-17.7 14.3-32 32-32zm64 96V448c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V388.9c0-34.6 9.4-68.6 27.2-98.3C40.9 267.8 49.7 242.4 53 216L60.5 156c2-16 15.6-28 31.8-28H192zm227.8 0c16.1 0 29.8 12 31.8 28L459 216c3.3 26.4 12.1 51.8 25.8 74.6c17.8 29.7 27.2 63.7 27.2 98.3V448c0 17.7-14.3 32-32 32H352c-17.7 0-32-14.3-32-32V128h99.8zM320 64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32V96H320V64zm-32 64V288H224V128h64z"/>
                </svg>
                <div class="sidebar-empty-state__text">no items found</div>
            `;
            listContainer.appendChild(emptyEl);
            return;
        }

        renderMapFeatureList(listContainer, {
            features: state.allFeatures,
            currentId: state.currentId,
            map: state.map,
            onSelectZone,
            documentObject
        });

        if (state.lastNavSource === 'keyboard') {
            state.focusedTileIndex = 0;
            onUpdateKeyboardFocus(0);
        } else {
            state.focusedTileIndex = -1;
            onUpdateKeyboardFocus(-1);
        }
    }

    function updateBirdPanel(birdName) {
        const listContainer = documentObject.getElementById('sidebar-zone-list');
        if (!listContainer || state.selectedBird !== birdName) return;
        if (state.activeTab === 'observations') {
            renderBirdObservations(listContainer);
            return;
        }
        listContainer.innerHTML = '';
        renderBirdPanel(listContainer, birdName, { onRenderObservations: renderSidebarList });
    }

    return { renderSidebarList, updateBirdPanel };
}
