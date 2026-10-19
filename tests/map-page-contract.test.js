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
    const state = await readFile(new URL('../scripts/state.js', import.meta.url), 'utf8');

    assert.match(source, /import \{ state \} from '\.\/state\.js';/);
    assert.doesNotMatch(source, /Object\.assign\(state,/);
    assert.match(state, /activeTab: "overview"/);
    assert.match(state, /currentBaseLayer: "default"/);
    assert.match(source, /import \{ loadGeoDataset \} from '\.\/services\/geo-data-repository\.js';/);
    assert.match(source, /createMapFeatureRepository\(\{ state, loadGeoDataset \}\)/);
    assert.match(source, /loadFeatures: loadFeaturesForMapView,/);
    const startup = await readFile(new URL('../scripts/map/map-page-startup.js', import.meta.url), 'utf8');
    assert.match(startup, /state\.allFeatures = await loadFeatures\(initialFeature\)/);
    const selectionController = await readFile(new URL('../scripts/map/map-selection.js', import.meta.url), 'utf8');
    assert.match(selectionController, /targetFeatures = await loadFeatures\(featureName\);/);
    assert.doesNotMatch(selectionController, /from '\.\.\/components\/(?:header-view|sidebar-list)\.js'/);
    assert.doesNotMatch(selectionController, /from '\.\/map-(?:layers|rendering)\.js'/);
    assert.doesNotMatch(selectionController, /import \{ state \} from/);
    assert.match(selectionController, /export function createMapSelectionController\(\)/);
    assert.match(selectionController, /const selectionState = \{ currentHierarchyLevel: 0 \}/);
    assert.doesNotMatch(selectionController, /_currentHierarchyLevel/);
    assert.match(selectionController, /state: appState/);
    assert.match(selectionController, /documentObject,/);
    assert.match(selectionController, /windowObject,/);
    assert.match(selectionController, /schedule,/);
    assert.match(selectionController, /updateHeader: renderHeader/);
    assert.match(selectionController, /disposeRasterCache: disposeCache/);
    assert.match(selectionController, /schedule,\s*showToast,\s*isSuggestLocked\s*}/);
    assert.doesNotMatch(selectionController, /document\.body|setTimeout\(/);
    assert.match(source, /import \{ getBbox \} from '\.\/utils\/geometry-math\.js';/);
    assert.match(source, /import \{ displayZoneId, normalizeZoneId \} from '\.\/utils\/format-utils\.js';/);
    assert.match(source, /updateAllFeatureStyles as updateMapFeatureStyles/);
    const mapLayers = await readFile(new URL('../scripts/map/map-layers.js', import.meta.url), 'utf8');
    assert.match(mapLayers, /getThemeAccent\(\)/);
    assert.match(source, /import \{ canvasToTiffBlob \} from '\.\/services\/format-converters\.js';/);
    const toolbar = await readFile(new URL('../scripts/components/toolbar-actions.js', import.meta.url), 'utf8');
    assert.match(toolbar, /geojsonToGpx/);
    assert.match(toolbar, /geojsonToKml/);
    assert.doesNotMatch(source, /function generateZoneGeometrySVG\(/);
    assert.doesNotMatch(source, /function geojsonToKml\(/);
    assert.doesNotMatch(source, /function geojsonToGpx\(/);
    assert.doesNotMatch(source, /function canvasToTiffBlob\(/);
    assert.doesNotMatch(source, /function isPointInGeoJSONGeometry\(/);
    assert.doesNotMatch(source, /function getDefaultStyle\(/);
});

test('map feature repository maps view names to datasets and caches feature arrays in state', async () => {
    const repository = await readFile(new URL('../scripts/map/map-feature-repository.js', import.meta.url), 'utf8');

    assert.match(repository, /export function createMapFeatureRepository\(\{ state, loadGeoDataset \}\)/);
    assert.match(repository, /featureName === 'florence' \? 'florence'/);
    assert.match(repository, /featureName === 'eugene' \? 'eugene'/);
    assert.match(repository, /state\.circlesFeatures = features/);
    assert.match(repository, /state\.florenceFeatures = features/);
    assert.match(repository, /state\.eugeneFeatures = features/);
});

test('suggested-app configuration stays out of the map entry', async () => {
    const source = await readFile(mapScriptPath, 'utf8');

    assert.doesNotMatch(source, /const APP_FORMAT_PREFERENCES =/);
    assert.doesNotMatch(source, /const APP_INSTRUCTION_CONFIGS =/);
});

test('the map injects suggested-app opening into the shared toolbar', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const pageUi = await readFile(new URL('../scripts/map/map-page-ui.js', import.meta.url), 'utf8');
    const toolbar = await readFile(new URL('../scripts/components/toolbar-actions.js', import.meta.url), 'utf8');
    const suggestedControls = await readFile(new URL('../scripts/components/suggested-app-controls.js', import.meta.url), 'utf8');

    assert.match(pageUi, /import \{ handleAppDirectOpen \} from '\.\.\/components\/avenza-modal-view\.js';/);
    assert.match(pageUi, /openSuggestedApp: handleAppDirectOpen/);
    assert.match(toolbar, /openSuggestedApp = \(\) => \{\}/);
    assert.match(toolbar, /setupDownloadAppSearch\(\{ onOpenApp: openSuggestedApp \}\)/);
    assert.match(suggestedControls, /await onOpenApp\(appName, card\)/);
    assert.doesNotMatch(toolbar, /await handleAppDirectOpen\(/);
});

test('the map application uses shared toolbar setup with legacy map callbacks', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const pageUi = await readFile(new URL('../scripts/map/map-page-ui.js', import.meta.url), 'utf8');

    assert.match(source, /setupMapPageUi\(\{/);
    assert.match(pageUi, /setupActionButtons as setupToolbarActionButtons/);
    assert.match(pageUi, /shareFile,/);
    assert.match(source, /shareFile: handleSpatialFileShare/);
    assert.match(source, /downloadPdf: button => downloadGeoPdf\(button\)/);
    assert.match(source, /downloadTiff: button => downloadGeoTiff\(button\)/);
    assert.match(pageUi, /closeModals: \(\) => closeModalsView\(\{ onBeforeClose: cancelDownloadViewPreload \}\)/);
    assert.doesNotMatch(pageUi, /function closeAllModals\(/);
    assert.doesNotMatch(pageUi, /function setupActionButtons\(/);
});

test('map page UI setup composes shared interaction modules in startup order', async () => {
    const pageUi = await readFile(new URL('../scripts/map/map-page-ui.js', import.meta.url), 'utf8');

    assert.match(pageUi, /export function setupMapPageUi\(\{/);
    assert.match(pageUi, /setupSearch\(\{ state, documentObject, windowObject, setMobileSnapState \}\)/);
    assert.match(pageUi, /setupSidebarCapsuleEvents\(\{ state, documentObject, onRender: renderSidebarList, notify \}\)/);
    assert.match(pageUi, /setupHelpModeSystem\(\{/);
    assert.match(pageUi, /setupViewToggleMenu\(\)/);
});

test('PDF and TIFF layout exports use the shared download action controller', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const downloads = await readFile(new URL('../scripts/map/map-layout-downloads.js', import.meta.url), 'utf8');

    assert.match(source, /createMapLayoutDownloadActions\(\{/);
    assert.match(source, /shareFile: handleSpatialFileShare/);
    assert.match(downloads, /export function createMapLayoutDownloadActions\(/);
    assert.match(downloads, /convertCanvasToTiff\(canvas\)/);
    assert.match(downloads, /windowObject\.jspdf\?\.jsPDF/);
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
    const runtime = await readFile(new URL('../scripts/map/map-runtime.js', import.meta.url), 'utf8');
    const viewport = await readFile(new URL('../scripts/map/map-viewport.js', import.meta.url), 'utf8');

    assert.match(runtime, /import \{ setupMapEffectsAndFullscreen \} from '\.\/map-viewport\.js';/);
    assert.doesNotMatch(source, /function setupMapEffectsAndFullscreen\(/);
    assert.match(viewport, /export function setupMapEffectsAndFullscreen\(/);
});

test('map layer rebuild lifecycle is owned by a shared map controller', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const lifecycle = await readFile(new URL('../scripts/map/map-layer-lifecycle.js', import.meta.url), 'utf8');
    const mapLayers = await readFile(new URL('../scripts/map/map-layers.js', import.meta.url), 'utf8');

    assert.match(source, /createMapLayerLifecycle\(\{/);
    assert.doesNotMatch(source, /function rebuildGeoJsonLayer\(/);
    assert.doesNotMatch(mapLayers, /export function rebuildGeoJsonLayer\(/);
    assert.match(lifecycle, /export function createMapLayerLifecycle\(/);
    assert.match(lifecycle, /setupHoverEvents\(\{ map: state\.map, state, onFeatureClick \}\)/);
});

test('navigation controls are created by the shared map controls module', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const controls = await readFile(new URL('../scripts/map/map-controls.js', import.meta.url), 'utf8');

    assert.match(source, /initializeMapRuntime\(\{/);
    assert.match(source, /onToggleFullscreen: toggleFullscreen/);
    assert.doesNotMatch(source, /map-ctrl-zoom-in/);
    assert.match(controls, /export function setupMapNavigationControls\(/);
});

test('map runtime owns map construction and passes page actions into map setup', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const runtime = await readFile(new URL('../scripts/map/map-runtime.js', import.meta.url), 'utf8');

    assert.match(source, /initializeMapRuntime\(\{[\s\S]*onSelectCircles: \(\) => selectSubject\(CIRCLE_ID\)/);
    assert.match(runtime, /export function initializeMapRuntime\(\{/);
    assert.match(runtime, /createMapInstance\(maplibregl/);
    assert.match(runtime, /setupMapCanvasEvents\(/);
    assert.match(runtime, /setupMapStyleControl\(/);
    assert.match(runtime, /documentObject = globalThis\.document/);
});

test('map style picker behavior is owned by a shared map control module', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const styleControl = await readFile(new URL('../scripts/map/map-style-control.js', import.meta.url), 'utf8');

    const runtime = await readFile(new URL('../scripts/map/map-runtime.js', import.meta.url), 'utf8');
    assert.match(source, /initializeMapRuntime\(\{/);
    assert.doesNotMatch(source, /map-ctrl-styles__toggle/);
    assert.match(runtime, /setupMapStyleControl\(\{/);
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
    const pageUi = await readFile(new URL('../scripts/map/map-page-ui.js', import.meta.url), 'utf8');
    const search = await readFile(new URL('../scripts/map/map-search.js', import.meta.url), 'utf8');
    const suggestedControls = await readFile(new URL('../scripts/components/suggested-app-controls.js', import.meta.url), 'utf8');

    assert.match(pageUi, /setupSearch\(\{ state, documentObject, windowObject, setMobileSnapState \}\)/);
    assert.match(search, /export function setupSearch\(\{/);
    assert.match(search, /export function setupAllAppsLiveSearch\(\{ documentObject/);
    assert.match(suggestedControls, /setupAllAppsLiveSearch\(\{ documentObject: document \}\)/);
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

test('help mode delegates map keyboard shortcuts to a separate controller', async () => {
    const helpMode = await readFile(new URL('../scripts/components/map-modals.js', import.meta.url), 'utf8');
    const shortcuts = await readFile(new URL('../scripts/components/map-keyboard-shortcuts.js', import.meta.url), 'utf8');

    assert.match(helpMode, /setupMapKeyboardShortcuts\(\{/);
    assert.doesNotMatch(helpMode, /addEventListener\("keydown"/);
    assert.match(shortcuts, /export function setupMapKeyboardShortcuts\(/);
    assert.match(shortcuts, /onSelectMapStyle\(digitNum - 1\)/);
    assert.match(shortcuts, /updateKeyboardFocus\(/);
});

test('map help tooltip copy is stored in the shared configuration module', async () => {
    const helpMode = await readFile(new URL('../scripts/components/map-modals.js', import.meta.url), 'utf8');
    const content = await readFile(new URL('../scripts/config/map-help-content.js', import.meta.url), 'utf8');

    assert.match(helpMode, /import \{ MAP_HELP_CONTENT \} from '\.\.\/config\/map-help-content\.js';/);
    assert.doesNotMatch(helpMode, /const helpDictionary/);
    assert.match(content, /export const MAP_HELP_CONTENT = \[/);
});

test('help tooltip targets are tagged and resolved by a separate view helper', async () => {
    const helpMode = await readFile(new URL('../scripts/components/map-modals.js', import.meta.url), 'utf8');
    const targets = await readFile(new URL('../scripts/components/map-help-targets.js', import.meta.url), 'utf8');

    assert.match(helpMode, /tagHelpElements\(MAP_HELP_CONTENT, documentObject\)/);
    assert.match(helpMode, /resolveHelpTarget\(e\.target, MAP_HELP_CONTENT\)/);
    assert.doesNotMatch(helpMode, /const resolveHelpTarget/);
    assert.match(targets, /export function tagHelpElements\(/);
    assert.match(targets, /export function resolveHelpTarget\(/);
});

test('help tooltip rendering and placement are owned by a shared view module', async () => {
    const helpMode = await readFile(new URL('../scripts/components/map-modals.js', import.meta.url), 'utf8');
    const tooltipView = await readFile(new URL('../scripts/components/map-help-tooltip-view.js', import.meta.url), 'utf8');

    assert.match(helpMode, /renderHelpTooltip\(tooltip/);
    assert.match(helpMode, /positionHelpTooltipAtPointer\(tooltip/);
    assert.match(helpMode, /positionHelpTooltipAtTarget\(tooltip/);
    assert.doesNotMatch(helpMode, /help-mode-tooltip__shortcut-val/);
    assert.match(tooltipView, /export function renderHelpTooltip\(/);
});

test('help mode receives map state, browser objects, and action callbacks explicitly', async () => {
    const source = await readFile(mapScriptPath, 'utf8');
    const pageUi = await readFile(new URL('../scripts/map/map-page-ui.js', import.meta.url), 'utf8');
    const helpMode = await readFile(new URL('../scripts/components/map-modals.js', import.meta.url), 'utf8');

    assert.match(pageUi, /setupHelpModeSystem\(\{\s*state,/);
    assert.match(pageUi, /onCopyLink: performDirectCopyLink/);
    assert.match(pageUi, /MutationObserverClass/);
    assert.match(helpMode, /documentObject = globalThis\.document/);
    assert.doesNotMatch(helpMode, /from '\.\/toolbar-actions\.js'|from '\.\.\/state\.js'/);
});

test('map page UI wires shared sidebar capsule events directly', async () => {
    const pageUi = await readFile(new URL('../scripts/map/map-page-ui.js', import.meta.url), 'utf8');

    assert.match(pageUi, /setupSidebarCapsuleEvents\(\{ state, documentObject, onRender: renderSidebarList, notify \}/);
    assert.doesNotMatch(pageUi, /function setupCapsules\(/);
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
    const navigation = await readFile(new URL('../scripts/map/map-feature-navigation.js', import.meta.url), 'utf8');

    assert.match(source, /import \{ renderMapFeatureList \} from '\.\/components\/map-feature-list\.js';/);
    assert.match(source, /onSelectCircle: featureNavigation\.selectCircle/);
    assert.match(source, /onFeatureClick: featureNavigation\.handleMapFeatureClick/);
    assert.match(source, /onSelectZone: id => selectSubject\(id\)/);
    assert.match(navigation, /export function createMapFeatureNavigation\(/);
    assert.match(navigation, /return selectCircle\(properties\.cid, feature\)/);
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
