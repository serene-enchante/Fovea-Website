import { state } from '../state.js';
import { showToast } from './toast-view.js';

export function setupSuggestFormAndDrawing(closeAllModals) {
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
