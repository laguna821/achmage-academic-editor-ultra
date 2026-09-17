# R-040 — Facing spreads and a paired native master

Date: 2026-09-17. Development branch 3.2.0; manifest remains 3.0.2. No public release.

## Requested editing structure

The user's existing Affinity document has one two-page master and document spreads containing pages 1–2, 3–4, and so on. This is an editable page structure, not a bitmap preview or a change to the PDF composition engine.

Journal AF export now defaults to **두 쪽씩 나란히 (1–2, 3–4…)**. **한 쪽씩** remains available in the same export dialog. The first page is on the left regardless of its printed folio, matching the supplied example. An odd final page remains a single left page; no empty page is inserted. This does not perform printer signature imposition.

## Implementation

- The native writer creates two `PgIn` rectangles in each complete `Sprd`, sets facing-page metadata, and offsets right-page objects into spread coordinates. Snapshot geometry and export reports retain page-local coordinates.
- One two-page `MpCh` master contains both existing running-header roles. A paired `MPIN` applies it to each complete body spread. On the first spread only the second page inherits the master; first-page publication, logo, title, abstract and copyright objects remain independent. The last single page receives only its corresponding master half.
- Master text/geometry links, native `PgNG` folios and the original start number are retained. Existing odd/even printed-folio header policy is unchanged; visual left/right positioning follows the selected spread layout. Changing the start number's parity in Affinity still requires checking header assignments.
- All body frames retain the same story and reading order: left column, right column, next page. Continuation pages participate in the same spread grouping.
- The independent inventory now resolves object transforms against the pages inside a spread. Previously, its page index was the spread index, which was insufficient for facing documents.

## Validation

Private evidence: `test-artifacts/journal/update-3.2.0/facing-probe/` and `facing-product/`.

- Three native master regression tests: original single-page mode; paired master / odd last page / native flow and coordinate checks; even page count with an independent starting folio. Source snapshots remain unmodified.
- `npm run check` passed: 373 top-level tests (the native wrapper also runs the three tests above), lint, types/build, bundle, Community and release metadata checks.
- An isolated Obsidian run exported the actual 13-page manuscript to seven spreads, one paired master, 26 linked body frames, an editable table, and two artwork objects. Repeated AF exports were byte-identical; cancellation, stale-result and duplicate-export checks passed.
- The synthetic paired master was edited in Affinity. Independent parsing confirmed both applied left-page headers inherited `PAIRED MASTER VERIFIED` after an ordinary overwrite save.
- The actual manuscript was opened in Affinity, edited, saved in place, closed/reopened, edited and saved a second time, and reopened again. Independent extraction after both cycles preserved all body text, the 26-frame reading order, seven spreads and the exact original HMRI PDF bytes. `native-integrity.json` records each file hash.
- The two-page continuation export has 15 actual pages, eight spreads and 30 connected body frames; it retains the same complete body text.
- Built bundle SHA-256: `07fcd0cec6fadde55c96be658fb03f91e317b3a4aecb29dea4ef5b2338eb8d3d`.

Native acceptance is bounded to Windows Affinity 3.2.3. Existing limitations on native reflow, separately positioned floats and cropped artwork remain as recorded in R-039. Existing AF files are not rewritten by the plugin update; re-export to obtain the new structure.
