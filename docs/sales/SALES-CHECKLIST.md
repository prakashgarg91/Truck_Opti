# TruckOpti Sales and Pilot-Onboarding Checklist

For a TruckOpti salesperson talking to an Indian goods-transport agency. It covers qualifying the agency, a 10-step demo on the real menus, the data to collect, pricing, objections, what is not built, and the launch status.

Every feature named here is built in the repository unless it is in section 7. Routes come from `frontend/src/App.tsx`. Launch status (section 8) comes from the 2026-11-17 and 2026-11-18 checkpoints in `TASKS.md`.

The app runs at `https://www.truckopti.in` once hosting is live (`docs/DEPLOYMENT-RUNBOOK.md`). Do not quote that address as live to a prospect until section 8 shows the hosted items as done. It works in a phone or computer browser; there is no app-store install.

## 1. Qualify the agency (before the demo)

Ask and note the answers:

1. **Fleet size and ownership.** How many trucks, and are they owned or hired? Owned trucks are supported. Hired-vehicle records are not built (section 7).
2. **Work type and lanes.** Which origin-destination lanes do you run each week, and how many trips?
3. **Clients and rates.** Who are your contracted clients? Do you have written rates per trip, per tonne or per km?
4. **Statutory details.** Do you have your transport licence number, PAN and a bank account with IFSC? GSTIN is optional at registration and needed for GST invoices.
5. **Order source.** Do orders come as a CSV file, by phone or by email? CSV import is built. Excel (.xlsx) import is not.
6. **Staff roles.** Who dispatches, who manages trucks and drivers, and who handles billing? Scopes: Dispatcher, Fleet manager, Finance, Viewer.
7. **Driver phones.** Do drivers have Android phones with internet? The driver screens run in the phone browser.
8. **Current system.** Paper registers, Excel, Tally or other software? What hurts most?

**Qualify out honestly.** An agency that needs a load marketplace, automatic tender bidding, live engine-off GPS, stoppage or breakdown handling, Excel order import, or Tally sync today is not a fit yet (section 7).

## 2. The 10-step demo

Get a demo agency login and a demo customer login from the platform team before the meeting. Run the agency portal on a laptop and show the driver screens on a phone. Menu names are the labels in the agency menu; routes are in brackets.

1. **Register and approval (1 minute).** Open `/agency/register`. Walk through the four steps: business details (company name, transport licence number and PAN are compulsory; GSTIN optional), contact and address, bank account with IFSC, submit. Say that the TruckOpti team approves the application, and that most fleet, driver and billing actions wait for approval.
2. **Home (1 minute).** `/agency/dashboard`. Active jobs, jobs today, pending work and last 30 days revenue.
3. **Fleet and documents (1 minute).** `/agency/fleet`. Add a truck by type, enter the RC number and the insurance, fitness, permit and PUC dates. Show the named warning for a document that has expired or expires within 30 days. Mark a truck unavailable.
4. **Orders and load plan (1 minute).** `/agency/orders/import`: show the CSV template, upload a file, and point to the row-by-row status and the error download. `/agency/orders/plan`: group orders into a load and show the capacity check against the chosen truck.
5. **Drivers (1 minute).** `/agency/drivers`. Invite a driver by mobile number and show the one-time code (it is shown once). Show the Call button, the truck assign and unassign actions, and the licence expiry warning.
6. **Jobs and consignments (1 minute).** `/agency/jobs`: enter the fare on an authorised shipment and create the job; accept it; assign a free driver and truck; confirm delivery when it is done. Then `/agency/consignments`: create a GR for a planned order and step it through pickup, transit, delivery and receipt.
7. **Driver screens, on the phone (1 minute).** Open the driver dashboard, then a trip. Show the trip steps (pickup OTP, loading photo, transit, delivery OTP, delivery photo) and the opt-in location sharing switch. Say that nothing is shared until the driver turns it on.
8. **Tracking (30 seconds).** `/agency/tracking`: show the latest shared location for a trip and the link that opens it in Google Maps. Say the app has no map of its own.
9. **Clients, rates and team (1 minute).** `/agency/clients` for GSTIN, payment terms, sites and contacts; `/agency/clients/<agreement>/tariffs` for a lane rate with dates; `/agency/team` for staff invitations with a scope and an expiry. Say the server enforces scopes.
10. **Money (1 minute).** `/agency/invoices`: create a GST freight invoice for a delivered job and record a payment. `/agency/billing`: this month, GST and the monthly exports. `/agency/expenses` and `/agency/payroll` if time allows. Close with Support at `/support`.

Length: about 12 minutes. Cut step 4 or step 8 if the meeting is short.

## 3. Data the agency must provide

**Agency registration** (`/agency/register`): company name; transport licence number; PAN; GSTIN if registered; contact person and 10-digit mobile; city and state; bank account number and IFSC.

**Per truck** (`/agency/fleet`): vehicle type; RC number; insurance, fitness, permit and PUC expiry dates.

**Per driver** (`/agency/drivers`): full name; mobile number; driving licence number, class and expiry.

**Per client** (`/agency/clients`): name; GSTIN; payment terms in days (0 to 365); sites with label, address, city, state and 6-digit pincode; contacts with phone and email.

**Per tariff lane** (`/agency/clients/<agreement>/tariffs`): origin; destination; vehicle type; basis (per trip, per tonne or per km); amount; effective from and to dates.

**Orders** (`/agency/orders/import`): a CSV in the template format.

## 4. Pricing: say this exactly

All prices exclude GST. GST at 18% is added to the subscription.

- **Starter:** ₹499 per month, or ₹4,990 per year. Up to 3 trucks and 2 staff.
- **Growth:** ₹1,999 per month, or ₹19,990 per year. Up to 20 trucks and 10 staff. The ERP connector is included from Growth.
- **Professional:** ₹4,999 per month, or ₹49,990 per year. Up to 50 trucks and 25 staff.
- **Enterprise:** by quote only.

Yearly price is 10 times the monthly price. Every agency gets a 14-day free trial with no card, with Starter limits. The agency owner starts it after approval.

Online subscription payment is **not switched on yet** (section 8). For a pilot, the TruckOpti team confirms the plan and the terms in writing. Do not collect money through the app, and do not promise auto-renewal or platform-issued subscription invoices.

**The platform never holds freight money.** Clients pay the agency's own bank account. TruckOpti records receipts and payments only.

Source: `frontend/src/config/pricing.ts`.

## 5. Pilot success measures (agree on day one, review after 30 days)

- Application submitted and approved.
- Every truck entered with its RC number and four document dates; every driver entered with licence details; staff invited with scopes; at least one driver invitation used.
- At least one client with sites, contacts and a current tariff lane.
- One full job on live work: order in (CSV or entered), job with fare, accepted, driver and truck assigned, GR issued, driver trip completed with delivery confirmed, freight invoice created, payment recorded.
- At least one document-expiry warning seen on `/agency/fleet`.

Platform reliability targets are measured internally. Do not quote them to the customer as commitments.

## 6. Objections and answers

- **"Who owns our data?"** Your agency owns it. It sits in your own portal, separate from other agencies, and the server checks access on every request. You can export GST and order data as CSV, Excel or JSON. Get the written data-export and deletion terms from the platform team before signing.
- **"Will you hold our freight money?"** No. Clients pay your bank account directly. The app records the money; it does not collect, pool or hold it.
- **"What happens when our plan expires?"** The app tracks plan dates and sends reminders. Blocking work after expiry is a switch the team turns on per agency and is not on for every agency yet. Ask the team to confirm the exact behaviour for your account in writing.
- **"Who helps us when something breaks?"** Support at `/support` after sign-in, or `/contact`. Written service levels come with the pilot terms. Do not quote an uptime figure.
- **"Our drivers are not tech-savvy."** You invite them by mobile number with a one-time code. The trip screen walks them through each step.
- **"We already run Tally or Excel."** Data comes in by CSV and goes out as CSV, Excel and JSON exports. Excel import and a direct Tally sync are not built. An ERP connector is built for Growth and above, but confirm its current status with the platform team before promising it.
- **"Does it make our GST invoice?"** It calculates freight GST, lets you choose the rate, records payments and gives GSTR-1 style exports. Server-made invoice PDFs are not built. Your accountant confirms the figures before filing.
- **"Do the drivers' location and our tracking use Google Maps?"** The app links the latest point to Google Maps. It does not have its own map. Drivers share location only when they switch it on.
- **"Do you use AI?"** Nothing in the product is sold as AI. Do not describe any feature as AI-powered.

## 7. Not built yet: never promise these

- Excel (.xlsx) order import.
- Maps inside the app.
- QR images on GRs (a text token is shown).
- WhatsApp messages sent from the app.
- Automatic debit and auto-renewal.
- Server-generated invoice PDFs.
- Trip stoppages, breakdown and emergency handling.
- Hired (non-owned) vehicle records.
- Online subscription payment (Razorpay), until the owner activates it (section 8).
- Any AI feature.

Also keep these honest: route distance figures are estimates, not road routing or ETA; hired vehicles are not supported.

## 8. Launch status (from TASKS.md, 2026-11-18 checkpoint)

Status key: **DONE** = built and checked locally in this repository; **NEEDS OWNER** = an owner decision, key or document is required; **NEEDS HOSTING** = needs a hosted Supabase, Edge deploy or staging environment, which has not been run.

The 2026-11-18 checkpoint says: ready for staging, **not ready for customers**.

### Features built (TO-145 to TO-152)

| Item | Status |
|---|---|
| CSV order import, load planning, consignments (GR/LR), trip tracking, opt-in driver location | DONE (local tests; hosted not run) |
| Freight invoices (record only) and expenses, fuel, maintenance | DONE (local tests; hosted not run) |
| Driver payroll | DONE (local tests; hosted not run) |
| ERP connector and `erp-ingest` function | DONE in code; the Edge deploy is NEEDS HOSTING |
| Agency subscriptions, plan limit guard, GST invoicing, activation, refund and credit notes | DONE in code; live enforcement is NEEDS OWNER |
| Razorpay webhook and billing UI | DONE in code; webhook secret and registration are NEEDS OWNER and NEEDS HOSTING |
| Expiry sweep and reminders, staff invitation acceptance, entitlement gating | DONE (local tests; hosted not run) |

### Local gates (all green on 2026-11-18)

| Gate | Status |
|---|---|
| 35 database suites, privilege matrix 15/15 | DONE |
| Edge write guard 23/23; edge harness 86 tests | DONE |
| Frontend tests (2218), `tsc` and `eslint` | DONE |
| Secrets audit (source and built bundle) | DONE |
| Local full-journey browser test: 47 passed, 0 failed, 2 hosted-only; mobile 375 px pass | DONE |
| Race tests (new commands, subscription) | DONE |

### Owner and hosting items still open

| Item | Status |
|---|---|
| Staging Supabase project and `db push` approval | NEEDS OWNER and NEEDS HOSTING |
| Hosted auth, storage, `pg_cron` and extensions run | NEEDS HOSTING |
| Razorpay test webhook secret and registration (old test key expires 2026-11-19 20:24) | NEEDS OWNER |
| Edge deploy of `erp-ingest` (JWT verification off) | NEEDS HOSTING |
| Release gates 7 to 11 (hosted) in `docs/FABLE-RULINGS-2026-11-17-B.md` section 3 | NEEDS HOSTING |
| Sentry key and error monitoring | NEEDS OWNER |
| GSTIN, legal name, address, state and SAC confirmation | NEEDS OWNER |
| Terms and refund wording (`docs/legal/SUBSCRIPTION-POLICY-DRAFT.md`) | NEEDS OWNER |
| Enforcement switch (every approved agency needs a trial or plan first) | NEEDS OWNER |
| Live-money test approval | NEEDS OWNER |
| Housekeeping approvals (`docs/HOUSEKEEPING-INVENTORY.md`) | NEEDS OWNER |
| ZCode renewal | NEEDS OWNER |

Until every NEEDS item above is DONE, do not present TruckOpti to a customer as live, do not take payment through the app, and do not give a date for a hosted service.

## 9. After the meeting

1. Send the registration link `/agency/register` and the section 3 data list the same day.
2. Name one staff member as the onboarding contact.
3. Route questions through Support (`/support`). For approval questions, quote the company name and registration date.
4. Record which section 7 items the agency needs on day one. If they cannot start without one of them, tell them the platform team will confirm the date. Never commit a date yourself.
