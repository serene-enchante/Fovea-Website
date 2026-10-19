# Data and provider contracts

Updated: 2026-10-19

## Versioned data contracts

JSON Schemas use JSON Schema Draft 2020-12 and the stable `https://fovea.org/schemas/v1/` IDs:

| Contract | Schema | Current owner |
| --- | --- | --- |
| Count-circle FeatureCollection (`properties.cid`) | [`circles.schema.json`](../schemas/v1/circles.schema.json) | `geo-data-repository.js` |
| Zone FeatureCollection (`properties.zid`; legacy Eugene `id` may be null/string) | [`zones.schema.json`](../schemas/v1/zones.schema.json) | `geo-data-repository.js` |
| Normalized observation Point FeatureCollection | [`bird-observations.schema.json`](../schemas/v1/bird-observations.schema.json) | `bird-selection-controller.js` |
| Suggestion title, description, and annotation GeoJSON | [`feedback-payload.schema.json`](../schemas/v1/feedback-payload.schema.json) | `feedback-form.js` and `feedback-client.js` |
| Portable export request | [`export-request.schema.json`](../schemas/v1/export-request.schema.json) | Future HTTP boundary; current exports are browser-local |

The map repository enforces the active datasets' required feature type, polygon geometry family, and circle/zone identifiers before caching a response. `tests/geo-data-repository.test.js` runs that validation against all files in the active manifest and exercises invalid data. The JSON schema files are the fuller interchange contract; a future service should validate them with a Draft 2020-12 implementation.

The active map manifest records each dataset's source edition, schema version, served filename, source QMD file, WGS84 bounds, and SHA-256 checksum. The repository test checks the checksums and bounds against the committed active files. The download wizard derives its GeoJSON filenames from this manifest so it cannot silently keep an old Eugene or Florence file path.

## Provider contracts

| Provider / use | Request and normalization | Cache, timeout, retry | Failure behavior |
| --- | --- | --- | --- |
| iNaturalist observations (`scripts/services/observations-client.js`) | `GET /observations` with taxon name, selected geometry bounds, `per_page=100`, newest first. The selection controller filters returned points against the selected polygon and normalizes them to the observation schema. | No client cache or explicit timeout. Retries once with `q` when the taxon-name response is empty or unusable. | Throws if both observation queries fail; UI clears prior selection and renders the empty state. |
| iNaturalist taxon photo | `GET /taxa?q=...`; returns the first `default_photo` or `null`. | No client cache or explicit timeout/retry. | Returns `null`; observation UI keeps its photo fallback. |
| QR images (`scripts/services/qr-image-service.js`) | Print export uses qrserver PNG URL; share modal uses QuickChart with transparent light modules and theme-selected dark color. | Print image loading resolves `null` after 3 seconds. Share modal relies on image load/error events. No client cache/retry. | Print renderer can continue without the QR image; share modal lowers image opacity. |
| Feedback (`scripts/services/feedback-client.js`) | `POST` JSON text to the deployed Google Apps Script endpoint using `text/plain` and `mode: no-cors`. | No timeout or retry. | A resolved fetch only means the browser sent the request. Its opaque response cannot confirm acceptance; the UI says “request sent.” Network rejection is shown as a failure. |
| Map tiles and styles | MapLibre uses CARTO vector styles and dark raster tiles, plus Esri imagery, street, and topographic tiles. PDF/TIFF rendering uses Esri topographic tiles. | Controlled by MapLibre and the browser; no app-level request retry or telemetry. | Provider/network behavior is surfaced by MapLibre/browser; there is no provider-specific error message today. |

The feedback API cannot provide confirmed submission status until its server responds with CORS-enabled structured JSON. The client currently preserves the deployed request format and does not change the endpoint behavior.

## Performance baseline

The active map entry calls `loadFeaturesForMapView` with the route's initial view, so startup requests one GeoJSON dataset; later views load on demand and the repository caches successful requests by manifest ID. There is no low-resolution tile-preload loop in the current production map modules. The app still sets `maxTileCacheSize: 2500` and `prefetchZoomDelta: 8` in `map-runtime.js`. The current Playwright project exercises desktop Chromium and a mobile viewport, but does not collect tile-byte, startup request, or device-memory measurements. Keep those MapLibre values unchanged until representative mobile profiling establishes a useful baseline.
