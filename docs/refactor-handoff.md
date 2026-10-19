# Refactor handoff

Updated: 2026-10-19

## Current state

- Repository: `Fovea-Website`
- Active branch: `main` (the `refactor` branch has been merged into `main`)
- Latest refactor commit: `f5fdb73 split map page stylesheet into ordered partials`
- Latest handoff commit before this update: `5e978be sync map stylesheet split handoff`.
- The user has asked to continue the refactor incrementally, run tests, and commit each step to `main`.
- Eugene-05 is now the active Eugene dataset. The user-provided `geojson/Eugene-05-wgs84.geojson` and `geojson/Eugene-05-wgs84.qmd` are part of that site update.
- Eugene-05 splits legacy Zone 19 into zones 19A and 19B; the active dataset contains 29 zones, and labels/counts must preserve the alphanumeric suffixes. Zone-specific descriptive copy has since been removed from the UI.
- Preserve the separate, pre-existing edits to `geojson/Eugene-04-wgs84.geojson` and `geojson/Eugene-04-wgs84-10m.topojson`; do not stage them as part of unrelated work.

## Recent work

- Split `styles/page-maps-tile.css` into a 12-line entry point and 12 ordered partials by contiguous component sections. The largest partial is 832 lines. Concatenating the partials reproduces the original stylesheet byte for byte, preserving cascade and URL-relative asset paths.
- Moved legacy place-filter conversion and circles-view filtering into `scripts/map/map-place-label-filter.js` (100 lines). The controller owns its original-filter cache and exposes `reset()` for style reloads; `map-layers.js` preserves compatibility exports and is now 438 lines.
- Removed the unused `rebuildGeoJsonLayer` duplicate from `map-layers.js`; production uses `map-layer-lifecycle.js`. Added a contract assertion to keep the duplicate from returning. `map-layers.js` is now 547 lines.
- Moved theme-specific land, park, waterway, road-label, and place-label styling into `scripts/map/map-vector-theme-styles.js` (145 lines). `setupMapLayers` still owns style-load ordering, road-color capture and restore, satellite road opacity, filter-cache resets, and initial place filtering.
- Extracted HTML map-label DOM rendering, zoom visibility, and basemap text styling into `scripts/map/map-html-labels.js` (104 lines). `map-layers.js` re-exports the existing label functions for compatibility.
- Extracted preview and submission GeoJSON construction from `feedback-form.js` into the pure `scripts/services/suggestion-annotations.js` service. The form fell from 838 to 707 lines; the extracted service is 74 lines. Preview-only vertices and in-progress geometry remain separate from submission output.

## Progress snapshot (2026-10-19)

- Overall estimate: **about 70%** of the goals in `docs/refactor-assessment.md`. This is a qualitative estimate; the plan has no formal scoring rubric.
- The core map JavaScript migration is substantially advanced: `maps/index.html` loads `scripts/maps/entry.js`, and `scripts/maps-tile.js` is now a 316-line composition/compatibility layer (down from the assessment's original 8,865-line measurement).
- The 1,141-line `toolbar-actions.js` was split by responsibility: toolbar actions now occupy 732 lines and suggested-app controls occupy 422 lines. Treat 500 lines as a review prompt and 1,000 lines as a strong signal to inspect cohesion, not as an automatic split target.
- `download-wizard.js` was decomposed into a 963-line workflow controller, an 84-line configuration module, a 121-line wizard-specific formatter module, and an 87-line raster-cache controller. Wizard formatters preserve their existing output; they were not replaced with the shared converters because those have different output semantics.
- `map-rendering.js` was split into a 272-line cache/download facade, a 487-line layout renderer, and a 174-line pure print-geometry utility. The old `map-rendering.js` path re-exports the renderer and geometry functions to preserve existing imports.
- `feedback-form.js` now delegates annotation preview and submission GeoJSON construction to a 74-line service; the form controller is 707 lines.
- HTML label DOM rendering, visibility, and basemap colors now live in `map-html-labels.js` (104 lines); `map-layers.js` remains the compatibility owner for the existing exports.
- Theme-specific base vector styling now lives in `map-vector-theme-styles.js` (145 lines); place-label filtering lives in `map-place-label-filter.js` (100 lines); `map-layers.js` is 438 lines. The style-load sequence and road color cache remain in `map-layers.js`.
- `styles/page-maps-tile.css` is now a 12-line ordered import entry; its 12 partials range from 164 to 832 lines. `scripts/map/map-runtime.js` still configures `prefetchZoomDelta: 8`; there is no `.github/workflows` directory; and no JSON schema files were found in the schema search.
- Remaining plan areas include reducing/organizing the map CSS, measuring and tuning map startup/prefetch behavior, adding CI browser checks, formalizing dataset/provider schemas and API contracts, and reviewing the entry composition layer for any remaining legacy responsibilities.
- Next priority: review the remaining 963-line `scripts/download-wizard.js` for another cohesive workflow responsibility to extract, keeping its generated outputs and wizard-specific formatting stable. Other modules over 500 lines include `toolbar-actions.js` (732), `feedback-form.js` (707), `maps.js` (681), and `mobile-view.js` (552); inspect cohesion before splitting any of them. Also measure the impact of `prefetchZoomDelta: 8` and `maxTileCacheSize: 2500` before changing MapLibre settings. Run `npm test`, `npm run test:browser`, and `git diff --check` after code changes; keep the Eugene-04 edits unstaged.

For the next worker: start with `git status --short --branch`; keep the existing Eugene-04 GeoJSON edit and untracked TopoJSON out of refactor commits. The stylesheet split is a structure-only change: its partials are contiguous source sections imported in order, and their concatenation matched the pre-split file byte for byte. Keep `page-maps-tile.css` as the public entry path, preserve all imports in order, and keep partials below 1,000 lines. Use the latest test counts in Verification history rather than the older counts farther down that historical log.

Recent commits, newest first:

| Commit | Change |
| --- | --- |
| `f5fdb73` | Split map page CSS into ordered partials with an import contract test. |
| `73251c0` | Extract place-label filter state and conversion into a dedicated controller. |
| `9ba6696` | Remove the unused duplicate map-layer rebuild. |
| `9df90ca` | Extract theme-specific base vector styling from map-layer setup. |
| `ca47adf` | Extract HTML map-label rendering from the map layers module. |
| `c2d756c` | Extract preview and submission annotation GeoJSON builders from the feedback-form controller. |
| `df0d5df` | Split pure print geometry and print-layout rendering from the raster cache and download facade. |
| `987a981` | Record the download-wizard decomposition and verification in the handoff. |
| `11f1149` | Extract wizard configuration, wizard-specific KML/GPX serialization, and raster cache lifecycle from the large wizard controller. |
| `93b51de` | Record module size guidance and the oversized wizard as the next extraction candidate. |
| `2b9edc8` | Move viewer-app metadata, app suggestions, and download search controls into `suggested-app-controls.js`; reduce the toolbar module below 1,000 lines. |
| `468d638` | Record map initialization document injection and its verification in the handoff. |
| `ece2bf8` | Inject `document` into basemap styling and location badge updates; pass it through location tracking. |
| `6dad636` | Update the progress handoff after extracting location marker browser dependencies. |
| `372fd06` | Inject document and MapLibre dependencies into user-location marker creation and pass them through location tracking. |
| `299420d` | Record the refactor progress estimate, evidence, and remaining work for the next worker. |
| `0d27d3d` | Keep the hovered feature ID in a map-keyed weak map and let the proximity glow read it through an accessor. |
| `e775eff` | Sync the hovered-feature state extraction and verification into the handoff. |
| `364be8d` | Record the proximity listener guard refactor and verification in this handoff. |
| `2fa2030` | Keep proximity listener registration guards in module-private weak sets keyed by map canvas. |
| `a338c8a` | Keep the map event registration guard in a module-private weak set keyed by map instance. |
| `6cb87ff` | Record the road-color cache migration and verification in this handoff. |
| `e3a4338` | Move original road colors into the map-layer module and inject their lookup into basemap switching. |
| `00b2420` | Keep basemap place-label filter caches private to `map-layers.js` and reset them on style reload. |
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
| `0a968f3` | Remove imports from `maps-tile.js` that are unused there; shared toolbar modules remain the owners of export and suggested-app integration code. |
| `ebe41b7` | Inject the direct suggested-app opening action into toolbar card and search-result handlers. |
| `a316ecb` | Move map search, toolbar, help-mode, capsule, lightbox, and mobile setup composition into `map-page-ui.js`. |
| `01aaa98` | Make the production map defaults canonical in `state.js` and remove duplicate map state initialization from the entry. |
| `579e38e` | Remove the unused pre-controller sidebar renderer and its legacy feature-switch calls; keep keyboard focus support. |
| `11457f2` | Move selected-route URL updates into the route-state module and inject browser history, selection lookup, and zone formatting. |
| `21d3e88` | Remove rendering, map-style, and raster-cache fallback imports from selection; receive those actions through the entry callbacks. |
| `a741fab` | Pass map state, browser objects, and the timer explicitly into selection; remove the module's singleton and global browser access. |
| `ea4a7ce` | Scope the current hierarchy level to a created map selection controller instead of module-global state. |
| `8018e96` | Inject the feature-transition lock check and timer rather than reaching for global `document` and `setTimeout`. |
| `d562045` | Keep the label-listener registration flag private to the map layer lifecycle controller. |
| `b06703f` | Consolidate layer rebuild style updates into one final pass after location state is refreshed. |
| `cc71563` | Move PDF/TIFF layout export orchestration behind `map-layout-downloads.js`, injecting the legacy map share callback and notification behavior. |
| `4f55ebf` | Share GeoJSON, KMZ, and GPX download button bindings through the same helper, injecting the legacy map share callback where needed. |
| `68c2247` | Reuse the toolbar's `generateAppSpatialBlob` implementation from the live map and remove its duplicate. |
| `54c5a22` | Remove unused duplicate `MAP_STYLES` objects and unused `scripts/config/map-styles.js`. |
| `0109ca2` | Extract the eBird species-code table and URL builder into `scripts/services/ebird-links.js`. |
| `5c9f4a4` | Reuse the shared mobile-view map control positioning helper. |
| `33a8e27` | Remove an unused stale viewport/fullscreen implementation from `scripts/map/map-rendering.js`. |
| `d006702` | Consolidate raster cache ownership in `scripts/map/map-rendering.js`; retain the live map's legacy sharing wrappers. |

Earlier work and the overall rationale/order are recorded in [refactor-assessment.md](./refactor-assessment.md). The live map now boots from `scripts/maps/entry.js`; `scripts/maps-tile.js` remains as a smaller composition/compatibility layer while remaining responsibilities are reviewed.

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

After removing the duplicate sidebar renderer and legacy switch path:

- `npm test` passed: 170 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After injecting map route URL updates:

- `npm test` passed: 171 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After injecting selection dependencies:

- `npm test` passed: 171 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After injecting selection state and browser dependencies:

- `npm test` passed: 171 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After scoping hierarchy state to the selection controller:

- `npm test` passed: 171 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After injecting the map transition environment:

- `npm test` passed: 172 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After keeping label listener state private:

- `npm test` passed: 172 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After consolidating map style refresh:

- `npm test` passed: 172 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After moving place-filter caches out of shared map state:

- `npm test` passed: 172 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After moving original road colors out of shared map state:

- `npm test` passed: 172 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After moving map event and proximity listener guards out of shared map state:

- `npm test` passed: 172 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After moving the hovered feature ID out of shared map state:

- `npm test` passed: 172 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After injecting user-location marker browser dependencies:

- `npm test` passed: 172 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After injecting the map initialization document dependency:

- `npm test` passed: 173 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After splitting suggested-app controls from the toolbar module:

- `npm test` passed: 173 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After decomposing the download-wizard controller:

- `npm test` passed: 179 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After splitting print-layout rendering responsibilities:

- `npm test` passed: 182 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting suggestion annotation GeoJSON builders:

- `npm test` passed: 184 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting the HTML map-label renderer:

- `npm test` passed: 184 tests.
- Playwright reported all 5 browser tests passed; the process then hung during shutdown and was interrupted after the pass report.
- `git diff --check` passed.

After extracting theme-specific vector styling:

- `npm test` passed: 186 tests.
- `npm run test:browser` passed: 5 Playwright tests (the suite completed successfully in 59.5 seconds).
- `git diff --check` passed.

After removing the duplicate map-layer rebuild:

- `npm test` passed: 186 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting the place-label filter controller:

- `npm test` passed: 188 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After splitting the map page stylesheet:

- `npm test` passed: 189 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

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

After injecting suggested-app opening into the toolbar:

- `npm test` passed: 168 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After extracting map page UI setup:

- `npm test` passed: 169 tests.
- `npm run test:browser` passed: 5 Playwright tests.
- `git diff --check` passed.

After consolidating map state defaults:

- `npm test` passed: 170 tests.
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
- `scripts/map/map-page-ui.js` composes production toolbar, map search, capsule, swipe, lightbox, help-mode, sidebar-scroll, and mobile-navigation setup; page-specific state and actions are injected by startup.
- `scripts/state.js` holds canonical production map state defaults; `maps-tile.js` no longer reassigns the same fields during module startup.
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

## Latest continuation checkpoint (2026-10-19)

The October 19 continuation completed these slices on `main`:

- Audited the composition boundary, promoted `scripts/maps/entry.js` to the map composition root, and reduced `scripts/maps-tile.js` to a compatibility import. `maps/index.html` now loads the new entry directly.
- Consolidated QR share URL construction and the feedback POST behind service clients. The feedback UI now says “request sent” because the deployed `no-cors` endpoint cannot confirm acceptance. iNaturalist already uses `scripts/services/observations-client.js`.
- Centralized primary MapLibre CARTO/Esri style and tile URLs in `scripts/config/map-provider-config.js`; layer setup, runtime style choice, and PDF/TIFF tile rendering use that config.
- Added `.github/workflows/ci.yml` for `npm test` and `npm run test:browser` on pushes to `main` and pull requests.
- Added Draft 2020-12 contracts in `schemas/v1/` for circles, zones, normalized bird observations, feedback payloads, and export requests. `docs/api-contracts.md` records provider request/fallback/cache behavior. The GeoJSON repository now rejects malformed feature types, unsupported geometries, and missing circle/zone IDs before caching.
- Added a browser startup request baseline. On desktop Chromium, 1.5 seconds after the Eugene zone map was ready, it observed one GeoJSON request (the selected Eugene dataset) and four CARTO/Esri tile requests. This is a request-count baseline, not a memory or transfer-size profile.

Commits from this continuation, newest first: `4a54864`, `137878e`, `05a38e6`, `7490e09`, `901ddd7`, `4db19e9`, `c79017f`. The Eugene-04 GeoJSON and TopoJSON changes remain outside those commits.

Latest verification: `npm test` passed with 196 tests; `npm run test:browser` passed with 6 Playwright tests; `git diff --check` passed. The browser suite needs permission to bind its local server at `127.0.0.1:4173` in this sandbox.

Remaining decision before changing MapLibre cache/prefetch settings: choose a representative physical mobile device for memory profiling. The desktop browser request baseline does not measure WebGL tile-cache memory. Keep `maxTileCacheSize: 2500` and `prefetchZoomDelta: 8` unchanged until that profile is available. The CI workflow also needs its first GitHub-hosted run to confirm hosted Chrome installation and workflow execution.
