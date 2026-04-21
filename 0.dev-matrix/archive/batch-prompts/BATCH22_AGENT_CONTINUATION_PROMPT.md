# BATCH22 Agent Continuation Prompt
**Project:** TruckOpti India Logistics SaaS  
**URL:** https://www.truckopti.in | Heroku app: `truck-opti-app`  
**Current Repo Head at Handoff:** `70e764c5`  
**Date:** 2026-04-03

---

## Mandatory Reading

Read these before editing:

```
0.dev-matrix/SECURITY.md
0.dev-matrix/PATTERNS.md
0.dev-matrix/DEPENDENCIES.md
0.dev-matrix/STATE.md
0.dev-matrix/TASK.md
frontend/src/pages/PackingPage.tsx
frontend/src/workers/packingWorker.ts
```

---

## Current Reality

- Repo-side preflight is green:
  - `npm run launch-check` passed `14/14`
  - `cd frontend && npm run build` passed
  - root + frontend `npm audit --omit=dev` both returned `0 vulnerabilities`
- Public frontend smoke is stronger than before:
  - `npm run test:frontend-smoke` passed `16/17`
  - the only failing check is `auth-service` reachability for `jbxncejtcbpcronndqlx.supabase.co`
- Production config is still externally blocked:
  - `npm run test:prod-config` passed `2/6`
  - failures remain: Supabase DNS, Razorpay live readiness, missing `VITE_SENTRY_DSN`, PhonePe preprod mode

These external blockers are **not** the next repo-side coding task.

---

## Verified Packing Duplication

The frontend currently duplicates the same client-side packing engine in two places:

1. `frontend/src/pages/PackingPage.tsx`
   - `AdvancedBinPacker`
   - `recommendTrucks`
2. `frontend/src/workers/packingWorker.ts`
   - `PackingWorkerEngine`
   - worker-side recommendation loop in `self.onmessage`

Shared duplicated logic includes:

- `fitsAt` collision checks
- skyline BL placement
- extreme points placement
- genetic wrapper / repeated search
- expanded-item handling
- box-rotation generation
- truck recommendation scoring

This duplication is the next repo-side risk: heuristic changes can drift between the UI thread and the worker.

---

## BATCH22 Tasks

### T1 — Extract a shared client-side packing module

Create one shared frontend module for the packing engine and recommendation logic.

Recommended location:

```text
frontend/src/lib/packing/
```

Minimum expectation:

- shared types/utilities that both the page and worker can import
- one source of truth for rotations, collision checks, item expansion, and truck recommendation scoring
- preserve current public behavior

### T2 — Migrate the web worker to the shared module

`frontend/src/workers/packingWorker.ts` should become a thin orchestration layer:

- receive input
- call shared engine/recommendation functions
- post results back

Do not leave a second full algorithm copy in the worker.

### T3 — Migrate PackingPage to the shared module

`frontend/src/pages/PackingPage.tsx` should use the same shared logic.

Keep the existing UI, controls, and user-visible behavior stable unless a bug fix is necessary.

### T4 — Add regression proof

Provide machine-verifiable evidence that the extraction did not break packing behavior.

Acceptable proof options:

- targeted unit tests for shared packing utilities, or
- a deterministic comparison harness that runs representative item/truck inputs through the shared engine and verifies stable outputs, or
- both

Avoid flaky browser-only proof if a deterministic code-level test is possible.

### T5 — Sync dev-matrix if the pattern changes

If the shared packing module becomes the new standard used in 2+ files, update:

- `0.dev-matrix/PATTERNS.md`
- `0.dev-matrix/TASK.md`
- `0.dev-matrix/STATE.md`

Only document the pattern once it is actually implemented and verified.

---

## Constraints

- Do not weaken existing public smoke behavior.
- Do not claim launch is clear; external config blockers remain.
- Do not expose raw `error.message` to users.
- Keep changes focused on the packing-engine consolidation.
- Prefer minimal API churn and avoid redesigning the page UI.

---

## Verification Required Before Commit

Run at minimum:

```powershell
cd d:\Github\Truck_Opti\frontend
npm run build
```

And add one deterministic proof step for the shared packing logic.

If you touch shared docs or task status, also update the dev-matrix accordingly.

---

## Suggested Commit Shape

```text
refactor: consolidate shared frontend packing engine
```

---

## Out of Scope for This Batch

- fixing the dead Supabase auth host
- owner-side Heroku/Supabase config changes
- authenticated browser smoke
- payment gateway production credential rollout
