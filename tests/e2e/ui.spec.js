const { test, expect } = require('@playwright/test');
const { open, pick, showExport, setLang } = require('./helpers');

test('页面加载、切换预设、切语言都没有脚本错误', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // 网络请求失败（试探 Google 上不存在的字重等）不算脚本错误
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::|CORS policy/.test(m.text())) errors.push(m.text()); });
  await open(page);
  for (const id of ['gothic-jp', 'antigochi', 'serif-sc']) { await pick(page, id); await page.waitForTimeout(300); }
  for (const l of ['ja', 'tw', 'en', 'zh']) await setLang(page, l);
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
  await setLang(page, 'ja');
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

test('各字重：改某个字重的大小只写进那个字重，勾选和导出对话框同步', async ({ page }) => {
  await open(page);
  await page.click('#ltabFonts');
  const cell = page.locator('#wMatrix .mnum[data-k="latin"][data-w="700"]');
  await cell.fill('121'); await cell.press('Tab');
  await expect(page.locator('#wMatrix [data-row="700"]')).toHaveClass(/cur/);      // 编辑哪一行，校样就预览哪个字重
  await expect(page.locator('#vWn')).toHaveValue('700');
  expect(await page.inputValue('#classRows .ct-row[data-id="latin"] .num[data-field="size"]')).not.toBe('121');      // 上面的表格是 400，不受影响
  await page.click('#wMatrix input[data-wx="300"]');
  await showExport(page);
  await expect(page.locator('#exWeights [data-w="300"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#codeOut')).toContainText('size-adjust: 121%');      // 导出区是防抖更新的：等它刷新
  expect(await page.textContent('#codeOut')).not.toMatch(/font-weight: 300;/);
});

test('撤销 / 重做：按钮和快捷键，输入框里的 ⌘Z 不抢', async ({ page }) => {
  await open(page);
  await page.click('#ltabFonts');
  const size = page.locator('#classRows .ct-row[data-id="latin"] .num[data-field="size"]');
  const before = await size.inputValue();
  await expect(page.locator('#undoBtn')).toHaveAttribute('aria-disabled', 'true');
  await size.fill('131'); await size.press('Tab');
  await expect(page.locator('#undoBtn')).toHaveAttribute('aria-disabled', 'false');      // 保存有 400ms 防抖，记下以后才能撤销
  await page.click('#undoBtn');
  await expect(size).toHaveValue(before);
  await page.click('#redoBtn');
  await expect(size).toHaveValue('131');
  await page.click('#proofText');      // 焦点不在输入框里：⌘Z 撤销设定
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(size).toHaveValue(before);
});

test('预设筛选：组内任选、组间同时满足，没有结果时可以清除', async ({ page }) => {
  await open(page);
  const cards = page.locator('#presetCards .pcard');
  const all = await cards.count();
  await page.click('#pfBtn');      // 筛选在菜单里
  await page.click('[data-pf="style:serif"]');
  await page.click('[data-pf="region:jp"]');
  await expect(cards).toHaveCount(1);      // 明朝 × Cormorant
  await page.click('[data-pf="region:tc"]');
  await expect(cards).toHaveCount(2);      // 再加上 明體 × Garamond
  await page.click('[data-pf="src:local"]');
  await expect(cards).toHaveCount(0);      // macOS 预设都是黑体
  await page.click('#presetCards [data-pf="clear"]');
  await expect(cards).toHaveCount(all);
});

test('保存预设用对话框：地区和风格预先推算好、可以改，存下来后能按它筛选', async ({ page }) => {
  await open(page);
  await page.click('#savePresetBtn');
  await expect(page.locator('#saveDlg')).toBeVisible();
  await expect(page.locator('#saveRegion [aria-checked="true"]')).toHaveAttribute('data-v', 'sc');      // 默认预设：宋体 × Garamond
  await expect(page.locator('#saveStyle [aria-checked="true"]')).toHaveAttribute('data-v', 'serif');
  await page.fill('#saveName', '测试');
  await page.click('#saveStyle [data-v="other"]');
  await page.click('#saveOk');
  await expect(page.locator('#saveDlg')).toBeHidden();
  await page.click('#pfBtn');
  await page.click('[data-pf="style:other"]');
  await expect(page.locator('#presetCards .pname')).toHaveText(['测试']);
});

test('(i)：鼠标停一会儿就打开说明，移开关掉；悬停后再点就固定打开', async ({ page }) => {
  await open(page);
  await page.click('#ltabFonts');
  const pop = page.locator('#infoPop'), info = page.locator('.ct-head .info').first();
  await info.hover();
  await expect(pop).toBeVisible();
  await expect(page.locator('#tip')).toBeHidden();      // 不再先出「说明」小提示
  await page.mouse.move(5, 5);
  await expect(pop).toBeHidden();
  await info.hover();
  await expect(pop).toBeVisible();
  await info.click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  await expect(pop).toBeVisible();
});
