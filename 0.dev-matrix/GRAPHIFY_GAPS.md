# Graphify Gaps

Purpose: persist Graphify-discovered architecture gaps so future sessions can resume from verified codebase reality instead of re-auditing from scratch.

## 2026-05-11 Refresh

Source of truth:
- `npm run graph:update`
- `mcp_roo-code-inde_roo-code-index-health`
- `mcp_roo-code-inde_roo-code-index-search`
- `mcp_code-review-g_build_or_update_graph_tool`

Verified graph snapshot after T-151 and the MCP completion audit:
- 433 nodes
- 506 edges
- 73 communities
- Roo bridge health: `workspace.status=ok`, `resolution_mode=qdrant`, collection `ws-6df6af38d373c83b`

Current graph observations:
- Community 7 now includes the extracted driver-trip helper boundary (`buildJobProgressStatePatch()` plus related progress functions), so Graphify sees the new trip-progress split.
- `persistJobProgress()` is still a top god node at 8 edges and `initiateRazorpayPayment()` remains at 7 edges, but that gap is now covered by focused unit proof rather than being an untested blind spot.
- Graphify picked up the new local frontend files immediately after `npm run graph:update`, while incremental `code-review-graph` change detection still missed untracked new files. Treat the two graph layers as complementary, not interchangeable.

### Closed In This Session

1. Payment and trip regression-proof blind spot
   - Problem: the previous graph snapshots kept highlighting `initiateRazorpayPayment()` and `persistJobProgress()` as high-connectivity nodes with no focused repeatable regression lane.
   - Fix: `frontend` now has a Vitest unit lane, Razorpay initiation coverage, and a dedicated `driverTripProgress` helper with direct tests.
   - Files: `frontend/package.json`, `frontend/vitest.config.ts`, `frontend/src/services/razorpayPayment.test.ts`, `frontend/src/services/driverTripProgress.ts`, `frontend/src/services/driverTripProgress.test.ts`, `frontend/src/pages/DriverTripPage.tsx`.
   - Verification: `cd frontend && npm run test:unit` PASS (`7/7`), `cd frontend && npm run build` PASS.

### Still Open

1. Graphify local install drift
   - Problem: `npm run graph:update` currently warns `skill is from graphify 0.4.15, package is 0.4.18`.
   - Impact: graph refresh still works, but the local Graphify toolchain is not fully reconciled for future sessions.
   - Next action: run `graphify install` in the repo environment and verify that `npm run graph:update` no longer prints the warning.

2. No new urgent Graphify-owned architecture blocker
   - Current interpretation: after the May 11 refresh, the remaining blockers are operational and product-proof oriented rather than a missing structural decomposition slice.
   - Next action: use Graphify for future hotspot confirmation, but do not reopen large structural refactors unless a reproduced bug or benchmark points at a concrete architecture defect.

## 2026-04-16 Refresh

Source of truth:
- `npm run graph:update`
- root snapshot: `graphify-out/GRAPH_REPORT.md`
- scoped snapshot: `frontend/src/graphify-out/GRAPH_REPORT.md`

Verified graph snapshot after cleanup:
- 372 nodes
- 399 edges
- 76 communities

Follow-up graph snapshot after the packing refactor slice:
- 377 nodes
- 408 edges
- 75 communities
- `AdvancedBinPacker` no longer appears in the top god-node list.
- New top packing hotspots: `packSkylineBL()` (9 edges), `packExtremePoints()` (8 edges), `packItemsForTruck()` (6 edges).

Follow-up graph snapshot after the packing algorithm entry-point refactor:
- 387 nodes
- 427 edges
- 75 communities
- `packSkylineBL()` and `packItemsForTruck()` no longer appear in the top god-node list.
- Remaining packing hotspots shifted to helper-level nodes: `packExtremePoints()` (7 edges), `findBestSkylinePlacement()` (6 edges), `getItemRotations()` (5 edges), `findBestExtremePointPlacement()` (5 edges).

Follow-up graph snapshot after the shared recommendation-summary cleanup:
- 398 nodes
- 453 edges
- 76 communities
- Current top packing-related nodes are now algorithm-core helpers rather than wrapper/page drift: `createExtremePointPackingAttempt()` (6 edges), `packSkylineBL()` (6 edges), `packExtremePoints()` (6 edges), `getItemRotations()` (5 edges).

### Closed In This Session

1. Shipment document identity ownership
   - Problem: invoice/LR numbers were generated client-side in `InvoicePage.tsx`.
   - Fix: `shipments` now persists `invoice_number` and `lr_number`; DB trigger populates new rows; `ensure_shipment_document_numbers(...)` backfills existing rows; `InvoicePage` reads persisted values through `shipmentsSupabaseApi.ensureDocumentNumbers(...)`.
   - Files: `supabase/migrations/20260416010000_graphify_gap_contract_fixes.sql`, `frontend/src/services/supabaseApi.ts`, `frontend/src/pages/InvoicePage.tsx`.

2. Driver trip workflow split across multiple writes
   - Problem: `DriverTripPage.tsx` separately updated `job_offers`, proof-photo fields, and `drivers.active_job_id/total_trips`.
   - Fix: `persist_driver_job_offer_progress(...)` now owns trip-state, timestamps, proof-photo URLs, and final driver cleanup in one DB-side operation; `DriverTripPage` routes all progress writes through that RPC.
   - Files: `supabase/migrations/20260416010000_graphify_gap_contract_fixes.sql`, `frontend/src/pages/DriverTripPage.tsx`.

3. Payment-history ownership and status contract drift
   - Problem: PhonePe client and server both wrote `payment_history`; server code used invalid values like `payment_method='phonepe'` and `status='completed'`; activation flow was using stale subscription field names.
   - Fix: PhonePe client now only starts checkout; edge functions own payment-history writes; payment statuses now use `pending|success|failed`; subscription activation functions use current schema (`price_monthly`, `price_yearly`, `billing_cycle='monthly'|'yearly'`).
   - Files: `frontend/src/services/phonepePayment.ts`, `frontend/src/services/razorpayPayment.ts`, `supabase/functions/phonepe-checkout/index.ts`, `supabase/functions/phonepe-status/index.ts`, `supabase/functions/verify-payment/index.ts`, `supabase/functions/verify-razorpay-payment/index.ts`.

4. Contact inquiry retry logic living inside the page
   - Problem: `ContactPage.tsx` owned draft storage, queueing, and retry behavior, with no dedupe key for reconnect retries.
   - Fix: contact persistence moved into `frontend/src/services/contactInquiry.ts`; retries now keep a stable `client_submission_id`; `contact_inquiries` now supports dedupe via `client_submission_id`.
   - Files: `supabase/migrations/20260416010000_graphify_gap_contract_fixes.sql`, `frontend/src/services/contactInquiry.ts`, `frontend/src/pages/ContactPage.tsx`.

5. Graphify output-path drift
   - Problem: fresh Graphify runs updated `frontend/src/graphify-out`, while repo instructions referenced root `graphify-out/`.
   - Fix: `npm run graph:update` now refreshes `frontend/src` and syncs the latest report back to root `graphify-out/`.
   - Files: `scripts/graphify-refresh.ps1`, `package.json`.

### Follow-up Closed In This Session

6. `AdvancedBinPacker` class hotspot reduction
   - Problem: `AdvancedBinPacker` was still the top frontend god node after the first Graphify cleanup pass.
   - Fix: the class is now a thin compatibility wrapper while packing algorithms, geometry helpers, and recommendation helpers live as top-level functions.
   - Files: `frontend/src/lib/packing.ts`.
   - Verification: `cd frontend && npm run test:packing` PASS (10/10), `cd frontend && npm run build` PASS, `npm run test:frontend-smoke` PASS (17/17), `npm run graph:update` PASS.

7. Live Supabase rollout of the Graphify contract fixes
   - Problem: the contract changes were only local because Supabase CLI auth was missing, and the first linked push exposed remote schema drift in `contact_inquiries` plus ambiguous outer-column references in the trip RLS migration.
   - Fix: authenticated the CLI, qualified the outer-row RLS references in `20260416000000_sync_trip_offer_tracking.sql`, made `20260416010000_graphify_gap_contract_fixes.sql` self-heal a missing `contact_inquiries` table/policies, pushed the linked DB, and deployed `phonepe-checkout`, `phonepe-status`, `verify-payment`, and `verify-razorpay-payment` to `jbxncejtcbpcronndqlx`.
   - Files: `supabase/migrations/20260416000000_sync_trip_offer_tracking.sql`, `supabase/migrations/20260416010000_graphify_gap_contract_fixes.sql`, `supabase/functions/phonepe-checkout/index.ts`, `supabase/functions/phonepe-status/index.ts`, `supabase/functions/verify-payment/index.ts`, `supabase/functions/verify-razorpay-payment/index.ts`.
   - Verification: `npx supabase projects list` showed linked access to `TruckOpti`; `npx supabase db push --yes` finished successfully; `npx supabase db push --dry-run --yes` now reports `Remote database is up to date`; all four `npx supabase functions deploy ... --project-ref jbxncejtcbpcronndqlx --use-api` commands reported successful deploys.

8. Packing algorithm entry-point decomposition
   - Problem: after the wrapper refactor, `packSkylineBL()` and `packItemsForTruck()` still concentrated most of the packing-engine graph pressure.
   - Fix: extracted helper boundaries for skyline sorting/search, extreme-point search/state mutation, item rotation derivation, and runtime dispatch so the algorithm entry points are now thinner orchestration functions.
   - Files: `frontend/src/lib/packing.ts`.
   - Verification: `cd frontend && npm run test:packing` PASS (10/10); `cd frontend && npm run build` PASS; `npm run test:frontend-smoke` PASS (17/17); `npm run graph:update` PASS (`387 nodes`, `427 edges`, `75 communities`); `npm run launch-check` -> 16 passed, 1 failed (git working-tree cleanliness only).

9. Manual packing recommendation-summary ownership
   - Problem: `PackingPage.tsx` rebuilt `TruckRecommendation` manually in both success and fallback paths, and it incorrectly computed `weightUtilization` from the full requested load instead of the packed boxes.
   - Fix: added `createTruckRecommendation(...)` to `frontend/src/lib/packing.ts`, switched the manual packing UI path to that shared summary function, and added a regression proving the mini truck reports 80% weight utilization for two packed cubes instead of incorrectly counting the third unpacked cube.
   - Files: `frontend/src/lib/packing.ts`, `frontend/src/pages/PackingPage.tsx`, `frontend/scripts/packing-regression.ts`.
   - Verification: `cd frontend && npm run test:packing` PASS (11/11); `cd frontend && npm run build` PASS; `npm run test:frontend-smoke` PASS (17/17); `npm run graph:update` PASS (`398 nodes`, `453 edges`, `76 communities`); `npm run launch-check` -> 16 passed, 1 failed (git working-tree cleanliness only).

### Still Open

1. No urgent AI-owned Graphify blocker remains
   - Current graph status: the god-node list is now dominated by stable service and algorithm-core functions such as `initiatePhonePePayment()`, `sendInquiry()`, `initiateRazorpayPayment()`, `createExtremePointPackingAttempt()`, `packSkylineBL()`, and `packExtremePoints()`.
   - Interpretation: the earlier ownership drift around wrappers, dispatch, and page-layer recommendation math is closed. Further packing changes should be benchmark-driven heuristic work, not decomposition for its own sake.
   - Next action: only reopen packing refactors if a new benchmark or reproduced fit-quality bug shows a concrete algorithm problem.

### Verification

- `cd frontend && npm run build` PASS
- `cd frontend && npm run test:packing` PASS (11/11)
- `npm run test:frontend-smoke` PASS (17/17)
- `npm run graph:update` PASS (`398 nodes`, `453 edges`, `76 communities`)
- `npx supabase db push --dry-run --yes` PASS (`Remote database is up to date`)
- `npm run launch-check` FAIL only on git working-tree cleanliness (16 passed, 1 failed)