# R-029 — Installed fonts and journal appearance templates

## Decision and implementation

HanMark 3.0.2 exposes appearance, not the journal layout engine. Existing project geometry, paragraph metrics, table/figure layout and source/editorial history are preserved. The optional version-1 appearance snapshot lives inside the existing project preset; exported templates use the independent `hanmark-journal-template` format. HNMR and general-publication builtins cannot be overwritten. Library updates do not mutate applied project snapshots.

The five-step wizard controls publication type, logos, three font groups, colours and fixed-area text. Explicit group font choices override all roles in that group while retaining size, weight, leading and indent. An unset group retains existing role fonts, including HNMR's original five-family mix. Font substitutions are recorded with appearance. Templates exchange logo originals/derived images and font names, never installed font binaries.

The read-only `systemFonts.ts` boundary enumerates Windows registered and standard system/user font directories, macOS active font information (standard-directory fallback), and Linux Fontconfig (standard-directory fallback). Only SFNT directory and name tables are read for the catalog. Needed font files alone are snapshotted into the project. Existing saved families are not replaced on refresh. New projects can add installed Korean, CJK and emoji fallback fonts when those scripts occur. App-private/cloud-only or unreadable fonts require substitution or the retained file picker.

The two audited native boundaries are the existing user-triggered process adapter and the fixed-command/read-only font adapter. The latter has no arbitrary command or path interface: reads require an ID in its freshly discovered catalog. Process and filesystem source/bundle gates retain this narrow exception; no runtime dependency was added.

Custom PDF logos retain the source PDF and selected page raster at 600dpi for the fixed target slot. PNG/JPG use their original pixels. Images fit within the slot without stretching or cropping. Legacy built-in HNMR logos retain their exact rendering. Generic marks never inherit the DOI Crossmark hyperlink. Publication/header/footer text uses escaped literal text and whitelisted variables; actual typeface measurements block overflowing templates without silently truncating custom text.

General publication mode disables academic metadata, corresponding-author, academic end-matter review requirements and (by default) reference metadata checks. Source coverage, unsupported/missing artwork, float/caption integrity, table readability and overflow remain checked. Reference content, formatting and manual online lookup remain available.

## Validation

- Final `npm run check`: 342 tests passed, zero failures; type/build, bundle, Community and release checks passed. Production and full dependency audits reported zero vulnerabilities.
- `scripts/test-journal-templates-corpus.mjs`: 28 saved Word manuscripts compared against the preserved phase-3 PDFs, layout boxes, issues, source coverage, adjustments and numbering.
- All 28 comparisons passed with byte-identical PDFs and identical layout/review records. This establishes regression equivalence, not equivalence to published journal PDFs.
- Achmage Markdown: 14 pages, 7,615,686 bytes; byte-identical to the prior output.
- `tests/journal-templates.test.ts`: fixed HNMR master/style equality, geometry/metadata preservation, three font groups, undo, general policies, AOP variables, generic mark links, schema validation, library snapshots, ZIP hashes/paths, three OS catalog formats, real local font reads and immutable saved families.
- `scripts/test-journal-host.mjs` (current harness): isolated actual Obsidian, DOCX/Markdown intake, automatic fonts, same manual-font PDF bytes, hidden advanced settings, template preview/save/reopen, general mode, colour/text overrides, PDF page selection and PNG/JPG replacement, overflow rejection, metadata review, exact preview/export equality, saved project reload, OCR crop and Markdown reimport.
- The test harness closes Obsidian 1.13's separate settings window after enabling the plugin, ensuring its modals open in the tested journal window. This was a harness focus issue; no product modal workaround was added.
- The PDF logo test caught an invalid Document-level canvas append; conversion now uses a hidden canvas in the wizard's own document container.

Detailed logs, before-change source/build checkpoint, PDF comparisons, sample outputs, screenshots and package hashes are private under `test-artifacts/journal/update-3.0.2/`. Public metadata lists no private manuscript paths or font binaries.

The Windows catalog contained 558 font faces across 279 families. Initial discovery took 300.16ms; cached access took 0.0019ms and an explicit refresh took 253.61ms on the test machine. The HNMR test project automatically registered 19 required font files and produced the same PDF bytes as manual registration.

The final development ZIP is 13,681,571 bytes (SHA-256 `3a3474990867ba74d6609a1a393610f636d459a1348349fdb020d2b1000c215a`). Its `main.js` is 18,369,541 bytes: 26,553 bytes (+0.145%) above the preserved 3.0.1 baseline. Packaging verifies that this bundle is the exact bundle exercised by the successful actual-Obsidian host run. The package includes no manuscript or installed font files.

## Limits and rollout

The published baseline remains 2.6.1. This is a local 3.0.2 development candidate; no GitHub publication or live-vault installation is implied. All previous source-artwork and editorial review limitations remain; output equality does not make unresolved source objects publication-ready.

macOS physical-device testing remains excluded by the user's decision. Three-OS CI is configured; local runtime verification is Windows. macOS/Linux catalog parser fixtures are tested locally, which is not a claim of physical-device testing.
