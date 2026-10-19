import { state } from '../state.js';
import { showToast } from './toast-view.js';
import { displayZoneId, normalizeZoneId } from '../utils/format-utils.js';
import { CIRCLE_ID } from '../config/app-config.js';
import { buildSuggestionFeatureCollection } from '../services/suggestion-annotations.js';
import { sendFeedbackRequest } from '../services/feedback-client.js';
import { setupSuggestionDrawingController } from './suggestion-drawing-controller.js';

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
    const suggestForm = document.getElementById("suggest-form");
    if (!suggestForm) return;

    const {
        finalizePendingDrawing,
        clearAllAnnotations,
        getAnnotations
    } = setupSuggestionDrawingController({ closeAllModals, getSuggestSelectionLabel });

    const submitBtnEl = document.getElementById("btn-submit-suggestion");
    if (submitBtnEl) {
        submitBtnEl.addEventListener("click", () => finalizePendingDrawing());
    }

    suggestForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        finalizePendingDrawing();
        const titleInput = document.getElementById("suggest-input-title");
        const msgInput = document.getElementById("suggest-input-message");
        const submitBtn = document.getElementById("btn-submit-suggestion");

        const title = titleInput ? titleInput.value.trim() : "";
        const description = msgInput ? msgInput.value.trim() : "";

        if (!title || !description) {
            showToast("Please fill in all required fields.");
            return;
        }

        const suggestionGeoJSON = buildSuggestionFeatureCollection(getAnnotations());

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
            geojson: suggestionGeoJSON
        };

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Submitting...</span>`;
        }

        try {
            await sendFeedbackRequest(payload);

            showToast("Suggestion request sent. Thank you for your feedback.");

            if (titleInput) titleInput.value = "";
            if (msgInput) msgInput.value = "";

            clearAllAnnotations(true);

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
