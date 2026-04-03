# Tree Hygiene Standard

## Purpose

Every repository must keep a professional file and folder tree.

The codebase should be easy to scan, easy to onboard into, and free of obvious junk, stale collisions, and accidental artifacts.

## Required Standard

- Keep the active tree clean and intentional.
- Remove stale temporary files, broken merge leftovers, and accidental OS artifacts.
- Archive or relocate historical material instead of leaving it mixed into active working paths.
- Do not keep duplicate operating systems for the same repo unless one is clearly marked as archived or legacy.
- Keep `0.dev-matrix` as the active operational system when it exists.
- Large generated outputs should live in known evidence/report folders, not mixed into source folders.
- Reuse canonical docs before adding new ones, especially for process summaries, audits, guides, and reports.
- Keep long-form docs in approved documentation zones instead of scattering markdown across random folders.
- Archive superseded docs instead of keeping active FINAL/COPY/NEW/OLD/V2-style variants.

## Launch-Blocking Hygiene Failures

These should fail launch-check:

- merge conflict markers in active repo files
- junk filesystem artifacts such as `nul`, `.DS_Store`, `Thumbs.db`, or `Desktop.ini`
- accidental duplicate system roots created by broken tooling inside active paths

## Expected Repo Notes

Each repo should keep a local `0.dev-matrix/TREE-HYGIENE.md` that records:

- active tree rules
- known legacy/stale areas
- cleanup backlog
- any intentionally retained archive zones
- a matching `0.dev-matrix/DOCUMENTATION-GOVERNANCE.md` for doc placement and consolidation rules
