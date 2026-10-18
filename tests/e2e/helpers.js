// Open each test with clean state by clearing saved browser settings.
async function open(page) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('cf-test')) { localStorage.clear(); sessionStorage.setItem('cf-test', '1'); } });
  await page.goto('index.html');
  await page.waitForFunction(() => document.querySelectorAll('.pcard[data-preset]').length > 5);
}
const pick = (page, id) => page.evaluate(id => document.querySelector(`.pcard[data-preset="${id}"]`).click(), id);
// Open the export dialog.
async function showExport(page) {
  if (!await page.evaluate(() => document.querySelector('#exDlg').open)) await page.click('#exToggle');
}
// Switch UI language from the global settings menu.
async function setLang(page, l) {
  await page.click('#moreBtn');
  await page.click(`#moreMenu [data-ui-lang="${l}"]`);
}
module.exports = { open, pick, showExport, setLang };
