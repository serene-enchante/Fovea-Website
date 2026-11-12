# Eugene and Lane County surface water

`eugene-lane-surface-water.geojson` is retained as a fallback display layer for larger waterbody polygons. Its runtime layer is temporarily disabled while CARTO's native water detail is evaluated. It contains USGS NHDPlus High Resolution waterbody polygons (`NHDWaterbody`, layer 9) of at least 0.05 km². Stream-river area polygons from `NHDArea` were excluded because the returned geometries render as oversized filled areas at the map's extent. Larger rivers continue to use the basemap's waterway line geometry.

The query envelope was longitude -123.8 to -122.2 and latitude 43.5 to 44.3 (EPSG:4326). Source geometry is retained without simplification to preserve shoreline detail; coordinates are rounded to five decimal places. The layer contains 79 valid polygons, including Fern Ridge Lake. It is supplemental; the CARTO vector basemap continues to provide its own water and waterway data.

Source service: [USGS NHDPlus HR MapServer](https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer). The USGS hydrography data are public domain; see [USGS National Map data access](https://www.usgs.gov/national-hydrography/access-national-hydrography-products).
