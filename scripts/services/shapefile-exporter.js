const DBF_FIELDS = [
    { name: "ZID", property: "zid", width: 12 },
    { name: "CID", property: "cid", width: 32 },
    { name: "NAME", property: "name", width: 80 },
    { name: "TITLE", property: "title", width: 80 },
    { name: "FID", property: "fid", width: 12 }
];

const WGS84_PRJ = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]';

function polygonParts(geometry) {
    if (geometry?.type === "Polygon") return [geometry.coordinates];
    if (geometry?.type === "MultiPolygon") return geometry.coordinates;
    return [];
}

function signedRingArea(ring) {
    let area = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
        area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return area / 2;
}

function normalizeRing(ring, isOuter) {
    const points = ring.map(([x, y]) => [x, y]);
    if (points.length && (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1])) {
        points.push([...points[0]]);
    }
    const area = signedRingArea(points);
    const shouldBeClockwise = isOuter;
    if ((shouldBeClockwise && area > 0) || (!shouldBeClockwise && area < 0)) points.reverse();
    return points;
}

function preparePolygonFeature(feature) {
    const rings = polygonParts(feature.geometry)
        .flatMap((polygon) => polygon.map((ring, index) => normalizeRing(ring, index === 0)))
        .filter((ring) => ring.length >= 4);
    if (!rings.length) return null;
    const points = rings.flat();
    const bbox = [
        Math.min(...points.map(([x]) => x)),
        Math.min(...points.map(([, y]) => y)),
        Math.max(...points.map(([x]) => x)),
        Math.max(...points.map(([, y]) => y))
    ];
    return { feature, rings, points, bbox };
}

function createShapeRecord(prepared) {
    const partCount = prepared.rings.length;
    const pointCount = prepared.points.length;
    const contentLength = 4 + 32 + 4 + 4 + (partCount * 4) + (pointCount * 16);
    const bytes = new Uint8Array(contentLength);
    const view = new DataView(bytes.buffer);
    let offset = 0;
    view.setInt32(offset, 5, true); offset += 4;
    prepared.bbox.forEach((value) => { view.setFloat64(offset, value, true); offset += 8; });
    view.setInt32(offset, partCount, true); offset += 4;
    view.setInt32(offset, pointCount, true); offset += 4;
    let pointOffset = 0;
    prepared.rings.forEach((ring) => {
        view.setInt32(offset, pointOffset, true); offset += 4;
        pointOffset += ring.length;
    });
    prepared.points.forEach(([x, y]) => {
        view.setFloat64(offset, x, true); offset += 8;
        view.setFloat64(offset, y, true); offset += 8;
    });
    return bytes;
}

function writeShapefileHeader(view, fileLengthWords, bbox) {
    view.setInt32(0, 9994, false);
    view.setInt32(24, fileLengthWords, false);
    view.setInt32(28, 1000, true);
    view.setInt32(32, 5, true);
    bbox.forEach((value, index) => view.setFloat64(36 + (index * 8), value, true));
    // Z and M ranges are unused for 2D polygon records.
    for (let offset = 68; offset < 100; offset += 8) view.setFloat64(offset, 0, true);
}

function createShapeFiles(prepared) {
    const bbox = [
        Math.min(...prepared.map(({ bbox: bounds }) => bounds[0])),
        Math.min(...prepared.map(({ bbox: bounds }) => bounds[1])),
        Math.max(...prepared.map(({ bbox: bounds }) => bounds[2])),
        Math.max(...prepared.map(({ bbox: bounds }) => bounds[3]))
    ];
    const records = prepared.map(createShapeRecord);
    const shapeLength = 100 + records.reduce((length, record) => length + 8 + record.length, 0);
    const shapeBuffer = new ArrayBuffer(shapeLength);
    const shapeView = new DataView(shapeBuffer);
    writeShapefileHeader(shapeView, shapeLength / 2, bbox);

    const indexLength = 100 + records.length * 8;
    const indexBuffer = new ArrayBuffer(indexLength);
    const indexView = new DataView(indexBuffer);
    writeShapefileHeader(indexView, indexLength / 2, bbox);

    let shapeOffset = 100;
    records.forEach((record, index) => {
        const contentLengthWords = record.length / 2;
        shapeView.setInt32(shapeOffset, index + 1, false);
        shapeView.setInt32(shapeOffset + 4, contentLengthWords, false);
        new Uint8Array(shapeBuffer, shapeOffset + 8, record.length).set(record);
        indexView.setInt32(100 + (index * 8), shapeOffset / 2, false);
        indexView.setInt32(104 + (index * 8), contentLengthWords, false);
        shapeOffset += 8 + record.length;
    });

    return {
        shp: new Uint8Array(shapeBuffer),
        shx: new Uint8Array(indexBuffer),
        dbf: createDbf(prepared),
        prj: WGS84_PRJ,
        cpg: "UTF-8"
    };
}

function encodeDbfText(value, width) {
    const encoder = new TextEncoder();
    let text = "";
    for (const character of String(value ?? "")) {
        const next = text + character;
        if (encoder.encode(next).length > width) break;
        text = next;
    }
    const encoded = encoder.encode(text);
    const field = new Uint8Array(width).fill(0x20);
    field.set(encoded, width - encoded.length);
    return field;
}

function createDbf(prepared) {
    const fieldCount = DBF_FIELDS.length;
    const headerLength = 32 + (fieldCount * 32) + 1;
    const recordLength = 1 + DBF_FIELDS.reduce((sum, field) => sum + field.width, 0);
    const bytes = new Uint8Array(headerLength + (prepared.length * recordLength) + 1);
    const view = new DataView(bytes.buffer);
    const now = new Date();
    bytes[0] = 0x03;
    bytes[1] = now.getFullYear() - 1900;
    bytes[2] = now.getMonth() + 1;
    bytes[3] = now.getDate();
    view.setUint32(4, prepared.length, true);
    view.setUint16(8, headerLength, true);
    view.setUint16(10, recordLength, true);

    DBF_FIELDS.forEach((field, index) => {
        const offset = 32 + (index * 32);
        for (let i = 0; i < field.name.length; i += 1) bytes[offset + i] = field.name.charCodeAt(i);
        bytes[offset + 11] = 0x43;
        bytes[offset + 16] = field.width;
    });
    bytes[headerLength - 1] = 0x0d;

    prepared.forEach(({ feature }, recordIndex) => {
        let offset = headerLength + (recordIndex * recordLength);
        bytes[offset] = 0x20;
        offset += 1;
        DBF_FIELDS.forEach((field) => {
            const value = encodeDbfText(feature.properties?.[field.property], field.width);
            bytes.set(value, offset);
            offset += field.width;
        });
    });
    bytes[bytes.length - 1] = 0x1a;
    return bytes;
}

export function geojsonToShapefileFiles(geojson) {
    const features = geojson?.type === "FeatureCollection"
        ? geojson.features
        : geojson?.type === "Feature" ? [geojson] : [];
    const prepared = (features || []).map(preparePolygonFeature).filter(Boolean);
    if (!prepared.length) {
        throw new Error("Shapefile export requires at least one polygon boundary.");
    }
    return createShapeFiles(prepared);
}

export async function zipShapefileFiles(files, filename, ZipConstructor) {
    if (typeof ZipConstructor !== "function") {
        throw new Error("ZIP support is required to export a Shapefile.");
    }
    const zip = new ZipConstructor();
    const basename = filename.replace(/\.zip$/i, "");
    Object.entries(files).forEach(([extension, contents]) => {
        zip.file(`${basename}.${extension}`, contents);
    });
    return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}
