// 每个测试都从干净的状态打开页面：清空浏览器里存的设置
async function open(page) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('cf-test')) { localStorage.clear(); sessionStorage.setItem('cf-test', '1'); } });
  await page.goto('/index.html');
  await page.waitForFunction(() => document.querySelectorAll('.pcard[data-preset]').length > 5);
}
const pick = (page, id) => page.evaluate(id => document.querySelector(`.pcard[data-preset="${id}"]`).click(), id);
module.exports = { open, pick };
