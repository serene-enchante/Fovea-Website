# Eugene and Lane County surface water

`eugene-lane-surface-water.geojson` is a compact display layer for larger surface-water polygons that are missing or too faint in the remote basemap tiles. It combines USGS NHDPlus High Resolution waterbody polygons (`NHDWaterbody`, layer 9) of at least 0.05 km² with stream-river area polygons (`NHDArea`, layer 8) of at least 0.05 km².

The query envelope was longitude -123.8 to -122.2 and latitude 43.5 to 44.3 (EPSG:4326). Coordinates were rounded to five decimal places for display. This layer contains 102 polygons, including Fern Ridge Lake. It is supplemental; the CARTO vector basemap continues to provide its own water and waterway data.

Source service: [USGS NHDPlus HR MapServer](https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer). The USGS hydrography data are public domain; see [USGS National Map data access](https://www.usgs.gov/national-hydrography/access-national-hydrography-products).
