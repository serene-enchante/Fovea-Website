const PLACE_LAYERS_FOR_FILTER = [
    'place_city_r5',
    'place_city_r6',
    'place_town',
    'place_villages',
    'place_suburbs',
    'place_hamlet',
    'place_city_dot_r7',
    'place_city_dot_r4',
    'place_city_dot_r2',
    'place_city_dot_z7',
    'place_capital_dot_z7'
];

const CIRCLE_PLACE_NAME_EXCLUSION = [
    'all',
    ['match', ['get', 'name'], 'Eugene', false, 'Florence', false, 'Cottage Grove', false, 'Oakridge', false, true],
    ['match', ['get', 'name_en'], 'Eugene', false, 'Florence', false, 'Cottage Grove', false, 'Oakridge', false, true]
];

export function toExpression(filter) {
    if (!filter) return null;
    if (!Array.isArray(filter)) return filter;

    const operator = filter[0];
    if (operator === 'all' || operator === 'any' || operator === 'none') {
        return [operator, ...filter.slice(1).map(toExpression)];
    }

    // Already a MapLibre expression, such as ['==', ['get', 'class'], 'city'].
    if (Array.isArray(filter[1])) return filter;

    const key = filter[1];
    if (['==', '!=', '>', '>=', '<', '<='].includes(operator)) {
        return [operator, ['get', key], filter[2]];
    }
    if (operator === 'has') return ['has', key];
    if (operator === '!has') return ['!', ['has', key]];
    if (operator === 'in') return ['in', ['get', key], ['literal', filter.slice(2)]];
    if (operator === '!in') return ['!', ['in', ['get', key], ['literal', filter.slice(2)]]];

    return filter;
}

export function createPlaceLabelFilterController(mapState) {
    let originalPlaceFilters = null;
    let lastHiddenCircleNames = null;

    function reset() {
        originalPlaceFilters = null;
        lastHiddenCircleNames = null;
    }

    function updatePlaceLabelsFilter() {
        if (!mapState.map) return;

        if (originalPlaceFilters === null) {
            originalPlaceFilters = {};
            let foundAny = false;
            PLACE_LAYERS_FOR_FILTER.forEach(layerId => {
                if (mapState.map.getLayer(layerId)) {
                    originalPlaceFilters[layerId] = mapState.map.getFilter(layerId) || null;
                    foundAny = true;
                }
            });

            if (!foundAny) {
                // Style layers are not available yet; retry on the next update.
                originalPlaceFilters = null;
                return;
            }
        }

        const isCirclesView = !!(mapState.isCirclesFeature || mapState.currentFeature === 'circles');
        if (lastHiddenCircleNames === isCirclesView) return;
        lastHiddenCircleNames = isCirclesView;

        console.log('Applying duplicate circles filter. Hide circle names:', isCirclesView);
        Object.keys(originalPlaceFilters).forEach(layerId => {
            if (!mapState.map.getLayer(layerId)) return;

            const originalFilter = toExpression(originalPlaceFilters[layerId]);
            if (isCirclesView) {
                let filteredExpression;
                if (!originalFilter) {
                    filteredExpression = CIRCLE_PLACE_NAME_EXCLUSION;
                } else if (originalFilter[0] === 'all') {
                    filteredExpression = [...originalFilter, ...CIRCLE_PLACE_NAME_EXCLUSION.slice(1)];
                } else {
                    filteredExpression = ['all', originalFilter, ...CIRCLE_PLACE_NAME_EXCLUSION.slice(1)];
                }
                mapState.map.setFilter(layerId, filteredExpression);
            } else {
                mapState.map.setFilter(layerId, originalFilter === null ? undefined : originalFilter);
            }
        });
    }

    return { reset, updatePlaceLabelsFilter };
}
