# Launch media · 0.1.1

## Message

**Your words. A journal.** Write in Markdown, choose the journal, compose. Keep a final edit within reach with PDF and editable Affinity output.

The main demonstration gives Markdown the most screen time. It changes a title, shows the abstract property, headings, an image link and a table; composes; changes Journal of Achmage to Journal of Command & Space; exports; and briefly opens the generated AF at the end. The interface and document are real. Waiting and file selection may be shortened in the edit. No generated interface footage or invented performance percentage is used.

## Deliverables

- English and Korean working guide, with two original figures and two tables.
- Built-in Journal of Achmage and Journal of Command & Space; portable template ZIPs; vector PDF logos.
- Separate English and Korean 90-second demonstrations and 15-second teasers.
- Five gallery images per language, 1200 × 800; YouTube thumbnails.
- Short captions and music credits; no narration.
- Plugin files separate from the optional sample and media downloads.

## Publication destinations

- Source and downloadable files: `laguna821/achmage-academic-editor-ultra`, release `0.1.1`.
- YouTube channel selected by the author: [Changhyun Ahn](https://youtube.com/@changhyunahn6328).
- Obsidian gallery: still images. The [directory guide](https://docs.obsidian.md/community-directory/manage-entry) specifies up to five 1200 × 800 JPEG/PNG/WebP images, under 5 MB each. The README links to video.
- Large optional files belong in [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), not Git history. Each asset must remain under 2 GiB; these videos target under 100 MB.
- Video: H.264 in MP4 with AAC audio and fast start, following [YouTube's upload guidance](https://support.google.com/youtube/answer/1722171).

## Reproduction

1. `npm run check`
2. `AAEU_KEEP_OPEN=1 node scripts/test-welcome-host.mjs` (Windows, isolated test vault)
3. `node scripts/test-welcome-presets.mjs`
4. `node --import tsx scripts/pack-launch-samples.mjs`

The recording helpers are local production tools. OBS configuration, authentication, personal vault paths, raw takes and machine-specific verification data stay under ignored directories or the local portable OBS profile. They are not plugin dependencies.

## Music credit

Dream Culture — Kevin MacLeod (incompetech.com). Licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). ISRC USUAN1300046. An excerpt is trimmed and faded for the demo.

The artist's [license page](https://incompetech.com/music/royalty-free/licenses/) and track catalog accompany the private production provenance. Repeat this credit and the license link in every uploaded video's description and the media download package.

## Claims that stay precise

The demo proves this sample and these supported export features. It does not claim universal AF fidelity, perfect automatic APA interpretation, automatic recovery of missing research data, or a published journal's endorsement. Crossref lookup proposes bibliographic matches for review. Changes in a design application do not synchronize back into Markdown.
