# Refactor handoff

Updated: 2026-10-12

## Current state

- Repository: `Fovea-Website`
- Active branch: `main` (the `refactor` branch has been merged into `main`)
- Latest refactor commit: `7d5e958 share map feature navigation`
- The user has asked to continue the refactor incrementally, run tests, and commit each step to `main`.
- Eugene-05 is now the active Eugene dataset. The user-provided `geojson/Eugene-05-wgs84.geojson` and `geojson/Eugene-05-wgs84.qmd` are part of that site update.
- Eugene-05 splits legacy Zone 19 into zones 19A and 19B; the active dataset contains 29 zones, and labels/counts must preserve the alphanumeric suffixes. Zone-specific descriptive copy has since been removed from the UI.
- Preserve the separate, pre-existing edits to `geojson/Eugene-04-wgs84.geojson` and `geojson/Eugene-04-wgs84-10m.topojson`; do not stage them as part of unrelated work.

## Recent work

Recent commits, newest first:

| Commit | Change |
| --- | --- |
| `d2c0c02` | Share PDF and TIFF download button bindings through `setupSpatialDownloadButtons`, with injected renderer callbacks preserving the live map's legacy file-sharing behavior. |
| `f265864` | Reduce `bottom-nav-view.js` to a map-page adapter; use the site-wide mobile navigation script for capsule animation and dragging. |
| `7ffa561` | Extract iNaturalist observation and taxon-photo requests into `scripts/services/observations-client.js`, retaining fallback queries and existing UI behavior. |
| `9549a86` | Wire the production map to the existing feedback form component and remove its duplicate suggestion drawing/submission implementation. |
| `1df4c9b` | Move map action-button wiring to `toolbar-actions.js`, injecting the legacy file-share, PDF/TIFF, and modal-close callbacks. |
| `d6726e8` | Move Florence zone guide content out of `maps-tile.js` into `scripts/config/florence-zone-guide.js`. |
| `9f03334` | Move production map feature styling into `map-layers.js`, injecting bird-observation styling as an additional-layer callback. |
| `e4eae70` | Reuse the shared HTML map label renderer and preserve the live map's light-theme label colors. |
| `9c36abe` | Remove the unused lightbox setup duplicate; keep lightbox behavior in `image-lightbox.js`. |
| `6d72828` | Remove the unused capsule setup duplicate; production binding remains in `sidebar-capsule-events.js`. |
| `ca91cf5` | Use the shared map proximity tracker in production and remove its duplicate implementation. |
| `2888803` | Wire modal cleanup and capsule events directly from map initialization to their shared components, removing pass-through wrappers. |
| `ab784b2` | Share bird-observation list cards, map popups, and popup cleanup through `bird-observation-view.js`. |
| `e2ddb0b` | Move the bird sidebar summary panel into `bird-observation-view.js`, keeping navigation as a render callback. |
| `dc94d91` | Move bird selection and observation loading into `bird-selection-controller.js`; retain rendering through injected callbacks. |
| `29b2141` | Move bird observation source, layers, and theme styling to `bird-observation-layers.js`. |
| `4639fd3` | Move the complete observations-tab list renderer and bird-selection cleanup into the shared bird view and selection modules. |
| `aca5986` | Extract Florence species-guide sidebar rendering into `bird-species-list.js`, with state and selection passed in. |
| `365dfac` | Move organizers and resources sidebar empty views into `sidebar-static-views.js`. |
| `0965eb4` | Move map circle and zone list rows into `map-feature-list.js`, keeping navigation callbacks in the map entry. |
| `4629be2` | Move overview tab composition and preview interaction wiring into `sidebar-overview-view.js`, using injected navigation, hover, and lightbox callbacks. |
| `543ce0d` | Move sidebar tab routing, selected-bird rendering, overview/list selection, and keyboard focus handling into `sidebar-controller.js`. |
| `47a00c0` | Move resize invalidation, fullscreen animation, and responsive home animation into `map-viewport.js`. |
| `aa704f0` | Move zone source updates, label/proximity initialization, hover bindings, and feature click routing into `map-layer-lifecycle.js`. |
| `1292f1d` | Move zoom, locate, and fullscreen control construction into `map-controls.js`, injecting their actions from map initialization. |
| `47a00c0` | Move resize invalidation, fullscreen animation, and responsive home animation into `map-viewport.js`. |
| `69d6ba3` | Move the Map Elements tabs, search, layer list, and basemap picker into `map-style-control.js`, with selection and map actions injected from initialization. |
| `e0932e8` | Move editor and capsule-back event wiring, including mobile back animation, into `map-page-navigation.js`; inject selection and circle-switch callbacks. |
| `2e33cba` | Inject DOM, map state, viewport, snap-state, and timers into the sidebar and suggested-app search setup; add isolated filter and keyboard/mobile interaction coverage. |
| `bf5b220` | Extract home-link transition wiring and back-forward-cache reset into `page-transition-events.js`, with browser dependencies injected. |
| `5c70936` | Remove the unused duplicate home-transition binder from `toolbar-actions.js`; the shared page-transition component is the only remaining owner. |
| `e81ab38` | Move map keyboard shortcut routing into `map-keyboard-shortcuts.js`; inject sidebar, fullscreen, copy-link, style-selection, and help-mode actions. |
| `f97a35c` | Move help tooltip descriptions into `config/map-help-content.js`; keep help rendering and interaction logic in `map-modals.js`. |
| `cc90717` | Move help selector tagging, lazy target matching, and map-control exclusions into `map-help-targets.js`. |
| `dd3a5f4` | Consolidate help tooltip content, mouse/touch positioning, highlighting, and dismissal in `map-help-tooltip-view.js`. |
| `af3361c` | Inject app state, browser objects, toast, keyboard-focus, fullscreen, copy-link, and map-style actions into help-mode setup. |
| `5b219b9` | Move production map construction, base layer setup, map controls, and viewport setup behind `map-runtime.js`, injecting page-specific selection and action callbacks. |
| `d11b3a1` | Move view-to-dataset resolution and feature-array state caching behind `map-feature-repository.js`. |
| `10b1b7b` | Move map theme application, initial feature loading, page setup, selection, and entrance handling behind `map-page-startup.js`. |
| `7d5e958` | Share circle routing for map and sidebar clicks through `map-feature-navigation.js`. |
| `HEAD` | Remove imports from `maps-tile.js` that are unused there; shared toolbar modules remain the owners of export and suggested-app integration code. |
| `cc71563` | Move PDF/TIFF layout export orchestration behind `map-layout-downloads.js`, injecting the legacy map share callback and notification behavior. |
| `4f55ebf` | Share GeoJSON, KMZ, and GPX download button bindings through the same helper, injecting the legacy map share callback where needed. |
| `68c2247` | Reuse the toolbar's `generateAppSpatialBlob` implementation from the live map and remove its duplicate. |
| `54c5a22` | Remove unused duplicate `MAP_STYLES` objects and unused `scripts/config/map-styles.js`. |
| `0109ca2` | Extract the eBird species-code table and URL builder into `scripts/services/ebird-links.js`. |
| `5c9f4a4` | Reuse the shared mobile-view map control positioning helper. |
| `33a8e27` | Remove an unused stale viewport/fullscreen implementation from `scripts/map/map-rendering.js`. |
| `d006702` | Consolidate raster cache ownership in `scripts/map/map-rendering.js`; retain the live map's legacy sharing wrappers. |

Earlier work and the overall rationale/order are recorded in [refactor-assessment.md](./refactor-assessment.md). The live map still boots from `scripts/maps-tile.js`; this is an incremental migration, not yet a switch to a new entry point.

## Verification history

At the earlier `d2c0c02` checkpoint:

- `npm test` passed: 76 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After `f265864`:

- `npm test` passed: 76 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After the iNaturalist client extraction:

- `npm test` passed: 79 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After the feedback form migration:

- `npm test` passed: 79 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After toolbar action setup migration:

- `npm test` passed: 80 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After the Florence zone guide extraction:

- `npm test` passed: 82 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After feature styling migration:

- `npm test` passed: 83 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After HTML label renderer consolidation:

- `npm test` passed: 84 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

The duplicate lightbox setup function in `map-modals.js` was subsequently removed; production and sidebar lightbox behavior use `image-lightbox.js`.

After removing the duplicate lightbox setup:

- `npm test` passed: 85 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

The unused capsule binding in `toolbar-actions.js` was also removed; production capsule events are owned by `sidebar-capsule-events.js`.

After removing the duplicate capsule binding:

- `npm test` passed: 86 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After wiring production to the shared map proximity tracker:

- `npm test` passed: 88 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After wiring shared modal and capsule components directly from initialization:

- `npm test` passed: 89 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting the shared bird-observation view:

- `npm test` passed: 91 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After moving the bird summary panel into the shared view:

- `npm test` passed: 92 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting bird selection and observation loading:

- `npm test` passed: 96 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting bird observation map layers:

- `npm test` passed: 98 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After moving the complete observations-tab renderer and selection cleanup into shared modules:

- `npm test` passed: 101 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting Florence species-guide sidebar rendering:

- `npm test` passed: 104 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting organizer and resource sidebar views:

- `npm test` passed: 107 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting circle and zone sidebar rows:

- `npm test` passed: 110 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting the sidebar overview view:

- `npm test` passed: 112 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting the sidebar controller:

- `npm test` passed: 116 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After moving resize and fullscreen effects into the viewport module:

- `npm test` passed: 118 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting the map layer rebuild lifecycle:

- `npm test` passed: 120 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting zoom, locate, and fullscreen map controls:

- `npm test` passed: 122 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting the Map Elements style picker:

- `npm test` passed: 125 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting map page navigation actions:

- `npm test` passed: 129 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After making search setup dependency-injected:

- `npm test` passed: 133 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting page transition events:

- `npm test` passed: 137 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After removing the duplicate home-transition binder:

- `npm test` passed: 137 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting map keyboard shortcuts:

- `npm test` passed: 141 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After moving help tooltip copy to configuration:

- `npm test` passed: 143 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting help target matching:

- `npm test` passed: 147 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting the help tooltip view:

- `npm test` passed: 151 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After injecting help-mode dependencies:

- `npm test` passed: 154 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting production map runtime setup:

- `npm test` passed: 156 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting layout download actions:

- `npm test` passed: 160 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting map feature repository wiring:

- `npm test` passed: 162 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting map page startup orchestration:

- `npm test` passed: 164 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After consolidating map and sidebar circle navigation:

- `npm test` passed: 167 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After removing unused map-entry imports:

- `npm test` passed: 167 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

The browser suite starts a server on `127.0.0.1:4173`. In this environment it needs the sandbox permission that allows Playwright's local web server to bind that address. Warnings about `NO_COLOR` versus `FORCE_COLOR` are benign.

## Next steps for the next agent

1. Check `git status --short --branch` first and preserve the two GeoJSON changes listed above.
2. Continue from `main`. Make one coherent, reviewable refactor slice at a time.
3. Run `npm test`, `npm run test:browser`, and `git diff --check` for each code slice, then commit only the intended refactor files to `main`.
4. Reuse existing shared boundaries when behavior matches. Where the live map intentionally differs (notably `legacy-map` iOS share metadata), inject its current callback rather than silently changing behavior.
5. Refer to `docs/refactor-assessment.md` for the remaining larger priorities. The highest-value unresolved work includes establishing the map entry/controller boundary, completing one-source-of-truth integration clients, and gradually migrating remaining bird/sidebar/modal/map behavior out of `scripts/maps-tile.js`.

## Important implementation context

- `scripts/maps-tile.js` remains the production map entry and is still large. Avoid broad rewrites or switching the live page wholesale to the partial modules.
- `scripts/components/toolbar-actions.js` owns production action-button wiring. The map injects its legacy file-share, PDF/TIFF, and modal-close callbacks; `setupSpatialDownloadButtons` also accepts these callbacks for direct use.
- `scripts/map/map-rendering.js` is the shared owner of the raster cache and layout canvas rendering. `scripts/map/map-layout-downloads.js` owns PDF/TIFF layout export orchestration and injects the live map's legacy file-sharing callback.
- `scripts/map/map-layers.js` owns production feature styling and the HTML zone/circle label renderer. The map entry injects bird-observation layer styling through the `updateAdditionalLayers` callback.
- `scripts/map/map-layer-lifecycle.js` owns production zone-source rebuilds, one-time label listeners, proximity setup, and map hover/click binding; it receives the map entry's route and styling callbacks.
- `scripts/map/map-controls.js` owns zoom, locate, and fullscreen button DOM and delegates the actions back to the map entry.
- `scripts/map/map-style-control.js` owns the Map Elements tabs, layer search and rows, and basemap picker; the map entry injects subject selection, basemap switching, and notifications.
- `scripts/map/map-page-navigation.js` owns the map page's editor action and capsule-back event wiring, including its mobile transition classes; the map entry injects bird cleanup and selection transitions.
- `scripts/map/map-search.js` owns sidebar and suggested-app filtering; production callers supply the DOM, sidebar state, viewport, snap-state callback, and timer dependencies.
- `scripts/components/page-transition-events.js` owns the map page's home-link animation fallback and back-forward-cache overlay reset; the page entry injects `document`, `window`, and timers.
- `scripts/components/map-keyboard-shortcuts.js` owns keyboard shortcut routing and map/sidebar keyboard navigation; `map-modals.js` supplies the help-mode and map action callbacks.
- `scripts/config/map-help-content.js` stores the help-mode selector, title, description, and optional shortcut records consumed by `map-modals.js`.
- `scripts/components/map-help-targets.js` owns applying help attributes and resolving hovered or touched targets, including suppressing tooltip hits on map controls.
- `scripts/components/map-help-tooltip-view.js` owns tooltip markup, mouse/touch placement, target highlighting, and dismissal.
- `scripts/components/map-modals.js` accepts app state, browser APIs, notifications, and shortcut actions through `setupHelpModeSystem`; production wiring lives in `maps-tile.js`.
- `scripts/map/map-proximity.js` owns cursor proximity tracking and the glow canvas; the live map entry calls both shared setup functions.
- `scripts/map/map-viewport.js` owns pointer effects, resize invalidation, fullscreen classes, and mobile home animation; the map entry injects layout and map callbacks.
- `scripts/map/map-runtime.js` owns production MapLibre construction and composes layer, control, canvas-event, and viewport setup; `maps-tile.js` supplies state and page-specific actions.
- `scripts/map/map-feature-repository.js` maps circles, Eugene, and Florence views to shared GeoJSON loads and stores each dataset's feature array in app state.
- `scripts/map/map-page-startup.js` owns theme application, initial feature loading, map/sidebar setup sequencing, initial selection, and map entrance/error handling; the page entry supplies setup callbacks.
- `scripts/map/map-feature-navigation.js` shares circle-to-dataset routing and selected-zone map-click behavior between map layers and sidebar selection.
- `scripts/map/map-layout-downloads.js` owns PDF/TIFF layout export orchestration and PNG fallback behavior; the map entry injects canvas rendering, conversion, notification, and its legacy file-share callback.
- `scripts/components/image-lightbox.js` owns lightbox opening and close-event setup. `map-modals.js` owns help-mode shortcuts and interactions.
- `scripts/components/bird-observation-view.js` owns bird summary panels, the full observations-tab list, observation cards, map popup content, and the popup lifecycle used by map clicks and sidebar cards.
- `scripts/components/bird-species-list.js` owns the Florence zone bird-guide list UI and delegates bird selection through an injected callback.
- `scripts/components/sidebar-static-views.js` owns the static organizers placeholder and empty resources view.
- `scripts/components/map-feature-list.js` owns sorted circle and zone sidebar rows, image fallbacks, map hover state, and row click delegation.
- `scripts/components/sidebar-overview-view.js` owns overview composition, bird and feature previews, tab links, preview hover/click wiring, and image lightbox delegation.
- `scripts/components/sidebar-controller.js` owns sidebar tab routing, selected-bird rendering, overview versus list selection, and keyboard focus reset; the map entry injects the actual view renderers and navigation/map effects.
- `scripts/map/bird-selection-controller.js` owns selected-bird loading, observation-to-GeoJSON mapping, photo fallback, stale-response handling, and clearing bird selection state and source data. The map entry injects layer setup and sidebar/header rendering callbacks.
- `scripts/map/bird-observation-layers.js` owns the bird-observation GeoJSON source, map layers, theme-aware paint properties, and map hover/click bindings.
- `scripts/services/ebird-links.js` owns eBird link lookup. Species IDs and fallback URL normalization were moved without changing behavior.
- Preserve public map URLs and query parameters (`circle`, `cid`, `feature`, `zone`, `id`) and keep desktop/mobile smoke flows working.
