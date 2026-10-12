import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mapPagePath = new URL('../maps/index.html', import.meta.url);
const mapEntryPath = new URL('../scripts/maps/entry.js', import.meta.url);
const mapScriptPath = new URL('../scripts/maps-tile.js', import.meta.url);

test('the map page loads the map application as an ES module', async () => {
    const page = await readFile(mapPagePath, 'utf8');

    assert.match(page, /<script type="module" src="\.\.\/scripts\/maps\/entry\.js\?v=247"><\/script>/);
    const entry = await readFile(mapEntryPath, 'utf8');
    assert.match(entry, /import '\.\.\/maps-tile\.js';/);
    assert.match(page, /maplibre-gl\.js/);
    assert.match(page, /turf\.min\.js/);
});

test('the map application uses the shared GeoJSON repository', async () => {
    const source = await readFile(mapScriptPath, 'utf8');

    assert.match(source, /import \{ state \} from '\.\/state\.js';/);
    assert.match(source, /Object\.assign\(state, \{/);
    assert.doesNotMatch(source, /const state = \{/);
    assert.match(source, /import \{ loadGeoDataset \} from '\.\/services\/geo-data-repository\.js';/);
    assert.match(source, /state\.allFeatures = await loadFeaturesForMapView\(initialFeature\);/);
    assert.match(source, /loadFeatures: loadFeaturesForMapView,/);
    const selectionController = await readFile(new URL('../scripts/map/map-selection.js', import.meta.url), 'utf8');
    assert.match(selectionController, /targetFeatures = await loadFeatures\(featureName\);/);
    assert.match(source, /import \{ findPointInsidePolygon, getBbox, isPointInGeoJSONGeometry \} from '\.\/utils\/geometry-math\.js';/);
    assert.match(source, /import \{ displayZoneId, formatArea, formatDate, normalizeZoneId, zoneImagePath \} from '\.\/utils\/format-utils\.js';/);
    assert.match(source, /updateAllFeatureStyles as updateMapFeatureStyles/);
    const mapLayers = await readFile(new URL('../scripts/map/map-layers.js', import.meta.url), 'utf8');
    assert.match(mapLayers, /getThemeAccent\(\)/);
    assert.match(source, /import \{ canvasToTiffBlob, geojsonToGpx, geojsonToKml \} from '\.\/services\/format-converters\.js';/);
    assert.doesNotMatch(source, /function generateZoneGeometrySVG\(/);
    assert.doesNotMatch(source, /function geojsonToKml\(/);
    assert.doesNotMatch(source, /function geojsonToGpx\(/);
    assert.doesNotMatch(source, /function canvasToTiffBlob\(/);
    assert.doesNotMatch(source, /function isPointInGeoJSONGeometry\(/);
    assert.doesNotMatch(source, /function getDefaultStyle\(/);
});

test('the map application uses the shared suggested-app and Avenza modal components', async () => {
    const source = await readFile(mapScriptPath, 'utf8');

    assert.match(source, /import \{ handleAppDirectOpen \} from '\.\/components\/avenza-modal-view\.js';/);
    assert.doesNotMatch(source, /const APP_FORMAT_PREFERENCES =/);
    assert.doesNotMatch(source, /const APP_INSTRUCTION_CONFIGS =/);
});

test('the map application uses shared toolbar setup with legacy map callbacks', async () => {
    const source = await readFile(mapScriptPath, 'utf8');

    assert.match(source, /setupActionButtons as setupToolbarActionButtons/);
    assert.match(source, /setupToolbarActionButtons\(\{/);
    assert.match(source, /shareFile: handleSpatialFileShare/);
    assert.match(source, /downloadPdf: button => downloadGeoPdf\(button\)/);
    assert.match(source, /downloadTiff: button => downloadGeoTiff\(button\)/);
    assert.match(source, /closeModals: closeAllModals/);
    assert.doesNotMatch(source, /function setupActionButtons\(/);
});

test('the map application reads Florence zone guide content from config', async () => {
    const source = await readFile(mapScriptPath, 'utf8');

    assert.match(source, /import \{ FLORENCE_ZONE_BIRDS \} from '\.\/config\/florence-zone-guide\.js';/);
    assert.doesNotMatch(source, /const FLORENCE_ZONE_BIRDS =/);
    assert.match(source, /FLORENCE_ZONE_BIRDS\[zid\]/);
});

test('map modals leave image lightbox behavior to the shared lightbox component', async () => {
    const mapModals = await readFile(new URL('../scripts/components/map-modals.js', import.meta.url), 'utf8');
    const imageLightbox = await readFile(new URL('../scripts/components/image-lightbox.js', import.meta.url), 'utf8');

    assert.doesNotMatch(mapModals, /function setupImageLightbox\(/);
    assert.match(imageLightbox, /export function setupImageLightbox\(/);
});

test('toolbar actions leave sidebar capsule events to the sidebar component', async () => {
    const toolbarActions = await readFile(new URL('../scripts/components/toolbar-actions.js', import.meta.url), 'utf8');
    const capsuleEvents = await readFile(new URL('../scripts/components/sidebar-capsule-events.js', import.meta.url), 'utf8');

    assert.doesNotMatch(toolbarActions, /function setupCapsules\(/);
    assert.match(capsuleEvents, /export function setupSidebarCapsuleEvents\(/);
});
