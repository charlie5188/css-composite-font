const { test, expect } = require('@playwright/test');
const { open } = require('./helpers');
const proof = page => page.locator('#proofText');
const customTabs = page => page.locator('#sampleTabs .ctab [data-sample]');
const text = page => proof(page).textContent();
const caret = page => page.evaluate(() => {
  const el = document.querySelector('#proofText'), selection = getSelection(), range = document.createRange();
  range.selectNodeContents(el); range.setEnd(selection.focusNode, selection.focusOffset); return range.toString().length;
});
async function fixture(page) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType:'text/css', body:"@font-face { font-family:'ProofFixture'; src:url('/tests/fixtures/Jost%5Bwght%5D.ttf'); }" }));
  await open(page);
}

test('直接编辑校样：首次修改创建自定义页签，后续修改同一份；切换、刷新和分享保留边界', async ({ page }) => {
  await fixture(page);
  const original = await text(page), before = await page.evaluate(async () => (await import('./assets/js/core.js')).presetSnap());
  await expect(proof(page)).toHaveAttribute('role','textbox'); await expect(proof(page)).toHaveAttribute('aria-multiline','true');
  await proof(page).fill('自定义 A国123');
  await expect(customTabs(page)).toHaveCount(1); await expect(customTabs(page)).toHaveAttribute('aria-selected','true');
  await proof(page).press('End'); await proof(page).pressSequentially(' edited');
  await expect(customTabs(page)).toHaveCount(1); expect(await text(page)).toBe('自定义 A国123 edited');
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).presetSnap())).toEqual(before);
  await page.locator('#sampleTabs [data-sample="zh"]').click(); expect(await text(page)).toBe(original);
  await customTabs(page).click(); expect(await text(page)).toBe('自定义 A国123 edited');
  await expect(proof(page)).toBeFocused();
  await page.locator('#sampleTabs [data-act="addcustom"]').click();
  await proof(page).fill('第二份文本'); await expect(customTabs(page)).toHaveCount(2);
  await page.locator('#sampleTabs [data-sample="c0"]').click(); expect(await text(page)).toBe('自定义 A国123 edited');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('composite-font:state:v1'))?.view.customs.length || 0)).toBe(2);
  const shared = await page.evaluate(async () => JSON.stringify((await import('./assets/js/share.js')).shareSnapshot()));
  expect(shared).not.toContain('自定义 A国'); expect(shared).not.toContain('第二份文本');
  await page.reload(); await expect(proof(page)).toHaveText('自定义 A国123 edited'); await expect(customTabs(page)).toHaveCount(2);
  await page.locator('#sampleTabs [data-act="delcustom"][data-i="0"]').click();
  await expect(proof(page)).toHaveText('第二份文本'); await expect(customTabs(page)).toHaveCount(1);
});

test('编辑保留光标、真实基线、换行与纯文本粘贴；文字撤销不撤销字体配置', async ({ page }) => {
  await fixture(page);
  await page.evaluate(async () => { const c=await import('./assets/js/core.js'), r=await import('./assets/js/render.js'); c.state.classes.latin.shift=-7; r.renderPreview(); });
  await proof(page).fill('A国B𠮷');
  await proof(page).press('Home'); await proof(page).press('ArrowRight'); await proof(page).pressSequentially('字');
  expect(await text(page)).toBe('A字国B𠮷'); expect(await caret(page)).toBe(2);
  await page.evaluate(async () => (await import('./assets/js/render.js')).renderPreview());
  expect(await caret(page)).toBe(2); await expect(proof(page).locator('.r')).not.toHaveCount(0);
  await proof(page).press('Control+z'); expect(await text(page)).toBe('A国B𠮷');
  await proof(page).press('Control+Shift+z'); expect(await text(page)).toBe('A字国B𠮷');
  expect(await page.evaluate(async () => (await import('./assets/js/core.js')).state.classes.latin.shift)).toBe(-7);
  await proof(page).fill(''); await proof(page).press('Enter'); await proof(page).press('Enter'); await proof(page).pressSequentially('末行');
  expect(await text(page)).toBe('\n\n末行');
  await proof(page).evaluate(el => { const data=new DataTransfer(); data.setData('text/plain','<img src=x onerror=alert(1)>\n纯文本'); data.setData('text/html','<img src=x onerror=alert(1)>'); el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true})); });
  expect(await text(page)).toBe('\n\n末行<img src=x onerror=alert(1)>\n纯文本'); await expect(proof(page).locator('img')).toHaveCount(0);
  await expect(customTabs(page)).toHaveCount(1);
});

test('输入法合成不被后台重绘打断；手机深色竖排与四语言继续直接编辑', async ({ page }) => {
  await fixture(page);
  await proof(page).focus();
  await proof(page).evaluate(el => { el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})); el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})); });
  await expect(customTabs(page)).toHaveCount(0); // Cancelling composition is not an edit.
  await proof(page).evaluate(async el => {
    el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})); el.textContent='正在拼音';
    el.dispatchEvent(new InputEvent('input',{isComposing:true,bubbles:true}));
    await (await import('./assets/js/render.js')).renderPreview();
  });
  await expect(proof(page)).toHaveText('正在拼音'); await expect(customTabs(page)).toHaveCount(0);
  await proof(page).evaluate(el => { el.textContent='汉字完成'; el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})); });
  await expect(customTabs(page)).toHaveCount(1); await expect(proof(page)).toHaveText('汉字完成');
  for (const language of ['tw','ja','en','zh']) {
    await page.evaluate(async language => { const i=await import('./assets/js/i18n.js'), u=await import('./assets/js/ui.js'); i.setUI(language); u.applyUI(); },language);
    await expect(proof(page)).toHaveAttribute('aria-label',/\S/); await expect(customTabs(page)).toHaveCount(1);
  }
  await page.setViewportSize({width:390,height:844}); await page.emulateMedia({colorScheme:'dark'});
  await page.locator('#mTabs [data-mv="preview"]').click();
  await expect(customTabs(page)).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.querySelector('#sampleTabs [aria-selected="true"]').closest('.ctab').getBoundingClientRect().right <= document.querySelector('#sampleTabs .tab-add').getBoundingClientRect().left)).toBe(true);
  await page.evaluate(async () => { const c=await import('./assets/js/core.js'), r=await import('./assets/js/render.js'); c.state.view.vertical=true; r.renderPreview(); });
  await proof(page).fill('竖排\nABC 123'); await proof(page).press('End'); await proof(page).pressSequentially('甲');
  expect(await text(page)).toBe('竖排\nABC 123甲'); await expect(proof(page)).toHaveCSS('writing-mode','vertical-rl');
  await expect(customTabs(page)).toHaveCount(1);
});
