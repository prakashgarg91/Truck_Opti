# TO-137 — Prove payment state convergence in sandbox

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** READY_HARNESS_OWNER_BLOCKED_PROVIDER.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** TO-125 and trusted auth; provider sandbox credentials supplied by owner. Existing TO-117 code hardening is retained.

## Goal and evidence

TO-117 changed webhook secret selection and records source/mock proof; it explicitly did not run real provider sandbox or hosted reconciliation. A source regex check does not validate HMAC/event ordering.

## Allowed scope

scripts/payment_readiness_policy.test.mjs; new provider sandbox integration tests under scripts/ or supabase/functions/; frontend/src/services/razorpayPayment.ts; subscriptionApi.ts; payment Edge Functions and invoice reconciliation only for reproduced defects; docs/payment-production-handoff.md.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Keep Razorpay as the recommended launch provider pending owner selection, hiding unsupported providers rather than advertising unfinished checkout. Test order creation using server-authoritative plan/currency/amount and verified ownership. Send valid/invalid/missing signatures to the actual sandbox Edge Function, preserving raw request bytes. Replay webhook and client verification concurrently; reverse their order; test pending/failure/cancellation/late success. Verify one payment row, one entitlement, one invoice and correct renewal/expiry/usage. Test amount mismatch, foreign order, forged success URL and missing dedicated webhook secret. Exercise documented reconciliation after a missed webhook. Prepare an approved live test and rollback procedure, but do not charge, refund or deploy without specific owner authorization.

## Required checks

Executable local integration harness first, then sandbox provider result IDs with secrets redacted; exact database cardinalities after duplicates and failures; browser checkout cancellation/retry and invoice access. Run policy/payment/subscription suites, build/lint and sandbox proofs.

## Acceptance

Sandbox reconciliation is verified beyond mocks; live money and production provider rollout remain separately owner-gated.

## Handoff

Write agent-results/027-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
