# Environment variable checklist

Every environment variable NAME read by the frontend (`import.meta.env.VITE_*`), the
Supabase Edge functions (`Deno.env.get`, plus the `getRequiredEnv` helper), and the
scripts/tooling (`process.env.*`, `readEnvValue(...)`, `getenv(...)`). No values appear
in this file. It was checked against the source on 2026-11-18.

Key to the columns:

- **Supplied by**: `OWNER only` means a real account, secret, domain, or production
  value that only the owner can provide. Agents must not invent or guess these.
  `Agent-safe default` means the code has a default, the value is a local or
  non-secret flag, or the platform injects it.
- **Required?** is taken from the code: "Required" means the code throws or fails
  without it; "Optional" means it has a fallback or a feature stays off.
- Edge function secrets are set with `supabase secrets set` (Supabase dashboard).
  Frontend `VITE_*` values are set in the build environment and baked in at build
  time, so they are public. Script values come from the shell or a local
  `.env.proof` file (not committed; see `.env.proof.example`).

Staging state (2026-11-19): the function secrets set on the staging project are `RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`, in TEST mode, with `npx supabase secrets set --env-file .env.proof`.
For the Razorpay path, the PhonePe names and the AWS/SES and billing email names are not needed. The PhonePe
functions answer 503 when unconfigured.

Totals: 70 unique names (21 frontend, 24 Edge functions, 25 scripts and tooling only).
Three names (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are used by
both Edge functions and scripts; they have a row in each section and count once in the total.
`BILLING_GST_*` and `VITE_SUPABASE_*` are also reused across sections and are noted in place.

## Frontend (Vite build environment, `frontend/src`)

| Name | Used by | Where it is set | Required? | Supplied by | Note |
|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | `frontend/src/lib/supabase.ts`; also `scripts/test-supabase-connection.mjs` (process.env) | Vite build env | Required | OWNER only | Project URL. The secrets audit build overrides it with a dummy value. |
| `VITE_SUPABASE_ANON_KEY` | `frontend/src/lib/supabase.ts`; also `scripts/test-supabase-connection.mjs` (process.env) | Vite build env | Required | OWNER only | Public anon key. The audit FAILs if it decodes to `service_role`. |
| `VITE_GOOGLE_MAPS_API_KEY` | `components/GoogleMapView.tsx`, `components/MapViewWrapper.tsx` | Vite build env | Optional (map falls back) | OWNER only | Browser key; restrict it by HTTP referrer. |
| `VITE_GOOGLE_CLIENT_ID` | `lib/googleAuth.ts` | Vite build env | Optional (Google sign-in off) | OWNER only | Public OAuth client id. |
| `VITE_APP_URL` | `main.tsx` | Vite build env | Optional | OWNER only | Canonical app URL for redirects. |
| `VITE_APP_VERSION` | `utils/monitoring.ts` | Vite build env | Optional | Agent-safe default | Falls back to empty. |
| `VITE_SENTRY_DSN` | `utils/monitoring.ts` | Vite build env | Optional (monitoring off) | OWNER only | Error-reporting DSN. |
| `VITE_SENTRY_RELEASE` | `utils/monitoring.ts` | Vite build env | Optional | Agent-safe default | Release tag. |
| `VITE_SENTRY_STAGING_PROBE` | `main.tsx` | Vite build env (staging only) | Optional | Agent-safe default | Only `1` for a one-off staging probe. Never set in production. |
| `VITE_SYNC_URL` | `lib/syncClient.ts` | Vite build env | Optional | OWNER only | Sync backend base URL. |
| `VITE_RAZORPAY_KEY_ID` | `services/razorpayPayment.ts` | Vite build env | Optional (Razorpay checkout off) | OWNER only | Public key id. Its test or live mode must match the server secret. |
| `VITE_ALLOW_TEST_RAZORPAY_ON_PRODUCTION` | `services/razorpayPayment.ts` | Vite build env | Optional | Agent-safe default | Leave unset (false) in production builds. |
| `VITE_PHONEPE_MERCHANT_ID` | `services/phonepePayment.ts` | Vite build env | Optional (PhonePe off) | OWNER only | Public merchant id. |
| `VITE_PHONEPE_API_URL` | `services/phonepePayment.ts` | Vite build env | Optional | OWNER only | PhonePe API base URL for the target environment. |
| `VITE_BILLING_GST_ENABLED` | `config/billing.ts` | Vite build env | Optional (defaults off) | Agent-safe default | Feature flag. |
| `VITE_BILLING_GST_RATE_PERCENT` | `config/billing.ts` | Vite build env | Optional (code default) | Agent-safe default | Feature value. |
| `VITE_AUTH_PASSWORD_ENABLED` | `lib/authSurfaceMethods.ts` | Vite build env | Optional | Agent-safe default | Feature flag. Changing sign-in methods is an owner decision. |
| `VITE_AUTH_EMAIL_OTP_ENABLED` | `lib/authSurfaceMethods.ts` | Vite build env | Optional | Agent-safe default | Feature flag. |
| `VITE_AUTH_PHONE_OTP_ENABLED` | `lib/authSurfaceMethods.ts` | Vite build env | Optional | Agent-safe default | Feature flag. |
| `VITE_TEST_EMAIL` | `pages/TestPaymentPage.tsx` | Vite build env (dev or staging only) | Optional | OWNER only | Test account email; falls back to a placeholder address. |
| `VITE_TEST_PASSWORD` | `pages/TestPaymentPage.tsx` | Vite build env (dev or staging only) | Optional | OWNER only | Secret. A value set at build time is embedded in the public JS bundle, so it must never be set for a production build. |

## Edge functions (`supabase/functions`, `_shared`)

| Name | Used by | Where it is set | Required? | Supplied by | Note |
|---|---|---|---|---|---|
| `SUPABASE_URL` | `erp-ingest`, `razorpay-webhook`, `phonepe-checkout`, `phonepe-status`, `_shared/invoice-delivery.ts`, `_shared/portal-auth.ts`, `admin-portal-users`, `admin-portal-subscriptions`, `admin-backfill-invoice-delivery`; also `scripts/` (see scripts section) | Supabase Edge runtime (auto-injected) | Required | Agent-safe default | Platform-injected. Not set by hand. |
| `SUPABASE_ANON_KEY` | `phonepe-checkout`, `phonepe-status`, `_shared/portal-auth.ts`, `admin-portal-users`, `admin-portal-subscriptions`, `admin-backfill-invoice-delivery`; also `scripts/` | Supabase Edge runtime (auto-injected) | Required | Agent-safe default | Platform-injected. |
| `SUPABASE_SERVICE_ROLE_KEY` | `erp-ingest`, `razorpay-webhook`, `phonepe-checkout`, `phonepe-status`, `_shared/portal-auth.ts`, `admin-portal-users`, `admin-portal-subscriptions`, `admin-backfill-invoice-delivery`; also `scripts/` | Supabase Edge runtime (auto-injected) | Required | Agent-safe default | Platform-injected secret. Never copied to the frontend or printed. Outside `supabase/functions` and `scripts/` the audit FAILs on this name. |
| `RAZORPAY_KEY_ID` | `create-razorpay-order`, `verify-razorpay-payment` | Supabase function secret | Required for payments (empty fallback) | OWNER only | Key id; test or live mode. |
| `RAZORPAY_KEY_SECRET` | `create-razorpay-order`, `verify-razorpay-payment` | Supabase function secret | Required for payments | OWNER only | Secret. |
| `RAZORPAY_WEBHOOK_SECRET` | `razorpay-webhook` | Supabase function secret | Required for webhook | OWNER only | Secret used to verify webhook signatures. |
| `PHONEPE_MERCHANT_ID` | `phonepe-checkout`, `phonepe-status` | Supabase function secret | Optional (PhonePe off) | OWNER only | Merchant id. |
| `PHONEPE_SALT_KEY` | `phonepe-checkout`, `phonepe-status` | Supabase function secret | Optional (required for PhonePe) | OWNER only | Secret salt. |
| `PHONEPE_SALT_INDEX` | `phonepe-checkout`, `phonepe-status` | Supabase function secret | Optional (code default) | Agent-safe default | Defaults to `1`. |
| `PHONEPE_API_URL` | `phonepe-checkout`, `phonepe-status` | Supabase function secret | Optional (code default: sandbox) | OWNER only | Set the production API base URL only for live payments. |
| `PHONEPE_ALLOWED_CALLBACK_ORIGINS` | `phonepe-checkout` | Supabase function secret | Optional | OWNER only | Allowed return origins. |
| `PHONEPE_CALLBACK_ORIGIN` | `phonepe-checkout` | Supabase function secret | Optional | OWNER only | Primary return origin. |
| `BILLING_GST_ENABLED` | `_shared/billing.ts` (and `scripts/customer_journey_isolation.db.test.mjs`) | Supabase function secret | Optional (defaults off) | Agent-safe default | Feature flag. |
| `BILLING_GST_RATE_PERCENT` | `_shared/billing.ts` (and `scripts/customer_journey_isolation.db.test.mjs`) | Supabase function secret | Optional (code default) | Agent-safe default | Rate value. |
| `BILLING_EMAIL_FROM` | `_shared/invoice-delivery.ts` | Supabase function secret | Optional (code default) | OWNER only | Sender must be a verified SES identity. |
| `BILLING_SUPPORT_EMAIL` | `_shared/invoice-delivery.ts` | Supabase function secret | Optional (code default) | OWNER only | Reply-to address. |
| `BILLING_APP_URL` | `_shared/invoice-delivery.ts` | Supabase function secret | Optional (code default) | OWNER only | App URL used in invoice emails. |
| `AWS_ACCESS_KEY_ID` | `_shared/invoice-delivery.ts` | Supabase function secret | Optional (SES email off) | OWNER only | Secret credential for SES. |
| `AWS_SECRET_ACCESS_KEY` | `_shared/invoice-delivery.ts` | Supabase function secret | Optional (SES email off) | OWNER only | Secret credential for SES. |
| `AWS_SESSION_TOKEN` | `_shared/invoice-delivery.ts` | Supabase function secret | Optional (temporary creds only) | OWNER only | Secret. |
| `AWS_SES_REGION` | `_shared/invoice-delivery.ts` | Supabase function secret | Optional (falls back to `AWS_REGION`) | OWNER only | SES region. |
| `AWS_REGION` | `_shared/invoice-delivery.ts` | Supabase function secret | Optional (fallback) | OWNER only | Fallback region. |
| `AWS_DEFAULT_REGION` | `_shared/invoice-delivery.ts` | Supabase function secret | Optional (fallback) | OWNER only | Last-resort region. |
| `AWS_SES_CONFIGURATION_SET` | `_shared/invoice-delivery.ts` | Supabase function secret | Optional | OWNER only | SES configuration set name. |

## Scripts and tooling (`scripts/`, `supabase/verify_database.js`, `apps/web`, `server.js`)

These are read from the shell, a local `.env.proof` file, or the Heroku config. None is
set by a committed file. Names that also appear above are not repeated here.

| Name | Used by | Where it is set | Required? | Supplied by | Note |
|---|---|---|---|---|---|
| `SUPABASE_URL` (scripts) | `scripts/atomic_job_offer_response.browser-proof.mjs`, `scripts/atomic_job_offer_response.rls.test.mjs`, `scripts/check_role_trigger.js`, `scripts/run-expiry-sweeps.mjs`, `scripts/live-auth-proof.cjs`, `scripts/seed-portal-demo-accounts.cjs`, `supabase/verify_database.js`, `supabase/functions/driver-kyc/local-disposable-battery.mjs` | Shell or local `.env.proof` | Required by those scripts | OWNER only (hosted); agent-safe for a local stack | Hosted project URL. |
| `SUPABASE_ANON_KEY` (scripts) | `scripts/atomic_job_offer_response.browser-proof.mjs`, `scripts/atomic_job_offer_response.rls.test.mjs`, `supabase/functions/driver-kyc/local-disposable-battery.mjs` | Shell or local `.env.proof` | Required by those scripts | OWNER only (hosted); agent-safe for a local stack | Public anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` (scripts) | `scripts/atomic_job_offer_response.browser-proof.mjs`, `scripts/atomic_job_offer_response.rls.test.mjs`, `scripts/check_role_trigger.js`, `scripts/get_otp.js`, `scripts/run-expiry-sweeps.mjs`, `scripts/live-auth-proof.cjs`, `scripts/seed-portal-demo-accounts.cjs`, `supabase/verify_database.js`, `supabase/functions/driver-kyc/local-disposable-battery.mjs` | Shell or local `.env.proof` | Required by those scripts | OWNER only | Secret. Never place it in the frontend. |
| `SUPABASE_PROJECT_REF` | `scripts/check_rls.js`, `scripts/check_sub_rls.js`, `scripts/fix_admin.js`, `scripts/get_magic_link.js`, `scripts/get_otp.js` | Shell | Required by those scripts | OWNER only | Project reference id. |
| `SUPABASE_ACCESS_TOKEN` | `scripts/check_rls.js`, `scripts/check_sub_rls.js`, `scripts/fix_admin.js`, `scripts/get_magic_link.js` | Shell | Required by those scripts | OWNER only | Secret personal access token. |
| `SUPABASE_PUBLIC_URL` | `scripts/frontend_launch_smoke.mjs` | Shell | Optional | OWNER only | Public URL for smoke tests. |
| `SUPABASE_LOCAL_URL` | `scripts/atomic_job_offer_response.rls.test.mjs` | Shell | Optional | Agent-safe default | Local stack URL. |
| `SUPABASE_TEST_EMAIL` | `scripts/get_magic_link.js`, `scripts/get_otp.js` | Shell | Optional | OWNER only | Test account email; the owner creates the account. |
| `SEED_DEMO_PASSWORD` | `scripts/seed-portal-demo-accounts.cjs`, `scripts/live-auth-proof.cjs`, `scripts/live-admin-proof.cjs`, `scripts/check-proof-env.cjs` | Shell or local `.env.proof` | Required by those scripts | OWNER only | Secret demo password. |
| `RAZORPAY_REVIEW_DEMO_PASSWORD` | `scripts/seed-portal-demo-accounts.cjs`, `scripts/check-proof-env.cjs` | Shell or local `.env.proof` | Required by those scripts | OWNER only | Secret demo password. |
| `PROOF_BASE_URL` | `scripts/live-auth-proof.cjs`, `scripts/live-admin-proof.cjs` | Shell | Optional | Agent-safe default | Localhost by default. |
| `PUBLIC_APP_URL` | `scripts/customer_local_workspace.browser-proof.mjs`, `scripts/frontend_launch_smoke.mjs`, `scripts/public_frontend_smoke.mjs`, `scripts/ux_route_audit.mjs` | Shell | Optional | Agent-safe default | Localhost by default; owner supplies hosted URLs. |
| `SMOKE_BASE_URL` | `scripts/webwright/full_app_smoke.py` | Shell | Optional | Agent-safe default | Local base URL. |
| `HEALTH_BASE_URL` | `scripts/check-deployment-health.mjs` | Shell | Optional | Agent-safe default | Local by default; owner supplies the hosted URL. |
| `MAGIC_LINK_REDIRECT_TO` | `scripts/get_magic_link.js` | Shell | Optional | OWNER only | Redirect target for the hosted app. |
| `HEROKU_APP_NAME` | `scripts/production_config_audit.mjs` | Shell | Optional | OWNER only | Heroku app name. |
| `HEROKU_ORIGIN_HOST` | `server.js` | Heroku config | Optional | OWNER only | Origin host for the Heroku deployment. |
| `PORT` | `server.js` | Heroku (platform-set) | Optional (code default) | Agent-safe default | Platform-set port. |
| `AUDIT_CONFIG_JSON` | `scripts/production_config_audit.mjs` | Shell | Optional | Agent-safe default | Inline audit config; leave unset unless the owner supplies one. |
| `AUDIT_HEALTH_TIMEOUT_MS` | `scripts/production_config_audit.mjs` | Shell | Optional | Agent-safe default | Timeout value. |
| `RACE_ITERATIONS` | `scripts/race/postgres_race.test.mjs` | Shell | Optional | Agent-safe default | Test loop count. |
| `RACE_MODULES` | `scripts/race/_realPg.mjs` | Shell | Optional | Agent-safe default | Module filter. |
| `STAFF_SCOPE_OUT` | `scripts/gen_staff_scope_migration.mjs` | Shell | Optional | Agent-safe default | Output path. |
| `DRIVER_MODEL_OUT` | `scripts/gen_driver_model_migration.mjs` | Shell | Optional | Agent-safe default | Output path. |
| `PSQL_CONTAINER` | `supabase/functions/driver-kyc/local-disposable-battery.mjs` | Shell | Optional | Agent-safe default | Local database container name. |
| `TRUCKOPTI_E2E_BASE_URL` | `apps/web/jest.setup.js` | Shell | Optional | Agent-safe default | Local base URL. |
| `TRUCKOPTI_E2E_HEADLESS` | `apps/web/jest.setup.js` | Shell | Optional | Agent-safe default | Headless flag. |
| `TRUCKOPTI_SCREENSHOT_DIR` | `apps/web/jest.setup.js` | Shell | Optional | Agent-safe default | Output folder for screenshots. |

## Not covered by this checklist

Python (`os.environ` / `getenv` in `apps/web/app`) and PowerShell (`$env:` in
`scripts/*.ps1`) readers were not enumerated. Add them before a release gate that
depends on them.
