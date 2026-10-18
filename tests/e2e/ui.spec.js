const { test, expect } = require('@playwright/test');
const { open, pick, showExport, setLang } = require('./helpers');

test('页面加载、切换预设、切语言都没有脚本错误', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Failed network probes (such as unavailable Google Fonts weights) are not script errors.
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
  // Clicking OTF's info button opens help without selecting OTF.
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
  expect(Math.abs(m.specGap)).toBeLessThan(1);      // The specimen stays at the bottom of the proof pane.
});

test('导出对话框：打开、关闭、点背景关闭', async ({ page }) => {
  await open(page);
  await page.click('#exToggle');
  await expect(page.locator('#copyBtn')).toBeVisible();
  await page.click('#exClose');
  await expect(page.locator('#exDlg')).toBeHidden();
  await page.click('#exToggle');
  await page.mouse.click(5, 5);      // Outside the dialog.
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
  expect(css).toContain('line-break: strict');      // Layout-tab settings are still exported.
});

test('各字重：改某个字重的大小只写进那个字重，勾选和导出对话框同步', async ({ page }) => {
  await open(page);
  await page.click('#ltabFonts');
  const cell = page.locator('#wMatrix .mnum[data-k="latin"][data-w="700"]');
  await cell.fill('121'); await cell.press('Tab');
  await expect(page.locator('#wMatrix [data-row="700"]')).toHaveClass(/cur/);      // Editing a row previews that row's weight.
  await expect(page.locator('#vWn')).toHaveValue('700');
  expect(await page.inputValue('#classRows .ct-row[data-id="latin"] .num[data-field="size"]')).not.toBe('121');      // The base table above remains at 400.
  await page.click('#wMatrix input[data-wx="300"]');
  await showExport(page);
  await expect(page.locator('#exWeights [data-w="300"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#codeOut')).toContainText('size-adjust: 121%');      // Export updates are debounced; wait for the refresh.
  expect(await page.textContent('#codeOut')).not.toMatch(/font-weight: 300;/);
});

test('各字重：点击行间距或空白预览，保留导出勾选和输入、菜单操作', async ({ page }) => {
  await open(page);
  await page.click('#ltabFonts');
  // The gap between the first and weight columns hits the row itself, so click handling must not be limited to children.
  const row = page.locator('#wMatrix [data-row="700"]');
  // Font loading rebuilds the matrix. Read the row position in one evaluation, then let the locator wait for and click the current row.
  const gap = await row.evaluate(el => {
    const cell = el.querySelector('.wm-x').getBoundingClientRect(), bounds = el.getBoundingClientRect();
    return { x: cell.right - bounds.left + 3, y: bounds.height / 2 };
  });
  await row.click({ position: gap });
  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#vWn')).toHaveValue('700');
  await expect(page.locator('#wMatrix input[data-wx="700"]')).toBeChecked();
  // Export checkboxes and row-end menus must not also select their row for preview.
  await page.click('#wMatrix input[data-wx="300"]');
  await expect(page.locator('#wMatrix input[data-wx="300"]')).not.toBeChecked();
  await expect(page.locator('#vWn')).toHaveValue('700');
  await page.locator('#wMatrix [data-row="500"]').hover();
  await page.click('#wMatrix [data-wmenu="500"]');
  await expect(page.locator('#wRowMenu')).toBeVisible();
  await expect(page.locator('#vWn')).toHaveValue('700');
  await page.keyboard.press('Escape');
  // Excluded rows cannot be previewed; after reload, preview a selected export weight.
  await page.locator('#wMatrix [data-row="300"]').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('#wMatrix [data-row="300"]')).not.toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#wMatrix [data-pw="300"]')).toBeDisabled();
  await expect(page.locator('#vWn')).toHaveValue('700');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('composite-font:state:v1'))?.view.weight)).toBe(700);
  // Preview weight may already be saved; wait for the later checkbox change too before testing reload restoration.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('composite-font:state:v1'))?.weights.includes(300))).toBe(false);
  await page.reload(); await page.click('#ltabFonts');
  await expect(page.locator('#wMatrix [data-row="700"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#wMatrix input[data-wx="300"]')).not.toBeChecked();
  // After reselecting, keyboard preview works; numeric fields still support direct entry and preview.
  await page.click('#wMatrix input[data-wx="300"]');
  await page.locator('#wMatrix [data-pw="300"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#vWn')).toHaveValue('300');
  const size = page.locator('#wMatrix .mnum[data-k="latin"][data-w="600"]');
  await size.fill('119'); await size.press('Tab');
  await expect(size).toHaveValue('119');
  await expect(page.locator('#vWn')).toHaveValue('600');
});

test('各字重：窄屏的预览遵守导出选择，连续范围内可点行空白', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page); await page.click('#ltabFonts');
  await page.evaluate(async () => {
    const u = await import('./assets/js/ui.js');
    u.setWeights([400]);
  });
  await page.locator('#wMatrix [data-row="700"]').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('#wMatrix [data-row="400"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#wMatrix input[data-wx="700"]')).not.toBeChecked();
  await page.click('#mTabs [data-mv="preview"]');
  await expect(page.locator('#vWn')).toBeVisible();
  await expect(page.locator('#vWn')).toHaveValue('400');
  await page.locator('#vWn').press('ArrowDown');
  await expect(page.locator('#vWn')).toHaveValue('400');
  await expect(page.locator('#vWSlider')).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.click('#mTabs [data-mv="edit"]');
  await page.click('#vWMode [data-m="cont"]');
  await page.locator('#wMatrix [data-row="700"]').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('#wMatrix [data-row="700"]')).toHaveAttribute('aria-current', 'true');
  await page.click('#mTabs [data-mv="preview"]');
  await expect(page.locator('#vWn')).toHaveValue('700');
});

test('预览字重：滑杆节点、手动输入和当前字重取消都遵守已选档位', async ({ page }) => {
  await open(page); await page.click('#ltabFonts');
  await page.evaluate(async () => (await import('./assets/js/ui.js')).setWeights([400, 700, 900]));
  const field = page.locator('#vWn'), slider = page.locator('#vWSlider');
  await field.click();
  await expect(page.locator('#vWPop')).toBeVisible();
  await expect(page.locator('#vWTicks')).toHaveText('400700900');
  await field.press('Tab');
  await expect(slider).toBeFocused();
  await slider.press('End');
  await expect(field).toHaveValue('900');
  await expect(slider).toHaveAttribute('aria-valuetext', '900');
  await slider.press('ArrowLeft');
  await expect(field).toHaveValue('700');
  await slider.press('Escape');
  await expect(page.locator('#vWPop')).toBeHidden();
  await expect(field).toBeFocused();
  await field.fill('500'); await field.press('Enter');
  await expect(field).toHaveValue('400');
  await expect(page.locator('#vWPop')).toBeHidden();
  await field.fill('2000'); await field.press('Enter');
  await expect(field).toHaveValue('900');
  await field.fill(''); await field.press('Tab');
  await expect(field).toHaveValue('900');
  await page.keyboard.press('Escape');
  await page.click('#wMatrix input[data-wx="900"]');
  await expect(field).toHaveValue('700');
  await expect(page.locator('#wMatrix [data-row="700"]')).toHaveAttribute('aria-current', 'true');
  await field.press('ArrowDown');
  await expect(field).toHaveValue('400');
  await field.press('ArrowDown');
  await expect(field).toHaveValue('400');
  await expect(page.locator('#wMatrix input[data-wx="400"]')).toBeChecked();
  await expect(page.locator('#wMatrix input[data-wx="700"]')).toBeChecked();
});

test('预览字重：点击或键盘激活 B 展开滑杆，拖动结束不误触', async ({ page }) => {
  await open(page);
  const icon = page.locator('#vWBtn'), pop = page.locator('#vWPop');
  await icon.click();
  await expect(pop).toBeVisible();
  await expect(icon).toHaveAttribute('aria-expanded', 'true');
  await icon.click();
  await expect(pop).toBeVisible();
  await page.click('#proofText');
  await expect(pop).toBeHidden();
  await icon.focus(); await icon.press('Enter');
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  await icon.focus(); await icon.press('Space');
  await expect(pop).toBeVisible();
  await page.click('#proofText');
  const box = await icon.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 3 });
  await page.mouse.move(x, y, { steps: 3 });
  await page.mouse.up();
  await expect(pop).toBeHidden();
  await icon.click();
  await expect(pop).toBeVisible();
});

test('预览字重：连续模式的 400 / 700 刻度可跳转，并保留无级调整与范围限制', async ({ page }) => {
  await open(page); await page.click('#ltabFonts');
  await page.click('#vWMode [data-m="cont"]');
  const setRange = (lo, hi) => page.evaluate(async ([lo, hi]) => (await import('./assets/js/ui.js')).setWRange(lo, hi), [lo, hi]);
  await setRange(200, 800);
  const field = page.locator('#vWn'), slider = page.locator('#vWSlider'), ticks = page.locator('#vWTicks');
  const regular = ticks.locator('button[data-weight="400"]'), bold = ticks.locator('button[data-weight="700"]');
  await page.click('#vWBtn');
  await expect(ticks).toHaveText('200400700800');
  const initialLayout = await ticks.locator(':scope > *').evaluateAll(els => els.map(el => el.getBoundingClientRect().y));
  expect(Math.max(...initialLayout) - Math.min(...initialLayout)).toBeLessThan(1);
  await regular.click();
  await expect(field).toHaveValue('400');
  await expect(slider).toHaveValue('400');
  await expect(regular).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vWPop')).toBeVisible();
  await regular.press('Tab');
  await expect(bold).toBeFocused();
  await bold.press('Enter');
  await expect(field).toHaveValue('700');
  await expect(slider).toHaveValue('700');
  await expect.poll(() => page.locator('html').evaluate(el => el.style.getPropertyValue('--fw'))).toBe('700');
  await slider.focus(); await slider.press('ArrowRight');
  await expect(field).toHaveValue('701');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await setRange(399, 701);
  await expect(ticks).toHaveText('400700');
  await expect(slider).toHaveAttribute('min', '399'); await expect(slider).toHaveAttribute('max', '701');
  // Hide endpoint labels when crowded, preserving common ticks at their true positions and leaving the preview range unchanged.
  const layout = await page.locator('#vWPop').evaluate(el => {
    return [...el.querySelectorAll('button[data-weight]')].map(b => ({ pos: parseFloat(b.style.getPropertyValue('--tick')), rect: b.getBoundingClientRect().toJSON() }));
  });
  expect(layout[0].pos).toBeCloseTo(100 / 302);
  expect(layout[1].pos).toBeCloseTo(30100 / 302);
  expect(layout[0].rect.right).toBeLessThan(layout[1].rect.left);
  await setRange(400, 700);
  await expect(regular).toHaveCount(1); await expect(bold).toHaveCount(1);
  await regular.click(); await regular.press('Space');
  await expect(field).toHaveValue('400');
  await setRange(450, 650);
  await expect(ticks).toHaveText('450650');
  await expect(ticks.locator('button')).toHaveCount(0);
  await expect(field).toHaveValue('450');
  await setRange(700, 900);
  await expect(ticks).toHaveText('700900');
});

test('预览字重：连续滑杆、输入与聚焦后拖动 B 实时同步', async ({ page }) => {
  await open(page); await page.click('#ltabFonts');
  await page.click('#vWMode [data-m="cont"]');
  await page.evaluate(async () => (await import('./assets/js/ui.js')).setWRange(350, 650));
  const field = page.locator('#vWn'), slider = page.locator('#vWSlider');
  await field.click(); await field.press('Tab');
  await slider.press('Home'); await slider.press('ArrowRight');
  await expect(field).toHaveValue('351');
  await slider.press('End');
  await expect(field).toHaveValue('650');
  await field.fill('555');
  await expect(slider).toHaveValue('555');
  await expect.poll(() => page.locator('html').evaluate(el => el.style.getPropertyValue('--fw'))).toBe('555');
  await field.press('ArrowUp');
  await expect(field).toHaveValue('556');
  await field.press('Shift+ArrowUp');
  await expect(field).toHaveValue('566');
  await field.fill('200'); await field.press('Enter');
  await expect(field).toHaveValue('350');
  await field.fill('500');
  const box = await page.locator('[data-scrub="w"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2, { steps: 5 });
  // The current value must be visible before pointer release, even while the numeric field retains focus.
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('545');
  await expect(slider).toHaveValue('545');
  await expect.poll(() => page.locator('html').evaluate(el => el.style.getPropertyValue('--fw'))).toBe('545');
  await page.mouse.up();
  await field.fill('1000'); await field.press('Enter');
  await expect(field).toHaveValue('650');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#mTabs [data-mv="preview"]');
  await field.click();
  await expect(page.locator('#vWPop')).toBeVisible();
  const rect = await page.locator('#vWPop').boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(8); expect(rect.x + rect.width).toBeLessThanOrEqual(382);
});

test('预览字重：重载旧配置时收进导出选择', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const key = 'composite-font:state:v1', state = structuredClone((await import('./assets/js/core.js')).state);
    state.weights = [400, 700]; state.view.weight = 100;
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('#vWn')).toHaveValue('400');
});

test('撤销 / 重做：按钮和快捷键，输入框里的 ⌘Z 不抢', async ({ page }) => {
  await open(page);
  await page.click('#ltabFonts');
  const size = page.locator('#classRows .ct-row[data-id="latin"] .num[data-field="size"]');
  const before = await size.inputValue();
  await expect(page.locator('#undoBtn')).toHaveAttribute('aria-disabled', 'true');
  await size.fill('131'); await size.press('Tab');
  await expect(page.locator('#undoBtn')).toHaveAttribute('aria-disabled', 'false');      // Saving is debounced by 400 ms; wait for the history entry before undoing.
  await page.click('#undoBtn');
  await expect(size).toHaveValue(before);
  await page.click('#redoBtn');
  await expect(size).toHaveValue('131');
  await page.click('#proofText');      // The directly editable proof owns text undo, even before its first edit.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(size).toHaveValue('131');
  await page.click('.brand');           // Outside editors, Cmd+Z still undoes font settings.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await expect(size).toHaveValue(before);
});

test('预设筛选：组内任选、组间同时满足，没有结果时可以清除', async ({ page }) => {
  await open(page);
  const cards = page.locator('#presetList .pcard');
  const all = await cards.count();
  await page.click('#pfBtn');      // Filters are in the menu.
  await page.click('[data-pf="style:serif"]');
  await page.click('[data-pf="region:jp"]');
  await expect(cards).toHaveCount(1);      // Mincho x Cormorant.
  await page.click('[data-pf="region:tc"]');
  await expect(cards).toHaveCount(2);      // Also include Ming x Garamond.
  await page.click('[data-pf="src:local"]');
  await expect(cards).toHaveCount(0);      // All macOS presets use sans-serif Han fonts.
  await page.click('#presetCards [data-pf="clear"]');
  await expect(cards).toHaveCount(all);
});

test('保存预设用对话框：地区和风格预先推算好、可以改，存下来后能按它筛选', async ({ page }) => {
  await open(page);
  await page.click('#savePresetBtn');
  await expect(page.locator('#saveDlg')).toBeVisible();
  await expect(page.locator('#saveRegion [aria-checked="true"]')).toHaveAttribute('data-v', 'sc');      // Default preset: Song x Garamond.
  await expect(page.locator('#saveStyle [aria-checked="true"]')).toHaveAttribute('data-v', 'serif');
  await page.fill('#saveName', '测试');
  await page.click('#saveStyle [data-v="other"]');
  await page.click('#saveOk');
  await expect(page.locator('#saveDlg')).toBeHidden();
  await page.click('#pfBtn');
  await page.click('[data-pf="style:other"]');
  await expect(page.locator('#presetList .pname')).toHaveText(['测试']);
});

test('(i)：鼠标停一会儿就打开说明，移开关掉；悬停后再点就固定打开', async ({ page }) => {
  await open(page);
  await page.click('#ltabFonts');
  const pop = page.locator('#infoPop'), info = page.locator('.ct-head .info').first();
  await info.hover();
  await expect(pop).toBeVisible();
  await expect(page.locator('#tip')).toBeHidden();      // Do not show an intermediate help prompt.
  await page.mouse.move(5, 5);
  await expect(pop).toBeHidden();
  await info.hover();
  await expect(pop).toBeVisible();
  await info.click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  await expect(pop).toBeVisible();
});

test('各字重：静态字体只列有的字重，行末菜单能换字体、恢复这一行', async ({ page }) => {
  await open(page);
  await pick(page, 'mincho-jp');      // Shippori Mincho supports only 400-800.
  await page.click('#ltabFonts');
  const sel = () => page.locator('#wMatrix [data-row="200"] select.msel').first();
  await expect.poll(async () => sel().evaluate(s => [...s.options].map(o => o.value).join())).toBe('400,500,600,700,800');
  await sel().focus();      // Follow real interaction: focus before selecting so background font loading cannot replace the active control.
  await sel().selectOption('700');
  await expect(sel()).toHaveClass(/\bset\b/);
  await page.locator('#wMatrix [data-row="200"]').hover();
  await page.click('#wMatrix [data-wmenu="200"]');
  await expect(page.locator('#wRowMenu')).toContainText('换字体');
  await page.click('#wRowMenu [data-wm-reset]');
  await expect(sel()).not.toHaveClass(/\bset\b/);
});

test('字体状态点：首次加载已有提示，悬停时状态变化会同步原因，完成后隐藏', async ({ page }) => {
  // Freeze the initial load so tooltip checks do not depend on which font downloads first; then simulate only source-status changes.
  await page.route('https://fonts.googleapis.com/**', route => {
    if (route.request().resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
  });
  await open(page); await page.click('#ltabFonts');
  const dot = page.locator('#classRows [data-id="han"] .status');
  await expect(dot).toHaveAttribute('title', '正在加载字体，请稍候');
  await page.locator('#classRows [data-id="han"] .fsel').focus();
  await dot.hover(); await expect(page.locator('#tip')).toHaveText('正在加载字体，请稍候');
  await expect(page.locator('#tip')).toBeVisible();
  const changeStatus = async (status, errKey) => page.evaluate(async ({ status, errKey }) => {
    const core = await import('./assets/js/core.js');
    const s = core.sources.get(document.querySelector('#classRows [data-id="han"] .status').dataset.key);
    Object.assign(s, { status, errKey }); core.onSourcesChanged();
  }, { status, errKey });
  await changeStatus('error', 'errLocal');
  await expect(dot).toHaveAccessibleName('字体加载失败：这台电脑上没找到这个字体名');
  await expect(page.locator('#tip')).toHaveText('字体加载失败：这台电脑上没找到这个字体名');
  await changeStatus('error', 'errFileGone');
  await expect(page.locator('#tip')).toContainText('字体文件需要重新上传');
  await changeStatus('loading');
  await expect(page.locator('#tip')).toHaveText('正在加载字体，请稍候');
  await changeStatus('ok');
  await expect(dot).toBeHidden();
  // When the status dot disappears, the font menu may move under the pointer and show its name, but the old loading tooltip must not remain.
  await expect(page.locator('#tip')).not.toHaveText('正在加载字体，请稍候');
  await expect(page.locator('#classRows [data-id="digit"] .status')).toBeHidden();
});

test('字体状态点：四语言、键盘聚焦与窄屏深色提示', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => {
    if (route.request().resourceType() === 'stylesheet') return route.fulfill({ contentType: 'text/css', body: '' });
  });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await open(page); await page.click('#ltabFonts');
  const labels = { tw: '正在載入字型，請稍候', ja: 'フォントを読み込み中です。しばらくお待ちください', en: 'Loading font; please wait', zh: '正在加载字体，请稍候' };
  for (const [lang, label] of Object.entries(labels)) {
    await setLang(page, lang);
    const dot = page.locator('#classRows [data-id="han"] .status');
    await expect(dot).toHaveAccessibleName(label);
    await dot.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await expect(dot).toBeFocused(); await expect(page.locator('#tip')).toHaveText(label);
    await expect(page.locator('#tip')).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({ width: 390, height: 600 });
  const dot = page.locator('#classRows [data-id="han"] .status');
  await expect(dot).toHaveCSS('animation-name', 'none');
  await dot.hover(); await expect(page.locator('#tip')).toBeVisible();
  const r = await page.locator('#tip').boundingBox();
  expect(r.x).toBeGreaterThanOrEqual(4); expect(r.x + r.width).toBeLessThanOrEqual(386);
});

test('连续字重表：纯大小表头合并，静态字体保留粗细列，调整值在切换模式后保留', async ({ page }) => {
  await open(page); await page.click('#ltabFonts');
  const original = await page.evaluate(async () => JSON.stringify((await import('./assets/js/core.js')).state.wOver));
  await page.click('#vWMode [data-m="cont"]');
  await expect(page.locator('#vWNote')).toHaveCount(0);
  await expect(page.locator('#wRange')).toBeVisible();
  await expect(page.locator('#wSub')).toHaveCount(0);
  await expect(page.locator('#wMatrix .wm-sub')).toHaveCount(0);
  const names = { zh: ['汉字大小', '半角西文大小'], tw: ['漢字大小', '半形西文大小'], ja: ['漢字のサイズ', '半角欧文のサイズ'], en: ['Han size', 'Western size'] };
  for (const [lang, labels] of Object.entries(names)) {
    await setLang(page, lang);
    await expect(page.locator('#wMatrix .wm-clabel')).toHaveText(labels);
  }
  const size = page.locator('#wMatrix .mnum[data-k="latin"][data-w="700"]');
  await size.fill('118'); await size.press('Tab');
  await page.click('#vWMode [data-m="steps"]');
  await expect(page.locator('#wMatrix .wm-sub')).toHaveCount(1);
  await expect(page.locator('#wMatrix .mw[data-k="latin"][data-w="700"]')).toBeVisible();
  const saved = await page.evaluate(async () => (await import('./assets/js/core.js')).state.wOver);
  expect(saved['700'].latin.weight).toBe(JSON.parse(original)['700'].latin.weight);
  expect(saved['700'].latin.size).toBe(118);
  await page.click('#vWMode [data-m="cont"]');
  await expect(size).toHaveValue('118');
  // These presets use static fonts; continuous export still allows each segment to select an available weight.
  await page.click('#ltabPresets'); await pick(page, 'antigochi');
  await page.click('#saveDiscard');
  await page.click('#ltabFonts'); await page.click('#vWMode [data-m="cont"]');
  await expect(page.locator('#wMatrix .wm-sub')).toHaveCount(1);
  await expect(page.locator('#wMatrix .wm-c')).not.toHaveCount(0);
});

test('字体状态点：连续模式重载和中间字重使用实际可变来源，成功不再等待，失败显示原因', async ({ page }) => {
  let failVariable = false;
  await page.route('https://fonts.googleapis.com/**', route => {
    const family = new URL(route.request().url()).searchParams.get('family') || '';
    const empty = failVariable && family.startsWith('Noto Serif SC:') && family.includes('..');
    return route.fulfill({ contentType: 'text/css', body: empty ? '/* no font faces */' : '@font-face {font-family: Fixture; src: url("http://127.0.0.1:8765/tests/fixtures/NotoSansJP-Subset.ttf");}' });
  });
  await open(page); await page.click('#ltabFonts');
  await page.click('#vWMode [data-m="cont"]');
  await page.fill('#vWn', '600'); await page.locator('#vWn').press('Enter');
  await expect.poll(() => page.evaluate(async () => (await import('./assets/js/core.js')).sources.get('g:Noto Serif SC@vf')?.status)).toBe('ok');
  // A cold start does not request a separate 600. Status must read the loaded @vf record rather than treat an absent record as loading.
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('composite-font:state:v1') || '{}').view?.weight)).toBe(600);
  await page.reload();
  const dot = page.locator('#classRows [data-id="han"] .status');
  await expect(dot).toHaveAttribute('data-key', 'g:Noto Serif SC@vf');
  await expect(dot).toBeHidden();
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).sources.has('g:Noto Serif SC@600'))).toBe(false);
  await page.fill('#vWn', '650'); await page.locator('#vWn').press('Enter');
  await expect(dot).toBeHidden();
  failVariable = true; await page.reload();
  await expect(dot).toHaveClass('status error');
  await expect(dot).toHaveAccessibleName('字体加载失败：Google Fonts 没有返回字体');
  await expect(page.locator('#classRows [data-id="han"] .ct-err')).toHaveText('Google Fonts 没有返回字体');
  failVariable = false; await page.reload();
  await expect(dot).toHaveClass('status ok'); await expect(dot).toBeHidden();
});


test('后台字体资料更新保留正在编辑的表格控件和数字草稿', async ({ page }) => {
  await open(page); await page.click('#ltabFonts');
  const input = page.locator('#wMatrix .mnum[data-k="latin"][data-w="600"]');
  await input.fill('119');
  const preserved = await input.evaluate(async el => {
    const render = await import('./assets/js/render.js'), core = await import('./assets/js/core.js');
    render.regionChanged(); core.weightNamesChanged();
    // Both callbacks are debounced; inspect the original node after they have run.
    await new Promise(resolve => setTimeout(resolve, 150));
    return el.isConnected && document.activeElement === el && el.value === '119';
  });
  expect(preserved).toBe(true); await input.press('Tab');
  await expect(input).toHaveValue('119');
});
