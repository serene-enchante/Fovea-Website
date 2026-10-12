export function renderHelpTooltip(tooltip, { title, desc, shortcut }) {
    if (!tooltip) return;
    tooltip.innerHTML = `
        <div class="help-mode-tooltip__title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            <span>${title}</span>
        </div>
        <p class="help-mode-tooltip__desc">${desc}</p>
        ${shortcut ? `
            <div class="help-mode-tooltip__shortcut">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M18 12h.01M8 16h8"></path></svg>
                <span class="help-mode-tooltip__shortcut-label">Shortcut:</span>
                <span class="help-mode-tooltip__shortcut-val">${shortcut}</span>
            </div>
        ` : ""}
    `;
    tooltip.setAttribute('aria-hidden', 'false');
}

export function positionHelpTooltipAtPointer(tooltip, event, windowObject = globalThis.window) {
    if (!tooltip) return;
    const width = tooltip.offsetWidth || 240;
    const height = tooltip.offsetHeight || 80;
    let left = event.clientX + 15;
    let top = event.clientY + 15;
    if (left + width > windowObject.innerWidth - 10) left = event.clientX - width - 15;
    if (top + height > windowObject.innerHeight - 10) top = event.clientY - height - 15;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

export function positionHelpTooltipAtTarget(tooltip, target, windowObject = globalThis.window) {
    if (!tooltip) return;
    const rect = target.getBoundingClientRect();
    const width = tooltip.offsetWidth || 240;
    const height = tooltip.offsetHeight || 80;
    let left = rect.left + (rect.width / 2) - (width / 2);
    let top = rect.bottom + 10;
    if (left < 10) left = 10;
    if (left + width > windowObject.innerWidth - 10) left = windowObject.innerWidth - width - 10;
    if (top + height > windowObject.innerHeight - 10) top = rect.top - height - 10;
    if (top < 10) top = 10;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

export function highlightHelpTarget(highlight, target) {
    if (!highlight) return;
    const rect = target.getBoundingClientRect();
    const padding = 3;
    highlight.style.left = `${rect.left - padding}px`;
    highlight.style.top = `${rect.top - padding}px`;
    highlight.style.width = `${rect.width + padding * 2}px`;
    highlight.style.height = `${rect.height + padding * 2}px`;
    highlight.setAttribute('aria-hidden', 'false');
}

export function hideHelpTooltip(tooltip, highlight) {
    tooltip?.setAttribute('aria-hidden', 'true');
    highlight?.setAttribute('aria-hidden', 'true');
}
