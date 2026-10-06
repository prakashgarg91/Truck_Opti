# TO-146 — GR/LR QR and pickup-to-material-receipt proof

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: TO-143 and TO-145 accepted.
Result: agent-results/036-result.md.

## Allowed scope / first source map

frontend/src/pages/DriverTripPage.tsx, InvoicePage.tsx; new consignment/receiver pages and scoped services; frontend/src/App.tsx; new GR/POD/challenge migrations/functions; trip/custody tests.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

Versioned issued consignment note with line quantities, consignor/consignee, vehicle, route, freight payer and source invoice/e-way refs. Private printable PDF and redacted signed QR authenticity link. Separate pickup/end server challenges; driver never reads raw code. Receiver records received lines, name/signature/photos/shortage/damage/rejection; explicit partial/disputed/return state. Revocation and amendments preserve original evidence.

Produces: Immutable custody/POD snapshots and billable event contract.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: QR valid/expired/void/revoked/foreign requests; no OTP/KYC/bank data leak. Receiver without full account has only one stop scope. Wrong/expired/used code, offline pending draft, audited override and duplicate POD. Partial receipt cannot complete all orders or bill disputed lines without approved rule; custody transfer preserves history.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No fake official GST IRN/e-way QR, universal OTP success override or deletion of signed POD.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.

