# TruckOpti glossary

One preferred word per concept. Use the preferred word in every label, heading, button, toast and
document you write. The code constants are in `frontend/src/lib/terms.ts`; the test
`frontend/src/lib/terms.test.ts` checks that they match this file.

Routes and menu labels below describe the app as it is today. Where a page still uses another word,
the appendix lists the file, line and the change to make. The appendix is the hand-off for a later pass;
it is not applied here.

## Concepts

| Concept | Preferred label | Meaning (plain words) | Do not use | Where it lives |
|---|---|---|---|---|
| Consignment | Consignment | The record of one load that a transport office runs, from booking to delivery. | GR, LR, "GR record", "Consignments (GR/LR)" as a heading | Agency menu "Consignments", `/agency/consignments` (desktop "More") |
| Consignment note | Consignment note (GR/LR) | The paper lorry receipt the office issues for a consignment. Named once per page, as the document. | "GR" or "LR" alone as the name of the record or of an action | Button and form on `/agency/consignments` |
| Rate card | Rate card | The agency's default rates by vehicle type and route. | "Rates" as a page or menu name, "Rate Cards" as a heading | Agency home card "Rate Cards" and profile tile "Rates" (both point to `/agency/rates`, which now redirects to `/agency/clients`) |
| Client tariffs | Client tariffs | The rates agreed with one client. They override the rate card for that client. | "Tariffs" alone, "Rates" for client lanes | Agency "Clients", button on a client, `/agency/clients/:agreementId/tariffs` |
| Client | Client | A party the agency has an agreement with and books work for. | "Customer" on the agency side | Agency menu "Clients", `/agency/clients` |
| Subscription | Subscription | The TruckOpti plan the owner pays for. Shows the plan, trial and renewal. | "Billing" or "Invoices" for the plan | Menu "Subscription", `/subscription` (agency desktop "More", driver and customer menus) |
| Invoice | Invoice | A bill. Agencies raise freight invoices to clients; TruckOpti issues invoices for subscriptions. | "Billing & Invoices" as a heading | Agency menu "Invoices", `/agency/invoices`; customer invoice `/invoice/:shipmentId` |
| Freight invoice | Freight invoice | An invoice an agency raises to a client for moved freight. | "Bill" mixed with "Invoice" on one page | `/agency/invoices` |
| Earnings | Earnings | Money earned from trips or jobs. For an agency, the summary of job income; for a driver, their trip earnings. | "Billing" for agency income | Agency menu "Earnings", `/agency/billing` (heading "Earnings summary"); driver menu "Earnings", `/driver/earnings` |
| Billing (admin only) | Billing | Platform-side billing settings and checks, used only by the TruckOpti admin. | Any agency or customer label | Admin menu "Billing Settings" and "Billing Ops", `/admin/billing-settings`, `/admin/billing-ops` |
| Order | Order | A request from a customer to move goods. Stays "Order" until it becomes a shipment or consignment. | "Orders" as a bare menu name | Customer menu "Sale orders", `/sale-orders`; agency menu "Order import", `/agency/orders/import` |
| Sale order | Sale order | An order a customer raised, in their own system or on the app. | "Orders" as a menu name | Customer menu "Sale orders", `/sale-orders` |
| Order import | Order import | Loading a batch of orders for a client from a CSV file. | "Orders" as a menu name | Agency menu "Order import", `/agency/orders/import` |
| Job | Job | An agency assignment offered to a driver. The driver accepts or declines it. | "Trip" before the driver accepts | Agency menu "Jobs", `/agency/jobs`; driver home offers |
| Trip | Trip | A job the driver is executing or has finished. | "Job" once the driver has accepted and started it | Driver menu "Trips", `/driver/history`; heading "Trip History" |
| Shipment | Shipment | The customer's record of goods being moved, from booking to delivery. | "Booking" as a noun for the record | Customer "Track", `/tracking`; "Shipment History", `/history` |
| Book shipment | Book shipment | The action of creating a shipment. | "New Booking", "Booking" as a noun | Customer form `/booking/new` |
| Load plan | Load plan | How agency orders are loaded into vehicles. | "Load planning" | Agency menu "Load plan", `/agency/orders/plan` |
| Routes | Routes | The customer's route planner for delivery runs. | "Route plan" as a menu name | Customer menu "Routes", `/routes` |
| Packing | Packing | Fitting items into a vehicle in 3D. | "Pack" as a menu name, "3D Pack" as a card or menu name | Customer menu "Packing", `/packing` |
| Team | Team | The people who can work in the agency's account, with a role for each. | "Staff" and "Members" as headings | Agency menu "Team", `/agency/team` (heading "Team & Access") |
| Team member | Team member | One person in the agency's team. | "Staff member", "Member" alone | `/agency/team` list "Members" (should read "Team members") |
| Driver | Driver | A person who drives for an agency. | "Crew", "Operator" | Agency menu "Drivers", `/agency/drivers` |
| Vehicle | Vehicle | One vehicle the agency or customer owns, with its registration. | "Truck" in labels and messages | Agency menu "Fleet", `/agency/fleet` (add a "Vehicle" there) |
| Vehicle type | Vehicle type | A category of vehicle, such as a 14 ft or 20 ft body, with its size and capacity. | "Truck type", "Truck types" | Customer menu "Truck Fleet" card should read "Vehicle types", `/management/trucks` (route name unchanged) |
| Fleet | Fleet | The agency's whole set of vehicles, as one page. | "Fleet" for a single vehicle; "Truck Fleet" | Agency menu "Fleet", `/agency/fleet` (heading "Fleet Management") |

## Notes for the owner

- "Truck" is the everyday word in many offices. This glossary asks for "Vehicle" in the UI and keeps "Truck" in
  the brand name and in file or route names. The owner should confirm this choice before the later pass.
- Route paths (for example `/agency/billing`, `/management/trucks`) are not renamed. Only the words users see change.
- Legal text (`PrivacyPage`, `TermsPage`) is not edited without legal review.

## Appendix: Where the app still uses another word

Each row was read in the file at the line shown (lines as of 2026-11-18). The list is what was found by reading
the layouts and pages named below; it is not an exhaustive crawl. Other workers own these pages, so nothing here
has been changed.

| # | File:line | Current text | Preferred text |
|---|---|---|---|
| 1 | `frontend/src/layouts/MobileLayout.tsx:42` | "Orders" (customer nav) | "Sale orders" |
| 2 | `frontend/src/layouts/MobileLayout.tsx:43` | "Pack" (customer nav) | "Packing" |
| 3 | `frontend/src/layouts/AgencyLayout.tsx:29` | "Orders" (agency nav) | "Order import" |
| 4 | `frontend/src/pages/SaleOrdersPage.tsx:17` | Title "Sale Orders" | "Sale orders" (sentence case, as the nav) |
| 5 | `frontend/src/pages/SaleOrdersPage.tsx:42` | "No orders yet. Import your first sale order!" | "No sale orders yet. Import your first sale order." |
| 6 | `frontend/src/pages/AgencyConsignmentsPage.tsx:306` | Heading "Consignments (GR/LR)" | "Consignments" (the GR/LR name stays in the document name) |
| 7 | `frontend/src/pages/AgencyConsignmentsPage.tsx:330` | "Orders waiting for a GR" | "Orders waiting for a consignment note" |
| 8 | `frontend/src/pages/AgencyConsignmentsPage.tsx:359` | Button "Create GR" | "Create consignment note" |
| 9 | `frontend/src/pages/AgencyConsignmentsPage.tsx:36` | Status label "GR created" | "Consignment note created" |
| 10 | `frontend/src/pages/AgencyConsignmentsPage.tsx:55` | Status text "GR created" | "Consignment note created" |
| 11 | `frontend/src/pages/AgencyConsignmentsPage.tsx:206` | "Failed to create GR" | "Failed to create consignment note" |
| 12 | `frontend/src/pages/AgencyConsignmentsPage.tsx:376` | Label "Search by GR or order reference" | "Search by consignment note or order reference" |
| 13 | `frontend/src/pages/AgencyInvoicesPage.tsx:701` | "Delivered GRs ready to invoice" | "Delivered consignments ready to invoice" |
| 14 | `frontend/src/pages/AgencyClientsPage.tsx:747` | Button "Tariffs" | "Client tariffs" |
| 15 | `frontend/src/pages/AgencyTariffsPage.tsx:111` | Document title "Tariffs - TruckOpti" | "Client tariffs - TruckOpti" |
| 16 | `frontend/src/pages/AgencyTariffsPage.tsx:317` | Heading "Tariffs" | "Client tariffs" |
| 17 | `frontend/src/pages/AgencyProfilePage.tsx:206` | Tile "Billing" (opens `/agency/billing`) | "Earnings" |
| 18 | `frontend/src/pages/AgencyProfilePage.tsx:214` | Tile "Rates" (opens `/agency/rates`) | "Rate card" (the route now redirects; point it at the live rate card once one exists) |
| 19 | `frontend/src/pages/AgencyProfilePage.tsx:173` | Subtitle "Registered trucks under this agency" | "Registered vehicles under this agency" |
| 20 | `frontend/src/pages/AgencyDashboardPage.tsx:184` | Stat label "Trucks" | "Vehicles" |
| 21 | `frontend/src/pages/AgencyDashboardPage.tsx:205` | Button "Manage Trucks" | "Manage fleet" |
| 22 | `frontend/src/pages/AgencyDashboardPage.tsx:387` | Button "Billing" (opens `/agency/billing`) | "Earnings" |
| 23 | `frontend/src/pages/AgencyDashboardPage.tsx:394` | Button "Rate Cards" (opens `/agency/rates`) | "Rate card" (same redirect issue as row 18) |
| 24 | `frontend/src/pages/AgencyRatesPage.tsx:51` | Document title "Rate Cards - TruckOpti" | "Rate card - TruckOpti" (page is not routed; see `App.tsx:224`) |
| 25 | `frontend/src/pages/AgencyRatesPage.tsx:147` | Heading "Rate Cards" | "Rate card" |
| 26 | `frontend/src/pages/AgencyFleetPage.tsx:135` | Toast "Truck added to fleet" | "Vehicle added to fleet" |
| 27 | `frontend/src/pages/AgencyFleetPage.tsx:211` | Button "Add Truck" | "Add vehicle" |
| 28 | `frontend/src/pages/AgencyTeamPage.tsx:35` | Scope help "Trucks, driver employment and invitations, expenses and maintenance." | "Vehicles, driver employment and invitations, expenses and maintenance." |
| 29 | `frontend/src/pages/AgencyTeamPage.tsx:251` | "Staff see only what their scope allows. You remain the owner." | "Team members see only what their role allows. You remain the owner." |
| 30 | `frontend/src/pages/AgencyTeamPage.tsx:300` | Metric "Active members" | "Active team members" |
| 31 | `frontend/src/pages/AgencyTeamPage.tsx:312` | Heading "Members" | "Team members" |
| 32 | `frontend/src/pages/AgencyExpensesPage.tsx:716` | "No trucks yet. Add a truck on the Trucks page before recording fuel." | "No vehicles yet. Add a vehicle on the Fleet page before recording fuel." (confirm the target page first) |
| 33 | `frontend/src/pages/AgencyExpensesPage.tsx:975` | "No trucks yet. Add a truck on the Trucks page before scheduling maintenance." | "No vehicles yet. Add a vehicle on the Fleet page before scheduling maintenance." (confirm first) |
| 34 | `frontend/src/pages/AgencyLoadPlanPage.tsx:499` | Heading "2. Trucks to use" | "2. Vehicles to use" |
| 35 | `frontend/src/pages/AdminDashboardPage.tsx:250` | Label "Direct App Bookings" | "Direct app shipments" |
| 36 | `frontend/src/pages/NewShipmentPage.tsx:33` | Document title "New Booking - TruckOpti" | "Book shipment - TruckOpti" |
| 37 | `frontend/src/pages/NewShipmentPage.tsx:381` | Heading "New Shipment" | "Book shipment" |
| 38 | `frontend/src/pages/NewShipmentPage.tsx:426` | Label "Truck Type *" | "Vehicle type *" |
| 39 | `frontend/src/pages/NewShipmentPage.tsx:517` | "Creating Booking..." | "Booking shipment..." |
| 40 | `frontend/src/pages/Dashboard.tsx:182` | Stat label "Trucks Available" | "Vehicles available" |
| 41 | `frontend/src/pages/Dashboard.tsx:205` | Card label "3D Pack" | "Packing" |
| 42 | `frontend/src/pages/PackingPage.tsx:24` | Feature title "3D Bin Packing" | "Packing" (the 3D detail can go in the subtitle) |
| 43 | `frontend/src/pages/PackingPage.tsx:25` | Subtitle "Smart Truck Recommendation System" | "Smart vehicle recommendation system" |
| 44 | `frontend/src/pages/PackingPage.tsx:34` | Label "Recommended Trucks" | "Recommended vehicles" |
| 45 | `frontend/src/pages/PackingPage.tsx:256` | Document title "3D Packing - TruckOpti" | "Packing - TruckOpti" |
| 46 | `frontend/src/pages/PackingPage.tsx:673` | Toast title "Truck Booked" | "Vehicle booked" |
| 47 | `frontend/src/pages/TrucksPage.tsx:119` | Document title "Truck Types - TruckOpti" | "Vehicle types - TruckOpti" |
| 48 | `frontend/src/pages/TrucksPage.tsx:321` | Heading "Truck Types" | "Vehicle types" |
| 49 | `frontend/src/pages/TrucksPage.tsx:137` | Toast "Truck added successfully" | "Vehicle type added successfully" |
| 50 | `frontend/src/pages/TrucksPage.tsx:153` | Toast "Truck updated successfully" | "Vehicle type updated successfully" |
| 51 | `frontend/src/pages/TrucksPage.tsx:168` | Toast "Truck deleted successfully" | "Vehicle type deleted successfully" |
| 52 | `frontend/src/pages/TrucksPage.tsx:330` | "No Trucks Found" | "No vehicle types found" |
| 53 | `frontend/src/pages/TrucksPage.tsx:348` | Button "Seed Default Trucks" | "Add default vehicle types" |
| 54 | `frontend/src/pages/ManagementPage.tsx:54` | Card title "Truck Fleet" (opens `/management/trucks`) | "Vehicle types" |
| 55 | `frontend/src/pages/PricingPage.tsx:74` | Eyebrow "Plans & Billing" | "Plans & subscription" |
| 56 | `frontend/src/pages/PricingPage.tsx:91` | Plan limit label "Trucks" | "Vehicles" |
| 57 | `frontend/src/pages/LandingPage.tsx:74` | Feature label "Load planning" | "Load plan" |

### Audit claims checked and not confirmed (2026-11-18)

The terminology section of `docs/audit-2026-11-18/cross-cutting.md` has some out-of-date references. Fix the audit,
or treat these rows as corrections:

- `AgencyLayout:22` is now "Earnings", not "Billing". The `/agency/billing` route is unchanged.
- "Billing & Invoices" is no longer a heading anywhere (checked with grep).
- The agency "Rates" menu item is gone. `/agency/rates` redirects to `/agency/clients` (`App.tsx:224`).
- Line numbers in the audit are off by one or two (the "Orders" nav is `AgencyLayout.tsx:29` and `MobileLayout.tsx:42`).

### Open decisions for the owner

- Confirm "Vehicle" in the UI (instead of "Truck") and "Vehicle types" for the customer catalogue.
- Confirm whether the rate card should get a live page again. Right now the rate card has no page: `/agency/rates`
  redirects to Clients.
- Confirm the admin "Subscriptions" list name (kept as "Subscriptions" in this glossary).
- Legal wording ("Truck details" in `PrivacyPage.tsx:44`) needs legal review before any change.
