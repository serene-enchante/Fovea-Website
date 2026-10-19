function activeProviderFor(baseLayer) {
    return ['satellite', 'esri-street', 'esri-topo'].includes(baseLayer) ? 'esri' : 'carto';
}

function providerForError(event) {
    const sourceId = String(event?.sourceId || '').toLowerCase();
    const message = String(event?.error?.message || event?.message || '').toLowerCase();
    const url = String(event?.error?.url || event?.url || '').toLowerCase();

    if (sourceId.includes('esri') || sourceId.includes('satellite-tiles')
        || url.includes('arcgisonline.com') || url.includes('esri.com')) return 'esri';
    if (sourceId.includes('dark-tiles') || url.includes('cartocdn.com')) return 'carto';
    if (url.includes('basemaps.cartocdn.com')) return 'carto';

    // Style request errors often expose only the URL in the message.
    if (message.includes('basemaps.cartocdn.com')) return 'carto';
    return null;
}

const PROVIDER_MESSAGES = Object.freeze({
    carto: 'The default basemap is unavailable. Check your connection or choose another basemap.',
    esri: 'The selected Esri basemap is unavailable. Check your connection or choose another basemap.'
});

export function createMapProviderErrorHandler({ getActiveBaseLayer, notify }) {
    const notifiedProviders = new Set();

    return event => {
        const provider = providerForError(event);
        if (!provider || provider !== activeProviderFor(getActiveBaseLayer())) return;
        if (notifiedProviders.has(provider)) return;

        notifiedProviders.add(provider);
        notify(PROVIDER_MESSAGES[provider], true);
    };
}
