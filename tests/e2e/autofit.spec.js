const { test, expect } = require('@playwright/test');
const { open, showExport } = require('./helpers');

// Measure real local OFL fonts so matching tests neither depend on Google Fonts networking nor simulate font strokes.
async function fixture(page, { continuous = false, single = false } = {}) {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await open(page);
  await page.evaluate(async ({ continuous, single }) => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    for (const [id, name] of [['ref', 'NotoSansJP-Subset.ttf'], ['latin', 'Jost[wght].ttf']]) {
      const buffer = await (await fetch(`tests/fixtures/${encodeURIComponent(name)}`)).arrayBuffer();
      c.files.set(id, { name, buffer });
    }
    const s = c.stateFromPreset(c.PRESETS.find(p => p.id === 'gothic-jp'));
    s.classes.han.font = { kind: 'file', fileId: 'ref', fileName: 'NotoSansJP-Subset.ttf' };
    s.classes.latin.font = { kind: 'file', fileId: 'latin', fileName: 'Jost[wght].ttf', ...(single ? {} : { axis: [100, 900], weight: 100 }) };
    s.classes.latin.size = 150; s.classes.latin.shift = 0;
    s.weights = [400, 700]; s.wOver = {}; s.italic = false;
    s.view.weight = 700; s.view.wcont = 650; s.view.text = '国 Hb 123 国 Hb';
    if (continuous) { s.wmode = 'cont'; s.wrange = [400, 700]; }
    c.setState(s); c.normalizeState(); u.changed({ fonts: true });
    await c.rebuildNow(); c.recordHistory();
  }, { continuous, single });
  await page.click('#ltabFonts');
}
const values = page => page.evaluate(async () => {
  const c = await import('./assets/js/core.js');
  return { weight: c.state.classes.latin.font.weight, size: c.state.classes.latin.size, shift: c.state.classes.latin.shift, weights: c.state.weights, rows: c.state.weights.map(W => c.resolveCls('latin', W, true).font.weight), over: c.state.wOver, view: [c.state.view.weight, c.state.view.wcont] };
});
async function adjust(page) {
  await page.click('#autoAdj');
  await expect(page.locator('#autoAdj')).toBeEnabled();
}

test('同一字体直接提示无需调整：跟随、独立选择与恢复后的文件均保留设置和撤销记录', async ({ page }) => {
  await fixture(page);
  for (const kind of ['follow', 'google', 'local', 'file', 'continuous']) {
    await page.evaluate(async kind => {
      const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
      c.state.wOver = {}; c.state.wmode = kind === 'continuous' ? 'cont' : 'steps';
      c.state.wrange = [600, 900]; c.state.classes.latin.follow = null;
      if (kind === 'google') {
        c.state.classes.han.font = c.G('Inter', 400); c.state.classes.latin.font = c.G('Inter', 500);
      } else if (kind === 'local') {
        c.state.classes.han.font = c.L('Example Regular'); c.state.classes.latin.font = c.L('Example Bold');
      } else {
        c.state.classes.han.font = { kind: 'file', fileId: 'ref', fileName: 'NotoSansJP-Subset.ttf' };
        c.state.classes.latin.font = JSON.parse(JSON.stringify(c.state.classes.han.font));
        if (kind !== 'file') c.state.classes.latin.follow = 'han';
      }
      c.state.classes.latin.size = 137; c.state.classes.latin.shift = 4;
      u.changed({ fonts: true }); c.recordHistory();
    }, kind);
    const snapshot = () => page.evaluate(async () => {
      const c = await import('./assets/js/core.js');
      return { state: c.histSnap(), history: [...c.hist.list], index: c.hist.i, faces: [...document.fonts].filter(f => f.family.startsWith('__cf_fit_')).length };
    });
    const before = await snapshot();
    await adjust(page);
    await expect(page.locator('#toast')).toHaveText('所用字体与参照相同，无需自动调整');
    await expect(page.locator('#autoAdj')).not.toHaveAttribute('aria-busy');
    expect(await snapshot()).toEqual(before);
  }
});

test('基础字体相同但某一字重单独换了西文字体时，仍执行自动调整', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.wOver = { 700: { latin: { font: { ...c.state.classes.latin.font } } } };
    c.state.classes.latin.font = { ...c.state.classes.han.font };
    u.changed({ fonts: true });
  });
  await adjust(page);
  const after = await values(page);
  expect(after.over[700].latin.font.weight).toBeGreaterThan(100);
  await expect(page.locator('#toast')).not.toHaveText('所用字体与参照相同，无需自动调整');
});

test('自动匹配：真实可变字体的字重和大小一起改善，视图保留，可一次撤销和重做', async ({ page }) => {
  await fixture(page);
  const before = await values(page);
  await adjust(page);
  const after = await values(page);
  expect(after.weight).toBeGreaterThan(before.weight);
  expect(after.weight).toBeLessThan(600);      // The reference is body-text Regular; an extreme weight with no measurable stem must not win.
  expect(after.size).not.toBe(before.size);
  expect(after.rows[1]).toBeGreaterThanOrEqual(after.rows[0]);
  expect(after.weights).toEqual(before.weights);
  expect(after.view).toEqual(before.view);
  expect(await page.evaluate(() => [...document.fonts].filter(f => f.family.startsWith('__cf_fit_')).length)).toBe(0);
  await adjust(page);
  expect(await values(page)).toEqual(after);      // Repeating the action must not keep drifting in the same direction.
  await expect(page.locator('#undoBtn')).toHaveAttribute('aria-disabled', 'false');
  await page.click('#undoBtn');
  expect(await values(page)).toEqual(before);
  await page.click('#redoBtn');
  expect(await values(page)).toEqual(after);
  await showExport(page);
  await expect(page.locator('#codeOut')).toContainText(`"wght" ${after.weight}`);
});

test('不支持可变轴描述的浏览器仍可匹配字重，其他轴无法测量时保留该类别', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeFontFace = window.FontFace;
    window.FontFace = function (family, src, descriptors = {}) {
      const { variationSettings, ...supported } = descriptors;
      return new NativeFontFace(family, src, supported);
    };
    window.FontFace.prototype = new Proxy(NativeFontFace.prototype, { has: (target, key) => key !== 'variationSettings' && Reflect.has(target, key) });
  });
  await fixture(page);
  await adjust(page);
  expect((await values(page)).weight).toBeGreaterThan(100);
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    // Declare an extra category axis. Browsers without descriptor support must preserve the whole category rather than substitute default axes for the user's values.
    c.state.classes.latin.font.axes = [['wght', 100, 900, 400], ['wdth', 50, 200, 100]];
    c.state.classes.latin.vary = { wdth: 75 }; c.state.classes.latin.size = 137;
    u.changed({ fonts: true });
  });
  const before = await values(page);
  await adjust(page);
  expect(await values(page)).toEqual(before);
  await expect(page.locator('#toast')).toContainText('保留原设置');
  expect(await page.evaluate(() => [...document.fonts].filter(f => f.family.startsWith('__cf_fit_')).length)).toBe(0);
});

test('连续模式和单一字重只调整大小、基线，保留字重', async ({ page }) => {
  await fixture(page, { continuous: true });
  const before = await values(page);
  await adjust(page);
  const after = await values(page);
  expect(after.weight).toBe(before.weight);
  expect(after.over[700]?.latin?.weight).toBeUndefined();
  expect(after.size).not.toBe(before.size);
  expect(after.view).toEqual(before.view);
  await fixture(page, { single: true });
  await adjust(page);
  expect((await values(page)).weight).toBeUndefined();
});

test('缺少汉字参照不应用回退字体的测量结果', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js');
    const originalHan = c.state.classes.han.font;
    c.state.classes.han.font = { ...c.state.classes.latin.font };
    c.state.classes.latin.font = { ...originalHan }; // Keep the two fonts distinct so the test still exercises measurement without a Han reference.
  });
  const before = await values(page);
  await adjust(page);
  expect(await values(page)).toEqual(before);
  await expect(page.locator('#toast')).not.toHaveText('所用字体与参照相同，无需自动调整');
});

test('静态字体缺少目标字重时测量实际档位，不把候选的回退当成新字重', async ({ page }) => {
  await fixture(page);
  const fontUrl = new URL('tests/fixtures/NotoSansJP-Subset.ttf', page.url()).href;
  await page.route('https://fonts.googleapis.com/**', route => {
    const family = new URL(route.request().url()).searchParams.get('family');
    // Only Regular is available. Use real outlines while simulating a static family falling back to 400 for requested weights such as 100 and 200.
    if (!family?.endsWith('@400')) return route.fulfill({ status: 400, body: '' });
    return route.fulfill({ contentType: 'text/css', body: `@font-face { font-family: 'Shippori Mincho'; src: url('${fontUrl}'); }` });
  });
  const result = await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), { createFitter, chooseFits } = await import('./assets/js/autofit.js');
    const fitter = createFitter(), fallback = { font: c.G('Shippori Mincho', 100), size: 100, shift: 0 };
    try {
      const han = await fitter.fit({ W: 100, han: fallback, latin: c.resolveCls('latin', 400, true) }, true);
      const latin = await fitter.fit({ W: 100, han: c.resolveCls('han', 400, true), latin: fallback }, true);
      return { han: chooseFits([han]).get(100), latin: latin.candidates.map(c => c.weight) };
    } finally { fitter.dispose(); }
  });
  expect(result.han?.weight).toBeGreaterThan(100);
  expect(result.latin).toEqual([400]);
});

test('测量期间修改设置会丢弃旧结果，保留用户新输入', async ({ page }) => {
  await fixture(page);
  const before = await values(page);
  await page.evaluate(() => {
    document.querySelector('#autoAdj').click();
    const input = document.querySelector('#classRows [data-id="latin"] [data-field="size"]');
    input.value = '137'; input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#autoAdj')).toBeEnabled();
  const after = await values(page);
  expect(after.size).toBe(137);
  expect(after.weight).toBe(before.weight);
  expect(after.over).toEqual(before.over);
});

test('同一字体的各档一起选择，避免粗体的笔画反而比正文细', async ({ page }) => {
  await open(page);
  const weights = await page.evaluate(async () => {
    const { chooseFits } = await import('./assets/js/autofit.js');
    const latin = { font: { kind: 'google', family: 'Inter' } };
    const rows = [
      { W: 400, latin, candidates: [{ weight: 400, cost: 0.2 }, { weight: 600, cost: 0 }] },
      { W: 700, latin, candidates: [{ weight: 500, cost: 0 }, { weight: 700, cost: 0.1 }] },
    ];
    return [...chooseFits(rows).values()].map(c => c.weight);
  });
  expect(weights).toEqual([600, 700]);
});

test('西文跟随汉字但数字独立选字体时，仍匹配数字，保留跟随项的手动覆盖', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.classes.digit = { follow: null, font: { ...c.state.classes.latin.font }, size: 150, shift: 12 };
    c.state.classes.latin.follow = 'han'; c.state.classes.latin.size = null; c.state.classes.latin.shift = null;
    c.state.classes.kana.size = 91; c.state.classes.kana.shift = 3;
    u.changed({ fonts: true }); c.recordHistory();
  });
  const before = await page.evaluate(async () => JSON.parse((await import('./assets/js/core.js')).histSnap()));
  await adjust(page);
  const after = await page.evaluate(async () => {
    const c = await import('./assets/js/core.js');
    return { digit: c.state.classes.digit, kana: c.state.classes.kana, rows: c.state.weights.map(W => c.resolveCls('digit', W, true).font.weight) };
  });
  expect(after.digit.size).not.toBe(150);
  expect(after.digit.font.weight).toBeGreaterThan(100);
  expect(after.rows[1]).toBeGreaterThanOrEqual(after.rows[0]);
  expect(after.kana).toEqual(before.classes.kana);
  await expect(page.locator('#toast')).toContainText('半角数字');
  const fitted = await page.evaluate(async () => (await import('./assets/js/core.js')).histSnap());
  await adjust(page);
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).histSnap())).toBe(fitted);
  await page.click('#undoBtn');
  expect(await page.evaluate(async () => JSON.parse((await import('./assets/js/core.js')).histSnap()))).toEqual(before);
});

test('假名、标点与单一类别例外按同类字符匹配；混合例外和缺字注音保持设置', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.files.set('cjk-other', { ...c.files.get('ref') });
    const font = { kind: 'file', fileId: 'cjk-other', fileName: 'Other-CJK.ttf' };
    c.state.classes.latin.follow = 'han'; c.state.classes.latin.size = null;
    for (const key of ['kana', 'punct']) c.state.classes[key] = { follow: null, font: { ...font }, size: 150, shift: 10 };
    c.state.classes.bopo = { follow: null, font: { ...c.state.classes.latin.font }, size: 123, shift: 7 };
    c.state.custom = [
      { chars: '国字', follow: null, font: { ...font }, size: 150, shift: 10 },
      { chars: '国A', follow: null, font: { ...font }, size: 147, shift: 8 },
    ];
    u.changed({ fonts: true }); c.recordHistory();
  });
  await adjust(page);
  const after = await page.evaluate(async () => {
    const { state } = await import('./assets/js/core.js');
    return { classes: state.classes, custom: state.custom };
  });
  for (const key of ['kana', 'punct']) {
    expect(after.classes[key].size).toBeNull(); // Match the base glyph size by restoring the default 100%.
    expect(after.classes[key].shift).toBeNull();
  }
  expect(after.custom[0].size).toBeNull(); expect(after.custom[0].shift).toBeNull();
  expect(after.custom[1].size).toBe(147); expect(after.custom[1].shift).toBe(8);
  expect(after.classes.bopo.size).toBe(123); expect(after.classes.bopo.shift).toBe(7);
  await expect(page.locator('#toast')).toContainText('保留原设置');
  expect(await page.evaluate(() => [...document.fonts].filter(f => f.family.startsWith('__cf_fit_')).length)).toBe(0);
});

test('独立数字以本次调整后的西文为参照，连续模式保留所有类别的粗细', async ({ page }) => {
  await fixture(page, { continuous: true });
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.classes.digit = { follow: null, font: { ...c.state.classes.han.font }, size: 170, shift: 15 };
    u.changed({ fonts: true });
  });
  await adjust(page);
  const error = await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), { createFitter, chooseFits } = await import('./assets/js/autofit.js');
    const fitter = createFitter(), digit = c.resolveCls('digit', 400, true);
    try {
      const row = await fitter.fit({ W: 400, sample: '0123456789', han: c.resolveCls('latin', 400, true), latin: digit }, false);
      const expected = chooseFits([row]).get(400);
      return { size: digit.size, expected: expected.size, weight: c.state.classes.latin.font.weight, shift: digit.shift, expectedShift: expected.shift, overrides: c.state.wOver };
    } finally { fitter.dispose(); }
  });
  expect(error.size).toBe(error.expected);
  expect(Math.abs(error.shift - error.expectedShift)).toBeLessThan(2);
  expect(error.weight).toBe(100);
  expect(Object.values(error.overrides).flatMap(row => Object.values(row)).every(o => o.weight == null && !o.font)).toBe(true);
});

test('各类别列可独立重置，包含基础值，保留字体、其他类别、导出选择与预览，并可撤销', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.wOver = { 200: { latin: { size: 128 } }, 700: { latin: { weight: 600, size: 132 }, han: { size: 99 } } };
    c.state.custom = [{ chars: 'A', follow: null, font: { ...c.state.classes.latin.font }, size: 120, shift: 0 }];
    c.state.wOver[700]['#0'] = { size: 125 };
    u.changed({ fonts: true }); c.recordHistory();
  });
  const before = await values(page);
  const button = page.locator('#wMatrix [data-wreset="latin"]');
  await expect(button).toBeEnabled();
  await button.click();
  const after = await values(page);
  expect(after.size).toBeNull(); expect(after.shift).toBeNull(); expect(after.weight).toBe(400);
  expect(after.over).toEqual({ 700: { han: { size: 99 }, '#0': { size: 125 } } });
  expect(after.view).toEqual(before.view); expect(after.weights).toEqual(before.weights);
  await expect(button).toBeDisabled();
  await expect(page.locator('#wMatrix [data-wreset="han"]')).toBeEnabled();
  await page.click('#undoBtn'); expect(await values(page)).toEqual(before);
  await page.locator('#wMatrix [data-wreset="#0"]').click();
  expect((await values(page)).over[700]['#0']).toBeUndefined();
  expect((await values(page)).over[700].latin).toEqual(before.over[700].latin);
});

test('只有基础值被调整时仍可按列重置，并保留字体来源与其他可变轴', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.wOver = {}; c.state.classes.latin.shift = 6; c.state.classes.latin.vary = { opsz: 18 };
    u.changed({ fonts: true }); c.recordHistory();
  });
  const before = await values(page);
  const button = page.locator('#wMatrix [data-wreset="latin"]');
  await expect(button).toBeEnabled();
  await button.click();
  const result = await page.evaluate(async () => {
    const c = await import('./assets/js/core.js');
    return { cls: c.state.classes.latin, defaults: [c.defaultFontWeight({ kind: 'file', axis: [100, 300] }), c.defaultFontWeight({ kind: 'file', axis: [500, 900] })] };
  });
  expect(result.cls).toMatchObject({ font: { fileId: 'latin', weight: 400 }, size: null, shift: null, vary: { opsz: 18 } });
  expect(result.defaults).toEqual([300, 500]);
  await expect(button).toBeDisabled();
  await page.click('#undoBtn'); expect(await values(page)).toEqual(before);
});
