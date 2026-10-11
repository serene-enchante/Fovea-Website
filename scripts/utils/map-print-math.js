export function getLayoutScaleBar(bounds, layoutMapWidth) {
    if (!bounds || !bounds[0] || !bounds[1]) return { miles: 1, pxWidth: 250 };

    const [[minLng, minLat], [maxLng, maxLat]] = bounds;
    const centerLat = (minLat + maxLat) / 2;
    const lat1Rad = centerLat * Math.PI / 180;
    const dLon = (maxLng - minLng) * Math.PI / 180;
    const a = Math.cos(lat1Rad) * Math.cos(lat1Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const milesPerPx = (3958.8 * c) / layoutMapWidth;
    const targetPx = 330;
    const approxMiles = targetPx * milesPerPx;
    const niceIncrements = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 50, 100];
    let chosenMiles = niceIncrements[0];
    let minDiff = Math.abs(approxMiles - chosenMiles);

    for (let i = 1; i < niceIncrements.length; i++) {
        const diff = Math.abs(approxMiles - niceIncrements[i]);
        if (diff < minDiff) {
            minDiff = diff;
            chosenMiles = niceIncrements[i];
        }
    }

    return { miles: chosenMiles, pxWidth: Math.max(160, Math.min(750, chosenMiles / milesPerPx)) };
}
