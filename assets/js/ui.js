import { refresh } from './refresh.js';
import { $, LS_UI, T, UI, debounce, esc, lsSet, root, round, setUI, tr } from './i18n.js';
import { CLASSES, CLS, inRanges, rebuildClassRanges } from './unicode.js';
import { BASE_W, ENGINE, tSvg, G, GF_LIST, L, LOCAL_COMMON, LS_PRESETS, PRESETS, SAMPLES, TYPO, WEIGHTS, isViewTypo, WORD_RE, autoLocal, axisLabel, axisOf, defaultPresetId, extraAxes, fileAxes, files, fontAtWeight, fontKey, gfWeights, freshClasses, guessPath, inheritedSize, isFontTypo, italOf, italicLocal, localAlt, normalizeState, objByKey, ownSize, presetDirty, presetSnap, rebuild, fileStyle, styleOfFont, canRedo, canUndo, hist, recordHistory, stepHistory, rebuildNow, refreshCustomRanges, resolveCls, resolveCustom, saveState, setBusy, setFontAxes, setSizeAt, setState, source, sources, srcError, state, stateFromPreset, stepSpan, typoDef, typoSupported, userPresets, vfAxis, vfCache } from './core.js';
import { PUNCT_CENTER, REGION_OF_LANG, formsOf, keyName, wKeys, wRowAdjusted, drawSpecimen, fitGlyphs, markPreviewRow, renderClassRows, lastMeasure, lastRef, missTipAt, orderedSamples, punctPos, refreshInherited, refreshVAutospace, renderEaMarks, renderEditor, renderGroups, renderLangOptions, renderNumHint, renderPreview, renderSampleTabs, specShown, syncLeftTab, syncToolbar, tabFade } from './render.js';
import { initFontTab } from './bake.js';
import { appFileName, cssFamilyName, exKind, exTab, lastExport, renderExport, setExKind, setExTab, showExport } from './export.js';
/* ================= 交互：字符类别表 ================= */
export function targetOf(row) { return row.dataset.id ? { type: 'class', id: row.dataset.id } : { type: 'custom', i: +row.dataset.ci }; }
export const keyOf = t => t.type === 'class' ? t.id : '#' + t.i;
export const objOf = t => t.type === 'class' ? state.classes[t.id] : state.custom[t.i];
export const resolvedOf = t => t.type === 'class' ? resolveCls(t.id) : resolveCustom(state.custom[t.i]);
export function changed({ fonts = false, editor = true } = {}) {
  refreshCustomRanges();
  if (editor) renderEditor(); else refreshInherited();
  renderPreview();
  if (fonts) rebuild(); else { drawSpecimen(); renderExport(); }
  markCustomPreset();
  saveState();
}
export function markCustomPreset() {
  if (state.preset && !String(state.preset).startsWith('user:')) { state.preset = ''; renderPresetCards(); }
}
export const LIMITS = { size: [20, 300], shift: [-60, 60] };
/* 写入一格：空 = 恢复继承；commit 为 false 时（还在输入）忽略超出范围的中间值 */
export function setNum(inp, commit) {
  const t = targetOf(inp.closest('.ct-row')), key = keyOf(t), field = inp.dataset.field, W = BASE_W;
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
    o.follow = el.value === 'own' ? null : el.value;
    changed({ fonts: true });
  }
});
$('#editor').addEventListener('input', e => {
  const inp = e.target, row = inp.closest('.ct-row'); if (!row) return;
  if (inp.classList.contains('chars')) { objOf(targetOf(row)).chars = inp.value; changed({ fonts: true, editor: false }); return; }
  if (inp.classList.contains('num')) setNum(inp, false);
});
$('#editor').addEventListener('keydown', e => {
  const inp = e.target;
  if (!inp.classList?.contains('num') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const base = parseFloat(inp.value === '' ? inp.placeholder : inp.value) || 0;
  inp.value = round(base + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 5 : 0.5));
  setNum(inp, true);
});
/* ================= 交互：各字重 ================= */
export const keyTarget = k => k[0] === '#' ? { type: 'custom', i: +k.slice(1) } : { type: 'class', id: k };
export const stepOf = w => Math.min(900, Math.max(100, Math.round((w - 1) / 100) * 100));      // 连续模式里这个粗细归哪一档（和 stepSpan 一致）
/* 清掉空了的单独调整，免得「预设已修改」误判 */
export function pruneOv(W, k) {
  if (state.wOver[W]?.[k] && !Object.keys(state.wOver[W][k]).length) delete state.wOver[W][k];
  if (state.wOver[W] && !Object.keys(state.wOver[W]).length) delete state.wOver[W];
}
/* 某个字重的粗细：可变字体是任意值，静态的 Google Fonts 是一档。400 改的是字体本身；单独换过字体时改的是那个字体 */
export function setWeightAt(k, W, el) {
  const o = objByKey(k), withW = (f, v) => f.kind === 'google' ? G(f.family, v) : { ...f, weight: v };
  const raw = el.value.trim();
  let v = el.dataset.act === 'wnum' ? (raw === '' ? null : Math.min(+el.max, Math.max(+el.min, Math.round(+raw)))) : +el.value || null;
  if (el.dataset.auto && v === +el.dataset.auto) v = null;      // 选回「推算」的那一档：不再单独设定
  if (W === BASE_W) { if (v != null) o.font = withW(o.font, v); }
  else {
    const ov = ((state.wOver[W] ||= {})[k] ||= {});
    if (ov.font) { if (v != null) ov.font = withW(ov.font, v); }
    else if (v == null) delete ov.weight; else ov.weight = v;
    pruneOv(W, k);
  }
  renderClassRows();      // 「随汉字 · …」里写的粗细可能变了；各字重就地更新，不重建（保持焦点，↑↓ 可以连续调）
  changed({ fonts: true, editor: false });
}
export function setMatrixSize(inp, commit) {
  const k = inp.dataset.k, W = +inp.dataset.w, raw = inp.value.trim();
  let v = raw === '' ? null : parseFloat(raw);
  if (v !== null && !Number.isFinite(v)) { if (commit) inp.value = ownSize(k, W) ?? ''; return; }
  const [lo, hi] = LIMITS.size;
  if (v !== null && (v < lo || v > hi)) { if (!commit) return; v = Math.min(hi, Math.max(lo, v)); inp.value = v; }
  setSizeAt(k, W, v);
  inp.classList.toggle('own', v !== null && W === BASE_W); inp.classList.toggle('set', v !== null && W !== BASE_W);
  changed({ fonts: true, editor: false });
}
/* 在某一行里编辑时，校样跟着换到这个字重：只换高亮，不重画表格（保持输入焦点） */
export function previewSoft(W) {
  const v = state.view, cont = state.wmode === 'cont';
  if (cont ? stepOf(v.wcont) === W : W === v.weight) return;
  v.weight = W;
  markPreviewRow();
  if (cont) { v.wcont = W; root.style.setProperty('--fw', W); drawSpecimen(); } else rebuild();
  syncToolbar(); saveState();
}
/* 校样的字重：分档时取最接近的导出字重；连续时是范围里的任意值，各字重里高亮它所在的那一档 */
export function setPreviewW(x) {
  const v = state.view;
  if (state.wmode !== 'cont') { setPreviewWeight(state.weights.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a)); return; }
  const [lo, hi] = state.wrange, w = Math.min(hi, Math.max(lo, Math.round(x)));
  if (document.activeElement !== $('#vWn')) $('#vWn').value = w;
  if (w === v.wcont) return;
  v.wcont = w; root.style.setProperty('--fw', w);
  if (stepOf(w) !== v.weight) { v.weight = stepOf(w); markPreviewRow(); drawSpecimen(); }
  saveState();
}
/* 导出哪些字重（分档）：各字重里的勾选和导出对话框里的按钮是同一个设定 */
export function setWeights(ws) {
  const v = state.view, prevW = v.weight;
  state.weights = [...new Set(ws)].sort((a, c) => a - c);
  if (!state.weights.includes(prevW)) v.weight = state.weights.includes(BASE_W) ? BASE_W : state.weights[0];
  refresh('toolbar', 'editor', 'export', ...(v.weight !== prevW ? ['fonts'] : []));
}
/* 连续模式的导出范围：各字重里和导出对话框里各有一组，校样的字重也只走这个范围 */
export function setWRange(lo, hi) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { renderExport(); return; }
  if (lo > hi) [lo, hi] = [hi, lo];
  lo = Math.min(899, Math.max(100, Math.round(lo))); hi = Math.min(900, Math.max(lo + 1, Math.round(hi)));
  state.wrange = [lo, hi];
  for (const [a, b] of [['exWLo', 'wLo'], ['exWHi', 'wHi']]) { const x = a === 'exWLo' ? lo : hi; $('#' + a).value = x; if ($('#' + b)) $('#' + b).value = x; }
  const v = state.view;
  v.wcont = Math.min(hi, Math.max(lo, v.wcont));
  v.weight = stepOf(v.wcont);
  refresh('toolbar', 'editor', 'fonts', 'export');
}
$('#wMatrix').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pw) { const W = +b.dataset.pw; if (state.wmode === 'cont') setPreviewW(W); else setPreviewWeight(W); return; }
  const W = +b.dataset.w;
  if (b.dataset.act === 'wclear') {      // 清除这个字重的单独调整：大小、粗细、换的字体、本机字体名
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
/* ↑↓：大小每次 0.5（Shift 5），粗细每次 10（Shift 100）。空着的格子从灰色的推算值开始，而不是从 0 或轴的下限 */
$('#wMatrix').addEventListener('keydown', e => {
  const inp = e.target, up = e.key === 'ArrowUp';
  if (!up && e.key !== 'ArrowDown') return;
  if (inp.classList?.contains('mnum')) {
    e.preventDefault();
    const base = parseFloat(inp.value === '' ? inp.placeholder : inp.value) || 0;
    inp.value = round(base + (up ? 1 : -1) * (e.shiftKey ? 5 : 0.5));
    setMatrixSize(inp, true);
  } else if (inp.classList?.contains('mw')) {
    e.preventDefault();
    const base = parseFloat(inp.value === '' ? inp.placeholder : inp.value) || 400;
    inp.value = Math.min(+inp.max, Math.max(+inp.min, Math.round(base + (up ? 1 : -1) * (e.shiftKey ? 100 : 10))));
    setWeightAt(inp.dataset.k, +inp.dataset.w, inp);
  }
});
/* 危险操作点两次才执行：第一次点击时按钮换成确认文字（.armed，原来的内容先藏起来），3 秒内再点才执行，过时恢复原样。
   按钮原来的文字要包在元素里（纯文字节点藏不起来） */
export function armConfirm(btn, text, run) {
  const disarm = () => { btn.classList.remove('armed'); btn.querySelector(':scope > .arm-lab')?.remove(); };
  if (btn.classList.contains('armed')) { clearTimeout(btn.armT); disarm(); run(); return; }
  const lab = document.createElement('span'); lab.className = 'arm-lab'; lab.textContent = text;
  btn.append(lab); btn.classList.add('armed');
  btn.armT = setTimeout(disarm, 3000);
}
/* 清除所有字重的单独调整 */
/* 「各字重」每行末尾的菜单：给这个字重换字体、恢复这个字重的设定 */
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
  const m = $('#wRowMenu'), r = wMenuBtn.getBoundingClientRect();      // 右边和按钮对齐
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
/* ================= 撤销 / 重做 =================
   按钮在左窗格页签那一排的右端；快捷键 ⌘Z / ⇧⌘Z（Windows：Ctrl+Z / Ctrl+Y）。在输入框里时交给输入框自己撤销 */
export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export function syncHistory() {
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
    if (document.querySelector('dialog[open]')) return;      // 对话框里不撤销背后的设定
    e.preventDefault(); goHistory(redo ? 1 : -1);
  });
}
/* ================= 悬停提示 =================
   有 title（或 data-tip）的元素：鼠标停 0.35 秒、或用键盘聚焦时，在下面显示黑底白字的提示，代替浏览器自己那个要等一秒多的提示。
   第一次悬停时把 title 挪到 data-tip，免得两个提示一起出现；代码之后再写 title 也照样接管。
   刚收起一个提示后马上指到别的元素，新提示立刻出现（在一排按钮上扫过去时不用每个都等） */
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
  const show = el => {
    const text = take(el); if (!text || !el.isConnected || el !== cur) return;
    const host = el.closest('dialog[open]') || document.body;      // 模态对话框打开时，放进对话框里
    if (tip.parentNode !== host) { if (open()) tip.hidePopover(); host.append(tip); }
    tip.textContent = text;
    if (!open()) tip.showPopover();
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    const below = r.bottom + 6 + h <= innerHeight - 4;
    tip.style.top = (below ? r.bottom + 6 : Math.max(4, r.top - h - 6)) + 'px';
    tip.style.left = Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width / 2 - w / 2)) + 'px';
  };
  const hide = () => {
    clearTimeout(timer);
    if (open()) { warm = performance.now() + 500; tip.hidePopover(); }
    cur = null;
  };
  const arm = (el, delay) => { hide(); cur = el; take(el); timer = setTimeout(() => show(el), performance.now() < warm ? 0 : delay); };
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
/* ================= 左右两栏的分界 =================
   拖动（或聚焦后按 ←→）调整编辑栏的宽度，双击恢复默认。窄屏一次只显示一栏，没有分界 */
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
/* 参考图的高度：拖动它上边的分界线（或聚焦后按 ↑↓），双击恢复按字号自动定的高度。校样至少留 160px */
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
$('#wSub').addEventListener('change', e => { if (e.target.id === 'wLo' || e.target.id === 'wHi') setWRange(parseFloat($('#wLo').value), parseFloat($('#wHi').value)); });
$('#wSub').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
/* (i) 说明：所有说明文字共用一个弹层，打开时按 data-info 填入内容 */
export const INFO = {
  presetInfo: () => esc(T('presetInfo')),
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
  /* 模态对话框打开时，对话框外面的元素都点不到（inert）：说明弹层要放进按钮所在的对话框里 */
  const host = b.closest('dialog') || document.body, pop = $('#infoPop');
  if (pop.parentNode !== host) host.append(pop);
}, true);
$('#infoPop').addEventListener('toggle', e => {
  if (e.newState !== 'open') { hovOpen = null; return; }
  const pop = $('#infoPop');
  pop.innerHTML = infoHtml(pop.dataset.key || '');
  placePop(pop, infoBtn);
});
/* (i)：鼠标停一会儿直接打开说明（不再先出「说明」小提示），移开就关；悬停打开后再点一下，就固定打开 */
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
      if (infoOpen()) { if (!hovOpen) return; $('#infoPop').hidePopover(); }      // 点开的说明不被悬停顶掉
      b.click(); hovOpen = b;
    }, 350);
  } else if (e.target.closest?.('#infoPop')) clearTimeout(hovT);
});
document.addEventListener('pointerout', e => {
  if (e.pointerType !== 'mouse') return;
  const to = e.relatedTarget;
  if (e.target.closest?.('.info') && !hovOpen) { if (!to?.closest?.('.info')) clearTimeout(hovT); return; }      // 还没打开就移开了
  if (!hovOpen || to?.closest?.('#infoPop') || to?.closest?.('.info') === hovOpen) return;
  clearTimeout(hovT);
  hovT = setTimeout(() => { if (hovOpen && !$('#infoPop').matches(':hover') && !hovOpen.matches(':hover')) $('#infoPop').hidePopover(); }, 250);
});
document.addEventListener('click', e => {
  const b = e.target.closest('.info'); if (!b) return;
  clearTimeout(hovT);      // 点了就以点击为准，不再等悬停
  if (b === hovOpen && infoOpen()) { e.preventDefault(); hovOpen = null; }      // 悬停打开的：取消 popovertarget 的切换，留着不关
}, true);
export let gearBtn = null;
$('#editor').addEventListener('click', e => {
  const g = e.target.closest('[data-act="groups"]');
  if (g) { gearBtn = g; $('#grpPop').dataset.cls = g.dataset.cls; }      // popovertarget 会接着打开弹层
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
export function setPreviewWeight(W) {
  if (W === state.view.weight) return;
  state.view.weight = W;
  refresh('toolbar', 'editor', 'fonts');
}

/* ================= 交互：校样、度量、导出 ================= */
export const SUPPORT = { sizeAdjust: typeof FontFace !== 'undefined' && 'sizeAdjust' in FontFace.prototype };
export function initToolbar() {
  $('#gfWeight').innerHTML = WEIGHTS.map(w => `<option value="${w}">${w}</option>`).join('');
  $('#gfList').innerHTML = GF_LIST.map(f => `<option value="${esc(f)}"></option>`).join('');
  $('#lfList').innerHTML = LOCAL_COMMON.map(([n, , os]) => `<option value="${esc(n)}">${os}</option>`).join('');
  $('#sizeAdjustWarn').hidden = SUPPORT.sizeAdjust;

  const v = () => state.view;
  /* 示例页签。自定义页签可以有好几组：最右边的「+」从当前的文字开始建一组，换到别的页签也一直保留，点 × 才删掉 */
  const customAt = k => { const m = /^c(\d+)$/.exec(k); return m ? v().customs[+m[1]] : null; };
  const showSample = k => {
    const c = customAt(k);
    if (c) { v().sample = k; v().text = c.text; if (c.lang) state.typo.lang = c.lang; }
    else { v().sample = k; v().text = SAMPLES[k].text; state.typo.lang = SAMPLES[k].lang; }
    refresh('toolbar', 'editor', 'preview', 'export', 'fonts');      // 语言变了：注音那一行、地区检查跟着变
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
      if (ci === i) showSample(v().customs.length ? 'c' + Math.min(i, v().customs.length - 1) : orderedSamples()[0]);      // 删的是正在看的：换到旁边一组，没有了就回到示例
      else { if (ci > i) v().sample = 'c' + (ci - 1); renderSampleTabs(); saveState(); }
      return;
    }
    const b = e.target.closest('[data-sample]'); if (!b) return;
    showSample(b.dataset.sample);
    if (customAt(b.dataset.sample)) $('#sample').focus();
  });
  $('.pane-bar').addEventListener('click', e => {
    const b = e.target.closest('[data-ltab]'); if (!b) return;
    v().ltab = b.dataset.ltab; syncLeftTab(); $('#editor').scrollTop = 0; saveState();
  });
  $('#sampleTabs').addEventListener('scroll', tabFade, { passive: true });
  $('#sampleTabs').addEventListener('wheel', e => {      // 没有触控板时：竖向滚轮也能横向滚页签
    const t = e.currentTarget;
    if (t.scrollWidth <= t.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    t.scrollLeft += e.deltaY; e.preventDefault();
  }, { passive: false });
  new ResizeObserver(tabFade).observe($('#sampleTabs'));
  /* 字号、行高的数字框：输入中途（比如打到一半的「1」）不在范围内就先不管，离开或回车时再收进范围 */
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
  /* 左右拖动图标调整：字号每 2px 变 1，行高每 1px 变 0.01 */
  const SCRUB = { ...NUM, w: { el: '#vWn', px: 1, get: () => state.wmode === 'cont' ? v().wcont : v().weight, set: setPreviewW } };      // 字重每 1px 变 1（分档时落到最接近的一档）
  document.querySelectorAll('[data-scrub]').forEach(ic => ic.addEventListener('pointerdown', e => {
    const k = ic.dataset.scrub, n = SCRUB[k], x0 = e.clientX, v0 = n.get ? n.get() : v()[k];
    e.preventDefault(); ic.setPointerCapture(e.pointerId); document.body.classList.add('scrubbing');
    const move = ev => { const x = v0 + (ev.clientX - x0) * n.px * (ev.shiftKey ? 10 : 1); if (n.set) n.set(x); else setNum(k, x); };
    const up = ev => {
      ic.removeEventListener('pointermove', move); ic.removeEventListener('pointerup', up); ic.removeEventListener('pointercancel', up);
      document.body.classList.remove('scrubbing');
      if (Math.abs(ev.clientX - x0) < 3) $(n.el).select();      // 没拖动：当成点击，选中框里的数字
    };
    ic.addEventListener('pointermove', move); ic.addEventListener('pointerup', up); ic.addEventListener('pointercancel', up);
  }));
  $('#viewPop').addEventListener('toggle', e => {      // 菜单贴在按钮下方、右对齐
    if (e.newState !== 'open') return;
    const r = $('#viewBtn').getBoundingClientRect(), pop = e.currentTarget;
    pop.style.left = Math.max(8, r.right - pop.offsetWidth) + 'px';
    pop.style.top = (r.bottom + 6 + pop.offsetHeight > innerHeight ? Math.max(8, r.top - pop.offsetHeight - 6) : r.bottom + 6) + 'px';
  });
  /* 度量参考图的工具条：西文、数字、假名、注音的参考线分别开关（图例兼开关） */
  $('#specBar').addEventListener('click', e => {
    const b = e.target.closest('[data-sg]'); if (!b) return;
    const k = b.dataset.sg;
    (v().specShow ||= {})[k] = !specShown()[k];
    refresh('toolbar', 'specimen');
  });
  for (const [id, key] of [['vVertical', 'vertical'], ['vColor', 'colorize'], ['vRules', 'rules'], ['vMiss', 'miss'], ['vItalic', 'italic']])
    $('#' + id).addEventListener('click', () => { v()[key] = !v()[key]; refresh('toolbar', 'preview', 'export'); });
  $('#viewTypo').addEventListener('change', e => { const k = e.target.dataset.vtypo; if (k) { state.typo[k] = e.target.value; syncViewTypo(); refresh('preview'); } });
  /* 校样的字重：分档时只在导出的字重之间换（↑↓ 跳一档），连续时是导出范围里的任意值 */
  const wn = $('#vWn');
  wn.addEventListener('input', () => { if (state.wmode !== 'cont') return; const x = parseFloat(wn.value); if (x >= state.wrange[0] && x <= state.wrange[1]) setPreviewW(x); });
  wn.addEventListener('change', () => { const x = parseFloat(wn.value); if (isFinite(x)) setPreviewW(x); wn.value = state.wmode === 'cont' ? v().wcont : v().weight; });
  wn.addEventListener('keydown', e => {
    if (e.key === 'Enter') { wn.blur(); return; }
    if (state.wmode === 'cont' || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const ws = state.weights, i = Math.max(0, ws.indexOf(v().weight));
    setPreviewWeight(ws[Math.min(ws.length - 1, Math.max(0, i + (e.key === 'ArrowUp' ? 1 : -1)))]);
    wn.value = v().weight;
  });
  const reloadForText = debounce(() => rebuild(), 600);
  $('#proofText').addEventListener('pointermove', e => missTipAt(e.clientX, e.clientY));
  $('#proofText').addEventListener('pointerleave', () => { $('#missTip').hidden = true; });
  document.addEventListener('scroll', () => { $('#missTip').hidden = true; }, { passive: true, capture: true });      // 窗格里面滚动也要收起（scroll 不冒泡）
  $('#sample').addEventListener('input', e => {
    v().text = e.target.value;
    const m = /^c(\d+)$/.exec(v().sample); if (m && v().customs[+m[1]]) v().customs[+m[1]].text = e.target.value;
    refresh('preview'); reloadForText();
  });
  for (const box of ['#typoRows', '#featRows']) {      // 排版页签、字体页签里的字体特性：同一套卡片和下拉
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
  /* 字重模式：分档 / 连续（可变字体）。切换不会删掉任何设定 */
  $('#vWMode').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === state.wmode) return;
    state.wmode = b.dataset.m;
    if (state.wmode === 'cont') { state.weights = [...WEIGHTS]; v().wcont = Math.min(state.wrange[1], Math.max(state.wrange[0], v().weight)); }
    refresh('toolbar', 'editor', 'fonts', 'export');
  });
  $('#exWPresets').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) setWRange(...b.dataset.r.split(',').map(Number)); });
  for (const id of ['exWLo', 'exWHi']) $('#' + id).addEventListener('change', () => setWRange(parseFloat($('#exWLo').value), parseFloat($('#exWHi').value)));
  $('#exBase').addEventListener('change', e => { state.baseMode = e.target.value; refresh('export'); });
  /* 斜体：导出时另写一组 font-style: italic 的规则；校样的「斜体」开关用来看效果 */
  $('#exItalic').addEventListener('change', e => { state.italic = e.target.value === '1'; refresh('editor', 'fonts', 'export'); });
  $('#exGeneric').addEventListener('change', e => { state.generic = e.target.value; refresh('preview', 'export'); });
  /* 选了语言时校样也按这个语言排（字形地区差异、禁则），不限语言时校样沿用示例文字的语言 */
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
  /* 独立网页里可以直接下载；在 artifact 等嵌入框架里浏览器会拦截下载，所以只显示「复制」 */
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
    /* 数字样式这类：一排字样卡片，每张用当前的数字字体排出这个样式 */
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
/* 「显示」菜单里的对齐、对齐方式、段落换行：只改校样，不导出 */
export function renderViewTypo() {
  const lab = (t, v, d) => d ? tr(d) : v === t.def ? T('vtDefault', { v }) : v;
  $('#viewTypo').innerHTML = ['align', 'justify', 'wrap'].map(k => TYPO.find(t => t.key === k)).map(t => `<label class="vt-row"><span>${esc(tr(t.label))}</span><select data-vtypo="${t.key}">${
    t.values.map(([v, d]) => `<option value="${esc(v)}"${state.typo[t.key] === v ? ' selected' : ''}>${esc(lab(t, v, d))}</option>`).join('')}</select></label>`).join('');
  syncViewTypo();
}
/* 对齐方式只在两端对齐时有用 */
export function syncViewTypo() {
  document.querySelectorAll('#viewTypo [data-vtypo]').forEach(s => { s.value = state.typo[s.dataset.vtypo]; });
  const j = $('#viewTypo [data-vtypo="justify"]'); if (j) j.disabled = state.typo.align !== 'justify';
}
/* 行高度量：写在 @font-face 的 ascent-override 等描述符里，几乎都用推荐值，所以放在高级排版属性的最后 */
export const LM_SUP = { chrome: '87', firefox: '89', safari: '—' };
export const lmSupported = () => typeof FontFace !== 'undefined' && 'ascentOverride' in FontFace.prototype;
/* 行高度量的图：三行字，第二行只有西文；虚线是行框。
   对齐汉字字体：三行一样高，汉字在行里居中。不调整：行框按西文字体算，只有西文的那行变矮，汉字偏下 */
const lmPic = (edges, rows) => tSvg(rows.map(([kind, x, y, w]) => kind === 'h' ? `<rect x="${x}" y="${y}" width="5" height="5" rx=".5"/>` : `<rect x="${x}" y="${y}" width="${w}" height="3" rx=".6"/>`).join('') +
  edges.map(y => `<path d="M2 ${y}H46" class="tt-edge"/>`).join(''));
export const LM_PIC = {      // 只是数据：图在渲染时才画（模块顶层不能调用别的模块的函数）
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
/* (i) 按钮：悬停时也有提示 */
export const infoButton = key => `<button type="button" class="info" data-info="${esc(key)}" popovertarget="infoPop" aria-label="${esc(T('infoAria'))}"><svg class="ic" aria-hidden="true"><use href="#i-info-circle"/></svg></button>`;
/* (i) 里的技术细节：CSS 属性名，以及各浏览器从哪个版本开始支持（标出当前浏览器，和它支不支持所选的值） */
export function techHtml(prop, sup, ok) {
  const names = { chrome: 'Chrome', firefox: 'Firefox', safari: 'Safari' };
  // 浏览器名一行、版本一行，排成三列；当前浏览器那一列加粗
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
  $('#typoCount').textContent = n || '';      // 页签上的小红点：改了几项
  $('#typoReset').hidden = !n;
  $('#featChanged').textContent = nf ? T('typoChanged', { n: nf }) : '';
  $('#featReset').hidden = !nf;
  for (const t of TYPO) { const el = document.querySelector(`.typo-unsup[data-key="${t.key}"]`); if (el) el.hidden = typoSupported(t, state.typo[t.key]); }
}

/* ================= 预设卡片：每张卡片用它自己的字体排「永」「あ／字」「Ag」 ================= */
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
/* 缩略字样「永 ? Ag」：中间那个字按文字写法换——简体「体」、繁体「體」、日文「あ」，一眼看出是哪种中文 */
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
/* 内置预设按界面语言排：这个语言的预设在前，其他语言的排在后面 */
export const PRESET_ORDER = {
  zh: ['serif-sc', 'sans-sc', 'mincho-jp', 'gothic-jp', 'ming-tw', 'hei-tw', 'antigochi', 'hei-hk', 'mac', 'mac-tw', 'mac-jp'],
  tw: ['ming-tw', 'hei-tw', 'hei-hk', 'mac-tw', 'serif-sc', 'sans-sc', 'mincho-jp', 'gothic-jp', 'antigochi', 'mac', 'mac-jp'],
  ja: ['mincho-jp', 'gothic-jp', 'antigochi', 'mac-jp', 'serif-sc', 'sans-sc', 'ming-tw', 'hei-tw', 'hei-hk', 'mac', 'mac-tw'],
};
export const orderedPresets = () => { const o = PRESET_ORDER[UI] || PRESET_ORDER.zh, at = id => (i => i < 0 ? 99 : i)(o.indexOf(id)); return [...PRESETS].sort((a, b) => at(a.id) - at(b.id)); };
/* ================= 预设筛选 =================
   三组：地区、风格（宋体 / 明朝 还是 黑体 / ゴシック，看汉字字体的名字）、来源（Google Fonts 还是本机字体）。
   组内任选一个就算符合，组间要同时符合；一组都没选 = 不限。筛选条件放在视图状态里，不进撤销记录 */
export const PF_GROUPS = [['region', [['sc', 'pfSc'], ['tc', 'pfTc'], ['jp', 'pfJp']]], ['style', [['serif', 'pfSerif'], ['sans', 'pfSans'], ['other', 'pfOther']]], ['src', [['google', 'pfGoogle'], ['local', 'pfLocal']]]];
/* 从设定推算预设的属性（保存对话框里的默认值；旧的「我的预设」没存属性时也用它）：
   地区：导出的「适用语言」→ 汉字字体名里的地区（SC / TC / HK / JP）→ 校样的语言；风格：看汉字字体（styleOfFont）；
   来源：所有类别都用 Google Fonts 才算 Google，有本机字体或字体文件就算本机（换一台电脑要有同样的字体） */
const REGION_GROUP = { sc: 'sc', tw: 'tc', hk: 'tc', jp: 'jp' };
export function inferMeta(st) {
  const han = st.classes?.han?.font;
  const own = [...Object.values(st.classes || {}), ...(st.custom || [])].filter(c => c && !c.follow && c.font).map(c => c.font);
  const region = REGION_GROUP[REGION_OF_LANG[st.scope]] || REGION_GROUP[formsOf(han)] || scriptOfLang(st.typo?.lang);
  return { region, style: styleOfFont(han), src: own.length && own.every(f => f.kind === 'google') ? 'google' : 'local' };
}
export function renderPresetFilter(shown, total) {
  const pf = state.view.pfilter || {}, n = PF_GROUPS.reduce((k, [g]) => k + (pf[g]?.length || 0), 0);
  $('#pfCount').textContent = n || '';      // 按钮上：选了几项
  $('#pfMenu').innerHTML = PF_GROUPS.map(([g, opts]) => `<p class="mm-lab">${esc(T({ region: 'pfRegion', style: 'pfStyle', src: 'pfSource' }[g]))}</p>` + opts.map(([v, k]) =>
    `<button type="button" class="mm-item mm-check" data-pf="${g}:${v}" aria-pressed="${!!pf[g]?.includes(v)}"${T(k + 'Tip') !== k + 'Tip' ? ` title="${esc(T(k + 'Tip'))}"` : ''}>${esc(T(k))}</button>`).join('')).join('<hr>') +
    (n ? `<hr><div class="pf-end"><button type="button" class="mm-item" data-pf="clear">${esc(T('pfClear'))}</button><span class="mono">${shown} / ${total}</span></div>` : '');
}
/* 「我的预设」排在最前面，后面是内置的 */
export function renderPresetCards() {
  const all = [], pf = state.view.pfilter || {};
  for (const [n, snap] of Object.entries(userPresets)) if (snap?.classes?.han) {
    const meta = { ...inferMeta(snap), ...(snap.meta || {}), src: inferMeta(snap).src };      // 地区、风格用保存时确认的；来源总是按字体算
    all.push([meta, { id: 'user:' + n, name: n, tag: T('presetMine'), cls: snap.classes, script: scriptOfLang(snap.typo?.lang), user: true, active: state.preset === 'user:' + n }]);
  }
  for (const p of orderedPresets()) {
    const script = p.region === 'hk' ? 'tc' : p.region, cls = freshClasses(p);
    all.push([{ region: script, style: p.style, src: inferMeta({ classes: cls }).src }, { id: p.id, name: tr(p.name), tag: tr(p.tag), cls, script, active: state.preset === p.id }]);
  }
  const fit = m => PF_GROUPS.every(([g]) => !pf[g]?.length || pf[g].includes(m[g]));
  const cards = all.filter(([m]) => fit(m)).map(([, c]) => presetCard(c));
  $('#presetCards').innerHTML = cards.join('') || `<p class="pf-none">${esc(T('pfNone'))} <button type="button" class="btn-text" data-pf="clear">${esc(T('pfClear'))}</button></p>`;
  renderPresetFilter(cards.length, all.length);
}
/* 点筛选按钮：组内加上 / 去掉这一项；「清除筛选」在筛选条和空结果里都有 */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pf]'); if (!b || !b.closest('#panePresets')) return;
  const focus = b.dataset.pf;      // 菜单重画以后，焦点放回刚点的那一项
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
/* 筛选菜单：挂在按钮下面，右边对齐 */
$('#pfMenu').addEventListener('toggle', e => {
  if (e.newState !== 'open') return;
  const r = $('#pfBtn').getBoundingClientRect(), pop = e.currentTarget;
  pop.style.top = r.bottom + 6 + 'px'; pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + 'px';
});
export const renderPresetCardsSoon = debounce(renderPresetCards, 120);
export const hasFileFont = () => [...CLASSES.map(c => state.classes[c.id].font), ...state.custom.map(c => c.font)].some(f => f && f.kind === 'file');
export function applyPreset(id) {
  if (id.startsWith('user:')) {
    const { meta, ...saved } = userPresets[id.slice(5)] || {}; if (!saved.classes) return;      // meta：保存时确认的地区、风格，只用于筛选
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
/* 自动调整西文大小：以汉字字体自带的西文为基准，取「按大写高对齐」和「按 x 高对齐」的几何平均，大写高不超过自带西文的 103%；
   汉字字体没有自带西文时，让大写高占字面的 83%。返回要乘的倍数，量不到时为 null */
export function idealScale() {
  if (!lastMeasure) return null;
  if (lastRef && !lastRef.none) {
    const sCap = lastRef.cap / lastMeasure.capRatio, sX = lastRef.x / lastMeasure.xRatio;
    return Math.min(Math.sqrt(sCap * sX), 1.03 * sCap);
  }
  return 0.83 / lastMeasure.capRatio;
}
/* 一键自动调整（字符类别旁的魔法棒）：
   1. 大小：每个导出的字重分别量、分别设定。汉字越粗，笔画往外扩，字面看起来越大，合适的西文大小也跟着变（各预设实测相差 2–5%）。
      400 写进基础设定；其他字重和 400 相差不到 0.5 的沿用 400，否则写成这个字重自己的大小。
   2. 基线：调好大小后，按 400（没导出 400 时按当前字重）量大写字母的中线和汉字字面中线的差。
      差在 2% em 以内看不出来，基线保持 0——不为了看不出的差别让导出多一段 JS */
export const SHIFT_MIN = 2;
export let autoBusy = false, autoDoneTimer = 0;
export async function autoAdjust() {
  if (autoBusy) return;
  const cont = state.wmode === 'cont', list = cont ? WEIGHTS.filter(W => stepSpan(W)) : [...state.weights];
  const W0 = state.view.weight, C0 = state.view.wcont, sizes = {};
  const at = async W => { state.view.weight = W; if (cont) state.view.wcont = W; await rebuildNow(); };      // 载入这个字重的字体并重画参考图
  const btn = $('#autoAdj'), lab = btn.querySelector('.wand-lab'), n = list.length + 1;      // 每个字重量一次，最后再量一次基线
  const step = i => { lab.textContent = T('autoAdjProgress', { i, n }); };
  clearTimeout(autoDoneTimer); btn.classList.remove('done');
  autoBusy = true; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); step(0);
  let shift = null, mid = null;
  try {
    for (const [i, W] of list.entries()) {
      setBusy(T('measuringW', { w: W })); step(i);
      await at(W);
      const k = idealScale();
      if (k) sizes[W] = Math.min(200, Math.max(50, round(resolveCls('latin', W, true).size * k)));
    }
    const ws = Object.keys(sizes).map(Number);
    if (ws.length) {
      const base = sizes[BASE_W] ?? sizes[ws[0]];
      setSizeAt('latin', BASE_W, base === inheritedSize('latin', BASE_W) ? null : base);      // 和继承来的一样就不写
      for (const W of list) if (W !== BASE_W) setSizeAt('latin', W, sizes[W] != null && Math.abs(sizes[W] - base) >= 0.5 ? sizes[W] : null);
      refreshCustomRanges(); step(list.length);
      await at(list.includes(BASE_W) ? BASE_W : W0);
      if (lastMeasure) {
        const cur = resolveCls('latin').shift;
        mid = lastMeasure.midEm * 100;                        // 正值 = 大写中线偏低
        const target = round(cur + mid);
        shift = Math.abs(target) < SHIFT_MIN ? 0 : Math.min(30, Math.max(-30, target));
        state.classes.latin.shift = shift || null;
      }
    }
  } finally {
    state.view.weight = W0; state.view.wcont = C0; autoBusy = false; btn.disabled = false; btn.removeAttribute('aria-busy'); setBusy('');
  }
  /* 完成：按钮上短暂显示「✓ 已调整」，再换回原来的文字 */
  lab.textContent = T('autoAdjDone'); btn.classList.add('done');
  autoDoneTimer = setTimeout(() => { btn.classList.remove('done'); lab.textContent = T('autoAdj'); }, 1800);
  syncToolbar(); changed({ fonts: true });
  const vals = Object.values(sizes);
  if (!vals.length) return toast(T('tNotReady'));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const size = lo === hi ? `${lo}%` : T('autoSizeRange', { lo, hi, n: vals.length });
  const sh = shift == null ? '' : shift ? T('autoShift', { v: (shift > 0 ? '+' : '') + shift }) : T('autoNoShift', { d: Math.abs(mid).toFixed(1) });
  toast(T('tAuto', { size, shift: sh }));
}
/* 把现在的设定存成自己的预设；meta 是对话框里确认的地区和风格 */
export function savePresetAs(n, meta) {
  const snap = JSON.parse(JSON.stringify(state)); delete snap.view; delete snap.presetBase;
  userPresets[n] = { ...snap, meta }; lsSet(LS_PRESETS, userPresets);
  state.preset = 'user:' + n; state.presetBase = presetSnap();
  refresh('presets');
  toast(T('tSaved', { n }) + (hasFileFont() ? T('tSavedFile') : ''));
}
/* ================= 保存预设的对话框 =================
   「存为预设」和「改过设定后换预设」都用它；后者多一句会丢失什么，和「不保存」。
   地区、风格先按字体推算好（inferMeta），不对可以改；来源只显示，按字体算 */
export let saveThen = null, saveMeta = null;
const presetTitle = id => id.startsWith('user:') ? id.slice(5) : tr(PRESETS.find(p => p.id === id)?.name || { zh: id, ja: id, tw: id });
export function openSave(leaveTo = null) {
  saveThen = leaveTo;
  const m = inferMeta(state);
  saveMeta = { region: m.region, style: m.style };
  $('#saveTitle').textContent = T(leaveTo ? 'leaveTitle' : 'presetSaveAs');
  $('#saveMsg').hidden = !leaveTo; if (leaveTo) $('#saveMsg').textContent = T('leaveMsg', { name: presetTitle(leaveTo) });
  $('#saveDiscard').hidden = !leaveTo;
  $('#saveOk').textContent = T(leaveTo ? 'leaveSave' : 'save');
  $('#saveName').value = state.preset?.startsWith('user:') ? state.preset.slice(5) : state.name === 'My Composite' ? '' : state.name;      // 改的是自己的预设：默认存回去
  $('#saveSrc').textContent = T(m.src === 'google' ? 'saveSrcGoogle' : 'saveSrcLocal');
  $('#saveFile').hidden = !hasFileFont();
  syncSave();
  $('#saveDlg').showModal(); $('#saveName').select();
}
export function syncSave() {
  for (const g of ['region', 'style']) document.querySelectorAll(`#save${g === 'region' ? 'Region' : 'Style'} [data-v]`).forEach(b => b.setAttribute('aria-checked', b.dataset.v === saveMeta[g]));
  const n = $('#saveName').value.trim();
  $('#saveDup').hidden = !n || !(n in userPresets);
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
    savePresetAs(n, { ...saveMeta }); $('#saveDlg').close();
    if (saveThen) applyPreset(saveThen);
  };
  $('#savePresetBtn').addEventListener('click', () => openSave());
  $('#saveOk').addEventListener('click', doSave);
  $('#saveName').addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); });
  $('#saveName').addEventListener('input', syncSave);
  $('#saveCancel').addEventListener('click', () => $('#saveDlg').close());
  $('#saveDiscard').addEventListener('click', () => { $('#saveDlg').close(); if (saveThen) applyPreset(saveThen); });
  for (const [id, g] of [['#saveRegion', 'region'], ['#saveStyle', 'style']])
    $(id).addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { saveMeta[g] = b.dataset.v; syncSave(); } });
  $('#saveDlg').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });      // 点背景关闭
}
/* ================= 字体选择对话框 ================= */
export let pickTarget = null, pickCand = null, pickTab = 'google';
export let pickW = null;   // 400 以外的字重、且这一行有自己的字体时：只为这个字重指定用哪个粗细 / 字体名 / 文件
export const picker = $('#picker');
export function setPickTab(tab) {
  pickTab = tab;
  picker.querySelectorAll('[data-src]').forEach(b => b.setAttribute('aria-selected', b.dataset.src === tab));
  picker.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== tab; });
  updateCand();
}
export function candFromFields() {
  const base = pickW ? objOf(pickTarget).font : null;
  if (pickTab === 'google') {
    const fam = $('#gfFamily').value.trim(), w = gfWeightVal();
    return fam ? G(fam, w || (base?.kind === 'google' && base.family === fam ? fontAtWeight(base, pickW).weight : 400)) : null;
  }
  if (pickTab === 'local') {
    const n = $('#lfName').value.trim() || (base ? $('#lfName').placeholder : ''); if (!n) return null;
    const ps = localAlt.get(n), f = L(n, ps && ps !== n ? [ps] : []), fa = localAxesOf(n);
    if (fa) { setFontAxes(f, fa, pickW || 400); if (f.axis) $('#lfVar').checked = true; }      // 列出过本机字体时，直接读字体里的轴
    if (localStyle.get(n)) f.cls = localStyle.get(n);
    else if ($('#lfVar').checked) { f.axis = [100, 900]; f.weight = pickW || 400; }      // 自己声明的可变字体，范围交给字体本身去夹
    return f;
  }
  if (pickCand?.kind === 'file' && pickCand !== base) return pickCand;
  if (pickW && base.kind === 'file') return base;      // 字体文件：没上传新文件时，校样仍用原来的文件，这里只定导出时的文件名
  return null;
}
/* 本机字体的轴：「列出本机字体」授权后，能读到字体文件本身 */
export const localData = new Map(), localAxes = new Map(), localStyle = new Map();      // 字体全名 → FontData；→ 读到的轴（undefined = 读取中）；→ OS/2 里的风格
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
/* ================= 可变轴（粗细、斜体以外）：对这个类别的所有字重生效 ================= */
export let pickVary = {};
export const axStep = (lo, hi) => hi - lo <= 2 ? 0.01 : hi - lo <= 30 ? 0.1 : 1;
export function renderAxes() {
  const box = $('#pkAxes'), f = pickCand, ax = f ? extraAxes(f) : [];
  box.hidden = !ax.length && !f?.axesUnknown;
  if (box.hidden) return applySampleAxes();
  let body = `<p class="hint">${esc(T('axUnknown'))}</p>`;
  if (ax.length) {
    const g = f.kind === 'google';
    /* 常用的轴在前（宽度、光学尺寸、笔画粗细、倾斜），其他（多是参数轴）收进「更多」，有设定时展开 */
    const MAIN = ['wdth', 'opsz', 'GRAD', 'slnt'], rank = t => MAIN.includes(t) ? MAIN.indexOf(t) : 9;
    const sorted = [...ax].sort((x, y) => rank(x[0]) - rank(y[0]) || (x[0] < y[0] ? -1 : 1));
    const main = sorted.filter(a => MAIN.includes(a[0])), more = sorted.filter(a => !MAIN.includes(a[0]));
    const row = ([t, lo, hi, def]) => {
      const v = pickVary[t], st = axStep(lo, hi), lab = esc(axisLabel(t));
      const name = `<span class="ax-name">${lab}<small>${esc(t)} · ${lo}–${hi}</small></span>`;
      const ctl = val => `<input type="range" data-ax="${t}" min="${lo}" max="${hi}" step="${st}" value="${val}" aria-label="${lab}"><input type="number" data-ax="${t}" min="${lo}" max="${hi}" step="${st}" value="${val}" aria-label="${lab}">`;
      if (t === 'opsz') {      // 光学尺寸：Google 默认固定在默认值；可以改成跟随字号（文件里保留这个轴），或固定一个值
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
/* 收起时也看得到调了什么：「光学尺寸 跟随字号 · 宽度 80」，没调时写「4 个轴，都是默认值」 */
export function updateAxSum() {
  const el = $('#pkAxes .ax-sum'), f = pickCand; if (!el || !f) return;
  const n = extraAxes(f).length, list = Object.entries(pickVary).filter(([t]) => axisOf(f, t)).map(([t, v]) => `${axisLabel(t)} ${v === 'auto' ? T('axOpszAuto') : v}`);
  el.textContent = list.length ? list.join(' · ') : n ? T('axNone', { n }) : '';
}
/* 对话框里的预览：Google Fonts 加载的是保留了所有轴的文件，这里用 font-variation-settings 直接显示调过的值 */
export function applySampleAxes() {
  const f = pickCand, parts = [];
  for (const [t, , , def] of f ? extraAxes(f) : []) {
    const v = pickVary[t];
    if (typeof v === 'number') parts.push(`"${t}" ${v}`);
    else if (t === 'opsz' && f.kind === 'google' && v !== 'auto') parts.push(`"opsz" ${def}`);
  }
  $('#pkSample').style.fontVariationSettings = parts.join(', ');
}
export const previewFont = f => f?.kind === 'google' && extraAxes(f).length ? { ...f, xa: extraAxes(f).map(a => a[0]).sort() } : f;
export const cleanVary = f => { const o = Object.fromEntries(Object.entries(pickVary).filter(([t]) => axisOf(f, t))); return Object.keys(o).length ? o : undefined; };
/* 导出斜体时：这个字体斜体用什么 */
export function renderItal() {
  const el = $('#pkItal'), f = pickCand;
  el.hidden = !state.italic || !f;
  if (el.hidden) return;
  if (f.kind === 'local' && italicLocal(f) === undefined) { el.textContent = T('pkItalChecking'); setTimeout(() => { if (pickCand === f) renderItal(); }, 400); return; }
  const it = italOf(f);
  el.textContent = !it ? T('pkItalNo') : it.slant ? T('pkItalSlant', { t: it.slant, v: it.slant === 'slnt' ? axisOf(f, 'slnt')[1] : 1 })
    : T('pkItalYes', { name: it.kind === 'google' ? `${it.family} Italic` : it.kind === 'local' ? it.name : it.fileName || it.path });
}
/* ================= 字符覆盖：这个字体有哪些字 ================= */
/* 每个字符集抽查一组有代表性的字（简体、繁体、日本汉字各取彼此不同的字形） */
export const COV_SETS = [
  ['covLatin', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'],
  ['covPinyin', 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü'],      // 汉语拼音：西文字体缺这些时，拼音会一个字母一个字母地混用后面的字体
  ['covDigit', '0123456789'],
  ['covKana', 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンー'],
  ['covSC', '这们说时对过学发会经实现进动应头书长马门问间东车见风让认识语读谁调谈网样个钱'],
  ['covTC', '這們說時對過學發會經實現進動應頭書長馬門問間東車見風讓認識語讀誰調談網樣個錢'],
  ['covJP', '円気駅図県様広応戦鉄売読楽薬弁両帰稲鉱塩'],
  ['covHK', '嘅咗嚟啲冇佢喺嘢噉咁哋睇攞乜嗰𠝹𨋢'],      // 粤语用字，最后两个在扩展 B 区（HKSCS）
  ['covKR', '가나다라마바사아자차카타파하한글'],
  ['covSym', '①②③※→℃○■△◎★〒'],
];
/* 缺哪些字。Google Fonts 直接看各分片的 unicode-range。本机字体和字体文件：后面接一个「空白字体」
   （616 字节，所有字符都映射到宽度为 0 的空字形），这个字体没有的字会落到空白字体上，宽度量出来就是 0 */
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
  try { await document.fonts.load(`32px "${s.family}"`, chars.join('')); } catch (e) { /* 照常检测 */ }
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `32px "${s.family}", "__cf_blank"`;
  return new Set(chars.filter(c => ctx.measureText(c).width === 0));
}
export let covTok = 0;
export async function renderCoverage(s, f) {
  const tok = ++covTok, box = $('#pkCov'), sample = $('#pkSample');
  const text = sample.dataset.text || sample.textContent;
  const sampleChars = [...new Set([...text].filter(c => c.trim() && c !== '·'))];
  const miss = await missingIn(s, [...new Set([...COV_SETS.flatMap(([, cs]) => [...cs]), ...sampleChars])]);
  if (tok !== covTok || pickCand !== f) return;
  box.innerHTML = COV_SETS.map(([k, cs]) => {
    const list = [...cs], have = list.filter(c => !miss.has(c)).length;
    const cls = have === list.length ? 'ok' : have ? 'part' : 'none';
    const mark = cls === 'ok' ? ' ✓' : cls === 'part' ? ` ${have}/${list.length}` : '';
    return `<span class="cov ${cls}" title="${esc(T('covTitle', { n: list.length, k: have }))}">${esc(T(k))}${mark}</span>`;
  }).join('') + (sampleChars.some(c => miss.has(c)) ? `<span class="cov-note"><i></i>${esc(T('covMiss'))}</span>` : '');
  sample.innerHTML = [...text].map(c => miss.has(c) ? `<span class="miss">${esc(c)}</span>` : esc(c)).join('');
}
/* 选字体时也告诉用户：这个字体的标点是居中（台湾、香港）还是靠左下（大陆、日本）；和当前语言不一致时标黄 */
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
  $('#pkCov').innerHTML = '';
  const sample = $('#pkSample');
  if (sample.dataset.text) sample.textContent = sample.dataset.text;
}
export function updateCand() {
  const f = candFromFields();
  pickCand = f;
  updateScope();
  renderAxes(); renderItal();
  $('#ffItalField').hidden = f?.kind !== 'file';
  $('#ffName').textContent = f?.kind === 'file' ? f.fileName : T('ffHint');
  $('#ffItalName').textContent = f?.italic?.fileName || '';
  const ok = $('#pkOk'), st = $('#pkStatus'), sample = $('#pkSample');
  /* 预览只在字体真正可用时显示：没选字体、检测中、加载失败时，界面字体画出来的完整文字会让人误以为这个字体都有 */
  st.classList.remove('caution'); sample.hidden = true; showVfTag(null); resetCoverage();
  if (!f) { ok.disabled = true; st.textContent = T('pkEmpty'); sample.style.fontFamily = 'var(--ui)'; return; }
  const s = source(previewFont(f), { retry: true });
  ok.disabled = true; st.textContent = T('pkChecking'); sample.style.fontFamily = 'var(--ui)';
  s.promise.then(() => {
    if (pickCand !== f) return;
    if (s.status === 'ok') {
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
/* 本机字体名去掉粗细部分（W3、Bold 等），用来判断是不是同一个字体 */
export const localStem = n => n.replace(/\bW\d$/, '').replace(WORD_RE, '').trim().toLowerCase();
/* 选的是不是这一行原来那个字体（同一字体的其他粗细 / 名称 / 文件） */
export const sameFontAs = (c, base) => !!c && !!base && c.kind === base.kind && (c.kind === 'google' ? c.family === base.family : c.kind === 'local' ? localStem(c.name) === localStem(base.name) : c === base);
export function updateScope() {
  const show = !!pickW && !!pickCand && !sameFontAs(pickCand, objOf(pickTarget).font);
  $('#pkScope').hidden = !show;
}
/* Google Fonts 的字重：可变字体换成能填任意值的数字框（范围是它的 wght 轴），其他字体用 100–900 的菜单 */
/* 可变字体的标签：「VF 400–800」，悬停看说明 */
export function showVfTag(axis) {
  const tag = $('#pkVfTag');
  tag.hidden = !axis;
  if (axis) { tag.textContent = `VF ${axis[0]}–${axis[1]}`; tag.title = T('pkVf', { a: axis[0], b: axis[1] }); }
}
export function syncGfWeight() {
  const fam = $('#gfFamily').value.trim(), sel = $('#gfWeight'), num = $('#gfWeightNum');
  const axis = fam && fam in vfCache ? vfCache[fam] || null : null;
  if (fam && !(fam in vfCache)) vfAxis(fam).then(() => { if ($('#gfFamily').value.trim() === fam) syncGfWeight(); });
  if (axis && num.hidden) num.value = +sel.value ? sel.value : num.value;                       // 切到数字框时带上当前值
  if (!axis && sel.hidden) { const v = +num.value; sel.value = v ? Math.min(900, Math.max(100, Math.round(v / 100) * 100)) : (sel.querySelector('option[value="0"]') ? 0 : 400); }
  num.hidden = !axis; sel.hidden = !!axis;
  if (axis) { num.min = axis[0]; num.max = axis[1]; num.title = T('vfTitle', { a: axis[0], b: axis[1] }); }
}
export function gfWeightVal() {
  const num = $('#gfWeightNum');
  if (num.hidden) return +$('#gfWeight').value;
  if (num.value.trim() === '') return 0;          // 空着 = 自动（按字重设定时）或 400
  return Math.min(+num.max || 900, Math.max(+num.min || 100, Math.round(+num.value)));
}
export function openPicker(t, W = BASE_W) {      // W：从「各字重」的某一行打开时是那个字重
  pickTarget = t;
  const o = objOf(t), key = keyOf(t);
  pickVary = { ...(o.vary || {}) };
  $('#pkAxes').open = Object.keys(pickVary).length > 0;      // 调过轴时展开，否则收起
  pickW = W !== BASE_W && !o.follow && o.font ? W : null;
  const name = t.type === 'class' ? tr(CLS[t.id].name) : T('customName', { c: state.custom[t.i].chars || '…' });
  $('#pkFor').textContent = '· ' + name + (pickW ? ' · ' + T('pkForW', { w: W }) : '');
  picker.querySelectorAll('[data-src]').forEach(b => { b.hidden = false; });
  const cur = resolvedOf(t).font, k = pickW ? fontKey(o.font) + '|' + W : '';
  const ovf = pickW ? state.wOver[W]?.[key]?.font : null;      // 这个字重已经单独换过的字体
  $('#pkScopeW').textContent = T('pkScopeW', { w: W });
  picker.querySelector(`[name="pkScope"][value="${pickW ? 'w' : 'all'}"]`).checked = true;      // 从某个字重打开：默认只换这个字重
  /* Google Fonts：平时选具体粗细；按字重指定时第一项是「自动」，字体名固定 */
  let wOpts = WEIGHTS.map(w => `<option value="${w}">${w}</option>`).join('');
  if (pickW && o.font.kind === 'google') {      // 推算的那一档用值 0（不单独设定），其他只列这个字体真有的字重
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
  $('#ffFile').value = ''; $('#ffItal').value = '';
  $('#lfMsg').hidden = true; $('#lfMsg').classList.remove('caution');
  pickCand = ovf?.kind === 'file' ? ovf : cur?.kind === 'file' ? cur : null;
  $('#pkSample').textContent = $('#pkSample').dataset.text = `${t.type === 'class' ? CLS[t.id].sample : (state.custom[t.i].chars || '')} · 永国字體 あア Hamburg 0123`;
  picker.showModal();
  setPickTab(pickW ? (ovf || o.font).kind : cur?.kind || 'google');
}
export function initPicker() {
  picker.querySelectorAll('[data-src]').forEach(b => b.addEventListener('click', () => setPickTab(b.dataset.src)));
  $('#gfFamily').addEventListener('input', updateCandSoon);
  $('#gfFamily').addEventListener('change', updateCand);
  $('#gfWeight').addEventListener('change', updateCand);
  $('#gfWeightNum').addEventListener('input', updateCandSoon);
  $('#gfWeightNum').addEventListener('change', updateCand);
  $('#gfFamily').addEventListener('change', syncGfWeight);
  $('#lfName').addEventListener('input', updateCandSoon);
  $('#lfName').addEventListener('change', updateCand);
  $('#lfVar').addEventListener('change', updateCand);
  $('#ffFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const id = 'f' + Date.now().toString(36);
    files.set(id, { name: file.name, buffer: await file.arrayBuffer() });
    pickCand = setFontAxes({ kind: 'file', fileId: id, fileName: file.name }, await fileAxes(files.get(id).buffer), pickW || 400);
    const cls = await fileStyle(files.get(id).buffer); if (cls) pickCand.cls = cls;      // 字体自己声明的风格（宋体 / 黑体 / 其他），预设筛选用
    updateCand();
  });
  /* 斜体文件：记在这个字体文件上，导出斜体时这个类别用它（其他字重按文件名推算） */
  $('#ffItal').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file || pickCand?.kind !== 'file') return;
    const id = 'f' + Date.now().toString(36) + 'i', buffer = await file.arrayBuffer();
    files.set(id, { name: file.name, buffer });
    pickCand = { ...pickCand, italic: setFontAxes({ fileId: id, fileName: file.name }, await fileAxes(buffer), pickCand.weight) };
    updateCand();
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
    if (!('queryLocalFonts' in window)) { msg.textContent = T('lfNoApi'); msg.classList.add('caution'); return; }
    try {
      msg.textContent = T('lfWait');
      const list = await window.queryLocalFonts();
      const seen = new Set(), opts = [];
      for (const f of list) { if (seen.has(f.fullName)) continue; seen.add(f.fullName); localAlt.set(f.fullName, f.postscriptName); localData.set(f.fullName, f); opts.push(`<option value="${esc(f.fullName)}">${esc(f.family)} · ${esc(f.style)}</option>`); }
      $('#lfList').innerHTML = opts.join('');
      msg.textContent = T('lfCount', { n: opts.length });
      $('#lfName').focus();
    } catch (e) {
      msg.textContent = e && e.name === 'SecurityError' ? T('lfSec') : T('lfDenied');
      msg.classList.add('caution');
    }
  });
  $('#pkCancel').addEventListener('click', () => picker.close());
  $('#pkOk').addEventListener('click', () => {
    if (!pickCand || !pickTarget) return;
    const o = objOf(pickTarget);
    /* 400 以外的字重：选的是同一个字体的其他粗细 / 名称 / 文件，就只记在这个字重；换成别的字体，则替换所有字重 */
    const base = o.font, c = pickCand, key = keyOf(pickTarget);
    const sameFont = pickW && sameFontAs(c, base);
    const onlyW = pickW && !sameFont && picker.querySelector('[name="pkScope"]:checked')?.value === 'w';
    if (onlyW) {          // 只为这个字重换成另一个字体；Google Fonts 选「自动」时用这个字重本身
      const ov = ((state.wOver[pickW] ||= {})[key] ||= {});
      ov.font = c.kind === 'google' ? G(c.family, gfWeightVal() || pickW) : c;
      delete ov.weight;
      o.vary = { ...(o.vary || {}), ...cleanVary(c) };
      picker.close();
      changed({ fonts: true }); refresh('export');
      return;
    }
    if (pickW) delete state.wOver[pickW]?.[key]?.font;
    if (sameFont) {       // 只记下这个字重用的粗细 / 字体名 / 文件，和自动推算相同时清掉
      const k = fontKey(o.font) + '|' + pickW;
      o.vary = cleanVary(o.font);
      if (o.font.kind === 'google') {
        const v = gfWeightVal(), ov = ((state.wOver[pickW] ||= {})[key] ||= {});
        if (v) ov.weight = v; else delete ov.weight;
      } else {
        const el = o.font.kind === 'local' ? $('#lfName') : $('#ffPath'), v = el.value.trim();
        if (v && v !== el.placeholder) state.weightNames[k] = v; else delete state.weightNames[k];
      }
      picker.close();
      changed({ fonts: true }); refresh('export');
      return;
    }
    o.follow = null;     // 选了字体就改为独立字体，大小和基线保留各自的设定
    o.font = pickW && c.kind === 'google' && !gfWeightVal() ? G(c.family, 400) : c;
    o.vary = cleanVary(c);
    picker.close();
    changed({ fonts: true });
  });
}

/* ================= 界面语言 ================= */
/* 「原理与限制」左边的目录：当前语言那一份说明里的小标题 */
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
  document.querySelectorAll('#moreMenu [data-ui-lang]').forEach(b => b.setAttribute('aria-checked', b.dataset.uiLang === UI));
  renderLangOptions(); renderPresetCards(); renderTypoRows(); renderEditor();
  syncToolbar(); renderPreview(); drawSpecimen(); renderExport();
}
$('#moreMenu').addEventListener('click', e => {
  const b = e.target.closest('[data-ui-lang]'); if (!b) return;
  $('#moreMenu').hidePopover();
  setUI(b.dataset.uiLang); lsSet(LS_UI, UI); applyUI();
});

/* ================= 其他 ================= */
/* 窄屏：一次只显示一栏（编辑 / 校样），用底部页签切换 */
export function syncPanes() {
  const mv = state.view.mview === 'preview' ? 'preview' : 'edit';
  $('.app').dataset.mview = mv;
  document.querySelectorAll('#mTabs [data-mv]').forEach(b => b.setAttribute('aria-selected', b.dataset.mv === mv));
}
export let toastT;
export function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600); }

/* 重置：点一次变成确认，3 秒内再点才执行。「我的预设」不受影响 */
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
  initToolbar(); initPresets(); initPicker(); initReset(); initFontTab();
  $('#aboutToc').addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); document.getElementById(a.hash.slice(1))?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
  setExKind(state.view.exKind, false); syncPanes();
  $('#aboutBtn').addEventListener('click', () => $('#aboutDlg').showModal());
  $('#aboutItem').addEventListener('click', () => { $('#moreMenu').hidePopover(); $('#aboutDlg').showModal(); });
  $('#aboutClose').addEventListener('click', () => $('#aboutDlg').close());
  /* 「⋯」菜单：右边和按钮对齐，挂在按钮下面 */
  $('#moreMenu').addEventListener('toggle', e => {
    if (e.newState !== 'open') return;
    const r = $('#moreBtn').getBoundingClientRect(), pop = e.currentTarget;
    pop.style.top = r.bottom + 6 + 'px'; pop.style.left = Math.max(8, r.right - pop.offsetWidth) + 'px';
  });
  for (const d of ['#aboutDlg', '#exDlg']) $(d).addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });      // 点对话框外面（背景）关闭
  applyUI();
  initSplit(); initSpecSplit(); initHistory(); initTips();
  rebuildNow();
  new ResizeObserver(debounce(drawSpecimen, 100)).observe($('#spec'));
  document.fonts.addEventListener('loadingdone', debounce(fitGlyphs, 60));      // 字样里的字晚一点才下载时，下载完再量
  new ResizeObserver(debounce(refreshVAutospace, 100)).observe($('#proofText'));      // 直排校样的高度跟着窗口变
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawSpecimen());
  new MutationObserver(() => drawSpecimen()).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}
