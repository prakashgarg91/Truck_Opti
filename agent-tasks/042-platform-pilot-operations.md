# TO-152 — Platform onboarding, support, tenant billing and export

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: TO-144 and TO-148 accepted.
Result: agent-results/042-result.md.

## Allowed scope / first source map

frontend/src/pages/AdminAgenciesPage.tsx, AdminUsersPage.tsx, AdminSubscriptionsPage.tsx, AdminContactPage.tsx, AdminDashboardPage.tsx; scoped admin services/functions; support/access/export migrations/tests.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

1–2 staff onboard agency using assigned checklist, view tenant capability/provider state, manage support incidents and subscription limits, record software invoice/receipts separately. Time-bounded reasoned support access logged; export/offboarding/revocation retain accounting evidence according to policy. Health/backup/job views consume verified ops data.

Produces: Usable platform staff workflow and tenant exit path.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: Support cannot self-elevate or browse unassigned confidential files; owner-granted access expires/revokes on existing session. Onboarding incomplete never says ready. Tenant export has only owned rows/files and safe destination; suspension stops new operations and preserves export/recovery rights. Manual software receipt does not claim payment gateway settlement.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No blanket impersonation, silent data edits, regional manager hierarchy or guaranteed unattended support.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.

