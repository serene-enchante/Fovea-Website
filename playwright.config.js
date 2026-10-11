import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/browser',
    timeout: 45_000,
    expect: { timeout: 15_000 },
    fullyParallel: false,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        channel: 'chrome',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    webServer: {
        command: 'node tests/support/static-server.js',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI
    },
    projects: [
        {
            name: 'desktop-chrome',
            use: { ...devices['Desktop Chrome'] }
        }
    ]
});
