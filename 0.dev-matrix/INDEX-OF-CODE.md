# Index Of Code

Purpose: keep a machine-generated, schema-versioned repository intelligence layer that future agents can use for navigation, blast-radius checks, architecture awareness, operational memory, and commit hygiene.

## Canonical Files

- Generated JSON: `0.dev-matrix/index-of-code.json`
- Generated CSV: `0.dev-matrix/index-of-code.csv`
- Automation state: `0.dev-matrix/index-of-code.state.json`
- Human-preserved overlay: `0.dev-matrix/index-of-code.overrides.json`
- Repo standard: `0.dev-matrix/standards/CODE-INDEX-STANDARD.md`
- Project hook config: `.cursor/hooks.json`

## What The Overlay Must Preserve

- `humanNotes`
- `annotations`
- `plannedEntries`
- optional `semanticBackbone`

## What Agents Should Read First

- `risk`, `stability`, `runtime`, `testStatus`
- `dependencies` and `blastRadius`
- `editGuidance`, `refactorSafety`
- `duplicateSignals`, `driftSignals`
- `tags`, `searchText`, `aiSummary`

## Metadata Expectations

Future agents should be able to inspect:

- `schemaVersion`
- last full `generatedAt`
- stale or fresh state plus stale reasons
- latest relevant edit or tracked shell event
- repo-wide intelligence summary counts
- semantic backbone metadata when Roo or another semantic system is configured

## Manual Regeneration

Document the repo-local command here, for example:

```bash
node scripts/generate-code-index.js
```
