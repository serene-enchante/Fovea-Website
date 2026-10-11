import assert from 'node:assert/strict';
import test from 'node:test';

import { getQrCodeImageUrl, loadQrCodeImage } from '../scripts/services/qr-image-service.js';

test('builds an escaped QR service URL', () => {
    assert.equal(
        getQrCodeImageUrl('https://example.com/maps/?feature=eugene&zone=04'),
        'https://api.qrserver.com/v1/create-qr-code/?size=350x350&format=png&data=https%3A%2F%2Fexample.com%2Fmaps%2F%3Ffeature%3Deugene%26zone%3D04'
    );
});

test('loads a QR image through an injected browser image constructor', async () => {
    class FakeImage {
        set src(value) {
            this.loadedUrl = value;
            this.onload();
        }
    }

    const image = await loadQrCodeImage('https://example.com/maps/', {
        ImageConstructor: FakeImage,
        setTimeoutFn: () => 0
    });

    assert.equal(image.crossOrigin, 'anonymous');
    assert.match(image.loadedUrl, /data=https%3A%2F%2Fexample\.com%2Fmaps%2F/);
});
