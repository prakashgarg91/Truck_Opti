# TO-142 — Repair tenant, usage and private-document authority

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: None; first AI-executable pilot slice.
Result: agent-results/032-result.md.

## Allowed scope / first source map

supabase/migrations/ (new forward migration via current CLI); supabase/functions/_shared/portal-auth.ts and affected agency/usage/document functions; scripts/customer_journey_isolation.db.test.mjs, scripts/dispatch_delivery_journey.db.test.mjs, scripts/admin_rls_proof.db.test.mjs; affected frontend document service consumers.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

Use existing caller identities and public.is_admin_user() where appropriate; explicit customer-consented agency shipment authorization. Deny unauthorized agency_jobs INSERT/UPDATE even through offer creation; suspended agency operational writes denied. Caller-bound usage/plan RPCs. Private billing/trip proof files with narrowly authorized signed URL flow; review current legitimate public assets before changing them. Pin definer lookup paths and remove needless PUBLIC grants. Repair RLS-safe fleet checks for both authenticated and service paths without giving browser service authority.

Produces: Safe shared-data foundation and approved-party dispatch contract.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: Reproduce foreign agency claim and foreign increment_usage/get_user_plan first. Assert both now deny, own approved agency operations succeed, suspended actor fails, valid fleet assignment succeeds and duplicate/cross-agency assignment fails. Anonymous/foreign PDF access denied; scoped signed access succeeds/expires. Tests must fail on resolved findings, not print them beside a green count.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No dispatch/product UI expansion, hosted rollout, blanket tenant-wide public bucket replacement without consumer mapping, or weakening denial tests.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.

