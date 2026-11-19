# Staging smoke checklist (release gates 7-11)

Use this on the day a staging Supabase project exists. It is the hosted half of
`docs/FABLE-RULINGS-2026-11-17-B.md` section 3. Gates 1-6 must already be PASS:

```
node scripts/release_gates.mjs        # expect: Verdict: READY FOR STAGING
```

Rules for this run:

- Steps are in order. Do not skip ahead; a FAIL stops the run until it is understood.
- **OWNER** steps need the owner's account, secrets, or decisions. Agents never invent them.
- **AGENT** steps may be run by an agent or by the owner from the repo root.
- Secret values are typed at the owner's own prompt or kept in the owner's password manager.
  Never paste them into chat, a commit, a file in the repo, or a URL. Names only in this file.
- Use the staging project ref everywhere. It must differ from the production ref.
- Keep each report (proof JSON, screenshots, query output) outside git, and attach it to the sign-off.
- Migration chain: `20261008000000` through the latest file in `supabase/migrations/`
  (at the 2026-11-19 run that is `20261045000000_rate_cards_and_avatars.sql`).
- Staging project: `truckopti-staging`, ref `ydkhgclfjdksicpwqzmw`, region ap-south-1. Check
  `supabase/.temp/project-ref` before any push. The old production project (`jbxncejtcbpcronndqlx`) is paused and
  must not be linked or pushed to.

## Run status (2026-11-19)

| Gate | Status | Evidence |
|---|---|---|
| 7. Staging push, functions, hosted journey | Done by API smoke and screens loaded in a browser. The full hosted browser journey is not automated. | `evidence/staging/hosted-smoke-2026-11-19.json` (135 checks, 135 pass, 0 fail). Browser run: `evidence/staging/payment/` |
| 8. Razorpay TEST mode | Done for success, replay, duplicate, wrong amount, and refund. Failed-payment case: in progress. | `evidence/staging/payment/test-payment-2026-11-19.json`, `evidence/staging/webhook-proof-2026-11-19.json` (14 checks, 0 failed) |
| 9. Cron job and sweep runs | Done: `truckopti-subscription-sweeps` is registered (sweep runs not yet recorded here). | Checklist A6 |
| 10. Backup and rollback rehearsal | Not done. | None |
| 11. Enforcement switch | Not applicable until enforcement is switched on. Enforcement stays off. | None |

Gate 8 detail: invoices `TO/26-27/000001` and `000002` at zero GST (seller not GST-registered); credit note
`CN/26-27/000001`. The failed-and-flip rehearsal (`evidence/staging/failed-and-flip-proof-*.json`) does not exist yet.

Razorpay rejects the phone number 9876543210 in test checkout. Use 9000090000.

Set once in the owner's shell (names only, values never written down here):

```
STAGING_REF=<staging project ref>      # OWNER: from the Supabase dashboard
APP_URL=<staging app URL>              # OWNER
```

---

## A. Staging project and migrations (gate 7)

### A1. Create the staging project and keys
- **OWNER.** Create a Supabase project named for staging, separate from production. Note its project URL,
  anon key, and service-role key in the owner's password manager.
- Expected: project status Healthy; `STAGING_REF` recorded.

Result: [ ] PASS  [ ] FAIL

### A2. Take a restore point before the push
- **OWNER.** Dashboard, Database, Backups: take a backup of the empty or current staging database
  (`docs/TO-152-runbook.md` section 1, step 6).
- Expected: a backup appears in the list with today's timestamp. Note its id for step H2.

Result: [ ] PASS  [ ] FAIL

### A3. Link the CLI to staging only
- **AGENT** (or OWNER), from the repo root:
  ```
  supabase link --project-ref "$STAGING_REF"
  ```
- Check the linked ref before any push:
  ```
  cat supabase/.temp/project-ref
  ```
- Expected: the printed ref equals `STAGING_REF`. If it shows any other ref, stop and run `supabase link` again.

Result: [ ] PASS  [ ] FAIL

### A4. Push migrations to staging
- **OWNER** runs this (agents do not run it). It applies every pending migration to the linked staging project:
  ```
  supabase db push
  ```
- Expected: the output lists the pending migrations from `20261008000000` upward and ends with a
  finished message and no SQL error.

Result: [ ] PASS  [ ] FAIL

### A5. Verify the migration chain is applied
- **AGENT:**
  ```
  supabase migration list --linked
  ```
- Expected: every version from `20261008000000` through the latest file has both a Local and a Remote value,
  and no version from that range has an empty Remote column.

Result: [ ] PASS  [ ] FAIL

### A6. Verify the subscription sweep cron job
- **AGENT** (SQL editor on staging, service role):
  ```sql
  select jobname from cron.job;
  ```
- Expected: the list includes `truckopti-subscription-sweeps`.
  If it is missing, pg_cron may not be available on this plan (see
  `supabase/migrations/20261016000000_expiry_sweeps.sql`). Stop and raise it with the owner.

Result: [ ] PASS  [ ] FAIL

---

## B. Edge functions and secrets (gate 7)

### B1. Set the secrets by name
- **OWNER** sets each value at the owner's own prompt, or in the dashboard (Edge Functions, Secrets). Required
  for payments (from `docs/ENV-CHECKLIST.md`, Edge functions section):
  - `RAZORPAY_KEY_ID` (test key id, must start with `rzp_test_`)
  - `RAZORPAY_KEY_SECRET` (test secret)
  - `RAZORPAY_WEBHOOK_SECRET` (the secret registered for the staging webhook endpoint)
  ```
  supabase secrets set RAZORPAY_KEY_ID=<typed by owner>
  ```
  Add the billing names only if the owner wants email delivery or custom URLs: `BILLING_EMAIL_FROM`,
  `BILLING_SUPPORT_EMAIL`, `BILLING_APP_URL`, and the `AWS_*` SES names (OWNER values, verified SES identity).
  Leave `BILLING_GST_ENABLED` and `BILLING_GST_RATE_PERCENT` at their code defaults unless the owner decides otherwise.
  Do not set PhonePe names unless PhonePe is in scope.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform; do not set them.
- Expected: `supabase secrets list` shows the names above with digests. No values are printed by the CLI.

Result: [ ] PASS  [ ] FAIL

### B2. Deploy the Razorpay and ERP functions with the required JWT settings
- **AGENT**, from the repo root, staging linked:
  ```
  supabase functions deploy create-razorpay-order
  supabase functions deploy verify-razorpay-payment
  supabase functions deploy razorpay-webhook --no-verify-jwt
  supabase functions deploy erp-ingest --no-verify-jwt
  ```
  Razorpay cannot send a Supabase JWT, so `razorpay-webhook` must not verify JWT; its HMAC is the gate.
  `erp-ingest` runs with JWT verification off, as decided for this release.
- Expected: each command ends with a deployed message and no error.

Result: [ ] PASS  [ ] FAIL

### B3. Deploy every other Edge function
- **AGENT:** deploy the remaining folders in `supabase/functions/` (all except `_shared`, and except the four
  above). These are the admin, agency portal, invoice view, driver KYC, verify payment, and PhonePe functions:
  ```
  supabase functions deploy <name>
  ```
  If `supabase/config.toml` sets `verify_jwt` for a function, the deploy must match that file. Do not override it by hand.
- Expected: `supabase functions list` shows every function ACTIVE with the same names as the folders.

Result: [ ] PASS  [ ] FAIL

---

## C. Platform billing settings (OWNER values)

### C1. Fill the platform billing settings on staging
- **OWNER.** The values come from the owner's accountant and are never guessed by an agent:
  legal name, GSTIN, address, state code, and SAC (default `997331`, confirm it).
  The admin function `platform_billing_settings_update` (defined in `20261028000000_subscription_gst.sql`)
  is the only writer. Call it from the SQL editor with the service role, or through the admin portal:
  ```sql
  select public.platform_billing_settings_update(
    '<legal name>', '<GSTIN>', '<address>', '<state code>', '<SAC>', false
  );
  ```
  The last argument stays `false` here. Enforcement is switched on only in step F3.
- **AGENT** verifies (no secrets involved):
  ```sql
  select legal_name, gstin, state_code, sac_code, enforcement_enabled from platform_billing_settings;
  ```
- Expected: legal name, GSTIN, state code, and SAC are non-empty; `enforcement_enabled` is `false`.

Result: [ ] PASS  [ ] FAIL

---

## D. First agency and owner

### D1. Create the test agency owner and the agency
- **OWNER** creates the owner login in the staging Auth dashboard (the owner chooses the password; it stays in
  the password manager) and an approved agency with billing details present (runbook section 1, step 4).
  The agency must have **no subscription row yet**, so the billing path is exercised from the start.
- **AGENT** verifies:
  ```sql
  select a.id, a.status from transport_agencies a;
  select count(*) from subscriptions s where s.agency_id = '<agency id>';
  ```
- Expected: the agency status is `approved`; the subscription count is `0`.

Result: [ ] PASS  [ ] FAIL

---

## E. Point the app at staging

### E1. Build the frontend against staging (VITE_* names only)
- **OWNER** supplies the values; **AGENT** runs the build. Names as in `docs/ENV-CHECKLIST.md`:
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (staging project; anon key only, never the service role)
  - `VITE_APP_URL` (the staging app URL)
  - `VITE_RAZORPAY_KEY_ID` (test key id, `rzp_test_` only)
  - Leave `VITE_ALLOW_TEST_RAZORPAY_ON_PRODUCTION` unset.
- ```
  cd frontend && npm run build
  ```
- Expected: build succeeds. Then run `npm run test:secrets` from the repo root and expect PASS
  (the bundle contains no service-role key and no live key).

Result: [ ] PASS  [ ] FAIL

---

## F. Hosted journey (gate 7, Edge-backed pages included)

### F1. Sign in and walk the hosted app
- **OWNER** (or AGENT with the owner's test login from the password manager) opens `APP_URL` in a browser and:
  1. Signs in as the test agency owner from D1.
  2. Opens the Dashboard and the Drivers page. These are Edge-backed. Both must load real data
     (no "No Agency Profile Found" and no error with Retry).
  3. Opens the Subscription page and starts the trial, if not yet started.
  4. Adds a truck and checks the trial banner.
  5. Repeats steps 2 and 4 at a 375 px wide viewport.
- Note: `npm run test:journey` is a local harness (it reports Edge pages as HOSTED-ONLY). It does not
  replace this hosted pass. Record each step with a screenshot kept outside git.
- Expected: every step loads, with no console errors that block a step and no unexpected 501 responses.

Result: [ ] PASS  [ ] FAIL

---

## G. Razorpay TEST mode proof (gate 8)

### G1. Prepare the proof environment (names only)
- **OWNER** creates a local `.env.proof` from `.env.proof.example` and fills the values in the owner's own editor.
  The file is not committed (it is gitignored). Never print its values.
- **AGENT:**
  ```
  npm run check:proof-env
  ```
- Expected: the check reports every required name as present. No value is printed.

Result: [ ] PASS  [ ] FAIL

### G2. Dry run (no network)
- **AGENT:**
  ```
  node scripts/razorpay_sandbox_proof.mjs --dry-run
  ```
- Expected: exit 0 and a plan listing steps 1-8.

Result: [ ] PASS  [ ] FAIL

### G3. Live TEST-mode run
- **OWNER** runs it in the owner's own shell (the script refuses any `rzp_live_` key before it makes a call):
  ```
  node scripts/razorpay_sandbox_proof.mjs
  ```
  Exit 0 means all steps passed. Exit 2 means a manual Razorpay TEST payment is needed (runbook section 2).
  Exit 3 is a hard stop: fix the key or variables first.
- The proof report is written to `proof-output/`. Copy it outside the repo with the sign-off.
- Check each item below against the report's step evidence (runbook section 3):

| Item | Report step | Expected | Result |
|---|---|---|---|
| Order | 2 create order | HTTP 200; amount equals the server-stored amount; no amount sent by the client | [ ] PASS  [ ] FAIL |
| Capture | 4 pay and verify | Razorpay payment captured; verify says `active`; subscription `active` | [ ] PASS  [ ] FAIL |
| Duplicate webhook | 5 replay | Same signed webhook twice: `replay` then `duplicate`; invoice count and period end unchanged | [ ] PASS  [ ] FAIL |
| Failed payment | 6 bad inputs | Wrong-amount event ledgered `failed_recorded`; no new invoice; subscription untouched; bad signature gives 400 | [ ] PASS  [ ] FAIL |
| Refund | 7 refund | `refund.processed` gives `refunded`; one credit note `CN/yy-yy/nnnnnn`; subscription `cancelled` | [ ] PASS  [ ] FAIL |
| Invoice numbers and tax | 4 pay and verify | Invoice `TO/yy-yy/nnnnnn` (format checked); CGST = SGST or IGST only; taxable plus tax equals total | [ ] PASS  [ ] FAIL |

- Overall expected: step 8 summary is all PASS. Anything else is a FAIL; read that step's evidence first.

Result: [ ] PASS  [ ] FAIL

---

## H. Backup and rollback rehearsal (gate 10)

### H1. Confirm the restore point
- **OWNER.** Dashboard, Database, Backups: the backup from A2 is listed and complete.
- Expected: backup present with its timestamp and status Completed.

Result: [ ] PASS  [ ] FAIL

### H2. Rehearse enforcement rollback
- **AGENT** (SQL editor, service role). Switch enforcement on for the rehearsal only, then off:
  ```sql
  select public.platform_billing_settings_update(
    '<legal name>', '<GSTIN>', '<address>', '<state code>', '<SAC>', true
  );
  select public.platform_billing_settings_update(
    '<legal name>', '<GSTIN>', '<address>', '<state code>', '<SAC>', false
  );
  select enforcement_enabled from platform_billing_settings;
  ```
- Expected: the last select returns `false`. Limits stop applying at once; data and payments are untouched.

Result: [ ] PASS  [ ] FAIL

### H3. Rehearse the database restore
- **OWNER**, on the staging project only, never production: Dashboard, Database, Backups, Restore to the
  backup from A2. This rolls back the migrations.
- Then **OWNER** runs step A4 again, and **AGENT** runs A5 and A6.
- Expected: the restore completes; after the re-push the chain and the cron job are back as in A5 and A6.

Result: [ ] PASS  [ ] FAIL

---

## I. Enforcement switch (gate 11)

### I1. Find agencies without a live subscription
- **AGENT** (service role). Runbook section 4, step 3:
  ```sql
  select a.id from transport_agencies a
  where a.status = 'approved'
    and not exists (
      select 1 from subscriptions s
      where s.agency_id = a.id and s.status in ('trial', 'active', 'past_due', 'grace')
    );
  ```
- Expected: zero rows. For every row returned, start a trial or contact the agency first, then run this again.

Result: [ ] PASS  [ ] FAIL

### I2. Check the monitoring queries and sweep runs
- **AGENT:** run the monitoring queries in `docs/TO-152-runbook.md` section 7. Also check the last sweep:
  ```sql
  select * from subscription_sweep_runs order by 1 desc limit 3;
  ```
- Expected: the monitoring queries run clean; a recent sweep run exists.

Result: [ ] PASS  [ ] FAIL

### I3. Owner sign-off, then enforcement ON
- **OWNER** records the sign-off outside the repo: name, date, and release commit (`git rev-parse HEAD`).
- Then **OWNER** switches enforcement on through the admin function (runbook section 4, step 6). Use the same
  values as C1, with `true` as the last argument:
  ```sql
  select public.platform_billing_settings_update(
    '<legal name>', '<GSTIN>', '<address>', '<state code>', '<SAC>', true
  );
  ```
- Expected: `enforcement_enabled` is `true`; the agency pages show the limits and the renew prompts as designed.

Result: [ ] PASS  [ ] FAIL

### I4. Rollback of enforcement alone (kept ready)
- **OWNER** keeps this ready. It is the only action needed if enforcement misbehaves:
  ```sql
  select public.platform_billing_settings_update(
    '<legal name>', '<GSTIN>', '<address>', '<state code>', '<SAC>', false
  );
  ```
- Expected: `enforcement_enabled` is `false`; limits stop at once; no data is changed.

Result: [ ] PASS  [ ] FAIL

---

## Sign-off

| Field | Value |
|---|---|
| Staging project ref | |
| Release commit (`git rev-parse HEAD`) | |
| Gates 1-6 verdict (`release:gates` report path) | |
| Owner name and date | |
| Gates 7-11: all boxes PASS | [ ] yes  [ ] no |
