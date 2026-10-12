import { MAP_HELP_CONTENT } from '../config/map-help-content.js';
import { updateKeyboardTileFocus } from './sidebar-list.js';
import { showToast } from './toast-view.js';
import { state } from '../state.js';
import { toggleFullscreen, performDirectCopyLink } from './toolbar-actions.js';
import { selectMapStyleByIndex } from '../map/map-layers.js';
import { setupMapKeyboardShortcuts } from './map-keyboard-shortcuts.js';
import { resolveHelpTarget, tagHelpElements } from './map-help-targets.js';
import { hideHelpTooltip, highlightHelpTarget, positionHelpTooltipAtPointer, positionHelpTooltipAtTarget, renderHelpTooltip } from './map-help-tooltip-view.js';

export function setupHelpModeSystem({ renderSidebarList = () => {} } = {}) {
    const toggleInput = document.getElementById("toggle-help-mode");
    const tooltip = document.getElementById("help-mode-tooltip");
    const highlight = document.getElementById("help-mode-highlight");

    const setHelpMode = (active, isFromKey = false) => {
        state.isHelpModeActive = active;
        if (toggleInput) toggleInput.checked = active;
        if (active) {
            document.body.classList.add("is-help-mode-active");
            tagHelpElements(MAP_HELP_CONTENT, document);
            if (isFromKey) showToast("Interactive Help Mode: Enabled");
        } else {
            document.body.classList.remove("is-help-mode-active");
            hideHelpTooltip(tooltip, highlight);
            if (isFromKey) showToast("Interactive Help Mode: Disabled");
        }
        if (window.updateActionButtonsState) window.updateActionButtonsState();
    };

    if (toggleInput) {
        toggleInput.addEventListener("change", (e) => {
            setHelpMode(e.target.checked, false);
        });
    }

    const docLink = document.querySelector(".help-doc-link");
    if (docLink) {
        docLink.addEventListener("click", (e) => {
            e.preventDefault();
            showToast("Documentation not available (coming soon)");
        });
    }

    setupMapKeyboardShortcuts({
        state,
        documentObject: document,
        renderSidebarList,
        setHelpMode,
        updateKeyboardFocus: updateKeyboardTileFocus,
        onToggleFullscreen: toggleFullscreen,
        onCopyLink: performDirectCopyLink,
        onSelectMapStyle: selectMapStyleByIndex
    });

    tagHelpElements(MAP_HELP_CONTENT, document);

    const observer = new MutationObserver(() => {
        if (state.isHelpModeActive) {
            tagHelpElements(MAP_HELP_CONTENT, document);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const isTouchDevice = () => {
        return window.matchMedia("(pointer: coarse)").matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0) || window.innerWidth <= 768;
    };

    document.addEventListener("mousemove", (e) => {
        if (!state.isHelpModeActive || isTouchDevice()) return;

        const { target, title, desc, shortcut } = resolveHelpTarget(e.target, MAP_HELP_CONTENT);
        if (target) {
            renderHelpTooltip(tooltip, { title, desc, shortcut });
            positionHelpTooltipAtPointer(tooltip, e, window);

            highlightHelpTarget(highlight, target);
        } else {
            hideHelpTooltip(tooltip, highlight);
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

        const { target, title, desc, shortcut } = resolveHelpTarget(e.target, MAP_HELP_CONTENT);
        if (target) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            renderHelpTooltip(tooltip, { title, desc, shortcut });
            positionHelpTooltipAtTarget(tooltip, target, window);

            highlightHelpTarget(highlight, target);
        }
    };

    document.addEventListener("click", handleHelpClick, true);
}
