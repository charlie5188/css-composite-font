const { test, expect } = require('@playwright/test');
const { open, pick } = require('./helpers');

test('导出：切换网页 / 字体文件，左边的设置跟着换', async ({ page }) => {
  await open(page);
  await page.click('#kindCss');
  await expect(page.locator('#exBaseField')).toBeVisible();
  await expect(page.locator('#fxWeightsField')).toBeHidden();
  await page.click('#kindFont');
  await expect(page.locator('#fxWeightsField')).toBeVisible();
  await expect(page.locator('#exBaseField')).toBeHidden();
  await expect(page.locator('#fxGo')).toBeVisible();
  // 点 OTF 的 (i) 只打开说明，不会勾选
  await page.click('.fx-opt .info');
  await expect(page.locator('#infoPop')).toContainText('CFF');
  await expect(page.locator('#fxOtf')).not.toBeChecked();
});

test('原理与限制：目录和语言切换', async ({ page }) => {
  await open(page);
  expect(await page.locator('#aboutToc a').count()).toBeGreaterThan(5);
  await page.click('[data-ui-lang="ja"]');
  await expect(page.locator('#export .ex-title')).toHaveText('書き出し');
  await expect(page.locator('#aboutToc a').first()).toBeVisible();
});

test('竖排：换列的地方不加中西间距的 margin', async ({ page }) => {
  await open(page);
  await pick(page, 'gothic-jp');
  await page.evaluate(() => document.querySelector('#vVertical').click());
  await page.waitForTimeout(1500);
  const bad = await page.evaluate(() => {
    const pt = document.querySelector('#proofText'), out = [];
    const rect = (node, end) => { const t = node.nodeType === 3 ? node : node.firstChild, s = t.data, r = document.createRange(); const c = end ? [...s].pop() : [...s][0]; r.setStart(t, end ? s.length - c.length : 0); r.setEnd(t, end ? s.length : c.length); return r.getBoundingClientRect(); };
    const same = (a, b) => { const x = rect(a, true), y = rect(b, false); return Math.abs(x.left + x.width / 2 - y.left - y.width / 2) < x.width / 2; };
    for (const el of pt.querySelectorAll('.r')) {
      if (el.style.marginInlineStart && el.previousSibling && !same(el.previousSibling, el)) out.push('start:' + el.textContent);
      if (el.style.marginInlineEnd && el.nextSibling && !same(el, el.nextSibling)) out.push('end:' + el.textContent);
    }
    return { out, spans: pt.querySelectorAll('.r').length, vertical: document.querySelector('#sheet').classList.contains('vertical') };
  });
  expect(bad.vertical).toBe(true);
  expect(bad.spans).toBeGreaterThan(3);
  expect(bad.out).toEqual([]);
});
