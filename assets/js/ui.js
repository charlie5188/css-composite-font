import { refresh } from './refresh.js';
import { catalogOrder, filterCatalog } from './font-catalog.js';
import { importFontFile, importedFonts, rememberImportedFont } from './font-files.js';
import { initShare } from './share.js';
import { initAppearance } from './appearance.js';
import { FIT_SAMPLES, chooseFits, createFitter } from './autofit.js';
import { $, LS_UI, T, UI, debounce, esc, lsSet, root, round, setUI, tr } from './i18n.js';
import { CLASSES, CLS, classOf, inRanges, parseChars, rebuildClassRanges } from './unicode.js';
import { BASE_W, ENGINE, tSvg, G, GF_LIST, L, LOCAL_COMMON, LS_PRESETS, PRESETS, SAMPLES, TYPO, WEIGHTS, isViewTypo, WORD_RE, autoLocal, defaultFontWeight, axisLabel, axisOf, defaultPresetId, extraAxes, fileAxes, files, fontAtWeight, fontKey, gfWeights, freshClasses, guessPath, inheritedSize, isFontTypo, italOf, italicLocal, localAlt, normalizeState, previewWeight, constrainPreviewWeight, objByKey, ownerOf, ownFontAt, ownSize, presetDirty, presetSnap, rebuild, fileStyle, styleOfFont, canRedo, canUndo, hist, histSnap, recordHistory, stepHistory, rebuildNow, refreshCustomRanges, resolveCls, resolveCustom, saveState, setBusy, setFontAxes, setSizeAt, setState, source, sources, srcError, state, stateFromPreset, stepSpan, typoDef, typoSupported, uncoveredWeights, userPresets, vfAxis, vfAxisNow, vfCache } from './core.js';
import { PUNCT_CENTER, REGION_OF_LANG, formsOf, keyName, shortName, wKeys, wRowAdjusted, drawSpecimen, fitGlyphs, markPreviewRow, renderClassRows, missTipAt, orderedSamples, punctPos, refreshInherited, refreshVAutospace, renderEaMarks, renderEditor, renderGroups, renderLangOptions, renderNumHint, renderPreview, renderSampleTabs, specShown, syncLeftTab, syncPreviewWeight, syncToolbar, syncWeightRange, tabFade } from './render.js';
import { initFontTab } from './bake.js';
import { appFileName, cssFamilyName, exKind, exTab, lastExport, renderExport, setExKind, setExTab, showExport } from './export.js';
/* ================= Interaction: character-class table ================= */
export function targetOf(row) { return row.dataset.id ? { type: 'class', id: row.dataset.id } : { type: 'custom', i: +row.dataset.ci }; }
export const keyOf = t => t.type === 'class' ? t.id : '#' + t.i;
export const objOf = t => t.type === 'class' ? state.classes[t.id] : state.custom[t.i];
export const resolvedOf = t => t.type === 'class' ? resolveCls(t.id) : resolveCustom(state.custom[t.i]);
export function changed({ fonts = false, editor = true, fontChange = false } = {}) {
  const notice = fontChange ? trimExportWeights() : '';
  const previewChanged = constrainPreviewWeight();
  syncPreviewWeight();
  refreshCustomRanges();
  if (editor) renderEditor(); else refreshInherited();
  renderPreview();
  if (fonts || previewChanged) rebuild(); else { drawSpecimen(); renderExport(); }
  markCustomPreset();
  saveState();
  if (notice) { refresh('toolbar', 'export', 'fxFields'); toast(notice); }
  return notice;
}
/* Check only when the user commits a font/follow change, never during ordinary refresh, background loading or undo.
   Manually rechecked weights and wider families therefore stay selected; unknown loading-time ranges remain untouched. */
function trimExportWeights() {
  if (state.wmode === 'cont') return '';
  const notices = [], empty = [];
  let removed = false;
  for (const [obj, key, label] of [[state, 'weightsPrunedWeb', T('kindCss')], [state.fx, 'weightsPrunedFiles', T('kindFont')]]) {
    if (!obj?.weights?.length) continue;
    const outside = uncoveredWeights(obj.weights);
    if (!outside.length) continue;
    if (outside.length === obj.weights.length) { empty.push(label); continue; }
    obj.weights = obj.weights.filter(W => !outside.includes(W));
    notices.push(T(key, { weights: outside.join(T('joiner')) })); removed = true;
  }
  if (empty.length) notices.push(T('weightsPrunedEmpty', { kinds: empty.join(T('joiner')) }));
  if (removed) notices.push(T('weightsPrunedUndo'));
  return notices.join(' ');
}
export function markCustomPreset() {
  if (state.preset && !String(state.preset).startsWith('user:')) { state.preset = ''; renderPresetCards(); }
  else renderCurrentPreset();
}
export const LIMITS = { size: [20, 300], shift: [-60, 60] };
/* Write a cell: empty restores inheritance. While commit is false during typing, ignore temporary out-of-range values. */
export function setNum(inp, commit) {
  const t = targetOf(inp.closest('.ct-row')), key = keyOf(t), field = inp.dataset.field, W = BASE_W;
  /* Browsers may expose an empty value while typing an incomplete sign or decimal point; do not mistake it for clearing the field. */
  if (inp.validity.badInput) { if (commit) inp.value = (field === 'size' ? ownSize(key, W) : objOf(t).shift) ?? ''; return; }
  const raw = inp.value.trim();
  let v = raw === '' ? null : parseFloat(raw);
  if (v !== null && !Number.isFinite(v)) { if (commit) inp.value = (field === 'size' ? ownSize(key, W) : objOf(t).shift) ?? ''; return; }
  const [lo, hi] = LIMITS[field];
  if (v !== null && (v < lo || v > hi)) { if (!commit) return; v = Math.min(hi, Math.max(lo, v)); inp.value = v; }
  if (field === 'size') setSizeAt(key, W, v); else objOf(t).shift = v;
  inp.classList.toggle('own', v !== null);
  changed({ fonts: field === 'size', editor: false });
}
$('#editor').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'addCustom') {
    state.custom.push({ chars: '', follow: 'han', font: null, size: null, shift: null });
    changed({ fonts: true });
    const inputs = document.querySelectorAll('#customRows .chars'); inputs[inputs.length - 1]?.focus();
    return;
  }
  const row = b.closest('.ct-row'); if (!row) return;
  if (b.dataset.act === 'remove') { state.custom.splice(targetOf(row).i, 1); changed({ fonts: true }); }
});
$('#editor').addEventListener('change', e => {
  const el = e.target, row = el.closest('.ct-row'); if (!row) return;
  const t = targetOf(row), o = objOf(t);
  if (el.classList.contains('num')) { setNum(el, true); return; }
  if (el.dataset.act === 'fsel') {
    if (el.value === 'pick') { el.value = o.follow || 'own'; openPicker(t); return; }
    recordHistory();
    o.follow = el.value === 'own' ? null : el.value;
    changed({ fonts: true, fontChange: true });
  }
});
$('#editor').addEventListener('input', e => {
  const inp = e.target, row = inp.closest('.ct-row'); if (!row) return;
  if (inp.classList.contains('chars')) { objOf(targetOf(row)).chars = inp.value; changed({ fonts: true, editor: false }); return; }
  if (inp.classList.contains('num')) setNum(inp, false);
});
$('#editor').addEventListener('focusout', e => { if (e.target.matches('input.num,input.mnum,input.mw')) refreshInherited(); });
/* Share stepping between mouse and keyboard. Start from inherited values and preserve arbitrary typed numbers rather than snapping to step multiples. */
function stepCell(inp, up, large) {
  const current = +(inp.value || inp.placeholder);
  let next;
  if (inp.matches('select')) {
    // Move static weights by 100; skip missing steps to the next actual available weight.
    const weights = [...inp.options].map(o => +o.value);
    next = up ? weights.find(w => w >= current + 100) : weights.reverse().find(w => w <= current - 100);
  } else {
    const delta = +inp.step * (large ? 10 : 1) * (up ? 1 : -1);
    next = Math.min(+inp.max, Math.max(+inp.min, Math.round((current + delta) * 1000) / 1000));
  }
  if (next == null || next === current) return false;
  inp.value = next;
  return true;
}
/* Keep input focus when clicking arrows so blur commits do not rebuild other cells; do not prematurely store placeholders as explicit values. */
$('#editor').addEventListener('pointerdown', e => { if (e.target.closest('[data-step]')) e.preventDefault(); });
$('#editor').addEventListener('click', e => {
  const b = e.target.closest('[data-step]'); if (!b) return;
  const inp = b.closest('.cell-step').querySelector('input,select');
  if (inp.dataset.w) previewSoft(+inp.dataset.w);
  if (!stepCell(inp, b.dataset.step === 'up', false)) return;
  if (inp.classList.contains('num')) setNum(inp, true);
  else if (inp.classList.contains('mnum')) setMatrixSize(inp, true);
  else setWeightAt(inp.dataset.k, +inp.dataset.w, inp);
});
$('#editor').addEventListener('keydown', e => {
  const inp = e.target;
  if (!inp.classList?.contains('num') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  if (stepCell(inp, e.key === 'ArrowUp', e.shiftKey)) setNum(inp, true);
});
/* ================= Interaction: weights ================= */
export const keyTarget = k => k[0] === '#' ? { type: 'custom', i: +k.slice(1) } : { type: 'class', id: k };
export const stepOf = w => Math.min(900, Math.max(100, Math.round((w - 1) / 100) * 100));      // Map a continuous value to its step, consistently with stepSpan.
/* Prune empty overrides to avoid false preset-modified indicators. */
export function pruneOv(W, k) {
  if (state.wOver[W]?.[k] && !Object.keys(state.wOver[W][k]).length) delete state.wOver[W][k];
  if (state.wOver[W] && !Object.keys(state.wOver[W]).length) delete state.wOver[W];
}
/* Set per-step weight: arbitrary for variable fonts, a fixed Google step for static fonts. At 400 edit the base font; for replacements edit that font. */
export function setWeightAt(k, W, el) {
  const o = objByKey(k), withW = (f, v) => f.kind === 'google' ? G(f.family, v) : { ...f, weight: v };
  const raw = el.value.trim();
  let v = el.dataset.act === 'wnum' ? (raw === '' ? null : Math.min(+el.max, Math.max(+el.min, Math.round(+raw)))) : +el.value || null;
  if (el.dataset.auto && v === +el.dataset.auto) v = null;      // Choosing the derived step clears the explicit override.
  if (W === BASE_W) { if (v != null) o.font = withW(o.font, v); }
  else {
    const ov = ((state.wOver[W] ||= {})[k] ||= {});
    if (ov.font) { if (v != null) ov.font = withW(ov.font, v); }
    else if (v == null) delete ov.weight; else ov.weight = v;
    pruneOv(W, k);
  }
  renderClassRows();      // The followed-font label's weight may change. Update matrix cells in place, preserving focus for repeated arrow adjustments.
  changed({ fonts: true, editor: false });
}
export function setMatrixSize(inp, commit) {
  const k = inp.dataset.k, W = +inp.dataset.w, raw = inp.value.trim();
  if (inp.validity.badInput) { if (commit) inp.value = ownSize(k, W) ?? ''; return; }
  let v = raw === '' ? null : parseFloat(raw);
  if (v !== null && !Number.isFinite(v)) { if (commit) inp.value = ownSize(k, W) ?? ''; return; }
  const [lo, hi] = LIMITS.size;
  if (v !== null && (v < lo || v > hi)) { if (!commit) return; v = Math.min(hi, Math.max(lo, v)); inp.value = v; }
  setSizeAt(k, W, v);
  inp.classList.toggle('own', v !== null && W === BASE_W); inp.classList.toggle('set', v !== null && W !== BASE_W);
  changed({ fonts: true, editor: false });
}
/* Editing a row follows its preview weight; update highlighting only, preserving the table and focus. */
export function previewSoft(W) {
  if (state.wmode === 'cont' && stepOf(state.view.wcont) === W) return;
  setPreviewW(W, { soft: true });
}
/* Preserve incomplete field text while typing. Dragging, sliders and keyboard changes always sync the number, even if its field remains focused. */
export function setPreviewW(x, { soft = false, preserveInput = false } = {}) {
  if (!Number.isFinite(x)) return;
  const v = state.view, cont = state.wmode === 'cont', w = previewWeight(x);
  const changed = w !== (cont ? v.wcont : v.weight);
  if (cont) {
    v.wcont = w; v.weight = stepOf(w);
    root.style.setProperty('--fw', w);
    if (changed) { markPreviewRow(); drawSpecimen(); }
  } else if (changed) {
    v.weight = w;
    if (soft) { markPreviewRow(); rebuild(); } else refresh('editor', 'fonts');
  }
  syncPreviewWeight({ preserveInput });
  if (changed) saveState();
}
/* Stepped export weights: matrix checkboxes and export-dialog buttons edit the same setting. */
export function setWeights(ws) {
  const selected = WEIGHTS.filter(W => ws.includes(W));
  if (!selected.length) return;
  state.weights = selected;
  const changed = constrainPreviewWeight();
  refresh('toolbar', 'editor', 'export', ...(changed ? ['fonts'] : []));
}
/* Continuous export range: the table slider and export dialog share settings; preview stays within the same range. */
export function setWRange(lo, hi) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { renderExport(); return; }
  if (lo > hi) [lo, hi] = [hi, lo];
  lo = Math.min(899, Math.max(100, Math.round(lo))); hi = Math.min(900, Math.max(lo + 1, Math.round(hi)));
  state.wrange = [lo, hi];
  $('#exWLo').value = lo; $('#exWHi').value = hi;
  constrainPreviewWeight();
  refresh('toolbar', 'editor', 'fonts', 'export');
}
/* Move endpoints along weight rows. During dragging update only controls and selection; clamp preview, rebuild fonts and save after commit. */
{
  const range = $('#wRange');
  let drag = null;
  const move = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const rect = range.getBoundingClientRect(), values = [...drag.initial];
    const value = Math.round((100 + (e.clientY - rect.top) / rect.height * 800) / 100) * 100;
    // Do not cross the other endpoint, which may contain a precise value entered in Export.
    values[drag.end] = drag.end ? Math.max(Math.ceil((values[0] + 1) / 100) * 100, Math.min(900, value)) : Math.min(Math.floor((values[1] - 1) / 100) * 100, Math.max(100, value));
    drag.values = values;
    range.dataset.draft = JSON.stringify(values);
    syncWeightRange(values);
  };
  const finish = (e, cancel = false) => {
    if (!drag || e.pointerId != null && e.pointerId !== drag.id) return;
    const { id, values, initial } = drag;
    drag = null;
    delete range.dataset.draft;
    range.classList.remove('dragging');
    if (range.hasPointerCapture(id)) range.releasePointerCapture(id);
    if (!cancel && values.some((v, i) => v !== initial[i])) setWRange(...values);
    else syncWeightRange();
  };
  range.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || drag) return;
    e.preventDefault();
    const rect = range.getBoundingClientRect(), at = 100 + (e.clientY - rect.top) / rect.height * 800;
    const end = e.target.closest('[data-end]')?.dataset.end ?? (Math.abs(at - state.wrange[0]) <= Math.abs(at - state.wrange[1]) ? 0 : 1);
    recordHistory();
    drag = { id: e.pointerId, end: +end, initial: [...state.wrange], values: [...state.wrange] };
    range.querySelector(`[data-end="${end}"]`).focus({ preventScroll: true });
    range.setPointerCapture(e.pointerId);
    range.classList.add('dragging');
    range.dataset.draft = JSON.stringify(drag.values);
    // Clicking the rail moves the nearest endpoint. Pressing a thumb starts dragging without snapping a precisely entered value.
    if (!e.target.closest('[data-end]')) move(e);
  });
  range.addEventListener('pointermove', move);
  range.addEventListener('pointerup', e => finish(e));
  range.addEventListener('pointercancel', e => finish(e, true));
  range.addEventListener('lostpointercapture', e => finish(e, true));
  range.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drag) { e.preventDefault(); finish(e, true); return; }
    const thumb = e.target.closest('[data-end]');
    if (!thumb || drag || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return;
    e.preventDefault();
    const end = +thumb.dataset.end, values = [...state.wrange];
    let value = values[end];
    if (e.key === 'Home') value = +thumb.getAttribute('aria-valuemin');
    else if (e.key === 'End') value = +thumb.getAttribute('aria-valuemax');
    else value += (/Up|Left/.test(e.key) ? -1 : 1) * (e.shiftKey ? 10 : 100);
    values[end] = Math.min(+thumb.getAttribute('aria-valuemax'), Math.max(+thumb.getAttribute('aria-valuemin'), value));
    if (values[end] !== state.wrange[end]) { recordHistory(); setWRange(...values); }
  });
}
$('#wMatrix').addEventListener('click', e => {
  /* Preview from row whitespace and gaps, while leaving control clicks alone; export checkboxes and menus must not select a preview row. */
  const row = e.target.closest('[data-row]');
  if (row && !e.target.closest('button,input,select,textarea,label,a')) {
    const W = +row.dataset.row;
    if (state.wmode === 'cont' ? stepSpan(W) : state.weights.includes(W)) setPreviewW(W);
    return;
  }
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.wreset) {
    const key = b.dataset.wreset, o = objByKey(key), weight = defaultFontWeight(o.font);
    recordHistory();
    // 400 is also a table row. Reset base values too so an auto-fitted class can be fully reset on its own.
    o.size = null; o.shift = null;
    if (!o.follow && weight != null) o.font = { ...o.font, weight };
    // Keep font sources, other variation axes and local-font name mappings shared across classes.
    for (const [W, row] of Object.entries(state.wOver)) if (+W !== BASE_W) {
      delete row[key];
      if (!Object.keys(row).length) delete state.wOver[W];
    }
    changed({ fonts: true });
    toast(T('tWColumnReset', { c: keyName(key) }));
    return;
  }
  if (b.dataset.pw) { const W = +b.dataset.pw; if (state.wmode === 'cont') setPreviewW(W); else setPreviewWeight(W); return; }
  const W = +b.dataset.w;
  if (b.dataset.act === 'wclear') {      // Clear this step's size, weight, replacement font and local-name overrides.
    delete state.wOver[W];
    for (const k of Object.keys(state.weightNames)) if (k.endsWith('|' + W)) delete state.weightNames[k];
    changed({ fonts: true });
    return;
  }
  if (b.dataset.act === 'wpick') openPicker(keyTarget(b.dataset.k), W);
});
$('#wMatrix').addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.wx) {
    const W = +el.dataset.wx, set = new Set(state.weights);
    if (el.checked) set.add(W); else if (set.size > 1) set.delete(W); else { el.checked = true; return; }
    setWeights([...set]);
    return;
  }
  if (el.classList.contains('mnum')) { setMatrixSize(el, true); return; }
  if (el.dataset.act === 'wnum' || el.dataset.act === 'wsel') setWeightAt(el.dataset.k, +el.dataset.w, el);
});
$('#wMatrix').addEventListener('input', e => { if (e.target.classList.contains('mnum')) setMatrixSize(e.target, false); });
/* Arrow keys: size changes by 0.5 (Shift: 5), VF weight by 10 (Shift: 100); static fonts follow available 100-step weights. */
$('#wMatrix').addEventListener('keydown', e => {
  const inp = e.target, up = e.key === 'ArrowUp';
  if (!up && e.key !== 'ArrowDown') return;
  if (inp.matches('.msel') && (e.altKey || e.ctrlKey || e.metaKey)) return; // Preserve native select shortcuts, including opening the menu.
  if (inp.classList?.contains('mnum')) {
    e.preventDefault();
    if (stepCell(inp, up, e.shiftKey)) setMatrixSize(inp, true);
  } else if (inp.matches('.mw,.msel')) {
    e.preventDefault();
    if (stepCell(inp, up, e.shiftKey)) setWeightAt(inp.dataset.k, +inp.dataset.w, inp);
  }
});
/* Destructive actions require two clicks: arm the confirmation label (.armed) on first click and execute on a second click within 3 seconds, otherwise reset.
   Wrap the original label in an element so it can be hidden; a bare text node cannot be hidden independently. */
function disarmConfirm(btn) {
  clearTimeout(btn.armT); btn.classList.remove('armed'); btn.querySelector(':scope > .arm-lab')?.remove();
}
export function armConfirm(btn, text, run) {
  const disarm = () => disarmConfirm(btn);
  if (btn.classList.contains('armed')) { clearTimeout(btn.armT); disarm(); run(); return; }
  const lab = document.createElement('span'); lab.className = 'arm-lab'; lab.textContent = text;
  btn.append(lab); btn.classList.add('armed');
  btn.armT = setTimeout(disarm, 3000);
}
/* Clear per-weight overrides for all weights. */
/* Each weight row's trailing menu can replace its font or reset its settings. */
let wMenuW = 0, wMenuBtn = null;
$('#wMatrix').addEventListener('click', e => {
  const b = e.target.closest('[data-wmenu]'); if (!b) return;
  wMenuW = +b.dataset.wmenu; wMenuBtn = b;
  const keys = wKeys().filter(k => { const o = objByKey(k); return !o.follow && o.font; });
  $('#wRowMenu').innerHTML = keys.map(k => `<button type="button" class="mm-item" role="menuitem" data-wm-pick="${esc(k)}">${esc(T('wMenuPick', { c: keyName(k) }))}</button>`).join('') +
    (wRowAdjusted(wMenuW) ? `<button type="button" class="mm-item" role="menuitem" data-wm-reset>${esc(T('wMenuReset', { w: wMenuW }))}</button>` : '');
}, true);
$('#wRowMenu').addEventListener('toggle', e => {
  if (e.newState !== 'open' || !wMenuBtn) return;
  const m = $('#wRowMenu'), r = wMenuBtn.getBoundingClientRect();      // Align the right edge with the button.
  m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px';
  m.style.top = (r.bottom + 4 + m.offsetHeight > innerHeight ? Math.max(8, r.top - m.offsetHeight - 4) : r.bottom + 4) + 'px';
});
$('#wRowMenu').addEventListener('click', e => {
  const b = e.target.closest('.mm-item'); if (!b) return;
  $('#wRowMenu').hidePopover();
  if (b.dataset.wmPick) openPicker(keyTarget(b.dataset.wmPick), wMenuW);
  else if (b.hasAttribute('data-wm-reset')) {
    delete state.wOver[wMenuW];
    for (const k of Object.keys(state.weightNames)) if (k.endsWith('|' + wMenuW)) delete state.weightNames[k];
    changed({ fonts: true });
    toast(T('tWRowReset', { w: wMenuW }));
  }
});
$('#wReset').addEventListener('click', e => armConfirm(e.currentTarget, T('wResetConfirm'), () => {
  state.wOver = {}; state.weightNames = {};
  changed({ fonts: true });
  toast(T('tWReset'));
}));
/* ================= Undo / redo =================
   Buttons sit at the right of the left-pane tabs. Shortcuts: Command-Z / Shift-Command-Z, or Ctrl-Z / Ctrl-Y on Windows. Inputs retain native text undo. */
export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export function syncHistory() {
  renderCurrentPreset();
  for (const [id, ok, key, keys] of [['undoBtn', canUndo(), 'undo', IS_MAC ? '⌘Z' : 'Ctrl+Z'], ['redoBtn', canRedo(), 'redo', IS_MAC ? '⇧⌘Z' : 'Ctrl+Y']]) {
    const b = $('#' + id); b.setAttribute('aria-disabled', !ok);
    b.dataset.tip = `${T(key)} (${keys})`; b.setAttribute('aria-label', T(key));
  }
}
export function goHistory(d) {
  if (!stepHistory(d)) return;
  refresh('ranges', 'toolbar', 'typoRows', 'editor', 'preview', 'presets', 'fonts', 'export');
}
export function initHistory() {
  hist.onChange = syncHistory;
  recordHistory(); syncHistory();
  $('#undoBtn').addEventListener('click', () => goHistory(-1));
  $('#redoBtn').addEventListener('click', () => goHistory(1));
  document.addEventListener('keydown', e => {
    if (!(IS_MAC ? e.metaKey : e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase(), redo = k === 'z' && e.shiftKey || k === 'y' && !IS_MAC;
    if (k !== 'z' && !redo) return;
    const el = e.target;
    if (el.isContentEditable || el.matches?.('textarea, input:not([type=checkbox]):not([type=radio]):not([type=range]), select')) return;
    if (document.querySelector('dialog[open]')) return;      // Do not undo settings behind an open dialog.
    e.preventDefault(); goHistory(redo ? 1 : -1);
  });
}
/* ================= Hover tooltips =================
   Replace native title tooltips with black/white app tooltips after a 0.35-second hover or keyboard focus; native tooltips take over a second.
   Move title into data-tip on first hover to avoid duplicates, and also adopt titles assigned later.
   Show subsequent tooltips immediately when moving directly between nearby controls. */
export function initTips() {
  const tip = document.createElement('div');
  tip.className = 'tip'; tip.id = 'tip'; tip.setAttribute('popover', 'manual'); tip.setAttribute('role', 'tooltip');
  document.body.append(tip);
  let cur = null, timer = 0, warm = 0;
  const take = el => {
    if (el.hasAttribute('title')) {
      if (el.title) el.dataset.tip = el.title;
      if (!el.hasAttribute('aria-label') && !el.textContent.trim() && el.title) el.setAttribute('aria-label', el.title);
      el.removeAttribute('title');
    }
    return el.dataset.tip || '';
  };
  const find = t => t?.closest?.('[title], [data-tip]') || null;
  const open = () => tip.matches(':popover-open');
  // Loading status can change while hovered. Observe only while a tooltip is pending or visible, avoiding stale status.
  const watch = new MutationObserver(() => {
    if (!cur) return;
    if (!cur.isConnected || !cur.getClientRects().length) { hide(); return; }
    if (open() && take(cur) !== tip.textContent) show(cur);
  });
  const show = el => {
    const text = take(el); if (!text || !el.isConnected || el !== cur) return;
    if (el.dataset.tipUnlessOpen && document.getElementById(el.dataset.tipUnlessOpen)?.matches(':popover-open')) return;
    const host = el.closest('dialog[open]') || document.body;      // Move the tooltip inside an open modal dialog.
    if (tip.parentNode !== host) { if (open()) tip.hidePopover(); host.append(tip); }
    tip.textContent = text;
    if (!open()) tip.showPopover();
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const below = r.bottom + 6 + h <= innerHeight - 4;
    tip.style.top = (below ? r.bottom + 6 : Math.max(4, r.top - h - 6)) + 'px';
    tip.style.left = Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width / 2 - w / 2)) + 'px';
  };
  const hide = () => {
    watch.disconnect(); clearTimeout(timer);
    if (open()) { warm = performance.now() + 500; tip.hidePopover(); }
    cur = null;
  };
  const arm = (el, delay) => {
    hide(); cur = el; take(el);
    watch.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title', 'data-tip', 'class', 'hidden'] });
    timer = setTimeout(() => show(el), performance.now() < warm ? 0 : delay);
  };
  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const el = find(e.target);
    if (el === cur) return;
    if (el) arm(el, 350); else hide();
  });
  document.addEventListener('pointerout', e => { if (cur && !cur.contains(e.relatedTarget)) hide(); });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') hide(); });
  document.addEventListener('focusin', e => { const el = find(e.target); if (el && e.target.matches(':focus-visible')) arm(el, 350); });
  document.addEventListener('focusout', hide);
}
/* ================= Divider between editor and proof =================
   Drag, or focus and press Left/Right, to resize the editor; double-click to restore its default width. Narrow screens show one pane without a divider. */
export const LEFT_MIN = 400, RIGHT_MIN = 420;
export function applySplit() {
  const bench = $('.bench'), sp = $('#split'), w = state.view.leftW;
  if (w) {
    const x = Math.min(Math.max(LEFT_MIN, bench.clientWidth - RIGHT_MIN), Math.max(LEFT_MIN, w));
    bench.style.setProperty('--left-w', x + 'px');
  } else bench.style.removeProperty('--left-w');
  sp.setAttribute('aria-valuemin', LEFT_MIN); sp.setAttribute('aria-valuemax', Math.max(LEFT_MIN, bench.clientWidth - RIGHT_MIN));
  sp.setAttribute('aria-valuenow', Math.round($('#editor').getBoundingClientRect().width));
}
export function initSplit() {
  const sp = $('#split');
  sp.addEventListener('pointerdown', e => {
    e.preventDefault(); sp.setPointerCapture(e.pointerId); document.body.classList.add('splitting');
    const left = $('.bench').getBoundingClientRect().left;
    const move = ev => { state.view.leftW = Math.round(ev.clientX - left); applySplit(); };
    const up = () => {
      sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); sp.removeEventListener('pointercancel', up);
      document.body.classList.remove('splitting'); saveState();
    };
    sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up); sp.addEventListener('pointercancel', up);
  });
  sp.addEventListener('dblclick', () => { delete state.view.leftW; applySplit(); saveState(); });
  sp.addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    state.view.leftW = Math.round($('#editor').getBoundingClientRect().width + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 64 : 16));
    applySplit(); saveState();
  });
  addEventListener('resize', debounce(applySplit, 100));
  applySplit();
}
/* Resize the specimen using its top divider or focused Up/Down keys. Double-click restores font-size-derived height; reserve at least 160px for proof text. */
export function initSpecSplit() {
  const sp = $('#specSplit'), maxH = () => Math.max(120, $('.tester').clientHeight - 160);
  const set = h => { state.view.specH = Math.round(Math.min(maxH(), Math.max(110, h))); drawSpecimen(); };
  sp.addEventListener('pointerdown', e => {
    e.preventDefault(); sp.setPointerCapture(e.pointerId); document.body.classList.add('hsplitting');
    const y0 = e.clientY, h0 = $('#spec').getBoundingClientRect().height;
    const move = ev => set(h0 - (ev.clientY - y0));
    const up = () => { sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); sp.removeEventListener('pointercancel', up); document.body.classList.remove('hsplitting'); saveState(); };
    sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up); sp.addEventListener('pointercancel', up);
  });
  sp.addEventListener('dblclick', () => { delete state.view.specH; drawSpecimen(); saveState(); });
  sp.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault(); set($('#spec').getBoundingClientRect().height + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 64 : 16)); saveState();
  });
}
$('#wMatrix').addEventListener('focusin', e => { const el = e.target; if (el.matches('input[data-w], select[data-w]')) previewSoft(+el.dataset.w); });
/* All info buttons share one popover, populated from data-info when opened. */
export const INFO = {
  classInfo: () => `<p>${esc(T('inheritHint'))}</p><dl>${CLASSES.map(c => `<dt>${esc(tr(c.name))}</dt><dd>${esc(tr(c.desc))}</dd>`).join('')}</dl>`,
  customInfo: () => T('customIntro'),
  metricsInfo: () => `<p>${esc(T('metricsHint'))}</p><p>${esc(T('mixInfo'))}</p><p>${T('refNote')}</p>`,
  typoInfo: () => T('typoFoot') + (ENGINE.name ? `<p>${esc(T('browserNow', { b: `${ENGINE.name} ${ENGINE.v}` }))}</p>` : ''),
  italicInfo: () => T('italicInfo'),
  lmInfo: () => T('lmInfo') + techHtml('ascent-override', LM_SUP, lmSupported()), wmodeInfo: () => T('wmodeInfo'), sizeInfo: () => T('sizeInfo'), shiftInfo: () => T('shiftInfo'),
  nameInfo: () => T('nameInfo'), weightsInfo: () => T('weightsInfo'), wrangeInfo: () => T('wrangeInfo'),
  baseInfo: () => T('baseInfo'), genericInfo: () => T('genericInfo'), scopeInfo: () => T('scopeInfo'),
  otfInfo: () => `<p>${esc(T('fxOtfHint'))}</p>`,
};
export function infoHtml(key) {
  if (key.startsWith('typo:')) {
    const t = TYPO.find(x => x.key === key.slice(5)); if (!t) return '';
    return (t.note ? `<p>${esc(tr(t.note))}</p>` : '') + techHtml(t.attr ? T('langAttr') : t.prop, t.sup, typoSupported(t, state.typo[t.key]));
  }
  return INFO[key] ? INFO[key]() : '';
}
export function placePop(pop, btn) {
  const r = btn?.getBoundingClientRect(); if (!r) return;
  pop.style.left = Math.max(8, Math.min(r.left - 12, innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = (r.bottom + 8 + pop.offsetHeight > innerHeight ? Math.max(8, r.top - pop.offsetHeight - 8) : r.bottom + 8) + 'px';
}
export let infoBtn = null;
document.addEventListener('click', e => {
  const b = e.target.closest('.info'); if (!b) return;
  infoBtn = b; $('#infoPop').dataset.key = b.dataset.info;
  /* Elements outside an open modal dialog are inert. Move the info popover into the triggering button's dialog. */
  const host = b.closest('dialog') || document.body, pop = $('#infoPop');
  if (pop.parentNode !== host) host.append(pop);
}, true);
$('#infoPop').addEventListener('toggle', e => {
  if (e.newState !== 'open') { hovOpen = null; return; }
  const pop = $('#infoPop');
  pop.innerHTML = infoHtml(pop.dataset.key || '');
  placePop(pop, infoBtn);
});
/* Hover opens info directly instead of showing an intermediate tooltip; leaving closes it. Clicking a hover-opened popup pins it open. */
let hovT = 0, hovOpen = null;
const infoOpen = () => $('#infoPop').matches(':popover-open');
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const b = e.target.closest?.('.info');
  if (b) {
    clearTimeout(hovT);
    if (infoOpen() && infoBtn === b) return;
    hovT = setTimeout(() => {
      if (!b.matches(':hover')) return;
      if (infoOpen()) { if (!hovOpen) return; $('#infoPop').hidePopover(); }      // Hover must not replace click-pinned info.
      b.click(); hovOpen = b;
    }, 350);
  } else if (e.target.closest?.('#infoPop')) clearTimeout(hovT);
});
document.addEventListener('pointerout', e => {
  if (e.pointerType !== 'mouse') return;
  const to = e.relatedTarget;
  if (e.target.closest?.('.info') && !hovOpen) { if (!to?.closest?.('.info')) clearTimeout(hovT); return; }      // The pointer left before the popup opened.
  if (!hovOpen || to?.closest?.('#infoPop') || to?.closest?.('.info') === hovOpen) return;
  clearTimeout(hovT);
  hovT = setTimeout(() => { if (hovOpen && !$('#infoPop').matches(':hover') && !hovOpen.matches(':hover')) $('#infoPop').hidePopover(); }, 250);
});
document.addEventListener('click', e => {
  const b = e.target.closest('.info'); if (!b) return;
  clearTimeout(hovT);      // Clicking takes precedence over a pending hover timer.
  if (b === hovOpen && infoOpen()) { e.preventDefault(); hovOpen = null; }      // If hover opened it, prevent the native popovertarget toggle from closing it.
}, true);
export let gearBtn = null;
$('#editor').addEventListener('click', e => {
  const g = e.target.closest('[data-act="groups"]');
  if (g) { gearBtn = g; $('#grpPop').dataset.cls = g.dataset.cls; }      // popovertarget will open the popover next.
}, true);
$('#grpPop').addEventListener('toggle', e => {
  if (e.newState !== 'open') return;
  renderGroups();
  const pop = $('#grpPop'), r = (document.querySelector(`.gear[data-cls="${pop.dataset.cls}"]`) || gearBtn)?.getBoundingClientRect();
  if (!r) return;
  pop.style.left = Math.max(8, Math.min(r.left - 12, innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = (r.bottom + 8 + pop.offsetHeight > innerHeight ? Math.max(8, r.top - pop.offsetHeight - 8) : r.bottom + 8) + 'px';
});
$('#grpPop').addEventListener('click', e => {
  if (e.target.closest('[data-act="gpreset"]')) {
    const id = $('#grpPop').dataset.cls;
    for (const k of Object.keys(state.moved)) if (k.startsWith(id + '.')) delete state.moved[k];
    rebuildClassRanges(); changed({ fonts: true }); renderGroups(); saveState();
    return;
  }
  const sw = e.target.closest('.sw'); if (!sw) return;
  const k = sw.dataset.g, toLatin = sw.getAttribute('aria-checked') === 'true';
  if (toLatin) state.moved[k] = true; else delete state.moved[k];
  rebuildClassRanges();
  changed({ fonts: true });
  renderGroups();
});
export function setPreviewWeight(W) { setPreviewW(W); }

/* ================= Interaction: proof, metrics and export ================= */
export const SUPPORT = { sizeAdjust: typeof FontFace !== 'undefined' && 'sizeAdjust' in FontFace.prototype };
export function initToolbar() {
  $('#gfWeight').innerHTML = WEIGHTS.map(w => `<option value="${w}">${w}</option>`).join('');
  $('#gfList').innerHTML = GF_LIST.map(f => `<option value="${esc(f)}"></option>`).join('');
  $('#lfList').innerHTML = LOCAL_COMMON.map(([n, , os]) => `<option value="${esc(n)}">${os}</option>`).join('');
  $('#sizeAdjustWarn').hidden = SUPPORT.sizeAdjust;

  const v = () => state.view;
  /* Multiple custom sample tabs persist independently. The trailing add button starts one from the current text; switching tabs preserves it, and only delete removes it. */
  const customAt = k => { const m = /^c(\d+)$/.exec(k); return m ? v().customs[+m[1]] : null; };
  const showSample = k => {
    const c = customAt(k);
    if (c) { v().sample = k; v().text = c.text; if (c.lang) state.typo.lang = c.lang; }
    else { v().sample = k; v().text = SAMPLES[k].text; state.typo.lang = SAMPLES[k].lang; }
    refresh('toolbar', 'editor', 'preview', 'export', 'fonts');      // Language changes also update the Zhuyin row and regional checks.
  };
  $('#sampleTabs').addEventListener('click', e => {
    if (e.target.closest('[data-act="addcustom"]')) {
      v().customs.push({ text: v().text, lang: state.typo.lang });
      showSample('c' + (v().customs.length - 1)); $('#sample').focus();
      return;
    }
    const del = e.target.closest('[data-act="delcustom"]');
    if (del) {
      const i = +del.dataset.i, cur = /^c(\d+)$/.exec(v().sample), ci = cur ? +cur[1] : -1;
      v().customs.splice(i, 1);
      if (ci === i) showSample(v().customs.length ? 'c' + Math.min(i, v().customs.length - 1) : orderedSamples()[0]);      // If deleting the active tab, select a neighbor or return to the built-in sample when none remain.
      else { if (ci > i) v().sample = 'c' + (ci - 1); renderSampleTabs(); saveState(); }
      return;
    }
    const b = e.target.closest('[data-sample]'); if (!b) return;
    showSample(b.dataset.sample);
    if (customAt(b.dataset.sample)) $('#sample').focus();
  });
  $('.pane-bar').addEventListener('click', e => {
    const b = e.target.closest('[data-ltab]'); if (!b) return;
    v().ltab = b.dataset.ltab; renderCurrentPreset(); syncLeftTab(); $('#editor').scrollTop = 0; saveState();
  });
  $('#sampleTabs').addEventListener('scroll', tabFade, { passive: true });
  $('#sampleTabs').addEventListener('wheel', e => {      // Allow vertical mouse wheels to scroll tabs horizontally for users without a trackpad.
    const t = e.currentTarget;
    if (t.scrollWidth <= t.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    t.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });
  new ResizeObserver(tabFade).observe($('#sampleTabs'));
  /* Ignore temporarily out-of-range size/line-height input while typing; clamp on blur or Enter. */
  const NUM = { size: { el: '#vSize', min: 12, max: 160, dp: 0, px: 0.5 }, lh: { el: '#vLh', min: 1, max: 2.6, dp: 2, px: 0.01 } };
  const setNum = (k, x) => {
    const n = NUM[k], r = Math.min(n.max, Math.max(n.min, +(+x).toFixed(n.dp)));
    if (r === v()[k]) return;
    v()[k] = r; refresh('toolbar', 'preview');
  };
  for (const [k, n] of Object.entries(NUM)) {
    const el = $(n.el);
    el.addEventListener('input', () => { const x = parseFloat(el.value); if (x >= n.min && x <= n.max) setNum(k, x); });
    el.addEventListener('change', () => { const x = parseFloat(el.value); if (isFinite(x)) setNum(k, x); el.value = k === 'lh' ? (+v().lh).toFixed(2) : v().size; });
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
  }
  /* Scrub icons horizontally: font size changes by 1 per 2px; line height by 0.01 per 1px. */
  const SCRUB = { ...NUM, w: { el: '#vWn', px: 1, get: () => state.wmode === 'cont' ? v().wcont : v().weight, set: setPreviewW } };      // Weight changes by 1 per pixel, snapping to the nearest selected step in stepped mode.
  document.querySelectorAll('[data-scrub]').forEach(ic => {
    let suppressClick = false;
    ic.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !e.isPrimary) return;
      const k = ic.dataset.scrub, n = SCRUB[k], x0 = e.clientX, v0 = n.get ? n.get() : v()[k];
      const y0 = e.clientY;
      let moved = false;
      suppressClick = false;
      e.preventDefault(); ic.setPointerCapture(e.pointerId); document.body.classList.add('scrubbing');
      const move = ev => {
        moved ||= Math.hypot(ev.clientX - x0, ev.clientY - y0) >= 3;
        if (!moved) return;
        const x = v0 + (ev.clientX - x0) * n.px * (ev.shiftKey ? 10 : 1); if (n.set) n.set(x); else setNum(k, x);
      };
      const up = ev => {
        ic.removeEventListener('pointermove', move); ic.removeEventListener('pointerup', up); ic.removeEventListener('pointercancel', up);
        document.body.classList.remove('scrubbing');
        suppressClick = moved || ev.type === 'pointercancel';
        if (!suppressClick && k !== 'w') $(n.el).select();
      };
      ic.addEventListener('pointermove', move); ic.addEventListener('pointerup', up); ic.addEventListener('pointercancel', up);
    });
    if (ic.dataset.scrub === 'w') ic.addEventListener('click', e => {
      e.preventDefault();
      // Open during click to avoid native popover dismissal on pointer release. A drag returning to its origin is still not a click.
      if (suppressClick && e.detail !== 0) { suppressClick = false; return; }
      showWeightSlider();
    });
  });
  const positionViewMenu = () => {      // Prefer below the button; allow scrolling on short screens and keep the popup inside the viewport after resize.
    const pop = $('#viewPop'); if (!pop.matches(':popover-open')) return;
    const r = $('#viewBtn').getBoundingClientRect();
    if (!r.width) { pop.hidePopover(); return; }
    pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
    pop.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - pop.offsetHeight - 8)) + 'px';
  };
  $('#viewPop').addEventListener('toggle', e => {
    $('#viewBtn').setAttribute('aria-expanded', e.newState === 'open');
    if (e.newState === 'open') { e.currentTarget.scrollTop = 0; positionViewMenu(); }
  });
  window.addEventListener('resize', positionViewMenu);
  /* Metric toolbar legend buttons independently toggle Western, digit, kana and Zhuyin guides. */
  $('#specBar').addEventListener('click', e => {
    const b = e.target.closest('[data-sg]'); if (!b) return;
    const k = b.dataset.sg;
    (v().specShow ||= {})[k] = !specShown()[k];
    refresh('toolbar', 'specimen');
  });
  for (const [id, key] of [['vVertical', 'vertical'], ['vColor', 'colorize'], ['vRules', 'rules'], ['vMiss', 'miss'], ['vItalic', 'italic']])
    $('#' + id).addEventListener('click', () => { v()[key] = !v()[key]; refresh('toolbar', 'preview', 'export'); });
  $('#viewTypo').addEventListener('change', e => { const k = e.target.dataset.vtypo; if (k) { state.typo[k] = e.target.value; syncViewTypo(); refresh('preview'); } });
  /* Space exported stepped weights evenly by index; continuous mode uses actual numeric values. */
  const wn = $('#vWn'), slider = $('#vWSlider'), pop = $('#vWPop');
  let returningFocus = false;
  const positionWeightSlider = () => {
    if (!pop.matches(':popover-open')) return;
    const r = $('#vWnLab').getBoundingClientRect();
    if (!r.width) { pop.hidePopover(); return; }
    pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
    pop.style.top = (r.bottom + 6 + pop.offsetHeight <= innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - pop.offsetHeight - 6)) + 'px';
  };
  function showWeightSlider() {
    syncPreviewWeight({ preserveInput: true });
    if (!pop.matches(':popover-open')) pop.showPopover();
    positionWeightSlider();
  }
  pop.addEventListener('toggle', e => {
    for (const el of [wn, $('#vWBtn')]) el.setAttribute('aria-expanded', e.newState === 'open');
    positionWeightSlider();
  });
  wn.addEventListener('focus', () => { if (!returningFocus) showWeightSlider(); });
  wn.addEventListener('click', showWeightSlider);
  window.addEventListener('resize', positionWeightSlider);
  document.addEventListener('scroll', positionWeightSlider, { passive: true, capture: true });
  slider.addEventListener('input', () => setPreviewW(state.wmode === 'cont' ? +slider.value : state.weights[+slider.value]));
  $('#vWTicks').addEventListener('click', e => {
    const b = e.target.closest('button[data-weight]');
    if (b && state.wmode === 'cont') setPreviewW(+b.dataset.weight);
  });
  pop.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); returningFocus = true;
    pop.hidePopover(); wn.focus({ preventScroll: true }); returningFocus = false;
  });
  wn.addEventListener('input', () => {
    const x = parseFloat(wn.value);
    if (state.wmode === 'cont' ? x >= state.wrange[0] && x <= state.wrange[1] : state.weights.includes(x)) setPreviewW(x, { preserveInput: true });
  });
  const commitWeight = () => { const x = parseFloat(wn.value); if (Number.isFinite(x)) setPreviewW(x); else syncPreviewWeight(); };
  wn.addEventListener('change', commitWeight);
  wn.addEventListener('blur', commitWeight);
  wn.addEventListener('keydown', e => {
    if (e.key === 'Enter') { wn.blur(); if (pop.matches(':popover-open')) pop.hidePopover(); return; }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    if (state.wmode === 'cont') setPreviewW(v().wcont + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
    else {
      const ws = state.weights, i = Math.max(0, ws.indexOf(v().weight));
      setPreviewW(ws[Math.min(ws.length - 1, Math.max(0, i + (e.key === 'ArrowUp' ? 1 : -1)))]);
    }
  });
  const reloadForText = debounce(() => rebuild(), 600);
  $('#proofText').addEventListener('pointermove', e => missTipAt(e.clientX, e.clientY));
  $('#proofText').addEventListener('pointerleave', () => { $('#missTip').hidden = true; });
  document.addEventListener('scroll', () => { $('#missTip').hidden = true; }, { passive: true, capture: true });      // Also dismiss when a pane scrolls; scroll events do not bubble.
  $('#sample').addEventListener('input', e => {
    v().text = e.target.value;
    const m = /^c(\d+)$/.exec(v().sample); if (m && v().customs[+m[1]]) v().customs[+m[1]].text = e.target.value;
    refresh('preview'); reloadForText();
  });
  for (const box of ['#typoRows', '#featRows']) {      // Text layout settings and font features share the same cards and selects.
  $(box).addEventListener('click', e => {
    const lm = e.target.closest('[data-lm]');
    if (lm) { state.lineMetrics = lm.dataset.lm; refresh('typoStatus', 'fonts', 'export'); return; }
    const b = e.target.closest('[data-typo]'); if (!b) return;
    state.typo[b.dataset.typo] = b.dataset.v;
    refresh('typoStatus', 'preview', 'export');
  });
  $(box).addEventListener('change', e => {
    const t = TYPO.find(x => 'ty-' + x.key === e.target.id); if (!t) return;
    state.typo[t.key] = e.target.value;
    refresh('typoStatus', 'preview', 'export');
  });
  }

  $('#autoAdj').addEventListener('click', autoAdjust);

  $('#exName').addEventListener('input', e => { state.name = e.target.value; refresh('export'); });
  $('#exWeights').addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    const w = +b.dataset.w, set = new Set(state.weights);
    if (set.has(w)) { if (set.size === 1) return; set.delete(w); } else set.add(w);
    setWeights([...set]);
  });
  $('#exWHint').addEventListener('click', e => { if (e.target.closest('[data-act="wadd"]')) setWeights([...state.weights, 400, 700]); });
  /* Weight mode: stepped / continuous (variable fonts). Switching preserves all settings. */
  $('#vWMode').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === state.wmode) return;
    state.wmode = b.dataset.m;
    if (state.wmode === 'cont') { state.weights = [...WEIGHTS]; v().wcont = Math.min(state.wrange[1], Math.max(state.wrange[0], v().weight)); }
    constrainPreviewWeight();
    refresh('toolbar', 'editor', 'fonts', 'export');
  });
  $('#exWPresets').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) setWRange(...b.dataset.r.split(',').map(Number)); });
  for (const id of ['exWLo', 'exWHi']) $('#' + id).addEventListener('change', () => setWRange(parseFloat($('#exWLo').value), parseFloat($('#exWHi').value)));
  $('#exBase').addEventListener('change', e => { state.baseMode = e.target.value; refresh('export'); });
  /* Italic export creates separate font-style: italic rules; the proof's Italic switch previews them. */
  $('#exItalic').addEventListener('change', e => { state.italic = e.target.value === '1'; refresh('editor', 'fonts', 'export'); });
  $('#exGeneric').addEventListener('change', e => { state.generic = e.target.value; refresh('preview', 'export'); });
  /* A language scope also controls proof glyph forms and line breaking; with no scope, keep the sample's language. */
  $('#exLang').addEventListener('change', e => {
    state.scope = e.target.value;
    if (state.scope) state.typo.lang = state.scope;
    refresh('toolbar', 'editor', 'preview', 'specimen', 'export');
  });
  $('.ex-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { setExTab(b.dataset.tab); renderExport(); } });
  $('.ex-kinds').addEventListener('click', e => { const b = e.target.closest('[data-kind]'); if (b) { setExKind(b.dataset.kind); saveState(); } });
  $('#exToggle').addEventListener('click', showExport);
  $('#exClose').addEventListener('click', () => $('#exDlg').close());
  $('#mTabs').addEventListener('click', e => { const b = e.target.closest('[data-mv]'); if (b) { v().mview = b.dataset.mv; syncPanes(); saveState(); } });
  /* Standalone pages can download directly. Embedded artifact frames block downloads, so offer Copy only. */
  const canDownload = window.top === window.self;
  $('#dlBtn').hidden = !canDownload;
  $('#dlBtn').addEventListener('click', () => {
    if (!lastExport) return;
    const js = exTab === 'js', app = exKind === 'app';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lastExport], { type: app ? 'text/plain' : js ? 'text/javascript' : 'text/css' }));
    a.download = app ? appFileName() : (cssFamilyName().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'composite-font') + (js ? '-baseline.js' : '.css');
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(lastExport); toast(T('tCopied')); }
    catch (e) {
      const r = document.createRange(); r.selectNodeContents($('#codeOut'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      toast(T('tCopyFail'));
    }
  });
}
export function renderTypoRows() {
  const row = t => {
    const opts = t.values.map(([v, d]) => `<option value="${esc(v)}">${esc(v)}${d ? ' · ' + esc(tr(d)) : ''}${typoSupported(t, v) ? '' : esc(T('unsupported'))}</option>`).join('');
    /* For settings such as numeric style, render a row of specimen cards using the current digit font. */
    const ctl = t.tiles ? `<div class="typo-tiles" role="radiogroup" aria-labelledby="tyl-${t.key}"${t.tileW ? ` style="--tile-w:${t.tileW}px${t.tileFs ? `;--tile-fs:${t.tileFs}px` : ''}"` : ''}>${t.values.map(([v, d, tip]) =>
      `<button type="button" role="radio" data-typo="${t.key}" data-v="${esc(v)}" aria-checked="${state.typo[t.key] === v}"${!tip && t.tileCode && d ? '' : ` title="${esc(v)}"`}>${t.tileHtml ? t.tileHtml(v) : `<span class="tt-s" style="${t.prop}:${esc(v)}" aria-hidden="true">${esc(t.tiles)}</span>`}<span class="tt-l">${esc(d ? tr(d) : v)}${tip ? `<small>${esc(tr(tip))}</small>` : t.tileCode && d ? `<code>${esc(v)}</code>` : ''}</span></button>`).join('')}</div>`
      : `<select id="ty-${t.key}">${opts}</select>`;
    return `<div class="typo-row${t.tiles ? ' tiles' : ''}">
      <span class="typo-name lab-i">${t.tiles ? `<b id="tyl-${t.key}">${esc(tr(t.label))}</b>` : `<label for="ty-${t.key}"><b>${esc(tr(t.label))}</b></label>`}${infoButton('typo:' + t.key)}</span>
      ${ctl}
      <p class="typo-unsup" data-key="${t.key}" hidden>${esc(T('supNo'))}</p>${t.hint ? `<p class="typo-note" id="${t.hint}" hidden></p>` : ''}
    </div>`;
  };
  const rows = TYPO.filter(t => !t.attr && !isViewTypo(t));
  $('#typoRows').innerHTML = rows.filter(t => !isFontTypo(t)).map(row).join('');
  $('#featRows').innerHTML = rows.filter(isFontTypo).map(row).join('') + lmRow();
  for (const t of TYPO) { const el = $('#ty-' + t.key); if (el) el.value = state.typo[t.key]; }
  renderViewTypo();
  renderTypoStatus();
}
/* View alignment, justification and wrapping affect only the proof and are not exported. */
export function renderViewTypo() {
  const lab = (t, v, d) => d ? tr(d) : v === t.def ? T('vtDefault', { v }) : v;
  $('#viewTypo').innerHTML = ['align', 'justify', 'wrap'].map(k => TYPO.find(t => t.key === k)).map(t => `<label class="vt-row"><span>${esc(tr(t.label))}</span><select data-vtypo="${t.key}">${
    t.values.map(([v, d]) => `<option value="${esc(v)}"${state.typo[t.key] === v ? ' selected' : ''}>${esc(lab(t, v, d))}</option>`).join('')}</select></label>`).join('');
  syncViewTypo();
}
/* Justification method applies only with justified alignment. */
export function syncViewTypo() {
  document.querySelectorAll('#viewTypo [data-vtypo]').forEach(s => { s.value = state.typo[s.dataset.vtypo]; });
  const j = $('#viewTypo [data-vtypo="justify"]'); if (j) j.disabled = state.typo.align !== 'justify';
}
/* Line metrics use @font-face ascent-override and related descriptors. Most users keep the recommendation, so place them last among advanced text properties. */
export const LM_SUP = { chrome: '87', firefox: '89', safari: '—' };
export const lmSupported = () => typeof FontFace !== 'undefined' && 'ascentOverride' in FontFace.prototype;
/* Line-metric illustration: three lines, with Western-only text on the second; dashed lines mark line boxes.
   Han-aligned metrics give equal heights and centered Han glyphs. Unadjusted Western metrics shorten the Western-only line and lower Han glyphs. */
const lmPic = (edges, rows) => tSvg(rows.map(([kind, x, y, w]) => kind === 'h' ? `<rect x="${x}" y="${y}" width="5" height="5" rx=".5"/>` : `<rect x="${x}" y="${y}" width="${w}" height="3" rx=".6"/>`).join('') +
  edges.map(y => `<path d="M2 ${y}H46" class="tt-edge"/>`).join(''));
export const LM_PIC = {      // Data only: render illustrations later, since module top levels must not call other modules' functions.
  han: [[1.5, 10.5, 19.5, 28.5], [['h', 4, 3.5], ['h', 10, 3.5], ['l', 16, 5, 10], ['h', 28, 3.5], ['h', 34, 3.5], ['l', 4, 14, 14], ['l', 20, 14, 12], ['h', 4, 21.5], ['h', 10, 21.5], ['h', 16, 21.5], ['l', 22, 23, 9]]],
  off: [[1.5, 10.5, 16, 25], [['h', 4, 4.7], ['h', 10, 4.7], ['l', 16, 6.2, 10], ['h', 28, 4.7], ['h', 34, 4.7], ['l', 4, 11.75, 14], ['l', 20, 11.75, 12], ['h', 4, 19.2], ['h', 10, 19.2], ['h', 16, 19.2], ['l', 22, 20.7, 9]]],
};
export function lmRow() {
  const tile = (v, label, tip) => `<button type="button" role="radio" data-lm="${v}" aria-checked="${state.lineMetrics === v}"><span class="tt-s tt-pic lm-pic" aria-hidden="true">${lmPic(...LM_PIC[v])}</span><span class="tt-l">${esc(T(label))}<small>${esc(T(tip))}</small></span></button>`;
  return `<div class="typo-row tiles">
      <span class="typo-name lab-i"><b id="tyl-lm">${esc(T('exLm'))}</b>${infoButton('lmInfo')}</span>
      <div class="typo-tiles" role="radiogroup" aria-labelledby="tyl-lm" style="--tile-w:128px">${tile('han', 'exLmHan', 'exLmHanTip')}${tile('off', 'exLmOff', 'exLmOffTip')}</div>
      ${lmSupported() ? '' : `<p class="typo-unsup">${esc(T('supNo'))}</p>`}
    </div>`;
}
/* Info buttons also provide hover tooltips. */
export const infoButton = key => `<button type="button" class="info" data-info="${esc(key)}" popovertarget="infoPop" aria-label="${esc(T('infoAria'))}"><svg class="ic" aria-hidden="true"><use href="#i-info-circle"/></svg></button>`;
/* Info technical details: CSS property and first supported browser versions, highlighting the current browser and selected-value support. */
export function techHtml(prop, sup, ok) {
  const names = { chrome: 'Chrome', firefox: 'Firefox', safari: 'Safari' };
  // Show browser names and versions on separate rows in three columns; emphasize the current browser.
  const grid = sup ? `<div class="ip-sup">${Object.keys(names).map(b => `<span class="ip-b${b === ENGINE.id ? ' cur' : ''}${sup[b] === '—' ? ' none' : ''}"><small>${names[b]}</small>${esc(sup[b])}</span>`).join('')}</div>` : `<p class="ip-all">${esc(T('allBrowsers'))}</p>`;
  const now = ENGINE.name ? `<p class="ip-now ${ok ? 'ok' : 'no'}">${esc(T(ok ? 'supNowOk' : 'supNowNo', { b: `${ENGINE.name} ${ENGINE.v}` }))}</p>` : '';
  return `<div class="ip-tech"><p class="ip-head"><code>${esc(prop)}</code><span>${esc(T('supSince'))}</span></p>${grid}${now}</div>`;
}
export function renderTypoStatus() {
  document.querySelectorAll('#typoRows [data-typo], #featRows [data-typo]').forEach(b => b.setAttribute('aria-checked', state.typo[b.dataset.typo] === b.dataset.v));
  document.querySelectorAll('#featRows [data-lm]').forEach(b => b.setAttribute('aria-checked', state.lineMetrics === b.dataset.lm));
  renderNumHint(); renderEaMarks();
  const changed = TYPO.filter(t => !t.attr && !isViewTypo(t) && state.typo[t.key] !== typoDef(t));
  const n = changed.filter(t => !isFontTypo(t)).length, nf = changed.filter(isFontTypo).length + (state.lineMetrics === 'off' ? 1 : 0);
  $('#typoChanged').textContent = n ? T('typoChanged', { n }) : '';
  $('#typoCount').textContent = n || '';      // The tab badge counts modified settings.
  $('#typoReset').hidden = !n;
  $('#featChanged').textContent = nf ? T('typoChanged', { n: nf }) : '';
  $('#featReset').hidden = !nf;
  for (const t of TYPO) { const el = document.querySelector(`.typo-unsup[data-key="${t.key}"]`); if (el) el.hidden = typoSupported(t, state.typo[t.key]); }
}

/* ================= Preset cards: render each sample in its own fonts ================= */
export function presetFonts(cls) {
  const han = cls.han.font, lat = cls.latin.follow ? han : cls.latin.font;
  const kana = cls.kana.follow === 'latin' ? lat : cls.kana.follow ? han : cls.kana.font;
  return { han, lat, kana, size: cls.latin.size ?? 100 };
}
export function famOf(f) {
  if (!f) return 'var(--ui)';
  const s = source(f);
  return s.status === 'ok' ? `'${s.family}', var(--ui)` : 'var(--ui)';
}
/* Use a regional middle glyph in the Han/Western thumbnail: Simplified or Traditional Han forms, or Japanese kana, make the writing system recognizable. */
export const SCRIPT_CHAR = { sc: '体', tc: '體', jp: 'あ' };
export const scriptOfLang = lang => /^ja/.test(lang || '') ? 'jp' : /^zh-Hant/.test(lang || '') ? 'tc' : 'sc';
export function presetCard({ id, name, tag, cls, script, user, active }) {
  const { han, lat, kana, size } = presetFonts(cls);
  const miss = [han, lat].some(f => f?.kind === 'local' && sources.get(fontKey(f))?.status === 'error');
  return `<div class="pcard-wrap"><button type="button" class="pcard" data-preset="${esc(id)}" aria-pressed="${active}">
      <span class="pspec" aria-hidden="true"><span style="font-family:${famOf(han)}">永</span><span style="font-family:${famOf(script === 'jp' ? kana : han)}">${SCRIPT_CHAR[script]}</span><span style="font-family:${famOf(lat)};font-size:${size}%">Ag</span></span>
      <span class="ptag" title="${esc(tag)}">${esc(tag)}</span>
      <span class="pname">${esc(name)}</span>
      ${miss ? `<span class="pmiss">${esc(T('presetMissing'))}</span>` : ''}
    </button>${user ? `<button type="button" class="btn-icon sm danger pdel" data-del="${esc(id.slice(5))}" aria-label="${esc(T('presetDelete'))} ${esc(name)}" title="${esc(T('presetDelete'))}"><svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg></button>` : ''}</div>`;
}
/* Put built-in presets matching the UI language first, followed by other languages. */
export const PRESET_ORDER = {
  zh: ['serif-sc', 'sans-sc', 'mincho-jp', 'gothic-jp', 'ming-tw', 'hei-tw', 'antigochi', 'hei-hk', 'mac', 'mac-tw', 'mac-jp'],
  tw: ['ming-tw', 'hei-tw', 'hei-hk', 'mac-tw', 'serif-sc', 'sans-sc', 'mincho-jp', 'gothic-jp', 'antigochi', 'mac', 'mac-jp'],
  ja: ['mincho-jp', 'gothic-jp', 'antigochi', 'mac-jp', 'serif-sc', 'sans-sc', 'ming-tw', 'hei-tw', 'hei-hk', 'mac', 'mac-tw'],
};
export const orderedPresets = () => { const o = PRESET_ORDER[UI] || PRESET_ORDER.zh, at = id => (i => i < 0 ? 99 : i)(o.indexOf(id)); return [...PRESETS].sort((a, b) => at(a.id) - at(b.id)); };
/* ================= Preset filters =================
   Three groups: region, style (serif or sans from the Han font name), and source (Google Fonts or local).
   Match any selected option within a group and every active group; an empty group is unrestricted. Store filters in view state, outside undo history. */
export const PF_GROUPS = [['region', [['sc', 'pfSc'], ['tc', 'pfTc'], ['jp', 'pfJp']]], ['style', [['serif', 'pfSerif'], ['sans', 'pfSans'], ['other', 'pfOther']]], ['src', [['google', 'pfGoogle'], ['local', 'pfLocal']]]];
/* Infer preset metadata for save-dialog defaults and older user presets without metadata.
   Region: export language, then Han family suffix (SC / TC / HK / JP), then proof language. Style: styleOfFont for the Han font.
   Source: Google only when every class uses Google Fonts; local fonts or uploads require the same files on another machine. */
const REGION_GROUP = { sc: 'sc', tw: 'tc', hk: 'tc', jp: 'jp' };
export function inferMeta(st) {
  const han = st.classes?.han?.font;
  const own = [...Object.values(st.classes || {}), ...(st.custom || [])].filter(c => c && !c.follow && c.font).map(c => c.font);
  const region = REGION_GROUP[REGION_OF_LANG[st.scope]] || REGION_GROUP[formsOf(han)] || scriptOfLang(st.typo?.lang);
  return { region, style: styleOfFont(han), src: own.length && own.every(f => f.kind === 'google') ? 'google' : 'local' };
}
export function renderPresetFilter(shown, total) {
  const pf = state.view.pfilter || {}, n = PF_GROUPS.reduce((k, [g]) => k + (pf[g]?.length || 0), 0);
  $('#pfCount').textContent = n || '';      // Show the selected filter count on the button.
  $('#pfMenu').innerHTML = PF_GROUPS.map(([g, opts]) => `<p class="mm-lab">${esc(T({ region: 'pfRegion', style: 'pfStyle', src: 'pfSource' }[g]))}</p>` + opts.map(([v, k]) =>
    `<button type="button" class="mm-item mm-check" data-pf="${g}:${v}" aria-pressed="${!!pf[g]?.includes(v)}"${T(k + 'Tip') !== k + 'Tip' ? ` title="${esc(T(k + 'Tip'))}"` : ''}>${esc(T(k))}</button>`).join('')).join('<hr>') +
    (n ? `<hr><div class="pf-end"><button type="button" class="mm-item" data-pf="clear">${esc(T('pfClear'))}</button><span class="mono">${shown} / ${total}</span></div>` : '');
}
const ownPresetName = () => {
  const name = state.preset?.startsWith('user:') ? state.preset.slice(5) : null;
  return name != null && Object.hasOwn(userPresets, name) && userPresets[name]?.classes?.han ? name : null;
};
/* The first card is neither filtered nor applied as a configuration; render its font from the live composite so it always matches current work. */
export function renderCurrentPreset() {
  const own = ownPresetName(), name = own ?? (state.preset ? presetTitle(state.preset) : suggestedPresetName());
  $('#currentPresetName').textContent = name;
  $('#currentPresetSpec').textContent = `永${SCRIPT_CHAR[scriptOfLang(state.scope || state.typo.lang)]}Ag`;
  const update = $('#updatePresetBtn');
  if (update.presetOwner !== own) disarmConfirm(update);
  update.presetOwner = own; update.hidden = own == null;
  update.disabled = own == null || !presetDirty();
  if (update.disabled) disarmConfirm(update);
  const create = $('#savePresetBtn');
  create.classList.toggle('btn-text', own != null); create.classList.toggle('btn', own == null);
}
/* Keep the current configuration first; filter counts include only applicable built-in and user presets. */
export function renderPresetCards() {
  const all = [], pf = state.view.pfilter || {};
  for (const [n, snap] of Object.entries(userPresets)) if (snap?.classes?.han) {
    const meta = { ...inferMeta(snap), ...(snap.meta || {}), src: inferMeta(snap).src };      // Use region and style confirmed at save time; always derive source from the fonts.
    all.push([meta, { id: 'user:' + n, name: n, tag: T('presetMine'), cls: snap.classes, script: scriptOfLang(snap.typo?.lang), user: true, active: state.preset === 'user:' + n }]);
  }
  for (const p of orderedPresets()) {
    const script = p.region === 'hk' ? 'tc' : p.region, cls = freshClasses(p);
    all.push([{ region: script, style: p.style, src: inferMeta({ classes: cls }).src }, { id: p.id, name: tr(p.name), tag: tr(p.tag), cls, script, active: state.preset === p.id }]);
  }
  const fit = m => PF_GROUPS.every(([g]) => !pf[g]?.length || pf[g].includes(m[g]));
  const cards = all.filter(([m]) => fit(m)).map(([, c]) => presetCard(c));
  $('#presetList').innerHTML = cards.join('') || `<p class="pf-none">${esc(T('pfNone'))} <button type="button" class="btn-text" data-pf="clear">${esc(T('pfClear'))}</button></p>`;
  renderPresetFilter(cards.length, all.length); renderCurrentPreset();
}
/* Filter buttons toggle options within groups; Clear filters is available in both the filter bar and empty state. */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pf]'); if (!b || !b.closest('#panePresets')) return;
  const focus = b.dataset.pf;      // Restore focus to the clicked item after rebuilding the menu.
  const v = state.view;
  if (b.dataset.pf === 'clear') delete v.pfilter;
  else {
    const [g, x] = b.dataset.pf.split(':'), pf = v.pfilter ||= {}, list = pf[g] ||= [];
    if (list.includes(x)) list.splice(list.indexOf(x), 1); else list.push(x);
    if (!list.length) delete pf[g];
    if (!Object.keys(pf).length) delete v.pfilter;
  }
  renderPresetCards(); saveState();
  $(`#pfMenu [data-pf="${focus}"]`)?.focus();
});
/* Position the filter menu below its button with right edges aligned. */
$('#pfMenu').addEventListener('toggle', e => {
  if (e.newState !== 'open') return;
  const r = $('#pfBtn').getBoundingClientRect(), pop = e.currentTarget;
  pop.style.top = r.bottom + 6 + 'px'; pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + 'px';
});
export const renderPresetCardsSoon = debounce(renderPresetCards, 120);
export const hasFileFont = () => [...CLASSES.map(c => state.classes[c.id].font), ...state.custom.map(c => c.font)].some(f => f && f.kind === 'file');
export function applyPreset(id) {
  if (id.startsWith('user:')) {
    const { meta, ...saved } = userPresets[id.slice(5)] || {}; if (!saved.classes) return;      // meta contains region and style confirmed at save time, used only for filtering.
    setState({ ...JSON.parse(JSON.stringify(saved)), view: state.view, preset: id });
  } else {
    const p = PRESETS.find(x => x.id === id); if (!p) return;
    const keepText = !(state.view.sample in SAMPLES);
    setState(stateFromPreset(p, state));
    state.preset = id;
    if (!keepText) { state.view.sample = p.sample; state.view.text = SAMPLES[p.sample].text; state.typo.lang = SAMPLES[p.sample].lang; state.view.vertical = !!p.vertical; }
  }
  normalizeState();
  state.presetBase = presetSnap();
  refresh('ranges', 'toolbar', 'editor', 'preview', 'presets', 'fonts');
}
/* Measure dependencies in order: Western before digits, custom groups last. Apply only after all classes finish.
   Baseline is currently a class-wide base setting, not per-weight; continuous mode still fits only size and baseline.
   Followed classes keep inheriting, and explicit size/baseline overrides remain unchanged. */
export const SHIFT_MIN = 2;
const fitShift = v => Math.abs(v) < SHIFT_MIN ? 0 : Math.min(30, Math.max(-30, v));
const sameFitFont = (a, b) => sameFontAs(a, b) || (a?.kind === 'file' && b?.kind === 'file' && a.fileId && a.fileId === b.fileId);
function autoTargets(st = state) {
  const targets = CLASSES.filter(c => c.id !== 'han' && !st.classes[c.id].follow && st.classes[c.id].font).map(c => ({
    key: c.id, ref: c.id === 'digit' ? 'latin' : 'han',
    sample: c.id === 'latin' ? '' : [...FIT_SAMPLES[c.id]].filter(ch => classOf(ch.codePointAt(0)) === c.id).join(''),
    width: ['punct', 'symbol', 'shared'].includes(c.id),
  }));
  st.custom.forEach((o, i) => {
    if (o.follow || !o.font || !parseChars(o.chars).length) return;
    const ranges = parseChars(o.chars), count = ranges.reduce((n, [a, b]) => n + b - a + 1, 0);
    // Each custom group shares one size/baseline; mixed classes or oversized groups have no reliable single reference.
    const chars = count <= 64 ? ranges.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, j) => String.fromCodePoint(a + j))) : [];
    const kinds = new Set(chars.map(ch => classOf(ch.codePointAt(0))));
    const ref = kinds.size === 1 && !kinds.has(null) ? [...kinds][0] : null;
    targets.push({ key: '#' + i, ref, sample: chars.join(''), minimum: 1, width: ['punct', 'symbol', 'shared'].includes(ref) });
  });
  return targets;
}
function applyFitResults(key, fits, list, cont) {
  const o = objByKey(key), base = fits.get(BASE_W);
  if (base) {
    if (!cont && base.weight != null) o.font = { ...o.font, weight: base.weight };
    setSizeAt(key, BASE_W, base.size === inheritedSize(key, BASE_W) ? null : base.size);
    o.shift = fitShift(base.shift) || null;
  }
  for (const W of list) {
    if (W === BASE_W) continue;
    const fit = fits.get(W);
    if (!fit) continue;
    const baseSize = o.size ?? 100;
    setSizeAt(key, W, Math.abs(fit.size - baseSize) >= .5 ? fit.size : null);
    if (!cont && fit.weight != null) {
      const ov = ((state.wOver[W] ||= {})[key] ||= {});
      if (ov.font) ov.font = { ...ov.font, weight: fit.weight };
      else {
        const expected = fontAtWeight(o.font, W), avail = expected.kind === 'google' && gfWeights(expected.family);
        const auto = avail && !Array.isArray(vfAxisNow(expected)) ? avail.reduce((a, b) => Math.abs(b - expected.weight) < Math.abs(a - expected.weight) ? b : a) : expected.weight;
        if (fit.weight === auto) delete ov.weight; else ov.weight = fit.weight;
      }
      pruneOv(W, key);
    }
  }
}
export let autoBusy = false, autoDoneTimer = 0;
export async function autoAdjust() {
  if (autoBusy) return;
  const cont = state.wmode === 'cont', list = cont ? [...new Set([BASE_W, ...WEIGHTS.filter(W => stepSpan(W))])].sort((a, b) => a - b) : [...new Set([BASE_W, ...state.weights])].sort((a, b) => a - b);
  const targets = autoTargets(), snapshot = histSnap(), planned = new Map(), skipped = new Set();
  const resolved = (key, W, depth = 0) => {
    const o = objByKey(key), ov = W !== BASE_W ? state.wOver[W]?.[key] : null;
    let r = key[0] === '#' ? resolveCustom(o, W, true) : resolveCls(key, W, true);
    if (o.follow && depth < 4) {
      const parent = resolved(o.follow, W, depth + 1);
      r = { ...parent, size: ov?.size ?? o.size ?? parent.size, shift: o.shift ?? parent.shift };
    }
    const p = planned.get(key), f = p?.fits.get(W), base = p?.fits.get(BASE_W);
    if (f) r = { ...r, size: base && Math.abs(f.size - base.size) < .5 ? base.size : f.size,
      shift: base ? fitShift(base.shift) : r.shift,
      font: !cont && f.weight != null ? { ...r.font, weight: f.weight } : r.font };
    return cont && Array.isArray(vfAxisNow(r.font)) ? { ...r, font: { ...r.font, weight: W } } : r;
  };
  if (!targets.length || targets.every(t => t.ref && list.every(W => sameFitFont(resolved(t.key, W).font, resolved(t.ref, W).font)))) return toast(T('autoSameFont'));
  const fitter = createFitter(), btn = $('#autoAdj'), lab = btn.querySelector('.wand-lab');
  clearTimeout(autoDoneTimer); btn.classList.remove('done');
  autoBusy = true; btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  try {
    let progress = 0;
    for (const target of targets) {
      const rows = [];
      if (!target.ref || (target.key !== 'latin' && !target.sample)) { progress += list.length; skipped.add(target.key); continue; }
      for (const W of list) {
        lab.textContent = T('autoAdjProgress', { i: ++progress, n: targets.length * list.length });
        setBusy(T('measuringW', { w: W }));
        const han = resolved(target.ref, W), latin = resolved(target.key, W);
        if (sameFitFont(han.font, latin.font)) continue;
        rows.push(await fitter.fit({ ...target, W, han, latin }, !cont));
        if (histSnap() !== snapshot) return toast(T('autoCancelled'));
      }
      if (!rows.length) continue;
      // If any step lacks a same-class reference, preserve the whole class so a base-setting change cannot indirectly alter unmeasured steps.
      if (rows.some(r => !r.candidates.length)) { skipped.add(target.key); continue; }
      const fits = chooseFits(rows);
      if (fits.size) planned.set(target.key, { fits });
    }
    if (!planned.size) return toast(skipped.size ? T('autoSkipped', { classes: [...skipped].map(keyName).join(T('joiner')) }) : T('autoSameFont'));
    recordHistory();
    for (const [key, { fits }] of planned) applyFitResults(key, fits, list, cont);
    lab.textContent = T('autoAdjDone'); btn.classList.add('done');
    autoDoneTimer = setTimeout(() => { btn.classList.remove('done'); lab.textContent = T('autoAdj'); }, 1800);
    syncToolbar(); changed({ fonts: true });
    toast(T('tAuto', { classes: [...planned.keys()].map(keyName).join(T('joiner')) }) + (skipped.size ? ' ' + T('autoSkipped', { classes: [...skipped].map(keyName).join(T('joiner')) }) : ''));
  } catch (error) {
    console.warn('Auto-fit failed', error); toast(T('tNotReady'));
  } finally {
    fitter.dispose(); autoBusy = false; btn.disabled = false; btn.removeAttribute('aria-busy'); setBusy('');
    if (!btn.classList.contains('done')) lab.textContent = T('autoAdj');
  }
}
/* Save current settings as a user preset; meta contains the dialog-confirmed region and style. */
export function savePresetAs(n, meta) {
  const snap = JSON.parse(JSON.stringify(state)); delete snap.view; delete snap.presetBase;
  const saved = { ...snap, meta };
  // Confirm storage succeeds before replacing memory and preset identity; preserve work and saved presets when storage is full.
  try { localStorage.setItem(LS_PRESETS, JSON.stringify({ ...userPresets, [n]: saved })); }
  catch (error) { toast(T('presetSaveFailed')); return false; }
  Object.defineProperty(userPresets, n, { value: saved, writable: true, configurable: true, enumerable: true });
  state.preset = 'user:' + n; state.presetBase = presetSnap();
  refresh('presets');
  toast(T('tSaved', { n }) + (hasFileFont() ? T('tSavedFile') : ''));
  return true;
}
/* ================= Save preset dialog =================
   Used both for saving and for switching presets with unsaved edits; the latter adds a loss warning and a Discard action.
   Infer region and style with inferMeta, allowing corrections. Source is read-only and derived from fonts. */
export let saveThen = null, saveMeta = null;
const presetTitle = id => id.startsWith('user:') ? id.slice(5) : tr(PRESETS.find(p => p.id === id)?.name || { zh: id, ja: id, tw: id, en: id });
function suggestedPresetName() {
  // Unnamed current configurations and new-preset dialogs share a suggested name. Fill the field only on opening, preserving manual edits while it remains open.
  const fonts = ['han', 'latin', 'kana'].map(id => shortName(resolveCls(id, BASE_W, true).font).trim()).filter(Boolean);
  const base = [...new Set(fonts)].join(' × ') || T('presetUnnamed');
  let name = base, i = 2;
  while (Object.hasOwn(userPresets, name)) name = `${base} (${i++})`;
  return name;
}
export function openSave(leaveTo = null, { create = false } = {}) {
  saveThen = leaveTo;
  const m = inferMeta(state);
  saveMeta = { region: m.region, style: m.style };
  $('#saveTitle').textContent = T(leaveTo ? 'leaveTitle' : 'presetCreate');
  $('#saveMsg').hidden = !leaveTo; if (leaveTo) $('#saveMsg').textContent = T('leaveMsg', { name: presetTitle(leaveTo) });
  $('#saveDiscard').hidden = !leaveTo;
  $('#saveOk').querySelector('span').textContent = T(leaveTo ? 'leaveSave' : 'presetCreate');
  $('#saveName').value = !create && ownPresetName() != null ? ownPresetName() : !create && state.name.trim() && state.name !== 'My Composite' ? state.name : suggestedPresetName();      // Default to updating the current user preset; for a new preset, suggest an unused name.
  $('#saveSrc').textContent = T(m.src === 'google' ? 'saveSrcGoogle' : 'saveSrcLocal');
  $('#saveFile').hidden = !hasFileFont();
  syncSave();
  $('#saveDlg').showModal(); $('#saveName').select();
}
export function syncSave() {
  for (const g of ['region', 'style']) document.querySelectorAll(`#save${g === 'region' ? 'Region' : 'Style'} [data-v]`).forEach(b => b.setAttribute('aria-checked', b.dataset.v === saveMeta[g]));
  const n = $('#saveName').value.trim();
  const exists = !!n && Object.hasOwn(userPresets, n);
  $('#saveDup').hidden = !exists;
  const button = $('#saveOk');
  disarmConfirm(button);
  button.querySelector('span').textContent = T(exists ? 'presetUpdate' : saveThen ? 'leaveSave' : 'presetCreate');
}
export function initPresets() {
  $('#presetCards').addEventListener('click', e => {
    const del = e.target.closest('.pdel');
    if (del) {
      const n = del.dataset.del;
      armConfirm(del, T('presetDeleteConfirm'), () => {
        delete userPresets[n]; lsSet(LS_PRESETS, userPresets);
        if (state.preset === 'user:' + n) state.preset = '';
        refresh('presets'); toast(T('tDeleted'));
      });
      return;
    }
    const c = e.target.closest('[data-preset]');
    if (c) { if (presetDirty()) openSave(c.dataset.preset); else applyPreset(c.dataset.preset); }
  });
  const doSave = () => {
    const n = $('#saveName').value.trim(); if (!n) return $('#saveName').focus();
    const run = () => {
      if (!savePresetAs(n, { ...saveMeta })) return;
      $('#saveDlg').close(); if (saveThen) applyPreset(saveThen);
    };
    if (Object.hasOwn(userPresets, n)) armConfirm($('#saveOk'), T('presetReplaceConfirm'), run); else run();
  };
  $('#savePresetBtn').addEventListener('click', () => openSave(null, { create: true }));
  $('#updatePresetBtn').addEventListener('click', e => {
    const name = ownPresetName(); if (name == null) return;
    const button = e.currentTarget, stamp = state.preset + '\n' + presetSnap();
    if (button.presetStamp !== stamp) disarmConfirm(button);
    button.presetStamp = stamp;
    armConfirm(button, T('presetReplaceConfirm'), () => {
      if (ownPresetName() === name) savePresetAs(name, { region: inferMeta(state).region, style: inferMeta(state).style, ...userPresets[name].meta });
    });
  });
  $('#saveOk').addEventListener('click', doSave);
  $('#saveName').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    // Saving returns focus to the entry button; prevent the same Enter key from activating it again and reopening the dialog.
    e.preventDefault(); doSave();
  });
  $('#saveName').addEventListener('input', syncSave);
  $('#saveCancel').addEventListener('click', () => $('#saveDlg').close());
  $('#saveDiscard').addEventListener('click', () => { $('#saveDlg').close(); if (saveThen) applyPreset(saveThen); });
  for (const [id, g] of [['#saveRegion', 'region'], ['#saveStyle', 'style']])
    $(id).addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { saveMeta[g] = b.dataset.v; syncSave(); } });
  $('#saveDlg').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });      // Close on backdrop click.
}
/* ================= Font picker dialog ================= */
export let pickTarget = null, pickCand = null, pickTab = 'google';
let pickerProofWeight = 400, pickerProofKey = '', pickerPreviewToken = 0;
let pickerApplyToken = 0, pickerApplyBusy = false;
export let pickW = null;   // When editing a non-400 row with its own font, choose a weight, font name or file only for that step.
export const picker = $('#picker');
let pickCatalog = [], catalogObserver;
let pickerSampleMode = 'class', pickerCustomText = '';
function pickerOwns(ch) {
  const owner = ownerOf(ch.codePointAt(0)), key = keyOf(pickTarget);
  return owner === key || key === 'han' && owner === 'other';
}
function pickerClassSample() {
  if (pickTarget.type === 'custom') return parseChars(objOf(pickTarget).chars).flatMap(([a, b]) => Array.from({ length: Math.min(32, b - a + 1) }, (_, i) => String.fromCodePoint(a + i))).slice(0, 48).join('');
  const han = /^ko/i.test(state.typo.lang) ? '한글 가나다 漢字' : /^ja/i.test(state.typo.lang) ? '永国書体 春山風月' : /Hant|TW|HK/i.test(state.typo.lang) ? '永國字體 春山可望' : '永国字体 春山可望';
  const samples = { han, latin: 'Hamburg Aa Gg Rr', digit: '0123456789 11980 2026', kana: 'あいうえお アイウエオ かなカナ', shared: '“ ” ‘ ’ — …… ·', punct: '「 」 『 』 （ ） 、 。 ！ ？', symbol: '①②③ ※ → ℃ ＡＢＣ １２３', bopo: 'ㄅㄆㄇㄈ ㄉㄊㄋㄌ ㄧㄨㄩ ˊˇˋ˙' };
  return [...(samples[pickTarget.id] || CLS[pickTarget.id].sample)].map(ch => /\s/.test(ch) || pickerOwns(ch) ? ch : ' ').join('').replace(/\s+/g, ' ').trim();
}
function pickerProofText() {
  return [...(state.view.text || '')].map(ch => pickerOwns(ch) ? ch : ' ').join('').replace(/\s+/g, ' ').trim();
}
function renderPickerSample() {
  const proof = pickerProofText(), text = pickerSampleMode === 'proof' ? proof : pickerSampleMode === 'custom' ? pickerCustomText : pickerClassSample();
  picker.querySelectorAll('[data-pk-sample]').forEach(el => { el.setAttribute('aria-checked', el.dataset.pkSample === pickerSampleMode); el.tabIndex = el.dataset.pkSample === pickerSampleMode ? 0 : -1; if (el.dataset.pkSample === 'proof') { el.disabled = !proof; el.title = proof ? '' : T('pkNoProofChars'); } });
  $('#pkSampleText').hidden = pickerSampleMode !== 'custom'; $('#pkSampleText').value = pickerCustomText;
  $('#pkSample').textContent = $('#pkSample').dataset.text = text;
}
function catalogSample(item) {
  if (item?.region === 'latin' && pickTarget?.type === 'class' && ['han', 'kana', 'bopo', 'punct', 'symbol'].includes(pickTarget.id)) return 'Hamburg 0123';
  return pickerClassSample() || 'Ag';
}
function chooseCatalog(family) {
  $('#gfFamily').value = family; syncGfWeight(); updateCand();
  $('#gfOptions').querySelectorAll('[data-family]').forEach(el => { const selected = el.dataset.family === family; el.setAttribute('aria-selected', selected); });
}
export function renderCatalog() {
  const box = $('#gfOptions'), query = $('#gfSearch').value, current = $('#gfFamily').value;
  const entries = filterCatalog(pickCatalog, query, $('#gfStyle').value, $('#gfBold').checked);
  catalogObserver?.disconnect();
  const focusFamily = entries.some(item => item.family === current) ? current : entries[0]?.family;
  box.innerHTML = entries.length ? entries.map(item => `<button type="button" class="font-option" role="option" tabindex="${item.family === focusFamily ? 0 : -1}" aria-selected="${item.family === current}" data-family="${esc(item.family)}"><span class="font-option-name">${esc(item.family)}</span><span class="font-option-sample" hidden>${esc(catalogSample(item))}</span><small data-font-state>${esc(T('pkPreviewLoading'))}</small></button>`).join('') : `<p class="hint">${esc(T('pkNoResults'))}</p>`;
  const tryButton = $('#gfTry');
  tryButton.hidden = !query.trim() || entries.some(item => item.family.toLowerCase() === query.trim().toLowerCase());
  tryButton.textContent = T('pkTryName', { name: query.trim() });
  // Only visible rows load a short specimen; detailed coverage remains an explicit candidate-selection task.
  catalogObserver = new IntersectionObserver(events => events.forEach(async entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target; catalogObserver.unobserve(el);
    const font = G(el.dataset.family), src = source(font);
    await src.promise;
    if (!el.isConnected) return;
    const sample = el.querySelector('.font-option-sample'), status = el.querySelector('[data-font-state]');
    if (src.status !== 'ok') { status.textContent = T('pkPreviewUnavailable'); return; }
    try {
      const covered = text => [...text].every(ch => !ch.trim() || src.faces.some(face => !face.range || inRanges(face.range, ch.codePointAt(0))));
      if (!covered(sample.textContent)) sample.textContent = covered('Ag 0123') ? 'Ag 0123' : '';
      if (!sample.textContent || !(await document.fonts.load(`24px "${src.family}"`, sample.textContent)).length) { status.textContent = T('pkPreviewUnavailable'); return; }
      if (!el.isConnected) return;
      sample.style.fontFamily = `"${src.family}", var(--ui)`; sample.hidden = false; status.hidden = true;
    } catch (error) { status.textContent = T('pkPreviewUnavailable'); }
  }), { root: box });
  box.querySelectorAll('[data-family]').forEach(el => catalogObserver.observe(el));
}
let localFontRecords = null, localObserver;
function localGroups() {
  const records = localFontRecords !== null ? localFontRecords : LOCAL_COMMON.map(([fullName, postscriptName]) => ({ fullName, postscriptName, family: fullName.replace(WORD_RE, '').replace(/\s+(?:W\d|Roman)$/, '').trim(), style: fullName.match(WORD_RE)?.[2] || fullName.match(/\bW\d$/)?.[0] || (/\bRoman$/.test(fullName) ? 'Roman' : 'Regular') }));
  const groups = new Map();
  for (const item of records) { if (!groups.has(item.family)) groups.set(item.family, []); groups.get(item.family).push(item); }
  return [...groups].sort(([a], [b]) => a.localeCompare(b));
}
function selectLocalFamily(family, keepFace = false) {
  const faces = localGroups().find(([name]) => name === family)?.[1]; if (!faces?.length) return;
  const current = $('#lfName').value, face = (keepFace && faces.find(f => f.fullName === current)) || faces.find(f => /regular|normal|book/i.test(f.style)) || faces[0];
  $('#lfFaceField').hidden = false;
  $('#lfFace').innerHTML = faces.map(f => `<option value="${esc(f.fullName)}">${esc(f.style)}</option>`).join('');
  $('#lfFace').value = face.fullName; $('#lfName').value = face.fullName;
  $('#lfOptions').querySelectorAll('[data-local-family]').forEach(el => el.setAttribute('aria-selected', el.dataset.localFamily === family));
  if (!keepFace) updateCand();
}
export function renderLocalFonts() {
  const box = $('#lfOptions'), query = $('#lfFamilySearch').value.trim().toLowerCase(), current = $('#lfName').value;
  const groups = localGroups().filter(([family, faces]) => `${family} ${faces.map(f => f.fullName + ' ' + f.postscriptName).join(' ')}`.toLowerCase().includes(query));
  localObserver?.disconnect();
  box.innerHTML = groups.length ? groups.map(([family, faces], i) => `<button type="button" class="font-option" role="option" tabindex="${i ? -1 : 0}" aria-selected="${faces.some(f => f.fullName === current)}" data-local-family="${esc(family)}" data-local-face="${esc(faces.find(f => /regular|normal|book/i.test(f.style))?.fullName || faces[0].fullName)}"><span class="font-option-name">${esc(family)}</span><span class="font-option-sample" hidden>Ag 0123</span><small data-font-state>${esc(T('pkPreviewLoading'))}</small></button>`).join('') : `<p class="hint">${esc(T('pkNoLocalResults'))}</p>`;
  localObserver = new IntersectionObserver(entries => entries.forEach(async entry => {
    if (!entry.isIntersecting) return; const el = entry.target; localObserver.unobserve(el);
    const src = source(L(el.dataset.localFace, localAlt.get(el.dataset.localFace) ? [localAlt.get(el.dataset.localFace)] : [])); await src.promise;
    if (!el.isConnected) return;
    const status = el.querySelector('[data-font-state]'), sample = el.querySelector('.font-option-sample');
    if (src.status !== 'ok') { status.textContent = T('pkLocalNotConfirmed'); return; }
    sample.style.fontFamily = `"${src.family}", var(--ui)`; sample.hidden = false; status.hidden = true;
  }), { root: box });
  box.querySelectorAll('[data-local-family]').forEach(el => localObserver.observe(el));
  const selected = groups.find(([, faces]) => faces.some(f => f.fullName === current));
  $('#lfFaceField').hidden = !selected;
  if (selected) selectLocalFamily(selected[0], true);
}
let fileObserver, fileImportToken = 0;
function chooseImported(id) {
  const entry = importedFonts.get(id); if (!entry || !files.has(id)) return;
  pickCand = { ...entry.font };
  if (pickCand.axis) pickCand.weight = Math.max(pickCand.axis[0], Math.min(pickCand.axis[1], pickW || 400));
  $('#ffWeightNum').value = pickCand.weight || 400;
  updateCand();
  $('#ffOptions').querySelectorAll('[data-imported]').forEach(el => el.setAttribute('aria-selected', el.dataset.imported === id));
}
export function renderImportedFonts() {
  const query = $('#ffSearch').value.trim().toLowerCase(), box = $('#ffOptions');
  const all = [...importedFonts.values()].filter(entry => files.has(entry.font.fileId));
  const entries = all.filter(entry => `${entry.family} ${entry.style} ${entry.font.fileName}`.toLowerCase().includes(query));
  $('#ffLibrary').hidden = !all.length; fileObserver?.disconnect();
  box.innerHTML = entries.length ? entries.map((entry, i) => `<button class="font-option" type="button" role="option" tabindex="${i ? -1 : 0}" aria-selected="${pickCand?.fileId === entry.font.fileId}" data-imported="${esc(entry.font.fileId)}"><span class="font-option-name">${esc(entry.family)}${entry.style ? ' · ' + esc(entry.style) : ''}</span><span class="font-option-sample" hidden>Ag 0123</span><small data-font-state>${esc(T('pkPreviewLoading'))}</small></button>`).join('') : `<p class="hint">${esc(T('pkNoResults'))}</p>`;
  fileObserver = new IntersectionObserver(events => events.forEach(async entry => {
    if (!entry.isIntersecting) return; const el = entry.target; fileObserver.unobserve(el);
    const font = importedFonts.get(el.dataset.imported)?.font; if (!font) return;
    const src = source(font); await src.promise;
    if (!el.isConnected) return;
    const sample = el.querySelector('.font-option-sample'), status = el.querySelector('[data-font-state]');
    if (src.status !== 'ok') { status.textContent = T('pkPreviewUnavailable'); return; }
    sample.style.fontFamily = `"${src.family}", var(--ui)`; sample.hidden = false; status.hidden = true;
  }), { root: box });
  box.querySelectorAll('[data-imported]').forEach(el => fileObserver.observe(el));
}
async function acceptFontFiles(list) {
  const target = pickTarget, token = ++fileImportToken, entries = [], failed = [];
  $('#ffError').textContent = ''; $('#ffError').hidden = true; $('#pkOk').disabled = true;
  for (const file of list) {
    try { entries.push(await importFontFile(file)); } catch (error) { failed.push(file.name); }
  }
  if (token !== fileImportToken || pickTarget !== target || !picker.open || pickTab !== 'file') return;
  renderImportedFonts();
  if (entries.length) chooseImported(entries[0].font.fileId); else updateCand();
  $('#ffError').textContent = failed.length ? T('pkFileInvalid', { names: failed.join(T('joiner')) }) : ''; $('#ffError').hidden = !failed.length;
}
export function setPickTab(tab) {
  pickTab = tab;
  picker.querySelectorAll('[data-src]').forEach(b => b.setAttribute('aria-selected', b.dataset.src === tab));
  picker.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== tab; });
  if (tab === 'local') renderLocalFonts();
  if (tab === 'file') renderImportedFonts();
  updateCand();
}
export function candFromFields() {
  const base = pickW ? objOf(pickTarget).font : null;
  if (pickTab === 'google') {
    const fam = $('#gfFamily').value.trim(), w = gfWeightVal();
    const automatic = pickW && base?.kind === 'google' && base.family === fam ? fontAtWeight(base, pickW).weight : pickW && picker.querySelector('[name="pkScope"]:checked')?.value !== 'all' ? pickW : 400;
    const available = fam && gfWeights(fam);
    const actualAuto = available?.length && !pickerWeightAxis(G(fam)) ? available.reduce((a, b) => Math.abs(b - automatic) < Math.abs(a - automatic) ? b : a) : automatic;
    const axis = fam && pickerWeightAxis(G(fam)), chosen = w || actualAuto;
    return fam ? G(fam, axis ? Math.max(axis[0], Math.min(axis[1], chosen)) : chosen) : null;
  }
  if (pickTab === 'local') {
    const n = $('#lfName').value.trim() || (base ? $('#lfName').placeholder : ''); if (!n) return null;
    const ps = localAlt.get(n), f = L(n, ps && ps !== n ? [ps] : []), fa = localAxesOf(n);
    if (localData.has(n)) $('#lfVar').checked = !!fa?.axes?.some(a => a[0] === 'wght' && a[2] > 10);
    if (fa) { setFontAxes(f, fa, pickW || 400); if (f.axis) $('#lfVar').checked = true; }      // If local fonts were enumerated, read axes directly from their files.
    if (localStyle.get(n)) f.cls = localStyle.get(n);
    else if (!localData.has(n) && $('#lfVar').checked) { f.axis = [100, 900]; f.weight = pickW || 400; }      // For manually declared variable fonts, let the font clamp to its own range.
    return f;
  }
  const file = pickCand?.kind === 'file' && pickCand !== base ? pickCand : pickW && base.kind === 'file' ? base : null;
  if (!file) return null;
  const value = $('#ffWeightNum').value.trim();
  return file.axis && !$('#ffWeightField').hidden && value && Number.isFinite(+value) ? { ...file, weight: Math.max(file.axis[0], Math.min(file.axis[1], Math.round(+value))) } : file;
}
/* Read local-font axes after permission to enumerate local fonts grants access to their files. */
export const localData = new Map(), localAxes = new Map(), localStyle = new Map();      // Full font name -> FontData; -> detected axes (undefined = reading); -> OS/2 style.
export function localAxesOf(name) {
  if (localAxes.has(name)) return localAxes.get(name);
  const fd = localData.get(name);
  if (!fd) return null;
  localAxes.set(name, undefined);
  fd.blob().then(b => b.arrayBuffer()).then(async buf => {
    localAxes.set(name, await fileAxes(buf)); localStyle.set(name, await fileStyle(buf));
    if (pickTab === 'local' && $('#lfName').value.trim() === name) updateCand();
  }, () => localAxes.set(name, null));
  return undefined;
}
/* ================= Other variation axes, excluding weight/italics: apply to every weight of this class ================= */
export let pickVary = {};
export const axStep = (lo, hi) => hi - lo <= 2 ? 0.01 : hi - lo <= 30 ? 0.1 : 1;
export function renderAxes() {
  const box = $('#pkAxes'), f = pickCand, ax = f ? extraAxes(f) : [];
  box.hidden = !ax.length && !f?.axesUnknown;
  if (box.hidden) return applySampleAxes();
  let body = `<p class="hint">${esc(T('axUnknown'))}</p>`;
  if (ax.length) {
    const g = f.kind === 'google';
    /* Show common axes first (width, optical size, grade, slant); collapse the mostly parametric axes under More, expanding when customized. */
    const MAIN = ['wdth', 'opsz', 'GRAD', 'slnt'], rank = t => MAIN.includes(t) ? MAIN.indexOf(t) : 9;
    const sorted = [...ax].sort((x, y) => rank(x[0]) - rank(y[0]) || (x[0] < y[0] ? -1 : 1));
    const main = sorted.filter(a => MAIN.includes(a[0])), more = sorted.filter(a => !MAIN.includes(a[0]));
    const row = ([t, lo, hi, def]) => {
      const v = pickVary[t], st = axStep(lo, hi), lab = esc(axisLabel(t));
      const name = `<span class="ax-name">${lab}<small>${esc(t)} · ${lo}–${hi}</small></span>`;
      const ctl = val => `<input type="range" data-ax="${t}" min="${lo}" max="${hi}" step="${st}" value="${val}" aria-label="${lab}"><input type="number" data-ax="${t}" min="${lo}" max="${hi}" step="${st}" value="${val}" aria-label="${lab}">`;
      if (t === 'opsz') {      // Google optical size is fixed at its default unless set to follow font size (retain the axis in the file) or to a fixed value.
        const mode = typeof v === 'number' ? 'fix' : v === 'auto' || !g ? 'auto' : 'def';
        const opts = [...(g ? [['def', T('axOpszOff', { d: def })]] : []), ['auto', T('axOpszAuto')], ['fix', T('axFix')]];
        return `<div class="ax-row mode${mode === 'fix' ? ' fix' : ''}">${name}<select class="ax-mode" data-axmode="${t}" aria-label="${lab}">${opts.map(([k, l]) => `<option value="${k}"${k === mode ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${mode === 'fix' ? ctl(v) : ''}</div>`;
      }
      return `<div class="ax-row">${name}${ctl(typeof v === 'number' ? v : def)}<button type="button" class="btn-text" data-axreset="${t}"${typeof v === 'number' ? '' : ' disabled'}>${esc(T('axReset'))}</button></div>`;
    };
    const rest = main.length ? more : [];
    body = `<p class="hint">${esc(T(g ? 'axNoteG' : 'axNote'))}</p>` + (main.length ? main : more).map(row).join('') +
      (rest.length ? `<details class="ax-more"${rest.some(a => a[0] in pickVary) ? ' open' : ''}><summary>${esc(T('axMore', { n: rest.length }))}</summary><div class="ax-body">${rest.map(row).join('')}</div></details>` : '');
  }
  box.innerHTML = `<summary><b>${esc(T('axHead'))}</b><span class="ax-sum"></span></summary><div class="ax-body">${body}</div>`;
  updateAxSum();
  applySampleAxes();
}
/* Collapsed summaries still show adjusted axes, such as optical size following size and width 80; otherwise show the axis count and default status. */
export function updateAxSum() {
  const el = $('#pkAxes .ax-sum'), f = pickCand; if (!el || !f) return;
  const n = extraAxes(f).length, list = Object.entries(pickVary).filter(([t]) => axisOf(f, t)).map(([t, v]) => `${axisLabel(t)} ${v === 'auto' ? T('axOpszAuto') : v}`);
  el.textContent = list.length ? list.join(' · ') : n ? T('axNone', { n }) : '';
}
/* The picker preview loads Google files retaining every axis and applies edits directly through font-variation-settings. */
export function applySampleAxes() {
  const f = pickCand, parts = [];
  for (const [t, , , def] of f ? extraAxes(f) : []) {
    const v = pickVary[t];
    if (typeof v === 'number') parts.push(`"${t}" ${v}`);
    else if (t === 'opsz' && f.kind === 'google' && v !== 'auto') parts.push(`"opsz" ${def}`);
  }
  if (pickerWeightAxis(f)) parts.unshift(`"wght" ${pickerProofWeight}`);
  $('#pkSample').style.fontVariationSettings = parts.join(', ');
  $('#pkSample').style.fontWeight = String(pickerProofWeight);
  $('#pkSample').style.fontSynthesis = 'none';
}
export const previewFont = f => f?.kind === 'google' && extraAxes(f).length ? { ...f, xa: extraAxes(f).map(a => a[0]).sort() } : f;
export const cleanVary = f => { const o = Object.fromEntries(Object.entries(pickVary).filter(([t]) => axisOf(f, t))); return Object.keys(o).length ? o : undefined; };
/* Which font to use for this face's italic export. */
export function renderItal() {
  const el = $('#pkItal'), f = pickCand;
  el.hidden = !state.italic || !f;
  if (el.hidden) return;
  if (f.kind === 'local' && italicLocal(f) === undefined) { el.textContent = T('pkItalChecking'); setTimeout(() => { if (pickCand === f) renderItal(); }, 400); return; }
  const it = italOf(f);
  el.textContent = !it ? T('pkItalNo') : it.slant ? T('pkItalSlant', { t: it.slant, v: it.slant === 'slnt' ? axisOf(f, 'slnt')[1] : 1 })
    : T('pkItalYes', { name: it.kind === 'google' ? `${it.family} Italic` : it.kind === 'local' ? it.name : it.fileName || it.path });
}
/* ================= Character coverage ================= */
/* Sample representative characters per set, including distinct Simplified, Traditional and Japanese Han forms. */
export const COV_SETS = [
  ['covLatin', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'],
  ['covPinyin', 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü'],      // If a Western font lacks Pinyin letters, individual letters fall back to later fonts.
  ['covDigit', '0123456789'],
  ['covKana', 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンー'],
  ['covSC', '这们说时对过学发会经实现进动应头书长马门问间东车见风让认识语读谁调谈网样个钱'],
  ['covTC', '這們說時對過學發會經實現進動應頭書長馬門問間東車見風讓認識語讀誰調談網樣個錢'],
  ['covJP', '円気駅図県様広応戦鉄売読楽薬弁両帰稲鉱塩'],
  ['covHK', '嘅咗嚟啲冇佢喺嘢噉咁哋睇攞乜嗰𠝹𨋢'],      // Cantonese characters; the last two are in Extension B (HKSCS).
  ['covKR', '가나다라마바사아자차카타파하한글'],
  ['covSym', '①②③※→℃○■△◎★〒'],
];
/* Find missing characters. Google Fonts uses subset unicode-range coverage. For local/uploaded fonts, append a 616-byte blank font
   mapping all characters to zero-width empty glyphs; unsupported source characters then measure as zero width. */
export const BLANK_FONT = 'data:font/ttf;base64,AAEAAAAKAIAAAwAgT1MvMlQEUR0AAACsAAAAYGNtYXAAIrhhAAABDAAAADRnbHlmAAAAAAAAAUAAAAAMaGVhZF8eQOUAAAFMAAAANmhoZWEDIf87AAABhAAAACRobXR4AAAAAAAAAagAAAAIbG9jYQAGAAYAAAGwAAAABm1heHAAAwACAAABuAAAACBuYW1lBcMVaQAAAdgAAABucG9zdP+fADIAAAJIAAAAIAAEAAABkAAFAAAAAAAAAAAAAAAAAAAAAAAAADIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABOT05FAEAAIP//AyD/OAAAAyAAyAAAAAEAAAAAAAAAAAAAACAAAAAAAAEAAwAKAAAADAANAAAAAAAoAAAAAAAAAAIAAAAgAADX/wAAAAEAAOAAABD//wAAAAEAAAAAAAAAAAAAAAAAAQAAAAEAAC3z3ftfDzz1AAsD6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAgAAAAAAAAABAAADIP84AAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAABgAGAAAAAQAAAAIAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAQANgADAAEECQABAA4AAAADAAEECQACAA4ADgADAAEECQAEAA4AHAADAAEECQAGAA4AKgBDAEYAQgBsAGEAbgBrAFIAZQBnAHUAbABhAHIAQwBGAEIAbABhAG4AawBDAEYAQgBsAGEAbgBrAAAAAwAAAAAAAP+cADIAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
export let blankReady = null;
export function loadBlank() {
  blankReady ||= new FontFace('__cf_blank', `url(${BLANK_FONT})`).load().then(f => { document.fonts.add(f); return true; }, () => false);
  return blankReady;
}
export async function missingIn(s, chars) {
  if (s.font.kind === 'google') {
    const all = s.faces.flatMap(fc => fc.range || [[0, 0x10FFFF]]).sort((a, b) => a[0] - b[0]), merged = [];
    for (const r of all) { const l = merged[merged.length - 1]; if (l && r[0] <= l[1] + 1) l[1] = Math.max(l[1], r[1]); else merged.push([...r]); }
    return new Set(chars.filter(c => !inRanges(merged, c.codePointAt(0))));
  }
  if (!(await loadBlank())) return new Set();
  try { await document.fonts.load(`32px "${s.family}"`, chars.join('')); } catch (e) { /* Check normally. */ }
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `32px "${s.family}", "__cf_blank"`;
  return new Set(chars.filter(c => ctx.measureText(c).width === 0));
}
export let covTok = 0;
export async function renderCoverage(s, f) {
  const tok = ++covTok, box = $('#pkCov'), sample = $('#pkSample');
  const text = sample.dataset.text || sample.textContent;
  const sampleChars = [...new Set([...text].filter(c => c.trim() && c !== '·'))];
  const targetChars = [...new Set([...(state.view.text || '')].filter(c => c.trim() && pickerOwns(c)))];
  const miss = await missingIn(s, [...new Set([...COV_SETS.flatMap(([, cs]) => [...cs]), ...sampleChars, ...targetChars])]);
  if (tok !== covTok || pickCand !== f) return;
  const targetMissing = targetChars.filter(ch => miss.has(ch)), targetNote = $('#pkTargetCoverage');
  targetNote.textContent = targetChars.length ? targetMissing.length ? T('pkTargetMissing', { n: targetMissing.length, chars: targetMissing.slice(0, 20).join('') + (targetMissing.length > 20 ? '…' : '') }) : T('pkTargetOk', { n: targetChars.length }) : '';
  targetNote.className = targetMissing.length ? 'callout' : 'hint';
  box.innerHTML = COV_SETS.map(([k, cs]) => {
    const list = [...cs], have = list.filter(c => !miss.has(c)).length;
    const cls = have === list.length ? 'ok' : have ? 'part' : 'none';
    const mark = cls === 'ok' ? ' ✓' : cls === 'part' ? ` ${have}/${list.length}` : '';
    return `<span class="cov ${cls}" title="${esc(T('covTitle', { n: list.length, k: have }))}">${esc(T(k))}${mark}</span>`;
  }).join('') + (sampleChars.some(c => miss.has(c)) ? `<span class="cov-note"><i></i>${esc(T('covMiss'))}</span>` : '');
  sample.innerHTML = [...text].map(c => miss.has(c) ? `<span class="miss">${esc(c)}</span>` : esc(c)).join('');
}
/* Also show whether picker punctuation is centered (Taiwan/Hong Kong) or lower-left (Mainland/Japan); warn when it differs from the current language. */
export function renderPunct(s, f) {
  const el = $('#pkPunct'), lang = state.typo.lang, want = REGION_OF_LANG[lang], pos = punctPos(s, lang);
  if (pos === undefined) { el.hidden = true; setTimeout(() => { if (pickCand === f) renderPunct(s, f); }, 300); return; }
  el.hidden = !pos;
  if (!pos) return;
  el.textContent = T(pos === 'center' ? 'pkPunctCenter' : 'pkPunctCorner');
  el.classList.toggle('bad', want in PUNCT_CENTER && (pos === 'center') !== PUNCT_CENTER[want]);
}
export function resetCoverage() {
  $('#pkPunct').hidden = true;
  covTok++;
  $('#pkCov').innerHTML = ''; $('#pkTargetCoverage').textContent = '';
  const sample = $('#pkSample');
  if (sample.dataset.text) sample.textContent = sample.dataset.text;
}
function pickerWeightAxis(f) { return f && (f.kind === 'google' ? f.family in vfCache ? Array.isArray(vfCache[f.family]) ? vfCache[f.family] : null : axisOf(f, 'wght')?.slice(1, 3) : f.axis); }
function syncPickerProof(f) {
  const axis = pickerWeightAxis(f), weights = f?.kind === 'google' ? gfWeights(f.family) : null;
  const key = f ? fontKey(f) + '|' + (f.weight || 400) : '';
  if (key !== pickerProofKey) { pickerProofKey = key; pickerProofWeight = f?.weight || 400; }
  if (axis) pickerProofWeight = Math.max(axis[0], Math.min(axis[1], pickerProofWeight));
  else if (weights?.length) pickerProofWeight = weights.reduce((a, b) => Math.abs(b - pickerProofWeight) < Math.abs(a - pickerProofWeight) ? b : a);
  $('#pkPreviewTools').hidden = !f;
  $('#pkProofWeight').hidden = !axis; $('#pkProofWeightNum').hidden = !axis;
  $('#pkProofWeightSelect').hidden = !!axis || !weights?.length;
  $('#pkProofStyle').hidden = !!axis || !!weights?.length;
  if (axis) for (const el of [$('#pkProofWeight'), $('#pkProofWeightNum')]) { el.min = axis[0]; el.max = axis[1]; el.value = pickerProofWeight; }
  if (weights?.length) { $('#pkProofWeightSelect').innerHTML = weights.map(w => `<option value="${w}">${w}</option>`).join(''); $('#pkProofWeightSelect').value = pickerProofWeight; }
  picker.querySelectorAll('[data-proof-weight]').forEach(el => { const w = +el.dataset.proofWeight; el.hidden = axis ? w < axis[0] || w > axis[1] : !weights?.includes(w); });
  $('#ffWeightField').hidden = f?.kind !== 'file' || !f.axis;
  if (f?.kind === 'file' && f.axis) { const input = $('#ffWeightNum'); input.min = f.axis[0]; input.max = f.axis[1]; input.value = f.weight || 400; }
  const target = pickW && (sameFontAs(f, objOf(pickTarget).font) || picker.querySelector('[name="pkScope"]:checked')?.value === 'w') ? pickW : 400;
  $('#pkWeightMapping').textContent = f && (f.kind === 'google' || axis) ? T('pkWeightMapping', { weight: f.weight || 400, target }) : '';
}
function setPickerProof(value) {
  if (!pickCand || !Number.isFinite(value)) return;
  const axis = pickerWeightAxis(pickCand);
  if (axis && (value < axis[0] || value > axis[1])) return;
  pickerProofWeight = value; syncPickerProof(pickCand); applySampleAxes(); paintPickerCandidate();
}
export function updateCand() {
  const f = candFromFields();
  pickCand = f;
  updateScope(); syncPickerProof(f);
  renderAxes(); renderItal();
  $('#ffItalField').hidden = f?.kind !== 'file';
  $('#ffName').textContent = f?.kind === 'file' ? f.fileName : T('ffHint');
  $('#ffItalName').textContent = f?.italic?.fileName || '';
  paintPickerCandidate();
}
function paintPickerCandidate() {
  if (pickerApplyBusy) return;
  const f = pickCand, token = ++pickerPreviewToken;
  const ok = $('#pkOk'), st = $('#pkStatus'), sample = $('#pkSample');
  /* Show specimens only when the font is available. Rendering complete UI-font text before selection, during checks or after failure would imply false coverage. */
  st.classList.remove('caution'); sample.hidden = true; showVfTag(null); resetCoverage();
  if (!f) { ok.disabled = true; st.textContent = T('pkEmpty'); sample.style.fontFamily = 'var(--ui)'; return; }
  const axis = pickerWeightAxis(f);
  const viewed = f.kind === 'google' ? { ...f, ...(axis ? { vf: true } : gfWeights(f.family) ? { weight: pickerProofWeight } : {}) } : f;
  const s = source(previewFont(viewed), { retry: true });
  ok.disabled = true; st.textContent = T('pkChecking'); sample.style.fontFamily = 'var(--ui)';
  s.promise.then(async () => {
    if (pickCand !== f || token !== pickerPreviewToken || pickerApplyBusy) return;
    if (s.status === 'ok') {
      try { await document.fonts.load(`32px "${s.family}"`, sample.dataset.text || sample.textContent); }
      catch (error) { if (token === pickerPreviewToken) { st.textContent = T('pkPreviewUnavailable'); st.classList.add('caution'); } return; }
      if (pickCand !== f || token !== pickerPreviewToken || pickerApplyBusy) return;
      sample.style.fontFamily = `"${s.family}", var(--ui)`;
      sample.hidden = false;
      st.textContent = f.kind === 'google' ? T('pkGoogleOk', { n: s.faces.length }) : f.kind === 'local' ? T('pkLocalOk') : T('pkFileOk');
      const ax = f.kind === 'google' ? null : f.axis;
      showVfTag(ax);
      if (f.kind === 'google') vfAxis(f.family).then(a => { if (pickCand === f) showVfTag(a); });
      renderCoverage(s, f);
      renderPunct(s, f);
      ok.disabled = false;
    } else {
      st.textContent = srcError(s) + (f.kind === 'local' ? T('pkLocalStill') : '');
      st.classList.add('caution');
      ok.disabled = f.kind !== 'local';
    }
  });
}
export const updateCandSoon = debounce(updateCand, 700);
/* Strip weight suffixes, such as W3 or Bold, from local names when checking family identity. */
export const localStem = n => n.replace(/\bW\d$/, '').replace(WORD_RE, '').trim().toLowerCase();
/* Check whether this is the row's original font, possibly at another weight, name or file. */
export const sameFontAs = (c, base) => !!c && !!base && c.kind === base.kind && (c.kind === 'google' ? c.family === base.family : c.kind === 'local' ? localStem(c.name) === localStem(base.name) : c === base || !!c.fileId && c.fileId === base.fileId);
export function updateScope() {
  const show = !!pickW && !!pickCand && !sameFontAs(pickCand, objOf(pickTarget).font);
  $('#pkScope').hidden = !show;
}
/* Google weight controls: numeric fields over the wght range for variable fonts; a 100-900 menu for others. */
/* Variable-font badge, for example 'VF 400-800', with a hover explanation. */
export function showVfTag(axis) {
  const tag = $('#pkVfTag');
  tag.hidden = !axis;
  if (axis) { tag.textContent = `VF ${axis[0]}–${axis[1]}`; tag.title = T('pkVf', { a: axis[0], b: axis[1] }); }
}
export function syncGfWeight() {
  const fam = $('#gfFamily').value.trim(), sel = $('#gfWeight'), num = $('#gfWeightNum');
  const axis = fam && fam in vfCache ? vfCache[fam] || null : null;
  if (fam && !(fam in vfCache)) vfAxis(fam).then(() => { if ($('#gfFamily').value.trim() !== fam) return; const before = gfWeightVal(); syncGfWeight(); if (picker.open && pickTab === 'google' && before !== gfWeightVal()) updateCand(); });
  const raw = num.hidden ? sel.value : num.value, wanted = +raw || 400;
  if (axis) {
    num.value = pickW && (!raw || +raw === 0) ? '' : Math.max(axis[0], Math.min(axis[1], wanted));
    num.min = axis[0]; num.max = axis[1]; num.title = T('vfTitle', { a: axis[0], b: axis[1] });
    if (pickW) { const base = objOf(pickTarget).font, auto = base?.family === fam ? fontAtWeight(base, pickW).weight : picker.querySelector('[name="pkScope"]:checked')?.value === 'all' ? 400 : pickW; num.placeholder = Math.max(axis[0], Math.min(axis[1], auto)); }
  } else {
    const available = gfWeights(fam) || WEIGHTS, base = pickTarget && objOf(pickTarget).font;
    const hasAuto = !!pickW && base?.kind === 'google';
    const automatic = pickW && base?.family === fam ? fontAtWeight(base, pickW).weight : picker.querySelector('[name="pkScope"]:checked')?.value === 'all' ? 400 : pickW || 400;
    const nearest = value => available.reduce((a, b) => Math.abs(b - value) < Math.abs(a - value) ? b : a);
    const auto = nearest(automatic);
    sel.innerHTML = available.map(w => `<option value="${hasAuto && w === auto ? 0 : w}">${w}${hasAuto && w === auto ? ' · ' + esc(T('wAutoTag')) : ''}</option>`).join('');
    sel.value = hasAuto && (!raw || +raw === 0 || nearest(wanted) === auto) ? '0' : String(nearest(wanted));
  }
  num.hidden = !axis; sel.hidden = !!axis;
}
export function gfWeightVal() {
  const num = $('#gfWeightNum');
  if (num.hidden) return +$('#gfWeight').value;
  if (num.value.trim() === '') return 0;          // Empty means automatic in per-weight editing, otherwise 400.
  return Math.min(+num.max || 900, Math.max(+num.min || 100, Math.round(+num.value)));
}
export function openPicker(t, W = BASE_W) {      // W is the target weight when opening from a weight row.
  pickTarget = t;
  $('#pkAutoFitField').hidden = t.type === 'class' && t.id === 'han'; $('#pkAutoFit').checked = true;
  const o = objOf(t), key = keyOf(t);
  pickerProofKey = ''; $('#ffWeightField').hidden = true;
  pickVary = { ...(o.vary || {}) };
  $('#pkAxes').open = Object.keys(pickVary).length > 0;      // Expand axes when customized; otherwise collapse them.
  pickW = W !== BASE_W && !o.follow && o.font ? W : null;
  const name = t.type === 'class' ? tr(CLS[t.id].name) : T('customName', { c: state.custom[t.i].chars || '…' });
  $('#pkFor').textContent = '· ' + name + (pickW ? ' · ' + T('pkForW', { w: W }) : '');
  picker.querySelectorAll('[data-src]').forEach(b => { b.hidden = false; });
  const cur = resolvedOf(t).font, k = pickW ? fontKey(o.font) + '|' + W : '';
  const ovf = pickW ? state.wOver[W]?.[key]?.font : null;      // This step already has its own replacement font.
  $('#pkScopeW').textContent = T('pkScopeW', { w: W });
  picker.querySelector(`[name="pkScope"][value="${pickW ? 'w' : 'all'}"]`).checked = true;      // When opened from a weight row, default to replacing only that weight.
  /* Normally choose a Google weight; per-weight editing adds Automatic first and keeps the family fixed. */
  let wOpts = WEIGHTS.map(w => `<option value="${w}">${w}</option>`).join('');
  if (pickW && o.font.kind === 'google') {      // Use 0 for the derived step (no override); list only actual available weights otherwise.
    const autoF = fontAtWeight(o.font, W), auto = sources.get(fontKey(autoF))?.actualWeight || autoF.weight;
    wOpts = (gfWeights(o.font.family) || WEIGHTS).map(w => w === auto ? `<option value="0">${w} · ${esc(T('wAutoTag'))}</option>` : `<option value="${w}">${w}</option>`).join('');
  }
  $('#gfWeight').innerHTML = wOpts;
  $('#gfFamily').value = ovf?.kind === 'google' ? ovf.family : pickW ? (o.font.kind === 'google' ? o.font.family : '') : cur?.kind === 'google' ? cur.family : '';
  const wWant = ovf?.kind === 'google' ? ovf.weight : pickW ? (state.wOver[W]?.[key]?.weight || 0) : cur?.kind === 'google' ? cur.weight : 400;
  $('#gfWeight').value = wWant;
  $('#gfWeightNum').value = wWant || '';
  $('#gfWeightNum').placeholder = pickW && o.font.kind === 'google' ? fontAtWeight(o.font, W).weight : '';
  syncGfWeight();
  const autoName = pickW && o.font.kind === 'local' ? autoLocal(o.font, W).name : '';
  $('#lfName').placeholder = pickW ? autoName : T('lfPh');
  $('#lfVar').checked = !!(ovf || cur)?.axis && (ovf || cur)?.kind === 'local';
  $('#lfName').value = ovf?.kind === 'local' ? ovf.name : pickW ? (state.weightNames[k] || autoName) : cur?.kind === 'local' ? cur.name : '';
  $('#ffPathField').hidden = !(pickW && o.font.kind === 'file');
  if (pickW && o.font.kind === 'file') { const g = guessPath(o.font.fileName, W); $('#ffPath').placeholder = g; $('#ffPath').value = state.weightNames[k] || g; }
  fileImportToken++; $('#ffSearch').value = ''; $('#ffError').textContent = ''; $('#ffError').hidden = true;
  $('#ffFile').value = ''; $('#ffItal').value = '';
  $('#lfFamilySearch').value = ''; $('#lfManual').open = false;
  $('#lfMsg').hidden = true; $('#lfMsg').classList.remove('caution');
  const rowFont = pickW ? (t.type === 'class' ? resolveCls(t.id, W, true) : resolveCustom(o, W, true)).font : cur;
  pickCand = ovf?.kind === 'file' ? ovf : rowFont?.kind === 'file' ? rowFont : null;
  pickerSampleMode = 'class'; pickerCustomText = pickerClassSample(); $('#pkSampleSize').value = 32; $('#pkSample').style.fontSize = '32px'; renderPickerSample();
  pickCatalog = catalogOrder(t.type === 'class' ? t.id : 'custom', state.typo.lang, cur?.kind === 'google' ? cur.family : '');
  $('#gfSearch').value = ''; $('#gfStyle').value = ''; $('#gfBold').checked = false; renderCatalog();
  picker.showModal();
  setPickTab(pickW ? (ovf || o.font).kind : cur?.kind || 'google');
  if (pickTab === 'google') $('#gfSearch').focus();
}
/* Build the proposed configuration off-screen. Measurement never changes live settings, so Cancel and a failed check preserve the user's work. */
function applyPickerChoice(st, d) {
  const o = d.key[0] === '#' ? st.custom[+d.key.slice(1)] : st.classes[d.key], c = d.font;
  const same = d.W && sameFontAs(c, o.font), only = d.W && !same && d.scope === 'w';
  if (only) {
    const ov = ((st.wOver[d.W] ||= {})[d.key] ||= {});
    ov.font = c.kind === 'google' ? G(c.family, d.weight || d.W) : c; delete ov.weight;
    if (d.vary) o.vary = { ...(o.vary || {}), ...d.vary };
  } else if (same) {
    delete st.wOver[d.W]?.[d.key]?.font;
    o.vary = d.vary;
    if (o.font.kind === 'google' || o.font.kind === 'file' && o.font.axis) {
      const v = o.font.kind === 'google' ? d.weight : c.weight, ov = ((st.wOver[d.W] ||= {})[d.key] ||= {});
      if (v && (o.font.kind === 'google' || v !== fontAtWeight(o.font, d.W, true).weight)) ov.weight = v; else delete ov.weight;
    } else {
      const k = fontKey(o.font) + '|' + d.W;
      if (d.name && d.name !== d.placeholder) st.weightNames[k] = d.name; else delete st.weightNames[k];
    }
  } else {
    if (d.W) delete st.wOver[d.W]?.[d.key]?.font;
    o.follow = null; o.font = d.W && c.kind === 'google' && !d.weight ? G(c.family, 400) : c; o.vary = d.vary;
  }
  return !!(same || only);
}
function resolvePickerDraft(st, key, W, depth = 0) {
  const o = key[0] === '#' ? st.custom[+key.slice(1)] : st.classes[key], ov = W !== BASE_W ? st.wOver[W]?.[key] : null;
  if (o.follow && depth < 4) {
    const r = resolvePickerDraft(st, o.follow, W, depth + 1);
    return { ...r, size: ov?.size ?? o.size ?? r.size, shift: o.shift ?? r.shift };
  }
  // Static installed faces use draft names; the normal resolver reads live state for these names.
  const font = W !== BASE_W && !ov?.font && o.font?.kind === 'local' && !o.font.axis
    ? L(st.weightNames[fontKey(o.font) + '|' + W] || autoLocal(o.font, W).name) : ownFontAt(o, ov, W, true);
  return { font: st.wmode === 'cont' && Array.isArray(vfAxisNow(font)) ? { ...font, weight: W } : font,
    size: ov?.size ?? o.size ?? 100, shift: o.shift ?? 0, vary: o.vary || null };
}
function setPickerApplyBusy(busy) {
  pickerApplyBusy = busy;
  picker.querySelector('.pk-workspace').inert = busy; picker.querySelector('.tabs').inert = busy; $('#pkScope').inert = busy;
  $('#pkAutoFit').disabled = busy; $('#pkOk').disabled = busy; $('#pkOk').textContent = T(busy ? 'pkMatching' : 'pkUse');
  if (busy) $('#pkOk').setAttribute('aria-busy', 'true'); else $('#pkOk').removeAttribute('aria-busy');
}
async function applyPicker() {
  if (!pickCand || !pickTarget || pickerApplyBusy) return;
  const name = pickCand.kind === 'local' ? $('#lfName') : $('#ffPath');
  const d = { key: keyOf(pickTarget), font: structuredClone(pickCand), W: pickW,
    scope: picker.querySelector('[name="pkScope"]:checked')?.value, weight: gfWeightVal(), vary: cleanVary(pickCand), name: name.value.trim(), placeholder: name.placeholder };
  const token = ++pickerApplyToken, snapshot = histSnap(), draft = JSON.parse(JSON.stringify(state)), onlyStep = applyPickerChoice(draft, d);
  const cont = draft.wmode === 'cont', list = onlyStep ? [d.W] : [...new Set([BASE_W, ...(cont ? WEIGHTS.filter(W => stepSpan(W)) : draft.weights)])].sort((a, b) => a - b);
  let fits, notice = '';
  if (!$('#pkAutoFitField').hidden && $('#pkAutoFit').checked) {
    setPickerApplyBusy(true);
    const target = autoTargets(draft).find(t => t.key === d.key), fitter = createFitter();
    try {
      if (target?.ref && (target.key === 'latin' || target.sample)) {
        const rows = [];
        for (const W of list) {
          $('#pkOk').textContent = T('autoAdjProgress', { i: rows.length + 1, n: list.length });
          const han = resolvePickerDraft(draft, target.ref, W), latin = resolvePickerDraft(draft, target.key, W);
          if (!sameFitFont(han.font, latin.font)) rows.push(await fitter.fit({ ...target, W, han, latin }, !cont));
          if (token !== pickerApplyToken || !picker.open) return;
          if (histSnap() !== snapshot) { toast(T('autoCancelled')); return; }
        }
        if (rows.length && rows.every(r => r.candidates.length)) fits = chooseFits(rows);
        else notice = rows.length ? T('autoSkipped', { classes: keyName(d.key) }) : T('autoSameFont');
      } else notice = T('autoSkipped', { classes: keyName(d.key) });
    } catch (error) { console.warn('Picker auto-fit failed', error); notice = T('autoSkipped', { classes: keyName(d.key) }); }
    finally { fitter.dispose(); if (token === pickerApplyToken) setPickerApplyBusy(false); }
  }
  if (token !== pickerApplyToken || !picker.open || histSnap() !== snapshot) return;
  recordHistory(); // Font selection, matching and export trimming form a single undo step.
  applyPickerChoice(state, d);
  if (fits?.size) applyFitResults(d.key, fits, list, cont);
  picker.close();
  const trimmed = changed({ fonts: true, fontChange: true }); refresh('export');
  if (notice) toast([notice, trimmed].filter(Boolean).join(' '));
}
export function initPicker() {
  $('#pkSampleMode').addEventListener('click', e => { const el = e.target.closest('[data-pk-sample]'); if (!el) return; pickerSampleMode = el.dataset.pkSample; renderPickerSample(); paintPickerCandidate(); });
  $('#pkSampleMode').addEventListener('keydown', e => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); const els = [...e.currentTarget.querySelectorAll('button:not(:disabled)')], i = els.indexOf(e.target), next = e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + els.length) % els.length; els[next].click(); els[next].focus(); });
  $('#pkSampleText').addEventListener('input', debounce(() => { pickerCustomText = $('#pkSampleText').value; $('#pkSample').textContent = $('#pkSample').dataset.text = pickerCustomText; paintPickerCandidate(); }, 200));
  $('#pkSampleSize').addEventListener('input', e => { const size = +e.target.value; if (size >= 8 && size <= 96) $('#pkSample').style.fontSize = size + 'px'; });
  $('#pkSampleSize').addEventListener('blur', e => { const size = Math.max(8, Math.min(96, +e.target.value || 32)); e.target.value = size; $('#pkSample').style.fontSize = size + 'px'; });
  for (const id of ['pkProofWeight', 'pkProofWeightNum', 'pkProofWeightSelect']) $('#'+id).addEventListener('input', e => { if (e.target.value !== '') setPickerProof(+e.target.value); });
  $('#pkProofWeightNum').addEventListener('blur', () => syncPickerProof(pickCand));
  picker.querySelectorAll('[data-proof-weight]').forEach(el => el.addEventListener('click', () => setPickerProof(+el.dataset.proofWeight)));
  $('#ffWeightNum').addEventListener('change', updateCand);
  $('#pkScope').addEventListener('change', () => { syncGfWeight(); updateCand(); });
  $('#lfFamilySearch').addEventListener('input', renderLocalFonts);
  $('#lfOptions').addEventListener('click', e => { const el = e.target.closest('[data-local-family]'); if (el) selectLocalFamily(el.dataset.localFamily); });
  $('#lfOptions').addEventListener('keydown', e => { if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); const els = [...e.currentTarget.querySelectorAll('[data-local-family]')], i = els.indexOf(e.target.closest('[data-local-family]')), n = e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : Math.max(0, Math.min(els.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); els.forEach((el, j) => { el.tabIndex = j === n ? 0 : -1; }); els[n]?.focus(); });
  $('#lfFace').addEventListener('change', () => { $('#lfName').value = $('#lfFace').value; updateCand(); });
  $('#gfSearch').addEventListener('input', renderCatalog);
  $('#gfSearch').addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); $('#gfOptions [tabindex="0"]')?.focus(); } });
  $('#gfStyle').addEventListener('change', renderCatalog); $('#gfBold').addEventListener('change', renderCatalog);
  $('#gfOptions').addEventListener('click', e => { const el = e.target.closest('[data-family]'); if (el) chooseCatalog(el.dataset.family); });
  $('#gfOptions').addEventListener('keydown', e => {
    const options = [...e.currentTarget.querySelectorAll('[data-family]')], i = options.indexOf(e.target.closest('[data-family]'));
    const next = e.key === 'ArrowDown' ? Math.min(options.length - 1, i + 1) : e.key === 'ArrowUp' ? Math.max(0, i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : null;
    if (next != null) { e.preventDefault(); options.forEach((el, j) => { el.tabIndex = j === next ? 0 : -1; }); options[next]?.focus(); }
  });
  $('#gfTry').addEventListener('click', () => chooseCatalog($('#gfSearch').value.trim()));
  picker.addEventListener('close', () => { pickerApplyToken++; setPickerApplyBusy(false); fileImportToken++; catalogObserver?.disconnect(); localObserver?.disconnect(); fileObserver?.disconnect(); });
  picker.querySelectorAll('[data-src]').forEach(b => b.addEventListener('click', () => setPickTab(b.dataset.src)));
  $('#gfFamily').addEventListener('input', updateCandSoon);
  $('#gfFamily').addEventListener('change', () => { syncGfWeight(); updateCand(); });
  $('#gfWeight').addEventListener('change', updateCand);
  $('#gfWeightNum').addEventListener('input', updateCandSoon);
  $('#gfWeightNum').addEventListener('change', () => { if ($('#gfWeightNum').value.trim()) $('#gfWeightNum').value = gfWeightVal(); updateCand(); });
  $('#lfName').addEventListener('input', updateCandSoon);
  $('#lfName').addEventListener('change', updateCand);
  $('#lfVar').addEventListener('change', updateCand);
  $('#ffFile').addEventListener('change', e => acceptFontFiles([...e.target.files]));
  $('#ffSearch').addEventListener('input', renderImportedFonts);
  $('#ffOptions').addEventListener('click', e => { const el = e.target.closest('[data-imported]'); if (el) chooseImported(el.dataset.imported); });
  $('#ffOptions').addEventListener('keydown', e => { if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); const els = [...e.currentTarget.querySelectorAll('[data-imported]')], i = els.indexOf(e.target.closest('[data-imported]')), n = e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : Math.max(0, Math.min(els.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); els.forEach((el, j) => { el.tabIndex = j === n ? 0 : -1; }); els[n]?.focus(); });
  $('#ffDrop').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.classList.add('dragging'); });
  $('#ffDrop').addEventListener('dragleave', e => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('dragging'); });
  $('#ffDrop').addEventListener('drop', e => { e.preventDefault(); e.currentTarget.classList.remove('dragging'); acceptFontFiles([...e.dataTransfer.files]); });
  /* Attach the italic file to this uploaded font; italic export uses it for this class, deriving other weights by filename. */
  $('#ffItal').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file || pickCand?.kind !== 'file') return;
    const id = 'f' + Date.now().toString(36) + 'i', buffer = await file.arrayBuffer();
    files.set(id, { name: file.name, buffer });
    pickCand = { ...pickCand, italic: setFontAxes({ fileId: id, fileName: file.name }, await fileAxes(buffer), pickCand.weight) };
    rememberImportedFont(pickCand); updateCand();
  });
  const axBox = $('#pkAxes');
  axBox.addEventListener('input', e => {
    const t = e.target.dataset.ax; if (!t || e.target.value === '') return;
    const a = axisOf(pickCand, t); if (!a) return;
    const v = Math.min(a[2], Math.max(a[1], +e.target.value));
    if (v === a[3] && t !== 'opsz') delete pickVary[t]; else pickVary[t] = v;
    axBox.querySelectorAll(`[data-ax="${t}"]`).forEach(el => { if (el !== e.target) el.value = v; });
    const rb = axBox.querySelector(`[data-axreset="${t}"]`); if (rb) rb.disabled = !(t in pickVary);
    updateAxSum(); applySampleAxes();
  });
  axBox.addEventListener('change', e => {
    const t = e.target.dataset.axmode; if (!t) return;
    const a = axisOf(pickCand, t), m = e.target.value;
    if (m === 'fix') pickVary[t] = a[3]; else if (m === 'auto' && pickCand.kind === 'google') pickVary[t] = 'auto'; else delete pickVary[t];
    renderAxes();
  });
  axBox.addEventListener('click', e => { const t = e.target.closest('[data-axreset]')?.dataset.axreset; if (t) { delete pickVary[t]; renderAxes(); } });
  $('#lfQuery').addEventListener('click', async () => {
    const msg = $('#lfMsg');
    msg.classList.remove('caution'); msg.hidden = false;
    if (!('queryLocalFonts' in window)) { msg.textContent = T('lfNoApi'); msg.classList.add('caution'); $('#lfManual').open = true; return; }
    try {
      msg.textContent = T('lfWait');
      const list = await window.queryLocalFonts();
      const seen = new Set(), opts = []; localFontRecords = [];
      for (const f of list) { if (seen.has(f.fullName)) continue; seen.add(f.fullName); localFontRecords.push(f); localAlt.set(f.fullName, f.postscriptName); localData.set(f.fullName, f); opts.push(`<option value="${esc(f.fullName)}">${esc(f.family)} · ${esc(f.style)}</option>`); }
      $('#lfList').innerHTML = opts.join('');
      msg.textContent = T('lfCount', { n: opts.length });
      renderLocalFonts(); $('#lfFamilySearch').focus();
    } catch (e) {
      msg.textContent = e && e.name === 'SecurityError' ? T('lfSec') : T('lfDenied'); $('#lfManual').open = true;
      msg.classList.add('caution');
    }
  });
  $('#pkCancel').addEventListener('click', () => picker.close());
  $('#pkOk').addEventListener('click', applyPicker);
}

/* ================= UI language ================= */
/* The About table of contents uses subheadings from the current language's content. */
export function renderAboutToc() {
  const body = document.querySelector(`.about-body [data-ui="${UI}"]`); if (!body) return;
  $('#aboutToc').innerHTML = [...body.querySelectorAll('h3')].map((h, i) => { h.id ||= `about-${UI}-${i}`; return `<a href="#${h.id}">${esc(h.textContent)}</a>`; }).join('');
}
export function applyUI() {
  root.lang = UI === 'ja' ? 'ja' : UI === 'tw' ? 'zh-Hant-TW' : UI === 'en' ? 'en' : 'zh-Hans';
  document.title = UI === 'en' ? T('title') : `${T('title')} · Composite Font Studio`;
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = T(el.dataset.t); });
  document.querySelectorAll('[data-th]').forEach(el => { el.innerHTML = T(el.dataset.th); });
  document.querySelectorAll('[data-ta]').forEach(el => el.dataset.ta.split(';').forEach(p => { const [a, k] = p.split(':'); el.setAttribute(a, T(k)); }));
  document.querySelectorAll('[data-ui]').forEach(el => { el.hidden = el.dataset.ui !== UI; });
  renderAboutToc();
  document.querySelectorAll('#moreMenu [data-ui-lang]').forEach(b => { b.setAttribute('aria-checked', b.dataset.uiLang === UI); b.tabIndex = b.dataset.uiLang === UI ? 0 : -1; });
  renderLangOptions(); renderPresetCards(); renderTypoRows(); renderEditor();
  syncToolbar(); renderPreview(); drawSpecimen(); renderExport();
}
$('#moreMenu').addEventListener('click', e => {
  const b = e.target.closest('[data-ui-lang]'); if (!b) return;
  $('#moreMenu').hidePopover();
  setUI(b.dataset.uiLang); lsSet(LS_UI, UI); applyUI();
});
$('#uiLanguages').addEventListener('keydown', e => {
  if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  const buttons = [...e.currentTarget.querySelectorAll('[data-ui-lang]')], i = buttons.indexOf(e.target);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : -1) + buttons.length) % buttons.length;
  setUI(buttons[next].dataset.uiLang); lsSet(LS_UI, UI); applyUI(); buttons[next].focus();
});

/* ================= Other UI ================= */
/* Narrow screens show one pane at a time (editor / proof), switched with bottom tabs. */
export function syncPanes() {
  const mv = state.view.mview === 'preview' ? 'preview' : 'edit';
  $('.app').dataset.mview = mv;
  document.querySelectorAll('#mTabs [data-mv]').forEach(b => b.setAttribute('aria-selected', b.dataset.mv === mv));
}
export let toastT;
export function toast(t) {
  const el = $('#toast');
  clearTimeout(toastT);
  el.classList.remove('on'); el.textContent = t;
  void el.offsetWidth; // Restart slide-in on repeated messages so each new notice attracts attention.
  el.classList.add('on');
  toastT = setTimeout(() => el.classList.remove('on'), 2600);
}

/* Reset requires a confirming second click within 3 seconds; user presets are unaffected. */
export function resetAll() {
  setState(stateFromPreset(PRESETS.find(p => p.id === defaultPresetId())));
  normalizeState();
  refresh('ranges', 'toolbar', 'typoRows', 'editor', 'preview', 'presets', 'fonts');
  toast(T('tReset'));
}
export function initReset() {
  $('#typoReset').addEventListener('click', () => {
    for (const t of TYPO) if (!t.attr && !isFontTypo(t) && !isViewTypo(t)) state.typo[t.key] = typoDef(t);
    refresh('typoRows', 'preview', 'export');
  });
  $('#featReset').addEventListener('click', () => {
    for (const t of TYPO) if (isFontTypo(t)) state.typo[t.key] = typoDef(t);
    const lmWas = state.lineMetrics; state.lineMetrics = 'han';
    if (lmWas !== 'han') rebuild();
    refresh('typoRows', 'preview', 'export');
  });
  $('#resetAll').addEventListener('click', e => armConfirm(e.currentTarget, T('resetConfirm'), () => { $('#moreMenu').hidePopover(); resetAll(); }));
}
export function init() {
  refreshCustomRanges();
  initAppearance(drawSpecimen);
  initToolbar(); initPresets(); initPicker(); initReset(); initFontTab();
  $('#aboutToc').addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); document.getElementById(a.hash.slice(1))?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
  setExKind(state.view.exKind, false); syncPanes();
  $('#aboutBtn').addEventListener('click', () => $('#aboutDlg').showModal());
  $('#aboutItem').addEventListener('click', () => { $('#moreMenu').hidePopover(); $('#aboutDlg').showModal(); });
  $('#aboutClose').addEventListener('click', () => $('#aboutDlg').close());
  /* Align Settings with the gear button's right edge and keep it inside narrow viewports. */
  const positionSettings = () => {
    const pop = $('#moreMenu'); if (!pop.matches(':popover-open')) return;
    const r = $('#moreBtn').getBoundingClientRect();
    pop.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - pop.offsetHeight - 8)) + 'px'; pop.style.left = Math.max(8, r.right - pop.offsetWidth) + 'px';
  };
  $('#moreMenu').addEventListener('toggle', e => {
    $('#moreBtn').setAttribute('aria-expanded', e.newState === 'open');
    if (e.newState === 'open') { e.currentTarget.scrollTop = 0; positionSettings(); }
  });
  window.addEventListener('resize', positionSettings);
  for (const d of ['#aboutDlg', '#exDlg']) $(d).addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });      // Close on a click outside the dialog, on its backdrop.
  applyUI();
  initSplit(); initSpecSplit(); initHistory(); initTips(); initShare();
  rebuildNow();
  new ResizeObserver(debounce(drawSpecimen, 100)).observe($('#spec'));
  document.fonts.addEventListener('loadingdone', debounce(fitGlyphs, 60));      // Remeasure specimens when their glyphs finish downloading later.
  new ResizeObserver(debounce(refreshVAutospace, 100)).observe($('#proofText'));      // Vertical proof height changes with the viewport.
  new MutationObserver(() => drawSpecimen()).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}
