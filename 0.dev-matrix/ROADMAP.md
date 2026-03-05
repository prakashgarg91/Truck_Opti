# 🗓️ TRUCKOPTI — DEVELOPMENT ROADMAP
> Version: 2.1 | Updated: 2026-03-05 (v42)
> See PRODUCT_VISION.md for full architecture details

---

## ✅ PHASE 0 — HOTFIXES (COMPLETE v35–v37)
## ✅ PHASE 1 — MULTI-PORTAL FOUNDATION (COMPLETE v36–v38)
## ✅ PHASE 2 — DRIVER APP (COMPLETE v38–v41)
## ✅ PHASE 3 — AGENCY PORTAL (COMPLETE v39–v41, minus payroll/invoicing)
## ✅ BOOKING FLOW — CORE LOOP (COMPLETE v42)

> v42 shipped: `NewShipmentPage.tsx` at `/booking/new`; "Book a Truck" button on Dashboard;
> `dispatch_job_to_drivers()` wired; DB migration `add_booking_columns_to_shipments` applied.
> **Core transaction loop is now functional end-to-end.**

---

## 🔄 REMAINING ITEMS — PHASE 3 POLISH (next batch)

### 3.5 Agency Jobs — Assign Driver to Job (P1)
- [x] Job list with accept/decline (**v40**)
- [x] **Assign driver to accepted job** — modal in AgencyJobsPage for accepted jobs (**v43**)
- [ ] Track active jobs on map

### 3.6 Agency Billing — Nav Access (P2 — acceptable workaround exists)
- [x] Billing page exists at `/agency/billing` (**v40**)
- [x] Accessible via Dashboard → Quick Actions → "Billing" button (**already in AgencyDashboardPage**)
- [ ] Not in bottom nav (by design — 5 items kept to avoid crowding)

### 3.3 Agency Drivers — Payroll (P2)
- [x] Invite, assign, unassign truck (**v41**)
- [ ] Payroll: mark driver payments as made

### 3.6 Agency Billing — GST Invoicing (P2)
- [ ] Generate GST invoice (GSTIN, SAC 996511) for customer
- [ ] GSTR-1 export CSV

---

## 💳 PHASE 4 — PAYMENTS & COMPLIANCE

### 4.1 Payment Gateway
- [ ] Razorpay live keys (BUG-007 — config only, owner action needed)
- [ ] Payment split: escrow → release on proof of delivery
- [ ] Refund flow

### 4.2 GST Compliance Engine
- [ ] E-way bill generation (NIC API)
- [ ] RCM self-invoice for customers
- [ ] GSTR-1 compilation per agency
- [ ] TDS tracking (194C)

### 4.3 ERP Integration API
- [ ] REST API `/api/v1/*` with API key auth
- [ ] Webhooks on status change

### 4.4 Matching Engine Enhancements
- [x] `dispatch_job_to_drivers()` — top-3 drivers by rating (**v41 DB function**)
- [ ] Proximity scoring (drive distance, not just city)
- [ ] Surge pricing in high-demand zones

---

## 📱 PHASE 5 — MOBILE & SCALE

### 5.1 PWA & Notifications
- [ ] PWA icons missing from `public/` — install prompt broken (P1)
- [ ] FCM push notifications for job offers (driver app in background)
- [ ] Biometric login (WebAuthn)
- [ ] Full offline capability (IndexedDB)

### 5.2 Driver Wallet
- [ ] Wallet balance display
- [ ] UPI withdrawal flow

---

## 🔴 OPEN BUGS

| ID | Severity | Description | Status |
|---|---|---|---|
| BUG-007 | P0 | Razorpay test key in prod — real payments fail | Config (owner) |
| BUG-008 | P0 | Phone OTP silently fails — Twilio not set | Config (owner) |
| BUG-013 | P2 | `/agency/billing` not in bottom nav | ~~Workaround: Dashboard quick action works~~ |
| BUG-014 | P1 | `trip-photos` Storage bucket existence unconfirmed | Verify/create |
| BUG-015 | P1 | PWA icons missing — install prompt fails | Create icons |
| BUG-016 | P1 | AgencyJobsPage shows `vehicle_type: '—'` — not joined from shipments | Code fix needed |
| BUG-017 | P1 | Agency accepted jobs have status 'accepted' but STATUS_CONFIG only has 'active' — no label shown | Code fix needed |

---

## 🛻 PHASE 2 — DRIVER APP (v38 core ✔)
**Goal:** Complete functional driver experience

### 2.1 Driver Dashboard (`/driver/dashboard`) ✔ (**v38**)
- [x] Today's earnings (**v38**)
- [x] Online/Offline toggle (prominent) (**v38**)
- [x] Active job card (if on trip) (**v38**)
- [x] Available jobs nearby (if online + no active job) (**v38** — Realtime subscription)
- [x] Trip history (last 10) (**v38**)
- [x] Rating display (**v38**)

### 2.2 Job Offer Flow ✔ (**v38**)
- [x] New job push notification (Supabase Realtime) (**v38**)
- [x] Job offer card (30-second countdown timer) (**v38**)
- [x] Accept → job assigned, navigation begins (**v38**)
- [x] Decline → job goes to next driver (**v38**)
- [x] Offer expiry → auto-move to next driver (**v38**)

### 2.3 Active Trip Flow ✔ (**v39**)
- [x] "Navigate to Pickup" → opens Google Maps / Waze (**v39**)
- [x] "Arrived at Pickup" button (**v39**)
- [x] OTP entry (customer gives OTP to driver for verification) (**v39** — auto-generated via DB trigger on accept)
- [x] Photo capture (loading photo) — real `<input capture="environment">` + Supabase Storage (**v41**)
- [x] "Start Journey" (**v39**)
- [x] Live location sharing begins (**v39** — GPS watchPosition while in_transit)
- [x] "Arrived at Destination" (**v39**)
- [x] Photo capture (delivery photo) — real camera capture + Storage upload (**v41**)
- [x] Recipient OTP/signature (**v39**)
- [x] "Complete Delivery" (**v39** — clears active_job_id, increments total_trips)

### 2.4 Driver Live Location ✔ (**v39/v40**)
- [x] `navigator.geolocation.watchPosition()` when on active trip (**v39**)
- [x] Supabase upsert to `driver_locations` every update (**v39**)
- [x] Customer portal subscribes via Supabase Realtime (**v40** — sync_driver_location_to_shipment DB trigger + TrackingPage Realtime sub)
- [x] Map marker moves in real-time for customer (**v40** — TrackingPage invalidates query on every shipment change)

### 2.5 Driver Earnings & Wallet (**v38 partial**)
- [x] Earnings breakdown per trip (**v38**)
- [x] Weekly/monthly summary (**v38**)
- [ ] Wallet balance
- [ ] Withdrawal request flow (UPI/bank transfer)
- [ ] Trip-wise invoice (for driver's tax purposes)

---

## 🏢 PHASE 3 — AGENCY PORTAL (v40 full DB ✔)
**Goal:** Complete transport agency management experience

### 3.1 Agency Dashboard (`/agency/dashboard`) ✔ (**v40 live data**)
- [x] Active jobs today (**v40** — real query from agency_jobs table)
- [x] Fleet utilization display (**v40** — fleet_size from transport_agencies)
- [x] Revenue this month (**v40** — real fare SUM from agency_jobs)
- [x] Full data: agency_jobs table created + RLS (**v40**)

### 3.2 Fleet Management (`/agency/fleet`) ✔ (**v40 full DB**)
- [x] Add truck (type, RC, insurance, fitness cert) (**v40** — inserts into agency_trucks table)
- [x] Document expiry alerts (30/7 days before) (**v40** — UI with date comparison)
- [ ] Truck assignment to driver
- [x] agency_trucks table in DB + RLS (**v40**)

### 3.3 Driver Management (`/agency/drivers`) (**v41 partial**)
- [x] Invite driver (clipboard copy of `/driver/register?ref={agencyId}`) (**v41**)
- [x] View assigned trucks + assign/unassign modal (**v41**)
- [x] Driver performance (trips, rating, online status) (**v41**)
- [ ] Payroll: mark payments as made
- [ ] SMS invite (Twilio — blocked by BUG-008)

### 3.4 Rate Card Management (`/agency/rates`) ✔ (**v41**)
- [x] Add rate: route + truck type + price (**v41**)
- [x] List all active rates (**v41**)
- [x] Active/inactive toggle per rate card (**v41**)
- [x] agency_rate_cards table in DB + RLS (**v41**)
- [ ] Seasonal pricing rules
- [ ] Rate visibility toggle (public/private) — currently all active rates are public read

### 3.5 Job Management (`/agency/jobs`) (**v40 full DB; assign pending**)
- [x] Job list with filter tabs (all/active/pending/completed/cancelled) (**v40**)
- [x] Accept/decline with DB status update (**v40**)
- [ ] Assign to specific driver (**BATCH8 P1**)
- [ ] Track all active jobs
- [ ] Job history

### 3.6 Billing (`/agency/billing`) ✔ (**v40 real data**)
- [x] Revenue overview cards — real fare data from agency_jobs (**v40**)
- [x] GST Due calculated at 5% on this-month revenue (**v40**)
- [ ] Generate invoice to customer (full GST invoice)
- [ ] GST invoice: GSTIN, SAC 996511, tax rates
- [ ] Bulk billing (month-end)
- [ ] Received payments tracking
- [ ] GSTR-1 export (CSV for CA)

---

## 💳 PHASE 4 — PAYMENTS & COMPLIANCE (Weeks 14–20)
**Goal:** Real money movement + GST automation

### 4.1 Payment Gateway Integration
- [ ] Razorpay integration for:
  - Customer pays platform (on booking)
  - Platform pays agency/driver (after delivery)
- [ ] Payment split: booking amount → escrow → release on POD
- [ ] Refund flow (cancellations)
- [ ] UPI deep-link for quick payments

### 4.2 GST Compliance Engine
- [ ] Auto-classify each transaction (FCM/RCM)
- [ ] E-way bill generation (NIC API integration)
- [ ] GSTR-1 data compilation per agency
- [ ] RCM self-invoice auto-generation for customers
- [ ] TDS tracking (Section 194C, 1% on freight > ₹30,000)
- [ ] GST reconciliation report

### 4.3 ERP Integration API
- [ ] REST API: `/api/v1/*` endpoints
- [ ] API key management per customer
- [ ] Webhook delivery with retry
- [ ] SAP integration guide
- [ ] Tally plugin (Phase 4+)
- [ ] Zoho Books sync

### 4.4 Matching Engine
- [ ] Score drivers/agencies by: proximity, rating, price
- [ ] Auto-send job offer to top-3 drivers in sequence
- [ ] Agency preference (if customer has contract with agency)
- [ ] Surge pricing in high-demand zones

---

## 📱 PHASE 5 — MOBILE & SCALE (Weeks 20+)
**Goal:** Native-quality PWA + regional expansion

### 5.1 Mobile PWA Optimization
- [ ] Driver app: full offline capability (service worker + IndexedDB)
- [ ] Install PWA prompt on driver registration
- [ ] Push notifications (FCM) for job offers
- [ ] Camera integration for POD photos
- [ ] Biometric login for drivers (WebAuthn)

### 5.2 Analytics & Intelligence
- [ ] Customer analytics dashboard
- [ ] Agency performance benchmarking
- [ ] Platform-wide freight rate index (like Platts for India)
- [ ] AI pricing suggestions based on demand/supply

### 5.3 Insurance Integration
- [ ] Cargo insurance (per-shipment or annual)
- [ ] Partner: Bajaj Allianz / HDFC ERGO
- [ ] Claims tracking

### 5.4 Fuel Management
- [ ] Fuel card partnership (HPCL/BPCL)
- [ ] Fuel advance for long routes
- [ ] Fuel expense vs actual tracking

### 5.5 Regional Expansion
- [ ] Hindi UI (present) → add Gujarati, Marathi, Tamil, Telugu
- [ ] State-specific compliance (Maharashtra, Gujarat, Tamil Nadu)
- [ ] Port logistics (JNPT, Mundra)
- [ ] International (Bangladesh, Nepal via land routes)

---

## 📊 SUCCESS METRICS

| Phase | Key Metric | Target |
|-------|------------|--------|
| Phase 0 | UI bug count | 0 critical |
| Phase 1 | Driver registrations | 50 in pilot city |
| Phase 2 | Jobs completed via app | 100/month |
| Phase 3 | Agencies onboarded | 10 |
| Phase 4 | GMV (Gross Merchandise Value) | ₹50L/month |
| Phase 5 | Cities active | 10 major cities |

---

## 🛑 DECISIONS NEEDED FROM FOUNDER

- [ ] **Commission rate**: Platform charges agencies/drivers what %?
- [ ] **FCM vs RCM default**: Which GST model to use by default?
- [ ] **Payment timing**: Pay driver on delivery OR on customer payment (net 7)?
- [ ] **Driver vehicle ownership**: Platform owns trucks? No — marketplace model only?
- [ ] **Pilot city**: Which city to launch driver app first? (Mumbai / Delhi / Pune?)
- [ ] **Pricing page**: Update with new tier structure (Customer / Agency / Enterprise)
