import { state } from '../state.js';
import { generateAppSpatialBlob } from './toolbar-actions.js';
import { normalizeZoneId, displayZoneId } from '../utils/format-utils.js';
import { APP_INSTRUCTION_CONFIGS, CIRCLE_ID } from '../config/app-config.js';


/**
 * Resolves App Store (iOS) or Google Play Store (Android) URL for a given app.
 */
export function getAppStoreUrl(appKey) {
  const normKey = String(appKey).toLowerCase().replace(/[^a-z]/g, "");
  const isAndroid = /android/i.test(navigator.userAgent || "");
  
  const storeUrls = {
    avenza: {
      ios: "https://apps.apple.com/app/id388424049",
      android: "https://play.google.com/store/apps/details?id=com.Avenza"
    },
    gaia: {
      ios: "https://apps.apple.com/app/id355727877",
      android: "https://play.google.com/store/apps/details?id=com.trailbehind.android.gaiagps.pro"
    },
    caltopo: {
      ios: "https://apps.apple.com/app/id1489069904",
      android: "https://play.google.com/store/apps/details?id=com.caltopo.android"
    },
    osmand: {
      ios: "https://apps.apple.com/app/id934850375",
      android: "https://play.google.com/store/apps/details?id=net.osmand"
    }
  };

  const appStore = storeUrls[normKey] || storeUrls.avenza;
  return isAndroid ? appStore.android : appStore.ios;
}


/**
 * Attempts to launch custom URI scheme. If app is not installed (page context stays active after 1500ms), fallback to App Store / Play Store.
 */
export function launchAppWithStoreFallback(appScheme, appKey) {
  const storeUrl = getAppStoreUrl(appKey);
  const startTime = Date.now();

  let fallbackTimer = setTimeout(() => {
    if (Date.now() - startTime < 2500) {
      window.open(storeUrl, "_blank");
    }
  }, 1500);

  const clearFallback = () => {
    clearTimeout(fallbackTimer);
    window.removeEventListener("blur", clearFallback);
    document.removeEventListener("visibilitychange", clearFallback);
  };

  window.addEventListener("blur", clearFallback);
  document.addEventListener("visibilitychange", clearFallback);

  window.location.href = appScheme;
}


/**
 * Dynamically updates the Avenza modal title to match selection type (Zones vs Circles).
 */
export function updateAvenzaModalHeaderTitle(targetAppName = "Avenza Maps") {
  const modalTitleEl = document.getElementById("avenza-modal-title");
  if (!modalTitleEl) return;

  const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
  const circleName = state.currentFeature === "florence" ? "Florence Count Circle" : "Eugene Count Circle";

  if (state.isCirclesFeature) {
    modalTitleEl.innerHTML = `Import the <span class="avenza-target-name">Coast to Cascades Bird Alliance</span> into ${targetAppName}`;
    return;
  }

  if (isCircle) {
    modalTitleEl.innerHTML = `Import the <span class="avenza-target-name">${circleName}</span> into ${targetAppName}`;
    return;
  }

  // Zone specific selection
  const targetFeature = (state.allFeatures || []).find(f => {
    const zid = f.properties?.zid;
    return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || (typeof normalizeZoneId === "function" && normalizeZoneId(zid) === normalizeZoneId(state.currentId)));
  });

  const zoneName = (targetFeature && targetFeature.properties?.zid) 
    ? `Zone ${displayZoneId(targetFeature.properties.zid)}`
    : "Zone";

  modalTitleEl.innerHTML = `Import <span class="avenza-target-name">${zoneName}</span> of the <span class="avenza-target-name">${circleName}</span> into ${targetAppName}`;
}


/**
 * Returns count circle thumbnail/logo for the current selection (matching top-left header logo).
 */
export function getActiveSelectionThumbnail() {
  if (state.isCirclesFeature || state.currentFeature === "circles") {
    return "../images/whiteLane-Audubon-favicon-152.png";
  }
  if (state.currentFeature === "florence") {
    return "../images/florence.png";
  }
  return "../images/logo-small.png";
}


/**
 * Opens the blackout instruction modal dynamically configured for any app (Avenza, Gaia GPS, CalTopo, OsmAnd).
 */
export async function openAppInstructionModal(appKeyOrName, mapFileUrlOrBlob = null, filename = null, triggerCard = null) {
  const normKey = String(appKeyOrName).toLowerCase().replace(/[^a-z]/g, "");
  let config = null;

  if (normKey.includes("avenza")) config = APP_INSTRUCTION_CONFIGS.avenza;
  else if (normKey.includes("gaia")) config = APP_INSTRUCTION_CONFIGS.gaia;
  else if (normKey.includes("caltopo")) config = APP_INSTRUCTION_CONFIGS.caltopo;
  else if (normKey.includes("osmand")) config = APP_INSTRUCTION_CONFIGS.osmand;
  else {
    config = {
      appName: appKeyOrName,
      scheme: `${normKey}://`,
      formatKey: "gpx",
      ext: "gpx",
      iconSrc: "../images/app_icons/gaia.webp",
      step1Heading: "Download the Map File",
      step2Heading: `Launch ${appKeyOrName}`,
      step2Text: `Tap <strong>Continue to ${appKeyOrName}</strong> below to open the app.`,
      step3Heading: "Import Map",
      step3Text: `Inside ${appKeyOrName}, select your downloaded map file from the <strong>Downloads</strong> folder.`,
      continueBtnText: `Continue to ${appKeyOrName}`
    };
  }

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

