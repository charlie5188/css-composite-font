// 每个预设导出的 CSS 和 JS 跟快照比较。Google Fonts 的文件地址会变，比较前换成占位符。
// 预设或导出逻辑有意改动时，用 npx playwright test --update-snapshots 更新快照
const { test, expect } = require('@playwright/test');
const { open, pick, showExport } = require('./helpers');

const norm = s => s.replace(/url\([^)]*\)/g, 'url(…)');
/* 字体和行高度量是陆续加载、测量的，输出会更新几次：等它连续 1.5 秒不变再比较 */
async function settled(page) {
  let prev = '', same = 0;
  for (let i = 0; i < 60 && same < 3; i++) {
    await page.waitForTimeout(500);
    const cur = await page.textContent('#codeOut');
    same = cur === prev && cur.includes('@font-face') && !/加载中|正在/.test(cur) ? same + 1 : 0;
    prev = cur;
  }
  return prev;
}

test('每个预设的 CSS / JS 输出不变', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  const ids = await page.evaluate(() => [...document.querySelectorAll('.pcard[data-preset]')].map(b => b.dataset.preset).filter(id => !id.startsWith('mac') && !id.startsWith('user:')));      // macOS 预设依赖本机字体，CI 上没有
  expect(ids.length).toBeGreaterThan(5);
  await showExport(page);
  for (const id of ids) {
    await pick(page, id);
    await page.click('#kindCss'); await page.click('#tabCss');
    const css = norm(await settled(page));
    await page.click('#tabJs');
    const js = norm(await page.textContent('#codeOut'));
    expect(css + '\n/* ---- JS ---- */\n' + js).toMatchSnapshot(`${id}.txt`);
  }
});
