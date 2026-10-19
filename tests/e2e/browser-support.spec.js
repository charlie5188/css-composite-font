const { test, expect } = require('@playwright/test');
const { open, setLang } = require('./helpers');

test.beforeEach(async ({ page }) => {
  // Keep capability checks independent of remote font services.
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
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
