# TEST — TruckOpti Testing Guide

> **Mandatory testing steps before any push to Heroku.**
> Each section reflects what must be verified per portal.

---

## STEP 1: BUILD CHECK (MANDATORY — BLOCKS ALL PUSHES)

```powershell
cd d:\Github\Truck_Opti\frontend
npm run build
```

**Pass criteria:** Zero TypeScript errors. Warnings are acceptable, errors are not.
If build fails: fix errors FIRST. Do not push with a broken build.

---

## STEP 2: CUSTOMER PORTAL SMOKE TEST

URL: `https://www.truckopti.in` (or `http://localhost:5173`)

| Test | Steps | Expected |
|------|-------|----------|
| Login (OTP) | Enter email → click Send OTP → enter 6-digit code | Lands on /dashboard |
| Login (Google) | Click Google → authorize | Role-based redirect |
| Book a truck | Dashboard → Book a Truck → fill form → submit | Shipment row in Supabase |
| View shipments | Dashboard → My Shipments | List loads, no console errors |
| Pricing page | /pricing → select a plan | CheckoutPage opens |
| Language toggle | Click EN/HI button | All labels change language |
| Logout | Profile → Logout | Redirected to /login, session cleared |

---

## STEP 3: DRIVER PORTAL SMOKE TEST

Login as a driver user. URL: auto-redirected to `/driver/dashboard`

| Test | Steps | Expected |
|------|-------|----------|
| Dashboard loads | Login | Wallet card visible, earnings shown |
| Job offer appears | Dispatch a job from agency | 30-second countdown card appears |
| Accept job | Tap Accept within 30s | Trip starts — /driver/trip |
| 7-step trip flow | Step through Load → Start → Photos → OTP | Each step transitions |
| OTP delivery | Enter correct OTP | Job status → delivered |
| Earnings page | /driver/earnings | History loads |
| Trip history | /driver/history | Previous trips listed |

---

## STEP 4: AGENCY PORTAL SMOKE TEST

Login as an agency user. URL: auto-redirected to `/agency/dashboard`

| Test | Steps | Expected |
|------|-------|----------|
| Dashboard loads | Login | Analytics cards visible |
| Jobs page | /agency/jobs | Jobs list loads in real-time |
| Accept job | New job → Assign Driver → Assign Truck | Status updates |
| Confirm delivery | Job delivered → Confirm Delivery | Status → completed |
| Generate invoice | Billing page → Download Invoice | PDF downloads correctly |
| Driver roster | /agency/drivers | Driver list with status |
| Fleet page | /agency/fleet | Truck list |
| Notification bell | Any job event | Bell badge count updates |

---

## STEP 5: ADMIN PORTAL SMOKE TEST

Login as admin user. URL: auto-redirected to `/admin`

| Test | Steps | Expected |
|------|-------|----------|
| Dashboard loads | Login | Analytics cards visible (may show 0s) |
| No red console errors | Open devtools | No uncaught exceptions |

---

## STEP 6: PAYMENT FLOW TEST (Staging/Test Mode)

```
⚠️ Use test credentials — never live keys in dev
Razorpay test card: 4111 1111 1111 1111, any future date, any CVV
PhonePe: Use test merchant ID
```

| Test | Expected |
|------|----------|
| Pricing → Checkout → Razorpay | Payment popup opens |
| Complete test payment | subscription row created in Supabase |
| PhonePe initiate | Redirects to phonepe.com / mercury.phonepe.com only |
| Invalid redirect URL | toast error shown — NOT redirected |

---

## STEP 7: SUPABASE DATA CHECKS

After running key user flows, verify in Supabase SQL editor:

```sql
-- Verify shipment was created
SELECT * FROM shipments ORDER BY created_at DESC LIMIT 5;

-- Verify subscription was created
SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 5;

-- Verify job lifecycle completed
SELECT id, status, driver_id FROM agency_jobs ORDER BY created_at DESC LIMIT 5;
```

---

## STEP 8: POST-DEPLOY VERIFICATION (Heroku)

After `git push heroku main`:

```powershell
heroku logs --tail --app truck-opti-app
```

Pass criteria:
- `Build succeeded` in log
- `State changed from starting to up` in log
- No `Error` lines in first 60 seconds after deploy

Then open `https://www.truckopti.in` and run STEP 2 minimum.

---

## KNOWN FLAKY AREAS

| Area | Issue | Workaround |
|------|-------|------------|
| Job offer Realtime | May not fire if browser tab is backgrounded | Reload page |
| PhonePe redirect | Varies by PhonePe env (test vs prod) | Use Razorpay for local testing |
| jsPDF invoice | PDF may not include Unicode Hindi text | Known limitation — use English invoice |
| Google OAuth redirect | localhost:5173 must be in Supabase redirect URLs | Add localhost to Supabase auth settings |

---

## QUICK REGRESSION CHECKLIST

Before every push, confirm:
- [ ] `npm run build` — 0 TypeScript errors
- [ ] Login works (at least OTP path)
- [ ] No red console errors on main pages
- [ ] Supabase RLS not blocking key operations

---

*Last updated: 2026-03-05 | v50 | SONNET-004*
