import { state } from '../state.js';
import { showToast } from './toast-view.js';
import { closeAllModals, closeAvenzaModal, closeAllAppsModal } from './modal-view.js';
import { launchAppWithStoreFallback } from './avenza-modal-view.js';
import { getSelectedGeoJSONData } from '../services/bird-data-service.js';
import { renderMapLayoutCanvas, downloadGeoPdf, downloadGeoTiff, preloadMapLayout, getOrRenderLayoutCanvas, disposeRasterCache, scheduleDownloadViewPreload, cancelDownloadViewPreload } from '../map/map-rendering.js';
import { setupSuggestFormAndDrawing } from './feedback-form.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { handleSpatialFileShare } from '../services/file-download-service.js';
import { getDownloadFilename } from '../services/download-file-names.js';
import { setupDownloadAppSearch, updateShareModalDescription } from './suggested-app-controls.js';
import { getShareQrCodeImageUrl } from '../services/qr-image-service.js';

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

export function setupSpatialDownloadButtons({
    shareFile = handleSpatialFileShare,
    notify = showToast,
    downloadPdf = button => downloadGeoPdf(getActiveDownloadFilename("pdf"), button),
    downloadTiff = button => downloadGeoTiff(getActiveDownloadFilename("tif"), button)
} = {}) {
    const geojsonBtn = document.getElementById("download-geojson");
    if (geojsonBtn) {
        geojsonBtn.addEventListener("click", async (event) => {
            const geojson = getSelectedGeoJSONData();
            const filename = getActiveDownloadFilename("geojson");
            const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
            await shareFile(event, blob, filename, geojsonBtn);
            notify(`Exported ${filename}`);
        });
    }

    const kmzBtn = document.getElementById("download-kmz");
    if (kmzBtn) {
        kmzBtn.addEventListener("click", async (event) => {
            const geojson = getSelectedGeoJSONData();
            const filename = getActiveDownloadFilename("kmz");
            const kmlStr = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ""));
            let blob;
            if (typeof JSZip !== "undefined") {
                const zip = new JSZip();
                zip.file("doc.kml", kmlStr);
                blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });
            } else {
                blob = new Blob([kmlStr], { type: "application/vnd.google-earth.kml+xml" });
            }
            await shareFile(event, blob, filename, kmzBtn);
            notify(`Exported ${filename}`);
        });
    }

    const gpxBtn = document.getElementById("download-gpx");
    if (gpxBtn) {
        gpxBtn.addEventListener("click", async (event) => {
            const geojson = getSelectedGeoJSONData();
            const filename = getActiveDownloadFilename("gpx");
            const gpxStr = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ""));
            const blob = new Blob([gpxStr], { type: "application/gpx+xml" });
            await shareFile(event, blob, filename, gpxBtn);
            notify(`Exported ${filename}`);
        });
    }

    const geopdfBtn = document.getElementById("download-geopdf");
    if (geopdfBtn) {
        geopdfBtn.addEventListener("click", async () => downloadPdf(geopdfBtn));
    }

    const geotiffBtn = document.getElementById("download-geotiff");
    if (geotiffBtn) {
        geotiffBtn.addEventListener("click", async () => downloadTiff(geotiffBtn));
    }
}

export async function generateAppSpatialBlob(formatKey) {
  const geojson = getSelectedGeoJSONData();
  const filename = getActiveDownloadFilename(formatKey === "geopdf" ? "pdf" : formatKey);

  if (formatKey === "geopdf") {
    const canvas = await getOrRenderLayoutCanvas({
        features: state.allFeatures,
        targetFeatureId: state.currentId,
        currentFeature: state.currentFeature,
        isCirclesFeature: state.isCirclesFeature
    });
    if (window.jspdf && window.jspdf.jsPDF) {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
      });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(imgData, "JPEG", 0, 0, 297, 210);
      pdf.setProperties({
        title: filename.replace(/\.pdf$/, ""),
        subject: "GeoPDF Map Layout Export - Esri Topo Basemap",
        creator: "Fovea Web Map Layout Engine"
      });
      return { blob: pdf.output("blob"), filename };
    } else {
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve({ blob, filename: filename.replace(/\.pdf$/, "-layout.png") });
        }, "image/png");
      });
    }
  } else if (formatKey === "geotiff" || formatKey === "tif") {
    const canvas = await getOrRenderLayoutCanvas({
        features: state.allFeatures,
        targetFeatureId: state.currentId,
        currentFeature: state.currentFeature,
        isCirclesFeature: state.isCirclesFeature
    });
    const tiffBlob = canvasToTiffBlob(canvas);
    return { blob: tiffBlob, filename: getActiveDownloadFilename("tif") };
  } else if (formatKey === "gpx") {
    const gpxStr = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ""));
    const blob = new Blob([gpxStr], { type: "application/gpx+xml" });
    return { blob, filename: filename.endsWith(".gpx") ? filename : `${filename}.gpx` };
  } else if (formatKey === "kmz") {
    const kmlStr = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ""));
    if (typeof JSZip !== "undefined") {
      const zip = new JSZip();
      zip.file("doc.kml", kmlStr);
      const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });
      return { blob, filename };
    } else {
      const blob = new Blob([kmlStr], { type: "application/vnd.google-earth.kml+xml" });
      return { blob, filename: filename.replace(/\.kmz$/i, ".kml") };
    }
  } else {
    // Default GeoJSON
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    return { blob, filename };
  }
}

export function toggleFullscreen() {
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

    const handleModalReparenting = () => {
        const mapWrapper = document.getElementById("map-wrapper") || document.querySelector(".maps-tile-map-area");
        const actionsRow = document.querySelector(".maps-tile-header__actions");
        const modals = [downloadModal, copyModal, helpModal, suggestModal];

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
