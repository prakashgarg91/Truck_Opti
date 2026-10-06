# TO-145 — Sales-order import, load planning and client approval

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: TO-143 and TO-144 accepted.
Result: agent-results/035-result.md.

## Allowed scope / first source map

frontend/src/pages/SaleOrdersPage.tsx, PackingPage.tsx, RoutesPage.tsx, NewShipmentPage.tsx; existing packing/local/cloud services; apps/web packing modules only if measured need; frontend/src/App.tsx; normalized order/allocation migrations and focused tests.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

Implement roadmap planTransport/authorizeAgency and source-company/order/line/revision identity. Persist draft headers/lines, bill-to/ship-to, SKU/UOM/qty/weight/dimensions/windows/constraints. CSV/XLS preview validation; deterministic eligible fleet truck count/packing plan and explicit unmet demand; quote approval and versioned allocations. Current Haversine/fixed-cost estimates labelled; road adapter never fabricates directions on outage.

Produces: Approved loads/stops/cargo snapshots ready for GR and dispatch.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: Manual and CSV produce same normalized plan. Mixed kg/tonne/mm/metre, payload-limited/volume-limited/nonstackable/oversize cargo, multi-drop sequence, no eligible truck, duplicate batch, amended/cancelled/partial order and concurrent overshipment. Golden fixtures pin counts/quantities and explain assumptions. Reload approved plan with unchanged snapshot.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No Python/VBA duplicate engine without proven benefit, claimed exact optimum, or dimensions guessed silently.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.

