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

// Darken a hex color by a specified percentage factor (0.0 to 1.0)
function darkenHexColor(hex, percent) {
    hex = hex.replace(/^s*#|s*$/g, '');
    if (hex.length === 3) {
        hex = hex.replace(/(.)/g, '$1$1');
    }
    let r = parseInt(hex.substr(0, 2), 16);
    let g = parseInt(hex.substr(2, 2), 16);
    let b = parseInt(hex.substr(4, 2), 16);

    const factor = 1 - percent;
    r = Math.max(0, Math.min(255, Math.round(r * factor)));
    g = Math.max(0, Math.min(255, Math.round(g * factor)));
    b = Math.max(0, Math.min(255, Math.round(b * factor)));

    const rs = r.toString(16).padStart(2, '0');
    const gs = g.toString(16).padStart(2, '0');
    const bs = b.toString(16).padStart(2, '0');

    return `#${rs}${gs}${bs}`;
}

// Convert a hex color string to rgba format
function hexToRgba(hex, alpha) {
    hex = hex.replace(/^s*#|s*$/g, '');
    if (hex.length === 3) {
        hex = hex.replace(/(.)/g, '$1$1');
    }
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Central Theme Accent Helpers — Dynamically read root CSS variables for MapLibre WebGL compatibility
function getThemeAccent() {
    if (typeof window !== 'undefined' && document.documentElement) {
        const val = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
        if (val && val.startsWith('#')) return val;
    }
    return "#64b5f6";
}

function getThemeAccentLight() {
    if (typeof window !== 'undefined' && document.documentElement) {
        const val = getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim();
        if (val && val.startsWith('#')) return val;
    }
    return "#91cfff";
}

const MAP_STYLES = {
    default: {
        color: "#ffffff",
        weight: 1.0,
        fillColor: "#ffffff",
        fillOpacity: 0.07
    },
    hover: {
        get color() { return getThemeAccent(); },
        weight: 1.8,
        get fillColor() { return getThemeAccent(); },
        fillOpacity: 0.2
    },
    selected: {
        get color() { return getThemeAccentLight(); },
        weight: 2.2,
        get fillColor() { return getThemeAccent(); },
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

function generateZoneGeometrySVG(feature) {
    if (!feature || !feature.geometry) return "";

    const geom = feature.geometry;
    let rings = [];

    if (geom.type === "Polygon") {
        rings = geom.coordinates;
    } else if (geom.type === "MultiPolygon") {
        geom.coordinates.forEach(poly => {
            poly.forEach(r => rings.push(r));
        });
    }

    if (!rings.length) return "";

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    rings.forEach(ring => {
        ring.forEach(pt => {
            const lng = pt[0], lat = pt[1];
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        });
    });

    if (!isFinite(minLng) || !isFinite(minLat)) return "";

    let width = maxLng - minLng;
    let height = maxLat - minLat;

    if (width === 0) width = 0.001;
    if (height === 0) height = 0.001;

    // Add 12% padding around the bounding box
    const paddingX = width * 0.12;
    const paddingY = height * 0.12;
    minLng -= paddingX;
    maxLng += paddingX;
    minLat -= paddingY;
    maxLat += paddingY;
    width = maxLng - minLng;
    height = maxLat - minLat;

    // Preserve 4:3 aspect ratio (80x60 viewBox) without distortion
    const targetAspect = 80 / 60;
    const currentAspect = width / height;

    if (currentAspect < targetAspect) {
        const targetWidth = height * targetAspect;
        const diff = (targetWidth - width) / 2;
        minLng -= diff;
        maxLng += diff;
        width = targetWidth;
    } else {
        const targetHeight = width / targetAspect;
        const diff = (targetHeight - height) / 2;
        minLat -= diff;
        maxLat += diff;
        height = targetHeight;
    }

    let pathD = "";
    rings.forEach(ring => {
        ring.forEach((pt, idx) => {
            const lng = pt[0], lat = pt[1];
            const x = ((lng - minLng) / width) * 80;
            const y = 60 - (((lat - minLat) / height) * 60);

            if (idx === 0) {
                pathD += `M ${x.toFixed(2)},${y.toFixed(2)} `;
            } else {
                pathD += `L ${x.toFixed(2)},${y.toFixed(2)} `;
            }
        });
        pathD += "Z ";
    });

    return `
        <svg viewBox="0 0 80 60" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background: #000000; border-radius: 4px; display: block;">
            <path d="${pathD}" fill="#18181b" stroke="#71717a" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" fill-rule="evenodd"/>
        </svg>
    `;
}

function getDefaultStyle() {
    return MAP_STYLES.default;
}

function toExpression(f) {
    if (!f) return null;
    if (!Array.isArray(f)) return f;
    
    const op = f[0];
    if (op === 'all' || op === 'any' || op === 'none') {
        return [op, ...f.slice(1).map(toExpression)];
    }
    
    // If it's already an expression (e.g. second element is an array), return as is
    if (Array.isArray(f[1])) {
        return f;
    }
    
    const key = f[1];
    if (op === '==' || op === '!=' || op === '>' || op === '>=' || op === '<' || op === '<=') {
        return [op, ['get', key], f[2]];
    }
    if (op === 'has') {
        return ['has', key];
    }
    if (op === '!has') {
        return ['!', ['has', key]];
    }
    if (op === 'in') {
        return ['in', ['get', key], ['literal', f.slice(2)]];
    }
    if (op === '!in') {
        return ['!', ['in', ['get', key], ['literal', f.slice(2)]]];
    }
    
    return f;
}

function updatePlaceLabelsFilter() {
    if (!state.map) return;

    // Lazily cache original place filters if not done already for this style
    if (!state._originalPlaceFilters) {
        state._originalPlaceFilters = {};
        const placeLayersForFilter = [
            'place_city_r5',
            'place_city_r6',
            'place_town',
            'place_villages',
            'place_suburbs',
            'place_hamlet',
            'place_city_dot_r7',
            'place_city_dot_r4',
            'place_city_dot_r2',
            'place_city_dot_z7',
            'place_capital_dot_z7'
        ];
        
        let foundAny = false;
        placeLayersForFilter.forEach(lId => {
            if (state.map.getLayer(lId)) {
                state._originalPlaceFilters[lId] = state.map.getFilter(lId) || null;
                foundAny = true;
            }
        });

        if (!foundAny) {
            // Style layers are not available yet (still loading), return and try again on next draw/update
            delete state._originalPlaceFilters;
            return;
        }
    }

    const isCirclesView = !!(state.isCirclesFeature || state.currentFeature === 'circles');
    
    // Only apply the filter update if the view type changed to save performance
    if (state._lastHiddenCircleNames === isCirclesView) return;
    state._lastHiddenCircleNames = isCirclesView;

    const circleNames = ['Eugene', 'Florence', 'Cottage Grove', 'Oakridge'];
    console.log("Applying duplicate circles filter. Hide circle names:", isCirclesView);

    Object.keys(state._originalPlaceFilters).forEach(lId => {
        if (state.map.getLayer(lId)) {
            const origFilter = toExpression(state._originalPlaceFilters[lId]);
            if (isCirclesView) {
                // If it's a circle overview, exclude the circle names from showing in the basemap
                let newFilter;
                const exclusion = [
                    'all',
                    ['match', ['get', 'name'], 'Eugene', false, 'Florence', false, 'Cottage Grove', false, 'Oakridge', false, true],
                    ['match', ['get', 'name_en'], 'Eugene', false, 'Florence', false, 'Cottage Grove', false, 'Oakridge', false, true]
                ];
                
                if (!origFilter) {
                    newFilter = exclusion;
                } else if (origFilter[0] === 'all') {
                    newFilter = [...origFilter, ...exclusion.slice(1)];
                } else {
                    newFilter = ['all', origFilter, ...exclusion.slice(1)];
                }
                state.map.setFilter(lId, newFilter);
            } else {
                // Restore original filter
                if (origFilter === null) {
                    state.map.setFilter(lId, undefined);
                } else {
                    state.map.setFilter(lId, origFilter);
                }
            }
        }
    });
}

function updateAllFeatureStyles() {
    if (!state.map || !state.map.getSource('zones')) return;
    
    // Dynamically filter circle place names from basemap on circles overview view
    try {
        updatePlaceLabelsFilter();
    } catch(e) { console.warn("Error updating place labels filter:", e); }
    
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

    // Determine geometry styling based on active basemap (thick black outline & transparent deep blue fill for Light Mode/Esri Street/Topo, white for Dark/Satellite)
    const isLightModeTheme = document.body.classList.contains("theme-light") || (document.documentElement.getAttribute("data-theme") === "light");
    const isLightBasemap = state.currentBaseLayer === "esri-street" || state.currentBaseLayer === "esri-topo" || (state.currentBaseLayer === "default" && isLightModeTheme);
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
        defaultFillColor = '#000000';
        defaultFillOpacity = 0.0;
    } else if (isSatelliteBasemap) {
        defaultFillColor = '#000000'; // black fill for satellite only
        defaultFillOpacity = 0.75; // unselected black fill opacity increased significantly for satellite
    }

    const defaultLineColor = isLightBasemap ? '#000000' : '#ffffff';
    const dimLineColor = isLightBasemap ? 'rgba(0, 0, 0, 0.40)' : 'rgba(255, 255, 255, 0.25)';
    const defaultLineWidth = isLightBasemap ? 2.4 : 1.0;

    const noDataFillColor = isLightBasemap ? '#9ca3af' : defaultFillColor;
    const noDataFillOpacity = isLightBasemap ? 0.12 : (isSatelliteBasemap ? 0.60 : 0.02);
    const noDataLineColor = isLightBasemap ? 'rgba(60, 60, 60, 0.50)' : dimLineColor;

    const hoverFillColor = isLightBasemap ? '#000000' : '#3f3f46';
    const hoverFillOpacity = isLightBasemap ? 0.06 : (isSatelliteBasemap ? 0.88 : 0.05);
    const noDataHoverFillOpacity = isLightBasemap ? 0.16 : (isSatelliteBasemap ? 0.75 : 0.02);

    const selectedFillColor = getThemeAccent();
    const selectedFillOpacity = 0.0;
    const selectedLineColor = getThemeAccentLight();
    const unselectedOutlineOpacity = isSatelliteBasemap ? 0.70 : 0.18; // significantly increased unselected outline opacity for satellite

    if (state.map.getLayer('zones-fill')) {
        state.map.setPaintProperty('zones-fill', 'fill-color', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], selectedFillColor,
            ['interpolate', ['linear'], ['coalesce', ['feature-state', 'hoverAlpha'], 0],
                0, ['match', ['get', 'cid'], ['Oakridge', 'Cottage Grove'], noDataFillColor, defaultFillColor],
                1, hoverFillColor
            ]
        ]);
        const dimFillOpacity = defaultFillOpacity * 0.25;
        const dimNoDataFillOpacity = noDataFillOpacity * 0.25;
        state.map.setPaintProperty('zones-fill', 'fill-opacity', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], selectedFillOpacity,
            ['interpolate', ['linear'], ['coalesce', ['feature-state', 'hoverAlpha'], 0],
                0, ['interpolate', ['linear'], ['coalesce', ['feature-state', 'proximity'], 0],
                    0, ['match', ['get', 'cid'], ['Oakridge', 'Cottage Grove'], dimNoDataFillOpacity, dimFillOpacity],
                    1, ['match', ['get', 'cid'], ['Oakridge', 'Cottage Grove'], noDataFillOpacity, defaultFillOpacity]
                ],
                1, ['match', ['get', 'cid'], ['Oakridge', 'Cottage Grove'], noDataHoverFillOpacity, hoverFillOpacity]
            ]
        ]);
        state.map.setPaintProperty('zones-fill', 'fill-color-transition', { duration: 0 });
        state.map.setPaintProperty('zones-fill', 'fill-opacity-transition', { duration: 0 });
    }

    if (state.map.getLayer('zones-outline')) {
        state.map.setPaintProperty('zones-outline', 'line-color', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], selectedLineColor,
            ['match', ['get', 'cid'], 'Oakridge', true, 'Cottage Grove', true, false], noDataLineColor,
            defaultLineColor
        ]);
        state.map.setPaintProperty('zones-outline', 'line-width', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], (isLightBasemap ? 4.5 : 3.2),
            defaultLineWidth
        ]);
        state.map.setPaintProperty('zones-outline', 'line-opacity', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 1.0,
            unselectedOutlineOpacity  // dynamic outline opacity based on basemap
        ]);
        state.map.setPaintProperty('zones-outline', 'line-color-transition', { duration: 0 });
        state.map.setPaintProperty('zones-outline', 'line-width-transition', { duration: 0 });
        state.map.setPaintProperty('zones-outline', 'line-opacity-transition', { duration: 0 });
    }

    if (state.map.getLayer('zones-outline-highlight')) {
        state.map.setPaintProperty('zones-outline-highlight', 'line-color', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], selectedLineColor,
            'transparent'
        ]);
        state.map.setPaintProperty('zones-outline-highlight', 'line-width', [
            'case',
            ['boolean', ['feature-state', 'selected'], false], (isLightBasemap ? 4.5 : 3.2),
            0.0
        ]);
        state.map.setPaintProperty('zones-outline-highlight', 'line-color-transition', { duration: 250 });
        state.map.setPaintProperty('zones-outline-highlight', 'line-width-transition', { duration: 250 });
    }

    // Refresh HTML label colors for basemap change
    rebuildHtmlLabels();
}

const state = {
    allFeatures: [],
    circlesFeatures: [],
    eugeneFeatures: [],
    florenceFeatures: [],
    currentFeature: "circles", // "circles", "eugene", "florence"
    isCirclesFeature: true,
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
    currentBaseLayer: "default",
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

const SPATIAL_MIME_TYPES = {
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

function createIosCompatibleFile(blob, fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  let mimeType = SPATIAL_MIME_TYPES[ext] || blob.type || 'application/octet-stream';
  let shareName = fileName;

  // iOS Safari canShare() requires iOS system-recognized MIME types & extensions
  if (ext === 'geojson') {
    mimeType = 'application/json';
    shareName = fileName.replace(/\.geojson$/i, '.json');
  } else if (ext === 'gpx' || ext === 'kml') {
    mimeType = 'text/plain';
  } else if (ext === 'kmz') {
    mimeType = 'application/zip';
  } else if (ext === 'pdf') {
    mimeType = 'application/pdf';
  } else if (ext === 'tif' || ext === 'tiff') {
    mimeType = 'image/png';
  }

  return new File([blob], shareName, { type: mimeType });
}

async function handleSpatialFileShare(event, fileOrBlob, fileName, triggerButton = null) {
  if (event && event.preventDefault) event.preventDefault();

  let originalButtonText = "";
  let originalButtonHtml = "";

  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.classList.add("is-preparing");
    const span = triggerButton.querySelector("span");
    if (span) {
      originalButtonText = span.textContent;
      span.textContent = "Preparing...";
    } else {
      originalButtonHtml = triggerButton.innerHTML;
      triggerButton.textContent = "Preparing...";
    }
  }

  const resetBtnState = () => {
    if (triggerButton) {
      triggerButton.disabled = false;
      triggerButton.classList.remove("is-preparing");
      const span = triggerButton.querySelector("span");
      if (span && originalButtonText) {
        span.textContent = originalButtonText;
      } else if (originalButtonHtml) {
        triggerButton.innerHTML = originalButtonHtml;
      }
    }
  };

  try {
    let blob;
    if (fileOrBlob instanceof Blob) {
      blob = fileOrBlob;
    } else if (typeof fileOrBlob === 'string') {
      const response = await fetch(fileOrBlob);
      if (!response.ok) throw new Error('File download failed');
      blob = await response.blob();
    } else {
      throw new Error('Invalid file format');
    }

    // If browser supports Web Share API (iOS Safari, Mobile Chrome, Mac Safari), trigger native OS Share Sheet
    if (navigator.share) {
      const file = createIosCompatibleFile(blob, fileName);

      // Check if browser can share file, or execute direct share for mobile OS
      const canShare = navigator.canShare ? navigator.canShare({ files: [file] }) : true;
      if (canShare) {
        await navigator.share({
          files: [file],
          title: fileName,
          text: 'Open with your mapping app'
        });
        resetBtnState();
        return;
      } else {
        // Fallback share with plain text for strict WebKit environments
        const fallbackFile = new File([blob], fileName, { type: 'text/plain' });
        await navigator.share({
          files: [fallbackFile],
          title: fileName,
          text: 'Open with your mapping app'
        });
        resetBtnState();
        return;
      }
    } else if (location.protocol === "http:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      if (typeof showToast === "function") {
        showToast("Notice: Apple requires HTTPS for iOS Share Sheet (accessing via HTTP 10.0.0.194).", true);
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'NotAllowedError') {
      resetBtnState();
      return;
    }
  } finally {
    resetBtnState();
  }

  // Fallback for Desktop / Unsupported Browsers
  if (fileOrBlob instanceof Blob) {
    const url = URL.createObjectURL(fileOrBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } else if (typeof fileOrBlob === 'string') {
    const a = document.createElement('a');
    a.href = fileOrBlob;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

/**
 * Suggested App Handshake Architecture & Format Preferences
 * Maps mobile navigation and mapping applications to their optimal spatial file formats and MIME types.
 */
const APP_FORMAT_PREFERENCES = {
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

/**
 * Generates/retrieves the active spatial dataset as a Blob for a given format key.
 */
async function generateAppSpatialBlob(formatKey) {
  const geojson = getSelectedGeoJSONData();
  const filename = getActiveDownloadFilename(formatKey === "geopdf" ? "pdf" : formatKey);

  if (formatKey === "geopdf") {
    const canvas = await renderMapLayoutCanvas();
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

/**
 * APP INSTRUCTION CONFIGURATIONS
 * Dynamic instruction modal settings for suggested mapping apps (Avenza, Gaia GPS, CalTopo, OsmAnd).
 */
const APP_INSTRUCTION_CONFIGS = {
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

/**
 * Resolves App Store (iOS) or Google Play Store (Android) URL for a given app.
 */
function getAppStoreUrl(appKey) {
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
function launchAppWithStoreFallback(appScheme, appKey) {
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
function updateAvenzaModalHeaderTitle(targetAppName = "Avenza Maps") {
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
function getActiveSelectionThumbnail() {
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
async function openAppInstructionModal(appKeyOrName, mapFileUrlOrBlob = null, filename = null, triggerCard = null) {
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

  let blob = mapFileUrlOrBlob;
  let mapFilename = filename;
  if (!(blob instanceof Blob)) {
    const generated = await generateAppSpatialBlob(config.formatKey);
    blob = generated.blob;
    mapFilename = generated.filename;
  }

  const finalFilename = mapFilename || `map.${config.ext}`;
  window._pendingAppBlob = blob;
  window._pendingAppFilename = finalFilename;
  window._pendingAppScheme = config.scheme;
  window._pendingAppFormatKey = config.formatKey;
  window._pendingAppKey = config.appKey || normKey;

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
    downloadBtn.classList.remove("is-downloaded");
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
async function openInAvenzaWithFallback(mapFileUrlOrBlob, filename, triggerCard = null) {
  await openAppInstructionModal("Avenza Maps", mapFileUrlOrBlob, filename, triggerCard);
}

/**
 * Executes direct app handshake for Suggested Apps (Avenza, Gaia GPS, CalTopo, OsmAnd).
 */
async function handleAppDirectOpen(appName, triggerCard = null) {
  let originalLabelText = "";
  const labelEl = triggerCard ? triggerCard.querySelector(".suggested-app-name") : null;

  if (triggerCard) {
    triggerCard.classList.add("is-preparing");
    if (labelEl) {
      originalLabelText = labelEl.textContent;
      labelEl.textContent = "Preparing...";
    }
  }

  const resetUi = () => {
    if (triggerCard) {
      triggerCard.classList.remove("is-preparing");
      if (labelEl && originalLabelText) {
        labelEl.textContent = originalLabelText;
      }
    }
  };

  try {
    await openAppInstructionModal(appName, null, null, triggerCard);
    resetUi();
  } catch (err) {
    resetUi();
    if (typeof showToast === "function") {
      showToast(`Could not open instructions for ${appName}`);
    }
  }
}

function saveBlob(blob, filename, triggerButton = null) {
  return handleSpatialFileShare(null, blob, filename, triggerButton);
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
    const targetId = (baseMapId === "dark" || baseMapId === "default") ? "default" : baseMapId;
    const targetMap = state.baseMapsList.find(b => b.id === targetId) || state.baseMapsList[0];
    if (!targetMap) return;
    
    state.baseMapsList.forEach(bm => {
        if (state.map.getLayer(bm.layerId)) {
            state.map.setLayoutProperty(bm.layerId, 'visibility', bm.id === targetId ? 'visible' : 'none');
        }
        const lowResLayerId = `${bm.layerId}-low`;
        if (state.map.getLayer(lowResLayerId)) {
            state.map.setLayoutProperty(lowResLayerId, 'visibility', bm.id === targetId ? 'visible' : 'none');
        }
    });
    state.currentBaseLayer = targetId;

    // If switching to default vector map, hide all raster overlays so vector base shows cleanly
    if (targetId === "default") {
        ['base-satellite', 'base-esri-street', 'base-esri-topo', 'base-dark-raster'].forEach(lId => {
            if (state.map.getLayer(lId)) {
                state.map.setLayoutProperty(lId, 'visibility', 'none');
            }
        });
    }

    // Apply road network line opacity dynamically: semi-transparent on satellite, solid on default/dark
    const isSatellite = targetId === 'satellite';
    const roadLayers = [
        'road_service_case', 'road_minor_case', 'road_pri_case_ramp', 'road_trunk_case_ramp', 'road_mot_case_ramp',
        'road_sec_case_noramp', 'road_pri_case_noramp', 'road_trunk_case_noramp', 'road_mot_case_noramp', 'road_path',
        'road_service_fill', 'road_minor_fill', 'road_pri_fill_ramp', 'road_trunk_fill_ramp', 'road_mot_fill_ramp',
        'road_sec_fill_noramp', 'road_pri_fill_noramp', 'road_trunk_fill_noramp', 'road_mot_fill_noramp',
        'tunnel_service_case', 'tunnel_minor_case', 'tunnel_sec_case', 'tunnel_pri_case', 'tunnel_trunk_case', 'tunnel_mot_case',
        'tunnel_path', 'tunnel_service_fill', 'tunnel_minor_fill', 'tunnel_sec_fill', 'tunnel_pri_fill', 'tunnel_trunk_fill',
        'tunnel_mot_fill', 'tunnel_rail', 'tunnel_rail_dash', 'rail', 'rail_dash',
        'bridge_service_case', 'bridge_minor_case', 'bridge_sec_case', 'bridge_pri_case', 'bridge_trunk_case', 'bridge_mot_case',
        'bridge_path', 'bridge_service_fill', 'bridge_minor_fill', 'bridge_sec_fill', 'bridge_pri_fill', 'bridge_trunk_fill',
        'bridge_mot_fill'
    ];
    roadLayers.forEach(lId => {
        if (state.map.getLayer(lId)) {
            state.map.setPaintProperty(lId, 'line-opacity', isSatellite ? 0.35 : 1.0);
            if (isSatellite) {
                state.map.setPaintProperty(lId, 'line-color', '#ffffff');
            } else if (state._originalRoadColors && state._originalRoadColors[lId] !== undefined) {
                state.map.setPaintProperty(lId, 'line-color', state._originalRoadColors[lId]);
            }
        }
    });

    const isLightMode = document.body.classList.contains("theme-light") || targetId === "esri-street" || targetId === "esri-topo";
    const tileMapEl = document.getElementById("tile-map");
    if (tileMapEl) {
        const bg = isLightMode ? "#f8f9fa" : "#000000";
        tileMapEl.style.setProperty("background-color", bg, "important");
        tileMapEl.style.setProperty("background", bg, "important");
    }

    const mapWrapper = document.getElementById("map-wrapper");
    if (mapWrapper) {
        if (targetId === "esri-street" || targetId === "esri-topo" || (targetId === "default" && isLightMode)) {
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

async function downloadGeoPdf(triggerButton = null) {
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

        const pdfBlob = pdf.output("blob");
        await handleSpatialFileShare(null, pdfBlob, filename, triggerButton);
        showToast(`Exported ${filename}`);
    } else {
        canvas.toBlob(async (blob) => {
            await handleSpatialFileShare(null, blob, filename.replace(/\.pdf$/, "-layout.png"), triggerButton);
            showToast(`Exported ${filename.replace(/\.pdf$/, "-layout.png")}`);
        }, "image/png");
    }
}

async function downloadGeoTiff(triggerButton = null) {
    const canvas = await renderMapLayoutCanvas();
    const filename = getActiveDownloadFilename("tif");
    const tiffBlob = canvasToTiffBlob(canvas);
    await handleSpatialFileShare(null, tiffBlob, filename, triggerButton);
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
    } else if (feature === "eugene") {
        state.currentFeature = "eugene";
        state.isCirclesFeature = false;
    } else {
        state.currentFeature = "circles";
        state.isCirclesFeature = true;
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

let _currentHierarchyLevel = 0;

function _getHierarchyLevel(id) {
    if (state.isCirclesFeature) return 0;
    if (!id || id === CIRCLE_ID) return 1;
    return 2;
}

function selectSubject(id, triggerMapZoom = true, animate = true) {
    window.scrollTo(0, 0);
    if (state.isHelpModeActive && window.innerWidth <= 768) return;

    if (window.innerWidth <= 768) {
        const sidebar = document.querySelector(".maps-tile-sidebar");
        if (sidebar) {
            sidebar.scrollTop = 0;
            sidebar.classList.remove("is-scrolled");
        }
        document.body.classList.remove("sidebar-is-scrolled");
        const header = document.getElementById("sidebar-header");
        if (header) {
            header.classList.remove("is-scrolled");
        }
    }

    const oldLevel = _currentHierarchyLevel;
    const newLevel = _getHierarchyLevel(id);
    _currentHierarchyLevel = newLevel;

    const isLevelChanged = oldLevel !== newLevel;

    const performSelection = () => {
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
    };

    // Trigger immediate click fly-out on current contents, update DOM & map mid-flyout, then fly in new screen
    if (isLevelChanged && animate) {
        const isMobile = window.innerWidth <= 768;

        // Lock sidebar height on mobile during horizontal slide transition to eliminate vertical stutter/jumps
        const sidebar = document.querySelector(".maps-tile-sidebar");
        if (isMobile && sidebar) {
            const currentH = sidebar.offsetHeight;
            if (currentH > 0) {
                sidebar.style.minHeight = `${currentH}px`;
                sidebar.style.maxHeight = `${currentH}px`;
                setTimeout(() => {
                    sidebar.style.minHeight = "";
                    sidebar.style.maxHeight = "";
                }, 380);
            }
        }

        const animElements = [
            !isMobile ? document.querySelector('.maps-tile-header') : null,
            document.getElementById('sidebar-header'),
            document.querySelector('.sidebar-list-container'),
            document.querySelector('.sidebar-about-panel')
        ].filter(Boolean);

        const isGoingUp = newLevel < oldLevel;
        const outClass = isGoingUp ? 'anim-fly-out-right' : 'anim-fly-out-left';
        const inClass  = isGoingUp ? 'anim-fly-in-left'   : 'anim-fly-in-right';

        // 1. Immediately on click: fly out current contents
        animElements.forEach(el => {
            el.classList.remove('anim-fly-out-left', 'anim-fly-out-right', 'anim-fly-in-left', 'anim-fly-in-right');
            el.classList.add(outClass);
        });

        // 2. Mid-flyout (130ms): Update DOM content & trigger map zoom, then fly in new content
        setTimeout(() => {
            performSelection();

            animElements.forEach(el => {
                el.classList.remove(outClass);
                el.classList.add(inClass);
            });

            setTimeout(() => {
                animElements.forEach(el => {
                    el.classList.remove('anim-fly-out-left', 'anim-fly-out-right', 'anim-fly-in-left', 'anim-fly-in-right');
                });
            }, 220);
        }, 130);
    } else {
        performSelection();
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
                        <img src="../images/wetlands.jpg" alt="Audubon Circles" loading="eager" />
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
                        <img src="${thumbImg}" alt="${cid}" loading="eager">
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
                <img src="${imgPath}" alt="Zone ${zid}" loading="eager">
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
        if (window.innerWidth <= 768) return;
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

// Cursor proximity glow: set feature-state 'proximity' (0–1) based on
// screen-space distance from cursor to each zone center point
function setupProximityTracking() {
    if (state._proximityListenerAttached) return;
    state._proximityListenerAttached = true;

    const RADIUS = 280;   // px — radial gradient falloff distance
    let rafPending = false;
    let lastCx = -9999, lastCy = -9999;

    const canvas = state.map.getCanvas();

    canvas.addEventListener('mousemove', (e) => {
        if (window.innerWidth <= 768) return;
        if (state.map && state.map.getZoom() >= 14.0) return;
        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        // Skip tiny micro-movements to avoid thrashing feature state
        if (Math.abs(cx - lastCx) < 3 && Math.abs(cy - lastCy) < 3) return;
        lastCx = cx; lastCy = cy;

        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            if (!state.labelData || !state.map) return;
            state.labelData.forEach(d => {
                const pt = state.map.project([d.lng, d.lat]);
                const dist = Math.hypot(cx - pt.x, cy - pt.y);
                // Smooth quadratic falloff for more natural gradient feel
                const linear = Math.max(0, 1 - dist / RADIUS);
                const proximity = linear * linear * (3 - 2 * linear); // smoothstep
                state.map.setFeatureState({ source: 'zones', id: d.id }, { proximity });
            });
        });
    });

    canvas.addEventListener('mouseleave', () => {
        lastCx = -9999; lastCy = -9999;
        if (!state.labelData || !state.map) return;
        state.labelData.forEach(d => {
            state.map.setFeatureState({ source: 'zones', id: d.id }, { proximity: 0 });
        });
    });
}

// Canvas overlay: draws zone outlines bright, masked by radial gradient at cursor.
// This gives true per-segment glow — only the line pixels within the gradient radius
// are revealed, rather than MapLibre's per-feature opacity which affects whole zones.
function setupProximityGlowCanvas() {
    if (state._glowCanvasAttached) return;
    state._glowCanvasAttached = true;

    const mapCanvas = state.map.getCanvas();
    const container = document.getElementById('tile-map');

    const glowCanvas = document.createElement('canvas');
    glowCanvas.id = 'map-glow-canvas';
    glowCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;';
    container.appendChild(glowCanvas);

    const ctx = glowCanvas.getContext('2d');
    const RADIUS = 240; // CSS px — radial gradient falloff
    let cx = -9999, cy = -9999;
    let rafPending = false;
    let ditherPattern = null;

    function getDitherPattern() {
        if (ditherPattern) return ditherPattern;
        const nCanvas = document.createElement('canvas');
        nCanvas.width = 128;
        nCanvas.height = 128;
        const nCtx = nCanvas.getContext('2d');
        const imgData = nCtx.createImageData(128, 128);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = Math.floor((Math.random() - 0.5) * 45);
            const val = Math.min(255, Math.max(0, 128 + noise));
            data[i] = val;     // R
            data[i+1] = val;   // G
            data[i+2] = val;   // B
            data[i+3] = 18;    // ~7% dither alpha
        }
        nCtx.putImageData(imgData, 0, 0);
        ditherPattern = ctx.createPattern(nCanvas, 'repeat');
        return ditherPattern;
    }

    function syncSize() {
        const rect = mapCanvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        const physicalW = Math.round(w * dpr);
        const physicalH = Math.round(h * dpr);
        if (glowCanvas.width !== physicalW || glowCanvas.height !== physicalH) {
            glowCanvas.width = physicalW;
            glowCanvas.height = physicalH;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawGlow() {
        syncSize();
        const rect = mapCanvas.getBoundingClientRect();
        const w = Math.round(rect.width), h = Math.round(rect.height);
        ctx.clearRect(0, 0, w, h);
        if (window.innerWidth <= 768 || cx < 0 || !state.allFeatures?.length) return;

        // Smooth zoom fade out between zoom 11.5 and 14.0
        const currentZoom = state.map ? state.map.getZoom() : 10;
        if (currentZoom >= 14.0) return;
        const zoomFadeAlpha = currentZoom <= 11.5 ? 1.0 : Math.max(0, 1 - (currentZoom - 11.5) / 2.5);

        const isLight = state.currentBaseLayer === 'esri-street' || state.currentBaseLayer === 'esri-topo';
        const lineAlpha = (isLight ? 0.45 : 0.45) * zoomFadeAlpha;
        const lineColor = isLight ? `rgba(0, 0, 0, ${lineAlpha.toFixed(3)})` : `rgba(255, 255, 255, ${lineAlpha.toFixed(3)})`;
        const lineW = isLight ? 2.8 : 0.9;

        // --- Pass 1: Radial Fill Gradient clipped to currently hovered feature polygon ---
        const activeHoverId = state._hoveredFeatureId;
        if (activeHoverId) {
            const feat = state.allFeatures.find(f => {
                const props = f.properties || {};
                const idKey = state.isCirclesFeature ? String(props.cid || '') : String(props.zid || '');
                return idKey === String(activeHoverId) || String(f.id) === String(activeHoverId);
            });
            if (feat && !isFeatureSelected(feat)) {
                ctx.save();
                ctx.beginPath();
                _drawFeaturePath(feat);
                ctx.clip(); // Mask strictly to hovered feature boundary

                const fillRadius = 340; // px — radial spotlight radius
                const fillGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, fillRadius);
                const maxAlpha = (isLight ? 0.15 : 0.15) * zoomFadeAlpha;
                const numStops = 12;

                for (let i = 0; i <= numStops; i++) {
                    const step = i / numStops;
                    // Exponential perceptual ease-out curve to smooth color steps
                    const alpha = maxAlpha * Math.pow(1 - step, 2.2);
                    const colorStr = isLight ? `rgba(0, 0, 0, ${alpha.toFixed(4)})` : `rgba(255, 255, 255, ${alpha.toFixed(4)})`;
                    fillGrad.addColorStop(step, colorStr);
                }

                ctx.fillStyle = fillGrad;
                ctx.fillRect(0, 0, w, h);

                // --- Apply Noise Dithering to eliminate all visible band lines ---
                const pattern = getDitherPattern();
                if (pattern) {
                    ctx.globalCompositeOperation = 'overlay';
                    ctx.fillStyle = pattern;
                    ctx.fillRect(0, 0, w, h);
                    ctx.globalCompositeOperation = 'source-over';
                }

                ctx.restore();
            }
        }

        // --- Pass 2: Line Outline Proximity Glow ---
        ctx.save();

        // Draw crisp line matching exact regular map line thickness
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineW;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        _drawAllRings();
        ctx.stroke();

        // --- Mask: keep only line pixels within cursor radius ---
        ctx.globalCompositeOperation = 'destination-in';
        const t = cx, u = cy;
        const grad = ctx.createRadialGradient(t, u, 0, t, u, RADIUS);
        // Smoothstep-ish stops for a natural gradient feel
        grad.addColorStop(0,    'rgba(0,0,0,1)');
        grad.addColorStop(0.45, 'rgba(0,0,0,0.95)');
        grad.addColorStop(0.75, 'rgba(0,0,0,0.5)');
        grad.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.restore();
    }

    function isFeatureSelected(feat) {
        if (!feat || !state.currentId || state.currentId === CIRCLE_ID) return false;
        const props = feat.properties || {};
        const key = state.isCirclesFeature ? String(props.cid || '') : String(props.zid || '');
        return key === state.currentId || normalizeZoneId(key) === normalizeZoneId(state.currentId);
    }

    function _drawFeaturePath(feat) {
        const geom = feat?.geometry;
        if (!geom) return;
        const polys = geom.type === 'Polygon'      ? [geom.coordinates]
                    : geom.type === 'MultiPolygon' ? geom.coordinates
                    : [];
        polys.forEach(poly => {
            poly.forEach(ring => {
                ring.forEach((coord, i) => {
                    const p = state.map.project(coord);
                    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
                });
                ctx.closePath();
            });
        });
    }

    function _drawAllRings() {
        state.allFeatures.forEach(feat => {
            if (!isFeatureSelected(feat)) {
                _drawFeaturePath(feat);
            }
        });
    }

    function scheduleRedraw() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; drawGlow(); });
    }

    mapCanvas.addEventListener('mousemove', (e) => {
        if (window.innerWidth <= 768) return;
        const rect = mapCanvas.getBoundingClientRect();
        cx = e.clientX - rect.left;
        cy = e.clientY - rect.top;
        scheduleRedraw();
    });

    mapCanvas.addEventListener('mouseleave', () => {
        cx = -9999; cy = -9999;
        scheduleRedraw();
    });

    // Redraw when map pans/zooms so lines stay aligned
    state.map.on('render', () => { if (cx >= 0) scheduleRedraw(); });
}

// HTML label overlay — repositions div labels on every map render
function updateLabelZoomVisibility() {
    rebuildHtmlLabels();
}

function rebuildHtmlLabels() {
    if (!state.map || !state.labelData) return;

    const overlay = document.getElementById('map-label-overlay');
    if (!overlay) return;

    const zoom = state.map.getZoom();
    const isMobile = window.innerWidth <= 768;
    const isCirclesView = state.isCirclesFeature || state.currentFeature === 'circles';

    // Separate zoom cutoffs for Circles Overview vs Zone Views on mobile
    let circleCutoff;
    let zoneCutoff;

    if (isMobile) {
        // In Circles Overview view: show circle labels at zoom >= 8.0
        // Middle ground for Count Circle with Zones view: show zone labels at zoom >= 9.85
        circleCutoff = isCirclesView ? 8.0 : 9.5;
        zoneCutoff = 9.85;
    } else {
        circleCutoff = 7.5;
        zoneCutoff = 9.0;
    }
    const isLightModeTheme = document.body.classList.contains("theme-light") || (document.documentElement.getAttribute("data-theme") === "light");
    const isLightBasemap = state.currentBaseLayer === 'esri-street' || state.currentBaseLayer === 'esri-topo' || (state.currentBaseLayer === 'default' && isLightModeTheme);

    // Remove labels that no longer match current feature set
    const currentIds = new Set(state.labelData.map(d => d.id));
    const existing = overlay.querySelectorAll('.map-zone-label');
    existing.forEach(el => {
        if (!currentIds.has(el.dataset.labelId)) el.remove();
    });

    state.labelData.forEach(d => {
        const { id, lng, lat, text, degWidth, textLen, isCircle } = d;

        // Determine visibility based on zoom + size thresholds (mirrors old MapLibre interpolation)
        let visible = false;
        if (zoom >= circleCutoff) {
            if (isCircle) {
                // Pick the size-fit threshold for the current zoom range
                let factor;
                if (zoom >= 14)          { visible = true; }
                else if (zoom >= 12)     { factor = 0.00015; }
                else if (zoom >= 11)     { factor = 0.0006; }
                else if (zoom >= zoneCutoff) { factor = 0.0012; }
                else if (zoom >= 8)      { factor = 0.0024; }
                else                     { factor = 0.010; }  // circleCutoff..8
                if (factor !== undefined) visible = degWidth >= textLen * factor;
            } else {
                // zid features only show at higher zooms
                let factor;
                if (zoom >= 14)      { visible = true; }
                else if (zoom >= 12) { factor = 0.00015; }
                else if (zoom >= 11) { factor = 0.0006; }
                else if (zoom >= zoneCutoff) { factor = 0.0012; }
                if (factor !== undefined) visible = degWidth >= textLen * factor;
            }
        }

        // Project geo coords to screen pixel coords
        const pt = state.map.project([lng, lat]);
        const canvas = state.map.getCanvas();

        let el = overlay.querySelector(`.map-zone-label[data-label-id="${id}"]`);
        if (!el) {
            el = document.createElement('div');
            el.className = 'map-zone-label';
            el.dataset.labelId = id;
            el.textContent = text;
            overlay.appendChild(el);
        }

        // Font size: interpolate with zoom
        let fontSize = 0;
        if (visible) {
            if (zoom <= 8) fontSize = isCircle ? 17 : 15;
            else if (zoom <= 10) fontSize = isCircle ? 18 : 16;
            else if (zoom <= 11) fontSize = isCircle ? 19 : 17;
            else if (zoom <= 12) fontSize = isCircle ? 20 : 18;
            else fontSize = isCircle ? 22 : 20;
        }

        el.style.left = `${pt.x}px`;
        el.style.top = `${pt.y}px`;
        el.style.fontSize = `${fontSize}px`;
        el.style.opacity = fontSize > 0 ? '1' : '0';
        el.style.pointerEvents = 'none';
        el.style.color = isLightBasemap ? '#000000' : '#c8c8c8';
        el.style.textShadow = isLightBasemap
            ? 'none'
            : '0 0 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)';
    });
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

    // Store label data on state for HTML overlay rendering
    state.labelData = labelFeatures.map(f => ({
        id: f.id,
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
        text: state.isCirclesFeature ? String(f.properties.cid || '') : String(f.properties.zid || ''),
        degWidth: f.properties.deg_width,
        textLen: f.properties.text_len,
        isCircle: !!f.properties.cid && !f.properties.zid
    }));

    if (state.map.getSource('zones')) {
        state.map.getSource('zones').setData(geojsonData);
        updateLabelZoomVisibility();
        updateAllFeatureStyles();
    } else {
        state.map.addSource('zones', {
            type: 'geojson',
            data: geojsonData,
            promoteId: 'feature_id'
        });
        const beforeId = state.map.getLayer('place_hamlet') ? 'place_hamlet' : undefined;

        state.map.addLayer({
            id: 'zones-fill',
            type: 'fill',
            source: 'zones',
            paint: {
                'fill-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], getThemeAccent(),
                    '#ffffff'
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 0.0,
                    ['match', ['get', 'cid'], 'Oakridge', true, 'Cottage Grove', true, false], 0.02,
                    0.07
                ],
                'fill-color-transition': { duration: 0 },
                'fill-opacity-transition': { duration: 0 }
            }
        }, beforeId);

        state.map.addLayer({
            id: 'zones-outline',
            type: 'line',
            source: 'zones',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], getThemeAccentLight(),
                    ['match', ['get', 'cid'], 'Oakridge', true, 'Cottage Grove', true, false], 'rgba(255, 255, 255, 0.25)',
                    '#ffffff'
                ],
                'line-width': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 2.2,
                    1.0
                ],
                'line-color-transition': { duration: 0 },
                'line-width-transition': { duration: 0 },
                'line-opacity-transition': { duration: 0 }
            }
        }, beforeId);

        state.map.addLayer({
            id: 'zones-outline-highlight',
            type: 'line',
            source: 'zones',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], getThemeAccentLight(),
                    'transparent'
                ],
                'line-width': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 3.2,
                    0.0
                ],
                'line-color-transition': { duration: 250 },
                'line-width-transition': { duration: 250 }
            }
        }, beforeId);

        state.map.addLayer({
            id: 'zones-collision-labels',
            type: 'symbol',
            source: 'zones',
            layout: {
                'text-field': ['get', 'feature_id'],
                'text-size': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    8, 14,
                    12, 18,
                    14, 20
                ],
                'text-ignore-placement': false,
                'text-allow-overlap': false,
                'text-padding': 10
            },
            paint: {
                'text-color': 'rgba(0,0,0,0)',
                'text-halo-color': 'rgba(0,0,0,0)'
            }
        }, beforeId);

        // Register map move/zoom listeners for HTML label repositioning (once)
        if (!state._labelListenersAttached) {
            state._labelListenersAttached = true;
            state.map.on('move', rebuildHtmlLabels);
            state.map.on('zoom', rebuildHtmlLabels);
            state.map.on('render', rebuildHtmlLabels);
        }
        setupProximityTracking();
        setupProximityGlowCanvas();
        updateLabelZoomVisibility();
        updateAllFeatureStyles();
        
        let hoveredStateId = null;
        let activeHoverAlphas = {};
        let hoverAnimationRaf = null;

        function updateHoverAlphas() {
            let animNeeded = false;
            const allIds = new Set(Object.keys(activeHoverAlphas));
            if (hoveredStateId) allIds.add(hoveredStateId);

            allIds.forEach(id => {
                const target = (id === hoveredStateId) ? 1.0 : 0.0;
                const current = activeHoverAlphas[id] || 0.0;
                const next = current + (target - current) * 0.28;

                if (Math.abs(target - next) < 0.015) {
                    activeHoverAlphas[id] = target;
                    if (target === 0) {
                        delete activeHoverAlphas[id];
                        state.map.setFeatureState({ source: 'zones', id: id }, { hover: false, hoverAlpha: 0 });
                        return;
                    }
                } else {
                    activeHoverAlphas[id] = next;
                    animNeeded = true;
                }

                const alphaToSet = activeHoverAlphas[id] || 0.0;
                state.map.setFeatureState({ source: 'zones', id: id }, { 
                    hover: alphaToSet > 0.01,
                    hoverAlpha: alphaToSet
                });
            });

            if (animNeeded) {
                hoverAnimationRaf = requestAnimationFrame(updateHoverAlphas);
            } else {
                hoverAnimationRaf = null;
            }
        }

        function setHoveredFeatureId(newId) {
            if (hoveredStateId === newId) return;

            // Immediately clear feature-state on all previous features so zero ghosting remains
            Object.keys(activeHoverAlphas).forEach(prevId => {
                if (prevId !== newId) {
                    state.map.setFeatureState({ source: 'zones', id: prevId }, { hover: false, hoverAlpha: 0 });
                    delete activeHoverAlphas[prevId];
                }
            });
            if (hoveredStateId && hoveredStateId !== newId) {
                state.map.setFeatureState({ source: 'zones', id: hoveredStateId }, { hover: false, hoverAlpha: 0 });
                unhighlightTileItem();
            }

            hoveredStateId = newId;
            state._hoveredFeatureId = newId;

            if (hoveredStateId) {
                highlightTileItem(hoveredStateId);
                state.map.getCanvas().style.cursor = 'pointer';
                activeHoverAlphas[hoveredStateId] = 0.0;
            } else {
                state.map.getCanvas().style.cursor = '';
            }

            if (!hoverAnimationRaf) {
                hoverAnimationRaf = requestAnimationFrame(updateHoverAlphas);
            }
        }

        state.map.on('mousemove', 'zones-fill', (e) => {
            if (e.features.length > 0) {
                const newHoveredId = e.features[0].id;
                setHoveredFeatureId(newHoveredId);
            }
        });

        state.map.on('mouseleave', 'zones-fill', () => {
            setHoveredFeatureId(null);
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
                    if (state.currentId === featureId) {
                        selectSubject(CIRCLE_ID);
                    } else {
                        selectSubject(featureId, true);
                    }
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

    const isLightMode = document.body.classList.contains("theme-light") || state.currentBaseLayer === "esri-street" || (document.documentElement.getAttribute("data-theme") === "light");
    const defaultVectorStyle = isLightMode
        ? "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

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
        style: defaultVectorStyle,
        center: [-123.11, 44.05],
        zoom: 11,
        attributionControl: false
    });

    // Set initial background color
    const initialTileMapEl = document.getElementById("tile-map");
    if (initialTileMapEl) {
        const bg = isLightMode ? "#f8f9fa" : "#000000";
        initialTileMapEl.style.setProperty("background-color", bg, "important");
        initialTileMapEl.style.setProperty("background", bg, "important");
    }

    // Configure smooth inertial scroll zoom rates for trackpad and mouse wheel (Google Earth style)
    if (state.map.scrollZoom) {
        state.map.scrollZoom.setWheelZoomRate(1 / 750);
        state.map.scrollZoom.setZoomRate(1 / 150);
    }
    
    state.map.on('style.load', () => {
        state.map.setProjection({ type: 'globe' });

        // 1. Add raster sources programmatically
        try {
            state.map.addSource('satellite-tiles', {
                type: 'raster',
                tiles: [
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                ],
                tileSize: 128,
                maxzoom: 18
            });
        } catch(e) { console.warn("Error adding satellite-tiles source:", e); }

        try {
            state.map.addSource('esri-street-tiles', {
                type: 'raster',
                tiles: [
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
                ],
                tileSize: 256,
                maxzoom: 18
            });
        } catch(e) { console.warn("Error adding esri-street-tiles source:", e); }

        try {
            state.map.addSource('esri-topo-tiles', {
                type: 'raster',
                tiles: [
                    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
                ],
                tileSize: 256,
                maxzoom: 18
            });
        } catch(e) { console.warn("Error adding esri-topo-tiles source:", e); }

        try {
            state.map.addSource('dark-tiles', {
                type: 'raster',
                tiles: [
                    "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
                    "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
                    "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
                    "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
                ],
                tileSize: 128,
                maxzoom: 19
            });
        } catch(e) { console.warn("Error adding dark-tiles source:", e); }

        // 2. Add raster layers on top of vector layers (initially hidden unless active)
        const activeLayerId = state.currentBaseLayer || "dark";

        // Insert satellite layer below road network/labels so street lines and labels render as an overlay on top of satellite imagery
        const beforeId = state.map.getLayer('tunnel_service_case') ? 'tunnel_service_case' :
                         (state.map.getLayer('road_service_case') ? 'road_service_case' :
                         (state.map.getLayer('waterway_label') ? 'waterway_label' : undefined));

        try {
            state.map.addLayer({
                id: 'base-satellite',
                type: 'raster',
                source: 'satellite-tiles',
                minzoom: 0,
                maxzoom: 22,
                layout: { visibility: activeLayerId === 'satellite' ? 'visible' : 'none' }
            }, beforeId);
        } catch(e) { console.warn("Error adding base-satellite layer:", e); }

        try {
            state.map.addLayer({
                id: 'base-esri-street',
                type: 'raster',
                source: 'esri-street-tiles',
                minzoom: 0,
                maxzoom: 22,
                layout: { visibility: activeLayerId === 'esri-street' ? 'visible' : 'none' }
            });
        } catch(e) { console.warn("Error adding base-esri-street layer:", e); }

        try {
            state.map.addLayer({
                id: 'base-esri-topo',
                type: 'raster',
                source: 'esri-topo-tiles',
                minzoom: 0,
                maxzoom: 22,
                layout: { visibility: activeLayerId === 'esri-topo' ? 'visible' : 'none' }
            });
        } catch(e) { console.warn("Error adding base-esri-topo layer:", e); }

        try {
            state.map.addLayer({
                id: 'base-dark-raster',
                type: 'raster',
                source: 'dark-tiles',
                minzoom: 0,
                maxzoom: 22,
                layout: { visibility: activeLayerId === 'dark-raster' ? 'visible' : 'none' }
            });
        } catch(e) { console.warn("Error adding base-dark-raster layer:", e); }

        // 3. Tweak vector styles to brighten land, forest green parks, and enlarge road/label names
        try {
            // Reset filter cache and view state so they are re-cached and re-applied to the fresh style
            state._lastHiddenCircleNames = null;
            state._originalPlaceFilters = null;

            // Cache original road colors so we can restore them when switching back from Satellite hybrid map
            state._originalRoadColors = {};
            const cacheRoadLayers = [
                'road_service_case', 'road_minor_case', 'road_pri_case_ramp', 'road_trunk_case_ramp', 'road_mot_case_ramp',
                'road_sec_case_noramp', 'road_pri_case_noramp', 'road_trunk_case_noramp', 'road_mot_case_noramp', 'road_path',
                'road_service_fill', 'road_minor_fill', 'road_pri_fill_ramp', 'road_trunk_fill_ramp', 'road_mot_fill_ramp',
                'road_sec_fill_noramp', 'road_pri_fill_noramp', 'road_trunk_fill_noramp', 'road_mot_fill_noramp',
                'tunnel_service_case', 'tunnel_minor_case', 'tunnel_sec_case', 'tunnel_pri_case', 'tunnel_trunk_case', 'tunnel_mot_case',
                'tunnel_path', 'tunnel_service_fill', 'tunnel_minor_fill', 'tunnel_sec_fill', 'tunnel_pri_fill', 'tunnel_trunk_fill',
                'tunnel_mot_fill', 'tunnel_rail', 'tunnel_rail_dash', 'rail', 'rail_dash',
                'bridge_service_case', 'bridge_minor_case', 'bridge_sec_case', 'bridge_pri_case', 'bridge_trunk_case', 'bridge_mot_case',
                'bridge_path', 'bridge_service_fill', 'bridge_minor_fill', 'bridge_sec_fill', 'bridge_pri_fill', 'bridge_trunk_fill',
                'bridge_mot_fill'
            ];
            cacheRoadLayers.forEach(lId => {
                if (state.map.getLayer(lId)) {
                    state._originalRoadColors[lId] = state.map.getPaintProperty(lId, 'line-color');
                }
            });

            const isLightMapMode = document.body.classList.contains("theme-light") || (document.documentElement.getAttribute("data-theme") === "light");

            if (isLightMapMode) {
                // Refined Light Mode styling with soft modern neutral-gray land
                const lightLandColor = '#d9dce1'; // refined Apple Maps/Carto neutral grey
                const lightLandLayers = ['background', 'landcover', 'landuse'];
                lightLandLayers.forEach(lId => {
                    if (state.map.getLayer(lId)) {
                        if (lId === 'background') {
                            state.map.setPaintProperty(lId, 'background-color', lightLandColor);
                        } else {
                            state.map.setPaintProperty(lId, 'fill-color', lightLandColor);
                        }
                    }
                });

                // Soft sage green for parks
                const parkLayers = ['park_national_park', 'park_nature_reserve'];
                parkLayers.forEach(lId => {
                    if (state.map.getLayer(lId)) {
                        state.map.setPaintProperty(lId, 'fill-color', '#c8decb');
                    }
                });

                // Water and waterways in soft sky-blue
                if (state.map.getLayer('water')) {
                    state.map.setPaintProperty('water', 'fill-color', '#a8cbdf');
                }
                if (state.map.getLayer('waterway')) {
                    state.map.setPaintProperty('waterway', 'line-color', '#8eb6cd');
                }

                // Road names in pure black without dropshadows/halos
                if (state.map.getLayer('roadname_minor')) {
                    state.map.setLayoutProperty('roadname_minor', 'text-size', 11.5);
                    state.map.setPaintProperty('roadname_minor', 'text-color', '#000000');
                    state.map.setPaintProperty('roadname_minor', 'text-halo-width', 0);
                }
                if (state.map.getLayer('roadname_sec')) {
                    state.map.setLayoutProperty('roadname_sec', 'text-size', {
                        stops: [[14, 11], [16, 13.5], [18, 15.5]]
                    });
                    state.map.setPaintProperty('roadname_sec', 'text-color', '#000000');
                    state.map.setPaintProperty('roadname_sec', 'text-halo-width', 0);
                }
                if (state.map.getLayer('roadname_pri')) {
                    state.map.setLayoutProperty('roadname_pri', 'text-size', {
                        stops: [[13, 11], [15, 13], [16, 14.5], [18, 16.5]]
                    });
                    state.map.setPaintProperty('roadname_pri', 'text-color', '#000000');
                    state.map.setPaintProperty('roadname_pri', 'text-halo-width', 0);
                }
                if (state.map.getLayer('roadname_major')) {
                    state.map.setLayoutProperty('roadname_major', 'text-size', {
                        stops: [[13, 11.5], [15, 13.5], [16, 15], [18, 17.5]]
                    });
                    state.map.setPaintProperty('roadname_major', 'text-color', '#000000');
                    state.map.setPaintProperty('roadname_major', 'text-halo-width', 0);
                }

                // Place names in pure black without dropshadows/halos
                const placeLayers = [
                    'place_city_r5', 'place_city_r6', 'place_town',
                    'place_village', 'place_suburb', 'place_neighbourhood', 'place_hamlet'
                ];
                placeLayers.forEach(lId => {
                    if (state.map.getLayer(lId)) {
                        state.map.setPaintProperty(lId, 'text-color', '#000000');
                        state.map.setPaintProperty(lId, 'text-halo-width', 0);
                        state.map.setLayoutProperty(lId, 'text-transform', 'none');
                    }
                });
            } else {
                // Dark Mode styling (original)
                const landColor = '#1a1b1e';
                const landLayers = ['background', 'landcover', 'park_national_park', 'park_nature_reserve', 'landuse'];
                landLayers.forEach(lId => {
                    if (state.map.getLayer(lId)) {
                        if (lId === 'background') {
                            state.map.setPaintProperty(lId, 'background-color', landColor);
                        } else {
                            state.map.setPaintProperty(lId, 'fill-color', landColor);
                        }
                    }
                });

                // Tweak parks to have a very subtle forest-green tint (#161c18)
                const parkLayers = ['park_national_park', 'park_nature_reserve'];
                parkLayers.forEach(lId => {
                    if (state.map.getLayer(lId)) {
                        state.map.setPaintProperty(lId, 'fill-color', '#161c18');
                    }
                });

                // Tweak waterway color for compatibility
                if (state.map.getLayer('waterway')) {
                    state.map.setPaintProperty('waterway', 'line-color', '#242a30');
                }

                // Substantially enlarge road names and brighten them
                if (state.map.getLayer('roadname_minor')) {
                    state.map.setLayoutProperty('roadname_minor', 'text-size', 11.5);
                    state.map.setPaintProperty('roadname_minor', 'text-color', 'rgba(165, 165, 165, 0.85)');
                }
                if (state.map.getLayer('roadname_sec')) {
                    state.map.setLayoutProperty('roadname_sec', 'text-size', {
                        stops: [[14, 11], [16, 13.5], [18, 15.5]]
                    });
                    state.map.setPaintProperty('roadname_sec', 'text-color', 'rgba(185, 185, 185, 0.9)');
                }
                if (state.map.getLayer('roadname_pri')) {
                    state.map.setLayoutProperty('roadname_pri', 'text-size', {
                        stops: [[13, 11], [15, 13], [16, 14.5], [18, 16.5]]
                    });
                    state.map.setPaintProperty('roadname_pri', 'text-color', 'rgba(215, 215, 215, 0.95)');
                }
                if (state.map.getLayer('roadname_major')) {
                    state.map.setLayoutProperty('roadname_major', 'text-size', {
                        stops: [[13, 11.5], [15, 13.5], [16, 15], [18, 17.5]]
                    });
                    state.map.setPaintProperty('roadname_major', 'text-color', 'rgba(235, 235, 235, 1)');
                }

                // Place, town, and city labels in elegant slate-blue
                const placeLayers = [
                    'place_city_r5', 'place_city_r6', 'place_town',
                    'place_village', 'place_suburb', 'place_neighbourhood', 'place_hamlet'
                ];
                const placeColors = {
                    'place_city_r5': '#b6d3e6',
                    'place_city_r6': '#a2c2d6',
                    'place_town': '#8eb1c7',
                    'place_village': '#7d9eb3',
                    'place_suburb': '#6e8c9f',
                    'place_neighbourhood': '#607a8b',
                    'place_hamlet': '#526877'
                };
                placeLayers.forEach(lId => {
                    if (state.map.getLayer(lId)) {
                        const color = placeColors[lId] || '#e2bd7e';
                        state.map.setPaintProperty(lId, 'text-color', color);
                        state.map.setLayoutProperty(lId, 'text-transform', 'none');
                    }
                });
            }

            // Set initial road network line opacity dynamically: semi-transparent white on satellite, solid default on dark
            const isSatelliteInitial = (state.currentBaseLayer || 'dark') === 'satellite';
            const initialRoadLayers = [
                'road_service_case', 'road_minor_case', 'road_pri_case_ramp', 'road_trunk_case_ramp', 'road_mot_case_ramp',
                'road_sec_case_noramp', 'road_pri_case_noramp', 'road_trunk_case_noramp', 'road_mot_case_noramp', 'road_path',
                'road_service_fill', 'road_minor_fill', 'road_pri_fill_ramp', 'road_trunk_fill_ramp', 'road_mot_fill_ramp',
                'road_sec_fill_noramp', 'road_pri_fill_noramp', 'road_trunk_fill_noramp', 'road_mot_fill_noramp',
                'tunnel_service_case', 'tunnel_minor_case', 'tunnel_sec_case', 'tunnel_pri_case', 'tunnel_trunk_case', 'tunnel_mot_case',
                'tunnel_path', 'tunnel_service_fill', 'tunnel_minor_fill', 'tunnel_sec_fill', 'tunnel_pri_fill', 'tunnel_trunk_fill',
                'tunnel_mot_fill', 'tunnel_rail', 'tunnel_rail_dash', 'rail', 'rail_dash',
                'bridge_service_case', 'bridge_minor_case', 'bridge_sec_case', 'bridge_pri_case', 'bridge_trunk_case', 'bridge_mot_case',
                'bridge_path', 'bridge_service_fill', 'bridge_minor_fill', 'bridge_sec_fill', 'bridge_pri_fill', 'bridge_trunk_fill',
                'bridge_mot_fill'
            ];
            initialRoadLayers.forEach(lId => {
                if (state.map.getLayer(lId)) {
                    state.map.setPaintProperty(lId, 'line-opacity', isSatelliteInitial ? 0.35 : 1.0);
                    if (isSatelliteInitial) {
                        state.map.setPaintProperty(lId, 'line-color', '#ffffff');
                    } else if (state._originalRoadColors && state._originalRoadColors[lId] !== undefined) {
                        state.map.setPaintProperty(lId, 'line-color', state._originalRoadColors[lId]);
                    }
                }
            });

            // Run place filter initially
            updatePlaceLabelsFilter();
        } catch(e) {
            console.error("Error applying styling tweaks to vector layers:", e);
        }
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
        { id: "default", name: "Default", layerId: "base-dark-vector" },
        { id: "dark-raster", name: "Dark Map (Raster)", layerId: "base-dark-raster" },
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
                    feature: targetZone,
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
                { id: "default", name: "Default", thumbnailClass: "default-map-thumbnail", layerId: "base-dark-vector" },
                { id: "dark-raster", name: "Dark Map (Raster)", thumbnailClass: "dark-map-thumbnail", layerId: "base-dark-raster" },
                { id: "satellite", name: "Satellite Map", thumbnailClass: "satellite-thumbnail", layerId: "base-satellite" },
                { id: "esri-street", name: "Street Map", thumbnailClass: "esri-street-thumbnail", layerId: "base-esri-street" },
                { id: "esri-topo", name: "Topo Map", thumbnailClass: "esri-topo-thumbnail", layerId: "base-esri-topo" }
            ];

            const filtered = basemaps.filter(b => b.name.toLowerCase().includes(query));
            if (filtered.length === 0) {
                bodyEl.innerHTML = `<div class="modal-no-results">No basemaps found</div>`;
            } else {
                filtered.forEach(b => {
                    const isSelected = state.currentBaseLayer === b.id || (b.id === 'default' && (!state.currentBaseLayer || state.currentBaseLayer === 'dark'));
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

function closeAllModals() {
    const avenzaModal = document.getElementById("avenza-instruction-modal");
    if (avenzaModal) {
        avenzaModal.setAttribute("aria-hidden", "true");
        avenzaModal.classList.remove("is-open");
    }
    document.body.classList.remove("has-avenza-modal");

    const bottomNav = document.querySelector(".mobile-bottom-nav-container");
    if (bottomNav) {
        bottomNav.classList.remove("is-hidden-entirely");
        bottomNav.style.removeProperty("display");
    }

    const downloadModal = document.getElementById("downloads-modal");
    if (downloadModal) {
        downloadModal.setAttribute("aria-hidden", "true");
        downloadModal.classList.remove("is-open");
    }

    const copyModal = document.getElementById("copy-link-modal");
    if (copyModal) {
        copyModal.setAttribute("aria-hidden", "true");
        copyModal.classList.remove("is-open");
    }

    const helpModal = document.getElementById("help-modal");
    if (helpModal) {
        helpModal.setAttribute("aria-hidden", "true");
        helpModal.classList.remove("is-open");
    }

    const suggestModal = document.getElementById("suggest-modal");
    if (suggestModal) {
        suggestModal.setAttribute("aria-hidden", "true");
        suggestModal.classList.remove("is-open");
    }

    const allAppsModal = document.getElementById("all-apps-modal");
    if (allAppsModal) {
        allAppsModal.setAttribute("aria-hidden", "true");
        allAppsModal.classList.remove("is-open");
    }

    if (typeof window.updateActionButtonsState === "function") {
        window.updateActionButtonsState();
    }

    if (typeof renderSidebarList === "function") {
        renderSidebarList();
    }
}

function setupAllAppsLiveSearch() {
    const searchInput = document.getElementById("all-apps-search-input");
    const clearBtn = document.getElementById("all-apps-search-clear");
    const grid = document.getElementById("all-apps-grid");
    const noResults = document.getElementById("all-apps-no-results");

    if (!searchInput || !grid) return;

    const filterApps = () => {
        const query = searchInput.value.trim().toLowerCase();
        if (clearBtn) clearBtn.style.display = query ? "flex" : "none";

        const cards = grid.querySelectorAll(".suggested-app-card");
        let visibleCount = 0;

        cards.forEach(card => {
            const appName = (card.getAttribute("data-app-name") || "").toLowerCase();
            const label = card.querySelector(".suggested-app-label")?.textContent.toLowerCase() || "";

            if (!query || appName.includes(query) || label.includes(query)) {
                card.style.display = "";
                visibleCount++;
            } else {
                card.style.display = "none";
            }
        });

        if (noResults) {
            noResults.style.display = visibleCount === 0 ? "block" : "none";
        }
    };

    searchInput.addEventListener("input", filterApps);
    if (clearBtn) {
        clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            searchInput.value = "";
            filterApps();
            searchInput.focus();
        });
    }
}

function updateAllAppsModalHeaderTitle() {
  const modalTitleEl = document.getElementById("all-apps-modal-title");
  if (!modalTitleEl) return;

  const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
  const circleName = state.currentFeature === "florence" ? "Florence Count Circle" : "Eugene Count Circle";

  if (state.isCirclesFeature) {
    modalTitleEl.innerHTML = `Download the <span class="avenza-target-name">Coast to Cascades Bird Alliance</span> to compatible apps`;
    return;
  }

  if (isCircle) {
    modalTitleEl.innerHTML = `Download the <span class="avenza-target-name">${circleName}</span> to compatible apps`;
    return;
  }

  const targetFeature = (state.allFeatures || []).find(f => {
    const zid = f.properties?.zid;
    return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || (typeof normalizeZoneId === "function" && normalizeZoneId(zid) === normalizeZoneId(state.currentId)));
  });

  const zoneName = (targetFeature && targetFeature.properties?.zid) 
    ? `Zone ${displayZoneId(targetFeature.properties.zid)}`
    : "Zone";

  modalTitleEl.innerHTML = `Download <span class="avenza-target-name">${zoneName}</span> of the <span class="avenza-target-name">${circleName}</span> to compatible apps`;
}

function updateShareModalDescription() {
    const descEl = document.querySelector(".maps-tile-copy-desc");
    if (!descEl) return;

    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
    const circleName = state.currentFeature === "florence" ? "Florence Count Circle" : "Eugene Count Circle";

    if (state.isCirclesFeature) {
        descEl.innerHTML = `Copy the link to the <span class="avenza-target-name">Coast to Cascades Bird Alliance</span> map:`;
        return;
    }

    if (isCircle) {
        descEl.innerHTML = `Copy the link to the <span class="avenza-target-name">${circleName}</span>:`;
        return;
    }

    const targetFeature = (state.allFeatures || []).find(f => {
        const zid = f.properties?.zid;
        return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || (typeof normalizeZoneId === "function" && normalizeZoneId(zid) === normalizeZoneId(state.currentId)));
    });

    const zoneName = (targetFeature && targetFeature.properties?.zid) 
        ? `Zone ${displayZoneId(targetFeature.properties.zid)}`
        : "Zone";

    descEl.innerHTML = `Copy the link to <span class="avenza-target-name">${zoneName}</span> of the <span class="avenza-target-name">${circleName}</span>:`;
}

function setupSuggestedAppCards() {
    setupAllAppsLiveSearch();
    const viewAllBtn = document.getElementById("btn-view-all-apps");
    const allAppsModal = document.getElementById("all-apps-modal");

    if (viewAllBtn && allAppsModal) {
        viewAllBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllModals();
            updateAllAppsModalHeaderTitle();
            allAppsModal.setAttribute("aria-hidden", "false");
            allAppsModal.classList.add("is-open");
            const searchInput = document.getElementById("all-apps-search-input");
            if (searchInput) {
                searchInput.value = "";
                const event = new Event("input");
                searchInput.dispatchEvent(event);
            }
        });
    }

    document.querySelectorAll(".suggested-app-card:not(#btn-view-all-apps)").forEach(card => {
        const iconWrap = card.querySelector(".suggested-app-icon-wrap");

        if (iconWrap) {
            card.addEventListener("mousemove", (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = ((y - centerY) / centerY) * -12;
                const rotateY = ((x - centerX) / centerX) * 12;

                iconWrap.style.transition = "transform 0.08s ease-out, box-shadow 0.15s ease";
                iconWrap.style.transform = `perspective(400px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.08, 1.08, 1.08) translateZ(6px)`;
                if (!card.classList.contains("is-active")) {
                    iconWrap.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.55), 0 0 14px rgba(255, 255, 255, 0.14)";
                }
            });

            card.addEventListener("mouseleave", () => {
                iconWrap.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease";
                iconWrap.style.transform = "perspective(400px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1) translateZ(0px)";
                iconWrap.style.boxShadow = card.classList.contains("is-active")
                    ? "0 0 0 1.5px rgba(var(--accent-rgb), 0.5), 0 8px 24px rgba(0, 0, 0, 0.6)"
                    : "0 4px 12px rgba(0, 0, 0, 0.4)";
            });
        }

        card.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const appName = card.getAttribute("data-app-name");
            if (!appName) return;

            const wasActive = card.classList.contains("is-active");
            document.querySelectorAll(".suggested-app-card").forEach(c => c.classList.remove("is-active"));

            if (!wasActive) {
                card.classList.add("is-active");
            }
            closeAllModals();
            await handleAppDirectOpen(appName, card);
        });
    });
}

function setupDownloadAppSearch() {
    setupSuggestedAppCards();
    const searchInput = document.getElementById("download-app-search");
    const clearBtn = document.getElementById("download-app-search-clear");
    const autocompleteBox = document.getElementById("download-app-autocomplete");
    if (!searchInput || !autocompleteBox) return;

    const searchBox = document.querySelector(".maps-tile-download-search-box");
    const setupBoxProximity = (element, threshold = 140, spotlightSize = 200) => {
        if (!element) return;
        element.style.setProperty("--mouse-x", "50%");
        element.style.setProperty("--mouse-y", "50%");
        element.style.setProperty("--glow-opacity", "0");
        element.style.setProperty("--spotlight-size", `${spotlightSize}px`);

        window.addEventListener("mousemove", (e) => {
            if (window.getComputedStyle(element).display === "none") {
                element.style.setProperty("--glow-opacity", "0");
                return;
            }
            const rect = element.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
            const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
            const dist = Math.sqrt(dx * dx + dy * dy);

            element.style.setProperty("--mouse-x", `${x}px`);
            element.style.setProperty("--mouse-y", `${y}px`);

            let opacity = 0;
            if (dist <= threshold) {
                opacity = Math.pow(1 - dist / threshold, 1.2);
            }
            element.style.setProperty("--glow-opacity", opacity.toFixed(3));
        });
    };

    setupBoxProximity(autocompleteBox, 140, 200);

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
            document.querySelectorAll(".suggested-app-card").forEach(c => c.classList.remove("is-active"));
            return;
        }

        const matches = MAP_VIEWER_APPS.filter(app => 
            app.name.toLowerCase().includes(query) || 
            app.aliases.some(a => a.includes(query))
        );

        // Sync active state on suggested app cards with search query
        document.querySelectorAll(".suggested-app-card").forEach(card => {
            const cardAppName = card.getAttribute("data-app-name") || "";
            const isMatch = matches.some(m => m.name.toLowerCase() === cardAppName.toLowerCase());
            card.classList.toggle("is-active", isMatch && query.length > 0);
        });

        if (matches.length === 0) {
            autocompleteBox.style.display = "block";
            autocompleteBox.innerHTML = `<div class="download-autocomplete-scroll-container"><div style="padding:0.6rem; font-size:0.8rem; color:rgba(255,255,255,0.4); text-align:center;">No matching viewer app found</div></div>`;
            filterFormatsByApp(null);
            return;
        }

        autocompleteBox.style.display = "block";
        const itemsHtml = matches.map(app => `
            <div class="download-autocomplete-item" data-app-name="${app.name}">
                <span class="download-autocomplete-item__name">${app.name}</span>
                <div class="download-autocomplete-item__formats">
                    ${app.formats.map(f => `<span class="download-format-pill">${f.toUpperCase()}</span>`).join("")}
                </div>
            </div>
        `).join("");

        autocompleteBox.innerHTML = `<div class="download-autocomplete-scroll-container">${itemsHtml}</div>`;

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

    // Wire 3D angle-shift tilt hover effect & click handlers for Suggested App cards
    document.querySelectorAll(".suggested-app-card").forEach(card => {
        const iconWrap = card.querySelector(".suggested-app-icon-wrap");

        if (iconWrap) {
            card.addEventListener("mousemove", (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                // Balanced angle shift calculation (max tilt +-12deg)
                const rotateX = ((y - centerY) / centerY) * -12;
                const rotateY = ((x - centerX) / centerX) * 12;

                iconWrap.style.transition = "transform 0.08s ease-out, box-shadow 0.15s ease";
                iconWrap.style.transform = `perspective(400px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.08, 1.08, 1.08) translateZ(6px)`;
                if (!card.classList.contains("is-active")) {
                    iconWrap.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.55), 0 0 14px rgba(255, 255, 255, 0.14)";
                }
            });

            card.addEventListener("mouseleave", () => {
                iconWrap.style.transition = "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease";
                iconWrap.style.transform = "perspective(400px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1) translateZ(0px)";
                iconWrap.style.boxShadow = card.classList.contains("is-active")
                    ? "0 0 0 1.5px rgba(var(--accent-rgb), 0.5), 0 8px 24px rgba(0, 0, 0, 0.6)"
                    : "0 4px 12px rgba(0, 0, 0, 0.4)";
            });
        }

        card.addEventListener("click", async (e) => {
            e.stopPropagation();
            const appName = card.getAttribute("data-app-name");
            if (!appName) return;

            const selectedApp = MAP_VIEWER_APPS.find(a => 
                a.name.toLowerCase() === appName.toLowerCase() || 
                a.aliases.some(alias => alias.toLowerCase() === appName.toLowerCase())
            );

            const wasActive = card.classList.contains("is-active");
            document.querySelectorAll(".suggested-app-card").forEach(c => c.classList.remove("is-active"));

            if (wasActive) {
                searchInput.value = "";
                if (clearBtn) clearBtn.style.display = "none";
                autocompleteBox.style.display = "none";
                filterFormatsByApp(null);
            } else {
                card.classList.add("is-active");
                if (selectedApp) {
                    searchInput.value = selectedApp.name;
                    if (clearBtn) clearBtn.style.display = "flex";
                    autocompleteBox.style.display = "none";
                    filterFormatsByApp(selectedApp.formats);
                } else {
                    searchInput.value = appName;
                    if (clearBtn) clearBtn.style.display = "flex";
                }
                
                // Execute direct app handshake workflow (Blob fetch -> Web Share -> Fallback Download)
                await handleAppDirectOpen(appName, card);
            }
        });
    });

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

    const toolbar = document.querySelector(".maps-tile-header__actions");
    if (toolbar) {
        const threshold = 140; // px — proximity threshold distance
        let rect = null;
        let isDirty = true;
        let ticking = false;

        const updateRect = () => {
            rect = toolbar.getBoundingClientRect();
            isDirty = false;
        };

        window.addEventListener("resize", () => { isDirty = true; }, { passive: true });
        window.addEventListener("scroll", () => { isDirty = true; }, { passive: true });

        window.addEventListener("mousemove", (e) => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    if (isDirty || !rect) updateRect();
                    
                    // Calculate relative mouse coordinates inside toolbar coordinate space
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    
                    // Calculate shortest distance from cursor to toolbar bounding box
                    const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
                    const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    toolbar.style.setProperty("--mouse-x", `${x}px`);
                    toolbar.style.setProperty("--mouse-y", `${y}px`);

                    // Compute proximity opacity
                    let opacity = 0;
                    if (dist <= threshold) {
                        opacity = Math.pow(1 - dist / threshold, 1.2);
                    }

                    toolbar.style.setProperty("--glow-opacity", opacity.toFixed(3));
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
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
            let blob = window._pendingAppBlob || window._pendingAvenzaBlob;
            let filename = window._pendingAppFilename || window._pendingAvenzaFilename || "map.pdf";
            let formatKey = window._pendingAppFormatKey || "geopdf";

            if (!(blob instanceof Blob)) {
                const { blob: generatedBlob, filename: genFilename } = await generateAppSpatialBlob(formatKey);
                blob = generatedBlob;
                if (genFilename) filename = genFilename;
                window._pendingAppBlob = blob;
            }

            const downloadBlob = new Blob([blob], { type: "application/octet-stream" });
            const url = URL.createObjectURL(downloadBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
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
            closeAllModals();
        });
    });

    const handleToolsClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget) e.currentTarget.blur();
        window.location.href = "../tools/";
    };

    const handleSettingsClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget) e.currentTarget.blur();
        window.location.href = "../settings/";
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
                    qrImg.src = `https://quickchart.io/qr?text=${encodeURIComponent(currentUrl)}&light=00000000&dark=${qrColor}&size=500&margin=0`;
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
            geojsonBtn.addEventListener("click", async (e) => {
                const geojson = getSelectedGeoJSONData();
                const filename = getActiveDownloadFilename("geojson");
                const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
                await handleSpatialFileShare(e, blob, filename, geojsonBtn);
                showToast(`Exported ${filename}`);
            });
        }

        const kmzBtn = document.getElementById("download-kmz");
        if (kmzBtn) {
            kmzBtn.addEventListener("click", async (e) => {
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
                await handleSpatialFileShare(e, blob, filename, kmzBtn);
                showToast(`Exported ${filename}`);
            });
        }

        const gpxBtn = document.getElementById("download-gpx");
        if (gpxBtn) {
            gpxBtn.addEventListener("click", async (e) => {
                const geojson = getSelectedGeoJSONData();
                const filename = getActiveDownloadFilename("gpx");
                const gpxStr = geojsonToGpx(geojson, filename.replace(/\.gpx$/i, ""));
                const blob = new Blob([gpxStr], { type: "application/gpx+xml" });
                await handleSpatialFileShare(e, blob, filename, gpxBtn);
                showToast(`Exported ${filename}`);
            });
        }

        const geopdfBtn = document.getElementById("download-geopdf");
        if (geopdfBtn) {
            geopdfBtn.addEventListener("click", async () => {
                await downloadGeoPdf(geopdfBtn);
            });
        }

        const geotiffBtn = document.getElementById("download-geotiff");
        if (geotiffBtn) {
            geotiffBtn.addEventListener("click", async () => {
                await downloadGeoTiff(geotiffBtn);
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
                    const primaryColor = getThemeAccent();
                    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
                        <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30S36 31.5 36 18C36 8.06 27.94 0 18 0z" fill="${primaryColor}"/>
                        <circle cx="18" cy="18" r="7" fill="${primaryColor}"/>
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

    let savedSnapState = null;

    const openSearch = (e) => {
        if (e) e.preventDefault();

        if (window.innerWidth <= 768) {
            savedSnapState = state.snapState || "default";
            setMobileSnapState("selection-full", true);
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

        if (window.innerWidth <= 768 && savedSnapState) {
            setMobileSnapState(savedSnapState, true);
            savedSnapState = null;
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

    searchInput.addEventListener("focus", () => {
        if (window.innerWidth <= 768) {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
        }
    });

    searchInput.addEventListener("blur", () => {
        if (window.innerWidth <= 768) {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
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

function updateBottomNavVisibilityForSnapState(snapState) {
    const bottomNavContainer = document.querySelector(".mobile-bottom-nav-container");
    if (bottomNavContainer) {
        if (snapState === "map-full") {
            bottomNavContainer.classList.add("is-hidden-entirely");
        } else {
            bottomNavContainer.classList.remove("is-hidden-entirely");
        }
    }
}

function setMobileSnapState(snapState, animate = true) {
    const mapArea = document.querySelector(".maps-tile-map-area");
    const sidebar = document.querySelector(".maps-tile-sidebar");
    const resizeBar = document.getElementById("mobile-resize-bar");
    const headerEl = document.querySelector(".maps-tile-header");
    const sidebarHeaderEl = document.getElementById("sidebar-header");
    
    if (!mapArea || !sidebar || !resizeBar || !headerEl || !sidebarHeaderEl) return;

    updateBottomNavVisibilityForSnapState(snapState);

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

        if (!isTracking) {
            const touch = e.changedTouches[0];
            const diffX = touch.clientX - startX;
            const diffY = touch.clientY - startY;
            // Swiping left (right-to-left) inside feature tiles area -> open search
            if (diffX < -50 && Math.abs(diffX) > Math.abs(diffY) * 1.4 && Math.abs(diffY) < 70) {
                const header = document.getElementById("sidebar-header");
                const isSearching = header && header.classList.contains("is-searching");
                if (!isSearching) {
                    const searchToggle = document.getElementById("btn-search-toggle");
                    if (searchToggle) {
                        searchToggle.click();
                    }
                }
            }
            return;
        }
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

        // Live update bottom nav bar visibility during vertical drag
        updateBottomNavVisibilityForSnapState(state.snapState);

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
        { selector: "#mobile-nav-tab-explore", title: "Explore Tab", desc: "Switch to map-full view to explore the map on mobile." },
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
        const storedTheme = localStorage.getItem("fovea-theme") || "dark";
        const isSystemLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
        const isLight = storedTheme === "light" || (storedTheme === "auto" && isSystemLight);

        if (isLight) {
            document.documentElement.setAttribute("data-theme", "light");
            document.documentElement.classList.add("theme-light");
            document.body.classList.add("theme-light");
            state.currentBaseLayer = "default";
        } else {
            document.documentElement.setAttribute("data-theme", "dark");
            document.documentElement.classList.remove("theme-light");
            document.body.classList.remove("theme-light");
            state.currentBaseLayer = "default";
        }

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
        setupMobileBottomNav();
        setupViewToggleMenu();

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
    const sidebar = document.querySelector(".maps-tile-sidebar");

    if (!scrollBox || !header || !sidebar) return;

    // On mobile the sidebar itself is the scroll container (unified layout).
    // On desktop the scrollBox (zone list) is the scroll container.
    const isMobile = () => window.innerWidth <= 768;
    const getScrollTarget = () => isMobile() ? sidebar : scrollBox;

    const bottomNav = document.querySelector(".mobile-bottom-nav");

    const onScroll = (e) => {
        const target = e.currentTarget;
        const scrollTop = target.scrollTop;
        const scrolled = scrollTop > 4;

        header.classList.toggle("is-scrolled", scrolled);
        sidebar.classList.toggle("is-scrolled", scrolled);
        // body class lets the resize bar ::after gradient fire (sibling of sidebar)
        document.body.classList.toggle("sidebar-is-scrolled", scrolled);

        // Hide mobile bottom nav when scrolling down, show only when back at the top
        if (isMobile() && bottomNav) {
            if (scrollTop > 12) {
                bottomNav.classList.add("is-hidden");
            } else {
                bottomNav.classList.remove("is-hidden");
            }
        }
    };

    // Attach to both — only one will actually be scrolling at a time
    sidebar.addEventListener("scroll", onScroll, { passive: true });
    scrollBox.addEventListener("scroll", onScroll, { passive: true });
}



function setupViewToggleMenu() {
    const toggleBtn = document.getElementById("header-view-toggle");
    const menuEl = document.getElementById("header-view-menu");
    const labelEl = document.getElementById("header-view-toggle-label");
    const iconWrapEl = document.getElementById("header-view-toggle-icon");
    if (!toggleBtn || !menuEl) return;

    let isOpen = false;

    function openMenu() {
        isOpen = true;
        menuEl.setAttribute("aria-hidden", "false");
        toggleBtn.setAttribute("aria-expanded", "true");
    }

    function closeMenu() {
        isOpen = false;
        menuEl.setAttribute("aria-hidden", "true");
        toggleBtn.setAttribute("aria-expanded", "false");
    }

    toggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    const items = menuEl.querySelectorAll(".header-view-menu__item");
    items.forEach(item => {
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            const val = item.dataset.value;
            
            // Update active state inside popup
            items.forEach(i => {
                const isActive = i.dataset.value === val;
                i.classList.toggle("is-active", isActive);
                const checkSvg = i.querySelector(".header-view-menu__check");
                if (checkSvg) checkSvg.style.display = isActive ? "block" : "none";
            });

            // Update toggle button icon
            if (iconWrapEl) {
                const itemIcon = item.querySelector(".header-view-menu__icon");
                if (itemIcon) {
                    iconWrapEl.innerHTML = itemIcon.outerHTML;
                    const clonedSvg = iconWrapEl.querySelector("svg");
                    if (clonedSvg) {
                        clonedSvg.setAttribute("width", "12");
                        clonedSvg.setAttribute("height", "12");
                    }
                }
            }

            // Update toggle label text
            if (labelEl) {
                const labelMap = {
                    auto: "Auto",
                    map: "Map",
                    graph: "Graph",
                    table: "Table",
                    image: "Image",
                    people: "People",
                    network: "Network"
                };
                labelEl.textContent = labelMap[val] || (val.charAt(0).toUpperCase() + val.slice(1));
            }

            // Close popup
            closeMenu();
        });
    });

    // Close on click outside
    document.addEventListener("click", (e) => {
        if (isOpen && !toggleBtn.contains(e.target) && !menuEl.contains(e.target)) {
            closeMenu();
        }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
        if (isOpen && e.key === "Escape") {
            closeMenu();
        }
    });
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


function setupMobileBottomNav() {
    const nav = document.querySelector(".mobile-bottom-nav");
    if (!nav) return;

    const baseItems = nav.querySelectorAll(".mobile-bottom-nav__base .mobile-bottom-nav-item");
    const exploreTab = document.getElementById("mobile-nav-tab-explore");
    const capsule = nav.querySelector(".mobile-bottom-nav__capsule");
    const overlay = nav.querySelector(".mobile-bottom-nav__overlay");

    if (!baseItems.length || !capsule || !overlay) return;

    // Explore tab: on mobile, do nothing to snap state when already on the maps page.
    if (exploreTab) {
        exploreTab.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    let activeIndex = -1;
    baseItems.forEach((item, index) => {
        if (item.classList.contains("is-active")) {
            activeIndex = index;
        }
    });

    const prevIndexStr = sessionStorage.getItem("prev-nav-index");
    let prevIndex = prevIndexStr !== null ? parseInt(prevIndexStr, 10) : -1;
    sessionStorage.removeItem("prev-nav-index");

    function updateCapsule(targetEl, immediate = false) {
        if (!targetEl) return;
        
        if (immediate) {
            capsule.style.transition = "none";
            overlay.style.transition = "none";
        } else {
            capsule.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.16, 1, 0.3, 1), height 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
            overlay.style.transition = "clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1), -webkit-clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1)";
        }

        const navRect = nav.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        const left = targetRect.left - navRect.left;
        const top = targetRect.top - navRect.top;
        const width = targetRect.width;
        const height = targetRect.height;

        capsule.style.transform = `translate(${left}px, ${top}px)`;
        capsule.style.width = `${width}px`;
        capsule.style.height = `${height}px`;

        nav.style.setProperty("--active-x", `${left + width / 2}px`);
        nav.style.setProperty("--active-y", `${top + height / 2}px`);

        const clipVal = `inset(${top}px ${navRect.width - (left + width)}px ${navRect.height - (top + height)}px ${left}px round 17px)`;
        overlay.style.clipPath = clipVal;
        overlay.style.webkitClipPath = clipVal;

        if (immediate) {
            capsule.offsetHeight;
            capsule.style.transition = "";
            overlay.style.transition = "";
        }
    }

    if (prevIndex !== -1 && prevIndex !== activeIndex && baseItems[prevIndex]) {
        updateCapsule(baseItems[prevIndex], true);
        requestAnimationFrame(() => {
            updateCapsule(baseItems[activeIndex]);
        });
    } else if (activeIndex !== -1) {
        updateCapsule(baseItems[activeIndex], true);
    }

    // Touch Dragging Logic for the capsule (bound to nav to bypass z-index blocking)
    let isDragging = false;
    let hasMoved = false;
    let startX = 0;
    let initialLeft = 0;
    let currentLeft = 0;

    baseItems.forEach((item, index) => {
        item.addEventListener("click", (e) => {
            if (hasMoved) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            sessionStorage.setItem("prev-nav-index", index);
            updateCapsule(item);
        });
    });

    nav.addEventListener("touchstart", (e) => {
        const touch = e.touches[0];
        const capsuleRect = capsule.getBoundingClientRect();
        
        // Check if touch starts within the bounds of the active capsule
        if (
            touch.clientX >= capsuleRect.left &&
            touch.clientX <= capsuleRect.right &&
            touch.clientY >= capsuleRect.top &&
            touch.clientY <= capsuleRect.bottom
        ) {
            isDragging = true;
            hasMoved = false;
            capsule.style.cursor = "grabbing";
            capsule.classList.add("is-dragging");
            startX = touch.clientX;
            
            const style = window.getComputedStyle(capsule);
            const DOMMatrixClass = window.DOMMatrix || window.WebKitCSSMatrix || window.MSCSSMatrix;
            const matrix = new DOMMatrixClass(style.transform);
            initialLeft = matrix.m41;
            currentLeft = initialLeft;

            capsule.style.transition = "none";
            overlay.style.transition = "none";
        }
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
        if (!isDragging) return;
        
        const touch = e.touches[0];
        const deltaX = touch.clientX - startX;
        
        if (Math.abs(deltaX) > 4) {
            hasMoved = true;
        }

        let newLeft = initialLeft + deltaX;

        const navRect = nav.getBoundingClientRect();
        const capsuleRect = capsule.getBoundingClientRect();
        const paddingLeft = 4;
        const minLeft = paddingLeft;
        const maxLeft = navRect.width - paddingLeft - capsuleRect.width;

        if (newLeft < minLeft) newLeft = minLeft;
        if (newLeft > maxLeft) newLeft = maxLeft;

        currentLeft = newLeft;

        capsule.style.transform = `translate(${newLeft}px, 4px)`;

        const top = 4;
        const width = capsuleRect.width;
        const height = capsuleRect.height;

        nav.style.setProperty("--active-x", `${newLeft + width / 2}px`);
        nav.style.setProperty("--active-y", `${top + height / 2}px`);
        const clipVal = `inset(${top}px ${navRect.width - (newLeft + width)}px ${navRect.height - (top + height)}px ${newLeft}px round 17px)`;
        overlay.style.clipPath = clipVal;
        overlay.style.webkitClipPath = clipVal;
    }, { passive: true });

    window.addEventListener("touchend", () => {
        if (!isDragging) return;
        isDragging = false;
        capsule.style.cursor = "grab";
        capsule.classList.remove("is-dragging");

        capsule.style.transition = "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.16, 1, 0.3, 1), height 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease";
        overlay.style.transition = "clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1), -webkit-clip-path 0.35s cubic-bezier(0.16, 1, 0.3, 1)";

        const navRect = nav.getBoundingClientRect();
        const capsuleRect = capsule.getBoundingClientRect();
        const capsuleCenter = currentLeft + capsuleRect.width / 2;

        let closestItem = null;
        let closestDist = Infinity;
        let closestIndex = -1;

        baseItems.forEach((item, index) => {
            const itemRect = item.getBoundingClientRect();
            const itemLeft = itemRect.left - navRect.left;
            const itemCenter = itemLeft + itemRect.width / 2;
            const dist = Math.abs(capsuleCenter - itemCenter);
            
            if (dist < closestDist) {
                closestDist = dist;
                closestItem = item;
                closestIndex = index;
            }
        });

        if (closestItem) {
            sessionStorage.setItem("prev-nav-index", closestIndex);
            
            const itemRect = closestItem.getBoundingClientRect();
            const left = itemRect.left - navRect.left;
            const top = itemRect.top - navRect.top;
            const width = itemRect.width;
            const height = itemRect.height;

            capsule.style.transform = `translate(${left}px, ${top}px)`;
            capsule.style.width = `${width}px`;
            capsule.style.height = `${height}px`;

            nav.style.setProperty("--active-x", `${left + width / 2}px`);
            nav.style.setProperty("--active-y", `${top + height / 2}px`);

            const clipVal = `inset(${top}px ${navRect.width - (left + width)}px ${navRect.height - (top + height)}px ${left}px round 17px)`;
            overlay.style.clipPath = clipVal;
            overlay.style.webkitClipPath = clipVal;

            if (hasMoved) {
                closestItem.click();
            }
        }
        
        // Reset hasMoved after a short delay to allow click cancellation to execute first
        setTimeout(() => {
            hasMoved = false;
        }, 50);
    });

    window.addEventListener("resize", () => {
        const activeTab = nav.querySelector(".mobile-bottom-nav__base .mobile-bottom-nav-item.is-active");
        if (activeTab) {
            updateCapsule(activeTab, true);
        }
    });
}



