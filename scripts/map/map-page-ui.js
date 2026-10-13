import { setupSearch } from './map-search.js';
import { setupSidebarCapsuleEvents } from '../components/sidebar-capsule-events.js';
import { setupImageLightbox } from '../components/image-lightbox.js';
import { setupHelpModeSystem } from '../components/map-modals.js';
import { setupMobileBottomNav } from '../components/bottom-nav-view.js';
import { setupActionButtons as setupToolbarActionButtons, setupViewToggleMenu, performDirectCopyLink } from '../components/toolbar-actions.js';
import { handleAppDirectOpen } from '../components/avenza-modal-view.js';
import { closeAllModals as closeModalsView } from '../components/modal-view.js';
import { cancelDownloadViewPreload } from './map-rendering.js';
import { setMobileSnapState, setupListSwipeBack, setupMobileResizeBar, setupSwipeNavigation } from '../components/mobile-view.js';
import { setupSidebarScrollListener } from '../components/sidebar-list.js';
import { selectMapStyleByIndex } from './map-layers.js';

export function setupMapPageUi({
    state,
    renderSidebarList,
    updateKeyboardFocus,
    onToggleFullscreen,
    notify,
    shareFile,
    downloadPdf,
    downloadTiff,
    documentObject = globalThis.document,
    windowObject = globalThis.window,
    navigatorObject = globalThis.navigator,
    MutationObserverClass = globalThis.MutationObserver
}) {
    setupToolbarActionButtons({
        shareFile,
        openSuggestedApp: handleAppDirectOpen,
        notify,
        downloadPdf,
        downloadTiff,
        closeModals: () => closeModalsView({ onBeforeClose: cancelDownloadViewPreload })
    });
    setupSearch({ state, documentObject, windowObject, setMobileSnapState });
    setupSidebarCapsuleEvents({ state, documentObject, onRender: renderSidebarList, notify });
    setupSwipeNavigation();
    setupListSwipeBack();
    setupImageLightbox();
    setupMobileResizeBar();
    setupHelpModeSystem({
        state,
        renderSidebarList,
        updateKeyboardFocus,
        onToggleFullscreen,
        onCopyLink: performDirectCopyLink,
        onSelectMapStyle: selectMapStyleByIndex,
        notify,
        documentObject,
        windowObject,
        navigatorObject,
        MutationObserverClass
    });
    setupSidebarScrollListener();
    setupMobileBottomNav();
    setupViewToggleMenu();
}
