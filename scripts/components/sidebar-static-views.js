export function renderOrganizersList(listContainer, documentObject = globalThis.document) {
    if (!listContainer || !documentObject) return;
    const item = documentObject.createElement('div');
    item.className = 'tile-zone-item tile-zone-item--organizer';
    item.innerHTML = `
        <div class="tile-zone-item__thumb tile-zone-item__thumb--organizer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        </div>
        <div class="tile-zone-item__info">
            <div class="tile-zone-item__title">Name</div>
            <div class="tile-zone-item__meta">
                <span class="tile-zone-item__meta-item">Job Title</span>
            </div>
        </div>
        <div class="tile-zone-item__actions">
            <button type="button" class="sidebar-overview-people__icon-btn" title="Email" aria-label="Email">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                </svg>
            </button>
            <button type="button" class="sidebar-overview-people__icon-btn" title="Phone" aria-label="Phone">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.62 10.79a15.053 15.053 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.01l-2.2 2.2z"/>
                </svg>
            </button>
        </div>
    `;
    listContainer.appendChild(item);
}

export function renderResourcesList(listContainer, documentObject = globalThis.document) {
    if (!listContainer || !documentObject) return;
    const emptyEl = documentObject.createElement('div');
    emptyEl.className = 'sidebar-empty-state';
    emptyEl.innerHTML = `
        <svg class="sidebar-empty-state__icon" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
        <div class="sidebar-empty-state__text">no items found</div>
    `;
    listContainer.appendChild(emptyEl);
}
