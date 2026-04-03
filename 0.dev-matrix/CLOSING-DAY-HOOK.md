# Closing Day Hook

Run `npm run close-day` from repo root before ending the work day when you want a standardized closeout pass.

## Purpose

- standardize end-of-day verification across sessions and agents
- keep `0.dev-matrix` status files aligned with actual repo activity
- write a repeatable closeout artifact to `0.dev-matrix/LAST-CLOSEOUT.md`

## Current Hook Scope

- runs `npm run launch-check`
- runs deeper verification where available
- checks Node and Python dependency surfaces
- checks status-update discipline for `STATE.md`, `TASK.md`, and `DISCUSSION.md`

## Guardrails

- treat the hook as a workflow standard, not as proof that all product flows are complete
- review any dependency changes before committing if the hook performs remediation
- keep launch judgment based on real evidence, not automation alone

## Required Handoff Fields

The newest `AI-HANDOFF.md` entry for the close-day run must include:
- `Changed:`
- `Verified:`
- `Continue from:`
- `Next step:`
- `Blockers:`
