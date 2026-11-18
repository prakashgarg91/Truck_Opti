# Agency money and settings audit (2026-11-18)

Read-only audit. No source, migration or function was changed; no commits.
Method: read `frontend/src/layouts/AgencyLayout.tsx`, `frontend/src/lib/agencyAccess.ts`, the money and settings pages, their services in `frontend/src/services/`, and grepped `supabase/migrations` and `supabase/functions` for every RPC, table and Edge function named by those services.

Severity: BREAKS = wrong result, data split or missing backend; WRONG = misleading or incorrect copy/logic; ROUGH = polish, mobile or consistency.

---

## 1. Menu items: label, route, page, visibility

Menu source: `AgencyLayout.tsx:17-24` (NAV, also the mobile bottom bar) and `:27-39` (MORE_NAV, desktop sidebar only). Visibility: `agencyAccess.ts:36-54` (ROUTE_ACCESS), read via `canRead`, act via `canAct`. Owner always passes.

| Label | Route | Page file | Read | Act | Backend |
|---|---|---|---|---|---|
| Billing (NAV, mobile) | /agency/billing | pages/AgencyBillingPage.tsx | finance | finance | Edge agency-portal-billing |
| Rates (NAV, mobile) | /agency/rates | pages/AgencyRatesPage.tsx | finance | finance | Edge agency-portal-rates |
| Clients (MORE) | /agency/clients | pages/AgencyClientsPage.tsx | all | finance | RPC agency_client_* |
| Tariffs (under Clients) | /agency/clients/:agreementId/tariffs | pages/AgencyTariffsPage.tsx | all | finance (agencyAccess.ts:45) | RPC agency_tariff_version_publish |
| Invoices (MORE) | /agency/invoices | pages/AgencyInvoicesPage.tsx | all | finance | RPC agency_invoice_issue, agency_invoice_record_payment, agency_invoice_cancel; tables agency_invoices, agency_invoice_lines, agency_invoice_payments |
| Expenses (MORE) | /agency/expenses | pages/AgencyExpensesPage.tsx | all | fleet_manager, finance | RPC agency_expense_record, agency_expense_summary, agency_fuel_fill_record, agency_maintenance_item_upsert, agency_maintenance_service_done |
| Payroll (MORE) | /agency/payroll | pages/AgencyPayrollPage.tsx | finance | finance | RPC agency_payroll_open_period, _close_period, _adjust, agency_driver_rate_set; tables agency_payroll_periods, _lines, _adjustments |
| ERP (MORE) | /agency/erp | pages/AgencyErpPage.tsx | dispatcher | dispatcher | RPC agency_erp_connection_create, _rotate_secret, _set_status; table agency_erp_events; ingest Edge erp-ingest |
| Subscription (MORE) | /subscription | pages/SubscriptionPage.tsx | all | owner | RPC agency_subscription_entitlement, _invoices, _start_trial |
| Profile (sidebar foot and mobile header) | /agency/profile | pages/AgencyProfilePage.tsx | all | owner | Edge agency-portal-dashboard (getSnapshot) |
| Team (MORE, not money) | /agency/team | AgencyTeamPage.tsx | owner | owner | RPC agency_member_* |

Not in the menu but in scope:

| Route | Page | Reached from | Access |
|---|---|---|---|
| /settings/company (App.tsx:156) | pages/CompanyProfilePage.tsx | Profile page buttons (AgencyProfilePage.tsx:128, 187) | any signed-in user, no agency gate |
| /pricing (App.tsx:112) | pages/PricingPage.tsx | SubscriptionPage.tsx:114 | public |
| /checkout (App.tsx:113) | pages/CheckoutPage.tsx | PricingPage.tsx:272 | signed in |
| /invite/:token (App.tsx:123) | pages/AcceptInvitePage.tsx | email link | signed in |
| /agency/register (App.tsx:122) | AgencyRegisterPage.tsx | Dashboard | public |

Notifications has no page. The bell is in the layout (AgencyLayout.tsx:132-146 desktop, :208-219 mobile).

---

## 2. Action trace (button, service, backend)

Every backend name below was confirmed present in `supabase/migrations` (function definition found, table created) or `supabase/functions`. Nothing in this list is missing from the repo.

- Invoices: issue (agencyInvoicesApi, RPC agency_invoice_issue), record payment (RPC agency_invoice_record_payment), cancel (RPC agency_invoice_cancel), list/detail (tables agency_invoices, agency_invoice_lines, agency_invoice_payments, agency_client_agreements). UPI link is client-side only (lib/freightInvoice buildUpiLink, never stored). Backend present.
- Expenses: record expense, fuel fill, maintenance upsert and service-done, summary. All RPCs present. Backend present.
- Payroll: open/close period, adjust, rate set, lines. RPCs present. CSV is client-side (lib/payrollCsv.ts). Backend present.
- ERP: create connection, rotate secret, set status (pause/resume/revoke), events list. RPCs present. Ingest is the Edge function erp-ingest, present.
- Subscription: entitlement, invoices, start trial (RPCs present); invoice PDF is client-side jsPDF (SubscriptionPage.tsx:46-84). Checkout: create-razorpay-order, verify-razorpay-payment (Edge, present).
- Billing: list via Edge agency-portal-billing (present). Export CSV/JSON/XLSX client-side. "Invoice" PDF client-side.
- Rates: list, add, update, delete via Edge agency-portal-rates (present), which writes table **agency_rate_cards**. **No migration creates this table** (grep of supabase/ for "rate_cards" returns nothing). See BREAKS below.
- Tariffs: publish via RPC agency_tariff_version_publish (present).
- Invite accept: RPC agency_member_accept, agency_driver_invitation_accept (present).
- Profile snapshot: Edge agency-portal-dashboard (present).
- Company settings save: supabase.auth.updateUser (user metadata only), not an agency table. See BREAKS below.

---

## 3. Issues by page

### 3.1 Billing (/agency/billing), pages/AgencyBillingPage.tsx

- BREAKS: "Invoice" button (per delivered job) generates a PDF titled "TruckOpti Tax Invoice" with invoice number `TRK-<job id>` (`:134-156`, number at `:138`). It has no GSTIN, no SAC/HSN, no buyer details, and is not stored. It can contradict the real GST invoice numbered in /agency/invoices. Finance would hand this to clients.
- WRONG: "GSTR-1" buttons (`:52-58`, labels at `:56`) export a per-job earnings CSV/JSON/XLSX. They are not GSTR-1 data. Copy at `:237` ("Full GSTR-1 export with SAC 996511 classification coming in Phase 4") admits the feature is missing while the buttons are live.
- WRONG: "GST Due (5%)" card (`:201`) is backed by `Math.round(thisMonth * 0.05)` in the Edge function (`supabase/functions/agency-portal-billing/index.ts:78`). It ignores agency_invoices, input credit and the rate actually charged on invoices.
- WRONG: GST rate hard-coded at 5% (`:36`). The invoices page default is 18% (`AgencyInvoicesPage.tsx:111`) and offers 0/5/12/18 (`:36`). Two rates for the same agency.
- WRONG: "This Month" and "In Progress Value" are sums of `agency_jobs.fare` (edge fn lines 41-60), not invoiced or collected amounts. The title "Billing & Invoices" (`:171`, `:191`) promises invoices that this page does not issue.
- WRONG: the monthly export filter matches `updated_at` month (`buildExportRows`, around `:80-86`), not the delivery date.
- ROUGH: `formatCurrency` drops paise (`:198-201`, from utils/formatters.ts:24-35). A GST due of Rs 1,234.50 shows Rs 1,235. The PDF beside it shows paise (`:151`). Subtotal in the PDF has no paise (`:150`).
- ROUGH: `toLocaleDateString('en-IN')` in the PDF (`:139`); the table uses it too (`:272`).
- ROUGH: "JSON" export offered to finance users (`:108`, format buttons).
- ROUGH: "Thank you for using TruckOpti!" footer (`:155`) on a tax-looking document.
- ROUGH: jsPDF default font (Helvetica) does not carry the rupee glyph; the Rs symbol in the PDF may render wrong. Verify with a generated PDF before relying on it.
- Duplicate: this page and /agency/invoices both claim "invoices". See section 5.

### 3.2 Invoices (/agency/invoices), pages/AgencyInvoicesPage.tsx

The most complete money page. Issues:

- BREAKS (compliance): no SAC/HSN on the invoice. `agency_invoices` (migration 20261021000000_agency_invoices.sql, lines 12-37) and `agency_invoice_lines` (lines 54-63) have no SAC/HSN column; the line form (`:521-545`) takes only description, quantity, rate. A GST freight invoice needs the service classification. The Billing page copy (`:237`) says SAC is "Phase 4".
- BREAKS (compliance): supplier GSTIN is not captured or defaulted. The supplier state code is typed by hand (`:560-561`, placeholder `27`). The company profile (see 3.9) does not feed it.
- WRONG: GST default 18% (`:111`, reset to 18 at `:232`). For road goods transport the usual rates are 5% or 12%. Confirm with the agency's CA before shipping, but the default is unlikely to be right for most freight.
- ROUGH: no print or PDF of the issued invoice, no CSV export, no receipt. Invoice list is text only.
- ROUGH: date shown with browser default `toLocaleDateString()` (`:638`), not en-IN like the rest of the page.
- ROUGH: client falls back to literal "Client" if the agreement is missing (`:638`, `:660`).
- ROUGH: "Round off to the nearest rupee" (`:576`) has no explanation of when the total changes.
- Good: loading, error and Retry states exist (`:141-154`, `:411-415`, `:682`); empty state (`:623`); payment overpayment message (`:306-308`, `:342`); idempotency and version conflict handled via refusal messages.

### 3.3 Expenses (/agency/expenses), pages/AgencyExpensesPage.tsx

- WRONG: copy names a page that does not exist: "Add a truck on the Trucks page before recording fuel" (`:716`) and again for maintenance (`:975`). The real page is Fleet (`/agency/fleet`). Link it.
- ROUGH: no export of expenses (no CSV, no downloadCsv use). `utils/dataExport.ts:28` already provides downloadCsv.
- ROUGH: raw ISO dates shown: `{f.filled_on}` (`:740`, `:814`) and `filled_on` in the fuel history line. Format as "17 Nov 2026".
- ROUGH: driver_allowance category (`CATEGORY_LABEL` `:43-51`) is recorded here but never reaches payroll (see 3.4 and section 6).
- Good: money in paise via formatPaise (`:572-624`) with the Asia/Kolkata date helper (`:74-76`); loading, empty and error states exist.

### 3.4 Payroll (/agency/payroll), pages/AgencyPayrollPage.tsx

- BREAKS (journey): no link to driver payouts. Drivers are paid from the Drivers page via `agencyDriversApi.createPayout` (AgencyDriversPage.tsx:181-186, RPC agency_driver_payout_request). Payroll period detail (`:626-770`) never shows what was paid out, so a closed period cannot be reconciled against payouts.
- WRONG: period header shows raw ISO dates: `Period {selected.period_start} to {selected.period_end}` (`:626`). Format as dates.
- ROUGH: copy points to "the Drivers page" (`:502`) without a link.
- ROUGH: CSV download (`:415-441`, button `:731-732`) is the only export; the on-screen money is formatInr (`:523-525`, `:756-768`) and the CSV is plain digits (lib/payrollCsv.ts:20-26). Both are correct; they are just not explained.
- Good: CSV guarded against formula injection (lib/payrollCsv.ts:9-15); state gates for closing (`:700-720`); loading and Retry (`:475-493`, `:643`).

### 3.5 ERP (/agency/erp), pages/AgencyErpPage.tsx

- ROUGH: last-event time uses browser default `d.toLocaleString()` (`:86`), not en-IN, no zone label.
- ROUGH: integration instructions show the literal placeholder `SUPABASE_URL` in the example (`:688-690`). The user has no way to fill it in from this page; the copy says "provided by your account manager". Show the real function URL or a copy button.
- ROUGH: route is dispatcher-only (agencyAccess.ts:53) and appears only in the desktop MORE list (AgencyLayout.tsx:37). A dispatcher on mobile cannot reach it. See section 4.
- Good: the secret is shown once and never read back (`:20-24`, `:365-391`); copy failure is handled (`:298-305`); retry on events (`:609`).

### 3.6 Subscription (/subscription), pages/SubscriptionPage.tsx

- Good: loading, error and empty states; invoice PDF has a clear "not stored" disclaimer (`:82`); "GST extra at 18%" copy (`:222`) is consistent with platform pricing.
- ROUGH: back button is `navigate(-1)` with no fallback (`:136`); a direct visit has no back target.
- ROUGH: the page is labelled "Subscription" in the menu (AgencyLayout.tsx:38) but lives outside /agency, so staff and owners see the agency sidebar while on it. Acceptable, but say so in the copy or move under /agency/subscription.

### 3.7 Checkout (/checkout) and Pricing (/pricing)

- ROUGH: test-mode banner (`CheckoutPage.tsx:241-244`) is driven by `razorpayConfig.isTestMode`. Confirm the production build never shows it to paying agencies.
- WRONG (data): config/pricing.ts holds static launch prices (`:123-216`) and internal cost multipliers in comments (`:154`, `:184`, `:215`). lib/billingState.ts:464-467 keeps a second copy of the prices as "FALLBACK". Three sources of truth (DB subscription_plans, config, fallback). Prices agree today; they will drift.
- WRONG (unused data, copy risk): `COMPETITIVE_PRICING` (config/pricing.ts:327-332, with competitor price ranges) is not imported by any page. PricingPage.tsx imports only PRICING_TIERS (line 5). Delete it or source it; unsourced competitor ranges must not reach users.
- ROUGH: "Two months free" (lib/billingState.ts:461, PricingPage.tsx:86, `:205`) is correct arithmetic for the stored yearly prices, but it is hard-coded text, not derived.

### 3.8 Rates (/agency/rates), pages/AgencyRatesPage.tsx

- BREAKS (backend): the page reads and writes table `agency_rate_cards` (supabase/functions/agency-portal-rates/index.ts:119, 134, 160, 174, 188, 202). No migration in `supabase/migrations` creates it (grep returns nothing). On a database built from the repo, every list, add, toggle and delete fails, and the page shows "We couldn't load your rate cards" (AgencyRatesPage.tsx, testid rates-error). Confirm in the live project, then add the migration.
- WRONG (purpose): nothing else in the repo reads agency_rate_cards (grep: only the Edge function). Rate cards do not feed job fares, orders or tariffs. The page says "let customers see your freight pricing" (empty state), which nothing does.
- WRONG (duplicate): per-client tariffs (/agency/clients/:id/tariffs, AgencyTariffsPage.tsx) are the working rate system. See section 5.
- ROUGH: rates shown raw as `₹{rate.rate_per_km}/km` (`:340`), so 1500 is not grouped and never gets paise. Flat rate uses formatCurrency (`:345`, no paise).
- ROUGH: no edit. Only toggle and delete (`:111`, `:123`). A typo means delete and re-add.
- ROUGH: no check that min weight is not above max weight (validation `:78-84` covers only cities and one rate).
- ROUGH: delete uses native `confirm()` (`:123`).
- ROUGH: validity date shown via en-IN (`:357`); the add form does not default the valid-until date.

### 3.9 Profile and company settings (/agency/profile and /settings/company)

- BREAKS (split identity): the company settings page saves GSTIN, PAN, address and phone to the login account only: `supabase.auth.updateUser({ data: { company: ... } })` (CompanyProfilePage.tsx:92-100). Its load reads user metadata only (`:57-62`). It never writes `transport_agencies`. The agency profile reads the agency row (AgencyProfilePage.tsx:76) and shows "GSTIN: Missing" (`:240`) even after the user saved a GSTIN in Company Settings. Invoices do not read it either (see 3.2). Two sources of GST identity; the one that matters for invoices is never written. The copy "Invoice, GST and business identity details" (AgencyProfilePage.tsx:191) promises a use it does not have.
- WRONG (label): "Refresh Snapshot" (AgencyProfilePage.tsx:228-231) navigates to /agency/dashboard. It refreshes nothing; it is a link with a refresh label.
- WRONG (duplicate): "Billing" tile (`:203-207`, copy "Collections, invoices and earnings visibility") opens /agency/billing, the fake-invoice page, not /agency/invoices.
- WRONG (access copy): the profile's "Owned agency settings" tiles are shown to every role, but the save action is owner-only. Staff see a company settings page they cannot change, with no read-only note. (CompanyProfilePage has no access check at all; agencyAccess.ts has no /settings/company entry.)
- ROUGH: "Missing" printed for absent fields (`:239-248`). Use "Not added yet" with a link to fix it.
- ROUGH: CompanyProfilePage includes BackupSection (`:281`), a device-backup feature, inside a GST identity form.
- Good: company page validates GSTIN and PAN format before save (`:79-86`).

### 3.10 Notifications (bell, AgencyLayout.tsx)

- BREAKS (staff): the realtime new-job subscription looks up the agency by `transport_agencies.user_id = auth user` (`AgencyLayout.tsx:69-73`). Staff members are linked through agency memberships, not as the owner. A staff user with a dispatcher or finance role never gets the new-job count. Look up via the membership (agency_memberships / agency_caller_agencies) instead.
- WRONG (label): the desktop row is labelled "Notifications" (`:133`) but shows only a count of new jobs; there is no notification list, no link to money events (invoice paid, payroll closed, ERP rejected).
- ROUGH: the count is local state (`:51`, `:85`, `:107`), resets on reload, and counts INSERTs only.
- ROUGH: title "New Jobs" is English-only hard-coded (`:137`, `:211`).
- Good: the subscription is skipped when Supabase is not configured (`:62`).

### 3.11 Invitation acceptance (/invite/:token), pages/AcceptInvitePage.tsx

- Good: all outcomes covered (loading `:52-60`, accepted, limit, failed); one accept per visit (`:37-50`, the `started` ref), explicit Try again only for `unavailable`; token kept out of logs.
- ROUGH: `wrong_account` ("Different account", `:19`) has no action. The user needs "Sign out and sign in with the invited email". The only button is "Go to my account" (`:137`) which goes to /.
- ROUGH: `sign_in_required` (`:22`) reaches a failure screen with "Go to my account", though ProtectedRoute should send signed-out visitors to /login first.
- ROUGH: failure messages come from INVITE_FAILURE_MESSAGES (services/agencyInvitesApi.ts:32-), which is fine copy, but the page never shows the agency name, so the user cannot tell which invitation they opened.

---

## 4. Route and menu coverage

Menu entries with no mobile entry (MORE_NAV only, AgencyLayout.tsx:26 comment and `:264-278`): Team, Clients, Orders import, Load plan, Consignments, Invoices, Expenses, Tracking, Payroll, ERP, Subscription. There is no "More" sheet on mobile. A finance user on a phone reaches only Billing and Rates; invoices, expenses and payroll are desktop-only. Severity ROUGH to BREAKS for finance staff on mobile.

/agency routes with no menu entry: /agency/profile (reached via sidebar foot and mobile header, AgencyLayout.tsx:170-181 and `:220-225`, which is acceptable); /agency/clients/:agreementId/tariffs (reached from Clients, AgencyClientsPage.tsx:743, acceptable). /agency/register is public.

Menu entries that are hosted-only (need Supabase Edge functions): Home (agency-portal-dashboard), Fleet (agency-portal-fleet), Drivers (agency-portal-drivers), Jobs (agency-portal-jobs), Billing (agency-portal-billing), Rates (agency-portal-rates). Invoices, Expenses, Payroll, ERP, Clients, Tariffs, Team and Subscription call hosted RPCs and tables directly. No money page has a local-first branch. Only AgencyDashboardPage checks isSupabaseConfigured. The dashboard also links to /local-start, /management/trucks and /management/cartons (AgencyDashboardPage.tsx:143, 201, 208), which sit outside the agency layout.

---

## 5. Duplicate pages to retire or relabel

1. /agency/billing (AgencyBillingPage) vs /agency/invoices (AgencyInvoicesPage). Both say "invoices". Billing shows fake invoices and fare-based earnings; Invoices is the real GST engine. Recommend: retire Billing. Move its earnings cards into the Invoices header, delete the "Invoice" PDF button and the GSTR-1 labels, and redirect /agency/billing to /agency/invoices.
2. /agency/rates (AgencyRatesPage, unused table) vs /agency/clients/:id/tariffs (AgencyTariffsPage, used). Recommend: retire Rates after confirming no customer depends on agency_rate_cards; keep Tariffs.
3. Company Settings (/settings/company, metadata) vs Agency Profile (DB row). Recommend: one writer. Make Company Settings write transport_agencies through an owner-only RPC and read the agency row.
4. Profile "Billing" tile vs the Billing menu item: both point to the fake-invoice page; re-point to Invoices.

---

## 6. Journey gaps a finance person hits

- No invoice from a consignment or job. Invoice lines are free text (`AgencyInvoicesPage.tsx:521-545`; agency_invoice_lines has no job or consignment key). The only per-job invoice is the non-GST PDF on Billing.
- No client statement or outstanding list. Outstanding is per invoice (`:643-644`, `:672`). No per-client total, no ageing, no statement PDF.
- No payment receipt. Payments are stored (agency_invoice_payments) and listed (`:712-713`), but nothing prints or emails a receipt.
- No export on invoices, expenses or ERP events. Billing exports earnings only; payroll exports CSV only.
- No link between payroll and payouts. Payouts are made on the Drivers page (AgencyDriversPage.tsx:181-186); payroll never shows them.
- No link between driver allowance expenses and payroll. A driver_allowance expense (AgencyExpensesPage.tsx:43-51) does not reduce or add to a payroll period (agency_payroll_adjust only takes advances and deductions).
- No GST summary. The "GSTR-1" buttons are earnings exports (Billing `:52-58`). No HSN/SAC, no GST-rate split by month, no invoice register export.
- No buyer and supplier GSTIN on the issued invoice (see 3.2 and 3.9).

---

## 7. Top 10 fixes (smallest safe first)

1. Rename or fix "Refresh Snapshot" (AgencyProfilePage.tsx:228-231). Effort S. Files: AgencyProfilePage.tsx.
2. Replace owner-only copy on tariffs denial with the scope-aware title (AgencyTariffsPage.tsx:307, use access.deniedTitle as at `:105`). Effort S. Files: AgencyTariffsPage.tsx.
3. Fix the staff notification lookup (AgencyLayout.tsx:69-73) to resolve the caller's agency through membership, and relabel the bell "New jobs" (`:133`). Effort S-M. Files: AgencyLayout.tsx.
4. Replace "Trucks page" copy with a link to /agency/fleet (AgencyExpensesPage.tsx:716, `:975`) and change the payroll "Drivers page" copy to a link (`:502`). Effort S. Files: AgencyExpensesPage.tsx, AgencyPayrollPage.tsx.
5. Format dates consistently: raw ISO in expenses (`:740`, `:814`) and payroll (`:626`); browser-default dates in invoices (`:638`), ERP (`pages/AgencyErpPage.tsx:86`). Effort S. Files: the four pages.
6. Unify money helpers: use formatInr everywhere (AgencyBillingPage `:198-201`, AgencyRatesPage `:345`, AgencyProfilePage `:176`, `:268`); keep paise. Effort S. Files: three pages, utils/formatters.ts kept for non-money.
7. Add the missing migration for agency_rate_cards (columns match agency-portal-rates/index.ts insert `:132-148`, with RLS on agency_id and the finance scope). Confirm first whether the live project already has the table. Effort S-M. Files: new file under supabase/migrations, plus a test.
8. Remove the per-job "Invoice" PDF and the GSTR-1 labels from Billing (AgencyBillingPage.tsx:134-156, `:52-58`, `:237`); point the page at /agency/invoices. Effort S-M. Files: AgencyBillingPage.tsx, AgencyProfilePage.tsx `:203`.
9. Make Company Settings write the agency record through an owner-only RPC (CompanyProfilePage.tsx:92-100) and have invoices read supplier GSTIN and state from it (AgencyInvoicesPage.tsx:560-561). Effort M. Files: CompanyProfilePage.tsx, a new migration, AgencyInvoicesPage.tsx.
10. Add an invoice register CSV and per-client outstanding summary on the invoices page, with SAC/HSN column added to agency_invoices (migration) and the line form (AgencyInvoicesPage.tsx:521-545). Effort M-L. Files: migration, AgencyInvoicesPage.tsx, services/agencyInvoicesApi.ts.

Also flag for the mobile menu: add a "More" sheet for MORE_NAV (AgencyLayout.tsx:264-278). Effort M. Ranked after 10 because it is UI, not money logic.

---

## 8. Feature ideas buildable in under an hour each (existing backend)

- Invoice register CSV: downloadCsv (utils/dataExport.ts:28) over rows already loaded by fetchInvoices (AgencyInvoicesPage.tsx:141-154).
- Client outstanding summary: group loaded agency_invoices by client_id and sum total minus paid (AgencyInvoicesPage.tsx:53 outstandingOf). No new query.
- Expenses CSV: same downloadCsv over the expense list already fetched on AgencyExpensesPage.
- Payment receipt text: "Copy receipt" on each row of agency_invoice_payments (`:712-713`) with invoice number, date, amount, method, reference.
- Payroll with allowances: fetch agency_expenses where category is driver_allowance and period dates match, show the total beside each period (read-only, no RPC change).
- Earnings by month on Invoices: group the fare sums already returned by agency-portal-billing by month.
- Mobile finance entry: a single "Finance" tile on the mobile bottom bar for finance-scoped users that links to Invoices, Expenses and Payroll.
- Copy fix plus link on the ERP page: replace the SUPABASE_URL placeholder (AgencyErpPage.tsx:688) with a copy button for the real function URL from the project configuration.
