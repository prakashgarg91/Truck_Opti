# TO-117 — Payment readiness without real-money execution result

Date: 2026-09-12

## Scope reviewed
- Razorpay checkout UI → Edge Function order creation → client checkout → server-side payment verification → subscription/invoice reconciliation.
- Razorpay asynchronous webhook reconciliation and duplicate-event behavior.
- PhonePe checkout → provider status verification → subscription/invoice reconciliation.
- Failure, cancellation, pending/retry and ownership boundaries.

## Verified code properties
### Razorpay
- Order creation authenticates the caller, enforces user ownership, resolves plan/amount server-side and persists a pending payment record.
- Checkout completion is not treated as entitlement success until the server verifies the Razorpay signature and reconciles the canonical server-owned plan/amount.
- Repeated successful verification is idempotent and does not create a second entitlement/invoice for the same provider payment.
- Webhook processing looks up the server-created payment row, reconciles subscription/invoice state, and has duplicate-success handling.
- Webhook authenticity now uses a dedicated `RAZORPAY_WEBHOOK_SECRET`, separate from `RAZORPAY_KEY_SECRET`, and fails closed with `Webhook not configured` when the webhook secret is absent.

### PhonePe
- Checkout is authenticated and ownership-scoped.
- Plan/amount are resolved server-side rather than trusted from the browser.
- Entitlement activation depends on provider status verification; pending/failure states do not silently activate a subscription.
- Existing success is reused/idempotently returned where already reconciled.

## TDD repair
A payment-readiness policy test was added first. The initial GitHub Actions run `34685916829` failed specifically at the new payment-readiness policy while provider/deployment policies and the independent Python auth job remained green. The implementation then changed Razorpay webhook verification to `RAZORPAY_WEBHOOK_SECRET` and added an owner handoff for coordinated Razorpay/Supabase configuration.

Fresh GREEN evidence from GitHub Actions run `34686009989`:
- production provider policy: PASS
- deployment safety policy: PASS
- payment readiness policy: PASS
- production frontend build: PASS
- frontend unit suite: PASS
- packing regression: PASS
- public browser smoke: PASS
- core local-first launch smoke: PASS
- bounded `apps/web` auth unit test: PASS

## Production handoff
See `docs/payment-production-handoff.md`.

Before deploying the updated Razorpay webhook, the owner must configure the same dedicated webhook secret in the Razorpay webhook endpoint and production Supabase Edge Function secrets. Test/sandbox verification should precede any live-money approval.

## Not performed
- No real-money transaction.
- No Razorpay/PhonePe credential mutation or rotation.
- No Supabase Edge Function deployment.
- No production database migration/push.
- No claim that live payment providers are currently working.

## Residual owner/provider gates
- Confirm/restore the real production Supabase project.
- Configure `RAZORPAY_WEBHOOK_SECRET` on both Razorpay and Supabase before deploying the webhook change.
- Deploy reviewed payment Edge Functions only after approved production configuration.
- Run Razorpay Test mode evidence for valid/invalid webhook signatures, duplicate delivery, reconciliation and entitlement activation.
- Run PhonePe sandbox/pre-production evidence for success/pending/failure/retry paths.
- Live-money testing remains prohibited without explicit owner approval.

## Acceptance status
Code-side payment readiness is complete for the reviewed paths; live provider verification remains owner/provider-blocked and is not represented as complete.
