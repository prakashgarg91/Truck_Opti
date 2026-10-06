# TO-148 — Freight invoices, private documents and collections

Owner: GPT-6 supervisor / one serialized implementation writer.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06); reusable prompt: agent-tasks/031-transport-agency-pilot-plan.md.
Dependencies: TO-144 and TO-146 accepted; accountant-approved pilot tax/tariff examples needed for real issue.
Result: agent-results/038-result.md.

## Allowed scope / first source map

frontend/src/pages/InvoicePage.tsx, AgencyBillingPage.tsx; frontend/src/utils/invoiceGenerator.ts, whatsappShare.ts; freight services/functions separate from SaaS billing; new invoice/receipt/adjustment migrations/tests.
Paths are starting points, not permission to replace whole modules. Discover exact existing interfaces before editing; new module paths must be pinned in a bounded pre-edit plan. Use context tools first. If this module needs more than one independently reviewable delivery, split it into child briefs on TASKS.md before coding.

## Required behavior / interfaces

Agency freight ledger distinct from software subscriptions and customer goods invoice. Bill-to/ship-to snapshots, tariff extras, approved effective tax/forward-reverse-charge profile, paise/decimal rounding and branch/fiscal sequence. Server recomputes approved amounts; issue immutable PDF/snapshot; signed sharing, partial receipts/allocation, dispute, credit/debit note. Preserve SaaS authority and payment boundaries.

Produces: Agency receivable/income ledger and customer invoice portal.

## Acceptance / regression cycle

- [ ] Inspect dirty state/current architecture and verify dependency acceptance.
- [ ] Map existing symbols/callers; pin command request/response and state transition contract from roadmap section 6; check blast radius before changes.
- [ ] Write meaningful failing acceptance/regression tests for: Approved accountant golden examples including rounding, interstate/intrastate/RCM profile where applicable; wrong tenant/rate/amount tampering denied. Reissue/retry yields one invoice; issued values immutable. Partial receipts/open balance, reversal/credit reconciliation and private-download expiry/revocation. Manual receipt is labelled unverified until reconciled.
- [ ] Implement smallest connected UI/API/persistence delivery. Server is authority; retry uses idempotency and expected version; errors are typed/redacted.
- [ ] Run focused red/green tests plus maintained frontend lint/build/unit/packing, root routing/policy/glue gates and applicable DB/Python tests.
- [ ] UI changes: follow Stitch standing instructions, map all actions/API states, verify mobile 390×844 + desktop 1280×900 and selected Hindi/English behavior; update docs/design-audit.md.
- [ ] Record actual HTTP/device/staging evidence when required; distinguish mocks, PGlite and browser fixtures from deployed behavior.
- [ ] Self-review, then GPT-6 acceptance, result file, TASKS.md and cohesive verified main commit.

## Forbidden scope / owner gates

No hardcoded 18% freight, live gateway calls, bank auto-verification or statutory compliance assertion without accountant proof.
No branches/worktrees/stashes, concurrent writers, secret output, unrelated cleanup or destructive operations. Local migration authoring/test is allowed; hosted rollout, production deployment, credentials and real payments are owner-gated. Missing live access does not prevent independent local work.

## Handoff

Changed files, exact commands/directories/exit codes/counts, regressions, proof tier, findings still open, owner blockers, current git state and next smallest task. A green harness that separately reproduces defects is not a defect-free result. Do not mark DONE until reviewed within the actual stated scope.

