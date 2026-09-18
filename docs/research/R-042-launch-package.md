# R-042 — Working guide and launch package · 0.1.1

Date: 2026-09-18. Status: implemented; publication evidence is recorded in the GitHub release and its CI run.

## Product change

The installed plugin now opens a complete English or Korean Markdown guide containing an abstract, two original figures, two tables with notes and references. It uses the same source binding and composition path as a normal manuscript. Existing sample edits are preserved; users can open them or create another copy. Concurrent creation and interrupted asset copies are covered by tests.

Journal of Achmage uses deep navy (#002E6E). Journal of Command & Space uses teal (#007F79), pink rules (#E985A2) and a pale teal abstract. Their logos are bundled vector PDFs, also available in portable templates. Switching a template leaves the article content unchanged. The guide and logos are illustrative brand presets, not evidence of a journal's endorsement.

The principal workflow is translated into English and Korean. Advanced diagnostics may still contain Korean strings. Expand proof hides the editing panels; its canvas now follows the actual display size and pixel ratio, with lazy rendering, bounded bitmap size and cancellation of stale previews.

## Validation

- `npm run check`: 122 tests, build, TypeScript, lint, bundle, Community and release checks passed locally.
- `test-journal-engine.mjs`, `test-journal-ocr.mjs` and generated YAML documentation checks passed.
- Production dependency audit: zero reported vulnerabilities at verification time.
- Actual isolated Obsidian host: English/Korean guides × both new brands, four pages each; PDF and AF export; zero captured runtime errors in the final run.
- Template switches preserve the serialized article; both logos contain zero raster images. The first pages of the exported PDFs also retain vector artwork.
- Responsive preview test covers repeated expansion/contraction and overlapping preview requests.
- The exported new branded AF samples were opened in Affinity for the recorded demonstration. The existing native save/reopen regression remains the baseline; this launch adds no claim that every Affinity feature is compatible.
- macOS CI remains required. macOS physical hardware was not tested, as previously agreed.

Machine-specific logs and raw screen recordings remain under ignored `test-artifacts/`. They are not public source or plugin assets. Public samples contain the product guide and authorized brand artwork, with no submitted research manuscripts or commercial font files.

## Size and distribution

The final local main bundle is 17,873,450 bytes (17.87 MB decimal). The preceding build was approximately 17.76 MB. No new runtime dependency was introduced for this launch. Videos, full sample exports and gallery images are separate optional release downloads; the plugin ZIP contains only main.js, manifest.json and styles.css.

The two approximately 90-second videos give Markdown the most time, show actual preset selection and output, then open the AF sample briefly. Fifteen-second teasers and SRT/VTT captions accompany them. The five images per language are 1200 × 800; optional YouTube thumbnails are 1280 × 720. Waiting and file selection are edited, without accelerated clicking or simulated interface footage.

Music is Dream Culture by Kevin MacLeod, CC BY 4.0, credited in the video, description and download. The channel owner's choice is to publish using YouTube's standard thumbnails until account verification is completed.

## Boundaries

Reference suggestions still require review. Missing manuscript facts are not invented. Affinity may reflow text; inspect the final frame after edits. Design-tool edits do not synchronize back to Markdown. Community directory submission is a separate step and is not represented as completed by this release.
