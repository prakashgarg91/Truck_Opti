# TruckOpti: Landing Page Copy (Agency Subscription)

Copy for the agency landing page. Audience: owners of small Indian goods-transport agencies with 5 to 10 trucks.

Rule for this copy: every feature below is built in the app today. Anything not built is listed under "Not built yet" and must not be presented as available. The verification map at the end names the file or route behind each claim. Prices and limits follow `frontend/src/config/pricing.ts`.

---

## Headline

**Run your transport agency from one place: orders, trucks, drivers, trips and billing.**

## Subheadline

TruckOpti is subscription software for small Indian transport agencies. Import orders from a CSV file, plan loads against truck capacity, issue consignment notes with GR/LR numbers, track trips with your drivers' opt-in location, record freight invoices and payments, and keep expenses, fuel, maintenance and driver payroll in the same app.

TruckOpti works with three sides: your **clients** send orders, your **drivers** carry them on the driver screens, and **you** run the agency from the Agency Portal.

---

## What an agency can do today

### 1. Orders by CSV import

Download the order template, fill it in, and upload the CSV. The app shows each row's status before anything is saved, and you can download a file of the rows that failed. Excel (.xlsx) files are not accepted yet. (Route: `/agency/orders/import`)

### 2. Load planning against truck capacity

Group orders into load plans. The planner checks each plan against the capacity of the truck you pick and lists the problems it finds. (Route: `/agency/orders/plan`)

### 3. Consignment notes with GR/LR numbers

Create a GR for a planned order. Each GR moves through set steps: pickup scanned, transit started, delivery scanned, receipt signed, or dispute raised. Only the steps that are legal for the current state can be chosen. The GR/LR token is shown as text for the dispatcher or owner. Printed QR images are not produced yet. (Route: `/agency/consignments`)

### 4. Fleet and documents

Keep each truck's RC number and its insurance, fitness, permit and PUC expiry dates in one register. The page warns by name when a document has expired or expires within 30 days. Mark a truck unavailable when it goes for maintenance. (Route: `/agency/fleet`)

### 5. Drivers

Invite a driver by mobile number. The one-time invitation code is shown once, so copy it and pass it on. The driver list shows each driver's phone with a Call button, whether they are online, and any trip in progress. Assign or unassign a truck from the driver card. Driver records keep the licence number, class and expiry, with a warning inside 30 days. (Route: `/agency/drivers`)

### 6. Jobs and trip tracking

Each authorised shipment becomes a job once you enter the fare. You can accept or decline a job, assign a driver and truck that are free, and confirm delivery. The Tracking screen shows the latest location the driver has shared for each trip, with a link to open that point in Google Maps. The driver chooses whether to share location from the trip screen; nothing is shared without that opt-in. Location updates appear on screen as they arrive, and the Jobs list refreshes every 15 seconds. (Routes: `/agency/jobs`, `/agency/tracking`)

The Tracking screen does not draw a map inside the app. Trip stoppages, breakdown handling and emergency alerts are not built yet.

### 7. Clients and rates

Keep one record per business client with GSTIN and payment terms (0 to 365 days), their billing addresses and loading points with pincodes, and their contacts. Publish lane rates per trip, per tonne or per km, with effective from and to dates. Rates are grouped as Current, Upcoming and Past. (Routes: `/agency/clients`, `/agency/clients/<agreement>/tariffs`, `/agency/rates`)

### 8. Freight invoices and payments

Create a GST freight invoice for a delivered job. The app works out the GST, lets you pick the rate, and records payments by UPI, bank transfer, cash or cheque. A job's payment status is calculated from what you have recorded. The freight money goes to your own bank account. TruckOpti records the figures and does not collect or hold that money. (Route: `/agency/invoices`)

Billing screen: this month's earnings, the value of jobs in progress, total paid, GST due and the GSTR-1 style exports (CSV, Excel, JSON). Please confirm final figures with your accountant before filing. (Route: `/agency/billing`)

### 9. Expenses, fuel and maintenance

Record expenses by category, including fuel and maintenance, against a truck or job. (Route: `/agency/expenses`)

### 10. Driver payroll

Build a payroll period, review each driver's line, and track approval. An approved agency gets the payroll screen; payroll amounts are recorded in the app and paid by you outside it. (Route: `/agency/payroll`)

### 11. Staff with the right access

Invite staff by email with one of four scopes:

- **Dispatcher**: orders, load plans, consignments, jobs, ERP connections.
- **Fleet manager**: trucks, driver records and invitations, expenses and maintenance.
- **Finance**: clients, tariffs, invoices, expenses, payroll and driver rates.
- **Viewer**: read-only access to the scoped screens.

The server checks each request against the scope. Hiding a menu item is not the only protection. (Route: `/agency/team`, owner only)

### 12. ERP connector (Growth plan and above)

Growth and Professional agencies can set up a connection for a client's ERP system. Each connection has its own secret. You can pause a connection, resume it, or rotate the secret. The ERP system sends orders to the `erp-ingest` service. Confirm the live status with the platform team before promising it to a client. (Route: `/agency/erp`)

### 13. Phone and computer

The Agency Portal runs in a phone browser or on a computer. On a phone the bottom bar has six tabs: Home, Fleet, Drivers, Jobs, Billing and Rates. On a computer the left menu shows all the screens. There is no app-store install.

---

## How an agency starts

**Step 1: Register and wait for approval.** Complete the four-step form: business details (company name, transport licence number and PAN are compulsory; GSTIN is optional), contact and address, bank account with IFSC, then submit. The TruckOpti team reviews the application. Your Home screen shows the status until it is approved. (Route: `/agency/register`)

**Step 2: Add trucks and drivers.** Enter each truck with its RC number and document dates. Invite drivers by mobile number and record their licence details. (Routes: `/agency/fleet`, `/agency/drivers`)

**Step 3: Add clients and publish rates.** Create each client with GSTIN and payment terms, add sites and contacts, and publish lane rates with effective dates. (Route: `/agency/clients`)

**Step 4: Run orders to delivery and bill.** Import or enter orders, plan loads, issue GRs, assign drivers, track trips, confirm delivery, then raise freight invoices and record payments.

---

## Plans and prices

All prices exclude GST. GST at 18% is added to the subscription.

| Plan | Per month | Per year (10 x monthly) | Trucks | Staff |
|---|---|---|---|---|
| Starter | ₹499 | ₹4,990 | 3 | 2 |
| Growth | ₹1,999 | ₹19,990 | 20 | 10 |
| Professional | ₹4,999 | ₹49,990 | 50 | 25 |
| Enterprise | Quote | Quote | More | More |

- **Free trial:** 14 days, no card required. The trial has Starter limits. The agency owner starts it after approval.
- **For a 5 to 10 truck agency,** Growth is the plan that fits.
- **Paying online:** the subscription checkout is built, but online payment is not switched on yet. Until it is, the TruckOpti team confirms plan terms in writing.

---

## Objections and answers

**"Who owns our data?"**
Your agency owns its data. It is kept in its own portal, separate from other agencies, and the server checks access on every request. You can export your GST and order data as CSV, Excel or JSON. If you stop using TruckOpti, ask the team for your data in writing; the export and deletion steps are part of the subscription terms still being finalised.

**"Do you hold our freight money?"**
No. Clients pay the freight into your own bank account. TruckOpti records receipts and payments for your books. It does not collect, pool or hold freight money.

**"What happens when my plan expires?"**
Your plan dates are tracked and the app sends renewal reminders. Blocking new work after expiry is a switch the TruckOpti team turns on for each agency, and it is not switched on for every agency yet. Ask the team to confirm in writing what applies to your account before you sign.

**"What if the app goes down, or we need help?"**
Use Support at `/support` after you sign in, or the contact page at `/contact`. The team answers during working hours. Written service levels are part of the pilot terms; do not rely on a promised uptime figure until they are given to you in writing.

**"Can my drivers use it?"**
Yes. A driver signs in with the mobile number you invited and the one-time code. The driver screens show trips, the seven-step trip flow (pickup OTP, loading photo, live location, delivery OTP, delivery photo), document upload and earnings.

**"Do you do our GST invoice?"**
The app calculates freight GST, lets you choose the rate, records payments and gives GSTR-1 style exports. Invoice PDFs created on the server are not built yet. Your accountant confirms the final figures before filing.

**"Do you connect to Tally or our ERP?"**
Not directly with Tally. Growth and Professional agencies can connect a client ERP that can send orders to the TruckOpti ERP endpoint. Ask for the current status before you rely on it.

---

## Not built yet

Do not promise these:

- Excel (.xlsx) order import.
- Maps inside the app (the Tracking screen links out to Google Maps).
- Printed QR codes or QR images on GRs.
- WhatsApp messages sent by the app.
- Automatic debit or auto-renewal payments.
- Server-generated invoice PDFs.
- Automatic AI features of any kind.
- Trip stoppage, breakdown and emergency handling.
- Hired (non-owned) vehicle records.

---

## Call to action

**Register your agency and move the registers into one app.**

- **Register now:** `/agency/register`
- **Plans and prices:** `/pricing`
- **Talk to us:** `/contact`, or Support at `/support` after you sign in

---

## Verification map (for the team, not for publication)

| Claim | Verified in |
|---|---|
| CSV-only order import, template, row errors | `frontend/src/pages/AgencyOrderImportPage.tsx` (accept `.csv`, template download); route `/agency/orders/import` |
| Load plans against truck capacity | `frontend/src/pages/AgencyLoadPlanPage.tsx`; route `/agency/orders/plan` |
| GR/LR, proof states and events, text QR token, no QR image | `frontend/src/pages/AgencyConsignmentsPage.tsx` (comment: "no QR image library is used yet"); `frontend/src/lib/grLr.ts`; route `/agency/consignments` |
| Fleet register, document expiry warnings | `frontend/src/pages/AgencyFleetPage.tsx`; route `/agency/fleet` |
| Driver invitations, Call button, assign/unassign, licence expiry | `frontend/src/pages/AgencyDriversPage.tsx`; route `/agency/drivers` |
| Jobs, fare, accept, assign, confirm delivery, 15-second refresh | `frontend/src/pages/AgencyJobsPage.tsx`; route `/agency/jobs` |
| Trip tracking, latest location, Google Maps link | `frontend/src/pages/AgencyTrackingPage.tsx`; route `/agency/tracking` |
| Driver opt-in location sharing | `frontend/src/pages/DriverTripPage.tsx`, `frontend/src/lib/tripLocationSharing.ts`, `frontend/src/lib/useTripLocationSharing.ts`; permission-denied message in `tripLocationSharing.ts` |
| Clients, tariffs, rates | `frontend/src/pages/AgencyClientsPage.tsx`, `AgencyTariffsPage.tsx`, `AgencyRatesPage.tsx`; routes `/agency/clients`, `/agency/clients/:agreementId/tariffs`, `/agency/rates` |
| Freight invoices, record-only, UPI/bank/cash/cheque, GST rates 0/5/12/18 | `frontend/src/pages/AgencyInvoicesPage.tsx`; `frontend/src/lib/freightInvoice.ts`; route `/agency/invoices` |
| Billing cards, GSTR-1 style CSV/Excel/JSON | `frontend/src/pages/AgencyBillingPage.tsx`; route `/agency/billing` |
| Expenses, fuel, maintenance | `frontend/src/pages/AgencyExpensesPage.tsx`; route `/agency/expenses` |
| Payroll periods and lines | `frontend/src/pages/AgencyPayrollPage.tsx`; route `/agency/payroll` |
| Staff scopes (dispatcher, fleet manager, finance, viewer), server-side | `frontend/src/lib/agencyAccess.ts`; `frontend/src/pages/AgencyTeamPage.tsx`; route `/agency/team` |
| ERP connections, pause/resume, secret rotation | `frontend/src/pages/AgencyErpPage.tsx`; route `/agency/erp`; ingest in `TASKS.md` 2026-11-17 checkpoint |
| ERP plan gate (Growth and above) | Brief from owner; the gate is enforced by `SB004 SUBSCRIPTION_FEATURE_NOT_IN_PLAN` in `supabase/migrations/20261035000000_subscription_write_guards.sql`. Confirm the plan seed before publishing |
| Plans, prices, trucks and staff limits, trial | `frontend/src/config/pricing.ts` (`TRIAL_CONFIG`: 14 days, Starter limits, no card) |
| Plan limits not enforced by default | `TASKS.md` 2026-11-17 checkpoint ("enforcement OFF by default") and 2026-11-18 checkpoint (owner enforcement switch) |
| Online payment not switched on | `TASKS.md` 2026-11-18 checkpoint (Razorpay test and live not run; owner-only) |
| Phone bottom bar (six tabs) and desktop menu | Agency layout component; confirm tab list before publishing |
| Support and contact routes | `/support`, `/contact`; `frontend/src/config/support.ts` |

**Open items before publishing:** the ERP plan seed, the written data-export and expiry terms (`docs/legal/SUBSCRIPTION-POLICY-DRAFT.md`, owner wording pending), and the hosted status in `SALES-CHECKLIST.md`.
