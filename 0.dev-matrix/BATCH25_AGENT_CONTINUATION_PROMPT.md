# BATCH25 Agent Continuation Prompt
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

## Pre-Condition

**BATCH25 should only be started AFTER the owner has completed at least one of the following:**

| Action | Evidence to Check |
|--------|------------------|
| Set live Razorpay credentials in Heroku | `npm run test:prod-config` → `razorpay_launch_readiness: PASS` |
| Set `VITE_SENTRY_DSN` in Heroku | `npm run test:prod-config` → `sentry_dsn: PASS` |
| Ran `supabase db push` with authenticated access | Supabase dashboard shows `driver_payouts` and `contact_inquiries` tables + `agency_jobs.photo_loading_url` column |
| Provided real account credentials for browser smoke | (manual confirmation from owner) |

**Do not start BATCH25 if none of the above have been done — tasks will silently fail.**

---

## Current Reality (as of 2026-04-10 COP-001 judge pass)

- `npm run launch-check`: 17/17 PASS
- `npm run test:frontend-smoke`: 17/17 PASS
- `npm run test:prod-config`: 4/6 PASS — still failing: Razorpay test key + missing `VITE_SENTRY_DSN`
- `npm run build` (frontend): PASS — 2997 modules, 0 TypeScript errors
- `npm audit` (frontend): PASS — 0 vulnerabilities
- `dompurify@3.3.2` via `jspdf@4.2.1` — patched, local audit clean
- GitHub: **1 moderate** default-branch alert at `/security/dependabot/69` — local evidence suggests stale scan
- Repo: clean on `main`, no uncommitted changes

---

## BATCH25 Tasks

### T1 — Re-run prod-config and verify new credentials pass

After owner has set Heroku config vars:

```bash
npm run test:prod-config
```

Expected outcome: `6/6 PASS`. If still failing, diagnose which check fails and why.

### T2 — Verify Supabase migrations applied

```bash
# Check migration state (requires Supabase PAT)
supabase migration list
```

Confirm `driver_payouts`, `contact_inquiries` tables exist and `agency_jobs` has `photo_loading_url`.  
If not pushed yet: `supabase db push` from project root.

### T3 — Run authenticated full browser smoke

- Log in with real customer account → test booking flow
- Log in with real driver account → test trip acceptance
- Log in with real agency account → test dispatch flow
- Log in with admin account → test payout approval and user management

Record exactly what was tested and any failures found.

### T4 — Confirm or dismiss GitHub alert #69

With authenticated GitHub access:

```
https://github.com/prakashgarg91/Truck_Opti/security/dependabot/69
```

Local evidence (0 npm vulnerabilities, `dompurify@3.3.2` via `jspdf@4.2.1`) strongly suggests this alert is stale.  
If stale, dismiss it with justification. If real, apply the fix.

### T5 — Final go/no-go launch judgment

After completing T1–T4:

1. Run `npm run close-day` — must pass 10/10 gates.
2. Update `LAUNCH_CHECKLIST.md` Phase 6 items to ✅ for each fixed blocker.
3. Update `STATE.md` banner + agent messages with final launch verdict.
4. Update `AI-HANDOFF.md` with final status.
5. Commit and push all changes.
6. Declare launch readiness status (Green / Yellow / Red) with evidence.

---

## Known Blockers Going In

| Blocker | Who Can Fix |
|---------|-------------|
| Live Razorpay credentials | Owner (Razorpay dashboard → Heroku config) |
| `VITE_SENTRY_DSN` | Owner (Sentry dashboard → Heroku config) |
| `supabase db push` | Owner (Supabase PAT needed) or authenticated agent session |
| Authenticated browser smoke | Owner or tester with real accounts |
| Alert #69 dismissal | Owner (GitHub authenticated session) |
