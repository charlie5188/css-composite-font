const { test, expect } = require('@playwright/test');
const { open, pick, showExport } = require('./helpers');

test('页面加载、切换预设、切语言都没有脚本错误', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // 网络请求失败（试探 Google 上不存在的字重等）不算脚本错误
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::|CORS policy/.test(m.text())) errors.push(m.text()); });
  await open(page);
  for (const id of ['gothic-jp', 'antigochi', 'serif-sc']) { await pick(page, id); await page.waitForTimeout(300); }
  await page.click('[data-ui-lang="ja"]'); await page.click('[data-ui-lang="tw"]'); await page.click('[data-ui-lang="zh"]');
  await showExport(page);
  await page.click('#kindFont'); await page.click('#kindCss'); await page.click('#tabJs');
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('导出：切换网页 / 字体文件，左栏的设置跟着换', async ({ page }) => {
  await open(page);
  await expect(page.locator('#export')).toBeHidden();
  await showExport(page);
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

test('原理与限制：对话框、目录和语言切换', async ({ page }) => {
  await open(page);
  expect(await page.locator('#aboutToc a').count()).toBeGreaterThan(5);
  await page.click('[data-ui-lang="ja"]');
  await expect(page.locator('#export .ex-title')).toHaveText('書き出し');
  await expect(page.locator('#aboutToc a').first()).toBeHidden();
  await page.click('#aboutBtn');
  await expect(page.locator('#aboutToc a').first()).toBeVisible();
  await expect(page.locator('#aboutToc a').first()).toHaveText('照合の規則');
  await page.keyboard.press('Escape');
  await expect(page.locator('#aboutDlg')).toBeHidden();
});

test('整页固定一屏：页面本身不滚动，各栏自己滚动', async ({ page }) => {
  await open(page);
  const m = await page.evaluate(() => {
    const box = s => document.querySelector(s).getBoundingClientRect();
    return { doc: document.scrollingElement.scrollHeight, win: innerHeight, panes: ['#editor', '.proof-scroll'].map(s => getComputedStyle(document.querySelector(s)).overflowY), specGap: box('.tester').bottom - box('.panel').bottom };
  });
  expect(m.doc).toBeLessThanOrEqual(m.win);
  expect(m.panes).toEqual(['auto', 'auto']);
  expect(Math.abs(m.specGap)).toBeLessThan(1);      // 参考图贴在校样栏底部
});

test('导出对话框：打开、关闭、点背景关闭', async ({ page }) => {
  await open(page);
  await page.click('#exToggle');
  await expect(page.locator('#copyBtn')).toBeVisible();
  await page.click('#exClose');
  await expect(page.locator('#exDlg')).toBeHidden();
  await page.click('#exToggle');
  await page.mouse.click(5, 5);      // 对话框外面
  await expect(page.locator('#exDlg')).toBeHidden();
});

test('窄屏：底部页签一次显示一栏', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.locator('#mTabs')).toBeVisible();
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('.tester')).toBeHidden();
  await page.click('#mTabs [data-mv="preview"]');
  await expect(page.locator('.tester')).toBeVisible();
  await expect(page.locator('#editor')).toBeHidden();
  await page.click('#exToggle');
  await expect(page.locator('#copyBtn')).toBeVisible();
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

test('对齐、段落换行只改校样，不写进导出的 CSS', async ({ page }) => {
  await open(page);
  await page.click('#viewBtn');
  await page.selectOption('#viewTypo [data-vtypo="align"]', 'center');
  await expect(page.locator('#viewTypo [data-vtypo="justify"]')).toBeDisabled();
  await page.selectOption('#viewTypo [data-vtypo="wrap"]', 'balance');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('#proofText')).textAlign)).toBe('center');
  await page.keyboard.press('Escape');
  await showExport(page);
  const css = await page.textContent('#codeOut');
  expect(css).not.toContain('text-align');
  expect(css).not.toContain('text-wrap');
  expect(css).toContain('line-break: strict');      // 排版页签里的照常导出
});
