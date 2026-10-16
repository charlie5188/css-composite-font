// 浏览器测试：在本地起一个静态服务器（和 GitHub Pages 一样，没有构建步骤），用 Chromium 打开 index.html。
// 本地默认用装好的 Chrome；CI 里用 Playwright 自带的 Chromium。
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: 1,      // 字体导出会占满 CPU，并行时别的页面会加载超时
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  snapshotPathTemplate: 'tests/e2e/snapshots/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:8765/',
    locale: 'zh-CN',
    viewport: { width: 1400, height: 1000 },
    channel: process.env.CI ? undefined : 'chrome',
  },
  webServer: { command: 'python3 tools/serve.py 8765', url: 'http://127.0.0.1:8765/index.html', reuseExistingServer: !process.env.CI },
});
