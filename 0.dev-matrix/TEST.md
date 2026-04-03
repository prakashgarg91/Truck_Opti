# TEST — TruckOpti Testing Guide

> **Two-phase testing: automated repo preflight, then authenticated smoke.**
> Phase A is fully automated and requires no credentials. Phase B requires real accounts and production config.

---

## PHASE A — REPO-SIDE PREFLIGHT (Automated, No Credentials Required)

Any developer can run these. All gates must pass before considering a deploy.

### Step 1: Launch-Readiness Preflight — `npm run launch-check`

```powershell
npm run launch-check
```

Runs 14 automated checks across 8 gate groups:

| Gate | Check | Auto-verified |
|------|-------|:---:|
| 1 | Frontend TypeScript build (tsc + vite) | Yes |
| 2 | Root `npm audit --omit=dev` | Yes |
| 3 | Frontend `npm audit --omit=dev` | Yes |
| 4 | apps/web `npm audit` | Yes |
| 5 | `pip-audit` on apps/web/requirements.txt | Yes |
| 6 | Python `compileall` on apps/web/app + run.py | Yes |
| 7a | Deep error scan | Yes |
| 7b | Glue check | Yes |
| 7 | Git working-tree cleanliness (allowing runtime evidence noise only) | Yes |
| 8a | Standards presence | Yes |
| 8b | Runtime docs | Yes |
| 8c | Documentation governance | Yes |
| 8d | Tree hygiene | Yes |
| 8e | State freshness | Yes |

**Pass criteria:** 14/14 checks green. Any FAIL = do not deploy.

### Step 2: Frontend Build (belt-and-braces, covered by Gate 1)

```powershell
cd frontend && npm run build
```

**Pass criteria:** Zero TypeScript errors. Warnings acceptable, errors are not.

### Step 2b: Public Frontend Smoke — `npm run test:public-smoke`

```powershell
npm run test:public-smoke
```

Verifies deployed public/frontend routes with a fresh browser context:

- `/`
- `/pricing`
- `/terms`
- `/privacy`
- `/contact`
- `/login`
- `/signup`

Writes evidence to `logs/public_frontend_smoke_report.json`.

**Latest evidence:** 2026-04-01 manager verification passed 7/7 public routes with 0 app errors, 0 console errors, and 0 failed HTTP responses.

### Step 2e: Full Frontend Route Audit (real browser, unauthenticated)

Manager-admin exercised every frontend route exposed in `frontend/src/App.tsx` against the live site in a real browser session with service-worker state cleared.

**Latest evidence:** 2026-04-03 manager verification exercised `47` routes total:
- `15/15` public/auth routes loaded without `Application Error`
- `31/31` protected routes redirected unauthenticated users to `/login`
- `1/1` invalid route rendered the 404 page
- login email OTP, signup email OTP, Google OAuth, and contact-form submission all failed because the configured Supabase host `jbxncejtcbpcronndqlx.supabase.co` is unreachable
- driver registration advanced from step 1 -> step 2
- agency registration advanced from step 1 -> step 2
- first-pass stale chunk mismatch was reproduced on some lazy-loaded routes for a stale client, then cleared after unregistering the service worker and clearing caches

**Additional interactive evidence from 2026-04-03 close-day audit:**
- Pricing yearly/monthly toggle worked in the live browser
- Pricing CTA navigated to `/signup`
- Login tab switching (`Email` / `WhatsApp` / `SMS`) worked in the live browser
- Driver registration advanced through step 3 visibility
- Agency registration advanced through step 3 visibility
- Contact form submitted and showed `Something went wrong`, confirming the public lead-capture path is backend-blocked, not just auth
- 2026-04-03 repo-side mitigation landed locally: `frontend` build passed after adding `vite-plugin-pwa` client types, runtime chunk-recovery logic in `src/main.tsx` + `src/utils/runtimeRecovery.ts`, chunk-aware recovery in `src/components/ErrorBoundary.tsx`, and Workbox `cleanupOutdatedCaches` + `navigateFallback` in `vite.config.ts`; live stale-client retest is still pending

### Step 2c: Frontend Launch Smoke — `npm run test:frontend-smoke`

```powershell
npm run test:frontend-smoke
```

Verifies:

- the 7 public routes above
- protected-route redirects for unauthenticated users
- contact-form graceful fallback when the backend is unreachable (network intercepted in-browser, no live row created)
- login graceful fallback when OTP transport is unreachable (network intercepted in-browser, no live OTP sent)
- driver registration wizard progression through `Vehicle Details` -> `Payment Details` without submitting a live application
- agency registration wizard progression through `Contact & Address` -> `Bank Details` without submitting a live application
- auth backend reachability for the configured Supabase public URL

Writes evidence to `logs/frontend_launch_smoke_report.json`.

**Latest evidence:** 2026-04-03 manager verification passed 16/17 checks and failed only the auth-service reachability check. The passing checks now prove the live frontend degrades gracefully when backend-dependent actions fail and that the public onboarding wizards still progress: `/contact` shows `Support is temporarily unreachable` with `Retry send` and `Email support`, `/login` shows `Authentication service is currently unreachable...` when OTP transport is blocked in-browser, `/driver/register` advances through `Vehicle Details` to `Payment Details`, and `/agency/register` advances through `Contact & Address` to `Bank Details` without submitting live records. The single remaining failing check is still the real external blocker: `jbxncejtcbpcronndqlx.supabase.co` could not be resolved, and this was previously rechecked against Google Public DNS (`8.8.8.8`), which also returned NXDOMAIN.

### Step 2d: Production Config Audit — `npm run test:prod-config`

```powershell
npm run test:prod-config
```

Verifies the currently deployed Heroku production config for launch readiness:

- `VITE_APP_URL` is present
- `VITE_SUPABASE_URL` is present and DNS-resolvable
- `VITE_AUTH_EMAIL_OTP_ENABLED=true`
- Razorpay is using a live key and non-placeholder secret
- `VITE_SENTRY_DSN` is set
- PhonePe is not pointed at sandbox/preprod

Writes evidence to `logs/production_config_audit.json`.

**Latest evidence:** 2026-04-03 manager verification passed 2/6 checks and failed 4/6:
- Supabase auth backend DNS lookup failed for `jbxncejtcbpcronndqlx.supabase.co`
- Razorpay still uses `rzp_test_*`
- `VITE_SENTRY_DSN` is missing
- PhonePe is still configured for `api-preprod.phonepe.com/apis/pg-sandbox`

### Step 3: Supabase Data Integrity (run after key user flows)

```sql
SELECT * FROM shipments ORDER BY created_at DESC LIMIT 5;
SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 5;
SELECT id, status, driver_id FROM agency_jobs ORDER BY created_at DESC LIMIT 5;
```

**Pass criteria:** Rows exist for flows tested. No orphaned records.

### Step 4: Post-Deploy Verification (Heroku)

```powershell
heroku logs --tail --app truck-opti-app
```

After `git push heroku main`, confirm within 60 seconds:
- `Build succeeded`
- `State changed from starting to up`
- No `Error` lines

### Step 4b: Public Route Smoke (deployed frontend, no credentials)

Verify the key unauthenticated routes render without `Application Error`:

- `/`
- `/pricing`
- `/terms`
- `/privacy`
- `/contact`
- `/login`
- `/signup`

**Latest evidence:** 2026-04-01 manager verification found:
- Heroku web dyno restored after fixing Express 5 SPA fallback in `server.js`
- fresh-bundle smoke for all 7 public routes passed
- note: cached clients may need a hard refresh or service-worker clear to pick up the newest root-route bundle immediately
- 2026-04-03 full route audit confirmed the stale-client risk is real for some lazy-loaded pages until service-worker/caches are cleared

---

## PHASE B — AUTHENTICATED SMOKE (Requires Real Credentials + Production Config)

> **⚠️ HARD GATE:** This phase **cannot be marked complete** without:
> 0. A reachable production auth backend for the configured Supabase URL
> 1. Real Supabase project with production RLS policies applied (`supabase db push` complete)
> 2. Production Razorpay live keys configured (`VITE_RAZORPAY_KEY_ID` in Heroku)
> 3. Google OAuth production credentials in Supabase Auth → Providers → Google
> 4. Twilio SMS configured in Supabase (for phone OTP)
> 5. At least one real account per role: customer, driver, agency, admin
>
> If any of these are missing, record the blocker and mark the step **BLOCKED** — not PASS.
> See `0.dev-matrix/OWNER_ACTION_CHECKLIST.md` for setup instructions.

### How to Record Evidence

For each step below, capture:

| Field | What to record |
|-------|---------------|
| **Date/Time** | ISO timestamp of test execution |
| **Tester** | Name or agent ID |
| **Result** | PASS / FAIL / BLOCKED / SKIP |
| **Evidence** | Screenshot, log excerpt, or Supabase row ID |
| **Notes** | Any deviation from expected behavior |

### Step 5: Auth Smoke

| # | Test | Steps | Expected | Pass/Fail |
|---|------|-------|----------|:---------:|
| 5.1 | Email OTP login | Enter email → Send OTP → enter 6-digit code | Lands on role-correct dashboard | ☐ |
| 5.2 | Google OAuth | Click Google → authorize | Redirects to role-correct dashboard | ☐ |
| 5.3 | Phone OTP (SMS) | Enter phone → Send OTP → enter code | Dashboard loaded (requires Twilio) | ☐ |
| 5.4 | Logout | Profile → Logout | Redirected to /login, session cleared | ☐ |
| 5.5 | Session persistence | Login → close tab → reopen URL | Still authenticated (no re-login) | ☐ |

**BLOCKER:** If 5.1–5.3 all fail, all subsequent steps are BLOCKED.

### Step 6: Customer Portal Smoke

URL: `https://www.truckopti.in` (customer account)

| # | Test | Steps | Expected | Pass/Fail |
|---|------|-------|----------|:---------:|
| 6.1 | Dashboard loads | Login as customer | Dashboard cards visible, no console errors | ☐ |
| 6.2 | Book a truck | Dashboard → Book a Truck → fill form → submit | Shipment row created in Supabase | ☐ |
| 6.3 | View shipments | Dashboard → My Shipments | List loads, no console errors | ☐ |
| 6.4 | Pricing page | /pricing → select a plan | CheckoutPage opens | ☐ |
| 6.5 | Language toggle | Click EN/HI button | All labels change language | ☐ |
| 6.6 | Logout | Profile → Logout | Redirected to /login | ☐ |

### Step 7: Driver Portal Smoke

Login as driver. Auto-redirected to `/driver/dashboard`.

| # | Test | Steps | Expected | Pass/Fail |
|---|------|-------|----------|:---------:|
| 7.1 | Dashboard loads | Login as driver | Wallet card visible, earnings shown | ☐ |
| 7.2 | Job offer appears | Dispatch a job from agency portal | 30-second countdown card appears | ☐ |
| 7.3 | Accept job | Tap Accept within 30s | Trip starts — /driver/trip | ☐ |
| 7.4 | 7-step trip flow | Step through Load → Start → Photos → OTP | Each step transitions correctly | ☐ |
| 7.5 | OTP delivery | Enter correct OTP | Job status → delivered | ☐ |
| 7.6 | Earnings page | /driver/earnings | History loads with amounts | ☐ |
| 7.7 | Trip history | /driver/history | Previous trips listed | ☐ |

### Step 8: Agency Portal Smoke

Login as agency. Auto-redirected to `/agency/dashboard`.

| # | Test | Steps | Expected | Pass/Fail |
|---|------|-------|----------|:---------:|
| 8.1 | Dashboard loads | Login as agency | Analytics cards visible | ☐ |
| 8.2 | Jobs page | /agency/jobs | Jobs list loads in real-time | ☐ |
| 8.3 | Accept & assign job | New job → Assign Driver → Assign Truck | Status updates to assigned | ☐ |
| 8.4 | Confirm delivery | Job delivered → Confirm Delivery | Status → completed | ☐ |
| 8.5 | Generate invoice | Billing page → Download Invoice | PDF downloads correctly | ☐ |
| 8.6 | Driver roster | /agency/drivers | Driver list with status shown | ☐ |
| 8.7 | Fleet page | /agency/fleet | Truck list displayed | ☐ |
| 8.8 | Notification bell | Trigger a job event | Bell badge count updates | ☐ |

### Step 9: Admin Portal Smoke

Login as admin. Auto-redirected to `/admin`.

| # | Test | Steps | Expected | Pass/Fail |
|---|------|-------|----------|:---------:|
| 9.1 | Dashboard loads | Login as admin | Analytics cards visible (0s acceptable) | ☐ |
| 9.2 | No console errors | Open DevTools → Console | No uncaught exceptions | ☐ |
| 9.3 | User management | Navigate to users section | User list loads | ☐ |
| 9.4 | Subscription mgmt | Navigate to subscriptions | Subscriber list with plan info | ☐ |
| 9.5 | Payout workflow | Navigate to payouts → Approve → Pay | Status transitions correctly | ☐ |

### Step 10: Payment Flow (Use Test Credentials)

> ⚠️ Use test credentials — never live keys in dev.
> Razorpay test card: `4111 1111 1111 1111`, any future date, any CVV.
> PhonePe: Use test merchant ID.

| # | Test | Steps | Expected | Pass/Fail |
|---|------|-------|----------|:---------:|
| 10.1 | Razorpay checkout | Pricing → Checkout → Razorpay | Payment popup opens | ☐ |
| 10.2 | Complete test payment | Pay with test card | Subscription row created in Supabase | ☐ |
| 10.3 | PhonePe initiate | Select PhonePe → Pay | Redirects to phonepe.com only | ☐ |
| 10.4 | Invalid redirect | Tamper redirect URL | Toast error shown — NOT redirected | ☐ |

---

## SMOKE TEST SUMMARY TABLE

| Step | Area | Owner | Last Result | Date | Blocker |
|------|------|-------|:-----------:|------|:-------:|
| 1 | Launch preflight | Any dev | 14/14 PASS | 2026-04-03 | No |
| 2 | Frontend build | Any dev | PASS | 2026-03-31 | No |
| 2b | Public frontend smoke | Manager | 7/7 PASS | 2026-04-01 | No |
| 2e | Full frontend route audit | Manager | 47/47 route outcomes verified + key public interactions exercised | 2026-04-03 | Yes (auth/contact backend unreachable; stale client cache risk) |
| 2d | Production config audit | Manager | 2/6 PASS | 2026-04-03 | Yes |
| 4b | Public route smoke | Manager | PASS (7 routes, fresh bundle) | 2026-04-01 | No |
| 5 | Auth smoke | Owner | — | — | Yes (Twilio/OAuth) |
| 6 | Customer portal | Owner | — | — | Yes (auth) |
| 7 | Driver portal | Owner | — | — | Yes (auth) |
| 8 | Agency portal | Owner | — | — | Yes (auth) |
| 9 | Admin portal | Owner | — | — | Yes (auth) |
| 10 | Payment flow | Owner | — | — | Yes (Razorpay keys) |

---

## KNOWN FLAKY AREAS

> **2026-04-03 update:** the PWA stale-client issue now has a repo-side mitigation. Keep the workaround below until the deployed live bundle is re-tested from a returning client.

| Area | Issue | Workaround |
|------|-------|------------|
| PWA / lazy-loaded routes | Returning visitors remain the highest-risk browser cohort after deploy churn | Repo-side recovery is now in place; re-test from a stale returning client after deploy and hard refresh only if recovery fails |
| Job offer Realtime | May not fire if browser tab is backgrounded | Reload page |
| PhonePe redirect | Varies by PhonePe env (test vs prod) | Use Razorpay for local testing |
| jsPDF invoice | PDF may not include Unicode Hindi text | Known limitation — use English invoice |
| Google OAuth redirect | localhost:5173 must be in Supabase redirect URLs | Add localhost to Supabase auth settings |

---

## QUICK REGRESSION CHECKLIST

Before every push, confirm:
- [ ] `npm run launch-check` — all 14 checks green
- [ ] `npm run build` — 0 TypeScript errors
- [ ] Login works (at least one auth path)
- [ ] No red console errors on main pages
- [ ] Supabase RLS not blocking key operations

---

*Last updated: 2026-04-03 | MANAGER-ADMIN | Launch preflight re-verified at 14/14 PASS; auth/backend and live production config still block launch*
