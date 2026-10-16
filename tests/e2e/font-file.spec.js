// 字体文件导出的完整流程：下载 Pyodide、源字体，在 Worker 里生成，下载 zip。要联网，大约一分钟
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');
const { open, pick, showExport } = require('./helpers');

test('生成 ゴシック × Jost 400 的 TTF 和 OTF @net', async ({ page }, info) => {
  test.setTimeout(300_000);
  await open(page);
  await pick(page, 'gothic-jp');
  await showExport(page);
  await page.click('#kindFont');
  // 只留 400，不要斜体，加上 OTF
  for (const w of [700]) await page.click(`#fxWeights [data-w="${w}"]`);
  await page.uncheck('#fxItalic'); await page.check('#fxOtf');
  await expect(page.locator('#fxGo')).toBeEnabled();
  await expect(page.locator('.fx-sum')).toContainText('2 个文件');
  await page.click('#fxGo');
  await expect(page.locator('#fxSave')).toBeVisible({ timeout: 240_000 });
  await expect(page.locator('.fx-files')).toContainText('-Regular.ttf');
  await expect(page.locator('.fx-files')).toContainText('-Regular.otf');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#fxSave')]);
  const zip = info.outputPath('fonts.zip'); await dl.saveAs(zip);
  const list = execFileSync('unzip', ['-l', zip]).toString();
  for (const f of ['.ttf', '.otf', 'OFL.txt', 'README.txt']) expect(list).toContain(f);
});
