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
    if (zid === "10") return "../images/zone-images/z10A-01.jpg";
    if (zid === "20B") return "../images/zone-images/20B-01.jpg";
    if (zid === "1") zid = "01";

    return `../images/zone-images/z${zid}-01.jpg`;
}

export const EUGENE_ZONE_DESCRIPTIONS = {
    "01": "Comprises northern agricultural plains and foothill margins, featuring open grass fields, hedgerows, and oak savanna that host wintering raptors and sparrows.",
    "02": "Features low-elevation floodplain terrain, combining riparian hardwood woodlands, seasonal sloughs, and agricultural pastures favored by foraging winter songbirds and waterfowl.",
    "03A": "Encompasses urban wetland basins and river backwaters, featuring willow thickets, emergent marshes, and open water channels attractive to dabbling ducks and grebes.",
    "03B": "Covers a major river confluence area, characterized by gravel bars, riparian cottonwood gallery, and mixed woodlands that support wintering mergansers and eagles.",
    "04": "Features riverfront riparian greenways and suburban edges, blending mature black cottonwoods, shrub buffers, and open parks that shelter diverse winter passerines.",
    "05A": "Centering urban river corridors and wooded park slopes, this zone combines city parklands, mixed canopy, and waterways hosting wintering woodland species.",
    "05B": "Comprises urban stream corridors, canalways, and suburban residential gardens, providing canopy cover and foraging habitat for wintering thrushes, finches, and sparrows.",
    "06A": "Features eastern foothill slopes and tributary creek ravines, dominated by mixed conifer-hardwood forests that shelter wintering kinglets, creepers, and woodpeckers.",
    "06B": "Follows a broad river corridor, offering mature alder and cedar floodplains, gravel islands, and side channels for wintering river birds and waterfowl.",
    "07": "Encompasses river valley bottomlands and agricultural groves, blending riparian woodlands, oxbows, and open pastures attractive to wintering passerines.",
    "08": "Features rolling oak savanna, open prairie meadows, and upland conifer ridges, offering prime foraging terrain for wintering bluebirds and hunting raptors.",
    "09": "Dominates southern upland ridge slopes, featuring dense Douglas fir forest, fern-covered ravines, and foothill woods hosting wintering forest birds.",
    "10": "Spans high-elevation rocky crests, conifer-covered slopes, southern foothill ravines, and residential woods, combining mixed fir-madrone canopy, brushy edges, and open ridgelines that attract wintering finches, nuthatches, towhees, and jays.",
    "10A": "Covers high-elevation rocky crests and conifer-covered slopes, featuring mixed fir-madrone woods and open ridgelines that attract wintering finches and nuthatches.",
    "10B": "Spans southern foothill ravines and residential woods, combining mixed evergreen canopy, brushy ravines, and garden edges favored by wintering towhees and jays.",
    "11A": "Features southwestern agricultural foothills, with rolling pastures, seasonal ponds, and oak-pine savanna supporting wintering sparrows and meadow birds.",
    "11B": "Spans wooded southwestern hillside ravines and suburban margins, offering mixed conifer groves and brushy thickets that shelter wintering songbirds.",
    "12A": "Follows a rural stream drainage, characterized by low-elevation wet pastures, willow margins, and open agricultural fields favored by wintering harriers.",
    "12B": "Encompasses native wet prairie basins and vernal swales, featuring open grasslands and scattered oak groves where wintering snipe and shrikes forage.",
    "13A": "Features extensive freshwater marshlands and vernal ponds, offering emergent reedbeds, willow corridors, and shallow waters that attract diverse winter waterfowl.",
    "13B": "Spans restored wetland drainage channels and low-lying wet meadows, providing rich foraging habitat for wintering shorebirds, dabblers, and marsh birds.",
    "14": "Covers open reservoir shoreline and marshy embayments, featuring shallow mudflats, emergent vegetation, and open waters hosting wintering grebes and loons.",
    "15": "Encompasses vast wetland basins and open water impoundments, with emergent marshes and flooded fields supporting large concentrations of wintering waterfowl.",
    "16": "Features extensive restored wet prairie and seasonal swales, providing open foraging expanses and hunting perches for wintering northern harriers and owls.",
    "17": "Dominates open agricultural flatlands and grass seed fields, featuring drainage ditches and fencerows where wintering raptors and open-country flocks gather.",
    "18": "Covers rural-urban transition flats, blending agricultural fields, brushy roadside hedgerows, and drainage ditches favored by wintering sparrow flocks.",
    "19A": "Spans urban residential neighborhoods and community parklands, featuring neighborhood tree canopy, drainage swales, and garden habitats for wintering suburban birds.",
    "19B": "Spans urban residential neighborhoods and community parklands, featuring neighborhood tree canopy, drainage swales, and garden habitats for wintering suburban birds.",
    "20A": "Features river tailraces, open water spillways, and dense riparian gallery, providing sheltered foraging and roosting waters for wintering diving ducks.",
    "20B": "Encompasses braided river channels and floodplain gravel bars, flanked by mature riparian forest that provides winter roosts for bald eagles.",
    "21": "Covers eastern reservoir embayments and agricultural fringes, combining sheltered marshy coves and oak woodlands that host wintering ducks and raptors."
};

export const FLORENCE_ZONE_DESCRIPTIONS = {
    "01": "Covers rugged coastal ocean headlands and rocky sea cliffs, featuring marine waters, coastal spruce forests, and offshore habitats for pelagic seabirds.",
    "02": "Features coastal freshwater wetland basins and shore pine groves, providing sheltered waters and emergent reedbeds for wintering grebes and diving ducks.",
    "03": "Dominates upper coastal rainforest watersheds, featuring steep mossy hemlock ravines, cedar stands, and clear tributary streams for wintering forest birds.",
    "04": "Covers tidal riverfront waterfronts and harbor channels, featuring intertidal mudflats, dock pilings, and open estuarine waters frequented by wintering gulls.",
    "05": "Features ocean beach surf zones and coastal sand spits, offering exposed wave-swept beaches and sandy dunes for wintering shorebirds and sea ducks.",
    "06": "Encompasses freshwater lake shores and coastal residential woodlands, combining sheltered shorelines and native coastal scrub for wintering passerines.",
    "07": "Follows coastal river canyon bends, featuring tidal riverbanks, steep conifer slopes, and quiet backwater channels hosting wintering mergansers and eagles.",
    "08": "Covers large freshwater coastal lake expanses and marshy borders, with emergent vegetation and spruce margins rich in wintering waterfowl.",
    "09": "Encompasses open coastal sand dunes, deflation plain wetlands, and beach surf zones, hosting wintering plovers, sanderlings, and coastal raptors.",
    "10": "Features freshwater dune-fringed water bodies and evergreen coastal woods, combining coastal scrub and shore pine forests for winter water and forest birds.",
    "11": "Covers deep coastal freshwater embayments and cedar swamp margins, flanked by mature conifer forest hosting wintering divers and woodland birds.",
    "12": "Spans ocean beachfronts, sandy coastal foredunes, and ocean surf lines, providing expansive foraging habitat for wintering gulls, scoters, and shorebirds.",
    "13": "Features tidal river sloughs and brackish marsh islands, offering intertidal mudflats and shallow waters attractive to wintering herons and waders."
};

export function getZoneDescription(targetFeature, isFlorence) {
    if (!targetFeature) return "";
    const props = targetFeature.properties || {};
    const zid = displayZoneId(props.zid);
    const normalizedZid = zid.replace(/^0+/, "");
    
    const descriptions = isFlorence ? FLORENCE_ZONE_DESCRIPTIONS : EUGENE_ZONE_DESCRIPTIONS;
    if (descriptions[zid]) return descriptions[zid];
    if (descriptions[normalizedZid]) return descriptions[normalizedZid];
    if (descriptions["0" + normalizedZid]) return descriptions["0" + normalizedZid];

    return props.description || `Survey Zone ${zid} Christmas Bird Count designated boundary and field observation area.`;
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
