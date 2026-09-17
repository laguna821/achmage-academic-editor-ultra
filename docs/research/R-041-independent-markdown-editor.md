# R-041 — Independent editor and Markdown as source of truth

Date: 2026-09-18. Development version: 0.1.0. Repository and plugin ID: `achmage-academic-editor-ultra`.

## Result

The journal workspace now runs independently of HanMark. Word import retains its editable project; Markdown import is a source-bound project. A single Markdown note owns article content and publication metadata. The project stores derived layout, review decisions, fonts and immutable asset snapshots. AF/IDML are downstream editing copies and do not write back into Markdown.

HanMark's standard HWPX/DOCX/HTML/PDF functionality is preserved on the local `refactor/aaeu-split` branch. Its journal sources, Typst, ProseMirror and OCR runtime were moved to this plugin. The previous development tree is preserved in a local Git checkpoint and a workspace ZIP. No existing manuscript was deleted or overwritten.

## Data contract

- `markdownProperties.ts` defines flat, versioned `aaeu-*` properties, numeric repeated author/affiliation/sidebar/statement entries, validation and generated templates/docs.
- Dedicated nonempty properties take precedence over supported legacy metadata and body inference. Unknown dedicated fields and invalid types produce explicit issues. Unrelated YAML is preserved in the source.
- Empty overrides inherit template text; `*-hide: true` explicitly removes it. Required declarations require an omission reason. Dates, DOI, correspondence and declarations are never invented.
- The same text in YAML/body is deduplicated; conflicting abstract/declaration text is an error. Statements are composed before References.
- `articleFurniture.ts` applies article overrides to a composition snapshot. Sidebar order, custom entries, running heads, folios and copyright share the PDF/editable-export mapping. `{page}` remains a native AF page-number field.
- `markdownSource.ts` snapshots remote bytes and hashes; local assets are reread. Same-URL remote changes require explicit refresh. ZIPs include dependencies. Missing assets and HTML error pages fail visibly.
- Reimport retains unchanged object IDs and applicable reviews. Content changes cannot inherit stale approval. Source modification, rename and local asset changes invalidate stale output. A note reopens its existing source project.
- Markdown content panels navigate back to source lines. The rich text editor remains available for Word and legacy copied projects. Crossref results in source mode are reviewable source corrections rather than hidden changes to a second text copy.
- Safe migration copies HanMark projects and templates, validates assets and is idempotent. Legacy Markdown projects retain manual edits until an explicit copy transition.

## Verification performed

| Check | Observed result |
|---|---|
| Independent plugin unit suite | 118 passed |
| HanMark after source split | 265 passed; lint, type/build, bundle, Community and release checks passed |
| Independent plugin gates | Lint, type/build, bundle, Community, metadata consistency passed |
| Production dependency audit | 0 vulnerabilities at verification time |
| Offline browser compiler and OCR | No external requests; deterministic repeat, cancellation and restart passed |
| Isolated Obsidian / Markdown | 3-page synthetic article, PDF/IDML/AF; source date, local image, rename, project reuse, migration and new-note wizard passed; no runtime errors |
| Isolated Obsidian / existing HNMR Word project | 13 pages; 26 connected body frames, 56 total frames, one table and two built-in vector assets; repeated AF bytes identical |
| Actual 9/21 English Markdown demo | 16 pages, 5 remote images, 6 tables; repeat PDF identical |
| Actual 9/21 Korean Markdown demo | 15 pages, 5 remote images; automatic Korean fallback; repeat PDF identical |
| Educational Harness Engineering Markdown | 14 pages, 11 remote images; repeat PDF identical |
| Corpus provenance | All three source hashes unchanged, source coverage complete; zero compiler diagnostics |
| Affinity save/reopen twice | 3 pages, 23 frames, 15 stories, continuous 6-frame body flow and paired spreads preserved; all 8,353 story characters have the same text hash after both saves |
| Standard HanMark PDF | A/B/table render matrix and export UI cancellation/retry/print-focus passed |

The real demo notes intentionally lack academic publication metadata. Missing correspondence/declarations remain explicit draft issues. The Educational Harness running title exceeds its allotted space and is reported. These outputs are composition tests, not claims that the drafts are publication-ready.

A verification-discovered abstract bug was repaired: paragraph boundaries now produce separate Typst paragraphs rather than ignored breaks nested inside one paragraph. Korean fallback discovery now also runs when a project already has English font snapshots.

Local private evidence is under `test-artifacts/aaeu/`: `af-host`, `markdown-final`, `corpus-host`, `native-roundtrip-result.json`, and the independent native parser inventory. Private manuscripts, licensed fonts and rendered evidence are excluded from Git.

## Size and scope

Measured before split: HanMark `main.js` 18,903,247 bytes. Slim build: approximately 3.32 MB (82.4% smaller). Independent offline editor: 17,755,090 bytes. These are uncompressed JavaScript sizes, not load-time or memory benchmarks. Combined installation is larger; the separation benefits users who only need normal HanMark conversion.

The 95%+ automatic-editing goal is not a measured guarantee. Unsupported AF content remains an explicit preflight error. No Chicago style, general AF-to-Markdown round trip or automatic factual reference correction is included. Existing APA/Crossref code remains isolated behind journal reference modules for later style work.

macOS physical verification is excluded by user decision; Windows/macOS/Linux CI remains configured. Development stays private; no public HanMark 3.2.0 release or Community submission is made by this change.

## Reproduce

```sh
npm ci --ignore-scripts
npm run check
npm run docs:yaml
npx playwright install chromium
node scripts/test-journal-engine.mjs
node scripts/test-journal-ocr.mjs
node scripts/test-aaeu-markdown-host.mjs
```

The Obsidian host runner needs a local desktop Obsidian executable (`HANMARK_OBSIDIAN_EXE`) and a fresh isolated output directory (`HANMARK_HOST_OUTPUT`). The corpus runner uses `AAEU_CORPUS_MANIFEST`; the Word runner needs the private HNMR fixture. These inputs are deliberately not committed. The CI suite is self-contained and does not depend on the private corpus.
