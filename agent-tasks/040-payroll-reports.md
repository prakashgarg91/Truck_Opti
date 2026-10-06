# TO-150 — Driver salary, payroll settlement and agency reports

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: TO-148 and TO-149 accepted; accountant-reviewed salary policy and examples.
Result: agent-results/040-result.md.

## Allowed scope / first source map

new payroll/attendance/report pages and services; DriverEarningsPage.tsx extended or separate salary view; scoped functions/migrations; payroll golden fixtures and report queries.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

Effective employment agreement with fixed/trip/day/km, attendance/leave, allowance/incentive, approved advance/deduction. Monthly versioned review/approve/freeze run, payslip and manual payment reference; no rewriting posted runs. Agency trip P&L/utilization/overdue/fuel reports reconcile to approved underlying ledgers. Driver sees only own statement.

Produces: Auditable salary statements and reconciled pilot company reports.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: Mid-month policy change, leave, trip crossing month boundary, duplicate run/payment, advance already settled as expense, reversal and rounding. Salary differs from trip earnings and reconciles exactly. Two agencies/drivers and scoped accountant/dispatcher report permissions. Statutory deductions remain disabled unless validated.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No unrestricted accounting suite/statutory filing or browser-authoritative payroll.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.

