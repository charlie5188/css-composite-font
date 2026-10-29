const { test, expect } = require('@playwright/test');
const { open } = require('./helpers');
// Google CSS points at a same-origin fixture, so the image path that inlines Google files runs offline.
async function fixture(page) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: "@font-face { font-family:'ProofFixture'; src:url('/tests/fixtures/Jost%5Bwght%5D.ttf'); }" }));
  await open(page);
  await page.locator('#proofText').fill('永和九年，岁在癸丑。Hamburg 2026年');
  await page.evaluate(() => document.activeElement.blur());
  if (await page.locator('#vMiss').getAttribute('aria-pressed') === 'true') { await page.click('#viewBtn'); await page.click('#vMiss'); await page.keyboard.press('Escape'); }
}
async function exportImage(page, opts) {
  await page.click('#imgBtn');
  await expect(page.locator('#export')).toHaveAttribute('data-kind', 'img');
  for (const [id, v] of Object.entries(opts)) await page.click(`#${id} [data-v="${v}"]`);
  await expect(page.locator('#imgDl')).toBeEnabled();
  return page.evaluate(async () => {
    const b = await (await fetch(document.querySelector('#imgPreview').src)).blob();
    return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  });
}
// Share of 4 × 4 px cells whose mean luminance differs by more than 16% between two PNGs of the same size; null when sizes differ.
// Cells absorb antialiasing from the proof's fractional page position; a different font, wrap or baseline still changes many cells.
// With `slack`, a cell also matches `b` shifted by up to that many pixels horizontally.
const diff = (page, a, b, slack = 0) => page.evaluate(async ([a, b, slack]) => {
  const px = async src => { const i = new Image(); i.src = src; await i.decode(); const c = new OffscreenCanvas(i.naturalWidth, i.naturalHeight), x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height); };
  const [p, q] = [await px(a), await px(b)];
  if (Math.abs(p.width - q.width) > 1 || Math.abs(p.height - q.height) > 1) return null;
  const W = Math.min(p.width, q.width), H = Math.min(p.height, q.height), lum = (d, w, x, y) => { x = Math.max(0, Math.min(w - 1, x)); const i = (y * w + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
  let n = 0, cells = 0;
  for (let y = 0; y + 4 <= H; y += 4) for (let x = 0; x + 4 <= W; x += 4) {
    let best = Infinity;
    for (let dx = -slack; dx <= slack; dx++) {
      let s = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) s += lum(p.data, p.width, x + i, y + j) - lum(q.data, q.width, x + i + dx, y + j);
      best = Math.min(best, Math.abs(s / 16));
    }
    cells++; if (best > 40) n++;
  }
  return n / cells;
}, [a, b, slack]);
// The proof's line boxes, which the image frames, without a vertical proof's scrollbar.
const proofClip = page => page.evaluate(() => {
  const pt = document.querySelector('#proofText'), r = pt.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height - (pt.offsetHeight - pt.clientHeight) };
});

for (const vertical of [false, true]) test(`Image export reproduces the ${vertical ? 'vertical' : 'horizontal'} proof, including baseline shifts`, async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => { const c = await import('./assets/js/core.js'), r = await import('./assets/js/render.js'); c.state.classes.latin.shift = -30; r.renderPreview(); });
  if (vertical) { await page.click('#viewBtn'); await page.click('#vVertical'); await page.keyboard.press('Escape'); }
  await expect(page.locator('#proofText .r').first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  const shot = 'data:image/png;base64,' + (await page.screenshot({ clip: await proofClip(page) })).toString('base64');
  const png = await exportImage(page, { exImgScale: 1, exImgPad: 0, exImgBg: 'proof' });
  const d = await diff(page, shot, png);
  expect(d).not.toBeNull();
  expect(d).toBeLessThan(0.01);
});

test('Image options change size, margin and transparency without entering undo history or shares', async ({ page }) => {
  await fixture(page);
  const { width, height } = await proofClip(page);
  const png = await exportImage(page, { exImgScale: 2, exImgPad: 16, exImgBg: 'clear' });
  const info = await page.evaluate(async src => {
    const i = new Image(); i.src = src; await i.decode();
    const c = new OffscreenCanvas(i.naturalWidth, i.naturalHeight), x = c.getContext('2d'); x.drawImage(i, 0, 0);
    return { w: i.naturalWidth, h: i.naturalHeight, alpha: x.getImageData(1, 1, 1, 1).data[3] };
  }, png);
  expect(info.w).toBe(Math.ceil(width + 32) * 2);
  expect(Math.abs(info.h - (height + 32) * 2)).toBeLessThanOrEqual(2);
  expect(info.alpha).toBe(0);
  await expect(page.locator('#imgMeta')).toContainText(`${info.w} × ${info.h} px`);
  await expect(page.locator('#undoBtn')).toHaveAttribute('aria-disabled', 'true');
  const shared = await page.evaluate(async () => JSON.stringify((await import('./assets/js/share.js')).shareSnapshot()));
  expect(shared).not.toContain('"img"');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('composite-font:state:v1'))?.view.img?.pad)).toBe(16);
  await page.reload();
  await page.click('#imgBtn');
  for (const [id, v] of [['exImgScale', '2'], ['exImgPad', '16'], ['exImgBg', 'clear']]) await expect(page.locator(`#${id} [data-v="${v}"]`)).toHaveAttribute('aria-checked', 'true');
});

test('Image export downloads a PNG named after the family and reports an empty proof', async ({ page }) => {
  await fixture(page);
  await exportImage(page, {});
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#imgDl')]);
  expect(dl.suggestedFilename()).toMatch(/\.png$/);
  await page.click('#exClose');
  await page.locator('#proofText').fill('');
  await page.click('#imgBtn');
  await expect(page.locator('#imgMeta')).toHaveText(/没有文字/);
  await expect(page.locator('#imgDl')).toBeDisabled();
  await expect(page.locator('#imgPreview')).toBeHidden();
});

/* ---------- Outlined SVG ----------
   HarfBuzz comes from node_modules at the pinned CDN version, google/fonts full files resolve to the Jost fixture, and the Han base is an
   uploaded CJK subset, so the outline path runs offline with real shaping and a real file source. */
async function svgFixture(page, text) {
  await page.route('https://cdn.jsdelivr.net/npm/harfbuzzjs@1.6.0/dist/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    route.fulfill({ path: `node_modules/harfbuzzjs/dist/${name}`, contentType: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('https://raw.githubusercontent.com/google/fonts/**', route => {
    const url = route.request().url();
    if (/\/OFL\.txt$/.test(url)) return route.fulfill({ path: 'tests/fixtures/OFL-Jost.txt', headers: { 'access-control-allow-origin': '*' } });
    if (/\.ttf$/.test(url)) return route.fulfill({ path: 'tests/fixtures/Jost[wght].ttf', headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route('https://api.github.com/**', route => route.fulfill({ status: 404 }));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: "@font-face { font-family:'ProofFixture'; src:url('/tests/fixtures/Jost%5Bwght%5D.ttf'); }" }));
  await open(page);
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.files.set('ref', { name: 'NotoSansJP-Subset.ttf', buffer: await (await fetch('tests/fixtures/NotoSansJP-Subset.ttf')).arrayBuffer() });
    const s = c.stateFromPreset(c.PRESETS.find(p => p.id === 'gothic-jp'));
    s.classes.han.font = { kind: 'file', fileId: 'ref', fileName: 'NotoSansJP-Subset.ttf' };
    s.classes.latin.shift = -20; s.view.miss = false; s.typo.align = 'justify';
    c.setState(s); c.normalizeState(); u.changed({ fonts: true });
    await c.rebuildNow();
  });
  await page.locator('#proofText').fill(text);
  await page.evaluate(() => { document.activeElement.blur(); return document.fonts.ready; });
}
const svgPng = (page, svg) => page.evaluate(async svg => {
  const i = new Image(); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); await i.decode();
  const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0);
  return c.toDataURL();
}, svg);
async function exportSvg(page, opts = {}) {
  await page.click('#imgBtn');
  await page.click('#exImgFmt [data-v="svg"]');
  for (const [id, v] of Object.entries(opts)) await page.click(`#${id} [data-v="${v}"]`);
  await expect(page.locator('#imgDl')).toBeEnabled({ timeout: 30_000 });
  return page.evaluate(async () => (await import('./assets/js/image.js')).imgSvg);
}

test('Outlined SVG places shaped glyphs where the justified proof draws them', async ({ page }) => {
  await svgFixture(page, '朝日の駅「国語」、Internationalization 2026年の本。'.repeat(4));
  await expect(page.locator('#exImgScaleField')).toBeHidden();
  const shot = 'data:image/png;base64,' + (await page.screenshot({ clip: await proofClip(page) })).toString('base64');
  const svg = await exportSvg(page, { exImgPad: 0, exImgBg: 'proof' });
  expect(svg).not.toContain('<text');
  expect((svg.match(/<path /g) || []).length).toBeGreaterThan(80);
  await expect(page.locator('#imgNote')).toBeHidden();
  // Linux Chromium draws proof glyphs on whole pixels while the SVG keeps fractional positions, up to 1 px apart.
  const d = await diff(page, shot, await svgPng(page, svg), 1);
  expect(d).not.toBeNull();
  expect(d).toBeLessThan(0.005);      // At most about 0.002 when right; dropping the justification lead gives about 0.006, a 1 px baseline error about 0.012.
  await expect(page.locator('#exImgScaleField')).toBeHidden();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#imgDl')]);
  expect(dl.suggestedFilename()).toMatch(/\.svg$/);
});

test('Outlined SVG lists system-fallback characters and declines vertical proofs', async ({ page }) => {
  await svgFixture(page, '国語 Hamburg 猫');
  await exportSvg(page);
  await expect(page.locator('#imgNote')).toContainText('猫');
  await expect(page.locator('#imgNote')).not.toContainText('国');
  await page.click('#exClose');
  await page.click('#viewBtn'); await page.click('#vVertical'); await page.keyboard.press('Escape');
  await page.click('#imgBtn');
  await expect(page.locator('#imgMeta')).toHaveText(/只支持横排/);
  await expect(page.locator('#imgDl')).toBeDisabled();
  await page.click('#exImgFmt [data-v="png"]');
  await expect(page.locator('#imgDl')).toBeEnabled();
});
