/* ================= 改了设定以后：刷新界面并保存 =================
   改了 state 的地方都调用 refresh('editor', 'preview', …)，列出受影响的部分。
   各部分按固定顺序执行（先算范围，再刷新工具栏、表格、校样、度量图、预设卡片、字体、导出），最后保存。
   只是重绘、没有改设定时（比如字体加载完了）直接调用各自的函数，不经过这里 */
import { saveState, rebuild, refreshCustomRanges } from './core.js';
import { syncToolbar, renderEditor, renderPreview, drawSpecimen } from './render.js';
import { renderExport } from './export.js';
import { renderFontFields, renderFontTab } from './bake.js';
import { renderTypoRows, renderTypoStatus, renderPresetCards } from './ui.js';

const STEPS = [
  ['ranges', () => refreshCustomRanges()],      // 例外字符的范围（其他部分都要用）
  ['toolbar', () => syncToolbar()],
  ['typoRows', () => renderTypoRows()],
  ['typoStatus', () => renderTypoStatus()],
  ['editor', () => renderEditor()],
  ['preview', () => renderPreview()],
  ['specimen', () => drawSpecimen()],
  ['presets', () => renderPresetCards()],
  ['fonts', () => rebuild()],      // 重新建实时预览用的字体（防抖）
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
