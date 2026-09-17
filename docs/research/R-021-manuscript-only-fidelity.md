# R-021 — Original-manuscript-only fidelity contract

Date: 2026-09-16. Status: REQUIRED verification contract; intake implemented, full composition equivalence open.
Baseline: published 2.6.1 `a31a191d21cbb21e45d6ce76bdf187ca5b2502ff`; development branch 3.0.0.

## User requirement

Dry-run all Original Articles in HNMR 10(1), 9(2), and 9(1) using only the original manuscript DOCX. The separately extracted Figures/Tables DOCX files must not be used. Compare every output with the published PDF, including fonts, wrapping, fine spacing, page boundaries and elements not obvious at ordinary zoom.

This replaces the earlier author-package-based acceptance input for this corpus test. The product may still import attachments when an editor explicitly supplies them. A fixture assembled from publication PDF text remains useful for testing a master, but is never evidence for a manuscript-only result.

## Separation of inputs and comparison

- Pin each DOCX by SHA-256; preserve its bytes. One source per article, including only media/charts/tables actually embedded in that file.
- Pin the published PDF independently by SHA-256. Its text can identify the corresponding manuscript and measure output differences, but cannot fill generated article content or missing metadata.
- Journal master assets, registered fonts and preset geometry are configuration. Distinguish them from article-specific missing data.
- Retain source-node, table-row and cell identifiers throughout import, composition and comparison. Use text/glyph and object checks as well as raster overlays; visual similarity alone cannot pass omissions or substitutions.
- The historical match must use the relevant original geometry. R-020's uniform 4 mm gutter is a new unified design choice and does not demonstrate identical historical wrapping.
- Record renderer/font versions and hashes, source and preset hashes, source decisions, output hash and comparison artifacts. Never rely on a live network result for reproducible re-composition.

## Failure categories

1. Import or mapping defect: source content exists but is lost, misclassified, changed or not assigned to the right role.
2. Composition defect: correct content is present but font, layout, rule, placement, wrapping or pagination differs.
3. Source/publication difference: the final PDF contains editorial changes or assets absent from the input. Identify the exact gap; do not reconstruct silently from the reference PDF or label it a pass.
4. Unresolved source decision: tracked changes, competing versions or unsupported structure needs a recorded decision.

The requested target remains complete equivalence. No arbitrary image-similarity percentage is an acceptance shortcut. Measurement roundoff and rasterizer antialiasing must be reported separately from actual font/glyph/geometry differences.

## Reproducible intake

`scripts/inventory-manuscript-only.py <HNMR management folder> <research corpus folder>` reads original DOCX and oracle PDFs, identifies split titles or matching body sequences, and deduplicates identical source bytes. A pairing score is not a fidelity score. Absence of a label is a detection finding, not proof of missing content.

`node --import tsx scripts/test-journal-manuscript-only.ts` reads the resulting pinned manuscript paths and hashes. It never opens the publication PDF or a separate title/table/figure file. It saves the semantic project and immutable original/media bytes under ignored `test-artifacts/journal/manuscript-only/`.

Observed checkpoint:

- 22 of 22 articles paired to one unique source; identical copies are recorded as duplicate paths. No read/import errors.
- 19 title matches; three manuscripts paired by body sequences because no matching title was detected in their front matter. One of these starts directly at Introduction and has no detected abstract label. Manual inspection confirmed these starting structures; article-specific metadata cannot be borrowed from the PDF.
- Source-backed front matter now maps 19 titles and two author records. Original paragraphs and mapping rules remain in the project ledger and article inspector for review. Three manuscripts have no detected title, and most blind manuscripts have no author metadata; these are not filled from publication PDFs.
- One source retains 446 pending change records, including unsupported format/move changes. This is not a clean final-text input yet.
- Package-media counts and imported figure counts differ for some papers. Header/footer media, unused package assets, repeated images, inline drawings and chart/OLE data must be reconciled before declaring loss or completeness.

## Intake fix prompted by the corpus

Authors used unstyled `Introduction` / `1.0 Introduction` text, standalone `Keywords`, keywords after an explicit Word line break, and `Abstract:` / inline `Abstracts:` labels. The original importer could collect dozens of body paragraphs into the abstract or fail to identify it at all.

The importer now recognizes these explicit boundaries, retains inline emphasis/revisions and origin text when removing an inline label, and does not consume a new section as an empty keyword list. Structured abstract subheadings remain in the abstract. Very long unresolved abstracts produce a review warning.

Regression tests cover these variants and source provenance. Re-importing all 22 inputs corrected four extreme abstract counts (162, 113, 78 and 68 paragraphs) to 1, 3, 1 and 1 respectively. Two previously undetected abstracts are now recognized. Full content conservation, article metadata mapping and composed-PDF comparisons remain required.

## Source-only composition checkpoint — 2026-09-16

- The 22 isolated imports contain 69 tables, 793 rows, 3,464 cells, 26 figure placements and 24 assets. Counts do not certify completeness.
- Three PNG figures in article 91 were named `.tmp` inside the DOCX package. Image relationships, declared content types and binary signatures now identify them; original bytes and hashes are retained. The otherwise unplaced media item in article 94 is a Word picture bullet referenced by numbering relationships, not a missing research Figure.
- Title/subtitle/running-title extraction retains original paragraphs. Source-only author/email/institution candidates and inferred headings are flagged for human review. Word styles/mappings take priority; unstyled numbered headings and short standalone section labels now receive heading roles and spacing. Ordinary prose, lists, caption labels and pending revision runs are excluded from heuristic heading detection.
- Leading spaces and zero-width characters no longer add to preset paragraph indents. Captions retain inline formatting and original paragraph provenance; adjacent table notes are attached. Blank source paragraphs remain in the project but do not consume composition space.
- All 22 original DOCX files were passed independently to the real-font browser compositor. **21 generated PDFs; 15 passed the current PDF content/geometry checks.** This is not a publication-equivalence result. Article 87 failed because its embedded EMF is unsupported by the renderer; no replacement from the published PDF was used.
- All 21 generated PDFs passed the new running-rule/body separation, preceding heading clearance and first-sidebar-line alignment checks. These checks cover measured text geometry, not every possible custom master or future manuscript.
- Six generated PDFs still fail detail checks: 108 (paragraph/indent and table content/bounds), 109, 110, 93 and 85 (table content/bounds), 89 (cell glyph bounds). Wide statistical tables, URLs and other unbreakable cell content remain release blockers. Broadly relaxing the bounds checks is not an acceptable fix.
- Article 91's `Hospitalizations` text previously painted into the next cell. Explicit hyphenation in both cell measurement and final rendering fixed this specific case; implicit first-row headers now also participate in the automatic width policy. Article 91 passed 667 PDF checks and article 103 passed 304. This does not resolve all other table overflow cases.

Ignored artifacts: `test-artifacts/journal/manuscript-only/composition-results.json`, per-article `source-only-*-project.json`, `.typ`, `.pdf`, and `-detail-check.json`. Inputs are manuscript paths from the pinned inventory; the composition script does not read the oracle or separate Figure/Table/Title files. The detail checker compares emitted PDF characters against that imported project, not against the final published text. Editorial source/publication differences, pending revisions and missing metadata remain open.

## Subsequent table, media and publication checkpoint — 2026-09-16

This supersedes the 21-composed/15-detail-pass checkpoint above.

- All 22 original manuscript DOCX files now generate PDFs and pass current internal PDF checks. The final run totals 18,069 checks. These cover imported-project text, cell glyph boundaries, headings, header separation, float spacing, paired first-page areas, table notes and emitted table rules. They do not establish final-publication equivalence.
- Current-property-only DOCX parsing prevents old tracked gridSpan/format values from changing the active table geometry. Exact original change records and source bytes remain available.
- Actual-font word minima, stable merged-grid columns, scoped wrapping and superscript/subscript baseline handling address the earlier table overflow/content failures. The one packed statistical table is a reviewable reconstruction with original rows and cell provenance retained, not an automatically approved interpretation.
- Article87's EMF contains a single uncropped24-bit RGB bitmap. A conservative decoder preserves every pixel in a derived PNG and retains the source EMF. It refuses unsupported vector/drawing/cropping records. This is not general EMF support.
- Article108's Chinese character was missing under Latin-only registration. The private corpus harness explicitly registers the locally available SimSun TTC where Han content exists. The product supports ordered registered fallback families; proprietary font bytes are not bundled.
- APA-style tables now use the configured uniform black rules and associate general/specific/probability notes with the final fragment. The expanded PDF checks include note appearance exactly once, final-fragment placement, rule coordinates/color/thickness and solid strokes. The statistical source interpretation still needs editor confirmation.
- 293 JavaScript tests/19 suites, lint, type/build, bundle and Community checks pass. Browser engine reproducibility/cancellation/network isolation, master 22 measurements, long abstract 31 checks, synthetic detail 419 checks and isolated-host publication 12 PDF checks pass. No macOS hardware claim is made.

R-023 documents metadata confirmation and consecutive heading controls; R-024 documents the source-cleaning and table policies. Existing unresolved metadata, change decisions, source/publication differences, full APA/citation semantics, Markdown adapter and broader composition quality gates remain open. No3.0 release is declared.

## Sources and artifacts

- User decisions in this task, 2026-09-16.
- Read-only local author manuscripts and the 22-PDF research corpus. Private paths, article text, original bytes and generated projects remain in ignored artifacts.
- [R-019 implementation contract](R-019-journal-workspace-implementation.md); [R-020 master/spacing measurements](R-020-hnmr-master-and-spacing.md).
# 2026-09-16 후속 주석·숫자 단위 검증

[R-025](R-025-table-note-grammar-and-readable-values.md) 적용 후 원본22편·표69개를 재출력했다. 최신 PDF 세부 검사는22/22, 18,149건 통과이며 결과는 ignored `test-artifacts/journal/manuscript-only/notes-composition-results.json`에 기록했다. 주석 유형·원본 범위·이탤릭체·줄높이·글자 경계 검사가 추가됐다. 기호 설명/조건 검토 경고5개와 기존 편집 미해결 사항은 그대로 유지하며, 출판본 완전 동일성이나 전체 APA 의미 검증 완료로 해석하지 않는다.
