import assert from 'node:assert/strict';
import test from 'node:test';
import { openImageLightbox, setupImageLightbox } from '../scripts/components/image-lightbox.js';

function createLightboxHarness() {
    const attributes = new Map([['aria-hidden', 'true']]);
    const classes = new Set();
    const listeners = new Map();
    const modal = {
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name)
        },
        setAttribute: (name, value) => attributes.set(name, value),
        getAttribute: name => attributes.get(name),
        querySelectorAll: () => [{ addEventListener: (name, handler) => listeners.set(name, handler) }]
    };
    const image = { style: {} };
    const text = { style: {} };
    const credit = { style: {} };
    return {
        modal, image, text, credit, classes, attributes, listeners,
        documentObject: {
            getElementById: id => ({
                'image-lightbox-modal': modal,
                'lightbox-img': image,
                'lightbox-text': text,
                'lightbox-credit': credit
            })[id] || null,
            addEventListener: (name, handler) => listeners.set(name, handler)
        }
    };
}

test('opens the lightbox with image, caption, and credit content', () => {
    const harness = createLightboxHarness();
    openImageLightbox('/photo.jpg', 'Osprey', 'Seen near the river', 'Photo by Ada', harness.documentObject);
    assert.equal(harness.image.src, '/photo.jpg');
    assert.equal(harness.image.alt, 'Osprey');
    assert.equal(harness.text.textContent, 'Seen near the river');
    assert.equal(harness.text.style.display, 'block');
    assert.equal(harness.credit.textContent, 'Photo by Ada');
    assert.equal(harness.attributes.get('aria-hidden'), 'false');
    assert.equal(harness.classes.has('is-open'), true);
});

test('closes from a close control and the Escape key', () => {
    const harness = createLightboxHarness();
    harness.attributes.set('aria-hidden', 'false');
    harness.classes.add('is-open');
    setupImageLightbox({ documentObject: harness.documentObject });
    let stopped = false;

    harness.listeners.get('click')({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.equal(harness.attributes.get('aria-hidden'), 'true');
    assert.equal(harness.classes.has('is-open'), false);

    harness.attributes.set('aria-hidden', 'false');
    harness.classes.add('is-open');
    harness.listeners.get('keydown')({ key: 'Escape' });
    assert.equal(harness.attributes.get('aria-hidden'), 'true');
    assert.equal(harness.classes.has('is-open'), false);
});
