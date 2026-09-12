# TO-116 — Core workflow verification and repair

## Objective
Prove the highest-value user journeys work end-to-end and repair only verified breaks.

## Depends on
TO-113; auth/provider blockers from TO-114/TO-115 must be resolved or explicitly isolated.

## Scope
- Packing/truck recommendation journey.
- Protected-route/authenticated user journey.
- Agency/admin journey where applicable.
- Data persistence and external-provider boundaries used by those journeys.
- Write the smallest failing behavioral/integration test before each repair.

## Acceptance
Core journeys have fresh test/runtime evidence, no known P0/P1 break remains in scope, and `agent-results/005-result.md` records exact commands/results and residual blockers.