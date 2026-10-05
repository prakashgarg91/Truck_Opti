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

## Operational verification links (TO-132)

- Deployment health drift: `node scripts/check-deployment-health.mjs https://www.truckopti.in` validates that `/healthz` and `/readyz` answer with `application/json` bodies (`{"status":"ok"}` / `{"status":"ready"}`) and fails with a `spa-fallback` verdict when the SPA fallback serves HTML instead. These probes prove process liveness and frontend-artifact readiness only, never Supabase or payment provider availability.
- Error monitoring (owner-gated): reporting is implemented in `frontend/src/utils/monitoring.ts`. Without `VITE_SENTRY_DSN` it is a no-op. With a DSN, events are redacted (passwords, OTPs, bearer/JWT tokens, cookies, query credentials, payment details, KYC identifiers), default PII is off, user payloads are reduced to an id, `ui.input` breadcrumbs are dropped, and replay stays disabled. `VITE_SENTRY_RELEASE` (or `VITE_APP_VERSION`) supplies the release tag; environment comes from the build mode.
- Controlled staging event: build/serve the frontend with `VITE_SENTRY_DSN=<staging dsn>` and `VITE_SENTRY_STAGING_PROBE=1`, load the app once, then confirm exactly one `MonitoringStagingProbe` event in Sentry whose `redactionSelfTest` values are all `[REDACTED...]`. The event id is exposed at `window.__truckoptiMonitoringProbe`. Unset the probe flag afterwards — it is not for production builds.
- Both `VITE_SENTRY_DSN` and `VITE_SENTRY_STAGING_PROBE` are build-time values, so they must be present before the frontend build (`./deploy-heroku.sh` currently forwards only Supabase/app URL values; extend the approved config set before an approved deployment).
