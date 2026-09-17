# R-039 — Vector artwork, native masters, frame capacity and first-save integrity

Date: 2026-09-17. Development branch: 3.2.0; existing development manifest remains 3.0.2. No public release is made by this change.

Follow-up: [R-040](R-040-facing-spreads-and-paired-master.md) adds a paired two-page master and facing document spreads as the journal AF default. Single-page mode retains the structure described below.

## Problems reproduced

- Template import rendered PDF logos to PNG. AF also used a very small artwork preview, so native on-screen logos could look soft even when their embedded representation was vector.
- Running headers were independent per-page objects, with literal page numbers and no native masters.
- Body frame rectangles ended at measured content rather than the available column workspace. This made native editing awkward even when the reference PDF looked correct.
- During native master verification, the first in-place save reported a file ownership error. The original AF header was overwritten by a `#Fil` chunk. This was a generated archive defect, not a permission or colour-space problem.

## Common implementation

### Source artwork

PDF page selection uses pdf-lib. A single-page PDF keeps its exact bytes; selecting a page from a multipage PDF preserves its vectors, fonts, CropBox and rotation. The composition engine measures a transparent SVG with the source dimensions; the final PDF embeds the original page as a Form XObject. AF embeds the original PDF and a separate display cache. It does not replace the original with the cache.

Legacy PNG derivatives are upgraded on the composition copy only when their retained PDF source and selected page can be identified. A confirmed normalized crop retains its hash association with the recovered page. The stored project revision and original source bytes remain unchanged. An unrelated PNG cannot recover vector information.

AF display caches use the placed size at up to 600 dpi, bounded by 2,400 pixels on the longest side and four million pixels. PDF figure OCR/crop previews use temporary raster images, without replacing output assets. Cropped AF artwork is still rejected by the existing preflight; PDF/IDML remain available for that case.

The bundled HMRI logo is vector artwork extracted from the user-supplied PDF. The previous Crossmark SVG contained a small raster image. It is replaced with the unchanged official [Crossref SVG](https://crossmark-cdn.crossref.org/widget/v2.0/logos/CROSSMARK_Color_square.svg). The regeneration script preserves that source and checks its checksum. Provenance is in `assets/journal/provenance.json`.

### Native masters and folios

The editable snapshot marks running headers, folios and rules by master role. The native writer creates `MpCh` master spreads, `MPIN` instances and linked properties/geometry. Folios are `PgNG` dynamic glyphs; a literal `#` is not used as a substitute. `DocS.NbFr` sets the requested first page number.

- First page: separate publication/title/abstract/copyright objects.
- Even printed folios: journal name and publication year.
- Odd printed folios: editable running-author label and short title.
- AOP: suppress automatic folios.

Changing a master text in Affinity updates its applied pages. Both existing master roles are copied to matching continuation pages. If the source has no instance of a role, a continuation page cannot infer that missing native master. Check continuation furniture before publication.

Assignment uses the exported printed folio parity. Changing the starting number inside Affinity updates page-number fields; exchanging recto/verso assignments after a parity change must still be checked in Affinity. Re-exporting from HanMark recomputes the assignments. IDML continues to receive the resolved header text and numbers; native masters and dynamic fields in this change are AF-specific.

### Editing geometry

Composition exposes column regions after excluding front matter, floats and their reserved spacing, while ignoring already placed body text. Failed-fit `skip` reservations are also ignored: they represent unused PDF capacity rather than a physical obstacle. AF/IDML body frames occupy these regions. All body frames still form one story in reading order. A leading content offset is an internal frame inset, not a displaced outer boundary. The correspondence frame keeps its outer boundary aligned with the abstract while retaining its text inset. Document margins are exported as native guides. Running-header and folio frames have a 3 pt separation; the copyright frame ends at the body right margin.

The adapter now copies rectangle coordinates explicitly: spreading a source layout box also copied its `id`, causing duplicate frame IDs for repeated table notes. Repeated table fragments retain distinct exported object IDs.

Typography is not shrunk to fill frames. Native line breaking can differ from the PDF, and text may reflow inside the enlarged capacity. Tables/figures remain independent objects; they do not automatically follow later native text edits.

### First in-place save

The fresh archive had zero at header offset 24. Affinity used this as the next write location and overwrote byte zero on the first ordinary save. `Save As` rebuilt the archive and masked the defect in earlier acceptance cycles.

The common synchronous/asynchronous archive writer now writes the end-of-archive boundary at header offset 24 and FAT offset 20 even when there is no thumbnail payload. A regression test rejects a zero/incorrect boundary. No seed AF is required.

Old generated files are not rewritten in place by this update. For an old file already open with edits, use **Save As** to preserve the live document. A newly exported file uses the corrected archive. A corrupted on-disk header is not claimed to be repairable merely by reloading the plugin.

## Validation and evidence

Private evidence: `test-artifacts/journal/update-3.2.0/master-probe/` and `master-product-verified/`; no manuscripts or proprietary fonts belong in release assets.

- Native master edit propagated to page 24; the master showed `#`, and its document instance showed `24`.
- First in-place save failure was reproduced twice. A FAT-only boundary change did not resolve it. Setting both tail boundaries resolved it.
- Corrected fresh file: native edit, ordinary overwrite-save, close/reopen, second edit/save, independent parse, and another reopen. Both cycles retained the archive header and native master structures.
- Four-page browser composition with the original HMRI PDF: no raster images, vector paths retained, correct headers at folios 23–26, identical repeated PDF bytes. Repeated table fragments exported successfully to IDML.
- Thirteen-page isolated Obsidian test: two masters, 26 linked body frames, one table, original HMRI PDF bytes embedded unchanged, two continuation pages, deterministic repeated AF bytes, cancellation and stale-result guards.
- The same thirteen-page file was edited and saved in place twice in Affinity, closing and reopening between cycles and once again after the second save. Independent extraction after each save verified the complete body text hash, all 26 frames in left/right/page order, 12 native master instances, two page-number fields, and the original logo PDF bytes. Affinity may intern the two identical page-number glyph objects; semantic field occurrences, rather than object count alone, are checked. Evidence: `native-integrity.json`, `03-reopened-final.png`, and `04-page24-reopened.png`.
- Final `npm run check`: 373 tests, lint, type check, build, bundle, Community and release metadata checks passed. The separate native suite passed 18 tests. Production dependency audit reported zero vulnerabilities. Bundle SHA-256: `4016272cf0439a7c4b3b6b3dcc756a174ba75d7a263985dc807430ef6c9fd527`.
- A prior isolated host run alongside other browser/WASM tests failed with an ArrayBuffer allocation error during its late cancellation cycle. The complete sequential rerun in `master-product-verified/` passed all guards and repeated-export checks; that earlier failure is retained as evidence rather than counted as a pass.

The checks above are bounded Windows Affinity 3.2.3 acceptance, not a claim that every native operation or another host has been verified. Final command results and artifact hashes are recorded with the private evidence.
