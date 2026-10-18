/* Shared UI mechanics have no configuration state; each screen owns what its controls change. */
export const searchKey = value => value.normalize('NFKC').toLowerCase().replace(/[\s_-]+/g, '');

export function placePopover(pop, trigger, { align = 'start', gap = 8, inset = 8, within = null, flip = true } = {}) {
  const r = trigger?.getBoundingClientRect(); if (!r) return;
  const bounds = within?.getBoundingClientRect(), left = bounds ? Math.max(8, bounds.left + inset) : inset;
  const right = bounds ? Math.min(innerWidth - 8, bounds.right - inset) : innerWidth - inset;
  const wanted = align === 'end' ? r.right - pop.offsetWidth : r.left;
  pop.style.left = Math.max(left, Math.min(wanted, right - pop.offsetWidth)) + 'px';
  const below = r.bottom + gap, above = r.top - pop.offsetHeight - gap;
  pop.style.top = Math.max(8, Math.min(flip && below + pop.offsetHeight > innerHeight - 8 ? above : below, innerHeight - pop.offsetHeight - 8)) + 'px';
}

/* Re-anchor when either surface changes size or its scrolling ancestor moves. Native popovers own dismissal and focus. */
export function bindPopover(pop, trigger, options = {}) {
  const position = () => {
    if (!pop.matches(':popover-open')) return;
    if (!trigger.getBoundingClientRect().width) { pop.hidePopover(); return; }
    placePopover(pop, trigger, options);
  };
  pop.addEventListener('toggle', e => {
    if (trigger.hasAttribute('aria-expanded')) trigger.setAttribute('aria-expanded', e.newState === 'open');
    if (e.newState === 'open') { pop.scrollTop = 0; position(); }
  });
  const sizes = new ResizeObserver(position); sizes.observe(pop); sizes.observe(trigger);
  window.addEventListener('resize', position);
  document.addEventListener('scroll', position, { passive: true, capture: true });
  return position;
}

/* Both proofs paint ranges without inserting spans into their text. Separate names prevent one surface from clearing another. */
export function paintMissingGlyphs(root, levelOf, prefix = 'cf') {
  if (!('highlights' in CSS) || typeof Highlight !== 'function') return;
  const sets = [null, new Highlight(), new Highlight()];
  sets[1].priority = sets[2].priority = 1;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    let offset = 0;
    for (const ch of node.data) {
      const level = levelOf(ch);
      if (sets[level]) { const range = new Range(); range.setStart(node, offset); range.setEnd(node, offset + ch.length); sets[level].add(range); }
      offset += ch.length;
    }
  }
  CSS.highlights.set(prefix + '-miss1', sets[1]); CSS.highlights.set(prefix + '-miss2', sets[2]);
}

/* The same weight field maps a continuous axis or discrete steps to the shared slider/ticks. Its owner supplies the state. */
export function syncWeightControl({ input, slider, ticks }, { continuous, domain, value, label = String, locale = '', preserveInput = false }) {
  input.min = domain[0]; input.max = domain.at(-1); input.step = continuous ? 1 : 'any';
  if (!preserveInput) input.value = value;
  const signature = locale + ':' + continuous + ':' + domain.join(',');
  if (slider.dataset.domain !== signature) {
    slider.dataset.domain = signature;
    slider.min = continuous ? domain[0] : 0; slider.max = continuous ? domain.at(-1) : Math.max(1, domain.length - 1);
    slider.step = 1; slider.disabled = domain.length === 1 || domain[0] === domain.at(-1);
    ticks.classList.toggle('steps', !continuous);
    const shortcuts = continuous ? [400, 700].filter(n => n >= domain[0] && n <= domain.at(-1)) : [];
    const stops = continuous ? [...new Set([...domain, ...shortcuts])].sort((a, b) => a - b) : domain;
    const percent = n => domain[0] === domain.at(-1) ? 0 : (n - domain[0]) * 100 / (domain.at(-1) - domain[0]);
    ticks.replaceChildren(...stops.map((n, i) => {
      const pos = continuous ? percent(n) : domain.length === 1 ? 0 : i * 100 / (domain.length - 1);
      const button = shortcuts.includes(n), el = document.createElement(button ? 'button' : 'span');
      el.style.setProperty('--tick', pos + '%'); el.dataset.weight = n;
      if (button) { el.type = 'button'; el.className = 'btn-text'; el.setAttribute('aria-label', label(n)); el.title = label(n); }
      else el.setAttribute('aria-hidden', 'true');
      el.textContent = button || !continuous || !shortcuts.some(s => Math.abs(percent(s) - pos) < 16) ? n : '';
      return el;
    }));
  }
  slider.value = continuous ? value : domain.indexOf(value); slider.setAttribute('aria-valuetext', value);
  ticks.querySelectorAll('[data-weight]').forEach(el => { const current = +el.dataset.weight === value; el.classList.toggle('cur', current); if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', current); });
}

export function bindWeightControl({ input, button, anchor, pop, slider, ticks, get, set, sync, within = null }) {
  let returningFocus = false;
  const position = bindPopover(pop, anchor, { align: 'end', gap: 6, within });
  const show = () => { sync({ preserveInput: true }); if (!pop.matches(':popover-open')) pop.showPopover(); position(); };
  pop.addEventListener('toggle', e => { for (const el of [input, button]) el.setAttribute('aria-expanded', e.newState === 'open'); position(); });
  input.addEventListener('focus', () => { if (!returningFocus) show(); }); input.addEventListener('click', show);
  slider.addEventListener('input', () => { const { continuous, domain } = get(); set(continuous ? +slider.value : domain[+slider.value]); });
  ticks.addEventListener('click', e => { const button = e.target.closest('button[data-weight]'); if (button) set(+button.dataset.weight); });
  pop.addEventListener('keydown', e => { if (e.key !== 'Escape') return; e.preventDefault(); returningFocus = true; pop.hidePopover(); input.focus({ preventScroll: true }); returningFocus = false; });
  input.addEventListener('input', () => { const value = parseFloat(input.value), { continuous, domain } = get(); if (continuous ? value >= domain[0] && value <= domain.at(-1) : domain.includes(value)) set(value, { preserveInput: true }); });
  const commit = () => { const value = parseFloat(input.value); if (Number.isFinite(value)) set(value); else sync(); };
  input.addEventListener('change', commit); input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { input.blur(); if (pop.matches(':popover-open')) pop.hidePopover(); return; }
    if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault(); const { continuous, domain, value } = get(), delta = e.key === 'ArrowUp' ? 1 : -1;
    set(continuous ? value + delta * (e.shiftKey ? 10 : 1) : domain[Math.max(0, Math.min(domain.length - 1, domain.indexOf(value) + delta))]);
  });
  return show;
}
