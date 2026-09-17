# R-031 — Refactor candidates from Affinity source inspection

Status: PROPOSED, based on source inspection and the R-030 private native inventory. No performance improvement is claimed for an unimplemented refactor. Baseline: preserved 3.0.2 candidate; 3.1.0 editable export remains in progress.

Implementation follow-up: [R-032](R-032-independent-af-writer-and-composition-reuse.md)
records the exact typography cache, captured style specification, lossless worker
packing and independent AF experiments. The larger shared float/story plan and
complete AF writer remain incomplete; do not read this proposal as a shipped feature.

## What the new evidence changes

The `.af` object graphs expose a familiar model: stories, linked frames, reusable formatting, placed graphics, and local overrides. HanMark already has most of these concepts. The opportunity is to make the resolved result explicit and reusable rather than add another independent layout engine for each export format.

Published layouts also contain leading spaces, per-run overrides and retained template material. Extract common rules across documents, classify exceptions, resolve units/transforms, and compare against rendered pages before adopting a value. Do not silently replace measured 3.0.2 rules with every raw native value.

## Measured size baseline and existing timing evidence

From the preserved 3.0.2 bundle report:

| Component | Bytes in main.js |
|---|---:|
| Complete bundle | 18,369,541 |
| Typst generated resources | 9,726,371 |
| OCR generated resources | 4,782,935 |
| All remaining code/wrappers | 3,860,235 |
| Own journal modules, excluding generated resources | 288,779 |
| Journal layout coordinator | 41,224 |

Typst/OCR account for approximately 79% of `main.js`. Reorganizing the 0.289MB journal code cannot yield a multi-megabyte reduction by itself. R-028 already applied lossless resource compression. Keep offline operation, complete OCR and required fonts; distinguish package bytes, startup work, live memory and composition time.

R-028's historical Windows/Obsidian medians for a 24-page fixture were 16.051s first composition, 5.627s repeated composition and 5.281s after publication metadata edits. The prior warm-composition improvement was only 0.2%, not 20%. These are prior-version observations, not a new 3.0.2/3.1.0 benchmark.

## Concrete source findings

1. `layout.ts` owns source preparation, typography selection, bibliography ordering, front matter, heading transitions, float/table placement, numbering convergence, terminal balancing, rendering and coverage checks. Splitting files alone will not reduce this coupling.
2. At inspection time, `typographyCache` was declared but never read/written in the working source and preserved 3.0.2 snapshot. `chooseTypography` was called unconditionally; its enabled path could compile multiple candidate batches and then restart the worker. R-028's prose claiming active exact-input typography reuse did not match that snapshot. R-032 implements and verifies the reuse path with bounded entries for numbering passes.
3. Some caching already works: exact measurement strings, deduplicated requests, bounded measurement storage, file hash synchronization, per-composition source reads and queued UI updates. Preserve these rather than reimplement them under new names.
4. Table width metrics and decimal alignment use side maps associated with mutable table objects. Subsequent cloning, splitting and exporter reconstruction are easier to reason about when the finalized metrics are explicit values.
5. The developing editable exporter reconstructs captions, styles, furniture and table geometry from result boxes plus source. This creates a second place for layout assumptions and already exposes differences in native text capacity. Move this information into a single resolved composition result.

## Proposed structure

```text
DOCX / Markdown / existing HWP import boundary
                    ↓
Existing project model + reviewed cleanup + publication metadata
                    ↓
Resolved typography / master rules / table and figure plans
                    ↓
Measurements → region placement → immutable composition result
                    ↓
           PDF | IDML | future native Affinity adapter
```

Retain the existing project schema and source identifiers. This is an internal derived representation, not a new authoring format or a user-configurable layout programming language. The appearance wizard stays bounded as in R-029.

### A. Resolve rules once

Build one typed `ResolvedJournalSpec`: role fonts, heading transitions, region-edge spacing, abstract/sidebar geometry, furniture, caption/note gaps and table border policy. Renderers consume it. Keep geometry values separate from colour/logo/publication variables and documented local overrides.

### B. Resolve each float once

Represent a table as `TablePlan`: source row/cell IDs, chosen width, fixed columns, merged row groups, header repetitions, note groups and page fragments. Represent a figure as original asset + confirmed crop + caption + notes + clearance. Placement and both writers consume these plans. Preserve APA semantics and readable statistical units; do not fit content by silently shrinking text or rasterizing tables.

### C. Preserve logical stories independently of frames

Store paragraph/run source ranges, shared styles, frame links and page-specific float placements. A paragraph crossing a frame remains one paragraph. Exporters translate the result; they do not infer missing content from PDF text. Keep one text-coverage audit against the project, plus adapter-specific structural checks.

### D. Cache by true dependencies

First restore bounded exact-input typography reuse. Its key must include visible text/runs and changes, font bytes, width, applicable style/quality rules, citations/references and dependent inline assets. Do not cache failed/cancelled/stale results. Keep worker memory limits and invalidation/restart behavior.

Then distinguish edits:

- Fixed-area colour/text-only edits may reuse body measurements if they demonstrably leave body regions unchanged. They still require PDF rendering and overflow validation.
- Correspondence/abstract/title changes can alter first-page available height, so re-place dependent content.
- Font, page size, column gap, table width and heading changes invalidate affected measurements.
- Reference/order/float-anchor changes can affect numbering and downstream pages; convergence checks remain mandatory.

Any region-level reuse must fall back to full composition when dependencies are uncertain. Do not assume that only the edited page changes.

## Implementation order and gates

1. Freeze the 3.0.2 baseline and record compile counts/time by phase, cache hits, restarts and synchronized bytes. Fix the documented-vs-actual cache discrepancy first in a separately reviewable change.
2. Extract resolved style/master data and explicit table/figure plans without changing layout decisions. Keep existing PDF bytes and issue/coverage records equal.
3. Have IDML consume the same result; test edits, frame reflow, tables, links, fonts and save/reopen in installed Affinity. Only then consider a native `.af` bridge. Reading `.af` does not close this gate.
4. Introduce dependency-based reuse one edit class at a time. Compare incremental results with a fresh full composition after each mutation, including undo/reload/cancellation.
5. Profile again before changing candidate-search algorithms or merging the separate general PDF and journal layout engines. Share proven contracts/pure policies first; these engines serve different established rendering paths.

Regression: 28 saved-project outputs and the 14-page Achmage Markdown fixture; general A/B × three table widths × sections, plus one-column; malformed/long-row/merged-cell/figure-note/reference cases. Native `.af` evidence strengthens design checks but cannot make an originally absent figure appear in manuscript-only generation.

Performance acceptance: same-machine isolated Obsidian baseline/current, at least 10 runs per representative long-document scenario, median and tail timings, sampled memory and post-close behavior. Retain quality/search limits. Target improvement in warm/metadata recomposition only after measuring phase costs; no unmeasured speed or size percentage is promised. Any corrected design rule gets a separately explained visual diff rather than being hidden in an equivalence refactor.

## Decision

Proceed with shared resolved composition data and measured reuse. Do not replace Typst with an incomplete native writer, add an Affinity parser to the distributed plugin, remove cleanup/validation cases, or expand the template wizard into unrestricted layout rules. Native-format research tools stay external to the plugin.
