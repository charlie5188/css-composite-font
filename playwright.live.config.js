// Run the same browser tests against GitHub Pages after deployment: npm run test:live.
// Browser tests: start a local static server (like GitHub Pages, with no build step) and open index.html in Chromium.
// Use installed Chrome locally and Playwright's bundled Chromium in CI.
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
    baseURL: 'https://charlie5188.github.io/css-composite-font/',
    locale: 'zh-CN',
    viewport: { width: 1400, height: 1000 },
    channel: process.env.CI ? undefined : 'chrome',
  },

});
