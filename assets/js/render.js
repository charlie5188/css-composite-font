import { redrawProof } from './proof-editor.js';
import { showMissingGlyphTip, paintMissingGlyphs, syncWeightControl } from './ui-controls.js';
import { $, T, UI, debounce, esc, root, tr } from './i18n.js';
import { CLASSES, CLS, GROUPS, classOf, fmtRanges, inRanges, isMoved } from './unicode.js';
import { BASE_W, EA_FEAT, FONT_FEATURE_SAMPLES, autoNames, clampW, defaultFontWeight, contFont, stepSpan, NUM_FEAT, NUM_TAGS, SAMPLES, TYPO, WEIGHTS, anyShift, axesOf, axisLabel, axisOf, finalFont, fontAtWeight, fontKey, gfWeights, weightChain, fontLabel, inheritedShift, inheritedSize, lineBreakDiagramLang, liveFamily, numLabel, numTags, objByKey, ownFontAt, ownSize, ownerOf, resolveCls, resolveCustom, settingOf, sources, srcError, state, tLineBreakTile, typoValue, usedFont, vfAxisNow } from './core.js';
import { LIMITS, loadBlank, missingIn, renderTypoStatus, renderCurrentPreset, syncViewTypo } from './ui.js';
/* ================= Render: character-class table (InDesign composite-font dialog) ================= */
export const GLYPH = { han: '永', latin: 'Ag', digit: '01', kana: 'あ', bopo: 'ㄅ', punct: '」、', symbol: '※', shared: '“…' };
/* Display the base font first, then Western-side classes (Western, digits, shared punctuation), then Han-side classes (kana, full-width punctuation/symbols, Zhuyin).
   Order each side by likely adjustment frequency. This is display order only; exported rules still follow CLASSES. */
export const CLASS_ORDER = ['han', 'latin', 'digit', 'shared', 'kana', 'punct', 'symbol', 'bopo'];
const clsRank = id => { const i = CLASS_ORDER.indexOf(id); return i < 0 ? CLASS_ORDER.length : i; };
export const visibleClasses = () => [...CLASSES].sort((a, b) => clsRank(a.id) - clsRank(b.id));
export const shortName = f => !f ? '' : f.kind === 'google' ? f.family : f.kind === 'local' ? f.name : f.kind === 'path' ? f.path : f.fileName;
export const keyName = key => key[0] === '#' ? T('customName', { c: state.custom[+key.slice(1)]?.chars || '…' }) : tr(CLS[key].name);
/* Show the font's available weights, not the preview value or export range. Use known data only; missing metadata does not imply 100-900. */
function fontWeightInfo(f) {
  if (!f) return null;
  /* The 100-900 range from manually enabling local VF mode is an editing default, not a range read from the font file. */
  if (f.axesUnknown || (f.kind === 'local' && f.axis && !f.axes?.some(a => a[0] === 'wght'))) return { label: T('fontWeightUnknownLabel'), tip: T('fontWeightUnknown') };
  const axis = vfAxisNow(f), variable = Array.isArray(axis) || axesOf(f).length > 0;
  if (Array.isArray(axis)) return { label: T('fontWeightContinuous'), range: `${axis[0]}–${axis[1]}`, tip: T('fontWeightContinuousHint', { a: axis[0], b: axis[1] }) };
  const weights = f.kind === 'google' && gfWeights(f.family);
  if (weights?.length) {
    const label = weights.length > 2 ? `${weights[0]}–${weights.at(-1)}` : weights.join(T('joiner'));
    return { label: T('fontWeightStepped'), range: label, tip: T('fontWeightList', { weights: weights.join(T('joiner')) }) };
  }
  return variable ? { label: T('fontWeightUnknownLabel'), tip: T('fontWeightUnknown') } : null;
}
/* Keep each range together when wrapping; narrow layouts must not split '400-800'. */
const fontMetaLabel = info => `<span>${esc(info.label)}</span>${info.range ? ` <span class="ct-font-range">${esc(info.range)}</span>` : ''}`;
const fontMetaId = key => `fontMeta-${key[0] === '#' ? 'custom-' + key.slice(1) : key}`;
const fontStatusText = s => s?.status === 'error' ? T('stError', { reason: srcError(s) }) : T(s?.status === 'ok' ? 'stOk' : 'stLoading');
/* Continuous mode loads the full variable weight axis; do not wait for an individual weight that was never requested. Reuse the active source while axis metadata arrives. */
function classFontSource(key, o) {
  if (!o?.font || o.follow) return { key: '', s: null };
  const W = state.view.weight;
  const f = finalFont(ownFontAt(o, W !== BASE_W ? state.wOver[W]?.[key] : null, W, true), o.vary).font;
  const actual = state.wmode === 'cont' ? contFont(f) : f;
  const currentKey = fontKey(actual), previousKey = fontKey(f);
  const sourceKey = sources.has(currentKey) || !sources.has(previousKey) ? currentKey : previousKey;
  return { key: sourceKey, s: sources.get(sourceKey) };
}
/* The table edits base settings at 400, from which other weights are derived. Per-weight adjustments and replacements live in Weights.
   Status dots reflect the font actually used at the current preview weight. */
export function fontCell(key, o, isHan, allowLatin) {
  const opts = [];
  if (!isHan) {
    opts.push(['han', T('optFollow', { c: tr(CLS.han.name), f: fontLabel(resolveCls('han', BASE_W, true).font) })]);
    if (allowLatin) opts.push(['latin', T('optFollow', { c: tr(CLS.latin.name), f: fontLabel(resolveCls('latin', BASE_W, true).font) })]);
  }
  if (o.font) opts.push(['own', o.font.kind === 'google' ? o.font.family : fontLabel(ownFontAt(o, null, BASE_W, false))]);
  opts.push(['pick', T('optPick')]);
  const cur = o.follow || 'own', { key: liveKey, s } = classFontSource(key, o);
  const info = !o.follow && fontWeightInfo(o.font), metaId = fontMetaId(key);
  const status = o.follow ? 'none' : (s?.status || 'loading'), statusText = o.follow ? '' : fontStatusText(s);
  return `<span class="ct-font-pick"><span class="status ${status}"${o.follow ? ' aria-hidden="true"' : ` data-key="${esc(liveKey)}" role="img" tabindex="${status === 'ok' ? -1 : 0}" title="${esc(statusText)}" aria-label="${esc(statusText)}"`}></span>` +
    `<select class="fsel cell-in${o.follow ? ' follow' : ''}" data-act="fsel" title="${esc((opts.find(([v]) => v === cur) || [])[1] || '')}" aria-label="${esc(T('fontAria', { c: keyName(key) }))}"${info ? ` aria-describedby="${metaId}"` : ''}>` +
    opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('') + '</select></span>' +
    `<small class="ct-font-meta hint" id="${metaId}"${info ? ` title="${esc(info.tip)}" aria-label="${esc(info.tip)}"` : ' hidden'}>${info ? fontMetaLabel(info) : ''}</small>`;
}
/* Axis detection may finish while the field is focused. Update only the description, preserving the select and the user's interaction. */
function syncFontMeta() {
  document.querySelectorAll('#editor .ct-row[data-id], #editor .ct-row[data-ci]').forEach(row => {
    const key = row.dataset.id || '#' + row.dataset.ci, o = objByKey(key);
    const meta = row.querySelector('.ct-font-meta'), sel = row.querySelector('.fsel');
    if (!meta || !sel) return;
    const info = o && !o.follow && fontWeightInfo(o.font);
    meta.hidden = !info;
    if (info) {
      meta.innerHTML = fontMetaLabel(info); meta.setAttribute('aria-label', info.tip);
      if (meta.dataset.tip != null) meta.dataset.tip = info.tip; else meta.title = info.tip;
      sel.setAttribute('aria-describedby', meta.id);
    } else sel.removeAttribute('aria-describedby');
  });
}
/* Reserve a fixed arrow gutter so showing controls does not shift numbers. Keep keyboard arrows in the field to avoid excessive table tab stops. */
export function stepperCell(control, label, variant = '') {
  return `<span class="cell-step${variant ? ' ' + variant : ''}">${control}<span class="cell-step-actions">${['up', 'down'].map(dir => {
    const text = esc(T(dir === 'up' ? 'stepIncrease' : 'stepDecrease', { field: label }));
    return `<button type="button" class="btn-icon cell-step-btn" data-step="${dir}" tabindex="-1" aria-label="${text}" title="${text}"><svg class="ic" aria-hidden="true"><use href="#i-chevron-down"/></svg></button>`;
  }).join('')}</span></span>`;
}
export function numCell(field, key) {
  const o = objByKey(key);
  const own = field === 'size' ? ownSize(key, BASE_W) : o.shift;
  const inh = field === 'size' ? inheritedSize(key, BASE_W) : inheritedShift(key);
  const cls = own == null ? '' : ' own';
  const [lo, hi] = LIMITS[field];
  const label = T(field === 'size' ? 'sizeAria' : 'shiftAria', { c: keyName(key) });
  return stepperCell(`<input class="num cell-in cell-num${cls}" type="number" min="${lo}" max="${hi}" step="0.5" inputmode="decimal" autocomplete="off" data-field="${field}" value="${own ?? ''}" placeholder="${inh}" aria-label="${esc(label)}">`, label);
}
/* Show adjusted axes below the row, for example width 80 and optical size following font size. */
export function axRow(key, o) {
  if (o.follow || !o.vary) return '';
  const f = ownFontAt(o, null, BASE_W, true);
  const list = Object.entries(o.vary).filter(([t]) => axisOf(f, t));
  return list.length ? `<span class="ct-ax">${list.map(([t, v]) => `<span>${esc(axisLabel(t))} <b>${esc(v === 'auto' ? T('axOpszAuto') : String(v))}</b></span>`).join('')}</span>` : '';
}
export function errRow(key, o) {
  if (o.follow || !o.font) return '';
  const W = state.view.weight, f = ownFontAt(o, W !== BASE_W ? state.wOver[W]?.[key] : null, W, true);
  const { s } = classFontSource(key, o);
  if (s?.status === 'error') return `<span class="ct-err">${esc(srcError(s))}</span>`;
  /* CJK Google fonts have hundreds of subsets. Non-hundred weights load the variable version, with each subset about 1.9 times the static size. */
  if (f.kind === 'google' && f.weight % 100 && s?.status === 'ok' && s.faces.length > 30) return `<span class="callout ct-note">${esc(T('vfCjkCost'))}</span>`;
  return '';
}
/* ================= Regional checks: glyph forms and punctuation position for the current language ================= */
export const REGION_OF_LANG = { 'zh-Hans': 'sc', 'zh-Hant-TW': 'tw', 'zh-Hant-HK': 'hk', ja: 'jp', ko: 'kr' };
export const PUNCT_CENTER = { sc: false, jp: false, tw: true, hk: true };      // Mainland Chinese and Japanese punctuation sits at the lower left; Taiwan and Hong Kong punctuation is centered.
/* Infer glyph region from family names: Google SC / TC / HK / JP / KR suffixes and common system font names. */
export function formsOf(f) {
  const n = f?.family || f?.name || '';
  if (/\b(SC|GB)\b|YaHei|PingFang SC|Songti SC|STSong|SimSun|STHeiti/.test(n)) return 'sc';
  if (/\bTC\b|PingFang TC|JhengHei|Songti TC|LiHei|BiauKai|MingLiU/.test(n)) return 'tw';
  if (/\bHK\b|PingFang HK/.test(n)) return 'hk';
  if (/\bJP\b|Hiragino (Sans|Mincho|Kaku|Maru)|Yu (Gothic|Mincho)|Meiryo|Shippori|Zen |BIZ UD|M PLUS|Klee|MS (Gothic|Mincho)/.test(n)) return 'jp';
  if (/\bKR\b|Apple SD Gothic|Malgun/.test(n)) return 'kr';
  return null;
}
/* Measure the full-width comma's ink centroid within its body. Fonts containing multiple regional forms (Source Han, Noto CJK) switch by lang, so measure with the language set. */
export const punctMemo = new Map();      // 'font|language' -> 'center' | 'corner' | null; undefined = measuring.
export const regionChanged = debounce(() => { renderEditor({ preserveActive: true }); renderLangWarn(); }, 80);
export function punctPos(s, lang) {
  const k = s.family + '|' + lang;
  if (punctMemo.has(k)) return punctMemo.get(k);
  punctMemo.set(k, undefined);
  Promise.all([document.fonts.load(`100px "${s.family}"`, '，'), loadBlank()]).then(() => {
    const c = document.createElement('canvas'); c.width = 140; c.height = 150;
    const x = c.getContext('2d');
    if ('lang' in x) x.lang = lang;
    x.font = `100px "${s.family}", "__cf_blank"`;      // A missing full-width comma falls back to the blank font and yields no ink.
    const fm = x.measureText('，'), top = 110 - fm.fontBoundingBoxAscent, h = fm.fontBoundingBoxAscent + fm.fontBoundingBoxDescent;
    x.fillText('，', 10, 110);
    const d = x.getImageData(0, 0, 140, 150).data; let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < 140 * 150; i++) if (d[i * 4 + 3] > 128) { sx += i % 140; sy += Math.floor(i / 140); n++; }
    punctMemo.set(k, n && fm.width ? ((sx / n - 10) / fm.width > 0.38 && (sy / n - top) / h < 0.66 ? 'center' : 'corner') : null);
    regionChanged();
  }, () => punctMemo.set(k, null));
  return undefined;
}
/* Check the Han glyph region and full-width punctuation position for a language. */
export const langName = lang => tr(TYPO.find(t => t.key === 'lang').values.find(([v]) => v === lang)?.[1]) || lang;
export function regionCheck(lang) {
  const want = REGION_OF_LANG[lang], out = {};
  if (!want) return out;
  const W = state.view.weight, han = resolveCls('han', W, true), pu = resolveCls('punct', W, true);
  const got = formsOf(han.font);
  if (got && got !== want) out.forms = { got, font: han.font };
  if (want in PUNCT_CENTER && pu.font) {
    const s = sources.get(fontKey(usedFont(pu))), pos = s?.status === 'ok' ? punctPos(s, lang) : null;
    if (pos && (pos === 'center') !== PUNCT_CENTER[want]) out.punct = { pos, font: pu.font };
  }
  return out;
}
/* Check class rows against the proof language: glyph forms in the Han row, punctuation position in the punctuation row. */
export function regionRow(key) {
  if (key !== 'han' && key !== 'punct') return '';
  const lang = state.typo.lang, c = regionCheck(lang);
  if (key === 'han' && c.forms) return `<span class="callout ct-note">${esc(T('regForms', { got: T('reg_' + c.forms.got), lang: langName(lang) }))}</span>`;
  if (key === 'punct' && c.punct) return `<span class="callout ct-note">${esc(T(c.punct.pos === 'center' ? 'regPunctCenter' : 'regPunctCorner', { lang: langName(lang) }))}</span>`;
  return '';
}
/* Check export against its language scope; show the result below the language field. */
export function renderLangWarn() {
  const el = $('#exLangWarn'), lang = state.scope, c = lang ? regionCheck(lang) : {}, list = [];
  if (c.forms) list.push(T('exRegForms', { font: shortName(c.forms.font), got: T('reg_' + c.forms.got) }));
  if (c.punct) list.push(T(c.punct.pos === 'center' ? 'exRegPunctCenter' : 'exRegPunctCorner', { font: shortName(c.punct.font) }));
  el.hidden = !list.length;
  if (list.length) el.textContent = T('exRegWarn', { lang: langName(lang), list: list.join(T('joiner')) });
}
export function renderEditor({ preserveActive = false } = {}) {
  // Background font metadata must not replace a field between focus and the next input event.
  if (preserveActive && $('#editor').contains(document.activeElement)) return renderChipsStatus();
  renderClassRows(); renderWeights();
}
/* Class samples may exceed their cells, especially two full-width marks or enlarged Western text. Use halt to narrow punctuation where supported (see CSS).
   If still too wide, reduce only this sample's font size proportionally, without distortion. Allow 4px overflow on each side: pane padding on the left, half the gap on the right. */
export function fitGlyphs() {
  for (const el of document.querySelectorAll('#classRows .ct-glyph')) {
    el.style.fontSize = '';
    if (!el.clientWidth) continue;      // Tab closed or pane hidden on narrow screens: measure when shown.
    const r = document.createRange(); r.selectNodeContents(el);
    const w = r.getBoundingClientRect().width, room = el.clientWidth + 8;
    if (w > room) el.style.fontSize = Math.max(14, Math.floor(parseFloat(getComputedStyle(el).fontSize) * room / w)) + 'px';
  }
  renderVerticalGuides();      // Reuse font-load and tab-reveal measurements for the feature specimen overlays.
}
export function renderClassRows() {
  $('#classRows').innerHTML = visibleClasses().map(c => {
    const o = state.classes[c.id];
    const tip = c.id === 'shared' ? T('sharedHint') : '';
    const groups = GROUPS[c.id] || [];
    const nMoved = groups.filter(g => isMoved(c.id, g)).length;
    const nIn = c.id === 'latin' ? Object.entries(GROUPS).reduce((n, [cid, gs]) => n + gs.filter(g => isMoved(cid, g)).length, 0) : 0;
    const note = [c.note ? tr(c.note) : '', nMoved ? T('movedNote', { n: nMoved }) : '', nIn ? T('movedIn', { n: nIn }) : ''].filter(Boolean).join(' · ');
    const gear = groups.length ? `<button type="button" class="btn-icon mini gear${nMoved ? ' on' : ''}" data-act="groups" data-cls="${c.id}" popovertarget="grpPop" aria-label="${esc(T('gearAria', { c: tr(c.name) }))}" title="${esc(T('gearAria', { c: tr(c.name) }))}"><svg class="ic" aria-hidden="true"><use href="#i-settings"/></svg></button>` : '';
    return `<div class="ct-row" data-id="${c.id}" style="--c:var(--c-${c.id})">
      <span class="ct-glyph" aria-hidden="true">${esc(GLYPH[c.id])}</span>
      <span class="ct-name"${tip ? ` title="${esc(tip)}"` : ''}><span class="nm"><i class="dot"></i>${esc(tr(c.name))}${gear}</span>${note ? `<small>${esc(note)}</small>` : ''}</span>
      <span class="ct-font">${fontCell(c.id, o, c.id === 'han', c.id !== 'latin')}</span>
      ${numCell('size', c.id)}${numCell('shift', c.id)}<span></span>${axRow(c.id, o)}${errRow(c.id, o)}${regionRow(c.id)}
    </div>`;
  }).join('');
  renderNumHint(); renderEaMarks(); renderSpacingMarks();      // Recheck feature specimens after fonts load.
  $('#customRows').innerHTML = state.custom.length ? state.custom.map((cu, i) => `<div class="ct-row" data-ci="${i}">
      <input class="chars" type="text" value="${esc(cu.chars)}" placeholder="${esc(T('customPh'))}" aria-label="${esc(T('custom'))}" spellcheck="false">
      <span class="ct-font">${fontCell('#' + i, cu, false, true)}</span>
      ${numCell('size', '#' + i)}${numCell('shift', '#' + i)}
      <button class="btn-icon mini danger x" type="button" data-act="remove" aria-label="${esc(T('customRemove'))}" title="${esc(T('customRemove'))}"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button>${axRow('#' + i, cu)}${errRow('#' + i, cu)}
    </div>`).join('')
    : '';
  fitGlyphs();
}
/* ================= Weights: size and weight per step =================
   Rows are weights: check exports in stepped mode, select a range with the slider in continuous mode, retaining inactive rows. Columns are classes with their own fonts.
   The 400 row edits base settings. Grey values are derived or inherited; blue values are explicit. Click a selected row's blank space or weight to preview without changing exports. */
export function wKeys() {
  const own = o => o && !o.follow && o.font, keys = ['han'];
  for (const c of visibleClasses()) if (c.id !== 'han' && own(state.classes[c.id])) keys.push(c.id);
  state.custom.forEach((cu, i) => { if (own(cu)) keys.push('#' + i); });
  /* Also show followed classes with per-weight size overrides so those settings remain visible. */
  for (const W of WEIGHTS) for (const [k, ov] of Object.entries(state.wOver[W] || {})) if (!keys.includes(k) && ov.size != null && objByKey(k)) keys.push(k);
  return keys;
}
export const wRowAdjusted = W => W !== BASE_W && (Object.values(state.wOver[W] || {}).some(ov => Object.keys(ov).length) || Object.keys(state.weightNames).some(k => k.endsWith('|' + W)));
export const wColumnAdjusted = key => {
  const o = objByKey(key), weight = defaultFontWeight(o.font);
  return o.size != null || o.shift != null || (!o.follow && weight != null && (o.font.weight || BASE_W) !== weight) ||
    Object.entries(state.wOver).some(([W, row]) => +W !== BASE_W && Object.keys(row[key] || {}).length);
};
/* Show only the name suffix that differs from 400: 'Hiragino Mincho ProN W6' becomes '...W6'. */
export function nameTail(base, name) {
  const bw = base.split(/(?=[ _-])/), nw = name.split(/(?=[ _-])/);
  let i = 0; while (i < nw.length - 1 && bw[i] === nw[i]) i++;
  return i ? '…' + nw.slice(i).join('').replace(/^[ _-]/, '') : name;
}
/* Weight cell kind: vf = arbitrary value, gsel = static Google step, name = local/uploaded font name. val is explicit; auto is derived. */
export function wInfo(k, o, W) {
  const base = W === BASE_W, ov = base ? null : state.wOver[W]?.[k], eff = ov?.font || o.font, axis = vfAxisNow(eff);
  if (Array.isArray(axis)) {
    const val = base ? (eff.weight || 400) : ov?.font ? (ov.font.weight || 400) : ov?.weight;
    return { kind: 'vf', ov, axis, val, set: !base && val != null, auto: base ? '' : clampW(fontAtWeight(o.font, W).weight || W, axis) };
  }
  if (eff.kind === 'google') {
    const autoF = fontAtWeight(o.font, W), val = base ? eff.weight : ov?.font ? ov.font.weight : (ov?.weight || 0);
    const avail = gfWeights(eff.family);
    /* After loading, derive from the actual returned weight; beforehand, use the loading rule's nearest available weight toward 400. */
    const auto = sources.get(fontKey(autoF))?.actualWeight || (avail && weightChain(Math.round(autoF.weight / 100) * 100).find(w => avail.includes(w))) || autoF.weight;
    return { kind: 'gsel', ov, val, set: !base && !!val, auto, noAuto: base || !!ov?.font, avail: avail || WEIGHTS };
  }
  const f = base ? o.font : ov?.font || fontAtWeight(o.font, W), set = !base && (!!ov?.font || (fontKey(o.font) + '|' + W) in state.weightNames);
  return { kind: 'name', ov, name: shortName(f), set, guess: !base && !set && o.font.kind === 'local' && autoNames.get(fontKey(o.font) + '|' + W)?.status === 'guess' };
}
/* Static Google weights list only actual steps. As with size, grey is derived and blue is explicit; choosing the derived step clears the override. */
function wOptions(i) {
  const cur = i.val || i.auto, list = [...new Set([...i.avail, cur])].sort((a, b) => a - b);
  return list.map(w => `<option value="${w}"${w === cur ? ' selected' : ''}>${w}</option>`).join('');
}
const wSelTip = i => i.noAuto ? '' : T(i.set ? 'wSetTip' : 'wAutoTip', { w: i.auto });
const wSelect = (i, d, aria, swap) => `<select class="msel cell-in cell-num${i.set ? ' set' : ''}" data-act="wsel" ${d}${i.noAuto ? '' : ` data-auto="${i.auto}" data-tip="${esc(wSelTip(i))}"`} aria-label="${aria}"${swap}>${wOptions(i)}</select>`;
export function wCell(k, o, W) {
  const i = wInfo(k, o, W), d = `data-k="${esc(k)}" data-w="${W}"`, label = T('wWeightAria', { c: keyName(k), w: W }), aria = esc(label);
  if (i.kind === 'name') return `<span class="wm-c"><button type="button" class="wm-name cell-in cell-num${i.set ? ' set' : ''}${i.guess ? ' guess' : ''}" data-act="wpick" ${d} title="${esc(T('wNameTip', { w: W, name: i.name }) + (i.guess ? ' ' + T('wNameGuess') : ''))}">${esc(nameTail(shortName(o.font), i.name))}</button></span>`;
  const swap = i.ov?.font ? ` title="${esc(T('wSwapped', { font: fontLabel(i.ov.font) }))}"` : '';
  const ctl = i.kind === 'vf'
    ? `<input class="mw cell-in cell-num${i.set ? ' set' : ''}" type="number" data-act="wnum" ${d} min="${i.axis[0]}" max="${i.axis[1]}" step="10" value="${i.val ?? ''}" placeholder="${i.auto}" aria-label="${aria}"${swap}>`
    : wSelect(i, d, aria, swap);
  return `<span class="wm-c${i.ov?.font ? ' swapped' : ''}">${stepperCell(ctl, label)}</span>`;
}
export function sizeCell(k, W) {
  const own = ownSize(k, W), label = T('wSizeAria', { c: keyName(k), w: W });
  return stepperCell(`<input class="mnum cell-in cell-num${own == null ? '' : W === BASE_W ? ' own' : ' set'}" type="number" min="${LIMITS.size[0]}" max="${LIMITS.size[1]}" step="0.5" inputmode="decimal" autocomplete="off" data-k="${esc(k)}" data-w="${W}" value="${own ?? ''}" placeholder="${inheritedSize(k, W)}" aria-label="${esc(label)}">`, label);
}
export const wAnyAdjusted = () => WEIGHTS.some(wRowAdjusted);
export function renderWeights() {
  const cont = state.wmode === 'cont', PW = state.view.weight, box = $('#wMatrix');
  const cols = wKeys().map(k => { const o = objByKey(k), own = !o.follow && !!o.font, vf = own && Array.isArray(vfAxisNow(o.font)); return { k, o, vf, w: own && !(cont && vf) }; });
  const rows = WEIGHTS;
  const sizeOnly = cont && cols.every(c => !c.w);      // Static fonts still allow per-step weight adjustment in continuous mode; keep the two header levels.
  const n = cols.reduce((a, c) => a + (c.w ? 2 : 1), 0), lead = 2;      // Export selection + weight; continuous mode uses a vertical range slider.
  /* Reserve separate space for numbers and steppers so arrows cannot crowd decimals. The final column holds row actions. */
  const tracks = cols.map(c => `${c.w ? 'minmax(64px, 1fr) ' : ''}minmax(72px, 1fr)`).join(' ');
  box.classList.toggle('wm-cont', cont);
  box.style.setProperty('--wm-cols', `${cont ? '40px' : 'max-content'} 70px ${tracks} 28px`);
  /* Restore the focused cell after redraws caused by export checks or font loading. */
  const act = $('#wRows').contains(document.activeElement) ? document.activeElement : null;
  const keep = act && (act.classList[0] ? '.' + CSS.escape(act.classList[0]) : act.tagName.toLowerCase()) + ['k', 'w', 'wx', 'pw', 'wreset'].filter(a => act.dataset[a] != null).map(a => `[data-${a}="${CSS.escape(act.dataset[a])}"]`).join('');
  const clsHead = `<div class="wm-row wm-cls${sizeOnly ? ' wm-single' : ''}">${sizeOnly ? `<span class="wm-wh">${esc(T('wColExport'))}</span><span class="wm-wh">${esc(T('wColWeight'))}</span>` : '<span></span>'.repeat(lead)}${cols.map(c => `<span style="grid-column:span ${c.w ? 2 : 1};--c:var(--c-${c.k[0] === '#' ? 'custom' : c.k})"><i class="dot"></i><span class="wm-clabel" title="${esc(sizeOnly ? T('wClassSize', { c: keyName(c.k) }) : keyName(c.k))}">${esc(sizeOnly ? T('wClassSize', { c: keyName(c.k) }) : keyName(c.k))}</span><button type="button" class="btn-icon sm" data-wreset="${esc(c.k)}"${wColumnAdjusted(c.k) ? '' : ' disabled'} title="${esc(T('wColumnReset', { c: keyName(c.k) }))}" aria-label="${esc(T('wColumnReset', { c: keyName(c.k) }))}"><svg class="ic" aria-hidden="true"><use href="#i-restore"/></svg></button></span>`).join('')}<span></span></div>`;
  const subHead = `<div class="wm-row wm-sub"><span class="wm-xh">${esc(T('wColExport'))}</span><span class="wm-wh">${esc(T('wColWeight'))}</span>${cols.map(c => (c.w ? `<span${c.vf ? ` title="VF ${vfAxisNow(c.o.font).join('–')}"` : ''}>${esc(T('wColW'))}</span>` : '') + `<span>${esc(T('colSize'))}</span>`).join('')}<span></span></div>`;
  const bodyStart = sizeOnly ? 2 : 3;
  const body = rows.map((W, i) => {
    const on = cont ? !!stepSpan(W) : state.weights.includes(W), cur = on && W === PW;
    const tag = W === BASE_W ? T('wBase') : W === 700 ? T('w700') : '';
    const lab = `${W}${tag ? `<small>${esc(tag)}</small>` : ''}`;
    const cells = cont || on ? cols.map(c => (c.w ? wCell(c.k, c.o, W) : '') + sizeCell(c.k, W)).join('') : '<span></span>'.repeat(n);
    const menu = (cont || on) && W !== BASE_W ? `<button type="button" class="btn-icon sm wm-more" data-wmenu="${W}" popovertarget="wRowMenu" aria-haspopup="menu" aria-label="${esc(T('wRowMenu', { w: W }))}" title="${esc(T('wRowMenu', { w: W }))}"><svg class="ic" aria-hidden="true"><use href="#i-dots"/></svg></button>` : '';
    return `<div class="wm-row${on ? '' : ' off'}${cur ? ' cur' : ''}" data-row="${W}"${cont ? ` style="grid-row:${bodyStart + i}"` : ''}${cur ? ' aria-current="true"' : ''}>
      ${cont ? '' : `<span class="wm-x"><input type="checkbox" data-wx="${W}"${on ? ' checked' : ''} aria-label="${esc(T('wExportAria', { w: W }))}" title="${esc(T('wExportAria', { w: W }))}"></span>`}<span class="wm-w"><button type="button" class="wm-pw" data-pw="${W}"${on ? ` title="${esc(T('wPreviewTip', { w: W }))}"` : ' disabled'}>${lab}</button></span>${cells}<span class="wm-act">${menu}</span>
    </div>`;
  }).join('');
  $('#wRows').innerHTML = clsHead + (sizeOnly ? '' : subHead) + body;
  const range = $('#wRange');
  range.hidden = !cont;
  range.style.gridRow = `${bodyStart} / span ${rows.length}`;
  // Keep the range control mounted across table rebuilds so asynchronous font loading cannot interrupt pointer capture.
  if (cont) syncWeightRange(range.dataset.draft ? JSON.parse(range.dataset.draft) : state.wrange);
  if (keep) box.querySelector(keep)?.focus({ preventScroll: true });
  $('#wReset').hidden = !wAnyAdjusted();
}
/* Dragging previews the selected range; release commits it as one undoable change, preserving saved adjustments outside the range. */
export function syncWeightRange([lo, hi] = state.wrange) {
  const range = $('#wRange');
  range.style.setProperty('--range-start', `${(lo - 100) / 8}%`);
  range.style.setProperty('--range-end', `${(hi - 100) / 8}%`);
  range.dataset.tight = hi - lo < 60;
  range.querySelectorAll('[data-end]').forEach((thumb, i) => {
    thumb.setAttribute('aria-valuemin', i ? lo + 1 : 100);
    thumb.setAttribute('aria-valuemax', i ? 900 : hi - 1);
    thumb.setAttribute('aria-valuenow', i ? hi : lo);
  });
  $('#wRows').querySelectorAll('[data-row]').forEach(row => {
    const W = +row.dataset.row, on = lo <= Math.min(900, W + 50) && hi >= Math.max(100, W - 49);
    row.classList.toggle('off', !on);
    row.querySelector('[data-pw]').disabled = !on;
    const cur = on && W === state.view.weight;
    row.classList.toggle('cur', cur);
    if (cur) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
  });
}
/* Update cells in place after value changes, preserving input focus and repeated keyboard adjustments. */
export function syncMatrix() {
  const act = document.activeElement;
  document.querySelectorAll('#wMatrix [data-k][data-w]').forEach(el => {
    const k = el.dataset.k, W = +el.dataset.w, o = objByKey(k); if (!o) return;
    if (el.classList.contains('mnum')) {
      const own = ownSize(k, W);
      el.placeholder = inheritedSize(k, W);
      if (el !== act) el.value = own ?? '';
      el.classList.toggle('own', own != null && W === BASE_W); el.classList.toggle('set', own != null && W !== BASE_W);
      return;
    }
    if (!o.font || o.follow) return;
    const i = wInfo(k, o, W);
    if (el.classList.contains('mw') && i.kind === 'vf') {
      el.placeholder = i.auto; if (el !== act) el.value = i.val ?? '';
      el.classList.toggle('set', i.set);
    } else if (el.classList.contains('msel') && i.kind === 'gsel') {
      el.innerHTML = wOptions(i);      // The derived step may change once the actual font weight is known.
      if (i.noAuto) { delete el.dataset.auto; delete el.dataset.tip; } else { el.dataset.auto = i.auto; el.dataset.tip = wSelTip(i); }
      el.classList.toggle('set', i.set);
    }
  });
  $('#wReset').hidden = !wAnyAdjusted();
  document.querySelectorAll('#wMatrix [data-wreset]').forEach(b => { b.disabled = !wColumnAdjusted(b.dataset.wreset); });
}
/* Only change row highlighting when editing follows a weight; do not rebuild the table or lose field focus. */
export function markPreviewRow() {
  const PW = state.view.weight;
  document.querySelectorAll('#wMatrix [data-row]').forEach(r => { const c = +r.dataset.row === PW; r.classList.toggle('cur', c); if (c) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current'); });
}
/* Vertical text with mixed-script spacing: Chrome's 1/8-em spacing at element boundaries can place the following glyph over the preceding one.
   Disable spacing inside spans in vertical mode and supply boundary margins only between Han/kana and letters/digits.
   Like native autospace, omit spacing at column breaks: measure after layout to check whether neighboring glyphs share a column.
   Removing a margin can move later breaks, so measure again; never restore a removed margin within this pass, avoiding oscillation. */
export const IDEO_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}]/u, ALNUM_RE = /[\p{L}\p{N}]/u;
export function vAutospace(pt) {
  const kind = ch => !ch ? 0 : IDEO_RE.test(ch) ? 1 : ALNUM_RE.test(ch) ? 2 : 0;
  const gap = (a, b) => !!(kind(a) && kind(b) && kind(a) !== kind(b));
  const nodes = [...pt.childNodes], first = n => [...(n?.textContent || '')][0], last = n => [...(n?.textContent || '')].pop();
  const edges = [];      // [span, 'marginInlineStart' | 'marginInlineEnd', preceding node, following node]
  nodes.forEach((n, i) => {
    if (n.nodeType !== 1) return;
    n.style.textAutospace = 'no-autospace';
    n.style.marginInlineStart = n.style.marginInlineEnd = '';
    if (nodes[i - 1]?.nodeType === 3 && gap(last(nodes[i - 1]), first(n))) edges.push([n, 'marginInlineStart', nodes[i - 1], n]);      // A preceding span owns margin-inline-end; do not add the same gap twice.
    if (gap(last(n), first(nodes[i + 1]))) edges.push([n, 'marginInlineEnd', n, nodes[i + 1]]);
  });
  if (!edges.length) return;
  const charRect = (node, atEnd) => {      // Position of the node's first or last character.
    const t = node.nodeType === 3 ? node : node.firstChild, s = t.data, c = atEnd ? [...s].pop() : [...s][0], r = document.createRange();
    r.setStart(t, atEnd ? s.length - c.length : 0); r.setEnd(t, atEnd ? s.length : c.length);
    return r.getBoundingClientRect();
  };
  const sameCol = (a, b) => {
    const ra = charRect(a, true), rb = charRect(b, false);
    if (!ra.width || !rb.width) return true;      // No layout yet because the proof is hidden: add spacing normally.
    return Math.abs(ra.left + ra.width / 2 - rb.left - rb.width / 2) < ra.width / 2;
  };
  const dropped = new Set();
  for (let k = 0; k < 4; k++) {
    const want = edges.map((e, j) => !dropped.has(j) && sameCol(e[2], e[3]));      // Measure everything before changing margins, requiring only one layout.
    let changed = false;
    edges.forEach(([el, side], j) => {
      if (!want[j] && el.style[side]) dropped.add(j);
      const v = want[j] ? '.125em' : '';
      if (el.style[side] !== v) { el.style[side] = v; changed = true; }
    });
    if (!changed) break;
  }
}
/* Font loading and proof height can move column breaks; measure again. */
export function refreshVAutospace() {
  const pt = $('#proofText');
  if (state.view.vertical && state.typo.autospace !== 'no-autospace' && pt.firstElementChild) vAutospace(pt);
}
/* Gear-menu group toggles: on keeps the characters in this class; off delegates them to Western text. */
export function renderGroups() {
  const pop = $('#grpPop'), id = pop.dataset.cls; if (!id || !GROUPS[id]) return;
  const name = tr(CLS[id].name);
  pop.innerHTML = `<div class="gp-head"><b>${esc(T('gpHead', { c: name }))}</b><span class="hint">${esc(T(id === 'shared' ? 'gpHintShared' : id === 'bopo' ? 'gpHintBopo' : 'gpHintSymbol', { c: name }))}</span></div>` +
    GROUPS[id].map(g => `<div class="gp-row"><span class="gp-sample" aria-hidden="true">${esc(g.sample)}</span>
      <span class="gp-name">${esc(tr(g.name))}<small>${esc(fmtRanges(g.r))}</small></span>
      <button type="button" class="sw" role="switch" data-g="${id}.${g.id}" aria-checked="${!isMoved(id, g)}" aria-label="${esc(tr(g.name))}"></button></div>`).join('') +
    (GROUPS[id].some(g => isMoved(id, g)) ? `<div class="gp-foot"><button type="button" class="btn-text" data-act="gpreset">${esc(T('gpReset'))}</button></div>` : '');
}
/* ================= Numeric styles =================
   Test each feature by drawing 0-9 with and without it and comparing pixels. Identical output means unsupported or already the default,
   such as selecting lining figures in a font with lining defaults. Google web fonts remove most features, including onum and zero. */
export let numSeq = 0;
export function digitFx() {
  const f = usedFont(resolveCls('digit', state.view.weight, true)), s = f && sources.get(fontKey(f));
  if (s?.status !== 'ok') return { f, fx: null, checking: false };
  const fx = numFx(f);
  return { f, fx, checking: !fx && featCache.get(fontKey(f) + '|0123456789') === 'pending' };
}
/* Detect OpenType effects by drawing text with each feature separately and comparing against the default pixel by pixel. Identical output means no effect.
   extra(ctx, baseFamily) can collect other measurements. Cache by font + text and call done after measurement. */
export const featCache = new Map();
export function featFx(f, text, tags, done, extra, writingMode = '') {
  const s = f && sources.get(fontKey(f));
  if (s?.status !== 'ok') return null;
  const key = fontKey(f) + '|' + text + (writingMode ? '|' + writingMode : ''), c = featCache.get(key);
  if (c) return c === 'pending' ? null : c.unknown ? null : c;
  featCache.set(key, 'pending');
  (async () => {
    const cps = [...text].map(ch => ch.codePointAt(0));
    const fcs = s.faces.filter(fc => !fc.range || cps.some(cp => inRanges(fc.range, cp))), id = '__cf_ft' + (++numSeq), all = [];
    const fam = tag => {
      for (const fc of fcs) {
        try {
          const d = { ...(fc.range ? { unicodeRange: fmtRanges(fc.range) } : {}), ...(tag ? { featureSettings: `"${tag}"` } : {}) };
          const ff = new FontFace(id + tag, fc.buffer || fc.src, d); document.fonts.add(ff); all.push(ff);
        } catch (e) { /* Ignore. */ }
      }
      return id + tag;
    };
    const names = ['', ...tags].map(fam);
    await Promise.allSettled(all.map(ff => ff.load()));
    let out = { unknown: true };      // Loading failed: omit the annotation.
    if (all.length && all.every(ff => ff.status === 'loaded')) {
      if (writingMode) {
        // Shape spacing features on real elements: older canvas engines ignore font-face feature defaults,
        // and canvas cannot exercise vertical advances at all. Explicit element settings also match the cards.
        const samples = names.map((name, i) => {
          const el = document.createElement('span');
          el.style.cssText = `position:fixed;visibility:hidden;writing-mode:${writingMode};white-space:pre;font:48px "${name}";font-feature-settings:${i ? `"${tags[i - 1]}"` : 'normal'};text-spacing-trim:space-all;text-autospace:no-autospace;`;
          el.textContent = text; document.body.append(el); return el;
        });
        try {
          const dimension = writingMode === 'vertical-rl' ? 'height' : 'width', base = samples[0].getBoundingClientRect()[dimension];
          out = Object.fromEntries(tags.map((tag, i) => [tag, Math.abs(samples[i + 1].getBoundingClientRect()[dimension] - base) > 0.5]));
        } finally { samples.forEach(el => el.remove()); }
      } else {
        const cv = document.createElement('canvas'); cv.width = 720; cv.height = 80;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        const draw = n => { ctx.clearRect(0, 0, 720, 80); ctx.font = `48px "${n}"`; ctx.fillText(text, 4, 60); return new Uint32Array(ctx.getImageData(0, 0, 720, 80).data.buffer); };
        const base = draw(names[0]);
        out = Object.fromEntries(tags.map((t, i) => { const d = draw(names[i + 1]); return [t, d.some((v, j) => v !== base[j])]; }));
        if (extra) { ctx.font = `48px "${names[0]}"`; Object.assign(out, extra(ctx)); }
      }
    }
    all.forEach(ff => document.fonts.delete(ff));
    featCache.set(key, out);
    done?.();
  })();
  return null;
}
/* Measure default digits too: a zero near x-height suggests oldstyle figures; equal widths for 1 and 0 suggest tabular figures. */
export function numFx(f) {
  return featFx(f, '0123456789', NUM_TAGS, renderNumHint, ctx => {
    const m = ch => ctx.measureText(ch), a0 = m('0').actualBoundingBoxAscent;
    return { def: { fig: a0 < (m('x').actualBoundingBoxAscent + m('H').actualBoundingBoxAscent) / 2 ? 'onum' : 'lnum', spc: Math.abs(m('1').width - m('0').width) < 0.5 ? 'tnum' : 'pnum' } };
  });
}
/* No change means either already the default ('default') or unsupported by the font ('none'). */
export const numWhy = (fx, t) => fx[t] ? '' : t === fx.def.fig || t === fx.def.spc ? 'default' : 'none';
/* Below Numeric style, show the digit font's default style and whether the selected style has an effect. */
export function renderNumHint() {
  const el = $('#numHint'); if (!el) return;
  const { f, fx } = digitFx();
  el.hidden = !fx;
  /* Dim styles unsupported by the font, which render like the default; explain on hover. */
  document.querySelectorAll('#featRows [data-typo="num"], #featRows [data-typo="zero"]').forEach(b => {
    const lack = fx ? b.dataset.v.split(' ').map(v => NUM_FEAT[v]).filter(t => t && numWhy(fx, t) === 'none') : [];
    markLack(b, !!lack.length);
    b.title = b.dataset.v + (lack.length ? ' — ' + T('numLacks', { font: shortName(f), list: lack.map(numLabel).join(T('joiner')) }).trim() : '');
  });
  if (!fx) return;
  const font = shortName(f), none = numTags().filter(t => numWhy(fx, t) === 'none');
  el.textContent = T('numDefIs', { font, list: [fx.def.fig, fx.def.spc].map(numLabel).join(T('joiner')) }) +
    (none.length ? T('numLacks', { font, list: none.map(numLabel).join(T('joiner')) }) + (f.kind === 'google' ? T('numGoogleShort') : '') : '');
}
/* Do not show misleading identical specimens for unsupported feature cards. Show the unavailable label and a dotted border; allow selection with a warning border. */
function markLack(b, on, label = 'lackTile') {
  b.classList.toggle('lack', on);
  const s = b.querySelector('.tt-s'); if (s) s.dataset.lack = on ? T(label) : '';
}
/* Han, punctuation, full-width digits and ASCII digits can use different sources, including custom exceptions.
   Only claim no effect once every source actually used by the card has been checked. */
function specimenFx(text, tags, done, writingMode = '') {
  const groups = new Map();
  for (const ch of text) {
    const owner = ownerOf(ch.codePointAt(0));
    const f = usedFont(owner[0] === '#' ? resolveCustom(state.custom[+owner.slice(1)], state.view.weight, true) : resolveCls(owner === 'other' ? 'han' : owner, state.view.weight, true));
    const key = fontKey(f), group = groups.get(key) || { f, text: '' };
    group.text += ch; groups.set(key, group);
  }
  return [...groups.values()].map(({ f, text }) => ({ f, fx: featFx(f, text, tags, done, null, writingMode) }));
}
/* Measure a single shaped text node so the guides show real advances, including default features and
   different source sizes. Wrapping characters in separate elements could change the shaping being explained. */
export function renderVerticalGuides() {
  const samples = [...document.querySelectorAll('#featRows [data-typo="vfeat"] .tt-vspecimen')].map(box => {
    const text = box.querySelector('.tt-s'), node = text.firstChild;
    const bounds = text.getBoundingClientRect();
    if (!bounds.width || !node) return null;      // Measure hidden tabs when fitGlyphs runs on reveal.
    const em = parseFloat(getComputedStyle(text).fontSize), range = document.createRange(), cells = [];
    let offset = 0;
    for (const ch of node.textContent) {
      range.setStart(node, offset); offset += ch.length; range.setEnd(node, offset);
      const rect = range.getBoundingClientRect();
      cells.push({ y: rect.top - bounds.top, h: rect.height });
    }
    return { box, svg: box.querySelector('svg'), em, width: bounds.width, cells, end: Math.max(0, ...cells.map(c => c.y + c.h)) };
  }).filter(Boolean);
  if (!samples.length) return;
  const reference = samples[0].end, height = Math.max(reference, ...samples.map(s => Math.max(s.end, s.em * 4)));
  for (const { box, svg, em, width, cells } of samples) {
    box.style.height = `${height}px`;      // Keep both labels aligned even when a character class has a different size.
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const x = (width - em) / 2;
    svg.innerHTML = `<rect class="tt-vreference" x="${x}" y="0" width="${em}" height="${reference}"/>` +
      cells.map(({ y, h }) => `<rect class="tt-vcell" x="${x}" y="${y}" width="${em}" height="${h}"/>`).join('');
  }
}
export function renderSpacingMarks() {
  const horizontal = specimenFx(FONT_FEATURE_SAMPLES.feat, ['palt', 'halt'], renderSpacingMarks, 'horizontal-tb');
  const vertical = specimenFx(FONT_FEATURE_SAMPLES.vfeat, ['vhal'], renderSpacingMarks, 'vertical-rl');
  document.querySelectorAll('#featRows [data-typo="feat"], #featRows [data-typo="vfeat"]').forEach(b => {
    const tag = b.dataset.v.replaceAll('"', ''), isVertical = b.dataset.typo === 'vfeat';
    const unchanged = tag !== 'normal' && (isVertical ? vertical : horizontal).every(({ fx }) => fx && !fx[tag]);
    markLack(b, !!unchanged, 'unchangedTile');
    b.title = b.dataset.v + (unchanged ? ' — ' + T('spacingUnchanged') : '');
  });
  renderVerticalGuides();
}
/* Dim ineffective glyph-standard and width cards, checking the fonts that render the visible specimen. */
export function renderEaMarks() {
  const fonts = {}, names = {}, fx = {};
  for (const k of ['eaVar', 'eaWidth']) {
    const t = TYPO.find(x => x.key === k), tags = t.values.map(v => EA_FEAT[v[0]]).filter(Boolean);
    const samples = specimenFx(FONT_FEATURE_SAMPLES[k], tags, renderEaMarks, k === 'eaWidth' ? 'horizontal-tb' : '');
    fonts[k] = samples.map(({ f }) => f);
    names[k] = [...new Set(fonts[k].map(shortName))].join(T('joiner'));
    fx[k] = samples.every(s => s.fx) ? Object.fromEntries(tags.map(tag => [tag, samples.some(s => s.fx[tag])])) : null;
    /* If only one JIS option is unchanged while the others differ, it is the default standard (for example JIS2004 in ProN), not an unsupported feature. */
    const jisAny = fx[k] && ['jp78', 'jp83', 'jp90', 'jp04'].some(t => fx[k][t]);
    document.querySelectorAll(`#featRows [data-typo="${k}"]`).forEach(b => {
      const tag = EA_FEAT[b.dataset.v], none = !!(tag && fx[k] && !fx[k][tag]), isDef = none && /^jp/.test(tag) && jisAny;
      markLack(b, none && !isDef, k === 'eaWidth' ? 'unchangedTile' : 'lackTile');
      b.title = b.dataset.v + (none ? ' — ' + T(k === 'eaWidth' ? 'spacingUnchanged' : isDef ? 'eaDefault' : 'eaLack', { font: names[k] }) : '');
    });
  }
  /* When both proportional and full-width options have no effect, explain below the cards why their specimens look identical. */
  const wh = $('#eaWHint');
  if (wh) {
    const noneW = fx.eaWidth && !['pwid', 'fwid'].some(t => fx.eaWidth[t]);
    wh.hidden = !noneW;
    if (noneW) wh.textContent = T('eaWNone', { font: names.eaWidth }) + (fonts.eaWidth.some(f => f.kind === 'google') ? T('eaGoogle') : '');
  }
  const el = $('#eaHint'); if (!el) return;
  const none = fx.eaVar && !['jp78', 'jp83', 'jp90', 'jp04', 'smpl', 'trad'].some(t => fx.eaVar[t]);
  el.hidden = !none;
  if (none) el.textContent = T('eaNone', { font: names.eaVar }) + (fonts.eaVar.some(f => f.kind === 'google') ? T('eaGoogle') : '');
}
/* After editing a cell, update other inherited values without rebuilding the table or losing focus. */
export function refreshInherited() {
  const act = document.activeElement;
  document.querySelectorAll('#editor .ct-row[data-id], #editor .ct-row[data-ci]').forEach(row => {
    const key = row.dataset.id || '#' + row.dataset.ci;
    row.querySelectorAll('.num').forEach(inp => {
      const size = inp.dataset.field === 'size';
      inp.placeholder = size ? inheritedSize(key, BASE_W) : inheritedShift(key);
      if (inp !== act) { const own = size ? ownSize(key, BASE_W) : objByKey(key).shift; inp.value = own ?? ''; inp.classList.toggle('own', own != null); }      // Sync base sizes and derived baselines that were focused but not edited.
    });
  });
  syncMatrix();
}
export function renderChipsStatus() {
  document.querySelectorAll('.status[data-key]').forEach(el => {
    const row = el.closest('.ct-row'), key = row.dataset.id || '#' + row.dataset.ci;
    const { key: sourceKey, s } = classFontSource(key, objByKey(key));
    el.dataset.key = sourceKey;
    el.className = 'status ' + (s ? s.status : 'loading');
    const text = fontStatusText(s);
    el.title = text; el.setAttribute('aria-label', text); el.tabIndex = s?.status === 'ok' ? -1 : 0;
  });
  syncFontMeta();
}

/* ================= Render: proof ================= */
function syncLineBreakDiagrams() {
  const lang = lineBreakDiagramLang();
  for (const button of document.querySelectorAll('#typoRows [data-typo="lineBreak"]')) {
    // Replace only the illustration when the proof language changes; keep selected values, controls and focus intact.
    if (button.firstElementChild.lang !== lang) button.firstElementChild.outerHTML = tLineBreakTile(button.dataset.v, lang);
  }
}
export function renderPreview() {
  const v = state.view, pt = $('#proofText');
  syncLineBreakDiagrams();
  $('#sheet').classList.toggle('vertical', v.vertical);
  $('#sheet').classList.toggle('rules', !!v.rules);
  root.classList.toggle('show-colors', v.colorize);
  root.style.setProperty('--fs', v.size + 'px');
  root.style.setProperty('--lh', v.lh);
  root.style.setProperty('--fst', v.italic ? 'italic' : 'normal');
  for (const t of TYPO) {
    if (t.attr) pt.lang = state.typo[t.key];
    else pt.style.setProperty(t.prop, typoValue(t));
  }
  /* Prefer the CSS Highlight API for class colors: keep DOM and layout unchanged. Splitting spans can overlap Western and following glyphs in vertical text.
   Only baseline shifts require spans; fall back to span coloring when Highlight API is unavailable. */
  const hl = HL_OK && v.colorize, spanColor = v.colorize && !HL_OK;
  pt.classList.toggle('colorize', spanColor);
  redrawProof(pt, () => {
    if (!(spanColor || anyShift())) pt.textContent = v.text;
    else {
      /* Merge unwrapped text into one node; adjacent Western/digit/Han text nodes can overlap in Chrome vertical layout. */
      /* For span coloring, split by class. Otherwise split only by baseline shift, keeping equal-shift letters and digits, such as '27.6km', in one span so element boundaries do not break spacing. */
      const frag = document.createDocumentFragment(), shifts = new Map();
      const shiftOf = o => { if (!shifts.has(o)) shifts.set(o, settingOf(o).shift); return shifts.get(o); };
      const keyOf = o => spanColor ? o : shiftOf(o);
      let cur = null, buf = '', plain = '';
      const flush = () => {
        if (!buf) return;
        const sh = shiftOf(cur);
        if (!spanColor && !sh) plain += buf;
        else {
          if (plain) { frag.append(plain); plain = ''; }
          const s = document.createElement('span');
          s.className = 'r';
          if (spanColor) s.dataset.k = cur[0] === '#' ? 'custom' : cur;
          if (sh) s.style.setProperty('--sh', sh / 100);
          s.textContent = buf;
          frag.append(s);
        }
        buf = '';
      };
      for (const ch of v.text) { const o = ownerOf(ch.codePointAt(0)); if (cur === null || keyOf(o) !== keyOf(cur)) { flush(); cur = o; } buf += ch; }
      flush();
      if (plain) frag.append(plain);
      pt.replaceChildren(frag);
      if (v.vertical && state.typo.autospace !== 'no-autospace') vAutospace(pt);
    }
  });
  paintClasses(pt, hl);
  checkMissSoon();
  const legend = $('#legend');
  legend.hidden = !v.colorize;
  if (v.colorize) legend.innerHTML = visibleClasses().filter(c => c.id !== 'han').map(c => `<span style="--c:var(--c-${c.id})"><i></i>${esc(tr(c.name))}</span>`).join('') +
    (state.custom.length ? `<span style="--c:var(--c-custom)"><i></i>${esc(T('legendCustom'))}</span>` : '') + `<span>${esc(T('legendBase'))}</span>`;
  root.style.setProperty('--generic', state.generic !== 'auto' ? state.generic : guessGeneric());
}
/* ================= Missing glyphs =================
   Check each proof character through its class font, the original class font for custom characters, then the Han base. The first font containing it actually renders it.
   A different composite font gives level 1 fallback; no composite font gives level 2 system fallback.
   Skip whitespace, combining marks and format characters, which inherently lack independent width. */
export let missTok = 0, missMap = null;
export const MISS_SKIP = /[\s\p{M}\p{Cf}]/u;
export async function checkMiss() {
  const tok = ++missTok;
  if (!state.view.miss) { missMap = null; paintMiss(); return; }
  const W = state.view.weight, base = resolveCls('han', W, true);
  const setAt = o => o === 'other' ? resolveCls('han', W, true) : o[0] === '#' ? resolveCustom(state.custom[+o.slice(1)], W, true) : resolveCls(o, W, true);
  const chains = new Map(), need = new Map();
  for (const c of new Set(state.view.text)) {
    if (MISS_SKIP.test(c)) continue;
    const cp = c.codePointAt(0), o = ownerOf(cp), rs = [setAt(o)];
    if (o[0] === '#') rs.push(resolveCls(classOf(cp) || 'han', W, true));
    rs.push(base);
    const chain = [...new Map(rs.filter(r => r.font).map(usedFont).map(f => [fontKey(f), f])).values()];      // Deduplicate the actual loaded fonts.
    chains.set(c, chain);
    for (const f of chain) { const k = fontKey(f); if (!need.has(k)) need.set(k, new Set()); need.get(k).add(c); }
  }
  const miss = new Map();      // Font -> missing characters; null means unavailable or not yet checked.
  await Promise.all([...need].map(async ([k, cs]) => {
    const src = sources.get(k);
    miss.set(k, !src || src.status === 'loading' ? null : src.status === 'error' ? cs : await missingIn(src, [...cs]));
  }));
  if (tok !== missTok) return;
  missMap = new Map();      // Character -> { lv, from, by }, used in hover details for marked glyphs.
  for (const [c, chain] of chains) {
    const has = f => { const m = miss.get(fontKey(f)); return !m || !m.has(c); };
    if (has(chain[0])) continue;
    const by = chain.slice(1).find(has);
    missMap.set(c, { lv: by ? 1 : 2, from: shortName(chain[0]), by: by && shortName(by) });
  }
  paintMiss();
}
/* Show details beside an underlined missing glyph on hover. */
export function missTipAt(x, y) {
  showMissingGlyphTip($('#proofText'), $('#missTip'), x, y, {
    infoOf: ch => missMap?.get(ch),
    textOf: (ch, info) => T(info.lv === 1 ? 'missTipBy' : 'missTipSys', { c: ch, font: info.from, by: info.by })
  });
}

export const checkMissSoon = debounce(checkMiss, 120);
/* Mark missing glyphs with Highlight API without changing DOM or disturbing vertical layout. */
export function paintMiss() { paintMissingGlyphs($('#proofText'), ch => missMap?.get(ch)?.lv); }
export const HL_OK = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';
export const HL_KEYS = ['latin', 'digit', 'kana', 'bopo', 'punct', 'symbol', 'shared', 'custom'];
export function paintClasses(el, on) {
  if (!HL_OK) return;
  HL_KEYS.forEach(k => CSS.highlights.delete('cf-' + k));
  if (!on) return;
  const sets = Object.fromEntries(HL_KEYS.map(k => [k, new Highlight()]));
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, s = node.data;
    let i = 0, start = 0, cur = null;
    const flush = end => {
      const k = cur && (cur[0] === '#' ? 'custom' : cur);
      if (k && sets[k] && end > start) { const r = new Range(); r.setStart(node, start); r.setEnd(node, end); sets[k].add(r); }
    };
    for (const ch of s) {
      const o = ownerOf(ch.codePointAt(0));
      if (o !== cur) { flush(i); cur = o; start = i; }
      i += ch.length;
    }
    flush(i);
  }
  for (const k of HL_KEYS) CSS.highlights.set('cf-' + k, sets[k]);
}
export function guessGeneric() {
  const l = fontLabel(resolveCls('han').font);
  return /serif|mincho|song|ming|明朝|宋|明|kai|楷|garamond|times/i.test(l) && !/sans/i.test(l) ? 'serif' : 'sans-serif';
}
/* Order samples by UI language: Simplified first for Simplified Chinese, Taiwan/Hong Kong first for Traditional Chinese, Japanese first for Japanese. */
export const SAMPLE_ORDER = { zh: ['zh', 'tw', 'hk', 'ja'], tw: ['tw', 'hk', 'zh', 'ja'], ja: ['ja', 'zh', 'tw', 'hk'] };
export const orderedSamples = () => { const first = SAMPLE_ORDER[UI] || SAMPLE_ORDER.zh; return [...first, ...Object.keys(SAMPLES).filter(k => !first.includes(k))]; };
export function renderSampleTabs() {
  const v = state.view, cur = v.sample, cs = v.customs || [];
  const name = i => T('customSample') + (cs.length > 1 ? ' ' + (i + 1) : '');
  $('#sampleTabs').innerHTML = orderedSamples().map(k => [k, SAMPLES[k]]).map(([k, s]) => `<button type="button" role="tab" data-sample="${k}" aria-selected="${cur === k}" aria-controls="proofText">${esc(tr(s.label))}</button>`).join('') +
    cs.map((c, i) => `<span class="ctab"><button type="button" role="tab" data-sample="c${i}" aria-selected="${cur === 'c' + i}" aria-controls="proofText">${esc(name(i))}</button><button type="button" class="ctab-x" data-act="delcustom" data-i="${i}" aria-label="${esc(T('customDel'))}" title="${esc(T('customDel'))}"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button></span>`).join('') +
    `<button type="button" class="tab-add" data-act="addcustom" aria-label="${esc(T('customAdd'))}" title="${esc(T('customAdd'))}"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg></button>`;
  tabFade();
}
/* Scroll overflowing sample tabs horizontally; fade any hidden edge to signal more content. */
export function tabFade() {
  const t = $('#sampleTabs'), max = t.scrollWidth - t.clientWidth;
  t.classList.toggle('fade-l', t.scrollLeft > 2);
  t.classList.toggle('fade-r', t.scrollLeft < max - 2);
}
export function renderLangOptions() {
  $('#exLang').innerHTML = `<option value="">${esc(T('anyLang'))}</option>` + TYPO.find(t => t.key === 'lang').values.map(([v, d]) => `<option value="${v}">${esc(tr(d))}</option>`).join('');
}
/* Left-pane Presets / Fonts / Text layout tabs; start in Presets on first launch. */
export function syncLeftTab() {
  const k = ['fonts', 'typo'].includes(state.view.ltab) ? state.view.ltab : 'presets';
  document.querySelectorAll('.pane-bar [data-ltab]').forEach(b => b.setAttribute('aria-selected', b.dataset.ltab === k));
  $('#panePresets').hidden = k !== 'presets'; $('#paneFonts').hidden = k !== 'fonts'; $('#paneTypo').hidden = k !== 'typo';
  if (k === 'fonts') fitGlyphs();
}
/* Rebuild stops only when export domain or UI language changes, preserving the slider and focus while dragging. */
export function syncPreviewWeight({ preserveInput = false } = {}) {
  const continuous = state.wmode === 'cont', domain = continuous ? state.wrange : state.weights;
  const adjustable = continuous ? domain[1] > domain[0] : domain.length > 1;
  $('#vWnLab').hidden = !adjustable;
  if (!adjustable && $('#vWPop').matches(':popover-open')) $('#vWPop').hidePopover();
  syncWeightControl({ input: $('#vWn'), slider: $('#vWSlider'), ticks: $('#vWTicks') }, { continuous, domain, value: continuous ? state.view.wcont : state.view.weight, label: wTip, locale: UI, preserveInput });
}

export function syncToolbar() {
  const v = state.view;
  renderCurrentPreset();
  syncLeftTab();
  renderSampleTabs();
  if (document.activeElement !== $('#vSize')) $('#vSize').value = v.size;      // Do not overwrite field text while the user is typing.
  if (document.activeElement !== $('#vLh')) $('#vLh').value = (+v.lh).toFixed(2);
  $('#vLhOut').textContent = `${+(v.size * v.lh).toFixed(1)}px`;      // The field contains a multiplier; show the actual line height after it.
  $('#vVertical').setAttribute('aria-pressed', v.vertical);
  syncViewTypo();
  $('#vColor').setAttribute('aria-pressed', v.colorize);
  $('#vItalic').setAttribute('aria-pressed', !!v.italic);
  $('#vRules').setAttribute('aria-pressed', !!v.rules);
  $('#vMiss').setAttribute('aria-pressed', !!v.miss);
  const sh = specShown();
  document.querySelectorAll('#specBar [data-sg]').forEach(b => b.setAttribute('aria-pressed', !!sh[b.dataset.sg]));
  for (const t of TYPO) { const el = $('#ty-' + t.key); if (el) el.value = state.typo[t.key]; }
  renderTypoStatus();
  $('#exName').value = state.name;
  $('#exWeights').innerHTML = WEIGHTS.map(w => `<button type="button" data-w="${w}" aria-pressed="${state.weights.includes(w)}" title="${esc(wTip(w))}"${wTag(w) ? ' class="wl"' : ''}>${w}${wTag(w)}</button>`).join('');
  renderWHint();
  $('#exBase').value = state.baseMode;
  const cont = state.wmode === 'cont';
  syncPreviewWeight({ preserveInput: document.activeElement === $('#vWn') });
  document.querySelectorAll('#vWMode [data-m]').forEach(b => b.setAttribute('aria-checked', b.dataset.m === state.wmode));
  $('#exContField').hidden = !cont;
  $('#exWeightsField').hidden = cont;
  $('#exGeneric').value = state.generic;
  $('#exItalic').value = state.italic ? '1' : '0';
  $('#exLang').value = state.scope;
}

/* Common weight names: 400 = normal (body); 700 = bold (the default for b, strong and h1-h6). */
export const W_NAMES = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
export const wTag = w => w === 400 || w === 700 ? `<small>${esc(T(w === 400 ? 'w400' : 'w700'))}</small>` : '';      // Label buttons directly as Body or Bold.
export const wTip = w => `${w} · ${W_NAMES[w]}` + (w === 400 ? ' — ' + T('w400Tip') : w === 700 ? ' — ' + T('w700Tip') : '');
/* Use CSS weight matching to find the nearest exported weight (CSS Fonts 4 section 5.2). */
export function matchWeight(ws, want) {
  if (ws.includes(want)) return want;
  const lo = ws.filter(w => w < want).sort((a, b) => b - a), hi = ws.filter(w => w > want).sort((a, b) => a - b);
  if (want >= 400 && want <= 500) return hi.find(w => w <= 500) ?? lo[0] ?? hi[0];
  return want < 400 ? lo[0] ?? hi[0] : hi[0] ?? lo[0];
}
/* Explain below export weights how body/bold text resolves when 400 or 700 is missing. */
export function renderWHint() {
  const el = $('#exWHint'), ws = state.weights, miss = [400, 700].filter(w => !ws.includes(w)), out = [];
  if (miss.includes(400)) out.push(T('wMiss400', { w: matchWeight(ws, 400) }));
  if (miss.includes(700)) { const m = matchWeight(ws, 700); out.push(T(m < 600 ? 'wMiss700Faux' : 'wMiss700', { w: m })); }
  el.hidden = !miss.length;
  if (miss.length) el.innerHTML = esc(out.join('')) + ` <button type="button" class="btn-text" data-act="wadd">${esc(T('wAdd', { w: miss.join(T('joiner')) }))}</button>`;
}

/* ================= Metrics ================= */
export let lastMeasure = null, lastRef = null;
export function cssVar(n) { return getComputedStyle(root).getPropertyValue(n).trim(); }
/* Measure Western proportions in the Han font by rendering a Han reference glyph, H and x separately. */
export function measureRef() {
  const han = sources.get(fontKey(usedFont(resolveCls('han', state.view.weight, true))));
  if (!han || han.status !== 'ok') return null;
  const c = document.createElement('canvas').getContext('2d'), fs = 200;
  c.font = `${fs}px "${han.family}", monospace`; const a = c.measureText('H').width;
  c.font = `${fs}px "${han.family}", serif`; const b = c.measureText('H').width;
  const font = fontLabel(han.font);
  if (Math.abs(a - b) > 0.01) return { font, none: true };     // The Han font lacks H and fell back to another font.
  const g = c.measureText('国'), face = g.actualBoundingBoxAscent + g.actualBoundingBoxDescent;
  if (face < 1) return null;
  return { font, cap: c.measureText('H').actualBoundingBoxAscent / face, x: c.measureText('x').actualBoundingBoxAscent / face };
}
/* Metric specimen: use the Han ink box as reference, overlaying Western cap/x heights, digit height and kana ink-box guides.
   Western, digit and kana guides can be hidden independently in View. */
/* Metric guide options are fixed. Avoid clutter by enabling kana by default only for Japanese, and Zhuyin only for Taiwan Chinese; explicit user choices take precedence. */
export const specShown = () => ({ latin: true, digit: true, kana: /^ja/.test(state.typo.lang || ''), bopo: state.typo.lang === 'zh-Hant-TW', ...(state.view.specShow || {}) });
export function drawSpecimen() {
  const cv = $('#spec'), sh = specShown();
  const W = cv.clientWidth || 600;
  const ctx = cv.getContext('2d');
  /* Size the right label area for its longest label instead of leaving the former fixed 150px gap. */
  ctx.font = `11px ${cssVar('--ui') || 'sans-serif'}`;
  const labKeys = ['gFaceTop', 'gFaceBot', 'gBase', ...(sh.latin ? ['gCap', 'gX', 'gLatBase'] : []), ...(sh.digit ? ['gFig', 'gDigBase'] : []), ...(sh.kana ? ['gKanaTop', 'gKanaBot'] : []), ...(sh.bopo ? ['gBopoTop', 'gBopoBot'] : [])];
  const labelW = Math.min(150, W * 0.3, Math.ceil(Math.max(...labKeys.map(k => ctx.measureText(T(k)).width))) + 8 + 12), plotR = W - labelW;
  const fam = `${liveFamily ? `"${liveFamily}", ` : ''}serif`, fw = state.wmode === 'cont' ? state.view.wcont : state.view.weight;
  const shiftOf = ch => settingOf(ownerOf(ch.codePointAt(0))).shift / 100;
  /* Always draw Han; show kana, Zhuyin, Western Hxg (together to preserve font spacing) and digit 0 according to visibility settings. */
  const show = ['国', ...(sh.kana ? ['あ'] : []), ...(sh.bopo ? ['ㄅ'] : []), ...(sh.latin ? ['Hxg'] : []), ...(sh.digit ? ['0'] : [])];
  const GAP = 0.2;      // Inter-group gaps as multiples of font size.
  /* Choose font size by width, capped at 88px, then derive canvas height. Keep the specimen at the proof pane's bottom from growing too tall. */
  const userH = state.view.specH;      // A dragged divider sets the height; scale font size with it, capped at height / 1.6.
  let fs = userH ? Math.max(40, Math.floor(userH / 1.6)) : 88;
  ctx.font = `${fw} ${fs}px ${fam}`;
  const span = show.reduce((s, ch) => s + ctx.measureText(ch).width, 0) + fs * GAP * (show.length - 1);
  if (span > plotR - 24) fs = Math.floor(fs * (plotR - 24) / span);
  const nLines = 3 + (sh.latin ? 3 : 0) + (sh.digit ? 2 : 0) + (sh.kana ? 2 : 0) + (sh.bopo ? 2 : 0);
  const LT = 9;      // Highest position allowed for guide labels.
  const minH = Math.max(110, nLines * 13 + 16 + LT - 7);      // Leave enough room for guide labels on the right.
  const H = Math.round(userH ? Math.max(minH, userH) : Math.min(200, Math.max(minH, fs * 1.6)));
  const dpr = window.devicePixelRatio || 1;
  cv.style.height = H + 'px';
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const glyphFont = `${fw} ${fs}px ${fam}`;
  ctx.font = glyphFont;
  ctx.textBaseline = 'alphabetic';
  const m = ch => { const t = ctx.measureText(ch); return { ch, asc: t.actualBoundingBoxAscent, desc: t.actualBoundingBoxDescent, w: t.width, shift: shiftOf(ch) * fs }; };
  const han = m('国'), cap = m('H'), xg = m('x'), fig = m('0'), kana = m('あ'), bopo = m('ㄅ');
  const baseY = Math.round(H / 2 + (han.asc - han.desc) / 2);      // Center the Han ink box vertically on the canvas.
  const hanTop = baseY - han.asc - han.shift, hanBot = baseY + han.desc - han.shift;
  const latBase = baseY - cap.shift, capTop = latBase - cap.asc, xTop = baseY - xg.shift - xg.asc;
  const figBase = baseY - fig.shift, figTop = figBase - fig.asc;
  const kanaTop = baseY - kana.shift - kana.asc, kanaBot = baseY - kana.shift + kana.desc;
  const bopoTop = baseY - bopo.shift - bopo.asc, bopoBot = baseY - bopo.shift + bopo.desc;
  const C = { ink: cssVar('--proof-ink') || cssVar('--ink'), muted: cssVar('--muted'), han: cssVar('--muted'), lat: cssVar('--c-latin'), dig: cssVar('--c-digit'), kana: cssVar('--c-kana'), bopo: cssVar('--c-bopo'), band: cssVar('--faint') };

  ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = C.band; ctx.fillRect(0, hanTop, plotR, hanBot - hanTop); ctx.restore();
  const lines = [{ y: hanTop, c: C.han, t: T('gFaceTop') }, { y: hanBot, c: C.han, t: T('gFaceBot') }, { y: baseY, c: C.muted, t: T('gBase') }];
  if (sh.latin) {
    lines.push({ y: capTop, c: C.lat, t: T('gCap') }, { y: xTop, c: C.lat, t: T('gX'), dash: [4, 4] });
    if (cap.shift) lines.push({ y: latBase, c: C.lat, t: T('gLatBase'), dash: [2, 3] });
  }
  if (sh.digit) {
    lines.push({ y: figTop, c: C.dig, t: T('gFig') });
    if (fig.shift) lines.push({ y: figBase, c: C.dig, t: T('gDigBase'), dash: [2, 3] });
  }
  if (sh.kana) lines.push({ y: kanaTop, c: C.kana, t: T('gKanaTop'), dash: [6, 3] }, { y: kanaBot, c: C.kana, t: T('gKanaBot'), dash: [6, 3] });
  if (sh.bopo) lines.push({ y: bopoTop, c: C.bopo, t: T('gBopoTop'), dash: [6, 3] }, { y: bopoBot, c: C.bopo, t: T('gBopoBot'), dash: [6, 3] });
  ctx.font = `11px ${cssVar('--ui') || 'sans-serif'}`;
  ctx.textBaseline = 'middle';
  /* Order labels by guide position with at least 12px spacing; shift the whole set up if it exceeds the canvas bottom. */
  lines.sort((a, b) => a.y - b.y);
  const ly = [];
  lines.forEach((l, i) => { ly[i] = Math.max(l.y, i ? ly[i - 1] + 12 : LT); });
  const over = ly.length ? ly[ly.length - 1] - (H - 7) : 0;
  if (over > 0) for (let i = ly.length - 1; i >= 0; i--) ly[i] = Math.max(LT + i * 12, Math.min(ly[i] - over, i < ly.length - 1 ? ly[i + 1] - 12 : H - 7));
  lines.forEach((l, i) => {
    ctx.strokeStyle = l.c; ctx.lineWidth = 1; ctx.setLineDash(l.dash || []);
    ctx.beginPath(); ctx.moveTo(0, Math.round(l.y) + 0.5); ctx.lineTo(plotR, Math.round(l.y) + 0.5); ctx.stroke();
    ctx.fillStyle = l.c; ctx.fillText(l.t, plotR + 8, ly[i]);
  });
  ctx.setLineDash([]);
  ctx.font = glyphFont; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.ink;
  const glyphs = show.map(m);
  const total = glyphs.reduce((s, g) => s + g.w, 0) + fs * GAP * (glyphs.length - 1);
  let x = Math.max(12, (plotR - total) / 2);
  for (const g of glyphs) { ctx.fillText(g.ch, x, baseY - g.shift); x += g.w + fs * GAP; }

  lastRef = measureRef();
  /* Measurements for the two alignment buttons: cap/x height relative to Han ink height, and the difference between cap and Han centers. */
  const face = han.asc + han.desc;
  if (face < 1 || cap.asc < 1) { lastMeasure = null; return; }
  const midPx = ((capTop + latBase) / 2) - ((hanTop + hanBot) / 2);   // Positive means the cap-height center is too low.
  lastMeasure = { capRatio: cap.asc / face, xRatio: xg.asc / face, midEm: midPx / fs };
}
