const EUGENE_GEOJSON_PATH = "/geojson/Eugene-01-wgs84.geojson";
const FLORENCE_GEOJSON_PATH = "/geojson/Florence-00-wgs84.geojson";
const CIRCLES_GEOJSON_PATH = "/geojson/circles-wgs84.geojson";
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
    circlesFeatures: [],
    eugeneFeatures: [],
    florenceFeatures: [],
    currentFeature: "eugene", // "circles", "eugene", "florence"
    isCirclesFeature: false,
    currentId: CIRCLE_ID,
    activeTab: "items",
    map: null,
    geoJsonLayer: null,
    featureLayersMap: new Map(), // maps zoneId/cid -> leaflet layer
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
    let zid = displayZoneId(zoneId);
    if (!zid) return FALLBACK_IMAGE;

    if (zid === "6A" || zid === "6B" || zid === "06A" || zid === "06B") return "/images/zone-images/z06-01.jpg";
    if (zid === "8" || zid === "08") return "/images/zone-images/z08A-01.jpg";
    if (zid === "20B") return "/images/zone-images/20B-01.jpg";
    if (zid === "1") zid = "01";

    return `/images/zone-images/z${zid}-01.jpg`;
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
    const feature = (params.get("feature") || "").toLowerCase();
    if (feature === "circles") {
        state.currentFeature = "circles";
        state.isCirclesFeature = true;
    } else if (feature === "florence") {
        state.currentFeature = "florence";
        state.isCirclesFeature = false;
    } else {
        state.currentFeature = "eugene";
        state.isCirclesFeature = false;
    }

    const zone = params.get("zone");
    if (zone) return zone.trim();
    const id = params.get("id");
    return id ? id.trim() : CIRCLE_ID;
}

function updateUrl(id) {
    const url = new URL(window.location.href);
    url.searchParams.delete("id");

    if (state.isCirclesFeature) {
        url.searchParams.set("feature", "circles");
        url.searchParams.delete("zone");
    } else {
        url.searchParams.set("feature", state.currentFeature);
        if (id && id !== CIRCLE_ID) {
            let zid = id;
            const targetFeature = state.allFeatures.find(f => {
                const fzid = f.properties?.zid;
                return fzid && (fzid.toLowerCase() === id.toLowerCase() || normalizeZoneId(fzid) === normalizeZoneId(id));
            });
            if (targetFeature && targetFeature.properties?.zid) {
                zid = displayZoneId(targetFeature.properties.zid);
            }
            url.searchParams.set("zone", zid);
        } else {
            url.searchParams.delete("zone");
        }
    }
    window.history.replaceState({}, "", url.toString());
}

function updateHeaderLogo() {
    const logoImg = document.querySelector(".intro-header .logo");
    const logoText = document.getElementById("header-logo-text");
    if (!logoImg) return;

    if (state.isCirclesFeature || state.currentFeature === "circles") {
        logoImg.src = "/images/ccba-icon.png";
        logoImg.alt = "Audubon Circles";
        if (logoText) {
            logoText.textContent = "CCBA Open Data Library";
            logoText.classList.add("is-visible");
        }
    } else if (state.currentFeature === "florence") {
        logoImg.src = "/images/florence.png";
        logoImg.alt = "Florence CBC";
        if (logoText) {
            logoText.textContent = "";
            logoText.classList.remove("is-visible");
        }
    } else {
        logoImg.src = "/images/logo-small.png";
        logoImg.alt = "Eugene CBC";
        if (logoText) {
            logoText.textContent = "";
            logoText.classList.remove("is-visible");
        }
    }
}

function updateHeader(subjectTitle) {
    const titleEl = document.getElementById("header-title");
    if (titleEl) {
        titleEl.textContent = subjectTitle;
    }
    updateHeaderLogo();
}

function switchToFeature(featureName, circleLayer) {
    if (!state.map) return;

    let transitionFinished = false;

    const performSwap = () => {
        if (transitionFinished) return;
        transitionFinished = true;

        state.currentFeature = featureName;
        state.isCirclesFeature = false;
        state.allFeatures = (featureName === "florence") ? state.florenceFeatures : state.eugeneFeatures;
        state.currentId = CIRCLE_ID;

        rebuildGeoJsonLayer();
        selectSubject(CIRCLE_ID, false);
    };

    if (circleLayer) {
        state.map.once("moveend", performSwap);
        state.map.flyToBounds(circleLayer.getBounds(), {
            duration: 0.9,
            padding: [30, 30]
        });
        setTimeout(performSwap, 1000);
    } else {
        performSwap();
    }
}

function switchToCirclesFeature() {
    state.currentFeature = "circles";
    state.isCirclesFeature = true;
    state.allFeatures = state.circlesFeatures;
    state.currentId = CIRCLE_ID;
    rebuildGeoJsonLayer();
    selectSubject(CIRCLE_ID, true);
}

function selectSubject(id, triggerMapZoom = true) {
    state.currentId = id;
    const backBtn = document.getElementById("btn-capsule-back");

    if (state.isCirclesFeature) {
        updateHeader("Christmas Bird Count Circles");
        if (backBtn) backBtn.classList.remove("is-visible");
        renderSidebarList();
        updateUrl(id);
        if (triggerMapZoom && state.map && state.geoJsonLayer) {
            state.map.fitBounds(state.geoJsonLayer.getBounds(), { padding: [30, 30] });
        }
        return;
    }

    const isCircle = !id || id === CIRCLE_ID;
    let targetFeature = null;
    if (!isCircle) {
        targetFeature = state.allFeatures.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === id.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(id));
        });
    }

    if (isCircle || !targetFeature) {
        const titleName = state.currentFeature === "florence" ? "Florence CBC Circle" : "Eugene CBC Circle";
        updateHeader(titleName);
        if (backBtn) backBtn.classList.remove("is-visible");
    } else {
        const zid = displayZoneId(targetFeature.properties.zid);
        updateHeader(`Zone ${zid}`);
        if (backBtn) backBtn.classList.add("is-visible");
    }

    renderSidebarList();

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
                        <img src="/images/wetlands.jpg" alt="Audubon Circles" loading="lazy" />
                    </div>
                    <p class="sidebar-about-text">Audubon Christmas Bird Count regional count circles. Click a circle to explore its subdivided survey zones.</p>
                </div>
            `;
            listContainer.appendChild(aboutEl);
            return;
        }

        const sortedCircles = [...state.circlesFeatures].sort((a, b) => {
            const cidA = String(a.properties?.cid || "");
            const cidB = String(b.properties?.cid || "");
            return cidA.localeCompare(cidB, undefined, { sensitivity: "base" });
        });

        sortedCircles.forEach(feature => {
            const props = feature.properties || {};
            const cid = props.cid || "Circle";
            const item = document.createElement("div");
            item.className = "tile-zone-item";
            item.setAttribute("data-id", cid);

            let thumbImg = "/images/wetlands.jpg";
            let isLogo = false;
            if (cid === "Eugene") {
                thumbImg = "/images/logo-small.png";
                isLogo = true;
            } else if (cid === "Florence") {
                thumbImg = "/images/florence.png";
                isLogo = true;
            }

            item.innerHTML = `
                <div class="tile-zone-item__thumb ${isLogo ? "tile-zone-item__thumb--logo" : ""}">
                    <img src="${thumbImg}" alt="${cid}" loading="lazy">
                </div>
                <div class="tile-zone-item__info">
                    <div class="tile-zone-item__title">${cid}</div>
                </div>
            `;

            item.addEventListener("click", () => {
                if (cid === "Eugene") {
                    const layer = state.featureLayersMap.get("Eugene");
                    switchToFeature("eugene", layer);
                } else if (cid === "Florence") {
                    const layer = state.featureLayersMap.get("Florence");
                    switchToFeature("florence", layer);
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
            imgSrc = "/images/wetlands.jpg";
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
                void el.offsetWidth;
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
    };

    mapWrapper.addEventListener("dblclick", (e) => {
        if (e.target.closest(".leaflet-control-zoom") || e.target.closest(".leaflet-control-attribution")) return;
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

function rebuildGeoJsonLayer() {
    if (!state.map) return;
    if (state.geoJsonLayer) {
        state.map.removeLayer(state.geoJsonLayer);
    }
    state.featureLayersMap.clear();

    state.geoJsonLayer = L.geoJSON(state.allFeatures, {
        style: () => MAP_STYLES.default,
        onEachFeature: (feature, layer) => {
            const props = feature.properties || {};
            const key = state.isCirclesFeature ? String(props.cid || "") : String(props.zid || "");
            state.featureLayersMap.set(key, layer);

            layer.on({
                mouseover: (e) => {
                    const l = e.target;
                    const isSelected = state.currentId !== CIRCLE_ID && (key === state.currentId || normalizeZoneId(key) === normalizeZoneId(state.currentId));
                    if (!isSelected) {
                        l.setStyle(MAP_STYLES.hover);
                    }
                },
                mouseout: (e) => {
                    const l = e.target;
                    const isSelected = state.currentId !== CIRCLE_ID && (key === state.currentId || normalizeZoneId(key) === normalizeZoneId(state.currentId));
                    if (!isSelected) {
                        l.setStyle(MAP_STYLES.default);
                    }
                },
                click: (e) => {
                    state.lastZoneClickTime = Date.now();
                    if (e && e.originalEvent) {
                        L.DomEvent.stopPropagation(e.originalEvent);
                    }
                    if (state.isCirclesFeature) {
                        if (props.cid === "Eugene") {
                            switchToFeature("eugene", layer);
                        } else if (props.cid === "Florence") {
                            switchToFeature("florence", layer);
                        }
                    } else {
                        selectSubject(key, false);
                    }
                }
            });
        }
    }).addTo(state.map);
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

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        minZoom: 8,
        maxZoom: 19
    }).addTo(state.map);

    state.map.on("click", () => {
        if (Date.now() - state.lastZoneClickTime < 250) {
            return;
        }
        if (!state.isCirclesFeature && state.currentId === CIRCLE_ID) {
            switchToCirclesFeature();
        } else {
            selectSubject(CIRCLE_ID);
        }
    });

    rebuildGeoJsonLayer();
    setupMapEffectsAndFullscreen(mapWrapper);
}

function setupActionButtons() {
    const downloadModal = document.getElementById("downloads-modal");
    const copyModal = document.getElementById("copy-link-modal");
    const downloadBtn = document.getElementById("btn-download-files");
    const copyBtn = document.getElementById("btn-copy-link");

    const closeAllModals = () => {
        if (downloadModal) {
            downloadModal.setAttribute("aria-hidden", "true");
            downloadModal.classList.remove("is-open");
        }
        if (copyModal) {
            copyModal.setAttribute("aria-hidden", "true");
            copyModal.classList.remove("is-open");
        }
    };

    if (copyBtn && copyModal) {
        const copyInput = document.getElementById("copy-link-input");
        const copyActionBtn = document.getElementById("btn-modal-copy-action");
        const copyBtnLabel = document.getElementById("copy-btn-label");

        copyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = copyModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                if (copyInput) copyInput.value = window.location.href;
                copyModal.setAttribute("aria-hidden", "false");
                copyModal.classList.add("is-open");
            }
        });

        if (copyActionBtn && copyInput) {
            copyActionBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(copyInput.value);
                    showToast("Link copied to clipboard!");
                } catch (err) {
                    copyInput.select();
                    document.execCommand("copy");
                    showToast("Link copied to clipboard!");
                }
                if (copyBtnLabel) {
                    copyBtnLabel.textContent = "Copied!";
                    setTimeout(() => {
                        copyBtnLabel.textContent = "Copy";
                    }, 2000);
                }
            });
        }

        copyModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllModals();
            });
        });
    }

    if (downloadBtn && downloadModal) {
        downloadBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = downloadModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                downloadModal.setAttribute("aria-hidden", "false");
                downloadModal.classList.add("is-open");
            }
        });

        downloadModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllModals();
            });
        });
    }

    document.addEventListener("click", (e) => {
        if (window.innerWidth >= 769) {
            if (downloadModal && downloadModal.getAttribute("aria-hidden") === "false") {
                if (!downloadModal.contains(e.target) && !downloadBtn.contains(e.target)) {
                    closeAllModals();
                }
            }
            if (copyModal && copyModal.getAttribute("aria-hidden") === "false") {
                if (!copyModal.contains(e.target) && !copyBtn.contains(e.target)) {
                    closeAllModals();
                }
            }
        }
    });

    const editBtn = document.getElementById("btn-edit-item");
    if (editBtn) {
        editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            let target = state.currentId;
            if (target && target !== CIRCLE_ID) {
                target = normalizeZoneId(target);
            } else {
                target = CIRCLE_ID;
            }
            window.location.href = `/editor/?id=${encodeURIComponent(target)}`;
        });
    }

    const capsuleBackBtn = document.getElementById("btn-capsule-back");
    if (capsuleBackBtn) {
        capsuleBackBtn.addEventListener("click", () => {
            selectSubject(CIRCLE_ID);
        });
    }

    const headerCirclesBtn = document.getElementById("btn-header-circles");
    if (headerCirclesBtn) {
        headerCirclesBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            switchToCirclesFeature();
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

    let savedHeights = null;

    const openSearch = () => {
        const mapArea = document.querySelector(".maps-tile-map-area");
        const sidebar = document.querySelector(".maps-tile-sidebar");

        if (window.innerWidth <= 768 && mapArea && sidebar) {
            savedHeights = {
                map: mapArea.style.height || "",
                sidebar: sidebar.style.height || ""
            };
            mapArea.style.setProperty("height", "35%", "important");
            sidebar.style.setProperty("height", "65%", "important");
            if (state.map) {
                setTimeout(() => state.map.invalidateSize(), 300);
            }
        }

        header.classList.add("is-search-active");
        searchInput.value = "";
        filterList("");
        setTimeout(() => searchInput.focus(), 50);
    };

    const closeSearch = () => {
        header.classList.remove("is-search-active");
        searchInput.value = "";
        filterList("");

        if (savedHeights) {
            const mapArea = document.querySelector(".maps-tile-map-area");
            const sidebar = document.querySelector(".maps-tile-sidebar");
            if (mapArea && sidebar) {
                if (savedHeights.map) mapArea.style.setProperty("height", savedHeights.map, "important");
                else mapArea.style.removeProperty("height");

                if (savedHeights.sidebar) sidebar.style.setProperty("height", savedHeights.sidebar, "important");
                else sidebar.style.removeProperty("height");

                if (state.map) {
                    setTimeout(() => state.map.invalidateSize(), 300);
                }
            }
            savedHeights = null;
        }
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

function setupCapsules() {
    const capsules = document.querySelectorAll(".sidebar-capsule");
    capsules.forEach(cap => {
        cap.addEventListener("click", () => {
            capsules.forEach(c => c.classList.remove("is-active"));
            cap.classList.add("is-active");
            state.activeTab = cap.getAttribute("data-tab") || "items";
            renderSidebarList();
        });
    });
}

function openImageLightbox(src, alt = "Enlarged view", text = "") {
    const modal = document.getElementById("image-lightbox-modal");
    const img = document.getElementById("lightbox-img");
    const textEl = document.getElementById("lightbox-text");
    if (modal && img) {
        img.src = src;
        img.alt = alt;
        if (textEl) {
            textEl.textContent = text;
            textEl.style.display = text ? "block" : "none";
        }
        modal.setAttribute("aria-hidden", "false");
        modal.classList.add("is-open");
    }
}

function setupImageLightbox() {
    const modal = document.getElementById("image-lightbox-modal");
    if (!modal) return;

    const closeModal = () => {
        modal.setAttribute("aria-hidden", "true");
        modal.classList.remove("is-open");
    };

    modal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
        closeEl.addEventListener("click", (e) => {
            e.stopPropagation();
            closeModal();
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.getAttribute("aria-hidden") === "false") {
            closeModal();
        }
    });
}

function setupMobileResizeBar() {
    const resizeBar = document.getElementById("mobile-resize-bar");
    const mapArea = document.querySelector(".maps-tile-map-area");
    const sidebar = document.querySelector(".maps-tile-sidebar");
    const main = document.querySelector(".maps-tile-main");

    if (!resizeBar || !mapArea || !sidebar || !main) return;

    let isDragging = false;

    const startDrag = (e) => {
        if (window.innerWidth > 768) return;
        isDragging = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = "ns-resize";
        mapArea.style.setProperty("transition", "none", "important");
        sidebar.style.setProperty("transition", "none", "important");
    };

    const doDrag = (e) => {
        if (!isDragging || window.innerWidth > 768) return;

        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const mainRect = main.getBoundingClientRect();

        const relativeY = clientY - mainRect.top;
        let mapPercentage = (relativeY / mainRect.height) * 100;

        mapPercentage = Math.max(20, Math.min(75, mapPercentage));
        const sidebarPercentage = Math.max(15, 95 - mapPercentage);

        mapArea.style.setProperty("height", `${mapPercentage.toFixed(2)}%`, "important");
        sidebar.style.setProperty("height", `${sidebarPercentage.toFixed(2)}%`, "important");

        if (state.map) {
            state.map.invalidateSize();
        }
    };

    const stopDrag = () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
            mapArea.style.removeProperty("transition");
            sidebar.style.removeProperty("transition");
            if (state.map) {
                state.map.invalidateSize();
            }
        }
    };

    resizeBar.addEventListener("mousedown", startDrag);
    resizeBar.addEventListener("touchstart", startDrag, { passive: true });

    window.addEventListener("mousemove", doDrag);
    window.addEventListener("touchmove", doDrag, { passive: true });

    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchend", stopDrag);
}

async function init() {
    try {
        const [circlesRes, eugeneRes, florenceRes] = await Promise.all([
            fetch(CIRCLES_GEOJSON_PATH),
            fetch(EUGENE_GEOJSON_PATH),
            fetch(FLORENCE_GEOJSON_PATH)
        ]);
        if (!circlesRes.ok) throw new Error(`Circles fetch failed (${circlesRes.status})`);
        if (!eugeneRes.ok) throw new Error(`Eugene fetch failed (${eugeneRes.status})`);
        if (!florenceRes.ok) throw new Error(`Florence fetch failed (${florenceRes.status})`);

        const circlesData = await circlesRes.json();
        const eugeneData = await eugeneRes.json();
        const florenceData = await florenceRes.json();

        state.circlesFeatures = Array.isArray(circlesData.features) ? circlesData.features : [];
        state.eugeneFeatures = Array.isArray(eugeneData.features) ? eugeneData.features : [];
        state.florenceFeatures = Array.isArray(florenceData.features) ? florenceData.features : [];

        const initialId = getInitialIdFromUrl();
        if (state.isCirclesFeature) {
            state.allFeatures = state.circlesFeatures;
        } else if (state.currentFeature === "florence") {
            state.allFeatures = state.florenceFeatures;
        } else {
            state.allFeatures = state.eugeneFeatures;
        }

        renderSidebarList();
        initializeMap();
        setupActionButtons();
        setupSearch();
        setupCapsules();
        setupImageLightbox();
        setupMobileResizeBar();

        selectSubject(initialId, true);
    } catch (err) {
        console.error("Error initializing maps tile page:", err);
        updateHeader("Error loading map data");
    }
}

document.addEventListener("DOMContentLoaded", init);
