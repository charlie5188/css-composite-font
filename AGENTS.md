# AGENTS.md

Instructions for coding agents (Claude Code, Codex, Cursor, Copilot, Gemini, …) and for humans new to the repo.
README.md describes the product; this file is about working on the code.

## What this is

A single-page tool that builds an InDesign-style composite font (different fonts and sizes for Han, kana,
punctuation, Latin, digits) and exports it as CSS (`@font-face` + `unicode-range` + `size-adjust`) or as real
font files (TTF / OTF / WOFF2, baked in the browser with fontTools on Pyodide).

- **No build step.** Plain HTML, CSS and ES modules served as static files. Do not add a bundler, framework,
  TypeScript or a package that the page loads at runtime without a strong reason.
- **Deploy = push to `main`.** GitHub Pages serves the repo root at https://charlie5188.github.io/css-composite-font/.
  There is no staging; CI runs on the same push.
- The UI is in three languages (简体中文 `zh`, 繁體中文 `tw`, 日本語 `ja`). Code comments are in Chinese; keep that style.

## Setup (once)

```sh
npm run setup        # npm ci, Playwright's Chromium, and a .venv with fontTools 4.60.2 / uharfbuzz / pytest
```

Needs Node 20+ and Python 3.9+ (CI uses 3.12, the worker runs Pyodide's 3.12). Locally the browser tests use an installed Google Chrome when there is one,
otherwise Playwright's Chromium.

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

## Definition of done

1. `npm run rehash` if you touched `assets/` (forgetting it serves stale modules from cache; `npm run check` catches it).
2. `npm run verify` passes. Snapshot diffs in `tests/e2e/snapshots/` are real output changes: update them only
   when the change to the exported CSS/JS is intended, and say so in the commit message.
3. New interface text exists in all three `assets/js/i18n/*.js` files with the same `{placeholders}`.
4. Behaviour users can see is reflected where it is explained: the About dialog (`index.html`, three language
   blocks `data-ui="zh|tw|ja"`), the font-file notes (`fxLimits` in i18n) and README.md (English, 日本語, 中文 sections).
5. Look at the page: `python3 tools/serve.py`, then check desktop width, 390 px width, and dark mode.
6. Commit message: imperative English summary line, body explaining why.

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
assets/js/export.js      Exported CSS / baseline JS
assets/js/bake.js        Font-file export: plan, downloads, license checks, Pyodide worker, result UI
assets/py/bake_core.py   Font baking (fontTools). Runs in the worker; also used by tests and tools/bake.py
assets/py/*.whl          fontTools wheel the worker installs (PyPI blocks cross-origin downloads)
assets/js/i18n.js        T(key, params), UI language; texts in assets/js/i18n/{zh,tw,ja}.js, one key per line
assets/js/unicode.js     Character classes and Unicode ranges
assets/js/gfmeta.js      Google Fonts axes / italics metadata (generated data, do not hand-edit)
tools/                   rehash.py, serve.py, check-i18n.mjs, bake.py
tests/py/                pytest for bake_core.py, fixtures in tests/fixtures (small OFL fonts)
tests/e2e/               Playwright: CSS snapshots per preset, UI, layout, font-file export
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
  are in the Typography tab and go into the exported CSS when they differ from the browser default.
  None of them affect font files.
- **Font files.** `bake.js` builds a plan (same rules as the CSS), downloads sources (google/fonts on GitHub
  raw, local fonts via the Local Font Access API, or uploaded files), and posts jobs to a worker that loads
  Pyodide 0.27.7 and runs `bake_core.run_all`. `bake_core` subsets each source to the characters it owns,
  scales/shifts, merges, copies line metrics from the Han base font, and trims the Han font if the 65,535-glyph
  limit is exceeded. The wheel in `assets/py` and `tests/requirements.txt` must stay on the same fontTools version.
- **UI shell.** The page never scrolls; `.bench` holds the editor (Presets / Fonts / Typography tabs) and the
  tester, each scrolling on its own. Export and About are `<dialog class="side-dlg">`. Below 1000 px one pane
  is shown at a time (`.app[data-mview]`, bottom tabs).

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
