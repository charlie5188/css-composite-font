'use strict';
/* ================= 交互：字符类别表 ================= */
function targetOf(row) { return row.dataset.id ? { type: 'class', id: row.dataset.id } : { type: 'custom', i: +row.dataset.ci }; }
const keyOf = t => t.type === 'class' ? t.id : '#' + t.i;
const objOf = t => t.type === 'class' ? state.classes[t.id] : state.custom[t.i];
const resolvedOf = t => t.type === 'class' ? resolveCls(t.id) : resolveCustom(state.custom[t.i]);
function changed({ fonts = false, editor = true } = {}) {
  refreshCustomRanges();
  if (editor) renderEditor(); else refreshInherited();
  renderPreview();
  if (fonts) rebuild(); else { drawSpecimen(); renderExport(); }
  markCustomPreset();
  saveState();
}
function markCustomPreset() {
  if (state.preset && !String(state.preset).startsWith('user:')) { state.preset = ''; renderPresetCards(); }
}
const LIMITS = { size: [20, 300], shift: [-60, 60] };
/* 写入一格：空 = 恢复继承；commit 为 false 时（还在输入）忽略超出范围的中间值 */
function setNum(inp, commit) {
  const t = targetOf(inp.closest('.ct-row')), key = keyOf(t), field = inp.dataset.field, W = state.view.weight;
  const raw = inp.value.trim();
  let v = raw === '' ? null : parseFloat(raw);
  if (v !== null && !Number.isFinite(v)) { if (commit) inp.value = (field === 'size' ? ownSize(key, W) : objOf(t).shift) ?? ''; return; }
  const [lo, hi] = LIMITS[field];
  if (v !== null && (v < lo || v > hi)) { if (!commit) return; v = Math.min(hi, Math.max(lo, v)); inp.value = v; }
  if (field === 'size') setSizeAt(key, W, v); else objOf(t).shift = v;
  inp.classList.toggle('own', v !== null);
  inp.classList.toggle('wov', v !== null && field === 'size' && W !== BASE_W);
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
  if (b.dataset.act === 'wback') { setPreviewWeight(BASE_W); return; }
  if (b.dataset.act === 'wclear') {      // 清除当前字重的单独调整（大小、粗细、本机字体名）
    const W = state.view.weight;
    delete state.wOver[W];
    for (const k of Object.keys(state.weightNames)) if (k.endsWith('|' + W)) delete state.weightNames[k];
    changed({ fonts: true }); saveState();
    return;
  }
  const row = b.closest('.ct-row'); if (!row) return;
  if (b.dataset.act === 'remove') { state.custom.splice(targetOf(row).i, 1); changed({ fonts: true }); }
});
$('#editor').addEventListener('change', e => {
  const el = e.target, row = el.closest('.ct-row'); if (!row) return;
  const t = targetOf(row), o = objOf(t), W = state.view.weight;
  if (el.classList.contains('num')) { setNum(el, true); return; }
  if (el.dataset.act === 'fsel') {
    if (el.value === 'pick') { el.value = o.follow || 'own'; openPicker(t); return; }
    o.follow = el.value === 'own' ? null : el.value;
    changed({ fonts: true });
  } else if (el.dataset.act === 'wnum') {      // 可变字体的任意粗细
    const raw = el.value.trim(), ov = W === BASE_W ? null : ((state.wOver[W] ||= {})[keyOf(t)] ||= {});
    const lo = +el.min, hi = +el.max, v = raw === '' ? null : Math.min(hi, Math.max(lo, Math.round(+raw)));
    if (W === BASE_W) { if (v != null) o.font = o.font.kind === 'google' ? G(o.font.family, v) : { ...o.font, weight: v }; }
    else if (ov.font) { if (v != null) ov.font = ov.font.kind === 'google' ? G(ov.font.family, v) : { ...ov.font, weight: v }; }
    else if (v == null) delete ov.weight; else ov.weight = v;
    changed({ fonts: true }); saveState();
  } else if (el.dataset.act === 'wsel') {
    const v = +el.value;
    if (W === BASE_W) o.font = G(o.font.family, v);
    else {
      const ov = ((state.wOver[W] ||= {})[keyOf(t)] ||= {});
      if (ov.font) ov.font = G(ov.font.family, v);          // 单独换过字体时，改的是那个字体的粗细
      else if (v) ov.weight = v; else delete ov.weight;
    }
    changed({ fonts: true }); saveState();
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
/* (i) 说明：所有说明文字共用一个弹层，打开时按 data-info 填入内容 */
const INFO = {
  presetInfo: () => esc(T('presetInfo')),
  classInfo: () => `<p>${esc(T('inheritHint'))}</p><dl>${CLASSES.map(c => `<dt>${esc(tr(c.name))}</dt><dd>${esc(tr(c.desc))}</dd>`).join('')}</dl>`,
  customInfo: () => T('customIntro'),
  cmpInfo: () => esc(state.view.cmp === 'fsa' ? T('hintFsa', { r: lastFsaR ?? '…' }) : T('hintPlain')),
  metricsInfo: () => `<p>${esc(T('metricsHint'))}</p><p>${esc(T('mixInfo'))}</p><p>${T('refNote')}</p>`,
  typoInfo: () => T('typoFoot'),
};
function infoHtml(key) {
  if (key.startsWith('typo:')) { const t = TYPO.find(x => x.key === key.slice(5)); return t?.note ? esc(tr(t.note)) : ''; }
  return INFO[key] ? INFO[key]() : '';
}
function placePop(pop, btn) {
  const r = btn?.getBoundingClientRect(); if (!r) return;
  pop.style.left = Math.max(8, Math.min(r.left - 12, innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = (r.bottom + 8 + pop.offsetHeight > innerHeight ? Math.max(8, r.top - pop.offsetHeight - 8) : r.bottom + 8) + 'px';
}
let infoBtn = null;
document.addEventListener('click', e => {
  const b = e.target.closest('.info'); if (!b) return;
  infoBtn = b; $('#infoPop').dataset.key = b.dataset.info;
}, true);
$('#infoPop').addEventListener('toggle', e => {
  if (e.newState !== 'open') return;
  const pop = $('#infoPop');
  pop.innerHTML = infoHtml(pop.dataset.key || '');
  placePop(pop, infoBtn);
});
let gearBtn = null;
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
function setPreviewWeight(W) {
  if (W === state.view.weight) return;
  state.view.weight = W;
  syncToolbar(); renderEditor(); rebuild(); saveState();
}

/* ================= 交互：校样、度量、导出 ================= */
const SUPPORT = { sizeAdjust: typeof FontFace !== 'undefined' && 'sizeAdjust' in FontFace.prototype };
function initToolbar() {
  $('#gfWeight').innerHTML = WEIGHTS.map(w => `<option value="${w}">${w}</option>`).join('');
  $('#gfList').innerHTML = GF_LIST.map(f => `<option value="${esc(f)}"></option>`).join('');
  $('#lfList').innerHTML = LOCAL_COMMON.map(([n, , os]) => `<option value="${esc(n)}">${os}</option>`).join('');
  $('#sizeAdjustWarn').hidden = SUPPORT.sizeAdjust;

  const v = () => state.view;
  $('#sampleTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-sample]'); if (!b) return;
    const k = b.dataset.sample;
    v().sample = k; v().text = SAMPLES[k].text; state.typo.lang = SAMPLES[k].lang;
    syncToolbar(); renderPreview(); renderExport(); rebuild(); saveState();
  });
  $('#vSize').addEventListener('input', e => { v().size = +e.target.value; syncToolbar(); renderPreview(); saveState(); });
  $('#vLh').addEventListener('input', e => { v().lh = +e.target.value; syncToolbar(); renderPreview(); saveState(); });
  $('#viewPop').addEventListener('toggle', e => {      // 菜单贴在按钮下方、右对齐
    if (e.newState !== 'open') return;
    const r = $('#viewBtn').getBoundingClientRect(), pop = e.currentTarget;
    pop.style.left = Math.max(8, r.right - pop.offsetWidth) + 'px';
    pop.style.top = (r.bottom + 6 + pop.offsetHeight > innerHeight ? Math.max(8, r.top - pop.offsetHeight - 6) : r.bottom + 6) + 'px';
  });
  for (const [id, key] of [['vVertical', 'vertical'], ['vColor', 'colorize'], ['vCompare', 'compare'], ['vItalic', 'italic']])
    $('#' + id).addEventListener('click', () => { v()[key] = !v()[key]; syncToolbar(); renderPreview(); renderExport(); saveState(); });
  $('#cmpMode').addEventListener('change', e => { v().cmp = e.target.value; updateNaive(); saveState(); });
  $('#vWeight').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) setPreviewWeight(+b.dataset.w); });
  /* 连续模式：滑块直接改校样的粗细（所有分段的规则都已建好）；表格编辑最接近的那一档 */
  $('#vWcont').addEventListener('input', e => {
    const w = +e.target.value, step = Math.min(900, Math.max(100, Math.round(w / 100) * 100));
    v().wcont = w; $('#vWcontOut').textContent = w;
    root.style.setProperty('--fw', w);
    if (step !== v().weight) { v().weight = step; renderEditor(); updateNaive(); drawSpecimen(); }
    saveState();
  });
  $('#editTextBtn').addEventListener('click', () => {
    const box = $('#sampleBox'), open = box.hidden;
    box.hidden = !open;
    $('#editTextBtn').setAttribute('aria-expanded', open);
    if (open) $('#sample').focus();
  });
  const reloadForText = debounce(() => rebuild(), 600);
  $('#sample').addEventListener('input', e => {
    v().text = e.target.value;
    v().sample = Object.keys(SAMPLES).find(k => SAMPLES[k].text === v().text) || 'custom';
    renderSampleTabs(); renderPreview(); saveState(); reloadForText();
  });
  $('#typoRows').addEventListener('change', e => {
    const t = TYPO.find(x => 'ty-' + x.key === e.target.id); if (!t) return;
    state.typo[t.key] = e.target.value;
    renderTypoStatus(); renderPreview(); renderExport(); saveState();
  });

  $('#mBasis').addEventListener('change', e => {
    const b = e.target.value; state.metric.basis = b;
    if (b !== 'mix') state.metric.target = lastRef && !lastRef.none ? round((b === 'cap' ? lastRef.cap : lastRef.x) * 100) : (b === 'cap' ? 83 : 58);
    syncToolbar(); saveState();
  });
  $('#mTarget').addEventListener('input', e => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) { state.metric.target = n; saveState(); } });
  $('#mApply').addEventListener('click', () => {
    if (!lastMeasure) return toast(T('tNotReady'));
    let k;
    if (state.metric.basis === 'mix') {
      if (!lastRef || lastRef.none) return toast(T('tNoRef'));
      const sCap = lastRef.cap / lastMeasure.capRatio, sX = lastRef.x / lastMeasure.xRatio;
      k = Math.min(Math.sqrt(sCap * sX), 1.03 * sCap);
    } else {
      k = (state.metric.target / 100) / (state.metric.basis === 'cap' ? lastMeasure.capRatio : lastMeasure.xRatio);
    }
    const W = state.view.weight, next = Math.min(200, Math.max(50, round(resolveCls('latin', W, true).size * k)));
    setSizeAt('latin', W, next);
    changed({ fonts: true });
    toast(T('tSize', { v: next }));
  });
  $('#mCenter').addEventListener('click', () => {
    if (!lastMeasure) return toast(T('tNotReady'));
    const lat = state.classes.latin;
    lat.shift = Math.min(30, Math.max(-30, round(resolveCls('latin').shift + lastMeasure.midEm * 100)));
    changed({});
    toast(T('tShift', { v: (lat.shift > 0 ? '+' : '') + lat.shift }));
  });

  $('#exName').addEventListener('input', e => { state.name = e.target.value; renderExport(); saveState(); });
  $('#exWeights').addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    const w = +b.dataset.w, set = new Set(state.weights);
    if (set.has(w)) { if (set.size === 1) return; set.delete(w); } else set.add(w);
    state.weights = [...set].sort((a, c) => a - c);
    const prevW = state.view.weight;
    if (!state.weights.includes(prevW)) state.view.weight = state.weights.includes(BASE_W) ? BASE_W : state.weights[0];
    syncToolbar(); renderExport(); saveState();
    if (state.view.weight !== prevW) { renderEditor(); rebuild(); }
  });
  /* 字重模式：分档 / 连续（可变字体）。切换不会删掉任何设定 */
  $('#vWMode').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === state.wmode) return;
    state.wmode = b.dataset.m;
    if (state.wmode === 'cont') { state.weights = [...WEIGHTS]; v().wcont = Math.min(state.wrange[1], Math.max(state.wrange[0], v().weight)); }
    syncToolbar(); renderEditor(); rebuild(); renderExport(); saveState();
  });
  /* 连续模式的导出范围：校样的滑块也只走这个范围 */
  const setWRange = (lo, hi) => {
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return renderExport();
    if (lo > hi) [lo, hi] = [hi, lo];
    lo = Math.min(899, Math.max(100, Math.round(lo))); hi = Math.min(900, Math.max(lo + 1, Math.round(hi)));
    state.wrange = [lo, hi];
    $('#exWLo').value = lo; $('#exWHi').value = hi;
    v().wcont = Math.min(hi, Math.max(lo, v().wcont));
    v().weight = Math.min(900, Math.max(100, Math.round(v().wcont / 100) * 100));
    syncToolbar(); renderEditor(); rebuild(); renderExport(); saveState();
  };
  $('#exWPresets').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) setWRange(...b.dataset.r.split(',').map(Number)); });
  for (const id of ['exWLo', 'exWHi']) $('#' + id).addEventListener('change', () => setWRange(parseFloat($('#exWLo').value), parseFloat($('#exWHi').value)));
  $('#exBase').addEventListener('change', e => { state.baseMode = e.target.value; renderExport(); saveState(); });
  /* 斜体：导出时另写一组 font-style: italic 的规则；校样的「斜体」开关用来看效果 */
  $('#exItalic').addEventListener('change', e => { state.italic = e.target.value === '1'; renderEditor(); rebuild(); renderExport(); saveState(); });
  $('#exGeneric').addEventListener('change', e => { state.generic = e.target.value; renderPreview(); renderExport(); saveState(); });
  /* 选了语言时校样也按这个语言排（字形地区差异、禁则），不限语言时校样沿用示例文字的语言 */
  $('#exLang').addEventListener('change', e => {
    state.scope = e.target.value;
    if (state.scope) state.typo.lang = state.scope;
    renderPreview(); renderExport(); saveState();
  });
  const tabs = { tabCss: 'css', tabJs: 'js', tabNotes: 'notes' };
  for (const [id, key] of Object.entries(tabs)) $('#' + id).addEventListener('click', () => {
    exTab = key;
    for (const other of Object.keys(tabs)) $('#' + other).setAttribute('aria-selected', other === id);
    $('#paneCode').hidden = key === 'notes'; $('#paneNotes').hidden = key !== 'notes';
    $('#copyBtn').hidden = key === 'notes';
    $('#dlBtn').hidden = key === 'notes' || !canDownload;
    if (key !== 'notes') renderExport();
  });
  /* 独立网页里可以直接下载；在 artifact 等嵌入框架里浏览器会拦截下载，所以只显示「复制」 */
  const canDownload = window.top === window.self;
  $('#dlBtn').hidden = !canDownload;
  $('#dlBtn').addEventListener('click', () => {
    if (!lastExport) return;
    const js = exTab === 'js';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lastExport], { type: js ? 'text/javascript' : 'text/css' }));
    a.download = (cssFamilyName().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'composite-font') + (js ? '-baseline.js' : '.css');
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
function renderTypoRows() {
  $('#browserName').textContent = ENGINE.name ? T('browserNow', { b: `${ENGINE.name} ${ENGINE.v}` }) : '';
  $('#typoRows').innerHTML = TYPO.filter(t => !t.attr).map(t => {
    const opts = t.values.map(([v, d]) => `<option value="${esc(v)}">${esc(v)}${d ? ' · ' + esc(tr(d)) : ''}${typoSupported(t, v) ? '' : esc(T('unsupported'))}</option>`).join('');
    const sup = t.sup ? ['chrome', 'firefox', 'safari'].map(b =>
      `<span class="${b === ENGINE.id ? 'cur' : ''}">${{ chrome: 'Chrome', firefox: 'Firefox', safari: 'Safari' }[b]} ${esc(t.sup[b])}</span>`).join('') : `<span>${esc(T('allBrowsers'))}</span>`;
    return `<div class="typo-row">
      <span class="typo-name"><label for="ty-${t.key}"><b>${esc(tr(t.label))}</b></label><span class="lab-i"><code>${t.attr ? esc(T('langAttr')) : t.prop}</code>${t.note ? `<button type="button" class="info" data-info="typo:${t.key}" popovertarget="infoPop" aria-label="${esc(T('infoAria'))}">i</button>` : ''}</span></span>
      <select id="ty-${t.key}">${opts}</select>
      <div class="typo-sup" data-key="${t.key}">${sup}</div>
    </div>`;
  }).join('');
  for (const t of TYPO) { const el = $('#ty-' + t.key); if (el) el.value = state.typo[t.key]; }
  renderTypoStatus();
}
function renderTypoStatus() {
  const n = TYPO.filter(t => !t.attr && state.typo[t.key] !== typoDef(t)).length;
  $('#typoChanged').textContent = n ? T('typoChanged', { n }) : '';
  $('#typoReset').hidden = !n;
  for (const t of TYPO) {
    const cur = document.querySelector(`.typo-sup[data-key="${t.key}"] .cur`);
    if (!cur) continue;
    const ok = typoSupported(t, state.typo[t.key]);
    cur.classList.toggle('ok', ok); cur.classList.toggle('no', !ok);
    cur.title = ok ? T('supOk') : T('supNo');
  }
}

/* ================= 预设卡片：每张卡片用它自己的字体排「永」「あ／字」「Ag」 ================= */
function presetFonts(cls) {
  const han = cls.han.font, lat = cls.latin.follow ? han : cls.latin.font;
  const kana = cls.kana.follow === 'latin' ? lat : cls.kana.follow ? han : cls.kana.font;
  return { han, lat, kana, size: cls.latin.size ?? 100 };
}
function famOf(f) {
  if (!f) return 'var(--ui)';
  const s = source(f);
  return s.status === 'ok' ? `'${s.family}', var(--ui)` : 'var(--ui)';
}
function presetCard({ id, name, tag, cls, ja, user, active }) {
  const { han, lat, kana, size } = presetFonts(cls);
  const miss = [han, lat].some(f => f?.kind === 'local' && sources.get(fontKey(f))?.status === 'error');
  return `<div class="pcard-wrap"><button type="button" class="pcard" data-preset="${esc(id)}" aria-pressed="${active}">
      <span class="pspec" aria-hidden="true"><span style="font-family:${famOf(han)}">永</span><span style="font-family:${famOf(ja ? kana : han)}">${ja ? 'あ' : '字'}</span><span style="font-family:${famOf(lat)};font-size:${size}%">Ag</span></span>
      <span class="ptag">${esc(tag)}</span>
      <span class="pname">${esc(name)}</span>
      ${miss ? `<span class="pmiss">${esc(T('presetMissing'))}</span>` : ''}
    </button>${user ? `<button type="button" class="pdel" data-del="${esc(id.slice(5))}" aria-label="${esc(T('presetDelete'))} ${esc(name)}">×</button>` : ''}</div>`;
}
function renderPresetCards() {
  const cards = PRESETS.map(p => presetCard({ id: p.id, name: tr(p.name), tag: tr(p.tag), cls: freshClasses(p), ja: p.sample !== 'zh', active: state.preset === p.id }));
  for (const [n, snap] of Object.entries(userPresets)) if (snap?.classes?.han)
    cards.push(presetCard({ id: 'user:' + n, name: n, tag: T('presetMine'), cls: snap.classes, ja: /^ja/.test(snap.typo?.lang || ''), user: true, active: state.preset === 'user:' + n }));
  $('#presetCards').innerHTML = cards.join('');
}
const renderPresetCardsSoon = debounce(renderPresetCards, 120);
const hasFileFont = () => [...CLASSES.map(c => state.classes[c.id].font), ...state.custom.map(c => c.font)].some(f => f && f.kind === 'file');
function applyPreset(id) {
  if (id.startsWith('user:')) {
    const saved = userPresets[id.slice(5)]; if (!saved) return;
    state = { ...JSON.parse(JSON.stringify(saved)), view: state.view, preset: id };
  } else {
    const p = PRESETS.find(x => x.id === id); if (!p) return;
    const keepText = !(state.view.sample in SAMPLES);
    state = stateFromPreset(p, state);
    state.preset = id;
    if (!keepText) { state.view.sample = p.sample; state.view.text = SAMPLES[p.sample].text; state.typo.lang = SAMPLES[p.sample].lang; state.view.vertical = !!p.vertical; }
  }
  normalizeState();
  refreshCustomRanges(); syncToolbar(); renderEditor(); renderPreview(); renderPresetCards(); rebuild(); saveState();
}
function initPresets() {
  let armed = null;
  $('#presetCards').addEventListener('click', e => {
    const del = e.target.closest('.pdel');
    if (del) {
      const n = del.dataset.del;
      if (armed !== n) {
        armed = n; del.classList.add('armed'); del.textContent = T('presetDeleteConfirm');
        setTimeout(() => { if (armed === n) { armed = null; renderPresetCards(); } }, 3000);
        return;
      }
      armed = null;
      delete userPresets[n]; lsSet(LS_PRESETS, userPresets);
      if (state.preset === 'user:' + n) state.preset = '';
      renderPresetCards(); saveState(); toast(T('tDeleted'));
      return;
    }
    const c = e.target.closest('[data-preset]');
    if (c) applyPreset(c.dataset.preset);
  });
  const openSave = () => { $('#saveRow').hidden = false; $('#savePresetBtn').hidden = true; $('#presetName').value = state.name === 'My Composite' ? '' : state.name; $('#presetName').focus(); };
  const closeSave = () => { $('#saveRow').hidden = true; $('#savePresetBtn').hidden = false; };
  const doSave = () => {
    const n = $('#presetName').value.trim(); if (!n) return $('#presetName').focus();
    const snap = JSON.parse(JSON.stringify(state)); delete snap.view;
    userPresets[n] = snap; lsSet(LS_PRESETS, userPresets);
    state.preset = 'user:' + n; renderPresetCards(); closeSave(); saveState();
    toast(T('tSaved', { n }) + (hasFileFont() ? T('tSavedFile') : ''));
  };
  $('#savePresetBtn').addEventListener('click', openSave);
  $('#presetCancel').addEventListener('click', closeSave);
  $('#presetSave').addEventListener('click', doSave);
  $('#presetName').addEventListener('keydown', e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') closeSave(); });
}
/* ================= 字体选择对话框 ================= */
let pickTarget = null, pickCand = null, pickTab = 'google';
let pickW = null;   // 400 以外的字重、且这一行有自己的字体时：只为这个字重指定用哪个粗细 / 字体名 / 文件
const picker = $('#picker');
function setPickTab(tab) {
  pickTab = tab;
  picker.querySelectorAll('[data-src]').forEach(b => b.setAttribute('aria-selected', b.dataset.src === tab));
  picker.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== tab; });
  updateCand();
}
function candFromFields() {
  const base = pickW ? objOf(pickTarget).font : null;
  if (pickTab === 'google') {
    const fam = $('#gfFamily').value.trim(), w = gfWeightVal();
    return fam ? G(fam, w || (base?.kind === 'google' && base.family === fam ? fontAtWeight(base, pickW).weight : 400)) : null;
  }
  if (pickTab === 'local') {
    const n = $('#lfName').value.trim() || (base ? $('#lfName').placeholder : ''); if (!n) return null;
    const ps = localAlt.get(n), f = L(n, ps && ps !== n ? [ps] : []), fa = localAxesOf(n);
    if (fa) { setFontAxes(f, fa, pickW || 400); if (f.axis) $('#lfVar').checked = true; }      // 列出过本机字体时，直接读字体里的轴
    else if ($('#lfVar').checked) { f.axis = [100, 900]; f.weight = pickW || 400; }      // 自己声明的可变字体，范围交给字体本身去夹
    return f;
  }
  if (pickCand?.kind === 'file' && pickCand !== base) return pickCand;
  if (pickW && base.kind === 'file') return base;      // 字体文件：没上传新文件时，校样仍用原来的文件，这里只定导出时的文件名
  return null;
}
/* 本机字体的轴：「列出本机字体」授权后，能读到字体文件本身 */
const localData = new Map(), localAxes = new Map();      // 字体全名 → FontData；→ 读到的轴（undefined = 读取中）
function localAxesOf(name) {
  if (localAxes.has(name)) return localAxes.get(name);
  const fd = localData.get(name);
  if (!fd) return null;
  localAxes.set(name, undefined);
  fd.blob().then(b => b.arrayBuffer()).then(fileAxes).then(fa => { localAxes.set(name, fa); if (pickTab === 'local' && $('#lfName').value.trim() === name) updateCand(); }, () => localAxes.set(name, null));
  return undefined;
}
/* ================= 可变轴（粗细、斜体以外）：对这个类别的所有字重生效 ================= */
let pickVary = {};
const axStep = (lo, hi) => hi - lo <= 2 ? 0.01 : hi - lo <= 30 ? 0.1 : 1;
function renderAxes() {
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
      return `<div class="ax-row">${name}${ctl(typeof v === 'number' ? v : def)}<button type="button" class="tbtn" data-axreset="${t}"${typeof v === 'number' ? '' : ' disabled'}>${esc(T('axReset'))}</button></div>`;
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
function updateAxSum() {
  const el = $('#pkAxes .ax-sum'), f = pickCand; if (!el || !f) return;
  const n = extraAxes(f).length, list = Object.entries(pickVary).filter(([t]) => axisOf(f, t)).map(([t, v]) => `${axisLabel(t)} ${v === 'auto' ? T('axOpszAuto') : v}`);
  el.textContent = list.length ? list.join(' · ') : n ? T('axNone', { n }) : '';
}
/* 对话框里的预览：Google Fonts 加载的是保留了所有轴的文件，这里用 font-variation-settings 直接显示调过的值 */
function applySampleAxes() {
  const f = pickCand, parts = [];
  for (const [t, , , def] of f ? extraAxes(f) : []) {
    const v = pickVary[t];
    if (typeof v === 'number') parts.push(`"${t}" ${v}`);
    else if (t === 'opsz' && f.kind === 'google' && v !== 'auto') parts.push(`"opsz" ${def}`);
  }
  $('#pkSample').style.fontVariationSettings = parts.join(', ');
}
const previewFont = f => f?.kind === 'google' && extraAxes(f).length ? { ...f, xa: extraAxes(f).map(a => a[0]).sort() } : f;
const cleanVary = f => { const o = Object.fromEntries(Object.entries(pickVary).filter(([t]) => axisOf(f, t))); return Object.keys(o).length ? o : undefined; };
/* 导出斜体时：这个字体斜体用什么 */
function renderItal() {
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
const COV_SETS = [
  ['covLatin', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'],
  ['covDigit', '0123456789'],
  ['covKana', 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンー'],
  ['covSC', '这们说时对过学发会经实现进动应头书长马门问间东车见风让认识语读谁调谈网样个钱'],
  ['covTC', '這們說時對過學發會經實現進動應頭書長馬門問間東車見風讓認識語讀誰調談網樣個錢'],
  ['covJP', '円気駅図県様広応戦鉄売読楽薬弁両帰稲鉱塩'],
  ['covKR', '가나다라마바사아자차카타파하한글'],
  ['covSym', '①②③※→℃○■△◎★〒'],
];
/* 缺哪些字。Google Fonts 直接看各分片的 unicode-range。本机字体和字体文件：后面接一个「空白字体」
   （616 字节，所有字符都映射到宽度为 0 的空字形），这个字体没有的字会落到空白字体上，宽度量出来就是 0 */
const BLANK_FONT = 'data:font/ttf;base64,AAEAAAAKAIAAAwAgT1MvMlQEUR0AAACsAAAAYGNtYXAAIrhhAAABDAAAADRnbHlmAAAAAAAAAUAAAAAMaGVhZF8eQOUAAAFMAAAANmhoZWEDIf87AAABhAAAACRobXR4AAAAAAAAAagAAAAIbG9jYQAGAAYAAAGwAAAABm1heHAAAwACAAABuAAAACBuYW1lBcMVaQAAAdgAAABucG9zdP+fADIAAAJIAAAAIAAEAAABkAAFAAAAAAAAAAAAAAAAAAAAAAAAADIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABOT05FAEAAIP//AyD/OAAAAyAAyAAAAAEAAAAAAAAAAAAAACAAAAAAAAEAAwAKAAAADAANAAAAAAAoAAAAAAAAAAIAAAAgAADX/wAAAAEAAOAAABD//wAAAAEAAAAAAAAAAAAAAAAAAQAAAAEAAC3z3ftfDzz1AAsD6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAgAAAAAAAAABAAADIP84AAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAABgAGAAAAAQAAAAIAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAQANgADAAEECQABAA4AAAADAAEECQACAA4ADgADAAEECQAEAA4AHAADAAEECQAGAA4AKgBDAEYAQgBsAGEAbgBrAFIAZQBnAHUAbABhAHIAQwBGAEIAbABhAG4AawBDAEYAQgBsAGEAbgBrAAAAAwAAAAAAAP+cADIAAAAAAAAAAAAAAAAAAAAAAAAAAA==';
let blankReady = null;
function loadBlank() {
  blankReady ||= new FontFace('__cf_blank', `url(${BLANK_FONT})`).load().then(f => { document.fonts.add(f); return true; }, () => false);
  return blankReady;
}
async function missingIn(s, chars) {
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
let covTok = 0;
async function renderCoverage(s, f) {
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
function resetCoverage() {
  covTok++;
  $('#pkCov').innerHTML = '';
  const sample = $('#pkSample');
  if (sample.dataset.text) sample.textContent = sample.dataset.text;
}
function updateCand() {
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
      ok.disabled = false;
    } else {
      st.textContent = srcError(s) + (f.kind === 'local' ? T('pkLocalStill') : '');
      st.classList.add('caution');
      ok.disabled = f.kind !== 'local';
    }
  });
}
const updateCandSoon = debounce(updateCand, 700);
/* 本机字体名去掉粗细部分（W3、Bold 等），用来判断是不是同一个字体 */
const localStem = n => n.replace(/\bW\d$/, '').replace(WORD_RE, '').trim().toLowerCase();
/* 选的是不是这一行原来那个字体（同一字体的其他粗细 / 名称 / 文件） */
const sameFontAs = (c, base) => !!c && !!base && c.kind === base.kind && (c.kind === 'google' ? c.family === base.family : c.kind === 'local' ? localStem(c.name) === localStem(base.name) : c === base);
function updateScope() {
  const show = !!pickW && !!pickCand && !sameFontAs(pickCand, objOf(pickTarget).font);
  $('#pkScope').hidden = !show;
}
/* Google Fonts 的字重：可变字体换成能填任意值的数字框（范围是它的 wght 轴），其他字体用 100–900 的菜单 */
/* 可变字体的标签：「VF 400–800」，悬停看说明 */
function showVfTag(axis) {
  const tag = $('#pkVfTag');
  tag.hidden = !axis;
  if (axis) { tag.textContent = `VF ${axis[0]}–${axis[1]}`; tag.title = T('pkVf', { a: axis[0], b: axis[1] }); }
}
function syncGfWeight() {
  const fam = $('#gfFamily').value.trim(), sel = $('#gfWeight'), num = $('#gfWeightNum');
  const axis = fam && fam in vfCache ? vfCache[fam] || null : null;
  if (fam && !(fam in vfCache)) vfAxis(fam).then(() => { if ($('#gfFamily').value.trim() === fam) syncGfWeight(); });
  if (axis && num.hidden) num.value = +sel.value ? sel.value : num.value;                       // 切到数字框时带上当前值
  if (!axis && sel.hidden) { const v = +num.value; sel.value = v ? Math.min(900, Math.max(100, Math.round(v / 100) * 100)) : (sel.querySelector('option[value="0"]') ? 0 : 400); }
  num.hidden = !axis; sel.hidden = !!axis;
  if (axis) { num.min = axis[0]; num.max = axis[1]; num.title = T('vfTitle', { a: axis[0], b: axis[1] }); }
}
function gfWeightVal() {
  const num = $('#gfWeightNum');
  if (num.hidden) return +$('#gfWeight').value;
  if (num.value.trim() === '') return 0;          // 空着 = 自动（按字重设定时）或 400
  return Math.min(+num.max || 900, Math.max(+num.min || 100, Math.round(+num.value)));
}
function openPicker(t) {
  pickTarget = t;
  const o = objOf(t), W = state.view.weight, key = keyOf(t);
  pickVary = { ...(o.vary || {}) };
  $('#pkAxes').open = Object.keys(pickVary).length > 0;      // 调过轴时展开，否则收起
  pickW = W !== BASE_W && !o.follow && o.font ? W : null;
  const name = t.type === 'class' ? tr(CLS[t.id].name) : T('customName', { c: state.custom[t.i].chars || '…' });
  $('#pkFor').textContent = '· ' + name + (pickW ? ' · ' + T('pkForW', { w: W }) : '');
  picker.querySelectorAll('[data-src]').forEach(b => { b.hidden = false; });
  const cur = resolvedOf(t).font, k = pickW ? fontKey(o.font) + '|' + W : '';
  const ovf = pickW ? state.wOver[W]?.[key]?.font : null;      // 这个字重已经单独换过的字体
  $('#pkScopeW').textContent = T('pkScopeW', { w: W });
  picker.querySelector(`[name="pkScope"][value="${ovf ? 'w' : 'all'}"]`).checked = true;
  /* Google Fonts：平时选具体粗细；按字重指定时第一项是「自动」，字体名固定 */
  let wOpts = WEIGHTS.map(w => `<option value="${w}">${w}</option>`).join('');
  if (pickW && o.font.kind === 'google') {
    const autoF = fontAtWeight(o.font, W), auto = sources.get(fontKey(autoF))?.actualWeight || autoF.weight;
    wOpts = `<option value="0">${esc(T('wAuto', { w: auto }))}</option>` + wOpts;
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
function initPicker() {
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
      changed({ fonts: true }); renderExport(); saveState();
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
      changed({ fonts: true }); renderExport(); saveState();
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
function applyUI() {
  root.lang = UI === 'ja' ? 'ja' : 'zh-Hans';
  document.querySelectorAll('[data-t]').forEach(el => { el.textContent = T(el.dataset.t); });
  document.querySelectorAll('[data-th]').forEach(el => { el.innerHTML = T(el.dataset.th); });
  document.querySelectorAll('[data-ta]').forEach(el => el.dataset.ta.split(';').forEach(p => { const [a, k] = p.split(':'); el.setAttribute(a, T(k)); }));
  document.querySelectorAll('[data-ui]').forEach(el => { el.hidden = el.dataset.ui !== UI; });
  document.querySelectorAll('#uiSeg [data-ui-lang]').forEach(b => b.setAttribute('aria-checked', b.dataset.uiLang === UI));
  renderLangOptions(); renderPresetCards(); renderTypoRows(); renderEditor();
  syncToolbar(); renderPreview(); drawSpecimen(); renderExport();
}
$('#uiSeg').addEventListener('click', e => {
  const b = e.target.closest('[data-ui-lang]'); if (!b || b.dataset.uiLang === UI) return;
  UI = b.dataset.uiLang; lsSet(LS_UI, UI); applyUI();
});

/* ================= 其他 ================= */
let toastT;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600); }

/* 重置：点一次变成确认，3 秒内再点才执行。「我的预设」不受影响 */
function resetAll() {
  state = stateFromPreset(PRESETS.find(p => p.id === (UI === 'ja' ? 'mincho-jp' : 'serif-sc')));
  normalizeState();
  refreshCustomRanges(); syncToolbar(); renderTypoRows(); renderEditor(); renderPreview(); renderPresetCards(); rebuild(); saveState();
  toast(T('tReset'));
}
function initReset() {
  $('#typoReset').addEventListener('click', e => {
    e.preventDefault();      // 按钮在 summary 里，别让它顺便折叠面板
    for (const t of TYPO) if (!t.attr) state.typo[t.key] = typoDef(t);
    renderTypoRows(); renderPreview(); renderExport(); saveState();
  });
  let armedT = null;
  $('#resetAll').addEventListener('click', e => {
    const b = e.currentTarget;
    if (!b.classList.contains('armed')) {
      b.classList.add('armed'); b.textContent = T('resetConfirm');
      armedT = setTimeout(() => { b.classList.remove('armed'); b.textContent = T('resetAll'); }, 3000);
      return;
    }
    clearTimeout(armedT); b.classList.remove('armed'); b.textContent = T('resetAll');
    resetAll();
  });
}
function init() {
  refreshCustomRanges();
  initToolbar(); initPresets(); initPicker(); initReset();
  applyUI();
  rebuildNow();
  new ResizeObserver(debounce(drawSpecimen, 100)).observe($('#spec'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawSpecimen());
  new MutationObserver(() => drawSpecimen()).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
}
init();
