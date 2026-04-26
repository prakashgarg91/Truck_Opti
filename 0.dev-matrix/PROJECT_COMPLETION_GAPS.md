# Project Completion Gaps

> Canonical snapshot for the open question: "what gaps remain, and what tasks make TruckOpti complete?"
> Updated: 2026-04-26 by Copilot.
> Source files checked: `AI-HANDOFF.md`, `STATE.md`, `TASK.md`, `LAUNCH_CHECKLIST.md`, `OWNER_ACTION_CHECKLIST.md`, `SECURITY.md`, `GRAPHIFY_GAPS.md`, `QDRANT_GAP_REPORT.md`, and current npm validation output.

## Current completion definition

TruckOpti is complete for launch when:

1. Public production config passes without test credentials.
2. Real-account authentication is proven end-to-end.
3. A production backup/PITR decision is documented and verified.
4. Payment subscription checkout works with live Razorpay credentials.
5. The final owner smoke flow passes across customer, agency, driver, admin, payment, and auth.

## Remaining launch blockers

| ID | Gap | Owner | Status | Completion task | Verification |
|----|-----|-------|--------|-----------------|--------------|
| T-110 | Razorpay production keys are still not verified live. | Human | 🔴 Blocking | Set Heroku `VITE_RAZORPAY_KEY_ID=rzp_live_*` and matching Supabase Edge Function secret. | `npm run test:prod-config` should pass the Razorpay readiness check, then complete a logged-in `/pricing` subscription flow. |
| T-111 | Google OAuth redirects, but successful real-account sign-in still needs proof. | Human | 🔴 Blocking | Confirm Google Cloud OAuth client + Supabase Google provider settings, then sign in with a real Google account. | Browser proof: `/login` → Google → `/auth/callback` → correct dashboard. |
| T-114 | Full authenticated post-login smoke is not freshly rerunnable in this shell. | Human + AI after credentials | 🟡 Blocked by credentials | Provide `SEED_DEMO_PASSWORD`, then rerun live auth/admin proof and perform real-account manual checks. | `npm run test:live-auth` and `npm run test:live-admin`; manual customer/agency/driver/admin smoke. |
| T-115 | Production backup/PITR has no verified owner confirmation. | Human | 🔴 Blocking for safe launch | Enable Supabase PITR on Pro plan, or document the accepted backup alternative. | Supabase dashboard backup history shows recent backup/PITR coverage. |
| T-113 | SMS/WhatsApp OTP is intentionally deferred. | Human if required | 🟡 Optional | If phone auth must ship, configure Supabase Phone with Twilio and set `VITE_AUTH_PHONE_OTP_ENABLED=true`. | Manual `/login` phone OTP receipt and sign-in. |
| T-107 | Google Maps API key is optional because Leaflet fallback works. | Human if desired | 🟢 Nice-to-have | Add a production Google Maps API key if Google Maps UX is required. | Map pages load Google Maps without falling back to Leaflet. |

## AI-executable follow-up backlog

These are not launch blockers unless the product owner expands scope before launch.

| ID | Gap | Status | Next task |
|----|-----|--------|-----------|
| T-142 | Password auth is available behind a flag, but admin/reviewer/partner/office coverage is not complete. | 🟡 In progress | Add safe admin proof and complete reviewer/partner/office persona coverage with credentials kept outside git. |
| T-143 | Demo identities exist for driver, agency, and customer, but not every interface/persona. | 🟡 In progress | Provision second demo accounts per interface plus reviewer/admin/partner/office identities. |
| T-144 | Office-permission bundles and partner-console access model are planned only. | 🟡 Planned | Implement bundles from `PLATFORM-ROLE-INTERFACE-PLAN.md` when Phase 2 starts. |
| T-145 | Tenant-boundary/onboarding-track contract is not formalized for all future roles. | 🟡 Planned | Define `organization_id`, `branch_id`, `booking_type`, `delegated_by`, `source_system`, and ownership rules before portal expansion. |
| T-146 | Internal API/event taxonomy for partner, agency, customer, and office flows is not final. | 🟡 Planned | Create typed service/event contracts before partner console or office workflow automation. |

## Current codebase health gaps found in this audit

| Gap | Status | Action taken |
|-----|--------|--------------|
| Root `npm run launch-check` uses `powershell`, which is unavailable in this Linux runner. | Environment gap | Recorded as validation limitation for this session; existing `pwsh` startup partially ran but background launch-check start hit a PowerShell edition-specific `Start-Process -WindowStyle` warning. |
| Fresh clone had no installed frontend dependencies. | Environment setup | Ran `npm ci` at root and in `frontend/`. |
| Frontend dependency audit reported `postcss <8.5.10` moderate advisory. | Fixed in this PR | Ran `npm audit fix` in `frontend/`; `postcss` now resolves to `8.5.10` and `npm audit` reports 0 vulnerabilities. |
| Browser smoke could not reach `https://www.truckopti.in` from this runner. | Environment/network gap | Recorded as validation limitation; use local preview or a runner with production DNS access for browser proof. |

## Final owner smoke checklist

Run this after T-110, T-111, and T-115 are complete:

1. Customer: login → book a truck → track shipment.
2. Agency: login → view jobs → assign driver → confirm delivery.
3. Driver: login → accept job → complete trip → check earnings.
4. Admin: login → dashboard → manage users/subscriptions/payouts.
5. Payment: subscribe to a plan via Razorpay live mode.
6. Auth: real Google OAuth + real Email OTP, plus Phone OTP only if T-113 is re-enabled.
