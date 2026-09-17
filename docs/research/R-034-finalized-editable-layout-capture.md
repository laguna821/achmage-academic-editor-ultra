# R-034 — Finalized editable layout capture

Date: 2026-09-17. Development branch: `3.2.0`.

## Scope and outcome

The first production integration step after R-033 strengthens the shared layout
contract used by the existing IDML adapter and the future native AF writer.
PDF composition remains Typst-based. This checkpoint does not add a production
AF writer, an AF button, a release, or a new general-PDF export path.

`EditableLayoutSnapshot.version = 2` is output-only. Journal project, Markdown,
theme and saved-font formats remain unchanged; package version remains `3.0.2`
until the complete `3.2.0` candidate meets its gates.

## Implemented

- Capture each placed body/heading fragment, source UTF-16 range, normalized
  runs, list marker, indentation, leading, tracking and horizontal scale at
  composition time, including terminal-column adjustments.
- Store frame membership, contiguous story ranges and explicit previous/next
  links. Continued fragments do not introduce new paragraph breaks. Validate
  missing/duplicated/reordered content and broken links.
- Remove the adapter's expansion of body frames into unused page space.
- Capture chosen table bounds and infer row boundaries from the compositor's
  cell positions. Preserve fixed column widths, repeated headers, merges and
  separate horizontal/vertical padding. Missing row boundaries fail explicitly.
- Record table geometry only for the chosen fragment, without a second table
  height calculation for every pagination candidate.
- Capture the actual height-limited/cropped image frame, figure-note bounds and
  headings carried with floats. Keep captions/notes in their float group.
- Fix omitted figure notes, lost float headings, repeated-table caption labels,
  chart key-color propagation and distorted height-limited images in the adapter.
- IDML retains logical paragraphs across continuation fragments, their glyph
  scaling/tracking and image aspect ratio. This is serialization verification;
  a new native IDML open/edit/reopen cycle has not been performed here.
- Preserve source preflight severity separately in the export report. Missing
  publication declarations can still be handed off for editing; invalid export
  geometry/content remains an export error.

## Evidence

Private artifacts under `test-artifacts/journal/update-3.2.0/`:

- `snapshot-regression/corpus-equivalence.json`: all **28** saved manuscript
  projects reproduce the baseline PDF bytes and all six comparison fields:
  pageCount, boxes, issues, coverage, adjustments and numbering. These are
  regression comparisons to our earlier output, not identity with the published
  journal PDFs and not proof that unresolved author artwork is available.
- `snapshot-equivalence.json`: capture-enabled output matches the control PDF
  bytes and the same six fields for a 4-page synthetic manuscript, a 5-page
  mixed-object fixture and the 13-page `v9-1-article-84` manuscript.
- The mixed fixture checks row/column merges, repeated table fragments, a
  carried heading, figure notes, height-limited artwork and a confirmed crop.
- Real manuscript snapshot: **56 frames, 31 stories, one native-table fragment,
  two images**; no editable-layout validation errors. Existing author/editorial
  preflight findings remain in its report.
- **355** project tests, including **9** new editable-layout tests; **13** fresh
  AF research tests pass. Lint, TypeScript/build, bundle and Community checks pass.
- Final local `main.js`: **18,393,801 bytes**, **7,841 bytes above** the preserved
  18,385,960-byte baseline. No new dependencies or resource payloads. This is
  not a size/performance improvement claim; R-033's final size and timing gates
  still apply after the remaining refactor.

Representative commands:

```powershell
$env:HANMARK_EDITABLE_REGRESSION='1'
$env:HANMARK_IDML='1'
$env:HANMARK_OUTPUT_PREFIX='af32-editable-complex-final'
node --import tsx scripts/test-journal-layout.ts
node --import tsx --test tests/editable-layout.test.ts
node --test scripts/test-affinity-fresh.mjs
```

## Remaining work

1. Finish the general writer-facing coverage contract: first-page furniture and
   abstract runs are still reconstructed from structured source/master values;
   fully covered rowspan-only row boundaries need direct capture. Inline
   generated citations and raw code have explicit editable-export errors until
   their rendered runs/styles are captured; ordinary PDF composition is intact.
2. Connect finalized snapshots to an independently generated AF document, expand
   native glyph/paragraph/table/image mappings, and validate representative
   manuscript artwork, layer ordering/ungrouping and repeated edit/save/reopen.
   Preserve originals and fail on unsupported objects rather than omit them.
3. Add general/journal AF controls, packaged assets/reference PDF/font list,
   stale-result/cancellation guards, bounded caches and host benchmarks, then
   prepare the versioned candidate.

Native-only PDF transparency behavior remains the separate compatibility issue
recorded in R-033. It does not block AF implementation. No Affinity engine
replacement or universal native-document compatibility is claimed.
