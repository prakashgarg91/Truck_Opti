# TO-147 — Trip tracking, stoppages and breakdown/emergency operations

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: TO-143 and TO-144 accepted; actual tracking device model required before continuous background promise.
Result: agent-results/037-result.md.

## Allowed scope / first source map

frontend/src/pages/TrackingPage.tsx, DriverTripPage.tsx; driver/agency services/functions, App.tsx/layouts; new incident/location ingestion tests; existing Android architecture reference only until companion design approved.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

Timestamped trip-bound device points with accuracy/capture/server time, batched ingest and latest-location row, stale/offline labels and permission diagnostics. Authorized stops/dwell and incident queue with owner/acknowledgment/resolution/custody reassignment. Configured immediate phone action independent of network. Android companion/tracker integration only after scope/device discovery; do not turn this brief into four native apps.

Produces: Trip location/stop/incident evidence consumed by ops and costing.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: Foreign/off-duty/client token access denied; stale/out-of-order/replayed/inaccurate points do not fake live position. Network loss/reconnect/permission denial; incidents queue if API fails while call action remains available. For continuous tracking: real screen-off, background, battery/reboot and 10-hour device session evidence; PWA-only result explicitly limited.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No invented help numbers, automatic 24x7 responder promise, sensor fuel-theft claim or hidden background tracking.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.

