# Documentation Governance Standard

## Purpose

Keep AI-produced documentation consolidated, searchable, and professionally placed.

## Required Behavior

- Search the repo before creating a new document.
- Prefer updating the canonical doc for a topic over creating a sibling with a slightly different name.
- Keep repo-root docs minimal and intentional.
- Put process, status, handoff, and evidence files under 0.dev-matrix/ when that system exists.
- Put product, architecture, deployment, API, and operator docs under docs/ or another clearly named canonical docs folder.
- Archive superseded documents in docs/archive/ or 0.dev-matrix/archive/ instead of leaving them in active paths.
- Avoid unstable filenames such as FINAL, NEW, OLD, COPY, BACKUP, or v2/v3 in active docs.
- New docs must be linked from a nearby index, README, or local governance note if they become part of the active workflow.

## Search-First Rule

Before adding a new document:

1. Search filenames and content for an existing home for the same topic.
2. Update the existing canonical document when possible.
3. If a new doc is still needed, place it in the correct zone with a stable name.
4. Remove, merge, or archive the superseded duplicate in the same session when safe.

## Close-Day / Launch Discipline

- Launch-check must require a local 0.dev-matrix/DOCUMENTATION-GOVERNANCE.md.
- Close-day must flag newly created docs that land in nonstandard locations or use unstable names.
- Close-day must surface dirty working trees so documentation sprawl is not silently carried forward.

## Minimum Local Note

Each repo should keep 0.dev-matrix/DOCUMENTATION-GOVERNANCE.md with:

- approved documentation zones
- canonical repo-root docs
- archive zones
- local exceptions that are intentionally retained