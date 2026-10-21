const { test, expect } = require('@playwright/test');
const { open, setLang, showExport } = require('./helpers');

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
    const group = page.locator(`#typoRows [data-typo="${key}"] .tt-layout`);
    const pictures = [];
    // Compare line-break drawings in their own coordinates; screen-column subpixels can rasterize identical drawings differently.
    for (const picture of await group.all()) pictures.push(key === 'lineBreak' ? await picture.innerHTML() : (await picture.screenshot()).toString('base64'));
    // The punctuation sample only compares line heads: normal and space-all differ for adjacent marks,
    // which are intentionally absent here. Both pictures should agree rather than invent a fourth effect.
    if (key === 'trim') expect(pictures[0]).toBe(pictures[1]);
    if (key === 'lineBreak') expect(pictures[2]).toBe(pictures[3]);      // Chinese normal and strict agree for this sample.
    expect(new Set(pictures).size).toBe(pictures.length - (['trim', 'lineBreak'].includes(key) ? 1 : 0));
  }
  // Rule comparisons must reflow one sample, rather than swap in different text to manufacture differences.
  for (const value of ['loose', 'normal', 'strict', 'anywhere']) {
    await expect(page.locator(`[data-typo="lineBreak"][data-v="${value}"] svg`)).toHaveText('看完了吗？我们（明天）谈。');
  }
  const intervals = await page.locator('[data-typo="autospace"] .tt-demo-space').evaluateAll(marks => marks.map(mark => {
    const { width, height } = mark.getBoundingClientRect(); return { width, height };
  }));
  expect(intervals).toHaveLength(4);
  expect(intervals.every(mark => mark.width === 2 && mark.height <= 1.5)).toBe(true);
  await page.locator('[data-typo="trim"][data-v="space-first"]').click();
  await expect(page.locator('.typo-unsup[data-key="trim"]')).toBeVisible();
  await page.locator('[data-typo="wordBreak"][data-v="auto-phrase"]').click();
  await expect(page.locator('.typo-unsup[data-key="wordBreak"]')).toBeVisible();
  await page.click('#exToggle');
  await expect(page.locator('#codeOut')).toContainText('text-spacing-trim: space-first;');
  await expect(page.locator('#codeOut')).toContainText('word-break: auto-phrase;');
});

const lineBreakCard = (page, value) => page.locator(`[data-typo="lineBreak"][data-v="${value}"]`);
async function expectLineBreakSample(page, lang, text) {
  for (const value of ['auto', 'loose', 'normal', 'strict', 'anywhere']) {
    await expect(lineBreakCard(page, value).locator('.tt-layout')).toHaveAttribute('lang', lang);
    if (value !== 'auto') await expect(lineBreakCard(page, value).locator('svg')).toHaveText(text);
  }
}

test('Line-breaking illustrations follow the proof language, preserving rule selection and mounted controls', async ({ page }) => {
  await open(page); await page.click('#ltabTypo');
  const selected = lineBreakCard(page, 'normal');
  await selected.click();
  await selected.evaluate(el => { window.keptLineBreakCard = el; });
  await setLang(page, 'en');      // UI language must not replace the proof's language.
  await expectLineBreakSample(page, 'zh-Hans', '看完了吗？我们（明天）谈。');
  await selected.evaluate(el => { window.keptLineBreakCard = el; });      // UI translation intentionally rebuilds controls.
  for (const [sample, lang, text] of [
    ['tw', 'zh-Hant', '看完了嗎？我們（明天）談。'],
    ['hk', 'zh-Hant', '看完了嗎？我們（明天）談。'],
    ['ja', 'ja', 'おはよう〜もうちょっとね、'],
    ['manga', 'ja', 'おはよう〜もうちょっとね、'],
    ['chars', 'zh-Hans', '看完了吗？我们（明天）谈。'],
  ]) {
    await page.locator(`#sampleTabs [data-sample="${sample}"]`).click();
    await expectLineBreakSample(page, lang, text);
    await expect(selected).toHaveAttribute('aria-checked', 'true');
    expect(await selected.evaluate(el => el === window.keptLineBreakCard)).toBe(true);
  }
  for (const language of ['en', 'ko']) {
    await showExport(page); await page.selectOption('#exLang', language); await page.keyboard.press('Escape');
    await expectLineBreakSample(page, 'en', 'Read a story today.');
    await expect(selected).toHaveAttribute('aria-checked', 'true');
    const pictures = [];
    for (const value of ['loose', 'normal', 'strict', 'anywhere']) pictures.push(await lineBreakCard(page, value).locator('svg').innerHTML());
    expect(pictures[0]).toBe(pictures[1]); expect(pictures[1]).toBe(pictures[2]); expect(pictures[2]).not.toBe(pictures[3]);
  }
  await setLang(page, 'tw'); await expectLineBreakSample(page, 'en', 'Read a story today.');
  await showExport(page); await expect(page.locator('#codeOut')).toContainText('line-break: normal;');
});

test('Custom and mixed-script proofs keep their declared example language across editing and reload', async ({ page }) => {
  await open(page); await page.click('#ltabTypo');
  await lineBreakCard(page, 'loose').click();
  await page.locator('#sampleTabs [data-sample="ja"]').click();
  await page.locator('#proofText').fill('English と中文 123');
  await expectLineBreakSample(page, 'ja', 'おはよう〜もうちょっとね、');
  await page.locator('#sampleTabs [data-sample="zh"]').click();
  await expectLineBreakSample(page, 'zh-Hans', '看完了吗？我们（明天）谈。');
  await page.locator('#sampleTabs [data-sample="c0"]').click();
  await expectLineBreakSample(page, 'ja', 'おはよう〜もうちょっとね、');
  await page.locator('#sampleTabs [data-sample="zh"]').click();
  await showExport(page); await page.selectOption('#exLang', 'en'); await page.keyboard.press('Escape');
  await page.locator('#proofText').fill('A custom story 中文');
  await expectLineBreakSample(page, 'en', 'Read a story today.');
  await page.locator('#sampleTabs [data-sample="ja"]').click();
  await page.locator('#sampleTabs [data-sample="c1"]').click();
  await expectLineBreakSample(page, 'en', 'Read a story today.');
  await expect(lineBreakCard(page, 'loose')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('composite-font:state:v1'))?.view.sample)).toBe('c1');
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('[data-typo="lineBreak"]').length === 5);
  await expectLineBreakSample(page, 'en', 'Read a story today.');
  await expect(page.locator('#proofText')).toHaveText('A custom story 中文');
  await expect(lineBreakCard(page, 'loose')).toHaveAttribute('aria-checked', 'true');
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

test('CJK–Western spacing illustrations keep natural ASCII letter and digit widths in every language', async ({ page }) => {
  await open(page);
  await page.click('#ltabTypo');
  for (const lang of ['zh', 'tw', 'ja', 'en']) {
    await setLang(page, lang);
    const widths = await page.locator('[data-typo="autospace"] .tt-autospace').evaluateAll(samples => samples.flatMap(sample => {
      const style = getComputedStyle(sample), reference = document.createElement('span');
      reference.style.cssText = `position:fixed;white-space:pre;font:${style.font};letter-spacing:0;word-spacing:0;text-autospace:no-autospace`;
      document.body.append(reference);
      try {
        return ['Ab', '12'].map(text => {
          const walker = document.createTreeWalker(sample, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode()) && !node.data.includes(text)) {}
          if (!node) throw new Error('Missing ASCII sample: ' + text);
          const range = document.createRange(), start = node.data.indexOf(text);
          range.setStart(node, start); range.setEnd(node, start + text.length);
          reference.textContent = text;
          return { actual: range.getBoundingClientRect().width, natural: reference.getBoundingClientRect().width };
        });
      } finally { reference.remove(); }
    }));
    expect(widths).toHaveLength(4);
    for (const { actual, natural } of widths) expect(actual).toBeCloseTo(natural, 1);
  }
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
