import { state } from '../state.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { renderSidebarList } from '../components/sidebar-list.js';
import { updateHeader, getFitPadding } from '../components/header-view.js';
import { updateAllFeatureStyles, rebuildGeoJsonLayer } from './map-layers.js';
import { normalizeZoneId, displayZoneId } from '../utils/format-utils.js';
import { getBbox } from '../utils/geometry-math.js';
import { disposeRasterCache, scheduleSelectionPreload } from './map-rendering.js';
import { getSuggestSelectionLabel } from '../components/feedback-form.js';
import { showToast } from '../components/toast-view.js';

export function updateUrl(id) {
    if (typeof window === "undefined") return;
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

export function switchToFeature(featureName) {
    if (document.body.classList.contains("is-suggest-locked") && (featureName !== state.currentFeature || state.isCirclesFeature)) {
        return;
    }

    if (!state.map) return;
    disposeRasterCache();
    
    let transitionFinished = false;
    const targetFeatures = (featureName === "florence") ? state.florenceFeatures : state.eugeneFeatures;
    const circleLayer = getBbox(targetFeatures);

    const performSwap = () => {
        if (transitionFinished) return;
        transitionFinished = true;

        state.currentFeature = featureName;
        state.isCirclesFeature = false;
        state.allFeatures = targetFeatures;
        state.currentId = CIRCLE_ID;

        rebuildGeoJsonLayer();
        selectSubject(CIRCLE_ID, false, true);
    };

    if (circleLayer) {
        state.map.once("moveend", performSwap);
        state.map.fitBounds(circleLayer, {
            speed: 0.8,
            curve: 1.4,
            padding: getFitPadding()
        });
        setTimeout(performSwap, 1500);
    } else {
        performSwap();
    }
}

export function switchToCirclesFeature() {
    if (document.body.classList.contains("is-suggest-locked") && !state.isCirclesFeature) {
        return;
    }

    if (!state.map) return;
    disposeRasterCache();
    state.currentFeature = "circles";
    state.isCirclesFeature = true;
    state.allFeatures = state.circlesFeatures;
    state.currentId = CIRCLE_ID;

    rebuildGeoJsonLayer();
    selectSubject(CIRCLE_ID, true);

    const macroBbox = getBbox(state.circlesFeatures);
    if (macroBbox) {
        if (state.map.isMoving()) state.map.stop();
        state.map.fitBounds(macroBbox, {
            speed: 0.8,
            curve: 1.4,
            padding: typeof getFitPadding === 'function' ? getFitPadding() : 0
        });
    }
}

let _currentHierarchyLevel = 0;

function _getHierarchyLevel(id) {
    if (state.isCirclesFeature) return 0;
    if (!id || id === CIRCLE_ID) return 1;
    return 2;
}

export function selectSubject(id, triggerMapZoom = true, animate = true) {
    if (document.body.classList.contains("is-suggest-locked") && id !== state.currentId) {
        return;
    }

    disposeRasterCache();
    window.scrollTo(0, 0);
    if (state.isHelpModeActive && window.innerWidth <= 768) return;

    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector(".maps-tile-sidebar");
        if (sidebar) {
            sidebar.scrollTop = 0;
            sidebar.classList.remove("is-scrolled");
        }
        document.body.classList.remove("sidebar-is-scrolled");
        const header = document.getElementById("sidebar-header");
        if (header) {
            header.classList.remove("is-scrolled");
        }
    }

    const oldLevel = _currentHierarchyLevel;
    const newLevel = _getHierarchyLevel(id);
    _currentHierarchyLevel = newLevel;

    const isLevelChanged = oldLevel !== newLevel;

    const performSelection = () => {
        state.currentId = id;
        const backBtn = document.getElementById("btn-capsule-back");

        if (state.isCirclesFeature) {
            updateHeader("Coast to Cascades Bird Alliance");
            if (backBtn) backBtn.classList.remove("is-visible");
            rebuildGeoJsonLayer();
            renderSidebarList();
            updateUrl(id);
            if (triggerMapZoom && state.map) {
                const zoomFn = () => {
                    state.map.fitBounds(getBbox(state.allFeatures), {
                        padding: getFitPadding(),
                        animate: animate,
                        speed: 0.8,
                        curve: 1.4
                    });
                };
                if (state.map.isStyleLoaded()) {
                    zoomFn();
                } else {
                    state.map.once('load', zoomFn);
                }
            }
            updateAllFeatureStyles();
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
            const titleName = state.currentFeature === "florence" ? "Florence Christmas Bird Count Circle" : "Eugene Christmas Bird Count Circle";
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
        updateAllFeatureStyles();

        if (triggerMapZoom && state.map) {
            if (isCircle || !targetFeature) {
                state.map.fitBounds(getBbox(state.allFeatures), {
                    padding: getFitPadding(),
                    animate: animate,
                    speed: 0.8,
                    curve: 1.4
                });
            } else {
                state.map.fitBounds(getBbox([targetFeature]), {
                    padding: getFitPadding(20),
                    maxZoom: 14,
                    animate: animate,
                    speed: 0.8,
                    curve: 1.4
                });
            }
        }

        updateUrl(id);
        const isDownloadOpen = document.getElementById("downloads-modal")?.getAttribute("aria-hidden") === "false";
        if (isDownloadOpen) {
            scheduleSelectionPreload();
        } else {
            disposeRasterCache();
        }
    };

    // Trigger immediate click fly-out on current contents, update DOM & map mid-flyout, then fly in new screen
    if (isLevelChanged && animate) {
        const isMobile = window.innerWidth <= 768;

        // Lock sidebar height on mobile during horizontal slide transition to eliminate vertical stutter/jumps
        const sidebar = document.querySelector(".maps-tile-sidebar");
        if (isMobile && sidebar) {
            const currentH = sidebar.offsetHeight;
            if (currentH > 0) {
                sidebar.style.minHeight = `${currentH}px`;
                sidebar.style.maxHeight = `${currentH}px`;
                setTimeout(() => {
                    sidebar.style.minHeight = "";
                    sidebar.style.maxHeight = "";
                }, 380);
            }
        }

        const animElements = [
            !isMobile ? document.querySelector('.maps-tile-header') : null,
            document.getElementById('sidebar-header'),
            document.querySelector('.sidebar-list-container'),
            document.querySelector('.sidebar-about-panel')
        ].filter(Boolean);

        const isGoingUp = newLevel < oldLevel;
        const outClass = isGoingUp ? 'anim-fly-out-right' : 'anim-fly-out-left';
        const inClass  = isGoingUp ? 'anim-fly-in-left'   : 'anim-fly-in-right';

        // 1. Immediately on click: fly out current contents
        animElements.forEach(el => {
            el.classList.remove('anim-fly-out-left', 'anim-fly-out-right', 'anim-fly-in-left', 'anim-fly-in-right');
            el.classList.add(outClass);
        });

        // 2. Mid-flyout (130ms): Update DOM content & trigger map zoom, then fly in new content
        setTimeout(() => {
            performSelection();

            // Force micro-reflow so the browser acknowledges new DOM state before animating in
            animElements.forEach(el => void el.offsetWidth);

            animElements.forEach(el => {
                el.classList.remove(outClass);
                el.classList.add(inClass);
            });

            setTimeout(() => {
                animElements.forEach(el => {
                    el.classList.remove('anim-fly-out-left', 'anim-fly-out-right', 'anim-fly-in-left', 'anim-fly-in-right');
                });
            }, 220);
        }, 130);
    } else {
        performSelection();
    }
}

