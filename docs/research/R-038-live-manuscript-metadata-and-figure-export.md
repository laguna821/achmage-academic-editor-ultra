# R-038 — Live manuscript metadata and figure export

Date: 2026-09-17. Development branch: 3.2.0; manifest baseline remains 3.0.2.

## Reproduction

The author's DOCX begins with Abstract. Its body and core properties contain no article title, author list or correspondence information. The review renderer supplied a Korean title prompt to an English-only font set, producing missing-glyph boxes. Blank correspondence was shown without explaining the missing source metadata.

A Word chart with no embedded preview produces an explicit missing-image figure. PDF already reserves a replacement position. The editable adapter instead looked up an empty asset ID and threw an uninformative error before AF generation.

An additional import error attached consecutive below-image captions to the following image. In the live manuscript this shifted Figure 1, 3–7 and left two captions as body paragraphs. The original chart is Figure 7, not Figure 6.

## Changes

- PDF and editable exports share readable review placeholders. Source title and correspondence values stay empty; no metadata is invented.
- Inspector shows missing title/correspondence and direct entry controls, plus a source-image connection action for each missing figure. Missing title/correspondence blocks final academic PDF output.
- Editable exports retain the exact measured image rectangle and caption using the same explicit replacement SVG as review PDF. They retain source-error severity in export warnings; missing images are never classified as successful source restoration.
- AF package reports retain source warnings and placeholder records.
- Live PNG-to-AF preview conversion stalled in PDF.js's accelerated image path. Disabling offscreen canvas and ImageDecoder for AF resource previews completed all ten resources. This only changes preview decoding; original asset bytes and embedded PDF artwork remain intact. The two options were disabled together, so the individual failing browser primitive is not isolated.
- Caption direction is learned from unambiguous surrounding source objects before captions are removed. Same-paragraph images remain preferred. An already assigned object cannot take another caption. Above-image and below-image sequences are tested independently.

## Live project preservation

The live project's original DOCX was reimported into an in-memory project. Caption corrections were matched by original XML location/occurrence and verified against image hashes and unedited source captions before applying. The existing project was saved as a new immutable revision. Body, references, assets and entered metadata were preserved; two stray caption paragraphs were moved into their correct figure captions.

Private evidence and backups: `test-artifacts/journal/live-source-fix/`. These files contain manuscript data and are not distribution assets.

## Validation

The initial change passed all 367 tests, lint, type/build, bundle, Community and release consistency checks. Actual 19-page review PDF now shows readable missing metadata labels. Figure 1–8 mappings match source order. Actual live-vault AF export completed with ten image resources (seven source bitmaps, one explicit placeholder and two brand images). This turn checks generation/package integrity; a new native save/reopen cycle is not claimed. Final post-fix checks are recorded with the private evidence.

Remaining author-input issues include the absent title/correspondence, the missing preview of the source Word chart, an in-text reference to Figures 1–10 despite only eight figure objects, and unresolved reference sort keys. No claim of publication-ready output is made for this incomplete source manuscript.
