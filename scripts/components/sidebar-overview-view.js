import { CIRCLE_ID } from '../config/app-config.js';
import { FLORENCE_ZONE_BIRDS } from '../config/florence-zone-guide.js';
import { getEbirdUrl } from '../services/ebird-links.js';
import { displayZoneId, normalizeZoneId, zoneImagePath } from '../utils/format-utils.js';

export function renderSidebarOverview(listContainer, { state, isCirclesFeature, isCircle, targetFeature, onActivateTab = () => {}, onSelectBird = () => {}, onSelectCircle = () => {}, onSelectZone = () => {}, onFeatureHover = () => {}, onOpenImageLightbox = () => {}, documentObject = globalThis.document }) {
    const activateTab = onActivateTab;
    const overviewEl = documentObject.createElement("div");
    overviewEl.className = "sidebar-about-wrapper";

    let previewHeaderTitle = "";
    let previewActionText = "";
    let previewTilesHtml = "";
    let descText = "";
    let imgSrc = "";
    let imgAlt = "";

    let birdsPreviewHtml = "";
    let zoneBirdsData = null;

    if (state.currentFeature === "florence") {
        if (!isCirclesFeature && !isCircle && targetFeature) {
            const zid = displayZoneId(targetFeature.properties?.zid);
            zoneBirdsData = FLORENCE_ZONE_BIRDS[zid] || FLORENCE_ZONE_BIRDS[String(parseInt(zid, 10))];
        }
    }

    if (zoneBirdsData && zoneBirdsData.birds && zoneBirdsData.birds.length > 0) {
        const previewBirds = zoneBirdsData.birds.slice(0, 5);
        previewBirds.forEach(bird => {
            const ebirdUrl = getEbirdUrl(bird.name);
            birdsPreviewHtml += `
                <div class="overview-preview-item overview-preview-item--bird" data-bird-name="${bird.name}" title="Select ${bird.name} to view observations on map">
                    <span class="overview-preview-item__name">${bird.name}</span>
                    <a href="${ebirdUrl}" target="_blank" rel="noopener noreferrer" class="overview-preview-item__ext-link" title="Open on eBird" onclick="event.stopPropagation();">
                        <svg class="overview-preview-item__ext" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </div>
            `;
        });
    }

    if (isCirclesFeature) {
        // --- 1. ALL CIRCLES OVERVIEW ---
        const NO_DATA_CIRCLES = new Set(["Oakridge", "Cottage Grove"]);
        const sortedCircles = [...state.circlesFeatures].sort((a, b) => {
            const cidA = String(a.properties?.cid || "");
            const cidB = String(b.properties?.cid || "");
            const noDataA = NO_DATA_CIRCLES.has(cidA) ? 1 : 0;
            const noDataB = NO_DATA_CIRCLES.has(cidB) ? 1 : 0;
            if (noDataA !== noDataB) return noDataA - noDataB;
            return cidA.localeCompare(cidB, undefined, { sensitivity: "base" });
        });

        previewHeaderTitle = "Count Circles";
        previewActionText = `View all (${sortedCircles.length}) &rarr;`;

        sortedCircles.forEach(feature => {
            const props = feature.properties || {};
            const cid = props.cid || "Circle";

            previewTilesHtml += `
                <div class="overview-preview-item" data-cid="${cid}">
                    <span class="overview-preview-item__name">${cid}</span>
                </div>
            `;
        });

        imgSrc = "../images/ccba.jpg";
        imgAlt = "Audubon Christmas Bird Count Circles";
        descText = "Coordinated by the Coast to Cascades Bird Alliance, our regional counts span from coastal estuaries in Florence to Willamette Valley wetlands in Eugene, tracking winter bird populations through community science.";

    } else if (isCircle || !targetFeature) {
        // --- 2. SINGLE COUNT CIRCLE OVERVIEW (Eugene / Florence CBC) ---
        const sortedFeatures = [...state.allFeatures].sort((a, b) => {
            const zidA = String(a.properties?.zid || "");
            const zidB = String(b.properties?.zid || "");
            return zidA.localeCompare(zidB, undefined, { numeric: true, sensitivity: "base" });
        });

        const circleTitle = state.currentFeature === "florence" ? "Florence Christmas Bird Count" : "Eugene Christmas Bird Count";
        previewHeaderTitle = "Circle Zones";
        previewActionText = `View all (${sortedFeatures.length}) &rarr;`;

        sortedFeatures.forEach(feature => {
            const props = feature.properties || {};
            const zid = displayZoneId(props.zid);

            previewTilesHtml += `
                <div class="overview-preview-item" data-zid="${String(props.zid)}">
                    <span class="overview-preview-item__name">Zone ${zid}</span>
                </div>
            `;
        });

        imgAlt = `${circleTitle} Overview`;
        if (state.currentFeature === "florence") {
            imgSrc = "../images/fcbc.jpg";
            descText = "Sponsored by the Coast to Cascades Bird Alliance since 1980, the Florence count explores the Siuslaw estuary, ocean beaches, and coastal dunes, documenting thousands of wintering shorebirds, seabirds, and waterfowl each December.";
        } else {
            imgSrc = "../images/ecbc.jpg";
            descText = "Founded in 1942, the Eugene Christmas Bird Count spans 27 zones across the southern Willamette Valley—from Fern Ridge to Spencer Butte—where field and backyard counters tally over 130 winter species annually.";
        }

    } else {
        // --- 3. SPECIFIC ZONE OVERVIEW (Zone 04, etc.) ---
        const props = targetFeature.properties || {};
        const zid = displayZoneId(props.zid);
        imgSrc = zoneImagePath(props.zid);
        imgAlt = `Zone ${zid} Image`;
    }

    overviewEl.innerHTML = `
        <div class="sidebar-about-content">
            ${descText ? `<p class="sidebar-about-text">${descText}</p>` : ""}

            <!-- Image Right Below Description -->
            ${imgSrc ? `
                <div class="sidebar-about-media">
                    <img src="${imgSrc}" alt="${imgAlt}" loading="eager" decoding="async" />
                </div>
            ` : ""}

            <!-- Organizers Section Below Image -->
            <div class="sidebar-overview-people">
                <div class="sidebar-overview-people__header">
                    <span class="sidebar-overview-people__title">Organizers</span>
                </div>
                <table class="sidebar-overview-people__table">
                    <thead>
                        <tr>
                            <th class="sidebar-overview-people__th-role">Roles</th>
                            <th class="sidebar-overview-people__th-name">Name</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="sidebar-overview-people__td-role">Job Title</td>
                            <td class="sidebar-overview-people__td-name">
                                <div class="sidebar-overview-people__person">
                                    <span class="sidebar-overview-people__person-name">Name</span>
                                    <div class="sidebar-overview-people__actions">
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
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Birds Section in Zone Overview -->
            ${zoneBirdsData && zoneBirdsData.birds && zoneBirdsData.birds.length > 0 ? `
                <div class="sidebar-overview-preview sidebar-overview-preview--birds">
                    <div class="sidebar-overview-preview__header sidebar-overview-preview__header--birds">
                        <span class="sidebar-overview-preview__title">Birds</span>
                    </div>
                    <div class="sidebar-overview-preview__list">
                        ${birdsPreviewHtml}
                    </div>
                    <button type="button" class="sidebar-overview-preview__footer sidebar-overview-preview__footer--birds" title="Go to Birds tab">
                        <span class="sidebar-overview-preview__action">View all (${zoneBirdsData.birds.length}) &rarr;</span>
                    </button>
                </div>
            ` : ""}

            <!-- Feature Tiles Preview Section (Circle level only) -->
            ${previewTilesHtml ? `
                <div class="sidebar-overview-preview">
                    <div class="sidebar-overview-preview__header">
                        <span class="sidebar-overview-preview__title">${previewHeaderTitle}</span>
                    </div>
                    <div class="sidebar-overview-preview__list">
                        ${previewTilesHtml}
                    </div>
                    <button type="button" class="sidebar-overview-preview__footer" title="Go to ${previewHeaderTitle} tab">
                        <span class="sidebar-overview-preview__action">${previewActionText}</span>
                    </button>
                </div>
            ` : ""}

            <!-- Resources Section -->
            <div class="sidebar-overview-resources">
                <div class="sidebar-overview-resources__header">
                    <span class="sidebar-overview-resources__title">Resources</span>
                </div>
                <div class="sidebar-overview-resources__empty">No resources available</div>
            </div>
        </div>
    `;

        const birdPreviewTiles = overviewEl.querySelectorAll(".overview-preview-item--bird");
    birdPreviewTiles.forEach(tile => {
        const bName = tile.getAttribute("data-bird-name");
        tile.addEventListener("click", () => {
            if (bName) onSelectBird(bName);
        });
    });

    // Click handlers for Birds preview footer & header
    const birdsFooterBtn = overviewEl.querySelector(".sidebar-overview-preview__footer--birds");
    if (birdsFooterBtn) {
        birdsFooterBtn.addEventListener("click", () => activateTab("birds"));
    }

    const birdsHeader = overviewEl.querySelector(".sidebar-overview-preview__header--birds");
    if (birdsHeader) {
        birdsHeader.style.cursor = "pointer";
        birdsHeader.addEventListener("click", () => activateTab("birds"));
    }

    // Click handler for preview footer button (switches to list tab)
    const footerBtn = overviewEl.querySelector(".sidebar-overview-preview:not(.sidebar-overview-preview--birds) .sidebar-overview-preview__footer");
    if (footerBtn) {
        footerBtn.addEventListener("click", () => activateTab("items"));
    }

    const orgHeader = overviewEl.querySelector(".sidebar-overview-people__header");
    if (orgHeader) {
        orgHeader.style.cursor = "pointer";
        orgHeader.addEventListener("click", () => activateTab("organizers"));
    }

    const resHeader = overviewEl.querySelector(".sidebar-overview-resources__header");
    if (resHeader) {
        resHeader.style.cursor = "pointer";
        resHeader.addEventListener("click", () => activateTab("resources"));
    }

    // Click & hover handlers for preview tiles
    if (isCirclesFeature) {
        const tiles = overviewEl.querySelectorAll(".overview-preview-item");
        tiles.forEach(tile => {
            const cid = tile.getAttribute("data-cid");
            tile.addEventListener("mouseenter", () => {
                onFeatureHover(cid, true);
            });
            tile.addEventListener("mouseleave", () => {
                onFeatureHover(cid, false);
            });
            tile.addEventListener("click", () => {
                onSelectCircle(cid);
            });
        });
    } else {
        const tiles = overviewEl.querySelectorAll(".overview-preview-item[data-zid]");
        tiles.forEach(tile => {
            const zid = tile.getAttribute("data-zid");
            tile.addEventListener("mouseenter", () => {
                const isSelected = state.currentId !== CIRCLE_ID && (zid === state.currentId || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                if (!isSelected) onFeatureHover(zid, true);
            });
            tile.addEventListener("mouseleave", () => {
                const isSelected = state.currentId !== CIRCLE_ID && (zid === state.currentId || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                if (!isSelected) onFeatureHover(zid, false);
            });
            tile.addEventListener("click", () => {
                onSelectZone(zid);
            });
        });
    }

    // Lightbox for media image
    const img = overviewEl.querySelector(".sidebar-about-media img");
    const mediaDiv = overviewEl.querySelector(".sidebar-about-media");
    if (img) {
        img.addEventListener("error", () => {
            if (imgSrc !== "../images/wetlands.jpg" && !isCircle) {
                img.src = "../images/wetlands.jpg";
            } else {
                if (mediaDiv) mediaDiv.style.display = "none";
            }
        });
    }

    const isZonePhoto = !isCirclesFeature && !isCircle && Boolean(targetFeature);
    const photoCredit = isZonePhoto ? "Photo Contributed by Pete Baki" : "Photo Contributed by NA";

    if (mediaDiv && img) {
        mediaDiv.addEventListener("click", () => {
            onOpenImageLightbox(img.src, imgAlt, descText, photoCredit);
        });
    }

    listContainer.appendChild(overviewEl);
}

