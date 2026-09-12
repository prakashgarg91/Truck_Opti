# Payment production handoff

This file records configuration gates only. It does not authorize real-money testing, credential rotation, or an Edge Function deployment.

## Razorpay

Server-side Supabase Edge Function secrets must include:

- `RAZORPAY_KEY_ID` — API key ID used to create orders.
- `RAZORPAY_KEY_SECRET` — API key secret used for Razorpay API authentication and checkout-signature verification.
- `RAZORPAY_WEBHOOK_SECRET` — dedicated secret configured on the Razorpay webhook endpoint and used only for `X-Razorpay-Signature` verification.

The webhook secret is intentionally separate from the Razorpay API key secret. Before deploying the updated `razorpay-webhook` function, configure the same `RAZORPAY_WEBHOOK_SECRET` value in both the Razorpay Dashboard webhook and the Supabase Edge Function secrets. If the secret is absent, the webhook fails closed with `Webhook not configured` and does not activate subscriptions.

Recommended order for an approved production change:

1. Configure or confirm the Razorpay webhook endpoint and dedicated webhook secret in Razorpay Dashboard.
2. Set the matching `RAZORPAY_WEBHOOK_SECRET` in the production Supabase project secrets.
3. Deploy only the reviewed Edge Function version after the production Supabase project has been confirmed.
4. Use Razorpay Test mode first to verify valid signature acceptance, invalid signature rejection, duplicate-event idempotency, payment-history reconciliation, subscription activation, and invoice reuse.
5. Do not perform a live-money transaction until the owner explicitly approves it.

## PhonePe

PhonePe remains server-side and provider-status driven. Keep merchant/salt credentials in Supabase Edge Function secrets only. Use the provider sandbox/pre-production environment for verification unless an owner explicitly approves a live-money test.

## Current repository evidence

The repository contains server-side amount/plan reconciliation, authenticated payment ownership checks, retry/pending handling, and idempotent subscription/invoice reconciliation paths for Razorpay and PhonePe. These code paths are not equivalent to live-provider verification; production provider credentials and a working Supabase project remain owner-controlled gates.
