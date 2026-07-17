const GEOJSON_PATH = "/maps/ecbc-circle-2010.geojson";
const CIRCLE_ID = "ecbc-circle";
const FALLBACK_IMAGE = "/images/wetlands.jpg";

const MAP_STYLES = {
    default: {
        color: "#ffffff",
        weight: 1.0,
        fillColor: "#ffffff",
        fillOpacity: 0.07
    },
    hover: {
        color: "#30d158",
        weight: 1.8,
        fillColor: "#30d158",
        fillOpacity: 0.2
    },
    selected: {
        color: "#00ff66",
        weight: 2.2,
        fillColor: "#30d158",
        fillOpacity: 0.35
    }
};

const state = {
    allFeatures: [],
    currentId: CIRCLE_ID,
    map: null,
    geoJsonLayer: null,
    featureLayersMap: new Map(), // maps zoneId -> leaflet layer
    lastZoneClickTime: 0
};

function normalizeZoneId(value) {
    if (!value) return "";
    const upper = String(value).toUpperCase().trim();
    const match = upper.match(/^0*(\d+)([A-Z]?)$/);
    if (!match) return upper;
    return `${Number(match[1])}${match[2]}`;
}

function displayZoneId(zid) {
    return String(zid || "").toUpperCase().trim();
}

function zoneImagePath(zoneId) {
    return `/images/zone-images/z${displayZoneId(zoneId)}-01.jpg`;
}

function formatDate(value) {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatArea(value) {
    const num = Number(value);
    if (Number.isNaN(num)) return "-";
    return num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function showToast(message) {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        toast.className = "toast-notification";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2500);
}

function getInitialIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    return id ? id.trim() : CIRCLE_ID;
}

function updateUrl(id) {
    const url = new URL(window.location.href);
    if (id && id !== CIRCLE_ID) {
        url.searchParams.set("id", id);
    } else {
        url.searchParams.delete("id");
    }
    window.history.replaceState({}, "", url.toString());
}

function updateHeader(subjectTitle) {
    const titleEl = document.getElementById("header-title");
    if (titleEl) {
        titleEl.textContent = subjectTitle;
    }
}

function selectSubject(id, triggerMapZoom = true) {
    state.currentId = id;
    const isCircle = !id || id === CIRCLE_ID;
    
    let targetFeature = null;
    if (!isCircle) {
        targetFeature = state.allFeatures.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === id.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(id));
        });
    }

    // Header updates
    if (isCircle || !targetFeature) {
        updateHeader("Eugene CBC Circle");
    } else {
        const zid = displayZoneId(targetFeature.properties.zid);
        updateHeader(`Zone ${zid}`);
    }

    // Re-render sidebar list (shows zone list when circle active, subset features when zone selected)
    renderSidebarList();

    // Map layer styles and zoom
    state.featureLayersMap.forEach((layer, zid) => {
        const isSelected = targetFeature && (zid === String(targetFeature.properties.zid) || normalizeZoneId(zid) === normalizeZoneId(targetFeature.properties.zid));
        if (isSelected) {
            layer.setStyle(MAP_STYLES.selected);
            layer.bringToFront();
        } else {
            layer.setStyle(MAP_STYLES.default);
        }
    });

    if (triggerMapZoom && state.map) {
        if (isCircle || !targetFeature) {
            if (state.geoJsonLayer) {
                state.map.fitBounds(state.geoJsonLayer.getBounds(), { padding: [30, 30] });
            }
        } else {
            const selectedLayer = state.featureLayersMap.get(String(targetFeature.properties.zid));
            if (selectedLayer) {
                state.map.fitBounds(selectedLayer.getBounds(), { padding: [50, 50], maxZoom: 14 });
            }
        }
    }

    updateUrl(id);
}

function renderSidebarList() {
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
    let targetFeature = null;
    if (!isCircle) {
        targetFeature = state.allFeatures.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
        });
    }

    // When a specific zone is selected, display subset features empty state
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

    // Sorted Zone Items (Circle Overview view)
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
                <img src="${imgPath}" alt="Zone ${zid}" loading="lazy">
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

        item.addEventListener("click", () => selectSubject(String(props.zid)));
        listContainer.appendChild(item);
    });
}

function setupMapEffectsAndFullscreen(mapWrapper) {
    if (!mapWrapper) return;

    // Homepage spotlight mouse-tracking effect
    mapWrapper.onmousemove = e => {
        const rect = mapWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        mapWrapper.style.setProperty("--mouse-x", `${x}px`);
        mapWrapper.style.setProperty("--mouse-y", `${y}px`);
    };

    mapWrapper.onmouseleave = () => {
        mapWrapper.style.setProperty("--mouse-x", `-1000px`);
        mapWrapper.style.setProperty("--mouse-y", `-1000px`);
    };

    const triggerMobileHomeAnimation = () => {
        if (window.innerWidth <= 768) {
            const targets = document.querySelectorAll(".intro-header, .maps-tile-header, .maps-tile-sidebar");
            targets.forEach(el => {
                el.classList.remove("animate-mobile-slide-down");
                void el.offsetWidth; // trigger reflow
                el.classList.add("animate-mobile-slide-down");
            });
        }
    };

    const handleResize = () => {
        if (state.map) {
            state.map.invalidateSize();
            setTimeout(() => state.map.invalidateSize(), 50);
            setTimeout(() => state.map.invalidateSize(), 200);
            setTimeout(() => state.map.invalidateSize(), 400);
        }
    };

    // Double click to toggle full screen
    const toggleFullscreen = () => {
        if (!document.fullscreenElement && !mapWrapper.classList.contains("is-fullscreen")) {
            if (mapWrapper.requestFullscreen) {
                mapWrapper.requestFullscreen().catch(() => {
                    mapWrapper.classList.add("is-fullscreen");
                    handleResize();
                });
            } else {
                mapWrapper.classList.add("is-fullscreen");
                handleResize();
            }
        } else {
            if (document.exitFullscreen && document.fullscreenElement) {
                document.exitFullscreen().catch(() => {
                    mapWrapper.classList.remove("is-fullscreen");
                    triggerMobileHomeAnimation();
                    handleResize();
                });
            } else {
                mapWrapper.classList.remove("is-fullscreen");
                triggerMobileHomeAnimation();
                handleResize();
            }
        }
        handleResize();
    };

    mapWrapper.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        toggleFullscreen();
    });

    document.addEventListener("fullscreenchange", () => {
        if (!document.fullscreenElement) {
            mapWrapper.classList.remove("is-fullscreen");
            triggerMobileHomeAnimation();
        } else {
            mapWrapper.classList.add("is-fullscreen");
        }
        handleResize();
    });

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
}

function initializeMap() {
    const mapContainer = document.getElementById("tile-map");
    const mapWrapper = document.getElementById("map-wrapper");
    if (!mapContainer) return;

    state.map = L.map("tile-map", {
        zoomControl: true,
        attributionControl: false,
        doubleClickZoom: false,
        minZoom: 8
    }).setView([44.05, -123.11], 11);

    // Dark tiles matching Apple Maps Dark Mode
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        minZoom: 8,
        maxZoom: 19
    }).addTo(state.map);

    // Click map background (outside zone shapes) to revert focus to full circle
    state.map.on("click", () => {
        // Ignore click if a zone shape was just clicked
        if (Date.now() - state.lastZoneClickTime < 250) {
            return;
        }
        selectSubject(CIRCLE_ID);
    });

    state.geoJsonLayer = L.geoJSON(state.allFeatures, {
        style: () => MAP_STYLES.default,
        onEachFeature: (feature, layer) => {
            const zid = String(feature.properties?.zid || "");
            state.featureLayersMap.set(zid, layer);

            layer.on({
                mouseover: (e) => {
                    const l = e.target;
                    const isSelected = state.currentId !== CIRCLE_ID && (zid === state.currentId || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                    if (!isSelected) {
                        l.setStyle(MAP_STYLES.hover);
                    }
                },
                mouseout: (e) => {
                    const l = e.target;
                    const isSelected = state.currentId !== CIRCLE_ID && (zid === state.currentId || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                    if (!isSelected) {
                        l.setStyle(MAP_STYLES.default);
                    }
                },
                click: (e) => {
                    state.lastZoneClickTime = Date.now();
                    if (e && e.originalEvent) {
                        L.DomEvent.stopPropagation(e.originalEvent);
                    }
                    selectSubject(zid, false);
                }
            });
        }
    }).addTo(state.map);

    setupMapEffectsAndFullscreen(mapWrapper);
}

function setupActionButtons() {
    const copyBtn = document.getElementById("btn-copy-link");
    if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(window.location.href);
                showToast("Link copied to clipboard!");
            } catch (err) {
                const dummy = document.createElement("input");
                document.body.appendChild(dummy);
                dummy.value = window.location.href;
                dummy.select();
                document.execCommand("copy");
                document.body.removeChild(dummy);
                showToast("Link copied to clipboard!");
            }
        });
    }

    const downloadBtn = document.getElementById("btn-download-files");
    const modal = document.getElementById("downloads-modal");
    if (downloadBtn && modal) {
        const toggleModal = (e) => {
            if (e) e.stopPropagation();
            const isOpen = modal.getAttribute("aria-hidden") === "false";
            modal.setAttribute("aria-hidden", isOpen ? "true" : "false");
            modal.classList.toggle("is-open", !isOpen);
        };

        const closeModal = () => {
            modal.setAttribute("aria-hidden", "true");
            modal.classList.remove("is-open");
        };

        downloadBtn.addEventListener("click", toggleModal);

        modal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                closeModal();
            });
        });

        document.addEventListener("click", (e) => {
            if (window.innerWidth >= 769 && modal.getAttribute("aria-hidden") === "false") {
                if (!modal.contains(e.target) && !downloadBtn.contains(e.target)) {
                    closeModal();
                }
            }
        });
    }

    const editBtn = document.getElementById("btn-edit-item");
    if (editBtn) {
        editBtn.addEventListener("click", () => {
            const target = state.currentId || CIRCLE_ID;
            window.location.href = `/editor/?id=${encodeURIComponent(target)}`;
        });
    }
}

function setupSearch() {
    const header = document.getElementById("sidebar-header");
    const toggleBtn = document.getElementById("btn-search-toggle");
    const closeBtn = document.getElementById("btn-search-close");
    const searchInput = document.getElementById("sidebar-search-input");
    const listContainer = document.getElementById("sidebar-zone-list");

    if (!header || !toggleBtn || !closeBtn || !searchInput || !listContainer) return;

    const openSearch = () => {
        header.classList.add("is-searching");
        searchInput.focus();
    };

    const closeSearch = () => {
        header.classList.remove("is-searching");
        searchInput.value = "";
        filterList("");
    };

    const filterList = (query) => {
        const q = query.trim().toLowerCase();
        const items = listContainer.querySelectorAll(".tile-zone-item");
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            const id = (item.getAttribute("data-id") || "").toLowerCase();
            if (!q || text.includes(q) || id.includes(q)) {
                item.style.display = "";
            } else {
                item.style.display = "none";
            }
        });
    };

    toggleBtn.addEventListener("click", openSearch);
    closeBtn.addEventListener("click", closeSearch);

    searchInput.addEventListener("input", (e) => {
        filterList(e.target.value);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeSearch();
        }
    });
}

async function init() {
    try {
        const res = await fetch(GEOJSON_PATH);
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
        const data = await res.json();
        state.allFeatures = Array.isArray(data.features) ? data.features : [];

        renderSidebarList();
        initializeMap();
        setupActionButtons();
        setupSearch();

        const initialId = getInitialIdFromUrl();
        selectSubject(initialId, true);
    } catch (err) {
        console.error("Error initializing maps tile page:", err);
        updateHeader("Error loading map data");
    }
}

document.addEventListener("DOMContentLoaded", init);
