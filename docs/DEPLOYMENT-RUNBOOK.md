# Deployment and Rollback Runbook — TruckOpti Hosted Pilot

Audience: the owner and the operating engineer on release day. Every step that
only the owner may perform is marked **[OWNER]**. All other steps are safe,
read-only or local. This runbook describes only what exists in this repository;
anything not yet built is marked *planned*.

## 1. Environments

| Environment | What it is | Evidence |
|---|---|---|
| Production web | Node/Express static server on Heroku serving `frontend/dist`; canonical URL `https://www.truckopti.in`. The default Heroku hostname and the bare apex `truckopti.in` 301-redirect to the canonical host. | `server.js:14-17`, `server.js:80-86` |
| Production data | Hosted Supabase project (Postgres 17, Auth, Storage, Edge Functions). Local CLI config declares `project_id = "Truck_Opti"`, database major version 17. | `supabase/config.toml` |
| Staging (planned) | A second Supabase project used to rehearse restore and migrations before production. The advisor-approved rollout restores the production dump into staging first. | `TASKS.md` (Advisor rulings, 2026-11-04) |
| Local development | Vite dev server plus PGlite-based database proofs; no local Supabase stack is required for the gates in this runbook. | `package.json` scripts, `TASKS.md` |

Two deploy definitions coexist for Heroku and the owner must confirm which one
the app is on before deploying:

- Buildpack path: `Procfile` (`web: npm start`) with the Node buildpack and the
  environment template in `app.json`; `npm start` runs `node server.js`
  (`package.json:8`).
- Container path: `heroku.yml` builds `Dockerfile` (node:24-alpine, builds the
  frontend, runs `node server.js`).

Both paths build the frontend through `heroku-postbuild`
(`cd frontend && npm install --include=dev && npm run build`, `package.json:7`).
Node engine is pinned to 24.x (`package.json:28-30`).

## 2. Required settings (names only — values are owner-held secrets)

Never paste values into tickets, chat or this file. Configure by name in the
respective console.

**Heroku config vars (build-time, consumed by the frontend build):**

- `VITE_SUPABASE_URL` — required (`deploy-heroku.sh:29`, `app.json`).
- `VITE_SUPABASE_ANON_KEY` — required (`deploy-heroku.sh:30`, `app.json`).
- `VITE_APP_URL` — required; canonical production URL (`deploy-heroku.sh:31`).
- `VITE_SENTRY_DSN`, `VITE_SENTRY_RELEASE` (or `VITE_APP_VERSION`) — optional
  error monitoring; without a DSN reporting is a no-op
  (`docs/payment-production-handoff.md`, `frontend/src/utils/monitoring.ts`).
- `VITE_SENTRY_STAGING_PROBE` — staging verification only; must be unset for
  production builds (`docs/payment-production-handoff.md`).

Please note: `deploy-heroku.sh` currently forwards only the three Supabase/app
URL variables. If a release needs `VITE_SENTRY_*` at build time, extend the
approved config set first (`docs/payment-production-handoff.md`).

**Server runtime environment (Heroku-provided or optional):**

- `PORT` — injected by Heroku; the server defaults to 3000 (`server.js:10`).
- `HEROKU_ORIGIN_HOST` — override if the Heroku app is ever recreated; the
  default must track `heroku domains` output (`server.js:12-14`).

**Supabase Edge Function secrets (server-side only, never in the frontend):**

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — the
  webhook secret is deliberately separate from the API key secret
  (`docs/payment-production-handoff.md`).
- PhonePe merchant/salt credentials — names follow the same handoff doc; keep
  them in Edge Function secrets only.

**Supabase Auth URL configuration:** after the domain is live, add
`https://www.truckopti.in/auth/callback` to the project's redirect URLs
(`docs/QUICK_DEPLOY.md`). OAuth/SMTP provisioning on the hosted project is an
owner gate (`TASKS.md`, Known owner gates).

**Check command inputs (no secrets):** `HEROKU_APP_NAME` for the deploy helper
and the production config audit (`deploy-heroku.sh:13`,
`scripts/production_config_audit.mjs:17`); `PUBLIC_APP_URL` and
`SUPABASE_PUBLIC_URL` for the smoke scripts; `HEALTH_BASE_URL` for the health
drift check (`scripts/check-deployment-health.mjs:224`).

## 3. Pre-deploy gates (local, any engineer)

Run from the repository root; all must exit 0 before requesting a deploy:

1. `npm test` — frontend unit suite (`frontend` vitest).
2. `npm run test:server-routing` — server routing incl. SPA-fallback rules.
3. `npm run test:prod-config` — fail-closed production configuration audit
   (`scripts/production_config_audit.mjs`); placeholder or missing config fails.
4. `npm run types:drift` — generated `database.types.ts` must match the
   migration chain (`package.json:19`).

## 4. Supabase migration order — [OWNER]

`supabase db push` is owner-gated (`AGENTS.md`; `TASKS.md:100`). The approved
hosted sequence (advisor ruling recorded in `TASKS.md`, 2026-11-04) is:

1. **[OWNER]** Take a database dump and confirm PITR (point-in-time recovery)
   is enabled on the production project before touching schema.
2. **[OWNER]** Run the read-only inventory queries on production (duplicate
   agency users, catalog drift, stale offers, migration drift and the rest of
   the ruling's list) and record results.
3. **[OWNER]** Restore the dump into the staging project and apply migrations
   there first.
4. **[OWNER]** `supabase db push` to production only after the owner go/no-go.

Migration mechanics: 46 timestamped files live in `supabase/migrations/` (as of
2026-11-07), from `20260107000000_base_schema.sql` through
`20261014000000_agency_job_terminal_cutoff.sql`. They apply in filename
(timestamp) order, oldest first — never reorder, edit an applied file, or apply
a later file before an earlier one. After applying, regenerate types and re-run
`npm run types:drift`.

## 5. Edge Function deploy — [OWNER]

Edge Function rollout is owner-gated (`TASKS.md`, TO-117 owner gates). The
repository ships 22 functions plus the `_shared` library under
`supabase/functions/`, including the payment set `create-razorpay-order`,
`verify-razorpay-payment`, `verify-payment`, `razorpay-webhook`,
`phonepe-checkout` and `phonepe-status`.

Approved order for a payment change (`docs/payment-production-handoff.md`):

1. **[OWNER]** Configure the Razorpay webhook endpoint and its dedicated
   webhook secret in the Razorpay Dashboard.
2. **[OWNER]** Set the matching `RAZORPAY_WEBHOOK_SECRET` in the production
   Supabase project secrets. If it is absent the webhook fails closed with
   `Webhook not configured` and does not activate subscriptions.
3. **[OWNER]** Deploy only the reviewed function version, via the Supabase CLI,
   after confirming the target project.
4. Verify in Razorpay Test mode: valid signature accepted, invalid signature
   rejected, duplicate-event idempotency, payment-history reconciliation,
   subscription activation, invoice reuse.
5. **[OWNER]** No live-money transaction until the owner explicitly approves.

Known pre-launch condition: the legacy write paths (`update-status`,
`assign-driver`, `assign-truck`, `unassign-truck`) inside `agency-portal-jobs`
and `agency-portal-drivers` bypass reservations/scopes and must be removed
before launch (`TASKS.md`, advisor ruling 2026-11-04).

## 6. Heroku deploy — [OWNER]

All deploy actions are owner-gated (`TASKS.md`, Known owner gates: production
deploy). Use the fail-closed helper rather than manual pushes:

```bash
HEROKU_APP_NAME=<app> \
VITE_SUPABASE_URL=<from owner vault> \
VITE_SUPABASE_ANON_KEY=<from owner vault> \
VITE_APP_URL=https://www.truckopti.in \
./deploy-heroku.sh
```

The script (`deploy-heroku.sh`) refuses to guess: it exits 1 on any missing
variable, requires the Heroku CLI, verifies the app already exists
(`heroku apps:info`), pins the git remote to that exact app, sets the three
config vars, then runs `git push heroku main`. It never creates an app and
never invents credentials.

Notes:

- A `VITE_*` value change requires a redeploy to take effect (`TASKS.md:103`).
- The push triggers `heroku-postbuild`, which builds `frontend/dist`; the
  server returns 503 on `/readyz` until that artifact exists (`server.js:71-77`).

## 7. Post-deploy health checks and smoke test

**Health probes.** `GET /healthz` answers `200 {"status":"ok"}` (process
liveness) and `GET /readyz` answers `200 {"status":"ready"}` or
`503 {"status":"not_ready"}` when the frontend artifact is missing
(`server.js:66-77`). Both probes answer before the canonical-host redirect, and
neither proves Supabase, auth or payment-provider availability
(`server.js:59-65`).

Run the drift check against the canonical https URL — the apex and Heroku
hostnames redirect and will be reported as a `redirect` failure:

```bash
node scripts/check-deployment-health.mjs https://www.truckopti.in
```

Exit 0 means both probes returned JSON with the exact expected status; the
check fails with `spa-fallback` when an old release serves HTML instead
(`scripts/check-deployment-health.mjs`). History note: as of the TO-132 record
(2026-10-05) the live probes still returned SPA HTML, detected and fixed only
by an approved redeploy — always re-run this check after every release.

**Smoke tests.**

1. `npm run test:public-smoke` — Playwright walk of 12 public routes
   (`/`, `/pricing`, `/terms`, `/privacy`, `/contact`, `/login`, `/signup`,
   `/forgot-password`, `/reset-password`, `/payment/callback`,
   `/payment/success`, `/subscription`) checking titles, console errors and
   failed requests (`scripts/public_frontend_smoke.mjs`); honours
   `PUBLIC_APP_URL`, default `https://www.truckopti.in`.
2. `npm run test:frontend-smoke` — deeper launch smoke including Supabase
   health checks via `SUPABASE_PUBLIC_URL`
   (`scripts/frontend_launch_smoke.mjs`).
3. Manual journey (`docs/QUICK_DEPLOY.md`): log in (Google OAuth and Email
   OTP), run a packing flow end to end, create a route, and open the site once
   on a phone.

## 8. Rollback

The advisor-approved rollback plan (`TASKS.md`, 2026-11-04 ruling) has three
parts; rehearse each before the first production push:

- **Web — [OWNER]:** `heroku rollback` to the previous release on the app,
  then re-run the Section 7 checks against the canonical URL.
- **Edge Functions — [OWNER]:** redeploy the previous tagged version of the
  affected function(s); keep version tags for every production deploy.
- **Database — [OWNER]:** apply the rehearsed undo migrations prepared for the
   `20261012`/`20261013` migration set; if undo is not viable, restore from the
   pre-push dump/PITR backup taken in Section 4.

Because `VITE_*` values are baked at build time, a rollback of the web release
also reverts to the config values that release was built with — coordinate any
config-var change with a redeploy (`TASKS.md:103`).

## 9. Backup and restore

- **Hosted database — [OWNER]:** dump plus PITR before every schema change, as
  step 1 of Section 4. Restore is rehearsed into the staging project before any
  production restore is attempted.
- **Local application data:** the product ships a self-contained, encrypted
  backup envelope with transactional import in `frontend/src/lib/backup.ts`
  (accepted as TO-133, evidence in `agent-results/023-result.md`; test
  `frontend/src/lib/backup.test.ts`).
- **Secrets are never part of any backup, ticket or this runbook.** Loss of a
  provider secret is recovered by **[OWNER]** credential rotation, which itself
  requires explicit owner approval (`TASKS.md`, Known owner gates).

## 10. Quick reference — owner gates on release day

1. Local gates green (Section 3) — engineer.
2. Dump + PITR confirmed — **[OWNER]**.
3. Staging restore and migration rehearsal — **[OWNER]**.
4. Go/no-go for `supabase db push` — **[OWNER]**.
5. Edge secrets configured in provider dashboard and Supabase — **[OWNER]**.
6. Edge Functions deployed (reviewed versions only) — **[OWNER]**.
7. Heroku deploy via `./deploy-heroku.sh` — **[OWNER]**.
8. Health probes and smoke tests green (Section 7) — engineer.
9. Live-money testing — **[OWNER]**, separate explicit approval, always.

Sources for this runbook: `package.json`, `Procfile`, `heroku.yml`,
`Dockerfile`, `app.json`, `deploy-heroku.sh`, `server.js`, `supabase/`
(`config.toml`, `migrations/`, `functions/`), `scripts/check-deployment-health.mjs`,
`scripts/public_frontend_smoke.mjs`, `scripts/frontend_launch_smoke.mjs`,
`scripts/production_config_audit.mjs`, `docs/QUICK_DEPLOY.md`,
`docs/payment-production-handoff.md`, `TASKS.md`, `AGENTS.md`.
