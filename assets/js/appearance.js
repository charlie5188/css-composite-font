import { $, lsGet, lsSet, root } from './i18n.js';

/* Appearance is a browser-local preference, separate from font configuration, presets, sharing, exports and undo history. */
const LS_APPEARANCE = 'composite-font:appearance:v1';
const DEFAULT = { theme: 'system', background: null, text: null };
let appearance = { ...DEFAULT }, repaint = () => {};
const color = value => {
  const hex = typeof value === 'string' ? value.trim().replace(/^#/, '') : '';
  return /^[\da-f]{6}$/i.test(hex) ? '#' + hex.toLowerCase() : /^[\da-f]{3}$/i.test(hex) ? '#' + [...hex].map(c => c + c).join('').toLowerCase() : null;
};
const read = () => {
  const saved = lsGet(LS_APPEARANCE);
  return { theme: ['system', 'light', 'dark'].includes(saved?.theme) ? saved.theme : 'system', background: color(saved?.background), text: color(saved?.text) };
};
function syncControls() {
  $('#appearanceTheme').value = appearance.theme;
  const css = getComputedStyle(root);
  for (const [key, token] of [['background', '--sheet'], ['text', '--ink']]) {
    const value = appearance[key] || css.getPropertyValue(token).trim();
    const swatch = $(`[data-appearance-color="${key}"]`), hex = $(`[data-appearance-hex="${key}"]`);
    swatch.value = value;
    if (document.activeElement !== hex) hex.value = value.toUpperCase();
  }
  $('#appearanceReset').disabled = !appearance.background && !appearance.text;
}
function apply() {
  if (appearance.theme === 'system') delete root.dataset.theme; else root.dataset.theme = appearance.theme;
  for (const [key, token] of [['background', '--proof-bg'], ['text', '--proof-ink']]) {
    if (appearance[key]) root.style.setProperty(token, appearance[key]); else root.style.removeProperty(token);
  }
  syncControls(); repaint();
}
function update(next) {
  Object.assign(appearance, next); lsSet(LS_APPEARANCE, appearance); apply();
}
export function initAppearance(onChange) {
  let frame;
  repaint = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(onChange); };
  appearance = read(); apply();
  $('#appearanceTheme').addEventListener('change', e => update({ theme: e.target.value }));
  for (const swatch of document.querySelectorAll('[data-appearance-color]')) swatch.addEventListener('input', () => update({ [swatch.dataset.appearanceColor]: color(swatch.value) }));
  for (const hex of document.querySelectorAll('[data-appearance-hex]')) {
    hex.addEventListener('input', () => { const value = color(hex.value); if (value) update({ [hex.dataset.appearanceHex]: value }); });
    hex.addEventListener('blur', () => {
      // As with numeric fields, leave typing alone; restore an invalid draft to the last valid value on blur.
      const swatch = $(`[data-appearance-color="${hex.dataset.appearanceHex}"]`);
      hex.value = swatch.value.toUpperCase();
    });
    hex.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); hex.blur(); } });
  }
  $('#appearanceReset').addEventListener('click', () => update({ background: null, text: null }));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
  window.addEventListener('storage', e => { if (e.key === LS_APPEARANCE || e.key === null) { appearance = read(); apply(); } });
}
