// 浏览器测试：在本地起一个静态服务器（和 GitHub Pages 一样，没有构建步骤），用 Chromium 打开 index.html。
// 默认和 CI 使用同一个 Chromium，避免本机新版 Chrome 的功能掩盖兼容问题；PW_CHANNEL=chrome 可额外验证本机浏览器。
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
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: { command: 'python3 tools/serve.py 8765', url: 'http://127.0.0.1:8765/index.html', reuseExistingServer: !process.env.CI },
});
