import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mapPagePath = new URL('../maps/index.html', import.meta.url);
const mapScriptPath = new URL('../scripts/maps-tile.js', import.meta.url);

test('the map page loads the map application as an ES module', async () => {
    const page = await readFile(mapPagePath, 'utf8');

    assert.match(page, /<script type="module" src="\.\.\/scripts\/maps-tile\.js\?v=247"><\/script>/);
    assert.match(page, /maplibre-gl\.js/);
    assert.match(page, /turf\.min\.js/);
});

test('the map application uses the shared GeoJSON repository', async () => {
    const source = await readFile(mapScriptPath, 'utf8');

    assert.match(source, /import \{ loadGeoDataset \} from '\.\/services\/geo-data-repository\.js';/);
    assert.match(source, /state\.allFeatures = await loadFeaturesForMapView\(initialFeature\);/);
    assert.match(source, /targetFeatures = await loadFeaturesForMapView\(featureName\);/);
    assert.match(source, /import \{ findPointInsidePolygon, getBbox \} from '\.\/utils\/geometry-math\.js';/);
    assert.match(source, /import \{ displayZoneId, formatArea, formatDate, normalizeZoneId, zoneImagePath \} from '\.\/utils\/format-utils\.js';/);
    assert.match(source, /import \{ darkenHexColor, getThemeAccent, getThemeAccentLight, hexToRgba \} from '\.\/utils\/color-utils\.js';/);
});

test('the map application uses the shared suggested-app configuration', async () => {
    const source = await readFile(mapScriptPath, 'utf8');

    assert.match(source, /import \{ resolveAppInstructionConfig \} from '\.\/services\/app-instruction-config\.js';/);
    assert.doesNotMatch(source, /const APP_FORMAT_PREFERENCES =/);
    assert.doesNotMatch(source, /const APP_INSTRUCTION_CONFIGS =/);
});
