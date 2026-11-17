# TO-152 audit: what exists vs what is missing to sell the agency subscription (Razorpay)

Read-only audit, 2026-11-17. Scope per Opus ruling (TASKS.md:23): real Razorpay for PLATFORM subscriptions only; freight money goes to the agency's own account. Line numbers are from the working tree. "Not found" means I searched `supabase/functions`, `supabase/migrations` and the listed frontend files and saw nothing.

Task text: docs/PILOT-COMPLETION-PLAN.md:29 (TO-152: "Razorpay subscription billing, tenant onboarding, support, export"; needs merchant KYC and keys from owner) and :30 (TO-153 hosted proof). TASKS.md:88-89 both WAITING_DEPENDENCIES; briefs are agent-tasks/042-platform-pilot-operations.md and 043-hosted-pilot-proof.md. TO-117 (code done, provider test owner-blocked, TASKS.md:39) and TO-137 (sandbox convergence proof, owner-blocked, TASKS.md:61) are the existing payment tasks.

## 1. Current flow as implemented

Edge functions (supabase/functions): create-razorpay-order, verify-razorpay-payment, razorpay-webhook, verify-payment (PhonePe verify), phonepe-checkout, phonepe-status, invoice-view, admin-backfill-invoice-delivery, admin-portal-subscriptions (read), agency-portal-billing (freight stats by agency_id, lines 45-61; it is not platform billing). Shared: _shared/plans.ts, billing.ts, invoice-delivery.ts.

| Step | Implemented? | Evidence |
|---|---|---|
| Create order | Yes. Requires JWT, resolves plan from DB by id or tier, recomputes the amount server-side (plan price + GST) and rejects a mismatch, creates the Razorpay order, inserts `payment_history` status pending | create-razorpay-order/index.ts:57-80, 111-130, 141-146, 161-171 |
| Checkout | Yes. Loads checkout.js, calls the create-order function, handler then invokes verify; handles ondismiss and `payment.failed` client-side only | frontend/src/services/razorpayPayment.ts:64, 100, 190-193, 237, 247 |
| Verify signature server-side | Yes. HMAC-SHA256 via crypto.subtle.verify against `RAZORPAY_KEY_SECRET`, then JWT user lookup, payment_history row lookup, amount re-check | verify-razorpay-payment/index.ts:157-172, 190-203, 239-317 |
| Webhook | Partly. `x-razorpay-signature` HMAC with `RAZORPAY_WEBHOOK_SECRET`, 401 on bad signature; only `payment.captured` is handled (idempotent via status=success check) | razorpay-webhook/index.ts:178-190, 202, 223-244 |
| Plan activation | Yes. Upsert `subscriptions` on `user_id` with status active, period start/end (+1 month or +1 year), written by both verify and webhook | verify-razorpay-payment/index.ts:25-33, 322-336; razorpay-webhook/index.ts:268-290 |
| Entitlement | Keyed to a user, not an agency. `has_active_subscription` and usage RPCs check status active/trial and `current_period_end > NOW()` for the caller | 20260108000000_subscriptions.sql:46-58, 168-169; 20261006120000_tenant_authority_repair.sql:475-518. No agency_id or tenant link found in subscriptionApi.ts |
| Expiry / renewal | Read-time only: an expired period stops passing the entitlement query. No scheduler, reminder, auto-renew or Razorpay Subscriptions usage found. Columns `razorpay_subscription_id`, `razorpay_customer_id`, `cancel_at_period_end` exist but nothing writes them (not found in functions) | subscriptions.sql:46-59; grep of functions |
| Failed payment | Client shows failure only. Server: webhook ignores `payment.failed`; `payment_history` stays pending (not found). PhonePe verify does write failed status | razorpay-webhook/index.ts:202 (only event); verify-payment/index.ts:323-345 |
| Refund | Schema has 'refunded' states only (subscriptions.sql:89, 122). No refund function, no `refund.processed` webhook handler, no UI (not found) |
| GST invoice | Partial. 18% default (`_shared/billing.ts:1`), invoice row created with sequential `generate_invoice_number()` (subscriptions.sql:258), unique per (subscription, payment) index (20260501120000), delivery via `_shared/invoice-delivery.ts`, signed download via invoice-view. Customer GSTIN is read from `user_metadata.company.gstin` (SubscriptionPage.tsx:252). Supplier GSTIN, SAC code, place of supply, CGST/SGST vs IGST split, and credit notes: not found. The fallback PDF is client-generated and labelled generic (SubscriptionPage.tsx:68-133) |
| Trial | Not implemented. `status='trial'` and `trial_end` exist in the schema; `startTrial`, `cancel`, `changePlan` throw "disabled" (subscriptionApi.ts:206-216); UI only reads trial state (SubscriptionPage.tsx:138-155). Client writes to subscriptions are revoked (20260501101500) |
| Plans / prices | Seeded Starter/Growth/Professional/Enterprise at INR 499 / 1,999 / 4,999 / 14,999 per month (paise 49900 etc.), truck limits 3/20/50/unlimited (subscriptions.sql:38-42). Whether this seed is the intended pricing: owner decision |
| RLS | Own-row SELECT on subscriptions, invoices, payment_history, usage; writes revoked from authenticated; plans readable by anyone (subscriptions.sql:139-157; 20260501101500:3-6) |
| Tests | Frontend: razorpayPayment.test.ts (6 cases: not configured, test key on live site, success, pending, sanitised error), subscriptionApi.test.ts, subscriptionHelpers.test.ts, phonepePayment.test.ts. Edge functions: no test files for any payment function (only kyc-files, portal-auth, driver-assignment tests in supabase/functions) |

CheckoutPage.tsx offers PhonePe and Razorpay side by side (lines 4-5, 67-71, 154-172); PaymentCallbackPage.tsx handles the return. Terms, Privacy and Pricing pages exist (frontend/src/pages); a Refund/Cancellation page was not found.

## 2. Gaps ranked by risk for first sale

1. **Subscription is per user, not per agency.** `subscriptions.user_id` is unique (20260501113000); entitlements, team members, drivers and staff scopes are agency-scoped (20261011000000_agency_members_clients_tariffs.sql). A second dispatcher cannot ride the owner's plan. Files: supabase/migrations (new), subscriptionApi.ts, tenant_authority_repair RPCs.
2. **Plan limits not enforced against the real agency model.** Limits are truck/shipment/user counts in `subscription_plans`; whether fleet, employment and import commands call `check_usage_limit` was not verified (not found in the TO-143/144/145 commands I sampled). Risk: plans are sellable but unenforced.
3. **No `payment.failed`, `refund.*`, or `order.paid` webhook handling; pending rows never reconcile** (razorpay-webhook/index.ts:202). Money can be captured while the user closes the tab; only `payment.captured` rescues that and it requires the payment_history row to match by order id.
4. **No renewal or expiry lifecycle.** One-shot orders, +1 month/+1 year, nothing reminds or downgrades; no grace period, no dunning, no auto-debit (Razorpay Subscriptions/mandates unused).
5. **GST invoice compliance unverified.** Need supplier GSTIN/legal name/address, SAC 998314-class code, CGST+SGST vs IGST by place of supply, immutable numbering by financial year, credit note on refund. Files: supabase/functions/_shared/billing.ts, invoice-delivery.ts, the three activation functions (the invoice-building code is triplicated in verify-razorpay-payment, razorpay-webhook, verify-payment).
6. **No Edge-function tests for money paths** (signature, amount mismatch, idempotency, replay). Deno tests exist for other functions (supabase/functions/_shared/portal-auth.test.ts is the pattern).
7. **No trial or self-serve cancel / plan change**; support-assisted only. Acceptable for a first sale if the owner chooses manual.
8. **Policy pages**: refund/cancellation policy and a Terms clause covering subscription not found (TermsPage.tsx exists; content not audited). Razorpay merchant activation needs these live.
9. **Hosted proof**: nothing has run against real or test Razorpay (TO-117/TO-137 owner-blocked; TASKS.md:39, 61). Webhook URL is not registered anywhere I can see.
10. **PhonePe path stays reachable in checkout** (CheckoutPage.tsx:5, 69) while the ruling says PhonePe is after launch; launch should hide it.

## 3. Buildable now vs needs owner input

Buildable by agents now, with a mocked Razorpay HTTP client and signature fixtures (no keys needed): items 1 (agency-level subscription migration + RLS tests on the PGlite tier), 2 (limit enforcement wiring + tests), 3 (webhook events + reconciliation + Deno tests), 4 (expiry sweep function + SQL and pg_cron job definition, no live schedule), 5 code part (GST split, numbering, credit note data model, parametrised by env/settings), 6, 7 (server-side cancel/change workflow behind a flag), 10.

Needs owner inputs: Razorpay merchant account KYC and live/test `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `VITE_RAZORPAY_KEY_ID`; `RAZORPAY_WEBHOOK_SECRET` and webhook registration; Edge deploy approval; Razorpay plan ids only if Razorpay Subscriptions (auto-debit) is chosen; supplier GSTIN, legal name, address, SAC/HSN choice, invoice series; pricing and trial decision; refund, cancellation and dispute policy text and Terms; live-money test approval; hosted staging project (TO-153).

## 4. Fleet task list (max 8)

| id | title | allowed files | check command |
|---|---|---|---|
| S1 | Agency-level subscription model (agency_id on subscriptions, backfill, RLS, entitlement RPCs) | supabase/migrations/<new>.sql, scripts/subscription_agency.db.test.mjs | node scripts/subscription_agency.db.test.mjs |
| S2 | Enforce plan limits on trucks, drivers, members, order import | supabase/migrations/<new>.sql, frontend/src/services/subscriptionApi.ts and test | cd frontend && npx vitest run src/services/subscriptionApi.test.ts; plus S1 db test |
| S3 | Webhook completeness: payment.failed, order.paid, refund.processed, event-id dedupe table | supabase/functions/razorpay-webhook/index.ts, supabase/functions/_shared/razorpay.ts, new .test.ts, migration | deno test supabase/functions/razorpay-webhook |
| S4 | Extract one shared activate-subscription path (dedupe the three copies), amount/signature tests | supabase/functions/verify-razorpay-payment/index.ts, razorpay-webhook/index.ts, _shared/activation.ts, tests | deno test supabase/functions/_shared |
| S5 | Expiry, grace period, renewal reminder sweep (service-only function, pg_cron SQL) | supabase/migrations/<new>.sql, supabase/functions/subscription-sweep/, tests | node scripts/subscription_expiry.db.test.mjs |
| S6 | GST tax invoice: supplier settings, CGST/SGST vs IGST, SAC, credit note on refund | supabase/functions/_shared/billing.ts, invoice-delivery.ts, migration, tests | deno test supabase/functions/_shared; frontend vitest for SubscriptionPage |
| S7 | Billing UI: plan/limits view, past_due and expired states, hide PhonePe, refund-policy link | frontend/src/pages/SubscriptionPage.tsx, CheckoutPage.tsx, PricingPage.tsx, tests | cd frontend && npx tsc --noEmit && npx vitest run |
| S8 | Razorpay sandbox proof harness (TO-137) plus rollback and launch-check docs | scripts/ (new harness), docs/TO-152-runbook.md | node scripts/razorpay_sandbox_proof.mjs --dry-run |

Order: S1, S2, S4, S3, S5, S6, S7, S8. One writer at a time on main.

## 5. Owner questions (pricing and plans), with recommended default

| Question | Recommended default |
|---|---|
| Who pays: per agency (not per user)? | Per agency; owner seat included |
| Plan names and monthly price (excl. GST) | Keep seeded Starter 499, Growth 1,999, Professional 4,999 per month; hide Enterprise ("contact us") for pilot |
| Yearly discount | Yearly = 10x monthly (about 2 months free), already close to seed |
| Limits per plan (trucks, staff, drivers, orders/month) | Starter 3 trucks / 2 staff; Growth 20 / 10; Professional 50 / 25, as seeded |
| Trial | 14-day free trial, no card, Starter limits, manual conversion; or no trial and a 7-day refund |
| Billing mode | One-shot prepaid orders with manual renewal for pilot; Razorpay auto-debit later |
| GST | 18% inclusive or exclusive? Default exclusive, invoice shows CGST/SGST or IGST |
| Grace period after expiry | 7 days read-only, then lock new dispatch |
| Refund policy | Pro-rata within 7 days of first purchase, none after; refunds issued by owner in the Razorpay dashboard, credit note issued |
| Cancellation | End of paid period, no auto-renew, support-assisted |
| Legal entity and GSTIN for the invoices | Owner to supply |
| Founding-customer discount for the pilot agencies | Optional, say 50% for 3 months applied as a coupon at order time |
