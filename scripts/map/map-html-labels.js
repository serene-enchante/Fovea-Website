import { state } from '../state.js';

export function rebuildHtmlLabels() {
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
    const isLightModeTheme = document.body.classList.contains('theme-light') ||
        document.documentElement.getAttribute('data-theme') === 'light';
    const isLightBasemap = state.currentBaseLayer === 'esri-street' || state.currentBaseLayer === 'esri-topo' ||
        (state.currentBaseLayer === 'default' && isLightModeTheme);

    // Remove labels that no longer match current feature set
    const labelsById = new Map();
    const existing = overlay.querySelectorAll('.map-zone-label');
    existing.forEach(el => {
        labelsById.set(el.dataset.labelId, el);
    });

    const currentIds = new Set(state.labelData.map(d => String(d.id)));
    labelsById.forEach((el, id) => {
        if (!currentIds.has(id)) {
            el.remove();
            labelsById.delete(id);
        }
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

        let el = labelsById.get(String(id));
        if (!el) {
            el = document.createElement('div');
            el.className = 'map-zone-label';
            el.dataset.labelId = id;
            el.textContent = text;
            overlay.appendChild(el);
            labelsById.set(String(id), el);
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

        setStyleIfChanged(el, 'left', `${pt.x}px`);
        setStyleIfChanged(el, 'top', `${pt.y}px`);
        setStyleIfChanged(el, 'fontSize', `${fontSize}px`);
        setStyleIfChanged(el, 'opacity', fontSize > 0 ? '1' : '0');
        setStyleIfChanged(el, 'pointerEvents', 'none');
        setStyleIfChanged(el, 'color', isLightBasemap ? '#000000' : '#c8c8c8');
        setStyleIfChanged(el, 'textShadow', isLightBasemap
            ? 'none'
            : '0 0 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.85)');
    });
}

function setStyleIfChanged(element, property, value) {
    if (element.style[property] !== value) element.style[property] = value;
}

// Refresh labels after map camera or presentation state changes.
export function updateLabelZoomVisibility() {
    rebuildHtmlLabels();
}
