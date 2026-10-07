# TO-142 — Repair tenant, usage and private-document authority (agent-tasks/032)

Round 3 complete. Writer: GLM-5.3 Flash implementation writer (serialized, branch `main`).
Status: all TO-142 batteries green; the only remaining reproduced finding (admin G4) is explicitly owner-deferred to TO-148 with adjudication evidence below. **Not committed** (subagent contract commits nothing — integration commit is the GPT-6 acceptance step).

## Round 3 — A5 view-hardening + G4 adjudication

Round-3 gates: dispatch 42/42 and customer 28/28 with open findings: NO; admin still reproduced two findings (A5, G4). Per "fix only what these failures implicate":

### A5 — REPAIRED (`supabase/migrations/20261006140000_revoke_setup_status_view_reads.sql`)
- Consumer map (duty done): `public.production_setup_status` is referenced outside its defining migration ONLY by a generated type (frontend/src/types/database.types.ts:571) — zero frontend queries, zero Edge consumers, zero harness readers. It is an owner-rights aggregate view (20260212000000:394-412) exposing raw row counts of every tenant table.
- Repair = the finding's own house fix: `REVOKE SELECT ... FROM anon; REVOKE SELECT ... FROM authenticated`. Owner/service access unchanged (service_role grants untouched). In-brief: "remove needless PUBLIC grants" (agent-tasks/032:15).
- Harness (red-first): the conditional A5 `recordFinding` fork became hard case **A5b** asserting zero client-readable views (anon AND authenticated). RED proven: pre-migration run printed `FAIL A5b ... anon=[production_setup_status] authenticated=[production_setup_status]`; post-migration PASS.

### G4 — EXPLICITLY LEFT for TO-148 (adjudication, not deferral-by-omission)
The honest repair requires moving the invoice billing-address source off `user_metadata.company`:
- `public.users` has NO company/gstin/address columns (20260212000000:120-133: id/email/name/phone/phone_verified/google_linked/profile_picture/role), so merely deleting the `user_metadata` reads would strip GSTIN/billing address from tax invoices — a product/compliance regression.
- Writing company fields into `public.users` requires editing the signup/profile flows (authStore.ts:139-148 upsert, ProfilePage) — auth/profile frontend paths that are OUTSIDE 032's allowed scope ("affected frontend document service consumers" only).
- Deleting the string to satisfy the G-case source heuristic without changing behavior would be gaming the check. G4 therefore stays reproduced, unweakened, exactly as the run plan assigned it to the invoice/PDF slice (TO-148).

### Round-3 verification (all run in this session, from repo root)

| Command | Result |
|---|---|
| `node scripts/admin_rls_proof.db.test.mjs` | **56/56 cases passed, exit 0**; findings: only G4 (owner-deferred). A5 no longer reproduced (repaired). |
| `node scripts/dispatch_delivery_journey.db.test.mjs` | **42/42, 0 findings, exit 0** (unchanged) |
| `node scripts/customer_journey_isolation.db.test.mjs` | **28/28, 0 findings, exit 0** (unchanged) |
| `node scripts/trip_transition_integrity.db.test.mjs` | **21/21, exit 0** (unchanged) |
| `npm --prefix frontend run test:unit` | **553/553**, exit 0 |
| `npm --prefix frontend run lint` | exit 0 |
| `npm --prefix frontend run build` | exit 0 |
| `npm run test:packing` | **18/18**, exit 0 |
| `npm run test:server-routing` | **15/15, 0 failed**, exit 0 |
| `npm run glue:check` | **GLUE SEALED — 0 gaps, 0 warnings**, exit 0 |
| 5 policy suites (`launch_gate_policy`, `payment_readiness_policy`, `production_config_policy`, `security_boundary_policy`, `deployment_safety`) | 14+1+37+2+4 passed, **0 failures** |

**Not run (environment-gated, pre-existing):** `node --test scripts/atomic_job_offer_response.rls.test.mjs` — requires the disposable Supabase stack (Docker not installed); fails at its env probe before any migration replay. Unchanged across all rounds.

### Open items after round 3
1. Admin G4 (P3) — TO-148 (invoice/PDF slice): source invoice billing identity from `public.users` (needs company/gstin columns + signup/profile writes; outside 032 scope).
2. Pre-existing flag: DriverRegisterPage.tsx:88 stale `getPublicUrl` on the already-private driver-docs bucket.
3. TO-143 remainder: agency-side dispatch pipeline producing `shipment_agency_consents` at scale; notification gateway.

---

## Round 2 — booking dispatch producer + server-side delivery propagation

Round-2 gates exited 0 but reproduced two out-of-scope-stated journey defects; this round repaired exactly those (the TASKS.md TO-143 "minimum set") while keeping the owner-decision findings reproduced.

### New forward migration — `supabase/migrations/20261006130000_dispatch_producer_and_trip_propagation.sql`
1. **`public.dispatch_job_to_drivers(p_shipment_id uuid, p_vehicle_type text) RETURNS integer`** — the producer NewShipmentPage.tsx:81 already calls (`{ p_shipment_id, p_vehicle_type }`; the count renders as "Notified N drivers"). SECURITY DEFINER, `SET search_path = public`, `REVOKE ... FROM PUBLIC, anon; GRANT EXECUTE TO authenticated`. Contract: caller-bound ownership guard mirroring the tracking RPC (customer_id / created_by / customers.created_by = auth.uid(), else `'Shipment not found or access denied'`); lifecycle guard (only `status='pending'` shipments dispatch, else `'Shipment is not open for dispatch.'`); one pending 1-hour offer per eligible driver (`status='approved' AND vehicle_type = p_vehicle_type` and no non-terminal offer already on that shipment — declined/expired drivers are re-offerable; offline drivers included because offers persist in their list); OTP columns inserted NULL so the 4-digit trigger (20260601223849) fills them — no OTP drift possible.
2. **`public.propagate_trip_delivery_status()`** — AFTER UPDATE OF status trigger on job_offers: when an offer reaches `'delivered'` (only possible through the SECURITY DEFINER `persist_driver_job_offer_progress`; authenticated table UPDATE is revoked per 20261004000000), shipments.status and agency_jobs.status move to `'delivered'` exactly once (`OLD.status IS DISTINCT FROM 'delivered'` guard makes replays no-ops, preserving the exactly-once counters contract). Never downgrades or rewrites other statuses; manual surfaces keep their own status paths. SECURITY DEFINER + pinned search_path.

### Harness edits (red-first; strengthening only)
- dispatch: missing-RPC FINDING block → cases 8b (producer notifies only the eligible approved driver — driver2 still pending → exactly 1 offer, pending, 4-digit OTPs verified via non-OTP stakeholder read + tracking RPC) and 8c (foreign-caller dispatch denied `'Shipment not found or access denied'`); case 27 flipped from the no-sync `expect` + recordFinding to hard propagation asserts (shipment AND agency job `'delivered'` after the delivered trip) + case 27b (customer keeps its own status path; agency still cannot write the customer shipment).
- customer: finding-26 block → case 26 (lifecycle guard: delivered shipment not re-dispatchable; fresh booking dispatches 1 OTP-gated offer) + case 26b (ownership guard: B cannot dispatch A's shipment).
- Trip-photo/invoice/consent cases from round 1 untouched and still green.

### Round-2 verification (all run in this session, from repo root)

| Command | Result |
|---|---|
| `node scripts/dispatch_delivery_journey.db.test.mjs` | **42/42 cases passed, 0 findings, exit 0** (round-1 gate: 39/39 + 2 findings) |
| `node scripts/customer_journey_isolation.db.test.mjs` | **28/28 cases passed, 0 findings, exit 0** (round-1 gate: 26/26 + 1 finding) |
| `node scripts/admin_rls_proof.db.test.mjs` | **55/55 cases passed, exit 0** — only the two owner-deferred findings remain reproduced (A5 P3 owner decision per 026-result §5; G4 P3 flagged for TO-148, `user_metadata` display string intact) |
| `node scripts/trip_transition_integrity.db.test.mjs` | **21/21 cases passed, exit 0** (propagation trigger does not disturb the OTP/ordered-transition/exactly-once contract; direct driver UPDATE denial is privilege-level, pre-trigger) |
| `npm --prefix frontend run test:unit` | **553/553 passed**, exit 0 |
| `npm --prefix frontend run lint` (`--max-warnings 0`) | exit 0 |
| `npm --prefix frontend run build` | exit 0 |
| `npm run test:packing` | **18/18 checks passed**, exit 0 |
| `npm run test:server-routing` | **15/15 passed, 0 failed**, exit 0 |
| `npm run glue:check` | **GLUE SEALED — 0 gaps, 0 warnings**, exit 0 |
| `node --test scripts/{launch_gate_policy,payment_readiness_policy,production_config_policy,security_boundary_policy,deployment_safety}.test.mjs` | 14+1+37+2+4 passed, **0 failures** in each |

RED evidence: after the harness flips and before the migration, `node scripts/dispatch_delivery_journey.db.test.mjs` failed with `function public.dispatch_job_to_drivers(unknown, unknown) does not exist` and the customer harness failed with `expected error containing "Shipment is not open for dispatch."` — both now green.

**Not run (environment-gated, pre-existing):** `node --test scripts/atomic_job_offer_response.rls.test.mjs` still requires the disposable Supabase stack (Docker not installed); fails at its env probe before any migration replay — unchanged behavior, not a regression.

### Findings still open (owner-deferred, reproduced unweakened)
1. Admin A5: `production_setup_status` anon-readable aggregate view (P3, owner decision per 026-result §5).
2. Admin G4: invoice-delivery.ts `user_metadata` display-field reads (P3, invoice/PDF slice TO-148).
3. Pre-existing flag: DriverRegisterPage.tsx:88 stale `getPublicUrl` on the already-private driver-docs bucket.

### Round-2 notes
- Frontend untouched this round: the existing NewShipmentPage call resolves against the new RPC as-is; no UI expansion, no Stitch work.
- TO-143 remainder (agency-side dispatch pipeline producing `shipment_agency_consents` at scale, notification gateway) remains the next slice; the customer booking leg it depended on is now real.
- Untracked pre-existing paths untouched (`.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup/`, `closeout-logs/`); nothing committed.

---

## Round 1 — repair tenant, usage and private-document authority

### What changed

### New forward migration — `supabase/migrations/20261006120000_tenant_authority_repair.sql`
Single cohesive migration covering mapped-plan items 1–6:

1. **RLS-safe fleet guards.** Five SECURITY DEFINER, `SET search_path = public`, STABLE helpers: `driver_is_approved_for_assignment(uuid)`, `driver_other_truck_agency_id(uuid,uuid,uuid)`, `driver_is_assigned_to_agency(uuid,uuid)`, `agency_is_operational(uuid)`, `is_trip_photo_stakeholder(text)`. All: `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated, service_role` (the deployed service path runs as `service_role`; BYPASSRLS does not cover function EXECUTE). The three guard trigger functions (`enforce_agency_truck_driver_assignment`, `enforce_agency_job_driver_assignment`, `enforce_agency_driver_payout_insert`) were rewritten: `auth.uid() IS NULL` early-returns removed (root cause at 20260606110000:32/75/118), so service-role writes are guarded too; `public.is_admin_user()` bypass retained for DB-admin paths; all cross-tenant lookups go through the definer helpers (root cause: RLS-filtered plain `SELECT 1 FROM drivers`, 20260606110000:44-51 etc.).
   **Pinned duplicate rule** (was unpinned): a driver holds at most ONE truck row globally — cross-agency → `'Driver is already assigned to another agency.'` (existing message preserved), same-agency second truck → `'Driver is already assigned to another truck.'` (new typed error). The Edge contract (portal-auth.ts:189-227) is unchanged and stays the HTTP-layer check.
2. **Explicit shipment authorization** (roadmap §6 `authorizeAgency` scoped permission). New table `public.shipment_agency_consents` (`UNIQUE(shipment_id, agency_id)`, `granted_via ∈ {customer_consent, platform_dispatch, admin_grant}`, `revoked_at`), RLS on, SELECT grant/policy for the owning agency user + admin only, **no interactive write path** (REVOKE INSERT/UPDATE/DELETE). **Producer pinned:** the platform dispatch pipeline (TO-143) acting with customer consent or the platform dispatch decision; the harness stands in with the service authority exactly where that pipeline will act. `agency_jobs` FOR ALL policy split into SELECT/DELETE (ownership-only — suspended tenants keep portal reads) + INSERT/UPDATE WITH CHECK requiring ownership AND an active consent row AND `agency_is_operational`. The job_offers offer path denies automatically (foreign agency can no longer obtain the agency_jobs row its policy requires) — offer policies untouched.
3. **Agency-status gate** scoped to INSERT/UPDATE only: policy predicates on `agency_jobs` (reads/DELETE untouched) plus `agency_is_operational` inside all three guard triggers, message `'Agency approval is required.'` (parity with portal-auth.ts:130). The `transport_agencies` status-column trigger (20260606110000:4-27) and the Edge gate are unchanged. Driver-requested payouts (`type='withdrawal'`) remain outside the gate, as today.
4. **Caller-bound usage/plan RPCs.** `has_active_subscription`, `get_user_plan`, `check_usage_limit`, `increment_usage` recreated: first statement `p_user_id <> auth.uid()` → typed error `'Usage and plan RPCs are caller-bound to the authenticated user.'` (ERRCODE 42501), `SET search_path = public`, `REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated`. Verified zero Edge callers (grep) and frontend always passes its own `user.id` behind `if(!user)` guards (subscriptionApi.ts:242-258, 322-331), so no caller breaks. A4 inventory now shows `unpinned(0): none`.
5. `REVOKE EXECUTE ON FUNCTION public.ensure_shipment_document_numbers(uuid) FROM PUBLIC, anon` (anon revoke also covers the direct grant the platform default privileges place on functions; the authenticated grant from 20260416010000:90 persists).
6. **Private document buckets.** `billing-documents` and `trip-photos` set `public=false`. `'Public can view billing documents'` → `'Invoice owner and admins read billing documents'` (owner-folder: first path segment = owning user id written by the service writer, plus `is_admin_user()`). `'Anyone can view trip photos'` → `'Trip photo stakeholders can view'` (uploader folder + `is_trip_photo_stakeholder(name)` definer helper — avoids RLS recursion for drivers, who cannot read `agency_jobs` — + `is_admin_user()`). Owner-folder INSERT/UPDATE/DELETE and admin FOR ALL policies unchanged. `is_job_trip_photo_url` and `get_shipment_job_offer_tracking` untouched: stored photo references remain full-URL-shaped (regex-compatible `object/sign/...`), readers re-sign by extracting the path. avatars (ProfilePage.tsx:107) and driver-docs untouched; DriverRegisterPage.tsx:88 stale `getPublicUrl` on the already-private driver-docs bucket left as the pre-existing flagged item.
   **Data backfill (reviewer gap) resolved without data loss:** the invoice-view Edge function rebuilds the deterministic object path from the invoice row (`<userId>/<invoiceId>/<sanitized invoice number>.pdf` — identical to the path invoice-delivery has always uploaded to), so pre-privatization invoice PDFs resolve without touching stored rows; old stored `pdf_url` values become inert (no reader opens stored URLs anymore).

### Edge functions
- **NEW pinned module `supabase/functions/invoice-view/index.ts`**: `requireUserContext` → invoice owner or DB-admin check (service-client `public.users.role`, never metadata) → `createSignedUrl(path, 300)`. Pinned TTL **300 s** (email-follow-up click window); issued signed URLs are not revocable before expiry (HMAC over path+expiry) — revocation requires object deletion/key rotation.
- `supabase/functions/_shared/portal-auth.ts`: added exported `requireUserContext` (session-only, no role requirement). G3-required substrings all intact; no `user_metadata` introduced (G3 passes).
- `supabase/functions/_shared/invoice-delivery.ts`: `ensureBillingBucket` now creates `public:false`; after upload it persists the canonical **tokenless** object URL (`.../object/sign/billing-documents/<path>`) instead of `getPublicUrl()` (builder removed); email CTA repointed to the authenticated app route `${appUrl}/subscription` — the pinned email-link replacement (no magic-link infra in scope; a 60 s KYC-pattern URL was correctly ruled unusable in email). Display-field `user_metadata` reads preserved (G4 finding string intact).

### Frontend (document-service consumers only)
- `frontend/src/services/subscriptionApi.ts`: `invoicesApi.getSignedUrl(invoiceId)` via `functions.invoke('invoice-view')`; `downloadPdf` repointed to mint a fresh signed URL (never opens stored `pdf_url`).
- **NEW pinned module `frontend/src/services/tripPhotoUrl.ts`**: `resolveTripPhotoUrl(url)` extracts the object path from the stored full-URL reference and mints a fresh **60 s** signed URL (in-session TTL).
- `frontend/src/pages/SubscriptionPage.tsx`: download handler mints a signed URL on click; falls back to the existing local `downloadInvoiceFallback` when minting fails.
- `frontend/src/pages/DriverTripPage.tsx`: uploads persist the tokenless canonical URL (still accepted by `is_job_trip_photo_url`); persisted photos are re-signed for display (upload preview remains the local data URL).
- `frontend/src/pages/TrackingPage.tsx`: customer stakeholder read re-signs both photo references before render.
- `frontend/src/services/subscriptionApi.test.ts`: `functions.invoke` mock added; downloadPdf tests updated; 3 new getSignedUrl tests.

### Harnesses (strengthening only; every previously-green case name still passes unmodified in meaning)
- **dispatch**: FINDING blocks at 476/507 → cases 4b (authenticated valid assignment SUCCEEDS) and 5b (service + authenticated cross-agency denial AND same-agency duplicate denial, `n===1` residual check; dead cleanup write removed); case 11a now proves the consent predicate (denied without authorization → service stand-in seeds → succeeds) and shipment2/3 blocks seed stand-in consents (commented as TO-143 producer stand-in); case 26 flipped to the private-bucket contract (bucket flags + uploader read + customer/agency stakeholder reads + non-stakeholder and anon denials); section I converted to unconditional `expectError` hard denials (34: foreign claim + derived offer + zero B rows; 35: suspended INSERT + suspended UPDATE denied while own read preserved, denial attributed to status via pre-seeded authorization); case 33 trucks count 1→2 (new fixture truck, exact count kept).
- **customer**: case 15 upgraded to expect `EXECUTE=false` explicitly (fork deleted); case 23 upgraded to own-call positive control + `expectError('Usage and plan RPCs are caller-bound...')` on foreign `increment_usage`/`get_user_plan` + hard `delta===0`.
- **admin**: A7 rewritten to require all three buckets `public=false`; new A8 case (anon zero, billing owner/foreign/admin reads, trip-photo stakeholder/driver/admin reads with job-scoped + legacy fixtures); B6 flipped to all-private; new G7 source-level case (invoice-view `createSignedUrl` + `INVOICE_SIGNED_URL_EXPIRES_SECONDS = 300`, no `getPublicUrl` in invoice-delivery, SubscriptionPage uses `getSignedUrl`) explicitly labelled NOT an HTTP/Storage round-trip. A5 and G4 left reproduced and unweakened.

### Round-1 verification (all run in that session, from repo root)

| Command | Result |
|---|---|
| `node scripts/dispatch_delivery_journey.db.test.mjs` | **39/39 cases passed, exit 0** (baseline was 35/35 + 6 findings; all 4 in-scope FINDINGs are now hard passing cases) |
| `node scripts/customer_journey_isolation.db.test.mjs` | **26/26 cases passed, exit 0** (baseline 25/25 + 3; both in-scope FINDINGs hardened) |
| `node scripts/admin_rls_proof.db.test.mjs` | **55/55 cases passed, exit 0** (baseline 53/53 + 4; A4 fork auto-cleared `unpinned(0): none`; A7 converted) |
| `node scripts/trip_transition_integrity.db.test.mjs` | **21/21 cases passed, exit 0** (migration-chain regression sweep) |
| `npm --prefix frontend run test:unit` | **553/553 passed, 38 files, exit 0** (baseline 551; +5 new/updated tests net) |
| `npm --prefix frontend run lint` (`--max-warnings 0`) | exit 0 |
| `npm --prefix frontend run build` | exit 0 (tsc + vite, PWA precache 87 entries) |
| `npm run test:packing` | **18/18 checks passed**, exit 0 |
| `npm run test:server-routing` | **15/15 passed, 0 failed**, exit 0 |
| `npm run glue:check` | **GLUE SEALED — 0 gaps, 0 warnings**, exit 0 |
| `node --test scripts/launch_gate_policy.test.mjs` | 14/14, exit 0 |
| `node --test scripts/payment_readiness_policy.test.mjs` | 1/1, exit 0 |
| `node --test scripts/production_config_policy.test.mjs` | 37/37, exit 0 |
| `node --test scripts/security_boundary_policy.test.mjs` | 2/2, exit 0 |
| `node --test scripts/deployment_safety.test.mjs` | 4/4, exit 0 |

**Not run (environment-gated, pre-existing):** `node --test scripts/atomic_job_offer_response.rls.test.mjs` fails at startup with `FAIL: local API keys not found. Start the disposable stack: npx supabase start` — it requires the disposable Supabase stack and Docker is not installed on this machine (documented in the harness headers; fails identically before touching any migration — the check exits on the env probe, before any migration replay). This is not a regression from this change.

### Round-1 evidence classes (labelled honestly)
- DB harnesses: PGlite WASM = PostgreSQL 18.3 vs `supabase/config.toml` pin 17; real RLS/triggers/definer RPCs, `SET ROLE authenticated` + `request.jwt.claims` exactly as PostgREST does.
- Edge functions (portal-auth.ts, invoice-delivery.ts, invoice-view): **source-level only** (no Deno runtime locally); G3/G4/G7 source assertions + SQL replication. No HTTP/Storage round-trip, no browser run, no deployed behavior proven.
- Signed-URL expiry asserted at source level (G7, driver-kyc pattern); issued signed URLs are not revocable before expiry.

### Round-1 findings still open at that time (round 2 resolved items 1-2; items 3-5 remain)
1. `dispatch_job_to_drivers` producer missing (dispatch FINDING + customer FINDING 26, both hard-asserting non-existence) — TO-143.
2. No server-side delivery→shipment/agency_job status propagation (dispatch FINDING, `expect` at case 27) — TO-143.
3. Admin A5: `production_setup_status` anon-readable aggregate view (P3, owner decision per 026-result §5) — untouched.
4. Admin G4: invoice-delivery.ts reads `user_metadata` for display fields only (P3, TO-148) — string preserved intentionally.
5. Pre-existing flag: DriverRegisterPage.tsx:88 `getPublicUrl` against the already-private driver-docs bucket (stale consumer; not repaired in this slice).

### Round-1 owner gates / notes
- No hosted rollout, `supabase db push`, credentials, or payments — none performed. Migration is local authoring only; deployment replay is owner-gated.
- Pinned decisions recorded for review: duplicate-truck rule (global one-truck-per-driver, new `'Driver is already assigned to another truck.'` error); consent producer = TO-143 dispatch pipeline (harness service stand-in); email link = authenticated `/subscription` route; TTLs 300 s (invoices) / 60 s (trip photos); signed-URL revocation requires object deletion/key rotation.
- Untracked pre-existing paths untouched: `.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup/`, `closeout-logs/`. Nothing committed; `git status` shows exactly the scoped modified/new files plus those pre-existing untracked paths.

### Round-1 next-smallest task (superseded by round 2)
TO-143: implement the booking dispatch producer (`dispatch_job_to_drivers`) + server-side delivery→shipment/agency_job status propagation, producing `shipment_agency_consents` rows in the pipeline (the consent table this slice shipped is its persistence contract).

---

## Supervisor review and integration — 2026-10-07 (TO-142-R)

Reviewed by dynamic workflow `dwfrun-5f04bd09-3eaf-4a6a-a4e5-c308f5f47e1f`: one fresh code reviewer against a 12-item charter, gates executed deterministically by the workflow itself (not subagent claims), one independent verifier per finding, one synthesizer deciding the verdict. Verdict: **READY_TO_INTEGRATE**.

### Fresh gates in this checkout (all exit 0, run by the workflow)
- dispatch journey 42/42 (0 findings); customer isolation 28/28; admin RLS 56/56 (only known G4); trip integrity 21/21
- frontend unit (exit 0; the tail did not capture the final summary line — count supported by this file's round-3 record of 553/553 and the synthesizer's 38-file check via `git ls-files`), lint (0 warnings), build incl. tsc (known PGlite/large-chunk warnings only)

### Charter review: 12/12 items verified in source
Consent predicate denies foreign-agency claim + derived offer; suspended-agency operational writes denied at DB layer; fleet guard RLS accepts valid and rejects invalid/cross-agency/duplicate assignments; producer filters approved drivers by vehicle type and does not itself create consents or reserve vehicles (TO-143 remainder); delivery propagation is single-load exactly-once; usage/plan RPCs caller-bound with own/foreign regression coverage; private buckets + server-minted signed links (invoice 300 s, trip photo 60 s) with invoice-view owner/admin auth and re-signed frontend consumers; G4 confirmed display-only; grant revocations coherent; migration quality clean; change set matches scope.

### Confirmed findings (medium, both known deferrals, independently reproduced by fresh verifiers)
1. `frontend/src/pages/DriverRegisterPage.tsx:86` — new-driver uploads to the private `driver-docs` bucket persist `getPublicUrl(path)`; the stored document reference can never load (bucket private since 20261003000000; consumers render stored URLs plainly). Pre-existing, not a TO-142 regression; document-consumer follow-up.
2. `supabase/migrations/20261006120000_tenant_authority_repair.sql:382` — consent-gated `agency_jobs` has no production writer of `shipment_agency_consents` until TO-143 (only the harness service stand-in; the 20261006130000 producer creates job_offers only). Fails closed: after deployment no production path can create agency jobs; pre-consent rows lose the authenticated UPDATE path (Edge service-role updates at agency-portal-jobs continue). Documented deferral.

### Not covered (honest limits)
Hosted GoTrue/PostgREST/Storage/Edge HTTP round trips; real device/browser behavior; signed-link revocation under live access changes; mobile/desktop rendering. All TO-153 owner gates.

### Integration
Committed to `main` as d26e8c90 (16 files: 10 modified + 6 new, including this file); board updated (TO-142/TO-142-R DONE; TO-143 and TO-144 READY per their briefs' single dependency). Untracked pre-existing paths (`.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`) untouched.
