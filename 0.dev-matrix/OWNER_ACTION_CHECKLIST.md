# OWNER ACTION CHECKLIST — TruckOpti Launch Blockers

> **All in-repo code work is COMPLETE. This document lists the external actions only the project owner can perform.**
> **Date verified:** 2026-04-09 | **Verifier:** GPT-005 (Manager Audit)
> **Pre-requisite:** All code changes are committed and pushed to GitHub (main branch).

> **2026-04-09 note:** PhonePe sandbox has already been disabled in Heroku for launch. Do not re-enable PhonePe unless production credentials are ready.

---

## 🔴 CRITICAL (blocks core functionality)

### Action 0: Production Supabase Project/Host Recovery

**Status:** ✅ RESOLVED on 2026-04-05

**Why it mattered:** Live auth had been blocked before OTP/OAuth even started.

**Current reality:**
- `jbxncejtcbpcronndqlx.supabase.co` resolves again
- public/auth shell smoke is back to `17/17 PASS`
- production config audit now passes the `supabase_auth_backend` check

**What to do now:** No further owner action is needed here unless the Supabase project ref or production keys change again.

**Verification:**
- `npm run test:frontend-smoke` → `17/17 PASS` on 2026-04-09
- `npm run test:prod-config` → `supabase_auth_backend` PASS on 2026-04-09
- live `/login` no longer fails on `/auth/v1/otp` because the auth host resolves again

---

### Action 1: Supabase Migrations

**Status:** ✅ Resolved on 2026-04-16 and extended on 2026-04-18.

**Reality:** The linked production database was already pushed through the required migration set, and later auth/PAN migrations were also applied. This is no longer an owner action item.

**Verification:** `npx supabase db push --dry-run --yes` reports `Remote database is up to date`, and the synced rollout is recorded in `STATE.md`, `TASK.md`, and `AI-HANDOFF.md`.

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

**Status:** 🟡 Redirect wiring verified on 2026-04-09; live account sign-in still needs final manual verification.

**Why:** Google login button exists but production OAuth credentials may not be configured.

**Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create or edit a **Web application** OAuth client.
3. Under **Authorized JavaScript origins**, add:
   - `https://www.truckopti.in`
   - `https://truckopti.in`
   - `https://truck-opti-app-efabf95bd306.herokuapp.com`
4. Under **Authorized redirect URIs**, add the **Supabase callback URL** shown on Supabase Dashboard → Authentication → Providers → Google.
   - For this project, it should be the Supabase-hosted callback, not the app's `/auth/callback` route.
   - Typical format: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
5. Go to [Supabase Dashboard](https://supabase.com/dashboard) → Your Project → Authentication → Providers → Google
6. Paste the Google Client ID and Client Secret there and enable the provider.
7. In Supabase Auth settings, ensure the redirect allow-list / site URL includes:
   - `https://www.truckopti.in/auth/callback`
   - `https://truckopti.in/auth/callback`
   - `https://truck-opti-app-efabf95bd306.herokuapp.com/auth/callback`

**Verification:** Log out, click "Sign in with Google" on `/login`, verify redirect completes to dashboard. As of 2026-04-09, the live button already redirects correctly to `accounts.google.com` using the Supabase callback URL.

---

## 🟠 HIGH PRIORITY (important but non-blocking)

### Action 4: Re-enable Supabase Phone OTP via Twilio

**Why:** Phone OTP is intentionally hidden by default for launch. If you enable it later, TruckOpti should use the existing Supabase Phone provider with Twilio/Twilio Verify only, not Firebase Auth as a second production auth system.

**Steps:**
1. Create a Twilio account at twilio.com
2. Choose Twilio Verify (preferred) or Twilio Programmable Messaging for your OTP delivery path
3. If using Twilio Verify: create a Verification Service and copy the Verification Service SID
4. Go to Supabase Dashboard → Authentication → Providers → Phone
5. Configure the Phone provider with the matching Twilio credentials:
   - Twilio Verify: Verification Service SID
   - Programmable Messaging: Account SID, Auth Token, and Sender Number or Messaging Service SID
6. Save the provider configuration and verify OTP delivery directly through Supabase
7. Only after provider verification succeeds, set deployed frontend `VITE_AUTH_PHONE_OTP_ENABLED=true`
8. (Optional) For WhatsApp OTP: use Twilio Verify or configure the Twilio Content SID path in Supabase

**Verification:** Log out, enter a real phone number on `/login`, verify OTP SMS is received.

> **⚠️ Twilio is OPTIONAL for launch.** If you accept Email OTP + Google OAuth as the launch auth methods (both already working), you can defer Twilio configuration. If phone OTP is added later, keep the implementation on Supabase Phone + Twilio only. See `docs/AUTH_ARCHITECTURE_DECISIONS.md` for the full analysis.

---

### Action 5: Sentry DSN

**Status:** ✅ Resolved on 2026-04-16.

**Reality:** Sentry project `light9/truck-opti` was created and Heroku `VITE_SENTRY_DSN` is already configured. This is no longer a missing launch action.

**Verification:** `npm run test:prod-config` now passes the `sentry_dsn` check, and the launch checklist/TASK entry mark T-116 as done.

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
6. **Auth flow:** Login with Google OAuth + Email OTP, and include Phone OTP only if Action 4 is intentionally re-enabled later

If all 6 flows work → **PROJECT IS LAUNCHED.**

---

*Created by GLM-002 (Manager) | 2026-03-30 | TruckOpti Launch Readiness*
