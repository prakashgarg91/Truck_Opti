# Agency portal operations audit (2026-11-18)

Read-only static audit of the AGENCY menu items that cover operations. No code, config, or other docs were changed. Line numbers come from `grep`/`sed` reads of the current tree and may drift by a line or two.

Severity: **BREAKS** = task cannot be completed or the item is unreachable; **WRONG** = shows wrong or misleading data, or a dead path; **ROUGH** = works but is unclear, inconsistent, or incomplete.

Method limits: pages and services were read, not run in a browser. RPC and Edge function existence was checked by name in `supabase/migrations/*.sql` and `supabase/functions/`. RPC bodies, RLS on every table, and Edge function logic were not reviewed.

---

## 0. Navigation shell (applies to every item)

Source: `frontend/src/layouts/AgencyLayout.tsx`, `frontend/src/lib/agencyAccess.ts`, `frontend/src/App.tsx` 189-212.

| Menu | Entries | Where rendered |
|---|---|---|
| NAV (6) | Home, Fleet, Drivers, Jobs, Billing, Rates | Desktop sidebar (L151) and phone bottom bar (L262-280) |
| MORE_NAV (11) | Team, Clients, Orders, Load plan, Consignments, Invoices, Expenses, Tracking, Payroll, ERP, Subscription | Desktop sidebar only (L27-39, L151) |

Visibility is filtered by `canRead` (L47-48). Route rules are in `ROUTE_ACCESS` (`agencyAccess.ts` L36-55). Note: `/agency/clients/:id/tariffs` resolves through the `/agency/clients/` prefix rule (`agencyAccess.ts` L73).

**Phone access (BREAKS).** The bottom bar renders only `nav`, and the mobile header (L193-234) holds only Bell, Profile, and Sign out. Team, Clients, Orders, Load plan, Consignments, and Tracking have no tap path on a phone. The only documented workaround is typing `/agency/team` and `/agency/clients` (`docs/USER-GUIDE-AGENCY.md` L10). The guide does not mention Orders, Load plan, Consignments, or Tracking at all.

Other shell findings:
- ROUGH: Labels conflict. "Home" (L18) vs. the dashboard page. "Rates" (L23) vs. "Rate Cards" (`AgencyDashboardPage.tsx` ~L390-396) vs. "Tariffs" (page and route). "Orders" (L30) points at `/agency/orders/import`.
- ROUGH: Bell buttons (L137, L211) have only `title="New Jobs"`, no accessible name. The count only counts INSERTs (L79-86) and does not reflect status changes.
- ROUGH: Staff read-only note (L240-248) reads "Actions on this page are limited to other roles." Unclear to a staff user. Consider "You can view this page. Your role cannot make changes here."
- ROUGH: MORE_NAV is a flat list of 11 with no grouping. Ops and finance items are mixed together.

---

## 1. Home (dashboard)

- Label / route / file: **Home**, `/agency/dashboard`, `frontend/src/pages/AgencyDashboardPage.tsx`. Read and act: ALL (`agencyAccess.ts` L37).
- Data path: `agencyDashboardApi.snapshot` calls Edge function `agency-portal-dashboard` (`services/agencyPortalApi.ts` L384-386). Function exists: `supabase/functions/agency-portal-dashboard/index.ts`.
- Buttons: Fleet card (L350), Quick actions (View Jobs, Manage Fleet, Billing, Rate Cards; ~L369-396), "Set up" CTAs. All navigate only. No write action on this page.

Issues:
- WRONG: `AgencyDashboardPage.tsx` L143, L201, L208. The device-local branch (no Supabase) sends users to `/local-start`, `/management/trucks`, and `/management/cartons`, which are non-agency pages. Not reachable from cloud agency accounts today, but a wrong path.
- ROUGH: L350-356. The Fleet card is a `div` with `onClick` and no `role`, `tabIndex`, or key handler. Keyboard users cannot reach it.
- ROUGH: Quick actions (L369-396) cover Jobs, Fleet, Billing, Rates only. A dispatcher's daily flow (orders, load plan, consignments, tracking) has no entry point here.
- ROUGH: Error state with retry exists (L220-232). Good. Loading state is a bare spinner (L122-127), with no text.

Journey gaps: no operational counts (open orders, active jobs, GRs awaiting delivery, open incidents). No "needs attention" list. Unknown whether the snapshot payload already carries these counts; verify before building.

---

## 2. Jobs

- Label / route / file: **Jobs**, `/agency/jobs`, `frontend/src/pages/AgencyJobsPage.tsx` (712 lines). Read: ALL. Act: dispatcher (`agencyAccess.ts` L41).
- Data path:
  - List: `agencyJobsApi.list` to Edge function `agency-portal-jobs` (`agencyPortalApi.ts` L421). Exists.
  - Drivers for assign modal: Edge function `agency-portal-jobs` (L461). Exists.
  - Assign: RPC `agency_job_assign_driver` (`agencyPortalApi.ts` L452). Exists (2 definitions).
  - Accept, decline, deliver: RPC `agency_job_set_status` (L443). Exists.
  - Driver location, polled every 15 s while the track modal is open: Edge function `agency-portal-jobs` (L486), via `setInterval` at `AgencyJobsPage.tsx` ~L324.
  - Customer authorizations: direct table read `shipment_agency_consents` (`services/agencySupabaseApi.ts` L173).
  - Create job from authorization: **direct client INSERT into `agency_jobs`** (`agencySupabaseApi.ts` L215-217). Allowed by RLS `agency_job_owner_insert` (`supabase/migrations/20261012000000_staff_scope_enforcement.sql` L182-193), which checks dispatcher scope, consent, and operational status. It bypasses the RPC pattern used for every other write on this page.
- Buttons: filter tabs (L373), Create job (fare input placeholder "Fare ₹", L421; Create at ~L428), Accept, Decline, Assign driver, Track, Confirm delivery, track modal close.

Issues:
- WRONG: `AgencyJobsPage.tsx` L176 hard-codes `vehicle_type: '—'`, yet L507 renders `{job.vehicle_type}`. Every job card shows an em dash for the truck type.
- WRONG: L182 sets `driver_name: undefined`. L559 then shows "Assigned: Driver assigned", and L666 shows "Driver" in the track modal. The assigned driver's name is never shown on the list.
- WRONG: L625 shows the raw vehicle code in the assign modal (`{driver.vehicle_type}`, e.g. `eicher_14ft`). The label map lives only in Fleet, Drivers, and Rates pages.
- ROUGH: Fare check is client-side only (L134-139). Confirm the RPC or table constraint rejects a non-positive fare; this audit did not check.
- ROUGH: Map (L349-358, L686-688). `trackingRoutes` is hard-coded to `[]`, so no route is drawn.
- ROUGH: "No jobs found" empty copy (L460) has no next step. Create-from-authorization empty copy (L401) is fine.
- ROUGH: No search, no date filter, no pagination (the list is client-filtered by status tab only).
- ROUGH (dead code, misleading): `services/agencySupabaseApi.ts` L287-297 (fleet stubs), L300-318 (rate stubs), L337-350 (driver stubs) all throw "not implemented" or return `[]`. No page imports them. Only `agencyJobsApi` from that file is used (`AgencyJobsPage.tsx` L18-19).

Journey gaps: no link from a job to its consignment or GR (the GR is created on the Consignments page from the order, not from the job). No unassign or reassign before pickup. No cancel after accept (only Decline on pending). No ETA. No export.

---

## 3. Fleet

- Label / route / file: **Fleet**, `/agency/fleet`, `frontend/src/pages/AgencyFleetPage.tsx` (436 lines). Read: ALL. Act: fleet_manager (`agencyAccess.ts` L39).
- Data path:
  - List: Edge function `agency-portal-fleet` (`agencyPortalApi.ts` L514). Exists.
  - Add truck: RPC `agency_vehicle_create` (L560). Exists.
  - Availability toggle: RPC `agency_vehicle_update` (L585) via `updateVehicle` with patch `{ is_available }` (page L154-156). Exists.
- Buttons: Add truck (L198), form Save (L315), Cancel (L308), per-truck availability toggle (L413), "Drivers" navigation (L422).

Issues:
- WRONG: The document expiries (insurance, fitness, permit, PUC) are captured on add (L131 reset form, form fields around L242-300) and can never be changed. The only edit path is the availability toggle. `VehiclePatch` supports more fields, but the UI does not use them. A truck with an expired permit stays "available" with no warning.
- ROUGH: Truck labels use the full `VEHICLE_LABELS` map (L16-25, all 8 types). L354 falls back to the raw code for unknown types.
- ROUGH: Default vehicle type on add is `eicher_14ft` (L79, L131). Fine, but the select (L242-246) gives no guidance on capacity.
- ROUGH: No delete or retire. A wrongly added truck cannot be removed.
- ROUGH: L163-164 shows a clear message when a truck is in an approved load plan. Good.
- OK: Loading, error with retry (L222-228), and empty (L325-329) states all exist.

Journey gaps: no expiry alerts, no truck documents, no maintenance link (Expenses page covers maintenance, not linked from here), no search.

---

## 4. Drivers

- Label / route / file: **Drivers**, `/agency/drivers`, `frontend/src/pages/AgencyDriversPage.tsx` (523 lines). Read: ALL. Act: fleet_manager (`agencyAccess.ts` L40). Pay driver: finance only (page L46 `canPay`).
- Data path:
  - Snapshot: Edge function `agency-portal-drivers` (`agencyPortalApi.ts` L797-800). Exists (`supabase/functions/agency-portal-drivers/index.ts`).
  - Employments list: direct read `agency_driver_employment` (`agencyPortalApi.ts` L906).
  - End employment: RPC `agency_driver_employment_end` (L922). Exists.
  - Assign or unassign truck: `agencyDriversApi.assignTruckToDriver` / `unassignTruck` (page L147, L160).
  - Driver payout: RPC `agency_driver_payout_request` (L856). Exists.
  - Invitations panel: `components/DriverInvitationsPanel.tsx` (RPCs `agency_driver_invitation_create` and `_revoke` exist).

Issues:
- WRONG: `VEHICLE_LABELS` (L34-41) has 6 entries. It lacks `tata_ace` and `volvo_40ft`, which the Fleet map includes. Those trucks display raw codes at L252 and L443.
- ROUGH: Phone tel link (L390) is good. Assigned-driver list and "no employment" empty state (L346, L463) are fine.
- ROUGH: Assign-truck modal does not say which trucks are already assigned elsewhere until after a failed call.
- ROUGH: Pay copy "Payment request submitted for admin review" (L193) is accurate but a dispatcher cannot tell from this page whether it was approved.
- OK: Amount validation (L172-177) and idempotency key per dialog (L182-183) are solid.

Journey gaps: no driver search, no driver document or licence expiry, no payout history on this page, no driver-to-job history.

---

## 5. Team

- Label / route / file: **Team**, `/agency/team`, `frontend/src/pages/AgencyTeamPage.tsx` (537 lines). Owner only (read and act, `agencyAccess.ts` L44). **Not on phone nav.**
- Data path (`services/agencyOrganizationApi.ts` L278-322):
  - Members and invitations: direct reads of `agency_memberships` and `agency_invitations` (L279-280).
  - Invite: RPC `agency_member_invite` (L284). Exists.
  - Revoke member: RPC `agency_member_revoke` (L307). Exists.
  - Revoke invitation: RPC `agency_member_invitation_revoke` (L298). Exists.
  - Change scope: RPC `agency_member_change_scope` (L316). Exists.
- Buttons: Invite (L254), Copy code (L284), WhatsApp share (L287), Done (L290), Revoke (L346, L380), Change scope (L337-343), confirm and cancel dialogs.

Issues:
- BREAKS (phone): Not in bottom bar. See section 0.
- WRONG: `AgencyTeamPage.tsx` L123 falls back to `Team member ${m.user_id.slice(0, 6)}` when no invitation email is found. The user sees a fragment of a UUID instead of a name.
- OK: Invite code is shown once, with a clear message (L149). WhatsApp share is good.
- ROUGH: No way to edit a member's name or phone, resend an invitation, or see when a member last signed in (not verified).
- ROUGH: Empty copy "No team members yet. Invite your first dispatcher." (L320) is fine. Invitations empty copy (L362) is fine.

Journey gaps: no audit trail of scope changes, no "who changed what" view.

---

## 6. Clients

- Label / route / file: **Clients**, `/agency/clients`, `frontend/src/pages/AgencyClientsPage.tsx` (**1205 lines**, which makes it hard to maintain). Read: ALL. Act: finance (`agencyAccess.ts` L45). **Not on phone nav.**
- Data path (`services/agencyOrganizationApi.ts` L324-428):
  - Reads: `agency_client_agreements` (L325), `agency_client_sites` (L328), `agency_client_contacts` (L333).
  - Create or update agreement: RPCs `agency_client_agreement_create` (L340) and `_update` (L354). Exist.
  - Sites: RPCs `agency_client_site_create` (L372) and `_update` (L390). Exist.
  - Contacts: RPCs `agency_client_contact_create` (L406) and `_update` (L422). Exist.
- Buttons: New client (L608), Edit (L697), End agreement (L705, confirm), Reactivate (L715), Sites and Contacts tabs (L730, L738), Add site (L775), Add contact (L816), activate and deactivate toggles, Tariffs link (L743-744).

Issues:
- BREAKS (phone): Not in bottom bar. See section 0.
- ROUGH: Ship-to label "Ship-to (loading point)" (L47) is clear. Good.
- ROUGH: "No GSTIN" and "No payment terms" copy (L650) reads as a gap rather than a required field. Consider prompting at create.
- ROUGH: No delete for an agreement, only End. Correct for audit, but no explanation at the point of action.
- ROUGH: Tariffs link is only visible after a client is selected (L743). Tariffs are not reachable from the list.
- OK: Loading, error with retry, and empty states (L596, L632, L636) exist.

Journey gaps: no order count or outstanding invoice per client, no link to that client's orders or invoices, no export.

---

## 7. Tariffs (client rate cards)

- Label / route / file: **no menu entry**. Route `/agency/clients/:agreementId/tariffs` (`App.tsx` L203), file `frontend/src/pages/AgencyTariffsPage.tsx` (661 lines). Read: ALL. Act: finance (via prefix rule, `agencyAccess.ts` L73). The page passes the key `/agency/clients/tariffs` to `canAct` (L104), which works only because of the prefix rule. Fragile.
- Data path (`agencyOrganizationApi.ts` L430-470):
  - List: `agency_tariff_versions` (table exists, 1 definition).
  - Publish or revise: RPC `agency_tariff_version_publish` (L453). Exists.
- Buttons: Publish rate (L324), Revise (L475), View history (L429), filter chips (current, upcoming, past), vehicle filter, search, form Save (L652 Cancel).

Issues:
- WRONG (blocks a real job): `AgencyTariffsPage.tsx` L167 builds the vehicle choices in the publish form (L582) from the codes already in the client's rate rows. A dispatcher cannot publish the first rate for a vehicle type that the client has never priced. The only choice is "Any vehicle" or a code already present.
- WRONG: Raw codes shown to users. Vehicle filter options (L385) and the lane subtitle (L426, via `vehicleLabel` at L100) display `eicher_14ft`-style codes.
- ROUGH: Search (L371) matches the raw code, so a user typing "Eicher" finds nothing.
- ROUGH: No cancel for an upcoming version (revise creates a new version, L475). Correct for history, but the user cannot undo a mistaken upcoming rate.
- OK: Current, upcoming, and past chips, superseded markers, and empty states (L412, L416) are good.

Journey gaps: no bulk rate import (CSV), no copy of a lane from one client to another, no link back to the client from the page (not verified).

---

## 8. Orders import

- Label / route / file: **Orders**, `/agency/orders/import`, `frontend/src/pages/AgencyOrderImportPage.tsx` (607 lines). Read: ALL. Act: dispatcher (`agencyAccess.ts` L46). **Not on phone nav.**
- Data path (`services/agencyOrdersApi.ts`):
  - Client and site list: `agency_client_agreements` and `agency_client_sites` (L186, L190).
  - Batch and order history: `agency_order_batches` and `agency_orders` (L201, L204).
  - Import: RPC `agency_order_import` (L214). Exists.
  - Cancel order: RPC `agency_order_cancel` (L253). Exists.
- Buttons: Template download (L354), file pick, Import (L517, gated by `gate.canWrite`), error CSV download (L439), Reset (L393, L531), history refresh (L547), Cancel order (L591, confirm L582).

Issues:
- BREAKS (phone): Not in bottom bar. See section 0.
- ROUGH: Empty copy (L314) says "Add a client with its ship-to sites on the Clients page". On a phone the Clients page is also unreachable.
- ROUGH: No edit of an imported draft order. The only fix path is cancel and re-import.
- ROUGH: Order history has no search, filter, or pagination (L558-591).
- OK: CSV template, row-level error download, and cancel confirm are all present.

Journey gaps: no link from an order to its consignment or GR, no link to its invoice, no status filter. An order that has been planned has no visible state change here (not verified).

---

## 9. Load plan

- Label / route / file: **Load plan**, `/agency/orders/plan`, `frontend/src/pages/AgencyLoadPlanPage.tsx` (884 lines). Read: ALL. Act: dispatcher (`agencyAccess.ts` L47). Approve gated by `gate.canDispatch` (L679). **Not on phone nav.**
- Data path (`services/agencyLoadPlansApi.ts`):
  - Reads: draft orders, trucks, plans (L182-184). Order lines (L186). Underlying tables `agency_orders`, `agency_order_lines`, `agency_trucks`, `agency_load_plans`, `agency_load_plan_loads`, `agency_load_plan_lines`, `agency_load_plan_unmet`.
  - Save: RPC `agency_load_plan_save` (L216, L424). Exists.
  - Approve: RPC `agency_load_plan_approve` (L217, L456). Exists.
  - Cancel: RPC `agency_load_plan_cancel` (L466). Exists.
  - Propose: client-side function `runPropose` (page L532). Not a backend call.
- Buttons: pick orders and trucks, Propose (L532), Save (L626), Approve (L678), Cancel plan (L690), detail toggle (L700), Re-propose (L803), confirm dialogs (L721-771).

Issues:
- BREAKS (phone): Not in bottom bar. See section 0.
- WRONG: `AgencyLoadPlanPage.tsx` L71 builds truck labels as `${t.vehicle_type} · ${t.rc_number}`, so the user sees `eicher_14ft · MH12AB1234`.
- WRONG: L80 `siteLabel` shows `Site 1a2b3c4d` (an id fragment) when no site name is resolved. L851 and L865 do the same for order lines (`Order line 1a2b3c4d`).
- ROUGH: L51-53 unmet-reason copy is understandable, but "No free truck was left for this route" does not say how to fix it.
- OK: Save disabled when no loads or no name (L627). Empty state (L652) is fine. Approve confirm copy (L721) is clear about replacing earlier plans.

Journey gaps: no "create GRs for this approved plan" action, no printable load sheet, no compare-versions view, no delete of a draft plan.

---

## 10. Consignments

- Label / route / file: **Consignments**, `/agency/consignments`, `frontend/src/pages/AgencyConsignmentsPage.tsx` (522 lines). Read: ALL. Act: dispatcher (`agencyAccess.ts` L48). **Not on phone nav.**
- Data path (`services/agencyConsignmentsApi.ts`):
  - Orders: `agency_orders` (L169). Consignments: `agency_consignments` (L172). Events: `agency_consignment_events` (L176).
  - Create GR: RPC `agency_consignment_create` (L117, L185). Exists.
  - Delivery event: RPC `agency_consignment_event` (L208). Exists.
  - QR payload: RPC `agency_consignment_qr` (L233). Exists.
- Buttons: Create GR (L325), next steps per event (L381), Confirm dispute (L413), dispute cancel (L421), QR (L446), copy QR payload (L467), history toggle (L438), close QR (L474).

Issues:
- BREAKS (phone): Not in bottom bar. See section 0.
- WRONG (missing data): The order list (L313-317) shows `client_order_ref` and a date only. No client name, route, or quantity, so a dispatcher cannot tell which order is which.
- ROUGH: QR is shown as copy-able text (L248 "QR payload copied", L467). The payload is a string, not a scannable image, which limits usefulness on a phone at the gate.
- ROUGH: No status filter, no search. Lists grow without bound.
- ROUGH: Dispute requires a note (L399-417). Good. Copy at L393 "Delivery complete. No further steps." is clear.
- OK: Create GR is idempotent with intent keys (L164-166). Empty state (L306) is clear.

Journey gaps: no printable GR or LR, no link from the GR to the order's load plan or invoice, no link to tracking for the job behind the GR (tracking is keyed by job, not GR).

---

## 11. Tracking

- Label / route / file: **Tracking**, `/agency/tracking`, `frontend/src/pages/AgencyTrackingPage.tsx` (642 lines). Read: ALL. Act: dispatcher and fleet_manager (`agencyAccess.ts` L51; page `canAct` L88 gates incident buttons L523-537). **Not on phone nav.**
- Data path (`services/agencyTrackingApi.ts`):
  - Active jobs: direct read `agency_jobs`, filtered to pending, accepted, in_transit (L207-209). The select is `id,status,driver_id,notes,created_at`. No origin, destination, vehicle, or driver name.
  - Pings: `agency_tracking_pings` (L215-218). Exists.
  - Incidents: `agency_incidents` (L225). Exists. Open: `agency_incident_open`. Update: `agency_incident_update`. Both exist.
  - Live state: RPC `agency_trip_live` (per job). Exists.
  - Ping ingest (driver side): RPC `tracking_ping_record`. Exists.
- Buttons: Refresh and retry (error banner), View details (L403-405), Open incident form, acknowledge (L522), resolve (L563), maps link (L477).

Issues:
- WRONG: `AgencyTrackingPage.tsx` L376 titles each job `Job ${j.id.slice(0, 8)}`, and L405 uses the same fragment in the aria-label. The list shows no route, vehicle, or driver. The underlying select (`agencyTrackingApi.ts` L208) omits those fields.
- WRONG: The page makes one `agency_trip_live` RPC call per active job (L135, `Promise.allSettled`), with no cap beyond `JOB_LIMIT`. Expect latency to scale with active jobs.
- ROUGH: No auto-refresh. The page has no `setInterval` (grep confirmed). Pings and incidents appear only after a reload or after a write (`refreshAfterChange`, L231). The jobs modal on the Jobs page polls every 15 s, so the two screens disagree.
- ROUGH: ETA line (L383-385) shows "ETA: set a destination in details". There is no destination input on this page, so the user is sent to a screen that does not exist here. Clarify copy or add the field.
- ROUGH: Last ping copy (L382-384) and "Stale ping" badge (L377-392) lack a threshold explanation.
- OK: Incident kind labels (L45 `KIND_LABELS`) are human-readable. Incident and empty states (L361, L464, L496) and the error retry (L321-335) exist.

Journey gaps: no link from a tracked job to its consignment or GR, no customer-facing share link (exists elsewhere in the app, not verified for agency), no incident history across jobs, no filter by open incidents.

---

## 12. Routes in App.tsx under /agency with no menu entry

- `/agency/clients/:agreementId/tariffs` (`App.tsx` L203). Reached only from the Clients detail panel (`AgencyClientsPage.tsx` L743-744). Intentional deep route, but there is no menu item for tariffs and the page is unreachable on a phone (section 6).
- `/agency/register` (`App.tsx` L122). Public registration, intentional.
- `/agency/profile` (`App.tsx` L212). Reached from the sidebar footer and the mobile header ("Profile"). Covered.

Menu entries that exist only on desktop: Invoices, Expenses, Payroll, ERP, Subscription (out of scope here, but the same phone gap applies).

---

## 13. Pages that depend on Edge functions (hosted-only)

| Item | Edge function | Used at | Exists |
|---|---|---|---|
| Home | `agency-portal-dashboard` | `agencyPortalApi.ts` L384 | Yes |
| Jobs | `agency-portal-jobs` | `agencyPortalApi.ts` L421, L461, L486 | Yes |
| Fleet (list) | `agency-portal-fleet` | `agencyPortalApi.ts` L514 | Yes |
| Drivers (snapshot) | `agency-portal-drivers` | `agencyPortalApi.ts` L797-800 | Yes |

Team, Clients, Tariffs, Orders, Load plan, Consignments, and Tracking call RPCs and tables directly. None has a local fallback. Only the Home page checks `isSupabaseConfigured` (`AgencyDashboardPage.tsx`). The rest will error without the hosted backend.

Dead code: `agencyFleetApi` and `agencyRatesApi` stubs in `services/agencySupabaseApi.ts` (L287-318) and the driver stubs (L337-350) are unused.

---

## 14. Ranked top-10 fix list

Ordered smallest safe fix first.

1. **Show real data on Home quick actions.** Add Orders, Load plan, Consignments, Tracking tiles. Files: `frontend/src/pages/AgencyDashboardPage.tsx` (~L369-396). Effort: S.
2. **Stop showing the em dash for truck type on Jobs.** Remove the `'—'` placeholder and the vehicle span, or fill it from data. Files: `frontend/src/pages/AgencyJobsPage.tsx` L176, L506-508. Effort: S.
3. **Shared vehicle label map.** Move `VEHICLE_LABELS` (currently duplicated in Fleet, Drivers, Rates, plus missing entries) into one module and use it on Jobs (L625), Load plan (L71), Tariffs (L385, L426, L582), Drivers (add `tata_ace`, `volvo_40ft`). Files: a new `frontend/src/lib/vehicleLabels.ts` plus the five pages. Effort: S.
4. **Tracking job title.** Add origin, destination, and driver name to the select, and show them in the job card header instead of the id fragment. Files: `frontend/src/services/agencyTrackingApi.ts` L208, `frontend/src/pages/AgencyTrackingPage.tsx` L376, L405. Effort: S (if the data is already joined) to M.
5. **Tracking auto-refresh.** Add a 15 s interval, mirroring the Jobs page (`AgencyJobsPage.tsx` L324). Files: `frontend/src/pages/AgencyTrackingPage.tsx`. Effort: S.
6. **Assigned driver name on Jobs.** Map `driver_name` from the list payload (`AgencyJobsPage.tsx` L182) instead of `undefined`. Check whether `agency-portal-jobs` returns the driver name first. Files: `AgencyJobsPage.tsx` L182, L559, L666; possibly `supabase/functions/agency-portal-jobs/index.ts`. Effort: S to M.
7. **Tariff vehicle picker.** Offer every known vehicle code (from the shared map in item 3) in the publish form and filter, not only codes already in use. Files: `frontend/src/pages/AgencyTariffsPage.tsx` L167, L582. Effort: S.
8. **Phone access to the ops items.** Add a "More" sheet button to the bottom bar, or put MORE_NAV in the mobile header menu. Files: `frontend/src/layouts/AgencyLayout.tsx` L193-234, L262-280. Effort: M.
9. **Fleet document expiry editing.** Add an edit form that sends the existing `VehiclePatch` fields to `agency_vehicle_update`, and show a warning for expired dates. Files: `frontend/src/pages/AgencyFleetPage.tsx` (~L150-160, add form L242-300), `frontend/src/services/agencyPortalApi.ts` L560-600. Effort: M.
10. **Replace id fragments in Load plan and Team.** Load plan `siteLabel` and order-line labels (`AgencyLoadPlanPage.tsx` L80, L851, L865) and Team fallback (`AgencyTeamPage.tsx` L123) should show names or a neutral "Unnamed site". Files: those three lines. Effort: S to M (depends on whether names are joined).

---

## 15. Feature ideas buildable in under an hour each (existing backend)

- **Consignment filter chips** by status (client-side on `AgencyConsignmentsPage` data). Uses existing lists.
- **Orders search** by `client_order_ref` on `AgencyOrderImportPage` history, client-side.
- **CSV export** of consignments and orders with the existing `downloadTextFile` and `orderRowsToCsv` helpers already in `AgencyOrderImportPage.tsx` (L354, L439).
- **Open-incidents filter** on Tracking, using the existing `agency_incidents` read.
- **Document expiry badges** on Fleet using the expiry fields already stored (no new backend).
- **Create-GR shortcut** from the Orders history row, calling the existing `agency_consignment_create` flow.
- **Tariff lane copy** to another client, reusing the existing publish RPC `agency_tariff_version_publish`. Verify the payload first.

---

## 16. Not verified

- No browser run. All findings are from reading source.
- RPC bodies, RLS on each table, and Edge function logic were not read. Only names and existence were checked.
- Whether `agency-portal-jobs` already returns driver names (item 6) and whether the dashboard snapshot already carries operational counts (section 1).
- Fare constraint at the database level (section 2).
