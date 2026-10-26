# TO-143-D2 revised contract draft — agency dispatch reservations (revision 2)

## 0. Status

AWAITING_REVIEW. This draft supersedes the 2026-10-25 pre-edit plan pinned at `agent-results/033-result.md:182-281` and answers the Codex NEEDS_CHANGES verdict on that plan (requirements R1-R8 from that verdict are applied here in substance). The deterministic fleet-clock repair of delivery 0 (TO-155) was accepted separately; TO-143-D2 implementation is NOT authorized by this document. Nothing in this plan has been implemented; every file named in it is to be created or edited only after a reviewer accepts this revision. Proof tiers used throughout: PGlite = in-process supporting evidence (single backend, no HTTP/GoTrue surface); HOSTED HTTP and PHYSICAL DEVICE tiers are absent and owner-gated; no tier of this plan is "verified" beyond what was actually run.

## 1. Scope fences (revised per R1)

The D2 fence now INCLUDES the legacy write paths. Every reachable mutation of agency assignment state must preserve invariants I1-I6 (§2).

| Reachable path | D2 disposition | Why |
|---|---|---|
| NEW `agency_dispatch_job_assignment` / `agency_dispatch_cancel_assignment` / `agency_dispatch_candidates` / sweep | D2 delivers them, invariant-complete | The slice itself |
| Legacy Edge `agency-portal-jobs` `update-status` + `assign-driver` (supabase/functions/agency-portal-jobs/index.ts:97-123, :125-154) | **SUPERSEDED in D2: handlers removed from the function; `list` kept** | Deferral is NOT safe: service-role BYPASSRLS with no consent re-check, arbitrary client status strings (index.ts:27-35, :112-115), no reservation/offer/active-trip awareness, fetch-then-write TOCTOU (:98-110 then :112-115) — while this command exists alongside, any caller of the old action violates every invariant. Removal is smaller than reimplementing the command in Deno. `assignable-drivers` is already rejected by `parseRequestBody` (index.ts:45-46) while AgencyJobsPage.tsx:187 sends it — the read drift is repaired by the new candidates RPC |
| Broadcast producer `dispatch_job_to_drivers` (20261006130000:47-108) | REUSED byte-unchanged; enforced at the accept transition by the new per-shipment partial unique (§2 I1) | It writes pending offers only (:98-104), never agency_jobs; consent-free fan-out and missing active_job_id check are real but are fenced at the only point they can become commitments — offer acceptance |
| `respond_to_job_offer` (20261003010000) | REUSED byte-unchanged; the DB-level per-shipment partial unique fires inside its accept UPDATE transaction | Stronger than a pre-check (no TOCTOU); keeps one offer state engine (roadmap:217). Raw constraint failure on the second accept is acceptable: the invariant is the contract; the unmapped-error redaction convention applies |
| `persist_driver_job_offer_progress` + delivery propagation (20261004000000; 20261006130000:117-146) | REUSED byte-unchanged | Sole delivered writer family; reservation release hooks it via the release trigger (§6) |
| Consent grant/revoke RPCs (20261007120000:106-275) | REUSED byte-unchanged; NEW revocation release trigger in the D2 migration (§5) | RPCs untouched; the trigger adds the release behavior R4 requires |
| Agency direct `createJob` (agencySupabaseApi.ts:204-216) | REUSED; RLS already enforces owner+consent+operational (20261006120000:382-397) | Creates 'pending' rows only; per-shipment winner is enforced at assignment time, not at job-record creation |
| Customer direct shipment status writer (customerSupabaseApi.ts:256-269) | REUSED byte-unchanged; outside the R1-named set; interplay recorded (§5 D2/D3 boundary) | Customer-owned surface; the customer's hard stop for a live reservation is consent revocation (§5) |
| Dead driver job_offers writer (customerSupabaseApi.ts:579-595) | DEFERRED, safe: zero callers (grep) and authenticated UPDATE privilege revoked (20261004000000:486) | Fail-closed even if ever called; deleting it is hygiene for a later delivery |

Edge handler removal is an in-repo code change; the deployed Edge function keeps serving old handlers until owner-gated redeploy (§13). Redeploy before/with the migration is an explicit deployment step in the task brief.

### End-to-end flow (A-E revised from the 033 flow map)

**A. AGENCY ASSIGNMENT PATH (the D2 slice — revised):** AgencyJobsPage.tsx assign flow rewired from the legacy Edge `assignDriver` (033: A1-A2; AgencyJobsPage.tsx:215-220) to `agencyDispatchApi.dispatchAssignment(jobId, vehicleId, driverId, expectedVersion, idempotencyKey)` over the NEW RPC; the driver list source switches from the dead `assignable-drivers` action (AgencyJobsPage.tsx:187 → agencyPortalApi.ts:349-372, rejected at index.ts:45-46) to the new candidates RPC; vehicle+driver are chosen together so type/capacity are validated server-side before any write. The three manual status buttons are rewired/removed (§12). Envelope mapping follows mapVehicleCommandEnvelope (agencyPortalApi.ts:542) and isAgencyDenial (:239).

**B. DRIVER OFFER PATH (reused, byte-unchanged):** DriverDashboardPage.tsx:392 → respondToJobOffer (customerSupabaseApi.ts:808-831) → respond_to_job_offer (20261003010000) — unchanged; the new per-shipment partial unique fires inside its accept UPDATE when a second driver tries to commit the same shipment (§2 P9). Controlled-message map (customerSupabaseApi.ts:704-714) is untouched; the second accept's constraint failure surfaces as a redacted generic error.

**C. DELIVERED PROPAGATION (reused, byte-unchanged):** persist_driver_job_offer_progress (20261004000000) → trg_job_offers_delivery_propagation → propagate_trip_delivery_status (20261006130000:117-146) sets shipments + agency_jobs delivered exactly-once; active_job_id clears (20261004000000:397-403); the release trigger frees the reservation on the same 'delivered' status change.

**D. CONSENT GATE (reused + new release):** shipment_agency_consents (20261006120000:322-332; revocation-only 20261007120000:52-62); the definer commands re-verify consent in-body; the NEW revocation release trigger cancels pending targeted offers on NULL→set revoked_at (§5).

**E. EXISTING BATTERIES (extended only):** scripts/dispatch_delivery_journey.db.test.mjs (52/52) and scripts/trip_transition_integrity.db.test.mjs (21/21) get compatibility/new-case sections; NEW scripts/agency_dispatch_reservations.db.test.mjs mirrors the 034 pattern (full-chain PGlite replay, actAs() role switching, catalog introspection) with the honest concurrency header (§9).

## 2. Reservation invariants I1-I6 and enforcement table

- **I1 one winning assignment per shipment**: at most one agency assignment (accepted/in_transit agency_jobs row) and at most one committed offer (accepted-or-later job_offers row) per shipment. Future multi-load allocation stays out (TO-145/146).
- **I2 vehicle exclusion**: one active reservation per vehicle; vehicle not maintenance-blocked/expired/unavailable.
- **I3 driver exclusion**: one active reservation per driver; no driver commitment conflict (drivers.active_job_id IS NULL, 20260416010000:94).
- **I4 active consent**: every agency-side mutation re-verifies `revoked_at IS NULL` inside the definer body (policy parity, 20261006120000:382-421); revocation releases pre-acceptance state (§5).
- **I5 eligibility + type + capacity**: server-side predicates only (20261008000000:394-439), plus vehicle-type equality and payload check (§8).
- **I6 idempotent replay**: command_key UNIQUE + payload fingerprint; replay returns the recorded result with no second write.

Enforcement table (P = path; DB = hard DB authority; typed = controlled denial):

| Path (mutation) | I1 winner | I2/I3 exclusion | I4 consent | I5 eligibility | I6 replay |
|---|---|---|---|---|---|
| P1 assignment command (new) | typed pre-check (no accepted-or-later offer on shipment, 20261006130000:95 set; no other agency_jobs accepted/in_transit row for shipment) + partial UNIQUE agency_jobs(shipment_id) WHERE status IN ('accepted','in_transit') (new) | partial UNIQUE reservations(vehicle_id/driver_id) WHERE status='reserved' (new) + drivers.active_job_id typed check (:117-119 parity) | re-verified in body | both D1 predicates + agency-owned vehicle + type/capacity (§8) | command_key + fingerprint |
| P2 cancel command (new) | n/a (releases) | n/a (releases) | re-verified in body | agency-owner only | command_key + fingerprint |
| P3 candidates RPC (new, read) | n/a | filters out reserved/committed resources | read-gated | D1 predicates + type/capacity filters server-side | n/a |
| P4 sweep (new) | n/a | releases via offer status change | n/a | n/a | idempotent by predicate (status='pending' AND expires_at<=now()) |
| P5/P6 legacy Edge update-status / assign-driver | REMOVED in D2 | — | — | — | — |
| P8 broadcast producer (reused) | offers only; I1 bites at P9 | none needed (no commitment) | unchanged behavior (recorded gap; consent gates agency work, not customer broadcast) | unchanged CTE (:85-96) | re-dispatch after terminal offers re-fans-out — unchanged, recorded |
| P9 respond_to_job_offer (reused) | partial UNIQUE job_offers(shipment_id) WHERE status IN ('accepted','pickup_arrived','in_transit','delivery_arrived') (new) — the cross-driver/cross-agency race is closed at the accept write | drivers.active_job_id (:117-119) + offer FOR UPDATE/driver FOR UPDATE (:66-82) | unchanged (recorded gap: no consent read; D3 tail) | driver approval (:84-86) | built-in replays (:97-107, :136-143) |
| P10 persist progress (reused) | per-offer only; I1 already settled | active_job_id cleared on delivered only (20261004000000:397-403) | unchanged (recorded gap) | OTP-gated transitions | replay no-ops (:191-229) |
| P11 propagation trigger (reused) | sets delivered exactly-once (:124) | frees vehicle/driver via release trigger on 'delivered' | unchanged | n/a | exactly-once guards (:124, :129, :135) |
| P12 consent grant/revoke (reused) + NEW revocation trigger | releases pre-acceptance reservation via offer cancel | releases reservation | the invariant itself | n/a | revoke is idempotent no-op when inactive (:254-262) |
| P13 agency createJob (reused) | creates 'pending' row only; winner set at P1 | n/a | RLS policy (:382-397) | RLS operational check | UNIQUE(agency_id, shipment_id) (20260305011000:20) |
| P14 customer shipment writer (reused) | not fenced; commands re-validate shipment state at every touch | n/a | n/a | n/a | n/a |
| P15 dead driver writer | unreachable (privilege revoked, 20261004000000:486) | — | — | — | — |

Where this table goes beyond the analyst surface map it is design intent, not evidence: the two per-shipment partial uniques, the per-job reservation unique, the type/capacity checks, and the sweep are NEW objects in the D2 migration; their absence today is the map's verified finding (no partial unique on job_offers or agency_jobs.shipment_id anywhere; agency_jobs has no version column, 20260305011000:3-21).

R2 single-load enforcement across the three commit shapes (each verified as a live hole in the surface map, each closed by the D2 objects):

- (a) different agencies: today UNIQUE(agency_id, shipment_id) is per-agency (20260305011000:20) and both agencies can hold active consent, so two non-terminal agency_jobs rows for one shipment commit freely — closed by the assignment command's shipment-winner pre-check plus partial UNIQUE agency_jobs(shipment_id) WHERE status IN ('accepted','in_transit') (fires at the winning write, race-proof).
- (b) broadcast offers: dispatch_job_to_drivers checks neither consent nor agency_jobs nor other offers (20261006130000:85-96), and respond_to_job_offer checks neither agency_jobs nor sibling offers on the shipment (20261003010000:63-160), so a broadcast accept and an agency assignment can both commit today — closed at the only commitment points: the broadcast accept hits partial UNIQUE job_offers(shipment_id) WHERE accepted-or-later inside the accept UPDATE; the assignment command's winner pre-check rejects any shipment with an accepted-or-later offer.
- (c) agency-targeted offers: the targeted offer is a normal job_offers row accepted through the unchanged respond path; the same partial unique and the reservation/job uniques apply; the agency command denies acquiring when a non-terminal offer already exists for (shipment, driver) (producer parity, 20261006130000:90-96) and when the driver/vehicle are committed or reserved.

## 3. Authoritative state (delta of the 033 plan §Authoritative state)

Items 1-3, 5-8 stand verbatim from 033-result.md:209-220 (caller agency via resolve_caller_agency_id 20261008000000:356-388; operationality 20261006120000:121-134; consent revocation-only 20261007120000:52-62; eligibility predicates 20261008000000:394-439; driver commitment 20261003010000:117-119; offer lifecycle/expires_at 20260305000000:108). Deltas:

4. JOB (revised): agency_jobs gains `version integer NOT NULL DEFAULT 1` + BEFORE UPDATE bump trigger (single-bump fleet pattern, 20261008000000:207-223) — the expected-version authority. Status CHECK unchanged (20260305011000:19). UNIQUE(agency_id, shipment_id) (:20) remains the per-agency settlement key, NOT a winner key.
9. RESERVATION (revised): new `agency_resource_reservations(id, command_key uuid UNIQUE NOT NULL, payload_fingerprint, agency_id, shipment_id, job_id, vehicle_id, driver_id, offer_id REFERENCES job_offers(id), status CHECK IN ('reserved','released') DEFAULT 'reserved', released_reason, created_at, released_at)` with partial UNIQUE indexes on (vehicle_id), (driver_id), and (job_id) WHERE status='reserved'. The indexes are the hard exclusion authority; command_key+fingerprint is the replay authority (§4, pin of old contract 6).
10. SHIPMENT (revised): `shipments.status='pending'` enforced by both new mutating commands (producer parity 20261006130000:76-83; pin of old contract 4). `shipments.vehicle_type` (nullable, 20260418001000:4) compared for equality when NOT NULL (§8). `shipments.total_weight DECIMAL(10,2)` (20260212000000:77) used for capacity (§8).
11. NEW winner keys (decisive): partial UNIQUE `job_offers(shipment_id) WHERE status IN ('accepted','pickup_arrived','in_transit','delivery_arrived')` and partial UNIQUE `agency_jobs(shipment_id) WHERE status IN ('accepted','in_transit')`. These, not the typed pre-checks, are what two concurrent transactions ultimately hit.
12. NEW deliberate reconciliation: the agency_jobs driver guard trigger's eligibility source is rewritten from the legacy fleet binding `driver_is_assigned_to_agency` (20261006120000:106-119) to `agency_driver_allocation_eligible` (20261008000000:419-439) via CREATE OR REPLACE in the D2 migration. Rationale: the binding served the legacy Edge assign-driver path removed in the same slice; keeping it would fail every employment-model assignment the command writes (trg_agency_jobs_driver_assignment fires on UPDATE OF driver_id even from service role, 20261006120000:270-274, body :239-268). The agency_trucks trigger (trg_agency_trucks_driver_assignment, :233-237) is untouched. This is a deliberate model reconciliation the surface map flags as required — supervisor confirmation requested.

## 4. Command contracts

1. `public.agency_dispatch_job_assignment(p_job_id uuid, p_vehicle_id uuid, p_driver_id uuid, p_expected_version integer, p_idempotency_key uuid) RETURNS jsonb` — SECURITY DEFINER, SET search_path=public, REVOKE FROM PUBLIC/anon, GRANT authenticated (20261007120000:213-214 convention).
2. Success: `{ok:true, state:'assigned'|'idempotent_replay', job:{id,version,status,driver_id,truck_id}, reservation:{id,status:'reserved'}, offer:{id,expires_at}}`. Replay of same key + identical fingerprint (job_id, vehicle_id, driver_id) returns the recorded result with NO second write; same key + different fingerprint → `{ok:false, error:'conflicting_idempotency_key'}`, zero change.
3. `public.agency_dispatch_candidates(p_job_id uuid) RETURNS jsonb` — read RPC; runs the sweep (§6) for the job's shipment, verifies ownership+consent, returns agency-owned vehicles/drivers filtered server-side by the D1 predicates, type/capacity, and reservation/commitment exclusion. UI never gates eligibility client-side.
4. `public.agency_dispatch_cancel_assignment(p_job_id uuid, p_expected_version integer, p_idempotency_key uuid) RETURNS jsonb` — agency-owner cancel (pin of old contract 3): permitted only while the targeted offer is still 'pending' (non-terminal job, no driver commitment); writes agency_jobs.status='cancelled' + job_offers.status='cancelled' (D2 introduces this writer); the release trigger frees the reservation. Once the offer is accepted, cancellation is denied with 'An active trip is in progress for this assignment.' — only delivered (or a future D3 mechanism) ends a commitment. Rationale: no active_job_id release path exists (20261004000000:397-403 clears it only on delivered); inventing one would touch the driver state engine (fence).
5. Typed denials (extends 033 contract 4): previous list plus 'An active assignment already exists for this shipment.', 'Vehicle type does not match the shipment request.', 'Vehicle capacity is insufficient for the shipment load.', 'An active trip is in progress for this assignment.', 'This job is already completed or cancelled.' (terminal denial). All RAISE with controlled strings mapped verbatim in the service layer; unmapped internals redacted (TO-131 convention).
6. Atomic acquire (one transaction, per §7 order): sweep → lock drivers row FOR UPDATE → lock agency_jobs row FOR UPDATE → all guards (ownership, operationality, consent, pending shipment, terminal check, version CAS pre-read, eligibility, type, capacity, winner pre-checks) → INSERT targeted job_offers ('pending', expires_at now()+1h, producer parity 20261006130000:100) → INSERT reservation (command_key, fingerprint) → UPDATE agency_jobs (driver_id, truck_id, status='accepted' — pin of old contract 2 — version CAS WHERE version=p_expected_version). Any failure rolls back everything; the battery proves all-or-nothing with an injected mid-command failure.
7. Idempotency shape (pin of old contract 6): command_key UNIQUE + payload fingerprint stored ON the reservation row; no separate command-log table — consistent with the fleet header 'Expected-version is the replay guard for updates — no command-log table' (20261008000000:70-71) because the reservation IS the durable effect record of this create-style command.
8. Expected-version envelope: zero-row CAS UPDATE → re-read version → `{ok:false, error:'version_conflict', current_version:N}`, row byte-identical (fleet pattern 20261008000000:559-597); version bumped exactly once per UPDATE by the new trigger.
9. Read/auxiliary shapes: candidates → `{ok:true, job:{id,version,status}, vehicles:[...], drivers:[...]}` with server-side eligibility/type/capacity/reservation filtering and per-candidate block reasons (the UI renders reasons; it never gates eligibility itself); sweep → `{ok:true, expired:n}`.

## 5. State machine, consent revocation, D2/D3 boundary

Transition table (actor/path per §2; every row's side effects are in-transaction):

| Entity | From | Event (path) | To | Side effects |
|---|---|---|---|---|
| agency_jobs | pending | assignment succeeds (P1) | accepted | driver_id/truck_id set, version+1, targeted offer + reservation created |
| agency_jobs | accepted | cancel succeeds (P2, offer still pending) | cancelled | targeted offer → cancelled, reservation released |
| agency_jobs | pending or accepted | propagation delivered (P11) | delivered | exactly-once; reservation released via release trigger |
| agency_jobs | delivered or cancelled | P1/P2 attempt | unchanged | typed terminal denial |
| job_offers (targeted) | pending | driver accept (P9) | accepted | drivers.active_job_id=offer; reservation stays 'reserved' |
| job_offers (targeted) | pending | driver decline (P9) | declined | reservation released |
| job_offers (targeted) | pending | sweep or lazy respond check (P4/P9) | expired | reservation released |
| job_offers (targeted) | pending | cancel command or revocation trigger (P2/P12) | cancelled | reservation released |
| job_offers | accepted | persist steps (P10) | pickup_arrived → in_transit → delivery_arrived → delivered | OTP-gated; on delivered: active_job_id NULLed, total_trips+1, propagation fires, reservation released |
| reservation | reserved | offer reaches any of {declined, expired, cancelled, delivered} (release trigger) | released (reason=NEW.status) | vehicle/driver free |
| reservation | reserved | replayed assignment, same key + fingerprint (P1) | unchanged | recorded result returned, no write |

- agency_jobs: `pending` → `accepted` (assignment command) → `delivered` (propagation, exactly-once 20261006130000:131-135) or `cancelled` (cancel command, pending-offer-only). `pending|accepted` → `cancelled`. `delivered|cancelled` are terminal: both commands deny them ('This job is already completed or cancelled.'). No D2 writer of 'in_transit' on agency_jobs exists — offer-to-job progress sync is D3 (pin of old contract 2, second half).
- job_offers (targeted): `pending` → `accepted` (respond) → `pickup_arrived` → `in_transit` → `delivery_arrived` → `delivered` (persist, OTP-gated); `pending` → `declined` (respond) | `expired` (sweep or lazy respond check 20261003010000:88-92) | `cancelled` (cancel command or revocation trigger).
- reservation: `reserved` → `released` with released_reason = the offer's terminal status, via the release trigger AFTER UPDATE OF status ON job_offers for {declined, expired, cancelled, delivered} (033 contract 6 stands); 'accepted' keeps it active; no-op when no reservation exists (producer offers unaffected).
- Consent revocation behavior (R4): revoke_agency_for_shipment (20261007120000:254-262) stays byte-unchanged; a NEW trigger AFTER UPDATE OF revoked_at ON shipment_agency_consents (fires only on NULL→set transition) cancels the pair's PENDING targeted offers (status='cancelled'), which releases their reservations through the existing release trigger. Accepted/committed offers are NOT released (commitment rule above); the agency_jobs row is not auto-cancelled; post-revocation assignment/cancel attempts are denied by in-body consent re-verification ('Agency consent for this shipment is not active.'). Recorded residual gap (unchanged): the driver path never reads consent, so an already-committed trip continues after revocation — same family as the recorded revocation findings (consentRevokeEffects); D3 tail.
- Authorized cancellation = agency owner only (resolve_caller_agency_id + agency_jobs.agency_id match); no admin arm in D2 (admin bypass remains trigger-level only, 20261006120000:242-244).
- Idempotent retries: same command_key → recorded result, no second write, no second offer, no version bump. Replay responses after a reservation becomes terminal: assignment replay returns the recorded assigned state verbatim (the reservation row records it); respond/persist replay semantics are the existing built-in ones (20261003010000:97-107, :136-143; 20261004000000:191-229).
- **D2/D3 boundary (R8)**: D2 touches terminal states ONLY by refusing them (typed terminal denials) and by reaching 'cancelled' from non-terminal state. No terminal-status cutoff is added to consent (revocation-only invariant 20261007120000:52-62 stands); the customer's arbitrary-order status writer is byte-unchanged. Consequence recorded as D3 scope: a customer can re-open a terminal shipment or leave consent active on a terminal shipment; stale pending offers on terminal shipments remain sweepable (time-expired hygiene, releases nothing live). The stale-offer-after-terminal-shipment accept window is the same root cause as the consent terminal cutoff and is fenced to D3 with it — D2's per-shipment accepted-set unique covers the live-shipment double-commitment race, which is the reachable D2 hole.

## 6. Expiry and release rules (R3)

- Server-authoritative: expires_at is set by the server (producer parity now()+1h, 20261006130000:100); respond-time lazy rejection stands (20261003010000:88-92); nothing assumes a trigger fires when time passes (verified this session: no migration or function writes status='expired'; no pg_cron/pg_net/scheduled job exists; the only Edge job_offers references are admin-portal-dashboard reads).
- Explicit cleanup: `public.agency_dispatch_sweep_expired(p_job_id uuid) RETURNS jsonb` (authenticated, SECURITY DEFINER, ACL convention) transitions `status='pending' AND expires_at<=now()` offers OF THAT SHIPMENT to 'expired' — including producer-created broadcast offers (a deliberate, tested new writer; they are time-expired by definition and their release-trigger is a no-op). It is invoked internally at the start of the assignment and candidates commands for the touched shipment (R3: "callable by assignment/candidate commands") and is exposed standalone for ops.
- Accepted commitments never expire as pending offers: the sweep predicate matches ONLY status='pending'; accepted/pickup_arrived/in_transit/delivery_arrived rows are untouchable by it; respond's expiry check applies only to pending rows (:88-92).
- Release is exactly-once via OLD.status IS DISTINCT FROM NEW.status; delivered release aligns with active_job_id clearing (20261004000000:397-403), so vehicle and driver free on trip completion.

## 7. ONE lock order (R4/R7)

Canonical existing-row lock order, derived from the analyst lock-order inventory and verified in code: **shipment_agency_consents → job_offers → drivers → shipments → agency_jobs → agency_resource_reservations**.

Per-writer acquisition sequences (every row must be a subsequence of the chain):

| Transaction | Sequence |
|---|---|
| respond_to_job_offer | job_offers → drivers (20261003010000:66-82) |
| persist_driver_job_offer_progress | job_offers → drivers → shipments → agency_jobs (20261004000000:141-189, :397-403) |
| propagate_trip_delivery_status (inside persist) | shipments → agency_jobs (20261006130000:125-135) |
| assignment command | drivers → agency_jobs (offers/reservations are INSERT-only: new-row locks no concurrent transaction can hold pre-commit) |
| cancel command | job_offers → agency_jobs → reservations (release trigger) |
| revocation release trigger | consent row → job_offers → reservations (no other path locks consent rows) |
| sweep | job_offers → reservations (release trigger) |
| legacy Edge writers | removed in D2 (formerly: no explicit locks, fetch-then-write as two autocommit transactions, index.ts:98-115, :125-154) |

Deadlock argument: every pair of participating transactions takes their common locks in the same relative order (notably drivers-before-agency_jobs everywhere, and job_offers-before-agency_jobs everywhere), so no cycle is reachable. The command must NOT lock agency_jobs before drivers — that ABBA against persist's driver-then-agency_jobs tail is exactly the risk the 033 plan's order (agency_jobs first) carried; this revision fixes it.

## 8. Preconditions before reservation acquisition (R5)

Each enforced inside the command body, in order, after the sweep and row locks:

1. Active consent for (shipment_id, caller agency), revoked_at IS NULL — in-body re-verification (policy parity 20261006120000:382-421; definer bypasses RLS).
2. Operational agency — agency_is_operational (20261006120000:121-134); 'Agency approval is required.'
3. Pending dispatchable shipment — shipments.status='pending' (producer parity 20261006130000:76-83); 'Shipment is not open for dispatch.'
4. Eligible employment and vehicle — agency_driver_allocation_eligible + agency_vehicle_allocation_eligible (20261008000000:419-439, :394-417) + vehicle owned by the caller agency; NULL expiry never blocks (D1 parity).
5. Requested vehicle-type compatibility — agency_trucks.vehicle_type = shipments.vehicle_type when shipments.vehicle_type IS NOT NULL (nullable, 20260418001000:4); mismatch denies; NULL requested type does not block (documented). Pin of old contract 8, part 1.
6. Server-side capacity validation — shipments.total_weight (kg, 20260212000000:77) ≤ agency_trucks.payload_kg (kg, 20261008000000:170); NULL payload_kg does not block (NULL-does-not-block parity, recorded); the legacy drivers.vehicle_capacity (tonnes, 20260305000000:21) is excluded for unit mismatch. Pin of old contract 8, part 2: capacity pair is total_weight ↔ payload_kg.
7. Winner-free exclusion state — no accepted-or-later offer on the shipment (20261006130000:95 status set), no other agency's accepted/in_transit agency_jobs row for the shipment, drivers.active_job_id IS NULL, vehicle and driver reservation-free; hard backstops are the three partial unique indexes (§3 item 11, §3 item 9).

## 9. Concurrency acceptance tiers (R6)

- PGlite (@electric-sql/pglite 0.5.8, single embedded backend, no second connection — dispatch battery header, scripts/dispatch_delivery_journey.db.test.mjs:24-26) is SUPPORTING evidence only: catalog introspection (both per-shipment partial uniques, the three reservation uniques, version triggers exist), sequential contention (second command for the same vehicle/driver/shipment fails with typed denial or clean unique violation), version-CAS semantics, lock-order code review, atomicity via injected mid-command failure.
- Real concurrency acceptance stays OPEN until separate PostgreSQL sessions exercise OVERLAPPING transactions (two sessions holding row locks, a blocked second session, snapshot-isolation races at the partial uniques and the CAS). Until then the record carries **CONCURRENCY_NOT_VERIFIED** for true overlap — carried from 033-result.md:264, whose environment findings (no Docker/Podman, no native PostgreSQL on this machine; exact commands recorded there) stand and were NOT re-run in this session.
- No claim in this plan may cite PGlite results as overlap proof.

## 10. Allowed files / new files (writer scope, revised per R1)

Allowed (edits):
- supabase/functions/agency-portal-jobs/index.ts (NEW in scope: remove update-status + assign-driver handlers; keep list)
- frontend/src/pages/AgencyJobsPage.tsx
- frontend/src/services/agencyPortalApi.ts
- frontend/src/services/agencyPortalApi.test.ts
- frontend/src/types/database.types.ts
- scripts/dispatch_delivery_journey.db.test.mjs
- scripts/trip_transition_integrity.db.test.mjs
- docs/design-audit.md
- TASKS.md
- agent-results/033-result.md (supersession pointer only)

New files (planned; none created):
- supabase/migrations/20261025000000_agency_dispatch_reservations.sql (version column+trigger on agency_jobs; reservation table + three partial uniques; two per-shipment partial uniques; assignment/cancel/candidates/sweep RPCs; release trigger; revocation release trigger; guard-trigger eligibility reconciliation)
- scripts/agency_dispatch_reservations.db.test.mjs

## 11. Regression scenarios (battery cases mapped to invariants)

Standing cases from the 033 red tests (renumbered B1-B6, unchanged in substance, now mapped to the invariants):

- B1 authorized-assignment-persisted (I1, I5, I6): operational agency A with active consent assigns its eligible vehicle+driver to its pending job → reservation 'reserved', agency_jobs.driver_id/truck_id set, status 'accepted', version bumped exactly once, one pending offer with 1h expiry; fresh re-reads return identical state.
- B2 foreign/suspended actors (I4, I5): agency B assigns A's job → fixed 'Job not found or access denied.', zero writes; suspended/pending agency → 'Agency approval is required.'; suspended driver → denial; ended employment → denial; anon EXECUTE revoked (case-44 pattern).
- B3 unavailable/expired/maintenance/committed resources (I2, I3): is_available=false, maintenance_blocked=true, maintenance_blocked_until future, expired insurance/fitness/permit/puc each deny the vehicle; expired licence denies the driver; drivers.active_job_id set denies; vehicle or driver already holding an active reservation denies; NULL dates do NOT block (D1 parity).
- B4 replay + conflicting idempotency (I6): same key + same fingerprint after success → 'idempotent_replay', exactly one reservation/offer/job write (byte comparison), no version bump; same key + different vehicle → 'conflicting_idempotency_key', zero state change.
- B5 stale version/rollback/terminal release (I6, I1): wrong p_expected_version → version_conflict envelope, byte-identical row; injected mid-command failure proves atomicity (no orphan offer/reservation, agency_jobs unchanged); decline → reservation released and resources assignable to a second job; cancel command → offer 'cancelled' + released; delivered trip → released exactly once (replay no-ops).
- B6 contention (constraint tier, honest): sequential contending assignments — second command for the same vehicle, same driver, and same shipment each fails with typed denial or clean unique violation; catalog introspection pins all three reservation uniques, both per-shipment partial uniques, and the version triggers.

New cases:

- B7 (I1, cross-driver): seed two pending offers (one targeted, one broadcast) for one shipment; accept the first via respond_to_job_offer; the second accept must fail (partial unique), first commitment intact, second driver's active_job_id unchanged.
- B8 (I1, cross-agency): agency B assigns its own job row for a shipment already accepted-assigned by agency A → typed shipment-winner denial; a direct second 'accepted' write is blocked by the agency_jobs partial unique (zero rows, byte-identical).
- B9 (I4, revocation): revoke consent with a pending targeted offer → offer 'cancelled', reservation 'released', vehicle/driver assignable to a second job; accepted-offer case → reservation retained, no release.
- B10 (R3, sweep): pending offer past expires_at → sweep (standalone and via assignment/candidates) sets 'expired' + releases; accepted offer past expires_at is NOT transitioned; producer-created broadcast offer is transitioned (deliberate new writer, asserted).
- B11 (I5, type/capacity): mismatched vehicle_type denies with the typed string; NULL shipments.vehicle_type assigns; total_weight > payload_kg denies; NULL payload_kg assigns.
- B12 (R1 legacy-path regressions): in-repo proof that no remaining writer path violates invariants — grep assertions that the Edge function no longer contains update-status/assign-driver handlers and that no migration writes agency_jobs.status outside {assignment command, cancel command, propagation}; Edge runtime behavior itself is verified only at owner-gated redeploy (§13) — stated as such, not claimed.
- B13 (compatibility): producer + propagation byte-unchanged outputs; release trigger no-ops on producer offers; trip battery transitions unchanged; stale-pending-offer sweep on a delivered shipment is permitted hygiene and releases nothing live.
- Service-layer vitest (agencyPortalApi.test.ts): typed envelopes for version_conflict, conflicting_idempotency_key, every new denial string, replay, candidates payload — red before the service methods exist.
- Gates after green: the four DB batteries + frontend lint/build/unit per the maintained gate set. HOSTED HTTP and PHYSICAL DEVICE passes remain absent and owner-gated (§13); nothing here counts as either.

## 12. UI / Stitch obligations (R7)

- The assign control set materially changes (vehicle+driver selection over the new command, conflict/denial/release states, rewiring of the three manual status buttons — 'accepted' removed because assignment sets it, 'cancelled' rewired to the cancel command, 'delivered' removed because the OTP-gated driver path is the only delivered writer). Therefore: `stitch_status` + `stitch_guide` are consulted FIRST at implementation start and their current workflow followed; `docs/design-audit.md` is updated after integration (audit-first standing rule).
- Stitch GENERATION only if the design work warrants it under the guide's rules (new vehicle-picker inside the existing /agency/jobs panel — likely no new screen; one attempt per screen, never auto-retried, journal/poll recovery on ambiguity). The 033 "mutations 0" posture is NOT carried as a pinned claim.
- Browser verification of the changed controls at mobile AND desktop widths (390x844 and 1280x900), keyboard walk on new controls, selected-Hi rendering no-crash check — same battery pattern as D1.
- No other page changes.

## 13. Unresolved external prerequisites

- Separate-PostgreSQL-session host for the overlap battery (§9): Docker/Podman/native PostgreSQL absent on this machine (recorded at 033-result.md:264 with exact commands; not re-run this session). Until provided, CONCURRENCY_NOT_VERIFIED stands and brief acceptance stays OPEN.
- TO-153 hosted inventory: hosted-DB drift is unverifiable from here; all findings are facts of the checked-in migration chain at main@9c585895; if the hosted DB has not replayed the full chain, permissive earlier states could still be live. Edge function redeploy (handler removal) and migration application are owner-gated deployment steps — no `supabase db push`, no deploy without owner authorization.
- VITE_* environment gates for browser/e2e passes remain owner-owned.
- `main` push only after tests pass; no branches/worktrees/stashes (main-only policy).

## 14. Pinned answers to the previous plan's unresolved contracts

1. Offer-expiry writer → explicit sweep (option b of the old list), called by assignment/candidates and exposed standalone; no scheduler; lazy respond-time check retained. Dictated by R3.
2. agency_jobs.status on assignment → **'accepted'**; offer-accepted→job status sync is **D3**. Rationale: one write expresses "agency dispatched"; avoids a second state engine (roadmap:217); delivered propagation remains the only other runtime writer.
3. Cancel semantics → agency-owner cancel command; target status 'cancelled'; allowed only while the targeted offer is pending; consent revocation releases pre-acceptance reservations (via offer cancel) but never releases accepted commitments (D3 tail). Dictated by R4.
4. Shipment-status guard → strict 'pending' enforced by both new mutating commands; consent-only rejected. Dictated by R5; terminal job states additionally denied in D2.
5. Legacy Edge actions → superseded in D2: update-status and assign-driver handlers REMOVED (list kept); deferral not safe (§1). Dictated by R1.
6. Idempotency shape → command_key UNIQUE + payload fingerprint on the reservation row; no command-log table (fleet header 20261008000000:70-71; the reservation is the effect record). Dictated by R4/R6 evidence conventions.
7. Blanket-producer interplay → deny when a non-terminal offer exists for (shipment, driver) (producer parity 20261006130000:90-96); the command never cancels/replaces broadcast offers; cross-driver/cross-agency races close at the per-shipment accepted-set unique. Dictated by R2.
8. Vehicle-type match → YES when shipments.vehicle_type IS NOT NULL; capacity pair = shipments.total_weight (kg) ↔ agency_trucks.payload_kg (kg); NULL payload does not block (recorded). Dictated by R5.

New pins: single-winner mechanism = two per-shipment partial unique indexes + three reservation uniques with typed pre-checks (R2); lock order = consent → job_offers → drivers → shipments → agency_jobs → reservations, fixing the 033 plan's agency_jobs-first deadlock exposure (R4); guard-trigger eligibility source reconciled to the employment model (§3 item 12 — supervisor confirmation requested); manual status buttons rewired/removed (§12); sweep intentionally transitions producer-created stale broadcast offers (§6); Edge redeploy sequencing is an explicit owner-gated step (§1, §13).

## 15. What changed vs the superseded 033 plan

- Scope fence reversed: legacy Edge update-status/assign-driver moved from "untouched" to superseded (handlers removed); Edge file now in allowed scope (old fence 9, R1).
- Winner enforcement added: two per-shipment partial unique indexes + per-job reservation unique + typed winner pre-checks — the 033 plan had per-vehicle/driver reservation uniques only and no per-shipment authority (R2).
- Lock order corrected: 033 contract 5 locked agency_jobs first; revised order is drivers → agency_jobs (and offer → agency_jobs for cancel) to match the persist family and avoid the ABBA window (R4).
- Expiry made explicit: sweep RPC called by assignment/candidates replaces the open question of old unresolved contract 1 (R3).
- Cancel command + revocation release trigger added with pending-offer-only semantics; accepted commitments not releasable in D2 (R4).
- Preconditions completed with vehicle-type equality and the total_weight↔payload_kg capacity pair (R5, old contracts 4/8 pinned).
- Concurrency language kept honest and unchanged in tier (PGlite supporting only; CONCURRENCY_NOT_VERIFIED for true overlap) (R6).
- Status wording corrected throughout: AWAITING_REVIEW, no approval claims, proof tiers stated consistently (R7).
- D2/D3 boundary drawn explicitly: terminal states refused, consent cutoff untouched, stale-offer-after-terminal-shipment window fenced to D3 (R8, old contract 4 interplay).
- All eight old unresolved contracts answered in §14; the UI posture changed from "no material UI change / mutations 0" to stitch_status+guide-first with warranted generation only (R7).
