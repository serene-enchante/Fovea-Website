export const EUGENE_GEOJSON_PATH = "../geojson/Eugene-02-wgs84.geojson";
export const FLORENCE_GEOJSON_PATH = "../geojson/Florence-00-wgs84.geojson";
export const CIRCLES_GEOJSON_PATH = "../geojson/circles-wgs84.geojson";
export const CIRCLE_ID = "ecbc-circle";

export const SPATIAL_MIME_TYPES = {
  gpx: 'application/gpx+xml',
  kml: 'application/vnd.google-earth.kml+xml',
  kmz: 'application/vnd.google-earth.kmz',
  geojson: 'application/geo+json',
  json: 'application/json',
  pdf: 'application/pdf',
  zip: 'application/zip',
  tif: 'image/tiff',
  tiff: 'image/tiff'
};

export const APP_FORMAT_PREFERENCES = {
  "avenza maps": {
    appName: "Avenza Maps",
    scheme: "avenzamaps://",
    formatKey: "geopdf",
    ext: "pdf",
    mimeType: "application/pdf"
  },
  "avenza": {
    appName: "Avenza Maps",
    scheme: "avenzamaps://",
    formatKey: "geopdf",
    ext: "pdf",
    mimeType: "application/pdf"
  },
  "gaia gps": {
    appName: "Gaia GPS",
    scheme: "gaiagps://",
    formatKey: "gpx",
    ext: "gpx",
    mimeType: "application/gpx+xml"
  },
  "gaia": {
    appName: "Gaia GPS",
    scheme: "gaiagps://",
    formatKey: "gpx",
    ext: "gpx",
    mimeType: "application/gpx+xml"
  },
  "caltopo": {
    appName: "CalTopo",
    scheme: "caltopo://",
    formatKey: "gpx",
    ext: "gpx",
    mimeType: "application/gpx+xml"
  },
  "osmand maps": {
    appName: "OsmAnd",
    scheme: "osmandmaps://",
    formatKey: "gpx",
    ext: "gpx",
    mimeType: "application/gpx+xml"
  },
  "osmand": {
    appName: "OsmAnd",
    scheme: "osmandmaps://",
    formatKey: "gpx",
    ext: "gpx",
    mimeType: "application/gpx+xml"
  }
};

export const APP_INSTRUCTION_CONFIGS = {
  avenza: {
    appKey: "avenza",
    appName: "Avenza Maps",
    scheme: "avenzamaps://",
    formatKey: "geopdf",
    ext: "pdf",
    iconSrc: "../images/app_icons/avenza.webp",
    step1Heading: "Download the GeoPDF",
    step2Heading: "Launch Avenza Maps",
    step2Text: "Tap <strong>Continue to Avenza Maps</strong> below to open the app.",
    step3Heading: "Import Map",
    step3Text: `Inside Avenza, tap <span class="avenza-ui-badge">+</span> → <strong>From Storage Locations</strong> and select your map PDF from the <strong>Downloads</strong> folder.`,
    continueBtnText: "Continue to Avenza Maps"
  },
  gaia: {
    appKey: "gaia",
    appName: "Gaia GPS",
    scheme: "gaiagps://",
    formatKey: "gpx",
    ext: "gpx",
    iconSrc: "../images/app_icons/gaia.webp",
    step1Heading: "Download the GPX File",
    step2Heading: "Launch Gaia GPS",
    step2Text: "Tap <strong>Continue to Gaia GPS</strong> below to open the app.",
    step3Heading: "Import Map",
    step3Text: `Inside Gaia GPS, tap <span class="avenza-ui-badge">+</span> → <strong>Import File</strong> and select your map file from the <strong>Downloads</strong> folder.`,
    continueBtnText: "Continue to Gaia GPS"
  },
  caltopo: {
    appKey: "caltopo",
    appName: "CalTopo",
    scheme: "caltopo://",
    formatKey: "geojson",
    ext: "geojson",
    iconSrc: "../images/app_icons/caltopo.webp",
    step1Heading: "Download the GeoJSON File",
    step2Heading: "Launch CalTopo",
    step2Text: "Tap <strong>Continue to CalTopo</strong> below to open the app.",
    step3Heading: "Import Map",
    step3Text: `Inside CalTopo, tap <strong>Import</strong> and select your map file from the <strong>Downloads</strong> folder.`,
    continueBtnText: "Continue to CalTopo"
  },
  osmand: {
    appKey: "osmand",
    appName: "OsmAnd",
    scheme: "osmand://",
    formatKey: "gpx",
    ext: "gpx",
    iconSrc: "../images/app_icons/osmandmaps.webp",
    step1Heading: "Download the GPX File",
    step2Heading: "Launch OsmAnd",
    step2Text: "Tap <strong>Continue to OsmAnd</strong> below to open the app.",
    step3Heading: "Import Map",
    step3Text: `Inside OsmAnd, tap <strong>My Places</strong> → <strong>+</strong> and select your map file from the <strong>Downloads</strong> folder.`,
    continueBtnText: "Continue to OsmAnd"
  }
};
