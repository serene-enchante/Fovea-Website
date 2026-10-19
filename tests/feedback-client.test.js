import assert from 'node:assert/strict';
import test from 'node:test';

import { sendFeedbackRequest } from '../scripts/services/feedback-client.js';

test('sends feedback with the deployed Apps Script request contract', async () => {
    const payload = {
        title: 'Zone 19A - Boundary correction',
        description: 'The eastern edge should follow the river.',
        geojson: { type: 'FeatureCollection', features: [] }
    };
    let request;
    const response = { type: 'opaque' };
    const result = await sendFeedbackRequest(payload, {
        fetchImpl: async (...args) => {
            request = args;
            return response;
        }
    });

    assert.equal(result, response);
    assert.equal(request[0], 'https://script.google.com/macros/s/AKfycbz7MxHqTniRl88_VFM7FOdbOwD0jt7AfSZ4v3fMB6sJLIeNseFdFJFoWQnA3RysLFiY_w/exec');
    assert.equal(request[1].method, 'POST');
    assert.equal(request[1].mode, 'no-cors');
    assert.equal(request[1].headers['Content-Type'], 'text/plain;charset=utf-8');
    assert.deepEqual(JSON.parse(request[1].body), payload);
});
