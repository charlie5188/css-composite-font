const { test, expect } = require('@playwright/test');
const { open, setLang } = require('./helpers');

test.beforeEach(async ({ page }) => {
  // Keep capability checks independent of remote font services.
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
});

test('Layout cards explain distinct rules even without browser support or a working composite font', async ({ page }) => {
  await page.addInitScript(() => {
    const supports = CSS.supports.bind(CSS);
    CSS.supports = (prop, value) => ['text-autospace', 'text-spacing-trim', 'word-break', 'line-break'].includes(prop) ? false : supports(prop, value);
  });
  await open(page);
  await page.click('#ltabTypo');
  const cards = page.locator('#typoRows .tt-layout');
  const before = [];
  for (const card of await cards.all()) before.push(await card.screenshot());
  // A failed or different composite font must not erase the distinction between rule choices.
  await page.evaluate(() => document.documentElement.style.setProperty('--cf', 'monospace'));
  for (const [i, card] of (await cards.all()).entries()) expect(await card.screenshot()).toEqual(before[i]);
  for (const key of ['autospace', 'trim', 'wordBreak', 'lineBreak']) {
    const group = page.locator(`#typoRows [data-typo="${key}"] svg`);
    const pictures = [];
    for (const picture of await group.all()) pictures.push((await picture.screenshot()).toString('base64'));
    // The punctuation sample only compares line heads: normal and space-all differ for adjacent marks,
    // which are intentionally absent here. Both pictures should agree rather than invent a fourth effect.
    if (key === 'trim') expect(pictures[0]).toBe(pictures[1]);
    expect(new Set(pictures).size).toBe(pictures.length - (key === 'trim' ? 1 : 0));
  }
  // Rule comparisons must reflow one sample, rather than swap in different text to manufacture differences.
  for (const value of ['loose', 'normal', 'strict', 'anywhere']) {
    await expect(page.locator(`[data-typo="lineBreak"][data-v="${value}"] svg`)).toHaveText('おはよう〜もうちょっとね、');
  }
  const intervals = await page.locator('[data-typo="autospace"] .tt-demo-space').evaluateAll(marks => marks.map(mark => {
    const { width, height } = mark.getBBox(); return { width, height };
  }));
  expect(intervals).toHaveLength(4);
  expect(intervals.every(mark => mark.width > 0 && mark.height === 0)).toBe(true);
  await page.locator('[data-typo="trim"][data-v="space-first"]').click();
  await expect(page.locator('.typo-unsup[data-key="trim"]')).toBeVisible();
  await page.locator('[data-typo="wordBreak"][data-v="auto-phrase"]').click();
  await expect(page.locator('.typo-unsup[data-key="wordBreak"]')).toBeVisible();
  await page.click('#exToggle');
  await expect(page.locator('#codeOut')).toContainText('text-spacing-trim: space-first;');
  await expect(page.locator('#codeOut')).toContainText('word-break: auto-phrase;');
});

test('Spacing cards distinguish a measured lack of effect from supported and unknown fonts', async ({ page }) => {
  await open(page);
  await page.click('#ltabFonts');
  const setFixture = async (file, status = 'ok') => page.evaluate(async ({ file, status }) => {
    const c = await import('./assets/js/core.js'), r = await import('./assets/js/render.js');
    const f = { kind: 'local', name: file }, buffer = await (await fetch('tests/fixtures/' + file)).arrayBuffer();
    c.sources.set(c.fontKey(f), { status, faces: [{ buffer }] });
    for (const key of ['han', 'kana', 'punct']) { c.state.classes[key].font = f; c.state.classes[key].follow = null; }
    r.renderSpacingMarks();
  }, { file, status });
  const spacing = page.locator('#featRows [data-typo="feat"]').last();
  const vertical = page.locator('#featRows [data-typo="vfeat"]').last();
  // This small derivative of the bundled Noto CJK fixture covers every sample character, with GSUB/GPOS removed.
  // License: tests/fixtures/OFL-NotoSansCJK.txt. Full coverage avoids testing an unknown system fallback font.
  await setFixture('SpacingTest-NoFeatures.otf');
  await expect(spacing).toHaveClass(/lack/);
  await expect(vertical).toHaveClass(/lack/);
  await expect(vertical.locator('.tt-s')).toHaveAttribute('data-lack', '样张无变化');
  await expect(vertical).toBeEnabled();
  await setFixture('NotoSansCJKjp-Subset.otf');
  await expect(spacing).not.toHaveClass(/lack/);
  await expect(vertical).not.toHaveClass(/lack/);
  await setFixture('SpacingTest-NoFeatures.otf', 'loading');
  await expect(spacing).not.toHaveClass(/lack/);
  await expect(vertical).not.toHaveClass(/lack/);
});

async function measuredScale(page) {
  return page.evaluate(async () => {
    const buffer = await (await fetch('tests/fixtures/Jost%5Bwght%5D.ttf')).arrayBuffer();
    const faces = [100, 200].map(size => new FontFace(`__scale_${size}`, buffer, { sizeAdjust: `${size}%` }));
    const samples = [];
    try {
      await Promise.all(faces.map(face => face.load()));
      faces.forEach(face => document.fonts.add(face));
      for (const size of [100, 200]) {
        const el = document.createElement('span');
        el.style.cssText = `position:fixed;display:inline-block;white-space:nowrap;font:40px "__scale_${size}";font-size-adjust:none;`;
        el.textContent = 'Hamburgefonts';
        document.body.append(el); samples.push(el);
      }
      return samples[1].getBoundingClientRect().width / samples[0].getBoundingClientRect().width;
    } finally {
      samples.forEach(el => el.remove());
      faces.forEach(face => document.fonts.delete(face));
    }
  });
}

for (const hideAccessor of [false, true]) {
  test(`size-adjust: supported scaling stays available${hideAccessor ? ' without the prototype accessor' : ''}`, async ({ page }) => {
    if (hideAccessor) await page.addInitScript(() => { delete FontFace.prototype.sizeAdjust; });
    await open(page);
    if (hideAccessor) expect(await page.evaluate(() => 'sizeAdjust' in FontFace.prototype)).toBe(false);
    await expect(page.locator('#sizeAdjustWarn')).toBeHidden();
    // Glyph advance rounding varies by platform (Linux can measure 1.992x). Check that scaling works, not exact rasterization parity.
    expect(await measuredScale(page)).toBeCloseTo(2, 1);
  });
}

test('size-adjust: ignored constructor options show a localized warning, regardless of the accessor', async ({ page }) => {
  await page.addInitScript(() => {
    // Model an unsupported dictionary member: it is never read, even if an accessor exists.
    window.FontFace = new Proxy(FontFace, {
      construct(Target, [family, source, descriptors = {}]) {
        const options = Object.fromEntries(Object.keys(descriptors).filter(key => key !== 'sizeAdjust').map(key => [key, descriptors[key]]));
        return new Target(family, source, options);
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  const warning = page.locator('#sizeAdjustWarn');
  const labels = { zh: '浏览器环境不支持', tw: '瀏覽器環境不支援', ja: 'ブラウザ環境は', en: "browser environment doesn't support" };
  for (const [lang, label] of Object.entries(labels)) {
    await setLang(page, lang);
    await expect(warning).toBeVisible();
    await expect(warning).toContainText(label);
    await expect(warning).not.toContainText('92+');
    const bounds = await warning.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await expect(page.locator('#ltabFonts')).toBeVisible();
  }
  expect(await measuredScale(page)).toBeCloseTo(1, 2);
});

test('size-adjust: an inconclusive probe does not claim unsupported scaling or stop startup', async ({ page }) => {
  await page.addInitScript(() => {
    window.FontFace = new Proxy(FontFace, {
      construct(Target, args) {
        if (args[0] === '__cf_size_adjust_probe') throw new Error('Probe unavailable');
        return new Target(...args);
      },
    });
  });
  await open(page);
  await expect(page.locator('#sizeAdjustWarn')).toBeHidden();
  await page.click('#ltabFonts');
  await expect(page.locator('#classRows [data-id="latin"]')).toBeVisible();
});
