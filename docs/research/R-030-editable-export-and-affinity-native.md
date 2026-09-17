# R-030 — Editable output and Affinity native evidence

Status: investigation and 3.1.0 implementation in progress. Last reviewed 2026-09-16.

## Output contract

Keep PDF as the composed publication output. Add an editable handoff with threaded body text, separate furniture and artwork, editable table fragments, original links and a reference PDF. Affinity is the first native validation target. External edits do not round-trip into the HanMark manuscript. Native Affinity output is an additional feasibility investigation, not a completed exporter.

The output-only `EditableLayoutSnapshot` and IDML writer are under development. A synthetic four-page journal now reaches the writer. The synthetic PDF is byte-identical with and without editable-source capture (SHA-256 `cfbf749f0d8254c012180d49003212cf2655023eff65e4b31a0d3caf7df12996`). This is one fixture, not the full regression gate.

Actual Affinity 3.2.3.4646 opens the two-page prototype with linked frames and a native merged-cell table. Explicit glyph scaling and row heights fixed initial import errors. The larger journal fixture still has overset/empty abstract and table frames. Reference emphasis capture, artwork, full source coverage, native editing/reopen/PDF comparison and general Editorial PDF modes remain incomplete. Do not ship or describe this as a finished editable export.

## Native `.af` investigation

Eight Original Article folders in the private 10(1) issue were inspected. Prefer `_pub.af`; use the working `.af` where no `_pub.af` exists (six publication files, two working files). Book reviews, cover files and separately extracted figure/table documents were excluded from this initial eight-document inventory.

- All eight binary containers and `doc.dat` object graphs parsed successfully using the separately checked-out Inkscape Affinity reader, revision `cd5cf29d5df22e07b1e9209219079ca44015b7fe`.
- Files were read only. SHA-256 before/after checks passed for every source.
- Extracted story text, glyph/font attributes, paragraph attributes, frame geometry/transforms and text-flow node lists. Longest frame chains per selected file: 25, 19, 26, 27, 32, 33, 48, 36.
- The first article's copied file opens in Affinity and visibly connects left/right columns across pages. Copying only `.af` caused a missing-linked-resource prompt. Resource packaging must therefore be validated separately.
- Raw numeric fields are not all points. Text attributes, document resolution and nested transforms must be resolved together before asserting dimensions. Parsing a field is not proof of its semantic interpretation.
- Objects may belong to masters, retained template content or unused resources. An inventory font/object count must not be described as the count of visible objects on final pages.
- Body style runs contain differing attribute values. Main stories also contain leading literal spaces. These are evidence of editorial overrides/workarounds, not a mandate to reproduce literal spaces as the canonical paragraph-indent policy.

Private evidence: `test-artifacts/journal/update-3.1.0/affinity-native/inventory/`, the first document's full object dump, copied document and native screenshots. Reproduction: `scripts/inspect-affinity-native.py --parser-dir <separate checkout> --dependency-dir <research Python dependencies> --out <private output> <files...>`.

The third-party reader and zstandard dependency are research tools under ignored test artifacts. They are not imported by the plugin, copied into its source, or included in release packages. The reader is a read path; no reliable native writer was established.

## Native automation feasibility

Installed Affinity libraries expose `Document.load`, `Document.saveAs`, `FrameTextNodeDefinition.createFromStoryBuilder`, `TableTextNodeDefinition.create`, story formatting APIs and text-flow inspection. A public wrapper for creating/linking a multi-frame flow has not been verified. The presence of `saveAs` alone does not prove that a complete journal can be created through scripting.

Affinity's official September 15 announcement confirms in-app JavaScript scripting. AI assistance is optional; a predefined local script can implement deterministic operations. No application update or MCP permission change was performed for this investigation. A native bridge, if validated later, should let Affinity write its own format. Do not implement a guessed binary `.af` writer based solely on reverse-engineered reads.

## Source of truth and validation boundaries

Markdown/author manuscript plus explicit editorial metadata remain the content sources. Native `.af` and publication PDFs are calibration/test oracles, never hidden sources of missing manuscript text or figures. Content edits made during final external review must also be applied to the source. External layout changes may remain in the final native document; re-export from HanMark does not preserve them automatically.

Sources: [Affinity scripting announcement](https://www.affinity.studio/blog/affinity-automation-scripting-claude), [Inkscape Affinity reader](https://gitlab.com/inkscape/extras/extension-afdesign), [earlier afread project](https://github.com/VMDevCpp/afread). Native API observations are from the installed `Resources/JSLib` source, not inferred from marketing claims.
