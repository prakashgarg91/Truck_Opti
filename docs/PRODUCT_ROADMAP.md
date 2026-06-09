# TruckOpti Product Roadmap & Feature Master List

> **Version:** 2.0 | **Date:** 2026-06-10 | **Status:** Post-Launch Expansion
>
> This document consolidates the competitive analysis, Android app strategy, and management hierarchy into a unified product roadmap.

---

## 1. Vision

**TruckOpti** is India's smartest logistics platform, combining **3D bin packing intelligence** with **real-time truck discovery** to reduce shipping costs by 12-20% and eliminate empty miles.

**Tagline:** *"Pack Smart. Ship Faster. Pay Less."*

---

## 2. Current State (Heroku v94 — June 2026)

### ✅ Live Features
| Feature | Platform | Status |
|---------|----------|--------|
| 3D Smart Packing Algorithm | Web | ✅ Live |
| Route Optimization | Web | ✅ Live |
| FTL Truck Booking | Web | ✅ Live |
| GPS Live Tracking | Web | ✅ Live |
| Multi-Persona Auth (Driver/Agency/Customer/Admin) | Web | ✅ Live |
| Razorpay + PhonePe Payments | Web | ✅ Live |
| Admin Dashboard (Analytics, Users, Payouts, Drivers, Agencies) | Web | ✅ Live |
| Agency Portal (Fleet, Jobs, Billing) | Web | ✅ Live |
| Driver Portal (Trips, Earnings, History) | Web | ✅ Live |
| Customer Dashboard (Orders, Tracking, History) | Web | ✅ Live |
| PWA with Offline Support | Web | ✅ Live |
| Email OTP + Password + Google OAuth | Web | ✅ Live |
| 5 Demo Accounts for Testing | Web | ✅ Live |

---

## 3. Competitor Landscape

### 3.1 WheelsEye
- **Strengths:** 26+ lakh trucks, instant booking (30 min), trip insurance, driver app, 24x7 support
- **Weaknesses:** No 3D packing, no route optimization, no smart truck matching

### 3.2 Delhivery
- **Strengths:** 4Bn+ parcels, 99.5% population coverage, warehousing, cross-border, data intelligence
- **Weaknesses:** No 3D packing, no driver-centric model, complex B2B focus

### 3.3 TruckOpti Differentiation
| Differentiator | Description |
|----------------|-------------|
| **3D Bin Packing** | Only platform optimizing cargo loading before truck dispatch |
| **Route + Packing Integration** | Single flow: pack → route → book → track |
| **Nearby Truck Discovery** | GPS-based matching, not just booking |
| **Hierarchical Management** | RM → Senior RM → Region Manager → VP escalation |
| **Multi-Persona Ecosystem** | Driver, Agency, Customer, Management in one platform |

---

## 4. Feature Master List

### 4.1 Core Platform (Web — Live)

| ID | Feature | Description | Status |
|----|---------|-------------|--------|
| W-01 | 3D Smart Packing | Algorithmic cargo optimization | ✅ |
| W-02 | Route Optimization | Multi-stop route planning | ✅ |
| W-03 | FTL Booking | Full truckload booking flow | ✅ |
| W-04 | GPS Tracking | Real-time location streaming | ✅ |
| W-05 | Multi-Persona Auth | Role-based access control | ✅ |
| W-06 | Payment Gateway | Razorpay + PhonePe integration | ✅ |
| W-07 | Admin Dashboard | Platform management portal | ✅ |
| W-08 | Agency Portal | Fleet owner management | ✅ |
| W-09 | Driver Portal | Trip + earnings management | ✅ |
| W-10 | Customer Portal | Booking + tracking | ✅ |
| W-11 | PWA | Offline-capable web app | ✅ |
| W-12 | Email OTP | 6-digit email verification | ✅ |
| W-13 | Google OAuth | Social login | ✅ |
| W-14 | Password Login | Email + password auth | ✅ |
| W-15 | Subscription Plans | Tiered pricing (Starter/Pro/Enterprise) | ✅ |
| W-16 | Invoice Generation | Auto-generated GST invoices | ✅ |
| W-17 | WhatsApp Sharing | Share tracking links | ✅ |
| W-18 | Mobile Responsive | Phone + tablet optimized | ✅ |
| W-19 | Dark Mode | UI theme toggle | ✅ |
| W-20 | Hindi Support | Regional language | ✅ |

### 4.2 Android Apps (Planned)

#### Driver App (`apps/android/driver`)
| ID | Feature | Priority | Phase |
|----|---------|----------|-------|
| D-01 | Trip Acceptance | P0 | Phase 1 |
| D-02 | GPS Tracking (Background) | P0 | Phase 1 |
| D-03 | Turn-by-Turn Navigation | P0 | Phase 1 |
| D-04 | POD Photo Upload | P0 | Phase 1 |
| D-05 | Earnings Dashboard | P0 | Phase 1 |
| D-06 | Document Wallet (DL, RC, Insurance) | P1 | Phase 1 |
| D-07 | SOS / Breakdown Alert | P1 | Phase 1 |
| D-08 | Offline Mode | P1 | Phase 1 |
| D-09 | Fuel Log | P2 | Phase 2 |
| D-10 | Chat with Agency | P2 | Phase 2 |
| D-11 | Rating System | P2 | Phase 2 |
| D-12 | Incentives & Bonuses | P2 | Phase 2 |

#### Customer App (`apps/android/customer`)
| ID | Feature | Priority | Phase |
|----|---------|----------|-------|
| C-01 | Smart Booking (Cargo → Packing → Truck) | P0 | Phase 2 |
| C-02 | 3D Packing Preview (WebView) | P0 | Phase 2 |
| C-03 | Price Estimate | P0 | Phase 2 |
| C-04 | Live Tracking | P0 | Phase 2 |
| C-05 | Order History | P0 | Phase 2 |
| C-06 | Nearby Truck Discovery | P0 | Phase 2 |
| C-07 | Payments (Razorpay SDK) | P0 | Phase 2 |
| C-08 | Multi-Stop Routes | P1 | Phase 2 |
| C-09 | Rating & Review | P1 | Phase 2 |
| C-10 | WhatsApp Sharing | P1 | Phase 2 |
| C-11 | Trip Insurance Add-on | P2 | Phase 3 |
| C-12 | Recurring Shipments | P2 | Phase 3 |
| C-13 | Referral Program | P2 | Phase 3 |

#### Agency App (`apps/android/agency`)
| ID | Feature | Priority | Phase |
|----|---------|----------|-------|
| A-01 | Fleet Management | P0 | Phase 3 |
| A-02 | Job Allocation | P0 | Phase 3 |
| A-03 | Live Fleet Map | P0 | Phase 3 |
| A-04 | Billing & Invoicing | P0 | Phase 3 |
| A-05 | Driver Performance | P1 | Phase 3 |
| A-06 | Rate Card Manager | P1 | Phase 3 |
| A-07 | Customer Leads | P2 | Phase 3 |
| A-08 | Commission Tracking | P1 | Phase 3 |
| A-09 | Multi-User Access | P2 | Phase 4 |
| A-10 | Analytics Dashboard | P2 | Phase 4 |

#### Management App (`apps/android/management`)
| ID | Feature | Priority | Phase |
|----|---------|----------|-------|
| M-01 | Query Inbox | P0 | Phase 4 |
| M-02 | Escalation Dashboard | P0 | Phase 4 |
| M-03 | SLA Timer | P0 | Phase 4 |
| M-04 | Auto-Escalation Engine | P0 | Phase 4 |
| M-05 | Performance Analytics | P0 | Phase 4 |
| M-06 | Customer 360° View | P1 | Phase 4 |
| M-07 | Live Operations Map | P1 | Phase 4 |
| M-08 | Revenue Dashboard | P1 | Phase 4 |
| M-09 | Approval Workflows | P2 | Phase 4 |
| M-10 | Broadcast Messaging | P2 | Phase 4 |
| M-11 | Audit Trail | P2 | Phase 4 |

### 4.3 Management Hierarchy (New)

| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| H-01 | Role Definition | RM, Senior RM, Region Manager, VP | P0 |
| H-02 | Query Assignment | Auto-assign based on city + workload | P0 |
| H-03 | Auto-Escalation | 15min → Senior RM, 30min → Region, 1hr → VP | P0 |
| H-04 | Manual Escalation | Customer "Talk to Manager" button | P0 |
| H-05 | Critical Skip | Accident/cargo damage → skip to Region | P0 |
| H-06 | On-Call Routing | After-hours → on-call Senior RM | P1 |
| H-07 | VIP Direct Line | Enterprise customers → Senior RM direct | P1 |
| H-08 | Backup RM | Auto-fallback when primary unavailable | P1 |
| H-09 | Escalation Analytics | Track resolution time by level | P1 |
| H-10 | Manager Performance | CSAT, resolution time, escalation rate | P1 |

### 4.4 Operational Features (Web + Mobile)

| ID | Feature | Description | Priority | Phase |
|----|---------|-------------|----------|-------|
| O-01 | Digital Bilty | Electronic consignment note | P2 | Q3 |
| O-02 | e-POD | Digital proof of delivery | P2 | Q3 |
| O-03 | Trip Insurance | Partner with ICICI Lombard / Digit | P2 | Q3 |
| O-04 | Multi-City Pickup | FTL with multiple pickup points | P2 | Q3 |
| O-05 | PTL Service | Part truckload (shared space) | P3 | Q4 |
| O-06 | Warehousing | Partner warehouse network | P3 | Q4 |
| O-07 | Cross Border | Nepal, Bangladesh, Bhutan | P3 | Q4 |
| O-08 | Rate Calculator | Public pricing tool | P2 | Q3 |
| O-09 | In-App Chat | Customer ↔ RM ↔ Driver | P2 | Q3 |
| O-10 | Phone Support | 24x7 helpline | P2 | Q3 |
| O-11 | Cashback Rewards | Loyalty program | P3 | Q4 |
| O-12 | Referral Program | Invite & earn | P3 | Q4 |

### 4.5 Data & Intelligence

| ID | Feature | Description | Priority | Phase |
|----|---------|-------------|----------|-------|
| I-01 | Demand Forecasting | AI-powered route demand prediction | P3 | Q4 |
| I-02 | Price Intelligence | Dynamic pricing based on demand/supply | P3 | Q4 |
| I-03 | RTO Reduction | Return-to-origin analytics | P3 | Q4 |
| I-04 | Driver Scoring | Behavior-based safety score | P2 | Q3 |
| I-05 | Route Efficiency | Empty mile reduction analytics | P2 | Q3 |
| I-06 | Customer Segmentation | SME vs Enterprise vs Individual | P2 | Q3 |
| I-07 | Cargo-Type Matching | Auto-suggest truck based on cargo | P1 | Q3 |
| I-08 | Fuel Efficiency | MPG tracking per driver/route | P2 | Q3 |

### 4.6 Developer & Partner Ecosystem

| ID | Feature | Description | Priority | Phase |
|----|---------|-------------|----------|-------|
| E-01 | Public APIs | REST API for 3rd party integration | P2 | Q3 |
| E-02 | Webhooks | Event-driven notifications | P2 | Q3 |
| E-03 | API Keys | Developer portal for API access | P3 | Q4 |
| E-04 | SDK | Embed TruckOpti booking in other apps | P3 | Q4 |
| E-05 | Franchise Portal | Franchisee onboarding + management | P3 | Q4 |
| E-06 | White Label | Rebrandable truck booking widget | P3 | Q4 |

---

## 5. Development Timeline

### Q2 2026 (Current — June)
- ✅ Web platform live (Heroku v94)
- ✅ All admin pages fixed
- ✅ Google Maps working
- ✅ 5 demo accounts seeded
- ✅ 18/18 launch-check pass

### Q3 2026 (July–September)
- **Month 1:** Driver Android App (Phase 1)
- **Month 2:** Customer Android App (Phase 2) + 3D packing WebView
- **Month 3:** Agency Android App (Phase 3) + Digital Bilty/e-POD

### Q4 2026 (October–December)
- **Month 4:** Management App (Phase 4) + Escalation Engine
- **Month 5:** PTL Service + Rate Calculator + In-App Chat
- **Month 6:** Data Intelligence Dashboard + Developer APIs

### Q1 2027 (January–March)
- Warehousing partner network
- Cross-border (Nepal, Bangladesh)
- AI demand forecasting
- Franchise network

---

## 6. Revenue Model

| Stream | Description | Margin |
|--------|-------------|--------|
| **Platform Fee** | 5-10% per booking | Primary |
| **Subscription** | Monthly SaaS for agencies (₹999-₹49,999) | Recurring |
| **Insurance Commission** | 10-15% on trip insurance | Add-on |
| **Priority Matching** | Pay for faster truck assignment | Premium |
| **Data API** | Charge per API call for enterprise | B2B |
| **Franchise Fee** | Upfront + royalty from franchisees | Expansion |

---

## 7. Success Metrics (12-Month Targets)

| Metric | Target | Current |
|--------|--------|---------|
| Monthly Bookings | 10,000 | ~50 (demo) |
| Active Drivers | 5,000 | 1 (demo) |
| Active Agencies | 500 | 1 (demo) |
| Registered Customers | 50,000 | ~10 (demo + real) |
| App Downloads (All) | 25,000 | 0 |
| Query Resolution Time | < 30 min | N/A |
| Escalation Rate | < 10% | N/A |
| CSAT Score | > 4.2/5 | N/A |
| Revenue | ₹50 lakh/month | ₹0 |
| NPS Score | > 50 | N/A |

---

## 8. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Driver app adoption low | High | Incentives, onboarding support, referral bonuses |
| 3D packing too complex | Medium | Simplified UI, video tutorials, auto-suggest |
| Competitor price war | High | Focus on packing + route differentiation, not price |
| GPS tracking battery drain | Medium | Optimized background service, driver education |
| Escalation overload | Medium | AI chatbot for L1, human only for L2+ |
| Payment failures | High | Multiple gateways, retry logic, manual fallback |
| Cargo damage disputes | Medium | Insurance integration, photo evidence, clear T&C |

---

## 9. Document References

| Document | Purpose |
|----------|---------|
| `docs/COMPETITOR_ANALYSIS.md` | WheelsEye + Delhivery feature breakdown |
| `docs/ANDROID_APP_ARCHITECTURE.md` | 4-app architecture + hierarchy escalation |
| `0.dev-matrix/LAUNCH_CHECKLIST.md` | Current launch readiness |
| `0.dev-matrix/AI-HANDOFF.md` | Session handoff |
| `frontend/src/pages/PackingPage.tsx` | 3D packing implementation |
| `supabase/functions/` | Edge functions (admin + agency portals) |

---

*Document created 2026-06-10 as part of TO-111 product expansion planning. All features subject to prioritization based on user feedback and market conditions.*
