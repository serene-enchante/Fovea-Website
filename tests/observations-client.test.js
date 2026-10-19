import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTaxonName, fetchBirdObservations, fetchTaxonDefaultPhoto } from '../scripts/services/observations-client.js';

const bounds = [[-123.5, 44.0], [-123.0, 44.5]];
const response = (body, ok = true) => ({ ok, json: async () => body });

test('cleans compound bird names for iNaturalist taxon search', () => {
    assert.equal(cleanTaxonName('Sparrow (western) & eastern / local'), 'Sparrow');
    assert.equal(cleanTaxonName('  Osprey  '), 'Osprey');
});

test('fetches observations by taxon name and retries with the text query when empty', async () => {
    const urls = [];
    const fetchImpl = async url => {
        urls.push(url);
        return response(url.includes('taxon_name=') ? { results: [] } : { results: [{ id: 7 }] });
    };

    const data = await fetchBirdObservations('Osprey', bounds, { fetchImpl });

    assert.deepEqual(data.results, [{ id: 7 }]);
    assert.equal(urls.length, 2);
    assert.match(urls[0], /observations\?taxon_name=Osprey&nelat=44\.5&nelng=-123&swlat=44&swlng=-123\.5/);
    assert.match(urls[1], /observations\?q=Osprey/);
});

test('forwards cancellation to both observation queries and taxon photo requests', async () => {
    const controller = new AbortController();
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        if (url.includes('/observations?taxon_name=')) return response({ results: [] });
        if (url.includes('/observations?q=')) return response({ results: [{ id: 8 }] });
        return response({ results: [{ default_photo: null }] });
    };

    await fetchBirdObservations('Osprey', bounds, { fetchImpl, signal: controller.signal });
    await fetchTaxonDefaultPhoto('Osprey', { fetchImpl, signal: controller.signal });

    assert.equal(calls.length, 3);
    assert.ok(calls.every(call => call.options.signal instanceof AbortSignal));
});

test('throws if both observation queries fail and returns the default taxon photo when available', async () => {
    await assert.rejects(
        fetchBirdObservations('Osprey', bounds, { fetchImpl: async () => response({}, false) }),
        /Failed to fetch observations/
    );

    const photo = { medium_url: 'https://example.test/photo.jpg' };
    const result = await fetchTaxonDefaultPhoto('Osprey', {
        fetchImpl: async () => response({ results: [{ default_photo: photo }] })
    });
    assert.equal(result, photo);
});
