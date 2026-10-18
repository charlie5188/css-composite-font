const { test, expect } = require('@playwright/test');
const { open, showExport } = require('./helpers');

const limits = page => page.locator('#wRange [role="slider"]').evaluateAll(els => els.map(el => +el.getAttribute('aria-valuenow')));
const savedRange = page => page.evaluate(async () => (await import('./assets/js/core.js')).state.wrange);
async function start(page) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await open(page); await page.click('#ltabFonts');
  await page.click('#vWMode [data-m="cont"]');
  await page.locator('#wRange').scrollIntoViewIfNeeded();
}
async function dragTo(page, end, value, release = true) {
  const thumb = await page.locator(`#wRange [data-end="${end}"]`).boundingBox();
  const rail = await page.locator('#wRange').boundingBox();
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rail.x + rail.width / 2, rail.y + rail.height * (value - 100) / 800, { steps: 8 });
  if (release) await page.mouse.up();
}

test('连续范围：拖动选行、取消、一次撤销，保留范围外调整与精确端点', async ({ page }) => {
  await start(page);
  const original = await page.evaluate(async () => JSON.stringify((await import('./assets/js/core.js')).state.wOver));
  await expect(page.locator('#wMatrix [data-row]')).toHaveCount(9);
  await dragTo(page, 0, 300, false);
  expect(await limits(page)).toEqual([300, 900]);
  expect(await savedRange(page)).toEqual([100, 900]);
  await expect(page.locator('#wMatrix [data-row="100"]')).toHaveClass(/off/);
  // 字体加载引起重绘时，拖动的控件与尚未提交的选择不能消失。
  await page.evaluate(async () => (await import('./assets/js/render.js')).renderEditor());
  expect(await limits(page)).toEqual([300, 900]);
  await page.waitForTimeout(500); await page.mouse.up();
  expect(await savedRange(page)).toEqual([300, 900]);
  await expect(page.locator('#wMatrix [data-pw="100"]')).toBeDisabled();
  await expect(page.locator('#wMatrix .mnum[data-w="100"]').first()).toBeHidden();
  await page.click('#undoBtn');
  expect(await savedRange(page)).toEqual([100, 900]);
  await dragTo(page, 1, 600, false);
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await limits(page)).toEqual([100, 900]);
  // 导出中的精确值仍会投射到相同滑轨，端点不会被重画吸附到整百。
  await showExport(page); await page.click('#kindCss');
  await page.fill('#exWLo', '350'); await page.locator('#exWLo').press('Tab');
  await page.fill('#exWHi', '650'); await page.locator('#exWHi').press('Tab');
  await page.locator('#exDlg').evaluate(el => el.close());
  expect(await limits(page)).toEqual([350, 650]);
  await expect(page.locator('#wMatrix [data-row]:not(.off)')).toHaveCount(4);
  expect(await page.evaluate(async () => JSON.stringify((await import('./assets/js/core.js')).state.wOver))).toBe(original);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('composite-font:state:v1')).wrange)).toEqual([350, 650]);
  await page.reload(); await page.click('#ltabFonts');
  expect(await limits(page)).toEqual([350, 650]);
  await page.click('#vWMode [data-m="steps"]'); await expect(page.locator('#wRange')).toBeHidden();
  await expect(page.locator('#wMatrix [data-wx]')).toHaveCount(9);
  await page.click('#vWMode [data-m="cont"]');
  expect(await limits(page)).toEqual([350, 650]);
});

test('连续范围：键盘、滑轨点击与端点防交叉，预览随范围限制', async ({ page }) => {
  await start(page);
  const lo = page.locator('#wRange [data-end="0"]'), hi = page.locator('#wRange [data-end="1"]');
  await lo.focus(); await lo.press('ArrowDown');
  expect(await limits(page)).toEqual([200, 900]); await expect(lo).toBeFocused();
  await lo.press('Shift+ArrowDown'); expect(await limits(page)).toEqual([210, 900]);
  await lo.press('Tab'); await expect(hi).toBeFocused();
  await hi.press('ArrowUp'); expect(await limits(page)).toEqual([210, 800]); await expect(hi).toBeFocused();
  await hi.press('Home'); expect(await limits(page)).toEqual([210, 211]);
  await expect(lo).toHaveAttribute('aria-valuemax', '210');
  await lo.press('End'); expect(await limits(page)).toEqual([210, 211]);
  await expect(page.locator('#vWn')).toHaveValue('211');
  await hi.press('End'); await lo.press('Home');
  const rail = await page.locator('#wRange').boundingBox();
  await page.mouse.click(rail.x + rail.width / 2, rail.y + rail.height / 4);
  expect(await limits(page)).toEqual([300, 900]);
  await page.click('#wMatrix [data-row="100"]', { position: { x: 2, y: 2 } });
  await expect(page.locator('#vWn')).toHaveValue('300');
});

test('连续范围：390px 触屏拖动与暗色模式', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark', locale: 'zh-CN' });
  const page = await context.newPage();
  await start(page);
  const rail = await page.locator('#wRange').boundingBox();
  const thumb = await page.locator('#wRange [data-end="1"]').boundingBox();
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rail.x + rail.width / 2, y: rail.y + rail.height * .75 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await limits(page)).toEqual([100, 700]);
  await expect(page.locator('#wMatrix [data-pw="900"]')).toBeDisabled();
  const layout = await page.locator('#wMatrix').evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth, document: document.documentElement.scrollWidth }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.document).toBe(390);
  await context.close();
});
