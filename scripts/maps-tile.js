const EUGENE_GEOJSON_PATH = "../geojson/Eugene-01-wgs84.geojson";
const FLORENCE_GEOJSON_PATH = "../geojson/Florence-00-wgs84.geojson";
const CIRCLES_GEOJSON_PATH = "../geojson/circles-wgs84.geojson";
const CIRCLE_ID = "ecbc-circle";
const FALLBACK_IMAGE = "../images/wetlands.jpg";

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


function getBbox(features) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    const processCoord = (coord) => {
        if (coord[0] < minLng) minLng = coord[0];
        if (coord[1] < minLat) minLat = coord[1];
        if (coord[0] > maxLng) maxLng = coord[0];
        if (coord[1] > maxLat) maxLat = coord[1];
    };
    const processGeom = (geom) => {
        if (!geom) return;
        if (geom.type === "Polygon") {
            geom.coordinates[0].forEach(processCoord);
        } else if (geom.type === "MultiPolygon") {
            geom.coordinates.forEach(poly => poly[0].forEach(processCoord));
        } else if (geom.type === "Point") {
            processCoord(geom.coordinates);
        }
    };
    if (Array.isArray(features)) {
        features.forEach(f => processGeom(f.geometry));
    } else {
        processGeom(features.geometry);
    }
    if (minLng === Infinity) return [[-123.3, 43.9], [-122.9, 44.2]];
    return [[minLng, minLat], [maxLng, maxLat]];
}

function getDefaultStyle() {
    return MAP_STYLES.default;
}

function updateAllFeatureStyles() {
    if (!state.map || !state.map.getSource('zones')) return;
    
    // We update all features state based on currentId
    state.allFeatures.forEach(feature => {
        const props = feature.properties || {};
        const key = state.isCirclesFeature ? String(props.cid || "") : String(props.zid || "");
        const isSelected = state.currentId !== CIRCLE_ID && (key === state.currentId || normalizeZoneId(key) === normalizeZoneId(state.currentId));
        state.map.setFeatureState(
            { source: 'zones', id: key },
            { selected: isSelected }
        );
    });
}

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
    lastZoneClickTime: 0,
    userLocationMarker: null,
    userLocationAccuracy: null,
    isLocating: false,
    locateControl: null,
    fullscreenControl: null,
    layersControl: null,
    focusedTileIndex: -1,
    lastNavSource: "click",
    baseMapsList: [],
    currentBaseLayer: "dark"
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

    if (zid === "6A" || zid === "6B" || zid === "06A" || zid === "06B") return "../images/zone-images/z06-01.jpg";
    if (zid === "8" || zid === "08") return "../images/zone-images/z08A-01.jpg";
    if (zid === "20B") return "../images/zone-images/20B-01.jpg";
    if (zid === "1") zid = "01";

    return `../images/zone-images/z${zid}-01.jpg`;
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

function showToast(message, isError = false) {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        toast.className = "toast-notification";
        const mapWrapper = document.getElementById("map-wrapper");
        (mapWrapper || document.body).appendChild(toast);
    }
    toast.textContent = message;
    if (isError) {
        toast.classList.add("toast-notification--disabled");
    } else {
        toast.classList.remove("toast-notification--disabled");
    }
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

function updateControlPositions() {
    if (!state.map) return;
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        if (state.map.zoomControl) state.map.zoomControl.setPosition("topright");
        if (state.locateControl) state.locateControl.setPosition("topleft");
        if (state.fullscreenControl) state.fullscreenControl.setPosition("topleft");
        if (state.layersControl) state.layersControl.setPosition("topleft");
    } else {
        if (state.map.zoomControl) state.map.zoomControl.setPosition("bottomleft");
        if (state.locateControl) state.locateControl.setPosition("bottomleft");
        if (state.fullscreenControl) state.fullscreenControl.setPosition("bottomleft");
        if (state.layersControl) state.layersControl.setPosition("bottomleft");
    }
}

function updateHeaderLogo() {
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
            logoImg.alt = "Florence CBC";
        } else {
            logoImg.src = "../images/logo-small.png";
            logoImg.alt = "Eugene CBC";
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
        state.map.fitBounds(circleLayer, {
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
    window.scrollTo(0, 0);
    if (state.isHelpModeActive && window.innerWidth <= 768) return;
    state.currentId = id;
    const backBtn = document.getElementById("btn-capsule-back");

    if (state.isCirclesFeature) {
        updateHeader("CCBA CBC Circles");
        if (backBtn) backBtn.classList.remove("is-visible");
        renderSidebarList();
        updateUrl(id);
        if (triggerMapZoom && state.map && state.geoJsonLayer) {
            state.map.fitBounds(getBbox(state.allFeatures), { padding: 30 });
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
        if (backBtn) {
            backBtn.classList.add("is-visible");
            backBtn.setAttribute("aria-label", "Back to all circles");
            backBtn.setAttribute("title", "Back to all circles");
        }
    } else {
        const zid = displayZoneId(targetFeature.properties.zid);
        updateHeader(`Zone ${zid}`);
        if (backBtn) {
            backBtn.classList.add("is-visible");
            backBtn.setAttribute("aria-label", "Back to full circle");
            backBtn.setAttribute("title", "Back to full circle");
        }
    }

    renderSidebarList();

    state.featureLayersMap.forEach((layer, zid) => {
        const isSelected = targetFeature && (zid === String(targetFeature.properties.zid) || normalizeZoneId(zid) === normalizeZoneId(targetFeature.properties.zid));
        if (isSelected) {
            layer.setStyle(MAP_STYLES.selected);
            layer.bringToFront();
        } else {
            if(state.map && state.map.getSource('zones')) state.map.setFeatureState({source: 'zones', id: cid}, {hover: false});
        }
    });

    if (triggerMapZoom && state.map) {
        if (isCircle || !targetFeature) {
            if (state.geoJsonLayer) {
                state.map.fitBounds(getBbox(state.allFeatures), { padding: 30 });
            }
        } else {
            const selectedLayer = state.featureLayersMap.get(String(targetFeature.properties.zid));
            if (selectedLayer) {
                state.map.fitBounds(getBbox([targetFeature]), { padding: 50, maxZoom: 14 });
            }
        }
    }

    updateUrl(id);
    if (typeof state.refreshLayersModal === "function") {
        state.refreshLayersModal();
    }
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
                        <img src="../images/wetlands.jpg" alt="Audubon Circles" loading="lazy" />
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

            let thumbImg = "../images/wetlands.jpg";
            let isLogo = false;
            if (cid === "Eugene") {
                thumbImg = "../images/logo-small.png";
                isLogo = true;
            } else if (cid === "Florence") {
                thumbImg = "../images/florence.png";
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

            item.addEventListener("mouseenter", () => {
                const layer = state.featureLayersMap.get(cid);
                if (layer) if(state.map && state.map.getSource('zones')) state.map.setFeatureState({source: 'zones', id: cid}, {hover: true});
            });
            item.addEventListener("mouseleave", () => {
                const layer = state.featureLayersMap.get(cid);
                if (layer) if(state.map && state.map.getSource('zones')) state.map.setFeatureState({source: 'zones', id: cid}, {hover: false});
            });

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

        item.addEventListener("mouseenter", () => {
            const layer = state.featureLayersMap.get(String(props.zid));
            const isSelected = state.currentId !== CIRCLE_ID && (String(props.zid) === state.currentId || normalizeZoneId(props.zid) === normalizeZoneId(state.currentId));
            if (layer && !isSelected) if(state.map && state.map.getSource('zones')) state.map.setFeatureState({source: 'zones', id: cid}, {hover: true});
        });
        item.addEventListener("mouseleave", () => {
            const layer = state.featureLayersMap.get(String(props.zid));
            const isSelected = state.currentId !== CIRCLE_ID && (String(props.zid) === state.currentId || normalizeZoneId(props.zid) === normalizeZoneId(state.currentId));
            if (layer && !isSelected) if(state.map && state.map.getSource('zones')) state.map.setFeatureState({source: 'zones', id: cid}, {hover: false});
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

function updateKeyboardTileFocus(newIndex) {
    const tiles = document.querySelectorAll("#sidebar-zone-list .tile-zone-item");
    if (!tiles || tiles.length === 0) return;
    if (newIndex < -1) newIndex = -1;
    if (newIndex >= tiles.length) newIndex = tiles.length - 1;
    state.focusedTileIndex = newIndex;
    tiles.forEach((tile, idx) => {
        const cid = tile.getAttribute("data-id");
        const layer = (cid && state.featureLayersMap) ? state.featureLayersMap.get(cid) : null;
        const isSelected = layer && state.currentId !== CIRCLE_ID && (cid === state.currentId || (typeof normalizeZoneId === "function" && normalizeZoneId(cid) === normalizeZoneId(state.currentId)));

        if (newIndex >= 0 && idx === newIndex) {
            tile.classList.add("is-hovered");
            if (layer && !isSelected) if(state.map && state.map.getSource('zones')) state.map.setFeatureState({source: 'zones', id: cid}, {hover: true});
        } else {
            tile.classList.remove("is-hovered");
            if (layer && !isSelected) if(state.map && state.map.getSource('zones')) state.map.setFeatureState({source: 'zones', id: cid}, {hover: false});
        }
    });
}

function selectMapStyleByIndex(index) {
    if (!state.baseMapsList || state.baseMapsList.length === 0 || !state.map) return;
    if (index < 0 || index >= state.baseMapsList.length) return;

    const targetItem = state.baseMapsList[index];
    state.baseMapsList.forEach(item => {
        if (item === targetItem) {
            if (!state.map.hasLayer(item.layer)) {
                state.map.addLayer(item.layer);
            }
        } else {
            if (state.map.hasLayer(item.layer)) {
                state.map.removeLayer(item.layer);
            }
        }
    });

    const layersControlEl = document.querySelector('.leaflet-control-layers');
    if (layersControlEl) {
        const inputs = layersControlEl.querySelectorAll('input[type="radio"]');
        if (inputs && inputs[index]) {
            inputs[index].checked = true;
        }
    }

    showToast(`Map Style: ${targetItem.name}`);
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
        updateControlPositions();
        if (state.map) {
            state.map.invalidateSize();
            setTimeout(() => state.map.invalidateSize(), 50);
            setTimeout(() => state.map.invalidateSize(), 200);
            setTimeout(() => state.map.invalidateSize(), 400);
        }
    };

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

function toggleFullscreen() {
    const mapWrapper = document.getElementById("map-wrapper");
    if (!mapWrapper) return;

    const handleResize = () => {
        if (state.map) {
            state.map.invalidateSize();
            setTimeout(() => state.map.invalidateSize(), 50);
            setTimeout(() => state.map.invalidateSize(), 200);
            setTimeout(() => state.map.invalidateSize(), 400);
        }
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
        }
    }
}

function highlightTileItem(key) {
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

function unhighlightTileItem() {
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    const items = listContainer.querySelectorAll(".tile-zone-item");
    items.forEach(item => {
        item.classList.remove("is-hovered");
    });
}

function rebuildGeoJsonLayer() {
    if (!state.map) return;
    
    state.allFeatures.forEach(f => {
        const props = f.properties || {};
        const newId = state.isCirclesFeature ? String(props.cid || "") : String(props.zid || "");
        props.feature_id = newId;
        f.id = newId;
    });
    
    const geojsonData = {
        type: "FeatureCollection",
        features: state.allFeatures
    };

    if (state.map.getSource('zones')) {
        state.map.getSource('zones').setData(geojsonData);
    } else {
        state.map.addSource('zones', {
            type: 'geojson',
            data: geojsonData,
            promoteId: 'feature_id'
        });
        
        state.map.addLayer({
            id: 'zones-fill',
            type: 'fill',
            source: 'zones',
            paint: {
                'fill-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], '#30d158',
                    ['boolean', ['feature-state', 'hover'], false], '#30d158',
                    '#ffffff'
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 0.35,
                    ['boolean', ['feature-state', 'hover'], false], 0.2,
                    0.07
                ]
            }
        });

        state.map.addLayer({
            id: 'zones-outline',
            type: 'line',
            source: 'zones',
            paint: {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], '#00ff66',
                    ['boolean', ['feature-state', 'hover'], false], '#30d158',
                    '#ffffff'
                ],
                'line-width': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 2.2,
                    ['boolean', ['feature-state', 'hover'], false], 1.8,
                    1.0
                ]
            }
        });
        
        let hoveredStateId = null;

        state.map.on('mousemove', 'zones-fill', (e) => {
            if (e.features.length > 0) {
                const newHoveredId = e.features[0].id;
                if (hoveredStateId !== null && hoveredStateId !== newHoveredId) {
                    state.map.setFeatureState({ source: 'zones', id: hoveredStateId }, { hover: false });
                    unhighlightTileItem();
                }
                hoveredStateId = newHoveredId;
                if (hoveredStateId != null && hoveredStateId !== "") {
                    state.map.setFeatureState({ source: 'zones', id: hoveredStateId }, { hover: true });
                    highlightTileItem(hoveredStateId);
                    state.map.getCanvas().style.cursor = 'pointer';
                }
            }
        });

        state.map.on('mouseleave', 'zones-fill', () => {
            if (hoveredStateId !== null && hoveredStateId !== "") {
                state.map.setFeatureState({ source: 'zones', id: hoveredStateId }, { hover: false });
                unhighlightTileItem();
            }
            hoveredStateId = null;
            state.map.getCanvas().style.cursor = '';
        });

        state.map.on('click', 'zones-fill', (e) => {
            state.lastZoneClickTime = Date.now();
            if (e.features.length > 0 && e.features[0].id != null) {
                const featureId = String(e.features[0].id);
                const props = e.features[0].properties;
                
                if (state.isCirclesFeature) {
                    if (props.cid === "Eugene") {
                        switchToFeature("eugene", getBbox([e.features[0]]));
                    } else if (props.cid === "Florence") {
                        switchToFeature("florence", getBbox([e.features[0]]));
                    }
                } else {
                    selectSubject(featureId, false);
                }
            }
        });
    }

    if (state.isLocating && state.userLocationMarker) {
        checkUserLocationZone(state.userLocationMarker.getLatLng());
    }
}

function isPointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) &&
            (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function isPointInGeoJSONGeometry(lng, lat, geometry) {
    if (!geometry) return false;
    if (geometry.type === "Polygon") {
        return isPointInRing(lng, lat, geometry.coordinates[0]);
    } else if (geometry.type === "MultiPolygon") {
        for (let poly of geometry.coordinates) {
            if (isPointInRing(lng, lat, poly[0])) return true;
        }
    }
    return false;
}

function checkUserLocationZone(latlng) {
    const badge = document.getElementById("user-location-badge");
    if (!badge) return;

    if (!state.isLocating || !latlng) {
        badge.classList.remove("is-visible");
        badge.innerHTML = "";
        return;
    }

    const lng = latlng.lng;
    const lat = latlng.lat;

    let foundFeature = null;
    for (let f of state.allFeatures) {
        if (isPointInGeoJSONGeometry(lng, lat, f.geometry)) {
            foundFeature = f;
            break;
        }
    }

    if (foundFeature) {
        const props = foundFeature.properties || {};
        let zoneName = "";
        if (state.isCirclesFeature) {
            zoneName = props.cid || "Circle";
        } else {
            const zid = displayZoneId(props.zid);
            zoneName = `Zone ${zid}`;
        }
        badge.innerHTML = `<span class="map-location-badge__dot"></span><span>You are in ${zoneName}</span>`;
        badge.classList.add("is-visible");
    } else {
        badge.classList.remove("is-visible");
        badge.innerHTML = "";
    }
}


class CustomMapStyleControl {
    onAdd(map) {
        this.map = map;
        this.container = document.createElement("div");
        this.container.className = "maplibregl-ctrl maplibregl-ctrl-group leaflet-control-layers";
        
        const button = document.createElement("a");
        button.className = "leaflet-control-layers-toggle";
        button.href = "#";
        button.title = "Map Elements";
        button.setAttribute("role", "button");
        button.setAttribute("aria-label", "Map Elements");
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
            </svg>
        `;
        this.container.appendChild(button);

        const listContainer = document.createElement("div");
        listContainer.className = "leaflet-control-layers-list";
        listContainer.innerHTML = `
            <div class="leaflet-control-layers-header">
                <div class="modal-title-wrapper" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-left: 2px;">
                    <span class="modal-title" style="font-size: 0.95rem; font-weight: 700; color: #ffffff; text-transform: none; letter-spacing: normal;">Map Elements</span>
                    <button type="button" class="modal-close-btn" aria-label="Close Map Elements" style="background: transparent; border: none; padding: 4px; cursor: pointer; color: rgba(255, 255, 255, 0.45); display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; border-radius: 50%;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="modal-capsules-wrapper">
                    <div class="modal-capsules-scroll">
                        <button type="button" class="modal-capsule modal-capsule--icon is-active" data-tab="basemaps" title="Select Basemaps">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                                <polyline points="2 17 12 22 22 17"></polyline>
                                <polyline points="2 12 12 17 22 12"></polyline>
                            </svg>
                        </button>
                        <button type="button" class="modal-capsule" data-tab="layers">Our Layers</button>
                    </div>
                    <button type="button" class="modal-search-toggle-btn" aria-label="Search items">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </button>
                </div>
                <div class="modal-search-expanded">
                    <div class="modal-search-input-container">
                        <svg class="modal-search-input-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input type="text" class="modal-search-input" placeholder="Search items..." autocomplete="off" />
                    </div>
                    <button type="button" class="modal-search-close-btn" aria-label="Close search">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="leaflet-control-layers-body"></div>
        `;
        this.container.appendChild(listContainer);

        let activeTab = "basemaps";
        let searchQuery = "";

        const headerEl = listContainer.querySelector(".leaflet-control-layers-header");
        const bodyEl = listContainer.querySelector(".leaflet-control-layers-body");
        const searchInput = listContainer.querySelector(".modal-search-input");
        const searchToggleBtn = listContainer.querySelector(".modal-search-toggle-btn");
        const searchCloseBtn = listContainer.querySelector(".modal-search-close-btn");

        const renderContent = () => {
            if (!bodyEl) return;
            bodyEl.innerHTML = "";
            const query = searchQuery.toLowerCase().trim();

            const layers = [];
            if (state.isCirclesFeature || state.currentFeature === "circles") {
                layers.push({
                    id: "circles", name: "CCBA CBC Circles", isChild: false, image: "../images/wetlands.jpg", isLogo: false,
                    action: () => selectSubject(CIRCLE_ID, true)
                });
            } else {
                const isFlorence = state.currentFeature === "florence";
                layers.push({
                    id: "circle", name: isFlorence ? "Florence CBC Circle" : "Eugene CBC Circle", isChild: false, 
                    image: isFlorence ? "../images/florence.png" : "../images/logo-small.png", isLogo: true,
                    action: () => selectSubject(CIRCLE_ID, true)
                });
                if (state.currentId && state.currentId !== CIRCLE_ID) {
                    const targetZone = state.allFeatures.find(f => {
                        const zid = f.properties?.zid;
                        return zid && (String(zid).toLowerCase() === String(state.currentId).toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                    });
                    const zidDisplay = targetZone ? displayZoneId(targetZone.properties.zid) : state.currentId;
                    layers.push({
                        id: "selected-zone", name: `Zone ${zidDisplay}`, isChild: true, image: zoneImagePath(state.currentId), isLogo: false,
                        action: () => selectSubject(state.currentId, true)
                    });
                }
            }

            const maxItems = Math.max(layers.length, 3);
            const estimatedHeight = 76 + 20 + (maxItems * 68);
            listContainer.style.setProperty("height", `${estimatedHeight}px`, "important");

            if (activeTab === "layers") {
                const filtered = layers.filter(l => l.name.toLowerCase().includes(query));
                if (filtered.length === 0) bodyEl.innerHTML = `<div class="modal-no-results">No layers found</div>`;
                else filtered.forEach(l => {
                    const isCircleOverview = !state.currentId || state.currentId === CIRCLE_ID;
                    const isRowActive = l.id === "selected-zone" || (l.id === "circle" && isCircleOverview) || (l.id === "circles" && state.isCirclesFeature);
                    
                    const row = document.createElement("div");
                    row.className = `tile-zone-item ${l.isChild ? 'is-child' : ''} ${isRowActive ? 'is-active' : ''}`;
                    row.innerHTML = `
                        <div class="tile-zone-item__thumb ${l.isLogo ? 'tile-zone-item__thumb--logo' : ''}">
                            <img src="${l.image}" alt="${l.name}" loading="lazy">
                        </div>
                        <div class="tile-zone-item__info">
                            <div class="tile-zone-item__title">${l.name}</div>
                        </div>
                    `;
                    row.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); l.action(); });
                    bodyEl.appendChild(row);
                });
            } else {
                const basemaps = [
                    { id: "dark", name: "Dark Map", thumbnailClass: "dark-map-thumbnail" },
                    { id: "satellite", name: "Satellite Map", thumbnailClass: "satellite-thumbnail" }
                ];
                const filtered = basemaps.filter(b => b.name.toLowerCase().includes(query));
                if (filtered.length === 0) bodyEl.innerHTML = `<div class="modal-no-results">No basemaps found</div>`;
                else filtered.forEach(b => {
                    const isSelected = state.currentBaseLayer === b.id;
                    const row = document.createElement("div");
                    row.className = `tile-zone-item ${isSelected ? 'is-active' : ''}`;
                    row.innerHTML = `
                        <div class="tile-zone-item__thumb">
                            <span class="thumbnail ${b.thumbnailClass}"></span>
                        </div>
                        <div class="tile-zone-item__info">
                            <div class="tile-zone-item__title">${b.name}</div>
                        </div>
                    `;
                    row.addEventListener("click", (e) => {
                        e.preventDefault(); e.stopPropagation();
                        
                        if (b.id === "dark") {
                            this.map.setLayoutProperty("base-satellite", "visibility", "none");
                            this.map.setLayoutProperty("base-dark", "visibility", "visible");
                            state.currentBaseLayer = "dark";
                        } else if (b.id === "satellite") {
                            this.map.setLayoutProperty("base-dark", "visibility", "none");
                            this.map.setLayoutProperty("base-satellite", "visibility", "visible");
                            state.currentBaseLayer = "satellite";
                        }
                        renderContent();
                    });
                    bodyEl.appendChild(row);
                });
            }
        };

        state.refreshLayersModal = renderContent;
        renderContent();

        button.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            this.container.classList.toggle("leaflet-control-layers-expanded");
            if (this.container.classList.contains("leaflet-control-layers-expanded")) renderContent();
        });

        const closeBtn = listContainer.querySelector(".modal-close-btn");
        if (closeBtn) {
            closeBtn.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                this.container.classList.remove("leaflet-control-layers-expanded");
            });
        }

        const capsules = listContainer.querySelectorAll(".modal-capsule");
        capsules.forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault(); e.stopPropagation();
                const tab = btn.getAttribute("data-tab");
                if (tab === activeTab) return;
                activeTab = tab;
                capsules.forEach(c => c.classList.toggle("is-active", c.getAttribute("data-tab") === tab));
                renderContent();
            });
        });

        searchToggleBtn.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            headerEl.classList.add("is-searching");
            if (searchInput) searchInput.focus();
        });

        searchCloseBtn.addEventListener("click", (e) => {
            e.preventDefault(); e.stopPropagation();
            headerEl.classList.remove("is-searching");
            if (searchInput) searchInput.value = "";
            searchQuery = "";
            renderContent();
        });

        searchInput.addEventListener("input", () => {
            searchQuery = searchInput.value;
            renderContent();
        });

        document.addEventListener("click", (e) => {
            if (!this.container.contains(e.target)) {
                this.container.classList.remove("leaflet-control-layers-expanded");
                headerEl.classList.remove("is-searching");
                if (searchInput) searchInput.value = "";
                searchQuery = "";
            }
        });

        this.container.addEventListener('mousedown', e => e.stopPropagation());
        this.container.addEventListener('touchstart', e => e.stopPropagation());
        this.container.addEventListener('dblclick', e => e.stopPropagation());
        this.container.addEventListener('wheel', e => e.stopPropagation());

        return this.container;
    }

    onRemove() {
        this.container.parentNode.removeChild(this.container);
        this.map = undefined;
    }
}

function toggleLocationTracking() {
    // MapLibre handles this with GeolocateControl automatically
}

function initializeMap() {
    const mapContainer = document.getElementById("tile-map");
    const mapWrapper = document.getElementById("map-wrapper");
    if (!mapContainer) return;

    state.map = new maplibregl.Map({
        container: 'tile-map',
        style: {
            version: 8,
            sources: {
                "dark-tiles": {
                    type: "raster",
                    tiles: ["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"],
                    tileSize: 256,
                    attribution: "&copy; <a href='https://carto.com/'>CARTO</a>"
                },
                "satellite-tiles": {
                    type: "raster",
                    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                    tileSize: 256,
                    attribution: "Tiles &copy; Esri"
                }
            },
            layers: [
                {
                    id: "base-dark",
                    type: "raster",
                    source: "dark-tiles",
                    minzoom: 0,
                    maxzoom: 22,
                    layout: { visibility: "visible" }
                },
                {
                    id: "base-satellite",
                    type: "raster",
                    source: "satellite-tiles",
                    minzoom: 0,
                    maxzoom: 22,
                    layout: { visibility: "none" }
                }
            ]
        },
        center: [-123.11, 44.05],
        zoom: 11,
        minZoom: 8,
        attributionControl: false
    });

    state.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');
    state.map.addControl(new maplibregl.FullscreenControl(), 'bottom-left');
    
    const geolocate = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true
    });
    state.map.addControl(geolocate, 'bottom-left');
    
    geolocate.on('geolocate', (e) => {
        checkUserLocationZone({ lng: e.coords.longitude, lat: e.coords.latitude });
    });

    state.layersControl = new CustomMapStyleControl();
    state.map.addControl(state.layersControl, 'bottom-left');

    state.map.on('click', (e) => {
        if (Date.now() - state.lastZoneClickTime < 250) {
            return;
        }
        const features = state.map.queryRenderedFeatures(e.point, { layers: ['zones-fill'] });
        if (features.length === 0) {
            if (!state.isCirclesFeature && state.currentId === CIRCLE_ID) {
                switchToCirclesFeature();
            } else {
                selectSubject(CIRCLE_ID);
            }
        }
    });

    state.map.on('load', () => {
        rebuildGeoJsonLayer();
    });

    setupMapEffectsAndFullscreen(mapWrapper);
}


function setupActionButtons() {
    const downloadModal = document.getElementById("downloads-modal");
    const copyModal = document.getElementById("copy-link-modal");
    const helpModal = document.getElementById("help-modal");
    const downloadBtn = document.getElementById("btn-download-files");
    const copyBtn = document.getElementById("btn-copy-link");
    const helpBtn = document.getElementById("btn-help");

    const handleModalReparenting = () => {
        const mapWrapper = document.getElementById("map-wrapper") || document.querySelector(".maps-tile-map-area");
        const actionsRow = document.querySelector(".maps-tile-header__actions");
        const modals = [downloadModal, copyModal, helpModal];

        if (window.innerWidth <= 768) {
            if (actionsRow && actionsRow.parentElement !== document.body) {
                document.body.appendChild(actionsRow);
            }
            modals.forEach(m => {
                if (m && m.parentElement !== actionsRow) {
                    actionsRow.appendChild(m);
                }
            });
        } else if (mapWrapper) {
            if (actionsRow && actionsRow.parentElement !== mapWrapper) {
                mapWrapper.appendChild(actionsRow);
            }
            if (actionsRow) {
                modals.forEach(m => {
                    if (m && m.parentElement !== actionsRow) {
                        actionsRow.appendChild(m);
                    }
                });
            }
        }
    };
    handleModalReparenting();
    window.addEventListener("resize", handleModalReparenting);

    window.updateActionButtonsState = () => {
        const isDownloadOpen = downloadModal && downloadModal.getAttribute("aria-hidden") === "false";
        const isCopyOpen = copyModal && copyModal.getAttribute("aria-hidden") === "false";
        const isHelpOpen = helpModal && helpModal.getAttribute("aria-hidden") === "false";

        if (downloadBtn) downloadBtn.classList.toggle("is-active", !!isDownloadOpen);
        if (copyBtn) copyBtn.classList.toggle("is-active", !!isCopyOpen);
        if (helpBtn) helpBtn.classList.toggle("is-active", !!isHelpOpen);

        if (isDownloadOpen || isCopyOpen || isHelpOpen) {
            document.body.classList.add("has-active-modal");
        } else {
            document.body.classList.remove("has-active-modal");
        }
    };

    const closeAllModals = () => {
        if (downloadModal) {
            downloadModal.setAttribute("aria-hidden", "true");
            downloadModal.classList.remove("is-open");
        }
        if (copyModal) {
            copyModal.setAttribute("aria-hidden", "true");
            copyModal.classList.remove("is-open");
        }
        if (helpModal) {
            helpModal.setAttribute("aria-hidden", "true");
            helpModal.classList.remove("is-open");
        }
        window.updateActionButtonsState();
    };

    const modalBackBtn = document.getElementById("btn-modal-back");
    if (modalBackBtn) {
        modalBackBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllModals();
        });
    }

    if (copyBtn && copyModal) {
        const copyInput = document.getElementById("copy-link-input");
        const copyActionBtn = document.getElementById("btn-modal-copy-action");
        const copyBtnLabel = document.getElementById("copy-btn-label");

        copyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = copyModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                if (copyInput) copyInput.value = window.location.href;
                copyModal.setAttribute("aria-hidden", "false");
                copyModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
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
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = downloadModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                downloadModal.setAttribute("aria-hidden", "false");
                downloadModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        downloadModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllModals();
            });
        });
    }

    if (helpBtn && helpModal) {
        helpBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = helpModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                helpModal.setAttribute("aria-hidden", "false");
                helpModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        helpModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
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
            if (helpModal && helpModal.getAttribute("aria-hidden") === "false") {
                if (!helpModal.contains(e.target) && !helpBtn.contains(e.target)) {
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
            if (!state.isCirclesFeature && (state.currentId === CIRCLE_ID || !state.currentId)) {
                switchToCirclesFeature();
            } else {
                selectSubject(CIRCLE_ID);
            }
        });
    }
}

async function performDirectCopyLink() {
    const url = window.location.href;
    try {
        await navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard!");
    } catch (err) {
        const tempInput = document.createElement("input");
        tempInput.value = url;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showToast("Link copied to clipboard!");
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

    const openSearch = (e) => {
        if (e) e.preventDefault();
        const mapArea = document.querySelector(".maps-tile-map-area");
        const sidebar = document.querySelector(".maps-tile-sidebar");

        if (window.innerWidth <= 768 && mapArea && sidebar) {
            savedHeights = {
                map: mapArea.style.height || "",
                sidebar: sidebar.style.height || ""
            };
            mapArea.style.setProperty("height", "50%", "important");
            sidebar.style.setProperty("height", "50%", "important");
            if (state.map) {
                setTimeout(() => state.map.invalidateSize(), 300);
            }
        }

        header.classList.add("is-searching");
        header.classList.add("is-search-active");
        searchInput.value = "";
        filterList("");
        searchInput.focus();
        setTimeout(() => searchInput.focus(), 100);
    };

    const closeSearch = () => {
        header.classList.remove("is-searching");
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
    toggleBtn.addEventListener("touchend", (e) => {
        e.preventDefault();
        openSearch(e);
    });
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

function setupHelpModeSystem() {
    const toggleInput = document.getElementById("toggle-help-mode");
    const tooltip = document.getElementById("help-mode-tooltip");
    const highlight = document.getElementById("help-mode-highlight");

    const setHelpMode = (active, isFromKey = false) => {
        state.isHelpModeActive = active;
        if (toggleInput) toggleInput.checked = active;
        if (active) {
            document.body.classList.add("is-help-mode-active");
            tagElements();
            if (isFromKey) showToast("Interactive Help Mode: Enabled");
        } else {
            document.body.classList.remove("is-help-mode-active");
            if (tooltip) tooltip.setAttribute("aria-hidden", "true");
            if (highlight) highlight.setAttribute("aria-hidden", "true");
            if (isFromKey) showToast("Interactive Help Mode: Disabled");
        }
        if (window.updateActionButtonsState) window.updateActionButtonsState();
    };

    if (toggleInput) {
        toggleInput.addEventListener("change", (e) => {
            setHelpMode(e.target.checked, false);
        });
    }

    document.addEventListener("mousedown", () => {
        state.lastNavSource = "click";
    }, true);

    document.addEventListener("keydown", (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
        if (activeTag === "input" || activeTag === "textarea") return;

        // Open Help Modal (Shift + H)
        if (e.shiftKey && (e.key === "h" || e.key === "H")) {
            e.preventDefault();
            const helpBtn = document.getElementById("btn-help");
            if (helpBtn) helpBtn.click();
            return;
        }

        // Toggle Interactive Help Mode (H key)
        if (!e.shiftKey && (e.key === "h" || e.key === "H")) {
            setHelpMode(!state.isHelpModeActive, true);
            return;
        }

        // Toggle Fullscreen (Shift + F)
        if (e.shiftKey && (e.key === "f" || e.key === "F")) {
            e.preventDefault();
            toggleFullscreen();
            return;
        }

        // Open Search Field (F key)
        if (!e.shiftKey && (e.key === "f" || e.key === "F")) {
            e.preventDefault();
            const searchToggle = document.getElementById("btn-search-toggle");
            if (searchToggle) searchToggle.click();
            return;
        }

        // Open Download Modal (Shift + G)
        if (e.shiftKey && (e.key === "g" || e.key === "G")) {
            e.preventDefault();
            const downloadBtn = document.getElementById("btn-download-files");
            if (downloadBtn) downloadBtn.click();
            return;
        }

        // Edit Item (Shift + X)
        if (e.shiftKey && (e.key === "x" || e.key === "X")) {
            e.preventDefault();
            const editBtn = document.getElementById("btn-edit-item");
            if (editBtn) editBtn.click();
            return;
        }

        // Copy Link (Shift + C)
        if (e.shiftKey && (e.key === "c" || e.key === "C")) {
            e.preventDefault();
            performDirectCopyLink();
            return;
        }

        // Back Navigation (Escape key)
        if (e.key === "Escape" || e.key === "Esc") {
            state.lastNavSource = "keyboard";
            const lightbox = document.getElementById("image-lightbox-modal");
            if (lightbox && lightbox.classList.contains("is-open")) {
                lightbox.classList.remove("is-open");
                lightbox.setAttribute("aria-hidden", "true");
                return;
            }
            const openModal = document.querySelector(".maps-tile-modal[aria-hidden='false']");
            if (openModal) {
                openModal.setAttribute("aria-hidden", "true");
                return;
            }
            const backBtn = document.getElementById("btn-capsule-back");
            if (backBtn) backBtn.click();
            return;
        }

        // About Information (` key)
        if (e.key === "`" || e.key === "~") {
            state.lastNavSource = "keyboard";
            const aboutTab = document.querySelector('.sidebar-capsule[data-tab="about"]');
            if (aboutTab) aboutTab.click();
            return;
        }

        // Class Tabs Navigation (Numbers 1-9 without Shift)
        if (!e.shiftKey && e.key >= "1" && e.key <= "9") {
            state.lastNavSource = "keyboard";
            const index = parseInt(e.key, 10) - 1;
            const classTabs = document.querySelectorAll('.sidebar-capsule:not(.sidebar-capsule--icon)');
            if (classTabs && classTabs[index]) {
                classTabs[index].click();
            }
            return;
        }

        // Shift + 1-9 Map Style Navigation
        if (e.shiftKey && (e.code.startsWith("Digit") || (e.key >= "1" && e.key <= "9") || "!@#$%^&*(".includes(e.key))) {
            let digitNum = 0;
            if (e.code.startsWith("Digit")) {
                digitNum = parseInt(e.code.replace("Digit", ""), 10);
            } else if (e.key >= "1" && e.key <= "9") {
                digitNum = parseInt(e.key, 10);
            } else {
                const shiftMap = { "!": 1, "@": 2, "#": 3, "$": 4, "%": 5, "^": 6, "&": 7, "*": 8, "(": 9 };
                digitNum = shiftMap[e.key] || 0;
            }
            if (digitNum >= 1 && digitNum <= 9) {
                e.preventDefault();
                selectMapStyleByIndex(digitNum - 1);
                return;
            }
        }

        // Map Zoom (+, -, Shift+E zoom in, Shift+Q zoom out)
        const k = e.key.toLowerCase();
        if (e.key === "+" || e.key === "=" || (e.shiftKey && k === "e")) {
            e.preventDefault();
            if (state.map) state.map.zoomIn();
            return;
        }
        if (e.key === "-" || e.key === "_" || (e.shiftKey && k === "q")) {
            e.preventDefault();
            if (state.map) state.map.zoomOut();
            return;
        }

        // WASD & Arrow Feature Tile Navigation OR Shift + WASD/Arrow Map Panning
        if (k === "w" || e.key === "ArrowUp") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([0, -120], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            if (state.focusedTileIndex === -1) {
                const tiles = document.querySelectorAll("#sidebar-zone-list .tile-zone-item");
                updateKeyboardTileFocus(tiles ? tiles.length - 1 : 0);
            } else {
                updateKeyboardTileFocus(state.focusedTileIndex - 1);
            }
            return;
        }
        if (k === "s" || e.key === "ArrowDown") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([0, 120], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            if (state.focusedTileIndex === -1) {
                updateKeyboardTileFocus(0);
            } else {
                updateKeyboardTileFocus(state.focusedTileIndex + 1);
            }
            return;
        }
        if (k === "a" || e.key === "ArrowLeft") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([-120, 0], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            const backBtn = document.getElementById("btn-capsule-back");
            if (backBtn) backBtn.click();
            return;
        }
        if (k === "d" || e.key === "ArrowRight") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([120, 0], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            const tiles = document.querySelectorAll("#sidebar-zone-list .tile-zone-item");
            if (tiles && tiles.length > 0) {
                const targetIdx = state.focusedTileIndex >= 0 ? state.focusedTileIndex : 0;
                if (tiles[targetIdx]) tiles[targetIdx].click();
            }
            return;
        }
    });

    const helpDictionary = [
        { selector: "#header-logo-container, .logo--header", title: "Organization Logo", desc: "Click the organization logo to navigate to the home directory of the organization which the currently selected feature belongs to." },
        { selector: "#header-title", title: "Selection Title", desc: "Displays the name of the currently selected feature." },
        { selector: "#btn-copy-link", title: "Copy Link", desc: "Generates and copies a direct URL share link for the current view.", shortcut: "Shift + C" },
        { selector: "#btn-download-files", title: "Download Files", desc: "Access spatial GIS, PDF maps, and survey dataset files for this selection.", shortcut: "Shift + G" },
        { selector: "#btn-edit-item", title: "Edit Item", desc: "Opens the spatial data editor interface for updating boundaries.", shortcut: "Shift + X" },
        { selector: "#btn-help", title: "Help & Guide", desc: "Opens user documentation and toggles Interactive Tooltip Mode.", shortcut: "Shift + H" },
        { selector: "#btn-capsule-back", title: "Back Navigation", desc: "Return to the previous higher-level overview (circle or list).", shortcut: "Esc or A / Left Arrow" },
        { selector: '[data-tab="about"]', title: "About Tab", desc: "View detailed descriptions, spatial summaries, and photographs.", shortcut: "` (Backtick)" },
        { selector: '.sidebar-capsule:not(.sidebar-capsule--icon)', title: "Class Tab", desc: "Class tabs filter the subfeatures of the current selection by type, which is reflected in the feature tiles column.", shortcut: "1 - 9" },
        { selector: "#btn-search-toggle", title: "Search Tool", desc: "Expand full-row search bar to filter count circles and survey zones.", shortcut: "F" },
        { selector: "#mobile-resize-bar", title: "Resize Handle", desc: "Drag vertically to adjust split screen map and list proportions." },
        { selector: ".leaflet-control-zoom", title: "Zoom Controls", desc: "Zoom in (+) or out (-) on the interactive map view.", shortcut: "+ / - or Shift + E / Q" },
        { selector: ".leaflet-control-locate", title: "Location Tracking", desc: "Locate your current live GPS position on the survey map." },
        { selector: ".leaflet-control-fullscreen", title: "Fullscreen Toggle", desc: "Expand map view to fill your entire screen display.", shortcut: "Shift + F" },
        { selector: ".leaflet-control-layers", title: "Map Elements", desc: "Select the basemap and toggle overlay layers for the map frame.", shortcut: "Shift + 1 - 9" },
        { selector: ".leaflet-control-layers-list .tile-zone-item", title: "Map Element Option", desc: "Select this basemap or overlay layer to update the active map display." },
        { selector: '.modal-capsule[data-tab="basemaps"]', title: "Basemaps Tab", desc: "View and select the underlying style of the interactive map." },
        { selector: '.modal-capsule[data-tab="layers"]', title: "Class Tab", desc: "Class tabs filter the subfeatures of the current selection by type, which is reflected in the feature tiles column.", shortcut: "1 - 9" },
        { selector: ".modal-search-toggle-btn", title: "Element Search", desc: "Toggle a text search box to filter the visible list items below." },
        { selector: ".modal-search-input", title: "Search Text Input", desc: "Type to filter layers or basemaps matching your keywords." },
        { selector: ".tile-zone-item", title: "Feature Tile", desc: "A feature tile represents a sub feature of the currently selected item. Click it to select the feature.", shortcut: "WASD or Arrows (W/S to navigate, D to select)" },
        { selector: "#tile-map, #map-wrapper", title: "Map Frame", desc: "Interactive spatial map view showing bird count circles and survey zone boundaries.", shortcut: "Shift + WASD or Arrow Keys" }
    ];

    const tagElements = () => {
        helpDictionary.forEach(item => {
            const els = document.querySelectorAll(item.selector);
            els.forEach(el => {
                el.setAttribute("data-help-title", item.title);
                el.setAttribute("data-help-desc", item.desc);
                if (item.shortcut) {
                    el.setAttribute("data-help-shortcut", item.shortcut);
                } else {
                    el.removeAttribute("data-help-shortcut");
                }
            });
        });
    };

    tagElements();

    const observer = new MutationObserver(() => {
        if (state.isHelpModeActive) {
            tagElements();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const resolveHelpTarget = (eventTarget) => {
        let target = eventTarget.closest("[data-help-title]");
        let title = target ? target.getAttribute("data-help-title") : null;
        let desc = target ? target.getAttribute("data-help-desc") : null;
        let shortcut = target ? target.getAttribute("data-help-shortcut") : null;

        if (!target) {
            for (const item of helpDictionary) {
                const matched = eventTarget.closest(item.selector);
                if (matched) {
                    target = matched;
                    title = item.title;
                    desc = item.desc;
                    shortcut = item.shortcut || null;
                    target.setAttribute("data-help-title", title);
                    target.setAttribute("data-help-desc", desc);
                    if (shortcut) target.setAttribute("data-help-shortcut", shortcut);
                    break;
                }
            }
        }
        if (target && (target.id === "tile-map" || target.id === "map-wrapper" || title === "Map Frame")) {
            if (eventTarget.closest(".leaflet-control-container, .leaflet-top, .leaflet-left, .leaflet-right, .leaflet-bottom")) {
                return { target: null, title: null, desc: null, shortcut: null };
            }
        }

        return { target, title, desc, shortcut };
    };

    const isTouchDevice = () => {
        return window.matchMedia("(pointer: coarse)").matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0) || window.innerWidth <= 768;
    };

    document.addEventListener("mousemove", (e) => {
        if (!state.isHelpModeActive || isTouchDevice()) return;

        const { target, title, desc, shortcut } = resolveHelpTarget(e.target);
        if (target) {
            if (tooltip) {
                tooltip.innerHTML = `
                    <div class="help-mode-tooltip__title">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        <span>${title}</span>
                    </div>
                    <p class="help-mode-tooltip__desc">${desc}</p>
                    ${shortcut ? `
                        <div class="help-mode-tooltip__shortcut">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M8 16h8"></path></svg>
                            <span class="help-mode-tooltip__shortcut-label">Shortcut:</span>
                            <span class="help-mode-tooltip__shortcut-val">${shortcut}</span>
                        </div>
                    ` : ""}
                `;

                tooltip.setAttribute("aria-hidden", "false");

                const tooltipWidth = tooltip.offsetWidth || 240;
                const tooltipHeight = tooltip.offsetHeight || 80;

                let posX = e.clientX + 15;
                let posY = e.clientY + 15;

                if (posX + tooltipWidth > window.innerWidth - 10) {
                    posX = e.clientX - tooltipWidth - 15;
                }
                if (posY + tooltipHeight > window.innerHeight - 10) {
                    posY = e.clientY - tooltipHeight - 15;
                }

                tooltip.style.left = `${posX}px`;
                tooltip.style.top = `${posY}px`;
            }

            if (highlight) {
                const rect = target.getBoundingClientRect();
                const pad = 3;
                highlight.style.left = `${rect.left - pad}px`;
                highlight.style.top = `${rect.top - pad}px`;
                highlight.style.width = `${rect.width + pad * 2}px`;
                highlight.style.height = `${rect.height + pad * 2}px`;
                highlight.setAttribute("aria-hidden", "false");
            }
        } else {
            if (tooltip) tooltip.setAttribute("aria-hidden", "true");
            if (highlight) highlight.setAttribute("aria-hidden", "true");
        }
    });

    const mobileExitBtn = document.getElementById("mobile-help-exit-btn");
    if (mobileExitBtn) {
        mobileExitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            setHelpMode(false, false);
        });
    }

    const handleHelpClick = (e) => {
        if (!state.isHelpModeActive || !isTouchDevice()) return;

        const helpModal = document.getElementById("help-modal");
        if (helpModal && helpModal.contains(e.target)) return;
        if (mobileExitBtn && mobileExitBtn.contains(e.target)) return;

        const { target, title, desc, shortcut } = resolveHelpTarget(e.target);
        if (target) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (tooltip) {
                tooltip.innerHTML = `
                    <div class="help-mode-tooltip__title">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        <span>${title}</span>
                    </div>
                    <p class="help-mode-tooltip__desc">${desc}</p>
                    ${shortcut ? `
                        <div class="help-mode-tooltip__shortcut">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M8 16h8"></path></svg>
                            <span class="help-mode-tooltip__shortcut-label">Shortcut:</span>
                            <span class="help-mode-tooltip__shortcut-val">${shortcut}</span>
                        </div>
                    ` : ""}
                `;
                tooltip.setAttribute("aria-hidden", "false");

                const rect = target.getBoundingClientRect();
                const tooltipWidth = tooltip.offsetWidth || 240;
                const tooltipHeight = tooltip.offsetHeight || 80;

                let posX = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                let posY = rect.bottom + 10;

                if (posX < 10) posX = 10;
                if (posX + tooltipWidth > window.innerWidth - 10) posX = window.innerWidth - tooltipWidth - 10;
                if (posY + tooltipHeight > window.innerHeight - 10) posY = rect.top - tooltipHeight - 10;
                if (posY < 10) posY = 10;

                tooltip.style.left = `${posX}px`;
                tooltip.style.top = `${posY}px`;
            }

            if (highlight) {
                const rect = target.getBoundingClientRect();
                const pad = 3;
                highlight.style.left = `${rect.left - pad}px`;
                highlight.style.top = `${rect.top - pad}px`;
                highlight.style.width = `${rect.width + pad * 2}px`;
                highlight.style.height = `${rect.height + pad * 2}px`;
                highlight.setAttribute("aria-hidden", "false");
            }
        }
    };

    document.addEventListener("click", handleHelpClick, true);
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
        setupHelpModeSystem();
        setupSidebarScrollListener();

        selectSubject(initialId, true);
    } catch (err) {
        console.error("Error initializing maps tile page:", err);
        updateHeader("Error loading map data");
    }
}

function setupSidebarScrollListener() {
    const scrollBox = document.getElementById("sidebar-zone-list");
    const header = document.getElementById("sidebar-header");
    if (scrollBox && header) {
        scrollBox.addEventListener("scroll", () => {
            if (scrollBox.scrollTop > 0) {
                header.classList.add("is-scrolled");
            } else {
                header.classList.remove("is-scrolled");
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", init);
