# TO-131 — Restore safe admin and agency error boundaries

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** READY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** None. Reproduce the current behavior before changing it.

## Goal and evidence

Commit 04cf579c reverted the safe-error fix. Both service helpers can return raw error.message and arbitrary JSON payload.error, then wrap it in UserFacingError, which UI helpers intentionally display.

## Allowed scope

frontend/src/services/adminSupabaseApi.ts; frontend/src/services/agencyPortalApi.ts; frontend/src/utils/userFacingError.ts; relevant service tests; scripts/security_boundary_policy.test.mjs if needed.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Replace arbitrary raw-message passthrough with a stable, context-specific fallback or a finite mapping of approved server error codes. Log useful internal context through the sanitized reporting contract, without exposing DB internals, JWTs or payloads. Preserve legitimate permission/validation feedback through typed codes. Do not blindly redo the reverted patch: inspect why approved tests expected provider messages and update only behavior that is unsafe. Inventory direct callers so the fallback does not break legitimate forms.

## Required checks

Feed a SQL table/column detail, stack trace, JWT-like text, HTML provider response, malformed JSON, network failure and unknown error; none appears in the user message. Approved authorization/validation codes still map correctly. Run affected admin/agency suites, full unit suite, build, lint and security policy tests.

## Acceptance

Service errors preserve actionable user feedback without trusting arbitrary provider strings. Include before/after evidence and note the reverted commit.

## Handoff

Write agent-results/021-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
