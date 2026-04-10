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

## Minimum Quality Thresholds (Measurable — Not Negotiable)

> These are the floor. A task claiming "done" below these thresholds is not done.

| Gate | Command | Minimum Pass Condition |
|------|---------|------------------------|
| Build | `cd frontend && npm run build` | Exit 0, 0 TS errors |
| Packing tests | `npm run test:packing` | 5/5 pass |
| Frontend smoke | `npm run test:frontend-smoke` | 17/17 pass |
| Prod config | `npm run test:prod-config` | 6/6 pass |
| Security root | `npm audit` | 0 high/critical CVEs |
| Security frontend | `cd frontend && npm audit` | 0 high/critical CVEs |
| Launch | `npm run launch-check` | All gates PASS |

## Human-Blocked Tasks

Tasks requiring Razorpay production keys, Google OAuth browser sign-in, Supabase migrations, Sentry DSN, or Twilio configuration are `[HUMAN-BLOCKED]`. AI agents must:
1. Skip `[HUMAN-BLOCKED]` tasks immediately — do not attempt workarounds
2. Document the block in `AI-HANDOFF.md` under `Blockers:`
3. Work on the next AI-executable task instead

## Phase Gate Rule

A phase is complete only when **all tasks in that phase have passing validation output posted in TASK.md**. Moving to the next phase with open failures is not allowed.
