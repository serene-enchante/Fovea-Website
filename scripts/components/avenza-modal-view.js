import { state } from '../state.js';
import { generateAppSpatialBlob } from './toolbar-actions.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { getAppStoreUrl, launchAppWithStoreFallback } from '../services/app-launch-service.js';
import { resolveAppInstructionConfig } from '../services/app-instruction-config.js';
import { getAppSelectionTitle, getSelectionThumbnail } from '../map/app-selection-presentation.js';

export { getAppStoreUrl, launchAppWithStoreFallback };


/**
 * Dynamically updates the Avenza modal title to match selection type (Zones vs Circles).
 */
export function updateAvenzaModalHeaderTitle(targetAppName = "Avenza Maps") {
  const modalTitleEl = document.getElementById("avenza-modal-title");
  if (!modalTitleEl) return;
  const title = getAppSelectionTitle({ ...state, features: state.allFeatures, circleId: CIRCLE_ID });
  modalTitleEl.innerHTML = title.circleName
    ? `Import <span class="avenza-target-name">${title.targetName}</span> of the <span class="avenza-target-name">${title.circleName}</span> into ${targetAppName}`
    : `Import the <span class="avenza-target-name">${title.targetName}</span> into ${targetAppName}`;
}


/**
 * Returns count circle thumbnail/logo for the current selection (matching top-left header logo).
 */
export function getActiveSelectionThumbnail() {
  return getSelectionThumbnail(state);
}


/**
 * Opens the blackout instruction modal dynamically configured for any app (Avenza, Gaia GPS, CalTopo, OsmAnd).
 */
export async function openAppInstructionModal(appKeyOrName, mapFileUrlOrBlob = null, filename = null, triggerCard = null) {
  const { config, normalizedKey: normKey } = resolveAppInstructionConfig(appKeyOrName);

  let blobPromise = null;
  if (mapFileUrlOrBlob instanceof Blob) {
    blobPromise = Promise.resolve({ blob: mapFileUrlOrBlob, filename: filename || `map.${config.ext}` });
    window._pendingAppBlob = mapFileUrlOrBlob;
  } else {
    window._pendingAppBlob = null;
    blobPromise = generateAppSpatialBlob(config.formatKey);
  }

  const finalFilename = filename || `map.${config.ext}`;
  window._pendingAppBlobPromise = blobPromise;
  window._pendingAppFilename = finalFilename;
  window._pendingAppScheme = config.scheme;
  window._pendingAppFormatKey = config.formatKey;
  window._pendingAppKey = config.appKey || normKey;

  // Background resolution
  blobPromise.then(res => {
    window._pendingAppBlob = res.blob;
    if (res.filename) window._pendingAppFilename = res.filename;
  }).catch(err => {
    console.error("Background map generation error:", err);
  });

  const appIconEl = document.getElementById("avenza-modal-app-icon");
  if (appIconEl) {
    appIconEl.src = config.iconSrc;
    appIconEl.alt = config.appName;
  }

  updateAvenzaModalHeaderTitle(config.appName);

  const selectionThumbEl = document.getElementById("avenza-selection-thumb");
  if (selectionThumbEl) selectionThumbEl.src = getActiveSelectionThumbnail();

  const step1Heading = document.getElementById("avenza-step1-heading");
  if (step1Heading) step1Heading.textContent = config.step1Heading;

  const downloadBtn = document.getElementById("avenza-modal-download-btn");
  if (downloadBtn) {
    downloadBtn.classList.remove("is-downloaded", "is-preparing");
    downloadBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Download</span>
    `;
  }

  const step2Heading = document.getElementById("avenza-step2-heading");
  if (step2Heading) step2Heading.textContent = config.step2Heading;

  const step2Text = document.getElementById("avenza-step2-text");
  if (step2Text) step2Text.innerHTML = config.step2Text;

  const step3Heading = document.getElementById("avenza-step3-heading");
  if (step3Heading) step3Heading.textContent = config.step3Heading;

  const step3Text = document.getElementById("avenza-step3-text");
  if (step3Text) step3Text.innerHTML = config.step3Text;

  const continueBtn = document.getElementById("btn-avenza-continue");
  if (continueBtn) {
    const continueSpan = continueBtn.querySelector("span");
    if (continueSpan) continueSpan.textContent = config.continueBtnText;
  }

  const avenzaModal = document.getElementById("avenza-instruction-modal");
  if (avenzaModal) {
    avenzaModal.setAttribute("aria-hidden", "false");
    avenzaModal.classList.add("is-open");
    document.body.classList.add("has-active-modal", "has-avenza-modal");

    const bottomNav = document.querySelector(".mobile-bottom-nav-container");
    if (bottomNav) {
      bottomNav.classList.add("is-hidden-entirely");
      bottomNav.style.setProperty("display", "none", "important");
    }
  }
}


/**
 * Direct Avenza Maps Deep Link Importer (Legacy Wrapper)
 */
export async function openInAvenzaWithFallback(mapFileUrlOrBlob, filename, triggerCard = null) {
  await openAppInstructionModal("Avenza Maps", mapFileUrlOrBlob, filename, triggerCard);
}


/**
 * Executes direct app handshake for Suggested Apps (Avenza, Gaia GPS, CalTopo, OsmAnd).
 */
export async function handleAppDirectOpen(appName, triggerCard = null) {
  try {
    await openAppInstructionModal(appName, null, null, triggerCard);
  } catch (err) {
    if (typeof showToast === "function") {
      showToast(`Could not open instructions for ${appName}`);
    }
  }
}
