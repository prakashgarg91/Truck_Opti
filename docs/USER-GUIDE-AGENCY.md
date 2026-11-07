# TruckOpti Agency Guide

This guide is for the owner and staff of a transport agency using TruckOpti. It explains, in plain words, what you can do today in the Agency Portal and what is still planned. Every screen mentioned here exists in the application (`frontend/src/App.tsx`).

TruckOpti connects three sides: **customers** who book shipments, **drivers** who carry them, and **your agency** which supplies the trucks and drivers. Your agency works in its own portal, separate from the customer and driver apps.

## Before you start

- You need an account on TruckOpti. Log in at `/login`; for agency use the login page opens in agency mode. Agency features need a connected cloud account — in device-only (offline) mode the portal shows only your local truck and carton counts (`/agency/dashboard`).
- On a phone, the bottom bar has six tabs: Home, Fleet, Drivers, Jobs, Billing, Rates. On a computer the left menu also shows Team and Clients; on a phone open these two by their web address (`/agency/team`, `/agency/clients`).
- The bell icon at the top counts new incoming jobs and takes you to the Jobs screen (`/agency/jobs`).

## 1. Register your agency and get approved (route `/agency/register`)

Registration is a short four-step form. You must log in first, because the registration is tied to your account.

1. **Business details** — company name, transport licence number and PAN (both compulsory), and GSTIN if you have one.
2. **Contact and address** — contact person, 10-digit mobile number, city and state (compulsory); email, address, pincode, fleet size and operating routes are optional.
3. **Bank details** — bank account number and IFSC code. Job payments are credited to this account.
4. **Done** — the application is submitted for review. The screen tells you that approval usually comes within 2–3 business days.

Your application then goes to the TruckOpti platform team for approval. Until it is approved you will see one of these statuses on your Home screen: **Verification Pending**, **Verified**, **Application Rejected** or **Account Suspended**. Most fleet, driver and billing actions need the **Verified** status; until then the portal clearly says "Action not permitted" and asks you to wait for approval.

## 2. Home (route `/agency/dashboard`)

Home gives you the day at a glance:

- a status banner if your agency is not yet approved;
- your company card with city and GSTIN;
- four counters — **Active Jobs**, **Jobs Today**, **Pending**, and **Last 30 Days** revenue with jobs completed;
- a fleet line showing how many vehicles are registered;
- quick buttons for Jobs, Fleet, Billing and Rate Cards;
- your total jobs completed and rating, once you have completed jobs.

If no agency profile is linked to your account, Home asks you to register first.

## 3. Fleet — your vehicles (route `/agency/fleet`)

This is your vehicle register. For each truck you keep the RC book entry and statutory dates in one place.

- **Add Truck** — pick the vehicle type (Tata Ace 750 kg, Tata 407 1T, Eicher 14 ft 3T, Eicher 17 ft 5T, Ashok Leyland 19 ft 7T, BharatBenz 24 ft 10T, BharatBenz 32 ft 15T, Volvo 40 ft container 25T), enter the RC number, and optionally the expiry dates of insurance, fitness, permit and PUC.
- **Availability** — every vehicle can be marked available or unavailable (for example, when it goes for maintenance).
- **Document alerts** — the page warns you by name when insurance, fitness, permit or PUC has expired or expires within 30 days, so renewals are not missed.
- If a vehicle record was changed from another device, the page shows one message with the latest version instead of overwriting anyone.

## 4. Drivers — employment and invitations (route `/agency/drivers`)

The Drivers screen has four parts:

- **Assigned drivers** — name, phone with a Call button, online/offline status, home city, rating, trips done, and whether the driver is on a trip or available. From each card you can **Assign Truck** or **Unassign Truck**, and **Pay** to record a payment to the driver (minimum ₹1, with an optional note). The payment is recorded and goes to the platform team for review — no money moves by itself.
- **Unassigned trucks** — an amber panel lists trucks that have no driver attached, so no vehicle is forgotten.
- **Driver invitations** — invite a driver by mobile number. A one-time invitation code is shown **only once**; copy it or share it on WhatsApp immediately. The panel lists invitations as Pending, Accepted or Expired, and you can revoke a pending one. A driver signs in with that phone number and the code.
- **Employment records** — the official record of each driver's employment with your agency, showing the driving licence number, licence class, contact number and licence expiry (with a warning inside 30 days). **End Employment** closes a record; if the driver still has an active assignment, the app asks you to release it first.

## 5. Jobs and offers (route `/agency/jobs`)

Work reaches your agency in two steps:

- **Authorized Shipments** — when a customer authorizes your agency (they share their shipment with you and grant consent), that shipment appears here with its reference and the date of authorization. You enter the fare you will charge and press **Create Job**. The app refuses a duplicate job for the same shipment.
- **Job list** — every job shows origin and destination, weight, fare and status. Filter by All, Pending, Accepted, In Transit, Delivered or Cancelled.

Actions on a job:

- **Pending** — **Accept** or **Decline**.
- **Accepted** — **Assign Driver**: choose from the available driver-and-truck pairs shown in the window.
- **In Transit** — **Track Live** opens a map with the driver's latest position, refreshed every 15 seconds, and **Confirm Delivery** closes the job when the goods reach the destination.

## 6. Clients and tariffs

**Clients (route `/agency/clients`)** keeps one record per business customer. You can add a client with name, GSTIN and payment terms (0–365 days); edit the details; or end the agreement (an ended agreement becomes read-only until reactivated). Under each client you maintain:

- **Sites** — billing addresses (bill-to) and loading points (ship-to), each with label, address, city, state and 6-digit pincode. A site can be deactivated.
- **Contacts** — persons at the client with phone, email and the site they belong to.

The list is searchable by client name or GSTIN.

**Tariffs (route `/agency/clients/<agreement>/tariffs`)** holds the rate agreement for one client, lane by lane (origin to destination, with vehicle type). You publish a rate by choosing the basis — **per trip, per tonne or per km** — the amount, and the effective from/to dates. The page groups rates into **Current**, **Upcoming** and **Past**, and lets you revise a lane by publishing a new version. If the client agreement is inactive, rates are read-only.

## 7. Team and access scopes (route `/agency/team`)

Only the agency owner can open this screen; staff members see a polite notice instead.

- **Invite staff** — enter an email, pick an access scope and an expiry (default 7 days). A one-time code is shown once; copy it or send it on WhatsApp. You can revoke an invitation or a member's access at any time, and change a member's scope later.
- The four scopes are:
  - **Dispatcher** — reserve vehicles and drivers, manage jobs.
  - **Fleet manager** — manage vehicles, drivers and driver invitations.
  - **Finance** — manage clients and publish tariffs.
  - **Viewer** — view only.

These scopes are enforced by the server, not just hidden in the menu.

## 8. Billing (route `/agency/billing`)

Billing summarises your earnings from delivered jobs:

- four cards — **This Month**, **In Progress Value**, **Total Paid** and **GST Due (5%)**;
- the list of delivered jobs with route, fare and date;
- **Invoice** — generates a simple PDF tax invoice for any delivered job (invoice number, date, route, subtotal, GST at 5%, total);
- **GST Reports** — for each of the last three months (GSTR-1 style) you can export the delivered jobs with taxable value, GST and invoice total as CSV, Excel (xlsx) or JSON; an all-delivered export is also available.

Freight GST is calculated in the app at 5% of the fare; please confirm the final figures with your accountant before filing.

## 9. Agency profile (route `/agency/profile`)

Your profile page repeats your agency details and approval status, shows a profile completion percentage (company name, city, GSTIN, fleet size, email) and your key numbers. It is a view of the same record the platform team approved — corrections go through support.

## 10. What is planned but not built yet

To be fully transparent, these modules from the project plan (`TASKS.md`) are **not yet available**:

- **Sales-order import and load planning** with client approval — planned (TO-145).
- **GR/LR receipts with QR and material-receipt proof** — planned (TO-146).
- **Full trip tracking** — stoppages, breakdown and emergency handling — planned (TO-147). (Basic live driver location on the Jobs screen is already available.)
- **Freight invoice book, private documents and collections** — planned (TO-148). (The simple PDF invoice and the GST exports above exist today.)
- **Expenses, fuel, advances and maintenance records** — planned (TO-149).
- **Driver salary and payroll settlement** — planned (TO-150). (The Pay button on the Drivers screen records payments for review; full payroll is not built.)
- **Direct ERP connector with your client's systems** — planned (TO-151).

If a screen asks for something you cannot find, it is most likely one of the planned modules above.

## 11. Getting help

Signed-in users can open **Support** (`/support`) to contact the TruckOpti team. For approval questions, quote your company name and registration date.
