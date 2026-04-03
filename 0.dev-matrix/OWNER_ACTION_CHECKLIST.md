# OWNER ACTION CHECKLIST — TruckOpti Launch Blockers

> **All in-repo code work is COMPLETE. This document lists the external actions only the project owner can perform.**
> **Date verified:** 2026-03-30 | **Verifier:** GLM-002 (Manager Audit)
> **Pre-requisite:** All code changes are committed and pushed to GitHub (main branch).

---

## 🔴 CRITICAL (blocks core functionality)

### Action 0: Restore or Replace the Production Supabase Project/Host

**Why:** Live auth is currently blocked before OTP/OAuth even starts. `jbxncejtcbpcronndqlx.supabase.co` returns NXDOMAIN, and the frontend smoke fails on `/auth/v1/otp` with `ERR_NAME_NOT_RESOLVED`.

**Steps:**
1. Open Supabase Dashboard and verify whether project `jbxncejtcbpcronndqlx` still exists, is paused, or was replaced.
2. If the project still exists and is paused, restore/resume it.
3. If the project was replaced, get the new:
   - project ref / URL
   - anon key
   - service role key
4. Update production config:
```bash
heroku config:set VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co --app truck-opti-app
heroku config:set VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here --app truck-opti-app
```
5. Update local/admin tooling env vars before running maintenance scripts:
```bash
$env:SUPABASE_PROJECT_REF="YOUR_PROJECT_REF"
$env:SUPABASE_URL="https://YOUR_PROJECT_ID.supabase.co"
$env:SUPABASE_ACCESS_TOKEN="sbp_your_token_here"
$env:SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
```
6. Redeploy the app after config correction.

**Verification:**
- `nslookup YOUR_PROJECT_ID.supabase.co 8.8.8.8`
- `npm run test:frontend-smoke`
- live `/login` no longer fails on `/auth/v1/otp`

---

### Action 1: Push Pending Supabase Migrations

**Why:** 6 migration files exist in `supabase/migrations/` but have NOT been applied to the production database. Without these, many features silently fail (driver payouts, contact form, trip photos, e-way bill, RLS fixes).

**Steps:**
```bash
cd D:\Github\Truck_Opti
supabase db push
```

**Migrations to be applied:**
| File | What it adds |
|------|-------------|
| `20260307000000_fix_rls_ownership.sql` | RLS ownership on customers/shipments/routes/packing_results |
| `20260308000000_driver_payouts.sql` | driver_payouts table + RLS policies |
| `20260309000000_contact_inquiries.sql` | contact_inquiries table + RLS policies |
| `20260311000000_add_photo_columns_to_agency_jobs.sql` | photo_loading_url + photo_delivery_url columns |
| `20260311000001_driver_payouts_agency_columns.sql` | agency_id + type columns on driver_payouts |
| `20260311000002_eway_bill_column.sql` | eway_bill_data JSONB column on shipments |

**Verification:** After push, check Supabase dashboard → Table Editor. Confirm `driver_payouts` and `contact_inquiries` tables exist. Confirm `agency_jobs` has `photo_loading_url` column.

---

### Action 2: Configure Razorpay Production Keys

**Why:** Payment flow uses test/placeholder keys. Real payments will fail.

**Steps:**
1. Log into Razorpay Dashboard → Settings → API Keys
2. Generate **Live** key pair
3. Run:
```bash
heroku config:set VITE_RAZORPAY_KEY_ID=rzp_live_XXXXXX --app truck-opti-app
```
4. Set the secret in Supabase Edge Functions:
```bash
supabase secrets set RAZORPAY_KEY_SECRET=live_secret_XXXXXX
```
5. Rebuild and redeploy frontend (Heroku will auto-redeploy on next push, or manually trigger)

**Verification:** After setting, visit `/pricing` as a logged-in user and attempt a test subscription.

---

### Action 3: Configure Google OAuth for Production

**Why:** Google login button exists but production OAuth credentials may not be configured.

**Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Ensure OAuth 2.0 Client ID has these redirect URIs:
   - `https://www.truckopti.in/auth/callback`
   - `https://truckopti.in/auth/callback`
   - `https://truck-opti-app-efabf95bd306.herokuapp.com/auth/callback`
3. Go to [Supabase Dashboard](https://supabase.com/dashboard) → Your Project → Authentication → Providers → Google
4. Ensure Client ID and Client Secret match the Google Console credentials
5. Ensure "Authorized Client IDs" in Google Console includes the Supabase project

**Verification:** Log out, click "Sign in with Google" on `/login`, verify redirect completes to dashboard.

---

## 🟠 HIGH PRIORITY (important but non-blocking)

### Action 4: Configure Twilio SMS OTP in Supabase

**Why:** Phone OTP silently fails — Twilio is not configured as SMS provider.

**Steps:**
1. Create a Twilio account at twilio.com
2. Get Account SID, Auth Token, and a phone number
3. Go to Supabase Dashboard → Authentication → Providers → Phone
4. Enter Twilio credentials (Account SID, Auth Token, Sender Number)
5. Enable SMS provider
6. (Optional) For WhatsApp OTP: configure Twilio WhatsApp Business API

**Verification:** Log out, enter a real phone number on `/login`, verify OTP SMS is received.

> **⚠️ Twilio is OPTIONAL for launch.** If you accept Email OTP + Google OAuth as the launch auth methods (both already working), you can defer Twilio configuration. Phone OTP can be added later. See `docs/AUTH_ARCHITECTURE_DECISIONS.md` for the full analysis.

---

### Action 5: Configure Sentry DSN

**Why:** Sentry code is installed (`@sentry/react ^10.43.0`) and wired in `main.tsx`, but no DSN is configured — so no errors are reported.

**Steps:**
1. Create a Sentry project at sentry.io (free tier available)
2. Get the DSN from Project Settings → Client Keys
3. Run:
```bash
heroku config:set VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx --app truck-opti-app
```
4. Rebuild frontend (Heroku will pick up on next deploy)

**Verification:** Trigger a JS error on the live site, check Sentry dashboard for the error event.

---

### Action 6: Verify Production Database Backups

**Why:** No confirmed PITR (Point-in-Time Recovery) or backup schedule.

**Steps:**
1. Go to Supabase Dashboard → Your Project → Database → Backups
2. Verify automated daily backups are enabled (Pro plan required for PITR)
3. If on free tier: consider upgrading to Pro ($25/month) for PITR, or set up manual pg_dump cron

**Verification:** Check backup history shows recent successful backups.

---

## ✅ AFTER ALL 6 ACTIONS

Once all actions are complete, perform a final end-to-end smoke test:

1. **Customer flow:** Login → Book a Truck → Track Shipment
2. **Agency flow:** Login → View Jobs → Assign Driver → Confirm Delivery
3. **Driver flow:** Login → Accept Job → Complete Trip → Check Earnings
4. **Admin flow:** Login → View Dashboard → Manage Users/Subscriptions/Payouts
5. **Payment flow:** Subscribe to a plan via Razorpay
6. **Auth flow:** Login with Google OAuth + Phone OTP + Email OTP

If all 6 flows work → **PROJECT IS LAUNCHED.**

---

*Created by GLM-002 (Manager) | 2026-03-30 | TruckOpti Launch Readiness*
