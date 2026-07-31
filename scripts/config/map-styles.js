import { getThemeAccent, getThemeAccentLight } from '../utils/color-utils.js';

export const MAP_STYLES = {
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
