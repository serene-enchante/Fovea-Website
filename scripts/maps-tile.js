const EUGENE_GEOJSON_PATH = "../geojson/Eugene-01-wgs84.geojson";
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
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        toast.className = "toast-notification";
        const mapWrapper = document.getElementById("map-wrapper");
        (mapWrapper || document.body).appendChild(toast);
    }
    toast.textContent = message;
    if (isError) {
        toast.classList.add("toast-notification--disabled");
    } else {
        toast.classList.remove("toast-notification--disabled");
    }
    toast.classList.add("is-visible");
    setTimeout(() => {
        toast.classList.remove("is-visible");
    }, 2500);
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
    });
    state.currentBaseLayer = baseMapId;

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
    
    // Switch basemap to Esri Topo if not already active
    if (state.currentBaseLayer !== "esri-topo") {
        switchBaseMap("esri-topo");
        
        // Wait for MapLibre to load and render Esri Topo tiles
        await new Promise((resolve) => {
            let checkCount = 0;
            const checkIdle = () => {
                checkCount++;
                if ((state.map && state.map.areTilesLoaded()) || checkCount > 25) {
                    if (state.map) state.map.off('idle', checkIdle);
                    resolve();
                }
            };
            if (state.map) {
                state.map.on('idle', checkIdle);
                state.map.triggerRepaint();
            }
            setTimeout(resolve, 1000); // Failsafe timeout for network tiles
        });
    }

    if (state.map) {
        state.map.triggerRepaint();
        await new Promise(r => setTimeout(r, 200));
    }

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

    // Draw MapLibre WebGL canvas image into map box
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

    // Restore previous basemap if changed
    if (previousBaseLayer !== "esri-topo") {
        switchBaseMap(previousBaseLayer);
    }

    return layoutCanvas;
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
            duration: 900,
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
            state.map.fitBounds(getBbox(state.allFeatures), { padding: getFitPadding(), animate: animate });
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
            state.map.fitBounds(getBbox(state.allFeatures), { padding: getFitPadding(), animate: animate });
        } else {
            state.map.fitBounds(getBbox([targetFeature]), { padding: getFitPadding(20), maxZoom: 14, animate: animate });
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

function initializeMap() {
    const mapContainer = document.getElementById("tile-map");
    const mapWrapper = document.getElementById("map-wrapper");
    if (!mapContainer) return;

    state.map = new maplibregl.Map({
        container: 'tile-map',
        preserveDrawingBuffer: true,
        maxZoom: 20,
        style: {
            version: 8,
            glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
            sources: {
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
                        
                        if (state.map && state.baseMapsList) {
                            state.baseMapsList.forEach(bm => {
                                if (state.map.getLayer(bm.layerId)) {
                                    state.map.setLayoutProperty(bm.layerId, 'visibility', bm.layerId === b.layerId ? 'visible' : 'none');
                                }
                            });
                        }
                        state.currentBaseLayer = b.id;

                        const mapWrapper = document.getElementById("map-wrapper");
                        if (mapWrapper) {
                            if (b.id === "esri-street" || b.id === "esri-topo") {
                                mapWrapper.classList.add("is-light-basemap");
                            } else {
                                mapWrapper.classList.remove("is-light-basemap");
                            }
                        }

                        updateAllFeatureStyles();
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
        cap.addEventListener("click", () => {
            capsules.forEach(c => c.classList.remove("is-active"));
            cap.classList.add("is-active");
            state.activeTab = cap.getAttribute("data-tab") || "items";
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

    // On mobile, default to large-map view instead of 50/50 split
    if (window.innerWidth <= 768) {
        setMobileSnapState("map-full", false);
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


