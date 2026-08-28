/**
 * tools.js
 * Renders a JSON list of tools displayed as an interactive tile list.
 * If the tools list is empty, displays the binoculars "no items found" message.
 */

// Binoculars SVG Path
const BINOCULARS_SVG = `
    <svg class="tools-empty-state__icon" width="36" height="36" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
        <path d="M128 32h32c17.7 0 32 14.3 32 32V96H96V64c0-17.7 14.3-32 32-32zm64 96V448c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V388.9c0-34.6 9.4-68.6 27.2-98.3C40.9 267.8 49.7 242.4 53 216L60.5 156c2-16 15.6-28 31.8-28H192zm227.8 0c16.1 0 29.8 12 31.8 28L459 216c3.3 26.4 12.1 51.8 25.8 74.6c17.8 29.7 27.2 63.7 27.2 98.3V448c0 17.7-14.3 32-32 32H352c-17.7 0-32-14.3-32-32V128h99.8zM320 64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32V96H320V64zm-32 64V288H224V128h64z"/>
    </svg>
`;

/**
 * Default Tools state (empty for now)
 * Accepts any JSON array of tool objects:
 * [
 *   {
 *     id: "circle-builder",
 *     title: "CBC Circle Boundary Builder",
 *     description: "Design and export standard 15-mile Christmas Bird Count circle boundaries.",
 *     category: "Spatial",
 *     icon: "polygon",
 *     image: "images/tools/circle-builder.jpg",
 *     url: "#",
 *     badge: "Beta"
 *   }
 * ]
 */
export const DEFAULT_TOOLS = [];

/**
 * Renders a list of tool objects into a target container element
 * @param {Array<Object>} tools - Array of tool objects from JSON
 * @param {HTMLElement|string} container - Container element or selector
 */
export function renderToolsList(tools = [], container = "#tools-tile-list") {
    const listEl = typeof container === "string" ? document.querySelector(container) : container;
    if (!listEl) return;

    listEl.innerHTML = "";

    // Empty state: render binoculars "no items found"
    if (!Array.isArray(tools) || tools.length === 0) {
        const emptyStateEl = document.createElement("div");
        emptyStateEl.className = "tools-empty-state";
        emptyStateEl.innerHTML = `
            ${BINOCULARS_SVG}
            <div class="tools-empty-state__text">no items found</div>
        `;
        listEl.appendChild(emptyStateEl);
        return;
    }

    // Render Tile Items
    tools.forEach((tool, index) => {
        const itemEl = document.createElement(tool.url ? "a" : "div");
        itemEl.className = "tool-tile-item";
        if (tool.url) {
            itemEl.href = tool.url;
            if (tool.external) {
                itemEl.target = "_blank";
                itemEl.rel = "noopener noreferrer";
            }
        }
        itemEl.setAttribute("tabindex", "0");
        itemEl.setAttribute("role", "article");
        itemEl.dataset.id = tool.id || `tool-${index}`;

        const thumbHTML = tool.image 
            ? `<img src="${tool.image}" alt="${escapeHtml(tool.title || tool.name)}" loading="lazy" class="tool-tile-item__img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
               <div class="tool-tile-item__thumb-placeholder" style="display:none;">${getToolIcon(tool.icon)}</div>`
            : `<div class="tool-tile-item__thumb-placeholder">${getToolIcon(tool.icon)}</div>`;

        const badgeHTML = tool.badge
            ? `<span class="tool-tile-item__badge">${escapeHtml(tool.badge)}</span>`
            : "";

        const categoryHTML = tool.category
            ? `<span class="tool-tile-item__category">${escapeHtml(tool.category)}</span>`
            : "";

        itemEl.innerHTML = `
            <div class="tool-tile-item__thumb">
                ${thumbHTML}
            </div>
            <div class="tool-tile-item__info">
                <div class="tool-tile-item__header-row">
                    <h3 class="tool-tile-item__title">${escapeHtml(tool.title || tool.name || "Untitled Tool")}</h3>
                    ${badgeHTML}
                </div>
                ${categoryHTML}
                <p class="tool-tile-item__desc">${escapeHtml(tool.description || "")}</p>
            </div>
            <div class="tool-tile-item__action" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </div>
        `;

        listEl.appendChild(itemEl);
    });
}

function getToolIcon(iconType) {
    switch (iconType) {
        case "map":
        case "polygon":
            return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>`;
        case "analytics":
        case "chart":
            return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`;
        case "download":
        case "export":
            return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        default:
            return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>`;
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Initializes tools page
 */
export function initToolsPage() {
    // Check if tools JSON provided on window or script tag
    const toolsData = window.FOVEA_TOOLS || DEFAULT_TOOLS;
    renderToolsList(toolsData);

    // Corner navigation fill-screen transition
    const cornerNavBtn = document.querySelector(".corner-nav-btn");
    if (cornerNavBtn) {
        cornerNavBtn.addEventListener("click", (e) => {
            e.preventDefault();
            if (document.body.className.includes("is-transitioning-")) return;

            const transitionClass = cornerNavBtn.classList.contains("corner-nav-right")
                ? "is-transitioning-right"
                : "is-transitioning-left";

            document.body.classList.add(transitionClass);

            setTimeout(() => {
                window.location.href = cornerNavBtn.getAttribute("href") || "../";
            }, 800);
        });
    }

    window.addEventListener("pageshow", () => {
        document.body.classList.remove("is-transitioning-left", "is-transitioning-right");
    });
}

// Auto-initialize when DOM ready
if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initToolsPage);
    } else {
        initToolsPage();
    }
}
