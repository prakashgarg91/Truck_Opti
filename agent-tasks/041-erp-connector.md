# TO-151 — Normalized order API and first-client ERP connector

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: TO-145/146/148 accepted; ERP/version/sanitized example and client sandbox access required.
Result: agent-results/041-result.md.

## Allowed scope / first source map

existing SaleOrdersPage/import services; new integrations pages/services; scoped connector/API/outbox functions; optional customer-side outbound connector in intentional integration folder; contract tests.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

Reuse normalized importOrders identity/mapping. CSV/API first; one real client's ERP/version adapter next. Connection capability/test/mapping/preview/sync/retry/revoke, encrypted secrets and checkpointed outbox. Local Tally customer-controlled outbound connector; ERP order revision is source authority, dispatch/POD/freight state lives here. Optional write-back explicitly approved and reconciled.

Produces: Repeatable order-to-truck request integration with visible failures.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: Duplicate/replayed webhook or poll, source-company mismatch, units/site/SKU mapping errors, expired/revoked credentials, timeout/backoff/dead-letter. Amendment after partial dispatch cannot erase custody or overallocate remaining quantity. Sandbox round trip with actual ERP/version before connector DONE.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No ERP LAN public ports, credential log/browser storage, arbitrary connector marketplace or unapproved write-back.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.

