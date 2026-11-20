# Production cutover guide (fresh Supabase project)

Decision (owner, 2026-11-20): production is a FRESH Supabase project on a paid plan with backups on.
The old project `jbxncejtcbpcronndqlx` is paused. Do not link it, push to it, or query it for this cutover.
Old data may be imported later (see the last section).

Staging is `truckopti-staging`, ref `ydkhgclfjdksicpwqzmw`. Never use the staging ref for production.

Who runs each step:
- **OWNER**: the owner, in the owner's own shell, dashboard, or SQL editor.
- **AI**: an engineer or agent, read-only or local steps, on the owner's go.

Rules for the whole run:
- No secret value goes into chat, git, this file, or a URL. Type secrets at your own prompt or in the dashboard.
- Do not reuse `.env.proof` from staging. It holds TEST keys.
- Stop at the first failed check. Do not skip ahead.
- Keep every output (screenshots, query results, proof files) outside git.

Repo facts used in this guide (checked 2026-11-20):
- 79 migration files in `supabase/migrations/`. The oldest is `20260107000000_base_schema.sql`.
  The newest is `20261048000000_document_number_generators.sql`. A fresh project runs all 79 in filename order.
- 23 Edge function folders in `supabase/functions/` (not counting `_shared`).
- Frontend web host per `docs/DEPLOYMENT-RUNBOOK.md`: Heroku, through `deploy-heroku.sh`.

---

## Steps

### Step 1. Create the production project

- [ ] **OWNER**. Create a new Supabase project.
  - Name: owner's choice (not `truckopti-staging`).
  - Region: `ap-south-1`.
  - Plan: a paid plan, so daily backups run.
  - Turn on point-in-time recovery (PITR), if the dashboard offers it.
  - Write the new project ref in the owner's records.

Expect: project status Healthy, backups listed under Database, Backups.

### Step 2. Link the CLI and check the ref before any push

- [ ] **AI**. From the repo root, link to the new ref only. Replace `<new-ref>` with the ref from step 1.

```bash
npx supabase link --project-ref <new-ref>
```

- [ ] **AI**. Check the linked ref. It must equal the new ref.

```bash
cat supabase/.temp/project-ref
```

Expect: the printed ref equals `<new-ref>`. If it shows `jbxncejtcbpcronndqlx` or `ydkhgclfjdksicpwqzmw`, stop and link again.

### Step 3. Push the migrations

- [ ] **OWNER**. Push all migrations to the linked project. Only after step 2 passes.

```bash
npx supabase db push --remote
```

Expect: 79 migrations listed, from `20260107000000` to `20261048000000`, and a finished message with no SQL error.
If the list shows a different count, stop. The `--yes` flag is not used here because no repo doc shows it.

- [ ] **AI**. Check the chain. Every version must show a Remote value.

```bash
npx supabase migration list --linked
```

- [ ] **AI**. Check the subscription sweep cron job (pg_cron must be available on the plan).

```sql
select jobname from cron.job;
```

Expect: the list includes `truckopti-subscription-sweeps`. If it is missing, stop and raise it with the owner.

### Step 4. Deploy the Edge functions

- [ ] **AI**. Deploy each folder in `supabase/functions/` except `_shared`. Use the JWT flags from the runbook, section 5.

Two functions need `--no-verify-jwt`. Razorpay and ERP systems cannot send a Supabase JWT, so each one checks its own signature or secret.

```bash
npx supabase functions deploy razorpay-webhook --no-verify-jwt
```

```bash
npx supabase functions deploy erp-ingest --no-verify-jwt
```

Deploy the other 21 folders with the plain form. Replace `<name>` with each folder name.

```bash
npx supabase functions deploy <name>
```

- [ ] **AI**. Check that every function is ACTIVE and every name matches a folder.

```bash
npx supabase functions list
```

### Step 5. Set the secrets by name

- [ ] **OWNER**. Set each secret at your own prompt, or in the dashboard under Edge Functions, Secrets. Never paste a live value into chat.

Required for the Razorpay path:

| Name | Value | Note |
|---|---|---|
| `RAZORPAY_KEY_ID` | live key id, starts with `rzp_live_` | Owner's live value only. |
| `RAZORPAY_KEY_SECRET` | live key secret | Owner's live value only. |
| `RAZORPAY_WEBHOOK_SECRET` | webhook secret | Same value as step 9. |

```bash
npx supabase secrets set RAZORPAY_KEY_ID=<typed by owner>
```

Repeat the same form for `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`.

Set these only if the owner decides to use them:

- PhonePe, only if in scope: `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX`, `PHONEPE_API_URL`, `PHONEPE_CALLBACK_ORIGIN`, `PHONEPE_ALLOWED_CALLBACK_ORIGINS`. Without them the PhonePe functions answer 503.
- Email and SES, optional: `BILLING_EMAIL_FROM`, `BILLING_SUPPORT_EMAIL`, `BILLING_APP_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_SES_REGION`, `AWS_REGION`, `AWS_DEFAULT_REGION`, `AWS_SES_CONFIGURATION_SET`. The sender must be a verified SES identity.

Leave unset:

- `BILLING_GST_ENABLED` and `BILLING_GST_RATE_PERCENT`. Tax is set by the database switch in step 7 (ruling C, `docs/FABLE-RULINGS-2026-11-18-C.md`).

Never set by hand (the platform injects them): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **OWNER**. Check the names only. The CLI prints digests, not values.

```bash
npx supabase secrets list
```

Expect: the three Razorpay names are listed. No other name is needed for the Razorpay path.

### Step 6. Create the first admin user

- [ ] **OWNER**. In the Auth dashboard, create the admin login. Choose the password yourself and keep it in your password manager.
- [ ] **OWNER**. Ask the AI for the exact SQL. Run it yourself in the SQL editor. The AI prepares the exact SQL on request.

The model is the admin seed in `scripts/staging/hosted_smoke.mjs` (the `prepare` step, around lines 145 to 151). It sets the role to `admin` in `public.users`. `is_admin_user()` reads that role. The AI does not guess the SQL for production.

Expect: the admin can open the admin portal after signing in.

### Step 7. Admin, Billing settings

- [ ] **OWNER**. Fill the platform billing settings. Values come from the owner and the accountant. An AI does not guess them.
  - Legal name, address, state code, SAC (the seed default is `997331`; the accountant confirms it).
  - GST switch "Registered under GST". Owner's answer on 2026-11-18: the seller is NOT registered yet. Keep it off unless the accountant says otherwise.
  - With the switch off, GSTIN must be empty. The database refuses a GSTIN in that case (`gstin_not_allowed_when_unregistered`).
  - Enforcement stays off. Step 14 turns it on.

Run this in the SQL editor. It is the 7-argument form. Replace the placeholders.

```sql
select public.platform_billing_settings_update('<legal name>', null, '<address>', '<state code>', '<SAC>', false, false);
```

- [ ] **AI**. Verify the row (no secrets involved).

```sql
select legal_name, gstin, state_code, sac_code, enforcement_enabled, gst_registered from platform_billing_settings;
```

Expect: legal name, state code, and SAC are set; `enforcement_enabled` is `false`; `gst_registered` matches the accountant's answer.

### Step 8. Auth settings in the dashboard

- [ ] **OWNER**. In the dashboard, Authentication settings:
  - Site URL: `https://www.truckopti.in`.
  - Redirect URLs: `https://www.truckopti.in/auth/callback` and `https://www.truckopti.in/reset-password`.
  - Google provider: enable it and enter the real Google client id from the owner's Google Cloud project. Keep the Google secret out of chat.
  - SMTP and SES identities: owner decision and owner setup.

Warning: never run `supabase config push`. The `[auth]` and `[auth.external.google]` blocks in `supabase/config.toml` are for local development only. The Google client id there is a placeholder. The `redirect_uri` still points at the old project `jbxncejtcbpcronndqlx`. A push would break Google sign-in on the target project.

Expect: sign-in from the real frontend domain works with the Google button.

### Step 9. Razorpay dashboard

- [ ] **OWNER**. Complete Razorpay KYC. Create the live keys. Live money needs the owner's explicit approval.
- [ ] **OWNER**. Register the webhook. Replace `<new-ref>` with the production ref.

```
https://<new-ref>.supabase.co/functions/v1/razorpay-webhook
```

Events to select (the events the handler reads, in `supabase/migrations/20261030000000_*.sql`):
- `payment.captured`
- `order.paid`
- `payment.failed`
- `refund.processed`

Note: `supabase/functions/_shared/razorpay.ts` holds the payment and order checks. The event names are in that migration, which `razorpay-webhook` calls.

- [ ] **OWNER**. Set the same webhook secret in Supabase as `RAZORPAY_WEBHOOK_SECRET` (step 5).

Expect: Razorpay shows the webhook as active with the four events selected.

### Step 10. Frontend build and hosting

Build variables (public, baked in at build time; a change needs a new build):
- Required: `VITE_SUPABASE_URL` (`https://<new-ref>.supabase.co`), `VITE_SUPABASE_ANON_KEY` (anon key only), `VITE_APP_URL` (`https://www.truckopti.in`).
- Razorpay: `VITE_RAZORPAY_KEY_ID` with the live key id (`rzp_live_`).
- Must be unset for production: `VITE_ALLOW_TEST_RAZORPAY_ON_PRODUCTION`, `VITE_TEST_EMAIL`, `VITE_TEST_PASSWORD`, `VITE_SENTRY_STAGING_PROBE`.

Gap found: `deploy-heroku.sh` forwards only the three required names. It does NOT forward `VITE_RAZORPAY_KEY_ID`. Extend the script first. The AI can do this on request.

OWNER DECISION: the host. The runbook says Heroku (buildpack with `Procfile`, or container with `heroku.yml` and `Dockerfile`). Pick one before the deploy. `docs/VERCEL_DEPLOY.md` describes a Vercel setup, which is not the runbook path. Confirm the runbook path is the one in use.

- [ ] **OWNER**. Deploy the web app with the script (replace the placeholders).

```bash
HEROKU_APP_NAME=<app name> VITE_SUPABASE_URL=https://<new-ref>.supabase.co VITE_SUPABASE_ANON_KEY=<anon key> VITE_APP_URL=https://www.truckopti.in ./deploy-heroku.sh
```

Expect: the script exits 0 and the app serves `https://www.truckopti.in`.

### Step 11. Read-only production checks

The staging smoke script (`scripts/staging/hosted_smoke.mjs`) refuses any project except staging, by design. Do not point it at production.

A read-only production check list is needed. The AI can write that script on request. Until then, check by hand:

- [ ] **OWNER**. Sign in with the owner's own production account. Use no smoke or test users.
- [ ] **OWNER**. Check the entitlement for the owner's agency. The RPC is `agency_subscription_entitlement`.
- [ ] **OWNER**. Check the public GST flag. The RPC is `platform_gst_registered()`. It must match the Admin screen from step 7.
- [ ] **AI**. Check each Edge function without a token. Each should answer 401. Skip `razorpay-webhook` and `erp-ingest`, which have JWT checks off.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://<new-ref>.supabase.co/functions/v1/<name>" -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d "{}"
```

Set `SUPABASE_ANON_KEY` in your shell first. Do not put the key in this file.

- [ ] **AI**. Check the webhook refuses a bad signature. Send a test body with a wrong signature. Expect 400. Nothing is written.

Expect for every check: the result matches the list above. Any other result stops the run.

### Step 12. One live payment, then refund it

- [ ] **OWNER**. Buy the smallest plan with the owner's own payment method. The seed lists Starter at Rs 499 a month (`supabase/migrations/20260212000000_production_setup.sql`). Check the current price on the plan screen first.
- [ ] **OWNER**. Confirm the invoice and the payment appear in the app.
- [ ] **OWNER**. Refund the payment in the Razorpay dashboard. Refund amount follows the refund policy: pro rata, within 7 days of the first purchase only.
- [ ] **OWNER**. Confirm the refund in the app: a credit note `CN/yy-yy/nnnnnn` exists, and the subscription status is `cancelled`.

Expect: the `refund.processed` event reaches the webhook, the credit note exists, and no invoice or payment row was edited by hand.

Live money is a separate approval. The AI never enters card details.

### Step 13. Backup and restore rehearsal

- [ ] **OWNER**. Download a backup from the dashboard, Database, Backups. Keep the file outside git.
- [ ] **OWNER**. Restore it into a scratch project (not production, and not staging). Check that the tables and row counts look right.
- [ ] **OWNER**. Record the date and the result in your sign-off notes.

If the dashboard cannot restore to another project, record that and stop. Never restore over production as a test.

Expect: the scratch project opens and the data matches the backup.

### Step 14. Turn enforcement on

Only after step 12 is recorded, and after every real agency has a subscription row.

- [ ] **AI**. Check for agencies without a live subscription. Expect zero rows. For each row, start a trial or contact the agency first. This is the query from `docs/STAGING-SMOKE-CHECKLIST.md`, I1.

```sql
select a.id from transport_agencies a
where a.status = 'approved'
  and not exists (
    select 1 from subscriptions s
    where s.agency_id = a.id and s.status in ('trial', 'active', 'past_due', 'grace')
  );
```

- [ ] **OWNER**. Record the sign-off outside the repo: name, date, and release commit (`git rev-parse HEAD`). See checklist I3 and runbook section 3, gate 11.
- [ ] **OWNER**. Turn enforcement on. Use the same values as step 7, with `true` as the last argument.

```sql
select public.platform_billing_settings_update('<legal name>', null, '<address>', '<state code>', '<SAC>', true, false);
```

The last two arguments are enforcement, then GST registered. Keep the other values the same as step 7.

Expect: `enforcement_enabled` is `true`. Agency pages show the limits and renew prompts.

### Step 15. Rollback levers (keep ready)

Try these in order. Data is never changed by hand.

1. **Enforcement off (fastest, no data change).** [OWNER]

```sql
select public.platform_billing_settings_update('<legal name>', null, '<address>', '<state code>', '<SAC>', false, false);
```

Expect: limits stop at once. Payments and data are untouched.

2. **Payments off.** [OWNER] In Razorpay, disable the webhook or point it to a holding URL. In Supabase, disable `create-razorpay-order`, `verify-razorpay-payment`, and `razorpay-webhook`. The method for disabling a function is not written in the repo. The owner confirms it in the dashboard first. Razorpay retries failed webhooks for about a day, so turn payments back on promptly. Events are deduplicated by event id.

3. **Web.** [OWNER] Roll back the Heroku release to the previous one, then run the checks in `docs/DEPLOYMENT-RUNBOOK.md` section 7. Note that `VITE_*` values are baked in at build time.

4. **Edge functions.** [OWNER] Redeploy the last tagged version of the affected function.

5. **Database.** [OWNER] There are no down-migrations and no hand-run DDL. A bad change is fixed forward with a new migration, tested on staging first. A restore comes from the pre-push dump or PITR, after the restore is rehearsed (step 13).

6. **Money.** A wrongly taken payment is refunded in the Razorpay dashboard. It arrives as `refund.processed`. Never edit `payment_history`, invoices, credit notes, or subscription rows by hand.

GST switch risk: an order created under one GST setting and paid after the switch changes is refused as `billing_settings_changed`. The customer's money is captured, and support must handle it. Follow the procedure in `docs/DEPLOYMENT-RUNBOOK.md` section 6a. That procedure is not rehearsed yet.

---

## Importing old data later

Old data from the paused project `jbxncejtcbpcronndqlx` can be imported after the cutover. Nothing here is imported now.

- Read `scripts/prod/preflight_inventory.sql` first. It holds read-only queries, one block at a time. Run them only on the old project, and only when the owner decides to resume it. Save each result in `evidence/prod-rehearsal/`.
- Read `evidence/prod-rehearsal/README.md`. It lists what the rehearsal found on old data.
- Two known stops: a push fails when two trucks of one agency share an RC number (preflight Q40), and when one driver is linked to two trucks (preflight Q41).
  Repair both in the source rows first. Do not edit the migrations or applied data by hand.
- The preflight file says the repo has 76 migrations. The repo now has 79. Re-check the rehearsal results against the current chain before any import.
