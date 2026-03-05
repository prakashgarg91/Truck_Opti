# 📖 USER REQUIREMENTS — TruckOpti

> **What the User Wants**
> Source of truth for the TruckOpti SaaS platform.
> Last Updated: 2026-03-05 by SONNET-002

---

## 🎯 The Product

**TruckOpti** — India’s modern logistics platform:
- Smart 3D bin-packing (fit more goods per truck)
- Route optimization (multi-stop, distance/cost/duration)
- Live shipment tracking (GPS, Supabase Realtime)
- GST-compliant invoicing (FCM/RCM, SAC 996511, e-way bills)
- Multi-portal: Customer / Agency / Driver / Platform Admin
- Uber-like driver job acceptance model
- ERP/SAP integration API

Full architecture: see `PRODUCT_VISION.md`
Phased roadmap: see `ROADMAP.md`

---

## ✅ Completed Features (v35 Live — 2026-03-04)

### 1. Customer Portal
- Dashboard: Active Shipments, Trucks Available, Routes Today, Deliveries Done
- 3D Bin Packing: 8 truck types, volume & weight utilisation %, web worker
- Route Optimization: multi-stop, distance/cost/duration (hours, not minutes — fixed v35)
- Live Tracking: PENDING → IN TRANSIT → DELIVERED lifecycle
- Book Truck modal: Customer, Origin, Destination
- GST Tax Invoice: SAC 996511, IGST/CGST/SGST auto by state, LR number
- Invoice actions: PDF download, Print, WhatsApp share
- Sale Orders: Import CSV/XLSX, validate with Zod, re-optimize

### 2. Management Hub
- Truck Fleet: 8 truck types (Ashok Leyland, BharatBenz, Eicher, etc.)
- Carton Inventory: 5 types with dimensions
- Customer Directory: add/edit/delete; 4 customers in demo
- System Health display

### 3. Notifications
- Real-time badge (Supabase Realtime subscription)
- Slide-over panel: Booked / Started / Delivered events

### 4. Authentication
- Email OTP (Supabase magic link)
- Google OAuth
- Admin role via JWT `user_metadata.role`
- Trial/subscription enforcement via `useSubscription` hook

### 5. Subscription & Billing
- Pricing page: Free / Pro / Business / Enterprise tiers (DB-backed)
- Razorpay checkout (test key installed; prod key pending)
- Trial days tracking + expiry banners
- Usage limits per plan

### 6. Infrastructure
- Heroku (Node 20.x, 337 MB slug with .slugignore)
- Supabase PostgreSQL (RLS enabled, 17 tables)
- Cloudflare DNS → truckopti.in + www
- VitePWA with `skipWaiting` + `clientsClaim` (fixed v35 — no stale JS)
- Invoice company-incomplete banner (fixed v35)

---

## ✅ Completed Since v36 (v36–v50)

| Feature | Completed In |
|---------|----------|
| `formatters.ts` (formatCurrency, formatDistance, formatDuration) | v36 |
| Driver Registration multi-step form | v36 |
| Company Profile Setup | v36 |
| Admin Driver Approval Queue | v36 |
| `drivers` + `transport_agencies` + `agency_jobs` + `job_offers` DB migration | v36–v39 |
| Driver portal: dashboard, trip flow, earnings, history | v38–v39 |
| Agency portal: dashboard, jobs, billing, fleet, drivers | v39 |
| Uber-style job offer (30s countdown) | v39 |
| 7-step driver trip flow with photo upload | v39 |
| Agency Assign Driver modal | v43 |
| Live tracking map (AgencyJobsPage) | v44 |
| PWA icons (192x192, 512x512, apple-touch) | v43 |
| Driver wallet card + earnings | v49 |
| Agency billing invoice PDF (jsPDF v4) | v49 |
| Agency Confirm Delivery button | v49 |
| BUG-020 GST rate 18%→5% fix | v50 |
| BUG-REDIRECT-001 PhonePe URL domain validation | v50 |

## ⏳ Pending (BATCH12)

| Feature | Priority | Notes |
|---------|----------|-------|
| Razorpay webhook Edge Function (HMAC verify) | P1 | Needs live Razorpay keys from owner |
| Admin dashboard real analytics | P2 | Query agency_jobs + transport_agencies |
| Driver document upload (licence + RC photo) | P2 | driver-docs storage bucket |
| Customer shipment history page | P2 | /shipment-history route |
| Agency notification bell (Realtime) | P2 | Already exists in MobileLayout; agency needs it too |

## 🛑 Founder Decisions Needed Before Phase 4

*(Table preserved below)*

---

## 🔮 Planned (ROADMAP)

See `ROADMAP.md` for full phased plan.

### Phase 2 — Driver App
- Dashboard: earnings, online/offline toggle, active job card
- Uber-style job offer (30s countdown, accept/decline)
- Active trip: Navigate → Pickup OTP → Photo → Journey → POD
- Live location (geolocation → Supabase → Customer map)
- Earnings wallet + UPI withdrawal

### Phase 3 — Agency Portal
- Fleet (trucks, docs, expiry alerts), driver assignment
- Rate cards + seasonal pricing
- GST billing, GSTR-1 export

### Phase 4 — Payments & GST
- Razorpay escrow (booking → release on POD)
- E-way bill (NIC API), RCM self-invoice, TDS (194C)
- ERP REST API + webhook + Tally/Zoho Books integration

### Phase 5 — Mobile & Scale
- PWA full offline, FCM push for job offers, camera POD
- Regional languages: Gujarati, Marathi, Tamil, Telugu
- Port logistics, Bangladesh/Nepal expansion

---

## 📈 Database (Supabase)

### Existing Tables (17)
```
profiles, subscription_plans, subscriptions, trucks, cartons, customers
routes, route_segments, shipments, packing_results, sale_orders, sale_order_items
notifications, invoices, payments, audit_logs, company_profiles
```

### Planned (Phase 1 — v36)
```sql
drivers (id, user_id, name, phone, vehicle_type, rc_number, license_number,
         aadhaar_last4, bank_account, ifsc, status, approved_by, created_at)
transport_agencies (id, user_id, company_name, gstin, transport_license, status)
driver_locations (driver_id, lat, lng, heading, updated_at)
job_offers (id, shipment_id, driver_id, offered_at, expires_at, status)
```

---

## 🔧 Technical Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + Lucide icons |
| State | Zustand |
| DB | Supabase (PostgreSQL 15, RLS) |
| Auth | Supabase Auth (email OTP + Google OAuth) |
| Maps | Leaflet/OSM (default) + Google Maps (if key set) |
| PDF | jsPDF + html2canvas |
| 3D Packing | Custom web worker (bin-packing algorithm) |
| Hosting | Heroku (Node 20.x) + Cloudflare DNS |
| PWA | VitePWA (workbox, skipWaiting, clientsClaim) |

---

## ✍️ Key Files

| Feature | File |
|---------|------|
| Packing | `frontend/src/pages/PackingPage.tsx` |
| Tracking | `frontend/src/pages/TrackingPage.tsx` |
| Routes | `frontend/src/pages/RoutesPage.tsx` |
| Invoice | `frontend/src/pages/InvoicePage.tsx` |
| Management | `frontend/src/pages/ManagementPage.tsx` |
| Layout | `frontend/src/layouts/MobileLayout.tsx` |
| Subscription | `frontend/src/hooks/useSubscription.ts` |
| Formatters | `frontend/src/utils/formatters.ts` (new v36) |
| Driver Register | `frontend/src/pages/DriverRegisterPage.tsx` (new v36) |
| Company Profile | `frontend/src/pages/CompanyProfilePage.tsx` (new v36) |
| Admin Drivers | `frontend/src/pages/AdminDriversPage.tsx` (new v36) |

---

## 🛑 Founder Decisions Needed (Phase 4+)

| Decision | Urgency |
|----------|---------|
| Commission rate (8% / 10% / 12%) | Before Phase 4 |
| GST model default: FCM or RCM | Before Phase 4 |
| Payment timing: on delivery or net 7 | Before Phase 4 |
| Pilot city: Mumbai / Delhi / Pune | Before Phase 2 |
| Pricing tiers for Agency portal | Before Phase 1 launch |


---
