# TO-143 — Complete authorized booking, assignment and lifecycle propagation

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: TO-142 accepted.
Checkpoint 2026-10-07: uncommitted TO-142 candidate already adds `dispatch_job_to_drivers` and delivery propagation, with dispatch 42/42 and customer 28/28 local proofs. Review/reuse them after TO-142 acceptance. This task still owns agency-consent production, actual fleet/driver availability and transactional reservations, concurrent commands and multi-load/partial-delivery behavior. Do not count the basic producer as this task's complete acceptance.
Result: agent-results/033-result.md.

## Allowed scope / first source map

frontend/src/pages/NewShipmentPage.tsx, AgencyJobsPage.tsx, DriverDashboardPage.tsx, DriverTripPage.tsx; frontend/src/services/agencyPortalApi.ts and existing offer/OTP services; supabase/functions/agency-portal-jobs/; new forward migration; scripts/dispatch_delivery_journey.db.test.mjs and trip_transition_integrity.db.test.mjs.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

Implement the missing dispatch_job_to_drivers contract or replace it with one proven authorized command and update its caller. Use roadmap dispatchLoad/advanceTrip interfaces, expected version/idempotency key and persisted reservations. Maintain server OTP order/lockout exactly-once semantics. Driver delivery updates owning shipment and agency job in same transaction; partial multi-stop delivery uses explicit aggregate rules rather than marking everything delivered.

Produces: Executable shared order-to-trip spine; downstream modules extend this contract.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: Booking → authorized dispatch → actual offer → accept → pickup → transit → delivery → customer history/agency job all agree after reload. Two concurrent assignments cannot reserve the same vehicle/driver or overship quantity. Unauthorized caller, expired/replayed offer, status jumping and duplicate delivery fail safely or replay idempotently.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No tax/payroll/ERP implementation. Do not forge offers in a test harness as a replacement for missing booking producer.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.
