// Available Count Circles Catalog
export const COUNT_CIRCLES = [
    {
        id: "eugene",
        name: "Eugene",
        subtitle: "Lane County, Oregon · 29 Zones",
        totalZones: 29,
        geojsonPath: "geojson/Eugene-05-wgs84.geojson",
        thumbnail: "images/logo-small.png",
        hasData: true
    },
    {
        id: "florence",
        name: "Florence",
        subtitle: "Coastal Oregon · 14 Zones",
        totalZones: 14,
        geojsonPath: "geojson/Florence-00-wgs84.geojson",
        thumbnail: "images/florence.png",
        hasData: true
    },
    {
        id: "cottage-grove",
        name: "Cottage Grove",
        subtitle: "Lane County, Oregon · No Data",
        totalZones: 0,
        geojsonPath: "geojson/circles-wgs84.geojson",
        circleFid: 2,
        hasData: false
    },
    {
        id: "oakridge",
        name: "Oakridge",
        subtitle: "Cascade Foothills · No Data",
        totalZones: 0,
        geojsonPath: "geojson/circles-wgs84.geojson",
        circleFid: 3,
        hasData: false
    }
];

// App Instructions Configuration (Identical to Maps Page)
export const APP_INSTRUCTION_CONFIGS = {
    avenza: {
        appName: "Avenza Maps",
        scheme: "avenzamaps://",
        formatKey: "geopdf",
        ext: "pdf",
        iconSrc: "images/app_icons/avenza.webp",
        step1Heading: "Download the GeoPDF",
        step2Heading: "Open in Avenza Maps",
        step2Text: "Tap <strong class=\"avenza-ui-badge\">Download</strong> above, then select <strong class=\"avenza-ui-badge\">Open in Avenza Maps</strong> from the share sheet."
    },

    gaia: {
        appName: "Gaia GPS",
        scheme: "gaiagps://",
        formatKey: "gpx",
        ext: "gpx",
        iconSrc: "images/app_icons/gaia.webp",
        step1Heading: "Download the GPX File",
        step2Heading: "Import into Gaia GPS",
        step2Text: "Tap <strong class=\"avenza-ui-badge\">Download</strong> above, then tap <strong class=\"avenza-ui-badge\">Open in Gaia GPS</strong> to import the boundary."
    },
    caltopo: {
        appName: "CalTopo",
        scheme: "caltopo://",
        formatKey: "gpx",
        ext: "gpx",
        iconSrc: "images/app_icons/caltopo.webp",
        step1Heading: "Download the GPX File",
        step2Heading: "Import into CalTopo",
        step2Text: "Download the file and open it with CalTopo to overlay the zone on USGS quad or custom layers."
    },
    osmand: {
        appName: "OsmAnd Maps",
        scheme: "osmand://",
        formatKey: "gpx",
        ext: "gpx",
        iconSrc: "images/app_icons/osmandmaps.webp",
        step1Heading: "Download the GPX File",
        step2Heading: "Open with OsmAnd",
        step2Text: "Tap <strong class=\"avenza-ui-badge\">Download</strong>, then choose <strong class=\"avenza-ui-badge\">OsmAnd Maps</strong> to import the boundary track."
    }
};
