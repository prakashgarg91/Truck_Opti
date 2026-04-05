# BATCH24 Agent Continuation Prompt
**Project:** TruckOpti India Logistics SaaS  
**URL:** https://www.truckopti.in | Heroku app: `truck-opti-app`  
**Date:** 2026-04-05

---

## Mandatory Reading

Read these before editing:

```
0.dev-matrix/SECURITY.md
0.dev-matrix/PATTERNS.md
0.dev-matrix/STATE.md
0.dev-matrix/TASK.md
0.dev-matrix/AI-HANDOFF.md
0.dev-matrix/OWNER_ACTION_CHECKLIST.md
scripts/frontend_launch_smoke.mjs
scripts/production_config_audit.mjs
frontend/src/services/supabaseApi.ts
frontend/src/services/razorpayPayment.ts
frontend/src/services/phonepePayment.ts
frontend/src/pages/auth/AuthCallbackPage.tsx
```

---

## Current Reality

- Supabase project reachability is restored.
- Public/auth shell smoke is now green:
  - `npm run test:frontend-smoke` → PASS (17/17)
- Production config is still blocked:
  - `npm run test:prod-config` → PASS (3/6)
  - failing checks are:
    - Razorpay still on test key
    - `VITE_SENTRY_DSN` missing
    - PhonePe still sandbox/preprod
- Auth/payment UX now fails safely with `UserFacingError` instead of raw provider messages.
- Official Docker-backed Razorpay MCP is configured in `.vscode/mcp.json`.
- GitHub reported 17 default-branch vulnerabilities on the 2026-04-05 push, but local root `npm audit` and `frontend` `npm audit fix` both returned 0 vulnerabilities; this discrepancy is unresolved.

---

## Remaining Launch Blockers

1. Live Razorpay key id + secret are not configured in production.
2. Sentry DSN is not configured in Heroku.
3. PhonePe is still pointed at sandbox/preprod and must either be moved to production or disabled for launch.
4. Pending Supabase migrations still need to be pushed.
5. Authenticated real-account flows for customer, driver, agency, and admin are still unverified.
6. GitHub Dependabot/security alerts still need reconciliation against the clean local audit results.

---

## BATCH24 Tasks

### T1 — Finish owner-side launch configuration

If credentials are available in the session:

- set live Razorpay config in Heroku and Supabase secrets
- set `VITE_SENTRY_DSN`
- either switch PhonePe to production or disable it before launch
- verify Google OAuth provider configuration uses the Supabase callback URI and the app callback allow-list

Do not claim success without rerunning `npm run test:prod-config`.

### T2 — Push pending Supabase migrations

Run the production migration push if owner access is available, then verify the required tables/columns exist.

### T3 — Run authenticated browser smoke

With real accounts, verify at minimum:

1. customer login and booking flow
2. driver login and trip flow
3. agency login and dispatch flow
4. admin login and management flow

Document exact passes/failures with real evidence. Do not summarize vaguely.

### T4 — Sync dev-matrix truth

Update these files only after the above is verified:

- `0.dev-matrix/STATE.md`
- `0.dev-matrix/TASK.md`
- `0.dev-matrix/AI-HANDOFF.md`
- `0.dev-matrix/LAST-CLOSEOUT.md`

### T5 — Reconcile GitHub security alerts

Because the latest `git push` still reported 17 vulnerabilities while local Node audits were clean:

1. inspect the GitHub Security/Dependabot alert list directly
2. determine whether the alerts are stale, from `apps/web`, Python, or another dependency surface
3. remediate or explicitly document the remaining packages/ecosystems still affected

Do not claim security closure from local `npm audit` output alone until the GitHub alert count matches reality.

---

## Constraints

- Do not expose raw `error.message` to users.
- Do not mark launch ready unless authenticated flows are actually verified.
- Do not leave Razorpay in test mode while claiming payment readiness.
- Do not keep PhonePe enabled in sandbox/preprod for a public launch.

---

## Suggested Commit Shape

```text
chore: complete launch configuration and authenticated smoke
```