import { state } from '../state.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { normalizeZoneId } from '../utils/format-utils.js';

// Cursor proximity glow: set feature-state 'proximity' (0–1) based on
// screen-space distance from cursor to each zone center point
export function setupProximityTracking() {
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
export function setupProximityGlowCanvas() {
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
