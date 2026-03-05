# �️ TRUCKOPTI — Developer Setup Guide

> How to set up a local dev environment, understand the build pipeline, and deploy.

---

## 💻 LOCAL SETUP

### Prerequisites
- Node.js 20.x
- PowerShell (Windows) or Bash
- Supabase CLI (for Edge Function deployment)
- Heroku CLI (for deployment)

### Install dependencies
```powershell
cd d:\Github\Truck_Opti\frontend
npm install
```

### Environment variables
Copy `.env.example` to `.env` and fill in:
```bash
VITE_SUPABASE_URL=https://jbxncejtcbpcronndqlx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...          # public anon key (safe in VITE_)
VITE_RAZORPAY_KEY_ID=rzp_test_XXX      # test key for local dev
VITE_AUTH_EMAIL_OTP_ENABLED=true
VITE_APP_URL=http://localhost:5173
```

### Dev server
```powershell
cd d:\Github\Truck_Opti\frontend
npm run dev       # http://localhost:5173
```

---

## 📦 BUILD & DEPLOY

### Build (must be clean before any push)
```powershell
cd d:\Github\Truck_Opti\frontend
npm run build     # outputs to dist/
# Must show 0 TypeScript errors
```

### Deploy to Heroku
```powershell
cd d:\Github\Truck_Opti
git add -A
git commit -m "feat: description"
git push origin main         # GitHub first
git push heroku main         # Heroku second (triggers auto-build)

# Monitor deploy
heroku logs --tail --app truck-opti-app
```

### Heroku configuration
```powershell
# Check current config vars
heroku config --app truck-opti-app

# Set a new var
heroku config:set KEY=value --app truck-opti-app
```

---

## 🧪 SUPABASE

### Dashboard
- Project: `jbxncejtcbpcronndqlx.supabase.co`
- Migrations: `supabase/migrations/*.sql`

### Run a migration
```powershell
supabase db push --project-ref jbxncejtcbpcronndqlx
# OR apply directly in Supabase dashboard SQL editor
```

### Deploy Edge Function
```powershell
supabase functions deploy FUNCTION_NAME --project-ref jbxncejtcbpcronndqlx

# Set Edge Function secrets
supabase secrets set KEY=value --project-ref jbxncejtcbpcronndqlx
```

---

## 🔑 ENVIRONMENT VARIABLES REFERENCE

| Variable | Location | Public? | Used For |
|----------|----------|---------|----------|
| `VITE_SUPABASE_URL` | `.env` | ✅ Public | Supabase client |
| `VITE_SUPABASE_ANON_KEY` | `.env` | ✅ Public | Supabase client |
| `VITE_RAZORPAY_KEY_ID` | `.env` | ✅ Public | Razorpay SDK init |
| `VITE_AUTH_EMAIL_OTP_ENABLED` | `.env` | ✅ Public | Feature flag |
| `RAZORPAY_KEY_SECRET` | Heroku config vars | ❌ Secret | Server-side Razorpay |
| `RAZORPAY_WEBHOOK_SECRET` | Heroku config vars + Supabase secrets | ❌ Secret | Webhook HMAC verify |
| `PHONEPE_MERCHANT_SECRET` | Heroku config vars | ❌ Secret | PhonePe HMAC |
| `SUPABASE_SERVICE_ROLE_KEY` | Heroku config vars | ❌ Secret | Admin DB ops |

**Never use `VITE_` prefix for secrets** — they are bundled into the public JS.

---

## 📑 MIGRATION HISTORY

| File | Contents |
|------|---------|
| `20260107000000_base_schema.sql` | Core tables: trucks, cartons, customers, shipments, routes, users |
| `20260108000000_subscriptions.sql` | subscription_plans, subscriptions, invoices, usage_tracking |
| `20260109000000_extended_schema.sql` | drivers, transport_agencies, agency_jobs, job_offers, driver_locations |
| `20260212000000_production_setup.sql` | Production RLS policy reset + performance indexes |
| `20260213000000_phase1_drivers.sql` | Booking columns on shipments, dispatch_job_to_drivers() function |

---

## 🚨 KNOWN PRODUCTION ISSUES

See `SECURITY.md §2` for BUG-RLS-001 through BUG-RLS-006 (cross-tenant RLS gaps).
See `ROADMAP.md 🔴 OPEN BUGS` for current bug list.

---

*Last updated: 2026-03-05 | v50 | SONNET-004*
