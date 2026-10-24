const MAPLIBRE_VERSION = "5.0.0";
const MAPLIBRE_SCRIPT = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_STYLESHEET = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const VECTOR_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};
const AUTO_LOAD_DELAY_MS = 5000;
const CAMERA_SETTLE_DELAY_MS = 480;
const CAMERA_RECENTER_DURATION_MS = 420;

let mapLibrePromise;

function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (mapLibrePromise) return mapLibrePromise;

  mapLibrePromise = new Promise((resolve, reject) => {
    let stylesheet = document.querySelector("#simple-maplibre-stylesheet");
    if (!stylesheet) {
      stylesheet = document.createElement("link");
      stylesheet.id = "simple-maplibre-stylesheet";
      stylesheet.rel = "stylesheet";
      stylesheet.href = MAPLIBRE_STYLESHEET;
      document.head.append(stylesheet);
    }

    const script = document.createElement("script");
    script.src = MAPLIBRE_SCRIPT;
    script.async = true;
    script.onload = () => window.maplibregl
      ? resolve(window.maplibregl)
      : reject(new Error("MapLibre loaded without its browser API"));
    script.onerror = () => reject(new Error("MapLibre failed to load"));
    document.head.append(script);
  }).catch((error) => {
    mapLibrePromise = null;
    throw error;
  });

  return mapLibrePromise;
}

export function createSimpleMapLens() {
  const element = document.createElement("div");
  element.className = "simple-map-lens";
  element.hidden = true;

  const canvas = document.createElement("div");
  canvas.className = "simple-map-lens__canvas";
  canvas.setAttribute("role", "region");
  canvas.setAttribute("aria-label", "Interactive vector map");

  const status = document.createElement("p");
  status.className = "simple-map-lens__status";
  status.setAttribute("role", "status");
  status.hidden = true;

  element.append(canvas, status);

  let map = null;
  let active = false;
  let selectionId = null;
  let currentSelection = null;
  let mapLoading = false;
  let autoLoadTimer = null;
  let maskTarget = null;
  let getMaskBlockers = () => [];
  let observedBlockers = new Set();
  let maskResizeObserver = null;
  let maskStateObserver = null;
  let blockerObserver = null;
  let blockerTreeObserver = null;
  let maskAnimationFrame = 0;
  let safeAreaTimer = null;
  let cameraSettleTimer = null;
  let appliedPadding = null;
  let cameraRecenterInProgress = false;

  function intersectRects(first, second) {
    const rect = {
      left: Math.max(first.left, second.left),
      top: Math.max(first.top, second.top),
      right: Math.min(first.right, second.right),
      bottom: Math.min(first.bottom, second.bottom),
    };
    return rect.right > rect.left && rect.bottom > rect.top ? rect : null;
  }

  function getSafeRect(target = maskTarget, blockers = getMaskBlockers()) {
    if (!target) return null;
    const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const frameRect = intersectRects(target.getBoundingClientRect(), viewport);
    if (!frameRect) return null;

    const visibleBlockers = blockers.filter((blocker) => {
      if (!blocker?.isConnected || blocker.hidden) return false;
      const style = getComputedStyle(blocker);
      return style.display !== "none" && style.visibility !== "hidden"
        && Number.parseFloat(style.opacity || "1") > 0.05;
    }).map((blocker) => {
      const rect = blocker.getBoundingClientRect();
      return {
        left: Math.max(frameRect.left, rect.left - 12),
        top: Math.max(frameRect.top, rect.top - 12),
        right: Math.min(frameRect.right, rect.right + 12),
        bottom: Math.min(frameRect.bottom, rect.bottom + 12),
      };
    }).filter((rect) => rect.right > rect.left && rect.bottom > rect.top);

    if (!visibleBlockers.length) return frameRect;
    const xEdges = [...new Set([
      frameRect.left, frameRect.right,
      ...visibleBlockers.flatMap(({ left, right }) => [left, right]),
    ])].sort((a, b) => a - b);
    const yEdges = [...new Set([
      frameRect.top, frameRect.bottom,
      ...visibleBlockers.flatMap(({ top, bottom }) => [top, bottom]),
    ])].sort((a, b) => a - b);

    let best = null;
    let bestArea = 0;
    for (let leftIndex = 0; leftIndex < xEdges.length - 1; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < xEdges.length; rightIndex += 1) {
        for (let topIndex = 0; topIndex < yEdges.length - 1; topIndex += 1) {
          for (let bottomIndex = topIndex + 1; bottomIndex < yEdges.length; bottomIndex += 1) {
            const rect = {
              left: xEdges[leftIndex],
              right: xEdges[rightIndex],
              top: yEdges[topIndex],
              bottom: yEdges[bottomIndex],
            };
            if (visibleBlockers.some((blocker) => intersectRects(rect, blocker))) continue;
            const area = (rect.right - rect.left) * (rect.bottom - rect.top);
            if (area > bestArea) {
              best = rect;
              bestArea = area;
            }
          }
        }
      }
    }
    return best || frameRect;
  }

  function updateMask() {
    if (!maskTarget) return;
    const width = innerWidth;
    const height = innerHeight;
    const rect = intersectRects(maskTarget.getBoundingClientRect(), {
      left: 0, top: 0, right: width, bottom: height,
    });
    if (!rect) {
      element.style.clipPath = "inset(50%)";
      return;
    }
    const frameStyle = getComputedStyle(maskTarget);
    const radii = [
      frameStyle.borderTopLeftRadius,
      frameStyle.borderTopRightRadius,
      frameStyle.borderBottomRightRadius,
      frameStyle.borderBottomLeftRadius,
    ].map((value) => `${Number.parseFloat(value) || 0}px`);
    const top = Math.max(0, rect.top);
    const right = Math.max(0, width - rect.right);
    const bottom = Math.max(0, height - rect.bottom);
    const left = Math.max(0, rect.left);
    element.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round ${radii.join(" ")})`;
  }

  function updateSafeArea({ recenterMap = false } = {}) {
    if (!maskTarget) return;
    const safe = getSafeRect();
    if (!safe) return;
    const right = Math.max(0, innerWidth - safe.right);
    const bottom = Math.max(0, innerHeight - safe.bottom);
    element.style.setProperty("--map-safe-left", `${safe.left}px`);
    element.style.setProperty("--map-safe-top", `${safe.top}px`);
    element.style.setProperty("--map-safe-right", `${right}px`);
    element.style.setProperty("--map-safe-bottom", `${bottom}px`);
    element.style.setProperty("--map-safe-center-x", `${(safe.left + safe.right) / 2}px`);
    element.style.setProperty("--map-safe-center-y", `${(safe.top + safe.bottom) / 2}px`);

    const nextPadding = {
      left: safe.left,
      top: safe.top,
      right,
      bottom,
    };
    if (!recenterMap) return;
    recenterMapToPadding(nextPadding);
  }

  function recenterMapToPadding(nextPadding) {
    if (!map || !map.loaded()) return;
    if (appliedPadding && Object.keys(nextPadding).every((side) => (
      Math.abs(nextPadding[side] - appliedPadding[side]) < 1
    ))) return;
    appliedPadding = nextPadding;
    cameraRecenterInProgress = true;
    map.once("moveend", () => {
      cameraRecenterInProgress = false;
    });
    map.easeTo({
      padding: nextPadding,
      duration: CAMERA_RECENTER_DURATION_MS,
    });
  }

  function getDestinationPadding() {
    const sourceLayout = maskTarget?.closest("#frame-layout");
    if (!sourceLayout) return null;
    const measuringLayer = document.createElement("div");
    measuringLayer.style.cssText = "position:fixed;inset:0;opacity:0;pointer-events:none;z-index:-1";
    const layout = sourceLayout.cloneNode(true);
    layout.querySelector(".simple-map-lens")?.remove();
    layout.style.setProperty("position", "fixed", "important");
    layout.style.setProperty("inset", "0", "important");
    layout.style.setProperty("pointer-events", "none", "important");
    layout.style.setProperty("z-index", "-1", "important");
    layout.style.setProperty("transition", "none", "important");
    layout.querySelectorAll("*").forEach((node) => {
      node.style.setProperty("transition", "none", "important");
    });
    measuringLayer.append(layout);
    document.body.append(measuringLayer);
    const target = layout.querySelector("#content-frame");
    const blockers = [
      ...layout.querySelectorAll(".app-frame--context"),
      layout.querySelector("#toolbar-frame"),
    ];
    const safe = getSafeRect(target, blockers);
    measuringLayer.remove();
    if (!safe) return null;
    return {
      left: safe.left,
      top: safe.top,
      right: Math.max(0, innerWidth - safe.right),
      bottom: Math.max(0, innerHeight - safe.bottom),
    };
  }

  function scheduleSafeAreaUpdate() {
    if (safeAreaTimer !== null) window.clearTimeout(safeAreaTimer);
    safeAreaTimer = window.setTimeout(() => {
      safeAreaTimer = null;
      updateSafeArea();
    }, 140);
  }

  function scheduleCameraRecenter() {
    if (cameraSettleTimer !== null) window.clearTimeout(cameraSettleTimer);
    const root = document.documentElement;
    if (root.hasAttribute("data-view-preview") || root.hasAttribute("data-view-dragging")) {
      if (cameraRecenterInProgress && map) map.stop();
      cameraRecenterInProgress = false;
      return;
    }
    cameraSettleTimer = window.setTimeout(() => {
      cameraSettleTimer = null;
      if (root.hasAttribute("data-view-preview") || root.hasAttribute("data-view-dragging")) return;
      const view = root.dataset.view;
      if (view !== "content-view" && view !== "directory-view") return;
      updateSafeArea({ recenterMap: true });
    }, CAMERA_SETTLE_DELAY_MS);
  }

  function recenterForViewTransition() {
    if (cameraSettleTimer !== null) window.clearTimeout(cameraSettleTimer);
    cameraSettleTimer = null;
    const root = document.documentElement;
    if (root.hasAttribute("data-view-preview") || root.hasAttribute("data-view-dragging")) return;
    const padding = getDestinationPadding();
    if (padding) recenterMapToPadding(padding);
  }

  function trackMaskTransition() {
    if (maskAnimationFrame) cancelAnimationFrame(maskAnimationFrame);
    const endAt = performance.now() + 480;
    const tick = (now) => {
      updateMask();
      if (now < endAt) maskAnimationFrame = requestAnimationFrame(tick);
      else maskAnimationFrame = 0;
    };
    maskAnimationFrame = requestAnimationFrame(tick);
  }

  function setFrameMask(frame, blockers = () => [], blockerRoot = null) {
    maskTarget = frame;
    getMaskBlockers = blockers;
    updateMask();

    maskResizeObserver = new ResizeObserver(() => {
      updateMask();
      scheduleSafeAreaUpdate();
    });
    maskResizeObserver.observe(frame);
    blockerObserver = new MutationObserver(() => {
      trackMaskTransition();
      scheduleSafeAreaUpdate();
      scheduleCameraRecenter();
    });

    const observeBlockers = () => getMaskBlockers().forEach((blocker) => {
      if (!blocker || observedBlockers.has(blocker)) return;
      observedBlockers.add(blocker);
      maskResizeObserver.observe(blocker);
      blockerObserver.observe(blocker, { attributes: true, attributeFilter: ["class", "style"] });
    });
    observeBlockers();

    if (blockerRoot) {
      blockerTreeObserver = new MutationObserver(() => {
        observeBlockers();
        scheduleSafeAreaUpdate();
        scheduleCameraRecenter();
      });
      blockerTreeObserver.observe(blockerRoot, { childList: true, subtree: true });
    }

    maskStateObserver = new MutationObserver((records) => {
      trackMaskTransition();
      scheduleSafeAreaUpdate();
      if (records.some(({ attributeName }) => attributeName === "data-view")) {
        recenterForViewTransition();
      } else {
        scheduleCameraRecenter();
      }
    });
    maskStateObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-view", "data-view-dragging", "data-view-preview", "style"],
    });
    window.addEventListener("resize", () => {
      updateMask();
      scheduleSafeAreaUpdate();
      scheduleCameraRecenter();
    });
    updateSafeArea();
  }

  async function initialize() {
    if (map || mapLoading) return;
    mapLoading = true;
    status.textContent = "Loading map…";
    status.dataset.state = "loading";
    status.hidden = false;
    try {
      const maplibregl = await loadMapLibre();
      if (map) return;
      if (!active) {
        status.hidden = true;
        return;
      }

      const settings = currentSelection?.map || {};
      map = new maplibregl.Map({
        container: canvas,
        style: document.documentElement.dataset.theme === "light"
          ? VECTOR_STYLES.light
          : VECTOR_STYLES.dark,
        center: settings.center || [-123.086, 44.05],
        zoom: settings.zoom || 9,
        attributionControl: false,
      });
      map.addControl(new maplibregl.AttributionControl(), "bottom-left");
      map.once("load", () => {
        status.hidden = true;
        delete status.dataset.state;
        scheduleCameraRecenter();
      });
      map.on("error", (event) => {
        if (event.error && !map.loaded()) {
          status.dataset.state = "error";
          status.textContent = "Map tiles could not be loaded.";
        }
      });
    } catch (error) {
      console.error("Unable to initialize the simple map lens", error);
      status.dataset.state = "error";
      status.textContent = "Map could not be loaded. Check your network connection.";
    } finally {
      mapLoading = false;
    }
  }

  function scheduleAutoLoad() {
    if (autoLoadTimer !== null || map || mapLoading) return;
    const waitForPageLoad = () => {
      if (!active || autoLoadTimer !== null || map) return;
      autoLoadTimer = window.setTimeout(() => {
        autoLoadTimer = null;
        if (active && !map) initialize();
      }, AUTO_LOAD_DELAY_MS);
    };

    if (document.readyState === "complete") waitForPageLoad();
    else window.addEventListener("load", waitForPageLoad, { once: true });
  }

  function setState({ active: isActive, selection }) {
    active = isActive;
    currentSelection = selection;
    element.hidden = !active;
    if (!active) {
      if (autoLoadTimer !== null) {
        window.clearTimeout(autoLoadTimer);
        autoLoadTimer = null;
      }
      status.hidden = true;
      return;
    }

    const settings = selection?.map || {};
    if (!map) {
      status.textContent = "Preparing interactive map…";
      status.dataset.state = "loading";
      status.hidden = false;
      scheduleAutoLoad();
      selectionId = selection?.id || null;
      return;
    }

    if (selection?.id && selection.id !== selectionId) {
      map.jumpTo({
        center: settings.center || [-123.086, 44.05],
        zoom: settings.zoom || 9,
      });
      selectionId = selection.id;
    }
  }

  return { element, setState, setFrameMask };
}
