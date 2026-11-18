# Driver experience audit (2026-11-18)

Read-only static audit of the driver portal. Only this file was written. No code, migrations, or git state were changed. Nothing was run in a browser, so RLS policies other than the payout insert were not verified.

Severity: **BREAKS** = a flow cannot finish or a screen gets stuck. **WRONG** = shows incorrect data, misleading copy, or misleading behaviour. **ROUGH** = polish, accessibility, mobile, or copy.

Paths are relative to `frontend/src/` unless shown otherwise. `cs` = `services/customerSupabaseApi.ts`, `sb` = `services/supabaseApi.ts`.

---

## 1. Menu items and routes

| Item | Route | Page file | Where it appears |
|---|---|---|---|
| Home | `/driver/dashboard` | `pages/DriverDashboardPage.tsx` | Bottom nav and sidebar (`layouts/DriverLayout.tsx:9`) |
| Trips (page title "Trip History") | `/driver/history` | `pages/DriverHistoryPage.tsx` | Bottom nav (`DriverLayout.tsx:10`) |
| Earnings | `/driver/earnings` | `pages/DriverEarningsPage.tsx` | Bottom nav (`DriverLayout.tsx:11`) |
| Profile | `/driver/profile` | `pages/DriverProfilePage.tsx` | Bottom nav (`DriverLayout.tsx:12`) |

Driver routes that are not in the menu:

| Route | Page | Notes |
|---|---|---|
| `/driver/register` | `pages/DriverRegisterPage.tsx` | Public, outside the driver layout (`App.tsx:121`). |
| `/driver/kyc` | `pages/DriverKycPage.tsx` | Inside the driver layout (`App.tsx:186`). Only linked from Profile (`DriverProfilePage.tsx:339`). |
| `/driver/trip/:jobId` | `pages/DriverTripPage.tsx` | Inside the driver layout (`App.tsx:182`). Reached from the Home offer accept and the "View Trip" card (`DriverDashboardPage.tsx:406`, `:848`). |
| `/invite/:token` | `pages/AcceptInvitePage.tsx` | Protected but outside the driver layout (`App.tsx:123`). Shows no bottom nav. |

Requested items with **no route and no page**:

- **Notifications.** No route. Typing the path falls through to `NotFoundPage` (`App.tsx:216`). `DriverLayout.tsx` has no bell. Only `layouts/MobileLayout.tsx:103-136` (customer layout) uses `notificationsSupabaseApi`.
- **Job offers.** No route. Offers are a modal on Home (`DriverDashboardPage.tsx:~530-600`), fed by realtime (`:~285-310`) and a focus refetch (`:~322-333`).
- **Payouts.** No route. Withdrawal lives in two places: the Home wallet card (`DriverDashboardPage.tsx:~716-790`) and the Earnings withdraw modal (`DriverEarningsPage.tsx:~340-395`).

---

## 2. Per-route trace (action -> service -> backend)

### 2.1 Home (`DriverDashboardPage.tsx`, 962 lines)

| Action / element | Code | Backend | Status |
|---|---|---|---|
| Online/offline switch | `toggleOnline` `:368-381`; `setDriverOnlineStatus` `cs:788` | Direct `update drivers.is_online` | Exists. Not gated on active trip. Toast only on error (`:378`). |
| Accept / Decline offer | `respondToJob` `:395-411`; `respondToJobOffer` `cs:809` | RPC `respond_to_job_offer` (`supabase/migrations/20261003010000_atomic_job_offer_response.sql`) | Exists. Good server-side guards. |
| Offer countdown and expiry | `countdown` `:115`; tick `:~350-368` | Realtime `job_offers` (`:~285-310`); `getPendingOffer` `cs:739` | Works while the app is open. No push (see 3.1). |
| Withdrawal "Submit Request" | `handleWithdrawal` `:247-267`; `requestPayout` `cs:512` | Direct insert `driver_payouts`. RLS: `20260418005000_restore_driver_payouts_contract.sql:86-96` (checks ownership and `type='withdrawal'`, **no amount or balance check**) | Exists. Balance check is client-only (`:254-257`). |
| Wallet / stats | `fetchHistory` `:196-245` | `getTripHistory` `cs:757`, `getPayoutHistory` `cs:773` | See WRONG items below. |
| "View Trip" (active job) | `:848` | Navigates to `/driver/trip/:id` | Works. |
| Call support | `tel:` link | `config/support.ts:9-12` | Works. |
| Register as Driver (no profile) | `:450` | Navigates to `/driver/register` | Works. |
| Retry (profile load failed) | `retryLoad` `:190-194` | `driverSupabaseApi.getByUserId` `sb:467` | Good error state. |

Issues:

- **WRONG. Wallet balance is understated or overstated because of `.limit()`.** `getTripHistory` has `.limit(10)` (`cs:764`), so `totalEarned` and `walletBalance` only count the last 10 job rows (`DriverDashboardPage.tsx:198`, `:232-240`). `getPayoutHistory` has `.limit(5)` (`cs:779`), so `calculateWalletBalance` (`:96-103`) ignores older reserved payouts and shows too much available balance. The Earnings page does not have this bug: `getBalanceSnapshot` (`cs:477-510`) has no limit. The two screens can disagree.
- **WRONG. "Total Earned" and "Available Balance" use the customer quote.** Both use `shipments.estimated_cost` (`DriverDashboardPage.tsx:229`, `:232-233`, and `:134-143` via `normalizeShipmentSummary`). Earnings does the same (`DriverEarningsPage.tsx:153`). There is no driver-rate field in this path. Confirm with the owner whether a driver fare or agency pay rate should be used instead.
- **WRONG. Withdrawal failures are silent.** `handleWithdrawal` has `try { await requestPayout } finally { setWithdrawing(false) }` with no `catch` (`DriverDashboardPage.tsx:258-267`). A failed insert becomes an unhandled rejection and the driver sees no message. The Earnings page does have a catch (`DriverEarningsPage.tsx:136-137`).
- **WRONG. "near you" promise.** `"You'll receive notifications when a job is available near you"` (`:875`). `getPendingOffer` filters only by `driver_id` and `status` (`cs:739-755`). No geographic matching exists, and no push notifications exist.
- **WRONG. Copy promises.** `"We'll notify you within 24-48 hours"` (`:646`) is a commitment with no backing process. `"You are visible to customers and can receive jobs"` (`:668`) is not true for drivers.
- **WRONG. Raw status code shown.** `{trip.status}` is rendered as the fallback chip text (`:917`) instead of a label. Mapping is at `TRIP_STATUS_CHIPS` (`:71`).
- **ROUGH. Placeholder text.** `'Pickup Location'` / `'Drop Location'` fallbacks (`:551`, plus the drop equivalent just below). `'Trip completed'` (`:760`).
- **ROUGH. Invalid class.** `flex-2` (`:599`) is not a Tailwind class. Accept button sizing is accidental.
- **ROUGH. Emoji in headings.** `"New Job Offer! 🚛"` (`:535`), status `🟢`/`⚫` (`:662`).
- **ROUGH. Input label not associated.** `"Amount (₹)"` label (`:494`) has no `htmlFor`, and the input has no `id` (`:~500`). The icon is a dollar sign (`:497`) on a rupee field.
- **ROUGH. Modals have no focus trap or Escape handler** (`:478-530` withdraw, `:532-600` offer).
- **ROUGH. Trip history rows are not tappable** (`:~890-925`). A driver cannot open a past or active trip from here.
- **ROUGH. Rating shows an em dash for 0.** `driver.rating?.toFixed(1) || '—'` (`:625`, `:710`, `:952`).
- No TODO, FIXME, or demo data found in this file.

### 2.2 Trips / History (`DriverHistoryPage.tsx`, 176 lines)

| Action | Code | Backend | Status |
|---|---|---|---|
| Filter chips All / Delivered / Declined | `setFilter` `:96` | `getHistory` `cs:639` -> `job_offers` select | Exists. |
| List | `fetchTrips` `:~62-75` | `job_offers` joined to `shipments` | Exists. |

Issues:

- **WRONG. Error shows an empty state.** On load error the code toasts (`:70`) and then renders `"No trips found"` (`:116`). It should show an error with Retry.
- **ROUGH. Filter tap targets are too small.** `py-1 text-xs` (`:99-100`) is about 24 px high. Below the 44 px minimum for a phone-first screen.
- **ROUGH. Filter chips have no `aria-pressed`** (`:96-101`).
- **ROUGH. Rows are not links** (`:123-175`). Delivered trips have no detail view. `driverTripsApi.getTripByIdForDriver` (`cs:661`) would support a read-only detail page.
- **ROUGH. Icon mismatch.** The cost line uses `MapPin` (`:156`). Weight is shown as a bare `{n} kg`.
- Labels: the menu says "Trips" and the page says "Trip History". Pick one.

### 2.3 Earnings (`DriverEarningsPage.tsx`, 400 lines)

| Action | Code | Backend | Status |
|---|---|---|---|
| Period tabs This Week / This Month / All Time | `setPeriod` `:216` | `getDeliveredTrips` `cs:616` | Exists. Tabs are `py-2 text-sm`, below 44 px. |
| Balance | `loadData` `:~80-95` | `getBalanceSnapshot` `cs:477` (unlimited) | Exists. |
| Withdraw | `handleWithdrawRequest` `:~110-145` | `requestPayout` `cs:512` | Exists, with catch (`:136-137`). |
| Export CSV / XLSX / JSON | `handleExport` `:~160-190` | `utils/dataExport` (client-side) | Exists. |

Issues:

- **BREAKS. Page can spin forever.** `fetchDriverId` (`:59-65`) has no try/catch. If `getDriverIdByUserId` returns null or throws, `driverId` stays null, `fetchJobs` never runs, and `loading` (`:53`, cleared only in `fetchJobs` at `:103`) stays true. The skeleton never clears and there is no empty or error state.
- **WRONG. Earnings equal the customer quote.** `earning: job.shipments?.estimated_cost` (`:153`), same basis as Home (see 2.1).
- **WRONG. Balances disagree with Home** (see 2.1 `.limit`).
- **WRONG. Raw IDs shown to the driver.** `shipmentRef` falls back to `job.id.slice(-8).toUpperCase()` (`:146`) and is rendered as `#{shipmentRef}` (`:309`). `tripId` is a full UUID in the export (`:145`).
- **ROUGH. Hard-coded currency.** `₹{availableBalance.toLocaleString('en-IN')}` (`:237`, `:378`) bypasses `formatCurrency` used elsewhere on the page.
- **ROUGH. Unclear labels.** "In Process" (`:274`), "Withdrawn" (`:279`).
- **ROUGH. Modal has no label association** (`:~370-380`) and no focus trap.
- **ROUGH. No pay statement.** The payroll line RPC is not used here (see 3.3).

### 2.4 Profile (`DriverProfilePage.tsx`, 374 lines)

| Action | Code | Backend | Status |
|---|---|---|---|
| Load profile | `:127-150` | `driverSupabaseApi.getByUserId` `sb:467` | Exists. |
| KYC badge | `:113-125` | `driver-kyc` edge function `state` (via `getState`) | Exists. No badge if offline (intended). |
| Account Center | `navigate('/profile')` `:192`, `:274`, `:332` | Generic route `App.tsx:149` | Leaves the driver layout (no bottom nav). |
| Trip History | `:290` -> `/driver/history` | n/a | Works. |
| Earnings | `:282` -> `/driver/earnings` | n/a | Works. |
| Documents & KYC | `:339` -> `/driver/kyc` | `driver-kyc` edge function | Works. |

Issues:

- **BREAKS (phone). No way to sign out on a phone.** Sign Out exists only in the desktop sidebar (`layouts/DriverLayout.tsx:67-76`), inside `<aside className="hidden md:flex ...">` (`:30`). The mobile header (`:80-95`) has no sign-out, and the Profile page has none either. Phone users cannot log out from the driver app.
- **WRONG. Bank account and UPI shown in full.** `Bank: {profile.bank_account}` (`:317`) and `UPI: {profile.upi_id}` (`:316`) display the full values. Mask them.
- **WRONG. Shown but not built.** `"Identity, avatar and notifications"` for Account Center (`:278`). Drivers have no notifications UI.
- **WRONG. Internal copy shown to users.** `"This route now has dedicated driver ownership. Your account does not have a linked driver record yet."` (`:182`).
- **ROUGH. Leaves the driver layout.** The three `/profile` links (`:192`, `:274`, `:332`) open the generic account page with no driver bottom nav.
- **ROUGH.** `document.title` is set (`:~80`), but the page body is a dense grid of cards with no sticky header.

### 2.5 Driver KYC (`DriverKycPage.tsx`, 769 lines). Reached from Profile only

| Action | Code | Backend | Status |
|---|---|---|---|
| Load state | `:397-424` | `driver-kyc` `action: 'state'` (`services/driverKycApi.ts:163`) | Exists. `supabase/functions/driver-kyc/index.ts:338`. |
| Upload document | `:482-514` | `driver-kyc` `upload` (`driverKycApi.ts:213`) and storage | Exists. |
| Submit for verification | `:526-539` | `driver-kyc` `submit` (`driverKycApi.ts:225`; `index.ts:345`) | Exists. |
| Retry | `handleRetry` `:517` | Same as upload | Works. |

Good: loading, error, denied, ready, locked, and offline states are all present (`:614-643`, `:579`, `OFFLINE_MESSAGE` `:101`). Demo fixtures are gated to dev only (`:363-365`, `:397-398`; `services/driverKycDocuments.ts:247-260`, `:318-323`). No TODO or FIXME.

Issues:

- **ROUGH. Only reachable from Profile.** Four required documents, but no entry point from Home.
- **ROUGH. Duplicate document flow.** The legacy registration upload (see 2.6) and this KYC flow both store licence and RC. Only the KYC flow is reliable.

### 2.6 Register (`DriverRegisterPage.tsx`, 496 lines). Public

| Action | Code | Backend | Status |
|---|---|---|---|
| Next / step validation | `validateStep` `:112-125`, `handleNext` `:~128` | Client only | Works. |
| Upload licence / RC | `uploadDoc` `:67-100` | Storage bucket `driver-docs` `:85-93` | **BREAKS.** See below. |
| Submit | `handleSubmit` `:136-170` | `driverSupabaseApi.register` `sb:483-484` (direct insert into `drivers`, `status:'pending'`) | Exists. RLS on `drivers` insert not verified in this audit. |
| Sign in link | `:491` | `/login?mode=driver` | Works. |

Issues:

- **BREAKS. Uploaded document links are dead.** `getPublicUrl` (`:92-93`) builds a public URL for `driver-docs`. Migration `20261003000000_private_kyc_documents.sql` sets the bucket to `public = false` (`:28`) and strips stored public-URL references (`:60-64`). The stored `dl_url`/`rc_url` cannot be opened.
- **WRONG. Role set only in the client store.** `updateUser({ role: 'driver' })` (`:~159`) changes local state. This file does not show a server-side role assignment. Verify how the server assigns the driver role.
- **ROUGH. Generic failure.** `'Submission failed. Please try again.'` (`:168`) hides the cause.
- **ROUGH. Bank account plain text** on form (`:445`). Not masked.

### 2.7 Trip (`DriverTripPage.tsx`, 962 lines). Inside driver layout, via `/driver/trip/:jobId`

| Action | Code | Backend | Status |
|---|---|---|---|
| Load trip | `fetchTrip` `:120-143` | `getByUserId` `sb:467`, `getTripByIdForDriver` `cs:661` | See BREAKS. |
| Arrived at pickup | `handleArrivedAtPickup` `:~320-329` | RPC `persist_driver_job_offer_progress` (`services/driverTripProgress.ts:84`) | Exists. |
| Pickup OTP | `handlePickupOTP` `:331-342` | **Client-side length check only.** No RPC. | See WRONG. |
| Loading photo | `uploadPhoto` `:387-416` -> storage `trip-photos` `:396`, then `persistJobProgress` | Storage and `persist_driver_job_offer_progress` | Exists. |
| Start journey | `handleStartJourney` `:343-358` | `persist_driver_job_offer_progress` with `pickup_otp` | Exists. Server verifies the OTP. |
| GPS | effect `:~214-260`; `upsertDriverLocation` `:165-185` | `driverSupabaseApi.upsertLocation` `sb:491-499` -> table `driver_locations` | Exists, but writes a different table from agency tracking (see 3.1). |
| Arrived at destination | `handleArrivedAtDestination` `:~363-378` | RPC as above | Exists. |
| Delivery OTP and photo | `handleDeliveryOTP` `:~380-386`, `uploadPhoto` | As above | Exists. |
| Complete delivery | `handleCompleteDelivery` `:~434-449` | RPC with `delivery_otp` | Exists. |
| Open maps | `openMaps` `:~452-456` | Google Maps URL | Works. |

Issues:

- **BREAKS. Spinner forever or false "Trip Not Found".** `fetchTrip` (`:120-143`) has no try/catch. `if (!driverData) return` (`:123`) returns before `setLoading(false)` (`:142`), so `"Loading trip…"` never clears. A throw from either service call also leaves the spinner. If the job fetch returns null because of a network error, the page shows `"Trip Not Found"` (`:472-473`) with the text "This job may have been cancelled or expired."
- **WRONG. Pickup OTP is only checked later.** `handlePickupOTP` (`:331-342`) accepts any 4 digits and moves to the loading-photo step (`:338`). The server rejects a wrong OTP only at `handleStartJourney` (`:343-358`), after the driver has taken and uploaded a loading photo. On rejection the driver is sent back to the OTP step (`handleProgressRejection` `:~304-327`).
- **WRONG. Journey toast claims tracking.** `'Journey started — GPS tracking active'` (`:354`). The GPS writes only to `driver_locations`, which the agency tracking view never reads (see 3.1).
- **ROUGH. Reload asks for OTP again.** Step is restored from job status (`:140`), but the verified OTP values live only in state (`verifiedPickupOtp` `:~96`, `verifiedDeliveryOtp`). A reload during `delivery_arrived` requires the delivery OTP again. The server enforces it, so this is a UX cost, not a data risk.
- **ROUGH. Offline.** `persistJobProgress` failure toasts `'Failed to update trip status.'` (`:275`). There is no queue or retry. Photo upload failure shows an inline message (`:912`) and a toast (`:429`). Nothing is saved offline.
- **ROUGH. Tap targets** on the trip action buttons are sized `min-h-[44px]` (fine), but the OTP inputs use `placeholder="0000"` (`:644`, `:823`) with no `inputMode="numeric"` check in the snippets read. Verify.
- **ROUGH.** On delivery success the driver is sent straight to Home (`:447`) with no summary.

### 2.8 Invite acceptance (`AcceptInvitePage.tsx`, 143 lines). `/invite/:token`

| Action | Code | Backend | Status |
|---|---|---|---|
| Accept | `run()` `:106`, `:127` -> `agencyInvitesApi.accept` (`services/agencyInvitesApi.ts:127`) | RPC `agency_driver_invitation_accept(p_token text)` (`supabase/migrations/20261011000000_agency_members_clients_tariffs.sql:1635`) for drivers | Exists. Staff uses `agency_member_accept`. |
| Success CTA | `:81-82` -> `/driver/dashboard` for drivers | n/a | Works. |
| Not registered | `agencyInvitesApi.ts:42` message | n/a | Points the driver to register first. |

Issues:

- **ROUGH. No in-app entry.** A driver can only accept through the link. There is no "enter invite code" field in the driver UI.
- **ROUGH.** The page is outside the driver layout, so no bottom nav.

---

## 3. Backend gaps for the driver app

### 3.1 GPS tracking never reaches agency tracking. Cannot show data (BREAKS for the agency feature)

- Driver GPS writes `driver_locations` (`DriverTripPage.tsx:165-185`, `sb:491-499`). That table is read by customer and shipment stakeholders (`supabase/migrations/20260418000000_secure_user_roles_and_customer_tracking.sql:84-95`).
- Agency live tracking reads `agency_tracking_pings` through `agency_trip_live` (`supabase/migrations/20261020000000_agency_tracking.sql:372-406`). Pings are written only by `tracking_ping_record` (`:85`, granted to `authenticated` at `:486`).
- `agencyTrackingApi.recordPing` (`services/agencyTrackingApi.ts:251-262`) is defined but has **no caller** anywhere in `frontend/src`. No driver page sends pings.
- **Conclusion:** the agency tracking UI can never show driver data today. The agency side reads `agency_tracking_pings` and nothing writes it.

**Feature to build (S-M).** In the GPS watch callback (`DriverTripPage.tsx:241-249`), also call `agencyTrackingApi.recordPing({ jobId, lat, lng, speedKmph, recordedAt })`. Use `position.coords.speed * 3.6` (already computed at `:175`). Throttle to one call per 30 seconds per job, because `tracking_ping_record` allows 120 pings per job per hour (`20261020000000_agency_tracking.sql:98`). The `recorded_at` value must be unique per job (`:22`). Placement: no new UI, just the existing "GPS tracking active" line (`DriverTripPage.tsx:~470-480` status block).

### 3.2 Consignment proof events: no driver path (BREAKS for proof-of-pickup and delivery in agency workflow)

- `agency_consignment_event(uuid, text, integer, text, text)` (`supabase/migrations/20261019000000_agency_consignments.sql:308`) requires `dispatcher` or `fleet_manager` scope (`:225-226`). A driver can never call it.
- The frontend caller is `agencyConsignmentsApi.ts:208` and is used only from the agency side.
- The driver does have a proof path already: `persist_driver_job_offer_progress` with OTP and photo fields (`services/driverTripProgress.ts:84`, `DriverTripPage.tsx:331-449`). It does not write consignment events.

**Feature to build (L, needs a migration).** Add a driver-scoped SECURITY DEFINER wrapper, for example `driver_consignment_event(p_job_id uuid, p_event text, p_idempotency_key text)`. It should resolve the caller's driver and job, verify the job is assigned and in the right step, and insert into `agency_consignment_events`. Placement: the existing step confirmations on `DriverTripPage.tsx` (arrived at pickup `:~320`, arrived at destination `:~363`). Do not expose the consignment QR (`agency_consignment_qr`, `:347`) to drivers.

### 3.3 Payroll lines: no driver screen (WRONG / missing feature)

- `agency_payroll_my_lines()` (`supabase/migrations/20261023000000_agency_payroll.sql:820`, granted to `authenticated` at `:860`) returns `{ok, lines[...]}` for the caller's driver.
- No file in `frontend/src` calls `agency_payroll_my_lines`. The only references are in `types/database.types.ts`.

**Feature to build (M, about 1 hour).** On `DriverEarningsPage.tsx`, add a "Pay statement" section below the summary cards (after `:~290`). Call `supabase.rpc('agency_payroll_my_lines')` through a new service method in `services/agencyPayrollApi.ts`. Show period dates, gross, adjustments, and net per line. Show a loading and empty state.

### 3.4 Invitation acceptance: driver path exists but has no in-app entry

- See 2.8. RPC `agency_driver_invitation_accept` exists (`20261011000000_agency_members_clients_tariffs.sql:1635`).
- **Feature (S).** Add "Join an agency" on `DriverProfilePage.tsx` (new row near `:280-345`) with a token field. Call `agencyInvitesApi.accept(token)` (`agencyInvitesApi.ts:127`). Reuse the same outcome messages.

### 3.5 Job offer push and notifications (WRONG / missing feature)

- Offers reach the driver only through realtime while the app is open (`DriverDashboardPage.tsx:~285-310`) and on window focus (`:~322-333`). The offer timer is 30 seconds (`:115`).
- `notificationsSupabaseApi` exists (`services/supabaseApi.ts:1128`) and works for customers (`layouts/MobileLayout.tsx:103-136`). Drivers have no equivalent.
- **Feature (S-M).** Add a bell to the `DriverLayout.tsx` mobile header (`:80-95`) that reuses `notificationsSupabaseApi.getNotifications` and `subscribeToNotifications`. Push delivery is a separate, larger item.

---

## 4. Top 10 fixes, ranked (safest and smallest first)

| # | Fix | Files | Effort | Severity |
|---|---|---|---|---|
| 1 | Add Sign Out to the mobile driver header or Profile. | `layouts/DriverLayout.tsx:80-95` (or `pages/DriverProfilePage.tsx`) | S | BREAKS |
| 2 | Wrap `fetchTrip` in try/catch, always clear `loading`, and show an error with Retry instead of "Trip Not Found" on network failure. | `pages/DriverTripPage.tsx:120-143`, `:472-473` | S | BREAKS |
| 3 | Clear `loading` when there is no driver ID or on error. Add an empty or error state. | `pages/DriverEarningsPage.tsx:59-65`, `:103` | S | BREAKS |
| 4 | Add `catch` with a toast in the withdrawal handler. | `pages/DriverDashboardPage.tsx:258-267` | S | WRONG |
| 5 | Remove `.limit(10)` from the wallet trip read and `.limit(5)` from the payout read. Use `getBalanceSnapshot` for the balance on Home. | `services/customerSupabaseApi.ts:764`, `:779`; `pages/DriverDashboardPage.tsx:198`, `:236-240` | S | WRONG |
| 6 | Mask bank account and UPI on Profile. | `pages/DriverProfilePage.tsx:316-317` | S | WRONG |
| 7 | Show an error state with Retry in trip history, instead of "No trips found" on failure. | `pages/DriverHistoryPage.tsx:69-71`, `:116` | S | WRONG |
| 8 | Replace raw status and ID fallbacks with labels: `{trip.status}` (`DriverDashboardPage.tsx:917`), `#{shipmentRef}` (`DriverEarningsPage.tsx:309`). Remove the "available near you", "24-48 hours", and "visible to customers" copy. | `pages/DriverDashboardPage.tsx:646`, `:668`, `:875`, `:917`; `pages/DriverEarningsPage.tsx:146`, `:309` | S | WRONG |
| 9 | Confirm driver pay basis (customer quote vs driver rate) with the owner, then change `estimated_cost` usage. | `pages/DriverDashboardPage.tsx:229-233`; `pages/DriverEarningsPage.tsx:153` | M | WRONG |
| 10 | Fix dead registration document links: store storage paths and read via the KYC flow, or drop the legacy upload. | `pages/DriverRegisterPage.tsx:89-93` | M | BREAKS |

Also worth doing soon (not in top 10): wire `tracking_ping_record` (3.1); validate pickup OTP before the photo step (`DriverTripPage.tsx:331-342`); enlarge the history and earnings tab tap targets (`DriverHistoryPage.tsx:99-100`, `DriverEarningsPage.tsx` tab row `~216-222`).

---

## 5. Feature ideas buildable in under an hour with existing backend

1. **Sign Out on phone** (fix 1). Existing `supabase.auth.signOut`.
2. **Tap a past trip to see its detail.** New read-only route using `driverTripsApi.getTripByIdForDriver` (`services/customerSupabaseApi.ts:661`). Hook the row in `DriverHistoryPage.tsx:123`.
3. **Live GPS pings for agency tracking.** Call `agencyTrackingApi.recordPing` (`services/agencyTrackingApi.ts:251`) from the GPS watch in `DriverTripPage.tsx:241-249`, throttled to 30 seconds (section 3.1).
4. **Join an agency with a code.** `agencyInvitesApi.accept` on Profile (section 3.4).
5. **Pay statement.** `agency_payroll_my_lines()` on Earnings (section 3.3). About one hour.
6. **Notifications bell.** `notificationsSupabaseApi` in the driver header (section 3.5).
7. **Masked bank and UPI display** on Profile (fix 6).

Not under an hour: driver-scoped consignment events (section 3.2, needs a migration), offline queue for trip progress, and push notifications for offers.

---

## 6. Not verified in this audit

- RLS policies on `drivers` (update `is_online`, register insert) and `job_offers` for the driver role.
- Behaviour in a real browser, at phone width, or with a real GPS signal.
- Whether `respond_to_job_offer` and `persist_driver_job_offer_progress` in their latest migrations match the call signatures used by the client.
- The `driver-kyc` edge function internals beyond the action names used by the client.
