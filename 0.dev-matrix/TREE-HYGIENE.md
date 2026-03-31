# Tree Hygiene

## Standard

- Keep the production tree dealer-ready and easy to audit.
- Remove junk files, merge leftovers, and accidental duplicates before launch.
- Keep active code, launch docs, and evidence folders clearly separated.

## Known Legacy Areas

- batch prompt history in `0.dev-matrix`
- accumulated launch/test evidence in `0.dev-matrix/test-reports`

## Cleanup Queue

- periodically prune stale prompt/history files that are no longer operationally useful
- keep the active launch system easier to scan than the historical record
