# R-028 — Offline journal size and performance refactor (3.0.1)

## Contract

Keep the complete offline plugin, including Typst, English/Korean OCR, original fonts, review controls, composition search limits and existing project/settings formats. Preserve all earlier working changes on branch `3.0.1`. Public publication is a separate step.

Before editing, copied `src`, scripts, build configuration and release assets into the ignored `test-artifacts/journal/refactor-3.0.1/baseline` directory. Its `snapshot.json` records asset hashes. This is the local 3.0.0 development baseline, not the older public Git HEAD.

## Implementation

- Build-time Brotli/gzip choice per unchanged binary resource; asynchronous desktop `node:zlib` decoding followed by original byte-length and SHA-256 checks. A separate test-only browser codec adapter exercises the same resource contract. Real Obsidian tests exercise the production decoder.
- Content-addressed compression cache under `node_modules/.cache`; no first-use download, extra native dependency or runtime source evaluation.
- Worker protocol separates file synchronization from compilation. Paths/content hashes select changed files, missing paths are unmapped, and restart invalidates the synchronization state. Compilation requests are serialized and stale generations are rejected.
- Cache source reads within one composition/numbering operation. Deduplicate identical measurements; retain at most 5,000 measurement entries between calls. One exact-input typography result is retained, including fonts, width, preset, referenced files, references, revisions and paragraphs in its key. Existing bounded search and worker memory restart remain.
- Preserve the editor instance and selection when publication metadata changes. Body/project changes still refresh the editor; pending compositions are combined and obsolete results are discarded.
- Emit bundle input accounting and enforce a 20,000,000-byte complete `main.js` ceiling. Pretendard font bytes and CSS output are preserved.

## Verification protocol

The private corpus runner reimports original manuscripts only to recover assets, then composes the exact previously saved projects. Compare PDF bytes, geometry, issues, coverage, adjustments and numbering to the preserved phase-3 outputs. Existing unresolved manuscript/artwork problems must remain visible; equal output does not imply publication readiness.

Benchmark the same 24-page article in a separate Obsidian profile, 10 iterations per version. Each iteration reloads the plugin, composes once, composes again, edits publication metadata, recomposes and runs first-use OCR. Record timing, sampled renderer private/heap memory and post-close/post-GC memory. This is a first-use-after-plugin-reload experiment, not an OS cold-boot/cache-purge benchmark. Browser resource test adapter timings are not used as desktop performance evidence.

Exact measurements and validation outcomes are recorded below. Private artifacts stay in `test-artifacts/journal/refactor-3.0.1`; manuscript data and licensed fonts are excluded from release packages.

## Measured outcome

Source-audit clarification (2026-09-16): the preserved 3.0.2 source declares `typographyCache` but does not use it; `chooseTypography` is called directly. The implementation paragraph above therefore overstates active typography-result reuse in that snapshot. Historical measured outcomes below are unchanged. Restoring and independently verifying this cache is a candidate in R-031, not an already demonstrated improvement.

- Complete main.js: **24,015,905 → 18,342,988 bytes** (23.6% smaller). CSS/fonts are byte-identical. Typst/OCR resource originals are byte-identical.
- Actual Obsidian, 24-page article, 10 samples/version: plugin load **297.95 → 233.65 ms** (-21.6%); first composition/preview **16.926 → 16.051 s** (-5.2%); repeated composition **5.638 → 5.627 s** (-0.2%); metadata input **14.35 → 4.60 ms** (-67.9%); metadata recomposition **5.394 → 5.281 s** (-2.1%); first OCR **595.35 → 383.20 ms** (-35.6%).
- The **20% repeated-composition speed target was not reached**. Do not describe the full composition engine as 20% faster. PDF generation remains a substantial cost.
- Sampled renderer peak private memory maximum **2,585,816 → 2,518,764 KB**; post-close/unload/GC median **466,272 → 483,602 KB**. Renderer totals include the host; memory did not improve in every measure. No >10% regression in the specified startup/first-use/peak-private gates.
- **28/28 saved-project PDFs are byte-identical**, including boxes, coverage, issues, adjustments and numbering. **14-page Achmage Markdown PDF is byte-identical** (7,615,686 bytes). Existing source/artwork review findings remain unresolved as recorded in R-027.
- All **330 tests**, type/build/Community/release checks passed. A/B × three table widths × sections on/off (12 cases), default PDF and PDF UI regressions passed. OCR restart/cancel/negative tests passed with zero external requests.
- Real Obsidian UI checks passed: entry points, DOCX/Markdown, font registration, project save/reload, metadata editor preservation, queued edit result rejection, PDF preview/export equality, OCR crop confirmation and Markdown reimport. The first file-picker test timed out; the harness now waits for full plugin initialization and subsequent complete runs passed. This was not hidden by bypassing file selection.
- Runtime and complete dependency audits: **0 vulnerabilities**. Three-OS CI configuration is retained and release verification includes engine/OCR checks. Remote CI was not run in this local-only candidate task. Physical macOS testing remains waived.

## Reproduction and artifacts

- `npm run check`; `node scripts/test-journal-engine.mjs`; `node scripts/test-journal-ocr.mjs`; existing PDF render/UI scripts.
- Licensed/private corpus: set the existing HNMR font environment variables, then `node scripts/test-journal-refactor.mjs`. Preserves original phase-3 artifacts.
- `node scripts/benchmark-journal-host.mjs baseline` / `current`; then `node scripts/report-journal-refactor.mjs`. Separate test profiles; production vault is not modified.
- Private evidence: `comparison.json/.md`, `corpus-equivalence.json`, `markdown-equivalence.json`, `resource-equivalence.json`, host logs and screenshots under `test-artifacts/journal/refactor-3.0.1`.
- Public release, GitHub push and live-vault installation are not performed by this development validation.
