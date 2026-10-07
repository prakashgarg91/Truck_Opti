# TO-141 / 031 — Transport-agency pilot assessment result

Date: 2026-10-06. Supervisor: GPT-6. Verdict: ACCEPTED — documentation assessment only; app is **not** a fully functioning sellable transport-management system.
Assessment HEAD: aba05fc8, main. No product code or provider/hosting configuration changed.

## Delivered and saved

- docs/PRODUCT_ROADMAP.md replaces June “all live/post-launch” claims with authoritative owner requirements (verbatim request), evidence-based gaps, four role journeys, 33 screen/workflow rows, data/command contracts, no-SMS path, freight/expense/fuel/payroll/ERP scope, phone-hosting trade-offs and selling gate.
- agent-tasks/031-transport-agency-pilot-plan.md contains the detailed reusable build prompt.
- agent-tasks/032–043 contain twelve dependency-ordered implementation briefs. TO-142 tenant authority is READY; others wait on dependencies. Existing TO-137/140 and unresolved production gates retained.
- TASKS.md, ARCHITECTURE.md, README.md and agent-tasks/README.md now point to one product spec and current queue.
- docs/design-audit.md distinguishes pending product modules from existing design coverage; documentation addendum only.
- Existing docs/ARCHITECTURE.md, ANDROID_APP_ARCHITECTURE.md, COMPETITOR_ANALYSIS.md, MARKET_SURVIVAL_FEATURES.md and AGENT_TASK_EXECUTION_MATRIX.md labelled historical/retired. Original content retained; no alternate board introduced. Immutable docs/USER_REQUIREMENTS.md preserved.
- agent-results/functional-coverage.md labelled historical where later evidence supersedes it.
- Owner-requested memory extension note saved separately under the permitted memories/extensions/ad_hoc/notes path; registry not edited.

## Findings verified now

Dispatch SQL harness reproduced **six** findings: foreign shipment claim, suspended agency writes, authenticated fleet assignment denial, service-path guard bypass, missing booking dispatch producer and absent trip→shipment→agency-job status propagation.
Customer harness reproduced **three**: foreign usage/plan RPC access, missing dispatch and document RPC PUBLIC EXECUTE hygiene.
Admin harness reproduced **four**: unpinned definer lookup paths, anonymous aggregate view, public billing files, user metadata used in invoice display (not authority).
Test PASS counts exclude these findings; they remain engineering work.

Source read: App.tsx via CodeGraph for routes; InvoicePage/invoiceGenerator/whatsappShare show fixed 18% transport presentation; SaleOrdersPage has CSV/XLS import-to-packing baseline; DriverTripPage uses navigator.geolocation.watchPosition and tracking uses database latest points. Dedicated expenses/payroll/fuel/ERP/GR-verification/incident routes absent from current router; module internals not exhaustively audited.

Serdroid inspected read-only at D:/Github/Serdroid: AGENTS.md and README.md document Android/Kotlin→Go supervisor→PocketBase/cloudflared/Termux. No phone/runtime/load/backup test run, no Serdroid changes. Phone recommended as optional worker/backup/demo; full PocketBase migration is a separate decision, not a transparent replacement.

CodeGraph returned current source. Semantic search tool failed with “All connection attempts failed”; source/CodeGraph and recorded results used as fallback. No indexes rebuilt. No GitNexus change impact needed: only documentation changed; product symbols untouched.

Official web sources checked for SMS/DLT, Android location, PocketBase, Tally, e-way bills/GST and DPDP context; links and limitations in roadmap section 10. No cheapest-SMS claim, live tax certification or measured phone cost/uptime claim.

## Fresh verification (all local)

| Command / working directory | Exit | Evidence |
|---|---|---|
| git fetch origin / root | 0 | initial rev-list origin/main...HEAD 0/0 |
| npm run test:unit / frontend | 0 | 551/551 tests, 38 files; act/GoTrue test warnings |
| npm run build / frontend | 0 | tsc + Vite; PGlite browser/eval and chunk warnings |
| npm run lint / frontend | 0 | max-warnings 0 |
| npm run test:packing / frontend | 0 | 18/18 checks |
| node scripts/trip_transition_integrity.db.test.mjs / root | 0 | 21/21, PGlite SQL only |
| node scripts/customer_journey_isolation.db.test.mjs / root | 0 | 25/25 + 3 separate reproduced findings |
| node scripts/dispatch_delivery_journey.db.test.mjs / root | 0 | 35/35 + 6 separate reproduced findings |
| node scripts/admin_rls_proof.db.test.mjs / root | 0 | 53/53 + 4 separate findings |
| npm run test:server-routing / root | 0 | 15/15 |
| node tools/glue-check.mjs / root | 0 | 0 gaps, 0 warnings; does not detect missing booking RPC |
| python -m pytest tests/unit/test_authentication_middleware.py / apps/web | 0 | 6/6 in 0.27s |
| git diff --check / root | 0 | line-ending normalization notices only |

Six policy suites initial run: exit 1, 61/62. The real-board recommendation assertion saw IN_PROGRESS on the pre-queue board (no ordinary READY row). Current board now has explicit READY TO-142; rerun recorded below. No test or product code weakened.
Six-suite rerun after board alignment: exit 0, **62/62**, 0 skipped, including the real TASKS.md recommendation/reference check. Documentation integrity check: exit 0, 13 new briefs (031–043), 33 screen/workflow rows, every board brief/result reference exists and verbatim owner request present.
One mistyped customer harness command (customer_cloud_journey.db.test.mjs) exited 1 MODULE_NOT_FOUND; corrected to the existing customer_journey_isolation harness, exit 0, 25/25. No missing file was manufactured.

Browser public/launch smokes and hosted/device E2E **not rerun** in this documentation assessment. Earlier smoke counts remain historical local evidence. No production health/deploy/auth/storage/ERP/device readiness inferred. No Stitch tool called/mutated (documentation-only); generation/retries 0 and no new IDs/screenshots. No fresh dependency vulnerability audit requested; earlier board audit remains historical.

## Human gates versus executable work

Human/live: actual host budget/access and approved rollout; accountant freight/payroll examples; ERP/version/sanitized data; phone/tracker model and continuous tracking choice; SMTP/OAuth/SMS providers only when chosen; live payments if included.
AI-executable now: TO-142 local tenant/usage/private-document repair and regression; then dependency-ready pilot slices. No SMS partner needed to author or test these.

## Repository closure

Initial tracked tree clean; three pre-existing untracked paths preserved. 13 registered checkouts including primary (11 awf + one legacy detached), parked branches and stashes preserved with existing dispositions; no new isolation or destructive consolidation. TO-140 remains AWAITING_REVIEW, not falsely accepted here. Session files are documentation/brief/result changes only. Next smallest task is TO-142, agent-tasks/032-tenant-authority-repair.md. Git commit/remainder state recorded at final closeout.
Final decision: commit the verified documentation directly to main; no push, production deployment or product mutation. Pre-existing untracked paths remain after commit. No other writer's changes detected.

## 2026-10-07 owner-requested roadmap update

Owner supplied a TO-142 working-tree repair report and asked to check/update the existing pilot plan. Read the pasted attachment and 032-result, current migration/function source (CodeGraph/source fallback; semantic service unreachable), root architecture/board and brief 032. Main at start 76ef129a; fetch exit 0, origin/main...HEAD 0 behind / 1 ahead. Agent bus reported no live claims. Product edits/result/migrations were already dirty/untracked and preserved.

Fresh local verification on this candidate:
- `node scripts/dispatch_delivery_journey.db.test.mjs`: exit 0, 42/42, no findings.
- `node scripts/customer_journey_isolation.db.test.mjs`: exit 0, 28/28, no findings.
- `node scripts/admin_rls_proof.db.test.mjs`: exit 0, 56/56, one G4 invoice display-source finding.
- `node scripts/trip_transition_integrity.db.test.mjs`: exit 0, 21/21.
- `npm run test:unit` in frontend: exit 0, 553/553, 38 files; existing act/GoTrue warnings.

Proof tier: PGlite PostgreSQL 18.3 and unit/source checks. No current Edge/GoTrue/PostgREST/Storage HTTP, browser/mobile, real device, hosted migration/function rollout or deployment proof. Worker reports build/lint/packing/routing/glue green, but those claims are not all freshly rerun by this update. Full immutable-patch supervisor/security/scope review is not claimed.

Updated docs/PRODUCT_ROADMAP.md to separate locally repaired candidates from remaining launch gates, preserve the October 6 baseline and owner request, record signed-link expiry/revocation limits, stale private-KYC public-URL consumer reported by the worker and G4 company/billing snapshot follow-up. Producer currently matches approved driver vehicle type; production agency consent creation, actual fleet reservation, concurrency and partial-delivery aggregation remain TO-143/146 acceptance work.

Aligned TASKS.md: TO-142 AWAITING_REVIEW (not DONE); TO-142-R READY supervisor review/integration using brief 032's review step; TO-143 remains dependent. Updated architecture, design audit and existing prompts/briefs 031/033/038 so the next worker does not duplicate basic producer/propagation or forget G4. This is documentation-only work; no candidate product edits or worker report were staged, modified or accepted. No push/hosted changes; next action TO-142-R. Historical closeout text above describes October 6.
Documentation verification: real-board policy test exit 0, 1/1; link/requirement integrity check exit 0 (33 screen/workflow rows retained, original owner request present, board references resolve); scoped git diff --check exit 0. Documentation is committed separately on main; candidate product edits and 032-result remain uncommitted for review.
