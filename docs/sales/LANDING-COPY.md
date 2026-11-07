# TruckOpti — Landing Page Copy (Agency Subscription)

Ready-to-use copy for the agency landing page. Audience: owners of small Indian goods-transport agencies running 5–10 trucks. Every feature claimed below exists in the app today; items still being built are marked **coming soon**. The verification map at the end cites the file or route for every claim.

---

## Headline

**Run your transport agency from one place — trucks, drivers, jobs and billing.**

## Subheadline

TruckOpti is subscription software for small Indian transport agencies. Register your fleet, invite your drivers, take jobs from your clients, track trips live on a map, and raise GST-ready invoices — all without thick registers, missed renewal dates and end-of-day phone calls.

TruckOpti connects three sides: your **customers** book shipments and authorise your agency, your **drivers** carry them, and **you** run the fleet from your own Agency Portal.

---

## Six reasons agencies subscribe

### 1. Every truck and every document in one register

Keep the RC number, insurance, fitness, permit and PUC dates of each vehicle in one place. Choose from the built-in Indian catalogue — Tata Ace (750 kg), Tata 407 (1T), Eicher 14 ft (3T), Eicher 17 ft (5T), Ashok Leyland 19 ft (7T), BharatBenz 24 ft (10T), BharatBenz 32 ft (15T) and Volvo 40 ft container (25T). The page warns you by name when a document has expired or expires within 30 days, so renewals are never missed. Mark a truck unavailable when it goes for maintenance. (Route: `/agency/fleet`)

### 2. Your drivers, on board in minutes

Invite a driver by mobile number — a one-time invitation code is shown once, which you copy or share on WhatsApp. Your driver list shows phone with a Call button, online/offline status, rating, trips done, and who is on a trip. Assign or unassign a truck from the card, and record payments to a driver with a note. Employment records keep the driving licence number, class and expiry (with a warning inside 30 days). An amber panel lists trucks that still have no driver, so no vehicle is forgotten. (Route: `/agency/drivers`)

### 3. Jobs from authorisation to delivery, without phone-tag

When a customer authorises your agency, the shipment appears under Authorised Shipments. You enter your fare and create the job — duplicates are refused. Accept or decline, assign an available driver-and-truck pair, press Track Live to see the driver's latest position on a map refreshed every 15 seconds, and Confirm Delivery to close the job. Filter the job list by Pending, Accepted, In Transit, Delivered or Cancelled. (Route: `/agency/jobs`)

### 4. Client rates on record, not on WhatsApp

Keep one record per business client with GSTIN and payment terms (0–365 days), their billing addresses and loading points with pincodes, and your contacts there. Publish lane-by-lane rates — per trip, per tonne or per km — with effective from/to dates. Rates group into Current, Upcoming and Past, and you revise a lane by publishing a new version. (Routes: `/agency/clients`, `/agency/clients/<agreement>/tariffs`)

### 5. Billing and GST, ready every month

The Billing screen shows This Month earnings, In-Progress value, Total Paid and GST Due (5%). Generate a simple PDF tax invoice for any delivered job — invoice number, date, route, subtotal, GST at 5% and total. For each of the last three months, export delivered jobs in GSTR-1 style as CSV, Excel or JSON, plus an all-delivered export. Please confirm final figures with your accountant before filing. (Route: `/agency/billing`)

### 6. Your staff, with exactly the right access

Invite staff by email with one of four access scopes — Dispatcher (reserve vehicles and drivers, manage jobs), Fleet manager (vehicles, drivers, invitations), Finance (clients and tariffs) or Viewer (view only) — with an expiry (default 7 days). Revoke an invitation or a member's access at any time, and change a scope later. These scopes are enforced by the server, not just hidden in the menu. (Route: `/agency/team`, owner only)

---

## How it works — four steps

**Step 1: Register your agency and get verified.** Log in and complete the four-step form — business details (company name, transport licence number and PAN are compulsory; GSTIN optional), contact and address, and your bank account with IFSC (job payments are credited to this account). The TruckOpti platform team reviews your application; approval usually comes within 2–3 business days. (Route: `/agency/register`)

**Step 2: Add your fleet and drivers.** Enter each truck with its RC number and document dates, and mark availability. Invite drivers by mobile number with a one-time code, and record their licence details. (Routes: `/agency/fleet`, `/agency/drivers`)

**Step 3: Add your clients and publish rates.** Create each client with GSTIN and payment terms, add their sites and contacts, and publish lane rates with effective dates. (Route: `/agency/clients`)

**Step 4: Run jobs and get paid.** Your Home screen shows Active Jobs, Jobs Today, Pending and Last 30 Days revenue at a glance. Accept authorised shipments, assign drivers, track live, confirm delivery — then invoice and export your GST reports. (Routes: `/agency/dashboard`, `/agency/jobs`, `/agency/billing`)

---

## Frequently asked questions

**1. What do I need to register?**
An account on TruckOpti, your company name, transport licence number and PAN (compulsory), GSTIN if you have one, a 10-digit mobile number with city and state, and your bank account number with IFSC. Approval usually comes within 2–3 business days; your Home screen shows the status (Verification Pending, Verified, Rejected or Suspended) while you wait.

**2. Does it work on my phone?**
Yes. On a phone the portal has a bottom bar with six tabs — Home, Fleet, Drivers, Jobs, Billing and Rates. On a computer the left menu additionally shows Team and Clients. The bell icon counts new incoming jobs.

**3. Do my drivers need to install anything?**
No separate setup. A driver signs in on the same TruckOpti app with the phone number you invited and the one-time code. The driver side shows their trips, document upload (KYC) and earnings.

**4. Is my agency's data safe from other agencies?**
Each agency works in its own portal, separate from customers, drivers and other agencies. Access is checked on the server for every request — including staff scopes — so a staff member simply cannot open what their scope does not permit.

**5. What about GST?**
The app calculates freight GST at 5% of the fare, prints it on the PDF tax invoice, and gives GSTR-1 style monthly exports. Please confirm the final figures with your accountant before filing.

**6. How do my earnings reach me?**
Job payments are credited to the bank account you give at registration. Driver payments you record from the Drivers screen go to the platform team for review — no money moves by itself.

**7. What does it cost?**
Start on the free tier — no card required. Paid plans begin at ₹500/month (Starter, launch price). For a 5–10 truck agency with a small office team, the Growth plan at ₹1,999/month (launch price; ₹19,999/year, about 17% saved) covers up to 20 trucks and 5 users. Current prices are always on the pricing page (`/pricing`); pilot agencies are set up personally by the TruckOpti team.

**8. What is coming soon?**
Being fully transparent, these modules are planned but not built yet: sales-order import and load planning; GR/LR receipts with QR and material-receipt proof; full trip tracking with stoppages, breakdown and emergency handling (basic live driver location already works today); freight invoice book and collections (the simple PDF invoice and GST exports above exist today); expenses, fuel, advances and maintenance records; driver salary and payroll settlement; and a direct ERP connector for your clients.

---

## Call to action

**Register your agency today — and take the diary out of your operations.**

The four-step form takes about ten minutes. Approval usually comes within 2–3 business days, and your fleet, drivers and billing are ready before your next trip.

- **Register now:** `/agency/register` (log in first; the page opens in agency mode)
- **Talk to us:** `/contact`, or Support at `/support` after signing in — phone +91 99993 52050
- **See plans and prices:** `/pricing` — start free, no card required

TruckOpti — planning, dispatch and live trip visibility for modern logistics operations.

---

## Verification map (for the team — not for publication)

| Claim | Verified in |
|---|---|
| Agency registration steps, compulsory fields, 2–3 business-day approval, statuses | `docs/USER-GUIDE-AGENCY.md` §1; route `/agency/register` (`frontend/src/App.tsx:113`) |
| Fleet register, 8-type vehicle catalogue, 30-day expiry warnings, availability | `docs/USER-GUIDE-AGENCY.md` §3; catalogue labels in `frontend/src/pages/AgencyFleetPage.tsx:14-21`; route `/agency/fleet` |
| Driver invitations (one-time code, WhatsApp share), Call button, Pay (min ₹1), employment/licence expiry, unassigned-trucks panel | `docs/USER-GUIDE-AGENCY.md` §4; route `/agency/drivers` |
| Authorised shipments, fare + Create Job, duplicate refusal, Accept/Decline, Assign Driver, Track Live 15-second refresh, Confirm Delivery, status filters | `docs/USER-GUIDE-AGENCY.md` §5; refresh interval `frontend/src/pages/AgencyJobsPage.tsx:313`; route `/agency/jobs` |
| Clients (GSTIN, payment terms 0–365 days, bill-to/ship-to sites, contacts), tariffs per trip/tonne/km with effective dates and Current/Upcoming/Past | `docs/USER-GUIDE-AGENCY.md` §6; routes `/agency/clients`, `/agency/clients/<agreement>/tariffs` (Wave 1 UI, `TASKS.md` day close 2026-11-06) |
| Billing cards, PDF tax invoice, GST 5%, GSTR-1 style CSV/Excel/JSON exports | `docs/USER-GUIDE-AGENCY.md` §8; route `/agency/billing` |
| Team scopes (Dispatcher/Fleet manager/Finance/Viewer), server enforcement, 7-day expiry, revoke, change scope | `docs/USER-GUIDE-AGENCY.md` §7; route `/agency/team` |
| Home counters (Active Jobs, Jobs Today, Pending, Last 30 Days) | `docs/USER-GUIDE-AGENCY.md` §2; route `/agency/dashboard` |
| Phone bottom bar (6 tabs), desktop menu, bell icon | `docs/USER-GUIDE-AGENCY.md` "Before you start" |
| Driver sign-in with phone + code; driver trips/KYC/earnings | `docs/USER-GUIDE-AGENCY.md` §4; routes `/driver/dashboard`, `/driver/kyc`, `/driver/earnings` |
| Agency data isolation, server-side scope checks | `docs/USER-GUIDE-AGENCY.md` §7 ("enforced by the server"); tenant-authority proofs in `agent-results/032-result.md` |
| Plans/prices (free tier no card, Starter ₹500/mo, Growth ₹1,999/mo covering 20 trucks/5 users, ~17% yearly saving) | `frontend/src/config/pricing.ts` (PRICING_TIERS, TRIAL_CONFIG); rendered on `/pricing` (`frontend/src/pages/PricingPage.tsx`; fallback tiers) |
| Payment credit to registered bank account; driver payments reviewed, no money moves by itself | `docs/USER-GUIDE-AGENCY.md` §1, §4 |
| Coming-soon list (TO-145…TO-151) | `docs/USER-GUIDE-AGENCY.md` §10; `TASKS.md` pilot queue |
| Support phone/routes | `frontend/src/config/support.ts` (owner-configured contact); routes `/contact`, `/support` |

**Honesty notes for whoever publishes this:** the hosted rollout and online payment gateway are still pilot-stage (owner-gated per `TASKS.md`), so this copy deliberately avoids promising live online payments or a hosted uptime guarantee; subscription checkout screens exist in the app (`/checkout`, `/subscription`) and pilot onboarding is done personally by the team. Prices are the launch prices configured in the repository — re-check `frontend/src/config/pricing.ts` (or the database-backed plans the pricing page loads) before publishing.
