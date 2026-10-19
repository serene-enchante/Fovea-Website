# Refactor handoff

Updated: 2026-10-19

## Current state

- Repository: `Fovea-Website`
- Active branch: `main` (the `refactor` branch has been merged into `main`)
- Latest refactor commit: `d30a8c0 Extract download wizard app handoff`
- Latest handoff commit: `Record current refactor and CI checkpoint`.
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

- Overall estimate: **about 96%** of the active goals in `docs/refactor-assessment.md`. This is qualitative; the plan has no formal scoring rubric. The core local architecture, integration, schema, contract, and test-workflow priorities are in place. Hosted CI passes with the current pinned Node 24 actions on Ubuntu 24.04; the remaining evidence gate for map cache tuning is physical-device memory profiling.
- `maps/index.html` loads the 310-line `scripts/maps/entry.js` composition root. `scripts/maps-tile.js` is a two-line compatibility import. The entry audit found no cohesive runtime behavior that should move out of the composition root.
- Responsibility-based splits now include: `toolbar-actions.js` (619 lines), `header-view-toggle.js` (90), and `map-toolbar-modal-layout.js` (30); `feedback-form.js` (100), `suggestion-drawing-controller.js` (487), and `suggestion-annotation-layers.js` (133); `mobile-view.js` (337), `mobile-snap-state.js` (63), and `mobile-resize-controller.js` (159). Compatibility exports preserve existing imports where appropriate.
- `download-wizard.js` is now a 486-line workflow controller with separate stepper, selection view, app-handoff/modal, config, formatters, and raster-cache modules. Its GeoJSON loading uses the shared manifest-backed repository while preserving its route-fallback URL order. The extracted `download-wizard-stepper.js` (105 lines), `download-wizard-selection-view.js` (167 lines), and `download-wizard-app-handoff.js` (184 lines) each have focused behavior tests.
- The active map uses provider clients/configuration, request cancellation and timeouts, and deduplicated error messages for the selected basemap. The feedback endpoint remains `no-cors`, so its status is “request sent,” not confirmed acceptance.
- Active GeoJSON data has a manifest with edition, schema version, source, bounds, and checksums. Versioned Draft 2020-12 schemas and provider/API contracts are present. The workflow `.github/workflows/ci.yml` runs unit and browser checks on main pushes and pull requests. The workflow now pins verified Node 24 action releases, uses Node 24 and Ubuntu 24.04, and grants only `contents: read`; the hosted run on `ed683d8` passed without the earlier runner notices.
- Latest local verification: 217 unit tests and 10 Playwright tests pass; `git diff --check` passes. The browser suite covers route selection, downloads, feedback drawing, header view toggle, responsive toolbar-modal placement, and mobile navigation. Desktop request measurements do not estimate WebGL cache memory.
- Do not change `maxTileCacheSize: 2500` or `prefetchZoomDelta: 8` until profiling on a representative physical mobile device and browser. The user currently has no physical-device test setup; this is the only remaining evidence gate for cache tuning and needs no immediate setup to continue non-performance work. Refactor commits through `d30a8c0` were pushed to `origin/main` with the user's authorization. Preserve the existing Eugene-04 working-tree edits outside refactor commits. At handoff, hosted CI (`39330748440`) and Pages deployment (`39330748652`) for `d30a8c0` were still running; local unit/browser checks pass.

For the next worker: start with `git status --short --branch`; keep the existing Eugene-04 GeoJSON edit and untracked TopoJSON out of refactor commits. The stylesheet split is a structure-only change: its partials are contiguous source sections imported in order, and their concatenation matched the pre-split file byte for byte. Keep `page-maps-tile.css` as the public entry path and preserve imports in order. Use the latest test counts above rather than older counts in the historical log.

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

Earlier work and the overall rationale/order are recorded in [refactor-assessment.md](./refactor-assessment.md). The live map boots from the 310-line composition root `scripts/maps/entry.js`; `scripts/maps-tile.js` is a two-line compatibility import.

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
5. The map entry/controller audit is complete. Treat `docs/refactor-assessment.md` as architectural rationale and this handoff's progress snapshot plus latest continuation entries as current status; refresh them when implementation evidence changes.

## Important implementation context

- `maps/index.html` loads the 310-line composition root `scripts/maps/entry.js`. `scripts/maps-tile.js` is a two-line compatibility import; avoid broad rewrites or switching the live page wholesale to partial modules.
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
- `scripts/components/map-modals.js` accepts app state, browser APIs, notifications, and shortcut actions through `setupHelpModeSystem`; production wiring lives in `scripts/maps/entry.js`.
- `scripts/map/map-proximity.js` owns cursor proximity tracking and the glow canvas; the live map entry calls both shared setup functions.
- `scripts/map/map-viewport.js` owns pointer effects, resize invalidation, fullscreen classes, and mobile home animation; the map entry injects layout and map callbacks.
- `scripts/map/map-runtime.js` owns production MapLibre construction and composes layer, control, canvas-event, and viewport setup; `scripts/maps/entry.js` supplies state and page-specific actions.
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

Commits from this continuation, newest first: `e0b3d80`, `4cc1780`, `d416170`, `b98aa67`, `fa2b48a`, `d4bdd1f`, `8637fad`, `07f3392`, `e53f621`, `78b90d5`, `b1e581b`, `4a54864`, `137878e`, `05a38e6`, `7490e09`, `901ddd7`, `4db19e9`, `c79017f`. The Eugene-04 GeoJSON and TopoJSON changes remain outside those commits.

Latest verification: `npm test` passed with 200 tests; `npm run test:browser` passed with 7 Playwright tests; `git diff --check` passed. The browser suite needs permission to bind its local server at `127.0.0.1:4173` in this sandbox.

At that October 19 checkpoint, device profiling and the first hosted CI run were still pending. The initial CI run and the post-hardening run have since passed; physical-device cache profiling remains pending.

Follow-up audit: removed the unreferenced `loadBirdData()` helper from `scripts/services/bird-data-service.js`; it had eagerly loaded all three datasets and duplicated the route-scoped production repository. Commit: `b1e581b`. Verification remained green at 196 unit tests and six browser tests.

Latest follow-up: the home-page globe now reads CARTO vector style URLs from the same config used by the map runtime, with browser coverage for home-globe initialization. Commit: `e53f621`. Latest checks: 196 unit tests, seven Playwright tests, and `git diff --check` all pass. The remaining performance decision is still the target physical mobile device for profiling the MapLibre tile cache; do not change the cache/prefetch settings until that profile is available.

Manifest follow-up: active entries now include a dataset edition, schema version, served filename, source QMD, WGS84 bounds, and SHA-256 checksum. Tests verify those fields against the committed active datasets, and the download wizard derives its filenames from the manifest. Commit: `8637fad`; verification passed with 196 unit tests and seven Playwright tests.

Request-cancellation follow-up: map navigation now aborts stale GeoJSON loads, while deduplicated requests remain active as long as another consumer needs them. The GeoJSON repository and selection controller tests cover cancellation, shared requests, and stale-response handling. Commit: `fa2b48a`; verification passed with 200 unit tests and seven Playwright tests.

Startup-measurement follow-up: the Playwright baseline now logs map-ready time and same-origin JavaScript transfer/decoded bytes in addition to GeoJSON and tile request counts. One local desktop Chromium run measured 571 ms to map-ready, 77 same-origin JS resources (470,171 transfer bytes; 447,071 decoded bytes), one selected GeoJSON request, and four CARTO/Esri tile requests 1.5 seconds after ready. Commit: `4cc1780`. These measurements exclude cross-origin assets and WebGL tile-cache memory; only physical-device profiling can answer the remaining cache question.

Latest continuation (2026-10-19):

- Audited `scripts/maps/entry.js` and `scripts/maps-tile.js`. The entry is a 310-line composition root with callback adapters for legacy-map file sharing and selection/style wiring; `maps-tile.js` is a two-line compatibility import. No broad extraction is justified from the current entry. Moved the Leaflet-era `invalidateSize()` bridge from the entry's global prototype mutation to `createMapInstance()` in `scripts/map/map-init.js`, where MapLibre construction owns that compatibility behavior. Existing implementations are preserved.
- Selected-bird iNaturalist requests now abort when a different bird is selected or selection is cleared. Observation, taxon photo, and feedback provider requests share a 15-second timeout/cancellation helper. The API contract lists these timeout and failure behaviors. This does not change retry behavior or the feedback endpoint contract.
- Commits from this continuation: `c1b7c5c` (MapLibre compatibility bridge moved into runtime); `ed7d6da` (provider cancellation and timeout behavior).
- The download wizard now uses the shared repository for path fallback, validation, cancellation, deduplication, and error cleanup while preserving its candidate URL order. Commit: `2dd7ea1`.
- Verification: 207 unit tests pass; 7 browser tests pass; `git diff --check` passes. Latest desktop Chromium sample: ready 526 ms; 78 same-origin JS resources, 474,459 transfer bytes and 451,059 decoded bytes; after 1.5 seconds, one GeoJSON and four CARTO/Esri tile requests.
- Remaining validation: profile MapLibre cache memory on a representative physical mobile device and browser before changing `maxTileCacheSize: 2500` or `prefetchZoomDelta: 8`. The user has no physical-device setup yet. Hosted CI passed on `ed683d8` with Node 24, pinned actions, and Ubuntu 24.04. Active-basemap provider errors now have a deduplicated user-facing message; no generic telemetry or logging was added.
- The 953-line wizard controller was recently audited and its stepper/navigation/view responsibility extracted to `download-wizard-stepper.js`; the controller is now 850 lines and the new component is 105 lines. `npm test` passes 213 tests and `npm run test:browser` passes 10 tests.
- Keep `geojson/Eugene-04-wgs84.geojson` and untracked `geojson/Eugene-04-wgs84-10m.topojson` out of refactor commits.

Provider error follow-up: `scripts/map/map-provider-errors.js` now maps recognized MapLibre source/URL errors to a deduplicated connection message only when that provider matches the active basemap. Unknown sources and errors from inactive CARTO/Esri layers are ignored. API contract updated; 209 unit tests and 7 browser tests pass; `git diff --check` passes. Commit: `38ab68a`.

Checkpoint after provider error mapping: verification then was 209 passing unit tests and 7 passing browser tests. The map entry audit, provider timeouts/cancellation/error messages, manifest-backed wizard data loading, schemas/contracts, and CI workflow were in place. Remaining work was a representative physical mobile device/browser for MapLibre memory profiling and a GitHub-hosted CI run after publishing the local `main` commits. Keep cache/prefetch settings unchanged and do not push without the user's explicit request.

Feedback-form cohesion follow-up: split map annotation layer setup into `suggestion-annotation-layers.js` (133 lines), drawing interactions/state into `suggestion-drawing-controller.js` (487 lines), and left feedback submission orchestration in `feedback-form.js` (101 lines). Added idempotent layer tests and a browser smoke check that opens suggest mode, draws a marker, and verifies the locked state. Commit: `6ba4a8e`; verification: 211 unit tests and 8 browser tests pass, and `git diff --check` passes. No refactor source file added in this slice exceeds the 500-line soft target.

Mobile view follow-up: retained `mobile-view.js` as the existing compatibility entry while moving snap-state layout to `mobile-snap-state.js` (63 lines) and resize-bar dragging to `mobile-resize-controller.js` (159 lines). `mobile-view.js` is now 337 lines. Existing callers and public exports continue through the compatibility module. Commit: `ffd2591`; latest verification remains 211 passing unit tests, 8 passing browser tests, and `git diff --check`.

Toolbar cohesion follow-up: moved the independent header view-toggle menu to `header-view-toggle.js` (90 lines), retained its old `toolbar-actions.js` export as a compatibility path, and wired the map UI to the focused component. `toolbar-actions.js` is now 644 lines. Browser smoke coverage verifies menu open, selection label update, and close behavior. Commit: `35ccbcc`; latest verification: 211 passing unit tests, 9 passing browser tests, and `git diff --check`.

Responsive toolbar layout follow-up: moved modal/action-row reparenting into `map-toolbar-modal-layout.js` (30 lines), with a cleanup function for its resize listener. The existing toolbar setup delegates to it. Browser coverage verifies desktop and mobile parent placement. Commit: `797e45c`; verification: 211 passing unit tests, 10 passing browser tests, and `git diff --check`. `toolbar-actions.js` is now 619 lines.
