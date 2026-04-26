# Project Completion Gaps

> Canonical snapshot for the open question: "what gaps remain, and what tasks make TruckOpti complete?"
> Updated: 2026-04-26 by Copilot.
> Source files checked: `AI-HANDOFF.md`, `STATE.md`, `TASK.md`, `LAUNCH_CHECKLIST.md`,
> `OWNER_ACTION_CHECKLIST.md`, `SECURITY.md`, `GRAPHIFY_GAPS.md`, `QDRANT_GAP_REPORT.md`,
> and current npm validation output.
> Verification commands referenced below are declared in the root `package.json`.
> Examples: `npm run test:prod-config`, `npm run test:live-auth`, `npm run test:live-admin`,
> and `npm run launch-check`.

## Current completion definition

TruckOpti is complete for launch when:

1. Public production config passes without test credentials.
2. Real-account authentication is proven end-to-end.
3. A production backup/PITR decision is documented and verified.
4. Payment subscription checkout works with live Razorpay credentials.
5. The final owner smoke flow passes across customer, agency, driver, admin, payment, and auth.

## Remaining launch blockers

- **T-110 — Razorpay production keys** (Human, 🔴 blocking)
  - Gap: production keys are still not verified live.
  - Task: set Heroku `VITE_RAZORPAY_KEY_ID=rzp_live_*` and matching Supabase Edge Function secret.
  - Verify: `npm run test:prod-config` passes Razorpay readiness, then complete a logged-in `/pricing` subscription.
- **T-111 — Google OAuth production sign-in** (Human, 🔴 blocking)
  - Gap: redirect works, but successful real-account sign-in still needs proof.
  - Task: confirm Google Cloud OAuth client and Supabase Google provider settings, then sign in with a real account.
  - Verify: browser proof from `/login` → Google → `/auth/callback` → correct dashboard.
- **T-114 — authenticated post-login smoke** (Human + AI after credentials, 🟡 blocked)
  - Gap: full proof is not freshly rerunnable in this shell.
  - Task: provide `SEED_DEMO_PASSWORD`, rerun live auth/admin proof, and perform real-account manual checks.
  - Verify: `npm run test:live-auth`, `npm run test:live-admin`, and manual customer/agency/driver/admin smoke.
- **T-115 — production backup/PITR** (Human, 🔴 blocking for safe launch)
  - Gap: production backup/PITR has no verified owner confirmation.
  - Task: enable Supabase PITR on Pro plan, or document the accepted backup alternative.
  - Verify: Supabase dashboard backup history shows recent backup/PITR coverage.
- **T-113 — SMS/WhatsApp OTP** (Human if required, 🟡 optional)
  - Gap: phone OTP is intentionally deferred.
  - Task: if phone auth must ship, configure Supabase Phone with Twilio and set `VITE_AUTH_PHONE_OTP_ENABLED=true`.
  - Verify: manual `/login` phone OTP receipt and sign-in.
- **T-107 — Google Maps API key** (Human if desired, 🟢 nice-to-have)
  - Gap: Leaflet fallback works, so this is optional.
  - Task: add a production Google Maps API key if Google Maps UX is required.
  - Verify: map pages load Google Maps without falling back to Leaflet.

## AI-executable follow-up backlog

These are not launch blockers unless the product owner expands scope before launch.

- **T-142:** finish admin/reviewer/partner/office coverage for password auth.
- **T-143:** provision second demo accounts per interface plus reviewer/admin/partner/office identities.
- **T-144:** implement office-permission bundles and partner-console access from `PLATFORM-ROLE-INTERFACE-PLAN.md`.
- **T-145:** formalize tenant-boundary and onboarding-track ownership before portal expansion.
- **T-146:** create typed service/event contracts before partner console or office workflow automation.

## Current codebase health gaps found in this audit

- **Environment gap:** root `npm run launch-check` uses `powershell`, which is unavailable in this Linux runner.
  - Recorded as a validation limitation for this session.
  - Existing `pwsh` startup partially ran, but background launch-check start hit a PowerShell edition-specific `Start-Process -WindowStyle` warning.
- **Environment setup:** the fresh clone had no installed frontend dependencies.
  - Ran `npm ci` at root and in `frontend/`.
- **Fixed in this PR:** frontend dependency audit reported a `postcss <8.5.10` moderate advisory.
  - Ran `npm audit fix` in `frontend/`.
  - `postcss` now resolves to `8.5.10`, and `npm audit` reports 0 vulnerabilities.
- **Environment/network gap:** browser smoke could not reach `https://www.truckopti.in` from this runner.
  - Recorded as a validation limitation.
  - Use local preview or a runner with production DNS access for browser proof.

## Final owner smoke checklist

Run this after T-110, T-111, and T-115 are complete:

1. Customer: login → book a truck → track shipment.
2. Agency: login → view jobs → assign driver → confirm delivery.
3. Driver: login → accept job → complete trip → check earnings.
4. Admin: login → dashboard → manage users/subscriptions/payouts.
5. Payment: subscribe to a plan via Razorpay live mode.
6. Auth: real Google OAuth + real Email OTP, plus Phone OTP only if T-113 is re-enabled.
