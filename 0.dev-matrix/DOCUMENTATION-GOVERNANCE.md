# Documentation Governance

## Approved Documentation Zones

- repo root: only canonical entry docs and a small set of stable operator docs
- 0.dev-matrix/: workflow, runtime status, handoff, standards, and evidence
- docs/: product, architecture, deployment, API, runbook, and audit material
- docs/archive/ and 0.dev-matrix/archive/: superseded material only

## AI Rules

- Search existing docs before creating a new one.
- Prefer updating the canonical document over adding a sibling with a similar name.
- Do not use active filenames such as FINAL, NEW, OLD, COPY, BACKUP, or v2/v3 unless they are archived.
- If a new doc is required, place it in a canonical zone and link it from a nearby index or README.
- Cleanup or archive superseded docs in the same session when it is safe.

## Local Notes

- Add repo-specific approved root docs here when they are intentionally retained.
- Record local exceptions and archive zones here instead of scattering rules across unrelated files.