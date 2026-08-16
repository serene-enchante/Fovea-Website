import { state } from '../state.js';

export function updateControlPositions() {
    if (!state.map) return;
    const isMobile = window.innerWidth <= 768;
    const topLeft = document.querySelector(".map-ctrl-container .map-ctrl-panel.map-ctrl-panel--left");
    const topRight = document.querySelector(".map-ctrl-container .map-ctrl-panel.map-ctrl-panel--right");
    const zoomCtrl = document.querySelector(".map-ctrl-zoom");
    const locateCtrl = document.querySelector(".map-ctrl-locate");
    const fsCtrl = document.querySelector(".map-ctrl-fullscreen");
    const layersCtrl = document.querySelector(".map-ctrl-styles");

    if (isMobile) {
        // Zoom → top-right panel
        if (topRight && zoomCtrl) topRight.appendChild(zoomCtrl);
        // Mobile bottom-right row, left-to-right: map styles → location → fullscreen
        if (topLeft) {
            if (layersCtrl) topLeft.appendChild(layersCtrl);
            if (locateCtrl) topLeft.appendChild(locateCtrl);
            if (fsCtrl) topLeft.appendChild(fsCtrl);
        }
    } else {
        // All → bottom-left, stacked vertically. flex-direction:column-reverse means
        // first appended = visually at bottom. Order from bottom to top:
        // zoom (bottom) → fullscreen → locate → map styles (top)
        if (topLeft) {
            if (zoomCtrl) topLeft.appendChild(zoomCtrl);
            if (fsCtrl) topLeft.appendChild(fsCtrl);
            if (locateCtrl) topLeft.appendChild(locateCtrl);
            if (layersCtrl) topLeft.appendChild(layersCtrl);
        }
    }
}

export function updateBottomNavVisibilityForSnapState(snapState) {
    const bottomNavContainer = document.querySelector(".mobile-bottom-nav-container");
    if (bottomNavContainer) {
        if (snapState === "map-full") {
            bottomNavContainer.classList.add("is-hidden-entirely");
        } else {
            bottomNavContainer.classList.remove("is-hidden-entirely");
        }
    }
}

export function setMobileSnapState(snapState, animate = true) {
    const mapArea = document.querySelector(".maps-tile-map-area");
    const sidebar = document.querySelector(".maps-tile-sidebar");
    const resizeBar = document.getElementById("mobile-resize-bar");
    const headerEl = document.querySelector(".maps-tile-header");
    const sidebarHeaderEl = document.getElementById("sidebar-header");
    
    if (!mapArea || !sidebar || !resizeBar || !headerEl || !sidebarHeaderEl) return;

    updateBottomNavVisibilityForSnapState(snapState);

    state.snapState = snapState;

    if (animate) {
        mapArea.style.setProperty("transition", "height 0.32s cubic-bezier(0.16, 1, 0.3, 1)", "important");
        sidebar.style.setProperty("transition", "height 0.32s cubic-bezier(0.16, 1, 0.3, 1)", "important");
    } else {
        mapArea.style.setProperty("transition", "none", "important");
        sidebar.style.setProperty("transition", "none", "important");
    }

    if (snapState === "selection-full") {
        sidebar.classList.add("is-selection-full");
        document.body.classList.add("is-selection-full");
        const resizeBarHeight = resizeBar.offsetHeight || 18;
        mapArea.style.setProperty("height", "0px", "important");
        sidebar.style.setProperty("height", `calc(100% - ${resizeBarHeight}px)`, "important");
    } else if (snapState === "map-full") {
        sidebar.classList.remove("is-selection-full");
        document.body.classList.remove("is-selection-full");
        const headerHeight = headerEl.offsetHeight || 80;
        const subHeaderHeight = sidebarHeaderEl.offsetHeight || 50;
        const totalHeaderHeight = headerHeight + subHeaderHeight;
        const resizeBarHeight = resizeBar.offsetHeight || 18;
        
        sidebar.style.setProperty("height", `${totalHeaderHeight}px`, "important");
        mapArea.style.setProperty("height", `calc(100% - ${totalHeaderHeight + resizeBarHeight}px)`, "important");
    } else {
        sidebar.classList.remove("is-selection-full");
        document.body.classList.remove("is-selection-full");
        mapArea.style.setProperty("height", "calc(50% - 9px)", "important");
        sidebar.style.setProperty("height", "calc(50% - 9px)", "important");
    }

    setTimeout(() => {
        if (state.map) {
            state.map.resize();
        }
    }, animate ? 350 : 0);
}

export function setupSwipeNavigation() {
    const headerEl = document.querySelector(".maps-tile-header");
    const sidebarHeaderEl = document.getElementById("sidebar-header");
    const scrollContainer = document.querySelector(".sidebar-capsules-scroll");
    
    const targets = [headerEl, sidebarHeaderEl].filter(Boolean);
    if (targets.length === 0) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isVerticalSwiping = false;

    const handleTouchStart = (e) => {
        if (window.innerWidth > 768) return;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        startTime = Date.now();
        isVerticalSwiping = false;
    };

    const handleTouchMove = (e) => {
        if (window.innerWidth > 768) return;
        if (!startX || !startY) return;
        
        const touch = e.touches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;

        if (!isVerticalSwiping && Math.abs(diffY) > 10 && Math.abs(diffY) > Math.abs(diffX) * 1.5) {
            isVerticalSwiping = true;
        }

        if (isVerticalSwiping) {
            if (e.cancelable) {
                e.preventDefault();
            }
        }
    };

    const handleTouchEnd = (e) => {
        if (window.innerWidth > 768) return;
        const touch = e.changedTouches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;
        const elapsedTime = Date.now() - startTime;

        startX = 0;
        startY = 0;

        // Vertical swipe to change snap states
        if (Math.abs(diffY) > 40 && Math.abs(diffY) > Math.abs(diffX) * 1.5 && elapsedTime < 300) {
            let currentState = state.snapState || "default";
            let newState = currentState;

            const mapArea = document.querySelector(".maps-tile-map-area");
            const main = document.querySelector(".maps-tile-main");

            if (diffY < 0) {
                // Swipe UP -> moves drawer UP (less map space)
                if (currentState === "map-full") {
                    newState = "default";
                } else if (currentState === "default") {
                    newState = "selection-full";
                } else if (currentState === "custom" && mapArea && main) {
                    const defaultHeight = (main.offsetHeight * 0.5) - 9;
                    if (mapArea.offsetHeight > defaultHeight + 10) {
                        newState = "default";
                    } else {
                        newState = "selection-full";
                    }
                }
            } else {
                // Swipe DOWN -> moves drawer DOWN (more map space)
                if (currentState === "selection-full") {
                    newState = "default";
                } else if (currentState === "default") {
                    newState = "map-full";
                } else if (currentState === "custom" && mapArea && main) {
                    const defaultHeight = (main.offsetHeight * 0.5) - 9;
                    if (mapArea.offsetHeight < defaultHeight - 10) {
                        newState = "default";
                    } else {
                        newState = "map-full";
                    }
                }
            }

            if (newState !== currentState) {
                setMobileSnapState(newState, true);
            }
            return;
        }

        // Horizontal swipe to change class tabs
        if (Math.abs(diffX) > 40 && Math.abs(diffY) < 40 && elapsedTime < 300) {
            const header = document.getElementById("sidebar-header");
            const isSearching = header && header.classList.contains("is-searching");

            if (!scrollContainer) return;
            const tabs = Array.from(scrollContainer.querySelectorAll(".sidebar-capsule"));
            if (tabs.length === 0) return;

            if (isSearching) {
                if (diffX > 0) {
                    // Swiped right -> escape search and go to the last class tab
                    const searchClose = document.getElementById("btn-search-close");
                    if (searchClose) {
                        searchClose.click();
                    }
                    const lastTab = tabs[tabs.length - 1];
                    if (lastTab) {
                        lastTab.click();
                        lastTab.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest",
                            inline: "center"
                        });
                    }
                }
                return;
            }

            if (tabs.length <= 1) return;
            const activeIndex = tabs.findIndex(tab => tab.classList.contains("is-active"));
            if (activeIndex === -1) return;

            let newIndex = activeIndex;
            if (diffX < 0) {
                // Swiped left (finger moves right to left) -> next tab
                newIndex = activeIndex + 1;
            } else {
                // Swiped right (finger moves left to right) -> previous tab
                newIndex = activeIndex - 1;
            }

            if (newIndex >= 0 && newIndex < tabs.length) {
                tabs[newIndex].click();
                tabs[newIndex].scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "center"
                });
            } else if (newIndex === tabs.length) {
                const searchToggle = document.getElementById("btn-search-toggle");
                if (searchToggle) {
                    searchToggle.click();
                }
            }
        }
    };

    targets.forEach(el => {
        el.addEventListener("touchstart", handleTouchStart, { passive: true });
        el.addEventListener("touchmove", handleTouchMove, { passive: false });
        el.addEventListener("touchend", handleTouchEnd, { passive: true });
    });
}

export function setupListSwipeBack() {
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;

    let startX = 0;
    let startY = 0;
    let isTracking = false;
    let listWidth = 0;
    let indicatorTimer = null;

    listContainer.addEventListener("touchstart", (e) => {
        if (window.innerWidth > 768) return;
        
        const backBtn = document.getElementById("btn-capsule-back");
        if (!backBtn || !backBtn.classList.contains("is-visible")) {
            isTracking = false;
            return;
        }

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        listWidth = listContainer.offsetWidth;
        isTracking = false;
        
        if (indicatorTimer) {
            clearTimeout(indicatorTimer);
            indicatorTimer = null;
        }
        const indicator = document.getElementById("swipe-back-indicator");
        if (indicator) indicator.classList.remove("is-visible");
        
        listContainer.style.transition = "none";
    }, { passive: true });

    listContainer.addEventListener("touchmove", (e) => {
        if (window.innerWidth > 768) return;
        const touch = e.touches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;

        if (!isTracking) {
            const backBtn = document.getElementById("btn-capsule-back");
            const canGoBack = backBtn && backBtn.classList.contains("is-visible");
            
            if (canGoBack && diffX > 10 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
                isTracking = true;
            }
        }

        if (isTracking) {
            if (e.cancelable) {
                e.preventDefault();
            }
            const translateX = Math.max(0, diffX);
            const opacity = Math.max(0.3, 1 - (translateX / (listWidth || 300)));
            
            listContainer.style.transform = `translateX(${translateX}px)`;
            listContainer.style.opacity = opacity;

            // Show indicator only when dragged 1/4 (25%) of the list width AND held for 0.1s
            const threshold = Math.min(80, listWidth * 0.25);
            const indicator = document.getElementById("swipe-back-indicator");
            if (indicator) {
                if (translateX >= threshold) {
                    if (!indicatorTimer) {
                        indicatorTimer = setTimeout(() => {
                            if (isTracking) {
                                indicator.classList.add("is-visible");
                            }
                        }, 100);
                    }
                } else {
                    if (indicatorTimer) {
                        clearTimeout(indicatorTimer);
                        indicatorTimer = null;
                    }
                    indicator.classList.remove("is-visible");
                }
            }
        }
    }, { passive: false });

    listContainer.addEventListener("touchend", (e) => {
        if (window.innerWidth > 768) return;
        
        if (indicatorTimer) {
            clearTimeout(indicatorTimer);
            indicatorTimer = null;
        }
        const indicator = document.getElementById("swipe-back-indicator");
        if (indicator) indicator.classList.remove("is-visible");

        if (!isTracking) {
            const touch = e.changedTouches[0];
            const diffX = touch.clientX - startX;
            const diffY = touch.clientY - startY;
            // Swiping left (right-to-left) inside feature tiles area -> open search
            if (diffX < -50 && Math.abs(diffX) > Math.abs(diffY) * 1.4 && Math.abs(diffY) < 70) {
                const header = document.getElementById("sidebar-header");
                const isSearching = header && header.classList.contains("is-searching");
                if (!isSearching) {
                    const searchToggle = document.getElementById("btn-search-toggle");
                    if (searchToggle) {
                        searchToggle.click();
                    }
                }
            }
            return;
        }
        isTracking = false;
        
        const touch = e.changedTouches[0];
        const diffX = touch.clientX - startX;
        const threshold = Math.min(80, listWidth * 0.25);

        if (diffX > threshold) {
            // Commit navigation
            listContainer.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
            listContainer.style.transform = "translateX(100%)";
            listContainer.style.opacity = "0";

            setTimeout(() => {
                const backBtn = document.getElementById("btn-capsule-back");
                if (backBtn) {
                    state.isSwipeTransitionActive = true;
                    backBtn.click();
                    state.isSwipeTransitionActive = false;
                }

                // Animate the new content from the left
                listContainer.style.transition = "none";
                listContainer.style.transform = "translateX(-100%)";
                listContainer.style.opacity = "0";

                listContainer.offsetHeight; // force reflow

                listContainer.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
                listContainer.style.transform = "translateX(0)";
                listContainer.style.opacity = "1";

                setTimeout(() => {
                    listContainer.style.transition = "";
                    listContainer.style.transform = "";
                    listContainer.style.opacity = "";
                }, 250);
            }, 200);
        } else {
            // Cancel and bounce back
            listContainer.style.transition = "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)";
            listContainer.style.transform = "translateX(0)";
            listContainer.style.opacity = "1";

            setTimeout(() => {
                listContainer.style.transition = "";
                listContainer.style.transform = "";
                listContainer.style.opacity = "";
            }, 200);
        }
    }, { passive: true });
}

export function setupMobileResizeBar() {
    const resizeBar = document.getElementById("mobile-resize-bar");
    const mapArea = document.querySelector(".maps-tile-map-area");
    const sidebar = document.querySelector(".maps-tile-sidebar");
    const main = document.querySelector(".maps-tile-main");

    if (!resizeBar || !mapArea || !sidebar || !main) return;

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialMapHeight = 0;
    let initialSidebarHeight = 0;
    let isVerticalDragApproved = false;

    const startDrag = (e) => {
        if (window.innerWidth > 768) return;
        
        // Prevent drag initialization when clicking actual buttons or tabs
        if (e.target.closest('.action-btn') || e.target.closest('.sidebar-capsule')) {
            return;
        }

        isDragging = true;
        const touch = e.touches ? e.touches[0] : e;
        dragStartX = touch.clientX;
        dragStartY = touch.clientY;
        
        initialMapHeight = mapArea.offsetHeight;
        initialSidebarHeight = sidebar.offsetHeight;
        
        // If they touched the resize bar directly, vertical drag is approved immediately.
        // Otherwise (selection title or tabs), we wait for a gesture direction threshold.
        const isResizeBar = e.currentTarget === resizeBar;
        isVerticalDragApproved = isResizeBar;

        document.body.style.userSelect = "none";
        document.body.style.cursor = "ns-resize";
        mapArea.style.setProperty("transition", "none", "important");
        sidebar.style.setProperty("transition", "none", "important");
    };

    const doDrag = (e) => {
        if (!isDragging || window.innerWidth > 768) return;

        const touch = e.touches ? e.touches[0] : e;
        const clientX = touch.clientX;
        const clientY = touch.clientY;

        const deltaX = clientX - dragStartX;
        const deltaY = clientY - dragStartY;

        // If not yet approved, check threshold
        if (!isVerticalDragApproved) {
            if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX) * 1.3) {
                isVerticalDragApproved = true;
                // Reset dragStartY to current touch point to avoid a jump
                dragStartY = clientY;
                return;
            }
            if (Math.abs(deltaX) > 8) {
                // If it is a clear horizontal gesture, cancel vertical dragging to let horizontal scroll work
                isDragging = false;
                return;
            }
            return;
        }

        // Prevent browser scrolling while dragging vertical drawer
        if (e.cancelable) {
            e.preventDefault();
        }

        const headerEl = document.querySelector(".maps-tile-header");
        const sidebarHeaderEl = document.getElementById("sidebar-header");
        if (!headerEl || !sidebarHeaderEl) return;

        const mainRect = main.getBoundingClientRect();

        // Calculate new map height relative to dragStartY
        const currentDeltaY = clientY - dragStartY;
        const targetMapHeight = initialMapHeight + currentDeltaY;
        
        const headerHeight = headerEl.offsetHeight || 80;
        const subHeaderHeight = sidebarHeaderEl.offsetHeight || 50;
        const totalHeaderHeight = headerHeight + subHeaderHeight;
        const resizeBarHeight = resizeBar.offsetHeight || 18;

        const maxMapHeight = mainRect.height - totalHeaderHeight - resizeBarHeight;
        const clampedMapHeight = Math.max(0, Math.min(maxMapHeight, targetMapHeight));

        let mapPercentage = (clampedMapHeight / mainRect.height) * 100;
        let sidebarPercentage = ((mainRect.height - clampedMapHeight - resizeBarHeight) / mainRect.height) * 100;

        if (mapPercentage < 5) {
            mapArea.style.setProperty("height", "0px", "important");
            sidebar.style.setProperty("height", `calc(100% - ${resizeBarHeight}px)`, "important");
            sidebar.classList.add("is-selection-full");
            document.body.classList.add("is-selection-full");
            state.snapState = "selection-full";
        } else if (clampedMapHeight >= maxMapHeight - 15) {
            sidebar.style.setProperty("height", `${totalHeaderHeight}px`, "important");
            mapArea.style.setProperty("height", `calc(100% - ${totalHeaderHeight + resizeBarHeight}px)`, "important");
            sidebar.classList.remove("is-selection-full");
            document.body.classList.remove("is-selection-full");
            state.snapState = "map-full";
        } else {
            mapArea.style.setProperty("height", `${mapPercentage.toFixed(2)}%`, "important");
            sidebar.style.setProperty("height", `${sidebarPercentage.toFixed(2)}%`, "important");
            sidebar.classList.remove("is-selection-full");
            document.body.classList.remove("is-selection-full");
            state.snapState = "custom";
        }

        // Live update bottom nav bar visibility during vertical drag
        updateBottomNavVisibilityForSnapState(state.snapState);

        if (state.map) {
            state.map.resize();
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
                state.map.resize();
            }
        }
    };

    // Attach startDrag to all mobile resize triggers
    const headerEl = document.querySelector(".maps-tile-header");
    const sidebarHeaderEl = document.getElementById("sidebar-header");

    const triggers = [resizeBar, headerEl, sidebarHeaderEl].filter(Boolean);
    triggers.forEach(el => {
        el.addEventListener("mousedown", startDrag);
        el.addEventListener("touchstart", startDrag, { passive: true });
    });

    window.addEventListener("mousemove", doDrag);
    window.addEventListener("touchmove", doDrag, { passive: false });

    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchend", stopDrag);

    // On mobile, default to 50/50 split view instead of large-map view
    if (window.innerWidth <= 768) {
        setMobileSnapState("default", false);
    }
}

