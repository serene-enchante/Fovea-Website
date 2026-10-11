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

test('clears legacy deep-link parameters while selecting Eugene, circles, and Florence', async ({ page }) => {
    await openMap(page, '/maps/?circle=Eugene');
    await expect(page.locator('#header-title')).toContainText(/Eugene Christmas Bird\s*Count Circle/);

    await page.locator('#btn-capsule-back').click();
    await expect(page).toHaveURL(/feature=circles/);
    await expect(page).not.toHaveURL(/(?:\?|&)circle=/);
    await expect(page.locator('#header-title')).toContainText(/Coast to Cascades\s*Bird Alliance/);

    await page.locator('.overview-preview-item[data-cid="Florence"]').click();
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
