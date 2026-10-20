import { CIRCLE_ID } from '../config/app-config.js';
import { normalizeZoneId, displayZoneId } from '../utils/format-utils.js';
import { getBbox } from '../utils/geometry-math.js';
import { showToast } from '../components/toast-view.js';

export function createFeatureTransitionController({
    state: appState,
    loadFeatures,
    rebuildFeatures,
    selectSubject,
    disposeRasterCache,
    getFitPadding,
    schedule,
    showToast,
    isSuggestLocked,
    AbortControllerConstructor = globalThis.AbortController
}) {
    let latestTransitionId = 0;
    let activeDatasetRequest = null;

    function beginDatasetRequest() {
        activeDatasetRequest?.abort();
        const controller = new AbortControllerConstructor();
        activeDatasetRequest = controller;
        return controller;
    }

    function finishDatasetRequest(controller) {
        if (activeDatasetRequest === controller) activeDatasetRequest = null;
    }

    async function switchToFeature(featureName, circleLayer) {
        if (isSuggestLocked() && (featureName !== appState.currentFeature || appState.isCirclesFeature)) return;
        if (!appState.map) return;
        disposeRasterCache();
        const transitionId = ++latestTransitionId;
        const requestController = beginDatasetRequest();

        let targetFeatures;
        try {
            targetFeatures = await loadFeatures(featureName, { signal: requestController.signal });
        } catch (error) {
            finishDatasetRequest(requestController);
            if (transitionId === latestTransitionId && !requestController.signal.aborted) {
                console.error(`Unable to load ${featureName} map data:`, error);
                showToast(`Unable to load ${featureName} map data`, true);
            }
            return;
        }
        if (transitionId !== latestTransitionId) return;
        finishDatasetRequest(requestController);

        let transitionFinished = false;
        const performSwap = () => {
            if (transitionFinished) return;
            transitionFinished = true;
            appState.currentFeature = featureName;
            appState.isCirclesFeature = false;
            appState.allFeatures = targetFeatures;
            appState.currentId = CIRCLE_ID;
            rebuildFeatures();
            selectSubject(CIRCLE_ID, false);
        };

        if (circleLayer) {
            appState.map.once('moveend', performSwap);
            appState.map.fitBounds(circleLayer, {
                speed: 0.8,
                curve: 1.4,
                padding: getFitPadding()
            });
            schedule(performSwap, 1000);
        } else {
            performSwap();
        }
    }

    async function switchToCirclesFeature() {
        if (isSuggestLocked() && !appState.isCirclesFeature) return;
        if (!appState.map) return;
        disposeRasterCache();
        const transitionId = ++latestTransitionId;
        const requestController = beginDatasetRequest();

        let circlesFeatures;
        try {
            circlesFeatures = await loadFeatures('circles', { signal: requestController.signal });
        } catch (error) {
            finishDatasetRequest(requestController);
            if (transitionId === latestTransitionId && !requestController.signal.aborted) {
                console.error('Unable to load circles map data:', error);
                showToast('Unable to load circle map data', true);
            }
            return;
        }
        if (transitionId !== latestTransitionId) return;
        finishDatasetRequest(requestController);

        appState.currentFeature = 'circles';
        appState.isCirclesFeature = true;
        appState.allFeatures = circlesFeatures;
        appState.currentId = CIRCLE_ID;
        rebuildFeatures();
        selectSubject(CIRCLE_ID, true);
    }

    return { switchToFeature, switchToCirclesFeature };
}

function _getHierarchyLevel(id, appState) {
    if (appState.isCirclesFeature) return 0;
    if (!id || id === CIRCLE_ID) return 1;
    return 2;
}

export function createMapSelectionController() {
    const selectionState = { currentHierarchyLevel: 0 };
    return {
        selectSubject: (id, triggerMapZoom = true, animate = true, callbacks = {}, options = {}) =>
            runMapSelection(id, triggerMapZoom, animate, callbacks, selectionState, options)
    };
}

function runMapSelection(id, triggerMapZoom, animate, callbacks, selectionState, { renderSidebar: shouldRenderSidebar = true } = {}) {
    const {
        state: appState,
        documentObject,
        windowObject,
        schedule,
        updateHeader: renderHeader,
        renderSidebarList: renderSidebar,
        updateAllFeatureStyles: updateStyles,
        disposeRasterCache: disposeCache,
        scheduleSelectionPreload: schedulePreload,
        getFitPadding,
        clearBirdObservations: clearObservations = () => {},
        updateUrl
    } = callbacks;

    if (documentObject.body.classList.contains("is-suggest-locked") && id !== appState.currentId) {
        return;
    }

    disposeCache();
    windowObject.scrollTo(0, 0);
    if (appState.isHelpModeActive && windowObject.innerWidth <= 768) return;

    if (windowObject.innerWidth <= 768) {
        const sidebar = documentObject.querySelector(".maps-tile-sidebar");
        if (sidebar) {
            sidebar.scrollTop = 0;
            sidebar.classList.remove("is-scrolled");
        }
        documentObject.body.classList.remove("sidebar-is-scrolled");
        const header = documentObject.getElementById("sidebar-header");
        if (header) {
            header.classList.remove("is-scrolled");
        }
    }

    const oldLevel = selectionState.currentHierarchyLevel;
    const newLevel = _getHierarchyLevel(id, appState);
    selectionState.currentHierarchyLevel = newLevel;

    const isLevelChanged = oldLevel !== newLevel;

    const performSelection = () => {
        clearObservations();
        appState.currentId = id;
        const backBtn = documentObject.getElementById("btn-capsule-back");

        if (appState.isCirclesFeature) {
            renderHeader("Coast to Cascades Bird Alliance");
            if (backBtn) {
                backBtn.disabled = true;
                backBtn.classList.add("is-disabled");
                backBtn.removeAttribute("title");
                backBtn.removeAttribute("aria-label");
            }
            if (shouldRenderSidebar) renderSidebar();
            updateUrl?.(id);
            if (triggerMapZoom && appState.map) {
                appState.map.fitBounds(getBbox(appState.allFeatures), {
                    padding: getFitPadding(),
                    animate,
                    speed: 0.8,
                    curve: 1.4
                });
            }
            updateStyles();
            return;
        }

        const isCircle = !id || id === CIRCLE_ID;
        let targetFeature = null;
        if (!isCircle) {
            targetFeature = appState.allFeatures.find(f => {
                const zid = f.properties?.zid;
                return zid && (zid.toLowerCase() === id.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(id));
            });
        }

        if (isCircle || !targetFeature) {
            const titleName = appState.currentFeature === "florence" ? "Florence Christmas Bird Count Circle" : "Eugene Christmas Bird Count Circle";
            renderHeader(titleName);
            if (backBtn) {
                backBtn.disabled = false;
                backBtn.classList.remove("is-disabled");
                backBtn.setAttribute("aria-label", "Back to all circles");
                backBtn.setAttribute("title", "Back to all circles");
            }
        } else {
            const zid = displayZoneId(targetFeature.properties.zid);
            renderHeader(`Zone ${zid}`);
            if (backBtn) {
                backBtn.disabled = false;
                backBtn.classList.remove("is-disabled");
                backBtn.setAttribute("aria-label", "Back to full circle");
                backBtn.setAttribute("title", "Back to full circle");
            }
        }

        if (shouldRenderSidebar) renderSidebar();
        updateStyles();

        if (triggerMapZoom && appState.map) {
            if (isCircle || !targetFeature) {
                appState.map.fitBounds(getBbox(appState.allFeatures), {
                    padding: getFitPadding(),
                    animate: animate,
                    speed: 0.8,
                    curve: 1.4
                });
            } else {
                appState.map.fitBounds(getBbox([targetFeature]), {
                    padding: getFitPadding(20),
                    maxZoom: 14,
                    animate: animate,
                    speed: 0.8,
                    curve: 1.4
                });
            }
        }

        updateUrl?.(id);
        if (typeof appState.refreshLayersModal === "function") appState.refreshLayersModal();
        const isDownloadOpen = documentObject.getElementById("downloads-modal")?.getAttribute("aria-hidden") === "false";
        if (isDownloadOpen) {
            schedulePreload();
        } else {
            disposeCache();
        }
    };

    // Trigger immediate click fly-out on current contents, update DOM & map mid-flyout, then fly in new screen
    if (isLevelChanged && animate) {
        const isMobile = windowObject.innerWidth <= 768;

        // Lock sidebar height on mobile during horizontal slide transition to eliminate vertical stutter/jumps
        const sidebar = documentObject.querySelector(".maps-tile-sidebar");
        if (isMobile && sidebar) {
            const currentH = sidebar.offsetHeight;
            if (currentH > 0) {
                sidebar.style.minHeight = `${currentH}px`;
                sidebar.style.maxHeight = `${currentH}px`;
                schedule(() => {
                    sidebar.style.minHeight = "";
                    sidebar.style.maxHeight = "";
                }, 380);
            }
        }

        const animElements = [
            !isMobile ? documentObject.querySelector('.maps-tile-header') : null,
            documentObject.getElementById('sidebar-header'),
            documentObject.querySelector('.sidebar-list-container'),
            documentObject.querySelector('.sidebar-about-panel')
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
        schedule(() => {
            performSelection();

            // Force micro-reflow so the browser acknowledges new DOM state before animating in
            animElements.forEach(el => void el.offsetWidth);

            animElements.forEach(el => {
                el.classList.remove(outClass);
                el.classList.add(inClass);
            });

            schedule(() => {
                animElements.forEach(el => {
                    el.classList.remove('anim-fly-out-left', 'anim-fly-out-right', 'anim-fly-in-left', 'anim-fly-in-right');
                });
            }, 220);
        }, 130);
    } else {
        performSelection();
    }
}
