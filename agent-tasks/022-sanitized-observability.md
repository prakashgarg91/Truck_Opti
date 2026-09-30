# TO-132 — Complete safe error reporting and health proof

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** WAITING_DEPENDENCY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** TO-131 accepted; owner DSN/access needed for live delivery proof.

## Goal and evidence

logger.error is disabled in production. Sentry init has no explicit sanitizer/release configuration. Health routes exist locally, but production /healthz and /readyz currently return HTML.

## Allowed scope

frontend/src/main.tsx; frontend/src/utils/logger.ts; frontend/src/components/ErrorBoundary.tsx; new small monitoring module/tests if needed; server.js only if required; scripts/test-server-routing.mjs; docs/payment-production-handoff.md only for operational links.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Centralize production exception reporting with bounded redaction of passwords, OTPs, bearer tokens, cookies, query credentials, payment details and KYC identifiers. Default PII reporting off; define beforeSend and breadcrumb handling and release/environment tags. Keep replay disabled unless approved and properly masked. Route caught operational failures to reporting rather than relying on development console logs. Preserve public error boundaries. Keep /healthz process liveness separate from /readyz artifact readiness; do not claim either proves Supabase/providers. Prepare one controlled staging Sentry event and a deployment drift check that validates JSON content type/body, not merely HTTP 200.

## Required checks

Sanitizer fixtures for nested secrets, exceptions, request headers, breadcrumbs and URLs; Sentry absent mode; caught and uncaught exception capture; health returns JSON and readiness fails when index.html is absent. Run monitoring/routing tests, full build/unit/lint. Live event receipt needs owner access and cannot be marked passed from a mocked call.

## Acceptance

Operational errors are reportable without secret/PII leakage, and release/health verification detects SPA fallback pretending to be a health endpoint.

## Handoff

Write agent-results/022-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
