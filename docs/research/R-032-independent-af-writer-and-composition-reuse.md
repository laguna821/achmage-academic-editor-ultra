# R-032 — Independent AF writer research and composition reuse

Status: local development. The native exporter product gate is **not passed**.
No release, version change, live-vault installation, or AF export button is included.

## Native experiment: evidence and limits

The isolated research tools generate archive bytes with Node and its existing
zlib, without calling Affinity. They preserve synthetic document objects from
the earlier IDML test; they do not use a journal author's native file as a template.
The external Python/Inkscape reader remains a private extraction/verification tool,
outside production imports and packages.

- A new field walker reserializes the synthetic `doc.dat` exactly: 174,243 bytes,
  11,113 fields. Unknown primitive fields retain their original bytes.
- A controlled edit replaces the title with a longer string and updates ten
  character/paragraph run boundaries. The native app displays the new title.
- Both raw and zlib containers can be generated. The edited fixture is 3,060,491
  bytes uncompressed and 45,672 bytes with zlib. These are document sizes, not
  plugin sizes. Existing synthetic raster resources account for much of the raw size.
- The first repack opened but failed after native save/reopen. The missing
  compressed-payload CRC was identified alongside the uncompressed CRC. The
  writer now updates both CRCs, compressed byte totals, member-table length and
  chunk terminators. Earlier failed files remain private diagnostic evidence.
- `edited-checksummed.af` opens in installed Affinity 3.2.3.4646, can be saved as
  `checksummed-resaved.af`, and reopens without the previous corruption warning.
  The longer title remains visible. Native PDF export produces four pages and
  retains the edited title as searchable text. Both saved files parse back with
  17 text frames, 13 stories and the inherited seven-frame flow intact. This does
  not validate creating a new frame graph or fixing the fixture's overset content.

**This is not arbitrary manuscript-to-AF authoring.** New pages, shared-object
lifetimes, fresh threaded-frame graphs, full paragraph attributes, native table
row/cell construction, resource ownership, crop transforms and font metrics have
not been implemented as validated constructors. The fixture retains original
object definitions, layout and resources. Inherited empty/overset abstract/table
frames in the earlier IDML fixture are not cured by changing its storage format.
Therefore no general/journal AF output is exposed, and there is no implicit
fallback to requiring an Affinity installation.

Research files:

- `scripts/affinity-research-extract.py`: read-only synthetic fixture extraction.
- `scripts/affinity-research-document.mjs`: lossless field walker/writer.
- `scripts/affinity-research-edit.mjs`: narrowly bounded text/run edit; rejects
  replacements crossing formatting boundaries or unsupported text cases.
- `scripts/affinity-research-container.mjs`: independently written container.
- `scripts/test-affinity-research.mjs`: raw/compressed CRCs, offsets, lengths,
  chunk ends, exact field round trips and truncated-document rejection.

Private artifacts: `test-artifacts/journal/af-independent/`. Only checksummed
outputs should be used for subsequent native validation. Do not redistribute
the retained synthetic fixture as an allegedly sanitized generic AF template.

## Production-side refactor

1. Activated one typography result entry per numbering pass, at most five per
   composer. A single slot initially thrashed between original and final object
   numbers in the long fixture (zero hits); the multi-pass check caught it.
   The key includes
   rendered paragraph expressions, raw runs, quality settings, width, preamble,
   actual loaded-font fingerprints and engine-file hashes. Failed, cancelled and
   superseded work cannot replace a newer entry. Callers receive independent values.
2. Reused the measured typography result on unchanged body input, avoiding another
   candidate search. The existing worker restart after the quality phase still
   occurs, including on cache hits, preserving the WASM lifetime/memory bound.
   Recomposition/rendering and coverage checks still run; an edit is not assumed
   to affect only its current page.
3. Made measurement invalidation depend on actual engine-file/font fingerprints.
4. Captured resolved styles, heading gaps, master and spacing once for an editable
   composition. The IDML adapter consumes those values instead of re-resolving
   them from a normalized source project. Complete explicit figure/table plans
   and a general PDF editable adapter remain future work.
5. Losslessly packed the existing worker script with the existing resource codec.
   Its original bytes/hash and static-code boundary remain verified. Decoding
   occurs only on journal initialization and is shared across worker restarts.
   There is no remote code loading, added codec, or loss of Typst/OCR functions.

## Verification contract

The checkpoint at `af-independent/baseline` preserves the relevant working source
before this refactor. A separate baseline build includes the in-progress IDML work;
it is not the earlier published 2.6.1 or the older 3.0.2 package.

Saved-project regression checks PDF bytes, page count, boxes, issues, coverage,
adjustments and numbering against the earlier frozen outputs. The 28-document
run passed after exact font setup was supplied. The test harness was also fixed:
missing saved-project font bytes and HTTP error responses now fail immediately,
instead of being interpreted as font files. The discarded missing-font run is
not evidence of a production regression or a valid equivalence test.

Cache checks compare warm results with fresh full composition after metadata,
body text, column-gap, undo and cancellation scenarios. Benchmarks distinguish
first composition from ten repeated and ten publication-date edits. Browser
measurements are not described as actual Obsidian-host measurements.

Final numerical reports and remaining limitations are recorded in the private
`verification-summary.json` artifact. The research writer
is excluded from the production import graph. Complete native authoring remains
gated on fresh-document construction and native editing/reflow/save/reopen/PDF
coverage, including tables and figures, for both standard and journal modes.

### Completed output and size checks

- Final saved-project rerun: 28 manuscripts, PDF bytes and all six layout/check
  fields identical. Existing source warnings/errors remain visible; equality is
  not a claim that the earlier publication-fidelity gaps are solved.
- Achmage Markdown: 14 pages, PDF bytes and layout/check fields identical.
- General PDF: 14 one-column/A/B, table-width and section-break combinations;
  all 11 images, source blocks and table cells survive the applicable checks.
- The synthetic IDML snapshot and complete export ZIP are byte-identical before
  and after the resolved-style change. Native IDML capacity issues remain open.
- 346 tests pass, as do lint, type checking, build, bundle/Community checks and
  existing version consistency checks. No dependencies were added.

| Size comparison against this turn's working-source checkpoint | Before | After |
|---|---:|---:|
| `main.js` bytes | 18,403,909 | 18,385,960 |
| Same-files DEFLATE ZIP bytes | 13,692,629 | 13,691,969 |

This saves 17,949 raw bundle bytes and 660 ZIP bytes. It is a small reduction,
not a multi-megabyte compression result. Typst, OCR and packaged fonts remain.
The ZIP comparison uses identical manifest, CSS, notices and quick-start files,
a fixed timestamp and compression level; it does not create a new release.

The exported artifact names deliberately stay in `test-artifacts`. The prototype
is not installed into Achmage, the production manifest remains 3.0.2 on the local
3.1.0 development branch, and no remote branch/tag/release is changed by this work.

The 24-page browser harness (ten warm samples, ten publication-date edits)
measured median repeated composition at 4,375.95 → 1,983.35 ms and metadata
recomposition at 4,386.45 → 1,969.80 ms. Warm compiler calls are 28 → 2, metadata
calls 29 → 3. The final multi-pass cache records 44 hits and eight misses across
the complete mutation/undo check. One first-composition sample is insufficient
to claim a first-run speed improvement.

### Actual Obsidian verification

The existing 24-page benchmark runs in isolated local vaults, with the exact
checkpoint/current bundles and identical fonts/assets. Ten plugin reloads per
build include first composition, warm composition, volume metadata edits, OCR,
view close/unload and forced GC. This is not an OS-cold reboot benchmark.

| Median (ms), ten samples each | Checkpoint | Refactor |
|---|---:|---:|
| Plugin load | 254.05 | 252.00 |
| First composition and preview | 16,097.35 | 16,109.35 |
| Same manuscript repeated | 5,653.25 | 3,007.40 |
| After volume metadata edit | 5,298.85 | 2,888.25 |
| First OCR | 385.75 | 382.55 |

Repeated composition improves 46.8%; metadata recomposition improves 45.5%.
First composition is effectively unchanged (+12 ms / 0.07%). Across all 20
runs, PDF hashes, geometry, metadata-edited PDF hashes and OCR candidates match;
the editor instance is preserved. This does not claim accelerated composition
after arbitrary body/font/geometry changes.

Sampled peak renderer private memory medians are 2,476,924 → 2,350,842 KB;
observed maxima are 2,591,716 → 2,497,840 KB. After close/unload/GC the medians
are 486,910 → 449,686 KB. These values describe the entire renderer, including
Obsidian and workers, not plugin-only allocation or a guaranteed memory ceiling.
The first current-build attempt was discarded after Electron's memory-dump API
failed. The harness now records missing samples and requires at least 90%
successful sampling in the report gate. The completed current run has nine
missing memory samples; this sampling limit is retained in the evidence.

Performance raw data: `af-independent/host-benchmark/performance-{baseline,current}.json`.
The final report also asserts that no AF research writer or external AF reader
appears in the runtime bundle's import graph. Windows verification is complete
for this scope; macOS native-device testing remains excluded by user direction.

## Next native gate

Build a fresh one-page text/rule document from a documented minimal object schema,
without retaining a whole native source. Then construct and edit a new two-page,
four-frame story; finally add native table/caption/note and graphic resources.
Every stage must pass native save/reopen and source coverage before proceeding.
Byte-exact round trips and controlled edits are prerequisites, not substitutes for
these construction tests. The current investigation has not established a date
or bundle budget for a complete native writer.
