import { state } from '../state.js';

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
