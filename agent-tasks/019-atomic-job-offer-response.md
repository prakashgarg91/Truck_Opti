# TO-129 — Make driver offer acceptance atomic and reachable

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** WAITING_DEPENDENCY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** TO-122 and TO-125 local backend. Audit existing dashboard flow before adding any route.

## Goal and evidence

The dashboard already contains an acceptance modal: the old audit's unreachable claim is incomplete. However respondToJobOffer directly UPDATEs job_offers and separately updates drivers.active_job_id. The OTP-hardening migration drops the driver UPDATE policy.

## Allowed scope

frontend/src/services/customerSupabaseApi.ts (driverDashboardApi response methods); frontend/src/pages/DriverDashboardPage.tsx; supabase/migrations/ (forward RPC migration); frontend/src/types/database.types.ts; service/RPC integration tests; docs/design-audit.md if route mapping changes.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Reproduce acceptance against the full migration chain, including the recent OTP change. Replace the two browser writes with one authenticated server transaction/RPC. Verify offer ownership, pending state, expiry, driver/agency approval and no conflicting active trip. Lock the relevant rows and make duplicate accept/reject safe. Return the authoritative offer/active-job state and verify affected rows; a zero-row RLS update must not be reported successful. On acceptance, navigate to or expose the existing trip route; do not build an extra job-offer page solely to match a design artifact. Preserve decline and realtime duplicate behavior.

## Required checks

Test valid accept/reject, unauthorized driver, expired offer, suspended/unapproved driver, duplicate click/realtime event, two concurrent accepts, zero-row result and active-trip conflict. Test against real local RLS, not only mocked Supabase. Run service/unit/build/lint and browser dashboard-to-trip proof.

## Acceptance

Offer response and active-job assignment are one authorized, idempotent state change; acceptance is reachable in the actual driver UI.

## Handoff

Write agent-results/019-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
