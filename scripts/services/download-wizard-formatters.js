/**
 * Converts GeoJSON to standard KML XML string
 */
export function geojsonToKml(geojson, docName = "CBC Boundary") {
    let placemarks = "";
    const features = geojson.features || (geojson.type === "Feature" ? [geojson] : []);

    features.forEach((feat, idx) => {
        const props = feat.properties || {};
        const title = props.zid ? `Zone ${props.zid}` : props.cid ? `${props.cid} Circle` : `Feature ${idx + 1}`;
        const desc = props.name || props.description || `Christmas Bird Count boundary for ${title}`;
        let geomKml = "";

        if (feat.geometry) {
            const gType = feat.geometry.type;
            const coords = feat.geometry.coordinates;

            if (gType === "Polygon") {
                geomKml = polygonToKml(coords);
            } else if (gType === "MultiPolygon") {
                geomKml = "<MultiGeometry>" + coords.map(p => polygonToKml(p)).join("") + "</MultiGeometry>";
            } else if (gType === "Point") {
                geomKml = `<Point><coordinates>${coords[0]},${coords[1]},0</coordinates></Point>`;
            } else if (gType === "LineString") {
                const lineStr = coords.map(c => `${c[0]},${c[1]},0`).join(" ");
                geomKml = `<LineString><coordinates>${lineStr}</coordinates></LineString>`;
            }
        }

        if (geomKml) {
            placemarks += `
    <Placemark>
      <name>${escapeXml(title)}</name>
      <description>${escapeXml(desc)}</description>
      <Style>
        <LineStyle><color>ff00aaff</color><width>3</width></LineStyle>
        <PolyStyle><color>4000aaff</color></PolyStyle>
      </Style>
      ${geomKml}
    </Placemark>`;
        }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(docName)}</name>
    ${placemarks}
  </Document>
</kml>`;
}

function polygonToKml(coords) {
    let out = "<Polygon><tessellate>1</tessellate>";
    if (coords && coords.length > 0) {
        const outer = coords[0].map(c => `${c[0]},${c[1]},0`).join(" ");
        out += `<outerBoundaryIs><LinearRing><coordinates>${outer}</coordinates></LinearRing></outerBoundaryIs>`;
        for (let i = 1; i < coords.length; i++) {
            const inner = coords[i].map(c => `${c[0]},${c[1]},0`).join(" ");
            out += `<innerBoundaryIs><LinearRing><coordinates>${inner}</coordinates></LinearRing></innerBoundaryIs>`;
        }
    }
    out += "</Polygon>";
    return out;
}

/**
 * Converts GeoJSON to standard GPX XML string
 */
export function geojsonToGpx(geojson, trackName = "CBC Survey Boundary") {
    let trkSegments = "";
    const features = geojson.features || (geojson.type === "Feature" ? [geojson] : []);

    features.forEach((feat) => {
        if (!feat.geometry) return;
        const gType = feat.geometry.type;
        const coords = feat.geometry.coordinates;

        const processRing = (ring) => {
            let pts = "";
            ring.forEach(pt => {
                pts += `      <trkpt lat="${pt[1]}" lon="${pt[0]}"></trkpt>\n`;
            });
            return `    <trkseg>\n${pts}    </trkseg>\n`;
        };

        if (gType === "Polygon" && coords.length > 0) {
            trkSegments += processRing(coords[0]);
        } else if (gType === "MultiPolygon") {
            coords.forEach(poly => {
                if (poly.length > 0) trkSegments += processRing(poly[0]);
            });
        } else if (gType === "LineString") {
            trkSegments += processRing(coords);
        }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fovea Spatial Tools - https://fovea.org" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(trackName)}</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
  <trk>
    <name>${escapeXml(trackName)}</name>
${trkSegments}  </trk>
</gpx>`;
}

function escapeXml(unsafe) {
    if (!unsafe) return "";
    return String(unsafe).replace(/[<>&'"]/g, c => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}
