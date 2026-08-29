import { state } from '../state.js';
import { unhighlightTileItem, highlightTileItem } from '../components/sidebar-list.js';
import { switchToFeature, selectSubject } from './map-selection.js';
import { showToast } from '../components/toast-view.js';
import { CIRCLE_ID } from '../config/app-config.js';

let hoverEventsAttached = false;

export function setupMapHoverEvents() {
    if (hoverEventsAttached) return;
    hoverEventsAttached = true;

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
                        try {
                            state.map.setFeatureState({ source: 'zones', id: id }, { hover: false, hoverAlpha: 0 });
                        } catch (e) {}
                        return;
                    }
                } else {
                    activeHoverAlphas[id] = next;
                    animNeeded = true;
                }

                const alphaToSet = activeHoverAlphas[id] || 0.0;
                try {
                    state.map.setFeatureState({ source: 'zones', id: id }, { 
                        hover: alphaToSet > 0.01,
                        hoverAlpha: alphaToSet
                    });
                } catch (e) {}
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
                    try {
                        state.map.setFeatureState({ source: 'zones', id: prevId }, { hover: false, hoverAlpha: 0 });
                    } catch (e) {}
                    delete activeHoverAlphas[prevId];
                }
            });
            if (hoveredStateId && hoveredStateId !== newId) {
                try {
                    state.map.setFeatureState({ source: 'zones', id: hoveredStateId }, { hover: false, hoverAlpha: 0 });
                } catch (e) {}
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
                        switchToFeature("eugene");
                    } else if (props.cid === "Florence") {
                        switchToFeature("florence");
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
