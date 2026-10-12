import { CIRCLE_ID } from '../config/app-config.js';
import { FLORENCE_ZONE_BIRDS } from '../config/florence-zone-guide.js';
import { getEbirdUrl } from '../services/ebird-links.js';
import { displayZoneId, normalizeZoneId } from '../utils/format-utils.js';

export function renderBirdSpeciesList(listContainer, {
    state,
    onSelectBird = () => {},
    documentObject = globalThis.document
}) {
    if (!listContainer || !documentObject || !state) return;

    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
    let zoneBirdsData = null;

    if (state.currentFeature === 'florence' && !state.isCirclesFeature && !isCircle) {
        const targetFeature = state.allFeatures.find(feature => {
            const zoneId = feature.properties?.zid;
            return zoneId && (zoneId.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zoneId) === normalizeZoneId(state.currentId));
        });
        if (targetFeature) {
            const zoneId = displayZoneId(targetFeature.properties?.zid);
            zoneBirdsData = FLORENCE_ZONE_BIRDS[zoneId] || FLORENCE_ZONE_BIRDS[String(parseInt(zoneId, 10))];
        }
    }

    if (!zoneBirdsData?.birds?.length) {
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

    if (zoneBirdsData.desc) {
        const introEl = documentObject.createElement('div');
        introEl.className = 'sidebar-birds-intro';
        introEl.textContent = zoneBirdsData.desc;
        listContainer.appendChild(introEl);
    }

    zoneBirdsData.birds.forEach(bird => {
        const ebirdUrl = getEbirdUrl(bird.name);
        const item = documentObject.createElement('div');
        item.className = 'tile-zone-item tile-zone-item--no-thumb tile-zone-item--bird-link';
        item.title = `Select ${bird.name} to view observations on map`;
        item.innerHTML = `
            <div class="tile-zone-item__info">
                <div class="tile-zone-item__title">
                    <span>${bird.name}</span>
                    <a href="${ebirdUrl}" target="_blank" rel="noopener noreferrer" class="tile-zone-item__ext-btn" title="Open ${bird.name} on eBird" onclick="event.stopPropagation();">
                        <svg class="tile-zone-item__ext-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </div>
            </div>
        `;
        item.addEventListener('click', () => onSelectBird(bird.name));
        listContainer.appendChild(item);
    });
}
