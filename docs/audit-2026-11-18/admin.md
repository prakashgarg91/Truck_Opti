# Admin area audit - 2026-11-18

Read-only audit. No source, migration or config was changed. Severity: BREAKS (action fails or is dead), WRONG (misleading or unsafe), ROUGH (usability, copy, polish).

Scope: `/admin` routes in `frontend/src/App.tsx:160-172`, the admin nav in `frontend/src/layouts/MobileLayout.tsx:49-55`, pages `frontend/src/pages/Admin*Page.tsx` plus `DriverDetailPage.tsx` (routed under `/admin/drivers/:id`), `frontend/src/services/adminSupabaseApi.ts`, Edge functions `supabase/functions/admin-portal-*`, and the subscription/billing migrations they call.

## 1. Menu map and action trace

Route guard: `App.tsx:161` wraps all admin routes in `ProtectedRoute allowedRoles={['admin']}`. Every Edge function re-checks the caller's role server-side (`_shared/portal-auth.ts` `requireAdminContext`, or the local `requireAdmin` in `admin-portal-subscriptions/index.ts:94-145`, `admin-portal-users/index.ts:136-187`).

| # | Label (nav) | Route | Page | Service call (adminSupabaseApi.ts) | Edge function / RPC | Exists? |
|---|---|---|---|---|---|---|
| 1 | Admin Dashboard | `/admin` | `AdminDashboardPage.tsx` | `adminDashboardApi.getSnapshot` L262 | `admin-portal-dashboard` | Yes |
| 2 | Driver Approvals | `/admin/drivers` | `AdminDriversPage.tsx` | `getDriversByStatus` L337, `approveDriver` L347, `rejectDriver` L352, `suspendDriver` L357 | `admin-portal-drivers` (list/approve/reject/suspend) | Yes |
| 2b | (detail, not in nav) | `/admin/drivers/:id` | `DriverDetailPage.tsx` | `getDriverById` L342, approve/reject/suspend; KYC via `services/driverKycDocuments` | `admin-portal-drivers` get; `driver-kyc` review/access | Yes |
| 3 | Agency Approvals | `/admin/agencies` | `AdminAgenciesPage.tsx` | `adminAgenciesApi.getSnapshot` L209, `approve` L221, `reject` L226, `suspend` L231 | `admin-portal-agencies` | Yes |
| 4 | Users | `/admin/users` | `AdminUsersPage.tsx` | `getAdminUsers` L282, `banUser` L320, `unbanUser` L324, `deleteUser` L316 | `admin-portal-users` | Yes |
| 5 | Payouts | `/admin/payouts` | `AdminPayoutsPage.tsx` | `adminPayoutsApi.getAll` L239, `approve` L244, `reject` L249, `markAsPaid` L254 | `admin-portal-payouts` | Yes |
| 6 | Subscriptions | `/admin/subscriptions` | `AdminSubscriptionsPage.tsx` | `getAdminSubscriptions` L296, `reopenSubscription` L312 | `admin-portal-subscriptions` -> RPC `subscription_support_reopen` (`20261029000000_subscription_activation.sql:1057`) | Yes |
| 7 | Contact | `/admin/contact` | `AdminContactPage.tsx` | `getContactInquiries` L328, `resolveContactInquiry` L333 | `admin-portal-contact` | Yes |

Every button traced above resolves to an existing Edge function action. No dead route: all seven nav targets have a route and page. Dashboard shortcut buttons (`AdminDashboardPage.tsx:368-409`) all navigate to existing routes.

Dead button: the dashboard CSV/XLSX/JSON export buttons (see D1).

## 2. Per-page issues

### 2.1 Admin Dashboard (`AdminDashboardPage.tsx`, `admin-portal-dashboard/index.ts`)

- D1 BREAKS - `AdminDashboardPage.tsx:316-326`: CSV, XLSX and JSON export buttons always render, but `exportRows` is always `[]` (set at L97). Every click hits the guard at L113-116 and shows "No management data available to export". Hide or remove until data exists.
- D2 WRONG - `AdminDashboardPage.tsx:93-97`: `TODO: Add revenue trend and leaderboard calculations`. Revenue Trend (L256-283) and Top Driver Earnings (L292-293) are hard-wired empty, so the UI always says "No revenue data yet" and "No delivered driver trips yet" even when delivered jobs exist.
- D3 WRONG - `AdminDashboardPage.tsx:243` and `supabase/functions/admin-portal-dashboard/index.ts:170`: "Estimated Platform Revenue (10%)" uses a hard-coded `totalRevenue * 0.10`. No setting holds the commission rate. The rate is also baked into the label.
- D4 WRONG - `admin-portal-dashboard/index.ts:88-92`: agency revenue sums the agency job `fare`, but driver revenue sums `shipments.estimated_cost` (an estimate). "Delivered Revenue" (`AdminDashboardPage.tsx:169`) therefore mixes fares with estimates. Confirm the intended definition before trusting the number.
- D5 WRONG - `AdminDashboardPage.tsx:85-103`: on failure there is only a toast (L100). The KPI cards stay at zero (L165-236) and the page is indistinguishable from a real zero day. No error state, no retry except the refresh icon.
- D6 ROUGH - `AdminDashboardPage.tsx:209,217`: "Agencies" and "Drivers" count every status (pending, rejected included), not approved only (`admin-portal-dashboard/index.ts:53-54`). Label should say "total" or count approved.
- D7 ROUGH - `admin-portal-dashboard/index.ts:37-68`: every load reads all delivered agency jobs, all agency job shipment ids and all shipments with `created_by`, with no date bounds. Will not scale.
- D8 ROUGH - `AdminDashboardPage.tsx:153` titles the page "Platform Analytics" while the nav says "Admin Dashboard" (`MobileLayout.tsx:49`).

### 2.2 Driver Approvals and Driver Detail (`AdminDriversPage.tsx`, `DriverDetailPage.tsx`, `admin-portal-drivers/index.ts`)

- DR1 WRONG - `AdminDriversPage.tsx:140-170`: the CSV export downloads PAN, Aadhaar last 4, bank account, IFSC and UPI for every row on screen, with no confirmation. Remove the bank/IFSC/UPI/Aadhaar columns or gate the download.
- DR2 WRONG - `AdminDriversPage.tsx:72-83` with empty state at L229-236: a failed load shows "No pending drivers", the same as a genuinely empty queue.
- DR3 WRONG - `AdminDriversPage.tsx:87-98` and `admin-portal-drivers/index.ts:106-125`: Approve on the list calls `approveDriver` directly. Neither the list nor the server checks KYC. The detail page does enforce a shortfall confirm (`DriverDetailPage.tsx:221-233`). The list is a bypass of that control.
- DR4 ROUGH - `AdminDriversPage.tsx:291-321` and `DriverDetailPage.tsx:656-680`: a rejected driver has no action anywhere. Reinstate exists only for `suspended` (`DriverDetailPage.tsx:671`). Dead end.
- DR5 ROUGH - `AdminDriversPage.tsx:59`: `vehicleLabel` falls back to the raw enum code for unknown types.
- DR6 ROUGH - `AdminDriversPage.tsx:185-191,242-270`: the list shows no KYC status, so the admin cannot see which drivers still lack documents before approving.

### 2.3 Agency Approvals (`AdminAgenciesPage.tsx`, `admin-portal-agencies/index.ts`)

- A1 WRONG - `admin-portal-agencies/index.ts:107-151`: approve, reject and suspend update by `id` only, with no status precondition. The UI offers Reject only on pending (`AdminAgenciesPage.tsx:300-319`), but the API accepts rejecting an approved agency. Add `.eq('status', <expected>)` guards and check the row count.
- A2 WRONG - `admin-portal-agencies/index.ts:111-112`: approve sets `approved_at` to now. Reinstate (`AdminAgenciesPage.tsx:330-339`) reuses approve, so reinstating overwrites the original approval date.
- A3 WRONG - `AdminAgenciesPage.tsx:53` with empty state at L223: a failed load shows "No pending agencies" after the toast.
- A4 ROUGH - `AdminAgenciesPage.tsx:320-339`: the Rejected tab has no action, so a rejected agency cannot be re-approved from the UI even though `approve` would accept it (`admin-portal-agencies/index.ts:107-125`).
- A5 ROUGH - `admin-portal-agencies/index.ts:43-47`: `rejectionReason` is only type-checked, so an empty string is accepted by the API. The UI trims and blocks it (`AdminAgenciesPage.tsx:81`).

### 2.4 Users (`AdminUsersPage.tsx`, `admin-portal-users/index.ts`)

- U1 WRONG - `AdminUsersPage.tsx:97` and empty state at L235-241: a failed load shows "No users found".
- U2 WRONG - `AdminUsersPage.tsx:305-306`: a green check icon is rendered next to the mail icon for every user. Nothing in the data says the email is verified, so it reads as a verified state that is not known.
- U3 WRONG - `admin-portal-users/index.ts:306`: delete is `auth.admin.deleteUser(id, false)`, a hard delete. There is no pre-check for a linked agency, driver or live subscription. The confirm copy (`AdminUsersPage.tsx:65`) says it "cascades through linked profile data". This audit did not verify the cascade.
- U4 ROUGH - `AdminUsersPage.tsx:302`: "Joined" is hard-coded English in a bilingual app.

### 2.5 Payouts (`AdminPayoutsPage.tsx`, `admin-portal-payouts/index.ts`)

- P1 WRONG - `AdminPayoutsPage.tsx:116-125`: `handleMarkPaid` has `try/finally` and no `catch`. A failed "Mark Paid" shows no toast and the error is left unhandled. Approve (L84-96) and Reject (L98-114) both have a catch.
- P2 WRONG - `AdminPayoutsPage.tsx:280-304`: Approve and Mark Paid run with no confirmation. "Mark Paid" records a money movement, and the Edge function accepts only `payoutId` (`admin-portal-payouts/index.ts:120-129`). No transfer reference (UTR) is captured.
- P3 WRONG - `AdminPayoutsPage.tsx:311-316`: a rejected payout shows "Reason provided" when `rejection_note ?? note` is set. The fallback can show the driver's own request note as the reason. The reason is only in a tooltip (`title`), so it is not readable by keyboard or touch.
- P4 ROUGH - `AdminPayoutsPage.tsx:217-221`: a failed load shows "No payouts found" after the toast (L48-50).
- P5 ROUGH - `admin-portal-payouts/index.ts:57-69`: unbounded list, no paging or date filter.
- P6 ROUGH - `AdminPayoutsPage.tsx:252-255` and `admin-portal-payouts/index.ts:59-60`: the payee's UPI/bank is not selected, so the admin cannot see where to pay.

### 2.6 Subscriptions (`AdminSubscriptionsPage.tsx`, `admin-portal-subscriptions/index.ts`, `logic.ts`)

- S1 WRONG - `AdminSubscriptionsPage.tsx:68-72`: on failure the snapshot is reset to `EMPTY_SNAPSHOT`. The page then shows "No subscriptions yet" (L310-316) and "Nothing needs attention." (L216). A failed load reports a clean ops queue. Keep the last good data and show an error state with retry.
- S2 ROUGH - `admin-portal-subscriptions/index.ts:228` and `:233`: refused payments and refund exceptions are silently capped at 200 rows. "Nothing needs attention" is only true below the cap.
- S3 ROUGH - `AdminSubscriptionsPage.tsx:229` and `:246`: copy says "Refund or resolve it in Razorpay" and "Reconcile by hand", but nothing in the app marks an item handled. The list never clears.
- S4 ROUGH - `AdminSubscriptionsPage.tsx:282-307`: the reopen confirm is a `role="alertdialog"` with no focus move or Escape handling.
- S5 ROUGH - `admin-portal-subscriptions/logic.ts:152` and UI copy at `AdminSubscriptionsPage.tsx:288`: the reopen RPC requires the agency to be `approved` (`20261029000000_subscription_activation.sql`, `agency_not_operational`). The UI never says so before the admin clicks.

### 2.7 Contact (`AdminContactPage.tsx`, `admin-portal-contact/index.ts`)

- C1 WRONG - `AdminContactPage.tsx:26-29` and empty state at L105-108: a failed load shows "No inquiries found".
- C2 WRONG - `admin-portal-contact/index.ts:57-67`: resolve has no row-count check (no `.select()`). An unknown id returns "Inquiry resolved" and the UI marks it resolved locally (`AdminContactPage.tsx:43`).
- C3 ROUGH - `AdminContactPage.tsx:150-161`: the only action is "Mark Resolved". No reply (for example a `mailto:` link), no reopen.
- C4 ROUGH - `AdminContactPage.tsx:17-19`: `document.title` is hard-coded English and re-set on language change.

### 2.8 Shell

- N1 ROUGH - `MobileLayout.tsx:49-55`: no pending-count badges on Driver/Agency approvals or Payouts, so queues are invisible from the nav.

## 3. Operations gaps for a paid SaaS

| # | Gap | Backend that exists (file) | Admin UI today | Suggested placement | Effort |
|---|---|---|---|---|---|
| G1 | Billing settings (legal name, GSTIN, address, state, SAC, enforcement toggle) | Read: table `platform_billing_settings`, admin SELECT policy (`20261028000000_subscription_gst.sql:94-100`). Write: RPC `platform_billing_settings_update` (L102-143, grants L619-620). Quoting needs gstin, state_code and legal_name (`20261029000000_subscription_activation.sql:350-351`). | None. grep finds no reference in `frontend/src`. | Card at top of `/admin/subscriptions` ("Billing settings") | M |
| G1 note | The RPC checks `auth.uid()` and `is_admin_user`, so it fails under service_role (`auth.uid()` is null). An Edge action must call it with the caller's JWT client, as `requireAdmin` already builds `authClient` (`admin-portal-subscriptions/index.ts:101-111`), not the service client. | | | | |
| G2 | Enforcement switch and "agencies without a live subscription" | `enforcement_enabled` default FALSE, seeded (`20261028000000_subscription_gst.sql:45, 68-70`). Launch rule: agencies with no subscription row become read-only and dispatch-locked once enforcement is ON (`20261027000000_subscription_limits.sql:18-19`). | None. | Filter chip on subscriptions page, plus the G1 card toggle | S (list), M (toggle) |
| G3 | Subscription coupons | Table `subscription_coupons` (`20261029000000_subscription_activation.sql:41-57`), service_role SELECT only, seeded `FOUNDING50`. No create, list or disable RPC. | None. | "Coupons" tab on subscriptions page; new admin RPC with `is_admin_user` check | M |
| G4 | Refund exceptions | Append-only `subscription_refund_exceptions` (activation L164) | Read-only list (`AdminSubscriptionsPage.tsx:236-252`). No acknowledge. | Add a resolution table (append-only, like the source) and a "Mark handled" button | M |
| G5 | Refused payments | `payment_history.metadata.refusal` (read in `admin-portal-subscriptions/index.ts:223-228`) | Read-only list (L219-235). No dismissal. | Same resolution pattern as G4 | S-M |
| G6 | Razorpay webhook ledger | `razorpay_webhook_events` (`20261030000000_razorpay_webhook_events.sql:36-50`, service_role SELECT L73) and `razorpay_webhook_attempts` (L77-94, SELECT L94) | None. | "Webhooks" tab: list of event_type, result, error, received/processed time; filter result != success | S |
| G7 | Subscription sweep runs | `subscription_sweep_runs` (`20261031000000_subscription_sweeps.sql:18-28`, SELECT for service_role L47). Hourly cron `truckopti-subscription-sweeps` (L226). | None. | Small table under ops attention: last 20 runs, counts, finished_at | S |
| G8 | Agency approval | `admin-portal-agencies` approve/reject/suspend (works) | Works (AdminAgenciesPage) but see A1-A4 | Fix guards first | S |
| G9 | Driver KYC review | `driver-kyc` `review` and `access` actions, admin only (`driver-kyc/index.ts:121, 140, 307`) | Works on detail page (`DriverDetailPage.tsx:365-600`). Not on list. | Show KYC status column in DR6 | S |
| G10 | Payout approve, reject, mark-paid | `admin-portal-payouts` (works, guarded by status) | Works, see P1-P6. No reference capture. | Add transfer reference field to mark-paid (new column needed: M) | M |
| G11 | Support reopen | RPC `subscription_support_reopen` (`20261029000000_subscription_activation.sql:1057-1110`), edge `admin-portal-subscriptions/index.ts:285-300` | Works (`AdminSubscriptionsPage.tsx:282-307, 403-409`) | None | none |
| G12 | Subscription sale invoices and credit notes | `subscription_invoices` (`20261028000000_subscription_gst.sql:364`), `subscription_credit_notes` (L414) | None for admin. Agency-side RPC only (`20261033000000_subscription_invoice_read.sql`). | "Invoices" tab, read-only | M |
| G13 | Backfill invoice delivery | Edge function `admin-backfill-invoice-delivery/index.ts` (admin-only, not `admin-portal-*`) | No screen; no reference in `frontend/src`. | Ops-only; document or add a button | S |

## 4. Ranked top-10 fix list

Ordered smallest and safest first, except #10 which is a launch blocker and therefore M.

1. P1 - Add catch and toast to Mark Paid. `frontend/src/pages/AdminPayoutsPage.tsx:116-125`. S.
2. S1 - Stop resetting the subscriptions snapshot on error; add error state with retry. `AdminSubscriptionsPage.tsx:68-72, 155-156, 310-316`. S.
3. D1 - Hide the export buttons when `exportRows` is empty, or remove them. `AdminDashboardPage.tsx:316-326`. S.
4. U1, C1, A3, DR2, P4, D5 - Replace "empty on error" with one shared error state and Retry. Files as cited in sections 2.1-2.7. M in total, S per page.
5. DR1 - Remove bank, IFSC, UPI and Aadhaar columns from the driver CSV, or require confirm. `AdminDriversPage.tsx:141-158`. S.
6. A1, A2 - Add status preconditions and row-count checks to approve/reject/suspend; stop overwriting `approved_at` on reinstate. `supabase/functions/admin-portal-agencies/index.ts:107-151` (L111-112). S.
7. C2 - Add a row-count check to resolve. `supabase/functions/admin-portal-contact/index.ts:57-67`. S.
8. U2 - Remove the unconditional green check icon. `AdminUsersPage.tsx:305-306`. S.
9. D3 - Stop hard-coding 10%: read the rate from settings or relabel "Estimated (illustrative rate)". `AdminDashboardPage.tsx:243`, `admin-portal-dashboard/index.ts:170`. S.
10. G1 - Billing settings card (launch blocker: no sale can be quoted without it). Read via RLS select, write via `platform_billing_settings_update` using the caller's JWT client. Files: new section in `AdminSubscriptionsPage.tsx`, new action in `admin-portal-subscriptions/index.ts`, `adminSupabaseApi.ts`. M.

Also decide before enabling enforcement: DR3 (KYC gate on approve) and U3 (hard-delete precheck).

## 5. Features buildable in under an hour each (existing backend)

- F1 Sweep runs table - new action `sweep-runs` in `admin-portal-subscriptions` selecting `subscription_sweep_runs` (service client; SELECT granted, `20261031000000_subscription_sweeps.sql:47`). Render on subscriptions page.
- F2 Webhook events table - new action `webhook-events` selecting `razorpay_webhook_events` (cols per `20261030000000_razorpay_webhook_events.sql:36-50`), filter `result <> 'success'`.
- F3 Agencies without live subscription - approved `transport_agencies` minus agency_ids with a subscription in trial, active, past_due or grace. Add as a filter chip. Needed before enforcement.
- F4 Payout destination on the payouts list - add `upi_id` to `drivers(...)` in `admin-portal-payouts/index.ts:60,80,105,128` and show it. Keep bank details out of the list.
- F5 Approve from Rejected tab - UI only, on `AdminAgenciesPage.tsx` and `AdminDriversPage.tsx`, using existing approve endpoints. Do after A1 guards decision.
- F6 Contact reply link - `mailto:` on `AdminContactPage.tsx` footer. UI only.
- F7 Billing settings read-only panel - select `platform_billing_settings` with the user JWT client (RLS policy at `20261028000000_subscription_gst.sql:94-100`).

## 6. Caveats

- Static read only. Nothing was deployed, run or queried against a live database. Behaviour claims come from code and migrations.
- Revenue definitions (D4) and the cascade on user hard-delete (U3) need owner confirmation or a database check.
- The Edge function deployment state and the cron jobs' live status were not checked.
- `DriverDetailPage.tsx` was checked for the approve, reject, suspend, reinstate and KYC paths only; the full file was not reviewed line by line.
