# 🗓️ TRUCKOPTI — DEVELOPMENT ROADMAP
> Version: 2.0 | Created: 2026-03-04
> See PRODUCT_VISION.md for full architecture details

---

## 🔥 PHASE 0 — HOTFIXES (v35 ✔ Shipped + v36 in progress)
**Goal:** Fix all UI/UX overflow issues found in live testing

### UI/UX Overflow Bugs
- [x] Packing page: `37.819...%` → `38.0%` — Math.round in worker path (**v35**)
- [ ] Truck card volume % text overflowing card bounds (minor — v36)
- [x] Invoice: Replace "Your Company Name" — amber banner + link to profile (**v35**)
- [x] Routes: `0h 29m` duration — fixed hours vs minutes math bug (**v35**)
- [x] Home page SW cache → admin shows "Free Plan" — fixed `skipWaiting: true` + `clientsClaim` (**v35**)
- [ ] Numbers formatting: create `formatters.ts` utility (**v36 in progress**)
- [ ] Mobile: sidebar doesn't close on nav click (**v36 in progress**)
- [x] Track page: MapViewWrapper with OSM/Leaflet fallback — no white box
- [x] Notifications panel: slides from right as overlay (translate-x-full → translate-x-0) (**already working**)

### Phase 0 Code Improvements (v36)
- [ ] `formatPercent(value, decimals?)` utility
- [ ] `formatCurrency(value)` utility
- [ ] `formatDistance(km)` utility
- [ ] `formatDuration(hours)` utility
- [ ] Apply across Pack, Invoice, Routes, Home pages

---

## 🚀 PHASE 1 — MULTI-PORTAL FOUNDATION (v36 — in progress)
**Goal:** Setup portal routing, roles, and company profiles

### 1.1 Portal Routing Architecture
- [ ] `/` → Customer Portal (current)
- [ ] `/driver/*` → Driver Portal (new, mobile-first)
- [ ] `/agency/*` → Agency Portal (new)
- [ ] `/admin/*` → Platform Admin (current `/management` expanded)
- [ ] Role-based redirect on login (driver → `/driver/dashboard`, agency → `/agency/dashboard`)

### 1.2 Company Profile Setup
- [ ] **Onboarding wizard** for new customers (`/settings/company`)
- [ ] Company profile page with GSTIN, address, logo
- [ ] Replace invoice "Your Company Name" with actual company data (DB lookup)
- [ ] API key generation for ERP integration

### 1.3 Driver Registration Portal (`/driver/register`) — **v36 in progress**
- [ ] Multi-step registration form:
  - Step 1: Phone OTP verification
  - Step 2: Personal details (name, Aadhaar last 4)
  - Step 3: Vehicle details (type, RC number, capacity)
  - Step 4: Bank details (account + IFSC)
  - Step 5: Submission → "Under Review" state
- [ ] DB: `drivers` table migration (Supabase)
- [ ] Admin: Driver approval queue `/admin/drivers` **v36 in progress**

### 1.4 Agency Registration Portal (`/agency/register`)
- [ ] Business registration form (company, GSTIN, transport license)
- [ ] DB: `transport_agencies` table
- [ ] Admin: Agency approval queue in `/admin/agencies`

### 1.5 Driver Management (Admin)
- [ ] `/admin/drivers` — list all drivers (pending/active/suspended)
- [ ] Driver detail page — verify documents, approve/reject
- [ ] Export driver list (CSV)

---

## 🛻 PHASE 2 — DRIVER APP (Weeks 4–8)
**Goal:** Complete functional driver experience

### 2.1 Driver Dashboard (`/driver/dashboard`)
- [ ] Today's earnings
- [ ] Online/Offline toggle (prominent)
- [ ] Active job card (if on trip)
- [ ] Available jobs nearby (if online + no active job)
- [ ] Trip history (last 10)
- [ ] Rating display

### 2.2 Job Offer Flow
- [ ] New job push notification (Supabase Realtime)
- [ ] Job offer card (30-second countdown timer)
- [ ] Accept → job assigned, navigation begins
- [ ] Decline → job goes to next driver
- [ ] Offer expiry → auto-move to next driver

### 2.3 Active Trip Flow
- [ ] "Navigate to Pickup" → opens Google Maps / Waze
- [ ] "Arrived at Pickup" button
- [ ] OTP entry (customer gives OTP to driver for verification)
- [ ] Photo capture (loading photo)
- [ ] "Start Journey" 
- [ ] Live location sharing begins
- [ ] "Arrived at Destination"
- [ ] Photo capture (delivery photo)
- [ ] Recipient OTP/signature
- [ ] "Complete Delivery"

### 2.4 Driver Live Location
- [ ] `navigator.geolocation.watchPosition()` when on active trip
- [ ] Supabase upsert to `driver_locations` every 30 seconds
- [ ] Customer portal subscribes via Supabase Realtime
- [ ] Map marker moves in real-time for customer

### 2.5 Driver Earnings & Wallet
- [ ] Earnings breakdown per trip
- [ ] Weekly/monthly summary
- [ ] Wallet balance
- [ ] Withdrawal request flow (UPI/bank transfer)
- [ ] Trip-wise invoice (for driver's tax purposes)

---

## 🏢 PHASE 3 — AGENCY PORTAL (Weeks 8–14)
**Goal:** Complete transport agency management experience

### 3.1 Agency Dashboard (`/agency/dashboard`)
- [ ] Active jobs today
- [ ] Fleet utilization (trucks on road vs available)
- [ ] Revenue this month
- [ ] Pending driver documents

### 3.2 Fleet Management (`/agency/fleet`)
- [ ] Add truck (type, RC, insurance, fitness cert)
- [ ] Document expiry alerts (30/7 days before)
- [ ] Truck assignment to driver
- [ ] Truck availability status

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

### 3.5 Job Management (`/agency/jobs`)
- [ ] Incoming job requests
- [ ] Accept/decline (with reason)
- [ ] Assign to specific driver
- [ ] Track all active jobs
- [ ] Job history

### 3.6 Billing (`/agency/billing`)
- [ ] Generate invoice to customer
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
