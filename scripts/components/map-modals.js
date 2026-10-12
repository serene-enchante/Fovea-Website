import { MAP_HELP_CONTENT } from '../config/map-help-content.js';
import { setupMapKeyboardShortcuts } from './map-keyboard-shortcuts.js';
import { resolveHelpTarget, tagHelpElements } from './map-help-targets.js';
import { hideHelpTooltip, highlightHelpTarget, positionHelpTooltipAtPointer, positionHelpTooltipAtTarget, renderHelpTooltip } from './map-help-tooltip-view.js';

export function setupHelpModeSystem({
    state,
    renderSidebarList = () => {},
    updateKeyboardFocus = () => {},
    onToggleFullscreen = () => {},
    onCopyLink = () => {},
    onSelectMapStyle = () => {},
    notify = () => {},
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    navigatorObject = globalThis.navigator,
    MutationObserverClass = globalThis.MutationObserver
} = {}) {
    const toggleInput = documentObject.getElementById("toggle-help-mode");
    const tooltip = documentObject.getElementById("help-mode-tooltip");
    const highlight = documentObject.getElementById("help-mode-highlight");

    const setHelpMode = (active, isFromKey = false) => {
        state.isHelpModeActive = active;
        if (toggleInput) toggleInput.checked = active;
        if (active) {
            documentObject.body.classList.add("is-help-mode-active");
            tagHelpElements(MAP_HELP_CONTENT, documentObject);
            if (isFromKey) notify("Interactive Help Mode: Enabled");
        } else {
            documentObject.body.classList.remove("is-help-mode-active");
            hideHelpTooltip(tooltip, highlight);
            if (isFromKey) notify("Interactive Help Mode: Disabled");
        }
        if (windowObject.updateActionButtonsState) windowObject.updateActionButtonsState();
    };

    if (toggleInput) {
        toggleInput.addEventListener("change", (e) => {
            setHelpMode(e.target.checked, false);
        });
    }

    const docLink = documentObject.querySelector(".help-doc-link");
    if (docLink) {
        docLink.addEventListener("click", (e) => {
            e.preventDefault();
            notify("Documentation not available (coming soon)");
        });
    }

    setupMapKeyboardShortcuts({
        state,
        documentObject,
        renderSidebarList,
        setHelpMode,
        updateKeyboardFocus,
        onToggleFullscreen,
        onCopyLink,
        onSelectMapStyle
    });

    tagHelpElements(MAP_HELP_CONTENT, documentObject);

    const observer = new MutationObserverClass(() => {
        if (state.isHelpModeActive) {
            tagHelpElements(MAP_HELP_CONTENT, documentObject);
        }
    });
    observer.observe(documentObject.body, { childList: true, subtree: true });

    const isTouchDevice = () => {
        return windowObject.matchMedia("(pointer: coarse)").matches || ('ontouchstart' in windowObject && navigatorObject.maxTouchPoints > 0) || windowObject.innerWidth <= 768;
    };

    documentObject.addEventListener("mousemove", (e) => {
        if (!state.isHelpModeActive || isTouchDevice()) return;

        const { target, title, desc, shortcut } = resolveHelpTarget(e.target, MAP_HELP_CONTENT);
        if (target) {
            renderHelpTooltip(tooltip, { title, desc, shortcut });
            positionHelpTooltipAtPointer(tooltip, e, windowObject);

            highlightHelpTarget(highlight, target);
        } else {
            hideHelpTooltip(tooltip, highlight);
        }
    });

    const mobileExitBtn = documentObject.getElementById("mobile-help-exit-btn");
    if (mobileExitBtn) {
        mobileExitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            setHelpMode(false, false);
        });
    }

    const handleHelpClick = (e) => {
        if (!state.isHelpModeActive || !isTouchDevice()) return;

        const helpModal = documentObject.getElementById("help-modal");
        if (helpModal && helpModal.contains(e.target)) return;
        if (mobileExitBtn && mobileExitBtn.contains(e.target)) return;

        const { target, title, desc, shortcut } = resolveHelpTarget(e.target, MAP_HELP_CONTENT);
        if (target) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            renderHelpTooltip(tooltip, { title, desc, shortcut });
            positionHelpTooltipAtTarget(tooltip, target, windowObject);

            highlightHelpTarget(highlight, target);
        }
    };

    documentObject.addEventListener("click", handleHelpClick, true);
}
