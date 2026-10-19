import { state } from '../state.js';
import { setMobileSnapState, updateBottomNavVisibilityForSnapState } from './mobile-snap-state.js';

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
