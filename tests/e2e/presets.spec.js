const { test, expect } = require('@playwright/test');
const { open } = require('./helpers');
const LIBRARY = 'composite-font:presets:v1';
const saved = (page, name) => page.evaluate(({ key, name }) => JSON.parse(localStorage.getItem(key) || '{}')[name], { key: LIBRARY, name });
async function create(page, name) {
  await page.click('#ltabPresets');
  await page.click('#savePresetBtn');
  await expect(page.locator('#saveName')).not.toHaveValue('');
  await page.fill('#saveName', name); await page.click('#saveOk');
  await expect(page.locator('#saveDlg')).toBeHidden();
}
async function editSize(page, value) {
  await page.click('#ltabFonts');
  const input = page.locator('#classRows [data-id="latin"] [data-field="size"]');
  await input.fill(String(value)); await input.press('Tab');
  await page.click('#ltabPresets');
}

test('新建预设自动填写字体组合名称，可直接保存；重复名称自动编号，仍可手动修改', async ({ page }) => {
  await open(page);
  const field = page.locator('#saveName'), name = 'Noto Serif SC × EB Garamond';
  await page.click('#savePresetBtn');
  await expect(field).toHaveValue(name);
  await expect(field).toBeFocused();
  await field.press('Enter');
  await expect(page.locator('#saveDlg')).toBeHidden();
  await expect(page.locator('#currentPresetName')).toHaveText(name);
  expect((await saved(page, name)).classes.han.font.family).toBe('Noto Serif SC');
  await page.click('#savePresetBtn');
  await expect(field).toHaveValue(name + ' (2)');
  await expect(page.locator('#saveDup')).toBeHidden();
  await page.click('#saveOk');
  await page.click('#savePresetBtn');
  await expect(field).toHaveValue(name + ' (3)');
  await field.fill('正文方案');
  await page.click('#saveStyle [data-v="other"]');
  await expect(field).toHaveValue('正文方案');
  await page.click('#saveOk');
  await expect(page.locator('#currentPresetName')).toHaveText('正文方案');
  await editSize(page, 119);
  await page.click('#presetList [data-preset="sans-sc"]');
  await expect(field).toHaveValue('正文方案');
  await page.click('#saveCancel');
  await page.reload();
  await page.click('#savePresetBtn');
  await expect(field).toHaveValue(name + ' (3)');
});

test('建议名称使用当前基础字体，跟随字体不重复，独立假名加入名称', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => (await import('./assets/js/ui.js')).applyPreset('antigochi'));
  await page.click('#savePresetBtn');
  await expect(page.locator('#saveName')).toHaveValue('Zen Kaku Gothic New × Zen Antique');
  await page.click('#saveCancel');
  await page.evaluate(async () => {
    const { state, G } = await import('./assets/js/core.js');
    const { changed } = await import('./assets/js/ui.js');
    state.classes.han.font = G('Noto Sans SC');
    state.classes.latin = { follow: 'han' }; state.classes.kana = { follow: 'han' };
    changed({ fonts: true });
  });
  await expect(page.locator('#currentPresetName')).toHaveText('Noto Sans SC');
  await page.click('#savePresetBtn');
  await expect(page.locator('#saveName')).toHaveValue('Noto Sans SC');
  await page.fill('#saveName', '自己的名字');
  await page.evaluate(async () => (await import('./assets/js/ui.js')).renderPresetCards());
  await expect(page.locator('#saveName')).toHaveValue('自己的名字');
  await page.click('#saveCancel');
  await expect(page.locator('#currentPresetName')).toHaveText('Noto Sans SC');
});

test('未保存的当前配置显示同一建议名称，重复编号、换字体和重载均保持一致', async ({ page }) => {
  await open(page);
  const name = 'Noto Serif SC × EB Garamond';
  await create(page, name);
  await page.evaluate(async () => (await import('./assets/js/ui.js')).applyPreset('serif-sc'));
  await editSize(page, 119);
  await expect(page.locator('#currentPresetName')).toHaveText(name + ' (2)');
  await page.click('#savePresetBtn');
  await expect(page.locator('#saveName')).toHaveValue(await page.locator('#currentPresetName').innerText());
  await page.click('#saveCancel');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('composite-font:state:v1') || '{}').preset)).toBe('');
  await page.reload();
  await expect(page.locator('#currentPresetName')).toHaveText(name + ' (2)');
  await page.click('#savePresetBtn'); await page.click('#saveOk');
  await editSize(page, 120);
  await expect(page.locator('#currentPresetName')).toHaveText(name + ' (2)');
});

test('当前配置固定在列表首位，不受筛选影响；取消、新建和重载都保留正确内容', async ({ page }) => {
  await open(page);
  await expect(page.locator('#presetsLabel button')).toHaveCount(0);
  await expect(page.locator('#presetCards > :first-child')).toHaveAttribute('id', 'currentPreset');
  await expect(page.locator('#currentPreset #savePresetBtn')).toBeVisible();
  await expect(page.locator('#updatePresetBtn')).toBeHidden();
  await page.click('#pfBtn');
  await page.click('[data-pf="style:serif"]'); await page.click('[data-pf="src:local"]');
  await expect(page.locator('#presetList [data-preset]')).toHaveCount(0);
  await page.click('#savePresetBtn'); await page.fill('#saveName', '未保存的名称'); await page.click('#saveCancel');
  expect(await saved(page, '未保存的名称')).toBeUndefined();
  await create(page, '当前搭配');
  await expect(page.locator('#currentPresetName')).toHaveText('当前搭配');
  await expect(page.locator('#updatePresetBtn')).toBeVisible();
  await expect(page.locator('#presetList [data-preset]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('composite-font:state:v1') || '{}').preset)).toBe('user:当前搭配');
  await page.reload();
  await expect(page.locator('#currentPresetName')).toHaveText('当前搭配');
  await expect(page.locator('#currentPreset')).toBeVisible();
  await page.click('#presetList [data-pf="clear"]');
  await expect(page.locator('#presetList [data-preset="user:当前搭配"]')).toBeVisible();
});

test('保存修改明确更新原预设，后台重绘保留确认状态；另存始终创建副本', async ({ page }) => {
  await open(page); await create(page, '原搭配');
  await expect(page.locator('#updatePresetBtn')).toBeDisabled();
  const original = await saved(page, '原搭配');
  await editSize(page, 119);
  await expect(page.locator('#updatePresetBtn')).toBeEnabled();
  await expect(page.locator('#currentPresetName')).toHaveText('原搭配');
  await page.click('#updatePresetBtn');
  await expect(page.locator('#updatePresetBtn')).toHaveClass(/armed/);
  expect((await saved(page, '原搭配')).classes.latin.size).toBe(original.classes.latin.size);
  await page.evaluate(async () => (await import('./assets/js/ui.js')).renderPresetCards());
  await expect(page.locator('#updatePresetBtn')).toHaveClass(/armed/);
  await expect(page.locator('#updatePresetBtn')).toBeFocused();
  await page.click('#updatePresetBtn');
  expect((await saved(page, '原搭配')).classes.latin.size).toBe(119);
  await expect(page.locator('#updatePresetBtn')).toBeDisabled();
  await expect(page.locator('#presetList [data-preset]')).toHaveCount(12);
  await editSize(page, 123);
  await create(page, '副本');
  expect((await saved(page, '原搭配')).classes.latin.size).toBe(119);
  expect((await saved(page, '副本')).classes.latin.size).toBe(123);
  await expect(page.locator('#currentPresetName')).toHaveText('副本');
  await expect(page.locator('#presetList [data-preset]')).toHaveCount(13);
});

test('同名另存需要确认覆盖；存储失败不关闭对话框或覆盖已有内容，可重试', async ({ page }) => {
  await open(page); await create(page, '已有搭配');
  const original = await saved(page, '已有搭配');
  await editSize(page, 119);
  await page.click('#savePresetBtn'); await page.fill('#saveName', '已有搭配');
  await expect(page.locator('#saveDup')).toBeVisible();
  await expect(page.locator('#saveOk')).toHaveText('保存修改');
  await page.click('#saveOk');
  expect((await saved(page, '已有搭配')).classes.latin.size).toBe(original.classes.latin.size);
  await expect(page.locator('#saveDlg')).toBeVisible();
  await page.click('#saveOk');
  await expect(page.locator('#saveDlg')).toBeHidden();
  expect((await saved(page, '已有搭配')).classes.latin.size).toBe(119);
  await editSize(page, 123);
  await page.click('#savePresetBtn'); await page.fill('#saveName', '重试');
  await page.evaluate(() => {
    window.presetTestSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'composite-font:presets:v1') throw new DOMException('Full', 'QuotaExceededError');
      return window.presetTestSetItem.call(this, key, value);
    };
  });
  await page.click('#saveOk');
  await expect(page.locator('#saveDlg')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('无法保存');
  expect(await saved(page, '重试')).toBeUndefined();
  expect((await saved(page, '已有搭配')).classes.latin.size).toBe(119);
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).state.classes.latin.size)).toBe(123);
  await page.evaluate(() => { Storage.prototype.setItem = window.presetTestSetItem; });
  await page.click('#saveOk');
  await expect(page.locator('#saveDlg')).toBeHidden();
  expect((await saved(page, '重试')).classes.latin.size).toBe(123);
});

test('更新预设后撤销编辑，切换预设仍提醒当前与已存版本不同', async ({ page }) => {
  await open(page); await create(page, '可更新');
  await expect.poll(() => page.evaluate(async () => { const c = await import('./assets/js/core.js'); return JSON.parse(c.hist.list[c.hist.i]).preset; })).toBe('user:可更新');
  await editSize(page, 119);
  await expect.poll(() => page.evaluate(async () => { const c = await import('./assets/js/core.js'); return JSON.parse(c.hist.list[c.hist.i]).classes.latin.size; })).toBe(119);
  await page.click('#updatePresetBtn'); await page.click('#updatePresetBtn');
  await expect.poll(() => page.evaluate(async () => { const c = await import('./assets/js/core.js'); return JSON.parse(c.hist.list[c.hist.i]).presetBase === c.state.presetBase; })).toBe(true);
  for (let i = 0; i < 4; i++) {
    const size = await page.evaluate(async () => (await import('./assets/js/core.js')).state.classes.latin.size);
    if (size !== 119) break;
    await page.click('#undoBtn');
  }
  expect((await saved(page, '可更新')).classes.latin.size).toBe(119);
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).state.classes.latin.size)).not.toBe(119);
  await page.click('#presetList [data-preset="sans-sc"]');
  await expect(page.locator('#saveDlg')).toBeVisible();
  await expect(page.locator('#saveDiscard')).toBeVisible();
  await page.click('#saveCancel');
  await expect(page.locator('#currentPresetName')).toHaveText('可更新');
});
