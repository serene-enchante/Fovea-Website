export function getBbox(features) {
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

export function findPointInsidePolygon(geom) {
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

export function generateZoneGeometrySVG(feature) {
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

export function isPointInRing(lng, lat, ring) {
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

export function isPointInGeoJSONGeometry(lng, lat, geometry) {
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
