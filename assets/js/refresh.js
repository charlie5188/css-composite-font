/* ================= Refresh and save settings changes =================
   State changes call refresh('editor', 'preview', ...) with the affected parts.
   Parts run in a fixed order: ranges, toolbar, editor, proof, metrics, presets, fonts and export, then save.
   Pure redraws, such as after font loading, call render functions directly instead. */
import { saveState, rebuild, refreshCustomRanges } from './core.js';
import { syncToolbar, renderEditor, renderPreview, drawSpecimen } from './render.js';
import { renderExport } from './export.js';
import { renderFontFields, renderFontTab } from './bake.js';
import { renderTypoRows, renderTypoStatus, renderPresetCards } from './ui.js';

const STEPS = [
  ['ranges', () => refreshCustomRanges()],      // Custom character ranges, used by the other parts.
  ['toolbar', () => syncToolbar()],
  ['typoRows', () => renderTypoRows()],
  ['typoStatus', () => renderTypoStatus()],
  ['editor', () => renderEditor()],
  ['preview', () => renderPreview()],
  ['specimen', () => drawSpecimen()],
  ['presets', () => renderPresetCards()],
  ['fonts', () => rebuild()],      // Rebuild live preview fonts with debouncing.
  ['export', () => renderExport()],
  ['fxFields', () => renderFontFields()],
  ['fx', () => renderFontTab()],
];
const NAMES = new Set(STEPS.map(([n]) => n));

export function refresh(...parts) {
  for (const p of parts) if (!NAMES.has(p)) throw new Error('refresh：不认识的部分 ' + p);
  for (const [name, run] of STEPS) if (parts.includes(name)) run();
  saveState();
}
