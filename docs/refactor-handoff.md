# Refactor handoff

Updated: 2026-10-11

## Current state

- Repository: `Fovea-Website`
- Active branch: `main` (the `refactor` branch has been merged into `main`)
- Latest refactor commit before this slice: `ab784b2 share bird observation cards and popups`
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
| `HEAD` | Move the bird sidebar summary panel into `bird-observation-view.js`, keeping navigation as a render callback. |
| `4f55ebf` | Share GeoJSON, KMZ, and GPX download button bindings through the same helper, injecting the legacy map share callback where needed. |
| `68c2247` | Reuse the toolbar's `generateAppSpatialBlob` implementation from the live map and remove its duplicate. |
| `54c5a22` | Remove unused duplicate `MAP_STYLES` objects and unused `scripts/config/map-styles.js`. |
| `0109ca2` | Extract the eBird species-code table and URL builder into `scripts/services/ebird-links.js`. |
| `5c9f4a4` | Reuse the shared mobile-view map control positioning helper. |
| `33a8e27` | Remove an unused stale viewport/fullscreen implementation from `scripts/map/map-rendering.js`. |
| `d006702` | Consolidate raster cache ownership in `scripts/map/map-rendering.js`; retain the live map's legacy sharing wrappers. |

Earlier work and the overall rationale/order are recorded in [refactor-assessment.md](./refactor-assessment.md). The live map still boots from `scripts/maps-tile.js`; this is an incremental migration, not yet a switch to a new entry point.

## Verification

After the latest code commit (`d2c0c02`):

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
- `scripts/map/map-rendering.js` is the shared owner of the raster cache and layout canvas rendering. The map entry keeps local PDF/TIFF wrappers because their handoff behavior uses the legacy file-sharing service profile.
- `scripts/map/map-layers.js` owns production feature styling and the HTML zone/circle label renderer. The map entry injects bird-observation layer styling through the `updateAdditionalLayers` callback.
- `scripts/map/map-proximity.js` owns cursor proximity tracking and the glow canvas; the live map entry calls both shared setup functions.
- `scripts/components/image-lightbox.js` owns lightbox opening and close-event setup. `map-modals.js` owns help-mode shortcuts and interactions.
- `scripts/components/bird-observation-view.js` owns bird summary panels, observation cards, map popup content, and the popup lifecycle used by map clicks and sidebar cards; the map entry injects the callback that renders the full observation tab.
- `scripts/services/ebird-links.js` owns eBird link lookup. Species IDs and fallback URL normalization were moved without changing behavior.
- Preserve public map URLs and query parameters (`circle`, `cid`, `feature`, `zone`, `id`) and keep desktop/mobile smoke flows working.
