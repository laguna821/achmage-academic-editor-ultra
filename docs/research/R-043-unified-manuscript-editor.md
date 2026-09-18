# R-043 — Unified manuscript editor · 0.2.0

Date: 2026-09-18. Status: implemented and locally validated as a release candidate.

## Data and editing contract

`ManuscriptEditor` supplies six groups from the shared property registry and a CodeMirror body/raw-source editor. `manuscriptFields` maps the same controls to Word's editable project. `sourceEditing` uses YAML syntax ranges to patch selected top-level keys; it does not serialize the imported article back into Markdown. Untouched keys, comments, newline style and body bytes remain unchanged. Repeated authors, affiliations, custom sidebar entries and statements have add/remove controls.

Markdown saves run after 500 ms of idle input, through a serialized optimistic merge with the latest vault note and open native Markdown editors. Disjoint frontmatter/body changes merge. Competing changes produce a conflict dialog and recoverable sibling copy rather than overwriting either side. Closing after a failed save retains a project recovery draft. Undo/redo and template selection use the same source history.

Preview metadata and text overlays select the corresponding field or source position. The user subsequently requested manual refresh as the default, superseding the proposed one-second automatic preview. Saving remains automatic; an explicit refresh button and stale-preview state remain visible. Optional auto-preview waits two seconds. Only one composition runs at once; source fingerprints reject obsolete results.

## Template and output contract

Saved templates apply from the toolbar without reopening the wizard. The same path handles wizard save/apply, updates `aaeu-template`, retains article overrides and validates fonts/assets before application. A legacy source/applied-template mismatch opens an explicit choice. Missing fonts retain the prior applied/source state.

Review PDFs allow editorial warnings. Final PDFs show the remaining warnings and allow explicit override. The override writes a receipt with the manuscript revision and warning snapshot without marking checks passed. Invalid YAML, changed source or failed PDF generation cannot export a stale result. Empty optional metadata uses the common output model for PDF, AF and IDML; missing figures retain diagnostics.

`MarkdownEditorAdapter` exposes the public Obsidian `Editor` contract and dispatches trusted `editor-paste` and `editor-drop` events with the bound file. The production integration does not read another plugin's credentials/settings or invoke its internal uploader. Native-MarkdownView-only commands remain available through the original note tab.

## Evidence and repeatability

Run from the repository root after `npm ci --ignore-scripts`:

```sh
npm run check
npm run test:journal-engine
node scripts/test-journal-ocr.mjs
node scripts/test-aaeu-editor-host.mjs
node scripts/test-aaeu-eagle-host.mjs
```

The last two scripts require a local Obsidian executable (`HANMARK_OBSIDIAN_EXE`, default Windows installation). Each creates a separate profile/vault and closes only its own instance. `CMDS_EAGLE_PLUGIN_DIR` optionally supplies the locally installed plugin's main/manifest for the Eagle test. No settings file is copied. That test substitutes the external upload provider with a localhost image response, restores the clipboard, and does not write to R2.

- Full check: 131 passing tests, TypeScript, build, ESLint, offline bundle, Community and release identity.
- Full dependency audit: zero reported vulnerabilities at verification time.
- Engine and OCR browser regressions passed. Engine captured no external requests.
- Editor host: typing causes zero compositions in default mode; one refresh produces one composition; opted-in rapid typing produces one delayed composition and retains input focus.
- Actual PDF overlay clicks navigate to correspondence, abstract, publication and body. Guided metadata and CodeMirror edits reach the real `.md`. Comments/unrelated attributes, source undo, open Markdown-tab synchronization, conflict copies, malformed YAML, compilation failure and warning receipts are exercised.
- Legacy YAML fields are edited at their existing key. Body-origin abstracts/statements display their effective text and navigate to the body editor, preserving emphasis and avoiding duplicate YAML metadata.
- HNMR, Achmage, Command & Space and custom template switches persist to source; one source undo restores template; unavailable font leaves prior state.
- Word adapter metadata checks plus actual DOCX pick/import, correction, save, compose and project reopen pass.
- Actual installed CMDS Eagle 1.8.4 paste handler: one upload request; returned image URL reaches source; remote figure can be dragged; unrelated metadata edit retains its placement.

Ignored local evidence paths:

```text
test-artifacts/aaeu-020-check.log
test-artifacts/aaeu-020-engine.log
test-artifacts/aaeu-020-ocr.log
test-artifacts/aaeu/editor-host-1789721264015/editor-host-result.json
test-artifacts/aaeu/eagle-host-1789720888081/eagle-host-result.json
test-artifacts/aaeu/020-native-flow-check.json
test-artifacts/aaeu/020-native-logo-check.json
test-artifacts/aaeu/native-pdf-check.json
test-artifacts/aaeu/020-display-cache-check.json
```

## Vector preservation and the screen-preview distinction

The HNMR master now resolves the authorized original HMRI PDF from the common asset path. PDF raster previews retain the original relationship across source reimport. AF packages record original and embedded resources separately, including display-cache dimensions and exact hashes.

HMRI original: 100,098 bytes; SHA-256 `e746e6a8b9420ed99116dc2142be80724b876665a7f2f514b025fbc73e7b4b2d`. Its byte sequence is present in both the generated AF and the Affinity-saved AF. The saved/reopened body keeps 6 connected frames and an unchanged 7,441-character text hash. The native PDF export (two spreads, three document pages) contains zero raster image resources and retains vector drawings.

The user observed blurry logos at 519% in Affinity. Independent parsing found our 750×232 HMRI display cache becomes 122×38 after Affinity save; Crossmark 260×260 becomes 100×100. The original PDFs are unchanged. The writer already generates bounded 600-dpi previews at placed size. Affinity's cached preview regeneration, including its interaction with native resource metadata, remains a separate unresolved display-quality issue. Do not change unknown native DPI fields or switch Passthrough to Interpret merely to improve the screenshot. [Official placed-PDF behavior](https://affinity.help/publisher2/en-US.lproj/pages/Media/placeImages.html).

## Size, compatibility and remaining coverage

0.1.0 installed baseline: main.js 17,755,090 bytes. 0.1.1 development baseline: 17,873,450 bytes. 0.2.0 candidate: 18,290,623 bytes, an increase of 417,173 bytes (2.33%) over development 0.1.1. CodeMirror editor core stays external to the bundle; new bundled Markdown language parsers and YAML carry their complete license notices.

Installation replaces only the three distributable plugin files. Settings and user projects are retained. GitHub publication is separate from local candidate packaging. macOS hardware, exhaustive OS IME combinations and live R2 uploads remain untested; testing Korean text edits alone is not represented as full native IME acceptance. Display-cache regeneration after native save remains open as described above.

Achmage live installation was verified through Obsidian's CLI after plugin reload: runtime 0.2.0, guided fields present, saved-template selector present, refresh button present, automatic preview disabled. The previous active note was restored after the empty-view smoke test. Only the three distributable files were copied; settings bytes were unchanged. Initial 0.1.0 files remain backed up under ignored `test-artifacts/aaeu/install-backup-1789721084230`. Final installation/runtime evidence is `test-artifacts/aaeu/020-install.json`.

Final main SHA-256: `10efd8bdd5de2a009ddf10bc7914e232c087ecbb14b529fec8d4b3616bbf26d1`. ZIP: 12,157,062 bytes; SHA-256 `5e04e823588ff9d5aa741fbf90fb50abdb6e6975e17880424ea98cd5d870fc5b`. Local release artifacts are in `release/0.2.0/`.
