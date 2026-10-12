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
    assert.match(source, /import \{ formatArea, formatDate, normalizeZoneId \} from '\.\/utils\/format-utils\.js';/);
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
    const overview = await readFile(new URL('../scripts/components/sidebar-overview-view.js', import.meta.url), 'utf8');

    assert.match(source, /import \{ renderSidebarOverview \} from '\.\/components\/sidebar-overview-view\.js';/);
    assert.match(overview, /FLORENCE_ZONE_BIRDS\[zid\]/);
    assert.match(overview, /export function renderSidebarOverview\(/);
    assert.doesNotMatch(source, /function renderOverviewTab\(/);
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
    const lifecycle = await readFile(new URL('../scripts/map/map-layer-lifecycle.js', import.meta.url), 'utf8');

    assert.match(lifecycle, /import \{ setupProximityGlowCanvas, setupProximityTracking \} from '\.\/map-proximity\.js';/);
    assert.match(source, /createMapLayerLifecycle\(\{/);
});

test('map resize and fullscreen behavior is owned by the viewport module', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const viewport = await readFile(new URL('../scripts/map/map-viewport.js', import.meta.url), 'utf8');

    assert.match(source, /import \{ setupMapEffectsAndFullscreen \} from '\.\/map\/map-viewport\.js';/);
    assert.doesNotMatch(source, /function setupMapEffectsAndFullscreen\(/);
    assert.match(viewport, /export function setupMapEffectsAndFullscreen\(/);
});

test('map layer rebuild lifecycle is owned by a shared map controller', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const lifecycle = await readFile(new URL('../scripts/map/map-layer-lifecycle.js', import.meta.url), 'utf8');

    assert.match(source, /createMapLayerLifecycle\(\{/);
    assert.doesNotMatch(source, /function rebuildGeoJsonLayer\(/);
    assert.match(lifecycle, /export function createMapLayerLifecycle\(/);
    assert.match(lifecycle, /setupHoverEvents\(\{ map: state\.map, state, onFeatureClick \}\)/);
});

test('navigation controls are created by the shared map controls module', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const controls = await readFile(new URL('../scripts/map/map-controls.js', import.meta.url), 'utf8');

    assert.match(source, /setupMapNavigationControls\(\{/);
    assert.doesNotMatch(source, /map-ctrl-zoom-in/);
    assert.match(controls, /export function setupMapNavigationControls\(/);
});

test('map style picker behavior is owned by a shared map control module', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const styleControl = await readFile(new URL('../scripts/map/map-style-control.js', import.meta.url), 'utf8');

    assert.match(source, /setupMapStyleControl\(\{/);
    assert.doesNotMatch(source, /map-ctrl-styles__toggle/);
    assert.match(styleControl, /export function setupMapStyleControl\(/);
    assert.match(styleControl, /onSwitchBaseMap\(b\.id\)/);
    assert.match(styleControl, /onSelectSubject\(state\.currentId, true\)/);
});

test('map page editor and back actions are owned by a shared navigation module', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const navigation = await readFile(new URL('../scripts/map/map-page-navigation.js', import.meta.url), 'utf8');

    assert.match(source, /setupMapPageNavigation\(\{/);
    assert.doesNotMatch(source, /btn-capsule-back/);
    assert.match(navigation, /export function setupMapPageNavigation\(/);
    assert.match(navigation, /switchToCirclesFeature\(\)/);
    assert.match(navigation, /normalizeZoneId\(state\.currentId\)/);
});

test('map and suggested-app search receive their browser dependencies explicitly', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const search = await readFile(new URL('../scripts/map/map-search.js', import.meta.url), 'utf8');
    const toolbar = await readFile(new URL('../scripts/components/toolbar-actions.js', import.meta.url), 'utf8');

    assert.match(source, /setupSearch\(\{ state, documentObject: document, windowObject: window, setMobileSnapState \}\)/);
    assert.match(search, /export function setupSearch\(\{/);
    assert.match(search, /export function setupAllAppsLiveSearch\(\{ documentObject/);
    assert.match(toolbar, /setupAllAppsLiveSearch\(\{ documentObject: document \}\)/);
    assert.doesNotMatch(search, /document\.getElementById|window\.innerWidth/);
});

test('map home-link transition events are owned by the shared page transition component', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const transitions = await readFile(new URL('../scripts/components/page-transition-events.js', import.meta.url), 'utf8');
    const toolbar = await readFile(new URL('../scripts/components/toolbar-actions.js', import.meta.url), 'utf8');

    assert.match(source, /setupPageTransitionEvents\(\{ documentObject: document, windowObject: window \}\)/);
    assert.doesNotMatch(source, /desktop-nav-tab-home/);
    assert.doesNotMatch(toolbar, /function setupBackHomeTransition/);
    assert.match(transitions, /windowObject\.transitionToPage\(destination\)/);
    assert.match(transitions, /event\.persisted/);
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

    assert.match(source, /renderBirdSpecies: renderBirdSpeciesList/);
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
    const sidebarController = await readFile(new URL('../scripts/components/sidebar-controller.js', import.meta.url), 'utf8');

    assert.match(source, /import \{ renderMapFeatureList \} from '\.\/components\/map-feature-list\.js';/);
    assert.match(source, /onSelectCircle: \(cid, feature = null\)/);
    assert.match(source, /onSelectZone: id => selectSubject\(id\)/);
    assert.match(sidebarController, /renderMapFeatureList\(listContainer/);
    assert.doesNotMatch(sidebarController, /const sortedCircles =/);
    assert.doesNotMatch(sidebarController, /const sortedFeatures =/);
    assert.match(component, /export function renderMapFeatureList\(/);
});

test('map sidebar routing is owned by the shared sidebar controller', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const controller = await readFile(new URL('../scripts/components/sidebar-controller.js', import.meta.url), 'utf8');

    assert.match(source, /createSidebarController\(\{/);
    assert.doesNotMatch(source, /function renderSidebarList\(/);
    assert.match(controller, /export function createSidebarController\(/);
    assert.match(controller, /if \(state\.selectedBird\)/);
    assert.match(controller, /if \(state\.isCirclesFeature\)/);
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
