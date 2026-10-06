# TO-144 — Agency setup, memberships, client sites and actual fleet

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: TO-142 accepted.
Result: agent-results/034-result.md.

## Allowed scope / first source map

frontend/src/pages/AgencyRegisterPage.tsx, AgencyProfilePage.tsx, AgencyFleetPage.tsx, AgencyDriversPage.tsx, AgencyRatesPage.tsx, CustomersPage.tsx; agency portal services/functions; frontend/src/App.tsx and layouts; new membership/site/fleet migrations; new feature tests.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

Reuse company/agency/fleet records; introduce scoped memberships and client agreements where absent. Agency owner adds actual truck instances and driver employment/invitations. Store vehicle payload/body dimensions/expiry/availability, driver licence/contact, staff scope, client bill-to/ship-to sites/contacts and tariff effective versions. Separate catalog types from owned fleet; secure expiring activation/recovery without SMS dependency.

Produces: Versioned company/site/vehicle/driver contracts for TO-145/148/149.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: Two agencies independently create trucks/drivers/clients/sites; cannot see/edit each other. Dispatcher cannot approve payroll or grant roles. Suspended owner/revoked staff fail on old sessions. Vehicle docs expired/maintenance blocked prevents allocation. Invitation reuse/expiry rejected. Setup survives reload and server restart.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No native app, national marketplace, regional hierarchy, unnecessary identity collection or default driver passwords.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.

