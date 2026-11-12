# Eugene and Lane County surface water

`eugene-lane-surface-water.geojson` supplies large-lake geometry while CARTO's native tiles omit those lakes at overview zooms. It contains USGS NHDPlus High Resolution waterbody polygons (`NHDWaterbody`, layer 9) of at least 1 km². The layer displays from zoom 6 through 13 and fades out as CARTO's native detail becomes available. Stream-river area polygons from `NHDArea` are excluded; larger rivers use the basemap's waterway line geometry.

The query envelope was longitude -123.8 to -122.2 and latitude 43.5 to 44.3 (EPSG:4326). Source geometry is retained without simplification to preserve shoreline detail; coordinates are rounded to five decimal places. The layer contains 12 valid polygons, including Fern Ridge Lake. It supplements the CARTO vector basemap's own water and waterway data.

Source service: [USGS NHDPlus HR MapServer](https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer). The USGS hydrography data are public domain; see [USGS National Map data access](https://www.usgs.gov/national-hydrography/access-national-hydrography-products).
