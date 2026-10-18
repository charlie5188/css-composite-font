// Compare each preset's exported CSS and JS with snapshots. Google Fonts URLs may change, so replace them with placeholders first.
// For intentional preset or export changes, update snapshots with npx playwright test --update-snapshots.
const { test, expect } = require('@playwright/test');
const { open, pick, showExport } = require('./helpers');

const norm = s => s.replace(/url\([^)]*\)/g, 'url(…)');
/* Fonts and line metrics load and measure incrementally, updating output several times. Wait for 1.5 seconds of stable output before comparing. */
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
  const ids = await page.evaluate(() => [...document.querySelectorAll('.pcard[data-preset]')].map(b => b.dataset.preset).filter(id => !id.startsWith('mac') && !id.startsWith('user:')));      // macOS presets depend on local fonts unavailable in CI.
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
