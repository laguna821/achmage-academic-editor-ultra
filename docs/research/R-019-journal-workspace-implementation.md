# R-019 — HanMark 3.0.0 journal workspace

Status: REQUIRED implementation contract; implementation in progress.

Research: R-006, R-008, R-014–R-018. Baseline: 2.6.1, a31a191d21cbb21e45d6ce76bdf187ca5b2502ff.

## Confirmed user decisions

- Develop on a new `3.0.0` branch. Preserve all published history.
- First delivery completes one HNMR article from author DOCX and attachments to PDF and a reusable project.
- Dedicated Obsidian editor, including free movement/resizing of text frames, tables and figures; surrounding text reflows, explicit pins persist.
- Import and individually/bulk accept or reject author insertions/deletions. Preserve originals and unsupported revision types.
- Bibliographic lookup occurs only on a user action. Confirmed records are cached locally. No AI inference or runtime token use.
- All rendering runs within the desktop plugin. No separately installed renderer. PDF and portable project output; edited DOCX and arbitrary journal masters follow later.
- Keep existing modes/settings/theme format and macOS hardware-test waiver.

## New source evidence

Read-only inspection of the local 10(1) author packages found separate title pages, manuscripts, tables, figures and appendices. EndNote EN.CITE fields and an embedded Office chart occur. One manuscript contains 12 tables and 435 insertion/deletion elements. These require package-role selection, duplicate resolution and tracked-change support; filenames alone do not identify the final manuscript. Private author material is not committed.

## Engine and editor boundaries

- Typst web compiler 0.7.0 ships a 28,325,178-byte WASM module. Compress and embed build assets; decode/initialize only on explicit opening of the journal workspace. Measure startup and journal memory separately.
- Use the direct browser WASM binding rather than the package's Node shim (the shim imports fs through a dynamic Function). Disable unused dynamic-code callbacks at build time and fail closed if called. No CDN, package downloads, filesystem imports or source-code input from manuscripts/presets.
- Typst/Hayagriva + the pinned APA CSL style provide bibliography rendering. The research citeproc-js prototype is not a shipped dependency or proof of full APA compliance.
- ProseMirror's trusted user copy/cut/paste event handlers are needed for the explicitly requested editor. Allow those events only in the editor dependency boundary. Keep ambient navigator clipboard polling, arbitrary HTML injection and dynamic JS execution prohibited. Revise guards based on module provenance, not by deleting protection wholesale.
- One semantic project is authoritative. Preview and export use the same PDF. Canvas handles modify persistent constraints, never merely apply CSS transforms to print content.
- DOCX is an input adapter, not the composition model. Markdown will map into the same semantic project; no DOCX round trip is needed. Keep text roles, figure/table policies, source provenance, references and page masters input-independent. As of this checkpoint the existing Markdown A/B exporter and the new journal compositor are separate paths: no completed Markdown-to-journal integration is claimed.
- Sequence: establish HNMR source-only fidelity first, then connect the current Obsidian Markdown note and verify ordinary two-column output and custom presets with the same engine. Normal headings, emphasis, links, lists, tables and image links map to semantic nodes; article metadata and caption/reference roles need explicit properties or editor mapping. Unsupported constructs (including the current model's missing sixth heading level, code, math, footnotes and nested callouts) must be handled or diagnosed, never silently dropped. Arbitrary journal masters remain a later extension.

## Acceptance and sequencing

1. Browser/host WASM PDF, font injection, position metadata and cancellation.
2. Loss-preserving author package import, revisions, project persistence and recovery.
3. Semantic editing, APA records/citations and explicit lookup.
4. First-page master, two-column layout, tables/figures/captions, diagnostics.
5. Canvas overrides, reflow, undo/redo and persistence.
6. Real manuscripts, PDF content/bounds checks, existing checks and artifact review.

A phase is not complete merely because a demo compiles. Log actual verification and remaining failures below. Source/row/cell/figure omissions, overlapping text and concealed unsupported content are release blockers. A draft may be saved with explicit unresolved diagnostics; a final export requires content errors to be resolved. Quality advisories can be acknowledged with a recorded reason.

## Verification log

- 2026-09-16: new branch created from the published 2.6.1 commit; npm install audited with zero reported vulnerabilities. Native JavaScript test of the browser compiler produced a PDF, APA bibliography and paragraph metadata with explicitly supplied local font bytes. Browser and Obsidian integration still required.
- 2026-09-16 update: real browser WASM and isolated Obsidian host now exercised, including 14 locally registered HNMR font files, PDF preview/export byte equality and portable project reload. Eight private author manuscripts were imported read-only, including the tracked-change manuscript. This import count is not proof of full source fidelity.
- [R-020](R-020-hnmr-master-and-spacing.md) records the subsequent first-page master and detailed spacing work. The original generic engineering fixture was not an HNMR visual-quality proof. Published-PDF geometry comparison and real-font spacing fixtures now provide separate checks.
- Still open for the complete 3.0.0 acceptance: final-page column balancing and bounded multi-page float optimization; all required APA/citation golden cases; full real-article source and image/chart fidelity; complete exceptional table/merged-cell coverage; final release-candidate checks and packaging. No 3.0.0 release has been published.
- [R-021](R-021-manuscript-only-fidelity.md) strengthens the final comparison contract to original manuscript DOCX only. All 22 source files are now paired and imported in isolation; no full-article equivalence pass is claimed. Actual intake exposed and fixed abstract/body boundary errors in unstyled author documents.
- [R-022](R-022-reference-verification-and-correction.md) specifies deterministic DOI verification and a human-reviewed correction queue. The existing Crossref candidate lookup is implemented; this expanded comparison/queue design is not yet implemented.
- Latest source-only run: 22 original DOCX imports and22 composed PDFs all pass the current internal PDF detail checks. The prior six table/detail failures and bitmap-only EMF failure are resolved by source-grid, measurement, script-baseline and media fixes. R-021 and R-024 define the bounded evidence. Regression tests:293 passing; lint/build/bundle/Community and isolated Obsidian host pass. No final source/publication equivalence or release approval is claimed.
- R-023 adds first-page metadata hotspots, AOP/issue switching, calculated end pages, copyright-year overrides and confirmation invalidation, plus measured heading-transition controls. R-024 adds uniform APA-style rules, attached notes and a source-preserving, human-reviewed candidate for packed statistical rows. The Markdown adapter and complete APA semantic validation remain open.
- [R-026](R-026-source-coverage-and-bounded-composition.md) supersedes the earlier internal-pass interpretation. Independent DOCX/model/PDF coverage found omitted consecutive figures and legacy symbol/inline illustration cases. Bounded typography/float rules, final-column balance, numerical alignment and confirmed APA references in normal flow are now implemented. First-pass holdout evidence and later regression are reported separately; unsupported source objects and editorial approvals remain open. No release has been published.

- [R-027](R-027-reviewable-cleaning-and-shared-journal-input.md) implements the shared Markdown journal adapter and reviewed reimport, reversible source cleanup, final placement numbering, reference ordering, editable end matter and local OCR with confirmed cropping. It also corrects leading heading gaps across flow regions and preserves original Office chart appearance when a source preview exists. Missing artwork and ambiguous source semantics remain explicit review items. The older Markdown-pending statements above describe their historical checkpoints; they are superseded by R-027. No release has been published.
