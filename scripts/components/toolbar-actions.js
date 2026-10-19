import { state } from '../state.js';
import { showToast } from './toast-view.js';
import { closeAllModals, closeAvenzaModal, closeAllAppsModal } from './modal-view.js';
import { launchAppWithStoreFallback } from './avenza-modal-view.js';
import { downloadGeoPdf, downloadGeoTiff, getOrRenderLayoutCanvas, scheduleDownloadViewPreload, cancelDownloadViewPreload } from '../map/map-rendering.js';
import { getSelectedGeoJSONData } from '../services/bird-data-service.js';
import { geojsonToGpx, geojsonToKml, canvasToTiffBlob } from '../services/format-converters.js';
import { setupSuggestFormAndDrawing } from './feedback-form.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { handleSpatialFileShare } from '../services/file-download-service.js';
import { getDownloadFilename } from '../services/download-file-names.js';
import { setupDownloadAppSearch, updateShareModalDescription } from './suggested-app-controls.js';
import { getShareQrCodeImageUrl } from '../services/qr-image-service.js';
import { setupMapToolbarModalLayout } from './map-toolbar-modal-layout.js';
import { createToolbarDownloadActions } from './toolbar-download-actions.js';
import { toggleMapFullscreen } from '../map/map-viewport.js';

export {
    MAP_VIEWER_APPS,
    setupSuggestedAppCards,
    setupDownloadAppSearch,
    updateAllAppsModalHeaderTitle,
    updateShareModalDescription
} from './suggested-app-controls.js';

export function getActiveDownloadFilename(ext) {
    return getDownloadFilename({
        currentFeature: state.currentFeature,
        currentId: state.currentId,
        circleId: CIRCLE_ID
    }, ext);
}

const toolbarDownloadActions = createToolbarDownloadActions({
    state,
    getSelectedGeoJSONData,
    getFilename: getActiveDownloadFilename,
    renderLayout: getOrRenderLayoutCanvas,
    downloadPdf: button => downloadGeoPdf(getActiveDownloadFilename('pdf'), button),
    downloadTiff: button => downloadGeoTiff(getActiveDownloadFilename('tif'), button),
    convertCanvasToTiff: canvasToTiffBlob,
    shareFile: handleSpatialFileShare,
    notify: showToast,
    geojsonToGpx,
    geojsonToKml
});
export const { setupSpatialDownloadButtons, generateAppSpatialBlob } = toolbarDownloadActions;

export function toggleFullscreen() {
    return toggleMapFullscreen({ state, documentObject: document, windowObject: window, schedule: setTimeout });
}

export function setupActionButtons({
    shareFile = handleSpatialFileShare,
    openSuggestedApp = () => {},
    notify = showToast,
    downloadPdf = button => downloadGeoPdf(getActiveDownloadFilename("pdf"), button),
    downloadTiff = button => downloadGeoTiff(getActiveDownloadFilename("tif"), button),
    closeModals = closeAllModals
} = {}) {
    const closeAllModals = closeModals;
    const downloadModal = document.getElementById("downloads-modal");
    const copyModal = document.getElementById("copy-link-modal");
    const helpModal = document.getElementById("help-modal");
    const suggestModal = document.getElementById("suggest-modal");
    const downloadBtn = document.getElementById("btn-download-files");
    const copyBtn = document.getElementById("btn-copy-link");
    const helpBtn = document.getElementById("btn-help");
    const suggestBtn = document.getElementById("btn-suggest");

    setupMapToolbarModalLayout({
        modals: [downloadModal, copyModal, helpModal, suggestModal]
    });

    window.transitionToPage = function(dest) {
        const overlay = document.getElementById("page-transition-overlay");
        if (overlay) {
            overlay.classList.remove("is-loaded");
            overlay.classList.add("is-active");
            setTimeout(() => {
                window.location.href = dest;
            }, 500);
        } else {
            window.location.href = dest;
        }
    };

    const toolbar = document.querySelector(".maps-tile-header__actions");
    if (toolbar) {
        const threshold = 140; // px — proximity threshold distance
        window.addEventListener("mousemove", (e) => {
            const rect = toolbar.getBoundingClientRect();
            
            // Calculate relative mouse coordinates inside toolbar coordinate space
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Calculate shortest distance from cursor to toolbar bounding box
            const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
            const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
            const dist = Math.sqrt(dx * dx + dy * dy);

            toolbar.style.setProperty("--mouse-x", `${x}px`);
            toolbar.style.setProperty("--mouse-y", `${y}px`);

            // Compute proximity opacity (1.0 inside toolbar, tapering down to 0.0 at threshold distance)
            let opacity = 0;
            if (dist <= threshold) {
                opacity = Math.pow(1 - dist / threshold, 1.2);
            }

            toolbar.style.setProperty("--glow-opacity", opacity.toFixed(3));
        });
    }

    window.updateActionButtonsState = () => {
        const isDownloadOpen = downloadModal && downloadModal.getAttribute("aria-hidden") === "false";
        const isCopyOpen = copyModal && copyModal.getAttribute("aria-hidden") === "false";
        const isHelpOpen = helpModal && helpModal.getAttribute("aria-hidden") === "false";
        const isSuggestOpen = suggestModal && suggestModal.getAttribute("aria-hidden") === "false";

        if (downloadBtn) downloadBtn.classList.toggle("is-active", !!isDownloadOpen);
        if (copyBtn) copyBtn.classList.toggle("is-active", !!isCopyOpen);
        if (helpBtn) helpBtn.classList.toggle("is-active", !!isHelpOpen);
        if (suggestBtn) suggestBtn.classList.toggle("is-active", !!isSuggestOpen);

        if (isDownloadOpen || isCopyOpen || isHelpOpen || isSuggestOpen) {
            document.body.classList.add("has-active-modal");
        } else {
            document.body.classList.remove("has-active-modal");
        }
    };



    const avenzaModal = document.getElementById("avenza-instruction-modal");
    const avenzaContinueBtn = document.getElementById("btn-avenza-continue");
    const avenzaDownloadBtn = document.getElementById("avenza-modal-download-btn");

    if (avenzaDownloadBtn) {
        avenzaDownloadBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (avenzaDownloadBtn.classList.contains("is-preparing")) return;

            let blob = window._pendingAppBlob || window._pendingAvenzaBlob;
            let filename = window._pendingAppFilename || window._pendingAvenzaFilename || "map.pdf";
            let formatKey = window._pendingAppFormatKey || "geopdf";

            if (!(blob instanceof Blob)) {
                if (typeof showToast === "function") showToast("Rendering map layout...");
                avenzaDownloadBtn.classList.add("is-preparing");
                const originalHtml = avenzaDownloadBtn.innerHTML;
                avenzaDownloadBtn.innerHTML = `
                    <svg class="spin-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="2" x2="12" y2="6"></line>
                        <line x1="12" y1="18" x2="12" y2="22"></line>
                        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                        <line x1="2" y1="12" x2="6" y2="12"></line>
                        <line x1="18" y1="12" x2="22" y2="12"></line>
                        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                    </svg>
                    <span>Preparing...</span>
                `;

                try {
                    if (window._pendingAppBlobPromise) {
                        const res = await window._pendingAppBlobPromise;
                        blob = res.blob;
                        if (res.filename) filename = res.filename;
                    } else {
                        const { blob: generatedBlob, filename: genFilename } = await generateAppSpatialBlob(formatKey);
                        blob = generatedBlob;
                        if (genFilename) filename = genFilename;
                    }
                    window._pendingAppBlob = blob;
                    window._pendingAppFilename = filename;
                } catch (err) {
                    console.error("Error generating map download:", err);
                    if (typeof showToast === "function") showToast("Error generating download file.");
                    avenzaDownloadBtn.classList.remove("is-preparing");
                    avenzaDownloadBtn.innerHTML = originalHtml;
                    return;
                }
                avenzaDownloadBtn.classList.remove("is-preparing");
            }

            const downloadBlob = new Blob([blob], { type: "application/octet-stream" });
            const url = URL.createObjectURL(downloadBlob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = filename;
            a.addEventListener("click", (e) => e.stopPropagation());
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            avenzaDownloadBtn.classList.add("is-downloaded");
            avenzaDownloadBtn.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Downloaded</span>
            `;
            if (typeof showToast === "function") showToast(`Downloaded ${filename}`);
        });
    }


    if (avenzaContinueBtn && avenzaModal) {
        avenzaContinueBtn.addEventListener("click", () => {
            // Launch target app directly with App Store fallback if app is not installed
            const scheme = window._pendingAppScheme || "avenzamaps://";
            const appKey = window._pendingAppKey || "avenza";
            launchAppWithStoreFallback(scheme, appKey);
        });
    }

    // Bind data-modal-close listeners across all modals (including avenza-instruction-modal)
    document.querySelectorAll("[data-modal-close]").forEach(closeEl => {
        closeEl.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const parentModal = closeEl.closest(".maps-tile-modal, .avenza-instruction-modal");
            if (parentModal && parentModal.id === "avenza-instruction-modal") {
                closeAvenzaModal();
            } else if (parentModal && parentModal.id === "all-apps-modal") {
                closeAllAppsModal();
            } else {
                closeAllModals();
            }
        });
    });

    const handleToolsClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget) e.currentTarget.blur();
        if (window.transitionToPage) {
            window.transitionToPage("../tools/");
        } else {
            window.location.href = "../tools/";
        }
    };

    const handleSettingsClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget) e.currentTarget.blur();
        if (window.transitionToPage) {
            window.transitionToPage("../settings/");
        } else {
            window.location.href = "../settings/";
        }
    };

    ["desktop-nav-tab-tools", "mobile-nav-tab-tools"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", handleToolsClick);
    });

    ["desktop-nav-tab-settings", "mobile-nav-tab-settings"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", handleSettingsClick);
    });

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
                updateShareModalDescription();
                const currentUrl = window.location.href;
                if (copyInput) copyInput.value = currentUrl.replace(/^(https?:\/\/)/i, "");
                const qrImg = document.getElementById("copy-link-qr-code");
                if (qrImg) {
                    const qrWrapper = qrImg.parentElement;
                    if (qrWrapper) {
                        qrWrapper.classList.add("loading");
                    }
                    qrImg.style.opacity = "0";
                    qrImg.onload = () => {
                        if (qrWrapper) qrWrapper.classList.remove("loading");
                        qrImg.style.opacity = "1";
                    };
                    qrImg.onerror = () => {
                        if (qrWrapper) qrWrapper.classList.remove("loading");
                        qrImg.style.opacity = "0.3";
                    };
                    const isLightMode = document.body.classList.contains("theme-light") || (document.documentElement.getAttribute("data-theme") === "light");
                    const qrColor = isLightMode ? "000000" : "b8b8b8";
                    qrImg.src = getShareQrCodeImageUrl(currentUrl, { darkColor: qrColor });
                }
                copyModal.setAttribute("aria-hidden", "false");
                copyModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        if (copyActionBtn && copyInput) {
            copyActionBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(window.location.href);
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
        setupDownloadAppSearch({ onOpenApp: openSuggestedApp });
        downloadBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = downloadModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                downloadModal.setAttribute("aria-hidden", "false");
                downloadModal.classList.add("is-open");
                // Wait 0.5s after user clicks downloads view button before beginning preemptive rendering
                scheduleDownloadViewPreload();
            } else {
                cancelDownloadViewPreload();
            }
            window.updateActionButtonsState();
        });

        downloadModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                cancelDownloadViewPreload();
                closeAllModals();
            });
        });

        setupSpatialDownloadButtons({ shareFile, notify, downloadPdf, downloadTiff });

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

    if (suggestBtn && suggestModal) {
        suggestBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = suggestModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                suggestModal.setAttribute("aria-hidden", "false");
                suggestModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        suggestModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                if (closeEl.classList.contains("modal__backdrop") && document.body.classList.contains("is-suggest-locked")) {
                    return;
                }
                closeAllModals();
            });
        });
    }

    document.addEventListener("click", (e) => {
        if (!e.isTrusted) return;
        if (e.target && (e.target.tagName === "A" || e.target.closest("a[download]"))) return;
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
            if (suggestModal && suggestModal.getAttribute("aria-hidden") === "false") {
                if (!suggestModal.contains(e.target) && !suggestBtn.contains(e.target)
                    && !document.body.classList.contains("is-annotation-mode")
                    && !document.body.classList.contains("is-suggest-locked")
                    && !window._preventSuggestClose) {
                    closeAllModals();
                }
            }
        }
    });

    setupSuggestFormAndDrawing(closeAllModals);
}

export async function performDirectCopyLink() {
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

export { setupViewToggleMenu } from './header-view-toggle.js';
