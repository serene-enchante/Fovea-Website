import { state } from '../state.js';
import { normalizeZoneId } from '../utils/format-utils.js';
import { CIRCLE_ID } from '../config/app-config.js';

export function updateKeyboardTileFocus(newIndex, { state: mapState = state, documentObject = globalThis.document } = {}) {
    if (!documentObject) return;
    const tiles = documentObject.querySelectorAll("#sidebar-zone-list .tile-zone-item");
    if (!tiles || tiles.length === 0) return;
    if (newIndex < -1) newIndex = -1;
    if (newIndex >= tiles.length) newIndex = tiles.length - 1;
    mapState.focusedTileIndex = newIndex;
    tiles.forEach((tile, idx) => {
        const cid = tile.getAttribute("data-id");
        const isSelected = mapState.currentId !== CIRCLE_ID && (cid === mapState.currentId || (typeof normalizeZoneId === "function" && normalizeZoneId(cid) === normalizeZoneId(mapState.currentId)));

        if (newIndex >= 0 && idx === newIndex) {
            tile.classList.add("is-hovered");
            if (!isSelected && mapState.map && mapState.map.getSource('zones')) {
                try {
                    mapState.map.setFeatureState({ source: 'zones', id: cid }, { hover: true });
                } catch (e) {}
            }
        } else {
            tile.classList.remove("is-hovered");
            if (!isSelected && mapState.map && mapState.map.getSource('zones')) {
                try {
                    mapState.map.setFeatureState({ source: 'zones', id: cid }, { hover: false });
                } catch (e) {}
            }
        }
    });
}

export function highlightTileItem(key) {
    if (key == null) return;
    key = String(key);
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    const items = listContainer.querySelectorAll(".tile-zone-item");
    items.forEach(item => {
        const dataId = item.getAttribute("data-id") || "";
        const matches = dataId.toLowerCase() === key.toLowerCase() || (normalizeZoneId(dataId) === normalizeZoneId(key) && key !== CIRCLE_ID);
        if (matches) {
            item.classList.add("is-hovered");
        } else {
            item.classList.remove("is-hovered");
        }
    });
}

export function unhighlightTileItem() {
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    const items = listContainer.querySelectorAll(".tile-zone-item");
    items.forEach(item => {
        item.classList.remove("is-hovered");
    });
}

export function setupSidebarScrollListener({ documentObject = globalThis.document, windowObject = globalThis.window } = {}) {
    if (!documentObject || !windowObject) return;
    const scrollBox = documentObject.getElementById("sidebar-zone-list");
    const header = documentObject.getElementById("sidebar-header");
    const sidebar = documentObject.querySelector(".maps-tile-sidebar");

    if (!scrollBox || !header || !sidebar) return;

    // On mobile the sidebar itself is the scroll container (unified layout).
    // On desktop the scrollBox (zone list) is the scroll container.
    const isMobile = () => windowObject.innerWidth <= 768;

    const bottomNav = documentObject.querySelector(".mobile-bottom-nav");

    const onScroll = (e) => {
        const target = e.currentTarget;
        const scrollTop = target.scrollTop;
        const scrolled = scrollTop > 4;

        header.classList.toggle("is-scrolled", scrolled);
        sidebar.classList.toggle("is-scrolled", scrolled);
        // body class lets the resize bar ::after gradient fire (sibling of sidebar)
        documentObject.body.classList.toggle("sidebar-is-scrolled", scrolled);

        // Hide mobile bottom nav when scrolling down, show only when back at the top
        if (isMobile() && bottomNav) {
            if (scrollTop > 12) {
                bottomNav.classList.add("is-hidden");
            } else {
                bottomNav.classList.remove("is-hidden");
            }
        }
    };

    // Attach to both — only one will actually be scrolling at a time
    sidebar.addEventListener("scroll", onScroll, { passive: true });
    scrollBox.addEventListener("scroll", onScroll, { passive: true });
}
