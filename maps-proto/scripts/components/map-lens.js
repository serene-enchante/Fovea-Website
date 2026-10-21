// Keep the Maps proto on the MapLibre release already used by the main app.
const MAPLIBRE_VERSION = "5.0.0";
const MAPLIBRE_SCRIPT = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_STYLESHEET = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const BASEMAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const EMPTY_GEOJSON = { type: "FeatureCollection", features: [] };

let mapLibrePromise;

function loadMapLibre() {
  if (!mapLibrePromise) {
    const existingStylesheet = document.querySelector("#maplibre-gl-stylesheet");
    if (!existingStylesheet) {
      const stylesheet = document.createElement("link");
      stylesheet.id = "maplibre-gl-stylesheet";
      stylesheet.rel = "stylesheet";
      stylesheet.href = MAPLIBRE_STYLESHEET;
      document.head.append(stylesheet);
    }
    mapLibrePromise = new Promise((resolve, reject) => {
      if (window.maplibregl) {
        resolve(window.maplibregl);
        return;
      }
      const existingScript = document.querySelector("#maplibre-gl-script");
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.maplibregl), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("MapLibre script failed to load")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.id = "maplibre-gl-script";
      script.src = MAPLIBRE_SCRIPT;
      script.async = true;
      script.onload = () => window.maplibregl
        ? resolve(window.maplibregl)
        : reject(new Error("MapLibre loaded without its browser API"));
      script.onerror = () => reject(new Error("MapLibre script failed to load"));
      document.head.append(script);
    }).catch((error) => {
      mapLibrePromise = null;
      throw error;
    });
  }
  return mapLibrePromise;
}

export function createMapLens() {
  const element = document.createElement("div");
  element.className = "map-lens";
  element.hidden = true;

  const canvas = document.createElement("div");
  canvas.className = "map-lens__canvas";
  canvas.setAttribute("aria-label", "Interactive map");
  canvas.setAttribute("role", "region");
  const status = document.createElement("p");
  status.className = "map-lens__status";
  status.setAttribute("role", "status");
  element.append(canvas, status);

  let map = null;
  let mapReady = false;
  let active = false;
  let currentSelection = null;
  let selectionVersion = 0;

  function setStatus(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function setBoundaryData(data) {
    const source = map?.getSource("selection-boundaries");
    if (source && typeof source.setData === "function") source.setData(data);
  }

  function getBounds(geoJson) {
    const bounds = [[Infinity, Infinity], [-Infinity, -Infinity]];
    function visit(value) {
      if (!Array.isArray(value)) return;
      if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
        bounds[0][0] = Math.min(bounds[0][0], value[0]);
        bounds[0][1] = Math.min(bounds[0][1], value[1]);
        bounds[1][0] = Math.max(bounds[1][0], value[0]);
        bounds[1][1] = Math.max(bounds[1][1], value[1]);
        return;
      }
      value.forEach(visit);
    }
    (geoJson.features || []).forEach((feature) => visit(feature.geometry?.coordinates));
    return Number.isFinite(bounds[0][0]) ? bounds : null;
  }

  function updateSelection() {
    if (!map || !mapReady || !currentSelection) return;
    const version = ++selectionVersion;
    const mapSettings = currentSelection.map || {};
    const center = Array.isArray(mapSettings.center) ? mapSettings.center : [-123.086, 44.05];
    const zoom = Number.isFinite(mapSettings.zoom) ? mapSettings.zoom : 9;
    map.easeTo({ center, zoom, duration: active ? 450 : 0 });

    if (!mapSettings.geojsonSrc) {
      setBoundaryData(EMPTY_GEOJSON);
      setStatus("");
      return;
    }

    setBoundaryData(EMPTY_GEOJSON);
    const dataUrl = new URL(mapSettings.geojsonSrc, currentSelection.dataUrl || document.baseURI);
    fetch(dataUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`Boundary data request failed (${response.status})`);
        return response.json();
      })
      .then((geoJson) => {
        if (version !== selectionVersion) return;
        setBoundaryData(geoJson);
        const bounds = getBounds(geoJson);
        if (bounds && active) {
          const rightPadding = Math.min(360, Math.max(24, canvas.clientWidth * 0.38));
          map.fitBounds(bounds, {
            padding: { top: 72, right: rightPadding, bottom: 52, left: 52 },
            maxZoom: 12,
            duration: 450,
          });
        }
        setStatus("");
      })
      .catch((error) => {
        if (version !== selectionVersion) return;
        console.error("Unable to load selected map boundaries", error);
        setStatus("Map loaded without boundary data.");
      });
  }

  async function initializeMap() {
    setStatus("Loading map…");
    try {
      const maplibregl = await loadMapLibre();
      if (!active || map) return;
      map = new maplibregl.Map({
        container: canvas,
        style: BASEMAP_STYLE,
        center: currentSelection?.map?.center || [-123.086, 44.05],
        zoom: currentSelection?.map?.zoom || 9,
        attributionControl: true,
      });
      map.addControl(new maplibregl.NavigationControl(), "bottom-left");
      map.on("load", () => {
        if (map.getSource("selection-boundaries")) return;
        map.addSource("selection-boundaries", { type: "geojson", data: EMPTY_GEOJSON });
        map.addLayer({
          id: "selection-boundaries-fill",
          type: "fill",
          source: "selection-boundaries",
          paint: { "fill-color": "#3b82f6", "fill-opacity": 0.18 },
        });
        map.addLayer({
          id: "selection-boundaries-outline",
          type: "line",
          source: "selection-boundaries",
          paint: { "line-color": "#1d4ed8", "line-width": 2 },
        });
        mapReady = true;
        canvas.style.visibility = "visible";
        setStatus("");
        updateSelection();
      });
      map.on("error", (event) => {
        if (event.error) {
          console.error("MapLibre error", event.error);
          // Individual tile failures should not hide a map that has rendered.
          if (!mapReady) setStatus("Map style or tiles could not be loaded.");
        }
      });
    } catch (error) {
      console.error("Unable to initialize MapLibre", error);
      canvas.style.visibility = "hidden";
      setStatus("Map could not be loaded. Check your network connection and try again.");
    }
  }

  function setState({ active: isActive, selection }) {
    active = isActive;
    currentSelection = selection;
    element.hidden = !active;
    if (!active) return;
    if (!map) {
      initializeMap();
      return;
    }
    requestAnimationFrame(() => {
      if (!active || !map) return;
      map.resize();
      updateSelection();
    });
  }

  return { element, setState };
}
