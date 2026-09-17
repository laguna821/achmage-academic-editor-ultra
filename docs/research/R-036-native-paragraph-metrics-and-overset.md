# R-036 — Native paragraph metrics and visible capacity

## Scope and the meaning of overset

The real-manuscript AF prototype now preserves the complete story **and** shows
the original manuscript's complete tail inside its existing 13-page geometry.
This is a bounded native-editor acceptance result, not a finished plugin export.

Overset means that text remains in the shared story but exceeds the capacity of
its linked frames. It is not deleted text. The user reconfirmed this on
2026-09-17: an editor can add a page/frame and connect it, enlarge an existing
frame, or explicitly adjust typography. Do not force-fit every later human edit
into the original page count or label normal overset as source loss.

Product validation must keep these independent:

1. **Stored integrity:** text, cell values, frame order and story links survive.
2. **Visible capacity:** the available frames currently expose all intended text.
3. **Composition fidelity:** line breaks, paragraph positions and assets match
   the intended design within the declared bounds.

The first export should report capacity limitations. A future “add continuation
page” action must append frames to the same story; it must not duplicate the tail
into a new independent story. That product action is not implemented here.

## Changes

- Capture source block top/bottom edges, language, hyphenation, heading keeps,
  and word-spacing limits in the shared output-only snapshot.
- Convert block-edge gaps to native baseline spacing. Body paragraph after-space
  was previously added a second time. Native negative spacing is clamped; consume
  available positive before-space first, fixing the abstract-to-keyword gap.
- Preserve unresolved spacing floors in the writer report instead of reducing
  font size or leading. This specimen has tightly stacked transitions that need
  up to 1.4 pt more than the source baseline gap under current native mapping.
- Use the pinned compiler's word-space factors: minimum 2/3, desired 1, maximum
  1.5. The previous native 0.8/1/1.33 values were guesses. Character scaling,
  font sizes and frame dimensions are unchanged.
- Preserve heading keep-with-next and keep-together, and explicit column/page
  starts. Native UI save/readback established PAtt integer slots 4, 5, 2 and 9
  for keep-next, keep-together, start and auto-hyphenation respectively.
- Convert forced line breaks to zero-gap, zero-indent native paragraph
  continuations. Affinity otherwise fully justifies short forced lines, including
  labels and copyright. This adaptation is output-only, preserves source IDs and
  styling, and changes the native separator from U+2028/newline to U+2029.
- Keep source physical-page fragments inside one logical native paragraph.

Files: `src/io/editableLayout.ts`, `src/journal/editableCapture.ts`,
`src/journal/editableExport.ts`, `scripts/affinity-text-plan.mjs`,
`scripts/affinity-snapshot.mjs`, focused tests and the native evidence checker.
IDML's separate paragraph adapter was not promoted to equivalent native fidelity
by these AF-only checks. The normal PDF composition rules are unchanged.

## Native acceptance

Same R-035 manuscript: *Biodigital Hypnotherapists and AI Therapy: Key
Psychological and Clinical Risks Explained*, 13 pages, 56 text frames,
**26 main-body frames in one continuous flow**, one 11 × 3 native table and two
branding assets. Initial AF generation uses our independent writer and no AF
seed/application. A private external reader only inspects the results.

Final initial file: `manuscript-84-07.af`, **69,607 bytes**, 622 objects, SHA-256
`7b1a54a0c95e5e3b84baeaee1853f77834bcd1782ce8667facc6bafc47806dd3`.

In Affinity 3.2.3.4646 on Windows:

1. Open, save a new copy, close, reopen, export all pages.
2. Insert `FLOWCHECK ` thirty times and one paragraph break at the first body
   position, save a copy, close/reopen, export. All **26 frame contents change**,
   including first-page right → next-page left and later page boundaries.
3. The extended document oversets its final frame. The complete original body
   plus exactly the 301-character insertion remains stored. This is a successful
   integrity test with insufficient visible capacity, not data loss.
4. Remove the test paragraph, save another copy, close/reopen, export.
   All 13 rendered pages are **pixel-identical** to the initial corrected native
   PDF at the checker's default PyMuPDF raster scale. The ordinary save/reopen
   copy is also identical. Frame geometry, every flow link and all stories remain
   exact through both edits; all 33 table cells remain exact and visible.

The corrected original manuscript exposes the last Yapko reference/DOI and the
final “Mental Health” keyword. PDF extraction has one known exception: native
Calibri-Bold visually renders the `ti` ligature in “Introduction” correctly but
extracts it as `!`. Stored-text equality remains strict; the checker records the
one extraction discrepancy explicitly rather than globally replacing characters.
This is not a claim that the native PDF matches Typst pixel-for-pixel.

Evidence in `test-artifacts/journal/update-3.2.0/`:

- `paragraph-metrics-verification.json`: separate integrity/capacity checks.
- `paragraph-metrics-comparison.pdf`: before/after native pages 1, 2 and 13.
- `manuscript-84-07.af`, `manuscript-84-07-resaved.af`,
  `manuscript-84-07-flowlong.af`, `manuscript-84-07-flowrestored.af`, native PDFs
  and the two `metrics-07-*-inspected` directories.
- `metrics-06-introduction.png`: visually checked PDF ligature exception.
- `metrics-07-check.log`, `metrics-07-research-tests-final.log`.

Recheck using the preserved native evidence:

```powershell
node --import tsx --test scripts/test-affinity-fresh.mjs scripts/test-affinity-snapshot.mjs scripts/test-affinity-text-plan.mjs
python scripts/check-affinity-paragraph-metrics.py test-artifacts/journal/update-3.2.0
npm run check
```

Validation: **357 project tests, 22 research tests**, lint, type/build, bundle,
Community and existing-version release consistency checks pass. Regenerated
production PDF is byte-identical to the preceding 13-page source PDF. Prior
28-project PDF regression remains historical R-034 evidence, not a newly rerun
native corpus claim. Current `main.js`: **18,394,270 bytes**, +469 bytes relative
to R-035; the research AF writer still is not included in it.

## Next product work

1. Broader manuscript/artwork and inline-script/crop coverage, then a bounded AF
   exporter accepting the shared snapshot and resolved assets/fonts.
2. Wire journal/general export menus, asynchronous cancellation and stale-result
   guards, capacity reporting and source-linked continuation-frame management.
3. Measure resulting package/startup/export cost before a versioned release.

No live-vault installation, release tag, GitHub push or universal AF compatibility
claim is made by this step. The R-033 native PDF alpha/colour issue remains
separate from editable-file integrity.

## Primary source for typography defaults

- [typst.ts 0.7.0 pinned compiler and fork](https://github.com/Myriad-Dreamin/typst.ts/blob/v0.7.0/Cargo.toml).
- [Pinned fork paragraph limits](https://github.com/Myriad-Dreamin/typst/blob/typst.ts/v0.7.0-rc2/crates/typst-library/src/model/par.rs):
  `Limits<Rel>::SPACING_DEFAULT`, `JustificationLimits`, paragraph leading.
- Native paragraph UI edits and saved-file differences supplied the AF field
  mapping; the external reader is not part of the product writer.
