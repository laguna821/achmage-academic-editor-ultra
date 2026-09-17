# R-033 — Fresh AF authoring and 3.2.0 acceptance gates

Status: **partial implementation on local branch 3.2.0**. Native gates 1–3
passed. Gate 4 now also verifies bounded vector resources, original-image
replacement, relocated resources and hyperlinks. The combined AF-plus-native-PDF
check still fails because of a transparent PNG color discrepancy in native PDF
output. This is tracked separately from editable AF integrity and does not, by
itself, block implementing the production AF exporter. Representative manuscript
and object coverage remain required before release. This is not a 3.2.0 release
candidate.

## Preserved baseline and scope

The checkpoint under `test-artifacts/journal/update-3.2.0/checkpoint/` preserves
313 working source files, Git status, hashes, and the previous built artifacts.
The branch was created without discarding the existing development tree.
Manifest/package remain at the preserved 3.0.2 development baseline until a
complete 3.2.0 candidate can satisfy the agreed checks. No remote publication or
installation into a live vault is part of this checkpoint.

The accepted sequence is:

1. Construct new native documents independently and pass native editing gates.
2. Capture finalized composition once and connect general/journal AF output.
3. Add bounded group/table measurement caches and verify offline size, fidelity,
   host performance, and release consistency.

The main bundle ceiling is 18,385,960 bytes; the comparable fixed-file,
fixed-compression ZIP ceiling is 13,691,969 bytes. These are the latest preserved
development baseline, not the published 2.6.1 size. This checkpoint changes
research tools only and makes no new production speed/size claim.

## Fresh constructors implemented

`scripts/affinity-fresh-document.mjs` constructs its own archive header, member
table, objects and data. It does not load a native seed, retained object graph,
external parser, or Affinity application while generating files. It uses Node
built-ins only and remains outside production imports.

- Object identities, class declarations, owned references and cyclic links.
- Both raw and compressed CRCs; contiguous members, directory records, totals.
- Pages, fills, rules, text stories, Unicode scalar style boundaries and flows.
- Native table cells, horizontal/vertical merges, repeated header fragments,
  caption/note groups, fixed widths/heights and 0.5 pt rules.
- Embedded RGBA pixel channels, shared bitmap resources, clipped child objects,
  background and editable page-number/footer text.
- Linked SVG resource metadata, independently authored embedded SVG/PDF resources,
  replaceable original PNG objects, and original source-byte retention.
- Object/footer hyperlinks and inline hyperlinks that follow native text edits.

The embedded SVG fixture contains four rectangles and an independently built
nested native document. This is not a general SVG parser or proof that arbitrary
SVG/PDF artwork is supported. All constructors remain research-only.

The writer rejects foreign references, duplicate fields, invalid/duplicate asset
names, nonfinite geometry and unsupported probe combinations. The CLI refuses
to replace earlier evidence. It is a bounded acceptance probe, not an arbitrary
snapshot-to-AF exporter.

## Native evidence

Environment: Windows, installed Affinity 3.2.3.4646. Native application use is
limited to opening, editing, saving, reopening and rendering generated probes.
The external Python/Inkscape reader is a separate private verifier and is not
copied into product code or release packages. PDF text/geometry/pixels are checked
independently with PyMuPDF.

| Gate | Evidence | Outcome |
| --- | --- | --- |
| 1: text/styles/shapes | `fresh-page-05` → native edit → saved/reopened AF → PDF | Passed: exact Unicode story, font roles, background, rule and frame geometry |
| 2: linked flow | `fresh-flow-02`, two pages/four frames | Passed: insertion/deletion across formatting/paragraph boundaries; content moved across columns and pages; all 12 markers and final text survived |
| 3: native tables | `fresh-table-04` → `fresh-table-04-reviewed` | Passed: 30 visible cells checked, column/row merges, two header tiers, repeated fragments, caption/notes, native header edit, 0.5 pt rules |
| 4: pixel subset | `fresh-images-04` → `fresh-images-04-edited` | Passed: three objects, shared bitmap, crop, alpha, 1.2 pt native nudge, save/reopen and PDF pixel checks |
| 4: linked SVG | `fresh-images-08` → native edit/save/reopen → PDF | Freshness warning resolved on this Windows host; four vector paths retained. Alpha quantizes by one 8-bit level, recorded explicitly |
| 4: embedded SVG/PDF | `fresh-images-10`, `12` → edit → copy AF alone to a new directory → reopen → PDF | Original bytes, four vector paths, alpha, dimensions and native position changes preserved |
| 4: original PNG | `fresh-images-13` → edit → replace original in native UI → save/reopen | Editable `ImgN`, original PNG bytes, dimensions and link retained; PDF color failure isolated below |
| 4: linked ZIP | `linked-relocation-14.zip` → extract to a Korean-named directory → edit/save/reopen → PDF | Relative link resolves with the recorded absolute source path absent; native save updates the path to the extracted asset |
| 4: hyperlinks | `fresh-images-15` → insert `INLINE-EDIT ` → save/reopen → PDF | Exact Unicode story, four links; inline link still covers only the italic target text |
| 4: combined AF + native PDF assets | Combined checks in `check-affinity-assets.py` | **Not passed**: transparent PNG native PDF-output fidelity remains unresolved. This broader result is not synonymous with editable AF integrity; see acceptance boundary below |

Frame/table dimension differences in the accepted probes were below 0.001 pt
(the allowed threshold was 0.5 pt). PDF page dimensions were within 0.5 pt.
Native AF retains Korean, an emoji and a supplementary-plane mathematical glyph.
The native PDF represents the color emoji as vector paths, so searchable-text
coverage separately accounts for that glyph rather than dropping it from the AF
content test.

The pixel probe is intentionally 96×64 pixels enlarged on the page. Affinity's
low-DPI warning is expected for this synthetic test and was recorded before
exporting. It is not an exception to final manuscript image-quality checks.
The image nudge causes Affinity to allocate a separate bitmap for that instance;
the other two retain the original shared pixel bytes. A pixel layer is not proof
of a placed, replaceable original-image resource.

## Failures retained and corrected

- A nonzero `Sprd.fspo` for the second independent single-page spread caused
  native application termination. Fresh single-page spreads now use zero.
- Geometry at 72 document DPI rounded outside the 0.5 pt page-size threshold;
  300 DPI with explicit point conversion passed.
- Paragraph breaks at every cell end introduced an extra blank line and expanded
  24 pt rows. Cell separators now use native break glyphs without that paragraph.
- Horizontal continuation uses `BrLf`; vertical continuation uses `BrTp`.
  The earlier `BrUp` experiment shifted cells and is retained as a failed probe.
- A native edit that left only the last character failed the independent cell
  check. The corrected text-tool edit is the `reviewed` artifact used for passing
  evidence.
- PNG backing data alone produced broken/blank image rendering. Explicit planar
  channel members render correctly and preserve all source pixels. That success
  does not validate the discarded backing-data approach.
- The initial combined UI-cycle script was unreliable around asynchronous
  dialogs and was removed. Individual native steps were verified separately.
  Keyboard input now checks the selected research tab, foreground process and
  absence of a file dialog before sending input.
- Linked-resource freshness on the observed Windows build uses a source mtime
  adjusted by the local timezone offset. The observed UTC+9 differential is
  regression-tested; other hosts/timezones are not claimed to be validated.
- `fresh-images-09` had original SVG bytes without a complete embedded native
  vector document and terminated the native application. `fresh-images-10`
  adds an independently authored nested document; the failed probe is retained.
- An embedded source PNG uses an `ImgN` and encoded backing resource with the
  native decode state. This differs from the earlier failed pixel-layer backing
  experiment; independent raw pixel layers retain their verified contract.

## Color investigation: distinguish saving from exporting

The user correctly required controlled document/export settings before
attributing the color discrepancy to the writer or native application. Earlier
PDF checks did not adequately record these settings. That verification gap is
corrected with dialog captures and `scripts/check-affinity-color.py`.

Observed reopened research document: RGB/8, sRGB IEC61966-2.1, 300 document DPI.
The direct PNG control is 96×64 RGBA/8 in sRGB at 72 DPI. PDF image data retains
96×64 dimensions, three color channels and alpha 128 at the affected sample;
there is no observed switch to CMYK or image resampling in these cases.

| Controlled stage or change | Measured result |
| --- | --- |
| PNG opened directly in native app, exported to PNG | All RGBA pixel bytes identical to source |
| Same document saved as AF, closed, reopened, exported to PNG | All RGBA pixel bytes still identical to source |
| Native direct PNG → PDF, before saving any AF | Semi-transparent dark-blue sample differs; opaque samples match |
| Placed PNG → PDF with only image color-space conversion disabled | Same discrepancy |
| Direct PNG → PDF with downsampling disabled | Same discrepancy |
| Reset to Digital High Quality PDF preset, 300 raster DPI | Same discrepancy as the earlier 72 raster DPI setting |
| Saved/reopened native AF → Digital High Quality PDF | Same discrepancy, not newly introduced by saving |
| Exact-pixel PNG carrying native sRGB ICC profile → PDF | Same discrepancy |

At the half-alpha sample, source RGBA is `(20, 40, 80, 128)`. Expected standard
sRGB-over-white output is `(137, 147, 167)`; native PDF renders approximately
`(219, 220, 222)`. The PDF stores RGB `(186, 187, 192)` with the original alpha
128. MuPDF and PDFium reproduce the discrepancy independently. Unchanged
opaque samples and exact PNG roundtrips narrow the investigation to the PDF
export/conversion path, but do not establish which setting or internal code is
responsible. **This record does not classify it as an Affinity application bug.**

Evidence: `fresh-native-color-investigation.json`, `color-export-*.png`,
`color-document-15.png`, and the six PDF variants retained under the private
3.2.0 artifact directory. No source recoloring, destructive flattening or alpha
removal was used to force a passing result. Native-save fidelity and final PDF
color fidelity remain separate acceptance requirements.

## Acceptance boundary: editable AF versus native PDF output

The product objective is to hand off an editable AF document containing the
composition: connected text frames, independently editable objects, native tables,
embedded originals and retained geometry. The existing direct HanMark PDF path
is a separate output. A discrepancy also reproduced by opening the same PNG
directly in Affinity, without our writer, cannot alone establish failure of that
editable-AF handoff.

- **Required for editable AF release:** independent generation, expected object
  types/identities, text and table coverage, frame connections and reflow, source
  asset bytes/alpha, crop and geometry, layer ordering/group behavior, relocation,
  and native edit/save/close/reopen integrity on representative documents.
- **Separate native PDF compatibility check:** preserve all color-discrepancy
  evidence and compare our output with a matching native-only control. A new
  discrepancy specific to our AF remains a writer regression. The reproduced
  control discrepancy remains an open compatibility issue, rather than an
  unconditional stop on AF-export implementation.
- **What passed is bounded:** synthetic text/flow/table/image/vector/link probes.
  The four-rectangle vector fixture is not arbitrary artwork support. Layer
  construction/grouping is not proof of all native reorder/ungroup operations.
  Representative long manuscripts, more complex graphics, repeated editing
  cycles and the actual export UI still need implementation/verification.

The historical `completeGatePassed: false` and `--require-complete` exit code 2
continue to describe the combined AF-plus-native-PDF test. They are intentionally
retained, not relabeled as a complete AF-export product failure or a release
success. Implementation can now proceed to the shared snapshot and exporter;
release acceptance remains contingent on the required editable-AF checks above.

## Reproducible checks

Fixture-free structural checks:

```sh
node --test scripts/test-affinity-fresh.mjs
```

Thirteen tests cover deterministic fresh generation, compressed/raw archives,
roundtrip field serialization, corrupt CRC rejection, owned references, duplicate
fields, Unicode, namespace validation, every pixel channel including alpha,
resource metadata, exact encoded originals, nested fresh vectors and PDF syntax.
They do not substitute for native rendering.

Private acceptance reports, after the observed native cycles and independent
readback reports exist:

```sh
python -X utf8 scripts/check-affinity-fresh.py
python -X utf8 scripts/check-affinity-assets.py
python -X utf8 scripts/check-affinity-color.py
python -X utf8 scripts/check-affinity-assets.py --require-complete
```

These write the earlier gates, the extended asset report and the stage-specific
color investigation. The final command deliberately exits with code 2 while
the combined AF-plus-native-PDF check is unresolved. Passing partial checks must
never be interpreted as `completeGatePassed: true` or completed product validation.

Pre-integration checkpoint checks: all 346 existing tests and all 13 new research tests
passed. All 134 checked baseline production source/asset/metadata files were unchanged.
`main.js` remains 18,385,960 bytes, SHA-256
`cc5bda567a9100ea68388839628d2ac72110e5ffb26f4d6fad11df40f46b9731`.
The current constructors reproduce all four accepted fresh probe files byte for
byte. Details are in the private `implementation-status.json` report. The full
corpus/host benchmark and release checks were not rerun for this research-only
checkpoint; they remain required after production changes.

## Remaining implementation, in order

1. Extend output-only `EditableLayoutSnapshot` with finalized source ranges,
   frame links, resolved table fragments/merges/notes, crops and furniture. Keep
   saved projects compatible. Writers consume those decisions without measuring
   or paginating again. Fix inherited IDML empty/overset frames. General single
   column retains Chromium pagination; ambiguous PDF/source mapping blocks AF.
2. Extend native AF validation to representative artwork/manuscripts, explicit
   layer reorder/ungroup operations and repeated edit/save/reopen cycles. Track
   the transparent-PNG native PDF conversion issue separately with recorded
   settings and the native-only control; do not alter source colors to hide it.
3. Add general/journal AF controls and ZIP output (AF, reference PDF, original
   assets, font list and report), cancellation/stale-result guards and explicit
   unsupported-object failures. Do not redistribute fonts.
4. Preserve per-numbering-pass typography memoization; add bounded byte/count
   caches at the existing six-paragraph candidate-group and table measurement
   boundaries without changing search quality or decisions. Keep worker restart
   behavior and all offline Typst/OCR resources.
5. Run the 28-project exact regression, 14-page Markdown fixture, general PDF
   matrix, AF geometry/coverage and ten-run Windows host measurements. Only then
   align 3.2.0 version/release files and build a local candidate. macOS hardware
   validation is excluded by the user's decision; macOS CI remains required.

There is no AF product button, engine replacement, production size/speed claim,
or completed 3.2.0 release at this checkpoint. The original Markdown/DOCX model
remains the source of truth; native edits are a final handoff, not roundtrip input.

## Subsequent production checkpoint

[R-034](R-034-finalized-editable-layout-capture.md) records the shared-layout changes,
new validation and 28-project PDF regression. Its source/build status supersedes
the unchanged-production-source statement above; full AF integration remains pending.
