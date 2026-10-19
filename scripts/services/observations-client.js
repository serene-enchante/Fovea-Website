import { runWithRequestTimeout } from './request-timeout.js';

const INATURALIST_API = 'https://api.inaturalist.org/v1';

export function cleanTaxonName(birdName) {
    if (!birdName) return '';
    let clean = birdName.trim();
    if (clean.includes('(')) clean = clean.split('(')[0].trim();
    if (clean.includes('&')) clean = clean.split('&')[0].trim();
    if (clean.includes('/')) clean = clean.split('/')[0].trim();
    return clean || birdName;
}

function buildObservationsUrl(queryKey, encodedName, [[swlng, swlat], [nelng, nelat]]) {
    return `${INATURALIST_API}/observations?${queryKey}=${encodedName}&nelat=${nelat}&nelng=${nelng}&swlat=${swlat}&swlng=${swlng}&per_page=100&order=desc&order_by=observed_on`;
}

export async function fetchBirdObservations(birdName, bounds, { fetchImpl = fetch, signal, timeoutMs } = {}) {
    const encodedName = encodeURIComponent(cleanTaxonName(birdName));
    let { data } = await runWithRequestTimeout(async requestSignal => {
        const response = await fetchImpl(buildObservationsUrl('taxon_name', encodedName, bounds), { signal: requestSignal });
        const data = response.ok ? await response.json() : null;
        return { data };
    }, { signal, timeoutMs });

    if (!data || !data.results || data.results.length === 0) {
        ({ data } = await runWithRequestTimeout(async requestSignal => {
            const response = await fetchImpl(buildObservationsUrl('q', encodedName, bounds), { signal: requestSignal });
            const data = response.ok ? await response.json() : null;
            return { data };
        }, { signal, timeoutMs }));
        if (data?.results?.length) return data;
    }

    if (!data) throw new Error('Failed to fetch observations');
    return data;
}

export async function fetchTaxonDefaultPhoto(birdName, { fetchImpl = fetch, signal, timeoutMs } = {}) {
    const encodedName = encodeURIComponent(cleanTaxonName(birdName));
    try {
        return await runWithRequestTimeout(async requestSignal => {
            const response = await fetchImpl(`${INATURALIST_API}/taxa?q=${encodedName}`, { signal: requestSignal });
            if (!response.ok) return null;
            const data = await response.json();
            return data?.results?.[0]?.default_photo || null;
        }, { signal, timeoutMs });
    } catch {
        return null;
    }
}
