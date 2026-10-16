// 浏览器测试：在本地起一个静态服务器（和 GitHub Pages 一样，没有构建步骤），用 Chromium 打开 index.html。
// 本地装了 Google Chrome 就用它，否则（CI、云端的 agent 环境）用 Playwright 自带的 Chromium（npx playwright install chromium）。
const fs = require('fs');
const { defineConfig } = require('@playwright/test');
const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/google/chrome/chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'];
const useChrome = !process.env.CI && CHROME.some(p => fs.existsSync(p));
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
    channel: useChrome ? 'chrome' : undefined,
  },
  webServer: { command: 'python3 tools/serve.py 8765', url: 'http://127.0.0.1:8765/index.html', reuseExistingServer: !process.env.CI },
});
