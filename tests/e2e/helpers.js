// Open each test with clean state by clearing saved browser settings.
async function open(page) {
  // Tests opt into fixture FontData explicitly; never enumerate fonts on the host running the suite.
  await page.addInitScript(() => { if (typeof window.queryLocalFonts === 'function' && window.queryLocalFonts.toString().includes('[native code]')) Object.defineProperty(window, 'queryLocalFonts', { value: undefined, configurable: true, writable: true }); });
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
