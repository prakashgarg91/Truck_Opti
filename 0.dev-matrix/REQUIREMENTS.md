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

## ⏳ In Progress (v36 — this session)

| Feature | Status |
|---------|--------|
| `formatters.ts` utility (formatPercent, formatCurrency, formatDistance, formatDuration) | 🔄 Building |
| Sidebar NavLink: close on mobile nav click | 🔄 Building |
| Driver Registration (`/driver/register`) multi-step | 🔄 Building |
| Company Profile Setup (`/settings/company`) | 🔄 Building |
| Admin Driver Approval Queue (`/admin/drivers`) | 🔄 Building |
| Supabase `drivers` + `transport_agencies` table migration | 🔄 Building |

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

## 🛑 Founder Decisions Needed

| Decision | Urgency |
|----------|---------|
| Commission rate (8% / 10% / 12%) | Before Phase 4 |
| GST model default: FCM or RCM | Before Phase 4 |
| Payment timing: on delivery or net 7 | Before Phase 4 |
| Pilot city: Mumbai / Delhi / Pune | Before Phase 2 |
| Pricing tiers for Agency portal | Before Phase 1 launch |


---

## ✅ Completed Features

### 1. Menu System
- Full admin menu (M0-M10)
- Multi-step wizards
- Professional formatting (no emojis in posts)

### 2. Content Posting
- RSS feeds auto-posting
- AI-generated quotes
- 4K image generation
- Custom signatures per content type

### 3. Scheduling
- Frequency presets: 15min, 30min, 1hr, 2hr, 4hr, 6hr, 12hr, daily
- Specific time scheduling (e.g., 11:11 AM)
- Cron-based reliable execution

### 4. Database
- SQLite (local) + PostgreSQL (Heroku) + Supabase (cloud)
- Data persists across deploys

### 5. Quality
- 338/338 tests passing
- Clean codebase, no duplicates

---

## ⏳ Pending (Needs User Action)

| Feature | What's Needed |
|---------|---------------|
| Twitter/X | API credentials |
| Facebook | API credentials |
| Instagram | API credentials |
| LinkedIn | API credentials |

---

## 🧪 Test Resources

| Type | Value |
|------|-------|
| Admin | @Mizu_9 (ID: 1443609804) |
| Test Bot | @QuiteQuote_Bot |
| Test Channel | @OnlineLibraryZone |
| Test RSS | `https://incometaxindia.gov.in/_layouts/15/Dit/Pages/Rss.aspx` |

### Channels to Manage
- https://t.me/QuiteQuote (text quotes)
- https://t.me/Eleven_Quotes (4K images)
- https://t.me/IGNOUc (IGNOU updates)

---

## 🔮 Future Vision

### WebApp
- Mirror all bot menus in web interface
- Login via Supabase auth
- Visual pipeline builder
- Real-time analytics

### Multi-Platform
- Cross-post to Twitter/X, Facebook, Instagram, LinkedIn
- Unified content calendar
- Platform-specific formatting

### AI Integration
- User brings own Gemini API key
- Model selection (OpenRouter integration)
- Smart content suggestions

### Monetization
- Monthly subscription via PhonePe UPI
- Pricing: Cost + 60% margin

---

## 📋 Key Implementation Files

| Feature | File |
|---------|------|
| Admin Menu | `lib/comprehensive-admin-menu.js` |
| RSS Automation | `lib/enhanced-rss-automation.js` |
| Image Generation | `lib/premium-image-generator.js` |
| Scheduling | `lib/advanced-scheduler.js` |
| Content Pipeline | `lib/content-pipeline-manager.js` |

---

## 🚀 Deployment

```yaml
Platform: Heroku (eco dyno)
Entry: autonomous-bot-standalone.js
Database: Supabase Cloud
Timezone: Asia/Kolkata
Tests: 338/338 passing
```

---

**Version:** 2.14.3 | **Status:** Core Complete, Expansion Phase
