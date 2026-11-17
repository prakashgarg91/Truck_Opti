# TO-152 binding rulings (architect, 2026-11-17)

Seed fixes: `price_yearly` = 10x monthly (499000 / 1999000 / 4999000 paise; seed has 499900 etc.); `BILLING_GST_ENABLED` removed. Deno is not installed: money logic lives in SQL (PGlite batteries) plus vitest-tested pure TS.

## 1. S1 data model
- `subscriptions`: add `agency_id` (FK `transport_agencies`), `grace_end`, `first_paid_at`, `version`; `user_id` becomes nullable (purchaser); drop `subscriptions_user_id_key`. Status CHECK `trial, active, past_due, grace, expired, cancelled` (`paused` -> `cancelled`).
- Backfill via `transport_agencies.user_id`. Several agencies: oldest approved. None: row kept, `agency_id` NULL, never entitles. Both logged in `subscription_backfill_conflicts`.
- Partial unique index `subscriptions_one_live_per_agency (agency_id) WHERE status IN ('trial','active','past_due','grace')`.
- Machine: trial -> active | expired; active -> past_due (renewal `payment.failed`; banner only) -> grace (7 days) -> expired; paid order -> active; refund -> cancelled.
- Plans: add `drivers_limit` = 2 x `trucks_limit`; orders/month = `shipments_monthly`; owner seat uncounted.
- `agency_subscription_entitlement()`: no args, any member scope, returns `{ok,agency_id,status,plan_tier,period_end,grace_end,trial_end,can_write,can_dispatch,limits{trucks,staff,drivers,orders_month},usage{...}}`. `agency_subscription_state(p_agency_id)` is service_role only. Old user-keyed RPCs become wrappers.
- Why: entitlement must follow the tenant boundary; an argument-free RPC cannot target another agency.

## 2. S2 limits
- Guard `agency_subscription_assert(p_agency_id, p_action, p_add)` in: `agency_vehicle_create` (truck_add); `agency_member_invite`, `agency_member_accept` (staff_add; active + pending); `agency_driver_employment_create`, `agency_driver_invitation_accept` (driver_add); `agency_order_import` (order_import; this Asia/Kolkata month + this file); `agency_load_plan_approve`, `agency_job_assign_driver`, `reserve_fleet_assignment` (dispatch).
- SQLSTATE `SB001` `SUBSCRIPTION_LIMIT_REACHED`, `SB002` `SUBSCRIPTION_READ_ONLY`, `SB003` `SUBSCRIPTION_DISPATCH_LOCKED`; MESSAGE starts with the code; DETAIL is JSON `{code,resource,limit,used,plan,status}`.
- Grace: reads, exports, trip status updates work; `*_add` and `order_import` raise SB002. Expired: `dispatch` also raises SB003.
- Race: `pg_advisory_xact_lock(hashtextextended('sub:'||agency_id,0))` in the guard, then count live rows; no counters.
- `platform_billing_settings.enforcement_enabled` defaults false; new batteries switch it on; launch requires true.
- Why: counting under one per-agency lock is exact; the switch keeps existing batteries green and doubles as rollback.

## 3. S3/S4 webhook and activation
- Events: `payment.captured`, `order.paid` (activate); `payment.failed` (row failed, subscription -> past_due); `refund.processed`. Others: 200.
- `razorpay_webhook_events(event_id text PK /* x-razorpay-event-id */, event_type, order_id, payment_id, payload_sha256, received_at, processed_at, result)`; `ON CONFLICT DO NOTHING`; duplicate -> 200; unknown order -> 200 `orphan`; 500 only when retryable.
- `payment_history` gains the order snapshot: `agency_id, plan_id, billing_cycle, subtotal_paise, discount_paise, cgst_paise, sgst_paise, igst_paise, coupon_code`.
- Single path: SQL `subscription_activate_payment(p_order_id,p_payment_id,p_amount_paise,p_currency,p_method,p_source)`, service_role only. Row FOR UPDATE; amount must equal stored total, currency `INR`, else failed `AMOUNT_MISMATCH`; same payment id -> `{ok:true,replay:true}`; renewal starts at `greatest(now, current_period_end)`; subscription, invoice, coupon redemption in one transaction. Verify and webhook call only this.
- `subscription_record_refund(p_payment_id,p_refund_id,p_amount_paise)`, unique on refund id: credit note, payment `refunded`, subscription `cancelled` at once.
- Why: one database transaction makes both callers idempotent; tax comes from the snapshot, never total minus subtotal.

## 4. S5 sweep
- Service-only `run_subscription_sweeps(p_as_of)` logging to `subscription_sweep_runs`; `run-expiry-sweeps.mjs` calls it after `run_expiry_sweeps`; hourly pg_cron job `truckopti-subscription-sweeps`, same guarded DO pattern.
- trial past `trial_end` -> expired; active/past_due past period end -> grace (`grace_end` = end + 7 days); grace past `grace_end` -> expired.
- Reminders T-7, T-3, T-1, T0, grace day 5: rows in `subscription_reminders UNIQUE(subscription_id, period_end, kind)`; in-app only.
- Why: status-conditional updates plus the unique key make reruns no-ops.


## 5. S6 GST
- `platform_billing_settings` (single row): legal_name, gstin, address, state_code, sac_code default `997331` (owner's CA confirms), enforcement_enabled. Edited only via `platform_billing_settings_update` by `is_admin_user()`.
- `subscription_invoice_counters(series, fy, last_no)`, row-locked inside activation: `TO/26-27/000001`, `CN/26-27/000001`; FY starts 1 April in `Asia/Kolkata`.
- Integer paise as in `freightInvoice.ts`: same state CGST = SGST = half-up(taxable x 18 / 200); else IGST = half-up(taxable x 18 / 100); no rupee round-off.
- Place of supply: first two GSTIN digits, else mapped `transport_agencies.state`; neither -> `BILLING_STATE_REQUIRED`. Invoices snapshot both parties; append-only.
- `subscription_credit_notes(invoice_id, credit_note_number, refund_id UNIQUE, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)`.

## 6. S7 UI
Required: trial banner (days left); past_due banner (Pay now); grace read-only banner, create buttons disabled; expired dispatch lock (Renew); limit prompts from SB001 DETAIL; loading, error, empty states.
Must NOT: compute price or tax; write subscription rows; show PhonePe; offer refund, cancel or auto-renew; treat the checkout callback as activation (refetch entitlement); hide data when expired.

## 7. Trial, coupons, tampering
- `agency_subscription_start_trial()` (owner, approved agency) inserts `subscription_trial_claims`, UNIQUE on agency_id, gstin and normalised phone: one trial per each.
- `subscription_coupons(code PK, percent_off, max_cycles, monthly_only, valid_until, max_redemptions)`; `subscription_coupon_redemptions UNIQUE(coupon_code, agency_id, cycle_no)`; `FOUNDING50` = 50, 3 cycles, monthly; redeemed at activation.
- Client sends only `{plan_tier, billing_cycle, coupon_code}`; server prices, stores, compares.

## 8. Build order (serial, one writer, one new migration per task)
Check = `node scripts/<own test>` unless stated. Opus review: all but S8.

| Task | Allowed files | Check |
|---|---|---|
| S1 | `20261026000000_agency_subscriptions.sql`, `subscription_agency.db.test.mjs` | own test |
| S2 | `20261027000000_subscription_limits.sql`, `subscription_limits.db.test.mjs` | own test, every `scripts/*.db.test.mjs`, `npm run test:race` |
| S6 | `20261028000000_subscription_gst.sql`, `_shared/billing.ts`, `subscription_gst.db.test.mjs` | own test |
| S4 | `20261029000000_subscription_activation.sql`, `_shared/activation.ts`, `create-razorpay-order/index.ts`, `verify-razorpay-payment/index.ts`, `subscription_activation.db.test.mjs` | own test |
| S3 | `20261030000000_razorpay_webhook_events.sql`, `razorpay-webhook/index.ts`, `_shared/razorpay.ts`, `lib/razorpayWebhook.test.ts`, `subscription_webhook.db.test.mjs` | own test; `cd frontend && npx vitest run src/lib/razorpayWebhook.test.ts` |
| S5 | `20261031000000_subscription_sweeps.sql`, `run-expiry-sweeps.mjs`, `subscription_expiry.db.test.mjs` | own test; `expiry_sweeps.db.test.mjs` |
| S7 | `subscriptionApi.ts`, `SubscriptionPage.tsx`, `CheckoutPage.tsx`, `PricingPage.tsx`, their tests | `cd frontend && npx tsc --noEmit && npx vitest run` |
| S8 | `razorpay_sandbox_proof.mjs`, `docs/TO-152-runbook.md` | `node scripts/razorpay_sandbox_proof.mjs --dry-run` |

## 9. Five likely worker mistakes
1. Trusting a client-sent amount, price or agency id.
2. Activating in TypeScript with several writes.
3. Counting before the advisory lock.
4. Float tax, UTC financial-year boundary, CGST unequal to SGST.
5. Editing an old migration or unlisted file; defaulting enforcement on.
