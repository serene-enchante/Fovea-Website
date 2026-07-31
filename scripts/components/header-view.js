import { state } from '../maps-tile.js';
import { normalizeZoneId } from '../utils/format-utils.js';
import { CIRCLE_ID } from '../config/app-config.js';

// Note: updateHeaderLogo depends on 'state' and 'normalizeZoneId'.
// For now, we will pass them or let them remain global, 
// but since we are using modules, we need to pass state as an argument or export it.
// Actually, it's safer to just export the functions and let the caller bind or pass state.


export function updateHeaderLogo() {
    const logoImg = document.querySelector(".logo--header");
    const logoText = document.getElementById("header-logo-text");
    if (!logoImg) return;

    if (state.isCirclesFeature || state.currentFeature === "circles") {
        logoImg.src = "../images/whiteLane-Audubon-favicon-152.png";
        logoImg.alt = "Audubon Circles";
        if (logoText) {
            logoText.textContent = "";
            logoText.classList.remove("is-visible");
        }
    } else {
        if (state.currentFeature === "florence") {
            logoImg.src = "../images/florence.png";
            logoImg.alt = "Florence Christmas Bird Count";
        } else {
            logoImg.src = "../images/logo-small.png";
            logoImg.alt = "Eugene Christmas Bird Count";
        }

        const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
        let targetFeature = null;
        if (!isCircle) {
            targetFeature = state.allFeatures.find(f => {
                const zid = f.properties?.zid;
                return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
            });
        }

        if (logoText) {
            logoText.textContent = "";
            logoText.classList.remove("is-visible");
        }
    }
}


export function adjustHeaderFontSize() {
    const titleEl = document.getElementById("header-title");
    if (!titleEl) return;

    // Reset to default first
    titleEl.style.fontSize = "1.25rem";

    // Only adjust if visible
    if (titleEl.offsetParent === null && titleEl.offsetHeight === 0) return;

    const minSize = 0.55;
    let currentSize = 1.25;
    const decrement = 0.05;

    // Temporarily bypass the CSS max-height cap so we can measure true text height
    const savedMaxHeight = titleEl.style.maxHeight;
    const savedOverflow = titleEl.style.overflow;
    titleEl.style.maxHeight = "none";
    titleEl.style.overflow = "visible";

    const getTwoLineBudget = () => {
        const lh = parseFloat(window.getComputedStyle(titleEl).lineHeight);
        return lh * 2;
    };

    // Scale down until the natural scrollHeight fits within 2-line budget
    while (titleEl.scrollHeight > getTwoLineBudget() + 1 && currentSize > minSize) {
        currentSize = Math.max(minSize, currentSize - decrement);
        titleEl.style.fontSize = `${currentSize}rem`;
    }

    // Restore capping
    titleEl.style.maxHeight = savedMaxHeight;
    titleEl.style.overflow = savedOverflow;
}


export function balancedHeaderHTML(title) {
    const words = title.trim().split(/\s+/);
    if (words.length <= 3) {
        // Short title: single line, no break needed
        return words.map(w => w.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')).join(' ');
    }
    // Split at ceiling of midpoint so top line gets slightly more words
    const splitAt = Math.ceil(words.length / 2);
    const line1 = words.slice(0, splitAt);
    const line2 = words.slice(splitAt);
    const escape = w => w.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return line1.map(escape).join(' ') + '<br>' + line2.map(escape).join(' ');
}


export function updateHeader(subjectTitle) {
    const titleEl = document.getElementById("header-title");
    if (titleEl) {
        titleEl.innerHTML = balancedHeaderHTML(subjectTitle);
    }
    updateHeaderLogo();
    adjustHeaderFontSize();
}


/**
 * Returns fitBounds padding that keeps selections clear of the toolbar (top),
 * map controls (bottom/sides), and gives generous visual breathing room.
 * On mobile the toolbar is taller and controls sit at the bottom.
 */
export function getFitPadding(extra = 0) {
    const mobile = window.innerWidth <= 768;
    if (mobile) {
        // The visible area of the map is the space above the sidebar card.
        // The bottom portion of the 100vh map canvas is covered by the sidebar.
        // We read the current height of the sidebar to offset fitted elements into the visible space.
        const sidebar = document.querySelector(".maps-tile-sidebar");
        const hiddenHeight = sidebar ? sidebar.offsetHeight : (window.innerHeight * 0.5);
        const baseMargin = 50 + extra;
        return {
            top: 36 + baseMargin,
            bottom: hiddenHeight + baseMargin,
            left: 40 + extra,
            right: 40 + extra
        };
    } else {
        // On desktop, the toolbar is inside the sidebar and doesn't overlap the map area.
        const margin = 60 + extra;
        return {
            top: margin,
            bottom: margin,
            left: margin,
            right: margin
        };
    }
}
