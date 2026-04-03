# Tree Hygiene

## Standard

- Keep the production tree dealer-ready and easy to audit.
- Remove junk files, merge leftovers, and accidental duplicates before launch.
- Keep active code, launch docs, and evidence folders clearly separated.
- Consolidate process docs into canonical files before creating new summaries, reports, or guides.
- Keep long-form docs in intentional zones and archive superseded material instead of leaving active duplicates.

## Known Legacy Areas

- batch prompt history in `0.dev-matrix`
- accumulated launch/test evidence in `0.dev-matrix/test-reports`

## Cleanup Queue

- periodically prune stale prompt/history files that are no longer operationally useful
- keep the active launch system easier to scan than the historical record
- reduce duplicate continuation/report docs when a single canonical operating note is enough
