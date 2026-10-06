# TO-149 — Expense, fuel, advances and maintenance control

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: TO-144 and TO-146 accepted.
Result: agent-results/039-result.md.

## Allowed scope / first source map

new agency/driver expense/fuel/advance/maintenance pages/services following existing structure; App.tsx/layouts; agency portal functions and new ledger migrations; focused reconciliation tests.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

Trip/truck-linked typed expense lines, receipts, submit/review/reject/approve, paid-by/payment mode and advances. Fuel litres/rate/total/odometer/full-fill provenance and anomalous/duplicate entries. Driver reimbursement and cash settlement ledger; service/doc due blocks fleet availability. Approved totals feed P&L, not mutable UI summaries.

Produces: Approved cost/advance/fuel and vehicle service facts for salary/reporting.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: Duplicate receipt/submission cannot post twice; pending/rejected costs excluded; advance balance exact after expense/reimbursement; cross-driver/agency access denied. Backward odometer/invalid litres and partial-fill mileage handled explicitly; service block prevents dispatch and override audited.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No sensor integration assumption, unauthorized deductions or opaque automatic theft allegations.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.

