const { test, expect } = require('@playwright/test');
const { open, pick, setLang } = require('./helpers');
const config = page => page.evaluate(async () => (await import('./assets/js/share.js')).shareSnapshot());
const createLink = page => page.evaluate(async () => (await import('./assets/js/share.js')).shareLink());

test.beforeEach(async ({ page }) => { await page.route('https://fonts.googleapis.com/**', route => route.abort()); });

test('分享当前未保存配置，排除私有正文、预设库和历史；接收方还原并能撤销导入', async ({ page, context }) => {
  await open(page);
  await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.classes.latin.size = 123.5; c.state.classes.latin.shift = 3;
    c.state.wOver[700] = { latin: { size: 126, weight: 540 } };
    c.state.classes.digit = { follow: null, font: c.G('Inter', 450), size: 102, shift: 2, vary: { opsz: 'auto' } };
    c.state.custom = [{ chars: 'ABC', follow: 'latin', font: null, size: 121, shift: null }];
    c.state.moved['shared.quotes'] = true; c.state.typo.autospace = 'no-autospace';
    c.state.name = 'Shared 未保存'; c.state.view.sample = 'c0'; c.state.view.customs = [{ text: 'PRIVATE SENDER PROOF', lang: 'en' }];
    c.state.view.text = 'PRIVATE SENDER PROOF'; c.state.preset = 'user:PRIVATE PRESET'; c.state.presetBase = 'PRIVATE SNAPSHOT';
    u.changed({ fonts: true });
  });
  const expected = await config(page), link = await createLink(page);
  const decoded = await page.evaluate(async link => {
    const sh = await import('./assets/js/share.js'), m = /#share=1([dj])\.(.+)/.exec(link);
    return JSON.stringify(await sh.decodeConfig(m[2], m[1]));
  }, link);
  for (const secret of ['PRIVATE SENDER PROOF', 'PRIVATE PRESET', 'PRIVATE SNAPSHOT', 'presetBase', 'customs']) expect(decoded).not.toContain(secret);
  expect(expected.classes.latin.size).toBe(123.5);
  const receiver = await context.newPage();
  await open(receiver);
  // The sender can still persist a draft into shared storage; establish the recipient fixture without opening an unrelated preset-save prompt.
  await receiver.evaluate(async () => (await import('./assets/js/ui.js')).applyPreset('gothic-jp'));
  await receiver.evaluate(async () => {
    const c = await import('./assets/js/core.js');
    c.state.view.customs = [{ text: 'RECIPIENT OWN PROOF', lang: 'en' }]; c.recordHistory(); c.saveState();
  });
  const before = await config(receiver);
  await receiver.goto(link);
  await expect(receiver.locator('#toast')).toContainText('已载入分享配置');
  expect(await config(receiver)).toEqual(expected);
  await expect(receiver.locator('#exDlg')).not.toBeVisible();
  await expect(receiver.locator('#ltabFonts')).toHaveAttribute('aria-selected', 'true');
  expect(new URL(receiver.url()).hash).toBe('');
  expect(await receiver.evaluate(async () => (await import('./assets/js/core.js')).state.view.customs[0].text)).toBe('RECIPIENT OWN PROOF');
  await receiver.click('#undoBtn');
  const restored = await config(receiver); delete restored.view; delete before.view;
  expect(restored).toEqual(before);
  await receiver.close();
});

test('分享按钮直接复制；剪贴板被拒绝时可以手动复制并保留焦点', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await page.click('#shareBtn');
  await expect(page.locator('#toast')).toHaveText('分享链接已复制');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(link).hash).toMatch(/^#share=1[dj]\./);
  await expect(page.locator('#shareDlg')).not.toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async () => { throw new Error('denied'); }, writeText: async () => { throw new Error('denied'); } } });
  });
  await page.click('#shareBtn');
  await expect(page.locator('#shareDlg')).toBeVisible();
  await expect(page.locator('#shareUrl')).toHaveValue(link);
  await expect(page.locator('#shareUrl')).toBeFocused();
  await page.click('#shareCopy');
  await expect(page.locator('#toast')).toContainText('请手动复制');
  await expect(page.locator('#shareUrl')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.locator('#shareBtn')).toBeEnabled();
});

test('没有压缩 API 时仍可还原；文件只分享元数据，导入后明确提示补齐', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(async () => {
    const c = await import('./assets/js/core.js'), u = await import('./assets/js/ui.js');
    c.state.classes.latin.font = { kind: 'file', fileId: 'missing-file', fileName: 'SharedFont.ttf', axis: [100, 900], weight: 450, italic: { fileId: 'missing-italic', fileName: 'SharedFont-Italic.ttf' } };
    c.files.set('missing-file', { buffer: new Uint8Array([1, 2, 3]).buffer, name: 'BINARY_NOT_IN_LINK' });
    u.changed({ fonts: true });
    window.CompressionStream = undefined;
    return (await import('./assets/js/share.js')).shareSnapshot();
  });
  const link = await createLink(page); expect(link).toContain('#share=1j.');
  await page.reload(); // The recipient does not have the sender's in-memory font binaries.
  await page.goto(link);
  await expect(page.locator('#toast')).toContainText('缺失字体');
  expect(await config(page)).toEqual(before);
  await expect(page.locator('#classRows [data-id="latin"] .ct-err')).toContainText('需要重新上传');
});

test('无效、过大、循环跟随、伪造样本键与未知版本不替换当前设置，也不执行链接中的文字', async ({ page }) => {
  await open(page);
  const before = await config(page);
  for (const kind of ['broken', 'future', 'cycle', 'sample', 'prototype', 'bomb', 'range']) {
    const hash = await page.evaluate(async kind => {
      const sh = await import('./assets/js/share.js'), c = await import('./assets/js/core.js');
      if (kind === 'broken') return '#share=1d.broken';
      if (kind === 'future') return '#share=9d.test';
      const s = sh.shareSnapshot();
      if (kind === 'cycle') { s.classes.latin.follow = 'digit'; s.classes.digit.follow = 'latin'; }
      if (kind === 'sample') s.view.sample = '__proto__';
      if (kind === 'prototype') s.classes.latin.font = { kind: 'google', family: '<img src=x onerror="window.SHARE_XSS=1">', weight: 400 };
      if (kind === 'range') s.classes.latin.size = '100; color:red';
      const payload = kind === 'bomb' ? 'x'.repeat(300000) : JSON.stringify(s);
      const bytes = kind === 'bomb' ? new Uint8Array(await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()) : new TextEncoder().encode(payload);
      return '#share=1' + (kind === 'bomb' ? 'd' : 'j') + '.' + sh.b64u(bytes);
    }, kind);
    await page.evaluate(hash => { location.hash = hash; }, hash);
    if (['sample', 'prototype'].includes(kind)) {
      await expect(page.locator('#toast')).toContainText('已载入分享配置');
      expect(await page.evaluate(() => window.SHARE_XSS)).toBeUndefined();
      await page.click('#undoBtn');
    } else await expect(page.locator('#toast')).toHaveText('无法读取分享配置，已保留原设置');
    const after = await config(page); delete after.view;
    const settings = { ...before }; delete settings.view;
    expect(after).toEqual(settings);
  }
  const sparse = await page.evaluate(async () => {
    const sh = await import('./assets/js/share.js'), c = await import('./assets/js/core.js');
    const s = sh.shareSnapshot(); delete s.typo.autospace;
    c.state.typo.autospace = 'no-autospace'; c.state.typo.wrap = 'balance';
    return sh.shareLink(s);
  });
  await page.goto(sparse);
  await expect(page.locator('#toast')).toContainText('已载入分享配置');
  const typo = await page.evaluate(async () => (await import('./assets/js/core.js')).state.typo);
  expect(typo.autospace).toBe(before.typo.autospace);
  expect(typo.wrap).toBe('balance');
});

test('旧的 #cfg 链接仍用于字体导出，新分享链接保持部署目录前缀', async ({ page }) => {
  await open(page);
  const link = await page.evaluate(async () => {
    const b = await import('./assets/js/bake.js');
    return b.cfgLink();
  });
  expect(link).toContain('#cfg=');
  await page.goto('/' + new URL(link).hash);
  await expect(page.locator('#toast')).toHaveText('已载入带过来的设置');
  await expect(page.locator('#exDlg')).toBeVisible();
  const prefixed = await page.evaluate(async () => {
    const { shareLink } = await import('./assets/js/share.js');
    history.replaceState(null, '', '/css-composite-font/?unused=1#old');
    return shareLink();
  });
  expect(new URL(prefixed).pathname).toBe('/css-composite-font/');
  expect(new URL(prefixed).search).toBe('');
});

test('手机打开分享直接预览，切回编辑后可继续修改，四语言入口均在导出之前', async ({ page }) => {
  await open(page); await pick(page, 'gothic-jp');
  const link = await createLink(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(link);
  await expect(page.locator('.app')).toHaveAttribute('data-mview', 'preview');
  await expect(page.locator('.tester')).toBeVisible();
  await page.locator('#mTabs [data-mv="edit"]').click();
  await expect(page.locator('#paneFonts')).toBeVisible();
  for (const lang of ['zh', 'tw', 'ja', 'en']) {
    await setLang(page, lang);
    const layout = await page.evaluate(() => {
      const share = document.querySelector('#shareBtn').getBoundingClientRect(), exp = document.querySelector('#exToggle').getBoundingClientRect();
      return { label: document.querySelector('#shareBtn').textContent, left: share.left, right: share.right, exportLeft: exp.left, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(layout.label).toBe({ zh: '分享', tw: '分享', ja: '共有', en: 'Share' }[lang]);
    expect(layout.left).toBeGreaterThanOrEqual(0); expect(layout.right).toBeLessThanOrEqual(layout.exportLeft); expect(layout.overflow).toBe(false);
  }
});
