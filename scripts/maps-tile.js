const EUGENE_GEOJSON_PATH = "../geojson/Eugene-02-wgs84.geojson";
const FLORENCE_GEOJSON_PATH = "../geojson/Florence-00-wgs84.geojson";
const CIRCLES_GEOJSON_PATH = "../geojson/circles-wgs84.geojson";
const CIRCLE_ID = "ecbc-circle";
const FALLBACK_IMAGE = "../images/wetlands.jpg";

// MapLibre prototype polyfill for Leaflet legacy compatibility
if (typeof maplibregl !== 'undefined' && maplibregl.Map) {
    maplibregl.Map.prototype.invalidateSize = function() {
        this.resize();
    };
}

const MAP_STYLES = {
    default: {
        color: "#ffffff",
        weight: 1.0,
        fillColor: "#ffffff",
        fillOpacity: 0.07
    },
    hover: {
        color: "#30d158",
        weight: 1.8,
        fillColor: "#30d158",
        fillOpacity: 0.2
    },
    selected: {
        color: "#00ff66",
        weight: 2.2,
        fillColor: "#30d158",
        fillOpacity: 0.35
    }
};


function getBbox(features) {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    const processCoord = (coord) => {
        if (coord[0] < minLng) minLng = coord[0];
        if (coord[1] < minLat) minLat = coord[1];
        if (coord[0] > maxLng) maxLng = coord[0];
        if (coord[1] > maxLat) maxLat = coord[1];
    };
    const processGeom = (geom) => {
        if (!geom) return;
        if (geom.type === "Polygon") {
            geom.coordinates[0].forEach(processCoord);
        } else if (geom.type === "MultiPolygon") {
            geom.coordinates.forEach(poly => poly[0].forEach(processCoord));
        } else if (geom.type === "Point") {
            processCoord(geom.coordinates);
        }
    };
    if (Array.isArray(features)) {
        features.forEach(f => processGeom(f.geometry));
    } else {
        processGeom(features.geometry);
    }
    if (minLng === Infinity) return [[-123.3, 43.9], [-122.9, 44.2]];
    return [[minLng, minLat], [maxLng, maxLat]];
}

function findPointInsidePolygon(geom) {
    if (!geom) return null;
    
    function getSegDistSq(px, py, a, b) {
        let x = a[0];
        let y = a[1];
        let dx = b[0] - x;
        let dy = b[1] - y;
        if (dx !== 0 || dy !== 0) {
            const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
            if (t > 1) {
                x = b[0];
                y = b[1];
            } else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }
        dx = px - x;
        dy = py - y;
        return dx * dx + dy * dy;
    }

    function isPointInRing(pt, ring) {
        const x = pt[0], y = pt[1];
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function isPointInPoly(pt, polyCoords) {
        if (!polyCoords || polyCoords.length === 0) return false;
        if (!isPointInRing(pt, polyCoords[0])) return false;
        for (let i = 1; i < polyCoords.length; i++) {
            if (isPointInRing(pt, polyCoords[i])) return false;
        }
        return true;
    }

    function pointToPolygonDist(pt, polyCoords) {
        let minDistSq = Infinity;
        for (let i = 0; i < polyCoords.length; i++) {
            const ring = polyCoords[i];
            for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
                const distSq = getSegDistSq(pt[0], pt[1], ring[k], ring[j]);
                if (distSq < minDistSq) minDistSq = distSq;
            }
        }
        const dist = Math.sqrt(minDistSq);
        return isPointInPoly(pt, polyCoords) ? dist : -dist;
    }

    let polygons = [];
    if (geom.type === "Polygon") {
        polygons.push(geom.coordinates);
    } else if (geom.type === "MultiPolygon") {
        polygons = geom.coordinates;
    } else if (geom.type === "Point") {
        return geom.coordinates;
    } else {
        return null;
    }

    if (polygons.length === 0) return null;

    let bestPoly = polygons[0];
    let maxLen = 0;
    polygons.forEach(p => {
        if (p[0] && p[0].length > maxLen) {
            maxLen = p[0].length;
            bestPoly = p;
        }
    });

    const outerRing = bestPoly[0];
    if (!outerRing || outerRing.length < 3) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    outerRing.forEach(p => {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const cellSize = Math.min(width, height);
    if (cellSize === 0) return outerRing[0];

    let bestCell = [minX + width / 2, minY + height / 2, 0, pointToPolygonDist([minX + width / 2, minY + height / 2], bestPoly)];
    
    if (bestCell[3] < 0) {
        outerRing.forEach(p => {
            const d = pointToPolygonDist(p, bestPoly);
            if (d > bestCell[3]) {
                bestCell = [p[0], p[1], 0, d];
            }
        });
    }

    function searchGrid(x0, y0, x1, y1, depth) {
        if (depth > 4) return;
        const dx = (x1 - x0) / 8;
        const dy = (y1 - y0) / 8;
        let localBest = null;
        let maxDist = -Infinity;
        
        for (let i = 0; i <= 8; i++) {
            for (let j = 0; j <= 8; j++) {
                const px = x0 + i * dx;
                const py = y0 + j * dy;
                const dist = pointToPolygonDist([px, py], bestPoly);
                if (dist > maxDist) {
                    maxDist = dist;
                    localBest = [px, py];
                }
            }
        }
        
        if (localBest && maxDist > bestCell[3]) {
            bestCell = [localBest[0], localBest[1], 0, maxDist];
        }
        
        if (localBest) {
            const newMinX = Math.max(x0, localBest[0] - dx);
            const newMinY = Math.max(y0, localBest[1] - dy);
            const newMaxX = Math.min(x1, localBest[0] + dx);
            const newMaxY = Math.min(y1, localBest[1] + dy);
            searchGrid(newMinX, newMinY, newMaxX, newMaxY, depth + 1);
        }
    }

    searchGrid(minX, minY, maxX, maxY, 0);

    return [bestCell[0], bestCell[1]];
}


function getDefaultStyle() {
    return MAP_STYLES.default;
}

function updateAllFeatureStyles() {
    if (!state.map || !state.map.getSource('zones')) return;
    
    // We update all features state based on currentId
    state.allFeatures.forEach(feature => {
        const props = feature.properties || {};
        const key = state.isCirclesFeature ? String(props.cid || "") : String(props.zid || "");
        const isSelected = state.currentId !== CIRCLE_ID && (key === state.currentId || normalizeZoneId(key) === normalizeZoneId(state.currentId));
        state.map.setFeatureState(
            { source: 'zones', id: key },
            { selected: isSelected }
        );
    });

    // Determine geometry styling based on active basemap (thick black outline & transparent deep blue fill for Esri Street/Topo, white for Dark/Satellite)
    const isLightBasemap = state.currentBaseLayer === "esri-street" || state.currentBaseLayer === "esri-topo";
    const isSatelliteBasemap = state.currentBaseLayer === "satellite";
    const mapWrapper = document.getElementById("map-wrapper");
    const mapArea = document.querySelector(".maps-tile-map-area");
    [document.body, mapArea, mapWrapper].forEach(el => {
        if (el) {
            if (isLightBasemap) {
                el.classList.add("is-light-basemap");
            } else {
                el.classList.remove("is-light-basemap");
            }
        }
    });

    let defaultFillColor = '#ffffff';
    let defaultFillOpacity = 0.07;

    if (isLightBasemap) {
        defaultFillColor = '#0d47a1';
        defaultFillOpacity = 0.22;
    } else if (isSatelliteBasemap) {
        defaultFillColor = '#000000';
        defaultFillOpacity = 0.25;
    }

    const defaultLineColor = isLightBasemap ? '#000000' : '#ffffff';
    const dimLineColor = isLightBasemap ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.25)';
    const defaultLineWidth = isLightBasemap ? 2.8 : 1.0;

    const noDataFillColor = isLightBasemap ? '#8e8e93' : defaultFillColor;
    const noDataFillOpacity = isLightBasemap ? 0.30 : (isSatelliteBasemap ? 0.15 : 0.02);
    const noDataLineColor = isLightBasemap ? 'rgba(80, 80, 80, 0.60)' : dimLineColor;

    if (state.map.getLayer('zones-fill')) {
        state.map.setPaintProperty('zones-fill', 'fill-color', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], '#30d158',
            ['boolean', ['feature-state', 'hover'], false], '#30d158',
            ['match', ['get', 'cid'], 'Oakridge', true, 'Cottage Grove', true, false], noDataFillColor,
            defaultFillColor
        ]);
        state.map.setPaintProperty('zones-fill', 'fill-opacity', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 0.35,
            ['boolean', ['feature-state', 'hover'], false], 0.2,
            ['match', ['get', 'cid'], 'Oakridge', true, 'Cottage Grove', true, false], noDataFillOpacity,
            defaultFillOpacity
        ]);
    }

    if (state.map.getLayer('zones-outline')) {
        state.map.setPaintProperty('zones-outline', 'line-color', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], '#00ff66',
            ['boolean', ['feature-state', 'hover'], false], '#30d158',
            ['match', ['get', 'cid'], 'Oakridge', true, 'Cottage Grove', true, false], noDataLineColor,
            defaultLineColor
        ]);
        state.map.setPaintProperty('zones-outline', 'line-width', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 3.2,
            ['boolean', ['feature-state', 'hover'], false], 2.8,
            defaultLineWidth
        ]);
    }

    if (state.map.getLayer('zones-labels')) {
        const textColor = isLightBasemap ? '#000000' : '#ffffff';
        const haloColor = isLightBasemap ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 15, 15, 0.95)';
        const haloWidth = isLightBasemap ? 2.0 : 1.8;

        state.map.setPaintProperty('zones-labels', 'text-color', textColor);
        state.map.setPaintProperty('zones-labels', 'text-halo-color', haloColor);
        state.map.setPaintProperty('zones-labels', 'text-halo-width', haloWidth);
    }
}

const state = {
    allFeatures: [],
    circlesFeatures: [],
    eugeneFeatures: [],
    florenceFeatures: [],
    currentFeature: "eugene", // "circles", "eugene", "florence"
    isCirclesFeature: false,
    currentId: CIRCLE_ID,
    activeTab: "items",
    isSwipeTransitionActive: false,
    map: null,
    geoJsonLayer: null,
    featureLayersMap: new Map(), // maps zoneId/cid -> leaflet layer
    lastZoneClickTime: 0,
    userLocationMarker: null,
    userLocationAccuracy: null,
    isLocating: false,
    locateControl: null,
    fullscreenControl: null,
    layersControl: null,
    focusedTileIndex: -1,
    lastNavSource: "click",
    baseMapsList: [],
    currentBaseLayer: "dark",
    snapState: "default"
};

function normalizeZoneId(value) {
    if (!value) return "";
    const upper = String(value).toUpperCase().trim();
    const match = upper.match(/^0*(\d+)([A-Z]?)$/);
    if (!match) return upper;
    return `${Number(match[1])}${match[2]}`;
}

function displayZoneId(zid) {
    return String(zid || "").toUpperCase().trim();
}

function zoneImagePath(zoneId) {
    let zid = displayZoneId(zoneId);
    if (!zid) return FALLBACK_IMAGE;

    if (zid === "6A" || zid === "6B" || zid === "06A" || zid === "06B") return "../images/zone-images/z06-01.jpg";
    if (zid === "8" || zid === "08") return "../images/zone-images/z08A-01.jpg";
    if (zid === "20B") return "../images/zone-images/20B-01.jpg";
    if (zid === "1") zid = "01";

    return `../images/zone-images/z${zid}-01.jpg`;
}

function formatDate(value) {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatArea(value) {
    const num = Number(value);
    if (Number.isNaN(num)) return "-";
    return num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function showToast(message, isError = false) {
    let toast = document.getElementById("toast-notification");
    const container = document.querySelector(".maps-tile-map-area") || document.body;
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        toast.className = "toast-notification";
        container.appendChild(toast);
    } else if (toast.parentElement !== container) {
        container.appendChild(toast);
    }

    toast.innerHTML = `<span>${message}</span>`;

    if (isError) {
        toast.classList.add("toast-notification--disabled");
    } else {
        toast.classList.remove("toast-notification--disabled");
    }
    toast.classList.add("is-visible");
    if (window._toastTimer) clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2800);
}

// --- Client-Side Exporter Helpers (GeoJSON, KMZ, GPX) ---
function getActiveDownloadFilename(ext) {
    let base = "map-data";
    if (state.currentFeature === "circles") {
        base = "circles-wgs84";
    } else if (state.currentFeature === "florence") {
        base = (state.currentId && state.currentId !== CIRCLE_ID) 
            ? `Florence-Zone-${displayZoneId(state.currentId)}` 
            : "Florence-00-wgs84";
    } else {
        base = (state.currentId && state.currentId !== CIRCLE_ID) 
            ? `Eugene-Zone-${displayZoneId(state.currentId)}` 
            : "Eugene-01-wgs84";
    }
    return `${base}.${ext}`;
}

function getSelectedGeoJSONData() {
    let features = state.allFeatures || [];
    if (!state.isCirclesFeature && state.currentId && state.currentId !== CIRCLE_ID) {
        const target = features.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
        });
        if (target) {
            features = [target];
        }
    }
    return {
        type: "FeatureCollection",
        features: JSON.parse(JSON.stringify(features))
    };
}

function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

function geojsonToKml(geojson, docName = "Map Data") {
    function esc(str) {
        if (str === null || str === undefined) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function coordsToKml(coords) {
        return coords.map(c => `${c[0]},${c[1]}${c[2] !== undefined ? ',' + c[2] : ''}`).join(' ');
    }

    function geometryToKml(geom) {
        if (!geom) return '';
        switch (geom.type) {
            case 'Point':
                return `<Point><coordinates>${geom.coordinates[0]},${geom.coordinates[1]}</coordinates></Point>`;
            case 'LineString':
                return `<LineString><coordinates>${coordsToKml(geom.coordinates)}</coordinates></LineString>`;
            case 'Polygon':
                return `<Polygon>${geom.coordinates.map((ring, i) => 
                    i === 0 
                        ? `<outerBoundaryIs><LinearRing><coordinates>${coordsToKml(ring)}</coordinates></LinearRing></outerBoundaryIs>`
                        : `<innerBoundaryIs><LinearRing><coordinates>${coordsToKml(ring)}</coordinates></LinearRing></innerBoundaryIs>`
                ).join('')}</Polygon>`;
            case 'MultiPolygon':
                return `<MultiGeometry>${geom.coordinates.map(polyCoords => 
                    geometryToKml({ type: 'Polygon', coordinates: polyCoords })
                ).join('')}</MultiGeometry>`;
            case 'MultiPoint':
                return `<MultiGeometry>${geom.coordinates.map(ptCoords => 
                    geometryToKml({ type: 'Point', coordinates: ptCoords })
                ).join('')}</MultiGeometry>`;
            case 'MultiLineString':
                return `<MultiGeometry>${geom.coordinates.map(lineCoords => 
                    geometryToKml({ type: 'LineString', coordinates: lineCoords })
                ).join('')}</MultiGeometry>`;
            case 'GeometryCollection':
                return `<MultiGeometry>${geom.geometries.map(g => geometryToKml(g)).join('')}</MultiGeometry>`;
            default:
                return '';
        }
    }

    const features = geojson.type === 'FeatureCollection' ? geojson.features : (geojson.type === 'Feature' ? [geojson] : []);
    
    const kmlPlacemarks = features.map(f => {
        const props = f.properties || {};
        const title = esc(props.name || props.zid || props.cid || props.title || "Feature");
        const descData = Object.entries(props)
            .map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`)
            .join('<br/>');
        return `
    <Placemark>
      <name>${title}</name>
      <description><![CDATA[${descData}]]></description>
      ${geometryToKml(f.geometry)}
    </Placemark>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(docName)}</name>${kmlPlacemarks}
  </Document>
</kml>`;
}

function geojsonToGpx(geojson, docName = "Map Data") {
    function esc(str) {
        if (str === null || str === undefined) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    const features = geojson.type === 'FeatureCollection' ? geojson.features : (geojson.type === 'Feature' ? [geojson] : []);
    let gpxWpts = "";
    let gpxTrks = "";

    features.forEach(f => {
        const props = f.properties || {};
        const title = esc(props.name || props.zid || props.cid || props.title || "Feature");
        const geom = f.geometry;
        if (!geom) return;

        function processLine(coords, trkName) {
            const pts = coords.map(c => `<trkpt lat="${c[1]}" lon="${c[0]}"/>`).join('\n        ');
            return `
  <trk>
    <name>${trkName}</name>
    <trkseg>
        ${pts}
    </trkseg>
  </trk>`;
        }

        if (geom.type === 'Point') {
            gpxWpts += `
  <wpt lat="${geom.coordinates[1]}" lon="${geom.coordinates[0]}">
    <name>${title}</name>
  </wpt>`;
        } else if (geom.type === 'LineString') {
            gpxTrks += processLine(geom.coordinates, title);
        } else if (geom.type === 'MultiLineString') {
            geom.coordinates.forEach((line, idx) => {
                gpxTrks += processLine(line, `${title} (${idx + 1})`);
            });
        } else if (geom.type === 'Polygon') {
            geom.coordinates.forEach((ring, idx) => {
                const ringName = idx === 0 ? title : `${title} (Hole ${idx})`;
                gpxTrks += processLine(ring, ringName);
            });
        } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach((poly, polyIdx) => {
                poly.forEach((ring, ringIdx) => {
                    const ringName = ringIdx === 0 ? `${title} (Part ${polyIdx + 1})` : `${title} (Part ${polyIdx + 1} Hole ${ringIdx})`;
                    gpxTrks += processLine(ring, ringName);
                });
            });
        }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fovea Web Map" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(docName)}</name>
  </metadata>${gpxWpts}${gpxTrks}
</gpx>`;
}

function switchBaseMap(baseMapId) {
    if (!state.map || !state.baseMapsList) return;
    const targetMap = state.baseMapsList.find(b => b.id === baseMapId);
    if (!targetMap) return;
    
    state.baseMapsList.forEach(bm => {
        if (state.map.getLayer(bm.layerId)) {
            state.map.setLayoutProperty(bm.layerId, 'visibility', bm.layerId === targetMap.layerId ? 'visible' : 'none');
        }
        const lowResLayerId = `${bm.layerId}-low`;
        if (state.map.getLayer(lowResLayerId)) {
            state.map.setLayoutProperty(lowResLayerId, 'visibility', bm.layerId === targetMap.layerId ? 'visible' : 'none');
        }
    });
    state.currentBaseLayer = baseMapId;

    const tileMapEl = document.getElementById("tile-map");
    if (tileMapEl) {
        tileMapEl.style.setProperty("background-color", "#000000", "important");
        tileMapEl.style.setProperty("background", "#000000", "important");
    }

    const mapWrapper = document.getElementById("map-wrapper");
    if (mapWrapper) {
        if (baseMapId === "esri-street" || baseMapId === "esri-topo") {
            mapWrapper.classList.add("is-light-basemap");
        } else {
            mapWrapper.classList.remove("is-light-basemap");
        }
    }

    if (typeof updateAllFeatureStyles === "function") {
        updateAllFeatureStyles();
    }
}

function getLayoutScaleBar(map, layoutMapWidth) {
    if (!map) return { miles: 1, pxWidth: 150 };
    const canvas = map.getCanvas();
    const cX = canvas.width / 2;
    const cY = canvas.height / 2;
    
    const samplePx = 200;
    const p1 = map.unproject([cX - (samplePx / 2), cY]);
    const p2 = map.unproject([cX + (samplePx / 2), cY]);
    
    let distMiles = 1;
    if (typeof turf !== "undefined" && turf.distance) {
        distMiles = turf.distance([p1.lng, p1.lat], [p2.lng, p2.lat], { units: "miles" });
    } else {
        const lat1 = p1.lat * Math.PI / 180;
        const lat2 = p2.lat * Math.PI / 180;
        const dLat = (p2.lat - p1.lat) * Math.PI / 180;
        const dLon = (p2.lng - p1.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distMiles = 3958.8 * c;
    }

    const milesPerLayoutPx = distMiles / (samplePx * (layoutMapWidth / canvas.width));
    const targetPx = 200;
    const approxMiles = targetPx * milesPerLayoutPx;
    
    const niceIncrements = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 50, 100];
    let chosenMiles = niceIncrements[0];
    let minDiff = Math.abs(approxMiles - chosenMiles);
    for (let i = 1; i < niceIncrements.length; i++) {
        const diff = Math.abs(approxMiles - niceIncrements[i]);
        if (diff < minDiff) {
            minDiff = diff;
            chosenMiles = niceIncrements[i];
        }
    }

    const scaleBarPx = Math.max(100, Math.min(450, chosenMiles / milesPerLayoutPx));
    return { miles: chosenMiles, pxWidth: scaleBarPx };
}

function loadQrCodeImage(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&format=png&data=${encodeURIComponent(dataUrl)}`;
        setTimeout(() => resolve(null), 1500);
    });
}

async function renderMapLayoutCanvas() {
    showToast("Rendering Esri Topo Print Layout...");
    
    // Remember current active basemap to restore later
    const previousBaseLayer = state.currentBaseLayer || "dark";
    
    // Get map wrapper and tile-map elements to temporarily resize to high resolution print canvas size
    const mapWrapper = document.getElementById("map-wrapper");
    const tileMap = document.getElementById("tile-map");
    let origStyle = "";
    let origTileStyle = "";
    if (mapWrapper && tileMap) {
        origStyle = mapWrapper.getAttribute("style") || "";
        origTileStyle = tileMap.getAttribute("style") || "";
        
        // Temporarily size mapWrapper to 2280x1500 (landscape printing canvas size) and push offscreen
        mapWrapper.style.setProperty("position", "fixed", "important");
        mapWrapper.style.setProperty("left", "-9999px", "important");
        mapWrapper.style.setProperty("top", "0px", "important");
        mapWrapper.style.setProperty("width", "2280px", "important");
        mapWrapper.style.setProperty("height", "1500px", "important");
        mapWrapper.style.setProperty("z-index", "-99999", "important");
        
        // Also force tile-map to override mobile's 100vh rule to match wrapper dimensions
        tileMap.style.setProperty("width", "2280px", "important");
        tileMap.style.setProperty("height", "1500px", "important");
        
        if (state.map) {
            state.map.resize();
        }
    }

    try {
        // Switch basemap to Esri Topo if not already active
        if (state.currentBaseLayer !== "esri-topo") {
            switchBaseMap("esri-topo");
        }

        // Fit map bounds to the current selected feature on the print viewport layout with generous margins (padding)
        if (state.map) {
            const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
            let targetFeature = null;
            if (!isCircle) {
                targetFeature = state.allFeatures.find(f => {
                    const zid = f.properties?.zid;
                    return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                });
            }
            
            // padding: 120 adds a clean margin of 120 pixels around the feature so it doesn't touch the map frame borders
            if (isCircle || !targetFeature) {
                state.map.fitBounds(getBbox(state.allFeatures), { padding: 120, animate: false });
            } else {
                state.map.fitBounds(getBbox([targetFeature]), { padding: 120, maxZoom: 14, animate: false });
            }
        }

        // Wait for MapLibre to load and render Esri Topo tiles
        await new Promise((resolve) => {
            let checkCount = 0;
            const checkIdle = () => {
                checkCount++;
                if ((state.map && state.map.areTilesLoaded()) || checkCount > 35) {
                    if (state.map) state.map.off('idle', checkIdle);
                    resolve();
                }
            };
            if (state.map) {
                state.map.on('idle', checkIdle);
                state.map.triggerRepaint();
            }
            setTimeout(resolve, 1500); // Failsafe timeout for network tiles
        });

        const mapCanvas = state.map ? state.map.getCanvas() : null;

        // High resolution layout canvas (2400 x 1800 px - 4:3 ratio, print-optimized quality)
        const layoutCanvas = document.createElement("canvas");
        const width = 2400;
        const height = 1800;
        layoutCanvas.width = width;
        layoutCanvas.height = height;
        const ctx = layoutCanvas.getContext("2d");

        // 1. Pure White outer canvas background (Paper Print-Friendly)
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        // 2. Define inner map frame layout box
        const mapMargin = 60;
        const headerHeight = 110;
        const footerHeight = 70;

        const mapX = mapMargin;
        const mapY = mapMargin + headerHeight;
        const mapW = width - (mapMargin * 2);
        const mapH = height - mapY - footerHeight - mapMargin;

        // Background for map box (clean off-white for topo rendering)
        ctx.fillStyle = "#f9fafb";
        ctx.fillRect(mapX, mapY, mapW, mapH);

        // Draw MapLibre WebGL canvas image into map box (no stretching needed as viewport is exactly 2280x1500)
        if (mapCanvas) {
            try {
                ctx.drawImage(mapCanvas, mapX, mapY, mapW, mapH);
            } catch (err) {
                console.warn("Could not draw map canvas directly:", err);
            }
        }

        // Inner map frame border - Crisp minimal dark border
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 3;
        ctx.strokeRect(mapX, mapY, mapW, mapH);

        // 3. Header Text (No border box around header text!)
        const hasSpecificZone = state.currentId && state.currentId !== CIRCLE_ID;

        // Header Title Text (Crisp Dark Typography for Paper Printing)
        ctx.fillStyle = "#111827";
        ctx.font = "bold 46px system-ui, -apple-system, sans-serif";
        const headerTitleText = state.isCirclesFeature 
            ? "COAST TO CASCADES BIRD ALLIANCE" 
            : (state.currentFeature === "florence" ? "FLORENCE CHRISTMAS BIRD COUNT" : "EUGENE CHRISTMAS BIRD COUNT");
        ctx.fillText(headerTitleText, mapMargin, mapMargin + 45);

        // Subtitle / Selection Name (ONLY if specific zone, remove "COUNT CIRCLE MAP")
        if (hasSpecificZone) {
            ctx.fillStyle = "#059669";
            ctx.font = "bold 30px system-ui, -apple-system, sans-serif";
            const subTitleText = `SURVEY ZONE ${displayZoneId(state.currentId)}`;
            ctx.fillText(subTitleText, mapMargin, mapMargin + 90);
        }

        // Date & Basemap Metadata (Right-aligned, no box)
        ctx.fillStyle = "#374151";
        ctx.font = "26px system-ui, -apple-system, sans-serif";
        ctx.textAlign = "right";
        const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        ctx.fillText(dateStr, mapMargin + mapW, mapMargin + 45);
        ctx.font = "20px system-ui, -apple-system, sans-serif";
        ctx.fillStyle = "#6b7280";
        ctx.fillText("Base Map: Esri World Topography", mapMargin + mapW, mapMargin + 85);
        ctx.textAlign = "left";

        // 4. Minimal Cartographic Map Overlays
        // North Arrow Emblem (Minimalist Print Style)
        const naX = mapX + mapW - 75;
        const naY = mapY + 85;
        ctx.save();
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.beginPath();
        ctx.arc(naX, naY, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // North Pointer Needle
        ctx.fillStyle = "#111827";
        ctx.beginPath();
        ctx.moveTo(naX, naY - 28);
        ctx.lineTo(naX + 12, naY + 8);
        ctx.lineTo(naX, naY + 2);
        ctx.fill();

        ctx.fillStyle = "#9ca3af";
        ctx.beginPath();
        ctx.moveTo(naX, naY - 28);
        ctx.lineTo(naX - 12, naY + 8);
        ctx.lineTo(naX, naY + 2);
        ctx.fill();

        ctx.fillStyle = "#111827";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("N", naX, naY - 32);
        ctx.restore();

        // Actual Calculated Scale Bar in Miles (Bottom Left of Map Area)
        const scaleInfo = getLayoutScaleBar(state.map, mapW);

        const barX = mapX + 30;
        const barY = mapY + mapH - 100;
        const barW = Math.max(260, scaleInfo.pxWidth + 60);
        const barH = 70;

        // Scale Box
        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.fillRect(barX, barY, barW, barH);
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barW, barH);

        // Scale Bar Line & Ticks
        const lineStartX = barX + 30;
        const lineEndX = lineStartX + scaleInfo.pxWidth;
        const lineY = barY + 45;

        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lineStartX, lineY);
        ctx.lineTo(lineEndX, lineY);
        ctx.moveTo(lineStartX, lineY - 8);
        ctx.lineTo(lineStartX, lineY + 8);
        ctx.moveTo(lineEndX, lineY - 8);
        ctx.lineTo(lineEndX, lineY + 8);
        const midX = (lineStartX + lineEndX) / 2;
        ctx.moveTo(midX, lineY - 5);
        ctx.lineTo(midX, lineY + 5);
        ctx.stroke();

        // Scale Bar Numerical Labels
        ctx.fillStyle = "#111827";
        ctx.font = "bold 16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("0", lineStartX, lineY - 12);
        ctx.fillText(`${scaleInfo.miles} mi`, lineEndX, lineY - 12);
        ctx.textAlign = "left";

        // QR Code Box Overlay (Bottom Right of Map Area)
        const qrX = mapX + mapW - 175;
        const qrY = mapY + mapH - 190;
        const qrBoxW = 150;
        const qrBoxH = 165;

        ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
        ctx.fillRect(qrX, qrY, qrBoxW, qrBoxH);
        ctx.strokeStyle = "#111827";
        ctx.lineWidth = 2;
        ctx.strokeRect(qrX, qrY, qrBoxW, qrBoxH);

        let qrDrawn = false;
        if (typeof QRCode !== "undefined") {
            try {
                const qrContainer = document.createElement("div");
                new QRCode(qrContainer, {
                    text: window.location.href,
                    width: 120,
                    height: 120,
                    correctLevel: QRCode.CorrectLevel.M
                });
                const qrCanvas = qrContainer.querySelector("canvas");
                const qrImg = qrContainer.querySelector("img");
                if (qrCanvas) {
                    ctx.drawImage(qrCanvas, qrX + 15, qrY + 12, 120, 120);
                    qrDrawn = true;
                } else if (qrImg && qrImg.complete) {
                    ctx.drawImage(qrImg, qrX + 15, qrY + 12, 120, 120);
                    qrDrawn = true;
                }
            } catch (e) {
                console.warn("QRCode generation error:", e);
            }
        }

        if (!qrDrawn) {
            const qrImage = await loadQrCodeImage(window.location.href);
            if (qrImage) {
                ctx.drawImage(qrImage, qrX + 15, qrY + 12, 120, 120);
            }
        }

        ctx.fillStyle = "#111827";
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("SCAN FOR ONLINE MAP", qrX + (qrBoxW / 2), qrY + 152);
        ctx.textAlign = "left";

        // 5. Clean Footer Text (No border box around footer text!)
        const footY = height - footerHeight - mapMargin + 18;

        ctx.fillStyle = "#374151";
        ctx.font = "19px system-ui, sans-serif";
        const bbox = getBbox(state.allFeatures);
        const boundsText = `Spatial Extent (WGS84): [${bbox[0][0].toFixed(4)}°W, ${bbox[0][1].toFixed(4)}°N] to [${bbox[1][0].toFixed(4)}°W, ${bbox[1][1].toFixed(4)}°N]`;
        ctx.fillText(boundsText, mapMargin, footY + 24);

        ctx.fillStyle = "#6b7280";
        ctx.font = "16px system-ui, sans-serif";
        ctx.fillText("Printed with Fovea | Esri World Topographic Basemap © Esri, DeLorme, NAVTEQ", mapMargin, footY + 52);

        return layoutCanvas;
    } finally {
        // Restore previous basemap if changed
        if (previousBaseLayer !== "esri-topo") {
            switchBaseMap(previousBaseLayer);
        }
        
        // Restore map wrapper and tile-map size/display
        if (mapWrapper && tileMap) {
            if (origStyle) {
                mapWrapper.setAttribute("style", origStyle);
            } else {
                mapWrapper.removeAttribute("style");
            }
            if (origTileStyle) {
                tileMap.setAttribute("style", origTileStyle);
            } else {
                tileMap.removeAttribute("style");
            }
            if (state.map) {
                state.map.resize();
            }
        }
        
        // Restore original viewport zoom and bounds for screen
        selectSubject(state.currentId, true, false);
    }
}

function canvasToTiffBlob(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, width, height);
    const rgba = imgData.data;

    const numPixels = width * height;
    const rgb = new Uint8Array(numPixels * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        rgb[j] = rgba[i];       // R
        rgb[j + 1] = rgba[i + 1]; // G
        rgb[j + 2] = rgba[i + 2]; // B
    }

    const imageByteCount = rgb.length;
    const headerSize = 8;
    const ifdOffset = headerSize + imageByteCount;
    const numEntries = 12;
    const ifdSize = 2 + (numEntries * 12) + 4;
    const valueDataOffset = ifdOffset + ifdSize;

    const totalSize = valueDataOffset + 6;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);

    // TIFF Header ("II" Little Endian)
    u8[0] = 0x49; u8[1] = 0x49;
    view.setUint16(2, 42, true);
    view.setUint32(4, ifdOffset, true);

    // Write RGB Pixels
    u8.set(rgb, headerSize);

    // BitsPerSample values (8, 8, 8)
    const bitsOffset = valueDataOffset;
    view.setUint16(bitsOffset, 8, true);
    view.setUint16(bitsOffset + 2, 8, true);
    view.setUint16(bitsOffset + 4, 8, true);

    // IFD Tags
    let p = ifdOffset;
    view.setUint16(p, numEntries, true); p += 2;

    function writeTag(tag, type, count, value) {
        view.setUint16(p, tag, true);
        view.setUint16(p + 2, type, true);
        view.setUint32(p + 4, count, true);
        view.setUint32(p + 8, value, true);
        p += 12;
    }

    writeTag(256, 4, 1, width);               // ImageWidth
    writeTag(257, 4, 1, height);              // ImageLength
    writeTag(258, 3, 3, bitsOffset);          // BitsPerSample
    writeTag(259, 3, 1, 1);                   // Compression = 1 (Uncompressed)
    writeTag(262, 3, 1, 2);                   // PhotometricInterpretation = 2 (RGB)
    writeTag(273, 4, 1, headerSize);          // StripOffsets
    writeTag(277, 3, 1, 3);                   // SamplesPerPixel = 3
    writeTag(278, 4, 1, height);              // RowsPerStrip
    writeTag(279, 4, 1, imageByteCount);      // StripByteCounts
    writeTag(282, 5, 1, valueDataOffset);     // XResolution
    writeTag(283, 5, 1, valueDataOffset);     // YResolution
    writeTag(296, 3, 1, 2);                   // ResolutionUnit = 2 (Inch)

    view.setUint32(p, 0, true);

    return new Blob([buffer], { type: "image/tiff" });
}

async function downloadGeoPdf() {
    const canvas = await renderMapLayoutCanvas();
    const filename = getActiveDownloadFilename("pdf");
    
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
            keywords: "GeoPDF, GIS, Map, Esri Topo, Fovea",
            creator: "Fovea Web Map Layout Engine"
        });

        pdf.save(filename);
        showToast(`Exported ${filename}`);
    } else {
        canvas.toBlob((blob) => {
            saveBlob(blob, filename.replace(/\.pdf$/, "-layout.png"));
            showToast(`Exported ${filename.replace(/\.pdf$/, "-layout.png")}`);
        }, "image/png");
    }
}

async function downloadGeoTiff() {
    const canvas = await renderMapLayoutCanvas();
    const filename = getActiveDownloadFilename("tif");
    const tiffBlob = canvasToTiffBlob(canvas);
    saveBlob(tiffBlob, filename);
    showToast(`Exported ${filename}`);
}

function getInitialIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const circleParam = params.get("circle") || params.get("cid");
    if (circleParam) {
        const cName = circleParam.trim();
        const lowerName = cName.toLowerCase();
        if (lowerName === "eugene") {
            state.currentFeature = "eugene";
            state.isCirclesFeature = false;
            return CIRCLE_ID;
        } else if (lowerName === "florence") {
            state.currentFeature = "florence";
            state.isCirclesFeature = false;
            return CIRCLE_ID;
        } else {
            state.currentFeature = "circles";
            state.isCirclesFeature = true;
            return cName;
        }
    }

    const feature = (params.get("feature") || "").toLowerCase();
    if (feature === "circles") {
        state.currentFeature = "circles";
        state.isCirclesFeature = true;
    } else if (feature === "florence") {
        state.currentFeature = "florence";
        state.isCirclesFeature = false;
    } else {
        state.currentFeature = "eugene";
        state.isCirclesFeature = false;
    }

    const zone = params.get("zone");
    if (zone) return zone.trim();
    const id = params.get("id");
    return id ? id.trim() : CIRCLE_ID;
}

function updateUrl(id) {
    const url = new URL(window.location.href);
    url.searchParams.delete("id");

    if (state.isCirclesFeature) {
        url.searchParams.set("feature", "circles");
        url.searchParams.delete("zone");
    } else {
        url.searchParams.set("feature", state.currentFeature);
        if (id && id !== CIRCLE_ID) {
            let zid = id;
            const targetFeature = state.allFeatures.find(f => {
                const fzid = f.properties?.zid;
                return fzid && (fzid.toLowerCase() === id.toLowerCase() || normalizeZoneId(fzid) === normalizeZoneId(id));
            });
            if (targetFeature && targetFeature.properties?.zid) {
                zid = displayZoneId(targetFeature.properties.zid);
            }
            url.searchParams.set("zone", zid);
        } else {
            url.searchParams.delete("zone");
        }
    }
    window.history.replaceState({}, "", url.toString());
}

function updateControlPositions() {
    if (!state.map) return;
    const isMobile = window.innerWidth <= 768;
    const topLeft = document.querySelector(".map-ctrl-container .map-ctrl-panel.map-ctrl-panel--left");
    const topRight = document.querySelector(".map-ctrl-container .map-ctrl-panel.map-ctrl-panel--right");
    const zoomCtrl = document.querySelector(".map-ctrl-zoom");
    const locateCtrl = document.querySelector(".map-ctrl-locate");
    const fsCtrl = document.querySelector(".map-ctrl-fullscreen");
    const layersCtrl = document.querySelector(".map-ctrl-styles");

    if (isMobile) {
        // Zoom → top-right panel
        if (topRight && zoomCtrl) topRight.appendChild(zoomCtrl);
        // Mobile bottom-right row, left-to-right: map styles → location → fullscreen
        if (topLeft) {
            if (layersCtrl) topLeft.appendChild(layersCtrl);
            if (locateCtrl) topLeft.appendChild(locateCtrl);
            if (fsCtrl) topLeft.appendChild(fsCtrl);
        }
    } else {
        // All → bottom-left, stacked vertically. flex-direction:column-reverse means
        // first appended = visually at bottom. Order from bottom to top:
        // zoom (bottom) → fullscreen → locate → map styles (top)
        if (topLeft) {
            if (zoomCtrl) topLeft.appendChild(zoomCtrl);
            if (fsCtrl) topLeft.appendChild(fsCtrl);
            if (locateCtrl) topLeft.appendChild(locateCtrl);
            if (layersCtrl) topLeft.appendChild(layersCtrl);
        }
    }
}

function updateHeaderLogo() {
    const logoImg = document.querySelector(".logo--header");
    const logoText = document.getElementById("header-logo-text");
    if (!logoImg) return;

    if (state.isCirclesFeature || state.currentFeature === "circles") {
        logoImg.src = "../images/whiteLane-Audubon-favicon-152.png";
        logoImg.alt = "Audubon Circles";
        if (logoText) {
            logoText.textContent = "";
            logoText.classList.remove("is-visible");
        }
    } else {
        if (state.currentFeature === "florence") {
            logoImg.src = "../images/florence.png";
            logoImg.alt = "Florence Christmas Bird Count";
        } else {
            logoImg.src = "../images/logo-small.png";
            logoImg.alt = "Eugene Christmas Bird Count";
        }

        const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
        let targetFeature = null;
        if (!isCircle) {
            targetFeature = state.allFeatures.find(f => {
                const zid = f.properties?.zid;
                return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
            });
        }

        if (logoText) {
            logoText.textContent = "";
            logoText.classList.remove("is-visible");
        }
    }
}

function adjustHeaderFontSize() {
    const titleEl = document.getElementById("header-title");
    if (!titleEl) return;

    // Reset to default first
    titleEl.style.fontSize = "1.25rem";

    // Only adjust if visible
    if (titleEl.offsetParent === null && titleEl.offsetHeight === 0) return;

    const minSize = 0.55;
    let currentSize = 1.25;
    const decrement = 0.05;

    // Temporarily bypass the CSS max-height cap so we can measure true text height
    const savedMaxHeight = titleEl.style.maxHeight;
    const savedOverflow = titleEl.style.overflow;
    titleEl.style.maxHeight = "none";
    titleEl.style.overflow = "visible";

    const getTwoLineBudget = () => {
        const lh = parseFloat(window.getComputedStyle(titleEl).lineHeight);
        return lh * 2;
    };

    // Scale down until the natural scrollHeight fits within 2-line budget
    while (titleEl.scrollHeight > getTwoLineBudget() + 1 && currentSize > minSize) {
        currentSize = Math.max(minSize, currentSize - decrement);
        titleEl.style.fontSize = `${currentSize}rem`;
    }

    // Restore capping
    titleEl.style.maxHeight = savedMaxHeight;
    titleEl.style.overflow = savedOverflow;
}

function balancedHeaderHTML(title) {
    const words = title.trim().split(/\s+/);
    if (words.length <= 3) {
        // Short title: single line, no break needed
        return words.map(w => w.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')).join(' ');
    }
    // Split at ceiling of midpoint so top line gets slightly more words
    const splitAt = Math.ceil(words.length / 2);
    const line1 = words.slice(0, splitAt);
    const line2 = words.slice(splitAt);
    const escape = w => w.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return line1.map(escape).join(' ') + '<br>' + line2.map(escape).join(' ');
}

function updateHeader(subjectTitle) {
    const titleEl = document.getElementById("header-title");
    if (titleEl) {
        titleEl.innerHTML = balancedHeaderHTML(subjectTitle);
    }
    updateHeaderLogo();
    adjustHeaderFontSize();
}

/**
 * Returns fitBounds padding that keeps selections clear of the toolbar (top),
 * map controls (bottom/sides), and gives generous visual breathing room.
 * On mobile the toolbar is taller and controls sit at the bottom.
 */
function getFitPadding(extra = 0) {
    const mobile = window.innerWidth <= 768;
    if (mobile) {
        // The visible area of the map is the space above the sidebar card.
        // The bottom portion of the 100vh map canvas is covered by the sidebar.
        // We read the current height of the sidebar to offset fitted elements into the visible space.
        const sidebar = document.querySelector(".maps-tile-sidebar");
        const hiddenHeight = sidebar ? sidebar.offsetHeight : (window.innerHeight * 0.5);
        const baseMargin = 50 + extra;
        return {
            top: 36 + baseMargin,
            bottom: hiddenHeight + baseMargin,
            left: 40 + extra,
            right: 40 + extra
        };
    } else {
        // On desktop, the toolbar is inside the sidebar and doesn't overlap the map area.
        const margin = 60 + extra;
        return {
            top: margin,
            bottom: margin,
            left: margin,
            right: margin
        };
    }
}

function switchToFeature(featureName, circleLayer) {
    if (!state.map) return;

    let transitionFinished = false;

    const performSwap = () => {
        if (transitionFinished) return;
        transitionFinished = true;

        state.currentFeature = featureName;
        state.isCirclesFeature = false;
        state.allFeatures = (featureName === "florence") ? state.florenceFeatures : state.eugeneFeatures;
        state.currentId = CIRCLE_ID;

        rebuildGeoJsonLayer();
        selectSubject(CIRCLE_ID, false);
    };

    if (circleLayer) {
        state.map.once("moveend", performSwap);
        state.map.fitBounds(circleLayer, {
            speed: 0.8,
            curve: 1.4,
            padding: getFitPadding()
        });
        setTimeout(performSwap, 1000);
    } else {
        performSwap();
    }
}

function switchToCirclesFeature() {
    state.currentFeature = "circles";
    state.isCirclesFeature = true;
    state.allFeatures = state.circlesFeatures;
    state.currentId = CIRCLE_ID;
    rebuildGeoJsonLayer();
    selectSubject(CIRCLE_ID, true);
}

function selectSubject(id, triggerMapZoom = true, animate = true) {
    window.scrollTo(0, 0);
    if (state.isHelpModeActive && window.innerWidth <= 768) return;
    state.currentId = id;
    const backBtn = document.getElementById("btn-capsule-back");

    if (state.isCirclesFeature) {
        updateHeader("Coast to Cascades Bird Alliance");
        if (backBtn) backBtn.classList.remove("is-visible");
        renderSidebarList();
        updateUrl(id);
        if (triggerMapZoom && state.map) {
            state.map.fitBounds(getBbox(state.allFeatures), {
                padding: getFitPadding(),
                animate: animate,
                speed: 0.8,
                curve: 1.4
            });
        }
        updateAllFeatureStyles();
        return;
    }

    const isCircle = !id || id === CIRCLE_ID;
    let targetFeature = null;
    if (!isCircle) {
        targetFeature = state.allFeatures.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === id.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(id));
        });
    }

    if (isCircle || !targetFeature) {
        const titleName = state.currentFeature === "florence" ? "Florence Christmas Bird Count Circle" : "Eugene Christmas Bird Count Circle";
        updateHeader(titleName);
        if (backBtn) {
            backBtn.classList.add("is-visible");
            backBtn.setAttribute("aria-label", "Back to all circles");
            backBtn.setAttribute("title", "Back to all circles");
        }
    } else {
        const zid = displayZoneId(targetFeature.properties.zid);
        updateHeader(`Zone ${zid}`);
        if (backBtn) {
            backBtn.classList.add("is-visible");
            backBtn.setAttribute("aria-label", "Back to full circle");
            backBtn.setAttribute("title", "Back to full circle");
        }
    }

    renderSidebarList();

    updateAllFeatureStyles();

    if (triggerMapZoom && state.map) {
        if (isCircle || !targetFeature) {
            state.map.fitBounds(getBbox(state.allFeatures), {
                padding: getFitPadding(),
                animate: animate,
                speed: 0.8,
                curve: 1.4
            });
        } else {
            state.map.fitBounds(getBbox([targetFeature]), {
                padding: getFitPadding(20),
                maxZoom: 14,
                animate: animate,
                speed: 0.8,
                curve: 1.4
            });
        }
    }

    updateUrl(id);
    if (typeof state.refreshLayersModal === "function") {
        state.refreshLayersModal();
    }
}

function renderSidebarList() {
    const itemsCapsule = document.querySelector('.sidebar-capsule[data-tab="items"]');
    if (itemsCapsule) {
        itemsCapsule.textContent = state.isCirclesFeature ? "Circles" : "Circle Zones";
    }

    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";

    if (state.isCirclesFeature) {
        if (state.activeTab === "about") {
            const aboutEl = document.createElement("div");
            aboutEl.className = "sidebar-about-wrapper";
            aboutEl.innerHTML = `
                <div class="sidebar-about-content">
                    <div class="sidebar-about-media">
                        <img src="../images/wetlands.jpg" alt="Audubon Circles" loading="lazy" />
                    </div>
                    <p class="sidebar-about-text">Audubon Christmas Bird Count regional count circles. Click a circle to explore its subdivided survey zones.</p>
                </div>
            `;
            listContainer.appendChild(aboutEl);
            return;
        }

        const NO_DATA_CIRCLES = new Set(["Oakridge", "Cottage Grove"]);
        const sortedCircles = [...state.circlesFeatures].sort((a, b) => {
            const cidA = String(a.properties?.cid || "");
            const cidB = String(b.properties?.cid || "");
            const noDataA = NO_DATA_CIRCLES.has(cidA) ? 1 : 0;
            const noDataB = NO_DATA_CIRCLES.has(cidB) ? 1 : 0;
            if (noDataA !== noDataB) return noDataA - noDataB;
            return cidA.localeCompare(cidB, undefined, { sensitivity: "base" });
        });

        sortedCircles.forEach(feature => {
            const props = feature.properties || {};
            const cid = props.cid || "Circle";
            const item = document.createElement("div");
            item.className = "tile-zone-item";
            item.setAttribute("data-id", cid);

            let thumbImg = "";
            let isLogo = false;
            let isNotAvailable = false;
            if (cid === "Eugene") {
                thumbImg = "../images/logo-small.png";
                isLogo = true;
            } else if (cid === "Florence") {
                thumbImg = "../images/florence.png";
                isLogo = true;
            } else if (cid === "Oakridge" || cid === "Cottage Grove") {
                isNotAvailable = true;
            } else {
                thumbImg = "../images/wetlands.jpg";
            }

            let thumbHtml = "";
            if (isNotAvailable) {
                thumbHtml = `
                    <div class="tile-zone-item__thumb-placeholder" title="No data available">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                        </svg>
                    </div>
                `;
            } else {
                thumbHtml = `
                    <div class="tile-zone-item__thumb ${isLogo ? "tile-zone-item__thumb--logo" : ""}">
                        <img src="${thumbImg}" alt="${cid}" loading="lazy">
                    </div>
                `;
            }

            item.innerHTML = `
                ${thumbHtml}
                <div class="tile-zone-item__info">
                    <div class="tile-zone-item__title">${cid}</div>
                </div>
            `;

            item.addEventListener("mouseenter", () => {
                if (state.map && state.map.getSource('zones')) {
                    state.map.setFeatureState({ source: 'zones', id: cid }, { hover: true });
                }
            });
            item.addEventListener("mouseleave", () => {
                if (state.map && state.map.getSource('zones')) {
                    state.map.setFeatureState({ source: 'zones', id: cid }, { hover: false });
                }
            });

            item.addEventListener("click", () => {
                const feature = state.circlesFeatures.find(f => f.properties.cid === cid);
                const bbox = feature ? getBbox(feature) : null;
                if (cid === "Eugene") {
                    switchToFeature("eugene", bbox);
                } else if (cid === "Florence") {
                    switchToFeature("florence", bbox);
                } else if (cid === "Oakridge" || cid === "Cottage Grove") {
                    showToast("There is no data for this count circle");
                }
            });
            listContainer.appendChild(item);
        });
        return;
    }

    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
    let targetFeature = null;
    if (!isCircle) {
        targetFeature = state.allFeatures.find(f => {
            const zid = f.properties?.zid;
            return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
        });
    }

    if (state.activeTab === "about") {
        const aboutEl = document.createElement("div");
        aboutEl.className = "sidebar-about-wrapper";

        let descText = "";
        let imgSrc = "";
        let imgAlt = "";

        if (isCircle || !targetFeature) {
            const circleTitle = state.currentFeature === "florence" ? "Florence Christmas Bird Count" : "Eugene Christmas Bird Count";
            descText = `The ${circleTitle} circle is a 15-mile diameter count circle in Oregon. Explore the survey zones to view spatial boundaries, detailed historical summaries, and field maps.`;
            imgSrc = "../images/wetlands.jpg";
            imgAlt = `${circleTitle} Overview`;
        } else {
            const props = targetFeature.properties || {};
            const zid = displayZoneId(props.zid);
            descText = props.description || "Zone description not available.";
            imgSrc = zoneImagePath(props.zid);
            imgAlt = `Zone ${zid} Image`;
        }

        aboutEl.innerHTML = `
            <div class="sidebar-about-content">
                ${imgSrc ? `
                    <div class="sidebar-about-media">
                        <img src="${imgSrc}" alt="${imgAlt}" loading="lazy" />
                    </div>
                ` : ""}
                <p class="sidebar-about-text">${descText}</p>
            </div>
        `;

        const img = aboutEl.querySelector("img");
        const mediaDiv = aboutEl.querySelector(".sidebar-about-media");
        if (img) {
            img.addEventListener("error", () => {
                if (imgSrc !== FALLBACK_IMAGE && !isCircle) {
                    img.src = FALLBACK_IMAGE;
                } else {
                    if (mediaDiv) mediaDiv.style.display = "none";
                }
            });
        }

        if (mediaDiv && img) {
            mediaDiv.addEventListener("click", () => {
                openImageLightbox(img.src, imgAlt, descText);
            });
        }

        listContainer.appendChild(aboutEl);
        return;
    }

    if (!isCircle && targetFeature) {
        const emptyEl = document.createElement("div");
        emptyEl.className = "sidebar-empty-state";
        emptyEl.innerHTML = `
            <svg class="sidebar-empty-state__icon" width="34" height="34" viewBox="0 0 512 512" fill="currentColor">
                <path d="M128 32h32c17.7 0 32 14.3 32 32V96H96V64c0-17.7 14.3-32 32-32zm64 96V448c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V388.9c0-34.6 9.4-68.6 27.2-98.3C40.9 267.8 49.7 242.4 53 216L60.5 156c2-16 15.6-28 31.8-28H192zm227.8 0c16.1 0 29.8 12 31.8 28L459 216c3.3 26.4 12.1 51.8 25.8 74.6c17.8 29.7 27.2 63.7 27.2 98.3V448c0 17.7-14.3 32-32 32H352c-17.7 0-32-14.3-32-32V128h99.8zM320 64c0-17.7 14.3-32 32-32h32c17.7 0 32 14.3 32 32V96H320V64zm-32 64V288H224V128h64z"/>
            </svg>
            <div class="sidebar-empty-state__text">no items found</div>
        `;
        listContainer.appendChild(emptyEl);
        return;
    }

    const sortedFeatures = [...state.allFeatures].sort((a, b) => {
        const zidA = String(a.properties?.zid || "");
        const zidB = String(b.properties?.zid || "");
        return zidA.localeCompare(zidB, undefined, { numeric: true, sensitivity: "base" });
    });

    sortedFeatures.forEach(feature => {
        const props = feature.properties || {};
        const zid = displayZoneId(props.zid);
        const item = document.createElement("div");
        item.className = "tile-zone-item";
        item.setAttribute("data-id", String(props.zid));

        const imgPath = zoneImagePath(props.zid);
        item.innerHTML = `
            <div class="tile-zone-item__thumb">
                <img src="${imgPath}" alt="Zone ${zid}" loading="lazy">
            </div>
            <div class="tile-zone-item__info">
                <div class="tile-zone-item__title">Zone ${zid}</div>
            </div>
        `;

        const img = item.querySelector("img");
        if (img) {
            img.addEventListener("error", () => {
                img.src = FALLBACK_IMAGE;
            });
        }

        item.addEventListener("mouseenter", () => {
            const featureId = String(props.zid || "");
            const isSelected = state.currentId !== CIRCLE_ID && (featureId === state.currentId || normalizeZoneId(featureId) === normalizeZoneId(state.currentId));
            if (!isSelected && state.map && state.map.getSource('zones')) {
                state.map.setFeatureState({ source: 'zones', id: featureId }, { hover: true });
            }
        });
        item.addEventListener("mouseleave", () => {
            const featureId = String(props.zid || "");
            const isSelected = state.currentId !== CIRCLE_ID && (featureId === state.currentId || normalizeZoneId(featureId) === normalizeZoneId(state.currentId));
            if (!isSelected && state.map && state.map.getSource('zones')) {
                state.map.setFeatureState({ source: 'zones', id: featureId }, { hover: false });
            }
        });

        item.addEventListener("click", () => selectSubject(String(props.zid)));
        listContainer.appendChild(item);
    });

    if (state.lastNavSource === "keyboard") {
        state.focusedTileIndex = 0;
        updateKeyboardTileFocus(0);
    } else {
        state.focusedTileIndex = -1;
        updateKeyboardTileFocus(-1);
    }
}

function updateKeyboardTileFocus(newIndex) {
    const tiles = document.querySelectorAll("#sidebar-zone-list .tile-zone-item");
    if (!tiles || tiles.length === 0) return;
    if (newIndex < -1) newIndex = -1;
    if (newIndex >= tiles.length) newIndex = tiles.length - 1;
    state.focusedTileIndex = newIndex;
    tiles.forEach((tile, idx) => {
        const cid = tile.getAttribute("data-id");
        const isSelected = state.currentId !== CIRCLE_ID && (cid === state.currentId || (typeof normalizeZoneId === "function" && normalizeZoneId(cid) === normalizeZoneId(state.currentId)));

        if (newIndex >= 0 && idx === newIndex) {
            tile.classList.add("is-hovered");
            if (!isSelected && state.map && state.map.getSource('zones')) {
                state.map.setFeatureState({ source: 'zones', id: cid }, { hover: true });
            }
        } else {
            tile.classList.remove("is-hovered");
            if (!isSelected && state.map && state.map.getSource('zones')) {
                state.map.setFeatureState({ source: 'zones', id: cid }, { hover: false });
            }
        }
    });
}

function selectMapStyleByIndex(index) {
    if (!state.baseMapsList || state.baseMapsList.length === 0 || !state.map) return;
    if (index < 0 || index >= state.baseMapsList.length) return;

    const targetItem = state.baseMapsList[index];
    state.baseMapsList.forEach(item => {
        if (item === targetItem) {
            if (!state.map.hasLayer(item.layer)) {
                state.map.addLayer(item.layer);
            }
        } else {
            if (state.map.hasLayer(item.layer)) {
                state.map.removeLayer(item.layer);
            }
        }
    });

    const layersControlEl = document.querySelector('.map-ctrl-styles');
    if (layersControlEl) {
        const inputs = layersControlEl.querySelectorAll('input[type="radio"]');
        if (inputs && inputs[index]) {
            inputs[index].checked = true;
        }
    }

    showToast(`Map Style: ${targetItem.name}`);
}

function setupMapEffectsAndFullscreen(mapWrapper) {
    if (!mapWrapper) return;

    mapWrapper.onmousemove = e => {
        const rect = mapWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        mapWrapper.style.setProperty("--mouse-x", `${x}px`);
        mapWrapper.style.setProperty("--mouse-y", `${y}px`);
    };

    mapWrapper.onmouseleave = () => {
        mapWrapper.style.setProperty("--mouse-x", `-1000px`);
        mapWrapper.style.setProperty("--mouse-y", `-1000px`);
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

    const handleResize = () => {
        updateControlPositions();
        adjustHeaderFontSize();
        if (state.map) {
            state.map.invalidateSize();
            setTimeout(() => state.map.invalidateSize(), 50);
            setTimeout(() => state.map.invalidateSize(), 200);
            setTimeout(() => state.map.invalidateSize(), 400);
        }
        updateLabelZoomVisibility();
    };

    document.addEventListener("fullscreenchange", () => {
        if (!document.fullscreenElement) {
            mapWrapper.classList.remove("is-fullscreen");
            triggerMobileHomeAnimation();
        } else {
            mapWrapper.classList.add("is-fullscreen");
        }
        handleResize();
    });

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
}

function toggleFullscreen() {
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

function highlightTileItem(key) {
    if (key == null) return;
    key = String(key);
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    const items = listContainer.querySelectorAll(".tile-zone-item");
    items.forEach(item => {
        const dataId = item.getAttribute("data-id") || "";
        const matches = dataId.toLowerCase() === key.toLowerCase() || (normalizeZoneId(dataId) === normalizeZoneId(key) && key !== CIRCLE_ID);
        if (matches) {
            item.classList.add("is-hovered");
        } else {
            item.classList.remove("is-hovered");
        }
    });
}

function unhighlightTileItem() {
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;
    const items = listContainer.querySelectorAll(".tile-zone-item");
    items.forEach(item => {
        item.classList.remove("is-hovered");
    });
}

function updateLabelZoomVisibility() {
    if (!state.map || !state.map.getLayer('zones-labels')) return;
    
    const isMobile = window.innerWidth <= 768;
    const circleCutoff = isMobile ? 5.5 : 7.5;
    const zoneCutoff = isMobile ? 8.0 : 10.0;
    
    const textSizeExpression = [
        'interpolate',
        ['linear'],
        ['zoom'],
        circleCutoff, 0,
        8, [
            'case',
            ['has', 'zid'], 0,
            ['<', ['coalesce', ['get', 'deg_width'], 0], ['*', ['coalesce', ['get', 'text_len'], 1], 0.010]], 0,
            17
        ],
        zoneCutoff, [
            'case',
            ['has', 'zid'], 0,
            ['<', ['coalesce', ['get', 'deg_width'], 0], ['*', ['coalesce', ['get', 'text_len'], 1], 0.0024]], 0,
            ['case', ['has', 'cid'], 17, 14]
        ],
        11, [
            'case',
            ['<', ['coalesce', ['get', 'deg_width'], 0], ['*', ['coalesce', ['get', 'text_len'], 1], 0.0012]], 0,
            ['case', ['has', 'cid'], 18, 15]
        ],
        12, [
            'case',
            ['<', ['coalesce', ['get', 'deg_width'], 0], ['*', ['coalesce', ['get', 'text_len'], 1], 0.0006]], 0,
            ['case', ['has', 'cid'], 19, 16]
        ],
        14, [
            'case',
            ['<', ['coalesce', ['get', 'deg_width'], 0], ['*', ['coalesce', ['get', 'text_len'], 1], 0.00015]], 0,
            ['case', ['has', 'cid'], 20, 17]
        ]
    ];
    
    try {
        state.map.setLayoutProperty('zones-labels', 'text-size', textSizeExpression);
    } catch (err) {
        console.error("Error setting dynamic text-size layout property:", err);
    }
}

function rebuildGeoJsonLayer() {
    if (!state.map) return;
    
    const grouped = {};
    state.allFeatures.forEach(f => {
        const props = f.properties || {};
        const newId = state.isCirclesFeature ? String(props.cid || "") : String(props.zid || "");
        if (!newId) return;

        if (!grouped[newId]) {
            grouped[newId] = {
                type: "Feature",
                id: newId,
                properties: {
                    ...props,
                    feature_id: newId
                },
                geometry: {
                    type: "MultiPolygon",
                    coordinates: []
                }
            };
        }

        const geom = f.geometry;
        if (geom) {
            if (geom.type === "Polygon") {
                grouped[newId].geometry.coordinates.push(geom.coordinates);
            } else if (geom.type === "MultiPolygon") {
                grouped[newId].geometry.coordinates.push(...geom.coordinates);
            } else {
                grouped[newId].geometry = geom;
            }
        }
    });

    const geojsonData = {
        type: "FeatureCollection",
        features: Object.values(grouped)
    };

    // Build a separate geojson collection with exactly one Point per unique ID
    const labelFeatures = [];
    Object.keys(grouped).forEach(newId => {
        const feat = grouped[newId];
        const bbox = getBbox([feat]);
        const insidePt = findPointInsidePolygon(feat.geometry);
        let centerLng, centerLat;
        if (insidePt) {
            centerLng = insidePt[0];
            centerLat = insidePt[1];
        } else {
            centerLng = (bbox[0][0] + bbox[1][0]) / 2;
            centerLat = (bbox[0][1] + bbox[1][1]) / 2;
        }

        const degWidth = bbox[1][0] - bbox[0][0];
        const textVal = state.isCirclesFeature ? String(feat.properties.cid || "") : String(feat.properties.zid || "");

        labelFeatures.push({
            type: "Feature",
            id: newId,
            properties: {
                ...feat.properties,
                feature_id: newId,
                deg_width: degWidth,
                text_len: textVal.length
            },
            geometry: {
                type: "Point",
                coordinates: [centerLng, centerLat]
            }
        });
    });

    const labelGeojsonData = {
        type: "FeatureCollection",
        features: labelFeatures
    };

    if (state.map.getSource('zones')) {
        state.map.getSource('zones').setData(geojsonData);
        if (state.map.getSource('zones-labels-src')) {
            state.map.getSource('zones-labels-src').setData(labelGeojsonData);
        }
        updateLabelZoomVisibility();
    } else {
        state.map.addSource('zones', {
            type: 'geojson',
            data: geojsonData,
            promoteId: 'feature_id'
        });

        state.map.addSource('zones-labels-src', {
            type: 'geojson',
            data: labelGeojsonData,
            promoteId: 'feature_id'
        });
        
        state.map.addLayer({
            id: 'zones-fill',
            type: 'fill',
            source: 'zones',
            paint: {
                'fill-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], '#30d158',
                    ['boolean', ['feature-state', 'hover'], false], '#30d158',
                    '#ffffff'
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 0.35,
                    ['boolean', ['feature-state', 'hover'], false], 0.2,
                    ['match', ['get', 'cid'], 'Oakridge', true, 'Cottage Grove', true, false], 0.02,
                    0.07
                ]
            }
        });

        state.map.addLayer({
            id: 'zones-outline',
            type: 'line',
            source: 'zones',
            paint: {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], '#00ff66',
                    ['boolean', ['feature-state', 'hover'], false], '#30d158',
                    ['match', ['get', 'cid'], 'Oakridge', true, 'Cottage Grove', true, false], 'rgba(255, 255, 255, 0.25)',
                    '#ffffff'
                ],
                'line-width': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 2.2,
                    ['boolean', ['feature-state', 'hover'], false], 1.8,
                    1.0
                ]
            }
        });

        try {
            state.map.addLayer({
                id: 'zones-labels',
                type: 'symbol',
                source: 'zones-labels-src',
                layout: {
                    'text-field': ['coalesce', ['get', 'cid'], ['get', 'zid'], ''],
                    'text-font': ['Noto Sans Regular'],
                    'text-size': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        7.5, 0,
                        8, [
                            'case',
                            ['has', 'zid'], 0,
                            ['<', ['coalesce', ['get', 'deg_width'], 0], ['*', ['coalesce', ['get', 'text_len'], 1], 0.010]], 0,
                            17
                        ],
                        10, [
                            'case',
                            ['has', 'zid'], 0,
                            ['<', ['coalesce', ['get', 'deg_width'], 0], ['*', ['coalesce', ['get', 'text_len'], 1], 0.0024]], 0,
                            ['case', ['has', 'cid'], 17, 14]
                        ],
                        11, [
                            'case',
                            ['<', ['coalesce', ['get', 'deg_width'], 0], ['*', ['coalesce', ['get', 'text_len'], 1], 0.0012]], 0,
                            ['case', ['has', 'cid'], 18, 15]
                        ],
                        12, [
                            'case',
                            ['<', ['coalesce', ['get', 'deg_width'], 0], ['*', ['coalesce', ['get', 'text_len'], 1], 0.0006]], 0,
                            ['case', ['has', 'cid'], 19, 16]
                        ],
                        14, [
                            'case',
                            ['<', ['coalesce', ['get', 'deg_width'], 0], ['*', ['coalesce', ['get', 'text_len'], 1], 0.00015]], 0,
                            ['case', ['has', 'cid'], 20, 17]
                        ]
                    ],
                    'text-justify': 'center',
                    'text-anchor': 'center',
                    'text-allow-overlap': true,
                    'text-letter-spacing': 0.05
                },
                paint: {
                    'text-color': (state.currentBaseLayer === "esri-street" || state.currentBaseLayer === "esri-topo") ? '#000000' : '#ffffff',
                    'text-halo-color': (state.currentBaseLayer === "esri-street" || state.currentBaseLayer === "esri-topo") ? 'rgba(255, 255, 255, 0.95)' : 'rgba(15, 15, 15, 0.95)',
                    'text-halo-width': (state.currentBaseLayer === "esri-street" || state.currentBaseLayer === "esri-topo") ? 2.0 : 1.8
                }
            });
            updateLabelZoomVisibility();
        } catch (err) {
            console.error("Error adding zones-labels symbol layer:", err);
        }
        
        let hoveredStateId = null;

        state.map.on('mousemove', 'zones-fill', (e) => {
            if (e.features.length > 0) {
                const newHoveredId = e.features[0].id;
                if (hoveredStateId !== null && hoveredStateId !== newHoveredId) {
                    state.map.setFeatureState({ source: 'zones', id: hoveredStateId }, { hover: false });
                    unhighlightTileItem();
                }
                hoveredStateId = newHoveredId;
                if (hoveredStateId != null && hoveredStateId !== "") {
                    state.map.setFeatureState({ source: 'zones', id: hoveredStateId }, { hover: true });
                    highlightTileItem(hoveredStateId);
                    state.map.getCanvas().style.cursor = 'pointer';
                }
            }
        });

        state.map.on('mouseleave', 'zones-fill', () => {
            if (hoveredStateId !== null && hoveredStateId !== "") {
                state.map.setFeatureState({ source: 'zones', id: hoveredStateId }, { hover: false });
                unhighlightTileItem();
            }
            hoveredStateId = null;
            state.map.getCanvas().style.cursor = '';
        });

        state.map.on('click', 'zones-fill', (e) => {
            state.lastZoneClickTime = Date.now();
            if (e.features.length > 0 && e.features[0].id != null) {
                const featureId = String(e.features[0].id);
                const props = e.features[0].properties;
                
                if (state.isCirclesFeature) {
                    if (props.cid === "Eugene") {
                        switchToFeature("eugene", getBbox([e.features[0]]));
                    } else if (props.cid === "Florence") {
                        switchToFeature("florence", getBbox([e.features[0]]));
                    } else if (props.cid === "Oakridge" || props.cid === "Cottage Grove") {
                        showToast("There is no data for this count circle");
                    }
                } else {
                    selectSubject(featureId, true);
                }
            }
        });
    }

    if (state.isLocating && state.userLocationMarker) {
        checkUserLocationZone(state.userLocationMarker.getLngLat());
    }

    updateAllFeatureStyles();
}

function isPointInRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        const intersect = ((yi > lat) !== (yj > lat)) &&
            (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function isPointInGeoJSONGeometry(lng, lat, geometry) {
    if (!geometry) return false;
    if (geometry.type === "Polygon") {
        return isPointInRing(lng, lat, geometry.coordinates[0]);
    } else if (geometry.type === "MultiPolygon") {
        for (let poly of geometry.coordinates) {
            if (isPointInRing(lng, lat, poly[0])) return true;
        }
    }
    return false;
}

function checkUserLocationZone(latlng) {
    const badge = document.getElementById("user-location-badge");
    if (!badge) return;

    if (!state.isLocating || !latlng) {
        badge.classList.remove("is-visible");
        badge.innerHTML = "";
        return;
    }

    const lng = latlng.lng;
    const lat = latlng.lat;

    let foundFeature = null;
    for (let f of state.allFeatures) {
        if (isPointInGeoJSONGeometry(lng, lat, f.geometry)) {
            foundFeature = f;
            break;
        }
    }

    if (foundFeature) {
        const props = foundFeature.properties || {};
        let zoneName = "";
        if (state.isCirclesFeature) {
            zoneName = props.cid || "Circle";
        } else {
            const zid = displayZoneId(props.zid);
            zoneName = `Zone ${zid}`;
        }
        badge.innerHTML = `<span class="map-location-badge__dot"></span><span>You are in ${zoneName}</span>`;
        badge.classList.add("is-visible");
    } else {
        badge.classList.remove("is-visible");
        badge.innerHTML = "";
    }
}


function toggleLocationTracking() {
    if (!state.map) return;
    const locateControlEl = document.querySelector(".map-ctrl-locate");

    if (state.isLocating) {
        state.isLocating = false;
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
        if (state.userLocationMarker) {
            state.userLocationMarker.remove();
            state.userLocationMarker = null;
        }
        if (state.map.getSource('user-accuracy-source')) {
            if (state.map.getLayer('user-accuracy-layer')) state.map.removeLayer('user-accuracy-layer');
            state.map.removeSource('user-accuracy-source');
        }
        if (locateControlEl) locateControlEl.classList.remove("is-active");
        checkUserLocationZone(null);
    } else {
        state.isLocating = true;
        if (locateControlEl) locateControlEl.classList.add("is-active");
        
        if (!navigator.geolocation) {
            showToast("Geolocation is not supported by your browser");
            state.isLocating = false;
            if (locateControlEl) locateControlEl.classList.remove("is-active");
            return;
        }

        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const lng = position.coords.longitude;
                const lat = position.coords.latitude;
                const accuracy = position.coords.accuracy;
                updateUserLocationOnMap(lng, lat, accuracy);
            },
            (error) => {
                console.error("Location error:", error);
                state.isLocating = false;
                if (locateControlEl) locateControlEl.classList.remove("is-active");
                checkUserLocationZone(null);
                showToast("Unable to access device location");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }
}

function preloadGlobalLowResTiles() {
    const tileUrls = [];
    
    // 1. Dark tiles (balanced across a, b, c, d subdomains)
    const darkSubdomains = ['a', 'b', 'c', 'd'];
    for (let z = 0; z <= 2; z++) {
        const limit = Math.pow(2, z);
        for (let x = 0; x < limit; x++) {
            for (let y = 0; y < limit; y++) {
                const subdomain = darkSubdomains[(x + y) % 4];
                tileUrls.push(`https://${subdomain}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`);
            }
        }
    }
    
    // 2. Satellite, Street, Topo tiles
    const templates = [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
    ];
    
    templates.forEach(template => {
        for (let z = 0; z <= 2; z++) {
            const limit = Math.pow(2, z);
            for (let x = 0; x < limit; x++) {
                for (let y = 0; y < limit; y++) {
                    tileUrls.push(template.replace("{z}", z).replace("{y}", y).replace("{x}", x));
                }
            }
        }
    });

    // Load all in parallel via browser cache preloading
    tileUrls.forEach(url => {
        const img = new Image();
        img.src = url;
    });
}

function initializeMap() {
    // Start preloading global low-resolution tiles in background
    try {
        preloadGlobalLowResTiles();
    } catch (e) {
        console.warn("Tile preloading failed:", e);
    }

    const mapContainer = document.getElementById("tile-map");
    const mapWrapper = document.getElementById("map-wrapper");
    if (!mapContainer) return;

    state.map = new maplibregl.Map({
        container: 'tile-map',
        preserveDrawingBuffer: true,
        maxZoom: 20,
        minZoom: 0,
        maxTileCacheSize: 2500,
        prefetchZoomDelta: 8,
        projection: { type: 'globe' },
        dragPan: {
            linearity: 0.15,
            deceleration: 1000
        },
        style: {
            version: 8,
            projection: { type: 'globe' },
            glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
            sources: {
                "dark-tiles-lowres": {
                    type: "raster",
                    tiles: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEABAMAAACuXLVVAAAAGFBMVEUJCQkNDQ0REREVFRUZGRkdHR0iIiImJibJRL8wAAAXuElEQVR4nO2dSXfqurKAZRu4U9MEpobQTElCMzWhm0IAe0pneboB2/r7ryT3LSbhZK+31q51z40T29JnqVSqKsneiPxlQf8A/gH8A/gH8P8Q4Pw+UP4qgIQQqv82gO4dWRbUjzg94+KnAxitCTdwa1whJk9rghwAlkhr5NXAL09sghwAV7vKYvAXhBq/BnC9OM/Mftu7AONfA5D7AQDVUQFUflL99wEM95GLxFRuJQbAz582CO4CGKLX5ifErbhPBvDWM34L4I9bf80ZDE5/9HXr9SnNkBtA9/rCFtxH//sNgJtbYd0M1c8dECr9AsBJdWtcrkMAvJjXFFjqTwBWPcl5YktEEclpDFeNnwCIpYPTA5do/SnTwXmthn63xMIPAEzE7eZfrAf6MYBgRdao4xx9lcMNc3NM6PcAQAULmOmhFau/E7xwxaGlfXTthYu4hkkfB+D7tPP5uAoEe8BcuZMVMaOagVAE6REAGHqcTGt78adBVwJW4ONPR0wdE2L2cL2nhAhNaAMEDIIr/nMZnFiYcMuUIqRvA5jw3wmhtj3g1lEAv0ITZfXzHpUW3wO41KkKcVc2E8caIFglyjJKpljMGgepAAuYiNXuFRUkKF43YzoYvFEKtkdMjHOWGqYCtAFgzJmoRivT41YgeOMKZRqb67cAoNtvjTI507oFEq8/eOMFFS8ZTfCnlmG00wBMUHyi7nRiHqjCZ7eAKZYuGX46Tj+VCoDNF1ZyndwqVN9MKQuASMvrOKMSK6N5kgEORe/QoD0A4zGmhcFCRTWjetCRjOZJBpAcgEuPgB0SVGLEGiBkePbZM7NYfRDAgGFtjaEHrlwPep9TSXwuCim2FStiHTgPN29SbVEiwEUwx0YDdEudFLTBlqqDHAUoJt3oVTkNBi5NlOG9JAKclhekF9ULWpqC8ycTR4xx5iy/RjXv+HPCrm+4v7937wNQ09KQejdxqaOF8a7afwvPyFkABhK846lzvTt5mpGoLgWAtviYSNuSGIDv5wXoc6p76M0hbiGgzo12oD9SACytDFdtrkU6/t3pdBUEyDC+pu+seMrLe2fLzXHQT02zhBe7p1RT4t/dAReaETNawPQ1zrtl7J2N2MUkAEP08iGhq0OhyUs6wMFvHeMubhKA6Tp8ii4WiW55FEEtzBiG/YZzYM0+3curqtcqYZOQAkCfoUbELvrfZdyS3QIDWsiNMgDcPgv6kRKM6Qo9YYVTC0kA0HGfY3IZEmkO8cAUrV1LGtBCIeE+j58+rKmSiCNbnSY1WxLABRVE8f2zcRVfBCKW0dhttD9+ac10gBuDuwhG3I+jZ27VUB8kAayoI4peS5ZY7FFX5NX1/wIt0E24z+VnOrgXbqd2EgDEeJU7duCAaDTGFcm+NLJ9IccSBHSAT7jP5WcAcnEqcnEAVQdHOziTeQYlkP61Kpja7wIxNc6ulG/YJyRPBzM8AIOOOQsVW1K0foQ0jg9rkOH6FRs094vQ2YADc3JDqhzQOXPiAayiTs5V8szf+5hNB6t4/aji/Hxtdl0A+ydtl5bzUDQgIWdEbc0NwYzE7mD664foQtTPs+RqJfi7ifh9AkCwN2xxAOzWKtPBPXnTNGJnBfBQXJLbR2fimLIL790fmQqsJtqdAhlt6AJBvgtwHSougPPX4tBqQTuJ4yt97uJNWNVgPDGDysb23LtfDQMc59wBtzyCfc2ShARPOihvfBtatMsKJm7fFqU3+2Bw4IbaiGz+CF3wTUy3xTzXMDoTfGD8eUTOLKxbEIrs+XhOJSow2Dhm9b1Zhs2+THpkD93e3XPFPbT+0Rl2snO2GnGwDGW+4Q+0YwyVrLf9Ps2ixcLZZGHUrsL6AIvthXvRBBEVZY5cl6LtYzmzUSPy/GS3Lh8R7Z/x7X+e+YtlFFKE6rd7kw+AEBuJLB+nX1WJxQFuS6lRgK4IzTmDMyV2KRNhnxNAoIZRCgHwk+AFBduxqXotELOCxoD254aTUMlou3N26Y4Seg/KoZ71KgcBBN0FolKnYSriZd5zsMa0zZY73/G9fFGADlLety3vvmq++tGXyC09m+W0QC84jQ3pgEWCQbuKnrZDoisXsKefe8SDIwiaK+esNSA6xIFefQ5AyIqvl2yULmnH75HrCtGMhTcUXvowXaEh6qkPA3BgiMAqz6YhgKAUVjz5fHdMH3UIHAdf8o2h8QKdf0F1sdGM339HRtQS6p6FiQPwep/OLTLHNI+OLGcMfvq2YDUXkSoCABdP5NyTBgXYeuF/AMCZy8G00DoO/BshKfkwAx3AaoN1lB+uHmq054KYIeL6Q/tpoLoZ0cAXsf2ofoIzKKE9GoPd5Vflh+qmw5Rr2wBu0/kAlj2KHQsM7ofqkMaMALTKAanQOXVp9kD1ZX7FRhRyHgJRx9kD4JbOwCg51RadDr/GQzIAmDIA5fCSv/6iUe8z18wGkGmlUlcquibQ9eZsjdv7CRkj5lkDwAb1DNT+ymv8qSytM+JaxAUwgOalolrbeUcKXTdmp2H0LU1H+WKJBpPOfCXwKftSYlVJIsIMuxqolgdADiJYEVqa5k6iPIuqem4D9a6NmPbZYlH175HjS07bj4T51qx6AZLrlmPRfthP1+mxO8FzA4R+YjA4g//edfpAp3peI2A35aUYBrAKM5ckdDX729VniTx9gZZm9XlimTgngK3FpiiEAa5LR83MsDfdon+27WRCmslkytlZCeT6HtGeVLFb+uJmOp0fpu/k7cJPwsK5QNOFhaYirMJ6RCwFn3M1gfPgKxRugYH/eItIOTXFMZRJSZk+aKk17kAjNbVRUAsrC6jCL8k/dKIy2Z3UnGEYaN6gL8BuK7i+cCzhap1PVJV2utlRTuuC33n8QHvTWie/oKJ3NHJbYBlqgUD9ONBcMgNwM00xNbzOLdB/rczLqIUl7uzdWJ9KaIb93xH4bIgbUJ+fa7LIa+8mbWIAli75AHu7Xrf91CgsPPTyNmNh4AnxmtfOXYnWVJfcdqQuO6pv7N6l9s9NgiWG54E0xJddr/NbLN16HcuocYOABEDxdo5t3pnI7Wx++3b+VJ7Rmkv9AtMSltu4urY9ASBg0m3H0g1pZ9EWAAvKda09qsEA2LVxi+b0+dHgrGH72TGMqGqzODiweXqIeKYlF3qj6ZaQAHBsegCBDENtOrzELcFcv8Jzb0fnMtW47llCxSOqtTb2Pa3BqXreLaQFXqHR9IjQkZZ5CT1HUoakPZg5Mj+69fM7GDrt+LUn8UWT5jNsN397j7oyCshIE/kp4kRF+cJwYrhGIh9eXkrMkm0+XFE0Z+POALRWjOfcD9DW3WYXa/is0KWNFRqGzMjIsU5ckz/RbtkuZCG8/yUxUyr5JXTsaISzKjDeP2JrP9Q7xxjXz/W5Ap3Q7aOXQ6D+zqbmGgduRzupsxAbt7sAweWRakWhJfJYAqcsvjBCfbQzEEzP4DRNZ7THNM259bUlzibI4xkxs9BB6mMAiNOgktfRYFJJzMxdEIcndQwTQQGbiz314w1eYY5VH7Wh9rNtoIUhI6kdo07tXQB+NZ5Uz9PqsZNwJZvV5mIPL5QDODjLIw2cwLGbl1nXQ7yAXu3JrWvbhG6/QY53AUJZcUHu1an6mQkXWoPdl1Tp3gomxtqWaujujSf9YrOAj6gy+1jQAgoTagUWdmlKWSdyKL2SqIRBgMJqCcY5OTVsQkiMdWKJOsGHIbtVOeqmoqzFOY/Pc6YNnIJPA8w8PW6g68RohcbS3RbgRDrNJlgA2gIwcdEg/ViwQBGVNa9qGKtEOe6kEdaaoy+njPbJDllegJa43m1eALsZkhfdzBmdoKwGmSy0ka1ti3PHbDWrawGITuFCeHlLkxxGeCk9cckmBpCy/H7bsvzhmNzISt2zK+tYp6tr8zbGx3AZ3HJ+GVOAxn0AOVI/n7L4bGxsH8HckUvPBuhuVTLciALWzlqkEJ1caX41PBWkrJxGAZLrJ9YX1yN4NzegDVRDFKs7BfcFvO2caA84U6InlR6BmdiUwt2ZsnYckRQAYqlmHxU+nF9M8ziqMHvTXUhl/HqOubeIWKtIYSmr5+H6a4kXgdzKMLyKr+6vpjTkWM93J+CG7HA4VgKXsmNVuGEeAKsZDPXTt83JEBijur84PzpyrAXA7JQOJzf35rcA2Qyi6pS2g0KTKlIAPVkMJMAMU9huVAL/o3ZhjUb0tiHiRuLiJbJiAM8xjT1LCsAV1OkUuDFZLmhEHV0sFmACmJ3m1nnRZ855vV8/oRn/FVaCcdJ2khQAmpivDyWwg8MvKR1gyHpco3tdS+D74hO37VLu+mwngifMZuCKB5A4mNMUfAH2/3zgdHABmPlIlIH9iCzHVwRaRaLWFvqgpL1x4JrPO5v2+7Yq+i2QH2BCn23YoIepmYFN1+5kF4BnPucY/h/GQhGevqrB3PCGHV1MXj9O3Uc0Bu66yg5TACxwBdnDbR0AhG1l362EE6IpIIgQ8bk0d3QxebU51cZ0D95OGTX5CmP00WU6MBIdgB7LvC1Na7fdvOxZrRgv3LT5OLGcVIATnVMyNiDBFRiVutT5ejm1RQZQojENp3XpCuCWPTe3VU71NfdOW8Z4SAkJy14y5m07eRjMz6hUnkO9o512FktbCCPYRN7B9D4nvuos9pyGFRnV1CSfKns/IdNbMB1WMgHMt0WJP6GXNdrUTnUaTNhRZJ0tnbKVAzCiMkQn77vUteZsgBIxaWHGcpdwHrq2IKH69kQtX43NfTSK4V63LL3JXFtw//oFPNTotqiHAWBK4nbTAT0ytwn7FWB0QbjL0+TUzBmL41sZXEDJ7mxkz+P7bhdjQyUpypy5qbUPTn/6XryNyDIYNPfwZQPwGsG4X3eaW7RNz/VlsGWFJA/n7F210w3W5mknZ9pAWVUGMBKFNeKoBS586Wvem7v6dlbJ0NZIoUp0Gz8OQMiXtkiZCqz2aPrawqcPiYORXqR+dxGD1fO8/j9Optnad/AZfpqJ207uvmOCj4ng9Ax+R4umtsMKxOYl6IxK/a239vdnXN1E2HnTPrGfSY9y/y2bKVUp8PZjomA8Ob4qB64JEXEd9F/Z0vS+t7fbdJ1p/TqapRZ/H4Aq8MeJH8bKMGsj6vyDyYbJv6t9DfEBFc7vX95zOulnoltKAn9uAKJsd7Vr0my61U6jTwyPPjp1T3i+HcLh4vPknX8/2z977v6QU7SEfADW+IxoemMX7cIb3gsT8DyrB/Ce6jLrBm6x9W9c2T/dcXRLejsq1+t+FzTAMnfqRgmGh2ITTzjt7cAh/gwzD519GgFCB4Tdt4HrvwvwB2zq5gPvuuPw343zbk6sqsztO1uMtxU8GSiyGr27bbDUwil5as0LUNxqo90oaUogZF1WtHaf7+LjAvfjKe3DgjrkipZcdi4AapJPp/oCH5KnRYxpIF5abcAuq7HTVvUNnn+YsvkrD8BNm/Aa7vOfYrKHvht9UjvYrR7QICmGkIvE1Ka8NlcTWjAPwKqqlZ1kV01NON9//aKnF/oFDZMIrzzbIWgo1I37DsC6M8Neti3hjd8vvKDOANZGk8QgyqL7Y1FvNYbj9i2S7MoDoIGh23vhRVmNnjfPbKkNS9w2do4J7YPN8tyAw0+R34QuygOw6POub8/87lgtFovilNQw2l6RujHDeOJXQvBdoDwAE1QM1J/wlh1WWuCPzNP3Wd5Gvl/zvkK9wJbGXO8do7okZgFceQyO2UhO3TxrzZqeFXxffQQ1JZcdEIta/9VHaMQAULMk8melnx5IszyzPQo35P3+zuqwyNxCUzyAeL4CBllx97oqXQfpAFR0ByWYKsw5GfFa6TO1B9goxxAFmpvxnZKstkquob/kAoAKZpyX94xPKjSC2PBa90p7J935IdSVb5D94wDgYW+Qtyyoxk6DH1ASUR1r9M2MSvx2V24vIuCvQlFSPoAbAKDROg0AYs+SBPMVRktrkrHtnobJNSIHr7DyAZAjeP8VJ2kUVzQFa+Ch9rvvHUBNf7fOjlc7UijvmROAnGnMZw+C+MlVmcdgrzsCbatGahne8tF3AOaosLWVIKGJrzQym4udHjVa47QiNp4hCa5Y5AUYvY6krZhohtge3g0qHjcNOiDU5AKsN9+Uco8aIpA6eCRDOiXySRWIEB0WNLoLdZ/6ykZwNgmMg7wAL6umJmlp850EYfJcPNTp1uOUAvZBgMCklRPAqouIP43ElNlGFo7agac7m5MjUBJdAhg/CmB2oedOiwSfl8lKwB9iIfO1vkMIoPEogEFjjrkmprxZYryCna5kfp/l8jOAG+3Copw2yC0I0F5S43gm4ZUw/6XlvC1Ajcion/p2L4yx7jHlnMP4sxYwqRnf7lLfG4QGEjLe+qDCNkq/OwD+MlzeFpDhrkNRTTv/B7k721NFgmlAJ85ann9t3smI6sBKSF854ON7C8JiiQJb3Kp9zw5MaQt00l/htu5/jcEJBzRoCW/GNHMDDKkOZL5kmVsOAR2E+CAfgFVPmQe/IUbQEPZyA4goZcnlcfl888dAs5cTYJj5atO3xSrr+QCMKeIyXm/7tujTvE7p9JkNcPHm9JaaE8A43Vm+eUi8vcn0IKcO7LJeMHxYVOen3MsLcF08aQyG5Ea7NR/An2FG3PttWRVzA0ym/wWAucwNcDg85+NDCZIP4G3/tM+AfQ+gI2d/UidBLk8FGKyf9zm+bwGsD43YHqxfBVgtwOdPyUL+CsBNyPqezS8AmJXk7Yy/BkDW3aTlll8EINvMwO8XAP4z+QfwD+AfwD+A/1cA6l8GMBp/F8B84meavwUw/U/qzw9gpe5ujkl8WS9wnHNfcVwOuYPDYyyQlpbkZvNb2+hG/dwAkpr3ytDXImn20kBFTUIdsmpVRTjchpQpN0DuBMUbXdRwXgiaNrlm61Oyk5Ov3oLJtwDy5ujYyoywrvrvqsZF/Q5AngQFaJ+7vMqCWSkFQHh8zcgysz93ysSsB5YlCknvqnid4H3pKy/AZZojPr9y7qd1bYCsd9G9bRg5Af600nM0lm5p9F1IQwy+n9jzeyNR3OLyAtTS83Tr0kpEgrUL97iaqgGOpL11mwJQSHzRhI62L/bxZBR967kR/6RhWPjXYX4AQyqICVq422uDtE/e9HJ8jaB7B8BPCKzo1vE4QFkK9nqkhff3AYQ7AIa3ynzsg37HUqVpdobJi/RzAF3B/saThGz94X4V2XIvT9inhB2bYB1/4SyzAXJJIxnAWjrvxcpo+VVFBX2rsrX3KEDSZ78ek7REJb7WmQO6ty/j6eI8indB3m9OpAqbXmIAbCI1q9R/iHwjOOro/EkpN7eMkwDWYhm1WjC85iTy2l/sk4w/7QLbLYgA+Ps8uLGhhqqIjsL4d7wflEIcYCEHAREnxXgD8uNB2IgDZF0eXZpO+Ij0gzJ+CCCmAT8eA06fhgAyHir6KbZm+qV5RY0BpPaqMI+852H8uP1jACbR09U65hH/WAHjAEazkf4xu9hn4Z/RABEdyJ5ZIg7pI18+SpdxuAsyr/UdUqoMPx+BTBpBAD3TBrws/WfXI7uyvi/2C+02gFnI/KqcrwJ/6KScdekjMvYBLKRnfdDRB2BbmZ4EYKu20wXiMqtjfQD2z7c8B4ALKaE8JuZn6rW+LyQygNozEGwddAFuKskw754hspxdYD/2RZDnYAVNcerwtkehwj6WxEzC/S+A3peE0CzVFti+wID1Pmu5+D8o8biocYD0aA6cgduixv5VETZ4f+6Re/NrECCj2CX7LJ7hvon/jMmIxAEyerYAT1+EJuIZd3bkn0/4GICV6eToRIc4bcM055hx3fcBjtmfN2wEdPU5c1FUCe/ole8SHJ9Tf9wO3Lne2479pPojlpDcd3OZOZSq+M5luaUUBbjn5tAmuOb/BO1dKUQB7lq3Xnrq8zvCPQwgPMUC+xINTO6Wzj0hJRGUxoM6QL838lQAIQKQ6yPbTxU9DHDfyfh5PBqWxqMAzxb+bwOwPvAB9r8PoD42DP87AGcZTf51gBcb4Cb8NSWAJkDq0v1i5zN87QelpxE0a8uOVX6Sp/OIFMsENTlvqfUpvt6D0mNrPW7+wXq2rbsvBfuH6/D9PoD3efS/BeByOADS71f9f5suLR05GwLsAAAAAElFTkSuQmCC"],
                    tileSize: 256,
                    maxzoom: 0
                },
                "satellite-tiles-lowres": {
                    type: "raster",
                    tiles: ["data:image/jpeg;base64,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"],
                    tileSize: 256,
                    maxzoom: 0
                },
                "esri-street-tiles-lowres": {
                    type: "raster",
                    tiles: ["data:image/jpeg;base64,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"],
                    tileSize: 256,
                    maxzoom: 0
                },
                "esri-topo-tiles-lowres": {
                    type: "raster",
                    tiles: ["data:image/jpeg;base64,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"],
                    tileSize: 256,
                    maxzoom: 0
                },
                "dark-tiles": {
                    type: "raster",
                    tiles: [
                        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
                        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
                        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
                        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
                    ],
                    tileSize: 128,
                    maxzoom: 19,
                    roundZoom: true,
                    attribution: "&copy; <a href='https://carto.com/'>CARTO</a>"
                },
                "satellite-tiles": {
                    type: "raster",
                    tiles: [
                        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    ],
                    tileSize: 128,
                    maxzoom: 18,
                    roundZoom: true,
                    attribution: "Tiles &copy; Esri &mdash; Source: Esri"
                },
                "esri-street-tiles": {
                    type: "raster",
                    tiles: [
                        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                    ],
                    tileSize: 256,
                    maxzoom: 18,
                    attribution: "Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ"
                },
                "esri-topo-tiles": {
                    type: "raster",
                    tiles: [
                        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                    ],
                    tileSize: 256,
                    maxzoom: 18,
                    attribution: "Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, TomTom"
                }
            },
            layers: [
                // Low-resolution layers (clamp to zoom 6 max, always under high-res layers)
                {
                    id: "base-dark-low",
                    type: "raster",
                    source: "dark-tiles-lowres",
                    minzoom: 0,
                    maxzoom: 22,
                    layout: { visibility: "visible" }
                },
                {
                    id: "base-satellite-low",
                    type: "raster",
                    source: "satellite-tiles-lowres",
                    minzoom: 0,
                    maxzoom: 22,
                    layout: { visibility: "none" }
                },
                {
                    id: "base-esri-street-low",
                    type: "raster",
                    source: "esri-street-tiles-lowres",
                    minzoom: 0,
                    maxzoom: 22,
                    layout: { visibility: "none" }
                },
                {
                    id: "base-esri-topo-low",
                    type: "raster",
                    source: "esri-topo-tiles-lowres",
                    minzoom: 0,
                    maxzoom: 22,
                    layout: { visibility: "none" }
                },
                
                // High-resolution layers
                {
                    id: "base-dark",
                    type: "raster",
                    source: "dark-tiles",
                    minzoom: 0,
                    maxzoom: 22,
                    layout: { visibility: "visible" }
                },
                {
                    id: "base-satellite",
                    type: "raster",
                    source: "satellite-tiles",
                    minzoom: 0,
                    maxzoom: 22,
                    layout: { visibility: "none" }
                },
                {
                    id: "base-esri-street",
                    type: "raster",
                    source: "esri-street-tiles",
                    minzoom: 0,
                    maxzoom: 22,
                    layout: { visibility: "none" }
                },
                {
                    id: "base-esri-topo",
                    type: "raster",
                    source: "esri-topo-tiles",
                    minzoom: 0,
                    maxzoom: 22,
                    layout: { visibility: "none" }
                }
            ]
        },
        center: [-123.11, 44.05],
        zoom: 11,
        attributionControl: false
    });

    // Set initial background color to match black
    const initialTileMapEl = document.getElementById("tile-map");
    if (initialTileMapEl) {
        initialTileMapEl.style.setProperty("background-color", "#000000", "important");
        initialTileMapEl.style.setProperty("background", "#000000", "important");
    }

    // Configure smooth inertial scroll zoom rates for trackpad and mouse wheel (Google Earth style)
    if (state.map.scrollZoom) {
        state.map.scrollZoom.setWheelZoomRate(1 / 750);
        state.map.scrollZoom.setZoomRate(1 / 150);
    }
    
    state.map.on('style.load', () => {
        state.map.setProjection({ type: 'globe' });
    });

    try {
        state.map.setProjection({ type: 'globe' });
    } catch(e) {
        console.warn("Immediate setProjection not supported yet:", e);
    }

    // Disable rotation on mobile (touch devices) – preserve pinch-to-zoom only
    if (/Mobi|Android|iPhone|iPad|iPod|Touch/i.test(navigator.userAgent) || window.innerWidth <= 768) {
        state.map.touchZoomRotate.disableRotation();
    }

    state.baseMapsList = [
        { id: "dark", name: "Dark Map", layerId: "base-dark" },
        { id: "satellite", name: "Satellite Map", layerId: "base-satellite" },
        { id: "esri-street", name: "Street Map", layerId: "base-esri-street" },
        { id: "esri-topo", name: "Topo Map", layerId: "base-esri-topo" }
    ];

    // Create custom controls container
    let controlContainer = document.querySelector(".map-ctrl-container");
    if (!controlContainer) {
        controlContainer = document.createElement("div");
        controlContainer.className = "map-ctrl-container";

        const topLeft = document.createElement("div");
        topLeft.className = "map-ctrl-panel map-ctrl-panel--left";
        controlContainer.appendChild(topLeft);

        const topRight = document.createElement("div");
        topRight.className = "map-ctrl-panel map-ctrl-panel--right";
        controlContainer.appendChild(topRight);

        mapWrapper.appendChild(controlContainer);
    }

    const topLeft = controlContainer.querySelector(".map-ctrl-panel.map-ctrl-panel--left");

    // 1. Zoom Control
    const zoomDiv = document.createElement("div");
    zoomDiv.className = "map-ctrl-zoom map-ctrl-bar map-ctrl";
    
    const zoomInBtn = document.createElement("a");
    zoomInBtn.className = "map-ctrl-zoom-in";
    zoomInBtn.href = "#";
    zoomInBtn.title = "Zoom in";
    zoomInBtn.role = "button";
    zoomInBtn.setAttribute("aria-label", "Zoom in");
    zoomInBtn.textContent = "+";
    zoomInBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.map) state.map.zoomIn();
    });
    
    const zoomOutBtn = document.createElement("a");
    zoomOutBtn.className = "map-ctrl-zoom-out";
    zoomOutBtn.href = "#";
    zoomOutBtn.title = "Zoom out";
    zoomOutBtn.role = "button";
    zoomOutBtn.setAttribute("aria-label", "Zoom out");
    zoomOutBtn.innerHTML = "&#x2212;";
    zoomOutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (state.map) state.map.zoomOut();
    });

    zoomDiv.appendChild(zoomInBtn);
    zoomDiv.appendChild(zoomOutBtn);
    topLeft.appendChild(zoomDiv);

    // 2. Locate Control
    const locateDiv = document.createElement("div");
    locateDiv.className = "map-ctrl-bar map-ctrl map-ctrl-locate";
    
    const locateBtn = document.createElement("a");
    locateBtn.className = "map-ctrl-locate-btn";
    locateBtn.href = "#";
    locateBtn.title = "Show My Location";
    locateBtn.role = "button";
    locateBtn.setAttribute("aria-label", "Show My Location");
    locateBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="8"></circle>
            <line x1="12" y1="2" x2="12" y2="4"></line>
            <line x1="12" y1="20" x2="12" y2="22"></line>
            <line x1="2" y1="12" x2="4" y2="12"></line>
            <line x1="20" y1="12" x2="22" y2="12"></line>
            <circle cx="12" cy="12" r="3" fill="currentColor"></circle>
        </svg>
    `;
    locateBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleLocationTracking();
    });
    locateDiv.appendChild(locateBtn);
    topLeft.appendChild(locateDiv);

    // 3. Fullscreen Control
    const fsDiv = document.createElement("div");
    fsDiv.className = "map-ctrl-bar map-ctrl map-ctrl-fullscreen";
    
    const fsBtn = document.createElement("a");
    fsBtn.className = "map-ctrl-fullscreen-btn";
    fsBtn.href = "#";
    fsBtn.title = "Toggle Fullscreen";
    fsBtn.role = "button";
    fsBtn.setAttribute("aria-label", "Toggle Fullscreen");
    fsBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
        </svg>
    `;
    fsBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFullscreen();
    });
    fsDiv.appendChild(fsBtn);
    topLeft.appendChild(fsDiv);

    // 4. Map Style Control (Custom Reimplementation)
    const layersDiv = document.createElement("div");
    layersDiv.className = "map-ctrl-bar map-ctrl map-ctrl-styles";
    
    const layersBtn = document.createElement("a");
    layersBtn.className = "map-ctrl-styles__toggle";
    layersBtn.href = "#";
    layersBtn.title = "Map Elements";
    layersBtn.role = "button";
    layersBtn.setAttribute("aria-label", "Map Elements");
    layersBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
    `;
    layersDiv.appendChild(layersBtn);

    const listContainer = document.createElement("div");
    listContainer.className = "map-ctrl-styles__list";
    listContainer.innerHTML = `
        <div class="map-ctrl-styles__header">
            <div class="modal-title-wrapper" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; padding-left: 2px;">
                <span class="modal-title" style="font-size: 0.95rem; font-weight: 700; color: #ffffff; text-transform: none; letter-spacing: normal;">Map Elements</span>
                <button type="button" class="modal-close-btn" aria-label="Close Map Elements" style="background: transparent; border: none; padding: 4px; cursor: pointer; color: rgba(255, 255, 255, 0.45); display: flex; align-items: center; justify-content: center; transition: all 0.2s ease; border-radius: 50%;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-capsules-wrapper">
                <div class="modal-capsules-scroll">
                    <button type="button" class="modal-capsule modal-capsule--icon is-active" data-tab="basemaps" title="Select Basemaps">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                            <polyline points="2 17 12 22 22 17"></polyline>
                            <polyline points="2 12 12 17 22 12"></polyline>
                        </svg>
                    </button>
                    <button type="button" class="modal-capsule" data-tab="layers">Our Layers</button>

                </div>
                <button type="button" class="modal-search-toggle-btn" aria-label="Search items">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-search-expanded">
                <div class="modal-search-input-container">
                    <svg class="modal-search-input-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" class="modal-search-input" placeholder="Search items..." autocomplete="off" />
                </div>
                <button type="button" class="modal-search-close-btn" aria-label="Close search">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
        <div class="map-ctrl-styles__body"></div>
    `;
    layersDiv.appendChild(listContainer);
    topLeft.appendChild(layersDiv);

    let activeTab = "basemaps";
    let searchQuery = "";

    const headerEl = listContainer.querySelector(".map-ctrl-styles__header");
    const bodyEl = listContainer.querySelector(".map-ctrl-styles__body");
    const searchInput = listContainer.querySelector(".modal-search-input");
    const searchToggleBtn = listContainer.querySelector(".modal-search-toggle-btn");
    const searchCloseBtn = listContainer.querySelector(".modal-search-close-btn");

    const renderContent = () => {
        if (!bodyEl) return;
        bodyEl.innerHTML = "";
        const query = searchQuery.toLowerCase().trim();

        const layers = [];
        if (state.isCirclesFeature || state.currentFeature === "circles") {
            layers.push({
                id: "circles", name: "Coast to Cascades Bird Alliance", isChild: false, image: "../images/wetlands.jpg", isLogo: false,
                action: () => selectSubject(CIRCLE_ID, true)
            });
        } else {
            const isFlorence = state.currentFeature === "florence";
            layers.push({
                id: "circle", name: isFlorence ? "Florence Christmas Bird Count Circle" : "Eugene Christmas Bird Count Circle", isChild: false, 
                image: isFlorence ? "../images/florence.png" : "../images/logo-small.png", isLogo: true,
                action: () => selectSubject(CIRCLE_ID, true)
            });
            if (state.currentId && state.currentId !== CIRCLE_ID) {
                const targetZone = state.allFeatures.find(f => {
                    const zid = f.properties?.zid;
                    return zid && (String(zid).toLowerCase() === String(state.currentId).toLowerCase() || normalizeZoneId(zid) === normalizeZoneId(state.currentId));
                });
                const zidDisplay = targetZone ? displayZoneId(targetZone.properties.zid) : state.currentId;
                const zoneImg = zoneImagePath(state.currentId);
                layers.push({
                    id: "selected-zone",
                    name: `Zone ${zidDisplay}`,
                    isChild: true,
                    image: zoneImg,
                    isLogo: false,
                    action: () => selectSubject(state.currentId, true)
                });
            }
        }

        const maxItems = Math.max(layers.length, 3);
        const estimatedHeight = 76 + 20 + (maxItems * 68);
        listContainer.style.setProperty("height", `${estimatedHeight}px`, "important");

        if (activeTab === "layers") {
            const filtered = layers.filter(l => l.name.toLowerCase().includes(query));
            if (filtered.length === 0) {
                bodyEl.innerHTML = `<div class="modal-no-results">No layers found</div>`;
            } else {
                filtered.forEach(l => {
                    const isCircleOverview = !state.currentId || state.currentId === CIRCLE_ID;
                    const isRowActive = l.id === "selected-zone" || (l.id === "circle" && isCircleOverview) || (l.id === "circles" && state.isCirclesFeature);
                    
                    const row = document.createElement("div");
                    row.className = `tile-zone-item ${l.isChild ? 'is-child' : ''} ${isRowActive ? 'is-active' : ''}`;
                    row.innerHTML = `
                        <div class="tile-zone-item__thumb ${l.isLogo ? 'tile-zone-item__thumb--logo' : ''}">
                            <img src="${l.image}" alt="${l.name}" loading="lazy">
                        </div>
                        <div class="tile-zone-item__info">
                            <div class="tile-zone-item__title">${l.name}</div>
                        </div>
                    `;

                    const img = row.querySelector("img");
                    if (img) {
                        img.addEventListener("error", () => {
                            img.src = FALLBACK_IMAGE;
                        });
                    }

                    row.addEventListener("click", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        l.action();
                    });
                    bodyEl.appendChild(row);
                });
            }
        } else {
            const basemaps = [
                { id: "dark", name: "Dark Map", thumbnailClass: "dark-map-thumbnail", layerId: "base-dark" },
                { id: "satellite", name: "Satellite Map", thumbnailClass: "satellite-thumbnail", layerId: "base-satellite" },
                { id: "esri-street", name: "Street Map", thumbnailClass: "esri-street-thumbnail", layerId: "base-esri-street" },
                { id: "esri-topo", name: "Topo Map", thumbnailClass: "esri-topo-thumbnail", layerId: "base-esri-topo" }
            ];

            const filtered = basemaps.filter(b => b.name.toLowerCase().includes(query));
            if (filtered.length === 0) {
                bodyEl.innerHTML = `<div class="modal-no-results">No basemaps found</div>`;
            } else {
                filtered.forEach(b => {
                    const isSelected = state.currentBaseLayer === b.id;
                    const row = document.createElement("div");
                    row.className = `tile-zone-item ${isSelected ? 'is-active' : ''}`;
                    row.innerHTML = `
                        <div class="tile-zone-item__thumb">
                            <span class="thumbnail ${b.thumbnailClass}"></span>
                        </div>
                        <div class="tile-zone-item__info">
                            <div class="tile-zone-item__title">${b.name}</div>
                        </div>
                    `;
                    row.addEventListener("click", (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        
                        switchBaseMap(b.id);
                        renderContent();
                    });
                    bodyEl.appendChild(row);
                });
            }
        }
    };

    state.refreshLayersModal = () => {
        renderContent();
    };

    renderContent();

    layersBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const isExpanded = layersDiv.classList.contains("map-ctrl-styles--expanded");
        if (isExpanded) {
            layersDiv.classList.remove("map-ctrl-styles--expanded");
        } else {
            layersDiv.classList.add("map-ctrl-styles--expanded");
            renderContent();
        }
    });

    const closeBtn = listContainer.querySelector(".modal-close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            layersDiv.classList.remove("map-ctrl-styles--expanded");
        });
    }

    const capsules = listContainer.querySelectorAll(".modal-capsule");
    capsules.forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            const tab = btn.getAttribute("data-tab");
            if (tab === "tools") {
                showToast("Tools view is not available (coming soon)");
                return;
            }
            if (tab === "settings") {
                showToast("Settings view is not available (coming soon)");
                return;
            }
            if (tab === activeTab) return;

            activeTab = tab;
            capsules.forEach(c => {
                if (c.getAttribute("data-tab") === tab) {
                    c.classList.add("is-active");
                } else {
                    c.classList.remove("is-active");
                }
            });

            renderContent();
        });
    });

    searchToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        headerEl.classList.add("is-searching");
        if (searchInput) {
            searchInput.focus();
        }
    });

    searchCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        headerEl.classList.remove("is-searching");
        if (searchInput) {
            searchInput.value = "";
        }
        searchQuery = "";
        renderContent();
    });

    searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value;
        renderContent();
    });

    document.addEventListener("click", (e) => {
        if (!layersDiv.contains(e.target)) {
            layersDiv.classList.remove("map-ctrl-styles--expanded");
            headerEl.classList.remove("is-searching");
            if (searchInput) {
                searchInput.value = "";
            }
            searchQuery = "";
        }
    });

    updateControlPositions();

    state.map.on("click", (e) => {
        if (Date.now() - state.lastZoneClickTime < 250) {
            return;
        }
        
        const features = state.map.queryRenderedFeatures(e.point, { layers: ['zones-fill'] });
        if (features.length === 0) {
            if (!state.isCirclesFeature && state.currentId === CIRCLE_ID) {
                switchToCirclesFeature();
            } else {
                selectSubject(CIRCLE_ID);
            }
        }
    });

    state.map.on("load", () => {
        state.map.setProjection({ type: 'globe' });
        state.map.dragPan.enable({
            linearity: 0.15,
            deceleration: 1000
        });
        rebuildGeoJsonLayer();
    });

    setupMapEffectsAndFullscreen(mapWrapper);
}

const MAP_VIEWER_APPS = [
    {
        name: "Avenza Maps",
        aliases: ["avenza", "avenzamaps"],
        formats: ["geopdf", "geotiff", "kmz", "gpx"]
    },
    {
        name: "OsmAnd Maps",
        aliases: ["osmand", "osmandmaps", "osmand+"],
        formats: ["gpx", "geojson", "kmz"]
    },
    {
        name: "Gaia GPS",
        aliases: ["gaia", "gaiagps"],
        formats: ["gpx", "kmz", "geojson"]
    },
    {
        name: "AllTrails",
        aliases: ["alltrails", "all trails"],
        formats: ["gpx", "kmz"]
    },
    {
        name: "CalTopo",
        aliases: ["caltopo", "sarsoft"],
        formats: ["gpx", "kmz", "geopdf", "geojson"]
    },
    {
        name: "onX Maps",
        aliases: ["onx", "onxhunt", "onxoffroad", "onxmaps"],
        formats: ["gpx", "kmz"]
    },
    {
        name: "Google Earth",
        aliases: ["google earth", "googleearth", "earth"],
        formats: ["kmz", "geojson"]
    },
    {
        name: "QGIS",
        aliases: ["qgis", "quantum gis"],
        formats: ["geojson", "kmz", "gpx", "geopdf", "geotiff"]
    },
    {
        name: "ArcGIS / Field Maps",
        aliases: ["arcgis", "esri", "field maps"],
        formats: ["geojson", "geopdf", "geotiff", "kmz", "gpx"]
    },
    {
        name: "Garmin Explore / BaseCamp",
        aliases: ["garmin", "basecamp", "garmin explore"],
        formats: ["gpx", "kmz"]
    },
    {
        name: "Locus Map",
        aliases: ["locus", "locusmap"],
        formats: ["gpx", "kmz", "geotiff"]
    },
    {
        name: "Organic Maps / Maps.me",
        aliases: ["organic maps", "mapsme", "maps.me"],
        formats: ["kmz", "gpx"]
    }
];

function setupDownloadAppSearch() {
    const searchInput = document.getElementById("download-app-search");
    const clearBtn = document.getElementById("download-app-search-clear");
    const autocompleteBox = document.getElementById("download-app-autocomplete");
    if (!searchInput || !autocompleteBox) return;

    const allDownloadButtons = {
        "geojson": document.getElementById("download-geojson"),
        "kmz": document.getElementById("download-kmz"),
        "gpx": document.getElementById("download-gpx"),
        "geopdf": document.getElementById("download-geopdf"),
        "geotiff": document.getElementById("download-geotiff")
    };

    const filterFormatsByApp = (appFormats) => {
        if (!appFormats) {
            Object.values(allDownloadButtons).forEach(btn => {
                if (btn) {
                    btn.classList.remove("is-dimmed", "is-filtered-match");
                }
            });
            return;
        }

        Object.entries(allDownloadButtons).forEach(([formatKey, btn]) => {
            if (btn) {
                if (appFormats.includes(formatKey)) {
                    btn.classList.remove("is-dimmed");
                    btn.classList.add("is-filtered-match");
                } else {
                    btn.classList.add("is-dimmed");
                    btn.classList.remove("is-filtered-match");
                }
            }
        });
    };

    const updateAutocomplete = () => {
        const query = searchInput.value.trim().toLowerCase();
        if (clearBtn) {
            clearBtn.style.display = query ? "flex" : "none";
        }

        if (!query) {
            autocompleteBox.style.display = "none";
            autocompleteBox.innerHTML = "";
            filterFormatsByApp(null);
            return;
        }

        const matches = MAP_VIEWER_APPS.filter(app => 
            app.name.toLowerCase().includes(query) || 
            app.aliases.some(a => a.includes(query))
        );

        if (matches.length === 0) {
            autocompleteBox.style.display = "block";
            autocompleteBox.innerHTML = `<div style="padding:0.6rem; font-size:0.8rem; color:rgba(255,255,255,0.4); text-align:center;">No matching viewer app found</div>`;
            filterFormatsByApp(null);
            return;
        }

        autocompleteBox.style.display = "block";
        autocompleteBox.innerHTML = matches.map(app => `
            <div class="download-autocomplete-item" data-app-name="${app.name}">
                <span class="download-autocomplete-item__name">${app.name}</span>
                <div class="download-autocomplete-item__formats">
                    ${app.formats.map(f => `<span class="download-format-pill">${f.toUpperCase()}</span>`).join("")}
                </div>
            </div>
        `).join("");

        autocompleteBox.querySelectorAll(".download-autocomplete-item").forEach(item => {
            item.addEventListener("click", (e) => {
                e.stopPropagation();
                const selectedName = item.getAttribute("data-app-name");
                const selectedApp = MAP_VIEWER_APPS.find(a => a.name === selectedName);
                if (selectedApp) {
                    searchInput.value = selectedApp.name;
                    autocompleteBox.style.display = "none";
                    if (clearBtn) clearBtn.style.display = "flex";
                    filterFormatsByApp(selectedApp.formats);
                    if (typeof showToast === "function") {
                        showToast(`Filtered formats for ${selectedApp.name}`);
                    }
                }
            });
        });

        if (matches.length > 0) {
            filterFormatsByApp(matches[0].formats);
        }
    };

    searchInput.addEventListener("input", updateAutocomplete);
    searchInput.addEventListener("focus", updateAutocomplete);

    if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            searchInput.value = "";
            updateAutocomplete();
            searchInput.focus();
        });
    }

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".maps-tile-download-search-wrapper")) {
            autocompleteBox.style.display = "none";
        }
    });
}

function setupActionButtons() {
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

    const closeAllModals = () => {
        if (downloadModal) {
            downloadModal.setAttribute("aria-hidden", "true");
            downloadModal.classList.remove("is-open");
        }
        if (copyModal) {
            copyModal.setAttribute("aria-hidden", "true");
            copyModal.classList.remove("is-open");
        }
        if (helpModal) {
            helpModal.setAttribute("aria-hidden", "true");
            helpModal.classList.remove("is-open");
        }
        if (suggestModal) {
            suggestModal.setAttribute("aria-hidden", "true");
            suggestModal.classList.remove("is-open");
        }
        window.updateActionButtonsState();
    };

    const handleToolsClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget) e.currentTarget.blur();
        showToast("Tools view is not available (coming soon)");
    };

    const handleSettingsClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget) e.currentTarget.blur();
        showToast("Settings view is not available (coming soon)");
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
                if (copyInput) copyInput.value = window.location.href;
                copyModal.setAttribute("aria-hidden", "false");
                copyModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        if (copyActionBtn && copyInput) {
            copyActionBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(copyInput.value);
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
        setupDownloadAppSearch();
        downloadBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (e.currentTarget) e.currentTarget.blur();
            const isOpen = downloadModal.getAttribute("aria-hidden") === "false";
            closeAllModals();
            if (!isOpen) {
                downloadModal.setAttribute("aria-hidden", "false");
                downloadModal.classList.add("is-open");
            }
            window.updateActionButtonsState();
        });

        downloadModal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
            closeEl.addEventListener("click", (e) => {
                e.stopPropagation();
                closeAllModals();
            });
        });

        const geojsonBtn = document.getElementById("download-geojson");
        if (geojsonBtn) {
            geojsonBtn.addEventListener("click", () => {
                const geojson = getSelectedGeoJSONData();
                const filename = getActiveDownloadFilename("geojson");
                const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
                saveBlob(blob, filename);
                showToast(`Downloaded ${filename}`);
            });
        }

        const kmzBtn = document.getElementById("download-kmz");
        if (kmzBtn) {
            kmzBtn.addEventListener("click", async () => {
                const geojson = getSelectedGeoJSONData();
                const filename = getActiveDownloadFilename("kmz");
                const kmlStr = geojsonToKml(geojson, filename.replace(/\.kmz$/i, ""));
                if (typeof JSZip !== "undefined") {
                    const zip = new JSZip();
                    zip.file("doc.kml", kmlStr);
                    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.google-earth.kmz" });
                    saveBlob(blob, filename);
                } else {
                    const blob = new Blob([kmlStr], { type: "application/vnd.google-earth.kml+xml" });
                    saveBlob(blob, filename.replace(/\.kmz$/i, ".kml"));
                }
                showToast(`Downloaded ${filename}`);
            });
        }

        const gpxBtn = document.getElementById("download-gpx");
        if (gpxBtn) {
            gpxBtn.addEventListener("click", () => {
                const geojson = getSelectedGeoJSONData();
                const filename = getActiveDownloadFilename("gpx");
                const gpxStr = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ""));
                const blob = new Blob([gpxStr], { type: "application/gpx+xml" });
                saveBlob(blob, filename);
                showToast(`Downloaded ${filename}`);
            });
        }

        const geopdfBtn = document.getElementById("download-geopdf");
        if (geopdfBtn) {
            geopdfBtn.addEventListener("click", () => {
                downloadGeoPdf();
            });
        }

        const geotiffBtn = document.getElementById("download-geotiff");
        if (geotiffBtn) {
            geotiffBtn.addEventListener("click", () => {
                downloadGeoTiff();
            });
        }
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
                closeAllModals();
            });
        });
    }

    document.addEventListener("click", (e) => {
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
                    && !window._preventSuggestClose) {
                    closeAllModals();
                }
            }
        }
    });

    setupSuggestFormAndDrawing(closeAllModals);
}

function setupSuggestFormAndDrawing(closeAllModals) {
    const markerBtn = document.getElementById("btn-draw-marker");
    const lineBtn = document.getElementById("btn-draw-line");
    const polygonBtn = document.getElementById("btn-draw-polygon");
    const statusEl = document.getElementById("suggest-annotation-status");
    const suggestForm = document.getElementById("suggest-form");
    const suggestModal = document.getElementById("suggest-modal");

    if (!suggestForm) return;

    let currentMode = null;
    let drawnCoords = [];
    let markerPlaced = false;

    // SVG icons
    const PIN_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
    const CLEAR_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    const setMarkerBtnToAdd = () => {
        if (!markerBtn) return;
        markerBtn.innerHTML = `${PIN_ICON}<span>Add a Marker</span>`;
        markerBtn.classList.remove("is-clear-mode");
    };

    const setMarkerBtnToClear = () => {
        if (!markerBtn) return;
        markerBtn.innerHTML = `${CLEAR_ICON}<span>Clear Marker</span>`;
        markerBtn.classList.add("is-clear-mode");
    };

    const clearAnnotation = (silent = false) => {
        drawnCoords = [];
        markerPlaced = false;
        currentMode = null;
        if (state.map && state.map.getCanvas()) state.map.getCanvas().style.cursor = "";
        document.body.classList.remove("is-annotation-mode");
        if (state.map && state.map.getSource("suggest-annotation-source")) {
            state.map.getSource("suggest-annotation-source").setData({
                type: "FeatureCollection",
                features: []
            });
        }
        if (statusEl) statusEl.textContent = "No location pinned on map";
        setMarkerBtnToAdd();
        if (!silent) showToast("Marker cleared");
    };

    const annotationExitBtn = document.getElementById("annotation-exit-btn");
    if (annotationExitBtn) {
        annotationExitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearAnnotation();
        });
    }

    // Press X to exit annotation mode
    document.addEventListener("keydown", (e) => {
        if ((e.key === "x" || e.key === "X") && document.body.classList.contains("is-annotation-mode")) {
            e.preventDefault();
            clearAnnotation();
        }
    });

    const resetDrawingMode = () => {
        currentMode = null;
        if (state.map && state.map.getCanvas()) state.map.getCanvas().style.cursor = "";
        document.body.classList.remove("is-annotation-mode");
        [markerBtn, lineBtn, polygonBtn].forEach(btn => {
            if (btn) btn.classList.remove("is-active");
        });
    };

    const updateAnnotationSource = () => {
        if (!state.map) return;
        let feature = null;
        if (drawnCoords.length > 0) {
            feature = {
                type: "Feature",
                geometry: { type: "Point", coordinates: drawnCoords[0] }
            };
        }

        const geojson = {
            type: "FeatureCollection",
            features: feature ? [feature] : []
        };

        if (state.map.getSource("suggest-annotation-source")) {
            state.map.getSource("suggest-annotation-source").setData(geojson);
        } else {
            state.map.addSource("suggest-annotation-source", {
                type: "geojson",
                data: geojson
            });

            // Build a green location-pin SVG and register it as a MapLibre image
            const addMarkerLayer = () => {
                if (!state.map.hasImage("suggest-pin-icon")) {
                    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
                        <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30S36 31.5 36 18C36 8.06 27.94 0 18 0z" fill="#30d158"/>
                        <circle cx="18" cy="18" r="7" fill="#30d158"/>
                    </svg>`;
                    const blob = new Blob([svg], { type: "image/svg+xml" });
                    const url = URL.createObjectURL(blob);
                    const img = new Image(36, 48);
                    img.onload = () => {
                        if (!state.map.hasImage("suggest-pin-icon")) {
                            state.map.addImage("suggest-pin-icon", img);
                        }
                        if (!state.map.getLayer("suggest-annotation-point-layer")) {
                            state.map.addLayer({
                                id: "suggest-annotation-point-layer",
                                type: "symbol",
                                source: "suggest-annotation-source",
                                filter: ["==", "$type", "Point"],
                                layout: {
                                    "icon-image": "suggest-pin-icon",
                                    "icon-size": 0.55,
                                    "icon-anchor": "bottom",
                                    "icon-allow-overlap": true
                                }
                            });
                        }
                        URL.revokeObjectURL(url);
                    };
                    img.src = url;
                } else {
                    state.map.addLayer({
                        id: "suggest-annotation-point-layer",
                        type: "symbol",
                        source: "suggest-annotation-source",
                        filter: ["==", "$type", "Point"],
                        layout: {
                            "icon-image": "suggest-pin-icon",
                            "icon-size": 0.55,
                            "icon-anchor": "bottom",
                            "icon-allow-overlap": true
                        }
                    });
                }
            };

            addMarkerLayer();
        }
    };

    if (state.map) {
        state.map.on("click", (e) => {
            if (!currentMode) return;
            const pt = [e.lngLat.lng, e.lngLat.lat];

            if (currentMode === "marker") {
                drawnCoords = [pt];
                updateAnnotationSource();
                window._preventSuggestClose = true;  // block modal-close on this same click
                setTimeout(() => { window._preventSuggestClose = false; }, 0);
                resetDrawingMode();
                markerPlaced = true;
                if (statusEl) {
                    statusEl.innerHTML = `<span class="suggest-status-badge">Marker: ${pt[1].toFixed(4)}°, ${pt[0].toFixed(4)}°</span>`;
                }
                setMarkerBtnToClear();

                if (suggestModal) {
                    suggestModal.setAttribute("aria-hidden", "false");
                    suggestModal.classList.add("is-open");
                    if (window.updateActionButtonsState) window.updateActionButtonsState();
                }
                showToast("Marker added to map!");
            }
        });
    }

    const startDrawing = (mode, btnEl, msg) => {
        if (!state.map) {
            showToast("Map is not available");
            return;
        }
        resetDrawingMode();
        currentMode = mode;
        drawnCoords = [];
        if (btnEl) btnEl.classList.add("is-active");
        if (state.map.getCanvas()) state.map.getCanvas().style.cursor = "crosshair";
        document.body.classList.add("is-annotation-mode");
        showToast(msg);
    };

    if (markerBtn) {
        markerBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (markerPlaced) {
                // Toggle to clear mode
                clearAnnotation();
            } else {
                startDrawing("marker", markerBtn, "Click anywhere on the map to place a marker!");
            }
        });
    }

    if (lineBtn) {
        lineBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showToast("Feature not available (coming soon)");
        });
    }

    if (polygonBtn) {
        polygonBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showToast("Feature not available (coming soon)");
        });
    }

    suggestForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const titleInput = document.getElementById("suggest-input-title");
        const msgInput = document.getElementById("suggest-input-message");

        const title = titleInput ? titleInput.value.trim() : "";
        const message = msgInput ? msgInput.value.trim() : "";

        if (!title || !message) {
            showToast("Please fill in all required fields.");
            return;
        }

        // Placeholder submit action
        showToast("Suggestion submitted! Thank you for your feedback.");

        // Reset form & clear annotation
        if (titleInput) titleInput.value = "";
        if (msgInput) msgInput.value = "";

        clearAnnotation(true); // silent — submit toast already shown

        // Close modal
        if (closeAllModals) closeAllModals();
    });
}


    function checkGitHubAuth() {
        // Check GitHub auth session state (placeholder for future GitHub OAuth integration)
        const isGitHubLoggedIn = Boolean(
            localStorage.getItem("github_token") ||
            sessionStorage.getItem("github_token") ||
            localStorage.getItem("gh_user")
        );
        const editBtn = document.getElementById("btn-edit-item");
        if (editBtn) {
            editBtn.style.display = isGitHubLoggedIn ? "" : "none";
        }
    }
    checkGitHubAuth();

    const editBtn = document.getElementById("btn-edit-item");
    if (editBtn) {
        editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            let target = state.currentId;
            if (target && target !== CIRCLE_ID) {
                target = normalizeZoneId(target);
            } else {
                target = CIRCLE_ID;
            }
            window.location.href = `/editor/?id=${encodeURIComponent(target)}`;
        });
    }

    const capsuleBackBtn = document.getElementById("btn-capsule-back");
    if (capsuleBackBtn) {
        capsuleBackBtn.addEventListener("click", (e) => {
            const list = document.getElementById("sidebar-zone-list");
            
            // On mobile, if we have the list container and aren't already animating, trigger the transition
            if (window.innerWidth <= 768 && list && !list.classList.contains("fly-out-right") && !list.classList.contains("fly-in-left-active")) {
                e.preventDefault();
                e.stopPropagation();
                
                list.classList.add("fly-out-right");
                
                setTimeout(() => {
                    executeBackNavigation();
                    
                    // Reset class and trigger fly-in from left
                    list.classList.remove("fly-out-right");
                    list.classList.add("fly-in-left-start");
                    list.offsetHeight; // Force reflow
                    list.classList.add("fly-in-left-active");
                    
                    setTimeout(() => {
                        list.classList.remove("fly-in-left-start", "fly-in-left-active");
                    }, 250);
                }, 200);
            } else {
                executeBackNavigation();
            }
        });
    }

    function executeBackNavigation() {
        if (!state.isCirclesFeature && (state.currentId === CIRCLE_ID || !state.currentId)) {
            switchToCirclesFeature();
        } else {
            selectSubject(CIRCLE_ID);
        }
    }

async function performDirectCopyLink() {
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

function setupSearch() {
    const header = document.getElementById("sidebar-header");
    const toggleBtn = document.getElementById("btn-search-toggle");
    const closeBtn = document.getElementById("btn-search-close");
    const searchInput = document.getElementById("sidebar-search-input");
    const listContainer = document.getElementById("sidebar-zone-list");

    if (!header || !toggleBtn || !closeBtn || !searchInput || !listContainer) return;

    let savedHeights = null;

    const openSearch = (e) => {
        if (e) e.preventDefault();
        const mapArea = document.querySelector(".maps-tile-map-area");
        const sidebar = document.querySelector(".maps-tile-sidebar");

        if (window.innerWidth <= 768 && mapArea && sidebar) {
            savedHeights = {
                map: mapArea.style.height || "",
                sidebar: sidebar.style.height || ""
            };
            mapArea.style.setProperty("height", "50%", "important");
            sidebar.style.setProperty("height", "50%", "important");
            if (state.map) {
                setTimeout(() => state.map.invalidateSize(), 300);
            }
        }

        header.classList.add("is-searching");
        header.classList.add("is-search-active");
        searchInput.value = "";
        filterList("");
        searchInput.focus();
        setTimeout(() => searchInput.focus(), 100);
    };

    const closeSearch = () => {
        header.classList.remove("is-searching");
        header.classList.remove("is-search-active");
        searchInput.value = "";
        filterList("");

        if (savedHeights) {
            const mapArea = document.querySelector(".maps-tile-map-area");
            const sidebar = document.querySelector(".maps-tile-sidebar");
            if (mapArea && sidebar) {
                if (savedHeights.map) mapArea.style.setProperty("height", savedHeights.map, "important");
                else mapArea.style.removeProperty("height");

                if (savedHeights.sidebar) sidebar.style.setProperty("height", savedHeights.sidebar, "important");
                else sidebar.style.removeProperty("height");

                if (state.map) {
                    setTimeout(() => state.map.invalidateSize(), 300);
                }
            }
            savedHeights = null;
        }
    };

    const filterList = (query) => {
        const q = query.trim().toLowerCase();
        const items = listContainer.querySelectorAll(".tile-zone-item");
        items.forEach(item => {
            const text = item.textContent.toLowerCase();
            const id = (item.getAttribute("data-id") || "").toLowerCase();
            if (!q || text.includes(q) || id.includes(q)) {
                item.style.display = "";
            } else {
                item.style.display = "none";
            }
        });
    };

    toggleBtn.addEventListener("click", openSearch);
    toggleBtn.addEventListener("touchend", (e) => {
        e.preventDefault();
        openSearch(e);
    });
    closeBtn.addEventListener("click", closeSearch);

    searchInput.addEventListener("input", (e) => {
        filterList(e.target.value);
    });

    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeSearch();
        }
    });
}

function setupCapsules() {
    const capsules = document.querySelectorAll(".sidebar-capsule");
    capsules.forEach(cap => {
        cap.addEventListener("click", (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const tab = cap.getAttribute("data-tab");
            if (tab === "tools") {
                showToast("Tools view is not available (coming soon)");
                return;
            }
            if (tab === "settings") {
                showToast("Settings view is not available (coming soon)");
                return;
            }
            capsules.forEach(c => c.classList.remove("is-active"));
            cap.classList.add("is-active");
            state.activeTab = tab || "items";
            renderSidebarList();
        });
    });
}

function setMobileSnapState(snapState, animate = true) {
    const mapArea = document.querySelector(".maps-tile-map-area");
    const sidebar = document.querySelector(".maps-tile-sidebar");
    const resizeBar = document.getElementById("mobile-resize-bar");
    const headerEl = document.querySelector(".maps-tile-header");
    const sidebarHeaderEl = document.getElementById("sidebar-header");
    
    if (!mapArea || !sidebar || !resizeBar || !headerEl || !sidebarHeaderEl) return;

    state.snapState = snapState;

    if (animate) {
        mapArea.style.setProperty("transition", "height 0.32s cubic-bezier(0.16, 1, 0.3, 1)", "important");
        sidebar.style.setProperty("transition", "height 0.32s cubic-bezier(0.16, 1, 0.3, 1)", "important");
    } else {
        mapArea.style.setProperty("transition", "none", "important");
        sidebar.style.setProperty("transition", "none", "important");
    }

    if (snapState === "selection-full") {
        sidebar.classList.add("is-selection-full");
        document.body.classList.add("is-selection-full");
        const resizeBarHeight = resizeBar.offsetHeight || 18;
        mapArea.style.setProperty("height", "0px", "important");
        sidebar.style.setProperty("height", `calc(100% - ${resizeBarHeight}px)`, "important");
    } else if (snapState === "map-full") {
        sidebar.classList.remove("is-selection-full");
        document.body.classList.remove("is-selection-full");
        const headerHeight = headerEl.offsetHeight || 80;
        const subHeaderHeight = sidebarHeaderEl.offsetHeight || 50;
        const totalHeaderHeight = headerHeight + subHeaderHeight;
        const resizeBarHeight = resizeBar.offsetHeight || 18;
        
        sidebar.style.setProperty("height", `${totalHeaderHeight}px`, "important");
        mapArea.style.setProperty("height", `calc(100% - ${totalHeaderHeight + resizeBarHeight}px)`, "important");
    } else {
        sidebar.classList.remove("is-selection-full");
        document.body.classList.remove("is-selection-full");
        mapArea.style.setProperty("height", "calc(50% - 9px)", "important");
        sidebar.style.setProperty("height", "calc(50% - 9px)", "important");
    }

    setTimeout(() => {
        if (state.map) {
            state.map.resize();
        }
    }, animate ? 350 : 0);
}

function setupSwipeNavigation() {
    const headerEl = document.querySelector(".maps-tile-header");
    const sidebarHeaderEl = document.getElementById("sidebar-header");
    const scrollContainer = document.querySelector(".sidebar-capsules-scroll");
    
    const targets = [headerEl, sidebarHeaderEl].filter(Boolean);
    if (targets.length === 0) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let isVerticalSwiping = false;

    const handleTouchStart = (e) => {
        if (window.innerWidth > 768) return;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        startTime = Date.now();
        isVerticalSwiping = false;
    };

    const handleTouchMove = (e) => {
        if (window.innerWidth > 768) return;
        if (!startX || !startY) return;
        
        const touch = e.touches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;

        if (!isVerticalSwiping && Math.abs(diffY) > 10 && Math.abs(diffY) > Math.abs(diffX) * 1.5) {
            isVerticalSwiping = true;
        }

        if (isVerticalSwiping) {
            if (e.cancelable) {
                e.preventDefault();
            }
        }
    };

    const handleTouchEnd = (e) => {
        if (window.innerWidth > 768) return;
        const touch = e.changedTouches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;
        const elapsedTime = Date.now() - startTime;

        startX = 0;
        startY = 0;

        // Vertical swipe to change snap states
        if (Math.abs(diffY) > 40 && Math.abs(diffY) > Math.abs(diffX) * 1.5 && elapsedTime < 300) {
            let currentState = state.snapState || "default";
            let newState = currentState;

            const mapArea = document.querySelector(".maps-tile-map-area");
            const main = document.querySelector(".maps-tile-main");

            if (diffY < 0) {
                // Swipe UP -> moves drawer UP (less map space)
                if (currentState === "map-full") {
                    newState = "default";
                } else if (currentState === "default") {
                    newState = "selection-full";
                } else if (currentState === "custom" && mapArea && main) {
                    const defaultHeight = (main.offsetHeight * 0.5) - 9;
                    if (mapArea.offsetHeight > defaultHeight + 10) {
                        newState = "default";
                    } else {
                        newState = "selection-full";
                    }
                }
            } else {
                // Swipe DOWN -> moves drawer DOWN (more map space)
                if (currentState === "selection-full") {
                    newState = "default";
                } else if (currentState === "default") {
                    newState = "map-full";
                } else if (currentState === "custom" && mapArea && main) {
                    const defaultHeight = (main.offsetHeight * 0.5) - 9;
                    if (mapArea.offsetHeight < defaultHeight - 10) {
                        newState = "default";
                    } else {
                        newState = "map-full";
                    }
                }
            }

            if (newState !== currentState) {
                setMobileSnapState(newState, true);
            }
            return;
        }

        // Horizontal swipe to change class tabs
        if (Math.abs(diffX) > 40 && Math.abs(diffY) < 40 && elapsedTime < 300) {
            const header = document.getElementById("sidebar-header");
            const isSearching = header && header.classList.contains("is-searching");

            if (!scrollContainer) return;
            const tabs = Array.from(scrollContainer.querySelectorAll(".sidebar-capsule"));
            if (tabs.length === 0) return;

            if (isSearching) {
                if (diffX > 0) {
                    // Swiped right -> escape search and go to the last class tab
                    const searchClose = document.getElementById("btn-search-close");
                    if (searchClose) {
                        searchClose.click();
                    }
                    const lastTab = tabs[tabs.length - 1];
                    if (lastTab) {
                        lastTab.click();
                        lastTab.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest",
                            inline: "center"
                        });
                    }
                }
                return;
            }

            if (tabs.length <= 1) return;
            const activeIndex = tabs.findIndex(tab => tab.classList.contains("is-active"));
            if (activeIndex === -1) return;

            let newIndex = activeIndex;
            if (diffX < 0) {
                // Swiped left (finger moves right to left) -> next tab
                newIndex = activeIndex + 1;
            } else {
                // Swiped right (finger moves left to right) -> previous tab
                newIndex = activeIndex - 1;
            }

            if (newIndex >= 0 && newIndex < tabs.length) {
                tabs[newIndex].click();
                tabs[newIndex].scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "center"
                });
            } else if (newIndex === tabs.length) {
                const searchToggle = document.getElementById("btn-search-toggle");
                if (searchToggle) {
                    searchToggle.click();
                }
            }
        }
    };

    targets.forEach(el => {
        el.addEventListener("touchstart", handleTouchStart, { passive: true });
        el.addEventListener("touchmove", handleTouchMove, { passive: false });
        el.addEventListener("touchend", handleTouchEnd, { passive: true });
    });
}

function setupListSwipeBack() {
    const listContainer = document.getElementById("sidebar-zone-list");
    if (!listContainer) return;

    let startX = 0;
    let startY = 0;
    let isTracking = false;
    let listWidth = 0;
    let indicatorTimer = null;

    listContainer.addEventListener("touchstart", (e) => {
        if (window.innerWidth > 768) return;
        
        const backBtn = document.getElementById("btn-capsule-back");
        if (!backBtn || !backBtn.classList.contains("is-visible")) {
            isTracking = false;
            return;
        }

        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        listWidth = listContainer.offsetWidth;
        isTracking = false;
        
        if (indicatorTimer) {
            clearTimeout(indicatorTimer);
            indicatorTimer = null;
        }
        const indicator = document.getElementById("swipe-back-indicator");
        if (indicator) indicator.classList.remove("is-visible");
        
        listContainer.style.transition = "none";
    }, { passive: true });

    listContainer.addEventListener("touchmove", (e) => {
        if (window.innerWidth > 768) return;
        const touch = e.touches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;

        if (!isTracking) {
            const backBtn = document.getElementById("btn-capsule-back");
            const canGoBack = backBtn && backBtn.classList.contains("is-visible");
            
            if (canGoBack && diffX > 10 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
                isTracking = true;
            }
        }

        if (isTracking) {
            if (e.cancelable) {
                e.preventDefault();
            }
            const translateX = Math.max(0, diffX);
            const opacity = Math.max(0.3, 1 - (translateX / (listWidth || 300)));
            
            listContainer.style.transform = `translateX(${translateX}px)`;
            listContainer.style.opacity = opacity;

            // Show indicator only when dragged 1/4 (25%) of the list width AND held for 0.1s
            const threshold = Math.min(80, listWidth * 0.25);
            const indicator = document.getElementById("swipe-back-indicator");
            if (indicator) {
                if (translateX >= threshold) {
                    if (!indicatorTimer) {
                        indicatorTimer = setTimeout(() => {
                            if (isTracking) {
                                indicator.classList.add("is-visible");
                            }
                        }, 100);
                    }
                } else {
                    if (indicatorTimer) {
                        clearTimeout(indicatorTimer);
                        indicatorTimer = null;
                    }
                    indicator.classList.remove("is-visible");
                }
            }
        }
    }, { passive: false });

    listContainer.addEventListener("touchend", (e) => {
        if (window.innerWidth > 768) return;
        
        if (indicatorTimer) {
            clearTimeout(indicatorTimer);
            indicatorTimer = null;
        }
        const indicator = document.getElementById("swipe-back-indicator");
        if (indicator) indicator.classList.remove("is-visible");

        if (!isTracking) return;
        isTracking = false;
        
        const touch = e.changedTouches[0];
        const diffX = touch.clientX - startX;
        const threshold = Math.min(80, listWidth * 0.25);

        if (diffX > threshold) {
            // Commit navigation
            listContainer.style.transition = "transform 0.2s ease-out, opacity 0.2s ease-out";
            listContainer.style.transform = "translateX(100%)";
            listContainer.style.opacity = "0";

            setTimeout(() => {
                const backBtn = document.getElementById("btn-capsule-back");
                if (backBtn) {
                    state.isSwipeTransitionActive = true;
                    backBtn.click();
                    state.isSwipeTransitionActive = false;
                }

                // Animate the new content from the left
                listContainer.style.transition = "none";
                listContainer.style.transform = "translateX(-100%)";
                listContainer.style.opacity = "0";

                listContainer.offsetHeight; // force reflow

                listContainer.style.transition = "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1)";
                listContainer.style.transform = "translateX(0)";
                listContainer.style.opacity = "1";

                setTimeout(() => {
                    listContainer.style.transition = "";
                    listContainer.style.transform = "";
                    listContainer.style.opacity = "";
                }, 250);
            }, 200);
        } else {
            // Cancel and bounce back
            listContainer.style.transition = "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)";
            listContainer.style.transform = "translateX(0)";
            listContainer.style.opacity = "1";

            setTimeout(() => {
                listContainer.style.transition = "";
                listContainer.style.transform = "";
                listContainer.style.opacity = "";
            }, 200);
        }
    }, { passive: true });
}

function openImageLightbox(src, alt = "Enlarged view", text = "") {
    const modal = document.getElementById("image-lightbox-modal");
    const img = document.getElementById("lightbox-img");
    const textEl = document.getElementById("lightbox-text");
    if (modal && img) {
        img.src = src;
        img.alt = alt;
        if (textEl) {
            textEl.textContent = text;
            textEl.style.display = text ? "block" : "none";
        }
        modal.setAttribute("aria-hidden", "false");
        modal.classList.add("is-open");
    }
}

function setupImageLightbox() {
    const modal = document.getElementById("image-lightbox-modal");
    if (!modal) return;

    const closeModal = () => {
        modal.setAttribute("aria-hidden", "true");
        modal.classList.remove("is-open");
    };

    modal.querySelectorAll("[data-modal-close]").forEach(closeEl => {
        closeEl.addEventListener("click", (e) => {
            e.stopPropagation();
            closeModal();
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.getAttribute("aria-hidden") === "false") {
            closeModal();
        }
    });
}

function setupMobileResizeBar() {
    const resizeBar = document.getElementById("mobile-resize-bar");
    const mapArea = document.querySelector(".maps-tile-map-area");
    const sidebar = document.querySelector(".maps-tile-sidebar");
    const main = document.querySelector(".maps-tile-main");

    if (!resizeBar || !mapArea || !sidebar || !main) return;

    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialMapHeight = 0;
    let initialSidebarHeight = 0;
    let isVerticalDragApproved = false;

    const startDrag = (e) => {
        if (window.innerWidth > 768) return;
        
        // Prevent drag initialization when clicking actual buttons or tabs
        if (e.target.closest('.action-btn') || e.target.closest('.sidebar-capsule')) {
            return;
        }

        isDragging = true;
        const touch = e.touches ? e.touches[0] : e;
        dragStartX = touch.clientX;
        dragStartY = touch.clientY;
        
        initialMapHeight = mapArea.offsetHeight;
        initialSidebarHeight = sidebar.offsetHeight;
        
        // If they touched the resize bar directly, vertical drag is approved immediately.
        // Otherwise (selection title or tabs), we wait for a gesture direction threshold.
        const isResizeBar = e.currentTarget === resizeBar;
        isVerticalDragApproved = isResizeBar;

        document.body.style.userSelect = "none";
        document.body.style.cursor = "ns-resize";
        mapArea.style.setProperty("transition", "none", "important");
        sidebar.style.setProperty("transition", "none", "important");
    };

    const doDrag = (e) => {
        if (!isDragging || window.innerWidth > 768) return;

        const touch = e.touches ? e.touches[0] : e;
        const clientX = touch.clientX;
        const clientY = touch.clientY;

        const deltaX = clientX - dragStartX;
        const deltaY = clientY - dragStartY;

        // If not yet approved, check threshold
        if (!isVerticalDragApproved) {
            if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX) * 1.3) {
                isVerticalDragApproved = true;
                // Reset dragStartY to current touch point to avoid a jump
                dragStartY = clientY;
                return;
            }
            if (Math.abs(deltaX) > 8) {
                // If it is a clear horizontal gesture, cancel vertical dragging to let horizontal scroll work
                isDragging = false;
                return;
            }
            return;
        }

        // Prevent browser scrolling while dragging vertical drawer
        if (e.cancelable) {
            e.preventDefault();
        }

        const headerEl = document.querySelector(".maps-tile-header");
        const sidebarHeaderEl = document.getElementById("sidebar-header");
        if (!headerEl || !sidebarHeaderEl) return;

        const mainRect = main.getBoundingClientRect();

        // Calculate new map height relative to dragStartY
        const currentDeltaY = clientY - dragStartY;
        const targetMapHeight = initialMapHeight + currentDeltaY;
        
        const headerHeight = headerEl.offsetHeight || 80;
        const subHeaderHeight = sidebarHeaderEl.offsetHeight || 50;
        const totalHeaderHeight = headerHeight + subHeaderHeight;
        const resizeBarHeight = resizeBar.offsetHeight || 18;

        const maxMapHeight = mainRect.height - totalHeaderHeight - resizeBarHeight;
        const clampedMapHeight = Math.max(0, Math.min(maxMapHeight, targetMapHeight));

        let mapPercentage = (clampedMapHeight / mainRect.height) * 100;
        let sidebarPercentage = ((mainRect.height - clampedMapHeight - resizeBarHeight) / mainRect.height) * 100;

        if (mapPercentage < 5) {
            mapArea.style.setProperty("height", "0px", "important");
            sidebar.style.setProperty("height", `calc(100% - ${resizeBarHeight}px)`, "important");
            sidebar.classList.add("is-selection-full");
            document.body.classList.add("is-selection-full");
            state.snapState = "selection-full";
        } else if (clampedMapHeight >= maxMapHeight - 15) {
            sidebar.style.setProperty("height", `${totalHeaderHeight}px`, "important");
            mapArea.style.setProperty("height", `calc(100% - ${totalHeaderHeight + resizeBarHeight}px)`, "important");
            sidebar.classList.remove("is-selection-full");
            document.body.classList.remove("is-selection-full");
            state.snapState = "map-full";
        } else {
            mapArea.style.setProperty("height", `${mapPercentage.toFixed(2)}%`, "important");
            sidebar.style.setProperty("height", `${sidebarPercentage.toFixed(2)}%`, "important");
            sidebar.classList.remove("is-selection-full");
            document.body.classList.remove("is-selection-full");
            state.snapState = "custom";
        }

        if (state.map) {
            state.map.resize();
        }
    };

    const stopDrag = () => {
        if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = "";
            document.body.style.cursor = "";
            mapArea.style.removeProperty("transition");
            sidebar.style.removeProperty("transition");
            if (state.map) {
                state.map.resize();
            }
        }
    };

    // Attach startDrag to all mobile resize triggers
    const headerEl = document.querySelector(".maps-tile-header");
    const sidebarHeaderEl = document.getElementById("sidebar-header");

    const triggers = [resizeBar, headerEl, sidebarHeaderEl].filter(Boolean);
    triggers.forEach(el => {
        el.addEventListener("mousedown", startDrag);
        el.addEventListener("touchstart", startDrag, { passive: true });
    });

    window.addEventListener("mousemove", doDrag);
    window.addEventListener("touchmove", doDrag, { passive: false });

    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchend", stopDrag);

    // On mobile, default to 50/50 split view instead of large-map view
    if (window.innerWidth <= 768) {
        setMobileSnapState("default", false);
    }
}

function setupHelpModeSystem() {
    const toggleInput = document.getElementById("toggle-help-mode");
    const tooltip = document.getElementById("help-mode-tooltip");
    const highlight = document.getElementById("help-mode-highlight");

    const setHelpMode = (active, isFromKey = false) => {
        state.isHelpModeActive = active;
        if (toggleInput) toggleInput.checked = active;
        if (active) {
            document.body.classList.add("is-help-mode-active");
            tagElements();
            if (isFromKey) showToast("Interactive Help Mode: Enabled");
        } else {
            document.body.classList.remove("is-help-mode-active");
            if (tooltip) tooltip.setAttribute("aria-hidden", "true");
            if (highlight) highlight.setAttribute("aria-hidden", "true");
            if (isFromKey) showToast("Interactive Help Mode: Disabled");
        }
        if (window.updateActionButtonsState) window.updateActionButtonsState();
    };

    if (toggleInput) {
        toggleInput.addEventListener("change", (e) => {
            setHelpMode(e.target.checked, false);
        });
    }

    const docLink = document.querySelector(".help-doc-link");
    if (docLink) {
        docLink.addEventListener("click", (e) => {
            e.preventDefault();
            showToast("Documentation not available (coming soon)");
        });
    }

    document.addEventListener("mousedown", () => {
        state.lastNavSource = "click";
    }, true);

    document.addEventListener("keydown", (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
        if (activeTag === "input" || activeTag === "textarea") return;

        // Open Help Modal (Shift + H)
        if (e.shiftKey && (e.key === "h" || e.key === "H")) {
            e.preventDefault();
            const helpBtn = document.getElementById("btn-help");
            if (helpBtn) helpBtn.click();
            return;
        }

        // Toggle Interactive Help Mode (H key)
        if (!e.shiftKey && (e.key === "h" || e.key === "H")) {
            setHelpMode(!state.isHelpModeActive, true);
            return;
        }

        // Toggle Fullscreen (Shift + F)
        if (e.shiftKey && (e.key === "f" || e.key === "F")) {
            e.preventDefault();
            toggleFullscreen();
            return;
        }

        // Open Search Field (F key)
        if (!e.shiftKey && (e.key === "f" || e.key === "F")) {
            e.preventDefault();
            const searchToggle = document.getElementById("btn-search-toggle");
            if (searchToggle) searchToggle.click();
            return;
        }

        // Open Download Modal (Shift + G)
        if (e.shiftKey && (e.key === "g" || e.key === "G")) {
            e.preventDefault();
            const downloadBtn = document.getElementById("btn-download-files");
            if (downloadBtn) downloadBtn.click();
            return;
        }

        // Edit Item (Shift + X)
        if (e.shiftKey && (e.key === "x" || e.key === "X")) {
            e.preventDefault();
            const editBtn = document.getElementById("btn-edit-item");
            if (editBtn && editBtn.style.display !== "none") editBtn.click();
            return;
        }

        // Suggest Edit (Shift + Z)
        if (e.shiftKey && (e.key === "z" || e.key === "Z")) {
            e.preventDefault();
            const suggestBtn = document.getElementById("btn-suggest");
            if (suggestBtn) suggestBtn.click();
            return;
        }

        // Copy Link (Shift + C)
        if (e.shiftKey && (e.key === "c" || e.key === "C")) {
            e.preventDefault();
            performDirectCopyLink();
            return;
        }

        // Back Navigation (Escape key)
        if (e.key === "Escape" || e.key === "Esc") {
            state.lastNavSource = "keyboard";
            const lightbox = document.getElementById("image-lightbox-modal");
            if (lightbox && lightbox.classList.contains("is-open")) {
                lightbox.classList.remove("is-open");
                lightbox.setAttribute("aria-hidden", "true");
                return;
            }
            const openModal = document.querySelector(".maps-tile-modal[aria-hidden='false']");
            if (openModal) {
                openModal.setAttribute("aria-hidden", "true");
                return;
            }
            const backBtn = document.getElementById("btn-capsule-back");
            if (backBtn) backBtn.click();
            return;
        }

        // About Information (` key)
        if (e.key === "`" || e.key === "~") {
            state.lastNavSource = "keyboard";
            const aboutTab = document.querySelector('.sidebar-capsule[data-tab="about"]');
            if (aboutTab) aboutTab.click();
            return;
        }

        // Class Tabs Navigation (Numbers 1-9 without Shift)
        if (!e.shiftKey && e.key >= "1" && e.key <= "9") {
            state.lastNavSource = "keyboard";
            const index = parseInt(e.key, 10) - 1;
            const classTabs = document.querySelectorAll('.sidebar-capsule:not(.sidebar-capsule--icon)');
            if (classTabs && classTabs[index]) {
                classTabs[index].click();
            }
            return;
        }

        // Shift + 1-9 Map Style Navigation
        if (e.shiftKey && (e.code.startsWith("Digit") || (e.key >= "1" && e.key <= "9") || "!@#$%^&*(".includes(e.key))) {
            let digitNum = 0;
            if (e.code.startsWith("Digit")) {
                digitNum = parseInt(e.code.replace("Digit", ""), 10);
            } else if (e.key >= "1" && e.key <= "9") {
                digitNum = parseInt(e.key, 10);
            } else {
                const shiftMap = { "!": 1, "@": 2, "#": 3, "$": 4, "%": 5, "^": 6, "&": 7, "*": 8, "(": 9 };
                digitNum = shiftMap[e.key] || 0;
            }
            if (digitNum >= 1 && digitNum <= 9) {
                e.preventDefault();
                selectMapStyleByIndex(digitNum - 1);
                return;
            }
        }

        // Map Zoom (+, -, Shift+E zoom in, Shift+Q zoom out)
        const k = e.key.toLowerCase();
        if (e.key === "+" || e.key === "=" || (e.shiftKey && k === "e")) {
            e.preventDefault();
            if (state.map) state.map.zoomIn();
            return;
        }
        if (e.key === "-" || e.key === "_" || (e.shiftKey && k === "q")) {
            e.preventDefault();
            if (state.map) state.map.zoomOut();
            return;
        }

        // WASD & Arrow Feature Tile Navigation OR Shift + WASD/Arrow Map Panning
        if (k === "w" || e.key === "ArrowUp") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([0, -120], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            if (state.focusedTileIndex === -1) {
                const tiles = document.querySelectorAll("#sidebar-zone-list .tile-zone-item");
                updateKeyboardTileFocus(tiles ? tiles.length - 1 : 0);
            } else {
                updateKeyboardTileFocus(state.focusedTileIndex - 1);
            }
            return;
        }
        if (k === "s" || e.key === "ArrowDown") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([0, 120], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            if (state.focusedTileIndex === -1) {
                updateKeyboardTileFocus(0);
            } else {
                updateKeyboardTileFocus(state.focusedTileIndex + 1);
            }
            return;
        }
        if (k === "a" || e.key === "ArrowLeft") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([-120, 0], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            const backBtn = document.getElementById("btn-capsule-back");
            if (backBtn) backBtn.click();
            return;
        }
        if (k === "d" || e.key === "ArrowRight") {
            e.preventDefault();
            if (e.shiftKey) {
                if (state.map) state.map.panBy([120, 0], { animate: true });
                return;
            }
            state.lastNavSource = "keyboard";
            const tiles = document.querySelectorAll("#sidebar-zone-list .tile-zone-item");
            if (tiles && tiles.length > 0) {
                const targetIdx = state.focusedTileIndex >= 0 ? state.focusedTileIndex : 0;
                if (tiles[targetIdx]) tiles[targetIdx].click();
            }
            return;
        }
    });

    const helpDictionary = [
        { selector: "#desktop-nav-tab-home, #mobile-nav-tab-home", title: "Home Tab", desc: "Click this bar to navigate back to the Fovea homepage." },
        { selector: "#desktop-nav-tab-tools, #mobile-nav-tab-tools", title: "Tools Tab", desc: "Access various tools to assist with bird data collection, processing, and spatial analysis." },
        { selector: "#desktop-nav-tab-settings, #mobile-nav-tab-settings", title: "Settings Tab", desc: "Configure options, visual display preferences, and map style layers." },
        { selector: "#header-logo-container, .logo--header", title: "Organization Logo", desc: "Click the organization logo to navigate to the home directory of the organization which the currently selected feature belongs to." },
        { selector: "#header-title", title: "Selection Title", desc: "Displays the name of the currently selected feature." },
        { selector: "#btn-copy-link", title: "Share", desc: "Generates and copies a direct URL share link for the current view.", shortcut: "Shift + C" },
        { selector: "#btn-download-files", title: "Download Files", desc: "Access spatial GIS, PDF maps, and survey dataset files for this selection.", shortcut: "Shift + G" },
        { selector: "#btn-edit-item", title: "Edit Item", desc: "Opens the spatial data editor interface for updating boundaries.", shortcut: "Shift + X" },
        { selector: "#btn-suggest", title: "Suggest Edit", desc: "Submit suggestions, feedback, or pin map annotations.", shortcut: "Shift + Z" },
        { selector: "#btn-help", title: "Help & Guide", desc: "Opens user documentation and toggles Interactive Tooltip Mode.", shortcut: "Shift + H" },
        { selector: "#btn-capsule-back", title: "Back Navigation", desc: "Return to the previous higher-level overview (circle or list).", shortcut: "Esc or A / Left Arrow" },
        { selector: '[data-tab="about"]', title: "About Tab", desc: "View detailed descriptions, spatial summaries, and photographs.", shortcut: "` (Backtick)" },
        { selector: '.sidebar-capsule:not(.sidebar-capsule--icon)', title: "Class Tab", desc: "Class tabs filter the subfeatures of the current selection by type, which is reflected in the feature tiles column.", shortcut: "1 - 9" },
        { selector: "#btn-search-toggle", title: "Search Tool", desc: "Expand full-row search bar to filter count circles and survey zones.", shortcut: "F" },
        { selector: "#mobile-resize-bar", title: "Resize Handle", desc: "Drag vertically to adjust split screen map and list proportions." },
        { selector: ".map-ctrl-zoom", title: "Zoom Controls", desc: "Zoom in (+) or out (-) on the interactive map view.", shortcut: "+ / - or Shift + E / Q" },
        { selector: ".map-ctrl-locate", title: "Location Tracking", desc: "Locate your current live GPS position on the survey map." },
        { selector: ".map-ctrl-fullscreen", title: "Fullscreen Toggle", desc: "Expand map view to fill your entire screen display.", shortcut: "Shift + F" },
        { selector: ".map-ctrl-styles", title: "Map Elements", desc: "Select the basemap and toggle overlay layers for the map frame.", shortcut: "Shift + 1 - 9" },
        { selector: ".map-ctrl-styles__list .tile-zone-item", title: "Map Element Option", desc: "Select this basemap or overlay layer to update the active map display." },
        { selector: '.modal-capsule[data-tab="basemaps"]', title: "Basemaps Tab", desc: "View and select the underlying style of the interactive map." },
        { selector: '.modal-capsule[data-tab="layers"]', title: "Class Tab", desc: "Class tabs filter the subfeatures of the current selection by type, which is reflected in the feature tiles column.", shortcut: "1 - 9" },
        { selector: ".modal-search-toggle-btn", title: "Element Search", desc: "Toggle a text search box to filter the visible list items below." },
        { selector: ".modal-search-input", title: "Search Text Input", desc: "Type to filter layers or basemaps matching your keywords." },
        { selector: ".tile-zone-item", title: "Feature Tile", desc: "A feature tile represents a sub feature of the currently selected item. Click it to select the feature.", shortcut: "WASD or Arrows (W/S to navigate, D to select)" },
        { selector: "#tile-map, #map-wrapper", title: "Map Frame", desc: "Interactive spatial map view showing bird count circles and survey zone boundaries.", shortcut: "Shift + WASD or Arrow Keys" }
    ];

    const tagElements = () => {
        helpDictionary.forEach(item => {
            const els = document.querySelectorAll(item.selector);
            els.forEach(el => {
                el.setAttribute("data-help-title", item.title);
                el.setAttribute("data-help-desc", item.desc);
                if (item.shortcut) {
                    el.setAttribute("data-help-shortcut", item.shortcut);
                } else {
                    el.removeAttribute("data-help-shortcut");
                }
            });
        });
    };

    tagElements();

    const observer = new MutationObserver(() => {
        if (state.isHelpModeActive) {
            tagElements();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const resolveHelpTarget = (eventTarget) => {
        let target = eventTarget.closest("[data-help-title]");
        let title = target ? target.getAttribute("data-help-title") : null;
        let desc = target ? target.getAttribute("data-help-desc") : null;
        let shortcut = target ? target.getAttribute("data-help-shortcut") : null;

        if (!target) {
            for (const item of helpDictionary) {
                const matched = eventTarget.closest(item.selector);
                if (matched) {
                    target = matched;
                    title = item.title;
                    desc = item.desc;
                    shortcut = item.shortcut || null;
                    target.setAttribute("data-help-title", title);
                    target.setAttribute("data-help-desc", desc);
                    if (shortcut) target.setAttribute("data-help-shortcut", shortcut);
                    break;
                }
            }
        }
        if (target && (target.id === "tile-map" || target.id === "map-wrapper" || title === "Map Frame")) {
            if (eventTarget.closest(".map-ctrl-container, .map-ctrl-panel")) {
                return { target: null, title: null, desc: null, shortcut: null };
            }
        }

        return { target, title, desc, shortcut };
    };

    const isTouchDevice = () => {
        return window.matchMedia("(pointer: coarse)").matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0) || window.innerWidth <= 768;
    };

    document.addEventListener("mousemove", (e) => {
        if (!state.isHelpModeActive || isTouchDevice()) return;

        const { target, title, desc, shortcut } = resolveHelpTarget(e.target);
        if (target) {
            if (tooltip) {
                tooltip.innerHTML = `
                    <div class="help-mode-tooltip__title">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        <span>${title}</span>
                    </div>
                    <p class="help-mode-tooltip__desc">${desc}</p>
                    ${shortcut ? `
                        <div class="help-mode-tooltip__shortcut">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M8 16h8"></path></svg>
                            <span class="help-mode-tooltip__shortcut-label">Shortcut:</span>
                            <span class="help-mode-tooltip__shortcut-val">${shortcut}</span>
                        </div>
                    ` : ""}
                `;

                tooltip.setAttribute("aria-hidden", "false");

                const tooltipWidth = tooltip.offsetWidth || 240;
                const tooltipHeight = tooltip.offsetHeight || 80;

                let posX = e.clientX + 15;
                let posY = e.clientY + 15;

                if (posX + tooltipWidth > window.innerWidth - 10) {
                    posX = e.clientX - tooltipWidth - 15;
                }
                if (posY + tooltipHeight > window.innerHeight - 10) {
                    posY = e.clientY - tooltipHeight - 15;
                }

                tooltip.style.left = `${posX}px`;
                tooltip.style.top = `${posY}px`;
            }

            if (highlight) {
                const rect = target.getBoundingClientRect();
                const pad = 3;
                highlight.style.left = `${rect.left - pad}px`;
                highlight.style.top = `${rect.top - pad}px`;
                highlight.style.width = `${rect.width + pad * 2}px`;
                highlight.style.height = `${rect.height + pad * 2}px`;
                highlight.setAttribute("aria-hidden", "false");
            }
        } else {
            if (tooltip) tooltip.setAttribute("aria-hidden", "true");
            if (highlight) highlight.setAttribute("aria-hidden", "true");
        }
    });

    const mobileExitBtn = document.getElementById("mobile-help-exit-btn");
    if (mobileExitBtn) {
        mobileExitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            setHelpMode(false, false);
        });
    }

    const handleHelpClick = (e) => {
        if (!state.isHelpModeActive || !isTouchDevice()) return;

        const helpModal = document.getElementById("help-modal");
        if (helpModal && helpModal.contains(e.target)) return;
        if (mobileExitBtn && mobileExitBtn.contains(e.target)) return;

        const { target, title, desc, shortcut } = resolveHelpTarget(e.target);
        if (target) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            if (tooltip) {
                tooltip.innerHTML = `
                    <div class="help-mode-tooltip__title">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        <span>${title}</span>
                    </div>
                    <p class="help-mode-tooltip__desc">${desc}</p>
                    ${shortcut ? `
                        <div class="help-mode-tooltip__shortcut">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M8 16h8"></path></svg>
                            <span class="help-mode-tooltip__shortcut-label">Shortcut:</span>
                            <span class="help-mode-tooltip__shortcut-val">${shortcut}</span>
                        </div>
                    ` : ""}
                `;
                tooltip.setAttribute("aria-hidden", "false");

                const rect = target.getBoundingClientRect();
                const tooltipWidth = tooltip.offsetWidth || 240;
                const tooltipHeight = tooltip.offsetHeight || 80;

                let posX = rect.left + (rect.width / 2) - (tooltipWidth / 2);
                let posY = rect.bottom + 10;

                if (posX < 10) posX = 10;
                if (posX + tooltipWidth > window.innerWidth - 10) posX = window.innerWidth - tooltipWidth - 10;
                if (posY + tooltipHeight > window.innerHeight - 10) posY = rect.top - tooltipHeight - 10;
                if (posY < 10) posY = 10;

                tooltip.style.left = `${posX}px`;
                tooltip.style.top = `${posY}px`;
            }

            if (highlight) {
                const rect = target.getBoundingClientRect();
                const pad = 3;
                highlight.style.left = `${rect.left - pad}px`;
                highlight.style.top = `${rect.top - pad}px`;
                highlight.style.width = `${rect.width + pad * 2}px`;
                highlight.style.height = `${rect.height + pad * 2}px`;
                highlight.setAttribute("aria-hidden", "false");
            }
        }
    };

    document.addEventListener("click", handleHelpClick, true);
}

async function init() {
    const triggerEntrance = () => {
        document.body.classList.remove("is-transitioning");
        const overlay = document.getElementById("page-transition-overlay");
        if (overlay) overlay.classList.remove("is-active");

        // Wait 500ms for nav tabs to finish sliding up (map frame reaches full height),
        // then fade out the map placeholder.
        setTimeout(() => {
            const placeholder = document.getElementById("map-loading-placeholder");
            if (placeholder) {
                placeholder.classList.add("is-faded");
                setTimeout(() => {
                    placeholder.style.display = "none";
                }, 500);
            }

            // Once the map container reaches full height, resize the map and refit bounds
            // without any animation so the zoom level matches exactly.
            if (state.map) {
                state.map.resize();
                selectSubject(state.currentId, true, false);
            }
        }, 500);
    };

    try {
        const [circlesRes, eugeneRes, florenceRes] = await Promise.all([
            fetch(CIRCLES_GEOJSON_PATH),
            fetch(EUGENE_GEOJSON_PATH),
            fetch(FLORENCE_GEOJSON_PATH)
        ]);
        if (!circlesRes.ok) throw new Error(`Circles fetch failed (${circlesRes.status})`);
        if (!eugeneRes.ok) throw new Error(`Eugene fetch failed (${eugeneRes.status})`);
        if (!florenceRes.ok) throw new Error(`Florence fetch failed (${florenceRes.status})`);

        const circlesData = await circlesRes.json();
        const eugeneData = await eugeneRes.json();
        const florenceData = await florenceRes.json();

        state.circlesFeatures = Array.isArray(circlesData.features) ? circlesData.features : [];
        state.eugeneFeatures = Array.isArray(eugeneData.features) ? eugeneData.features : [];
        state.florenceFeatures = Array.isArray(florenceData.features) ? florenceData.features : [];

        const initialId = getInitialIdFromUrl();
        if (state.isCirclesFeature) {
            state.allFeatures = state.circlesFeatures;
        } else if (state.currentFeature === "florence") {
            state.allFeatures = state.florenceFeatures;
        } else {
            state.allFeatures = state.eugeneFeatures;
        }

        renderSidebarList();
        initializeMap();
        setupActionButtons();
        setupSearch();
        setupCapsules();
        setupSwipeNavigation();
        setupListSwipeBack();
        setupImageLightbox();
        setupMobileResizeBar();
        setupHelpModeSystem();
        setupSidebarScrollListener();
        setupMobileNavToggle();
        setupMobileNavSwipeListener();

        selectSubject(initialId, true, false);

        if (initialId === "Oakridge" || initialId === "Cottage Grove") {
            setTimeout(() => {
                showToast("There is no data for this count circle");
            }, 800);
        }

        if (state.map) {
            state.map.once("load", () => {
                setTimeout(triggerEntrance, 150);
            });
            // Safety timeout fallback
            setTimeout(triggerEntrance, 1000);
        } else {
            triggerEntrance();
        }
    } catch (err) {
        console.error("Error initializing maps tile page:", err);
        updateHeader("Error loading map data");
        triggerEntrance();
    }
}

function setupSidebarScrollListener() {
    const scrollBox = document.getElementById("sidebar-zone-list");
    const header = document.getElementById("sidebar-header");
    const mobileTabs = document.querySelector(".mobile-nav-tabs");
    
    if (scrollBox && header) {
        let lastScrollTop = 0;
        
        scrollBox.addEventListener("scroll", () => {
            const scrollTop = scrollBox.scrollTop;
            
            if (scrollTop > 0) {
                header.classList.add("is-scrolled");
            } else {
                header.classList.remove("is-scrolled");
            }
        });
    }
}

document.addEventListener("DOMContentLoaded", init);

// Desktop & mobile back home transition listener
(function () {
    const bars = [
        document.getElementById("desktop-nav-tab-home"),
        document.getElementById("mobile-nav-tab-home")
    ].filter(Boolean);
    const overlay = document.getElementById("page-transition-overlay");
    if (bars.length === 0 || !overlay) return;

    bars.forEach(bar => {
        bar.addEventListener("click", function (e) {
            e.preventDefault();
            const dest = bar.getAttribute("href") || "../";

            // Step 1: Simultaneously trigger grey bar pull down and whole screen fade to black
            document.body.classList.add("is-transitioning");
            overlay.classList.add("is-active");

            // Step 2: Navigate after the combined 500ms transitions finish
            setTimeout(function () {
                window.location.href = dest;
            }, 500);
        });
    });

    // Reset page states if user navigates back using browser Back button (bfcache reset)
    window.addEventListener("pageshow", function (event) {
        if (event.persisted) {
            document.body.classList.remove("is-transitioning");
            overlay.classList.remove("is-active");
        }
    });
})();


function setupMobileNavToggle() {
    const toggleBtn = document.getElementById("mobile-nav-toggle");
    const mobileTabs = document.querySelector(".mobile-nav-tabs");
    if (toggleBtn && mobileTabs) {
        toggleBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            mobileTabs.classList.toggle("is-hidden");
        });
    }
}

function setupMobileNavSwipeListener() {
    const listContainer = document.getElementById("sidebar-zone-list");
    const mobileTabs = document.querySelector(".mobile-nav-tabs");
    if (!listContainer || !mobileTabs) return;

    let startX = 0;
    let startY = 0;
    let isSwipeCandidate = false;

    listContainer.addEventListener("touchstart", (e) => {
        if (window.innerWidth > 768) return;
        const touch = e.touches[0];
        startX = touch.clientX;
        startY = touch.clientY;
        isSwipeCandidate = true;
    }, { passive: true });

    listContainer.addEventListener("touchmove", (e) => {
        if (!isSwipeCandidate || window.innerWidth > 768) return;
        
        const touch = e.touches[0];
        const diffX = touch.clientX - startX;
        const diffY = touch.clientY - startY;

        // Verify primary horizontal swipe
        if (Math.abs(diffX) > Math.abs(diffY) * 1.5) {
            if (diffX < -30) { // Swiped left -> reveal drawer
                isSwipeCandidate = false;
                mobileTabs.classList.remove("is-hidden");
            } else if (diffX > 30) { // Swiped right -> hide drawer
                isSwipeCandidate = false;
                mobileTabs.classList.add("is-hidden");
            }
        }
    }, { passive: true });
}


