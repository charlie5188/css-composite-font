// Browser tests: start a local static server (like GitHub Pages, with no build step) and open index.html in Chromium.
// Use the same Chromium locally and in CI so newer Chrome features do not hide compatibility issues; PW_CHANNEL=chrome enables an additional local-browser check.
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,      // Font export saturates the CPU; parallel pages may time out while loading.
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  snapshotPathTemplate: 'tests/e2e/snapshots/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:8765/',
    locale: 'zh-CN',
    viewport: { width: 1400, height: 1000 },
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: { command: 'python3 tools/serve.py 8765', url: 'http://127.0.0.1:8765/index.html', reuseExistingServer: !process.env.CI },
});
