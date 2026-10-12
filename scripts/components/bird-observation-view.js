import { state } from '../state.js';
import { getEbirdUrl } from '../services/ebird-links.js';
import { openImageLightbox } from './image-lightbox.js';

let currentPopup = null;

export function openBirdObservationPopup(feature, { map = state.map, flyTo = false } = {}) {
    const props = feature?.properties || {};
    const coords = feature?.geometry?.coordinates;
    const Popup = globalThis.maplibregl?.Popup;
    if (!map || !coords || !Popup) return;

    if (flyTo) {
        map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 13.5), speed: 1.2 });
    }
    currentPopup?.remove();
    currentPopup = new Popup({ closeButton: true, closeOnClick: true, className: 'bird-observation-popup' })
        .setLngLat(coords)
        .setHTML(`
            <div>
                ${props.photoUrl ? `<img src="${props.photoUrl}" alt="${props.species || ''}" class="bird-obs-popup__img" />` : ''}
                <div class="bird-obs-popup__title">${props.species || ''}</div>
                <div class="bird-obs-popup__meta">
                    <div>Observed by <strong>${props.user || ''}</strong></div>
                    <div>Date: ${props.date || ''}</div>
                    ${props.place ? `<div>${props.place}</div>` : ''}
                </div>
                <a href="${props.uri || ''}" target="_blank" rel="noopener noreferrer" class="bird-obs-popup__link">
                    View on iNaturalist &rarr;
                </a>
            </div>
        `)
        .addTo(map);
}

export function createBirdObservationItem(feature, documentObject = globalThis.document) {
    if (!documentObject) return null;

    const props = feature.properties || {};
    const item = documentObject.createElement('div');
    item.className = 'sidebar-bird-obs-item';
    item.innerHTML = `
        ${props.photoUrl ? `<img src="${props.photoUrl}" alt="${props.species}" class="sidebar-bird-obs-item__thumb" />` : `
            <div class="sidebar-bird-obs-item__thumb" style="display:flex;align-items:center;justify-content:center;color:#64748b;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
            </div>
        `}
        <div class="sidebar-bird-obs-item__info">
            <div class="sidebar-bird-obs-item__user">${props.user || ''}</div>
            <div class="sidebar-bird-obs-item__date">${props.date || ''}</div>
        </div>
    `;

    item.addEventListener('click', () => {
        openBirdObservationPopup(feature, { flyTo: true });
    });

    return item;
}

export function clearBirdObservationPopup() {
    currentPopup?.remove();
    currentPopup = null;
}

export function renderBirdObservationsList(listContainer, stateObject = state, documentObject = globalThis.document) {
    if (!listContainer || !documentObject) return;
    const observations = stateObject.selectedBirdObservations || [];
    if (observations.length === 0) {
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

    const introEl = documentObject.createElement('div');
    introEl.className = 'sidebar-birds-intro';
    introEl.textContent = `All recorded iNaturalist observations of ${stateObject.selectedBird} in this zone area.`;
    listContainer.appendChild(introEl);

    observations.forEach(feature => {
        const item = createBirdObservationItem(feature, documentObject);
        if (item) listContainer.appendChild(item);
    });
}

export function renderSidebarBirdPanel(listContainer, birdName, { onRenderObservations = () => {}, documentObject = globalThis.document } = {}) {
    const ebirdUrl = getEbirdUrl(birdName);
    const observations = state.selectedBirdObservations || [];
    const featuredPhotoUrl = state.selectedBirdPhotoUrl || "";
    const photoCredit = state.selectedBirdPhotoCredit || "";

    const panel = documentObject.createElement("div");
    panel.className = "sidebar-bird-panel";
    panel.innerHTML = `
        <!-- Big Media Image Container (populated from observation or species photo) -->
        <div class="sidebar-about-media sidebar-bird-media" style="${featuredPhotoUrl ? 'display: block;' : 'display: none;'} cursor: pointer;">
            <img src="${featuredPhotoUrl}" alt="${birdName}" loading="eager" decoding="async" />
        </div>

        <a href="${ebirdUrl}" target="_blank" rel="noopener noreferrer" class="sidebar-bird-panel__ebird-btn" title="View species on eBird">
            <span>View species on eBird</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
        </a>

        <div class="sidebar-overview-preview sidebar-overview-preview--birds" style="margin-top: 0.25rem;">
            <div class="sidebar-overview-preview__header sidebar-overview-preview__header--birds">
                <span class="sidebar-overview-preview__title">Observations</span>
                <span class="sidebar-bird-panel__count-badge">${observations.length > 0 ? `${observations.length} found` : ''}</span>
            </div>

            <div class="sidebar-bird-panel__status" style="${observations.length > 0 ? 'display: none;' : 'display: block;'} font-size: 0.85rem; color: var(--subtext-color, #94a3b8); padding: 0.25rem 0.5rem;">
                ${observations.length === 0 ? 'No recent observations recorded in this zone area.' : ''}
            </div>

            <div class="sidebar-bird-panel__list"></div>

            <button type="button" class="sidebar-overview-preview__footer sidebar-overview-preview__footer--obs" style="${observations.length > 0 ? 'display: flex;' : 'display: none;'}" title="View all observations">
                <span class="sidebar-overview-preview__action">View all (${observations.length}) &rarr;</span>
            </button>
        </div>
    `;

    const mediaDiv = panel.querySelector(".sidebar-bird-media");
    if (mediaDiv && featuredPhotoUrl) {
        mediaDiv.onclick = () => {
            openImageLightbox(featuredPhotoUrl, birdName, `${birdName} (observed in Area)`, photoCredit || "Photo via iNaturalist");
        };
    }

    const obsListEl = panel.querySelector(".sidebar-bird-panel__list");
    if (obsListEl && observations.length > 0) {
        const previewObs = observations.slice(0, 5);
        previewObs.forEach(feature => {
            const item = createBirdObservationItem(feature, documentObject);
            if (item) obsListEl.appendChild(item);
        });
    }

    const viewAllBtn = panel.querySelector(".sidebar-overview-preview__footer--obs");
    if (viewAllBtn) {
        viewAllBtn.onclick = () => {
            state.activeTab = "observations";
            onRenderObservations();
        };
    }

    const headerTitle = panel.querySelector(".sidebar-overview-preview__title");
    if (headerTitle) {
        headerTitle.onclick = () => {
            state.activeTab = "observations";
            onRenderObservations();
        };
    }

    listContainer.appendChild(panel);
}
