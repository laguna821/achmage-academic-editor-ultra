# R-035 — Native manuscript authoring and continuous text flow

## Decision and acceptance boundary

The first real manuscript now reaches a freshly authored AF document through
the shared version-2 layout snapshot. Initial generation uses our own registry
and archive writer, without an AF seed, a native application, or the external
AF parser. This remains a **research writer**, not a released plugin control.

The user's continuous editing requirement is mandatory: the main body must be
one story threaded through first-page left, first-page right, next-page left,
next-page right, continuing through the final body frame. Page furniture,
correspondence, captions and editable tables have their own stories. They must
not interrupt or become part of the main-body story. Native reflow through
existing frames is distinct from automatic new-page creation or moving floats
after an external edit; the latter are not established by this probe.

## Implementation

- `scripts/affinity-snapshot.mjs` maps captured text, styles, frames, native
  tables, embedded vector-PDF resources, shapes and object groups to AF.
- Each complete logical body story has one `Stry` and one ordered `TxFl.Nods`
  list. Every frame points back to that same story and flow, across pages.
- Reuse the shared layout validator immediately before writing. Cached issue
  lists alone cannot permit broken links, cycles, repeated orders, omitted
  frame content or discontinuous character ranges.
- Emit the ordered flow map in the research report. Keep Unicode source text
  intact; convert UTF-16 source positions to native scalar counts once.
- Place the abstract background behind the text. The initial real-manuscript
  probe exposed a layer-order error; variant 02 corrects it.
- Reject unaccepted inline-image, script-position and crop mappings rather than
  omit them. A test caught empty-text inline images bypassing the glyph guard;
  content traversal now rejects those too.
- Extend the read-only native inventory with page, source name and story IDs.
  The separately installed GPL reader remains a private verifier only.

## Actual native editing evidence

Manuscript: **Biodigital Hypnotherapists and AI Therapy: Key Psychological and
Clinical Risks Explained** (`v9-1-article-84`). The captured result has 13 pages,
56 text frames, **26 body frames in one flow**, one 11 × 3 table and two branding
images. This specimen has no research figure; broader artwork remains pending.

Initial `manuscript-84-03.af` is 69,140 bytes / 602 native objects, byte-identical
to variant 02 used in the successful native test. Its SHA-256 is
`e51f085d09adbb394529e8f15c37a8f3e6871211817f010ce4d666347cc772d5`.
Brand SVG originals were retained; derived vector PDFs and their preview caches
were prepared with PyMuPDF. Source asset bytes were recovered from the existing
editable package; its IDML layout is **not** used to author AF. Fonts are resolved
from installed faces and are not redistributed. Preparation is still a private
research step, not a finished general asset-conversion pipeline.

In **Affinity 3.2.3.4646 on Windows**:

1. Opened the independently generated manuscript; native flow lines connected
   the left/right columns and continued towards the next page.
2. Inserted `FLOWCHECK` and a paragraph break at the beginning of the first
   body frame. The last word `authors.` of page 1 right moved to page 2 left.
   Boundaries of page 2 right and page 3 left also changed.
3. Saved a new AF copy, closed its tab, reopened it and exported all 13 pages.
4. Removed that exact test paragraph, saved another copy, closed/reopened and
   exported again. **All 26 visible body-frame text extractions match the
   pre-insertion PDF exactly** after removing the insertion.
5. Native readback after both saves preserves the same ordered 26-frame chain,
   positions and one shared story. Complete body text equals the original plus
   precisely the deliberate insertion, then the original again after removal.

An earlier long SendKeys attempt overlapped a subsequent UI action; that run
was invalid and is not acceptance evidence. The successful test uses short,
completed operations. The helper now rejects oversized input queues and
malformed click coordinates to prevent the same testing mistake.

Evidence under `test-artifacts/journal/update-3.2.0/`:

- `manuscript-flow-verification.json` — native chain, complete stored text,
  cross-page movement, removal/reopen checks and explicit fidelity limits.
- `manuscript-flow-comparison.pdf` — first three pages before/after native edit.
- `manuscript-84-flow-edited.af`, `manuscript-84-flow-restored.af` and their
  native all-page PDFs — preserved edit/save/reopen evidence.
- `flow-reopened-after-export.png` — native thread lines after reopening.

Recheck (private native inventories must already exist):

```powershell
node --import tsx scripts/affinity-snapshot.mjs SNAPSHOT.json ASSETS.json FONTS.json NEW.af
node --import tsx --test scripts/test-affinity-fresh.mjs scripts/test-affinity-snapshot.mjs
node --import tsx --test tests/editable-layout.test.ts
python scripts/check-affinity-manuscript-flow.py test-artifacts/journal/update-3.2.0
```

The last command writes new evidence and refuses to overwrite its JSON report.

## Remaining fidelity and product work

**The body is complete in the AF story, but the native PDF does not yet expose
its complete tail.** The 13-page frame geometry is preserved while native line
composition differs from Typst; the final references overset the last frame.
Explicit soft breaks inside justified paragraphs also cause stretched words.
Do not solve this by dropping text, shrinking fonts or declaring flow references
alone sufficient. Native paragraph/glyph behavior and visible-content coverage
must be fixed and checked before claiming complete output fidelity.

Other gates remain: representative research figures/inline content, native crop
and script-position mapping, table/asset edit coverage, general/journal plugin
controls, cancellation/stale-result guards, and final performance/size checks.
There is no release, live-vault installation or claim of universal AF support.
The native-only transparency/PDF issue remains separate as specified in R-033.

Validation this step: **356 project tests**, **16 research writer tests**, lint.
The new IDML regression follows one body across three pages/six columns and
checks furniture isolation. Only research scripts, tests and records changed
in this step; production `main.js` remains 18,393,801 bytes with SHA-256
`f2751c2cc264428c71d1472d59bd69b8063307b2e78d89935417c6112a251307`.
