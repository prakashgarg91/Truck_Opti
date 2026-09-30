# TO-130 — Verify and repair trip transitions and OTP enforcement

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** WAITING_DEPENDENCY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** TO-125 and TO-129. Server mutation authority must remain intact.

## Goal and evidence

The July OTP RPC increments total_trips whenever the resulting status is delivered, including replays. Its status/timestamp inputs and column-grant revocation need behavioral proof. Source-string OTP tests only validate shape/copy, not enforcement.

## Allowed scope

supabase/migrations/ (new correction migration); frontend/src/services/driverTripProgress.ts; frontend/src/pages/DriverTripPage.tsx; frontend/src/pages/TrackingPage.tsx; relevant generated types and behavioral DB tests.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Run tests against the full schema first. Enforce the allowed state sequence accepted -> pickup_arrived -> in_transit -> delivery_arrived -> delivered, including documented cancellations. Validate actor ownership and row locks. Starting transit requires the correct pickup OTP; delivery requires correct delivery OTP and prior pickup verification. Deny direct driver updates and OTP reads even if broad table grants exist. Customers can retrieve only their shipment's codes through the intended authorized RPC. Make duplicate completion return prior success without incrementing counters, payout entitlement or revenue again. Restrict arbitrary timestamps/photo references and add bounded OTP-attempt behavior consistent with the existing four-digit contract.

## Required checks

Wrong/missing OTP, own versus other driver, customer code visibility, direct REST SELECT/UPDATE, table/column privilege composition, skipped/backward transitions, replay, concurrent completion and unrelated p_extra input. Verify current DB effects and count once. Run frontend trip tests, full unit/packing/build, local DB tests and browser trip proof.

## Acceptance

The trip lifecycle is authorized and ordered, codes cannot be read by the driver, and completing a trip twice has exactly one business effect.

## Handoff

Write agent-results/020-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
