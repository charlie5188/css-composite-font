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
