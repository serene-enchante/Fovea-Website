# Maps Proto

`maps-proto` is an isolated prototype for the map-oriented experience. Keep its page code, styles, content data, and page assets inside this directory so it can evolve without inheriting the legacy site's implicit structure.

This is **page-level independence**, not a separate repository or package: it shares the repository's Git history and root-level developer tooling. Treat the rest of the site as a separate legacy application. Reuse an existing pattern from it only after checking that the pattern is explicit, portable, and appropriate here.

## Run locally

From the repository root, start any static HTTP server. For example:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/maps-proto/>. The page uses native JavaScript modules and fetches JSON, so serve it over HTTP rather than opening `index.html` with `file://`.

There is currently no maps-proto-specific build, bundler, or package manifest. Files are served as-is. Root `package.json` scripts and dependencies are repository-wide and mostly serve the older site; do not assume they build or test this prototype.

## Boundaries and layout

```text
maps-proto/
  index.html                 Page shell and explicit stylesheet/module entrypoints
  *.json                     Pluggable directory, context, toolbar, and dormant tab data
  assets/google-icons/       Locally hosted Material Symbols Rounded subset and license
  assets/geojson/            Local Eugene and Florence CBC boundary data
  scripts/
    index.js                 Composition root: load data, create and connect the UI
    components/              UI pieces and their interactions
    data/                    Data loading helpers
    layout/                  Shared frame layout/state-to-layout behavior
    state/                   Global view and selected-page state engine
  styles/
    frame-layout.css         Overall frame geometry and layout
    components/              Component-specific styles
    frames/                  Reusable frame materials and shared animation rules
```

The composition root should remain the place where components are assembled. Components should receive the data and callbacks they need; avoid having them reach into unrelated DOM, fetch their own global configuration, or depend on implicit site-wide globals.

`scripts/state/app-state.js` owns both the current page view and current selection. Directory items emit a page-selection event; the composition root commits it to the state engine and updates the map content, context data, and selected tab name from that one selection. Add selection-specific context paths to directory item data rather than coupling components to particular pages.

The same state engine owns the active content lens (`image`, `maps`, `people`, or `graph`), defaulting to `maps`. Lens changes rerender the content frame without changing the selected item or its context. Directory items can supply optional `content.people` records (`name`, optional `role`) and `content.results` records (`label`, numeric `value`) for the people and graph lenses; the lenses show an empty state when those data are not present. The maps lens loads MapLibre on demand and uses optional per-item map settings such as a center, zoom, and GeoJSON boundary source.

## Content data

- `directory.json` defines the organization and directory sections, including each section's `view` choice (for example, list or tile presentation). Add or change directory content there rather than hardcoding it in a component.
- `context.json` provides the current sample context and its actions, sections, and items. Context-specific content should remain data-driven so the same frame can render different contexts at runtime.
- `toolbar.json` defines toolbar groups and options.
- `tabs.json` and `scripts/components/tabs-frame.js` are retained for possible future use, but the tabs frame is currently dormant and is not part of the active composition. Do not re-enable it implicitly while changing another feature.

When extending a JSON shape, keep the renderer generic, make optional fields genuinely optional, and provide sensible empty states. Avoid encoding one organization's content or a one-off interaction into a shared component.

## Styling and composition rules

- Prefer composing existing components and frame materials over introducing a parallel frame or one-off implementation.
- Keep geometry/layout, component appearance, frame material, and animation responsibilities distinct. `styles/frames/` holds reusable material styles; `styles/components/` owns component-specific presentation; shared motion belongs in `styles/frames/animations.css` where practical.
- Keep CSS selectors scoped to their component or explicit layout root. Do not rely on broad legacy selectors or undocumented cascade order.
- `index.html` lists stylesheet entrypoints explicitly. Add a stylesheet there when introducing a new file, and keep the order intentional when one layer depends on another.
- The former share-card flip treatment is retained but inactive in `styles/archive/share-card-flip.css`; the live Share view uses the same overlay-frame transition as other context sections.
- Keep page assets local where practical. The Material Symbols subset is vendored under `assets/google-icons/`; its README and license describe the asset. Avoid adding a CDN dependency for assets already available locally. The current QR image flow uses the external `api.qrserver.com` service; account for that network dependency if changing QR generation or offline behavior.
- The Maps lens loads MapLibre GL JS on demand from unpkg and uses CARTO's Positron style and tiles. Those services require a network connection. Keep the integration page-scoped and load the library only when the Maps lens is opened.

## File size and maintenance

Keep files comfortably below 500 lines when possible; 1,000 lines is a hard ceiling. Split by cohesive responsibility (for example, rendering versus interaction), not just to reduce a line count. Before adding a helper or component, search this directory for an existing capability that can be reused or extended.

Some existing files are already over the soft target, notably `scripts/components/context-pane.js` and `styles/components/context-pane.css`. If your work touches them substantially, consider a focused extraction with clear ownership. Avoid broad rewrites unrelated to the requested change, and preserve current behavior while refactoring.

## Checks and tests

There are no dedicated maps-proto tests at present. The root `npm test` and Playwright suite cover the wider legacy site; they should not be represented as prototype coverage. Do not add or run tests unless the task asks for verification. For normal code changes, keep the diff scoped, inspect the affected page in the browser when appropriate, and use lightweight checks such as `git diff --check` without implying that they validate runtime behavior.

## Handoff checklist

1. Check `git status` before editing. Preserve unrelated in-progress changes; do not reset or reformat files outside your task.
2. Keep page-specific code and assets under `maps-proto/`. Do not import legacy scripts or styles just because they are nearby.
3. Follow the existing composition and JSON-driven content patterns; reuse before creating.
4. Keep frame material styles separate from component behavior and keep file sizes within the guidelines above.
5. Be explicit about remaining external dependencies and what was or was not verified.
