import { getBbox } from '../utils/geometry-math.js';
import { state } from '../state.js';
import { displayZoneId, zoneImagePath, normalizeZoneId, FALLBACK_IMAGE } from '../utils/format-utils.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { switchToFeature, selectSubject } from '../map/map-selection.js';
import { openImageLightbox } from './image-lightbox.js';

export function renderSidebarList() {
    const itemsCapsule = document.querySelector('.sidebar-capsule[data-tab="items"]');
    if (itemsCapsule) {
        itemsCapsule.textContent = state.isCirclesFeature ? "Circles" : "Circle Zones";
    }

    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    if (state.isCirclesFeature) {
        if (state.activeTab === "about") {
            const aboutEl = document.createElement("div");
            aboutEl.className = "sidebar-about-wrapper";
            aboutEl.innerHTML = `
                <div class="sidebar-about-content">
                    <div class="sidebar-about-media">
                        <img src="../images/wetlands.jpg" alt="Audubon Circles" loading="eager" />
                    </div>
                    <p class="sidebar-about-text">Audubon Christmas Bird Count regional count circles. Click a circle to explore its subdivided survey zones.</p>
                </div>
            `;
            listContainer.appendChild(aboutEl);
            return;
        }

        const NO_DATA_CIRCLES = new Set(["Oakridge", "Cottage Grove"]);
        const sortedCircles = [...state.circlesFeatures].sort((a, b) => {
            const cidA = String(a.properties?.cid || "");
            const cidB = String(b.properties?.cid || "");
            const noDataA = NO_DATA_CIRCLES.has(cidA) ? 1 : 0;
            const noDataB = NO_DATA_CIRCLES.has(cidB) ? 1 : 0;
            if (noDataA !== noDataB) return noDataA - noDataB;
            return cidA.localeCompare(cidB, undefined, { sensitivity: "base" });
        });

        sortedCircles.forEach(feature => {
            const props = feature.properties || {};
            const cid = props.cid || "Circle";
            const item = document.createElement("div");
            item.className = "tile-zone-item";
            item.setAttribute("data-id", cid);

            let thumbImg = "";
            let isLogo = false;
            let isNotAvailable = false;
            if (cid === "Eugene") {
                thumbImg = "../images/logo-small.png";
                isLogo = true;
            } else if (cid === "Florence") {
                thumbImg = "../images/florence.png";
                isLogo = true;
            } else if (cid === "Oakridge" || cid === "Cottage Grove") {
                isNotAvailable = true;
            } else {
                thumbImg = "../images/wetlands.jpg";
            }

            let thumbHtml = "";
            if (isNotAvailable) {
                thumbHtml = `
                    <div class="tile-zone-item__thumb-placeholder" title="No data available">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                        </svg>
                    </div>
                `;
            } else {
                thumbHtml = `
                    <div class="tile-zone-item__thumb ${isLogo ? "tile-zone-item__thumb--logo" : ""}">
                        <img src="${thumbImg}" alt="${cid}" loading="eager">
                    </div>
                `;
            }

            item.innerHTML = `
                ${thumbHtml}
                <div class="tile-zone-item__info">
                    <div class="tile-zone-item__title">${cid}</div>
                </div>
            `;

            item.addEventListener("mouseenter", () => {
                if (state.map && state.map.getSource('zones')) {
                    try {
                        state.map.setFeatureState({ source: 'zones', id: cid }, { hover: true });
                    } catch (e) {}
                }
            });
            item.addEventListener("mouseleave", () => {
                if (state.map && state.map.getSource('zones')) {
                    try {
                        state.map.setFeatureState({ source: 'zones', id: cid }, { hover: false });
                    } catch (e) {}
                }
            });

            item.addEventListener("click", () => {
                const feature = state.circlesFeatures.find(f => f.properties.cid === cid);
                const bbox = feature ? getBbox(feature) : null;
                if (cid === "Eugene") {
                    switchToFeature("eugene");
                } else if (cid === "Florence") {
                    switchToFeature("florence");
                } else if (cid === "Oakridge" || cid === "Cottage Grove") {
                    showToast("There is no data for this count circle");
                }
            });
            listContainer.appendChild(item);
        });
        return;
    }

    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
    let targetFeature = null;
    if (!isCircle) {
        targetFeature = state.allFeatures.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
        });
    }

    if (state.activeTab === "about") {
        const aboutEl = document.createElement("div");
        aboutEl.className = "sidebar-about-wrapper";

        let descText = "";
        let imgSrc = "";
        let imgAlt = "";

        if (isCircle || !targetFeature) {
            const circleTitle = state.currentFeature === "florence" ? "Florence Christmas Bird Count" : "Eugene Christmas Bird Count";
            descText = `The ${circleTitle} circle is a 15-mile diameter count circle in Oregon. Explore the survey zones to view spatial boundaries, detailed historical summaries, and field maps.`;
            imgSrc = "../images/wetlands.jpg";
            imgAlt = `${circleTitle} Overview`;
        } else {
            const props = targetFeature.properties || {};
            const zid = displayZoneId(props.zid);
            descText = props.description || "Zone description not available.";
            imgSrc = zoneImagePath(props.zid);
            imgAlt = `Zone ${zid} Image`;
        }

        aboutEl.innerHTML = `
            <div class="sidebar-about-content">
                ${imgSrc ? `
                    <div class="sidebar-about-media">
                        <img src="${imgSrc}" alt="${imgAlt}" loading="lazy" />
                    </div>
                ` : ""}
                <p class="sidebar-about-text">${descText}</p>
            </div>
        `;

        const img = aboutEl.querySelector("img");
        const mediaDiv = aboutEl.querySelector(".sidebar-about-media");
        if (img) {
            img.addEventListener("error", () => {
                if (imgSrc !== FALLBACK_IMAGE && !isCircle) {
                    img.src = FALLBACK_IMAGE;
                } else {
                    if (mediaDiv) mediaDiv.style.display = "none";
                }
            });
        }

        if (mediaDiv && img) {
            mediaDiv.addEventListener("click", () => {
                openImageLightbox(img.src, imgAlt, descText);
            });
        }

        listContainer.appendChild(aboutEl);
        return;
    }

    if (!isCircle && targetFeature) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "sidebar-empty-state";
        emptyEl.innerHTML = `
            <svg class="sidebar-empty-state__icon" width="34" height="34" viewBox="0 0 512 512" fill="currentColor">
                <path d="M128 32h32c17.7 0 32 14.3 32 32V96H96V64c0-17.7 14.3-32 32-32zm64 96V448c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V388.9c0-34.6 9.4-68.6 27.2-98.3C40.9 267.8 49.7 242.4 53 216L60.5 156c2-16 15.6-28 31.8-28H192zm227.8 0c16.1 0 29.8 12 31.8 28L459 216c3.3 26.4 12.1 51.8 25.8 74.6c17.8 29.7 27.2 63.7 27.2 98.3V448c0 17.7-14.3 32-32 32H352c-17.7 0-32-14.3-32-32V128h99.8zM320 64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32V96H320V64zm-32 64V288H224V128h64z"/>
            </svg>
            <div class="sidebar-empty-state__text">no items found</div>
        `;
        listContainer.appendChild(emptyEl);
        return;
    }

    const sortedFeatures = [...state.allFeatures].sort((a, b) => {
        const zidA = String(a.properties?.zid || "");
        const zidB = String(b.properties?.zid || "");
        return zidA.localeCompare(zidB, undefined, { numeric: true, sensitivity: "base" });
    });

    sortedFeatures.forEach(feature => {
        const props = feature.properties || {};
        const zid = displayZoneId(props.zid);
        const item = document.createElement("div");
        item.className = "tile-zone-item";
        item.setAttribute("data-id", String(props.zid));

        const imgPath = zoneImagePath(props.zid);
        item.innerHTML = `
            <div class="tile-zone-item__thumb">
                <img src="${imgPath}" alt="Zone ${zid}" loading="eager">
            </div>
            <div class="tile-zone-item__info">
                <div class="tile-zone-item__title">Zone ${zid}</div>
            </div>
        `;

        const img = item.querySelector("img");
        if (img) {
            img.addEventListener("error", () => {
                img.src = FALLBACK_IMAGE;
            });
        }

        item.addEventListener("mouseenter", () => {
            const featureId = String(props.zid || "");
            const isSelected = state.currentId !== CIRCLE_ID && (featureId === state.currentId || (typeof normalizeZoneId === "function" && normalizeZoneId(featureId) === normalizeZoneId(state.currentId)));
            if (!isSelected && state.map && state.map.getSource('zones')) {
                try {
                    state.map.setFeatureState({ source: 'zones', id: featureId }, { hover: true });
                } catch (e) {}
            }
        });
        item.addEventListener("mouseleave", () => {
            const featureId = String(props.zid || "");
            const isSelected = state.currentId !== CIRCLE_ID && (featureId === state.currentId || (typeof normalizeZoneId === "function" && normalizeZoneId(featureId) === normalizeZoneId(state.currentId)));
            if (!isSelected && state.map && state.map.getSource('zones')) {
                try {
                    state.map.setFeatureState({ source: 'zones', id: featureId }, { hover: false });
                } catch (e) {}
            }
        });

        item.addEventListener("click", () => selectSubject(String(props.zid)));
        listContainer.appendChild(item);
    });

    if (state.lastNavSource === "keyboard") {
        state.focusedTileIndex = 0;
        updateKeyboardTileFocus(0);
    } else {
        state.focusedTileIndex = -1;
        updateKeyboardTileFocus(-1);
    }
}

export function updateKeyboardTileFocus(newIndex) {
    const tiles = document.querySelectorAll("#sidebar-zone-list .tile-zone-item");
    if (!tiles || tiles.length === 0) return;
    if (newIndex < -1) newIndex = -1;
    if (newIndex >= tiles.length) newIndex = tiles.length - 1;
    state.focusedTileIndex = newIndex;
    tiles.forEach((tile, idx) => {
        const cid = tile.getAttribute("data-id");
        const isSelected = state.currentId !== CIRCLE_ID && (cid === state.currentId || (typeof normalizeZoneId === "function" && normalizeZoneId(cid) === normalizeZoneId(state.currentId)));

        if (newIndex >= 0 && idx === newIndex) {
            tile.classList.add("is-hovered");
            if (!isSelected && state.map && state.map.getSource('zones')) {
                try {
                    state.map.setFeatureState({ source: 'zones', id: cid }, { hover: true });
                } catch (e) {}
            }
        } else {
            tile.classList.remove("is-hovered");
            if (!isSelected && state.map && state.map.getSource('zones')) {
                try {
                    state.map.setFeatureState({ source: 'zones', id: cid }, { hover: false });
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

export function setupSidebarScrollListener() {
    const scrollBox = document.getElementById("sidebar-zone-list");
    const header = document.getElementById("sidebar-header");
    const sidebar = document.querySelector(".maps-tile-sidebar");

    if (!scrollBox || !header || !sidebar) return;

    // On mobile the sidebar itself is the scroll container (unified layout).
    // On desktop the scrollBox (zone list) is the scroll container.
    const isMobile = () => window.innerWidth <= 768;
    const getScrollTarget = () => isMobile() ? sidebar : scrollBox;

    const bottomNav = document.querySelector(".mobile-bottom-nav");

    const onScroll = (e) => {
        const target = e.currentTarget;
        const scrollTop = target.scrollTop;
        const scrolled = scrollTop > 4;

        header.classList.toggle("is-scrolled", scrolled);
        sidebar.classList.toggle("is-scrolled", scrolled);
        // body class lets the resize bar ::after gradient fire (sibling of sidebar)
        document.body.classList.toggle("sidebar-is-scrolled", scrolled);

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

