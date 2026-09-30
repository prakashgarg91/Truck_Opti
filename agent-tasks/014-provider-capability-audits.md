# TO-124 — Audit real provider capability and fail closed

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** READY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** None for implementation. Coordinate the cloud Google capability contract with TO-122.

## Goal and evidence

The repaired policy counts a Google client ID as a production auth provider even though the current button creates local identity. Backend audit only resolves DNS; phonepe_mode reports PASS when its URL is missing. Missing flags and frontend defaults differ.

## Allowed scope

scripts/production_config_policy.mjs; scripts/production_config_policy.test.mjs; scripts/production_config_audit.mjs; scripts/frontend_launch_smoke.mjs; frontend/src/lib/supabase.ts; frontend/.env.example; new frontend/src/lib/authCapabilities.ts and tests.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Define one explicit capability model for supported cloud login and payment modes. Distinguish configured, reachable, operationally verified and intentionally disabled. Reject malformed HTTPS/backend URLs and placeholder public keys. Check Supabase client-key presence and health without logging keys or raw responses. Require one cloud method and separately enforce the approved office password policy. Identify cloud Google configuration according to the chosen Supabase integration; a GIS client ID alone is insufficient proof. Make selected payment-provider requirements explicit and disabled providers NOT_APPLICABLE rather than falsely verified. Retain the test-Razorpay production prohibition. Make offline/auth initialization avoid requests to an absent placeholder backend; use bounded outage handling for an explicitly configured unreachable backend. Keep mandatory cloud failures out of a production-ready verdict even when local smoke succeeds.

## Required checks

Fixtures cover missing anon key, NXDOMAIN/health failure, placeholder Google ID, all methods disabled, valid Google cloud settings, office password off, disabled PhonePe, sandbox selected for production and VITE secret leakage. Reproduce the localhost browser DNS-error evidence without suppressing genuine cloud failures. Run policy tests, build, unit and both browser smoke scripts.

## Acceptance

Audit statuses reflect supported capability and proof level; local-only mode cannot be mistaken for a cloud-ready deployment.

## Handoff

Write agent-results/014-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
