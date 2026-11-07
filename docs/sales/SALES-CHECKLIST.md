# TruckOpti Sales and Pilot-Onboarding Checklist

This checklist is for a TruckOpti salesperson talking to an Indian goods-transport agency. It covers how to qualify the agency, run a 10-minute demo on the real app, collect onboarding data, agree pilot success measures, and answer objections honestly.

Every feature named here exists in the repository today; the file or route is given in brackets. Section 7 lists what is **not** built yet — never promise those items. Facts are taken from `docs/USER-GUIDE-AGENCY.md`, `docs/USER-GUIDE-DRIVER.md`, `docs/PRODUCT_ROADMAP.md`, `docs/DEPLOYMENT-RUNBOOK.md`, `frontend/src/App.tsx` and `TASKS.md`.

The app runs at `https://www.truckopti.in` (canonical production URL, `docs/DEPLOYMENT-RUNBOOK.md`). It works in a phone or computer browser; there is no app-store install.

## 1. Qualify the agency (before the demo)

The pilot scope in the product plan is 1–2 agencies with 5–10 trucks each (`docs/PRODUCT_ROADMAP.md`). Ask these questions and note the answers:

1. **Fleet size and ownership.** How many trucks, and are they owned or hired? Owned fleets fit today; hired-vehicle records are planned (Section 7).
2. **Work type and lanes.** FTL or LTL? Which origin–destination lanes do you run weekly, and how many trips?
3. **Clients and rates.** Who are your contracted clients? Do you already have written lane rates — per trip, per tonne or per km? (Tariffs are stored lane by lane, `/agency/clients`.)
4. **Statutory details.** Do you have your transport licence number, PAN and a bank account with IFSC? GSTIN is optional at registration but useful for billing. (`/agency/register`.)
5. **Staff roles.** Who will dispatch, who will manage vehicles and drivers, and who will handle billing? (Staff access scopes: Dispatcher, Fleet manager, Finance, Viewer — `/agency/team`.)
6. **Driver readiness.** Do your drivers carry Android phones with internet? The driver app runs in the phone browser.
7. **Current system and pain.** Paper registers, Excel, Tally or other software? What hurts most — missed document renewals, fare disputes, slow billing, or driver payout records?

**Qualify out honestly.** An agency that needs a nationwide load marketplace, automatic tender bidding, live ERP auto-sync, or continuous engine-off GPS tracking today is not a fit yet (Section 7).

## 2. The 10-minute demo script (real routes)

Ask the platform team for a demo agency login and a demo customer login before the meeting. Run the agency portal on a laptop and the driver screens on a phone. All routes below are defined in `frontend/src/App.tsx`.

- **Minute 0–1, Registration and approval.** Open `/agency/register`. Four steps: business details (company name, transport licence number, PAN compulsory; GSTIN optional), contact and address (10-digit mobile, city, state), bank details (account number and IFSC — job payments are credited to this account), then submit. Tell them approval usually comes within 2–3 business days from the platform team, and until the status shows **Verified**, most fleet, driver and billing actions stay locked.
- **Minute 1–2, Home.** `/agency/dashboard` — Active Jobs, Jobs Today, Pending, and Last 30 Days revenue with jobs completed; registered vehicle count; quick buttons.
- **Minute 2–4, Fleet and documents.** `/agency/fleet` — add a truck by vehicle type (catalog runs from Tata Ace 750 kg and Tata 407 1T up to Eicher 14 ft/17 ft, Ashok Leyland 19 ft, BharatBenz 24 ft/32 ft and Volvo 40 ft 25T container), enter the RC number and the insurance, fitness, permit and PUC expiry dates; mark a vehicle available or unavailable. Show the named warning that appears when a document has expired or expires within 30 days.
- **Minute 4–5, Drivers.** `/agency/drivers` — assigned drivers with a Call button, online status, home city, rating and trips; Assign Truck / Unassign Truck; the **Pay** button records a driver payment for platform review (no money moves by itself); invite a driver by mobile number with a one-time code shown only once; employment records hold licence number, class and expiry with a 30-day warning.
- **Minute 5–7, Jobs — the heart of the demo.** `/agency/jobs` — a customer books at `/booking/new` and authorizes your agency; the shipment appears under **Authorized Shipments**; you enter the fare and press **Create Job** (duplicates are refused); **Accept**; **Assign Driver** from the available driver-and-truck pairs; **Track Live** shows the driver's position refreshed every 15 seconds; **Confirm Delivery** closes the job.
- **Minute 7–8, Driver side, on the phone.** `/driver/dashboard` — online switch and job offers with a countdown timer. `/driver/trip/:jobId` — seven steps: arrive at pickup, 4-digit pickup OTP from the sender, compulsory loading photo, transit with live GPS, delivery OTP, delivery photo, done. Five wrong OTP attempts lock the OTP for 15 minutes. Earnings wallet at `/driver/earnings` with manual withdrawal, usually settled in 1–2 business days.
- **Minute 8–9, Clients and tariffs.** `/agency/clients` — one record per business client with GSTIN and payment terms (0–365 days); under it, sites (bill-to and ship-to with 6-digit pincode) and contacts. `/agency/clients/<agreement>/tariffs` — publish a lane rate choosing the basis (per trip, per tonne or per km), amount and effective dates; rates group into Current, Upcoming and Past.
- **Minute 9, Team access.** `/agency/team` — invite staff by email with a scope (Dispatcher, Fleet manager, Finance, Viewer) and an expiry; scopes are enforced by the server, not just hidden in the menu.
- **Minute 10, Billing and close.** `/agency/billing` — This Month, In Progress Value, Total Paid and GST Due (5%) cards; one-click PDF tax invoice for any delivered job; GSTR-1-style monthly exports in CSV, Excel and JSON. Close with Support at `/support`.

## 3. Data the agency must provide

Collect this at the meeting; onboarding cannot finish without it.

**Agency registration** (`/agency/register`): company name; transport licence number; PAN; GSTIN if registered; contact person and 10-digit mobile; city and state; email, address, pincode, fleet size and operating routes (optional); bank account number and IFSC.

**Per truck** (`/agency/fleet`): vehicle type from the catalog; RC number; insurance, fitness, permit and PUC expiry dates.

**Per driver** (`/agency/drivers`): full name; mobile number; driving licence number, licence class and expiry date.

**Per client** (`/agency/clients`): client name; GSTIN; payment terms in days; sites — billing addresses and loading points with label, address, city, state, pincode; contact persons with phone and email.

**Per tariff lane** (`/agency/clients/<agreement>/tariffs`): origin and destination; vehicle type; rate basis (per trip, per tonne, per km); amount; effective from and to dates.

## 4. Pilot terms and pricing — say this exactly

The app's pricing page carries launch tiers from `frontend/src/config/pricing.ts`: Starter ₹500 per month (₹5,000 a year), Growth ₹1,999 (₹19,999), Professional ₹4,999 (₹49,999) and Enterprise ₹14,999 (₹1,49,999).

Online subscription payment is **not live yet** — Razorpay activation is an owner-gated step (`TASKS.md`, task TO-152). So for every pilot: the platform owner confirms the commercial terms in writing; you do not collect money through the app, and you do not promise auto-renewal or platform-issued subscription invoices.

One more point that wins trust: **the platform never pools the agency's freight money.** The client pays freight to the agency's own account; TruckOpti only records and reports it (`TASKS.md`, advisor ruling of 2026-11-04).

## 5. Pilot success measures (agree on day one, review after 30 days)

Taken from the product plan's pilot targets and honest-demo list (`docs/PRODUCT_ROADMAP.md`):

- Agency application submitted and status **Verified** (usually 2–3 business days).
- Every truck entered with RC number and the four statutory dates; every driver entered with licence details; staff invited with scopes; at least one driver invitation accepted.
- At least one client with sites, contacts and current tariff lanes published.
- The full flow completed on live work: authorized shipment → job with fare → accepted → driver assigned → pickup OTP and loading photo → live tracking → delivery OTP and proof photo → Confirm Delivery → PDF invoice → monthly GST export.
- At least one document-expiry warning seen working on `/agency/fleet`.

Platform-side reliability targets (backup recovery point within 24 hours, recovery time within 4 hours, a 7-day uptime rehearsal) are measured internally by the engineering team during the pilot — do not quote them as commitments to the customer.

## 6. Objections and honest answers

- **"Other agencies will see my rates and clients."** Each agency works in its own portal with server-enforced isolation and access scopes; staff scopes are enforced by the server, not just hidden in menus (`/agency/team`, `docs/USER-GUIDE-AGENCY.md` §7).
- **"You will hold our freight money."** No. Freight is collected by the agency into its own account; the platform only records it (`TASKS.md`, 2026-11-04 ruling).
- **"Our drivers are not tech-savvy."** The driver app opens in a phone browser with Hindi-labelled tabs and a step-by-step trip screen; the agency invites drivers by mobile number with a one-time code (`/driver/dashboard`, `docs/USER-GUIDE-DRIVER.md`).
- **"We already run Tally/Excel."** Today data moves by manual entry and CSV/Excel/JSON exports (`/agency/billing`). A direct ERP connector for the first client is planned (Section 7).
- **"Will OTP messages cost us SMS charges?"** The core journey needs no SMS. Login uses password auth and trip OTPs are shown inside the customer's app (`docs/USER-GUIDE-DRIVER.md`, `docs/PRODUCT_ROADMAP.md` §7).
- **"Does it do our GST invoice?"** It generates a PDF tax invoice per delivered job with freight GST at 5% and GSTR-1-style monthly exports; the final figures must be confirmed by the agency's accountant before filing (`/agency/billing`).
- **"What happens when documents expire?"** The fleet screen warns by name 30 days before insurance, fitness, permit or PUC expiry (`/agency/fleet`).
- **"What does it cost?"** Quote the launch tiers in Section 4 and add that written pilot terms come from the platform owner; online payment is not switched on yet.

## 7. What is NOT available yet — never promise it

From `docs/USER-GUIDE-AGENCY.md` §10 and `TASKS.md` (tasks TO-145 to TO-153):

- **Sales-order import and load planning with client approval** — planned (TO-145).
- **GR/LR receipts with QR and material-receipt proof** — planned (TO-146).
- **Full trip tracking** — stoppages, breakdown and emergency handling — planned (TO-147). Basic live driver location on `/agency/jobs` exists today.
- **Freight invoice book, private document vault and collections/receivables** — planned (TO-148). Today's billing has the PDF invoice and GST exports only.
- **Expenses, fuel, advances and maintenance records** — planned (TO-149).
- **Driver salary and payroll settlement** — planned (TO-150). The Pay button only records payments for review.
- **Direct ERP connector with client systems** — planned (TO-151).
- **Online subscription billing (Razorpay) and tenant onboarding console** — planned, owner-gated (TO-152).
- **Final hosted selling acceptance** — staging restore rehearsal, error monitoring and full hosted end-to-end proof remain to be completed (TO-153, `docs/DEPLOYMENT-RUNBOOK.md`).

Also keep these honest: route distance figures are straight-line estimates with fixed average costs, not guaranteed road routing or ETA (`/routes`, `docs/PRODUCT_ROADMAP.md` §4); in device-only offline mode the agency portal shows only local truck and carton counts (`/agency/dashboard`); hired (non-owned) vehicle records are not supported yet.

## 8. After the meeting

1. Help the agency submit `/agency/register` the same day; approvals usually arrive in 2–3 business days.
2. Send the Section 3 data checklist and fix one staff member as the onboarding contact.
3. Route questions through Support (`/support`); for approval queries, quote the company name and registration date.
4. Note in your pipeline which Section 7 items the agency needs on day one. If they cannot start without expenses, payroll or ERP sync, say the platform will confirm delivery dates — never commit a date yourself.
