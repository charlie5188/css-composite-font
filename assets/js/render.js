import { $, T, UI, debounce, esc, root, tr } from './i18n.js';
import { CLASSES, CLS, GROUPS, classOf, fmtRanges, inRanges, isMoved } from './unicode.js';
import { BASE_W, EA_FEAT, autoNames, clampW, defaultFontWeight, contFont, stepSpan, NUM_FEAT, NUM_TAGS, SAMPLES, TYPO, WEIGHTS, anyShift, axesOf, axisLabel, axisOf, finalFont, fontAtWeight, fontKey, gfWeights, weightChain, fontLabel, inheritedShift, inheritedSize, liveFamily, numLabel, numTags, objByKey, ownFontAt, ownSize, ownerOf, resolveCls, resolveCustom, settingOf, sources, srcError, state, typoValue, usedFont, vfAxisNow } from './core.js';
import { LIMITS, loadBlank, missingIn, renderTypoStatus, renderCurrentPreset, syncViewTypo } from './ui.js';
/* ================= 渲染：字符类别表（对应 InDesign 的复合字体对话框） ================= */
export const GLYPH = { han: '永', latin: 'Ag', digit: '01', kana: 'あ', bopo: 'ㄅ', punct: '」、', symbol: '※', shared: '“…' };
/* 表格的显示顺序：基础字体，然后是西文一侧（西文、数字、中西共用标点），再是汉字一侧（假名、全角标点、全角符号、注音），
   每一侧按常调整的程度排。只是显示顺序：导出的规则仍按 CLASSES 的顺序 */
export const CLASS_ORDER = ['han', 'latin', 'digit', 'shared', 'kana', 'punct', 'symbol', 'bopo'];
const clsRank = id => { const i = CLASS_ORDER.indexOf(id); return i < 0 ? CLASS_ORDER.length : i; };
export const visibleClasses = () => [...CLASSES].sort((a, b) => clsRank(a.id) - clsRank(b.id));
export const shortName = f => !f ? '' : f.kind === 'google' ? f.family : f.kind === 'local' ? f.name : f.kind === 'path' ? f.path : f.fileName;
export const keyName = key => key[0] === '#' ? T('customName', { c: state.custom[+key.slice(1)]?.chars || '…' }) : tr(CLS[key].name);
/* 这里显示字体可用的粗细，不是当前预览值或导出范围。只使用已知数据，不把缺失信息当成 100–900。 */
function fontWeightInfo(f) {
  if (!f) return null;
  /* 本机字体手动勾选 VF 时的 100–900 只是编辑默认范围，不当作从文件读取的真实范围。 */
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
/* 范围作为一组换行，窄屏不能把「400–800」拆成两半。 */
const fontMetaLabel = info => `<span>${esc(info.label)}</span>${info.range ? ` <span class="ct-font-range">${esc(info.range)}</span>` : ''}`;
const fontMetaId = key => `fontMeta-${key[0] === '#' ? 'custom-' + key.slice(1) : key}`;
const fontStatusText = s => s?.status === 'error' ? T('stError', { reason: srcError(s) }) : T(s?.status === 'ok' ? 'stOk' : 'stLoading');
/* 连续模式实际加载整条可变字重轴，不能等待未请求的单一字重。轴信息刚到时，沿用已在用的来源。 */
function classFontSource(key, o) {
  if (!o?.font || o.follow) return { key: '', s: null };
  const W = state.view.weight;
  const f = finalFont(ownFontAt(o, W !== BASE_W ? state.wOver[W]?.[key] : null, W, true), o.vary).font;
  const actual = state.wmode === 'cont' ? contFont(f) : f;
  const currentKey = fontKey(actual), previousKey = fontKey(f);
  const sourceKey = sources.has(currentKey) || !sources.has(previousKey) ? currentKey : previousKey;
  return { key: sourceKey, s: sources.get(sourceKey) };
}
/* 表格里是基础设定：400 用的字体，其他字重从它推算。按字重的粗细、单独换的字体在「各字重」里。
   状态点看校样正在用的那个字体（当前预览的字重） */
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
/* 轴检测可能在输入框聚焦时完成；只更新说明，避免重建下拉框、打断用户操作。 */
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
/* 箭头独占固定宽度，显示与隐藏都不挤动数字；键盘仍在输入框内用 ↑↓，避免表格增加大量 Tab 停靠点。 */
function stepperCell(control, label) {
  return `<span class="cell-step">${control}<span class="cell-step-actions">${['up', 'down'].map(dir => {
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
/* 调过的可变轴：写在这一行下面，例如「宽度 80 · 光学尺寸 跟随字号」 */
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
  /* CJK 字体（Google 上切成上百个分片）用了非整百的粗细，就会加载可变版本：每个分片约为静态的 1.9 倍 */
  if (f.kind === 'google' && f.weight % 100 && s?.status === 'ok' && s.faces.length > 30) return `<span class="callout ct-note">${esc(T('vfCjkCost'))}</span>`;
  return '';
}
/* ================= 地区检查：字形和标点位置是不是当前语言的写法 ================= */
export const REGION_OF_LANG = { 'zh-Hans': 'sc', 'zh-Hant-TW': 'tw', 'zh-Hant-HK': 'hk', ja: 'jp', ko: 'kr' };
export const PUNCT_CENTER = { sc: false, jp: false, tw: true, hk: true };      // 大陆、日本的标点靠左下，台湾、香港居中
/* 字形的地区只能看字族名：Google 的 SC / TC / HK / JP / KR 后缀和常见系统字体的名字 */
export function formsOf(f) {
  const n = f?.family || f?.name || '';
  if (/\b(SC|GB)\b|YaHei|PingFang SC|Songti SC|STSong|SimSun|STHeiti/.test(n)) return 'sc';
  if (/\bTC\b|PingFang TC|JhengHei|Songti TC|LiHei|BiauKai|MingLiU/.test(n)) return 'tw';
  if (/\bHK\b|PingFang HK/.test(n)) return 'hk';
  if (/\bJP\b|Hiragino (Sans|Mincho|Kaku|Maru)|Yu (Gothic|Mincho)|Meiryo|Shippori|Zen |BIZ UD|M PLUS|Klee|MS (Gothic|Mincho)/.test(n)) return 'jp';
  if (/\bKR\b|Apple SD Gothic|Malgun/.test(n)) return 'kr';
  return null;
}
/* 标点位置要量：「，」的墨迹重心在字身里的位置。一个文件含多个地区字形的字体（思源、Noto CJK）会按 lang 切换，所以带上语言量 */
export const punctMemo = new Map();      // 「字体|语言」→ 'center' | 'corner' | null；undefined = 测量中
export const regionChanged = debounce(() => { renderEditor(); renderLangWarn(); }, 80);
export function punctPos(s, lang) {
  const k = s.family + '|' + lang;
  if (punctMemo.has(k)) return punctMemo.get(k);
  punctMemo.set(k, undefined);
  Promise.all([document.fonts.load(`100px "${s.family}"`, '，'), loadBlank()]).then(() => {
    const c = document.createElement('canvas'); c.width = 140; c.height = 150;
    const x = c.getContext('2d');
    if ('lang' in x) x.lang = lang;
    x.font = `100px "${s.family}", "__cf_blank"`;      // 字体里没有「，」时落到空白字体上，量不到墨迹
    const fm = x.measureText('，'), top = 110 - fm.fontBoundingBoxAscent, h = fm.fontBoundingBoxAscent + fm.fontBoundingBoxDescent;
    x.fillText('，', 10, 110);
    const d = x.getImageData(0, 0, 140, 150).data; let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < 140 * 150; i++) if (d[i * 4 + 3] > 128) { sx += i % 140; sy += Math.floor(i / 140); n++; }
    punctMemo.set(k, n && fm.width ? ((sx / n - 10) / fm.width > 0.38 && (sy / n - top) / h < 0.66 ? 'center' : 'corner') : null);
    regionChanged();
  }, () => punctMemo.set(k, null));
  return undefined;
}
/* 某个语言下，汉字字体的字形、全角标点字体的标点位置对不对 */
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
/* 类别表：按校样的语言检查（汉字那一行看字形，全角标点那一行看标点位置） */
export function regionRow(key) {
  if (key !== 'han' && key !== 'punct') return '';
  const lang = state.typo.lang, c = regionCheck(lang);
  if (key === 'han' && c.forms) return `<span class="callout ct-note">${esc(T('regForms', { got: T('reg_' + c.forms.got), lang: langName(lang) }))}</span>`;
  if (key === 'punct' && c.punct) return `<span class="callout ct-note">${esc(T(c.punct.pos === 'center' ? 'regPunctCenter' : 'regPunctCorner', { lang: langName(lang) }))}</span>`;
  return '';
}
/* 导出区：按适用语言检查，写在「适用语言」下面 */
export function renderLangWarn() {
  const el = $('#exLangWarn'), lang = state.scope, c = lang ? regionCheck(lang) : {}, list = [];
  if (c.forms) list.push(T('exRegForms', { font: shortName(c.forms.font), got: T('reg_' + c.forms.got) }));
  if (c.punct) list.push(T(c.punct.pos === 'center' ? 'exRegPunctCenter' : 'exRegPunctCorner', { font: shortName(c.punct.font) }));
  el.hidden = !list.length;
  if (list.length) el.textContent = T('exRegWarn', { lang: langName(lang), list: list.join(T('joiner')) });
}
export function renderEditor() { renderClassRows(); renderWeights(); }
/* 类别表左边的字样：两个全角标点、放大后的西文可能比格子宽。先用 halt 把标点挤成半角（见 CSS，字体有这个特性时），
   还放不下就只缩小这一格的字号（等比，不压扁）；左右各可以伸出 4px（左边是窗格留白，右边是格间距的一半） */
export function fitGlyphs() {
  for (const el of document.querySelectorAll('#classRows .ct-glyph')) {
    el.style.fontSize = '';
    if (!el.clientWidth) continue;      // 页签没打开、窄屏隐藏：显示时再量
    const r = document.createRange(); r.selectNodeContents(el);
    const w = r.getBoundingClientRect().width, room = el.clientWidth + 8;
    if (w > room) el.style.fontSize = Math.max(14, Math.floor(parseFloat(getComputedStyle(el).fontSize) * room / w)) + 'px';
  }
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
  renderNumHint(); renderEaMarks();      // 字体加载完以后重新检查数字、东亚字形的特性
  $('#customRows').innerHTML = state.custom.length ? state.custom.map((cu, i) => `<div class="ct-row" data-ci="${i}">
      <input class="chars" type="text" value="${esc(cu.chars)}" placeholder="${esc(T('customPh'))}" aria-label="${esc(T('custom'))}" spellcheck="false">
      <span class="ct-font">${fontCell('#' + i, cu, false, true)}</span>
      ${numCell('size', '#' + i)}${numCell('shift', '#' + i)}
      <button class="btn-icon mini danger x" type="button" data-act="remove" aria-label="${esc(T('customRemove'))}" title="${esc(T('customRemove'))}"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button>${axRow('#' + i, cu)}${errRow('#' + i, cu)}
    </div>`).join('')
    : '';
  fitGlyphs();
}
/* ================= 各字重：每个字重的粗细和大小 =================
   行是字重（分档：9 档，勾上的才导出；连续：导出范围里的各档），列是有自己字体的类别。
   400 这一行就是上面表格的基础设定；其他字重灰色的是按 400 推算或沿用的值，自己填的是蓝色。点已勾选行的空白或字重可预览，不改变导出选择。 */
export function wKeys() {
  const own = o => o && !o.follow && o.font, keys = ['han'];
  for (const c of visibleClasses()) if (c.id !== 'han' && own(state.classes[c.id])) keys.push(c.id);
  state.custom.forEach((cu, i) => { if (own(cu)) keys.push('#' + i); });
  /* 跟随别的类别、但在某个字重单独调过大小的，也列出来，免得设定看不到 */
  for (const W of WEIGHTS) for (const [k, ov] of Object.entries(state.wOver[W] || {})) if (!keys.includes(k) && ov.size != null && objByKey(k)) keys.push(k);
  return keys;
}
export const wRowAdjusted = W => W !== BASE_W && (Object.values(state.wOver[W] || {}).some(ov => Object.keys(ov).length) || Object.keys(state.weightNames).some(k => k.endsWith('|' + W)));
export const wColumnAdjusted = key => {
  const o = objByKey(key), weight = defaultFontWeight(o.font);
  return o.size != null || o.shift != null || (!o.follow && weight != null && (o.font.weight || BASE_W) !== weight) ||
    Object.entries(state.wOver).some(([W, row]) => +W !== BASE_W && Object.keys(row[key] || {}).length);
};
/* 名称只写和 400 不同的那一段：「Hiragino Mincho ProN W6」→「…W6」 */
export function nameTail(base, name) {
  const bw = base.split(/(?=[ _-])/), nw = name.split(/(?=[ _-])/);
  let i = 0; while (i < nw.length - 1 && bw[i] === nw[i]) i++;
  return i ? '…' + nw.slice(i).join('').replace(/^[ _-]/, '') : name;
}
/* 某一格的粗细：kind = vf（任意值）/ gsel（Google 静态字体选一档）/ name（本机字体、文件的名称）；val 是自己设定的值，auto 是推算的值 */
export function wInfo(k, o, W) {
  const base = W === BASE_W, ov = base ? null : state.wOver[W]?.[k], eff = ov?.font || o.font, axis = vfAxisNow(eff);
  if (Array.isArray(axis)) {
    const val = base ? (eff.weight || 400) : ov?.font ? (ov.font.weight || 400) : ov?.weight;
    return { kind: 'vf', ov, axis, val, set: !base && val != null, auto: base ? '' : clampW(fontAtWeight(o.font, W).weight || W, axis) };
  }
  if (eff.kind === 'google') {
    const autoF = fontAtWeight(o.font, W), val = base ? eff.weight : ov?.font ? ov.font.weight : (ov?.weight || 0);
    const avail = gfWeights(eff.family);
    /* 推算值：字体加载完以后用实际取到的字重；还没加载时按加载的规则（向 400 方向找最近的、这个字体有的字重）先算出来 */
    const auto = sources.get(fontKey(autoF))?.actualWeight || (avail && weightChain(Math.round(autoF.weight / 100) * 100).find(w => avail.includes(w))) || autoF.weight;
    return { kind: 'gsel', ov, val, set: !base && !!val, auto, noAuto: base || !!ov?.font, avail: avail || WEIGHTS };
  }
  const f = base ? o.font : ov?.font || fontAtWeight(o.font, W), set = !base && (!!ov?.font || (fontKey(o.font) + '|' + W) in state.weightNames);
  return { kind: 'name', ov, name: shortName(f), set, guess: !base && !set && o.font.kind === 'local' && autoNames.get(fontKey(o.font) + '|' + W)?.status === 'guess' };
}
/* Google 静态字体的粗细：只列这个字体真有的字重。和「大小」一样，灰色是推算的值，蓝色是单独设定的；选回推算的那一档就是不单独设定 */
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
  const rows = cont ? WEIGHTS.filter(W => stepSpan(W)) : WEIGHTS;
  const sizeOnly = cont && cols.every(c => !c.w);      // 静态字体在连续模式下仍可逐档调整粗细，保留两级表头。
  const n = cols.reduce((a, c) => a + (c.w ? 2 : 1), 0), lead = cont ? 1 : 2;      // 前面几列：分档时是「导出」勾选 + 字重，连续时只有字重
  /* 给数字和步进按钮分别留位置；小数不能被箭头挤掉。最后一列是行菜单。 */
  const tracks = cols.map(c => `${c.w ? 'minmax(64px, 1fr) ' : ''}minmax(72px, 1fr)`).join(' ');
  box.style.setProperty('--wm-cols', `${cont ? '' : 'max-content '}${cont ? 58 : 70}px ${tracks} 28px`);
  /* 重画以后把焦点放回原来那一格（勾选导出、字体加载完重画时） */
  const act = box.contains(document.activeElement) ? document.activeElement : null;
  const keep = act && (act.classList[0] ? '.' + CSS.escape(act.classList[0]) : act.tagName.toLowerCase()) + ['k', 'w', 'wx', 'pw', 'wreset'].filter(a => act.dataset[a] != null).map(a => `[data-${a}="${CSS.escape(act.dataset[a])}"]`).join('');
  const clsHead = `<div class="wm-row wm-cls${sizeOnly ? ' wm-single' : ''}">${sizeOnly ? `<span class="wm-wh">${esc(T('wColWeight'))}</span>` : '<span></span>'.repeat(lead)}${cols.map(c => `<span style="grid-column:span ${c.w ? 2 : 1};--c:var(--c-${c.k[0] === '#' ? 'custom' : c.k})"><i class="dot"></i><span class="wm-clabel" title="${esc(sizeOnly ? T('wClassSize', { c: keyName(c.k) }) : keyName(c.k))}">${esc(sizeOnly ? T('wClassSize', { c: keyName(c.k) }) : keyName(c.k))}</span><button type="button" class="btn-icon sm" data-wreset="${esc(c.k)}"${wColumnAdjusted(c.k) ? '' : ' disabled'} title="${esc(T('wColumnReset', { c: keyName(c.k) }))}" aria-label="${esc(T('wColumnReset', { c: keyName(c.k) }))}"><svg class="ic" aria-hidden="true"><use href="#i-restore"/></svg></button></span>`).join('')}<span></span></div>`;
  const subHead = `<div class="wm-row wm-sub">${cont ? '' : `<span class="wm-xh">${esc(T('wColExport'))}</span>`}<span class="wm-wh">${esc(T('wColWeight'))}</span>${cols.map(c => (c.w ? `<span${c.vf ? ` title="VF ${vfAxisNow(c.o.font).join('–')}"` : ''}>${esc(T('wColW'))}</span>` : '') + `<span>${esc(T('colSize'))}</span>`).join('')}<span></span></div>`;
  const body = rows.map(W => {
    const on = cont || state.weights.includes(W), cur = W === PW;
    const tag = W === BASE_W ? T('wBase') : W === 700 ? T('w700') : '';
    const lab = `${W}${tag ? `<small>${esc(tag)}</small>` : ''}`;
    const cells = on ? cols.map(c => (c.w ? wCell(c.k, c.o, W) : '') + sizeCell(c.k, W)).join('') : '<span></span>'.repeat(n);
    const menu = on && W !== BASE_W ? `<button type="button" class="btn-icon sm wm-more" data-wmenu="${W}" popovertarget="wRowMenu" aria-haspopup="menu" aria-label="${esc(T('wRowMenu', { w: W }))}" title="${esc(T('wRowMenu', { w: W }))}"><svg class="ic" aria-hidden="true"><use href="#i-dots"/></svg></button>` : '';
    return `<div class="wm-row${on ? '' : ' off'}${cur ? ' cur' : ''}" data-row="${W}"${cur ? ' aria-current="true"' : ''}>
      ${cont ? '' : `<span class="wm-x"><input type="checkbox" data-wx="${W}"${on ? ' checked' : ''} aria-label="${esc(T('wExportAria', { w: W }))}" title="${esc(T('wExportAria', { w: W }))}"></span>`}<span class="wm-w"><button type="button" class="wm-pw" data-pw="${W}"${on ? ` title="${esc(T('wPreviewTip', { w: W }))}"` : ' disabled'}>${lab}</button></span>${cells}<span class="wm-act">${menu}</span>
    </div>`;
  }).join('');
  box.innerHTML = clsHead + (sizeOnly ? '' : subHead) + body;
  if (keep) box.querySelector(keep)?.focus({ preventScroll: true });
  $('#wReset').hidden = !wAnyAdjusted();
  /* 连续模式：直接设置导出范围，字体自身的范围已在基础设定中说明。 */
  const sub = $('#wSub');
  sub.hidden = !cont;
  if (!cont || sub.contains(document.activeElement)) return;      // 正在改范围：不重画
  sub.innerHTML = `<span class="wr-in"><span>${esc(T('wSubCont'))}</span><input type="number" id="wLo" min="100" max="900" step="1" value="${state.wrange[0]}" aria-label="${esc(T('wrLo'))}"><span aria-hidden="true">–</span><input type="number" id="wHi" min="100" max="900" step="1" value="${state.wrange[1]}" aria-label="${esc(T('wrHi'))}"></span>`;
}
/* 改了数值以后就地更新各格（不重建表格，保持输入焦点和键盘连续调整） */
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
      el.innerHTML = wOptions(i);      // 推算的那一档可能变了（字体加载完才知道实际字重）
      if (i.noAuto) { delete el.dataset.auto; delete el.dataset.tip; } else { el.dataset.auto = i.auto; el.dataset.tip = wSelTip(i); }
      el.classList.toggle('set', i.set);
    }
  });
  $('#wReset').hidden = !wAnyAdjusted();
  document.querySelectorAll('#wMatrix [data-wreset]').forEach(b => { b.disabled = !wColumnAdjusted(b.dataset.wreset); });
}
/* 只换高亮的那一行（编辑某一行时预览跟过去，不重画表格，保持输入焦点） */
export function markPreviewRow() {
  const PW = state.view.weight;
  document.querySelectorAll('#wMatrix [data-row]').forEach(r => { const c = +r.dataset.row === PW; r.classList.toggle('cur', c); if (c) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current'); });
}
/* 直排 + 中西间距：Chrome 在元素边界上加 1/8 em 时，会把边界后面的字画到前面去（叠字）。
   所以直排时 span 自己不加间距，边界上该加的 1/8 em 改用 margin 补上（汉字假名和字母数字之间才加）。
   和浏览器自己的中西间距一样，换列的地方（列首、列尾）不加：排好以后量一下边界两边的字在不在同一列。
   去掉一处 margin 可能让后面换列的位置变了，所以再量一遍；去掉过的不再加回，免得来回跳 */
export const IDEO_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}]/u, ALNUM_RE = /[\p{L}\p{N}]/u;
export function vAutospace(pt) {
  const kind = ch => !ch ? 0 : IDEO_RE.test(ch) ? 1 : ALNUM_RE.test(ch) ? 2 : 0;
  const gap = (a, b) => !!(kind(a) && kind(b) && kind(a) !== kind(b));
  const nodes = [...pt.childNodes], first = n => [...(n?.textContent || '')][0], last = n => [...(n?.textContent || '')].pop();
  const edges = [];      // [span, 'marginInlineStart' | 'marginInlineEnd', 边界前的节点, 边界后的节点]
  nodes.forEach((n, i) => {
    if (n.nodeType !== 1) return;
    n.style.textAutospace = 'no-autospace';
    n.style.marginInlineStart = n.style.marginInlineEnd = '';
    if (nodes[i - 1]?.nodeType === 3 && gap(last(nodes[i - 1]), first(n))) edges.push([n, 'marginInlineStart', nodes[i - 1], n]);      // 前面是 span 时由它的 margin-inline-end 负责，不重复加
    if (gap(last(n), first(nodes[i + 1]))) edges.push([n, 'marginInlineEnd', n, nodes[i + 1]]);
  });
  if (!edges.length) return;
  const charRect = (node, atEnd) => {      // 节点里第一个（或最后一个）字的位置
    const t = node.nodeType === 3 ? node : node.firstChild, s = t.data, c = atEnd ? [...s].pop() : [...s][0], r = document.createRange();
    r.setStart(t, atEnd ? s.length - c.length : 0); r.setEnd(t, atEnd ? s.length : c.length);
    return r.getBoundingClientRect();
  };
  const sameCol = (a, b) => {
    const ra = charRect(a, true), rb = charRect(b, false);
    if (!ra.width || !rb.width) return true;      // 还没排版（校样不可见）：照常加
    return Math.abs(ra.left + ra.width / 2 - rb.left - rb.width / 2) < ra.width / 2;
  };
  const dropped = new Set();
  for (let k = 0; k < 4; k++) {
    const want = edges.map((e, j) => !dropped.has(j) && sameCol(e[2], e[3]));      // 先全部量完再改，只排一次版
    let changed = false;
    edges.forEach(([el, side], j) => {
      if (!want[j] && el.style[side]) dropped.add(j);
      const v = want[j] ? '.125em' : '';
      if (el.style[side] !== v) { el.style[side] = v; changed = true; }
    });
    if (!changed) break;
  }
}
/* 换列的位置会随字体加载、校样高度变化：重新量一遍 */
export function refreshVAutospace() {
  const pt = $('#proofText');
  if (state.view.vertical && state.typo.autospace !== 'no-autospace' && pt.firstElementChild) vAutospace(pt);
}
/* 齿轮弹出的分组开关：打开 = 留在本类别，关闭 = 改由半角西文显示 */
export function renderGroups() {
  const pop = $('#grpPop'), id = pop.dataset.cls; if (!id || !GROUPS[id]) return;
  const name = tr(CLS[id].name);
  pop.innerHTML = `<div class="gp-head"><b>${esc(T('gpHead', { c: name }))}</b><span class="hint">${esc(T(id === 'shared' ? 'gpHintShared' : id === 'bopo' ? 'gpHintBopo' : 'gpHintSymbol', { c: name }))}</span></div>` +
    GROUPS[id].map(g => `<div class="gp-row"><span class="gp-sample" aria-hidden="true">${esc(g.sample)}</span>
      <span class="gp-name">${esc(tr(g.name))}<small>${esc(fmtRanges(g.r))}</small></span>
      <button type="button" class="sw" role="switch" data-g="${id}.${g.id}" aria-checked="${!isMoved(id, g)}" aria-label="${esc(tr(g.name))}"></button></div>`).join('') +
    (GROUPS[id].some(g => isMoved(id, g)) ? `<div class="gp-foot"><button type="button" class="btn-text" data-act="gpreset">${esc(T('gpReset'))}</button></div>` : '');
}
/* ================= 数字样式 =================
   在这个字体里有没有效果：每个特性单独加上画一遍 0–9，和不加时逐像素比较。一样 = 字体没有这个特性，或者本来就是这样
   （例如默认就是等高数字时，选「等高」不会有变化）。Google Fonts 的网页字体删掉了大部分特性，onum、zero 都没有 */
export let numSeq = 0;
export function digitFx() {
  const f = usedFont(resolveCls('digit', state.view.weight, true)), s = f && sources.get(fontKey(f));
  if (s?.status !== 'ok') return { f, fx: null, checking: false };
  const fx = numFx(f);
  return { f, fx, checking: !fx && featCache.get(fontKey(f) + '|0123456789') === 'pending' };
}
/* 字体有没有某些 OpenType 特性：每个特性单独加上把 text 画一遍，和不加时逐像素比较（一样 = 没有效果）。
   extra(ctx, 基准字族名) 可以顺便量别的东西。结果按「字体 + 文字」缓存，测完调用 done */
export const featCache = new Map();
export function featFx(f, text, tags, done, extra) {
  const s = f && sources.get(fontKey(f));
  if (s?.status !== 'ok') return null;
  const key = fontKey(f) + '|' + text, c = featCache.get(key);
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
        } catch (e) { /* 忽略 */ }
      }
      return id + tag;
    };
    const names = ['', ...tags].map(fam);
    await Promise.allSettled(all.map(ff => ff.load()));
    let out = { unknown: true };      // 加载失败：不标注
    if (all.length && all.every(ff => ff.status === 'loaded')) {
      const cv = document.createElement('canvas'); cv.width = 720; cv.height = 80;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      const draw = n => { ctx.clearRect(0, 0, 720, 80); ctx.font = `48px "${n}"`; ctx.fillText(text, 4, 60); return new Uint32Array(ctx.getImageData(0, 0, 720, 80).data.buffer); };
      const base = draw(names[0]);
      out = Object.fromEntries(tags.map((t, i) => { const d = draw(names[i + 1]); return [t, d.some((v, j) => v !== base[j])]; }));
      if (extra) { ctx.font = `48px "${names[0]}"`; Object.assign(out, extra(ctx)); }
    }
    all.forEach(ff => document.fonts.delete(ff));
    featCache.set(key, out);
    done?.();
  })();
  return null;
}
/* 数字：默认的数字也量出来——0 的高度更接近 x 高 = 旧式；1 和 0 一样宽 = 等宽 */
export function numFx(f) {
  return featFx(f, '0123456789', NUM_TAGS, renderNumHint, ctx => {
    const m = ch => ctx.measureText(ch), a0 = m('0').actualBoundingBoxAscent;
    return { def: { fig: a0 < (m('x').actualBoundingBoxAscent + m('H').actualBoundingBoxAscent) / 2 ? 'onum' : 'lnum', spc: Math.abs(m('1').width - m('0').width) < 0.5 ? 'tnum' : 'pnum' } };
  });
}
/* 没有变化的原因：默认就是这样（'default'），或者字体里没有（'none'） */
export const numWhy = (fx, t) => fx[t] ? '' : t === fx.def.fig || t === fx.def.spc ? 'default' : 'none';
/* 高级排版属性「数字样式」下面：显示数字的字体默认是哪种数字，选了的样式在这个字体里有没有 */
export function renderNumHint() {
  const el = $('#numHint'); if (!el) return;
  const { f, fx } = digitFx();
  el.hidden = !fx;
  /* 卡片：这个字体没有的样式淡一些（排出来和默认一样），鼠标停留时说明 */
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
/* 特性卡片：当前字体里没有这个特性时不显示字样（排出来和默认一样，反而误导），只写「字体里没有」，描边改成点线；仍然可以选，选中时描边是警告色 */
function markLack(b, on) {
  b.classList.toggle('lack', on);
  const s = b.querySelector('.tt-s'); if (s) s.dataset.lack = on ? T('lackTile') : '';
}
/* 字形标准、假名标点宽度的卡片：这个字体里没有效果的选项淡一些；字形标准一个都没有时在下面说明 */
export const EA_SAMPLE = { eaVar: '辻葛飴鴎国', eaWidth: 'イリ「ア」ﾃｽ' };
export function renderEaMarks() {
  const W = state.view.weight, fonts = { eaVar: usedFont(resolveCls('han', W, true)), eaWidth: usedFont(resolveCls('kana', W, true)) };
  const fx = {};
  for (const k of ['eaVar', 'eaWidth']) {
    const t = TYPO.find(x => x.key === k), tags = t.values.map(v => EA_FEAT[v[0]]).filter(Boolean);
    fx[k] = featFx(fonts[k], EA_SAMPLE[k], tags, renderEaMarks);
    /* JIS 各版里只有一版没变化、其他几版有变化：字体默认就是那一版（例如 ProN 字体默认就是 JIS2004），不算没有 */
    const jisAny = fx[k] && ['jp78', 'jp83', 'jp90', 'jp04'].some(t => fx[k][t]);
    document.querySelectorAll(`#featRows [data-typo="${k}"]`).forEach(b => {
      const tag = EA_FEAT[b.dataset.v], none = !!(tag && fx[k] && !fx[k][tag]), isDef = none && /^jp/.test(tag) && jisAny;
      markLack(b, none && !isDef);
      b.title = b.dataset.v + (none ? ' — ' + T(isDef ? 'eaDefault' : 'eaLack', { font: shortName(fonts[k]) }) : '');
    });
  }
  /* 宽度：比例宽、全角都没有时，在卡片下面说一句（卡片看起来都一样，不是没生效） */
  const wh = $('#eaWHint');
  if (wh) {
    const noneW = fx.eaWidth && !['pwid', 'fwid'].some(t => fx.eaWidth[t]);
    wh.hidden = !noneW;
    if (noneW) wh.textContent = T('eaWNone', { font: shortName(fonts.eaWidth) }) + (fonts.eaWidth.kind === 'google' ? T('eaGoogle') : '');
  }
  const el = $('#eaHint'); if (!el) return;
  const none = fx.eaVar && !['jp78', 'jp83', 'jp90', 'jp04', 'smpl', 'trad'].some(t => fx.eaVar[t]);
  el.hidden = !none;
  if (none) el.textContent = T('eaNone', { font: shortName(fonts.eaVar) }) + (fonts.eaVar.kind === 'google' ? T('eaGoogle') : '');
}
/* 改了某一格后，只更新其他格的继承值，不重绘表格（保持输入焦点） */
export function refreshInherited() {
  const act = document.activeElement;
  document.querySelectorAll('#editor .ct-row[data-id], #editor .ct-row[data-ci]').forEach(row => {
    const key = row.dataset.id || '#' + row.dataset.ci;
    row.querySelectorAll('.num').forEach(inp => {
      const size = inp.dataset.field === 'size';
      inp.placeholder = size ? inheritedSize(key, BASE_W) : inheritedShift(key);
      if (inp !== act) { const own = size ? ownSize(key, BASE_W) : objByKey(key).shift; inp.value = own ?? ''; inp.classList.toggle('own', own != null); }      // 同步基础大小，以及只聚焦、未修改的基线推算值
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

/* ================= 渲染：校样 ================= */
export function renderPreview() {
  const v = state.view, pt = $('#proofText');
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
  /* 类别着色优先用 CSS Highlight API：不拆 DOM，排版和不着色时完全一样（拆成 span 会让竖排里的西文和后面的字重叠）。
     只有基线偏移必须包 span；浏览器不支持 Highlight API 时才退回用 span 着色 */
  const hl = HL_OK && v.colorize, spanColor = v.colorize && !HL_OK;
  pt.classList.toggle('colorize', spanColor);
  if (!(spanColor || anyShift())) pt.textContent = v.text;
  else {
    /* 不需要 span 的文字合成一个文本节点：直排时，西文、数字和汉字分在相邻的文本节点里，Chrome 会把后面的字叠上去 */
    /* 用 span 着色时按类别分 span；否则只有基线偏移需要 span，按偏移量分：
       偏移相同的数字和字母（「27.6km」）放在同一个 span 里，字距不会被元素边界切断 */
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
  paintClasses(pt, hl);
  checkMissSoon();
  const legend = $('#legend');
  legend.hidden = !v.colorize;
  if (v.colorize) legend.innerHTML = visibleClasses().filter(c => c.id !== 'han').map(c => `<span style="--c:var(--c-${c.id})"><i></i>${esc(tr(c.name))}</span>`).join('') +
    (state.custom.length ? `<span style="--c:var(--c-custom)"><i></i>${esc(T('legendCustom'))}</span>` : '') + `<span>${esc(T('legendBase'))}</span>`;
  root.style.setProperty('--generic', state.generic !== 'auto' ? state.generic : guessGeneric());
}
/* ================= 缺字 =================
   校样里每个字按「本类别的字体 → （例外字符所在类别的字体）→ 汉字基础字体」检查，第一个有这个字的字体就是实际显示它的字体。
   不是本类别的字体 = 一级（合成字体里的其他字体代替）；都没有 = 二级（落到系统字体）。
   空白、组合附加符号、格式字符本来就没有宽度，不检查 */
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
    const chain = [...new Map(rs.filter(r => r.font).map(usedFont).map(f => [fontKey(f), f])).values()];      // 实际加载的字体，去重
    chains.set(c, chain);
    for (const f of chain) { const k = fontKey(f); if (!need.has(k)) need.set(k, new Set()); need.get(k).add(c); }
  }
  const miss = new Map();      // 字体 → 这个字体没有的字；还在加载的字体不判断（null）
  await Promise.all([...need].map(async ([k, cs]) => {
    const src = sources.get(k);
    miss.set(k, !src || src.status === 'loading' ? null : src.status === 'error' ? cs : await missingIn(src, [...cs]));
  }));
  if (tok !== missTok) return;
  missMap = new Map();      // 字 → { lv, from, by }：鼠标停在标出的字上时，提示里用
  for (const [c, chain] of chains) {
    const has = f => { const m = miss.get(fontKey(f)); return !m || !m.has(c); };
    if (has(chain[0])) continue;
    const by = chain.slice(1).find(has);
    missMap.set(c, { lv: by ? 1 : 2, from: shortName(chain[0]), by: by && shortName(by) });
  }
  paintMiss();
}
/* 鼠标停在标了波浪线的字上：在字旁边弹出说明 */
export function missTipAt(x, y) {
  const tip = $('#missTip');
  const hide = () => { tip.hidden = true; };
  if (!missMap?.size) return hide();
  const pos = document.caretPositionFromPoint?.(x, y), rng = pos ? null : document.caretRangeFromPoint?.(x, y);
  const node = pos ? pos.offsetNode : rng?.startContainer, off = pos ? pos.offset : rng?.startOffset;
  if (!node || node.nodeType !== 3 || !$('#proofText').contains(node)) return hide();
  /* 光标位置在字和字之间：前后两个字都看一下，取鼠标真正落在上面的那个 */
  for (const start of [off, off - 1, off - 2]) {
    if (start < 0 || start >= node.data.length) continue;
    const ch = String.fromCodePoint(node.data.codePointAt(start)), info = missMap.get(ch);
    if (!info) continue;
    const r = new Range(); r.setStart(node, start); r.setEnd(node, start + ch.length);
    const b = r.getBoundingClientRect();
    if (x < b.left || x > b.right || y < b.top || y > b.bottom) continue;
    tip.textContent = T(info.lv === 1 ? 'missTipBy' : 'missTipSys', { c: ch, font: info.from, by: info.by });
    tip.className = 'miss-tip lv' + info.lv;
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(b.left, innerWidth - w - 8)) + 'px';
    tip.style.top = (b.bottom + 6 + h > innerHeight ? b.top - h - 6 : b.bottom + 6) + 'px';
    return;
  }
  hide();
}
export const checkMissSoon = debounce(checkMiss, 120);
/* 用 Highlight API 标出缺字，不改 DOM（竖排也不会乱） */
export function paintMiss() {
  if (!HL_OK) return;
  const sets = [null, new Highlight(), new Highlight()];
  sets[1].priority = sets[2].priority = 1;      // 盖在类别着色上面
  if (missMap?.size) {
    const walker = document.createTreeWalker($('#proofText'), NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      let i = 0;
      for (const ch of node.data) {
        const lv = missMap.get(ch)?.lv;
        if (lv) { const r = new Range(); r.setStart(node, i); r.setEnd(node, i + ch.length); sets[lv].add(r); }
        i += ch.length;
      }
    }
  }
  CSS.highlights.set('cf-miss1', sets[1]); CSS.highlights.set('cf-miss2', sets[2]);
}
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
/* 示例页签按界面语言排：简中界面先简体，繁中界面先台湾、香港，日文界面先日文 */
export const SAMPLE_ORDER = { zh: ['zh', 'tw', 'hk', 'ja'], tw: ['tw', 'hk', 'zh', 'ja'], ja: ['ja', 'zh', 'tw', 'hk'] };
export const orderedSamples = () => { const first = SAMPLE_ORDER[UI] || SAMPLE_ORDER.zh; return [...first, ...Object.keys(SAMPLES).filter(k => !first.includes(k))]; };
export function renderSampleTabs() {
  const v = state.view, cur = v.sample, cs = v.customs || [];
  const name = i => T('customSample') + (cs.length > 1 ? ' ' + (i + 1) : '');
  $('#sampleTabs').innerHTML = orderedSamples().map(k => [k, SAMPLES[k]]).map(([k, s]) => `<button type="button" role="tab" data-sample="${k}" aria-selected="${cur === k}">${esc(tr(s.label))}</button>`).join('') +
    cs.map((c, i) => `<span class="ctab"><button type="button" role="tab" data-sample="c${i}" aria-selected="${cur === 'c' + i}" aria-controls="sampleBox">${esc(name(i))}</button><button type="button" class="ctab-x" data-act="delcustom" data-i="${i}" aria-label="${esc(T('customDel'))}" title="${esc(T('customDel'))}"><svg class="ic" aria-hidden="true"><use href="#i-x"/></svg></button></span>`).join('') +
    `<button type="button" class="tab-add" data-act="addcustom" aria-label="${esc(T('customAdd'))}" title="${esc(T('customAdd'))}"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg></button>`;
  $('#sampleBox').hidden = !/^c\d+$/.test(cur);      // 只有自定义页签可以编辑
  tabFade();
}
/* 页签放不下时横向滚动：还有没露出来的一侧淡出，提示可以滚 */
export function tabFade() {
  const t = $('#sampleTabs'), max = t.scrollWidth - t.clientWidth;
  t.classList.toggle('fade-l', t.scrollLeft > 2);
  t.classList.toggle('fade-r', t.scrollLeft < max - 2);
}
export function renderLangOptions() {
  $('#exLang').innerHTML = `<option value="">${esc(T('anyLang'))}</option>` + TYPO.find(t => t.key === 'lang').values.map(([v, d]) => `<option value="${v}">${esc(tr(d))}</option>`).join('');
}
/* 左窗格的「预设 / 字体 / 排版」页签。第一次打开时在预设页签 */
export function syncLeftTab() {
  const k = ['fonts', 'typo'].includes(state.view.ltab) ? state.view.ltab : 'presets';
  document.querySelectorAll('.pane-bar [data-ltab]').forEach(b => b.setAttribute('aria-selected', b.dataset.ltab === k));
  $('#panePresets').hidden = k !== 'presets'; $('#paneFonts').hidden = k !== 'fonts'; $('#paneTypo').hidden = k !== 'typo';
  if (k === 'fonts') fitGlyphs();
}
/* 只在导出域或界面语言改变时重建节点，拖动滑杆时保持原控件与焦点。 */
export function syncPreviewWeight({ preserveInput = false } = {}) {
  const cont = state.wmode === 'cont', ws = state.weights, v = state.view;
  const wn = $('#vWn'), slider = $('#vWSlider'), ticks = $('#vWTicks');
  const w = cont ? v.wcont : v.weight;
  wn.min = cont ? state.wrange[0] : ws[0]; wn.max = cont ? state.wrange[1] : ws.at(-1); wn.step = cont ? 1 : 'any';
  if (!preserveInput) wn.value = w;
  const domain = cont ? state.wrange : ws, signature = UI + ':' + state.wmode + ':' + domain.join(',');
  if (slider.dataset.domain !== signature) {
    slider.dataset.domain = signature;
    slider.min = cont ? domain[0] : 0; slider.max = cont ? domain[1] : Math.max(1, ws.length - 1);
    slider.step = 1; slider.disabled = !cont && ws.length === 1;
    ticks.classList.toggle('steps', !cont);
    const shortcuts = cont ? [400, 700].filter(n => n >= domain[0] && n <= domain[1]) : [];
    const stops = cont ? [...new Set([...domain, ...shortcuts])].sort((a, b) => a - b) : domain;
    const percent = n => (n - domain[0]) * 100 / (domain[1] - domain[0]);
    // 同行按实际数值排；固定宽度弹层中，端点离常用字重太近时省略端点文字，保留范围与刻度线。
    // 常用字重只是跳转按钮，不让连续滑杆吸附到 400 / 700。
    ticks.innerHTML = stops.map((n, i) => {
      const pos = cont ? percent(n) : domain.length === 1 ? 0 : i * 100 / (domain.length - 1);
      const attrs = `style="--tick:${pos}%" data-weight="${esc(n)}"`;
      const label = !cont || !shortcuts.some(s => Math.abs(percent(s) - pos) < 16);
      return shortcuts.includes(n) ? `<button type="button" class="btn-text" ${attrs} aria-label="${esc(wTip(n))}" title="${esc(wTip(n))}">${n}</button>` : `<span ${attrs} aria-hidden="true">${label ? esc(n) : ''}</span>`;
    }).join('');
  }
  slider.value = cont ? w : ws.indexOf(w);
  slider.setAttribute('aria-valuetext', w);
  ticks.querySelectorAll('[data-weight]').forEach(el => {
    const current = +el.dataset.weight === w;
    el.classList.toggle('cur', current);
    if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', current);
  });
}
export function syncToolbar() {
  const v = state.view;
  renderCurrentPreset();
  syncLeftTab();
  renderSampleTabs();
  if (document.activeElement !== $('#vSize')) $('#vSize').value = v.size;      // 正在输入时不改写框里的字
  if (document.activeElement !== $('#vLh')) $('#vLh').value = (+v.lh).toFixed(2);
  $('#vLhOut').textContent = `${+(v.size * v.lh).toFixed(1)}px`;      // 倍数在框里，实际的行距跟在后面
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
  $('#sample').value = v.text;
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

/* 字重的常用名。400 = normal（正文），700 = bold（b、strong、h1–h6 的默认） */
export const W_NAMES = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
export const wTag = w => w === 400 || w === 700 ? `<small>${esc(T(w === 400 ? 'w400' : 'w700'))}</small>` : '';      // 按钮上直接写「正文」「粗体」
export const wTip = w => `${w} · ${W_NAMES[w]}` + (w === 400 ? ' — ' + T('w400Tip') : w === 700 ? ' — ' + T('w700Tip') : '');
/* 浏览器按 CSS 的字重匹配规则，从导出的字重里找最接近的（CSS Fonts 4 §5.2） */
export function matchWeight(ws, want) {
  if (ws.includes(want)) return want;
  const lo = ws.filter(w => w < want).sort((a, b) => b - a), hi = ws.filter(w => w > want).sort((a, b) => a - b);
  if (want >= 400 && want <= 500) return hi.find(w => w <= 500) ?? lo[0] ?? hi[0];
  return want < 400 ? lo[0] ?? hi[0] : hi[0] ?? lo[0];
}
/* 导出字重下面的提示：缺了 400 / 700 时说明正文、粗体会怎样显示 */
export function renderWHint() {
  const el = $('#exWHint'), ws = state.weights, miss = [400, 700].filter(w => !ws.includes(w)), out = [];
  if (miss.includes(400)) out.push(T('wMiss400', { w: matchWeight(ws, 400) }));
  if (miss.includes(700)) { const m = matchWeight(ws, 700); out.push(T(m < 600 ? 'wMiss700Faux' : 'wMiss700', { w: m })); }
  el.hidden = !miss.length;
  if (miss.length) el.innerHTML = esc(out.join('')) + ` <button type="button" class="btn-text" data-act="wadd">${esc(T('wAdd', { w: miss.join(T('joiner')) }))}</button>`;
}

/* ================= 度量 ================= */
export let lastMeasure = null, lastRef = null;
export function cssVar(n) { return getComputedStyle(root).getPropertyValue(n).trim(); }
/* 汉字字体自带西文的比例：用汉字字体单独排「国」「H」「x」 */
export function measureRef() {
  const han = sources.get(fontKey(usedFont(resolveCls('han', state.view.weight, true))));
  if (!han || han.status !== 'ok') return null;
  const c = document.createElement('canvas').getContext('2d'), fs = 200;
  c.font = `${fs}px "${han.family}", monospace`; const a = c.measureText('H').width;
  c.font = `${fs}px "${han.family}", serif`; const b = c.measureText('H').width;
  const font = fontLabel(han.font);
  if (Math.abs(a - b) > 0.01) return { font, none: true };     // 汉字字体里没有 H，回退到了别的字体
  const g = c.measureText('国'), face = g.actualBoundingBoxAscent + g.actualBoundingBoxDescent;
  if (face < 1) return null;
  return { font, cap: c.measureText('H').actualBoundingBoxAscent / face, x: c.measureText('x').actualBoundingBoxAscent / face };
}
/* 度量参考图：汉字字面为基准，叠上西文（大写高、x 高）、数字（数字高）、假名（假名字面）的参考线。
   西文、数字、假名可以在「显示」里分别隐藏 */
/* 度量参考图的显示项：菜单里的项目固定。参考线太多会看不清，所以假名默认只在日文、注音默认只在繁體中文（台灣）时勾选；手动勾过的以手动为准 */
export const specShown = () => ({ latin: true, digit: true, kana: /^ja/.test(state.typo.lang || ''), bopo: state.typo.lang === 'zh-Hant-TW', ...(state.view.specShow || {}) });
export function drawSpecimen() {
  const cv = $('#spec'), sh = specShown();
  const W = cv.clientWidth || 600;
  const ctx = cv.getContext('2d');
  /* 右边标签区按最长的标签留宽度（以前固定 150px，右边空出一大块） */
  ctx.font = `11px ${cssVar('--ui') || 'sans-serif'}`;
  const labKeys = ['gFaceTop', 'gFaceBot', 'gBase', ...(sh.latin ? ['gCap', 'gX', 'gLatBase'] : []), ...(sh.digit ? ['gFig', 'gDigBase'] : []), ...(sh.kana ? ['gKanaTop', 'gKanaBot'] : []), ...(sh.bopo ? ['gBopoTop', 'gBopoBot'] : [])];
  const labelW = Math.min(150, W * 0.3, Math.ceil(Math.max(...labKeys.map(k => ctx.measureText(T(k)).width))) + 8 + 12), plotR = W - labelW;
  const fam = `${liveFamily ? `"${liveFamily}", ` : ''}serif`, fw = state.wmode === 'cont' ? state.view.wcont : state.view.weight;
  const shiftOf = ch => settingOf(ownerOf(ch.codePointAt(0))).shift / 100;
  /* 画出来的字：汉字总在；假名 あ、注音 ㄅ、西文 Hxg（连在一起，按字体本身的字距）、数字 0 按显示设定 */
  const show = ['国', ...(sh.kana ? ['あ'] : []), ...(sh.bopo ? ['ㄅ'] : []), ...(sh.latin ? ['Hxg'] : []), ...(sh.digit ? ['0'] : [])];
  const GAP = 0.2;      // 各组之间的距离（字号的倍数）
  /* 字号先按宽度定（最大 88px），画布高度再跟着字号走：参考图固定在校样栏底部，不能太高 */
  const userH = state.view.specH;      // 拖动分界线定的高度：字号跟着高度变（最大是高度的 1/1.6）
  let fs = userH ? Math.max(40, Math.floor(userH / 1.6)) : 88;
  ctx.font = `${fw} ${fs}px ${fam}`;
  const span = show.reduce((s, ch) => s + ctx.measureText(ch).width, 0) + fs * GAP * (show.length - 1);
  if (span > plotR - 24) fs = Math.floor(fs * (plotR - 24) / span);
  const nLines = 3 + (sh.latin ? 3 : 0) + (sh.digit ? 2 : 0) + (sh.kana ? 2 : 0) + (sh.bopo ? 2 : 0);
  const LT = 9;      // 参考线的标签最高排到这里
  const minH = Math.max(110, nLines * 13 + 16 + LT - 7);      // 右边的参考线标签要放得下
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
  const baseY = Math.round(H / 2 + (han.asc - han.desc) / 2);      // 汉字字面放在画布正中
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
  /* 标签按线的位置排，间距至少 12px；超出画布底部时整体上移 */
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
  /* 两个按钮要用的测量值：大写高、x 高占汉字字面的比例，大写中线和字面中线的差 */
  const face = han.asc + han.desc;
  if (face < 1 || cap.asc < 1) { lastMeasure = null; return; }
  const midPx = ((capTop + latBase) / 2) - ((hanTop + hanBot) / 2);   // 正值 = 大写中线偏低
  lastMeasure = { capRatio: cap.asc / face, xRatio: xg.asc / face, midEm: midPx / fs };
}
