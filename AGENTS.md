# AGENTS.md

Instructions for coding agents (Claude Code, Codex, Cursor, Copilot, Gemini, …) and for humans new to the repo.
README.md describes the product; this file is about working on the code.

## What this is

Composite Font Studio (复合字体工坊 / 複合字型工坊 / 合成フォント工房) is a single-page tool that builds an InDesign-style composite font (different fonts and sizes for Han, kana,
punctuation, Latin, digits) and exports it as CSS (`@font-face` + `unicode-range` + `size-adjust`) or as real
font files (TTF / OTF / WOFF2, baked in the browser with fontTools on Pyodide).

- **No build step.** Plain HTML, CSS and ES modules served as static files. Do not add a bundler, framework,
  TypeScript or a package that the page loads at runtime without a strong reason.
- **Deploy = push to `main`.** GitHub Pages serves the repo root at https://charlie5188.github.io/css-composite-font/.
  There is no staging; CI runs on the same push.
- The UI is in four languages (简体中文 `zh`, 繁體中文 `tw`, 日本語 `ja`, English `en`; browsers in any other language get
  English). Write code comments and docstrings in English, including tests, tooling and CI configuration.
  Keep localized UI/output strings in their intended languages; literal examples may retain their original text.

## Setup (once)

```sh
npm run setup        # npm ci, Playwright's Chromium, and a .venv with fontTools 4.60.2 / uharfbuzz / pytest
```

Needs Node 20+ and Python 3.9+ (CI uses 3.12, the worker runs Pyodide's 3.12). Browser tests use Playwright's
bundled Chromium locally and in CI. Use `PW_CHANNEL=chrome npm test` for an additional installed-Chrome check;
it must not replace the default run, since newer Chrome can hide compatibility failures in CI's browser.

## Commands

| What | Command |
| --- | --- |
| Serve the page at http://127.0.0.1:8765/ | `python3 tools/serve.py` (run from anywhere; it serves the repo root) |
| **After editing anything in `assets/`** | `npm run rehash` (cache hashes + import map in `index.html`) |
| Fast checks (hashes up to date, i18n keys) | `npm run check` |
| Python tests (font baking) | `npm run test:py` |
| Browser tests | `npm test` (`npm run test:offline` skips the one that needs the network) |
| Everything, as CI does | `npm run verify` |
| Browser tests against the live site | `npm run test:live` (after a deploy) |
| Accept an intended change to exported CSS | `npx playwright test tests/e2e/css-output.spec.js --update-snapshots` |
| Bake fonts from the command line | `python3 tools/bake.py job.json src-dir out.zip` |
| Refresh the bundled Google Fonts metadata | `python3 tools/gfmeta.py` (then `npm run rehash`) |
| Refresh representative font coverage | `python3 tools/catalogmeta.py` (then `npm run rehash`) |

## Definition of done

1. `npm run rehash` if you touched `assets/` (forgetting it serves stale modules from cache; `npm run check` catches it).
2. `npm run verify` passes. For changes that can't affect font baking (styles, UI text, layout), `npm run check` and
   `npm run test:offline` are enough locally; CI skips the font-file test too unless baking-related files changed.
   Snapshot diffs in `tests/e2e/snapshots/` are real output changes: update them only
   when the change to the exported CSS/JS is intended, and say so in the commit message.
3. New interface text exists in all four `assets/js/i18n/*.js` files with the same `{placeholders}`; inline
   `{ zh, ja, tw, en }` objects in `core.js` / `unicode.js` keep all four on one line (`npm run check` checks both).
4. Whenever a feature is added or changed, update its explanation in 「原理与限制」 (the About dialog in
   `index.html`) as part of the same change, in all four `data-ui="zh|tw|ja|en"` blocks. Describe the current
   behaviour, supported cases, export effects and relevant limitations. Rewrite outdated explanations rather
   than appending conflicting notes, and do not describe proposed behaviour as already implemented.
   Also update the font-file notes (`fxLimits` in i18n) wherever they explain the affected behaviour.
   Update README.md only when its product-level highlights or important limitations change; follow the
   documentation scope below rather than appending implementation details.
5. Look at the page: `python3 tools/serve.py`, then check desktop width, 390 px width, and dark mode. New UI uses the
   design-system classes and tokens.
6. Commit message: imperative English summary line, body explaining why.

## Documentation scope

- README.md is a concise product introduction, not a changelog, interaction specification or user manual.
  Keep each language’s feature introduction to at most six highlights, with one or two short sentences per item.
  Describe what users can accomplish and why it is useful, rather than cataloguing every capability.
- Keep the English, Japanese, Simplified Chinese and Taiwan Traditional Chinese sections equivalent in
  scope. Retain a short set of important access, privacy, licensing and export limitations.
- Do not add control positions, spacing, colors, keyboard increments, loading behavior, internal metadata
  rules or exhaustive edge cases to README highlights. User-facing mechanisms and detailed limitations
  belong in the app’s localized About dialog; contributor invariants belong in AGENTS.md or focused code comments.
- Edit or replace an existing highlight when the product promise changes. Remove duplication and outdated
  text; do not append a sentence for every UI change or move accumulated detail into a new README section.
  Small refinements usually need no README change.

## Built-in presets

- When adding or modifying built-in presets, ask the user whether to run 「自动调整」 (Auto-adjust)
  on the affected presets and save the results back into their definitions. Ask once for the affected presets
  together. If the user has already explicitly requested or declined this in the current task, follow that
  choice without asking again.
- If approved, run the current auto-fit implementation using each preset's updated fonts and settings, then
  write the measured size, weight and baseline results for each supported independent class back into the built-in preset definitions.
  If declined, keep the intended manual settings; do not silently replace them with auto-fit results.

## Localization

- Traditional Chinese (`tw`) uses **Taiwan Traditional Chinese** wording, terminology and punctuation throughout
  the UI, including dialogs, tooltips and help text. Do not treat it as a character conversion from Simplified
  Chinese or mix in mainland or Hong Kong terminology. For example, use 字型, 字元, 匯出 and 程式碼.
- When terminology or typography conventions are uncertain, consult W3C's
  [中文排版需求 (clreq)](https://www.w3.org/TR/clreq/) and
  [日本語組版処理の要件 (jlreq)](https://www.w3.org/TR/jlreq/) before choosing the wording or describing the behaviour.
  For `tw`, follow clreq's Traditional Chinese text and Taiwan-specific conventions; use jlreq to clarify
  Japanese typography concepts without applying Japanese conventions to Taiwan Chinese by default.
- Keep the same concept named consistently across controls, help text and documentation. If the references do
  not cover a general UI term, use common Taiwan UI wording rather than a literal translation.

## Layout of the code

```
index.html               Markup for the whole app, the About text, the import map (generated)
assets/style.css         All styles; colour tokens on :root, dark mode under prefers-color-scheme and [data-theme]
assets/js/main.js        Entry: imports every module, then initState() and init()
assets/js/core.js        State (`state`, setState, initState, normalizeState + versioned migrations), presets,
                         font sources, TYPO (typography settings), live-preview font building
assets/js/refresh.js     refresh('editor', 'preview', …): re-render named parts in a fixed order, then save
assets/js/render.js      Class table, proof, specimen canvas, toolbar sync
assets/js/ui.js          Event wiring, preset cards, font picker, dialogs, typography rows, init()
assets/js/font-catalog-data.js Generated representative coverage for the complete bundled font library
assets/js/ui-controls.js Shared popover anchoring and font-name search normalization; no configuration state
assets/js/appearance.js  Browser-local theme and proof colors, separate from configuration state
assets/js/share.js       Configuration links, bounded codec, validation, clipboard and reversible import
assets/js/export.js      Exported CSS / baseline JS
assets/js/bake.js        Font-file export: plan, downloads, license checks, Pyodide worker, result UI
assets/js/appcode.js     App code export (experimental): one data model, Swift / Kotlin / Dart generators
assets/py/bake_core.py   Font baking (fontTools). Runs in the worker; also used by tests and tools/bake.py
assets/py/*.whl          fontTools wheel the worker installs (PyPI blocks cross-origin downloads)
assets/js/i18n.js        T(key, params), UI language; texts in assets/js/i18n/{zh,tw,ja,en}.js, one key per line
assets/js/unicode.js     Character classes and Unicode ranges
assets/js/gfmeta.js      Google Fonts metadata: complete Chinese/Japanese families, axes, italics, CJK font styles (generated by tools/gfmeta.py, do not hand-edit)
tools/                   rehash.py, serve.py, check-i18n.mjs, bake.py, gfmeta.py
tests/py/                pytest for bake_core.py, fixtures in tests/fixtures (small OFL fonts)
tests/e2e/               Playwright: CSS snapshots per preset, UI, layout, font-file export, App code (the generated
                         code is compiled and run when the toolchain is there; see below)
```

## How things fit together

- **State.** One object, `state` in `core.js`, saved to localStorage (`composite-font:state:v1`). When you change
  its shape, bump `state.v` in `stateFromPreset` and add a migration step in `normalizeState` (look at the
  existing `if (state.v === N)` blocks). `PRESET_SKIP` and `presetSnap()` decide what counts as "preset modified".
- **Changing a setting:** mutate `state`, then call `refresh(...)` with the parts that depend on it
  (see the list in `refresh.js`). Re-renders that are not caused by a setting change call the render function directly.
- **ES modules.** Module top level only declares things and binds events on static elements; anything that
  needs another module runs in `init()` or `initState()` (otherwise you hit temporal-dead-zone errors).
  Exported `let` bindings cannot be assigned from another module: export a setter (`setState`, `setExKind`, …).
- **Import map.** Modules import each other by plain path (`./core.js`); `index.html`'s import map, generated
  by `tools/rehash.py`, maps each to a `?v=<hash>` URL. Never edit the map or the `?v=` values by hand.
- **Typography settings** (`TYPO` in `core.js`): `grp: 'font'` rows live in the Fonts tab; `grp: 'view'`
  (alignment, `text-wrap`) are preview-only, live in the tester's View menu, and are never exported; the rest
  are in the Text layout tab and go into the exported CSS when they differ from the browser default.
  None of them affect font files.
- **Font files.** `bake.js` builds a plan (same rules as the CSS), downloads sources (google/fonts on GitHub
  raw, local fonts via the Local Font Access API, or uploaded files), and posts jobs to a worker that loads
  Pyodide 0.27.7 and runs `bake_core.run_all`. `bake_core` subsets each source to the characters it owns,
  scales/shifts, merges, copies line metrics from the Han base font, and trims the Han font if the 65,535-glyph
  limit is exceeded. The wheel in `assets/py` and `tests/requirements.txt` must stay on the same fontTools version.
- **Tooltips.** Give icon-only controls a `title` (or `data-tip`). `initTips()` in `ui.js` takes it over on first hover
  and shows the app's own tooltip after ~0.35 s; don't build per-control tooltips.
- **Undo / redo.** Every debounced `saveState()` records a snapshot of `state` without `view` and the preview-only
  typography keys. Anything that changes settings through `refresh()` / `changed()` is undoable for free; keep
  preview-only state in `state.view` so it stays out of the history.
- **UI shell.** The page never scrolls; `.bench` holds the editor (Presets / Fonts / Text layout tabs) and the
  tester, each scrolling on its own. Export and About are `<dialog class="side-dlg">`. Below 1000 px one pane
  is shown at a time (`.app[data-mview]`, bottom tabs).
- **Appearance.** Theme and proof colors use their own `composite-font:appearance:v1` preference. Keep them out
  of presets, undo, share links and exports. The small validated head script restores them before the first
  paint; `appearance.js` handles controls and system changes. Proof colors apply only to proof surfaces and
  specimen glyphs; editing controls keep theme tokens. Theme selection lives in top-bar Settings; proof color controls live
  in the proof toolbar’s View popover alongside the other preview controls.

## Design system

The UI is hand-written HTML and CSS on purpose; there is no component library. Everything shared lives in the
component block near the top of `assets/style.css`. **A new control starts from these classes. Don't add a new look
for a role that already has one; if something is really missing, add it to that block and to this list.**

- **Tokens** on `:root`: colours (`--ink`, `--ink-2`, `--muted`, `--faint`, `--line`, `--rule`, `--accent`, `--warn`,
  `--caution` …, redefined for dark mode), type scale `--fs-xs/s/m/l/xl/2xl` (11 / 12 / 13 / 14 / 18 / 22 px), spacing
  `--sp-1`…`--sp-6` (4–32 px), radii `--r-s` (2), `--r` (4), `--r-pill`, control heights `--ctl-h` (32)
  and `--ctl-h-sm` (26), `--shadow-pop`.
  UI text and radii use tokens, never raw px. Specimen text (proof, glyph samples, preset thumbnails, the title) is
  sized by its content and is the only exception.
- **Buttons, five kinds:** `.btn` (secondary), `.btn.primary`, `.btn-ghost` (toolbar: icon and/or label),
  `.btn-icon` (icon only; `.sm`, and `.mini` for small icons inside text), `.btn-text` (link style). Add `.danger` for
  destructive actions. Anything destructive that can't be undone goes through `armConfirm(btn, text, run)` in
  `ui.js` (second click within 3 s); keep the button's own label inside an element so it can be hidden.
  Regular `.btn`, `.btn-ghost` and `.btn-icon` controls share the 32 px height: text buttons are pills and icon-only
  buttons are circles. Use fill, outline or a subtle hover surface for emphasis, not a different geometry.
  `.btn-icon.sm` is the 26 px compact action for tables and lists; `.mini` fits inline icons. Table steppers keep
  their compact rectangular hit areas. Tabs, segmented choices and form fields retain their own control shapes.
- **Other components:** `.seg` (segmented choice), `.chips` (multi-select pills; `.chips.tags` for text labels such as filters), `.sw` (switch), `.cell-in` +
  `.cell-num` (inputs inside tables; `.own` = set in the base settings, `.set` = set for one weight; both use accent blue, while weight row labels stay neutral), `.cell-step`
  (table stepper: a numeric input or weight select plus `.cell-step-actions` / `.cell-step-btn`; keep its fixed
  arrow gutter aligned with the header, keyboard arrows operate the field; `.field-step` adds the standard border for form fields), `.range-pop` + `.range-ticks`
  (compact range popover with endpoints and optional `.btn-text` shortcuts in one row; omit endpoint labels
  when they would crowd a shortcut), `.pop` (popover
  surface) with `.menu` / `.mm-item` / `.mm-radio` / `.mm-check`, `.sec-head` + `.sec-title` + `.sec-acts` (section
  heading; `.subsection-title` for smaller headings within a dialog), `.callout` (yellow notice), `.dlg-form` + `.dlg-act` (small dialog: title, fields, buttons bottom right), `.badge` (count pill), `.info` (the (i) button that opens `#infoPop`), tooltips through `title`.
- **Shared interactions:** `ui-controls.js` owns `bindPopover` / `placePopover` for anchored popovers. Reuse them for viewport bounds, flipping, resize, scrolling and changing content; pass a dialog as `within` for modal controls. Use `searchKey` for font-name/alias search across sources (case, full-width forms, spaces, hyphens and underscores normalize together). Do not use name normalization for literal character searches.
  Preview weight controls share `bindWeightControl` / `syncWeightControl` (popup focus, keyboard, domain mapping, ticks and shortcuts), and missing-glyph ranges share `paintMissingGlyphs`; `showMissingGlyphTip` hit-tests those painted ranges and shares tooltip placement, including the picker textarea mirror. Keep picker tooltips inside the modal top layer and dismiss them on edits, scrolling or closure. Keep the picker B/number control beside size, without a second weight section; hide it when no adjustable weight domain exists. Read static imported weights from OS/2 for preview and Info without changing configuration mappings. Other numeric fields reuse `stepperCell`; keep picker preview, main proof and export settings in their own state. Share mechanics without coupling those outcomes. Background font-name and region callbacks call `renderEditor({ preserveActive: true })` so they never replace a focused table field between focus and input; explicit setting changes retain normal redraw behavior. Keep weight inputs wide enough for 1000. Hide the main proof weight control for a single selected export weight and dismiss its open popover; restore it for multiple steps or a continuous range without hiding size or line height.
- **Empty states:** `.empty-state` presents one decorative visual, a title and a brief prompt without disabled detail controls. Keep the font illustration aria-hidden and use existing text and color tokens.
- **File drops:** `.file-drop` extends the standard file button with a dashed drop target and `.dragging` feedback. Keep a keyboard-accessible file input and never replace a valid selection with a failed import.
- **Filter bars:** `.filter-bar` puts wrapping `.filter-trigger` multi-choice popovers and `.filter-toggle` checkboxes directly below search. Source/style/weight-type groups use checkboxes: OR within a type group, AND between groups, no checked values means unrestricted. Bold support is an independent AND condition inside Weight type, included in its label count and reset. Coverage filters require a numeric proportion of at least 90% for every selected pinned set. Keep exact binary counts separate from CSS-range browsing estimates; unknown is never a confirmed match. Unchecked fonts remain discoverable with coverage filters cleared; never present them as confirmed matches. Use bundled CSS-range coverage and completed local checks; never bulk-read fonts or remove rows as asynchronous checks finish. CJK browsing tags stay separate from composition and preset styles. Keep single selections or multi-selection counts visible, use the accent blue for active conditions, and show a clear action only when conditions are active. Clearing filters preserves the query. Keep sorting in a separate `.results-toolbar` immediately above the list, with the candidate count on the left and a `.btn-ghost` showing the sort label and current choice on the right. It uses a single-choice popover and may wrap on narrow screens; explicit changes keep the query, filters and candidate. Freeze the order during background work. Only offer name A-Z (the default) and widest-known-range sorting. Local list and preview must share named and parsed weight facts; update metadata labels in place without changing list order. Use shared Tabler computer/Google source icons with a visually hidden source label and the shared tooltip; keep weight facts visible at the top right of the font row, wrapping below the name in lists narrower than 420px. List one or two stepped weights explicitly with slash separators (400/700); use count/range for larger sets. Incomplete local facts say only which weights have been found, without an ambiguous unconfirmed-type label. Never invent a fixed count for a variable range. Use pinned GB 2312-80, Unicode v2.0 Big5 and JIS X 0208:1990 repertoires shared by filters and Info, never equating coverage with regional glyph forms.
- **Font library:** derive the Chinese/Japanese Google Fonts list from `GF_CJ`, generated from official language subsets, together with `GF_COMMON` for the existing Western/Korean choices; never replace it with a small manual shortlist. Refresh `gfmeta.js` and `font-catalog-data.js` from the same metadata snapshot before rehashing. Browsing must preserve official `GF_HANDWRITING` classifications independently of the coarse composition `GF_STYLE` map. Keep verified CJK refinements additive, document their sources, and retain the style menu’s note about name-based estimates; do not claim inferred labels are official tags. Keep the library/file tabs above the shared list-and-preview workspace. On desktop, fill the available height with small outer margins, use equal-width panes and separate them with a vertical divider at the workspace center (horizontal when stacked), with independent pane scrolling and actions fixed at the bottom of the right column. Keep the selected family, style and Preview/Info tabs in `.pk-detail-header`, outside the desktop `.pk-detail-scroll`. Only content below the tabs scrolls; on narrow screens keep the shared workspace scroll and make that header sticky within its detail section. Keep Preview/Info tabs inside that column: Preview owns a directly editable, auto-growing textarea and the shared `.nf` size control; reuse the proof toolbar’s scrub mechanic without coupling preview state. Remove specimen-source modes. Never rewrite textarea values during async loading, coverage checks or IME composition. Use an aria-hidden paint-only mirror with identical font, padding, wrapping and dimensions under the transparent native editor. Reuse `paintMissingGlyphs` and shared miss tokens with a separate `cf-picker` namespace; check only specimen text, clear marks when the font changes or the dialog closes, and keep failed checks in Info. Do not restore a main-proof missing-count callout. Preserve drafts across candidates/tabs and restore class text only when reopening; Info owns source, weight, primary-script and coverage details. Do not give the specimen a fixed height or its own scrollbar. Use max-content rows so long specimens cannot collapse the tabs. Changing tabs preserves drafts. Keep Cancel and the header close icon outside inert content during auto-fit; both discard the pending choice. Show every non-weight axis in the right footer above confirmation, without disclosures or collapsed summaries. Bound desktop axis scrolling so actions stay visible; on narrow screens the footer uses display: contents so axes join the single workspace scroller and only actions remain sticky. Keep footer axes inert during auto-fit while Cancel stays active. Use the configuration confirmation label whenever the selected font has variable axes, including weight-only fonts; recompute it after metadata and language changes. With no library candidate, hide the mounted detail controls behind one empty state without resetting the specimen draft. An empty file library instead hides the entire detail pane and spans the drop target across the workspace at every breakpoint. Put the status/privacy note inside the drop target. Importing restores the two-pane layout and a compact drop target; switching back to the library must restore its selected candidate and draft. Base selection chooses only a font, preserving existing tuned weights when reopened; tune weights in the Weights table. Show the font-weight field only when opened from an individual weight row. Never restore the composite-to-font weight arrow summary. Use explicit character-class terminology in interface prose (字符类别 / 字元類別 / 文字クラス / character class); keep technical CSS class names and font-style categories distinct. Below 860 px, stack both panes in one workspace scroller; retain the list’s capped height and keep footer actions sticky and visible, without a top border. Use compact filter labels and separate the results toolbar from the filters with `--sp-4`. Every picker entry uses the same contextual defaults: preselect built-in character-class coverage (Han from proof language; no inference for custom exceptions or unsupported Han languages), continuous weights only for base selection in continuous mode, and Has bold for individual rows at 700 or above. Leave source, style, italics and query unrestricted; preserve the current candidate. Latin, digit and shared-punctuation coverage reuse existing catalog samples. Recompute defaults only on opening, never after clearing, source switching or asynchronous metadata updates; they never affect configuration or exports. Google and installed families share search and source/style/weight/coverage filters plus the independent Has italics checkbox (explicit Italic faces or ital axes only, unknown data retained), but remain separate source-labelled choices. One search field also supplies exact names; only an explicit choice or an unambiguous Enter loads a candidate. Automatically attempt local enumeration from the opening user action, reuse its page-session result, and offer retry after failure. Never repeatedly prompt on every class or silently turn a failed read into an empty installed library. Do not bulk-read all font binaries to populate filters; preserve unknown metadata. Preview may fall back to authorized FontData when CSS local() fails; exported CSS still uses installed names. Keep specimen failures distinct from absence or coverage failures. Show known native names and label search aliases explicitly. Place multi-face selection below the selected family; hide it when faces differ only by weight. Preview weight switches real installed files within the same slant/width variant using named or parsed weights (Plain is a regular face); never mutate the selected base face or synthesize a weight. Keep italic pairing in the footer, explain its export purpose, and normally show it only for Western/digit/shared-punctuation/custom choices that need a companion; retain replacement for existing pairs. Validate pairing imports and guard late results against another candidate. Newly discovered fonts append during a browsing session, and selection must preserve list focus.
- **Proof editing:** Keep the real composite-font proof and picker specimen borderless, including hover and focus; keep the proof directly editable; do not add a second text field. The first actual change to a built-in sample forks one `view.customs` entry, selects and reveals its tab; subsequent input updates that same text. Preserve built-in samples and retain tab deletion, browser persistence and exclusion from presets, shares and exports. `proof-editor.js` preserves logical selection through styled baseline redraws, defers DOM rewrites during IME composition, accepts plain text only and owns text undo/redo separately from font-setting history. Keep composition, terminal newlines, selection, asynchronous redraws, empty text and vertical writing covered by browser tests.
- **Font information:** `font-metadata.js` reads names, Unicode cmap counts, spacing and variable flags from selected TTF/OTF/WOFF buffers. Cache only within the page; do not persist embedded metadata or bulk-read installed binaries. Read selected installed data on Info demand. Start Info with the font source. Show only available fields and hide their labels and empty groups when absent, including unsupported WOFF2 and Google CSS metadata; show one reading status while selected binary metadata loads. Never replace missing embedded names with aliases. Do not label glyph counts as character counts or aliases as embedded names. Render embedded strings as text and link only HTTP(S) license URLs. Keep names, properties, credits/license and representative coverage in consistent groups across sources. Group all provided embedded display names in one field, with each language after its name and no rows for absent languages; do not treat aliases as native names. Consolidate source limitations, style inference, coverage and license notes at the end of the Info list. Omit the picker punctuation-position label and the name explanation. Exact character-set coverage uses the same two-column definition-list layout with percentages, supported/total counts and expandable missing characters. Read selected cmap tables (including the correct TTC face), reject missing/out-of-range glyph IDs, and keep Google complete-file inspection distinct from CSS web subsets. Load Google full files only on Info demand through the shared export source lookup, with retry and late-result guards; do not add a runtime decoder. Keep bundled filter metadata generated from the same repertoires and metadata snapshot. Other metadata remains source-specific; italic configuration information lives in font properties. Keep format/privacy notes together inside `.file-drop-note`; the empty drop area uses `--sp-5` between that group and its file button.
- **Search fields:** `.search-field` pairs a search input with the shared ink-colored `.btn-icon.sm` clear button, hidden only when empty; suppress the native cancel icon to avoid duplicates. Clearing restores input focus and preserves filters and the selected font.
- **Font choices:** `.font-options` and `.font-option` keep names and real specimens in fixed-height rows. Use the shared `.lined` variant for borderless lists with row separators and a neutral selected-row rail; it is an intentional list separator pattern. Keep full lists aligned to the workspace bottom while short lists remain content-sized. List specimens follow the font’s primary script (`GF_PRIMARY_SCRIPT` from official metadata, then known family names), mixing kanji and kana for Japanese while keeping Chinese, Korean and Western samples distinct. Unknown scripts retain the class sample. The right-hand preview follows the edited class independently. Load visible specimens lazily; asynchronous checks must never reorder a list under the pointer. Unknown style and weight metadata stays eligible; character coverage filters require confirmed matches. Size the list from its rendered item count, capped at the shared maximum; background specimen loading must not change its height.
- **Color fields:** `.color-field` pairs a native color well with an editable hex value and a shared focus ring.
- **Settings popovers:** use `.pop.settings-pop` for mixed settings, and keep `.menu` for command menus.
  Put each logical group in `.settings-group`; use a native `<hr>` only between groups. The shell owns 8 px
  padding, rows own the shared 8 px horizontal inset, and groups own 4 px row gaps. A note immediately after an option group has a 16 px top gap; `.settings-item-label` pairs a decorative icon with its text. Separators have 8 px on
  each side. Do not add per-item margins or stack padded wrappers to compensate for alignment.
  Use `.settings-row` for a label and control, `.settings-fields` for aligned form columns,
  `.settings-label` / `.settings-note` for headings / help, and `.settings-actions` for trailing actions.
  Text aligns on the left, controls and selection marks on the right; rows use the standard control height.
  A width variant may set `--settings-width`; reuse all other spacing rules. When adding settings, review the
  whole popover in all four languages at desktop and 390 px, including wrapped notes, keyboard focus and scrolling.
- **Vertical ranges:** `.range-vertical` pairs `.range-rail`, `.range-fill` and two `.range-thumb` controls.
  Give each thumb a slider role, vertical orientation and current bounds. Keep the controls mounted during
  table refreshes; preview the selection while dragging, then commit on release as one undoable change.
  All sliders share `--slider-thumb-size`, `--slider-track-size` and `--slider-half`, neutral ink thumbs,
  muted rails and the same hover/focus rings. Horizontal rails and ticks end at the thumb centers.
- **Icons:** Tabler Icons (outline, MIT; license in `assets/LICENSE-tabler-icons.txt`) as an SVG sprite at the top of
  `index.html`. Use `<svg class="ic" aria-hidden="true"><use href="#i-name"/></svg>`; to add one, copy its paths from
  the Tabler outline set into a new `<symbol id="i-name" viewBox="0 0 24 24">`. Stroke width (1.75) and size come from
  `.ic`; don't draw icons by hand or use text characters (×, +, ↗) as icons. The tile pictograms (`tSvg`) are illustrations, not icons.
- **Conventions:** buttons show hover with a tinted background, fields with a border. A selected card has an ink
  border plus a 1 px inset (`.pcard`, `.ex-kinds`, `.typo-tiles`). Row separators use `--rule` inside tables only; elsewhere hierarchy comes from
  size, weight and spacing (`.sec-title` 18 px > item names 13 px bold > `.label` / grey notes), not divider lines. Base form-element styles are wrapped in `:where()` so a component class always wins.

## App code checks

`tests/e2e/app-code.spec.js` always checks that the generated range table matches the web export. When a toolchain
is installed it also compiles the generated code and splits a sample string with it; missing toolchains are skipped
(CI has none of them, so run this locally after changing `appcode.js`):

- **Swift:** `swiftc` (macOS, Xcode command line tools). Builds the AppKit branch.
- **Kotlin:** `brew install kotlin` plus the Android API as a jar: Robolectric's `android-all` from Maven Central,
  saved as `~/.cache/cf-android/android-all-14.jar` (or set `CF_ANDROID_JAR`). Compiled with `-Werror`.
- **Dart:** `brew install --cask flutter`. `flutter analyze` must report nothing, then `flutter test` builds a `TextSpan`.

## Gotchas that have bitten before

- Popovers outside an open modal `<dialog>` are inert: `#infoPop` is moved into the open dialog before it opens.
- `position: sticky` offsets start inside the scroll container's padding; a sticky bar inside a padded
  scroller lets content show above it. Put the padding on the bar instead.
- Selects draw their own chevron as a background image; a later `background:` shorthand removes it. Use
  `background-color`.
- Snapshot tests mask Google Fonts URLs; a diff elsewhere is a real change in output.
- The font-file test downloads Pyodide and fonts (~1 min). GitHub's API is rate-limited (60/hour/IP); file
  names are guessed and checked with HEAD requests first, the API is only a fallback.
- `python3 -m http.server` drops connections under parallel test load; use `tools/serve.py`.
- The page must work under GitHub Pages' path prefix (`/css-composite-font/`): use relative URLs.

## Don't

- Don't push to `main` with failing tests: it deploys immediately.
- Don't commit generated or local files (`node_modules/`, `.venv/`, `test-results/`, screenshots, `.DS_Store`).
- Don't add fonts to `tests/fixtures` that are not OFL/Apache, or large ones; subset them and include the license.
- Don't put personal data (emails, tokens) in code, commits or test fixtures.
- Don't style a one-off button, notice or popover; use or extend the design-system block (see Design system).
