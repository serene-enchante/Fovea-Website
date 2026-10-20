import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { renderMapStyleBundle } from '../scripts/build-map-css.js';

const stylesDirectory = new URL('../styles/', import.meta.url);

test('map stylesheet entry imports ordered partials under the soft size limit', async () => {
    const entry = await readFile(new URL('page-maps-tile.css', stylesDirectory), 'utf8');
    const imports = [...entry.matchAll(/^@import url\('\.\/([^']+)'\);$/gm)].map((match) => match[1]);

    assert.equal(imports.length, 12);
    assert.match(imports[0], /-layout\.css$/);
    assert.match(imports.at(-2), /-light\.css$/);
    assert.match(imports.at(-1), /-light-components\.css$/);
    assert.equal(entry.trim().split('\n').length, imports.length, 'entry contains imports only');

    for (const file of imports) {
        const partial = await readFile(new URL(file, stylesDirectory), 'utf8');
        assert.ok(partial.split('\n').length <= 1000, `${file} should stay below 1,000 lines`);
    }

    const bundle = await readFile(new URL('page-maps-tile.bundle.css', stylesDirectory), 'utf8');
    assert.equal(bundle, await renderMapStyleBundle(stylesDirectory), 'generated bundle must match the ordered sources');
});
