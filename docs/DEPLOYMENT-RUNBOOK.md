# Deployment and Rollback Runbook - TruckOpti hosted pilot

Audience: the owner and the operating engineer on release day. Steps marked **[OWNER]** may only be
performed by the owner. Steps marked **[AGENT]** are local or read-only and may be run by an engineer.

Status as of 2026-11-18: built and tested locally; ready for staging once gates 1-6 pass; not yet run on
any hosted Supabase project.

No secret value appears in this file. Names only. Values live in the owner's password manager or are typed
at the owner's own prompt.

## 1. Environments

| Environment | What it is | Evidence |
|---|---|---|
| Production web | Node/Express server (`server.js`) serving `frontend/dist` on Heroku. Canonical URL `https://www.truckopti.in`. | `server.js`, `Procfile`, `heroku.yml`, `Dockerfile` |
| Production data | Hosted Supabase project (Postgres 17, Auth, Storage, Edge Functions). The project ref is kept in the owner's records, not here. | `supabase/config.toml` (`major_version = 17`) |
| Staging | A separate hosted Supabase project. Every hosted gate (7-11) runs here first. Its ref must differ from production. | `docs/STAGING-SMOKE-CHECKLIST.md` |
| Local | Vite dev server, embedded PostgreSQL and the journey shim. No hosted project is touched. | `scripts/harness/run.mjs` |

Two Heroku deploy definitions exist in the repo. The owner confirms which one the app uses before deploying:
buildpack (`Procfile`, where `npm start` runs `node server.js`) or container (`heroku.yml` builds the
`Dockerfile`). Both build the frontend through `heroku-postbuild`. Node is pinned to 24.x.

## 2. Settings by name

**Frontend build variables (`VITE_*`, public, baked in at build time).** A change needs a redeploy.

- Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`.
- Optional: `VITE_SENTRY_DSN`, `VITE_SENTRY_RELEASE`, `VITE_APP_VERSION`, `VITE_RAZORPAY_KEY_ID`,
  `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_PHONEPE_MERCHANT_ID`, `VITE_PHONEPE_API_URL`.
- Must be unset for production: `VITE_SENTRY_STAGING_PROBE`, `VITE_ALLOW_TEST_RAZORPAY_ON_PRODUCTION`,
  `VITE_TEST_EMAIL`, `VITE_TEST_PASSWORD`.
- `deploy-heroku.sh` forwards only the three required names. Any other `VITE_*` name needs that script extended first.

**Edge Function secrets (server side only; set in the Supabase dashboard or with `supabase secrets set NAME=...`).**

- Payments: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. The webhook secret is separate
  from the API secret. The key id must match the mode (`rzp_test_` on staging).
- PhonePe, only if in scope: `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX`, `PHONEPE_API_URL`,
  `PHONEPE_CALLBACK_ORIGIN`, `PHONEPE_ALLOWED_CALLBACK_ORIGINS`.
- Billing and email, owner values, optional: `BILLING_EMAIL_FROM`, `BILLING_SUPPORT_EMAIL`, `BILLING_APP_URL`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_SES_REGION`, `AWS_REGION`,
  `AWS_DEFAULT_REGION`, `AWS_SES_CONFIGURATION_SET`.
- `BILLING_GST_ENABLED` and `BILLING_GST_RATE_PERCENT`: leave at code defaults unless the owner decides otherwise.
- Platform-injected, never set by hand: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- The full name-by-name table is in `docs/ENV-CHECKLIST.md`.

**Server runtime.** `PORT` is set by Heroku. `HEROKU_ORIGIN_HOST` must match `heroku domains` if the app is ever recreated.

**Supabase Auth.** After the domain is live, add `https://www.truckopti.in/auth/callback` to the redirect URLs.
OAuth and SMTP on the hosted project are owner gates.

## 3. Release gates (exact commands)

Per `docs/FABLE-RULINGS-2026-11-17-B.md` section 3: "Ready for staging" needs gates 1-6; "Ready for the first
sale" needs all eleven.

**Gates 1-6, local, one command:**

```
npm run release:gates
```

It writes `logs/release-gates/<UTC time>.md` and prints `Verdict: READY FOR STAGING` only when every check of
gates 1-6 passes. A SKIPPED check counts as not ready. `node scripts/release_gates.mjs --only 1,4` reruns selected
gates. Gate 6 also needs the manual Codex review of the diff, which the runner does not check.

The individual commands, so a failure can be reproduced:

| Gate | What | Exact command(s) |
|---|---|---|
| 1 | Typecheck, lint, unit tests, build | `cd frontend && npx tsc --noEmit && npm run lint && npx vitest run && npm run build` |
| 2 | Database batteries (40 files) | `node scripts/<file>.db.test.mjs` for each `scripts/*.db.test.mjs`, including the 20261035 battery |
| 3 | Concurrency races on real PostgreSQL | `RACE_MODULES=D:/tmp/pgrace npm run test:race`, plus `node scripts/race/new_commands.race.mjs` and `node scripts/race/subscription.race.mjs` with the same `RACE_MODULES`. `D:/tmp/pgrace` must exist with embedded-postgres and pg installed; otherwise the gate is SKIPPED and the verdict is not ready. |
| 4 | Edge writes, types drift, prod config, edge harness, secrets | `npm run test:edge-writes`, `npm run types:drift`, `npm run test:prod-config`, `npm run test:edge-harness`, `npm run test:secrets` |
| 5 | Local full journey, desktop and 375 px | `npm run test:journey`. Screenshots land in `evidence/journey/`. Exit 0 only when every step passes and no forbidden request was attempted. |
| 6 | Independent review and Razorpay dry run | Codex review of the diff (manual; record it in the sign-off). Then `node scripts/razorpay_sandbox_proof.mjs --dry-run` (no network). |

Also run before the release commit: `npm test` (frontend unit suite) and `npm run test:server-routing`.
After deploy: `npm run test:public-smoke` and `npm run test:frontend-smoke` (section 7).

**Gates 7-11, hosted staging.** Run the sections of `docs/STAGING-SMOKE-CHECKLIST.md` in order. Each has a
PASS/FAIL line; a FAIL stops the run until it is understood.

| Gate | What | Checklist section |
|---|---|---|
| 7 | Staging `supabase db push` through the latest migration; Edge functions deployed; hosted journey passes, Edge pages included | A1-A6, B1-B3, E1, F1 |
| 8 | Razorpay TEST mode: order, capture, duplicate webhook, failed payment, refund | G1-G3 (`docs/TO-152-runbook.md`) |
| 9 | `cron.job` lists `truckopti-subscription-sweeps`; sweep runs recorded | A6 |
| 10 | Backup taken; enforcement rollback rehearsed; database restore rehearsed on staging | A2, H1-H3 |
| 11 | Every approved agency has a live subscription row before enforcement goes on; then enforcement on | I1-I4 |

Gate 11 is an owner sign-off. Enforcement stays off until it is recorded.

## 4. Order of operations

### 4a. Staging (all of it before production)

1. **[AGENT]** Gates 1-6 green (section 3), and the working tree committed. At the last status check the
   migrations `20261041000000_admin_billing_ops_read.sql` and `20261042000000_invoice_consignment_link.sql` were
   untracked; they must be committed before any push.
2. **[OWNER]** Create the staging project. Record its ref and keys in the password manager.
3. **[OWNER]** Take a backup of the staging database (the restore point for gate 10).
4. **[AGENT]** `supabase link --project-ref <staging ref>`; confirm the linked ref, then `supabase db push`.
   Verify the chain with checklist A5-A6.
5. **[OWNER]** Set the function secrets (section 2) by name.
6. **[AGENT]** Deploy the functions with the flags in section 5.
7. **[OWNER]** Fill the platform billing settings on staging (checklist C1) and create the test agency (D1).
8. **[AGENT]** Build the frontend against staging `VITE_*` values and run the hosted journey (E1, F1).
9. Gates 8-11 (Razorpay test mode, cron, rollback rehearsal, enforcement switch) per section 3.
10. Record the sign-off with the release commit hash, names and dates. Keep proof output outside git.

### 4b. Production (only after 4a is signed off and the owner gives a go)

1. **[OWNER]** Confirm PITR is enabled on the production project and take a dump.
2. **[OWNER]** Run the read-only inventory queries on production (duplicate agency users, catalog drift, stale
   offers, migration drift; see `docs/TO-152-runbook.md` and `TASKS.md`) and record the results.
3. **[OWNER]** Go/no-go for `supabase db push` to production. Migrations apply in filename order only. Never
   reorder, edit an applied file, or apply DDL by hand.
4. **[OWNER]** Set production secrets by name (section 2). Live Razorpay keys only after the owner's explicit
   live-money approval.
5. **[OWNER]** Deploy the reviewed Edge Function versions with the flags in section 5. Tag the release.
6. **[OWNER]** Deploy the web app:
   `HEROKU_APP_NAME=<app> VITE_SUPABASE_URL=<vault> VITE_SUPABASE_ANON_KEY=<vault> VITE_APP_URL=https://www.truckopti.in ./deploy-heroku.sh`.
   The script exits 1 on any missing variable, verifies the app exists, pins the git remote, and never invents credentials.
7. **[AGENT]** Health and smoke checks (section 7).
8. **[OWNER]** Keep enforcement off (`enforcement_enabled = false`) until every approved agency has a live
   subscription row (checklist I1) and the owner signs off gate 11 for production.
9. **[OWNER]** Live-money testing is a separate, explicit approval. The steps above never imply it.

## 5. Edge Functions and JWT settings

There are 23 functions under `supabase/functions/`, plus the `_shared` library. `supabase/config.toml` has no
per-function `verify_jwt` entry, so the deploy flag decides. Do not override it by hand.

| Function | JWT verification | Deploy command |
|---|---|---|
| `razorpay-webhook` | **OFF**. Razorpay sends no Supabase JWT; the HMAC signature is the gate. | `supabase functions deploy razorpay-webhook --no-verify-jwt` |
| `erp-ingest` | **OFF**. ERP systems send a per-connection secret, which the function checks. | `supabase functions deploy erp-ingest --no-verify-jwt` |
| `create-razorpay-order`, `verify-razorpay-payment` | on (user session) | `supabase functions deploy <name>` |
| `admin-backfill-invoice-delivery`, `admin-portal-agencies`, `admin-portal-contact`, `admin-portal-dashboard`, `admin-portal-drivers`, `admin-portal-payouts`, `admin-portal-subscriptions`, `admin-portal-users` | on | `supabase functions deploy <name>` |
| `agency-portal-billing`, `agency-portal-dashboard`, `agency-portal-drivers`, `agency-portal-fleet`, `agency-portal-jobs`, `agency-portal-rates` | on | `supabase functions deploy <name>` |
| `driver-kyc`, `invoice-view`, `phonepe-checkout`, `phonepe-status`, `verify-payment` | on | `supabase functions deploy <name>` |

Verify with `supabase functions list`: every function ACTIVE, names matching the folders.

## 6. Rollback

**No live DDL rollbacks. Ever.** There are no down-migrations and no hand-run DDL. A wrong schema change is fixed
forward with a new migration, tested on staging first.

Rollback levers, in the order to try them:

1. **Enforcement switch (fastest; no data change) [OWNER].** Set `platform_billing_settings.enforcement_enabled`
   to false through `platform_billing_settings_update` (checklist I4). Limits stop at once; data and payments are untouched.
2. **Payments [OWNER].** In Razorpay, point the webhook to a holding URL or disable it. In Supabase, disable
   `create-razorpay-order`, `verify-razorpay-payment` and `razorpay-webhook`. The app shows "payments unavailable"
   and nothing is charged. Razorpay retries undelivered webhooks for about a day, so re-enable promptly; events
   are deduplicated by event id.
3. **Web [OWNER].** `heroku rollback` to the previous release, then rerun the section 7 checks. `VITE_*` values are
   baked in at build time, so any config change needs a redeploy.
4. **Edge Functions [OWNER].** Redeploy the previously tagged version of the affected function(s).
5. **Database [OWNER].** Bad migration on staging: restore the staging backup from 4a step 3 (checklist H3), then fix
   forward. Production: restore from the pre-push dump or PITR. Rehearse the restore on staging first.
6. **Money is never rolled back by SQL.** A wrongly taken payment is refunded in the Razorpay dashboard and arrives
   as `refund.processed`. Never edit `payment_history`, invoices, credit notes or subscription rows by hand.
   Support steps are in `docs/TO-152-runbook.md` section 8.

## 7. Post-deploy checks

- `GET /healthz` returns `200 {"status":"ok"}` (process liveness). `GET /readyz` returns `200 {"status":"ready"}`,
  or `503` when the frontend artifact is missing. Neither proves Supabase, Auth or the payment providers.
- `node scripts/check-deployment-health.mjs https://www.truckopti.in` exits 0. It fails with `spa-fallback` when an
  old release still serves HTML. Run it after every release. Use the canonical URL; the apex and Heroku hostnames
  redirect and are reported as `redirect`.
- `PUBLIC_APP_URL=https://www.truckopti.in npm run test:public-smoke` (12 public routes).
- `SUPABASE_PUBLIC_URL=<staging or production URL> npm run test:frontend-smoke`.
- Monitoring queries in `docs/TO-152-runbook.md` section 7 run clean (daily for two weeks after launch).

## 8. Backup and restore

- **Hosted database [OWNER]:** dump plus PITR before every schema change (4b step 1). A restore is rehearsed on
  staging before any production restore.
- **Local app data:** the encrypted, transactional backup envelope in `frontend/src/lib/backup.ts`
  (test: `frontend/src/lib/backup.test.ts`).
- **Secrets are never part of a backup, ticket or this file.** Loss of a provider secret is recovered by **[OWNER]**
  credential rotation.

## 9. OWNER-ONLY list

Only the owner can do these. Agents do not invent or guess the values.

- Create the hosted Supabase projects (staging and production); record refs and keys.
- Take and confirm backups, dumps and PITR; perform any production restore.
- `supabase db push` to staging and to production, after the owner's go/no-go.
- Set Edge Function secrets and Heroku config vars; run `./deploy-heroku.sh`; run `heroku rollback`.
- Razorpay: KYC, test and live keys, webhook registration and webhook secret, any live-money payment.
- PhonePe merchant credentials, if in scope.
- `platform_billing_settings`: legal name, GSTIN, address, state code, SAC (confirmed by the owner's CA).
- Switch `enforcement_enabled` on in production, after gate 11 sign-off.
- Supabase Auth redirect URLs, Google OAuth, SMTP and SES identities.
- Sentry DSN.
- The first client's ERP access and connection secrets.
- Prices, refund policy, terms, and any change to sign-in methods.
- Credential rotation after any suspected leak.
- Sign-off of each gate (names and dates recorded outside git).

## 10. Sources

`package.json` (scripts), `scripts/release_gates.mjs`, `docs/FABLE-RULINGS-2026-11-17-B.md` (section 3),
`docs/STAGING-SMOKE-CHECKLIST.md`, `docs/TO-152-runbook.md`, `docs/TO-152-rulings.md`, `docs/ENV-CHECKLIST.md`,
`supabase/functions/`, `supabase/config.toml`, `supabase/migrations/`, `deploy-heroku.sh`, `Procfile`, `heroku.yml`,
`Dockerfile`, `server.js`, `scripts/check-deployment-health.mjs`, `scripts/harness/run.mjs`.
