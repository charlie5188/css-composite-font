const { test, expect } = require('@playwright/test');
const { open } = require('./helpers');

async function fixture(page, category = 'han') {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: "@font-face { font-family: 'PickerFixture'; src: url('http://127.0.0.1:8765/tests/fixtures/Jost%5Bwght%5D.ttf'); }" }));
  await open(page);
  await page.click('#ltabFonts');
  await page.locator(`.ct-row[data-id="${category}"] .fsel`).selectOption('pick');
}

test('字体列表：按校样语言和类别初排，别名搜索、已知筛选与未知资料保留，检查后不移动候选', async ({ page }) => {
  await fixture(page);
  const options = page.locator('#gfOptions [data-family]');
  expect(await options.first().getAttribute('data-family')).toMatch(/SC|ZCOOL|Ma Shan/);
  const order = await options.evaluateAll(els => els.map(el => el.dataset.family));
  await options.filter({ hasText: 'Noto Serif SC' }).click();
  await expect(page.locator('#pkOk')).toBeEnabled();
  expect(await options.evaluateAll(els => els.map(el => el.dataset.family))).toEqual(order);
  await page.locator('#gfSearch').fill('思源宋');
  await expect(options).toHaveCount(2);
  await page.locator('#gfSearch').fill('noto san');
  await expect(options).toHaveCount(5);
  const entries = await page.evaluate(async () => {
    const { filterCatalog } = await import('./assets/js/font-catalog.js');
    return filterCatalog([{ family: 'Unknown', aliases: '', style: null, bold: null }, { family: 'No bold', aliases: '', style: 'sans', bold: false }], '', 'serif', true).map(x => x.family);
  });
  expect(entries).toEqual(['Unknown']);
  await page.locator('#gfSearch').fill('Shippori'); await page.locator('#gfBold').check();
  await expect(options).toHaveCount(1);
  await page.locator('#gfSearch').fill('Klee One');
  await expect(options).toHaveCount(0);
  await page.locator('#pkCancel').click();
  await page.locator('.ct-row[data-id="latin"] .fsel').selectOption('pick');
  expect(await options.first().getAttribute('data-family')).not.toMatch(/Noto.*(?:SC|TC|HK|JP|KR)/);
});

test('字体列表：搜索不检测半个名字，可键盘选择，四语言和手机深色布局保持可用', async ({ page }) => {
  await fixture(page);
  await page.locator('#gfSearch').fill('Noto');
  await expect(page.locator('#gfOptions [data-family]')).toHaveCount(9);
  await expect(page.locator('#gfFamily')).toHaveValue('Noto Serif SC');
  const first = page.locator('#gfOptions [data-family]').first();
  await first.focus(); await first.press('ArrowDown');
  await expect(page.locator('#gfOptions [data-family]').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#pkOk')).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('#pkOk')).toBeInViewport();
  expect(await page.locator('#picker').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  for (const lang of ['zh', 'tw', 'ja', 'en']) {
    await page.evaluate(async lang => { const i = await import('./assets/js/i18n.js'), u = await import('./assets/js/ui.js'); i.setUI(lang); u.applyUI(); }, lang);
    await expect(page.locator('#gfSearch')).not.toHaveAttribute('placeholder', '');
    await expect(page.locator('#gfStyle option').first()).not.toHaveText('pkAnyStyle');
  }
});


test('本机字体：按家族和样式选择，自动读取可变属性，拒绝授权仍可用完整名称', async ({ page }) => {
  // Font binaries are local OFL fixtures; this test never enumerates the host's actual fonts.
  await page.addInitScript(() => {
    window.queryLocalFonts = async () => [
      { family: 'Fixture Sans', fullName: 'Fixture Sans Regular', postscriptName: 'FixtureSans-Regular', style: 'Regular', blob: async () => (await fetch('/tests/fixtures/Jost%5Bwght%5D.ttf')).blob() },
      { family: 'Fixture Sans', fullName: 'Fixture Sans Bold', postscriptName: 'FixtureSans-Bold', style: 'Bold', blob: async () => (await fetch('/tests/fixtures/Jost%5Bwght%5D.ttf')).blob() },
    ];
  });
  await fixture(page);
  await page.locator('#picker [data-src="local"]').click();
  await expect(page.locator('#lfManual')).not.toHaveAttribute('open', '');
  await page.locator('#lfQuery').click();
  await expect(page.locator('#lfOptions [data-local-family]')).toHaveCount(1);
  await page.locator('#lfOptions [data-local-family]').click();
  await expect(page.locator('#lfFace option')).toHaveCount(2);
  await expect(page.locator('#lfName')).toHaveValue('Fixture Sans Regular');
  await page.locator('#lfFace').selectOption('Fixture Sans Bold');
  await expect(page.locator('#lfName')).toHaveValue('Fixture Sans Bold');
  await expect.poll(() => page.evaluate(async () => (await import('./assets/js/ui.js')).pickCand?.axis)).toEqual([100, 900]);
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('#pkOk')).toBeInViewport();
  expect(await page.locator('#picker').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await page.evaluate(() => { window.queryLocalFonts = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.locator('#lfQuery').click();
  await expect(page.locator('#lfManual')).toHaveAttribute('open', '');
  await expect(page.locator('#lfMsg')).toBeVisible();
});


test('导入字体：重复文件去重，取消后可跨类别复用，无效文件保留原候选', async ({ page }) => {
  await fixture(page);
  await page.locator('#picker [data-src="file"]').click();
  const font = require('path').resolve(__dirname, '../fixtures/Jost[wght].ttf');
  await page.locator('#ffFile').setInputFiles([font, font]);
  await expect(page.locator('#ffOptions [data-imported]')).toHaveCount(1);
  await expect(page.locator('#pkOk')).toBeEnabled();
  await expect(page.locator('#pkTargetCoverage')).toContainText('缺少');
  const id = await page.locator('#ffOptions [data-imported]').getAttribute('data-imported');
  await page.locator('#pkCancel').click();
  await expect(page.locator('.ct-row[data-id="han"] .fsel')).toHaveValue('own');
  await page.locator('.ct-row[data-id="latin"] .fsel').selectOption('pick');
  await page.locator('#picker [data-src="file"]').click();
  await page.locator('#ffOptions [data-imported]').click();
  await page.locator('#ffFile').setInputFiles({ name: 'broken.ttf', mimeType: 'font/ttf', buffer: Buffer.from('invalid') });
  await expect(page.locator('#ffError')).toContainText('broken.ttf');
  await expect(page.locator('#pkOk')).toBeEnabled();
  expect(await page.evaluate(async () => (await import('./assets/js/ui.js')).pickCand.fileId)).toBe(id);
  await page.locator('#pkOk').click();
  expect(await page.evaluate(async () => { const c = await import('./assets/js/core.js'); return [c.state.classes.latin.font.fileId, c.files.has(c.state.classes.latin.font.fileId)]; })).toEqual([id, true]);
});

test('导入字体：支持拖入，手机深色可选用；重新载入不假装保留文件', async ({ page }) => {
  await fixture(page);
  await page.locator('#picker [data-src="file"]').click();
  const transfer = await page.evaluateHandle(async () => {
    const data = new DataTransfer(); data.items.add(new File([await (await fetch('/tests/fixtures/Jost%5Bwght%5D.ttf')).arrayBuffer()], 'Jost.ttf', { type: 'font/ttf' })); return data;
  });
  await page.locator('#ffDrop').dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.locator('#ffOptions [data-imported]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('#pkOk')).toBeInViewport();
  expect(await page.locator('#picker').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  await page.reload(); await page.click('#ltabFonts');
  await page.locator('.ct-row[data-id="han"] .fsel').selectOption('pick');
  await page.locator('#picker [data-src="file"]').click();
  await expect(page.locator('#ffLibrary')).toBeHidden();
});


test('预览字重不保存：连续字重可单独试粗体，静态字体只列真实档位，应用仍用所选映射', async ({ page }) => {
  await fixture(page);
  const original = await page.evaluate(async () => JSON.stringify((await import('./assets/js/core.js')).state.classes.han));
  await page.locator('#pkProofWeightNum').fill('700');
  await expect(page.locator('#pkOk')).toBeEnabled();
  await expect(page.locator('#gfWeightNum')).toHaveValue('400');
  expect(await page.locator('#pkSample').evaluate(el => el.style.fontVariationSettings)).toContain('700');
  expect(await page.evaluate(async () => JSON.stringify((await import('./assets/js/core.js')).state.classes.han))).toBe(original);
  await page.locator('#gfSearch').fill('Shippori'); await page.locator('#gfOptions [data-family]').click();
  await expect(page.locator('#pkProofWeightSelect option')).toHaveCount(5);
  await expect(page.locator('#gfWeight option')).toHaveCount(5);
  await page.locator('#pkProofWeightSelect').selectOption('700');
  await expect(page.locator('#pkOk')).toBeEnabled();
  await expect(page.locator('#gfWeight')).toHaveValue('400');
  await page.locator('#pkOk').click();
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).state.classes.han.font.weight)).toBe(400);
});

test('上传的连续字体：预览与应用字重各自保存到正确位置', async ({ page }) => {
  await fixture(page); await page.locator('#picker [data-src="file"]').click();
  await page.locator('#ffFile').setInputFiles(require('path').resolve(__dirname, '../fixtures/Jost[wght].ttf'));
  await expect(page.locator('#ffWeightField')).toBeVisible();
  await page.locator('#ffWeightNum').fill('450'); await page.locator('#ffWeightNum').dispatchEvent('change');
  await page.locator('#pkProofWeightNum').fill('700');
  await expect(page.locator('#pkOk')).toBeEnabled();
  await expect(page.locator('#pkWeightMapping')).toContainText('450');
  await expect(page.locator('#pkWeightMapping')).toContainText('400');
  await page.locator('#pkOk').click();
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).state.classes.han.font.weight)).toBe(450);
});


test('逐档选择：自动字重随应用范围改变，应用全部时明确回到 400 的映射', async ({ page }) => {
  await fixture(page); await page.locator('#pkCancel').click();
  await page.evaluate(async () => (await import('./assets/js/ui.js')).openPicker({ type: 'class', id: 'han' }, 700));
  await page.locator('#gfSearch').fill('Noto Sans SC'); await page.locator('#gfOptions [data-family="Noto Sans SC"]').click();
  await expect(page.locator('#pkWeightMapping')).toHaveText('字体的 700 将用于组合的 700。');
  await page.locator('#pkScope [value="all"]').check();
  await expect(page.locator('#pkWeightMapping')).toHaveText('字体的 400 将用于组合的 400。');
  await expect(page.locator('#pkOk')).toBeEnabled(); await page.locator('#pkOk').click();
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).state.classes.han.font.weight)).toBe(400);
});

test('逐档上传字体：读取该档实际粗细，保存单档映射不改基础粗细', async ({ page }) => {
  await fixture(page); await page.locator('#picker [data-src="file"]').click();
  await page.locator('#ffFile').setInputFiles(require('path').resolve(__dirname, '../fixtures/Jost[wght].ttf'));
  await expect(page.locator('#pkOk')).toBeEnabled(); await page.locator('#pkOk').click();
  await page.evaluate(async () => (await import('./assets/js/ui.js')).openPicker({ type: 'class', id: 'han' }, 700));
  await expect(page.locator('#ffWeightNum')).toHaveValue('700');
  await page.locator('#ffWeightNum').fill('450'); await page.locator('#ffWeightNum').dispatchEvent('change');
  await expect(page.locator('#pkOk')).toBeEnabled(); await page.locator('#pkOk').click();
  expect(await page.evaluate(async () => { const c = await import('./assets/js/core.js'); return [c.state.classes.han.font.weight, c.state.wOver[700].han.weight]; })).toEqual([400, 450]);
});
