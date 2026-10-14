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
  } else if (el.dataset.act === 'wsel') {
    const v = +el.value;
    if (W === BASE_W) o.font = G(o.font.family, v);
    else { const ov = ((state.wOver[W] ||= {})[keyOf(t)] ||= {}); if (v) ov.weight = v; else delete ov.weight; }
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
  for (const [id, key] of [['vVertical', 'vertical'], ['vColor', 'colorize'], ['vCompare', 'compare']])
    $('#' + id).addEventListener('click', () => { v()[key] = !v()[key]; syncToolbar(); renderPreview(); renderExport(); saveState(); });
  $('#cmpMode').addEventListener('change', e => { v().cmp = e.target.value; updateNaive(); saveState(); });
  $('#vWeight').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (b) setPreviewWeight(+b.dataset.w); });
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
  $('#exBase').addEventListener('change', e => { state.baseMode = e.target.value; renderExport(); saveState(); });
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
    const fam = $('#gfFamily').value.trim(), w = +$('#gfWeight').value;
    return fam ? G(fam, w || (base ? fontAtWeight(base, pickW).weight : 400)) : null;
  }
  if (pickTab === 'local') { const n = $('#lfName').value.trim() || (base ? $('#lfName').placeholder : ''); if (!n) return null; const ps = localAlt.get(n); return L(n, ps && ps !== n ? [ps] : []); }
  if (pickW) return base;      // 字体文件：校样仍用上传的文件，这里只定导出时的文件名
  return pickCand && pickCand.kind === 'file' ? pickCand : null;
}
function updateCand() {
  const f = candFromFields();
  pickCand = f;
  const ok = $('#pkOk'), st = $('#pkStatus'), sample = $('#pkSample');
  if (!f) { ok.disabled = true; st.textContent = ''; sample.style.fontFamily = 'var(--ui)'; return; }
  const s = source(f, { retry: true });
  ok.disabled = true; st.textContent = T('pkChecking'); sample.style.fontFamily = 'var(--ui)';
  s.promise.then(() => {
    if (pickCand !== f) return;
    if (s.status === 'ok') {
      sample.style.fontFamily = `"${s.family}", var(--ui)`;
      st.textContent = f.kind === 'google' ? T('pkGoogleOk', { n: s.faces.length }) : f.kind === 'local' ? T('pkLocalOk') : T('pkFileOk');
      ok.disabled = false;
    } else {
      st.textContent = srcError(s) + (f.kind === 'local' ? T('pkLocalStill') : '');
      ok.disabled = f.kind !== 'local';
    }
  });
}
const updateCandSoon = debounce(updateCand, 700);
function openPicker(t) {
  pickTarget = t;
  const o = objOf(t), W = state.view.weight, key = keyOf(t);
  pickW = W !== BASE_W && !o.follow && o.font ? W : null;
  const name = t.type === 'class' ? tr(CLS[t.id].name) : T('customName', { c: state.custom[t.i].chars || '…' });
  $('#pkFor').textContent = '· ' + name + (pickW ? ' · ' + T('pkForW', { w: W }) : '');
  $('#pkWNote').hidden = !pickW;
  if (pickW) $('#pkWNote').textContent = T('pkWNote', { w: W });
  picker.querySelectorAll('[data-src]').forEach(b => { b.hidden = !!pickW && b.dataset.src !== o.font.kind; });
  const cur = resolvedOf(t).font, k = pickW ? fontKey(o.font) + '|' + W : '';
  /* Google Fonts：平时选具体粗细；按字重指定时第一项是「自动」，字体名固定 */
  let wOpts = WEIGHTS.map(w => `<option value="${w}">${w}</option>`).join('');
  if (pickW && o.font.kind === 'google') {
    const autoF = fontAtWeight(o.font, W), auto = sources.get(fontKey(autoF))?.actualWeight || autoF.weight;
    wOpts = `<option value="0">${esc(T('wAuto', { w: auto }))}</option>` + wOpts;
  }
  $('#gfWeight').innerHTML = wOpts;
  $('#gfFamily').readOnly = !!pickW;
  $('#gfFamily').value = pickW ? (o.font.kind === 'google' ? o.font.family : '') : cur?.kind === 'google' ? cur.family : '';
  $('#gfWeight').value = pickW ? (state.wOver[W]?.[key]?.weight || 0) : cur?.kind === 'google' ? cur.weight : 400;
  const autoName = pickW && o.font.kind === 'local' ? autoLocal(o.font, W).name : '';
  $('#lfName').placeholder = pickW ? autoName : T('lfPh');
  $('#lfName').value = pickW ? (state.weightNames[k] || autoName) : cur?.kind === 'local' ? cur.name : '';
  $('#ffFileField').hidden = !!pickW;
  $('#ffPathField').hidden = !pickW;
  if (pickW && o.font.kind === 'file') { const g = guessPath(o.font.fileName, W); $('#ffPath').placeholder = g; $('#ffPath').value = state.weightNames[k] || g; }
  $('#ffFile').value = '';
  $('#lfMsg').textContent = T('lfMsg');
  pickCand = cur?.kind === 'file' ? cur : null;
  $('#pkSample').textContent = `${t.type === 'class' ? CLS[t.id].sample : (state.custom[t.i].chars || '')} · 永国字體 あア Hamburg 0123`;
  picker.showModal();
  setPickTab(pickW ? o.font.kind : cur?.kind || 'google');
}
function initPicker() {
  picker.querySelectorAll('[data-src]').forEach(b => b.addEventListener('click', () => setPickTab(b.dataset.src)));
  $('#gfFamily').addEventListener('input', updateCandSoon);
  $('#gfFamily').addEventListener('change', updateCand);
  $('#gfWeight').addEventListener('change', updateCand);
  $('#lfName').addEventListener('input', updateCandSoon);
  $('#lfName').addEventListener('change', updateCand);
  $('#ffFile').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const id = 'f' + Date.now().toString(36);
    files.set(id, { name: file.name, buffer: await file.arrayBuffer() });
    pickCand = { kind: 'file', fileId: id, fileName: file.name };
    updateCand();
  });
  $('#lfQuery').addEventListener('click', async () => {
    const msg = $('#lfMsg');
    if (!('queryLocalFonts' in window)) { msg.textContent = T('lfNoApi'); return; }
    try {
      msg.textContent = T('lfWait');
      const list = await window.queryLocalFonts();
      const seen = new Set(), opts = [];
      for (const f of list) { if (seen.has(f.fullName)) continue; seen.add(f.fullName); localAlt.set(f.fullName, f.postscriptName); opts.push(`<option value="${esc(f.fullName)}">${esc(f.family)} · ${esc(f.style)}</option>`); }
      $('#lfList').innerHTML = opts.join('');
      msg.textContent = T('lfCount', { n: opts.length });
      $('#lfName').focus();
    } catch (e) {
      msg.textContent = e && e.name === 'SecurityError' ? T('lfSec') : T('lfDenied');
    }
  });
  $('#pkCancel').addEventListener('click', () => picker.close());
  $('#pkOk').addEventListener('click', () => {
    if (!pickCand || !pickTarget) return;
    const o = objOf(pickTarget);
    if (pickW) {          // 只记下这个字重用的粗细 / 字体名 / 文件，和自动推算相同时清掉
      const key = keyOf(pickTarget), k = fontKey(o.font) + '|' + pickW;
      if (o.font.kind === 'google') {
        const v = +$('#gfWeight').value, ov = ((state.wOver[pickW] ||= {})[key] ||= {});
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
    o.font = pickCand;
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
