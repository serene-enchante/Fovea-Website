# Google Material Symbols

This folder contains the locally hosted **Material Symbols Rounded** WOFF2
subset used by the maps prototype. The subset currently includes these ligature
names: `build`, `explore`, `home`, and `settings`.

The font file is served locally to avoid a runtime dependency on Google Fonts.
`material-symbols-rounded.css` defines the font face with `font-display: swap`
and the shared ligature class; page-specific sizing and axes remain in the
component styles.

To add icons, update the `icon_names` list in the Google Fonts CSS2 request,
download the generated WOFF2 file, and replace this subset. Keep the CSS family
name and the page's `font-variation-settings` axes aligned with the requested
font axes.

Source: Google Fonts CSS2 API, Material Symbols Rounded, subset `build,explore,home,settings`, variable axes `opsz,wght,FILL,GRAD` (Google font version v378).

Material Symbols are provided by Google under the Apache License 2.0. See
[`LICENSE`](./LICENSE).
