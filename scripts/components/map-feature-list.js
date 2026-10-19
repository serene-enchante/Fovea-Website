import { CIRCLE_ID } from '../config/app-config.js';
import { displayZoneId, normalizeZoneId, zoneImagePath } from '../utils/format-utils.js';

const NO_DATA_CIRCLES = new Set(['Oakridge', 'Cottage Grove']);

export function renderMapFeatureList(listContainer, {
    features = [],
    isCirclesFeature = false,
    map = null,
    currentId = CIRCLE_ID,
    onSelectCircle = () => {},
    onSelectZone = () => {},
    documentObject = globalThis.document
}) {
    if (!listContainer || !documentObject) return;

    if (isCirclesFeature) {
        const sortedCircles = [...features].sort((a, b) => {
            const cidA = String(a.properties?.cid || '');
            const cidB = String(b.properties?.cid || '');
            const noDataA = NO_DATA_CIRCLES.has(cidA) ? 1 : 0;
            const noDataB = NO_DATA_CIRCLES.has(cidB) ? 1 : 0;
            if (noDataA !== noDataB) return noDataA - noDataB;
            return cidA.localeCompare(cidB, undefined, { sensitivity: 'base' });
        });

        sortedCircles.forEach(feature => {
            const props = feature.properties || {};
            const cid = props.cid || 'Circle';
            const item = documentObject.createElement('div');
            item.className = 'tile-zone-item';
            item.setAttribute('data-id', cid);

            let thumbImg = '';
            let isLogo = false;
            const isNotAvailable = NO_DATA_CIRCLES.has(cid);
            if (cid === 'Eugene') {
                thumbImg = '../images/logo-small.png';
                isLogo = true;
            } else if (cid === 'Florence') {
                thumbImg = '../images/florence.png';
                isLogo = true;
            } else if (!isNotAvailable) {
                thumbImg = '../images/wetlands.webp';
            }

            const thumbHtml = isNotAvailable
                ? `<div class="tile-zone-item__thumb-placeholder" title="No data available"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg></div>`
                : `<div class="tile-zone-item__thumb ${isLogo ? 'tile-zone-item__thumb--logo' : ''}"><img src="${thumbImg}" alt="${cid}" loading="eager"></div>`;

            item.innerHTML = `${thumbHtml}<div class="tile-zone-item__info"><div class="tile-zone-item__title">${cid}</div></div>`;
            item.addEventListener('mouseenter', () => {
                if (map?.getSource('zones')) map.setFeatureState({ source: 'zones', id: cid }, { hover: true });
            });
            item.addEventListener('mouseleave', () => {
                if (map?.getSource('zones')) map.setFeatureState({ source: 'zones', id: cid }, { hover: false });
            });
            item.addEventListener('click', () => onSelectCircle(cid, feature));
            listContainer.appendChild(item);
        });
        return;
    }

    const sortedFeatures = [...features].sort((a, b) => {
        const zidA = String(a.properties?.zid || '');
        const zidB = String(b.properties?.zid || '');
        return zidA.localeCompare(zidB, undefined, { numeric: true, sensitivity: 'base' });
    });

    sortedFeatures.forEach(feature => {
        const props = feature.properties || {};
        const zid = displayZoneId(props.zid);
        const featureId = String(props.zid || '');
        const item = documentObject.createElement('div');
        item.className = 'tile-zone-item';
        item.setAttribute('data-id', featureId);
        item.innerHTML = `<div class="tile-zone-item__thumb"><img src="${zoneImagePath(props.zid)}" alt="Zone ${zid}" loading="eager"></div><div class="tile-zone-item__info"><div class="tile-zone-item__title">Zone ${zid}</div></div>`;

        const img = item.querySelector('img');
        if (img) img.addEventListener('error', () => { img.src = '../images/wetlands.webp'; });

        const isSelected = () => currentId !== CIRCLE_ID && (featureId === currentId || normalizeZoneId(featureId) === normalizeZoneId(currentId));
        item.addEventListener('mouseenter', () => {
            if (!isSelected() && map?.getSource('zones')) map.setFeatureState({ source: 'zones', id: featureId }, { hover: true });
        });
        item.addEventListener('mouseleave', () => {
            if (!isSelected() && map?.getSource('zones')) map.setFeatureState({ source: 'zones', id: featureId }, { hover: false });
        });
        item.addEventListener('click', () => onSelectZone(featureId));
        listContainer.appendChild(item);
    });
}
