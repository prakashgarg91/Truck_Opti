# TO-135 — Prove the dispatch-to-delivery business loop

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** WAITING_DEPENDENCY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** TO-126 through TO-130 and staging identities. TO-134 provides the shipment fixture.

## Goal and evidence

Real KYC is absent and offer/trip effects remain unproven. Existing unit suites pass but have mocked service boundaries.

## Allowed scope

new or maintained driver/agency E2E harness under scripts/; frontend/src/services/customerSupabaseApi.ts and agencyPortalApi.ts; affected driver/agency pages only for reproduced defects; existing Supabase APIs/RPCs only under reviewed authority contracts.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Run a connected journey: customer shipment -> approved agency dispatch -> available truck/driver assignment -> driver offer accept -> pickup proof/OTP -> transit/tracking -> delivery proof/OTP -> shipment status/history -> invoice/agency ledger -> driver earnings. Verify DB linkage and status at every handoff. Test suspension/unapproved accounts, reassignment, decline, expiry, duplicate realtime delivery, disconnect and refresh. Ensure one trip cannot allocate the same driver/truck twice and settlement/earnings cannot duplicate. Check earnings/payout requests without transferring money. Inspect existing dashboard acceptance before adding routes.

## Required checks

Two agencies and two drivers; cross-tenant requests rejected; pending/approved/suspended matrix; replayed events; real document/trip-photo storage; one complete journey and its stored audit trail; mobile driver and desktop agency views. Run service/trip tests, full build/lint and staging E2E.

## Acceptance

The revenue-producing dispatch loop works across real authorized roles with exactly-once completion effects and no privilege or tenant crossover.

## Handoff

Write agent-results/025-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
