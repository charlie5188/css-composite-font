import { readFontMetadata } from './font-metadata.js';
import { fileAxes, fileStyle, fileWeight, files, setFontAxes } from './core.js';

// Binaries stay in this page session, outside configuration, share links and presets.
export const importedFonts = new Map();
let fileSequence = 0;
export async function importFontFile(file) {
  const buffer = await file.arrayBuffer();
  const fingerprint = globalThis.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(n => n.toString(16).padStart(2, '0')).join('') : null;
  const existing = fingerprint && [...importedFonts.values()].find(entry => entry.fingerprint === fingerprint);
  if (existing) return existing;
  // Validate before adding a choice so a corrupt file never replaces the active candidate or enters the reusable list.
  await new FontFace('__cf_import_check', buffer).load();
  const id = `f${Date.now().toString(36)}_${++fileSequence}`;
  const [axes, style, weight, metadata] = await Promise.all([fileAxes(buffer), fileStyle(buffer), fileWeight(buffer), readFontMetadata(buffer)]);
  const names = metadata.names || {};
  const font = setFontAxes({ kind: 'file', fileId: id, fileName: file.name, ...(style ? { cls: style } : {}) }, axes, 400);
  // The declared static weight is a preview fact, not a change to the composite’s weight mapping.
  const entry = { font, fingerprint, weight, family: names.family || file.name.replace(/\.[^.]+$/, ''), style: names.style || '' };
  files.set(id, { name: file.name, buffer }); importedFonts.set(id, entry);
  return entry;
}
export function rememberImportedFont(font) {
  const entry = importedFonts.get(font.fileId);
  if (entry) entry.font = { ...font };
}
