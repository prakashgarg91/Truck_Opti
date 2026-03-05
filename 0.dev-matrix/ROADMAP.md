# 🗓️ TRUCKOPTI — DEVELOPMENT ROADMAP
> Version: 2.0 | Created: 2026-03-04
> See PRODUCT_VISION.md for full architecture details

---

## 🔥 PHASE 0 — HOTFIXES (v35 ✔ + v36 ✔ + v37 in progress)
**Goal:** Fix all UI/UX overflow issues found in live testing

### UI/UX Overflow Bugs
- [x] Packing page: `37.819...%` → `38.0%` — Math.round in worker path (**v35**)
- [x] Truck card volume % text overflowing card bounds — `truncate min-w-0` (**v37**)
- [x] Invoice: Replace "Your Company Name" — amber banner + link to profile (**v35**)
- [x] Routes: `0h 29m` duration — fixed hours vs minutes math bug (**v35**)
- [x] Home page SW cache → admin shows "Free Plan" — fixed `skipWaiting: true` + `clientsClaim` (**v35**)
- [x] Numbers formatting: `formatters.ts` utility created + applied (**v36**)
- [x] Mobile: sidebar doesn't close on nav click (**v36**)
- [x] Track page: MapViewWrapper with OSM/Leaflet fallback — no white box
- [x] Notifications panel: slides from right as overlay (**already working**)

### Phase 0 Code Improvements (✔ All Done)
- [x] `formatPercent(value, decimals?)` utility (**v36**)
- [x] `formatCurrency(value)` utility (**v36**)
- [x] `formatDistance(km)` utility (**v36**)
- [x] `formatDuration(hours)` utility (**v36**)
- [x] Applied across PackingPage, RoutesPage, TrucksPage, CompanyProfilePage (**v36/v37**)
- [x] ProfilePage: company merge-not-overwrite fix + Full Profile link (**v37**)

---

## 🚀 PHASE 1 — MULTI-PORTAL FOUNDATION (v36 ✔ + v37 ✔ + v38 ✔ COMPLETE)
**Goal:** Setup portal routing, roles, and company profiles

### 1.1 Portal Routing Architecture
- [x] `/` → Customer Portal (current)
- [x] `/driver/*` → Driver Portal (`/driver/register` live) (**v36**)
- [x] `/agency/*` → Agency Portal (`/agency/register` live) (**v38**)
- [x] `/admin/*` → Platform Admin (`/admin/drivers` + `/admin/agencies` live) (**v36/v38**)
- [x] Role-based redirect on login (driver → `/driver/dashboard`, agency → `/agency/dashboard`) (**v38**)

### 1.2 Company Profile Setup
- [x] **Company profile page** with GSTIN, PAN, address, contact (`/settings/company`) (**v36**)
- [x] Replace invoice "Your Company Name" with `user_metadata.company` (**v35/v36**)
- [x] ProfilePage: merge-safe company save + Full Profile link (**v37**)
- [ ] API key generation for ERP integration (Phase 4)

### 1.3 Driver Registration Portal (`/driver/register`) ✔ (**v36**)
- [x] Multi-step registration form: Personal → Vehicle → Bank → Submit (**v36**)
- [x] DB: `drivers` table migration (SQL written — needs Supabase apply) (**v36**)
- [x] Admin: Driver approval queue `/admin/drivers` (**v36**)

### 1.4 Agency Registration Portal (`/agency/register`) (**v38**)
- [x] Business registration form (company, GSTIN, transport license) (**v38**)
- [x] DB: `transport_agencies` table (SQL written — needs Supabase apply) (**v36**)
- [x] Admin: Agency approval queue in `/admin/agencies` (**v38**)

### 1.5 Driver Management (Admin) ✔ (**v36/v38**)
- [x] `/admin/drivers` — list all drivers (pending/active/suspended) (**v36**)
- [x] Driver detail page — verify documents, approve/reject individual fields (**v38**)
- [ ] Export driver list (CSV)

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
- [ ] Photo capture (loading photo) — UI placeholder in place, camera capture Phase 5
- [x] "Start Journey" (**v39**)
- [x] Live location sharing begins (**v39** — GPS watchPosition while in_transit)
- [x] "Arrived at Destination" (**v39**)
- [ ] Photo capture (delivery photo) — UI placeholder in place
- [x] Recipient OTP/signature (**v39**)
- [x] "Complete Delivery" (**v39** — clears active_job_id, increments total_trips)

### 2.4 Driver Live Location ✔ (**v39**)
- [x] `navigator.geolocation.watchPosition()` when on active trip (**v39**)
- [x] Supabase upsert to `driver_locations` every update (**v39**)
- [ ] Customer portal subscribes via Supabase Realtime
- [ ] Map marker moves in real-time for customer

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

### 3.3 Driver Management (`/agency/drivers`)
- [ ] Invite driver (SMS with registration link)
- [ ] View assigned trucks
- [ ] Driver performance (trips, rating, earnings)
- [ ] Payroll: mark payments as made

### 3.4 Rate Card Management (`/agency/rates`)
- [ ] Add rate: route + truck type + price
- [ ] List all active rates
- [ ] Seasonal pricing rules
- [ ] Rate visibility toggle (public/private)

### 3.5 Job Management (`/agency/jobs`) ✔ (**v40 full DB**)
- [x] Job list with filter tabs (all/active/pending/completed/cancelled) (**v40**)
- [x] Accept/decline with DB status update (**v40**)
- [ ] Assign to specific driver
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
