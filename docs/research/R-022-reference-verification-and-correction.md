# R-022 — DOI verification and human-reviewed corrections

Date: 2026-09-16. Status: investigated design; expanded audit/queue NOT implemented.
Baseline: 3.0.0 development from published 2.6.1. Related: R-018, R-019, R-021.

## Question and existing implementation

Can HanMark detect missing/wrong DOIs by online registry lookup, present correction proposals, and let the editor approve them without AI tokens? Yes: direct metadata retrieval, deterministic field comparison and explicit review require no LLM or embeddings.

The current `references.ts` supports direct Crossref DOI lookup and bibliographic candidate search, returning unconfirmed records. The journal workspace has a lookup button and a record-confirmation dialog. It does not yet audit all existing references, explain field conflicts, or apply a correction to an existing citation-linked record.

Read-only inspection of the installed Achmage `cmds-achmage` plugin confirmed a native Crossref provider using `/works/{doi}` or `query.bibliographic`, with metadata/update inspection. That transport does not require an LLM. This is architectural confirmation, not permission to copy its code or treat its editorial-status heuristics as conclusive.

## Proposed flow

1. `Check all references` and a per-reference check start explicit network requests. Show that DOI and bibliographic fields will be sent. Do not send manuscript body text. No automatic background requests by default.
2. Validate/normalize DOI URL wrappers and common copied whitespace locally, preserving the original. Do not remove arbitrary DOI suffix characters: punctuation can belong to an identifier.
3. Resolve a supplied DOI and compare metadata. A successfully resolving DOI is not proof that it identifies the cited work.
4. If missing, unresolved or conflicting, search using title/author/year/container/page evidence, excluding the suspected DOI from the search text. Crossref search rank is not a calibrated probability.
5. Compare normalized title, named authors, publication dates, journal/book, volume, issue and pages. Show positive evidence, conflicting fields and unavailable fields separately. Check distinctions such as chapter versus whole book, editions, preprint versus published article, translations and corrections.
6. Present `matching record`, `DOI addition proposed`, `conflicting DOI`, `multiple candidates`, `insufficient evidence`, `not found in this registry` and `network failure` separately. Neither a 404 nor an empty search proves that no DOI exists. Where appropriate, identify another registration agency before adding a provider fallback.
7. Review dialog displays original and proposed values, metadata source and retrieval time. Offer DOI-only repair and selected-field changes. Keep manual rejection/defer reasons. No highest-ranked-result auto-acceptance.
8. Approval updates the existing reference ID (body citation links remain intact), stores before/after values and provenance, and participates in undo and portable project persistence. A DOI-only approval must not implicitly certify all other metadata as correct.
9. After metadata is confirmed, render using the pinned APA rules. Registry checking and APA formatting are separate validations.

## Determinism and limitations

- Use a fixed comparison-rule version and stored response snapshots/hashes. The same snapshot and rules yield the same proposals; a live registry can change over time.
- Cache requests, respect HTTP rate-limit/retry instructions, bound retries and concurrency, permit cancellation, and retain partial results on offline/failure. Do not convert a failed request into a negative match.
- Metadata may be incomplete or wrong; some resources have no DOI or are registered elsewhere. Ambiguous records require human review. No promise of detecting every bibliographic error.
- Never fabricate a DOI, silently replace an existing reference, or infer paper validity/absence of retraction from missing status metadata.
- If later automatic checks are offered, require an explicit saved setting; corrections still enter the review queue.

## Required tests before shipping the expansion

Missing DOI with unique corroborated candidate; resolving wrong DOI; nonexistent DOI; malformed but recoverable URL; wrong DOI excluded from fallback query; identical title with different authors; common short title; online-first/print year difference; multiple editions; chapter/book collision; legitimate punctuation in DOI; non-Crossref DOI; absent DOI; sparse metadata; HTML/JATS title markup; cache/replay; 429/timeout/cancellation; selected-field approval; stable reference IDs; undo/archive and stale proposals after a record edit.

Run deterministic tests against saved public or synthetic responses. Live public lookups are smoke checks, not stable golden expectations. Do not submit private corpus references merely to answer this feasibility question.

## Primary sources

- [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/): public metadata access, individual works and registration-agency endpoints; deposits can contain incorrect or partial metadata.
- [Crossref Simple Text Query](https://www.crossref.org/documentation/retrieve-metadata/simple-text-query/): reference-to-DOI matching; incomplete information or multiple DOIs can require evaluation.
- [Crossref REST API tips](https://www.crossref.org/documentation/retrieve-metadata/rest-api/tips-for-using-the-crossref-rest-api/): caching and backing off on HTTP 429 responses.

Sources checked 2026-09-16. Current basic lookup does not satisfy the proposed audit/queue acceptance tests.
