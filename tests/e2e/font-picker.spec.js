const { test, expect } = require('@playwright/test');
const { open } = require('./helpers');

async function selectFilter(page, id, values) {
  const wanted = Array.isArray(values) ? values : [values], button = '#'+(id === 'gfStyle' ? 'gfStyleBtn' : id+'Btn');
  await page.locator(button).click();
  for (const input of await page.locator('#'+id+' input').all()) await input.setChecked(wanted.includes(await input.inputValue()));
  await page.locator(button).click();
}

async function setBoldFilter(page, checked = true) {
  await page.locator('#pkWeightTypeBtn').click();
  await page.locator('#gfBold').setChecked(checked);
  await page.locator('#pkWeightTypeBtn').click();
}

async function openClassPicker(page, category) {
  // Resolve and activate in one task: even an element handle can become detached during metadata refreshes.
  const opened = await page.evaluate(category => {
    const el = document.querySelector(`.ct-row[data-id="${category}"] .fsel`);
    el.focus(); el.value = 'pick'; el.dispatchEvent(new Event('change', { bubbles: true }));
    return document.querySelector('#picker').open;
  }, category);
  expect(opened).toBe(true);
  await expect(page.locator('#picker')).toBeVisible();
}

async function fixture(page, category = 'han') {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: "@font-face { font-family: 'PickerFixture'; src: url('http://127.0.0.1:8765/tests/fixtures/Jost%5Bwght%5D.ttf'); }" }));
  await open(page);
  await page.click('#ltabFonts');
  await openClassPicker(page, category);
}

test('字体列表：按名称初排，别名搜索、已知筛选与未知资料保留，检查后不移动候选', async ({ page }) => {
  await fixture(page);
  const options = page.locator('#gfOptions [data-family]');
  const order = await options.evaluateAll(els => els.map(el => el.dataset.family));
  expect(order).toEqual([...order].sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })));
  await options.filter({ hasText: 'Noto Serif SC' }).click();
  await expect(page.locator('#pkOk')).toBeEnabled();
  expect(await options.evaluateAll(els => els.map(el => el.dataset.family))).toEqual(order);
  await page.locator('#gfSearch').fill('思源宋');
  await expect(options).toHaveCount(2);
  await expect(page.locator('#gfOptions [data-family="Noto Serif SC"] .font-option-native')).toContainText('思源宋体');
  await page.locator('#gfSearch').fill('noto san');
  await expect(options).toHaveCount(5);
  const entries = await page.evaluate(async () => {
    const { filterCatalog } = await import('./assets/js/font-catalog.js');
    return filterCatalog([{ family: 'Unknown', aliases: '', style: null, bold: null }, { family: 'No bold', aliases: '', style: 'sans', bold: false }], '', 'serif', true).map(x => x.family);
  });
  expect(entries).toEqual(['Unknown']);
  await page.locator('#gfSearch').fill('Shippori'); await setBoldFilter(page);
  await expect(page.locator('#gfBold')).toBeChecked();
  await expect(page.locator('#gfOptions [data-family="Shippori Mincho"]')).toHaveCount(1);
  await expect(page.locator('#gfOptions [data-family="Shippori Antique"]')).toHaveCount(0);
  await page.locator('#gfSearch').fill('Klee One');
  await expect(options).toHaveCount(0);
  await page.locator('#pkCancel').click();
  await openClassPicker(page, 'latin');
  expect(await options.first().getAttribute('data-family')).not.toMatch(/Noto.*(?:SC|TC|HK|JP|KR)/);
});

test('中日字体库：完整使用官方目录，新增字体支持中英文搜索、筛选和选择', async ({ page }) => {
  await fixture(page, 'latin');
  const metadata = await page.evaluate(async () => {
    const { GF_LIST } = await import('./assets/js/core.js');
    const { GF_CJ } = await import('./assets/js/gfmeta.js');
    const { CATALOG_COVERAGE } = await import('./assets/js/font-catalog-data.js');
    const listed = [...document.querySelectorAll('#gfOptions [data-family]')].map(el => el.dataset.family);
    return { missing: GF_CJ.filter(f => !listed.includes(f)), unchecked: GF_LIST.filter(f => !Object.hasOwn(CATALOG_COVERAGE, f)), unique: new Set(listed).size === listed.length };
  });
  expect(metadata).toEqual({ missing: [], unchecked: [], unique: true });
  await selectFilter(page, 'pkSource', 'google');
  await page.locator('#gfSearch').fill('ZCOOL');
  await expect(page.locator('#gfOptions [data-family]')).toHaveCount(3);
  await page.locator('#gfSearch').fill('站酷快乐');
  const choice = page.locator('#gfOptions [data-family="ZCOOL KuaiLe"]');
  await expect(choice).toHaveCount(1);
  await selectFilter(page, 'pkWeightType', 'stepped');
  await expect(choice.locator('.font-option-source')).toContainText('分档 400');
  await choice.click();
  await expect(page.locator('#pkSelectedName')).toHaveText('ZCOOL KuaiLe');
  await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pkOk')).toBeEnabled();
  await page.locator('#pkFilterClear').click(); await page.locator('#gfSearch').fill('Yuji');
  await expect(page.locator('#gfOptions [data-family="Yuji Boku"]')).toHaveCount(1);
});

test('列表样张优先体现字体主要文字，日文混排假名，右侧仍按编辑类别预览', async ({ page }) => {
  await fixture(page, 'latin');
  const samples = [
    ['Noto Sans SC', '永国字体 春山可望'], ['Noto Sans TC', '永國字體 春山可望'],
    ['Noto Sans JP', '永あア 春のひかり'], ['Hachi Maru Pop', '永あア 春のひかり'],
    ['ZCOOL KuaiLe', '永国字体 春山可望'], ['Noto Sans KR', '한글 가나다 漢字'], ['Inter', 'Hamburg Aa Gg 0123'],
  ];
  for (const [family, sample] of samples) {
    await page.locator('#gfSearch').fill(family);
    await expect(page.locator('#gfOptions [data-family="'+family+'"] .font-option-sample')).toHaveText(sample);
  }
  await expect(page.locator('#pkSample')).toContainText('Hamburg');
  await page.locator('#gfSearch').fill('Hachi Maru Pop');
  await page.locator('#gfOptions [data-family="Hachi Maru Pop"]').click();
  await expect(page.locator('#pkSample')).toContainText('Hamburg');
  await expect(page.locator('#pkSample')).not.toContainText('あ');
  await page.locator('#pkCancel').click(); await openClassPicker(page, 'han');
  await page.locator('#gfSearch').fill('Inter');
  await expect(page.locator('#gfOptions [data-family="Inter"] .font-option-sample')).toHaveText('Hamburg Aa Gg 0123');
  await expect(page.locator('#pkSample')).toContainText('永国字体');
});

test('字符覆盖筛选只显示已确认符合的字体；未检查字体清除筛选后仍可查看', async ({ page }) => {
  await page.addInitScript(() => {
    window.queryLocalFonts = async () => ['Fixture Latin', 'ZZ Unread'].map(family => ({ family, fullName: family+' Regular', postscriptName: family.replaceAll(' ', '')+'-Regular', style: 'Regular', blob: async () => (await fetch('/tests/fixtures/Jost%5Bwght%5D.ttf')).blob() }));
  });
  await fixture(page, 'latin');
  await page.locator('#gfSearch').fill('Fixture Latin');
  const latin = page.locator('#gfOptions [data-local-family="Fixture Latin"]');
  await expect(latin.locator('.font-option-sample')).toBeVisible();
  await page.locator('#gfSearch').fill('');
  await selectFilter(page, 'pkCoverage', ['sc']);
  await expect(page.locator('#gfOptions [data-family="Noto Sans SC"]')).toHaveCount(1);
  await expect(page.locator('#gfOptions [data-family="Inter"]')).toHaveCount(0);
  await expect(page.locator('#gfOptions [data-local-family="Fixture Latin"]')).toHaveCount(0);
  await expect(page.locator('#gfOptions [data-local-family="ZZ Unread"]')).toHaveCount(0);
  await selectFilter(page, 'pkCoverage', []);
  await expect(page.locator('#gfOptions [data-local-family="ZZ Unread"]')).toHaveCount(1);
  const matches = await page.evaluate(async () => {
    const { filterCatalog } = await import('./assets/js/font-catalog.js');
    return filterCatalog([{ family: 'Confirmed', coverage: { sc: true, kana: true } }, { family: 'Partial', coverage: { sc: true } }, { family: 'Unknown' }, { family: 'No Han', coverage: { sc: false, kana: true } }], '', [], false, [], ['sc', 'kana']).map(f => f.family);
  });
  expect(matches).toEqual(['Confirmed']);
});

test('字体来源与字重：桌面右上、小档数列出值，窄列表换行后靠右', async ({ page }) => {
  await fixture(page);
  await selectFilter(page, 'pkSource', 'google');
  await page.locator('#gfSearch').fill('BIZ UDPGothic');
  const row = page.locator('#gfOptions [data-family="BIZ UDPGothic"]');
  await expect(row.locator('.font-option-source')).toHaveText('Google Fonts · 分档 400/700');
  const desktop = await row.evaluate(el => {
    const name = el.querySelector('.font-option-name').getBoundingClientRect(), source = el.querySelector('.font-option-source').getBoundingClientRect();
    return source.left >= name.right && Math.abs(source.top - name.top) < 6;
  });
  expect(desktop).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const lang of ['zh', 'tw', 'ja', 'en']) {
    await page.evaluate(async lang => { const i = await import('./assets/js/i18n.js'), u = await import('./assets/js/ui.js'); i.setUI(lang); u.applyUI(); }, lang);
    expect(await row.evaluate(el => {
      const name = el.querySelector('.font-option-name').getBoundingClientRect(), source = el.querySelector('.font-option-source').getBoundingClientRect(), title = el.querySelector('.font-option-title').getBoundingClientRect();
      return source.top >= name.bottom && Math.abs(source.right - title.right) < 2 && source.right <= innerWidth && el.scrollWidth <= el.clientWidth;
    })).toBe(true);
  }
});

test('字体排序：名称、已知范围与精简菜单，保留搜索筛选与候选且加载后顺序不变', async ({ page }) => {
  await fixture(page, 'latin');
  const options = page.locator('#gfOptions [data-choice]');
  await page.locator('#gfOptions [data-family="Inter"]').click();
  await expect(page.locator('#pkOk')).toBeEnabled();
  await selectFilter(page, 'pkSource', 'google');
  const chooseSort = async mode => { await page.locator('#pkSortBtn').click(); await page.locator(`#pkSort input[value="${mode}"]`).click(); };
  await chooseSort('name');
  const names = await options.evaluateAll(els => els.map(el => el.dataset.family));
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })));
  await expect(page.locator('#pkSelectedName')).toHaveText('Inter');
  await expect(page.locator('#pkSource input[value="google"]')).toBeChecked();
  await page.locator('#gfSearch').fill('Noto'); await chooseSort('weights');
  await expect(page.locator('#gfSearch')).toHaveValue('Noto');
  await expect(page.locator('#gfOptions .font-option-source').first()).toContainText('–');
  const order = await options.evaluateAll(els => els.map(el => el.dataset.choice));
  await page.evaluate(async () => { const u = await import('./assets/js/ui.js'); u.renderCatalog(); });
  expect(await options.evaluateAll(els => els.map(el => el.dataset.choice))).toEqual(order);
  const sorted = await page.evaluate(async () => {
    const { sortCatalog } = await import('./assets/js/font-catalog.js');
    const items = [{ family: 'Unknown', region: 'latin', weightRange: null }, { family: 'Narrow', region: 'latin', weightRange: [400, 700] }, { family: 'Single', region: 'latin', weightRange: [400, 400] }, { family: 'Wide', region: 'latin', weightRange: [100, 900] }];
    return { ranges: sortCatalog(items, 'weights').map(x => x.family) };
  });
  expect(sorted.ranges).toEqual(['Wide', 'Narrow', 'Single', 'Unknown']);
  await chooseSort('name'); await expect(page.locator('#pkSortBtn')).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: 'dark' });
  for (const lang of ['zh', 'tw', 'ja', 'en']) {
    await page.evaluate(async lang => { const i = await import('./assets/js/i18n.js'), u = await import('./assets/js/ui.js'); i.setUI(lang); u.applyUI(); }, lang);
    await page.locator('#pkSortBtn').click();
    expect(await page.locator('#pkSortPop').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth; })).toBeTruthy();
    await expect(page.locator('#pkSort label')).toHaveCount(2);
    await page.keyboard.press('Escape'); await expect(page.locator('#picker')).toBeVisible();
  }
});

test('新增筛选：字重类型、全选类别覆盖和中日文风格联合筛选，清除不改搜索排序', async ({ page }) => {
  await fixture(page);
  await selectFilter(page, 'pkSource', 'google');
  await selectFilter(page, 'pkWeightType', 'continuous');
  await expect(page.locator('#gfOptions [data-family="Inter"]')).toHaveCount(1);
  await expect(page.locator('#gfOptions [data-family="Klee One"]')).toHaveCount(0);
  await selectFilter(page, 'pkWeightType', 'stepped');
  await expect(page.locator('#gfOptions [data-family="Inter"]')).toHaveCount(0);
  await expect(page.locator('#gfOptions [data-family="Klee One"]')).toHaveCount(1);
  await selectFilter(page, 'pkWeightType', ['stepped', 'bold']);
  await expect(page.locator('#gfOptions [data-family="Klee One"]')).toHaveCount(0);
  await selectFilter(page, 'pkWeightType', ['stepped']);
  await selectFilter(page, 'pkCoverage', ['jp', 'kana']);
  await selectFilter(page, 'gfStyle', 'handwriting');
  await expect(page.locator('#gfOptions [data-family="Klee One"]')).toHaveCount(1);
  await expect(page.locator('#gfOptions [data-family="Inter"]')).toHaveCount(0);
  await expect(page.locator('#pkCoverageBtn')).toContainText('2');
  await selectFilter(page, 'pkCoverage', ['kana']);
  await selectFilter(page, 'gfStyle', ['kai', 'rounded']);
  await expect(page.locator('#gfOptions [data-family="Ma Shan Zheng"]')).toHaveCount(1);
  await expect(page.locator('#gfOptions [data-family="Zen Maru Gothic"]')).toHaveCount(1);
  await selectFilter(page, 'pkCoverage', ['bopo']);
  await expect(page.locator('#gfOptions [data-family="Ma Shan Zheng"]')).toHaveCount(0);
  await expect(page.locator('#gfOptions [data-family="Zen Maru Gothic"]')).toHaveCount(1);
  await page.locator('#pkSortBtn').click(); await page.locator('#pkSort input[value="name"]').click();
  await page.locator('#gfSearch').fill('Zen'); await page.locator('#pkFilterClear').click();
  await expect(page.locator('#gfSearch')).toHaveValue('Zen'); await expect(page.locator('#pkSort input[value="name"]')).toBeChecked();
  await expect(page.locator('#pkWeightType input:checked')).toHaveCount(0); await expect(page.locator('#pkCoverage input:checked')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: 'dark' });
  for (const lang of ['zh', 'tw', 'ja', 'en']) {
    await page.evaluate(async lang => { const i = await import('./assets/js/i18n.js'), u = await import('./assets/js/ui.js'); i.setUI(lang); u.applyUI(); }, lang);
    for (const [button, pop] of [['pkWeightTypeBtn', 'pkWeightTypePop'], ['pkCoverageBtn', 'pkCoveragePop'], ['gfStyleBtn', 'gfStylePop']]) {
      await page.locator('#'+button).click();
      expect(await page.locator('#'+pop).evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && el.scrollWidth <= el.clientWidth; })).toBeTruthy();
      await page.keyboard.press('Escape'); await expect(page.locator('#picker')).toBeVisible();
    }
  }
});

test('字体资料：仿宋楷体教科书体独立，圆体兼属黑体，未知字重保留、覆盖须确认', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const { catalogStyles, catalogInfo, filterCatalog } = await import('./assets/js/font-catalog.js');
    const styles = ['STFangsong', 'Kaiti SC', 'DFKai-SB', 'UD Digi Kyokasho', 'Kaisei Tokumin', 'Maruburi', 'Rounded Serif'].map(f => catalogStyles(f, 'serif'));
    styles.splice(4, 0, catalogStyles('Hiragino Maru Gothic ProN', 'sans'));
    const fonts = [{ family: 'Unknown', aliases: '', styles: null, weightType: null, coverage: null }, { family: 'Known no kana', aliases: '', styles: ['sans'], weightType: 'continuous', coverage: { sc: true, kana: false } }, { family: 'Both', aliases: '', styles: ['kai'], weightType: 'stepped', coverage: { sc: true, kana: true } }];
    return { styles, matches: filterCatalog(fonts, '', ['kai'], false, ['stepped'], ['sc', 'kana']).map(f => f.family), google: ['Inter', 'Klee One', 'Zen Maru Gothic'].map(f => ({ type: catalogInfo(f).weightType, styles: catalogInfo(f).styles })) };
  });
  expect(result.styles).toEqual([['fangsong'], ['kai'], ['kai'], ['textbook'], ['sans', 'rounded'], ['serif'], ['serif'], ['serif', 'rounded']]);
  expect(result.matches).toEqual(['Both']);
  expect(result.google).toEqual([{ type: 'continuous', styles: ['sans'] }, { type: 'stepped', styles: ['handwriting'] }, { type: 'stepped', styles: ['sans', 'rounded'] }]);
});

test('官方手写分类与书法细分：保留多标签、未知字体和合成分类', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const { catalogInfo, catalogStyles, filterCatalog } = await import('./assets/js/font-catalog.js');
    const { GF_STYLE } = await import('./assets/js/gfmeta.js');
    const families = ['Zhi Mang Xing', 'Long Cang', 'Liu Jian Mao Cao', 'Ma Shan Zheng', 'LXGW WenKai TC', 'Klee One'];
    return { styles: families.map(f => catalogInfo(f).styles),
      coarseOther: families.every(f => GF_STYLE.other.split(',').includes(f)),
      unknown: filterCatalog([{ family: 'Unknown', styles: catalogStyles('Unknown', null) }], '', ['handwriting'], false).length };
  });
  expect(result.styles).toEqual([['brush', 'handwriting'], ['brush', 'handwriting'], ['brush', 'handwriting'], ['kai', 'brush', 'handwriting'], ['kai', 'handwriting'], ['handwriting']]);
  expect(result.coarseOther).toBe(true); expect(result.unknown).toBe(1);
  await selectFilter(page, 'pkSource', 'google');
  for (const style of ['handwriting', 'brush']) {
    await selectFilter(page, 'gfStyle', style);
    for (const family of ['Zhi Mang Xing', 'Long Cang', 'Liu Jian Mao Cao']) {
      await page.locator('#gfSearch').fill(family);
      await expect(page.locator('#gfOptions [data-family="'+family+'"]')).toHaveCount(1);
    }
  }
  await page.locator('#gfStyleBtn').click();
  await expect(page.locator('#gfStylePop [data-t="pkStyleNote"]')).toContainText('名称推断');
  await page.locator('#gfStylePop [data-filter-clear="gfStyle"]').click();
  await expect(page.locator('#gfStyle input:checked')).toHaveCount(0);
  await expect(page.locator('#gfSearch')).toHaveValue('Liu Jian Mao Cao');
});

test('意大利体筛选：实际款式与 ital 轴、未知资料保留，清除保留搜索及排序', async ({ page }) => {
  await fixture(page, 'latin');
  const facts = await page.evaluate(async () => {
    const { catalogInfo, localItalicInfo, filterCatalog } = await import('./assets/js/font-catalog.js');
    const face = { fullName: 'Fixture Regular', style: 'Regular' };
    const read = new Map([[face.fullName, { axes: [] }]]);
    const items = [{ family: 'Italic', aliases: '', italic: true }, { family: 'Upright', aliases: '', italic: false }, { family: 'Unknown', aliases: '', italic: null }];
    return {
      google: ['EB Garamond', 'Noto Serif SC'].map(name => catalogInfo(name).italic),
      unread: localItalicInfo([face], new Map()), upright: localItalicInfo([face], read),
      named: localItalicInfo([{ ...face, style: 'Bold Italic' }], new Map()),
      oblique: localItalicInfo([{ ...face, style: 'Oblique' }], read),
      slant: localItalicInfo([face], new Map([[face.fullName, { axes: [['slnt', -12, 0, 0]] }]])),
      axis: localItalicInfo([face], new Map([[face.fullName, { axes: [['ital', 0, 1, 0]] }]])),
      matches: filterCatalog(items, '', [], false, [], [], true).map(item => item.family)
    };
  });
  expect(facts).toEqual({ google: [true, false], unread: null, upright: false, named: true, oblique: false, slant: false, axis: true, matches: ['Italic', 'Unknown'] });
  await selectFilter(page, 'pkSource', 'google');
  await page.locator('#gfSearch').fill('Noto');
  await page.locator('#pkSortBtn').click(); await page.locator('#pkSort input[value="weights"]').click();
  await page.locator('#gfItalic').check();
  await expect(page.locator('#gfOptions [data-choice]')).toHaveCount(0);
  await page.locator('#gfSearch').fill('Garamond');
  await expect(page.locator('#gfOptions [data-family="EB Garamond"] .font-option-source')).toContainText('连续 400–800');
  await expect(page.locator('#gfOptions [data-family="Cormorant Garamond"] .font-option-source')).toContainText('连续 300–700');
  await page.locator('#pkFilterClear').click();
  await expect(page.locator('#gfItalic')).not.toBeChecked();
  await expect(page.locator('#gfSearch')).toHaveValue('Garamond');
  await expect(page.locator('#pkSort input[value="weights"]')).toBeChecked();
  await page.locator('#gfSearch').fill('BIZ');
  await expect(page.locator('#gfOptions [data-family="BIZ UDPGothic"] .font-option-source')).toContainText('分档 400/700');
});

test('本机字重范围：汇总命名分档，读取轴后原地更新，与预览一致且不移动候选', async ({ page }) => {
  await page.addInitScript(() => {
    window.queryLocalFonts = async () => ['Regular', 'Bold'].map(style => ({ family: 'Fixture Family', fullName: 'Fixture Family '+style, postscriptName: 'FixtureFamily-'+style, style,
      blob: async () => (await fetch('/tests/fixtures/Jost%5Bwght%5D.ttf')).blob() }));
  });
  await fixture(page, 'latin');
  await page.locator('#gfSearch').fill('Fixture Family');
  await page.locator('#pkSortBtn').click(); await page.locator('#pkSort input[value="weights"]').click();
  const row = page.locator('#gfOptions [data-local-family="Fixture Family"]');
  await expect(row.locator('.font-option-source')).toContainText('已发现 400/700');
  await page.evaluate(() => { window.originalWeightRow = document.querySelector('#gfOptions [data-local-family="Fixture Family"]'); });
  await row.click(); await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pkVfTag')).toContainText('100–900');
  await expect(row.locator('.font-option-source')).toContainText('100–900');
  expect(await page.evaluate(() => window.originalWeightRow === document.querySelector('#gfOptions [data-local-family="Fixture Family"]'))).toBeTruthy();
  const info = await page.evaluate(async () => {
    const { localWeightInfo } = await import('./assets/js/font-catalog.js'), { fileWeight } = await import('./assets/js/core.js');
    const faces = [{ fullName: 'Regular', style: 'Regular' }, { fullName: 'Bold', style: 'Bold' }];
    const axes = new Map(faces.map(face => [face.fullName, { axes: [] }]));
    return { named: localWeightInfo(faces, new Map()), read: localWeightInfo(faces, axes, new Map([['Regular', 350], ['Bold', 700]])), file: await fileWeight(await (await fetch('/tests/fixtures/NotoSansJP-Subset.ttf')).arrayBuffer()) };
  });
  expect(info.named.weightRange).toEqual([400, 700]); expect(info.named.weightType).toBeNull();
  expect(info.read.weightRange).toEqual([350, 700]); expect(info.read.weightType).toBe('stepped'); expect(info.file).toBe(400);
});

test('多选筛选与本机预览：组内任选、组间同时满足，名称加载失败后用授权文件预览，款式属于右侧候选', async ({ page }) => {
  await page.addInitScript(() => {
    window.queryLocalFonts = async () => ['Regular', 'Bold'].map(style => ({ family: 'Inter', fullName: 'Fixture Inter '+style, postscriptName: 'FixtureInter-'+style, style,
      blob: async () => (await fetch('/tests/fixtures/Jost%5Bwght%5D.ttf')).blob() }));
  });
  await fixture(page, 'latin');
  const bounds = await page.locator('#picker').boundingBox();
  expect(bounds.y).toBeLessThanOrEqual(25); expect(1000 - bounds.y - bounds.height).toBeLessThanOrEqual(25);
  await page.locator('#gfSearch').fill('Inter');
  await selectFilter(page, 'pkSource', ['google', 'local']);
  await selectFilter(page, 'gfStyle', ['sans', 'serif']);
  await expect(page.locator('#pkSourceBtn')).toContainText('2'); await expect(page.locator('#gfStyleBtn')).toContainText('2');
  await expect(page.locator('#gfOptions [data-family="Inter"]')).toHaveCount(1);
  await expect(page.locator('#gfOptions [data-local-family="Inter"]')).toHaveCount(1);
  await page.locator('#gfOptions [data-local-family="Inter"]').click();
  await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.pk-detail #lfFace')).toBeVisible();
  await expect(page.locator('#pkLocalFallback')).toBeVisible();
  await expect(page.locator('#lfFaceField label')).toHaveText('字体款式');
  expect(await page.evaluate(async () => {
    const core = await import('./assets/js/core.js');
    const src = core.source(core.L('Fixture Inter Regular'));
    return src.status === 'ok' && src.faces[0].buffer instanceof ArrayBuffer;
  })).toBeTruthy();
  await page.locator('#pkSortBtn').click(); await page.locator('#pkSort input[value="weights"]').click();
  await expect(page.locator('#gfOptions [data-local-family="Inter"] .font-option-source')).toContainText('100–900');
  await page.locator('#lfFace').selectOption('Fixture Inter Bold');
  await expect(page.locator('#pkSelectedName')).toHaveText('Fixture Inter Bold');
  await page.locator('#pkFilterClear').click();
  await expect(page.locator('#gfSearch')).toHaveValue('Inter');
  await expect(page.locator('#pkSource input:checked')).toHaveCount(0);
  await expect(page.locator('#gfStyle input:checked')).toHaveCount(0);
});

test('字体列表：搜索不检测半个名字，可键盘选择，四语言和手机深色布局保持可用', async ({ page }) => {
  await fixture(page);
  await page.locator('#gfSearch').fill('Noto');
  await expect(page.locator('#gfOptions [data-family]')).toHaveCount(10);
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
    await expect(page.locator('#gfStyle label').first()).not.toHaveText('pkSans');
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
  await expect(page.locator('#lfQuery')).toBeHidden();
  await expect(page.locator('#gfOptions [data-local-family]')).toHaveCount(1);
  await page.locator('#gfSearch').fill('Ｆｉｘｔｕｒｅ-Ｓａｎｓ');
  await expect(page.locator('#gfOptions [data-local-family]')).toHaveCount(1);
  await page.locator('#gfOptions [data-local-family]').click();
  await expect(page.locator('#lfFace option')).toHaveCount(2);
  await expect(page.locator('#lfName')).toHaveValue('Fixture Sans Regular');
  await page.locator('#lfFace').selectOption('Fixture Sans Bold');
  await expect(page.locator('#lfName')).toHaveValue('Fixture Sans Bold');
  await expect.poll(() => page.evaluate(async () => (await import('./assets/js/ui.js')).pickCand?.axis)).toEqual([100, 900]);
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('#pkOk')).toBeInViewport();
  expect(await page.locator('#picker').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();

});


test('导入字体：重复文件去重，取消后可跨类别复用，无效文件保留原候选', async ({ page }) => {
  await fixture(page);
  await page.locator('#picker [data-src="file"]').click();
  const font = require('path').resolve(__dirname, '../fixtures/Jost[wght].ttf');
  await page.locator('#ffFile').setInputFiles([font, font]);
  await expect(page.locator('#ffOptions [data-imported]')).toHaveCount(1);
  await expect(page.locator('#pkOk')).toBeEnabled();
  await expect(page.locator('#pkTargetCoverage')).toContainText('汉字缺少');
  await page.locator('#ffSearch').fill('Ｊ ｏ-ｓ_ｔ');
  await expect(page.locator('#ffOptions [data-imported]')).toHaveCount(1);
  const id = await page.locator('#ffOptions [data-imported]').getAttribute('data-imported');
  await page.locator('#pkCancel').click();
  await expect(page.locator('.ct-row[data-id="han"] .fsel')).toHaveValue('own');
  await openClassPicker(page, 'latin');
  await page.locator('#picker [data-src="file"]').click();
  await page.locator('#ffOptions [data-imported]').click();
  await page.locator('#ffFile').setInputFiles({ name: 'broken.ttf', mimeType: 'font/ttf', buffer: Buffer.from('invalid') });
  await expect(page.locator('#ffError')).toContainText('broken.ttf');
  await expect(page.locator('#pkOk')).toBeEnabled();
  expect(await page.evaluate(async () => (await import('./assets/js/ui.js')).pickCand.fileId)).toBe(id);
  await page.locator('#pkOk').click();
  await expect(page.locator('#picker')).not.toBeVisible();
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
  await openClassPicker(page, 'han');
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
  await page.locator('#gfSearch').fill('Shippori'); await page.locator('#gfOptions [data-family="Shippori Mincho"]').click();
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
  await page.locator('#pkApplied > summary').click();
  await expect(page.locator('#ffWeightField')).toBeVisible();
  if (await page.locator('#pkApplied').getAttribute('open') === null) await page.locator('#pkApplied > summary').click();
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
  await expect(page.locator('#pkWeightMapping')).toHaveText('组合字重 700 将使用这款字体的 700。');
  await page.locator('#pkApplied > summary').click();
  await page.locator('#pkScope [value="all"]').check();
  await expect(page.locator('#pkWeightMapping')).toHaveText('组合字重 400 将使用这款字体的 400。');
  await expect(page.locator('#pkOk')).toBeEnabled(); await page.locator('#pkOk').click();
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).state.classes.han.font.weight)).toBe(400);
});

test('逐档上传字体：读取该档实际粗细，保存单档映射不改基础粗细', async ({ page }) => {
  await fixture(page); await page.locator('#picker [data-src="file"]').click();
  await page.locator('#ffFile').setInputFiles(require('path').resolve(__dirname, '../fixtures/Jost[wght].ttf'));
  await expect(page.locator('#pkOk')).toBeEnabled(); await page.locator('#pkOk').click();
  await page.evaluate(async () => (await import('./assets/js/ui.js')).openPicker({ type: 'class', id: 'han' }, 700));
  await expect(page.locator('#ffWeightNum')).toHaveValue('700');
  if (await page.locator('#pkApplied').getAttribute('open') === null) await page.locator('#pkApplied > summary').click();
  await page.locator('#ffWeightNum').fill('450'); await page.locator('#ffWeightNum').dispatchEvent('change');
  await expect(page.locator('#pkOk')).toBeEnabled(); await page.locator('#pkOk').click();
  expect(await page.evaluate(async () => { const c = await import('./assets/js/core.js'); return [c.state.classes.han.font.weight, c.state.wOver[700].han.weight]; })).toEqual([400, 450]);
});


test('类别样张：西文不混入汉字，校样按实际归属提取；自定义文字和字号不进入配置', async ({ page }) => {
  await fixture(page, 'latin');
  await expect(page.locator('#pkSample')).toContainText('Hamburg');
  await expect(page.locator('#pkSample')).not.toContainText('永');
  const before = await page.evaluate(async () => JSON.stringify((await import('./assets/js/share.js')).shareSnapshot()));
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'); c.state.custom = [{ chars: 'A', follow: 'han', font: null, size: null, shift: null }];
    c.refreshCustomRanges(); c.state.view.text = '汉字 Alpha Beta 123';
  });
  const configured = await page.evaluate(async () => JSON.stringify((await import('./assets/js/share.js')).shareSnapshot()));
  await page.locator('#pkSampleMode [data-pk-sample="proof"]').click();
  await expect(page.locator('#pkSample')).toHaveText('lpha Beta');
  await page.locator('#pkSampleMode [data-pk-sample="custom"]').click();
  await page.locator('#pkSampleText').fill('PRIVATE PICKER TEXT');
  await expect(page.locator('#pkSample')).toHaveText('PRIVATE PICKER TEXT');
  await page.locator('#pkSampleSize').fill('48');
  await expect(page.locator('#pkSample')).toHaveCSS('font-size', '48px');
  await page.locator('#gfSearch').fill('Inter'); await page.locator('#gfOptions [data-family="Inter"]').click();
  await expect(page.locator('#pkSample')).toHaveText('PRIVATE PICKER TEXT');
  expect(await page.evaluate(async () => JSON.stringify((await import('./assets/js/share.js')).shareSnapshot()))).not.toContain('PRIVATE PICKER TEXT');
  expect(await page.evaluate(async () => JSON.stringify((await import('./assets/js/share.js')).shareSnapshot()))).toBe(configured);
  expect(before).not.toContain('PRIVATE PICKER TEXT');
});

test('类别样张：繁体汉字、假名、数字与空校样，支持键盘切换样张', async ({ page }) => {
  await fixture(page);
  await page.locator('#pkCancel').click();
  await page.evaluate(async () => { const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js'); c.state.typo.lang = 'zh-Hant-TW'; c.state.view.text = '漢字'; u.openPicker({ type: 'class', id: 'han' }); });
  await expect(page.locator('#pkSample')).toContainText('國字體');
  await page.locator('#pkCancel').click(); await openClassPicker(page, 'kana');
  await expect(page.locator('#pkSample')).toContainText('あいうえお');
  await expect(page.locator('#pkSampleMode [data-pk-sample="proof"]')).toBeDisabled();
  await page.locator('#pkCancel').click(); await openClassPicker(page, 'digit');
  await expect(page.locator('#pkSample')).toContainText('0123456789');
  await page.locator('#pkSampleMode [data-pk-sample="class"]').focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#pkSampleMode [data-pk-sample="custom"]')).toHaveAttribute('aria-checked', 'true');
});

async function matchingFixture(page, W = 400) {
  await fixture(page, 'latin'); await page.locator('#pkCancel').click();
  await page.evaluate(async W => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    const buffer = await (await fetch('/tests/fixtures/NotoSansJP-Subset.ttf')).arrayBuffer();
    c.files.set('picker-ref', { name: 'NotoSansJP-Subset.ttf', buffer });
    const s = c.stateFromPreset(c.PRESETS.find(p => p.id === 'gothic-jp'));
    s.classes.han.font = { kind: 'file', fileId: 'picker-ref', fileName: 'NotoSansJP-Subset.ttf' };
    s.classes.latin.font = c.G('Inter'); s.classes.latin.size = 150; s.classes.latin.shift = 5;
    s.classes.kana.size = 137; s.weights = [400, 700]; s.wOver = {}; s.italic = false;
    c.setState(s); c.normalizeState(); u.changed({ fonts: true }); await c.rebuildNow(); c.recordHistory();
    u.openPicker({ type: 'class', id: 'latin' }, W);
  }, W);
  await page.locator('#picker [data-src="file"]').click();
  await page.locator('#ffFile').setInputFiles(require('path').resolve(__dirname, '../fixtures/Jost[wght].ttf'));
  await expect(page.locator('#pkOk')).toBeEnabled();
}
const matchSettings = page => page.evaluate(async () => {
  const c = await import('./assets/js/core.js');
  return JSON.parse(JSON.stringify({ classes: c.state.classes, over: c.state.wOver, weights: c.state.weights }));
});

test('选择时自动匹配：默认勾选、仅调整所选类别，字体和匹配一次撤销', async ({ page }) => {
  await fixture(page); await expect(page.locator('#pkAutoFitField')).toBeHidden();
  await page.locator('#pkCancel').click(); await matchingFixture(page);
  const before = await matchSettings(page);
  await expect(page.locator('#pkAutoFit')).toBeChecked();
  await page.locator('#pkOk').click(); await expect(page.locator('#picker')).not.toBeVisible();
  const after = await matchSettings(page);
  expect(after.classes.latin.size).not.toBe(150);
  expect(after.classes.kana).toEqual(before.classes.kana);
  expect(after.classes.han).toEqual(before.classes.han);
  await page.locator('#undoBtn').click(); expect(await matchSettings(page)).toEqual(before);
  await page.locator('#redoBtn').click(); expect(await matchSettings(page)).toEqual(after);
  await page.click('#ltabFonts');
  await openClassPicker(page, 'latin');
  await page.locator('#pkAutoFit').uncheck();
  if (await page.locator('#pkApplied').getAttribute('open') === null) await page.locator('#pkApplied > summary').click();
  await page.locator('#ffWeightNum').fill('450'); await page.locator('#ffWeightNum').dispatchEvent('change');
  await expect(page.locator('#pkOk')).toBeEnabled(); await page.locator('#pkOk').click();
  expect((await matchSettings(page)).classes.latin.size).toBe(after.classes.latin.size);
  expect((await matchSettings(page)).classes.latin.font.weight).toBe(450);
});

test('选择时自动匹配：单档不改变基础设置，取消测量不留下字体或调整', async ({ page }) => {
  await matchingFixture(page, 700);
  const before = await matchSettings(page);
  await page.locator('#pkOk').click(); await expect(page.locator('#picker')).not.toBeVisible();
  const after = await matchSettings(page);
  expect(after.classes.latin).toEqual(before.classes.latin);
  expect(after.over[700].latin.font.kind).toBe('file'); expect(after.over[700].latin.size).not.toBe(150);
  await page.locator('#undoBtn').click(); expect(await matchSettings(page)).toEqual(before);
  await page.click('#ltabFonts');
  await openClassPicker(page, 'latin');
  await page.locator('#picker [data-src="file"]').click(); await page.locator('#ffOptions [data-imported]').click();
  await expect(page.locator('#pkOk')).toBeEnabled();
  await page.evaluate(() => {
    const load = document.fonts.load.bind(document.fonts), pending = []; let blocked = true;
    document.fonts.load = (spec, text) => {
      if (blocked && spec.includes('__cf_fit')) return new Promise(resolve => pending.push(() => load(spec, text).then(resolve)));
      return load(spec, text);
    };
    window.fitPending = pending; window.releaseFit = () => { blocked = false; pending.forEach(run => run()); };
  });
  await page.locator('#pkOk').click();
  await expect.poll(() => page.evaluate(() => window.fitPending.length)).toBeGreaterThan(0);
  await page.locator('#pkCancel').click(); await page.evaluate(() => window.releaseFit());
  await expect.poll(() => page.evaluate(() => [...document.fonts].filter(f => f.family.startsWith('__cf_fit')).length)).toBe(0);
  expect(await matchSettings(page)).toEqual(before);
});

test('信息层级：预览、应用与详情分组，短列表收紧，数字组件和来源页签支持键盘', async ({ page }) => {
  await fixture(page);
  await expect(page.locator('#pkSelectedName')).toHaveText('Noto Serif SC');
  await expect(page.locator('#pkBrowseTitle,#pkPreviewTitle')).toHaveCount(0);
  await expect(page.locator('#picker .pk > .tabs [role=tab]')).toHaveCount(2);
  await expect(page.locator('#gfFamily')).toBeHidden();
  await expect(page.locator('#pkDetails')).toBeHidden();
  await expect(page.locator('#pkApplied #gfWeightNum')).toBeHidden();
  await expect(page.locator('#pkAppliedSummary')).toHaveText('组合 400 → 字体 400');
  await page.locator('#pkApplied > summary').click();
  await expect(page.locator('#pkApplied #gfWeightNum')).toBeVisible();
  const weight = page.locator('#gfWeightNum'); await weight.locator('..').hover();
  await weight.locator('..').locator('[data-step="up"]').click();
  await expect(weight).toHaveValue('410');
  await page.locator('#pkSampleSize').locator('..').hover();
  await page.locator('#pkSampleSize').locator('..').locator('[data-step="up"]').click();
  await expect(page.locator('#pkSampleSize')).toHaveValue('33');
  await page.locator('#picker [data-src="library"]').focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#picker [data-src="file"]')).toBeFocused();
  await page.locator('#ffFile').setInputFiles(require('path').resolve(__dirname, '../fixtures/Jost[wght].ttf'));
  await expect(page.locator('#pkOk')).toBeEnabled();
  expect(await page.locator('#ffOptions').evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(140);
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('#pkApplied').scrollIntoViewIfNeeded();
  await expect(page.locator('#pkOk')).toBeInViewport();
  expect(await page.locator('#picker').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
  for (const lang of ['en', 'ja', 'tw', 'zh']) {
    await page.evaluate(async lang => { const i = await import('./assets/js/i18n.js'), u = await import('./assets/js/ui.js'); i.setUI(lang); u.applyUI(); }, lang);
    await expect(page.locator('#pkAppliedTitle')).not.toHaveText('pkAppliedTitle');
    await expect(page.locator('#pkSampleSize').locator('..').locator('[data-step="up"]')).not.toHaveAttribute('aria-label', '');
  }
});

test('预览与信息：样张自然撑高、详情标签精简、切换保留草稿，右栏操作与长文本滚动独立', async ({ page }) => {
  await fixture(page, 'latin');
  await page.locator('#gfSearch').fill('BIZ');
  await expect(page.locator('#pkSampleBtn,#pkSamplePop')).toHaveCount(0);
  await page.locator('[data-pk-sample="custom"]').click();
  await page.locator('#pkSampleText').fill('Hamburg '.repeat(120));
  await expect.poll(() => page.locator('#pkSample').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(240);
  expect(await page.locator('#pkSample').evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await page.locator('#pkInfoTab').click();
  await expect(page.locator('#pkDetails')).toBeVisible(); await expect(page.locator('#pkPreviewPanel')).toBeHidden();
  await expect(page.locator('#pkInfoSource')).toHaveText('Google Fonts');
  await expect(page.locator('#pkCov')).not.toContainText('拉丁字母'); await expect(page.locator('#pkCov')).not.toContainText('数字'); await expect(page.locator('#pkCov')).not.toContainText('韩文');
  await expect(page.locator('#pkCov .cov-note')).toHaveCount(0);
  await page.locator('#pkInfoTab').focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#pkPreviewTab')).toBeFocused(); await expect(page.locator('#pkPreviewPanel')).toBeVisible();
  await expect(page.locator('#pkSampleText')).toHaveValue('Hamburg '.repeat(120));
  await page.locator('#gfSearch').fill('');
  expect(await page.locator('#picker').evaluate(el => {
    const list = el.querySelector('#gfOptions'), rows = [...list.querySelectorAll('.font-option')], source = el.querySelector('.pk-sources').getBoundingClientRect(), action = el.querySelector('.pk-actions').getBoundingClientRect(), detail = el.querySelector('.pk-detail').getBoundingClientRect();
    return getComputedStyle(list).borderTopWidth === '0px' && getComputedStyle(rows[1]).borderTopColor !== 'rgba(0, 0, 0, 0)' && action.left >= detail.left && Math.abs(source.bottom - action.bottom) < 2 && Math.abs(list.getBoundingClientRect().bottom - source.bottom) < 2;
  })).toBe(true);
  await expect(page.locator('#pkOk')).toBeInViewport();
  await page.setViewportSize({ width:390, height:844 }); await page.emulateMedia({ colorScheme:'dark' });
  await expect(page.locator('#pkCancel')).toBeInViewport(); await expect(page.locator('#pkOk')).toBeInViewport();
  await page.locator('#pkInfoTab').click(); await expect(page.locator('#pkDetails')).toBeVisible();
  await expect(page.locator('#pkOk')).toBeInViewport();
  await page.locator('#pkCancel').click(); await openClassPicker(page, 'latin');
  await expect(page.locator('#pkPreviewTab')).toHaveAttribute('aria-selected', 'true');
});

test('状态反馈：无搜索结果保留候选，名称草稿不探测，加载失败可重试恢复', async ({ page }) => {
  await fixture(page);
  await expect(page.locator('#pkOk')).toBeEnabled();
  await page.locator('#gfSearch').fill('NothingMatchesThis');
  await expect(page.locator('#gfResults')).toHaveText('0 个候选字体');
  await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pkOk')).toBeEnabled();
  await page.locator('#gfReset').click();
  await expect(page.locator('#gfSearch')).toHaveValue('');
  let requested = 0, fail = true;
  await page.route('https://fonts.googleapis.com/**', route => {
    if (!route.request().url().includes('family=Inter')) return route.fallback();
    requested++;
    return fail ? route.fulfill({ status: 400, body: 'Unavailable' }) : route.fulfill({ contentType: 'text/css', body: "@font-face { font-family: 'PickerRetry'; src: url('http://127.0.0.1:8765/tests/fixtures/Jost%5Bwght%5D.ttf'); }" });
  });
  await page.locator('#gfSearch').fill('Int');
  await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pkOk')).toBeEnabled(); expect(requested).toBe(0);
  await page.locator('#gfSearch').fill('Inter'); await page.locator('#gfSearch').press('Enter');
  await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#pkStatus')).toContainText('加载失败');
  await expect(page.locator('#pkOk')).toBeDisabled(); await expect(page.locator('#pkRetry')).toBeVisible();
  fail = false; await page.locator('#pkRetry').click();
  await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pkOk')).toBeEnabled();
});

test('状态反馈：慢请求可重试，超时后迟到的旧结果不改变当前候选', async ({ page }) => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  await fixture(page); await expect(page.locator('#pkOk')).toBeEnabled();
  await page.route('https://fonts.googleapis.com/**', async route => {
    if (!route.request().url().includes('family=Inter')) return route.fallback();
    await gate;
    await route.fulfill({ contentType: 'text/css', body: "@font-face { font-family: 'PickerSlow'; src: url('http://127.0.0.1:8765/tests/fixtures/Jost%5Bwght%5D.ttf'); }" });
  });
  await page.clock.install();
  await page.locator('#gfSearch').fill('Inter'); await page.locator('#gfOptions [data-family="Inter"]').click();
  await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'loading');
  await page.clock.runFor(12001);
  await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'slow');
  await expect(page.locator('#pkRetry')).toBeVisible(); await expect(page.locator('#pkOk')).toBeDisabled();
  await page.locator('#pkRetry').click(); await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'loading');
  await page.locator('#gfSearch').fill('Noto Serif SC'); await page.locator('#gfOptions [data-family="Noto Serif SC"]').click();
  await expect(page.locator('#pkSelectedName')).toHaveText('Noto Serif SC');
  release();
  await expect(page.locator('#pkOk')).toBeEnabled();
  await expect(page.locator('#pkSelectedName')).toHaveText('Noto Serif SC');
  await expect(page.locator('#pkRetry')).toBeHidden();
  await page.clock.resume();
});

test('状态反馈：无法完成字符检查时显示未知，避免伪造全部支持', async ({ page }) => {
  await page.addInitScript(() => {
    const load = FontFace.prototype.load;
    FontFace.prototype.load = function () { return this.family === '__cf_blank' ? Promise.reject(new Error('Probe unavailable')) : load.call(this); };
  });
  await fixture(page); await page.locator('#picker [data-src="file"]').click();
  await page.locator('#ffFile').setInputFiles(require('path').resolve(__dirname, '../fixtures/Jost[wght].ttf'));
  await expect(page.locator('#pkOk')).toBeEnabled();
  await expect(page.locator('#pkTargetCoverage')).toContainText('无法确认');
  await expect(page.locator('#pkCov .cov.ok')).toHaveCount(0);
});

test('状态反馈：自动读取本机字体，迟到结果不抢焦点，失败仅显示手动重试', async ({ page }) => {
  await page.addInitScript(() => { window.queryLocalFonts = () => new Promise(resolve => { window.releaseLocalQuery = resolve; }); });
  await fixture(page);
  await expect(page.locator('#lfQuery')).toBeHidden(); await expect(page.locator('#lfMsg')).toHaveText('等待授权…');
  const chosen = page.locator('#gfOptions [data-choice]').first(); await chosen.focus(); await chosen.press('Enter');
  await expect(chosen).toBeFocused();
  await page.locator('#pkCancel').click(); await openClassPicker(page, 'latin');
  await expect(page.locator('#gfSearch')).toBeFocused();
  const order = await page.locator('#gfOptions [data-choice]').evaluateAll(els => els.map(el => el.dataset.choice));
  await page.evaluate(() => window.releaseLocalQuery([{ family: 'Fresh Sans', fullName: 'Fresh Sans Regular', postscriptName: 'FreshSans', style: 'Regular', blob: async () => (await fetch('/tests/fixtures/Jost%5Bwght%5D.ttf')).blob() }]));
  await expect(page.locator('#gfOptions [data-choice]')).toHaveCount(order.length + 1);
  expect((await page.locator('#gfOptions [data-choice]').evaluateAll(els => els.map(el => el.dataset.choice))).slice(0, order.length)).toEqual(order);
  await expect(page.locator('#lfStatus')).toBeHidden(); await expect(page.locator('#gfSearch')).toBeFocused();
  await page.addInitScript(() => { window.queryLocalFonts = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await page.reload(); await page.click('#ltabFonts'); await openClassPicker(page, 'han');
  await expect(page.locator('#lfQuery')).toBeVisible(); await expect(page.locator('#lfMsg')).toContainText('没有获得权限');
  await page.evaluate(() => { window.queryLocalFonts = async () => { throw new TypeError('Device failed'); }; });
  await page.locator('#lfQuery').click(); await expect(page.locator('#lfMsg')).toContainText('无法读取本机字体');
  await page.evaluate(() => { window.queryLocalFonts = async () => []; });
  await page.locator('#lfQuery').click(); await expect(page.locator('#lfStatus')).toBeHidden();
});

test('状态反馈：上一轮排队的关闭事件不能中止重新打开的预览', async ({ page }) => {
  await fixture(page); await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'ready');
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('https://fonts.googleapis.com/**', async route => {
    if (!route.request().url().includes('family=Inter')) return route.fallback();
    await gate; await route.fulfill({ contentType: 'text/css', body: "@font-face { font-family: 'PickerReopen'; src: url('http://127.0.0.1:8765/tests/fixtures/Jost%5Bwght%5D.ttf'); }" });
  });
  await page.evaluate(async () => {
    const u = await import('./assets/js/ui.js');
    u.picker.close(); u.openPicker({ type: 'class', id: 'han' });
    // Start another request in the same task, before the browser delivers the previous native close event.
    const search = document.querySelector('#gfSearch'); search.value = 'Inter'; search.dispatchEvent(new Event('input'));
    document.querySelector('#gfOptions [data-family="Inter"]').click();
  });
  await expect(page.locator('#pkSelectedName')).toHaveText('Inter');
  release(); await expect(page.locator('#pkStatus')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#pkOk')).toBeEnabled();
});


test('选字筛选栏：搜索下方直接筛选与清除；手机四语言换行，内联样张控件与筛选 Escape 不关闭对话框', async ({ page }) => {
  await fixture(page, 'latin');
  await page.locator('#gfSearch').fill('Noto');

  await selectFilter(page, 'gfStyle', 'serif'); await setBoldFilter(page);
  await expect(page.locator('#gfStyleBtn')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('#gfBold')).toBeChecked();
  expect(await page.locator('.filter-bar').evaluate(el => el.getBoundingClientRect().top >= document.querySelector('#gfSearch').getBoundingClientRect().bottom)).toBeTruthy();
  await page.locator('#pkFilterClear').click();
  await expect(page.locator('#gfSearch')).toHaveValue('Noto'); await expect(page.locator('#pkFilterClear')).toBeHidden();
  await expect(page.locator('#gfSearch')).toBeFocused();
  await expect(page.locator('#gfStyle input:checked')).toHaveCount(0); await expect(page.locator('#gfBold')).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: 'dark' });
  for (const lang of ['zh', 'tw', 'ja', 'en']) {
    await page.evaluate(async lang => { const i = await import('./assets/js/i18n.js'), u = await import('./assets/js/ui.js'); i.setUI(lang); u.applyUI(); }, lang);
    expect(await page.locator('.filter-bar').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    expect(await page.locator('#picker').evaluate(el => el.querySelector('.pk-detail').getBoundingClientRect().top >= el.querySelector('#gfOptions').getBoundingClientRect().bottom)).toBeTruthy();
    await expect(page.locator('#pkSourceBtn')).toBeInViewport();
    await expect(page.locator('#gfStyleBtn')).toBeInViewport();
    await expect(page.locator('#pkWeightTypeBtn')).toBeInViewport();
    await expect(page.locator('.pk-actions #pkAutoFit')).toBeInViewport();
    await expect(page.locator('#pkCancel')).toBeInViewport(); await expect(page.locator('#pkOk')).toBeInViewport();
    await page.locator('[data-pk-sample="custom"]').click();
    await page.locator('#pkSampleText').fill('Hamburg');
    await expect(page.locator('#pkSampleText')).toBeVisible();
    expect(await page.locator('#picker').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    await page.locator('#pkSourceBtn').click();
    await page.keyboard.press('Escape'); await expect(page.locator('#picker')).toBeVisible();
  }
});

test('合并字体库：自动枚举一次、同名字体区分来源，共享筛选保留未知资料并支持精确样式名', async ({ page }) => {
  await page.addInitScript(() => {
    window.localQueries = 0;
    window.queryLocalFonts = async () => {
      window.localQueries++;
      return [
        ['Inter', 'Inter Regular', 'Inter-Regular', 'Regular'],
        ['Fixture Sans', 'Fixture Sans Regular', 'FixtureSans-Regular', 'Regular'],
        ['Fixture Sans', 'Fixture Sans Bold', 'FixtureSans-Bold', 'Bold'],
        ['Mystery Face', 'Mystery Face Regular', 'MysteryFace', 'Regular'],
      ].map(([family, fullName, postscriptName, style]) => ({ family, fullName, postscriptName, style, blob: async () => (await fetch('/tests/fixtures/Jost%5Bwght%5D.ttf')).blob() }));
    };
  });
  await fixture(page, 'latin');
  await expect(page.locator('#gfOptions [data-local-family]')).toHaveCount(3);
  await page.locator('#gfSearch').fill('Inter');
  await expect(page.locator('#gfOptions [data-family="Inter"]')).toHaveCount(1);
  await expect(page.locator('#gfOptions [data-local-family="Inter"]')).toHaveCount(1);
  await expect(page.locator('#gfOptions [data-family="Inter"] .font-option-source')).toHaveText('Google Fonts · 连续 100–900');
  await expect(page.locator('#gfOptions [data-local-family="Inter"] .font-option-source')).toContainText('本机字体 · 已发现 400');
  await page.locator('#gfItalic').check();
  await expect(page.locator('#gfOptions [data-family="Inter"]')).toHaveCount(1);
  await expect(page.locator('#gfOptions [data-local-family="Inter"]')).toHaveCount(1);
  await page.locator('#pkFilterClear').click();
  await page.locator('#gfSearch').fill('');
  await selectFilter(page, 'pkSource', 'local'); await selectFilter(page, 'gfStyle', 'serif'); await setBoldFilter(page);
  await expect(page.locator('#pkSource input[value=local]')).toBeChecked();
  await expect(page.locator('#gfStyle input[value=serif]')).toBeChecked();
  await expect(page.locator('#gfBold')).toBeChecked();
  await expect(page.locator('#gfOptions [data-family]')).toHaveCount(0);
  await expect(page.locator('#gfOptions [data-local-family="Fixture Sans"]')).toHaveCount(0);
  await expect(page.locator('#gfOptions [data-local-family="Mystery Face"]')).toHaveCount(1);
  await page.locator('#pkFilterClear').click();
  await page.locator('#gfSearch').fill('FixtureSans-Bold'); await page.locator('#gfSearch').press('Enter');
  await expect(page.locator('#lfName')).toHaveValue('Fixture Sans Bold'); await expect(page.locator('#lfFace')).toHaveValue('Fixture Sans Bold');
  await page.locator('#picker [data-src="file"]').click(); await page.locator('#picker [data-src="library"]').click();
  expect(await page.evaluate(() => window.localQueries)).toBe(1);
  await expect(page.locator('#lfQuery')).toBeHidden();
});

test('统一名称输入：未知名称只在明确选用后检查，可直接尝试本机名称，来源筛选限制备用操作', async ({ page }) => {
  await fixture(page);
  let probes = 0;
  await page.route('https://fonts.googleapis.com/**', route => { if (route.request().url().includes('Outside')) probes++; return route.fallback(); });
  await page.locator('#gfSearch').fill('Outside Catalogue Family');
  await expect(page.locator('#gfTry')).toBeVisible(); await expect(page.locator('#lfTry')).toBeVisible();
  expect(probes).toBe(0);
  await page.locator('#gfSearch').press('Enter'); await expect(page.locator('#gfTry')).toBeFocused(); expect(probes).toBe(0);
  await page.locator('#gfTry').click(); await expect(page.locator('#pkSelectedName')).toHaveText('Outside Catalogue Family');
  await expect(page.locator('#pkOk')).toBeEnabled(); expect(probes).toBeGreaterThan(0);
  await selectFilter(page, 'pkSource', 'local');
  await page.locator('#gfSearch').fill('Baskerville Full Name'); await expect(page.locator('#gfTry')).toBeHidden();
  await page.locator('#gfSearch').press('Enter'); await expect(page.locator('#lfName')).toHaveValue('Baskerville Full Name');
  await expect(page.locator('#pkSelectedName')).toHaveText('Baskerville Full Name');
  expect(await page.evaluate(async () => (await import('./assets/js/ui.js')).pickCand.kind)).toBe('local');
});
