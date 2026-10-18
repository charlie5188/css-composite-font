const { test, expect } = require('@playwright/test');
const { open, showExport } = require('./helpers');

// Use local OFL files for picker previews with controlled weight metadata to reproduce the user's 200-500 and 300-600 pairing.
async function fixture(page) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: `@font-face { font-family: 'CoverageFixture'; src: url('http://127.0.0.1:8765/tests/fixtures/Jost%5Bwght%5D.ttf'); }` }));
  await open(page);
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    Object.assign(c.vfCache, { Jost: [100, 900], Inter: [300, 600], Roboto: [200, 500] });
    const s = c.stateFromPreset(c.PRESETS.find(p => p.id === 'sans-sc'));
    s.classes.han.font = c.G('Jost'); s.classes.latin.font = c.G('Inter');
    s.wOver = {}; s.weights = [...c.WEIGHTS]; s.italic = false;
    c.setState(s); c.normalizeState(); c.state.fx.weights = [...c.WEIGHTS];
    u.changed({ fonts: true });
    c.hist.list = []; c.hist.i = -1; c.recordHistory();
  });
  await page.click('#ltabFonts');
}
async function choose(page, family) {
  await page.locator('.ct-row[data-id="han"] .fsel').selectOption('pick');
  await page.locator('#gfManual > summary').click();
  await page.locator('#gfFamily').fill(family);
  await page.locator('#gfFamily').dispatchEvent('change');
  await expect(page.locator('#pkOk')).toBeEnabled();
  await page.click('#pkOk');
}
const selections = page => page.evaluate(async () => {
  const { state } = await import('./assets/js/core.js');
  return { web: state.weights, files: state.fx.weights, family: state.classes.han.font.family };
});

test('换字体：自动取消越界字重，网页和字体文件同步显示，一次撤销恢复字体及选择', async ({ page }) => {
  await fixture(page);
  const before = await selections(page);
  await choose(page, 'Roboto');
  const after = { web: [300, 400, 500], files: [300, 400, 500], family: 'Roboto' };
  expect(await selections(page)).toEqual(after);
  await expect(page.locator('#toast')).toContainText('100、200、600、700、800、900');
  await expect(page.locator('#wMatrix [data-wx="200"]')).not.toBeChecked();
  await expect(page.locator('#wMatrix [data-wx="300"]')).toBeChecked();
  await showExport(page);
  await expect(page.locator('#exWeights [data-w="200"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#codeOut')).not.toContainText('font-weight: 200;');
  await page.click('#kindFont');
  await expect(page.locator('#fxWeights [data-w="700"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#fxWeights [data-w="400"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#exClose');
  await page.click('#undoBtn'); expect(await selections(page)).toEqual(before);
  await page.click('#redoBtn'); expect(await selections(page)).toEqual(after);
});

test('有效单独映射、按行换字体与跟随关系保留，判断不使用已经夹到端点的粗细', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.classes.han.font = c.G('Roboto');
    c.state.wOver = {
      100: { han: { weight: 200 }, latin: { weight: 300 }, digit: { weight: 999 } },
      600: { han: { font: c.G('Jost', 600) } },
      700: { latin: { size: 120, weight: 400 } },
    };
    u.changed({ fonts: true, fontChange: true });
    return { weights: c.state.weights, over: c.state.wOver };
  });
  expect(result.weights).toEqual([100, 300, 400, 500, 600]);
  expect(result.over[700].latin).toEqual({ size: 120, weight: 400 }); // Excluding a weight from export preserves the user's adjustments.
});

test('静态字体范围内缺档不取消；修改基础粗细后按实际偏移判断', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.classes.latin.font = c.G('Klee One'); // 400 and 600, retaining 500 within the range.
    u.changed({ fonts: true, fontChange: true });
    const staticWeights = [...c.state.weights];
    c.state.weights = [...c.WEIGHTS];
    c.state.classes.latin.font = c.G('Inter', 300); // Exported 400 maps to actual 300; the range becomes 400-700.
    u.changed({ fonts: true, fontChange: true });
    return { staticWeights, shifted: c.state.weights };
  });
  expect(result.staticWeights).toEqual([400, 500, 600]);
  expect(result.shifted).toEqual([400, 500, 600, 700]);
});

test('范围未知保持选择；空例外不限制导出，有字元的例外参与检查', async ({ page }) => {
  await fixture(page);
  const result = await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.classes.latin.font = { kind: 'local', name: 'Unknown VF', axis: [100, 900], weight: 400 };
    c.state.custom = [{ chars: '', font: c.G('Roboto'), size: null, shift: null, follow: null }];
    u.changed({ fonts: true, fontChange: true });
    const unknown = [...c.state.weights];
    c.state.custom[0].chars = 'A';
    u.changed({ fonts: true, fontChange: true });
    return { unknown, withException: c.state.weights };
  });
  expect(result.unknown).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
  expect(result.withException).toEqual([200, 300, 400, 500]);
});

test('全部越界时保持该组选择并提示；连续模式不自动修改选择或范围', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.weights = [100, 900]; c.state.fx.weights = [400, 700];
    c.state.classes.han.font = c.G('Roboto');
    u.changed({ fonts: true, fontChange: true });
  });
  expect(await selections(page)).toEqual({ web: [100, 900], files: [400], family: 'Roboto' });
  await expect(page.locator('#toast')).toContainText('已保留原勾选');
  await expect(page.locator('#toast')).toContainText('字体文件已取消字重：700');
  const cont = await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.wmode = 'cont'; c.state.wrange = [100, 900]; c.state.fx.weights = [100, 900];
    u.changed({ fonts: true, fontChange: true });
    return { weights: c.state.weights, files: c.state.fx.weights, range: c.state.wrange };
  });
  expect(cont).toEqual({ weights: [100, 900], files: [100, 900], range: [100, 900] });
});

test('用户可重新勾选；后台加载及普通编辑不再取消，换成更宽的字体也不自动扩大选择', async ({ page }) => {
  await fixture(page);
  await choose(page, 'Roboto');
  await page.click('#wMatrix [data-wx="100"]');
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.onSourcesChanged(); u.changed({ fonts: true });
  });
  expect((await selections(page)).web).toEqual([100, 300, 400, 500]);
  await choose(page, 'Jost');
  expect((await selections(page)).web).toEqual([300, 400, 500]); // Inter still does not support 100; do not add 600.
  expect((await selections(page)).files).toEqual([300, 400, 500]);
});
