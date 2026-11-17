# TO-152 runbook: subscription billing proof, launch and support

Scope: agency subscriptions paid through Razorpay. Proof is done in Razorpay TEST mode against a hosted
STAGING Supabase project. Nothing in this runbook touches production data. No secret value appears here:
only variable names.

## 1. Owner prerequisites (one-time, done by the owner, not by an agent)

1. Razorpay TEST account. In the Razorpay dashboard switch to Test Mode and generate a key pair
   (`rzp_test_...` id and its secret). Do not use live keys anywhere in this runbook.
2. Webhook registration (Test Mode, Settings, Webhooks, Add): URL is
   `https://<staging-ref>.supabase.co/functions/v1/razorpay-webhook`. Choose your own webhook secret.
   Tick exactly these events: `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`.
3. Hosted staging Supabase project (separate from production). Note its URL, anon key and service-role key.
4. A test agency owner: an approved agency with an owner login, no subscription row yet, and billing details
   present (place of supply resolves from a GSTIN or the agency state, otherwise `BILLING_STATE_REQUIRED`).
   `platform_billing_settings` on staging must have the platform legal name, GSTIN, address, state code and SAC set.
5. Migrations to STAGING only, from the repo root, with the CLI linked to the staging ref:
   `supabase link --project-ref <staging-ref>` then `supabase db push`. Check the linked ref before pushing.
6. Take a staging database backup before the push (dashboard, Database, Backups) so section 6 has a restore point.
7. Edge function secrets (names only; set them in the dashboard under Edge Functions, Secrets, or with
   `supabase secrets set NAME=...` typed at your own prompt, never committed): `RAZORPAY_KEY_ID`,
   `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform.
8. Deploy the functions to staging:
   `supabase functions deploy create-razorpay-order`, `supabase functions deploy verify-razorpay-payment`,
   `supabase functions deploy razorpay-webhook --no-verify-jwt` (Razorpay cannot send a Supabase JWT; the HMAC is the gate).

## 2. Run the proof

Set these in your own shell session only (do not put them in a file in the repo):
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY`, `PROOF_OWNER_EMAIL`, `PROOF_OWNER_PASSWORD`. Optional: `PROOF_PAYMENT_ID`.

```
node scripts/razorpay_sandbox_proof.mjs --dry-run     # plan and env check, no network, exit 0
node --test scripts/razorpay_sandbox_proof.test.mjs   # offline tests of the harness itself
node scripts/razorpay_sandbox_proof.mjs               # live run against TEST + staging
```

Exit codes: 0 all steps passed; 1 a step failed or the run aborted; 2 a manual payment is needed
(see below); 3 hard stop (live key id, or a key id that is not `rzp_test_`, or missing variables).
The script refuses any key id starting with `rzp_live_` before it makes a single call.

Manual payment fallback: if the Razorpay TEST API refuses a server-side card payment (common: the feature is
off, or 3D Secure is required) the script prints the order id and amount and prompts for a `pay_...` id.
Pay that order in a Razorpay TEST checkout with the published test card 5267 3181 8797 5449, any future expiry,
CVV 123, OTP 1234, copy the payment id, and answer the prompt (or re-run with `PROOF_PAYMENT_ID` set; note that a
re-run creates a fresh order, so use the prompt on the first run when possible).

Re-running: a proof run consumes the test agency's first subscription (it ends cancelled by step 7). For a clean
re-run use a different test agency owner, or restore the staging backup.

## 3. Reading the report

Report: `proof-output/razorpay-sandbox-proof-<UTC time>.json` (the directory carries its own `.gitignore`, so it is
never committed). Fields: `overall`, `summary` (step, title, status) and `steps[].evidence` (plain lines).
Secrets are masked to the last 4 characters before anything is printed or written.

| Step | PASS means |
|---|---|
| 1 sign in | The owner got a token and an agency was found. |
| 2 create order | HTTP 200 and the returned amount equals the server-stored `payment_history.amount`. No amount was sent. |
| 3 tamper | Extra `amount`, `price`, `agency_id` fields were ignored: same amount, order stored for the caller's agency. |
| 4 pay and verify | Razorpay payment captured for the order; verify says `active`; subscription `active`; exactly one new invoice `TO/yy-yy/nnnnnn` with CGST = SGST or IGST only, and taxable plus tax equals total. |
| 5 replay | Second verify says `already_active`; the same signed webhook twice gives 200 `replay` then `duplicate`; invoice count and period end unchanged. |
| 6 bad inputs | Bad or malformed signature gives 400; a wrong-amount event is ledgered `failed_recorded` with no new invoice and the subscription untouched. |
| 7 refund | `refund.processed` gives `refunded`; one credit note `CN/yy-yy/nnnnnn`; subscription `cancelled`. |
| 8 summary | All steps PASS. Anything else is a FAIL: read that step's evidence lines first. |

A SKIP means an earlier blocking step failed. The first invoice on a fresh staging database is `000001`; the harness
checks the format, not the number, so a database with older invoices still passes.

The proof counts only when run from a clean checkout at the commit you intend to ship, with the report kept
(outside git) with the sign-off.

## 4. Launch checklist: turning enforcement ON

Do these in order. Enforcement is `platform_billing_settings.enforcement_enabled`; it defaults to false and only
the admin function `platform_billing_settings_update` changes it.

1. Section 2 proof is all PASS on staging at the release commit.
2. Platform billing settings are filled in production (legal name, GSTIN, address, state code, SAC code confirmed by the owner's CA).
3. Every agency has a trial or a plan BEFORE the switch. Check with the service role (expect zero rows):
   `select a.id from transport_agencies a where a.status = 'approved' and not exists (select 1 from subscriptions s where s.agency_id = a.id and s.status in ('trial','active','past_due','grace'));`
   Start trials or contact those agencies first.
4. Sweeps scheduled: the `truckopti-subscription-sweeps` pg_cron job exists and `subscription_sweep_runs` shows a recent run.
5. Monitoring queries in section 7 run clean and someone owns them for the first week.
6. Owner sign-off recorded (name, date, release commit). Then set `enforcement_enabled = true` through the admin function.
7. Rollback of enforcement alone: set `enforcement_enabled = false` the same way. Limits stop applying at once; data and payments are untouched.

## 5. Switching from TEST to LIVE keys (separate step, second sign-off)

This is its own change, not part of the proof. Requirements: the proof is PASS, launch checklist items 1 to 5 are done,
and the owner gives a second written sign-off for live money.

1. In production only: set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (live pair) and `RAZORPAY_WEBHOOK_SECRET` as function secrets; register the live webhook with the same four events and the production URL.
2. The harness stays TEST-only by design; it will refuse live keys. Do not edit it to allow them.
3. Live-money test, with the owner's approval of the exact amount: one real smallest-plan payment by the owner's own agency, followed by the monitoring queries and a refund through the Razorpay dashboard, confirming invoice, credit note and cancellation.
4. Keep the TEST keys on staging. Never put live keys on staging or test keys on production.

## 6. Rollback

No live DDL rollbacks. Ever.

- Payments misbehaving: in Razorpay, edit the webhook and point it back to a holding URL (or disable it); in Supabase disable or delete the three functions `create-razorpay-order`, `verify-razorpay-payment`, `razorpay-webhook` (the app shows "payments unavailable", nothing is charged). Razorpay retries undelivered webhooks for a day, so re-enable promptly; events are deduplicated by event id.
- Enforcement problem: set `enforcement_enabled = false` (section 4 step 7).
- Bad migration on staging: restore the staging database backup taken in section 1 step 6 (dashboard, Database, Backups, Restore), then fix forward with a new migration file. Production gets the fix as a new forward migration only, after it passes on staging; never `down` scripts, never hand-run DDL.
- Money is never "rolled back" by SQL: a wrongly taken payment is refunded in the Razorpay dashboard and arrives as `refund.processed`.

## 7. Monitoring queries (service role, read-only)

Captured payments the system refused (money held, needs a human):
```
select razorpay_order_id, razorpay_payment_id, agency_id, amount, status, metadata->>'refusal' as refusal, created_at
from payment_history where metadata ? 'refusal' order by created_at desc limit 50;
```
Webhook ledger, last day, by result (watch `failed_recorded` and `orphan`):
```
select event_type, result, count(*) from razorpay_webhook_events
where received_at > now() - interval '1 day' group by 1, 2 order by 3 desc;
select event_id, event_type, order_id, payment_id, error, received_at from razorpay_webhook_events
where result = 'failed_recorded' order by received_at desc limit 50;
```
Retrying webhooks (an event reaching attempt 8 becomes terminal):
```
select event_id, count(*) as attempts, max(at) as last_at, max(sqlstate_or_code) as last_code
from razorpay_webhook_attempts group by 1 order by last_at desc limit 50;
```
Refunds that could not be applied to a subscription (refund already left Razorpay):
```
select refund_id, payment_id, agency_id, amount_paise, reason, created_at
from subscription_refund_exceptions order by created_at desc limit 50;
```
Sweeps health: `select as_of, started_at, finished_at, trials_expired, grace_started, grace_expired from subscription_sweep_runs order by started_at desc limit 5;`
Function logs: Supabase dashboard, Edge Functions, `razorpay-webhook`, filter for `refused:` and `retryable:`.

Rhythm: daily for the first two weeks after launch, then weekly. Any row in the first or fourth query is a ticket.

## 8. Support playbook: payment captured but refused

Symptom: the agency says money left their account, the subscription is not active, or the checkout said "needs a quick review".

1. Get the order id or payment id from the agency (Razorpay email or checkout screen). Find the row:
   `select * from payment_history where razorpay_order_id = '<order>' or razorpay_payment_id = '<pay>' or metadata->>'captured_payment_id' = '<pay>';`
2. Read `metadata->>'refusal'` and the webhook ledger rows for the payment (`razorpay_webhook_events` by `payment_id`).
3. Decide by cause:
   - `AMOUNT_MISMATCH` or `CURRENCY_MISMATCH`: the captured amount differs from the stored order total. Do not force-activate. Refund in the Razorpay dashboard, then ask the agency to check out again.
   - `order_already_paid` or `payment_id_in_use`: a duplicate payment for an order that is already paid. Confirm the subscription is active, then refund the duplicate.
   - `BILLING_NOT_CONFIGURED`, `billing_settings_changed`, `agency_not_operational`, `plan_change_blocked`: a platform or agency state problem. Fix the cause (billing settings, agency approval, plan choice). Razorpay retries the webhook for these up to the attempt limit; if the event is already terminal, refund and have the agency pay again after the fix.
   - `BILLING_STATE_REQUIRED`: the agency has no GSTIN and no state. Get the details added, then refund and retry, or let a pending retry settle.
   - `orphan`: the order id is unknown to this environment. Check you are not mixing test and live or staging and production webhooks.
4. Refund path: issue the refund in the Razorpay dashboard. `refund.processed` arrives, a credit note is issued if an invoice existed, and `subscription_refund_exceptions` records any refund that could not be applied; clear that table's rows by reviewing, not by editing (it is append-only).
5. Tell the agency plainly what happened and what comes next (refund timeline of the bank, then try again). Never ask for card details.
6. Record the ticket: order id, payment id, cause, action, who, when. If the cause was new or repeated, add a regression test before the next release.

Never edit `payment_history`, invoices, credit notes or subscription rows by hand to "make it work". Corrections go through
the activation and refund functions or through a Razorpay refund.
