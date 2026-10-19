export function createDownloadWizardSelectionView({
    state,
    circles,
    onSelectCircle,
    onSelectZone,
    resolveAssetPath = path => path,
    escapeHtml = value => String(value ?? ''),
    documentObject = globalThis.document
}) {
    function setupSearchBars() {
        const circleInput = documentObject.getElementById('circle-search-input');
        const circleClear = documentObject.getElementById('circle-search-clear');
        if (circleInput) {
            circleInput.addEventListener('input', event => {
                const query = event.target.value.toLowerCase().trim();
                if (circleClear) circleClear.style.display = query ? 'flex' : 'none';
                const filtered = circles.filter(circle =>
                    circle.name.toLowerCase().includes(query) || circle.subtitle.toLowerCase().includes(query)
                );
                renderCirclesList(filtered);
            });
        }
        if (circleClear && circleInput) {
            circleClear.addEventListener('click', () => {
                circleInput.value = '';
                circleClear.style.display = 'none';
                circleInput.focus();
                renderCirclesList(circles);
            });
        }

        const zoneInput = documentObject.getElementById('zone-search-input');
        const zoneClear = documentObject.getElementById('zone-search-clear');
        if (zoneInput) {
            zoneInput.addEventListener('input', event => {
                const query = event.target.value.toLowerCase().trim();
                if (zoneClear) zoneClear.style.display = query ? 'flex' : 'none';
                filterZonesList(query);
            });
        }
        if (zoneClear && zoneInput) {
            zoneClear.addEventListener('click', () => {
                zoneInput.value = '';
                zoneClear.style.display = 'none';
                zoneInput.focus();
                filterZonesList('');
            });
        }
    }

    function renderCirclesList(filteredCircles) {
        const container = documentObject.getElementById('circle-cards-grid');
        if (!container) return;

        container.innerHTML = '';
        if (filteredCircles.length === 0) {
            container.innerHTML = '<div class="wizard-no-results">No count circles match your search.</div>';
            return;
        }

        filteredCircles.forEach(circle => {
            const card = documentObject.createElement('div');
            card.className = `wizard-item-card ${state.selectedCircle?.id === circle.id ? 'is-selected' : ''} ${!circle.hasData ? 'is-disabled' : ''}`;
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');

            const thumbHtml = circle.hasData
                ? `<div class="wizard-circle-thumb wizard-circle-thumb--logo"><img src="${resolveAssetPath(circle.thumbnail)}" alt="${escapeHtml(circle.name)}" loading="eager"></div>`
                : `<div class="wizard-circle-thumb wizard-circle-thumb--no-data" title="No data available"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg></div>`;

            card.innerHTML = `
                <div class="wizard-item-card__left">
                    ${thumbHtml}
                    <div class="wizard-item-card__info">
                        <h3 class="wizard-item-card__title">${escapeHtml(circle.name)}</h3>
                        <span class="wizard-item-card__desc">${escapeHtml(circle.subtitle)}</span>
                    </div>
                </div>
                <div class="wizard-item-card__arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
            `;

            card.addEventListener('click', () => onSelectCircle(circle));
            card.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectCircle(circle);
                }
            });
            container.appendChild(card);
        });
    }

    function renderZonesList(features) {
        const container = documentObject.getElementById('zone-cards-grid');
        const circleNameEl = documentObject.getElementById('step-2-circle-name');
        if (circleNameEl && state.selectedCircle) circleNameEl.textContent = state.selectedCircle.name;

        const fullCircleCard = documentObject.getElementById('btn-download-full-circle');
        if (fullCircleCard) fullCircleCard.onclick = () => onSelectZone(null);
        if (!container) return;

        container.innerHTML = '';
        if (features.length === 0) {
            container.innerHTML = '<div class="wizard-no-results">No zones available for this circle.</div>';
            return;
        }

        features.forEach(feature => {
            const zid = feature.properties?.zid || '0';
            const displayZid = String(zid).padStart(2, '0');
            const card = documentObject.createElement('div');
            card.className = 'wizard-item-card';
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.dataset.zid = displayZid;
            card.innerHTML = `
                <div class="wizard-item-card__left">
                    <div class="wizard-item-card__info">
                        <h3 class="wizard-item-card__title">Zone ${displayZid}</h3>
                    </div>
                </div>
                <div class="wizard-item-card__arrow">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </div>
            `;
            card.addEventListener('click', () => onSelectZone(feature));
            card.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectZone(feature);
                }
            });
            container.appendChild(card);
        });
    }

    function filterZonesList(query) {
        const cards = documentObject.querySelectorAll('#zone-cards-grid .wizard-item-card');
        let visibleCount = 0;
        cards.forEach(card => {
            const zid = card.dataset.zid || '';
            const title = `zone ${zid}`.toLowerCase();
            if (title.includes(query) || zid.includes(query)) {
                card.style.display = 'flex';
                visibleCount += 1;
            } else {
                card.style.display = 'none';
            }
        });

        let noResultsEl = documentObject.querySelector('#zone-cards-grid .wizard-no-results');
        if (visibleCount === 0) {
            if (!noResultsEl) {
                noResultsEl = documentObject.createElement('div');
                noResultsEl.className = 'wizard-no-results';
                noResultsEl.textContent = 'No zones match your search.';
                documentObject.getElementById('zone-cards-grid').appendChild(noResultsEl);
            }
        } else if (noResultsEl) {
            noResultsEl.remove();
        }
    }

    return { setupSearchBars, renderCirclesList, renderZonesList, filterZonesList };
}
