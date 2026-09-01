import { state } from '../state.js';
import { showToast } from './toast-view.js';
import { displayZoneId, normalizeZoneId } from '../utils/format-utils.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { getThemeAccent } from '../utils/color-utils.js';

export function getSuggestSelectionLabel() {
    if (state.isCirclesFeature) {
        return "Coast to Cascades";
    }
    const circleName = state.currentFeature === "florence" ? "Florence CBC" : "Eugene CBC";
    const isCircle = !state.currentId || state.currentId === CIRCLE_ID;
    if (isCircle) {
        return circleName;
    }
    const targetFeature = (state.allFeatures || []).find(f => {
        const zid = f.properties?.zid;
        return zid && (zid.toLowerCase() === state.currentId.toLowerCase() || (typeof normalizeZoneId === "function" && normalizeZoneId(zid) === normalizeZoneId(state.currentId)));
    });
    if (targetFeature && targetFeature.properties?.zid) {
        return `Zone ${displayZoneId(targetFeature.properties.zid)}`;
    }
    return `Zone ${displayZoneId(state.currentId)}`;
}

export function setupSuggestFormAndDrawing(closeAllModals) {
    const markerBtn = document.getElementById("btn-draw-marker");
    const lineBtn = document.getElementById("btn-draw-line");
    const polygonBtn = document.getElementById("btn-draw-polygon");
    const statusEl = document.getElementById("suggest-annotation-status");
    const suggestForm = document.getElementById("suggest-form");
    const suggestModal = document.getElementById("suggest-modal");

    if (!suggestForm) return;

    const MAX_ITEMS = 5;

    // Multi-feature collections (up to 5 of each)
    let markers = [];           // Array<[lng, lat]>
    let lines = [];             // Array<Array<[lng, lat]>>
    let polygons = [];          // Array<Array<[lng, lat]>>

    // In-progress drafting buffers
    let activeLineCoords = [];  // Array<[lng, lat]>
    let activePolyCoords = [];  // Array<[lng, lat]>
    let currentDrawingMode = null; // 'marker' | 'line' | 'polygon' | null

    // SVG icons
    const PIN_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
    const LINE_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19L19 4"></path><circle cx="4" cy="19" r="2"></circle><circle cx="19" cy="4" r="2"></circle></svg>`;
    const POLYGON_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;
    const CHECK_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    const CLEAR_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    const updateStatusText = () => {
        if (!statusEl) return;

        const items = [];
        if (markers.length > 0) {
            items.push(`<span class="suggest-status-badge" data-action="clear-markers" title="Click to clear markers">${markers.length === 1 ? '1 Marker' : `${markers.length} Markers`} &times;</span>`);
        }
        if (lines.length > 0) {
            items.push(`<span class="suggest-status-badge" data-action="clear-lines" title="Click to clear lines">${lines.length === 1 ? '1 Line' : `${lines.length} Lines`} &times;</span>`);
        }
        if (polygons.length > 0) {
            items.push(`<span class="suggest-status-badge" data-action="clear-polygons" title="Click to clear polygons">${polygons.length === 1 ? '1 Polygon' : `${polygons.length} Polygons`} &times;</span>`);
        }

        if (items.length > 0) {
            statusEl.innerHTML = items.join(" ");
            // Bind click-to-clear on badge chips
            statusEl.querySelectorAll("[data-action]").forEach(chip => {
                chip.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const action = chip.getAttribute("data-action");
                    if (action === "clear-markers") {
                        markers = [];
                        showToast("Markers cleared");
                    } else if (action === "clear-lines") {
                        lines = [];
                        showToast("Lines cleared");
                    } else if (action === "clear-polygons") {
                        polygons = [];
                        showToast("Polygons cleared");
                    }
                    updateAnnotationSource();
                    updateButtonsUI();
                    updateStatusText();
                    updateSuggestLockState();
                });
            });
        } else {
            statusEl.textContent = "No location pinned on map";
        }
    };

    const updateSuggestLockState = () => {
        const titleInput = document.getElementById("suggest-input-title");
        const msgInput = document.getElementById("suggest-input-message");
        const hasTitle = titleInput && titleInput.value.trim().length > 0;
        const hasMsg = msgInput && msgInput.value.trim().length > 0;
        const hasAnnotation = Boolean(
            (markers && markers.length > 0) ||
            (lines && lines.length > 0) ||
            (polygons && polygons.length > 0) ||
            (activeLineCoords && activeLineCoords.length > 0) ||
            (activePolyCoords && activePolyCoords.length > 0) ||
            currentDrawingMode
        );
        const isLocked = Boolean(hasTitle || hasMsg || hasAnnotation);

        state.isSuggestLocked = isLocked;
        const exitBtn = document.getElementById("suggest-exit-btn");
        const exitTextSpan = exitBtn ? exitBtn.querySelector(".suggest-exit-text") : null;

        if (isLocked) {
            document.body.classList.add("is-suggest-locked");
            if (exitBtn) {
                const selLabel = getSuggestSelectionLabel();
                if (exitTextSpan) {
                    exitTextSpan.textContent = `Exit Suggest Mode for "${selLabel}" (loses progress)`;
                }
                exitBtn.setAttribute("aria-label", `Exit Suggest Mode for "${selLabel}" (loses progress)`);
            }
        } else {
            document.body.classList.remove("is-suggest-locked");
        }
    };
    window.updateSuggestLockState = updateSuggestLockState;

    const titleInput = document.getElementById("suggest-input-title");
    const msgInput = document.getElementById("suggest-input-message");
    if (titleInput) titleInput.addEventListener("input", updateSuggestLockState);
    if (msgInput) msgInput.addEventListener("input", updateSuggestLockState);

    const updateButtonsUI = () => {
        // Marker Button
        if (markerBtn) {
            if (currentDrawingMode === "marker") {
                markerBtn.innerHTML = `${PIN_ICON}<span>Placing Marker...</span>`;
                markerBtn.classList.add("is-active");
                markerBtn.classList.remove("is-clear-mode");
            } else if (markers.length >= MAX_ITEMS) {
                markerBtn.innerHTML = `${CLEAR_ICON}<span>Clear Markers</span>`;
                markerBtn.classList.add("is-clear-mode");
                markerBtn.classList.remove("is-active");
            } else {
                markerBtn.innerHTML = `${PIN_ICON}<span>Add a Marker</span>`;
                markerBtn.classList.remove("is-clear-mode", "is-active");
            }
        }

        // Line Button
        if (lineBtn) {
            if (currentDrawingMode === "line") {
                lineBtn.innerHTML = `${CHECK_ICON}<span>Finish Line (${activeLineCoords.length} pts)</span>`;
                lineBtn.classList.add("is-active");
                lineBtn.classList.remove("is-clear-mode");
            } else if (lines.length >= MAX_ITEMS) {
                lineBtn.innerHTML = `${CLEAR_ICON}<span>Clear Lines</span>`;
                lineBtn.classList.add("is-clear-mode");
                lineBtn.classList.remove("is-active");
            } else {
                lineBtn.innerHTML = `${LINE_ICON}<span>Add Line</span>`;
                lineBtn.classList.remove("is-clear-mode", "is-active");
            }
        }

        // Polygon Button
        if (polygonBtn) {
            if (currentDrawingMode === "polygon") {
                polygonBtn.innerHTML = `${CHECK_ICON}<span>Finish Polygon (${activePolyCoords.length} pts)</span>`;
                polygonBtn.classList.add("is-active");
                polygonBtn.classList.remove("is-clear-mode");
            } else if (polygons.length >= MAX_ITEMS) {
                polygonBtn.innerHTML = `${CLEAR_ICON}<span>Clear Polygons</span>`;
                polygonBtn.classList.add("is-clear-mode");
                polygonBtn.classList.remove("is-active");
            } else {
                polygonBtn.innerHTML = `${POLYGON_ICON}<span>Add Polygon</span>`;
                polygonBtn.classList.remove("is-clear-mode", "is-active");
            }
        }
    };

    const ensureAnnotationLayers = (map) => {
        if (!map) return;
        const primaryColor = getThemeAccent();

        if (!map.getSource("suggest-annotation-source")) {
            map.addSource("suggest-annotation-source", {
                type: "geojson",
                data: { type: "FeatureCollection", features: [] }
            });
        }

        // Polygon Fill Layer
        if (!map.getLayer("suggest-annotation-polygon-fill-layer")) {
            map.addLayer({
                id: "suggest-annotation-polygon-fill-layer",
                type: "fill",
                source: "suggest-annotation-source",
                filter: ["==", "$type", "Polygon"],
                paint: {
                    "fill-color": primaryColor,
                    "fill-opacity": 0.28
                }
            });
        }

        // Polygon Outline Layer
        if (!map.getLayer("suggest-annotation-polygon-stroke-layer")) {
            map.addLayer({
                id: "suggest-annotation-polygon-stroke-layer",
                type: "line",
                source: "suggest-annotation-source",
                filter: ["==", "$type", "Polygon"],
                paint: {
                    "line-color": primaryColor,
                    "line-width": 3,
                    "line-opacity": 0.95
                }
            });
        }

        // Line Halo Layer
        if (!map.getLayer("suggest-annotation-line-halo-layer")) {
            map.addLayer({
                id: "suggest-annotation-line-halo-layer",
                type: "line",
                source: "suggest-annotation-source",
                filter: ["==", "$type", "LineString"],
                paint: {
                    "line-color": "#000000",
                    "line-width": 6,
                    "line-opacity": 0.35
                }
            });
        }

        // Line Layer
        if (!map.getLayer("suggest-annotation-line-layer")) {
            map.addLayer({
                id: "suggest-annotation-line-layer",
                type: "line",
                source: "suggest-annotation-source",
                filter: ["==", "$type", "LineString"],
                paint: {
                    "line-color": primaryColor,
                    "line-width": 3.5,
                    "line-opacity": 0.95
                }
            });
        }

        // Vertices Layer
        if (!map.getLayer("suggest-annotation-vertex-layer")) {
            map.addLayer({
                id: "suggest-annotation-vertex-layer",
                type: "circle",
                source: "suggest-annotation-source",
                filter: ["all", ["==", "$type", "Point"], ["==", "kind", "vertex"]],
                paint: {
                    "circle-radius": 5,
                    "circle-color": "#ffffff",
                    "circle-stroke-color": primaryColor,
                    "circle-stroke-width": 2.5
                }
            });
        }

        // Marker Symbol Layer
        if (!map.hasImage("suggest-pin-icon")) {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48">
                <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 30 18 30S36 31.5 36 18C36 8.06 27.94 0 18 0z" fill="${primaryColor}"/>
                <circle cx="18" cy="18" r="7" fill="${primaryColor}"/>
            </svg>`;
            const blob = new Blob([svg], { type: "image/svg+xml" });
            const url = URL.createObjectURL(blob);
            const img = new Image(36, 48);
            img.onload = () => {
                if (!map.hasImage("suggest-pin-icon")) {
                    map.addImage("suggest-pin-icon", img);
                }
                if (!map.getLayer("suggest-annotation-point-layer")) {
                    map.addLayer({
                        id: "suggest-annotation-point-layer",
                        type: "symbol",
                        source: "suggest-annotation-source",
                        filter: ["all", ["==", "$type", "Point"], ["==", "kind", "marker"]],
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
        } else if (!map.getLayer("suggest-annotation-point-layer")) {
            map.addLayer({
                id: "suggest-annotation-point-layer",
                type: "symbol",
                source: "suggest-annotation-source",
                filter: ["all", ["==", "$type", "Point"], ["==", "kind", "marker"]],
                layout: {
                    "icon-image": "suggest-pin-icon",
                    "icon-size": 0.55,
                    "icon-anchor": "bottom",
                    "icon-allow-overlap": true
                }
            });
        }
    };

    const updateAnnotationSource = () => {
        if (!state.map) return;
        ensureAnnotationLayers(state.map);

        const features = [];

        // 1. All placed markers
        markers.forEach((coord, idx) => {
            features.push({
                type: "Feature",
                properties: { kind: "marker", index: idx },
                geometry: { type: "Point", coordinates: coord }
            });
        });

        // 2. All placed lines + in-progress line
        lines.forEach((line) => {
            if (line.length >= 2) {
                features.push({
                    type: "Feature",
                    properties: { kind: "line" },
                    geometry: { type: "LineString", coordinates: line }
                });
            }
            line.forEach(coord => {
                features.push({
                    type: "Feature",
                    properties: { kind: "vertex" },
                    geometry: { type: "Point", coordinates: coord }
                });
            });
        });

        if (activeLineCoords.length > 0) {
            if (activeLineCoords.length >= 2) {
                features.push({
                    type: "Feature",
                    properties: { kind: "line" },
                    geometry: { type: "LineString", coordinates: activeLineCoords }
                });
            }
            activeLineCoords.forEach(coord => {
                features.push({
                    type: "Feature",
                    properties: { kind: "vertex" },
                    geometry: { type: "Point", coordinates: coord }
                });
            });
        }

        // 3. All placed polygons + in-progress polygon
        polygons.forEach((poly) => {
            if (poly.length >= 3) {
                const ring = [...poly, poly[0]];
                features.push({
                    type: "Feature",
                    properties: { kind: "polygon" },
                    geometry: { type: "Polygon", coordinates: [ring] }
                });
            }
            poly.forEach(coord => {
                features.push({
                    type: "Feature",
                    properties: { kind: "vertex" },
                    geometry: { type: "Point", coordinates: coord }
                });
            });
        });

        if (activePolyCoords.length > 0) {
            if (activePolyCoords.length >= 3) {
                const ring = [...activePolyCoords, activePolyCoords[0]];
                features.push({
                    type: "Feature",
                    properties: { kind: "polygon" },
                    geometry: { type: "Polygon", coordinates: [ring] }
                });
            } else if (activePolyCoords.length === 2) {
                features.push({
                    type: "Feature",
                    properties: { kind: "line" },
                    geometry: { type: "LineString", coordinates: activePolyCoords }
                });
            }
            activePolyCoords.forEach(coord => {
                features.push({
                    type: "Feature",
                    properties: { kind: "vertex" },
                    geometry: { type: "Point", coordinates: coord }
                });
            });
        }

        const geojson = {
            type: "FeatureCollection",
            features: features
        };

        if (state.map.getSource("suggest-annotation-source")) {
            state.map.getSource("suggest-annotation-source").setData(geojson);
        }
    };

    const resetDrawingStateOnly = () => {
        currentDrawingMode = null;
        activeLineCoords = [];
        activePolyCoords = [];
        if (state.map && state.map.getCanvas()) state.map.getCanvas().style.cursor = "";
        if (state.map && state.map.doubleClickZoom) state.map.doubleClickZoom.enable();
        document.body.classList.remove("is-annotation-mode");
        updateButtonsUI();
        updateStatusText();
    };

    const clearAllAnnotations = (silent = false) => {
        markers = [];
        lines = [];
        polygons = [];
        resetDrawingStateOnly();
        if (state.map && state.map.getSource("suggest-annotation-source")) {
            state.map.getSource("suggest-annotation-source").setData({
                type: "FeatureCollection",
                features: []
            });
        }
        updateStatusText();
        updateSuggestLockState();
        if (!silent) showToast("All annotations cleared");
    };

    const suggestExitBtn = document.getElementById("suggest-exit-btn");
    if (suggestExitBtn) {
        suggestExitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (titleInput) titleInput.value = "";
            if (msgInput) msgInput.value = "";
            clearAllAnnotations(true);
            updateSuggestLockState();
            if (typeof closeAllModals === "function") closeAllModals();
            showToast("Suggest mode exited (progress discarded)");
        });
    }

    const finishDrawingLine = () => {
        if (activeLineCoords.length < 2) {
            showToast("Click map to add at least 2 points for a line.");
            return;
        }
        lines.push([...activeLineCoords]);
        resetDrawingStateOnly();
        updateAnnotationSource();
        updateSuggestLockState();
        if (suggestModal) {
            suggestModal.setAttribute("aria-hidden", "false");
            suggestModal.classList.add("is-open");
            if (window.updateActionButtonsState) window.updateActionButtonsState();
        }
        showToast("Line added to map!");
    };

    const finishDrawingPolygon = () => {
        if (activePolyCoords.length < 3) {
            showToast("Click map to add at least 3 corners for a polygon.");
            return;
        }
        polygons.push([...activePolyCoords]);
        resetDrawingStateOnly();
        updateAnnotationSource();
        updateSuggestLockState();
        if (suggestModal) {
            suggestModal.setAttribute("aria-hidden", "false");
            suggestModal.classList.add("is-open");
            if (window.updateActionButtonsState) window.updateActionButtonsState();
        }
        showToast("Polygon added to map!");
    };

    const cancelCurrentDrawing = () => {
        resetDrawingStateOnly();
        updateAnnotationSource();
        updateSuggestLockState();
    };

    const annotationExitBtn = document.getElementById("annotation-exit-btn");
    if (annotationExitBtn) {
        annotationExitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentDrawingMode === "line" && activeLineCoords.length >= 2) {
                finishDrawingLine();
            } else if (currentDrawingMode === "polygon" && activePolyCoords.length >= 3) {
                finishDrawingPolygon();
            } else {
                cancelCurrentDrawing();
            }
        });
    }

    // Press X to exit drawing mode
    document.addEventListener("keydown", (e) => {
        if ((e.key === "x" || e.key === "X") && document.body.classList.contains("is-annotation-mode")) {
            e.preventDefault();
            if (currentDrawingMode === "line" && activeLineCoords.length >= 2) {
                finishDrawingLine();
            } else if (currentDrawingMode === "polygon" && activePolyCoords.length >= 3) {
                finishDrawingPolygon();
            } else {
                cancelCurrentDrawing();
            }
        }
    });

    const startDrawingMode = (mode, msg) => {
        if (!state.map) {
            showToast("Map is not available");
            return;
        }
        currentDrawingMode = mode;
        activeLineCoords = [];
        activePolyCoords = [];

        updateButtonsUI();
        updateStatusText();

        if (state.map.getCanvas()) state.map.getCanvas().style.cursor = "crosshair";
        if (state.map.doubleClickZoom) state.map.doubleClickZoom.disable();
        document.body.classList.add("is-annotation-mode");
        showToast(msg);
    };

    if (state.map) {
        state.map.on("click", (e) => {
            if (!currentDrawingMode) return;
            const pt = [e.lngLat.lng, e.lngLat.lat];

            if (currentDrawingMode === "marker") {
                if (markers.length < MAX_ITEMS) {
                    markers.push(pt);
                    updateAnnotationSource();
                    window._preventSuggestClose = true;
                    setTimeout(() => { window._preventSuggestClose = false; }, 0);
                    resetDrawingStateOnly();
                    updateSuggestLockState();

                    if (suggestModal) {
                        suggestModal.setAttribute("aria-hidden", "false");
                        suggestModal.classList.add("is-open");
                        if (window.updateActionButtonsState) window.updateActionButtonsState();
                    }
                    showToast("Marker added to map!");
                } else {
                    showToast("Maximum of 5 markers reached.");
                }
            } else if (currentDrawingMode === "line") {
                activeLineCoords.push(pt);
                updateAnnotationSource();
                window._preventSuggestClose = true;
                setTimeout(() => { window._preventSuggestClose = false; }, 0);
                updateButtonsUI();
                updateStatusText();
                updateSuggestLockState();
            } else if (currentDrawingMode === "polygon") {
                activePolyCoords.push(pt);
                updateAnnotationSource();
                window._preventSuggestClose = true;
                setTimeout(() => { window._preventSuggestClose = false; }, 0);
                updateButtonsUI();
                updateStatusText();
                updateSuggestLockState();
            }
        });

        state.map.on("dblclick", (e) => {
            if (!currentDrawingMode) return;
            e.preventDefault();
            if (currentDrawingMode === "line") {
                if (activeLineCoords.length >= 2) {
                    finishDrawingLine();
                } else {
                    cancelCurrentDrawing();
                    showToast("Line cancelled (need at least 2 points)");
                }
            } else if (currentDrawingMode === "polygon") {
                if (activePolyCoords.length >= 3) {
                    finishDrawingPolygon();
                } else {
                    cancelCurrentDrawing();
                    showToast("Polygon cancelled (need at least 3 corners)");
                }
            }
        });
    }

    if (markerBtn) {
        markerBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentDrawingMode === "marker") {
                cancelCurrentDrawing();
            } else if (markers.length >= MAX_ITEMS) {
                // Clear all markers
                markers = [];
                updateAnnotationSource();
                updateButtonsUI();
                updateStatusText();
                updateSuggestLockState();
                showToast("Markers cleared");
            } else {
                startDrawingMode("marker", "Click anywhere on the map to place a marker!");
            }
        });
    }

    if (lineBtn) {
        lineBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentDrawingMode === "line") {
                if (activeLineCoords.length >= 2) {
                    finishDrawingLine();
                } else {
                    cancelCurrentDrawing();
                    showToast("Line cancelled (need at least 2 points)");
                }
            } else if (lines.length >= MAX_ITEMS) {
                // Clear all lines
                lines = [];
                updateAnnotationSource();
                updateButtonsUI();
                updateStatusText();
                updateSuggestLockState();
                showToast("Lines cleared");
            } else {
                startDrawingMode("line", "Click on map to add line points. Click Finish or dbl-click when done.");
            }
        });
    }

    if (polygonBtn) {
        polygonBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (currentDrawingMode === "polygon") {
                if (activePolyCoords.length >= 3) {
                    finishDrawingPolygon();
                } else {
                    cancelCurrentDrawing();
                    showToast("Polygon cancelled (need at least 3 corners)");
                }
            } else if (polygons.length >= MAX_ITEMS) {
                // Clear all polygons
                polygons = [];
                updateAnnotationSource();
                updateButtonsUI();
                updateStatusText();
                updateSuggestLockState();
                showToast("Polygons cleared");
            } else {
                startDrawingMode("polygon", "Click on map to add polygon corners. Click Finish or dbl-click when done.");
            }
        });
    }

    suggestForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const titleInput = document.getElementById("suggest-input-title");
        const msgInput = document.getElementById("suggest-input-message");
        const submitBtn = document.getElementById("btn-submit-suggestion");

        const title = titleInput ? titleInput.value.trim() : "";
        const description = msgInput ? msgInput.value.trim() : "";

        if (!title || !description) {
            showToast("Please fill in all required fields.");
            return;
        }

        const geojsonFeatures = [];

        // Markers
        markers.forEach((coord) => {
            geojsonFeatures.push({
                type: "Feature",
                properties: { kind: "marker" },
                geometry: {
                    type: "Point",
                    coordinates: coord
                }
            });
        });

        // Lines
        lines.forEach((line) => {
            if (line && line.length >= 2) {
                geojsonFeatures.push({
                    type: "Feature",
                    properties: { kind: "line" },
                    geometry: {
                        type: "LineString",
                        coordinates: line
                    }
                });
            }
        });

        // Polygons
        polygons.forEach((poly) => {
            if (poly && poly.length >= 3) {
                const ring = [...poly, poly[0]];
                geojsonFeatures.push({
                    type: "Feature",
                    properties: { kind: "polygon" },
                    geometry: {
                        type: "Polygon",
                        coordinates: [ring]
                    }
                });
            }
        });

        const selectionLabel = getSuggestSelectionLabel();
        let submittedTitle = title;
        if (selectionLabel) {
            if (!title.toLowerCase().startsWith(selectionLabel.toLowerCase())) {
                submittedTitle = `${selectionLabel} - ${title}`;
            }
        }

        const payload = {
            title: submittedTitle,
            description: description,
            geojson: {
                type: "FeatureCollection",
                features: geojsonFeatures
            }
        };

        const ENDPOINT_URL = "https://script.google.com/macros/s/AKfycbz7MxHqTniRl88_VFM7FOdbOwD0jt7AfSZ4v3fMB6sJLIeNseFdFJFoWQnA3RysLFiY_w/exec";

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Submitting...</span>`;
        }

        try {
            await fetch(ENDPOINT_URL, {
                method: "POST",
                mode: "no-cors",
                headers: {
                    "Content-Type": "text/plain;charset=utf-8"
                },
                body: JSON.stringify(payload)
            });

            showToast("Suggestion submitted! Thank you for your feedback.");

            if (titleInput) titleInput.value = "";
            if (msgInput) msgInput.value = "";

            clearAllAnnotations(true);
            updateSuggestLockState();

            if (closeAllModals) closeAllModals();
        } catch (error) {
            console.error("Failed to submit suggestion:", error);
            showToast("Failed to submit suggestion. Please try again.");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<span>Submit</span>`;
            }
        }
    });
}
