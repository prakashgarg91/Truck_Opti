# Competitor Feature Analysis

> **Date:** 2026-06-10 | **Analyst:** Copilot | **Scope:** WheelsEye, Delhivery, TruckOpti Gap Analysis

---

## 1. WheelsEye (wheelseye.com)

**Tagline:** "India ka #1 Truck Booking App" | **Fleet:** 26+ lakh GPS-enabled trucks | **Coverage:** 19,000+ PIN codes

### Core Features
| Feature | Description | TruckOpti Status |
|---------|-------------|------------------|
| **Instant Truck Booking** | Book trucks in 30 mins | ✅ Partial (web booking exists) |
| **All Truck Types** | Multiple truck categories | ✅ Supported |
| **PAN-India Delivery** | Deliver across India | ✅ Supported |
| **Market-Based Pricing** | Real-time price estimates | ✅ Supported |
| **24x7 GPS Tracking** | Live GPS for every trip | ✅ Supported (Google Maps) |
| **Trip Insurance** | Up to ₹50 lakh coverage (₹299+) | ❌ Not implemented |
| **Multiple Payment Options** | Cash, UPI, wallet, card | ✅ Razorpay + PhonePe |
| **Bilty / POD / Invoices** | Digital consignment notes | ❌ Not implemented |
| **24x7 Dedicated Support** | Phone/chat support | ❌ Not implemented |
| **FTL Multi-City Pickup** | Pickup from multiple cities | ❌ Not implemented |
| **Driver App** | Dedicated driver mobile app | ❌ Not implemented |
| **Cashback Rewards** | ₹50,000 free cash on signup | ❌ Not implemented |
| **User Reviews** | Business testimonials | ❌ Not implemented |
| **Material Weight Input** | Weight-based pricing | ✅ Partial |

### WheelsEye App (iOS/Android)
- Download: [App Store](https://apps.apple.com/in/app/truck-booking-app-by-wheelseye/id1572422031)
- Features: Price estimates, booking, tracking, insurance, payments, POD

---

## 2. Delhivery (delhivery.com)

**Tagline:** "India's largest fully integrated logistics services provider"

### Scale Metrics
- **4 Bn+** parcels shipped since inception
- **99.5%** Indian population covered
- **48K+** businesses served
- **7.4 Mn+** tonnes freight shipped
- **22 M+** sq ft logistics infrastructure

### Service Suite
| Service | Description | TruckOpti Status |
|---------|-------------|------------------|
| **Express Parcel** | Door-to-door parcel delivery | ❌ Not implemented |
| **PTL (Part Truckload)** | Shared truck space | ❌ Not implemented |
| **FTL (Full Truckload)** | Dedicated truck booking | ✅ Core feature |
| **International** | Cross-border to 220+ countries | ❌ Not implemented |
| **Supply Chain / Warehousing** | Inventory storage + fulfilment | ❌ Not implemented |
| **Cross Border** | Export/import logistics | ❌ Not implemented |
| **Data Intelligence** | Location intelligence, RTO insights | ❌ Not implemented |
| **Software Platform** | API-first logistics OS | ❌ Not implemented |
| **Personal Courier** | Individual shipping | ❌ Not implemented |
| **Fleet Owner Partnership** | Join as fleet partner | ❌ Not implemented |
| **Franchise Network** | Franchise opportunities | ❌ Not implemented |
| **Developer APIs** | REST APIs for integration | ✅ Partial (Supabase) |
| **Rate Calculator** | Public pricing tool | ❌ Not implemented |
| **ODR Portal** | Online dispute resolution | ❌ Not implemented |

### Delhivery Solutions by Segment
| Segment | Offering | TruckOpti Gap |
|---------|----------|---------------|
| **D2C Brands** | Integrated logistics (parcel + warehouse + freight + software) | ❌ No warehousing, no cross-border |
| **Personal Courier** | Doorstep pickup, real-time tracking, free pickup | ❌ No courier service |
| **B2B Enterprises** | Factory-to-retailer supply chain | ❌ No SCM suite |

---

## 3. Feature Gap Matrix: TruckOpti vs Competitors

| Feature Category | WheelsEye | Delhivery | TruckOpti (Current) | Priority |
|------------------|-----------|-----------|---------------------|----------|
| **3D Bin Packing** | ❌ | ❌ | ✅ **UNIQUE** | P0 |
| **Smart Route Optimization** | ❌ | ❌ | ✅ **UNIQUE** | P0 |
| **FTL Truck Booking** | ✅ | ✅ | ✅ | P0 |
| **GPS Live Tracking** | ✅ | ✅ | ✅ | P0 |
| **Driver Mobile App** | ✅ | ✅ | ❌ | P1 |
| **Customer Mobile App** | ✅ | ✅ | ❌ | P1 |
| **Agency Mobile App** | ❌ | ❌ | ❌ | P1 |
| **Management Dashboard** | ❌ | ✅ (B2B portal) | ✅ (Web admin) | P0 |
| **Trip Insurance** | ✅ | ✅ | ❌ | P2 |
| **Digital Bilty / POD** | ✅ | ✅ | ❌ | P2 |
| **Multi-City Pickup (FTL)** | ✅ | ❌ | ❌ | P2 |
| **Part Truckload (PTL)** | ❌ | ✅ | ❌ | P3 |
| **Express Parcel** | ❌ | ✅ | ❌ | P3 |
| **Warehousing** | ❌ | ✅ | ❌ | P3 |
| **Cross Border** | ❌ | ✅ | ❌ | P3 |
| **Data Intelligence / RTO** | ❌ | ✅ | ❌ | P3 |
| **Rate Calculator (Public)** | ✅ | ✅ | ❌ | P2 |
| **Cashback / Rewards** | ✅ | ❌ | ❌ | P3 |
| **Fleet Owner Partnership** | ❌ | ✅ | ✅ (Agency model) | P1 |
| **Franchise Network** | ❌ | ✅ | ❌ | P3 |
| **Developer APIs** | ❌ | ✅ | ✅ Partial | P2 |
| **Personal Courier** | ❌ | ✅ | ❌ | P3 |
| **24x7 Phone Support** | ✅ | ✅ | ❌ | P2 |
| **In-App Chat Support** | ❌ | ✅ | ❌ | P2 |

---

## 4. TruckOpti's Differentiated Position

### Unique Selling Propositions (USPs)
1. **3D Smart Packing Algorithm** — Neither WheelsEye nor Delhivery offers bin-packing optimization
2. **Route + Packing Integration** — Find best truck + optimize cargo loading in one flow
3. **Real-Time Nearby Truck Discovery** — GPS-based driver matching (not just booking)
4. **Hierarchical Management** — RM → Senior RM → Region Manager → VP escalation (unique)
5. **Multi-Persona Platform** — Driver, Agency, Customer, Management in one ecosystem

### Competitive Moat Strategy
| Moat | Description |
|------|-------------|
| **Algorithmic** | 3D packing + route optimization IP |
| **Network** | Driver + agency density in tier-2/3 cities |
| **Data** | Cargo-type → truck-type matching intelligence |
| **Integration** | Packing + routing + tracking + billing in one app |

---

## 5. Recommended Feature Roadmap (Post-Launch)

### Phase 1: Core Mobile (Months 1-3)
- [ ] Driver Android App (trip acceptance, GPS tracking, POD upload)
- [ ] Customer Android App (booking, tracking, payments)
- [ ] Agency Android App (fleet management, job allocation)

### Phase 2: Operational (Months 3-6)
- [ ] Digital Bilty / e-POD
- [ ] Trip Insurance integration
- [ ] In-app chat support
- [ ] Rate calculator public page

### Phase 3: Scale (Months 6-12)
- [ ] PTL (Part Truckload) service
- [ ] Warehousing partner network
- [ ] Cross-border (Nepal, Bangladesh, Bhutan)
- [ ] Data intelligence dashboard (RTO, delivery success)

### Phase 4: Ecosystem (Year 2)
- [ ] Personal courier service
- [ ] Franchise network
- [ ] Developer API marketplace
- [ ] AI-powered demand forecasting

---

*Document generated from live competitor website analysis on 2026-06-10.*
