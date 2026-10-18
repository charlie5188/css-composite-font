import { fileAxes, fileStyle, files, setFontAxes, sfntTable } from './core.js';

// Binaries stay in this page session, outside configuration, share links and presets.
export const importedFonts = new Map();
let fileSequence = 0;
async function namesOf(buffer) {
  try {
    const table = await sfntTable(buffer, 0x6E616D65);
    if (!table) return {};
    const offset = table.getUint16(4), found = new Map();
    for (let i = 0; i < table.getUint16(2); i++) {
      const at = 6 + i * 12, platform = table.getUint16(at), lang = table.getUint16(at + 4), id = table.getUint16(at + 6);
      if (![1, 2, 16, 17].includes(id)) continue;
      const length = table.getUint16(at + 8), start = offset + table.getUint16(at + 10);
      if (start + length > table.byteLength) continue;
      const bytes = new Uint8Array(table.buffer, table.byteOffset + start, length);
      const name = new TextDecoder(platform === 0 || platform === 3 ? 'utf-16be' : 'macintosh').decode(bytes).replace(/\0/g, '').trim();
      const rank = (platform === 3 ? 2 : 0) + (lang === 0x409 ? 4 : 0);
      if (name && (!found.has(id) || found.get(id).rank < rank)) found.set(id, { name, rank });
    }
    return { family: found.get(16)?.name || found.get(1)?.name, style: found.get(17)?.name || found.get(2)?.name };
  } catch (error) { return {}; }
}
export async function importFontFile(file) {
  const buffer = await file.arrayBuffer();
  const fingerprint = globalThis.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(n => n.toString(16).padStart(2, '0')).join('') : null;
  const existing = fingerprint && [...importedFonts.values()].find(entry => entry.fingerprint === fingerprint);
  if (existing) return existing;
  // Validate before adding a choice so a corrupt file never replaces the active candidate or enters the reusable list.
  await new FontFace('__cf_import_check', buffer).load();
  const id = `f${Date.now().toString(36)}_${++fileSequence}`;
  const [axes, style, names] = await Promise.all([fileAxes(buffer), fileStyle(buffer), namesOf(buffer)]);
  const font = setFontAxes({ kind: 'file', fileId: id, fileName: file.name, ...(style ? { cls: style } : {}) }, axes, 400);
  const entry = { font, fingerprint, family: names.family || file.name.replace(/\.[^.]+$/, ''), style: names.style || '' };
  files.set(id, { name: file.name, buffer }); importedFonts.set(id, entry);
  return entry;
}
export function rememberImportedFont(font) {
  const entry = importedFonts.get(font.fileId);
  if (entry) entry.font = { ...font };
}
