'use strict';
/* ================= 渲染：字符类别表（对应 InDesign 的复合字体对话框） ================= */
const GLYPH = { han: '永', latin: 'Ag', digit: '01', kana: 'あ', bopo: 'ㄅ', punct: '」、', symbol: '※', shared: '“…' };
const visibleClasses = () => CLASSES;
const shortName = f => !f ? '' : f.kind === 'google' ? f.family : f.kind === 'local' ? f.name : f.kind === 'path' ? f.path : f.fileName;
const keyName = key => key[0] === '#' ? T('customName', { c: state.custom[+key.slice(1)]?.chars || '…' }) : tr(CLS[key].name);
/* 这个类别在某个字重下有没有单独设定的粗细 / 字体名 / 文件 */
function hasWeightOverride(key, W) {
  if (W === BASE_W) return false;
  const o = objByKey(key);
  return !!state.wOver[W]?.[key]?.weight || !!state.wOver[W]?.[key]?.font || (!!o?.font && (fontKey(o.font) + '|' + W) in state.weightNames);
}
function fontCell(key, o, isHan, allowLatin) {
  const W = state.view.weight, ov = W !== BASE_W ? state.wOver[W]?.[key] : null;
  const opts = [];
  if (!isHan) {
    opts.push(['han', T('optFollow', { c: tr(CLS.han.name), f: fontLabel(resolveCls('han', W, true).font) })]);
    if (allowLatin) opts.push(['latin', T('optFollow', { c: tr(CLS.latin.name), f: fontLabel(resolveCls('latin', W, true).font) })]);
  }
  /* 每个字重都是同一个下拉菜单：这一项显示该字重实际用的字体，单独设定通过「选择字体…」 */
  const own = o.font ? ownFontAt(o, ov, W, true) : null, shown = o.font ? ownFontAt(o, ov, W, false) : null;
  const eff = ov?.font || o.font;                          // 这个字重实际用的字体（可能单独换成了别的字体）
  const gw = !o.follow && eff?.kind === 'google';      // Google Fonts：粗细放在旁边的小菜单里，菜单项只写字体名
  if (own) opts.push(['own', (gw ? eff.family : fontLabel(shown)) + (hasWeightOverride(key, W) ? ' · ' + T('ownSet') : '')]);
  opts.push(['pick', T('optPick')]);
  const cur = o.follow || 'own';
  const ownKey = own ? fontKey(finalFont(own, o.vary).font) : '', s = !o.follow && own ? sources.get(ownKey) : null;     // 带上轴之后实际加载的那个
  let html = `<span class="status ${o.follow ? 'none' : (s ? s.status : 'loading')}"${o.follow ? '' : ` data-key="${esc(ownKey)}"`}></span>` +
    `<select class="fsel${o.follow ? ' follow' : ''}" data-act="fsel" title="${esc((opts.find(([v]) => v === cur) || [])[1] || '')}" aria-label="${esc(T('fontAria', { c: keyName(key) }))}">` +
    opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('') + '</select>';
  /* 可变字体：粗细是可以填任意值的数字框（范围限制在 wght 轴内）；空着表示自动 */
  const axis = !o.follow ? vfAxisNow(eff) : null;
  if (axis && state.wmode === 'cont') {      // 连续模式：可变字体的粗细直接跟随页面的 font-weight，没有可调的值
    html += `<span class="vf-tag" title="${esc(T('vfContTitle', { a: axis[0], b: axis[1] }))}">VF ${axis[0]}–${axis[1]}</span>`;
    return html;
  }
  if (axis) {
    const cur = W === BASE_W ? (eff.weight || 400) : ov?.font ? (ov.font.weight || 400) : ov?.weight;
    const auto = W === BASE_W ? '' : (eff.kind === 'google' ? fontAtWeight(o.font, W).weight : fontAtWeight(o.font, W).weight);
    html += `<span class="wnum-wrap"><span class="vf-tag" aria-hidden="true">VF</span><input class="wnum" type="number" data-act="wnum" min="${axis[0]}" max="${axis[1]}" step="10" value="${cur ?? ''}" placeholder="${auto}"
      title="${esc(T('vfTitle', { a: axis[0], b: axis[1] }))}" aria-label="${esc(T('wselAria', { w: W }))}"></span>`;
    return html;
  }
  /* 每个字重都有同一个粗细菜单：400 时改的是字体本身，其他字重时第一项是「自动」 */
  if (gw) {
    const autoF = fontAtWeight(o.font, W), auto = sources.get(fontKey(autoF))?.actualWeight || autoF.weight;
    const val = W === BASE_W ? o.font.weight : ov?.font ? ov.font.weight : (ov?.weight || 0);
    html += `<select class="wsel" data-act="wsel" aria-label="${esc(T('wselAria', { w: W }))}">` +
      (W === BASE_W || ov?.font ? '' : `<option value="0">${esc(T('wAuto', { w: auto }))}</option>`) +
      WEIGHTS.map(w => `<option value="${w}"${val === w ? ' selected' : ''}>${w}</option>`).join('') + '</select>';
  }
  return html;
}
function numCell(field, key) {
  const W = state.view.weight, o = objByKey(key);
  const own = field === 'size' ? ownSize(key, W) : o.shift;
  const inh = field === 'size' ? inheritedSize(key, W) : inheritedShift(key);
  const cls = own == null ? '' : (field === 'size' && W !== BASE_W ? ' own wov' : ' own');
  return `<input class="num${cls}" type="text" inputmode="decimal" autocomplete="off" data-field="${field}" value="${own ?? ''}" placeholder="${inh}"
    aria-label="${esc(T(field === 'size' ? 'sizeAria' : 'shiftAria', { c: keyName(key) }))}">`;
}
/* 调过的可变轴：写在这一行下面，例如「宽度 80 · 光学尺寸 跟随字号」 */
function axRow(key, o) {
  if (o.follow || !o.vary) return '';
  const W = state.view.weight, f = ownFontAt(o, W !== BASE_W ? state.wOver[W]?.[key] : null, W, true);
  const list = Object.entries(o.vary).filter(([t]) => axisOf(f, t));
  return list.length ? `<span class="ct-ax">${list.map(([t, v]) => `<span>${esc(axisLabel(t))} <b>${esc(v === 'auto' ? T('axOpszAuto') : String(v))}</b></span>`).join('')}</span>` : '';
}
function errRow(key, o) {
  if (o.follow || !o.font) return '';
  const W = state.view.weight, f = ownFontAt(o, W !== BASE_W ? state.wOver[W]?.[key] : null, W, true);
  const s = sources.get(fontKey(finalFont(f, o.vary).font));
  if (s?.status === 'error') return `<span class="ct-err">${esc(srcError(s))}</span>`;
  /* CJK 字体（Google 上切成上百个分片）用了非整百的粗细，就会加载可变版本：每个分片约为静态的 1.9 倍 */
  if (f.kind === 'google' && f.weight % 100 && s?.status === 'ok' && s.faces.length > 30) return `<span class="ct-note">${esc(T('vfCjkCost'))}</span>`;
  return '';
}
/* ================= 地区检查：字形和标点位置是不是当前语言的写法 ================= */
const REGION_OF_LANG = { 'zh-Hans': 'sc', 'zh-Hant-TW': 'tw', 'zh-Hant-HK': 'hk', ja: 'jp', ko: 'kr' };
const PUNCT_CENTER = { sc: false, jp: false, tw: true, hk: true };      // 大陆、日本的标点靠左下，台湾、香港居中
/* 字形的地区只能看字族名：Google 的 SC / TC / HK / JP / KR 后缀和常见系统字体的名字 */
function formsOf(f) {
  const n = f?.family || f?.name || '';
  if (/\b(SC|GB)\b|YaHei|PingFang SC|Songti SC|STSong|SimSun|STHeiti/.test(n)) return 'sc';
  if (/\bTC\b|PingFang TC|JhengHei|Songti TC|LiHei|BiauKai|MingLiU/.test(n)) return 'tw';
  if (/\bHK\b|PingFang HK/.test(n)) return 'hk';
  if (/\bJP\b|Hiragino (Sans|Mincho|Kaku|Maru)|Yu (Gothic|Mincho)|Meiryo|Shippori|Zen |BIZ UD|M PLUS|Klee|MS (Gothic|Mincho)/.test(n)) return 'jp';
  if (/\bKR\b|Apple SD Gothic|Malgun/.test(n)) return 'kr';
  return null;
}
/* 标点位置要量：「，」的墨迹重心在字身里的位置。一个文件含多个地区字形的字体（思源、Noto CJK）会按 lang 切换，所以带上语言量 */
const punctMemo = new Map();      // 「字体|语言」→ 'center' | 'corner' | null；undefined = 测量中
const regionChanged = debounce(() => { renderEditor(); renderLangWarn(); }, 80);
function punctPos(s, lang) {
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
const langName = lang => tr(TYPO.find(t => t.key === 'lang').values.find(([v]) => v === lang)?.[1]) || lang;
function regionCheck(lang) {
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
function regionRow(key) {
  if (key !== 'han' && key !== 'punct') return '';
  const lang = state.typo.lang, c = regionCheck(lang);
  if (key === 'han' && c.forms) return `<span class="ct-note">${esc(T('regForms', { got: T('reg_' + c.forms.got), lang: langName(lang) }))}</span>`;
  if (key === 'punct' && c.punct) return `<span class="ct-note">${esc(T(c.punct.pos === 'center' ? 'regPunctCenter' : 'regPunctCorner', { lang: langName(lang) }))}</span>`;
  return '';
}
/* 导出区：按适用语言检查，写在「适用语言」下面 */
function renderLangWarn() {
  const el = $('#exLangWarn'), lang = state.scope, c = lang ? regionCheck(lang) : {}, list = [];
  if (c.forms) list.push(T('exRegForms', { font: shortName(c.forms.font), got: T('reg_' + c.forms.got) }));
  if (c.punct) list.push(T(c.punct.pos === 'center' ? 'exRegPunctCenter' : 'exRegPunctCorner', { font: shortName(c.punct.font) }));
  el.hidden = !list.length;
  if (list.length) el.textContent = T('exRegWarn', { lang: langName(lang), list: list.join(T('joiner')) });
}
function renderEditor() {
  const W = state.view.weight, banner = $('#wBanner');
  banner.hidden = W === BASE_W;
  const wAdj = W !== BASE_W && (Object.keys(state.wOver[W] || {}).some(k => Object.keys(state.wOver[W][k]).length) || Object.keys(state.weightNames).some(k => k.endsWith('|' + W)));
  if (W !== BASE_W) banner.innerHTML = `<span>${esc(T('wBanner', { w: W }))}</span><span class="wb-act">${wAdj ? `<button type="button" class="tbtn" data-act="wclear">${esc(T('wClear'))}</button>` : ''}${state.weights.includes(BASE_W) ? `<button type="button" class="tbtn" data-act="wback">${esc(T('wBack'))}</button>` : ''}</span>`;
  const info = k => `<button type="button" class="info" data-info="${k}" popovertarget="infoPop" aria-label="${esc(T('infoAria'))}">i</button>`;
  const head = `<div class="ct-row ct-head"><span class="ct-glyph"></span><span>${esc(T('colClass'))}</span><span>${esc(T('colFont'))}</span><span class="r lab-i">${esc(T('colSize'))}${info('sizeInfo')}</span><span class="r lab-i">${esc(T('colShift'))}${info('shiftInfo')}</span><span></span></div>`;
  $('#classRows').innerHTML = head + visibleClasses().map(c => {
    const o = state.classes[c.id];
    const tip = c.id === 'shared' ? T('sharedHint') : '';
    const groups = GROUPS[c.id] || [];
    const nMoved = groups.filter(g => isMoved(c.id, g)).length;
    const nIn = c.id === 'latin' ? Object.entries(GROUPS).reduce((n, [cid, gs]) => n + gs.filter(g => isMoved(cid, g)).length, 0) : 0;
    const note = [c.note ? tr(c.note) : '', nMoved ? T('movedNote', { n: nMoved }) : '', nIn ? T('movedIn', { n: nIn }) : ''].filter(Boolean).join(' · ');
    const gear = groups.length ? `<button type="button" class="gear${nMoved ? ' on' : ''}" data-act="groups" data-cls="${c.id}" popovertarget="grpPop" aria-label="${esc(T('gearAria', { c: tr(c.name) }))}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.76 2.85L6.8 0.8L9.2 0.8L9.24 2.85A5.3 5.3 0 0 1 10.77 3.48L12.24 2.06L13.94 3.76L12.52 5.23A5.3 5.3 0 0 1 13.15 6.76L15.2 6.8L15.2 9.2L13.15 9.24A5.3 5.3 0 0 1 12.52 10.77L13.94 12.24L12.24 13.94L10.77 12.52A5.3 5.3 0 0 1 9.24 13.15L9.2 15.2L6.8 15.2L6.76 13.15A5.3 5.3 0 0 1 5.23 12.52L3.76 13.94L2.06 12.24L3.48 10.77A5.3 5.3 0 0 1 2.85 9.24L0.8 9.2L0.8 6.8L2.85 6.76A5.3 5.3 0 0 1 3.48 5.23L2.06 3.76L3.76 2.06L5.23 3.48A5.3 5.3 0 0 1 6.76 2.85Z" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/><circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.25"/></svg></button>` : '';
    return `<div class="ct-row" data-id="${c.id}" style="--c:var(--c-${c.id})">
      <span class="ct-glyph" aria-hidden="true">${esc(GLYPH[c.id])}</span>
      <span class="ct-name"${tip ? ` title="${esc(tip)}"` : ''}><span class="nm"><i class="dot"></i>${esc(tr(c.name))}${gear}</span>${note ? `<small>${esc(note)}</small>` : ''}</span>
      <span class="ct-font">${fontCell(c.id, o, c.id === 'han', c.id !== 'latin')}</span>
      ${numCell('size', c.id)}${numCell('shift', c.id)}<span></span>${axRow(c.id, o)}${errRow(c.id, o)}${regionRow(c.id)}
    </div>`;
  }).join('');
  renderNumHint();
  $('#customRows').innerHTML = state.custom.length ? state.custom.map((cu, i) => `<div class="ct-row" data-ci="${i}">
      <input class="chars" type="text" value="${esc(cu.chars)}" placeholder="${esc(T('customPh'))}" aria-label="${esc(T('custom'))}" spellcheck="false">
      <span class="ct-font">${fontCell('#' + i, cu, false, true)}</span>
      ${numCell('size', '#' + i)}${numCell('shift', '#' + i)}
      <button class="x" type="button" data-act="remove" aria-label="${esc(T('customRemove'))}">×</button>${axRow('#' + i, cu)}${errRow('#' + i, cu)}
    </div>`).join('')
    : '';
}
/* 齿轮弹出的分组开关：打开 = 留在本类别，关闭 = 改由半角西文显示 */
function renderGroups() {
  const pop = $('#grpPop'), id = pop.dataset.cls; if (!id || !GROUPS[id]) return;
  const name = tr(CLS[id].name);
  pop.innerHTML = `<div class="gp-head"><b>${esc(T('gpHead', { c: name }))}</b><span class="hint">${esc(T(id === 'shared' ? 'gpHintShared' : id === 'bopo' ? 'gpHintBopo' : 'gpHintSymbol', { c: name }))}</span></div>` +
    GROUPS[id].map(g => `<div class="gp-row"><span class="gp-sample" aria-hidden="true">${esc(g.sample)}</span>
      <span class="gp-name">${esc(tr(g.name))}<small>${esc(fmtRanges(g.r))}</small></span>
      <button type="button" class="sw" role="switch" data-g="${id}.${g.id}" aria-checked="${!isMoved(id, g)}" aria-label="${esc(tr(g.name))}"></button></div>`).join('') +
    (GROUPS[id].some(g => isMoved(id, g)) ? `<div class="gp-foot"><button type="button" class="tbtn" data-act="gpreset">${esc(T('gpReset'))}</button></div>` : '');
}
/* ================= 数字样式 =================
   在这个字体里有没有效果：每个特性单独加上画一遍 0–9，和不加时逐像素比较。一样 = 字体没有这个特性，或者本来就是这样
   （例如默认就是等高数字时，选「等高」不会有变化）。Google Fonts 的网页字体删掉了大部分特性，onum、zero 都没有 */
let numSeq = 0;
function digitFx() {
  const f = usedFont(resolveCls('digit', state.view.weight, true)), s = f && sources.get(fontKey(f));
  if (s?.status !== 'ok') return { f, fx: null, checking: false };
  const fx = numFx(f);
  return { f, fx, checking: !fx && featCache.get(fontKey(f) + '|0123456789') === 'pending' };
}
/* 字体有没有某些 OpenType 特性：每个特性单独加上把 text 画一遍，和不加时逐像素比较（一样 = 没有效果）。
   extra(ctx, 基准字族名) 可以顺便量别的东西。结果按「字体 + 文字」缓存，测完调用 done */
const featCache = new Map();
function featFx(f, text, tags, done, extra) {
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
function numFx(f) {
  return featFx(f, '0123456789', NUM_TAGS, renderNumHint, ctx => {
    const m = ch => ctx.measureText(ch), a0 = m('0').actualBoundingBoxAscent;
    return { def: { fig: a0 < (m('x').actualBoundingBoxAscent + m('H').actualBoundingBoxAscent) / 2 ? 'onum' : 'lnum', spc: Math.abs(m('1').width - m('0').width) < 0.5 ? 'tnum' : 'pnum' } };
  });
}
/* 没有变化的原因：默认就是这样（'default'），或者字体里没有（'none'） */
const numWhy = (fx, t) => fx[t] ? '' : t === fx.def.fig || t === fx.def.spc ? 'default' : 'none';
/* 高级排版属性「数字样式」下面：显示数字的字体默认是哪种数字，选了的样式在这个字体里有没有 */
function renderNumHint() {
  const el = $('#numHint'); if (!el) return;
  const { f, fx } = digitFx();
  el.hidden = !fx;
  /* 卡片：这个字体没有的样式淡一些（排出来和默认一样），鼠标停留时说明 */
  document.querySelectorAll('#typoRows [data-typo="num"], #typoRows [data-typo="zero"]').forEach(b => {
    const lack = fx ? b.dataset.v.split(' ').map(v => NUM_FEAT[v]).filter(t => t && numWhy(fx, t) === 'none') : [];
    b.classList.toggle('lack', !!lack.length);
    b.title = b.dataset.v + (lack.length ? ' — ' + T('numLacks', { font: shortName(f), list: lack.map(numLabel).join(T('joiner')) }) : '');
  });
  if (!fx) return;
  const font = shortName(f), none = numTags().filter(t => numWhy(fx, t) === 'none');
  el.textContent = T('numDefIs', { font, list: [fx.def.fig, fx.def.spc].map(numLabel).join(T('joiner')) }) +
    (none.length ? T('numLacks', { font, list: none.map(numLabel).join(T('joiner')) }) + (f.kind === 'google' ? T('numGoogleShort') : '') : '');
  el.classList.toggle('warn', !!none.length);
}
/* 字形标准、假名标点宽度的卡片：这个字体里没有效果的选项淡一些；字形标准一个都没有时在下面说明 */
const EA_SAMPLE = { eaVar: '辻葛飴鴎国', eaWidth: 'イリ「ア」ﾃｽ' };
function renderEaMarks() {
  const W = state.view.weight, fonts = { eaVar: usedFont(resolveCls('han', W, true)), eaWidth: usedFont(resolveCls('kana', W, true)) };
  const fx = {};
  for (const k of ['eaVar', 'eaWidth']) {
    const t = TYPO.find(x => x.key === k), tags = t.values.map(v => EA_FEAT[v[0]]).filter(Boolean);
    fx[k] = featFx(fonts[k], EA_SAMPLE[k], tags, renderEaMarks);
    /* JIS 各版里只有一版没变化、其他几版有变化：字体默认就是那一版（例如 ProN 字体默认就是 JIS2004），不算没有 */
    const jisAny = fx[k] && ['jp78', 'jp83', 'jp90', 'jp04'].some(t => fx[k][t]);
    document.querySelectorAll(`#typoRows [data-typo="${k}"]`).forEach(b => {
      const tag = EA_FEAT[b.dataset.v], none = !!(tag && fx[k] && !fx[k][tag]), isDef = none && /^jp/.test(tag) && jisAny;
      b.classList.toggle('lack', none && !isDef);
      b.title = b.dataset.v + (none ? ' — ' + T(isDef ? 'eaDefault' : 'eaLack', { font: shortName(fonts[k]) }) : '');
    });
  }
  const el = $('#eaHint'); if (!el) return;
  const none = fx.eaVar && !['jp78', 'jp83', 'jp90', 'jp04', 'smpl', 'trad'].some(t => fx.eaVar[t]);
  el.hidden = !none;
  if (none) el.textContent = T('eaNone', { font: shortName(fonts.eaVar) }) + (fonts.eaVar.kind === 'google' ? T('eaGoogle') : '');
}
/* 改了某一格后，只更新其他格的继承值，不重绘表格（保持输入焦点） */
function refreshInherited() {
  const W = state.view.weight;
  document.querySelectorAll('#editor .ct-row[data-id], #editor .ct-row[data-ci]').forEach(row => {
    const key = row.dataset.id || '#' + row.dataset.ci;
    row.querySelectorAll('.num').forEach(inp => { inp.placeholder = inp.dataset.field === 'size' ? inheritedSize(key, W) : inheritedShift(key); });
  });
}
function renderChipsStatus() {
  document.querySelectorAll('.status[data-key]').forEach(el => {
    const s = sources.get(el.dataset.key);
    el.className = 'status ' + (s ? s.status : 'loading');
    el.title = s?.status === 'error' ? srcError(s) : s?.status === 'ok' ? T('stOk') : T('stLoading');
  });
}

/* ================= 渲染：校样 ================= */
function renderPreview() {
  const v = state.view, pt = $('#proofText');
  $('#sheet').classList.toggle('vertical', v.vertical);
  $('#sheet').classList.toggle('rules', !!v.rules);
  root.classList.toggle('show-colors', v.colorize);
  root.style.setProperty('--fs', v.size + 'px');
  root.style.setProperty('--lh', v.lh);
  root.style.setProperty('--fst', v.italic ? 'italic' : 'normal');
  for (const el of [pt, $('#naiveText')]) {
    for (const t of TYPO) {
      if (t.attr) el.lang = state.typo[t.key];
      else el.style.setProperty(t.prop, typoValue(t));
    }
  }
  /* 类别着色优先用 CSS Highlight API：不拆 DOM，排版和不着色时完全一样（拆成 span 会让竖排里的西文和后面的字重叠）。
     只有基线偏移必须包 span；浏览器不支持 Highlight API 时才退回用 span 着色 */
  const hl = HL_OK && v.colorize, spanColor = v.colorize && !HL_OK;
  pt.classList.toggle('colorize', spanColor);
  if (!(spanColor || anyShift())) pt.textContent = v.text;
  else {
    /* 不需要 span 的文字合成一个文本节点：直排时，西文、数字和汉字分在相邻的文本节点里，Chrome 会把后面的字叠上去 */
    const frag = document.createDocumentFragment();
    let cur = null, buf = '', plain = '';
    const flush = () => {
      if (!buf) return;
      const sh = settingOf(cur).shift;
      if (!spanColor && !sh) plain += buf;
      else {
        if (plain) { frag.append(plain); plain = ''; }
        const s = document.createElement('span');
        s.className = 'r';
        s.dataset.k = cur[0] === '#' ? 'custom' : cur;
        if (sh) s.style.setProperty('--sh', sh / 100);
        s.textContent = buf;
        frag.append(s);
      }
      buf = '';
    };
    for (const ch of v.text) { const o = ownerOf(ch.codePointAt(0)); if (o !== cur) { flush(); cur = o; } buf += ch; }
    flush();
    if (plain) frag.append(plain);
    pt.replaceChildren(frag);
  }
  paintClasses(pt, hl);
  checkMissSoon();
  $('#naiveText').textContent = v.text;
  $('#naiveWrap').hidden = !v.compare;
  $('#liveLabel').hidden = !v.compare;
  updateNaive();
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
let missTok = 0, missMap = null;
const MISS_SKIP = /[\s\p{M}\p{Cf}]/u;
async function checkMiss() {
  const tok = ++missTok, el = $('#missNote');
  if (!state.view.miss) { missMap = null; paintMiss(); el.hidden = true; return; }
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
  el.hidden = false;
  if (!el.textContent) el.textContent = T('missChecking');
  const miss = new Map();      // 字体 → 这个字体没有的字；还在加载的字体不判断（null）
  await Promise.all([...need].map(async ([k, cs]) => {
    const src = sources.get(k);
    miss.set(k, !src || src.status === 'loading' ? null : src.status === 'error' ? cs : await missingIn(src, [...cs]));
  }));
  if (tok !== missTok) return;
  missMap = new Map();
  const groups = new Map();
  for (const [c, chain] of chains) {
    const has = f => { const m = miss.get(fontKey(f)); return !m || !m.has(c); };
    if (has(chain[0])) continue;
    const by = chain.slice(1).find(has), lv = by ? 1 : 2, gk = shortName(chain[0]) + '|' + (by ? shortName(by) : '');
    missMap.set(c, lv);
    if (!groups.has(gk)) groups.set(gk, { from: shortName(chain[0]), by: by && shortName(by), lv, cs: [] });
    groups.get(gk).cs.push(c);
  }
  paintMiss();
  el.innerHTML = groups.size ? [...groups.values()].sort((a, b) => b.lv - a.lv).map(g =>
    `<p class="lv${g.lv}"><i></i><span>${esc(T(g.lv === 1 ? 'missBy' : 'missSys', { font: g.from, by: g.by, n: g.cs.length }))}<b>${esc(g.cs.slice(0, 60).join(' '))}${g.cs.length > 60 ? ' …' : ''}</b></span></p>`).join('')
    : `<p class="ok">${esc(T('missNone'))}</p>`;
}
const checkMissSoon = debounce(checkMiss, 120);
/* 用 Highlight API 标出缺字，不改 DOM（竖排也不会乱） */
function paintMiss() {
  if (!HL_OK) return;
  const sets = [null, new Highlight(), new Highlight()];
  sets[1].priority = sets[2].priority = 1;      // 盖在类别着色上面
  if (missMap?.size) {
    const walker = document.createTreeWalker($('#proofText'), NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      let i = 0;
      for (const ch of node.data) {
        const lv = missMap.get(ch);
        if (lv) { const r = new Range(); r.setStart(node, i); r.setEnd(node, i + ch.length); sets[lv].add(r); }
        i += ch.length;
      }
    }
  }
  CSS.highlights.set('cf-miss1', sets[1]); CSS.highlights.set('cf-miss2', sets[2]);
}
const HL_OK = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';
const HL_KEYS = ['latin', 'digit', 'kana', 'bopo', 'punct', 'symbol', 'shared', 'custom'];
function paintClasses(el, on) {
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
function guessGeneric() {
  const l = fontLabel(resolveCls('han').font);
  return /serif|mincho|song|ming|明朝|宋|明|kai|楷|garamond|times/i.test(l) && !/sans/i.test(l) ? 'serif' : 'sans-serif';
}
/* 连续字重下不生效的设定：可变字体相对档位单独设定的粗细（设定本身保留，切回分档就恢复） */
function contIgnored() {
  const out = [];
  const check = (key, o, label) => {
    if (!o || o.follow || !o.font || !Array.isArray(vfAxisNow(o.font))) return;
    const parts = [], base = o.font.weight || 400;
    if (base !== BASE_W) parts.push(String(base));
    for (const W of WEIGHTS) { const ov = state.wOver[W]?.[key]; if (ov?.weight && ov.weight !== W) parts.push(`${W}→${ov.weight}`); }
    if (parts.length) out.push(`${label} · ${o.font.family || o.font.name || o.font.fileName} ${parts.join(', ')}`);
  };
  for (const c of CLASSES) check(c.id, state.classes[c.id], tr(c.name));
  state.custom.forEach((cu, i) => check('#' + i, cu, keyName('#' + i)));
  return out;
}
/* 示例页签按界面语言排：简中界面先简体，繁中界面先台湾、香港，日文界面先日文 */
const SAMPLE_ORDER = { zh: ['zh', 'tw', 'hk', 'ja'], tw: ['tw', 'hk', 'zh', 'ja'], ja: ['ja', 'zh', 'tw', 'hk'] };
const orderedSamples = () => { const first = SAMPLE_ORDER[UI] || SAMPLE_ORDER.zh; return [...first, ...Object.keys(SAMPLES).filter(k => !first.includes(k))]; };
function renderSampleTabs() {
  const cur = state.view.sample;
  $('#sampleTabs').innerHTML = orderedSamples().map(k => [k, SAMPLES[k]]).map(([k, s]) => `<button type="button" role="tab" data-sample="${k}" aria-selected="${cur === k}">${esc(tr(s.label))}</button>`).join('') +
    (cur in SAMPLES ? '' : `<button type="button" role="tab" aria-selected="true" disabled>${esc(T('customSample'))}</button>`);
}
function renderLangOptions() {
  $('#exLang').innerHTML = `<option value="">${esc(T('anyLang'))}</option>` + TYPO.find(t => t.key === 'lang').values.map(([v, d]) => `<option value="${v}">${esc(tr(d))}</option>`).join('');
}
function syncToolbar() {
  const v = state.view;
  renderSampleTabs();
  $('#vSize').value = v.size; $('#vSizeOut').textContent = `${v.size}px`;
  $('#vLh').value = v.lh; $('#vLhOut').textContent = `${(+v.lh).toFixed(2)} · ${+(v.size * v.lh).toFixed(1)}px`;      // 倍数和实际的行距
  $('#vVertical').setAttribute('aria-pressed', v.vertical);
  $('#vColor').setAttribute('aria-pressed', v.colorize);
  $('#vCompare').setAttribute('aria-pressed', v.compare);
  $('#vItalic').setAttribute('aria-pressed', !!v.italic);
  $('#vRules').setAttribute('aria-pressed', !!v.rules);
  $('#vMiss').setAttribute('aria-pressed', !!v.miss);
  const sh = specShown();
  document.querySelectorAll('#specViewPop [data-sg]').forEach(b => b.setAttribute('aria-pressed', !!sh[b.dataset.sg]));
  const nOn = [v.vertical, v.colorize, v.rules, v.miss, v.compare, v.italic].filter(Boolean).length;
  $('#viewCount').textContent = nOn ? ` · ${nOn}` : '';
  $('#cmpMode').value = v.cmp;
  for (const t of TYPO) { const el = $('#ty-' + t.key); if (el) el.value = state.typo[t.key]; }
  renderTypoStatus();
  $('#sample').value = v.text;
  $('#mBasis').value = state.metric.basis;
  $('#mTarget').value = state.metric.target;
  $('#mTargetWrap').hidden = state.metric.basis === 'mix';
  $('#exName').value = state.name;
  $('#exWeights').innerHTML = WEIGHTS.map(w => `<button type="button" data-w="${w}" aria-pressed="${state.weights.includes(w)}" title="${esc(wTip(w))}"${wTag(w) ? ' class="wl"' : ''}>${w}${wTag(w)}</button>`).join('');
  renderWHint();
  $('#exBase').value = state.baseMode;
  $('#vWeight').innerHTML = state.weights.map(w => `<button type="button" role="radio" data-w="${w}" aria-checked="${w === state.view.weight}" title="${esc(wTip(w))}"${wTag(w) ? ' class="wl"' : ''}>${w}${wTag(w)}</button>`).join('');
  const cont = state.wmode === 'cont';
  $('#vWeightLab').hidden = cont || state.weights.length < 2;
  $('#vWcontLab').hidden = !cont;
  $('#vWcont').min = state.wrange[0]; $('#vWcont').max = state.wrange[1];       // 滑块只走导出的范围
  $('#vWcont').value = v.wcont; $('#vWcontOut').textContent = v.wcont;
  document.querySelectorAll('#vWMode [data-m]').forEach(b => b.setAttribute('aria-checked', b.dataset.m === state.wmode));
  $('#exContField').hidden = !cont;
  const ign = cont ? contIgnored() : [];
  $('#vWNote').hidden = !ign.length;
  if (ign.length) $('#vWNote').textContent = T('wContNote', { list: ign.join(T('joiner')) });
  $('#exWeightsField').hidden = cont;
  $('#exGeneric').value = state.generic;
  $('#exItalic').value = state.italic ? '1' : '0';
  $('#exLm').value = state.lineMetrics;
  $('#exLang').value = state.scope;
}

/* 字重的常用名。400 = normal（正文），700 = bold（b、strong、h1–h6 的默认） */
const W_NAMES = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const wTag = w => w === 400 || w === 700 ? `<small>${esc(T(w === 400 ? 'w400' : 'w700'))}</small>` : '';      // 按钮上直接写「正文」「粗体」
const wTip = w => `${w} · ${W_NAMES[w]}` + (w === 400 ? ' — ' + T('w400Tip') : w === 700 ? ' — ' + T('w700Tip') : '');
/* 浏览器按 CSS 的字重匹配规则，从导出的字重里找最接近的（CSS Fonts 4 §5.2） */
function matchWeight(ws, want) {
  if (ws.includes(want)) return want;
  const lo = ws.filter(w => w < want).sort((a, b) => b - a), hi = ws.filter(w => w > want).sort((a, b) => a - b);
  if (want >= 400 && want <= 500) return hi.find(w => w <= 500) ?? lo[0] ?? hi[0];
  return want < 400 ? lo[0] ?? hi[0] : hi[0] ?? lo[0];
}
/* 导出字重下面的提示：缺了 400 / 700 时说明正文、粗体会怎样显示 */
function renderWHint() {
  const el = $('#exWHint'), ws = state.weights, miss = [400, 700].filter(w => !ws.includes(w)), out = [];
  if (miss.includes(400)) out.push(T('wMiss400', { w: matchWeight(ws, 400) }));
  if (miss.includes(700)) { const m = matchWeight(ws, 700); out.push(T(m < 600 ? 'wMiss700Faux' : 'wMiss700', { w: m })); }
  el.hidden = !miss.length;
  if (miss.length) el.innerHTML = esc(out.join('')) + ` <button type="button" class="tbtn" data-act="wadd">${esc(T('wAdd', { w: miss.join(T('joiner')) }))}</button>`;
}

/* ================= 度量 ================= */
let lastMeasure = null, lastRef = null;
function cssVar(n) { return getComputedStyle(root).getPropertyValue(n).trim(); }
/* 汉字字体自带西文的比例：用汉字字体单独排「国」「H」「x」 */
function measureRef() {
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
   西文、数字、假名可以在「显示」里分别隐藏；下面的读数只在对应项显示时出现 */
/* 度量参考图的显示项：菜单里的项目固定。参考线太多会看不清，所以假名默认只在日文、注音默认只在繁體中文（台灣）时勾选；手动勾过的以手动为准 */
const specShown = () => ({ latin: true, digit: true, kana: /^ja/.test(state.typo.lang || ''), bopo: state.typo.lang === 'zh-Hant-TW', ...(state.view.specShow || {}) });
function drawSpecimen() {
  const cv = $('#spec'), sh = specShown();
  const W = cv.clientWidth || 600;
  const ctx = cv.getContext('2d');
  const labelW = Math.min(150, W * 0.3), plotR = W - labelW;
  const fam = `${liveFamily ? `"${liveFamily}", ` : ''}serif`;
  const shiftOf = ch => settingOf(ownerOf(ch.codePointAt(0))).shift / 100;
  /* 画出来的字：汉字总在；假名 あ、注音 ㄅ、西文 Hxg（连在一起，按字体本身的字距）、数字 0 按显示设定 */
  const show = ['国', ...(sh.kana ? ['あ'] : []), ...(sh.bopo ? ['ㄅ'] : []), ...(sh.latin ? ['Hxg'] : []), ...(sh.digit ? ['0'] : [])];
  const GAP = 0.2;      // 各组之间的距离（字号的倍数）
  /* 字号先按宽度定（最大 140px），画布高度再跟着字号走：窄屏上不会留出大片空白 */
  let fs = 140;
  ctx.font = `${fs}px ${fam}`;
  const span = show.reduce((s, ch) => s + ctx.measureText(ch).width, 0) + fs * GAP * (show.length - 1);
  if (span > plotR - 24) fs = Math.floor(fs * (plotR - 24) / span);
  const nLines = 3 + (sh.latin ? 3 : 0) + (sh.digit ? 2 : 0) + (sh.kana ? 2 : 0) + (sh.bopo ? 2 : 0);
  const H = Math.round(Math.min(270, Math.max(140, fs * 1.75, nLines * 13 + 16)));
  const dpr = window.devicePixelRatio || 1;
  cv.style.height = H + 'px';
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const glyphFont = `${fs}px ${fam}`;
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
  const C = { ink: cssVar('--ink'), muted: cssVar('--muted'), han: cssVar('--muted'), lat: cssVar('--c-latin'), dig: cssVar('--c-digit'), kana: cssVar('--c-kana'), bopo: cssVar('--c-bopo'), band: cssVar('--faint') };

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
  lines.forEach((l, i) => { ly[i] = Math.max(l.y, i ? ly[i - 1] + 12 : 7); });
  const over = ly.length ? ly[ly.length - 1] - (H - 7) : 0;
  if (over > 0) for (let i = ly.length - 1; i >= 0; i--) ly[i] = Math.max(7 + i * 12, Math.min(ly[i] - over, i < ly.length - 1 ? ly[i + 1] - 12 : H - 7));
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
  const refEl = $('#mRef');
  refEl.textContent = !lastRef ? '' : T(lastRef.none ? 'refNone' : 'refFrom', { font: lastRef.font });
  /* 参考值直接写在读数下面：汉字字体自带西文的比例，和上面的读数对照 */
  const refOf = v => lastRef && !lastRef.none ? T('refShort', { v: (v * 100).toFixed(1) }) : '';
  $('#mCapRef').textContent = refOf(lastRef?.cap); $('#mXRef').textContent = refOf(lastRef?.x);

  const face = han.asc + han.desc, pct = v => `${(v * 100).toFixed(1)}<small>%</small>`;
  $('#mFigBox').hidden = !sh.digit; $('#mKanaBox').hidden = !sh.kana; $('#mBopoBox').hidden = !sh.bopo;
  $('#mMore').hidden = !sh.digit && !sh.kana && !sh.bopo;
  $('#mBopo').innerHTML = face >= 1 && bopo.asc >= 1 ? pct((bopo.asc + bopo.desc) / face) : '–';
  $('#mFig').innerHTML = face >= 1 && fig.asc >= 1 ? pct(fig.asc / face) : '–';
  $('#mKana').innerHTML = face >= 1 && kana.asc >= 1 ? pct((kana.asc + kana.desc) / face) : '–';
  if (face < 1 || cap.asc < 1) { lastMeasure = null; $('#mCap').textContent = $('#mX').textContent = $('#mMid').textContent = '–'; return; }
  const capRatio = cap.asc / face, xRatio = xg.asc / face;
  const midPx = ((capTop + latBase) / 2) - ((hanTop + hanBot) / 2);   // 正值 = 大写中线偏低
  lastMeasure = { capRatio, xRatio, midEm: midPx / fs };
  $('#mCap').innerHTML = pct(capRatio);
  $('#mX').innerHTML = pct(xRatio);
  const mid = midPx / fs * 100;
  /* 读数格较窄：偏高、偏低用箭头，完整说法放在悬停提示里 */
  const centered = Math.abs(mid) < 0.25;
  $('#mMid').innerHTML = centered ? '±0.0<small>% em</small>' : `${mid > 0 ? '↓' : '↑'}${Math.abs(mid).toFixed(1)}<small>% em</small>`;
  $('#mMid').title = centered ? T('centered') : `${mid > 0 ? T('low') : T('high')} ${Math.abs(mid).toFixed(1)}% em`;
}
