# BATCH24 Agent Continuation Prompt
**Project:** TruckOpti India Logistics SaaS  
**URL:** https://www.truckopti.in | Heroku app: `truck-opti-app`  
**Date:** 2026-04-10

---

## Mandatory Reading

Read these before acting:

```
0.dev-matrix/SECURITY.md
0.dev-matrix/PATTERNS.md
0.dev-matrix/STATE.md
0.dev-matrix/TASK.md
0.dev-matrix/AI-HANDOFF.md
0.dev-matrix/OWNER_ACTION_CHECKLIST.md
0.dev-matrix/LAUNCH_CHECKLIST.md
```

---

## Current Reality

- Repo-side readiness is green on the current tree.
- `npm run launch-check` passes `17/17` on 2026-04-10.
- `npm run test:frontend-smoke` passes `17/17` on 2026-04-10.
- `npm run test:prod-config` passes `4/6` on 2026-04-10.
- The only `prod-config` failures are:
  - `razorpay_launch_readiness: test Razorpay key is still configured`
  - `sentry_dsn: missing VITE_SENTRY_DSN`
- Supabase is reachable:
  - `https://jbxncejtcbpcronndqlx.supabase.co/auth/v1/health` returns `401` without credentials
  - `https://mcp.supabase.com/mcp?project_ref=jbxncejtcbpcronndqlx` returns `401` without credentials
- This machine still has no usable `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, live Razorpay credentials, Sentry DSN vars, GitHub auth token, or real-account login credentials.
- GitHub still reports `1 moderate` default-branch alert after the latest push. (CORRECTED: earlier BATCH24 draft incorrectly said 2 — the 2026-04-10 push banner confirmed only 1 remains.)

---

## BATCH24 Goal

Finish the remaining external launch blockers or produce the shortest truthful owner-action list needed to launch.

---

## BATCH24 Tasks

### T1 — Review the last 1 GitHub alert with authenticated access

- Use authenticated GitHub Security access.
- Identify the exact package/ecosystem still triggering the 1 moderate alert at `/security/dependabot/69`.
- **Local evidence strongly suggests stale scan**: `cd frontend && npm audit` → 0 vulnerabilities; `npm ls jspdf dompurify` → `jspdf@4.2.1` → `dompurify@3.3.2` (patched). Confirm and dismiss if stale.
- Fix them only if the change is low-risk for launch.
- Re-run the relevant local audit after any change.

### T2 — Complete live payment and monitoring config

- Set live Razorpay credentials in the correct production locations.
- Set `VITE_SENTRY_DSN` in production.
- Do not use test or placeholder values.

### T3 — Push pending Supabase migrations

- Use authenticated Supabase access.
- Run the real migration push from project root.
- Verify the migration state after the push.

### T4 — Run authenticated browser smoke with real accounts

- Verify at least one successful real login flow.
- Verify key authenticated pages for customer, driver, agency, and admin if credentials exist.
- Record exactly what was tested and what remains unverified.

### T5 — Sync dev-matrix and close-day evidence

- Update `STATE.md`, `TASK.md`, and `AI-HANDOFF.md` only after verification.
- Run `npm run close-day`.
- If launch is still blocked, leave the blocker list concrete and short.

---

## Constraints

- Do not claim full launch readiness without machine-verifiable proof.
- Do not substitute sandbox/test credentials for owner-blocked production tasks.
- Do not reopen repo-side code churn unless a verified alert or blocker requires it.
- Keep changes minimal and launch-focused.

---

## Suggested Commit Shape

```text
docs: sync launch blocker handoff
```