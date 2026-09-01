export function geojsonToKml(geojson, docName = "Map Data") {
    function esc(str) {
        if (str === null || str === undefined) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function coordsToKml(coords) {
        return coords.map(c => `${c[0]},${c[1]}${c[2] !== undefined ? ',' + c[2] : ''}`).join(' ');
    }

    function geometryToKml(geom) {
        if (!geom) return '';
        switch (geom.type) {
            case 'Point':
                return `<Point><coordinates>${geom.coordinates[0]},${geom.coordinates[1]}</coordinates></Point>`;
            case 'LineString':
                return `<LineString><coordinates>${coordsToKml(geom.coordinates)}</coordinates></LineString>`;
            case 'Polygon':
                return `<Polygon>${geom.coordinates.map((ring, i) => 
                    i === 0 
                        ? `<outerBoundaryIs><LinearRing><coordinates>${coordsToKml(ring)}</coordinates></LinearRing></outerBoundaryIs>`
                        : `<innerBoundaryIs><LinearRing><coordinates>${coordsToKml(ring)}</coordinates></LinearRing></innerBoundaryIs>`
                ).join('')}</Polygon>`;
            case 'MultiPolygon':
                return `<MultiGeometry>${geom.coordinates.map(polyCoords => 
                    geometryToKml({ type: 'Polygon', coordinates: polyCoords })
                ).join('')}</MultiGeometry>`;
            case 'MultiPoint':
                return `<MultiGeometry>${geom.coordinates.map(ptCoords => 
                    geometryToKml({ type: 'Point', coordinates: ptCoords })
                ).join('')}</MultiGeometry>`;
            case 'MultiLineString':
                return `<MultiGeometry>${geom.coordinates.map(lineCoords => 
                    geometryToKml({ type: 'LineString', coordinates: lineCoords })
                ).join('')}</MultiGeometry>`;
            case 'GeometryCollection':
                return `<MultiGeometry>${geom.geometries.map(g => geometryToKml(g)).join('')}</MultiGeometry>`;
            default:
                return '';
        }
    }

    const features = geojson.type === 'FeatureCollection' ? geojson.features : (geojson.type === 'Feature' ? [geojson] : []);
    
    const kmlPlacemarks = features.map(f => {
        const props = f.properties || {};
        const title = esc(props.name || props.zid || props.cid || props.title || "Feature");
        const descData = Object.entries(props)
            .map(([k, v]) => `<b>${esc(k)}:</b> ${esc(v)}`)
            .join('<br/>');
        return `
    <Placemark>
      <name>${title}</name>
      <description><![CDATA[${descData}]]></description>
      ${geometryToKml(f.geometry)}
    </Placemark>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(docName)}</name>${kmlPlacemarks}
  </Document>
</kml>`;
}

export function geojsonToGpx(geojson, docName = "Map Data") {
    function esc(str) {
        if (str === null || str === undefined) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    const features = geojson.type === 'FeatureCollection' ? geojson.features : (geojson.type === 'Feature' ? [geojson] : []);
    let gpxWpts = "";
    let gpxTrks = "";

    features.forEach(f => {
        const props = f.properties || {};
        const title = esc(props.name || props.zid || props.cid || props.title || "Feature");
        const geom = f.geometry;
        if (!geom) return;

        function processLine(coords, trkName) {
            const pts = coords.map(c => `<trkpt lat="${c[1]}" lon="${c[0]}"/>`).join('\n        ');
            return `
  <trk>
    <name>${trkName}</name>
    <trkseg>
        ${pts}
    </trkseg>
  </trk>`;
        }

        if (geom.type === 'Point') {
            gpxWpts += `
  <wpt lat="${geom.coordinates[1]}" lon="${geom.coordinates[0]}">
    <name>${title}</name>
  </wpt>`;
        } else if (geom.type === 'LineString') {
            gpxTrks += processLine(geom.coordinates, title);
        } else if (geom.type === 'MultiLineString') {
            geom.coordinates.forEach((line, idx) => {
                gpxTrks += processLine(line, `${title} (${idx + 1})`);
            });
        } else if (geom.type === 'Polygon') {
            geom.coordinates.forEach((ring, idx) => {
                const ringName = idx === 0 ? title : `${title} (Hole ${idx})`;
                gpxTrks += processLine(ring, ringName);
            });
        } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach((poly, polyIdx) => {
                poly.forEach((ring, ringIdx) => {
                    const ringName = ringIdx === 0 ? `${title} (Part ${polyIdx + 1})` : `${title} (Part ${polyIdx + 1} Hole ${ringIdx})`;
                    gpxTrks += processLine(ring, ringName);
                });
            });
        }
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Fovea Web Map" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(docName)}</name>
  </metadata>${gpxWpts}${gpxTrks}
</gpx>`;
}

export function canvasToTiffBlob(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.getImageData(0, 0, width, height);
    const rgba = imgData.data;

    const numPixels = width * height;
    const rgb = new Uint8Array(numPixels * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
        rgb[j] = rgba[i];       // R
        rgb[j + 1] = rgba[i + 1]; // G
        rgb[j + 2] = rgba[i + 2]; // B
    }

    const imageByteCount = rgb.length;
    const headerSize = 8;
    const ifdOffset = headerSize + imageByteCount;
    const numEntries = 12;
    const ifdSize = 2 + (numEntries * 12) + 4;
    const valueDataOffset = ifdOffset + ifdSize;

    // Value offsets for multi-byte tags
    const bitsOffset = valueDataOffset; // 6 bytes (3 * uint16)
    const xResOffset = bitsOffset + 6;  // 8 bytes (2 * uint32: 400, 1)
    const yResOffset = xResOffset + 8;  // 8 bytes (2 * uint32: 400, 1)

    const totalSize = yResOffset + 8;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);

    // TIFF Header ("II" Little Endian)
    u8[0] = 0x49; u8[1] = 0x49;
    view.setUint16(2, 42, true);
    view.setUint32(4, ifdOffset, true);

    // Write RGB Pixels
    u8.set(rgb, headerSize);

    // BitsPerSample values (8, 8, 8)
    view.setUint16(bitsOffset, 8, true);
    view.setUint16(bitsOffset + 2, 8, true);
    view.setUint16(bitsOffset + 4, 8, true);

    // XResolution (400 / 1 -> 400 DPI)
    view.setUint32(xResOffset, 400, true);
    view.setUint32(xResOffset + 4, 1, true);

    // YResolution (400 / 1 -> 400 DPI)
    view.setUint32(yResOffset, 400, true);
    view.setUint32(yResOffset + 4, 1, true);

    // IFD Tags
    let p = ifdOffset;
    view.setUint16(p, numEntries, true); p += 2;

    function writeTag(tag, type, count, value) {
        view.setUint16(p, tag, true);
        view.setUint16(p + 2, type, true);
        view.setUint32(p + 4, count, true);
        view.setUint32(p + 8, value, true);
        p += 12;
    }

    writeTag(256, 4, 1, width);               // ImageWidth
    writeTag(257, 4, 1, height);              // ImageLength
    writeTag(258, 3, 3, bitsOffset);          // BitsPerSample
    writeTag(259, 3, 1, 1);                   // Compression = 1 (Uncompressed)
    writeTag(262, 3, 1, 2);                   // PhotometricInterpretation = 2 (RGB)
    writeTag(273, 4, 1, headerSize);          // StripOffsets
    writeTag(277, 3, 1, 3);                   // SamplesPerPixel = 3
    writeTag(278, 4, 1, height);              // RowsPerStrip
    writeTag(279, 4, 1, imageByteCount);      // StripByteCounts
    writeTag(282, 5, 1, xResOffset);          // XResolution (400 DPI)
    writeTag(283, 5, 1, yResOffset);          // YResolution (400 DPI)
    writeTag(296, 3, 1, 2);                   // ResolutionUnit = 2 (Inch)

    view.setUint32(p, 0, true);

    return new Blob([buffer], { type: "image/tiff" });
}
