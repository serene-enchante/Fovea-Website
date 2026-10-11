import assert from 'node:assert/strict';
import test from 'node:test';

import { APP_STORE_URLS, getAppStoreUrl, normalizeAppKey } from '../scripts/services/app-launch-service.js';

test('normalizes supported app names before resolving a store URL', () => {
    assert.equal(normalizeAppKey('Gaia GPS'), 'gaiagps');
    assert.equal(normalizeAppKey('Avenza Maps'), 'avenzamaps');
});

test('uses iOS or Android store URLs and falls back safely', () => {
    assert.equal(
        getAppStoreUrl('gaia', 'Mozilla/5.0 (iPhone)'),
        APP_STORE_URLS.gaia.ios
    );
    assert.equal(
        getAppStoreUrl('Gaia GPS', 'Mozilla/5.0 (Linux; Android 14)'),
        APP_STORE_URLS.gaia.android
    );
    assert.equal(getAppStoreUrl('unknown', ''), APP_STORE_URLS.avenza.ios);
});
