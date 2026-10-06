# TO-153 — Hosted pilot runtime, restore and selling acceptance

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: TO-142–152 accepted for selected pilot scope; hosted/device/ERP/accountant access owner-gated; TO-137 only if gateway included.
Result: agent-results/043-result.md.

## Allowed scope / first source map

existing deployment/health/proof scripts and handoff docs; relevant E2E fixtures/runbooks; TASKS.md, docs/design-audit.md and agent-results/043-result.md; Serdroid remains discovery-only unless separately authorized.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

Measure full roadmap section 12 journey on actual shared host and devices with real GoTrue/PostgREST/Storage/Edge. Configure narrow monitoring, backups/export/restore and provider honesty. Demonstrate clean-target restore, 7-day hosting power/network rehearsal if phone used, tenant separation, onboarding and support hours. Owner approves live rollout only after concrete reviewed local/staging artifact and rollback plan.

Produces: Honest pilot release verdict, limits/pricing/support/recovery/customer signoff or exact blockers.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: Two agencies/clients/drivers full order-to-cash-cost-payroll loop; foreign ID/UI/API/DB/storage denial; network/restart/duplicate/partial delivery/dispute; real tracking device background if advertised; backup restore with record/file hashes and zero missing issued evidence. Run all maintained checks and task-specific runtime checks; retain exact counts/tiers. Fresh deployed health is JSON, not SPA fallback.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No production deploy/migration/credential change/real payment without explicit owner approval; no readiness claim from PGlite or route smoke alone.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.

