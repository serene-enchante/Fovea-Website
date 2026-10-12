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

export async function fetchBirdObservations(birdName, bounds, { fetchImpl = fetch } = {}) {
    const encodedName = encodeURIComponent(cleanTaxonName(birdName));
    let response = await fetchImpl(buildObservationsUrl('taxon_name', encodedName, bounds));
    let data = response.ok ? await response.json() : null;

    if (!data || !data.results || data.results.length === 0) {
        response = await fetchImpl(buildObservationsUrl('q', encodedName, bounds));
        if (response.ok) {
            const fallbackData = await response.json();
            if (fallbackData?.results?.length) data = fallbackData;
        }
    }

    if (!data) throw new Error('Failed to fetch observations');
    return data;
}

export async function fetchTaxonDefaultPhoto(birdName, { fetchImpl = fetch } = {}) {
    const encodedName = encodeURIComponent(cleanTaxonName(birdName));
    try {
        const response = await fetchImpl(`${INATURALIST_API}/taxa?q=${encodedName}`);
        if (!response.ok) return null;
        const data = await response.json();
        return data?.results?.[0]?.default_photo || null;
    } catch {
        return null;
    }
}
