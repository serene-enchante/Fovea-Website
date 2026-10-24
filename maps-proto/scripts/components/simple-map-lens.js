const MAPLIBRE_VERSION = "5.0.0";
const MAPLIBRE_SCRIPT = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_STYLESHEET = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const VECTOR_STYLES = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

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

  async function initialize(selection) {
    status.textContent = "Loading map…";
    status.hidden = false;
    try {
      const maplibregl = await loadMapLibre();
      if (!active || map) return;

      const settings = selection?.map || {};
      map = new maplibregl.Map({
        container: canvas,
        style: document.documentElement.dataset.theme === "light"
          ? VECTOR_STYLES.light
          : VECTOR_STYLES.dark,
        center: settings.center || [-123.086, 44.05],
        zoom: settings.zoom || 9,
        attributionControl: true,
      });
      map.once("load", () => { status.hidden = true; });
      map.on("error", (event) => {
        if (event.error && !map.loaded()) status.textContent = "Map tiles could not be loaded.";
      });
    } catch (error) {
      console.error("Unable to initialize the simple map lens", error);
      status.textContent = "Map could not be loaded. Check your network connection.";
    }
  }

  function setState({ active: isActive, selection }) {
    active = isActive;
    element.hidden = !active;
    if (!active) return;

    const settings = selection?.map || {};
    if (!map) {
      initialize(selection);
      selectionId = selection?.id || null;
      return;
    }

    map.resize();
    if (selection?.id && selection.id !== selectionId) {
      map.jumpTo({
        center: settings.center || [-123.086, 44.05],
        zoom: settings.zoom || 9,
      });
      selectionId = selection.id;
    }
  }

  return { element, setState };
}
