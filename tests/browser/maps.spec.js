import { expect, test } from '@playwright/test';

async function openMap(page, path = '/maps/') {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
    });
    await page.goto(path);
    await expect(page.locator('#tile-map canvas.maplibregl-canvas')).toBeVisible();
    await expect(page.locator('#header-title')).not.toHaveText('Loading...');
}

test('initializes the home globe with the shared CARTO style configuration', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#home-globe canvas.maplibregl-canvas')).toBeVisible();
});

for (const { circle, zone, expectedTitle } of [
    { circle: 'eugene', zone: '04', expectedTitle: 'Zone 04' },
    { circle: 'florence', zone: '01', expectedTitle: 'Zone 01' }
]) {
    test(`opens the ${circle} deep link at zone ${zone}`, async ({ page }) => {
        await openMap(page, `/maps/?feature=${circle}&zone=${zone}`);

        await expect(page).toHaveURL(new RegExp(`feature=${circle}.*zone=${zone}`));
        await expect(page.locator('#header-title')).toContainText(expectedTitle);
        await expect(page.locator('#btn-capsule-back')).toBeEnabled();
    });
}

test('records the active-dataset and tile request startup baseline', async ({ page }) => {
    const datasetRequests = [];
    const tileRequests = [];
    page.on('request', request => {
        const url = request.url();
        if (/\/geojson\/[^/]+\.geojson(?:\?|$)/i.test(url)) datasetRequests.push(url);
        if (/(?:cartocdn\.com|arcgisonline\.com)/i.test(url) && /\/\d+\/\d+\/\d+(?:\.[a-z0-9]+)?(?:\?|$)/i.test(url)) {
            tileRequests.push(url);
        }
    });

    const navigationStartedAt = Date.now();
    await openMap(page, '/maps/?feature=eugene&zone=04');
    expect(await page.evaluate(() => performance.getEntriesByType('mark')
        .some(entry => entry.name.startsWith('fovea-map:')))).toBe(false);
    const mapReadyMs = Date.now() - navigationStartedAt;
    await page.waitForTimeout(1500);

    expect(datasetRequests.map(url => new URL(url).pathname.split('/').at(-1))).toEqual(['Eugene-05-wgs84.geojson']);
    const scriptBytes = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource').filter(entry => {
            return entry.initiatorType === 'script' && new URL(entry.name).origin === location.origin;
        });
        return {
            count: resources.length,
            transferBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0),
            decodedBytes: resources.reduce((sum, entry) => sum + entry.decodedBodySize, 0)
        };
    });
    console.log(`Map startup baseline (desktop Chromium): ready=${mapReadyMs}ms; same-origin JS=${scriptBytes.count} resources, ${scriptBytes.transferBytes} transfer bytes, ${scriptBytes.decodedBytes} decoded bytes; after 1.5s: ${datasetRequests.length} GeoJSON request(s), ${tileRequests.length} CARTO/Esri tile request(s).`);
});

test('reports opt-in map startup timing marks', async ({ page }) => {
    await openMap(page, '/maps/?feature=circles&fovea-perf=1');

    await expect.poll(() => page.evaluate(() => performance.getEntriesByType('mark')
        .map(entry => entry.name)
        .filter(name => name.startsWith('fovea-map:')))).toEqual(expect.arrayContaining([
        'fovea-map:startup-start',
        'fovea-map:dataset-ready',
        'fovea-map:map-created',
        'fovea-map:first-render',
        'fovea-map:map-load',
        'fovea-map:first-idle',
        'fovea-map:labels-ready',
        'fovea-map:page-ready'
    ]));

    const timings = await page.evaluate(() => performance.getEntriesByType('mark')
        .filter(entry => entry.name.startsWith('fovea-map:'))
        .map(({ name, startTime }) => `${name}=${Math.round(startTime)}ms`));
    expect(timings.filter(entry => entry.startsWith('fovea-map:page-ready=')).length).toBe(1);
    console.log(`Opt-in map startup marks (desktop Chromium): ${timings.join(', ')}`);
});

test('clears legacy deep-link parameters while selecting Eugene, circles, and Florence', async ({ page }) => {
    await openMap(page, '/maps/?circle=Eugene');
    await expect(page.locator('#header-title')).toContainText(/Eugene Christmas Bird\s*Count Circle/);

    await page.locator('#btn-capsule-back').click();
    await expect(page).toHaveURL(/feature=circles/);
    await expect(page).not.toHaveURL(/(?:\?|&)circle=/);
    await expect(page.locator('#header-title')).toContainText(/Coast to Cascades\s*Bird Alliance/);

    await page.locator('.sidebar-overview-preview__footer').click();
    await page.locator('.tile-zone-item[data-id="Florence"]').click();
    await expect(page).toHaveURL(/feature=florence/);
    await expect(page).not.toHaveURL(/(?:\?|&)circle=/);
    await expect(page.locator('#header-title')).toContainText(/Florence Christmas Bird\s*Count Circle/);
});

test('opens the downloads modal and exports GeoJSON', async ({ page }) => {
    await openMap(page);

    await page.locator('#btn-download-files').click();
    await expect(page.locator('#downloads-modal')).toHaveAttribute('aria-hidden', 'false');

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('#download-geojson').click()
    ]);
    expect(download.suggestedFilename()).toMatch(/\.geojson$/i);
});

test('keeps suggestion drawing active after the feedback form split', async ({ page }) => {
    await openMap(page);

    await page.locator('#btn-suggest').click();
    await expect(page.locator('#suggest-modal')).toHaveAttribute('aria-hidden', 'false');
    await page.locator('#suggest-input-title').fill('Boundary note');
    await page.locator('#suggest-input-message').fill('The path follows the creek.');
    await page.locator('#btn-draw-marker').click();

    const mapBounds = await page.locator('#tile-map canvas.maplibregl-canvas').boundingBox();
    await page.locator('#tile-map canvas.maplibregl-canvas').click({
        position: { x: mapBounds.width * 0.55, y: mapBounds.height * 0.55 }
    });

    await expect(page.locator('#suggest-annotation-status')).toContainText('1 Marker');
    await expect(page.locator('body')).toHaveClass(/is-suggest-locked/);
});

test('opens the header view menu and applies a selected view label', async ({ page }) => {
    await openMap(page);

    await page.locator('#header-view-toggle').click();
    await expect(page.locator('#header-view-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#header-view-menu')).toHaveAttribute('aria-hidden', 'false');
    await page.locator('.header-view-menu__item[data-value="map"]').click();

    await expect(page.locator('#header-view-toggle-label')).toHaveText('Map');
    await expect(page.locator('#header-view-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#header-view-menu')).toHaveAttribute('aria-hidden', 'true');
});

test('reparents toolbar modals between desktop and mobile layouts', async ({ page }) => {
    await openMap(page);
    const actionsRow = page.locator('.maps-tile-header__actions');

    await expect.poll(() => actionsRow.evaluate(element => element.parentElement.id)).toBe('map-wrapper');
    await expect.poll(() => page.locator('#downloads-modal').evaluate(element => {
        return element.parentElement === document.querySelector('.maps-tile-header__actions');
    })).toBeTruthy();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => actionsRow.evaluate(element => element.parentElement === document.body)).toBeTruthy();
    await expect.poll(() => page.locator('#downloads-modal').evaluate(element => {
        return element.parentElement === document.querySelector('.maps-tile-header__actions');
    })).toBeTruthy();
});

test.describe('mobile navigation', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('shows the mobile navigation and opens Tools', async ({ page }) => {
        await openMap(page);

        await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
        await page.locator('#mobile-nav-tab-tools').click();
        await expect(page).toHaveURL(/\/tools\/$/);
        await expect(page.locator('main')).toBeVisible();
    });
});
