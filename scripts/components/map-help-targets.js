export function tagHelpElements(helpContent, documentObject = globalThis.document) {
    helpContent.forEach(item => {
        const elements = documentObject.querySelectorAll(item.selector);
        elements.forEach(element => {
            element.setAttribute('data-help-title', item.title);
            element.setAttribute('data-help-desc', item.desc);
            if (item.shortcut) {
                element.setAttribute('data-help-shortcut', item.shortcut);
            } else {
                element.removeAttribute('data-help-shortcut');
            }
        });
    });
}

export function resolveHelpTarget(eventTarget, helpContent) {
    let target = eventTarget.closest('[data-help-title]');
    let title = target ? target.getAttribute('data-help-title') : null;
    let desc = target ? target.getAttribute('data-help-desc') : null;
    let shortcut = target ? target.getAttribute('data-help-shortcut') : null;

    if (!target) {
        for (const item of helpContent) {
            const matched = eventTarget.closest(item.selector);
            if (!matched) continue;
            target = matched;
            title = item.title;
            desc = item.desc;
            shortcut = item.shortcut || null;
            target.setAttribute('data-help-title', title);
            target.setAttribute('data-help-desc', desc);
            if (shortcut) target.setAttribute('data-help-shortcut', shortcut);
            break;
        }
    }

    if (target && (target.id === 'tile-map' || target.id === 'map-wrapper' || title === 'Map Frame')
        && eventTarget.closest('.map-ctrl-container, .map-ctrl-panel')) {
        return { target: null, title: null, desc: null, shortcut: null };
    }

    return { target, title, desc, shortcut };
}
