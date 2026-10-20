import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { renderMapStyleBundle } from '../scripts/build-map-css.js';

const stylesDirectory = new URL('../styles/', import.meta.url);

test('map stylesheet entry imports ordered partials under the soft size limit', async () => {
    const entry = await readFile(new URL('page-maps-tile.css', stylesDirectory), 'utf8');
    const imports = [...entry.matchAll(/^@import url\('\.\/([^']+)'\);$/gm)].map((match) => match[1]);

    assert.equal(imports.length, 10);
    assert.match(imports[0], /-layout\.css$/);
    assert.equal(entry.trim().split('\n').length, imports.length, 'entry contains imports only');

    const themeEntry = await readFile(new URL('page-maps-tile-theme.css', stylesDirectory), 'utf8');
    const themeImports = [...themeEntry.matchAll(/^@import url\('\.\/([^']+)'\);$/gm)].map((match) => match[1]);
    assert.deepEqual(themeImports, ['page-maps-tile-light.css', 'page-maps-tile-light-components.css']);
    assert.equal(themeEntry.trim().split('\n').length, themeImports.length, 'theme entry contains imports only');

    for (const file of [...imports, ...themeImports]) {
        const partial = await readFile(new URL(file, stylesDirectory), 'utf8');
        assert.ok(partial.split('\n').length <= 1000, `${file} should stay below 1,000 lines`);
    }

    const bundle = await readFile(new URL('page-maps-tile.bundle.css', stylesDirectory), 'utf8');
    assert.equal(bundle, await renderMapStyleBundle(stylesDirectory), 'generated bundle must match the ordered sources');
    const themeBundle = await readFile(new URL('page-maps-tile-theme.bundle.css', stylesDirectory), 'utf8');
    assert.equal(themeBundle, await renderMapStyleBundle(stylesDirectory, 'page-maps-tile-theme.css'), 'generated theme bundle must match its ordered sources');
});
