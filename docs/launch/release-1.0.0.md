# Academic Editor Ultra 1.0.0

Write beside the printed page. Word and Markdown now share a guided manuscript editor; Markdown changes return to the connected note.

## What changed

- Guided title, abstract, authors, correspondence, publication details, statements and running heads. Click the proof to reach the matching field. Full YAML remains available as an advanced view.
- Automatic saving after 500 ms; manual **Refresh preview** by default. Optional automatic preview waits for two seconds of inactivity. Source conflicts preserve both edits; failed composition cannot export an old PDF as current.
- Instant template switching. Three public presets and three portable template ZIPs: Academic Editor Ultra, Journal of Achmage, Journal of Command & Space. Private journal profiles remain in the user's library and are excluded from the public package.
- Figures and tables snap to **Left column / Right column / Full width**. Drag vertically, scroll at the edges, move between pages and undo the placement. A completed move triggers one composition. Captions remain attached to their object.
- Review PDFs allow editorial warnings. Final PDFs collect remaining warnings and offer an explicit override, recorded separately from review approval. Empty optional information and labels are omitted; missing artwork remains a warning.
- Korean UI when Obsidian uses Korean; English for other languages. Manuscript text is never translated.
- Native AF packages retain original PDF artwork separately from display previews, with asset hashes. Body frames remain linked through successive columns and pages. Affinity edits do not synchronize back to Markdown.

## Verification

| Check | Result |
|---|---|
| TypeScript, production build, lint | Passed |
| Automated tests | 138 passed |
| Bundle, Community policy, release consistency | Passed |
| Dependency audit, production and complete tree | 0 reported vulnerabilities on 2026-09-18 |
| Isolated Obsidian editor | Markdown writeback, external conflict, undo, invalid YAML, stale-export prevention, template rollback and real DOCX import/reopen passed |
| Placement in Obsidian | No selection jump, edge scrolling, cancellation, page change, single composition, undo/redo and full-width control passed |
| CMDS Eagle 1.8.4 | Actual paste handler with a mock upload endpoint; one upload, remote figure movement and placement persistence passed |
| UI languages | Korean and English inspected; Japanese Obsidian displayed English plugin controls |
| Native Affinity | Open, Save As, reopen and PDF export checked. Test document retained 24 frames, 15 stories and a seven-frame longest flow; both placed PDF logo hashes survived saving |

The functional editor and placement runs completed without page errors. Some screenshot-only runs recorded intermittent Obsidian `illegal access` startup events without a JavaScript stack; the captures and exports completed. These are retained in the private validation logs, not counted as a clean run. Windows was tested directly; macOS and Linux hardware were not tested for this release.

Affinity has its own text engine: inspect final line breaks and the last linked frame. Missing fonts require installation or substitution. Public presets are demonstration identities, not actual research journals or institutional endorsements.

## Package size

`main.js`: **18,235,591 bytes** (18.24 MB / 17.39 MiB). Installation ZIP: **12,107,205 bytes** (12.11 MB). Compared with the 0.2.0 candidate, the main bundle is 55,032 bytes smaller. CodeMirror core is provided by Obsidian; compiler and OCR resources remain offline.

## Install and use

Extract the three plugin files into `.obsidian/plugins/achmage-academic-editor-ultra/`, then reload the plugin. Existing settings and projects are retained. Open **Sample manuscript**, edit the guided fields and choose **Refresh preview**.

For a portable preset, choose **Template library → Import template ZIP**. A preset includes its logo assets; fonts are discovered on the computer. The five gallery images show 1.0.0. The linked 90-second videos demonstrate 0.1.1.

Community directory review and GitHub release publication are separate statuses. A release does not imply that Community review has been approved.
