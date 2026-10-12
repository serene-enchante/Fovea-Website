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
    assert.match(source, /closeModals: \(\) => closeModalsView\(\{ onBeforeClose: cancelDownloadViewPreload \}\)/);
    assert.doesNotMatch(source, /function closeAllModals\(/);
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

test('the map application uses the shared cursor proximity tracker', async () => {
    const source = await readFile(mapScriptPath, 'utf8');

    assert.match(source, /import \{ setupProximityGlowCanvas, setupProximityTracking \} from '\.\/map\/map-proximity\.js';/);
    assert.doesNotMatch(source, /function setupProximityTracking\(/);
});

test('the map entry wires shared sidebar capsule events directly', async () => {
    const source = await readFile(mapScriptPath, 'utf8');

    assert.match(source, /setupSidebarCapsuleEvents\(\{\s+state,\s+documentObject: document,\s+onRender: renderSidebarList,\s+notify: showToast/);
    assert.doesNotMatch(source, /function setupCapsules\(/);
});

test('bird observation list items and map popups share one view component', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const observationView = await readFile(new URL('../scripts/components/bird-observation-view.js', import.meta.url), 'utf8');
    const observationLayers = await readFile(new URL('../scripts/map/bird-observation-layers.js', import.meta.url), 'utf8');

    assert.match(source, /renderBirdObservationsList/);
    assert.match(observationLayers, /onOpenPopup = openBirdObservationPopup/);
    assert.match(observationLayers, /if \(event\.features\?\.\[0\]\) onOpenPopup\(event\.features\[0\]\)/);
    assert.doesNotMatch(source, /new maplibregl\.Popup/);
    assert.match(observationView, /export function createBirdObservationItem\(/);
    assert.match(observationView, /createBirdObservationItem\(feature, documentObject\)/);
    assert.match(observationView, /export function openBirdObservationPopup\(/);
    assert.match(source, /renderSidebarBirdPanel as renderBirdSidebarPanel/);
    assert.doesNotMatch(source, /function renderSidebarBirdPanel\(/);
    assert.match(observationView, /export function renderSidebarBirdPanel\(/);
});

test('bird observations tab rendering and selection cleanup live in shared modules', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const observationView = await readFile(new URL('../scripts/components/bird-observation-view.js', import.meta.url), 'utf8');
    const selectionController = await readFile(new URL('../scripts/map/bird-selection-controller.js', import.meta.url), 'utf8');

    assert.match(source, /renderBirdObservationsList/);
    assert.doesNotMatch(source, /function renderObservationsList\(/);
    assert.doesNotMatch(source, /function clearBirdObservations\(/);
    assert.match(observationView, /export function renderBirdObservationsList\(/);
    assert.match(selectionController, /export function clearBirdObservations\(/);
});

test('bird species guide rendering lives in its shared sidebar component', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const component = await readFile(new URL('../scripts/components/bird-species-list.js', import.meta.url), 'utf8');

    assert.match(source, /renderBirdSpeciesList\(listContainer, \{ state, onSelectBird: selectBird/);
    assert.doesNotMatch(source, /function renderBirdsList\(/);
    assert.match(component, /export function renderBirdSpeciesList\(/);
    assert.match(component, /onSelectBird\(bird\.name\)/);
});

test('organizer and resource sidebar views are shared components', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const component = await readFile(new URL('../scripts/components/sidebar-static-views.js', import.meta.url), 'utf8');

    assert.match(source, /import \{ renderOrganizersList, renderResourcesList \} from '\.\/components\/sidebar-static-views\.js';/);
    assert.doesNotMatch(source, /function renderOrganizersList\(/);
    assert.doesNotMatch(source, /function renderResourcesList\(/);
    assert.match(component, /export function renderOrganizersList\(/);
    assert.match(component, /export function renderResourcesList\(/);
});

test('circle and zone sidebar rows are rendered by the shared map feature list', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const component = await readFile(new URL('../scripts/components/map-feature-list.js', import.meta.url), 'utf8');
    const sidebarList = source.slice(source.indexOf('function renderSidebarList() {'), source.indexOf('function setupMapEffectsAndFullscreen'));

    assert.match(source, /import \{ renderMapFeatureList \} from '\.\/components\/map-feature-list\.js';/);
    assert.match(sidebarList, /onSelectCircle: \(cid, feature\)/);
    assert.match(sidebarList, /onSelectZone: id => selectSubject\(id\)/);
    assert.doesNotMatch(sidebarList, /const sortedCircles =/);
    assert.doesNotMatch(sidebarList, /const sortedFeatures =/);
    assert.match(component, /export function renderMapFeatureList\(/);
});

test('bird selection and observation loading are owned by the shared map controller', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const controller = await readFile(new URL('../scripts/map/bird-selection-controller.js', import.meta.url), 'utf8');

    assert.match(source, /createBirdSelectionController\(\{/);
    assert.doesNotMatch(source, /async function selectBird\(/);
    assert.match(controller, /export function createBirdSelectionController\(/);
});

test('bird observation map layers are configured outside the map entry', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const layers = await readFile(new URL('../scripts/map/bird-observation-layers.js', import.meta.url), 'utf8');

    assert.match(source, /import \{ setupBirdObservationsLayer, updateBirdObservationsLayerStyles \} from '\.\/map\/bird-observation-layers\.js';/);
    assert.doesNotMatch(source, /function setupBirdObservationsLayer\(/);
    assert.doesNotMatch(source, /function updateBirdObservationsLayerStyles\(/);
    assert.match(layers, /export function setupBirdObservationsLayer\(/);
    assert.match(layers, /export function updateBirdObservationsLayerStyles\(/);
});
