# TruckOpti — BATCH 7 Agent Continuation Prompt

Use this prompt as-is for the next coding agent.

---

You are continuing the TruckOpti launch-readiness effort in an existing codebase.

## Context You Must Assume
- Repo: `d:/Github/Truck_Opti`
- Production app is live on:
  - `https://www.truckopti.in`
  - `https://truckopti.in`
- Cloudflare DNS and Heroku custom domains are already configured.
- Heroku ACM SSL certs are issued for both domains.
- Recent commits already applied auth/domain hardening and profile improvements.
- Matrix files have been updated and are the source of truth:
  - `0.dev-matrix/STATE.md`
  - `0.dev-matrix/TASK.md`
  - `0.dev-matrix/LAUNCH_CHECKLIST.md`
  - `0.dev-matrix/LAUNCH_TEST_TRACKER.md`

## Primary Objective
Complete the remaining launch blockers with production-safe, test-verified changes and clean commits.

## Work Items (in order)
1. **Subscription lifecycle completion (P0)**
   - Implement/finish `useSubscription` hook.
   - Include trial state, expiry detection, usage counters.
   - Surface status in dashboard/profile/sidebar without breaking existing flows.
2. **Pricing source-of-truth cleanup (P1)**
   - Ensure `PricingPage` uses DB-backed `subscription_plans` with safe fallback.
   - Keep pricing display consistent with checkout and DB values.
3. **Supabase integration test script (P1)**
   - Create `scripts/test-supabase-connection.mjs`.
   - Validate table reachability, seed expectations, basic RLS assumptions, schema presence.
   - Print structured PASS/FAIL summary.
4. **Full tracker completion (P1)**
   - Execute smoke/build checks.
   - Fill `0.dev-matrix/LAUNCH_TEST_TRACKER.md` with real outcomes.
5. **Launch checklist reconciliation (P1)**
   - Update `0.dev-matrix/LAUNCH_CHECKLIST.md` only where outcomes are validated.

## Mandatory Constraints
- Do not rewrite unrelated modules.
- Keep changes minimal and surgical.
- No hardcoded secrets.
- Preserve existing UX unless fixing a confirmed bug.
- Do not commit local machine artifacts or DB files.

## Validation Commands
- `npm --prefix frontend run build`
- `npm run test:live-buttons`
- `python test_e2e.py`
- `python interactive_webapp_test.py`
- `node --experimental-vm-modules scripts/test-supabase-connection.mjs` (after you add it)

## Git Hygiene
- Use focused commits by concern.
- Commit format:
  - `feat(scope): ...`
  - `fix(scope): ...`
  - `test(scope): ...`
  - `docs(scope): ...`
- Exclude:
  - `*.db`
  - `.claude/settings.local.json`
  - ad-hoc local logs unless intentionally updated artifacts.

## Deliverables
1. Code changes for each completed item.
2. Updated matrix docs (`STATE`, `TASK`, `LAUNCH_TEST_TRACKER`, `LAUNCH_CHECKLIST`) with factual status.
3. Final summary table:
   - Task
   - Status (DONE/PARTIAL/SKIP)
   - Files changed
   - Validation evidence
4. Remaining blockers list (if any), prioritized by launch impact.

---

If you hit ambiguity, default to the simplest launch-safe implementation and document assumptions in the tracker.
