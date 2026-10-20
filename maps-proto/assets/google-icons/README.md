# Google Material Symbols

This folder contains the locally hosted **Material Symbols Rounded** WOFF2
subset used by the maps prototype. The subset currently includes these ligature
names: `account_circle`, `add`, `build`, `chevron_left`, `chevron_right`,
`dark_mode`, `deselect`, `edit`, `expand_more`, `explore`, `help`, `home`, `keyboard`,
`light_mode`, `north_west`, `redo`, `remove`, `restart_alt`, `select_all`,
`settings`, `undo`, and `visibility`.

The font file is served locally to avoid a runtime dependency on Google Fonts.
`material-symbols-rounded.css` defines the font face with `font-display: swap`
and the shared ligature class; page-specific sizing and axes remain in the
component styles.

To add icons, update the `icon_names` list in the Google Fonts CSS2 request,
download the generated WOFF2 file, and replace this subset. Keep the CSS family
name and the page's `font-variation-settings` axes aligned with the requested
font axes.

Source: Google Fonts CSS2 API, Material Symbols Rounded, variable subset
`account_circle,add,build,chevron_left,chevron_right,dark_mode,deselect,edit,expand_more,explore,help,home,keyboard,light_mode,north_west,redo,remove,restart_alt,select_all,settings,undo,visibility`, variable axes `opsz,wght,FILL,GRAD` (Google font version v378).

Material Symbols are provided by Google under the Apache License 2.0. See
[`LICENSE`](./LICENSE).
