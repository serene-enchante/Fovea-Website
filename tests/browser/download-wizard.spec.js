import { expect, test } from '@playwright/test';

test('defers compatible-app icons until the wizard reaches step three', async ({ page }) => {
    const appIconRequests = [];
    page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        if (pathname.startsWith('/images/app_icons/')) appIconRequests.push(pathname);
    });

    await page.goto('/download-wizard/');
    await expect(page.locator('#step-1-view')).toHaveClass(/is-visible/);
    await page.waitForTimeout(250);
    expect(appIconRequests).toEqual([]);

    await page.locator('#circle-cards-grid .wizard-item-card:not(.is-disabled)').first().click();
    await expect(page.locator('#step-2-view')).toHaveClass(/is-visible/);
    await page.locator('#btn-download-full-circle').click();
    await expect(page.locator('#step-3-view')).toHaveClass(/is-visible/);

    await expect.poll(() => new Set(appIconRequests).size).toBe(4);
    await expect(page.locator('#step-3-view .wizard-app-icon').first()).toHaveJSProperty('naturalWidth', 104);

    await page.locator('#step-3-view .wizard-app-card[data-app="avenza"]').click();
    await expect(page.locator('#avenza-instruction-modal')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.locator('#avenza-modal-app-icon')).toHaveJSProperty('naturalWidth', 104);
});
