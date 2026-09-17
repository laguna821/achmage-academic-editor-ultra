# R-037 — Journal AF product export and continuation capacity

Development branch: **3.2.0**. Manifest remains the preserved **3.0.2**
development baseline; this step is not a tagged release or live-vault installation.

## Product change

The journal toolbar now has **AF로 내보내기**, alongside PDF and IDML.
The dialog chooses an AF-only file or a ZIP with AF, reference PDF, original
artwork and an export report. It optionally adds 0–3 empty continuation pages.
Current manuscript changes are composed before export. Required registered
font bytes are verified by hash and their native PostScript face names read
from SFNT/TTC data; research JSON preparation is no longer required.

The experimentally accepted writer moved to shared `src/io/affinity` modules;
research entry points call that same implementation. No external AF reader,
native application, source AF template or research dependency is needed to
generate a file. The existing binary encoder remains JavaScript with typed
public JSDoc boundaries; TypeScript callers retain the strict safety checks.
Native serialization has independent regression tests.

Embedded artwork uses a single-page PDF representation and an RGBA preview.
PNG/JPEG/SVG conversion uses the existing local Typst compiler; no new engine
or dependency was added. Original asset bytes are preserved separately in the
package. Image PDFs explicitly omit creation dates, preventing repeated exports
from changing merely because time passed.

Compression is asynchronous, checksums use a lookup table and yield in chunks.
Cancellation is checked during font/resource preparation, serialization and ZIP
generation. Duplicate exports, stale project results, cancelled file dialogs
and view closure are handled explicitly.

## Native text capacity

Extra pages extend the **existing main story**, in left/right order, with empty
frame ranges at its end. They never copy the final references into another story,
delete text or reduce the font. Extra pages are editing space: running headers,
folios and publication metadata require final review.

Report capacity remains `unmeasured-native-reflow`. A structurally valid AF is
not automatically claimed to have every character visible. Figures and tables
remain separately editable objects; they do not automatically move with edits
to the linked body story.

Superscript/subscript mapping was observed by applying both native UI commands
and reading the saved files: `GAtt.Ints[2]` values 1/2, respectively. The writer
keeps the original point size and separates these glyph styles in its cache.
Current native visual acceptance chiefly covers ordinary manuscript text;
broader inline-script typography remains a corpus task.

## Evidence

- Actual Windows Obsidian, **isolated vault/profile**, real 13-page manuscript:
  toolbar/dialog export, automatic font/artwork preparation, native file
  **56 text frames / 26 main-story frames / one 33-cell table / two logos**.
- Direct AF export with two extra pages: **15 pages / 60 frames / 30 main-story
  frames**. File-save cancellation, in-progress cancellation, duplicate-call
  guard, stale-result rejection and dialog closure passed.
- Real Affinity open → save → close → reopen: every original story, table cell,
  frame rectangle and link preserved. The initial product-build probe had all
  13 native PDF pages pixel-identical before/after at PyMuPDF's default render
  scale. The final build's probe preserved all text-span text, fonts, sizes,
  colours and bounding boxes exactly, but had small raster differences around
  running-header/footer glyphs (maximum RGB-channel delta 7/255). This remains
  explicitly recorded; final-build full pixel equality is **not** claimed.
- Inserted **301 characters** at the start of the main story in the extended
  file, saved/closed/reopened: the same body flowed into the added frames and the
  last reference was visible there. No stored text or table cells were lost.
- The reference PDF is byte-identical to the preceding production PDF.
  The known native PDF extraction of one Calibri `ti` ligature as `!` is
  still tracked separately from exact stored-text integrity.
- Final isolated-host repeat export checks identical native bytes.
- Project tests: **364 passed**; native serialization/paragraph tests:
  **23 passed**. Type/build, lint, bundle, Community and release-consistency
  checks pass. Exact hashes, final host timings and file sizes are in
  `test-artifacts/journal/update-3.2.0/af-product-summary.json`.

Native evidence is in `af-product-host/native-verification.json`; final product
host evidence is in `af-product-final-03/host-result.json`. Intermediate artifact
folders are retained. Final artifact linkage is recorded in the summary.

Two intermediate host runs (`af-final-02-host.log`,
`af-final-04-host.log`) completed export and stale/cancellation checks but
recorded unhandled `illegal access` page errors. The final-03 run and three
subsequent diagnostic runs passed with identical product code and no page
errors. Diagnostic runs logged browser errors, rejection events and worker
errors; two also enabled CDP runtime diagnostics. The failures were not reproduced
under that instrumentation. All logs are retained. The origin remains an open
stability issue, not a waived release gate. This package is a development preview.

## Remaining scope

1. Representative artwork/manuscript coverage: crops, inline images, outlined
   shapes, mixed fallback fonts and rich author-supplied artwork. Crops, inline
   images and stroked shapes currently fail preflight with a PDF/IDML alternative;
   unsupported content is not silently omitted.
2. Integrate the shared AF backend into ordinary 1-column / A / B export.
   The current product entry is **journal-only**.
3. Broader performance/startup budgets and packaging/versioned release work.
   macOS hardware remains excluded by the user's decision; this step's native
   host validation used Windows. Prior native PDF colour findings remain separate.
