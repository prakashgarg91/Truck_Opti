# Code Index Standard

Purpose: give every repo a schema-versioned file intelligence layer that is useful for agent planning, blast-radius checks, architecture awareness, operational memory, and commit hygiene instead of being a stale vanity list.

## Required Repo-Local Artifacts

Each adopting repo should keep:

- `0.dev-matrix/index-of-code.json`
- `0.dev-matrix/index-of-code.csv`
- `0.dev-matrix/index-of-code.state.json`
- `0.dev-matrix/index-of-code.overrides.json`
- `0.dev-matrix/INDEX-OF-CODE.md`

## Required Entry Fields

The generated inventory must include at least:

- `path`, `status`, `category`
- `aiRemarks`, `humanRemarks`
- `heat`, `testSignal`
- `domain`, `owner`, `featureGroup`
- `risk`, `stability`, `runtime`, `testStatus`
- `editGuidance`, `refactorSafety`
- `dependencies`, `blastRadius`
- `historicalHeat`
- `performance`, `security`
- `duplicateSignals`, `driftSignals`
- an AI-friendly search surface such as `tags` plus `searchText`
- a concise AI summary such as `aiSummary`
- `lastObservedEditAt`, `lastObservedEditBy`, `lastObservedTestAt`, `lastObservedTestCommand`

## Required Metadata Fields

The JSON metadata should expose at least:

- `schemaVersion`
- last full `generatedAt`
- whether the index is stale,
- why it is stale,
- when the latest relevant edit or tracked shell event happened,
- repo-level intelligence summary counts,
- semantic backbone metadata when Roo or another semantic system is configured.

If the CSV is kept as the portable export, repeat the freshness fields there as columns so stale state remains visible outside JSON consumers.

## Heat Rubric

- `1-3`: archive, passive docs, low-risk assets.
- `4-6`: medium-risk docs, scripts, and normal code surfaces.
- `7-8`: active operational modules, workflows, or planned diagnostic seams.
- `9-10`: highest-blast-radius entrypoints, package/config pivots, or very hot runtime files.

## Override Preservation Rule

Persistent human notes and planned filenames belong in the overlay file, not in the generated outputs. Regeneration must preserve manual curation.

The overlay should support:

- `humanNotes`
- `annotations`
- `plannedEntries`
- optional `semanticBackbone`

## Heuristic Honesty Rule

Dependency, duplicate-logic, drift, performance, security, runtime, and refactor-safety signals may be heuristic, but the repo must say so honestly. When exactness matters, use a manual override instead of pretending the heuristic is truth.

## Automation Rule

Prefer a repo-local, fail-open hook pattern:

1. mark the index stale after file edits,
2. record focused test-like usage signals after relevant shell commands,
3. debounce or opportunistically refresh instead of rebuilding after every shell command,
4. let normal editing continue if the hook itself fails.

## Commit-Hygiene Rule

If the working tree is already dirty, add a nearby commit-boundary note so the index work can be committed independently from unrelated runtime changes.
