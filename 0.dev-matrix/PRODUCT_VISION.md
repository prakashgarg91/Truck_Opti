# 🚀 TRUCKOPTI — PRODUCT VISION v2.0
> **Modernising Logistics in India and the World**
> Document Owner: Prakash Gupta | Last Updated: 2026-03-04
> Status: APPROVED — Begin Phase 1 Development

> **2026-04-17 strategic extension:** future-state planning for password login, role-specific demo identities, partner interfaces, and TruckOpti office-team permissions is now tracked in `0.dev-matrix/PLATFORM-ROLE-INTERFACE-PLAN.md`. Treat that file as the canonical roadmap for interface expansion and rights segmentation; keep this document focused on the product mission and portal model.

---

## 🎯 THE MISSION

TruckOpti is becoming a **full-stack logistics marketplace** — not just a booking tool. We connect:

- **Consignors / Shippers** (companies booking trucks, currently "Customers")
- **Transport Agencies** (logistics companies with fleets)
- **Individual Drivers** (independent operators, like Uber for trucks)
- **Platform Operators** (us — marketplace + compliance + billing)

> **North Star:** Every truck movement in India documented, optimized, tracked, billed, and GST-compliant — through one platform.

---

## 🏗️ PLATFORM ARCHITECTURE — 4 PORTALS

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRUCKOPTI PLATFORM                                    │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │  CUSTOMER PORTAL │  │  AGENCY PORTAL   │  │   DRIVER APP     │          │
│  │  (Consignor/     │  │  (Transport Co.) │  │  (Mobile-first)  │          │
│  │   Shipper)       │  │                  │  │                  │          │
│  │  truckopti.in    │  │  agency.truckop  │  │  driver.truckop  │          │
│  │  /customer/*     │  │  ti.in           │  │  ti.in           │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
│           │                     │                     │                     │
│           └─────────────┬───────┘                     │                     │
│                         ▼                             │                     │
│              ┌─────────────────────┐                  │                     │
│              │   MATCHING ENGINE   │◄─────────────────┘                     │
│              │  (Load ↔ Truck/Driver)                                        │
│              └──────────┬──────────┘                                         │
│                         │                                                    │
│              ┌──────────▼──────────┐                                         │
│              │  ADMIN PORTAL       │                                         │
│              │  (Platform Ops)     │                                         │
│              └─────────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 👥 PORTAL 1 — CUSTOMER PORTAL (Consignor/Shipper)

> Current users: Companies booking trucks for freight movement.

### Core Users
- Logistics managers at manufacturing/trading companies
- SMEs sending goods regularly
- E-commerce sellers
- Individual shippers

### Key Features (Current → Enhanced)

#### Booking & Planning
- [ ] **ERP/SAP Integration** — REST API + Webhook endpoint for automated booking triggers
  - API Key management per company account
  - Inbound: `POST /api/v1/orders` (SAP sends shipment request)
  - Outbound: Webhooks on status changes (booked, picked, delivered)
  - Supported ERPs: SAP, Tally, Zoho, Odoo, custom REST
- [ ] **Rate Discovery** — See all agency & driver rates before booking
- [ ] **Spot Booking** (immediate) vs **Contract Booking** (recurring lanes)
- [ ] **Multi-shipment dashboard** — all open orders, in-transit, delivered
- [ ] **Company Profile** — GSTIN, billing address, default routes

#### Compliance & Documents
- [ ] **E-way Bill** — auto-generate / link existing
- [ ] **LR (Lorry Receipt)** — generated on truck booking
- [ ] **GST RCM Self-Invoice** — auto-generated when GTA service used
- [ ] **POD (Proof of Delivery)** — driver-uploaded photos & recipient sign
- [ ] **Document vault** — all shipment docs in one place

#### Analytics
- [ ] Freight spend by lane, month, truck type
- [ ] CO₂ footprint per shipment
- [ ] On-time delivery rate
- [ ] Cost vs budget variance

---

## 🏢 PORTAL 2 — TRANSPORT AGENCY PORTAL

> New portal. For logistics companies (GTAs) with their own fleet and drivers.

### Core Users
- Small/medium transport companies (5–500 trucks)
- Fleet owners who want to list capacity
- Aggregators managing multiple operators

### Key Features

#### Fleet & Driver Management
- [ ] **Fleet Registry** — Add trucks: type, RC number, fitness cert, insurance
- [ ] **Driver Onboarding** — DL upload, Aadhaar, bank details, vehicle assignment
- [ ] **Driver under Agency** — drivers work for agency, agency pays them
- [ ] **Document expiry alerts** — insurance, pollution, fitness cert

#### Rate Card Management
- [ ] **Route-based rates** — set price per km, minimum charges, per-ton rates
- [ ] **Truck-type rates** — Tata 407 vs Eicher 14ft vs BharatBenz 32ft
- [ ] **Seasonal pricing** — peak/off-peak multipliers
- [ ] **Spot rates** for one-off bookings

#### Job Management
- [ ] **Incoming jobs** — from platform matching engine
- [ ] **Accept/decline** jobs (agency level)
- [ ] **Assign to driver** — push job to specific driver
- [ ] **Manual assignment** for non-platform bookings

#### Billing & Finance
- [ ] **Invoice to customers** — GTA invoice with GST
- [ ] **Driver payouts** — mark driver payment status
- [ ] **Commission visibility** — platform fee shown
- [ ] **Monthly earnings report** — downloadable

#### Compliance
- [ ] **GTA registration** — GSTIN, PAN, transport license
- [ ] **GST filing data** — GSTR-1 export
- [ ] **RCM tracking** — which invoices trigger RCM

---

## 🚛 PORTAL 3 — DRIVER APP (Mobile-First PWA)

> New portal. Uber-like experience for truck drivers.

### Two Types of Drivers
1. **Agency Driver** — employed by a transport agency
2. **Independent Driver** — self-employed, owns own truck, registers directly with TruckOpti

### Registration Flow (Independent Driver)
```
Step 1: Basic Info (name, phone, Aadhaar)
  ↓
Step 2: Vehicle Details (truck type, RC number, capacity)
  ↓
Step 3: Document Upload (DL, RC, Insurance, Fitness Cert, PUC)
  ↓
Step 4: Bank Details (for payment transfer)
  ↓
Step 5: Selfie + verification (KYC)
  ↓
Step 6: Admin approval (1-2 business days)
  ↓
Step 7: Active — can see & accept jobs
```

### Job Lifecycle (Uber-Style)
```
NEW JOB ARRIVES
     │
     ▼
┌──────────────────────────────┐
│  📦 New Load Available!      │
│  Mumbai → Pune | 150 km      │
│  Goods: Electronics | 2T     │
│  Rate: ₹4,500                │
│  Pickup: Andheri Warehouse   │
│  In: 2 hours                 │
│                              │
│  ✅ ACCEPT    ❌ DECLINE       │
│  (30 second countdown)       │
└──────────────────────────────┘
     │ Accept
     ▼
NAVIGATE TO PICKUP
- Turn-by-turn directions (Google Maps / OSM)
- Customer contact visible
- Call/WhatsApp customer

     ↓
ARRIVED AT PICKUP
- Tap "Arrived at Pickup"
- Enter OTP given by customer (or scan QR)
- Check list of goods against LR
- Take photo of loaded goods

     ↓
IN TRANSIT
- Live location sharing starts (every 30s)
- Customer & agency see real-time position
- ETA shown to all stakeholders

     ↓
ARRIVED AT DESTINATION
- Tap "Arrived at Destination"
- Recipient signs on screen (or OTP)
- Take photo of delivered goods (POD)
- Upload POD

     ↓
DELIVERY COMPLETE
- Earnings credited to wallet
- Driver rating requested from customer
- Next available jobs shown
```

### Driver Dashboard
- [ ] **Earnings today / this week / this month**
- [ ] **Completed trips count**
- [ ] **Rating** (5-star from customers)
- [ ] **Document status** (valid / expiring soon / expired)
- [ ] **Wallet balance** + withdrawal request
- [ ] **Trip history** with all details

### Driver Status
- 🟢 **Online** — available for jobs
- 🟡 **On Job** — currently doing a trip
- 🔴 **Offline** — not available

---

## 🔁 PORTAL 4 — PLATFORM ADMIN (Expanded)

### Current → Enhanced

#### Driver Management
- [ ] **Driver approval queue** — verify documents
- [ ] **Flag/suspend drivers** — poor ratings, violations
- [ ] **Driver analytics** — trips, earnings, ratings

#### Agency Management
- [ ] **Agency approval** — verify GSTIN, transport license
- [ ] **Rate audit** — flag unreasonable rates
- [ ] **Agency performance metrics**

#### Matching Engine
- [ ] **Auto-match** load → nearest available driver/agency
- [ ] **Fallback chain** — if first driver declines → push to next
- [ ] **Manual override** — ops team can force assign

#### Commission Management
- [ ] **Platform fee** — e.g., 8% on each transaction
- [ ] **Commission tiers** — volume discounts for agencies
- [ ] **Payout schedule** — daily/weekly to drivers/agencies
- [ ] **Dispute management** — customer↔driver disputes

#### GST Compliance Dashboard
- [ ] **GSTR-1 aggregated** for all GTA services
- [ ] **RCM liability report** for customers
- [ ] **E-way bill log**
- [ ] **TDS on freight** (Section 194C tracking)

---

## 💰 BILLING & GST ARCHITECTURE

### Service Types & Tax Treatment

| Service | SAC Code | Tax Treatment |
|---------|----------|---------------|
| GTA Road Transport | 996511 | 5% IGST (no ITC) OR 12% IGST (with ITC) under FCM; or 5% under RCM |
| Loading/Unloading | 996719 | 18% GST |
| Cold Storage | 996711 | 18% GST |
| Platform Commission | 998599 | 18% GST |

### Invoice Types Generated

#### 1. Transport Invoice (GTA to Customer)
- LR Number
- Consignor, Consignee details
- Route, distance, weight
- Freight charges + GST (FCM or RCM note)
- E-way bill number

#### 2. GST RCM Self-Invoice (Customer-Generated)
- When GTA is unregistered OR opts for RCM
- Customer generates this themselves
- Platform auto-generates the format

#### 3. Driver/Agency Payment Voucher
- Net amount after platform commission deduction
- TDS deducted (if applicable)
- Running balance

#### 4. Platform Commission Invoice
- From TruckOpti to Agency/Driver
- 18% GST on commission

### RCM Flow
```
GTA (Transport Agency) provides service
    │
    ├── GTA registered + issues invoice → Customer pays GST directly (FCM)
    │
    └── GTA unregistered OR opts RCM → Customer pays GST under Reverse Charge
              │
              └── Platform generates RCM self-invoice template for customer
```

---

## 🔌 ERP/SAP INTEGRATION

### API-First Design
```
Base URL: https://api.truckopti.in/v1/

Authentication: Bearer token (API key from dashboard)

Endpoints:
  POST   /shipments              Create booking
  GET    /shipments/{id}         Get status
  GET    /shipments              List all
  POST   /shipments/{id}/cancel  Cancel
  GET    /rates                  Get rate quotes for a route

Webhooks (TruckOpti → Your System):
  shipment.created
  shipment.driver_assigned
  shipment.picked_up
  shipment.in_transit
  shipment.delivered
  shipment.invoice_ready
```

### SAP IDOC/BAPI Support (Phase 3)
- IDOC DESADV (Despatch Advice)
- IDOC INVOIC (Invoice)

---

## 📱 UI/UX OVERHAUL PLAN

### Known Issues to Fix Immediately

| Issue | Location | Fix |
|-------|----------|-----|
| Long decimals `37.819...%` | Pack page truck cards | `toFixed(1)` |
| Volume % overflows truck card | Pack page | Truncate + tooltip |
| `0h 29m` route duration (wrong without Maps) | Routes | Show `~X hrs` estimated |
| "Your Company Name" in invoice | Invoice | Company profile setup flow |
| Notifications panel overlaps content | All pages | Slide-over with backdrop |
| Home page shows "Free Plan" after SW cache | All pages | SW cache-bust strategy |
| Mobile: sidebar overlaps content | Mobile | Proper drawer close behavior |

### Design System Upgrade
- [ ] Consistent number formatting utility: `formatPercent()`, `formatCurrency()`, `formatDistance()`
- [ ] Skeleton loaders on all data-fetching components
- [ ] Empty state illustrations (not just text)
- [ ] Toast notifications replace browser alerts
- [ ] Responsive breakpoints audit (320px → 1920px)

---

## 📐 DATABASE SCHEMA ADDITIONS

### New Tables Needed

```sql
-- Driver profiles
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  agency_id UUID REFERENCES transport_agencies(id) NULL, -- null = independent
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  aadhaar_last4 TEXT,
  license_number TEXT UNIQUE NOT NULL,
  license_expiry DATE NOT NULL,
  vehicle_id UUID REFERENCES trucks(id),
  bank_account TEXT,
  bank_ifsc TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','inactive')),
  rating DECIMAL(3,2) DEFAULT 5.00,
  total_trips INTEGER DEFAULT 0,
  wallet_balance DECIMAL(12,2) DEFAULT 0,
  is_online BOOLEAN DEFAULT false,
  current_lat DECIMAL(10,8),
  current_lng DECIMAL(11,8),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Transport agencies  
CREATE TABLE transport_agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  gstin TEXT UNIQUE,
  pan TEXT,
  transport_license TEXT,
  city TEXT,
  state TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','suspended')),
  commission_rate DECIMAL(5,2) DEFAULT 8.00, -- platform commission %
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Rate cards
CREATE TABLE rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type TEXT NOT NULL CHECK (provider_type IN ('agency','driver')),
  provider_id UUID NOT NULL,
  truck_type_id UUID REFERENCES trucks(id),
  origin_state TEXT,
  destination_state TEXT,
  rate_per_km DECIMAL(10,2),
  minimum_charge DECIMAL(10,2),
  rate_per_ton DECIMAL(10,2),
  gst_included BOOLEAN DEFAULT false,
  gst_rate DECIMAL(5,2) DEFAULT 5.00,
  valid_from DATE DEFAULT CURRENT_DATE,
  valid_until DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Driver location (real-time, updated every 30s)
CREATE TABLE driver_locations (
  driver_id UUID REFERENCES drivers(id) PRIMARY KEY,
  lat DECIMAL(10,8) NOT NULL,
  lng DECIMAL(11,8) NOT NULL,
  heading DECIMAL(6,2),
  speed_kmh DECIMAL(6,2),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Job offers (Uber-style push)
CREATE TABLE job_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES shipments(id),
  driver_id UUID REFERENCES drivers(id),
  offered_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '30 seconds',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
  offered_rate DECIMAL(12,2)
);

-- Driver trips (completed)
CREATE TABLE driver_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES drivers(id),
  shipment_id UUID REFERENCES shipments(id),
  pickup_photo_url TEXT,
  delivery_photo_url TEXT,
  pickup_otp TEXT,
  delivery_otp TEXT,
  pickup_confirmed_at TIMESTAMPTZ,
  delivery_confirmed_at TIMESTAMPTZ,
  distance_km DECIMAL(10,2),
  driver_earning DECIMAL(12,2),
  platform_commission DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- E-way bills
CREATE TABLE eway_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES shipments(id),
  eway_number TEXT UNIQUE,
  generated_at TIMESTAMPTZ DEFAULT now(),
  valid_until TIMESTAMPTZ,
  total_value DECIMAL(12,2),
  hsn_code TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','cancelled','expired'))
);

-- Company profiles (for customers)
CREATE TABLE company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  company_name TEXT NOT NULL,
  gstin TEXT,
  pan TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  api_key TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  webhook_url TEXT,
  erp_type TEXT CHECK (erp_type IN ('SAP','Tally','Zoho','Odoo','custom',NULL)),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 🗺️ LIVE TRACKING ARCHITECTURE

### Current (v34)
- Static shipment status (Pending → In Transit → Delivered)
- No real GPS

### Target Architecture
```
Driver Phone (GPS)
    │ PWA Geolocation API (every 30s when online + on trip)
    ▼
Supabase Realtime → driver_locations table
    │
    ├── Customer portal → Mapbox/Leaflet live marker
    ├── Agency portal → Fleet map view (all drivers)
    └── Platform admin → All active shipments map
```

### Implementation
- Driver PWA: `navigator.geolocation.watchPosition()`
- Supabase Realtime subscription on `driver_locations`
- All portals subscribe to relevant driver location
- Accuracy: ~10-30m with good signal

---

## 🔐 AUTH & ROLES

### Updated Role System

| Role | Portal | Capabilities |
|------|--------|-------------|
| `admin` | Platform Admin | Everything |
| `customer` | Customer Portal | Book, track, invoice |
| `agency_admin` | Agency Portal | Full agency management |
| `agency_staff` | Agency Portal | View jobs, limited edit |
| `driver` | Driver App | See/accept jobs, update status |
| `driver_pending` | Driver App | Registration only |

### Auth Flow per Portal
- Customer: Email OTP OR Google OAuth
- Agency: Email + business verification
- Driver: Phone OTP (primary — most drivers use mobile)
- Platform Admin: Email + TOTP (2FA)

---

## 📈 REVENUE MODEL

| Revenue Stream | How | Rate |
|----------------|-----|------|
| Platform Commission | % of each booking | 5–8% |
| SaaS Subscription | Agency monthly plan | ₹2,999–₹29,999/mo |
| API Access | ERP integration tiers | ₹999–₹9,999/mo |
| GST Filing Service | Assisted compliance | ₹499/filing |
| Insurance | Cargo insurance via partner | Commission |
| Fuel Cards | Partner offer to drivers | Commission |

---

## 🗓️ DEVELOPMENT ROADMAP

See [ROADMAP.md](ROADMAP.md) for detailed phased plan.

### Summary
- **Phase 1** (Now → 4 weeks): UI/UX fixes + Driver Module foundation + Multi-portal routing
- **Phase 2** (4–8 weeks): Driver app complete + Agency portal foundation + Live tracking
- **Phase 3** (8–14 weeks): Agency portal complete + GST compliance engine + ERP integration
- **Phase 4** (14–20 weeks): Matching engine + Payments + Mobile apps (Android PWA)
- **Phase 5** (20+ weeks): Regional expansion + Insurance + ML pricing

---

*This document supersedes the old REQUIREMENTS.md for TruckOpti product.*
*For development framework rules see RULES.md, PATTERNS.md.*
