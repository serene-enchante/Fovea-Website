import assert from 'node:assert/strict';
import test from 'node:test';

import { createMapProviderErrorHandler } from '../scripts/map/map-provider-errors.js';

test('reports a deduplicated CARTO error only while the CARTO basemap is active', () => {
    let activeBaseLayer = 'satellite';
    const messages = [];
    const handleError = createMapProviderErrorHandler({
        getActiveBaseLayer: () => activeBaseLayer,
        notify: (...args) => messages.push(args)
    });
    const cartoError = { sourceId: 'dark-tiles', error: new Error('tile failed') };

    handleError(cartoError);
    activeBaseLayer = 'default';
    handleError(cartoError);
    handleError(cartoError);

    assert.equal(messages.length, 1);
    assert.match(messages[0][0], /default basemap is unavailable/i);
    assert.equal(messages[0][1], true);
});

test('reports Esri failures, but ignores unknown and inactive provider errors', () => {
    let activeBaseLayer = 'esri-topo';
    const messages = [];
    const handleError = createMapProviderErrorHandler({
        getActiveBaseLayer: () => activeBaseLayer,
        notify: message => messages.push(message)
    });

    handleError({ sourceId: 'esri-topo-tiles', error: new Error('tile failed') });
    handleError({ sourceId: 'satellite-tiles', error: new Error('another tile failed') });
    activeBaseLayer = 'default';
    handleError({ sourceId: 'unrelated-source', error: new Error('unrelated failure') });

    assert.equal(messages.length, 1);
    assert.match(messages[0], /Esri basemap is unavailable/i);
});
