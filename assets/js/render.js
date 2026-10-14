'use strict';
/* ================= 渲染：字符类别表（对应 InDesign 的复合字体对话框） ================= */
const GLYPH = { han: '永', latin: 'Ag', digit: '01', kana: 'あ', punct: '」、', symbol: '※', shared: '“…' };
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
  const s = !o.follow && own ? sources.get(fontKey(own)) : null;
  let html = `<span class="status ${o.follow ? 'none' : (s ? s.status : 'loading')}"${o.follow ? '' : ` data-key="${esc(fontKey(own))}"`}></span>` +
    `<select class="fsel${o.follow ? ' follow' : ''}" data-act="fsel" aria-label="${esc(T('fontAria', { c: keyName(key) }))}">` +
    opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('') + '</select>';
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
function errRow(key, o) {
  if (o.follow || !o.font) return '';
  const W = state.view.weight, f = ownFontAt(o, W !== BASE_W ? state.wOver[W]?.[key] : null, W, true);
  const s = sources.get(fontKey(f));
  return s?.status === 'error' ? `<span class="ct-err">${esc(srcError(s))}</span>` : '';
}
function renderEditor() {
  const W = state.view.weight, banner = $('#wBanner');
  banner.hidden = W === BASE_W;
  const wAdj = W !== BASE_W && (Object.keys(state.wOver[W] || {}).some(k => Object.keys(state.wOver[W][k]).length) || Object.keys(state.weightNames).some(k => k.endsWith('|' + W)));
  if (W !== BASE_W) banner.innerHTML = `<span>${esc(T('wBanner', { w: W }))}</span><span class="wb-act">${wAdj ? `<button type="button" class="tbtn" data-act="wclear">${esc(T('wClear'))}</button>` : ''}${state.weights.includes(BASE_W) ? `<button type="button" class="tbtn" data-act="wback">${esc(T('wBack'))}</button>` : ''}</span>`;
  const head = `<div class="ct-row ct-head" aria-hidden="true"><span class="ct-glyph"></span><span>${esc(T('colClass'))}</span><span>${esc(T('colFont'))}</span><span class="r">${esc(T('colSize'))}</span><span class="r">${esc(T('colShift'))}</span><span></span></div>`;
  $('#classRows').innerHTML = head + CLASSES.map(c => {
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
      ${numCell('size', c.id)}${numCell('shift', c.id)}<span></span>${errRow(c.id, o)}
    </div>`;
  }).join('');
  $('#customRows').innerHTML = state.custom.length ? state.custom.map((cu, i) => `<div class="ct-row" data-ci="${i}">
      <input class="chars" type="text" value="${esc(cu.chars)}" placeholder="${esc(T('customPh'))}" aria-label="${esc(T('custom'))}" spellcheck="false">
      <span class="ct-font">${fontCell('#' + i, cu, false, true)}</span>
      ${numCell('size', '#' + i)}${numCell('shift', '#' + i)}
      <button class="x" type="button" data-act="remove" aria-label="${esc(T('customRemove'))}">×</button>${errRow('#' + i, cu)}
    </div>`).join('')
    : '';
}
/* 齿轮弹出的分组开关：打开 = 留在本类别，关闭 = 改由半角西文显示 */
function renderGroups() {
  const pop = $('#grpPop'), id = pop.dataset.cls; if (!id || !GROUPS[id]) return;
  const name = tr(CLS[id].name);
  pop.innerHTML = `<div class="gp-head"><b>${esc(T('gpHead', { c: name }))}</b><span class="hint">${esc(T(id === 'shared' ? 'gpHintShared' : 'gpHintSymbol', { c: name }))}</span></div>` +
    GROUPS[id].map(g => `<div class="gp-row"><span class="gp-sample" aria-hidden="true">${esc(g.sample)}</span>
      <span class="gp-name">${esc(tr(g.name))}<small>${esc(fmtRanges(g.r))}</small></span>
      <button type="button" class="sw" role="switch" data-g="${id}.${g.id}" aria-checked="${!isMoved(id, g)}" aria-label="${esc(tr(g.name))}"></button></div>`).join('') +
    (GROUPS[id].some(g => isMoved(id, g)) ? `<div class="gp-foot"><button type="button" class="tbtn" data-act="gpreset">${esc(T('gpReset'))}</button></div>` : '');
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
  root.classList.toggle('show-colors', v.colorize);
  root.style.setProperty('--fs', v.size + 'px');
  root.style.setProperty('--lh', v.lh);
  for (const el of [pt, $('#naiveText')]) {
    for (const t of TYPO) {
      if (t.attr) el.lang = state.typo[t.key];
      else el.style.setProperty(t.prop, state.typo[t.key]);
    }
  }
  /* 类别着色优先用 CSS Highlight API：不拆 DOM，排版和不着色时完全一样（拆成 span 会让竖排里的西文和后面的字重叠）。
     只有基线偏移必须包 span；浏览器不支持 Highlight API 时才退回用 span 着色 */
  const hl = HL_OK && v.colorize, spanColor = v.colorize && !HL_OK;
  pt.classList.toggle('colorize', spanColor);
  if (!(spanColor || anyShift())) pt.textContent = v.text;
  else {
    const frag = document.createDocumentFragment();
    let cur = null, buf = '';
    const flush = () => {
      if (!buf) return;
      const sh = settingOf(cur).shift;
      if (!spanColor && !sh) frag.append(buf);
      else {
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
    pt.replaceChildren(frag);
  }
  paintClasses(pt, hl);
  $('#naiveText').textContent = v.text;
  $('#naiveWrap').hidden = !v.compare;
  $('#liveLabel').hidden = !v.compare;
  updateNaive();
  const legend = $('#legend');
  legend.hidden = !v.colorize;
  if (v.colorize) legend.innerHTML = CLASSES.filter(c => c.id !== 'han').map(c => `<span style="--c:var(--c-${c.id})"><i></i>${esc(tr(c.name))}</span>`).join('') +
    (state.custom.length ? `<span style="--c:var(--c-custom)"><i></i>${esc(T('legendCustom'))}</span>` : '') + `<span>${esc(T('legendBase'))}</span>`;
  root.style.setProperty('--generic', state.generic !== 'auto' ? state.generic : guessGeneric());
}
const HL_OK = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight === 'function';
const HL_KEYS = ['latin', 'digit', 'kana', 'punct', 'symbol', 'shared', 'custom'];
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
function renderSampleTabs() {
  const cur = state.view.sample;
  $('#sampleTabs').innerHTML = Object.entries(SAMPLES).map(([k, s]) => `<button type="button" role="tab" data-sample="${k}" aria-selected="${cur === k}">${esc(tr(s.label))}</button>`).join('') +
    (cur in SAMPLES ? '' : `<button type="button" role="tab" aria-selected="true" disabled>${esc(T('customSample'))}</button>`);
}
function renderLangOptions() {
  $('#exLang').innerHTML = `<option value="">${esc(T('anyLang'))}</option>` + TYPO.find(t => t.key === 'lang').values.map(([v, d]) => `<option value="${v}">${esc(tr(d))}</option>`).join('');
}
function syncToolbar() {
  const v = state.view;
  renderSampleTabs();
  $('#vSize').value = v.size; $('#vSizeOut').textContent = `${v.size}px · ${round(v.size * 0.75, 0.5)}pt · ${Math.round(v.size * 1.0583)}Q`;
  $('#vLh').value = v.lh; $('#vLhOut').textContent = (+v.lh).toFixed(2);
  $('#vVertical').setAttribute('aria-pressed', v.vertical);
  $('#vColor').setAttribute('aria-pressed', v.colorize);
  $('#vCompare').setAttribute('aria-pressed', v.compare);
  const nOn = [v.vertical, v.colorize, v.compare].filter(Boolean).length;
  $('#viewCount').textContent = nOn ? ` · ${nOn}` : '';
  $('#cmpMode').value = v.cmp;
  for (const t of TYPO) { const el = $('#ty-' + t.key); if (el) el.value = state.typo[t.key]; }
  renderTypoStatus();
  $('#sample').value = v.text;
  $('#mBasis').value = state.metric.basis;
  $('#mTarget').value = state.metric.target;
  $('#mTargetWrap').hidden = state.metric.basis === 'mix';
  $('#exName').value = state.name;
  $('#exWeights').innerHTML = WEIGHTS.map(w => `<button type="button" data-w="${w}" aria-pressed="${state.weights.includes(w)}">${w}</button>`).join('');
  $('#exBase').value = state.baseMode;
  $('#vWeight').innerHTML = state.weights.map(w => `<button type="button" role="radio" data-w="${w}" aria-checked="${w === state.view.weight}">${w}</button>`).join('');
  $('#vWeightLab').hidden = state.weights.length < 2;
  $('#exGeneric').value = state.generic;
  $('#exLang').value = state.scope;
}

/* ================= 度量 ================= */
let lastMeasure = null, lastRef = null;
function cssVar(n) { return getComputedStyle(root).getPropertyValue(n).trim(); }
/* 汉字字体自带西文的比例：用汉字字体单独排「国」「H」「x」 */
function measureRef() {
  const han = sources.get(fontKey(resolveCls('han', state.view.weight, true).font));
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
function drawSpecimen() {
  const cv = $('#spec');
  const W = cv.clientWidth || 600;
  const H = Math.round(Math.min(250, Math.max(180, W * 0.3)));
  const dpr = window.devicePixelRatio || 1;
  cv.style.height = H + 'px';
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const fs = Math.round(Math.min(H * 0.58, W / 5.2));
  const glyphFont = `${fs}px ${liveFamily ? `"${liveFamily}", ` : ''}serif`;
  ctx.font = glyphFont;
  ctx.textBaseline = 'alphabetic';
  const glyphs = ['国', 'H', 'x', 'g'].map(ch => {
    const t = ctx.measureText(ch);
    return { ch, asc: t.actualBoundingBoxAscent, desc: t.actualBoundingBoxDescent, w: t.width, shift: settingOf(ownerOf(ch.codePointAt(0))).shift / 100 * fs };
  });
  const [han, cap, xg] = glyphs;
  const baseY = Math.round(H * 0.7);
  const hanTop = baseY - han.asc - han.shift, hanBot = baseY + han.desc - han.shift;
  const latBase = baseY - cap.shift, capTop = latBase - cap.asc, xTop = baseY - xg.shift - xg.asc;
  const C = { ink: cssVar('--ink'), muted: cssVar('--muted'), han: cssVar('--muted'), lat: cssVar('--accent'), band: cssVar('--faint') };

  const labelW = Math.min(150, W * 0.3), plotR = W - labelW;
  ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = C.band; ctx.fillRect(0, hanTop, plotR, hanBot - hanTop); ctx.restore();
  const lines = [
    { y: hanTop, c: C.han, t: T('gFaceTop') }, { y: hanBot, c: C.han, t: T('gFaceBot') },
    { y: capTop, c: C.lat, t: T('gCap') }, { y: xTop, c: C.lat, t: T('gX'), dash: [4, 4] },
    { y: baseY, c: C.muted, t: T('gBase') },
  ];
  if (cap.shift) lines.push({ y: latBase, c: C.lat, t: T('gLatBase'), dash: [2, 3] });
  ctx.font = `11px ${cssVar('--ui') || 'sans-serif'}`;
  ctx.textBaseline = 'middle';
  const used = [];
  for (const l of lines.sort((a, b) => a.y - b.y)) {
    ctx.strokeStyle = l.c; ctx.lineWidth = 1; ctx.setLineDash(l.dash || []);
    ctx.beginPath(); ctx.moveTo(0, Math.round(l.y) + 0.5); ctx.lineTo(plotR, Math.round(l.y) + 0.5); ctx.stroke();
    let ly = l.y; while (used.some(u => Math.abs(u - ly) < 12)) ly += 12;
    used.push(ly);
    ctx.fillStyle = l.c; ctx.fillText(l.t, plotR + 8, ly);
  }
  ctx.setLineDash([]);
  ctx.font = glyphFont; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = C.ink;
  const total = glyphs.reduce((s, g) => s + g.w, 0) + fs * 0.18 * (glyphs.length - 1);
  let x = Math.max(12, (plotR - total) / 2);
  for (const g of glyphs) { ctx.fillText(g.ch, x, baseY - g.shift); x += g.w + fs * 0.18; }

  lastRef = measureRef();
  const refEl = $('#mRef');
  refEl.textContent = !lastRef ? '' : lastRef.none ? T('refNone', { font: lastRef.font })
    : T('refLine', { font: lastRef.font, cap: (lastRef.cap * 100).toFixed(1), x: (lastRef.x * 100).toFixed(1) });

  const face = han.asc + han.desc;
  if (face < 1 || cap.asc < 1) { lastMeasure = null; $('#mCap').textContent = $('#mX').textContent = $('#mMid').textContent = '–'; return; }
  const capRatio = cap.asc / face, xRatio = xg.asc / face;
  const midPx = ((capTop + latBase) / 2) - ((hanTop + hanBot) / 2);   // 正值 = 大写中线偏低
  lastMeasure = { capRatio, xRatio, midEm: midPx / fs };
  $('#mCap').innerHTML = `${(capRatio * 100).toFixed(1)}<small>%</small>`;
  $('#mX').innerHTML = `${(xRatio * 100).toFixed(1)}<small>%</small>`;
  const mid = midPx / fs * 100;
  $('#mMid').innerHTML = Math.abs(mid) < 0.25 ? `0.0<small>% em · ${esc(T('centered'))}</small>`
    : `${esc(mid > 0 ? T('low') : T('high'))} ${Math.abs(mid).toFixed(1)}<small>% em</small>`;
}
