import { highlightTileItem, unhighlightTileItem } from '../components/sidebar-list.js';

export function setupMapHoverEvents({ map, state, onFeatureClick }) {
    if (!map || state._zoneEventsAttached) return;
    state._zoneEventsAttached = true;

    let hoveredStateId = null;
    const activeHoverAlphas = {};
    let hoverAnimationRaf = null;

    function updateHoverAlphas() {
        let animationNeeded = false;
        const allIds = new Set(Object.keys(activeHoverAlphas));
        if (hoveredStateId) allIds.add(hoveredStateId);

        allIds.forEach(id => {
            const target = id === hoveredStateId ? 1 : 0;
            const current = activeHoverAlphas[id] || 0;
            const next = current + (target - current) * 0.28;

            if (Math.abs(target - next) < 0.015) {
                activeHoverAlphas[id] = target;
                if (target === 0) {
                    delete activeHoverAlphas[id];
                    try { map.setFeatureState({ source: 'zones', id }, { hover: false, hoverAlpha: 0 }); } catch {}
                    return;
                }
            } else {
                activeHoverAlphas[id] = next;
                animationNeeded = true;
            }

            try {
                map.setFeatureState({ source: 'zones', id }, {
                    hover: activeHoverAlphas[id] > 0.01,
                    hoverAlpha: activeHoverAlphas[id]
                });
            } catch {}
        });

        if (animationNeeded) hoverAnimationRaf = requestAnimationFrame(updateHoverAlphas);
        else hoverAnimationRaf = null;
    }

    function setHoveredFeatureId(newId) {
        if (hoveredStateId === newId) return;
        Object.keys(activeHoverAlphas).forEach(previousId => {
            if (previousId === newId) return;
            try { map.setFeatureState({ source: 'zones', id: previousId }, { hover: false, hoverAlpha: 0 }); } catch {}
            delete activeHoverAlphas[previousId];
        });
        if (hoveredStateId && hoveredStateId !== newId) {
            try { map.setFeatureState({ source: 'zones', id: hoveredStateId }, { hover: false, hoverAlpha: 0 }); } catch {}
            unhighlightTileItem();
        }

        hoveredStateId = newId;
        state._hoveredFeatureId = newId;
        if (newId) {
            highlightTileItem(newId);
            map.getCanvas().style.cursor = 'pointer';
            activeHoverAlphas[newId] = 0;
        } else {
            map.getCanvas().style.cursor = '';
        }

        if (!hoverAnimationRaf) hoverAnimationRaf = requestAnimationFrame(updateHoverAlphas);
    }

    map.on('mousemove', 'zones-fill', event => {
        if (event.features?.length) setHoveredFeatureId(event.features[0].id);
    });
    map.on('mouseleave', 'zones-fill', () => setHoveredFeatureId(null));
    map.on('click', 'zones-fill', event => {
        const feature = event.features?.[0];
        if (!feature || feature.id == null) return;
        state.lastZoneClickTime = Date.now();
        onFeatureClick?.({ feature, featureId: String(feature.id) });
    });
}
