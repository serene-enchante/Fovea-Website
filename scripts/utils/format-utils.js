export const FALLBACK_IMAGE = "../images/wetlands.jpg";

export function normalizeZoneId(value) {
    if (!value) return "";
    const upper = String(value).toUpperCase().trim();
    const match = upper.match(/^0*(\d+)([A-Z]?)$/);
    if (!match) return upper;
    return `${Number(match[1])}${match[2]}`;
}

export function displayZoneId(zid) {
    return String(zid || "").toUpperCase().trim();
}

export function zoneImagePath(zoneId) {
    let zid = displayZoneId(zoneId);
    if (!zid) return FALLBACK_IMAGE;

    if (zid === "6A" || zid === "6B" || zid === "06A" || zid === "06B") return "../images/zone-images/z06-01.jpg";
    if (zid === "8" || zid === "08") return "../images/zone-images/z08A-01.jpg";
    if (zid === "20B") return "../images/zone-images/20B-01.jpg";
    if (zid === "1") zid = "01";

    return `../images/zone-images/z${zid}-01.jpg`;
}

export function formatDate(value) {
    if (!value) return "Unknown";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatArea(value) {
    const num = Number(value);
    if (Number.isNaN(num)) return "-";
    return num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}
