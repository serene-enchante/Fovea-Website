import { state } from '../state.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { updateUrl, renderSidebarList, rebuildGeoJsonLayer } from '../maps-tile.js';
import { updateHeader, getFitPadding } from '../components/header-view.js';
import { updateAllFeatureStyles } from './map-layers.js';
import { normalizeZoneId, displayZoneId } from '../utils/format-utils.js';
import { getBbox } from '../utils/geometry-math.js';

export function switchToFeature(featureName) {
    if (!state.map) return;
    
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
        selectSubject(CIRCLE_ID, false, false);
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
    if (!state.map) return;
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
        if (typeof state.refreshLayersModal === "function") {
            state.refreshLayersModal();
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

