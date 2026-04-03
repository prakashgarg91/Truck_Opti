# Truck_Opti Quality Baseline

## Definition Of Done

A task is not done until:

- relevant implementation is complete
- the required validation command passes
- security-sensitive work is checked against `SECURITY.md`
- dependency vulnerability status is checked for affected package surfaces
- new docs are consolidated into canonical locations instead of spawning duplicates
- task and state records are updated
- the working tree is clean or limited to intentional runtime handoff files
- `AI-HANDOFF.md` is updated so the next session can resume from an exact checkpoint

## Mandatory Evidence

- command run
- result summary
- vulnerability status
- files changed
- documentation placement/consolidation impact
- owner actions still pending
- handoff continuation point and next step

## Documentation Discipline

- Search for existing docs before creating new ones.
- Keep active docs in canonical locations instead of scattering report-style markdown through the repo.
- Keep `AI-HANDOFF.md` current so work continues from a specific checkpoint instead of restarting from scratch.

## TruckOpti-Specific Gate

Frontend-impacting work should not be treated as complete if the build is broken or TypeScript errors remain.
