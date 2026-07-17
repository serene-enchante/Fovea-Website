const GEOJSON_PATH = "../geojson/Eugene-01-wgs84.geojson";
const CIRCLE_ID = "ecbc-circle";
const FALLBACK_HERO_IMAGE = "../images/wetlands.jpg";
const VIEW_OPTIONS = ["map", "grid", "list"];
const SORT_OPTIONS = ["title", "modified", "founded", "area"];
const MAP_STYLE_CIRCLE_BLACK = {
    color: "#141414",
    weight: 1.6,
    fillColor: "#000000",
    fillOpacity: 0.4
};
const MAP_STYLE_SELECTED_GREEN = {
    color: "#7bff9f",
    weight: 2.6,
    fillColor: "#1f7c3f",
    fillOpacity: 0.45
};
const MAP_STYLE_SELECTED_YELLOW = {
    color: "#7bff9f",
    weight: 2.8,
    fillColor: "#1f7c3f",
    fillOpacity: 0.55
};
const MAP_STYLE_HOVER_YELLOW = {
    color: "#98ff8f",
    weight: 3,
    fillColor: "#3dbb56",
    fillOpacity: 0.36
};

const state = {
    allFeatures: [],
    subject: null,
    query: {
        id: CIRCLE_ID,
        view: "map",
        sort: "title"
    },
    heroMap: null,
    heroLayer: null,
    section2Map: null,
    section2Layer: null
};

function getQueryState() {
    const params = new URLSearchParams(window.location.search);
    const zone = params.get("zone");
    const id = zone ? zone.trim() : (params.get("id") || CIRCLE_ID).trim();
    const view = (params.get("view") || "map").trim().toLowerCase();
    const sort = (params.get("sort") || "title").trim().toLowerCase();

    return {
        id,
        view: VIEW_OPTIONS.includes(view) ? view : "map",
        sort: SORT_OPTIONS.includes(sort) ? sort : "title"
    };
}

function normalizeZoneId(value) {
    if (!value) {
        return "";
    }

    const upper = String(value).toUpperCase();
    const match = upper.match(/^0*(\d+)([A-Z]?)$/);

    if (!match) {
        return upper;
    }

    return `${Number(match[1])}${match[2]}`;
}

function sameZoneId(a, b) {
    return normalizeZoneId(a) === normalizeZoneId(b);
}

function displayZoneId(zid) {
    return String(zid || "").toUpperCase();
}

function setText(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    }
}

function setInterfaceNote(text) {
    setText("interface-note", text || "");
}

function formatDate(value) {
    if (!value) {
        return "Unknown";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function formatArea(value) {
    const asNumber = Number(value);
    if (Number.isNaN(asNumber)) {
        return "Unknown";
    }

    return asNumber.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function zoneImagePath(zoneId) {
    return `../images/zone-images/z${displayZoneId(zoneId)}-01.jpg`;
}

function attachImageFallback(imageElement) {
    if (!imageElement) {
        return;
    }

    imageElement.addEventListener("error", () => {
        if (imageElement.dataset.fallbackApplied === "true") {
            return;
        }

        imageElement.dataset.fallbackApplied = "true";
        imageElement.src = FALLBACK_HERO_IMAGE;
    });
}

function applyImageFallbacks(rootElement) {
    rootElement.querySelectorAll("img[data-fallback='zone-image']").forEach((img) => {
        attachImageFallback(img);
    });
}

function canLoadImage(path) {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = path;
    });
}

function setHeroBackground(imagePath) {
    let styleTag = document.getElementById("hero-bg-style");
    if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = "hero-bg-style";
        document.head.appendChild(styleTag);
    }

    styleTag.textContent = `.page-maps { --hero-bg-image: url("${imagePath}"); }`;
}

function initializeCardEffect(card) {
    card.onmousemove = (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
        card.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
    };

    card.onmouseleave = () => {
        card.style.setProperty("--mouse-x", "-1000px");
        card.style.setProperty("--mouse-y", "-1000px");
    };
}

function initializeSpotlightEffect(element) {
    element.onmousemove = (event) => {
        const rect = element.getBoundingClientRect();
        element.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
        element.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
    };

    element.onmouseleave = () => {
        element.style.setProperty("--mouse-x", "-1000px");
        element.style.setProperty("--mouse-y", "-1000px");
    };
}

function initializeSpotlightElements(root = document) {
    root.querySelectorAll(".spotlight-interactive").forEach((element) => {
        initializeSpotlightEffect(element);
    });
}

function sortFeatures(features, key) {
    const clone = [...features];

    clone.sort((a, b) => {
        const pa = a.properties || {};
        const pb = b.properties || {};

        if (key === "area") {
            return Number(pb.area_sqmi || 0) - Number(pa.area_sqmi || 0);
        }

        if (key === "modified" || key === "founded") {
            const da = new Date(pa[key] || 0).getTime();
            const db = new Date(pb[key] || 0).getTime();
            return db - da;
        }

        return displayZoneId(pa.zid).localeCompare(displayZoneId(pb.zid), undefined, {
            numeric: true,
            sensitivity: "base"
        });
    });

    return clone;
}

function findSubjectFeature(features, subjectId) {
    if (subjectId.toLowerCase() === CIRCLE_ID) {
        return null;
    }

    return features.find((feature) => sameZoneId(feature?.properties?.zid, subjectId)) || null;
}

function getSubjectSummary(features, subjectFeature) {
    if (subjectFeature) {
        const props = subjectFeature.properties;
        return {
            type: "zone",
            title: `Zone ${displayZoneId(props.zid)}`,
            kicker: "Zone Profile",
            zid: displayZoneId(props.zid),
            founded: props.founded,
            modified: props.modified,
            areaSqMi: props.area_sqmi,
            featureCollection: {
                type: "FeatureCollection",
                features: [subjectFeature]
            }
        };
    }

    const allFounded = features.map((feature) => feature.properties?.founded).filter(Boolean).sort();
    const allModified = features.map((feature) => feature.properties?.modified).filter(Boolean).sort();
    const totalArea = features.reduce((sum, feature) => {
        const area = Number(feature.properties?.area_sqmi);
        return Number.isNaN(area) ? sum : sum + area;
    }, 0);

    return {
        type: "circle",
        title: "ECBC Circle",
        kicker: "Full Circle",
        zid: CIRCLE_ID,
        founded: allFounded[0],
        modified: allModified[allModified.length - 1],
        areaSqMi: totalArea,
        featureCollection: {
            type: "FeatureCollection",
            features
        }
    };
}

function updateHeroContent(subject) {
    setText("subject-title", subject.title);
    setText("subject-modified", formatDate(subject.modified));
    setText("subject-founded", formatDate(subject.founded));
    setText("subject-area", formatArea(subject.areaSqMi));
    document.title = `${subject.title} | ECBC Maps`;
}

function updateUrl(replace = true) {
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    url.searchParams.set("feature", "eugene");
    if (state.query.id && state.query.id !== CIRCLE_ID) {
        url.searchParams.set("zone", displayZoneId(state.query.id));
    } else {
        url.searchParams.delete("zone");
    }
    url.searchParams.set("view", state.query.view);
    url.searchParams.set("sort", state.query.sort);

    if (replace) {
        window.history.replaceState({}, "", url);
    } else {
        window.history.pushState({}, "", url);
    }
}

function buildZoneHref(zoneId) {
    const url = new URL(window.location.href);
    url.searchParams.delete("id");
    url.searchParams.set("feature", "eugene");
    url.searchParams.set("zone", displayZoneId(zoneId));
    url.searchParams.set("view", "map");
    url.searchParams.set("sort", state.query.sort);
    return `${url.pathname}${url.search}`;
}

function createZoneCard(feature) {
    const props = feature.properties || {};
    const zid = displayZoneId(props.zid);
    const anchor = document.createElement("a");
    anchor.className = "card zone-card";
    anchor.href = buildZoneHref(zid);

    const description = `<span class="card-meta-prefix">Modified:</span> ${formatDate(props.modified)}<br><span class="card-meta-prefix">Founded:</span> ${formatDate(props.founded)}<br><span class="card-meta-prefix">Sq Miles:</span> ${formatArea(props.area_sqmi)}`;
    anchor.innerHTML = `
        <div class="aspect-ratio-spacer"></div>
        <div class="card-background">
            <img src="${zoneImagePath(zid)}" alt="Zone ${zid}" loading="lazy" data-fallback="zone-image">
        </div>
        <span class="card-content">
            <h3 class="card-heading">Zone ${zid}</h3>
            <p class="card-description">${description}</p>
        </span>
    `;

    initializeCardEffect(anchor);
    return anchor;
}

function createZoneListItem(feature) {
    const props = feature.properties || {};
    const zid = displayZoneId(props.zid);
    const item = document.createElement("a");
    item.className = "zone-list-item spotlight-interactive";
    item.href = buildZoneHref(zid);

    item.innerHTML = `
        <div class="zone-list-item__thumb">
            <img src="${zoneImagePath(zid)}" alt="Zone ${zid}" loading="lazy" data-fallback="zone-image">
        </div>
        <div class="zone-list-item__title">Zone ${zid}</div>
        <div class="zone-list-item__meta"><span class="zone-list-item__meta-prefix">Modified:</span> ${formatDate(props.modified)}</div>
        <div class="zone-list-item__meta"><span class="zone-list-item__meta-prefix">Founded:</span> ${formatDate(props.founded)}</div>
        <div class="zone-list-item__meta"><span class="zone-list-item__meta-prefix">Sq Miles:</span> ${formatArea(props.area_sqmi)}</div>
    `;

    return item;
}

function renderGridView() {
    const grid = document.getElementById("zone-grid");
    if (!grid) {
        return;
    }

    grid.innerHTML = "";
    const sorted = sortFeatures(state.allFeatures, state.query.sort);
    sorted.forEach((feature) => grid.appendChild(createZoneCard(feature)));
    applyImageFallbacks(grid);
}

function renderListView() {
    const list = document.getElementById("zone-list");
    if (!list) {
        return;
    }

    list.innerHTML = "";
    const sorted = sortFeatures(state.allFeatures, state.query.sort);
    sorted.forEach((feature) => list.appendChild(createZoneListItem(feature)));
    applyImageFallbacks(list);
    initializeSpotlightElements(list);
}

function setupModal() {
    const openButtons = document.querySelectorAll("[data-modal-open]");
    const closeButtons = document.querySelectorAll("[data-modal-close]");

    openButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const modalId = button.getAttribute("data-modal-open");
            const modal = modalId ? document.getElementById(modalId) : null;
            if (modal) {
                modal.setAttribute("aria-hidden", "false");
            }
        });
    });

    closeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const modalId = button.getAttribute("data-modal-close");
            const modal = modalId ? document.getElementById(modalId) : null;
            if (modal) {
                modal.setAttribute("aria-hidden", "true");
            }
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") {
            return;
        }

        document.querySelectorAll(".modal[aria-hidden='false']").forEach((modal) => {
            modal.setAttribute("aria-hidden", "true");
        });
    });
}

function updateDownloadLinks(subject) {
    const geojsonLink = document.getElementById("download-geojson");
    if (!geojsonLink) {
        return;
    }

    const blob = new Blob([JSON.stringify(subject.featureCollection, null, 2)], {
        type: "application/geo+json"
    });

    const objectUrl = URL.createObjectURL(blob);
    geojsonLink.href = objectUrl;
    geojsonLink.download = `${subject.zid}.geojson`;
}

function initializeHeroMap(featureCollection) {
    if (!window.L) {
        return;
    }

    if (!state.heroMap) {
        state.heroMap = L.map("hero-map", {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            boxZoom: false,
            keyboard: false,
            touchZoom: false,
            tap: false
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            minZoom: 8,
            maxZoom: 18
        }).addTo(state.heroMap);
    }

    if (state.heroLayer) {
        state.heroMap.removeLayer(state.heroLayer);
    }

    const heroStyle = state.subject?.type === "zone" ? MAP_STYLE_SELECTED_GREEN : MAP_STYLE_CIRCLE_BLACK;
    state.heroLayer = L.geoJSON(featureCollection, {
        style: heroStyle
    }).addTo(state.heroMap);

    const bounds = state.heroLayer.getBounds();
    if (bounds.isValid()) {
        state.heroMap.fitBounds(bounds, { padding: [12, 12], maxZoom: 13 });
    }
}

function initializeSection2Map() {
    if (!window.L) {
        return;
    }

    if (!state.section2Map) {
        state.section2Map = L.map("section2-map", {
            zoomControl: true,
            attributionControl: true
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            minZoom: 8,
            maxZoom: 18
        }).addTo(state.section2Map);
    }

    if (state.section2Layer) {
        state.section2Map.removeLayer(state.section2Layer);
    }

    const isCircleSubject = state.subject?.type === "circle";
    const selectedZoneId = isCircleSubject ? null : state.subject?.zid;
    const featureCollection = {
        type: "FeatureCollection",
        features: state.allFeatures
    };

    state.section2Layer = L.geoJSON(featureCollection, {
        style: (feature) => {
            const zid = feature?.properties?.zid;
            if (selectedZoneId && sameZoneId(zid, selectedZoneId)) {
                return MAP_STYLE_SELECTED_YELLOW;
            }

            return MAP_STYLE_CIRCLE_BLACK;
        },
        onEachFeature: (feature, layer) => {
            const zid = displayZoneId(feature?.properties?.zid);
            layer.bindTooltip(`Zone ${zid}`);
            layer.on("mouseover", () => {
                layer.setStyle(MAP_STYLE_HOVER_YELLOW);
            });
            layer.on("mouseout", () => {
                if (state.section2Layer) {
                    state.section2Layer.resetStyle(layer);
                }
            });
            layer.on("click", () => {
                state.query.id = normalizeZoneId(zid);
                state.query.view = "map";
                updateUrl(false);
                renderSubjectFromState();
            });
        }
    }).addTo(state.section2Map);

    const bounds = state.section2Layer.getBounds();
    if (bounds.isValid()) {
        state.section2Map.fitBounds(bounds, { padding: [18, 18], maxZoom: 13 });
    }
}

function applyActivePane(view) {
    document.querySelectorAll(".interface-pane").forEach((pane) => {
        pane.classList.toggle("is-active", pane.getAttribute("data-pane") === view);
    });

    document.querySelectorAll(".view-switcher__btn").forEach((button) => {
        const isActive = button.getAttribute("data-view") === view;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
    });
}

function updateInterfaceControls() {
    const isCircle = state.subject?.type === "circle";

    document.querySelectorAll(".view-switcher__btn").forEach((button) => {
        const view = button.getAttribute("data-view");
        const disabled = !isCircle && view !== "map";
        button.disabled = disabled;
        button.setAttribute("aria-disabled", String(disabled));
    });

    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
        sortSelect.disabled = !isCircle;
        sortSelect.value = state.query.sort;
    }

    const backToCircleButton = document.getElementById("back-to-circle");
    if (backToCircleButton) {
        backToCircleButton.disabled = isCircle;
        backToCircleButton.setAttribute("aria-disabled", String(isCircle));
    }
}

function coerceViewForSubject() {
    const isCircle = state.subject?.type === "circle";
    if (!isCircle && state.query.view !== "map") {
        state.query.view = "map";
        setInterfaceNote("Grid and List are available only for the full ECBC Circle context.");
    } else {
        setInterfaceNote("");
    }
}

function renderSection2() {
    coerceViewForSubject();
    updateInterfaceControls();
    applyActivePane(state.query.view);

    initializeSection2Map();

    if (state.query.view === "grid" && state.subject.type === "circle") {
        renderGridView();
    }

    if (state.query.view === "list" && state.subject.type === "circle") {
        renderListView();
    }

    updateUrl(true);
}

function bindControls() {
    document.querySelectorAll(".view-switcher__btn").forEach((button) => {
        button.addEventListener("click", () => {
            const targetView = button.getAttribute("data-view");
            if (!targetView || button.disabled) {
                return;
            }

            state.query.view = targetView;
            renderSection2();
        });
    });

    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
        sortSelect.addEventListener("change", (event) => {
            const nextSort = String(event.target.value || "title");
            state.query.sort = SORT_OPTIONS.includes(nextSort) ? nextSort : "title";
            renderSection2();
        });
    }

    const backToCircleButton = document.getElementById("back-to-circle");
    if (backToCircleButton) {
        backToCircleButton.addEventListener("click", () => {
            state.query.id = CIRCLE_ID;
            state.query.view = "map";
            updateUrl(false);
            renderSubjectFromState();
        });
    }
}

async function resolveHeroImage(subject) {
    if (subject.type === "zone") {
        const zonePath = zoneImagePath(subject.zid);
        if (await canLoadImage(zonePath)) {
            return zonePath;
        }
    }

    return FALLBACK_HERO_IMAGE;
}

async function renderSubjectFromState() {
    const requestedFeature = findSubjectFeature(state.allFeatures, state.query.id);
    state.subject = getSubjectSummary(state.allFeatures, requestedFeature);

    const heroImage = await resolveHeroImage(state.subject);
    setHeroBackground(heroImage);
    updateHeroContent(state.subject);
    updateDownloadLinks(state.subject);
    initializeHeroMap(state.subject.featureCollection);
    renderSection2();
}

async function initializePage() {
    const response = await fetch(GEOJSON_PATH);
    if (!response.ok) {
        throw new Error(`Failed to fetch geojson (${response.status})`);
    }

    const data = await response.json();
    state.allFeatures = Array.isArray(data.features) ? data.features : [];
    state.query = getQueryState();
    initializeSpotlightElements();
    setupModal();
    bindControls();
    await renderSubjectFromState();
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        await initializePage();
    } catch (error) {
        setText("subject-title", "Could not load map subject");
        setText("subject-modified", "Unavailable");
        setText("subject-founded", "Unavailable");
        setText("subject-area", "Unavailable");
        setInterfaceNote("Failed to load GeoJSON data for this page.");
    }
});
