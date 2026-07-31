// Darken a hex color by a specified percentage factor (0.0 to 1.0)
export function darkenHexColor(hex, percent) {
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
export function hexToRgba(hex, alpha) {
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
export function getThemeAccent() {
    if (typeof window !== 'undefined' && document.documentElement) {
        const val = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
        if (val && val.startsWith('#')) return val;
    }
    return "#64b5f6";
}

export function getThemeAccentLight() {
    if (typeof window !== 'undefined' && document.documentElement) {
        const val = getComputedStyle(document.documentElement).getPropertyValue('--accent-light').trim();
        if (val && val.startsWith('#')) return val;
    }
    return "#91cfff";
}
