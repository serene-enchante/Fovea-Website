# Refactor handoff

Updated: 2026-10-11

## Current state

- Repository: `Fovea-Website`
- Active branch: `main` (the `refactor` branch has been merged into `main`)
- Latest refactor commit before this handoff: `9549a86 use shared feedback form component`
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

The browser suite starts a server on `127.0.0.1:4173`. In this environment it needs the sandbox permission that allows Playwright's local web server to bind that address. Warnings about `NO_COLOR` versus `FORCE_COLOR` are benign.

## Next steps for the next agent

1. Check `git status --short --branch` first and preserve the two GeoJSON changes listed above.
2. Continue from `main`. Make one coherent, reviewable refactor slice at a time.
3. Run `npm test`, `npm run test:browser`, and `git diff --check` for each code slice, then commit only the intended refactor files to `main`.
4. Reuse existing shared boundaries when behavior matches. Where the live map intentionally differs (notably `legacy-map` iOS share metadata), inject its current callback rather than silently changing behavior.
5. Refer to `docs/refactor-assessment.md` for the remaining larger priorities. The highest-value unresolved work includes establishing the map entry/controller boundary, completing one-source-of-truth integration clients, and gradually migrating remaining bird/sidebar/modal/map behavior out of `scripts/maps-tile.js`.

## Important implementation context

- `scripts/maps-tile.js` remains the production map entry and is still large. Avoid broad rewrites or switching the live page wholesale to the partial modules.
- `scripts/components/toolbar-actions.js` now exports `setupSpatialDownloadButtons({ shareFile, notify, downloadPdf, downloadTiff })`. Its defaults use the modular download functions; the production map passes its legacy share/export callbacks.
- `scripts/map/map-rendering.js` is the shared owner of the raster cache and layout canvas rendering. The map entry keeps local PDF/TIFF wrappers because their handoff behavior uses the legacy file-sharing service profile.
- `scripts/services/ebird-links.js` owns eBird link lookup. Species IDs and fallback URL normalization were moved without changing behavior.
- Preserve public map URLs and query parameters (`circle`, `cid`, `feature`, `zone`, `id`) and keep desktop/mobile smoke flows working.
