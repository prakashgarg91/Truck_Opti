# TruckOpti Android App Architecture

> **Version:** 1.0 | **Date:** 2026-06-10 | **Status:** Design Phase
>
> This document defines the Android app strategy for TruckOpti, covering 4 personas, management hierarchy escalation, and integration with the existing web platform.

---

## 1. App Personas & Modules

### 1.1 Driver App (`apps/android/driver`)
**Target Users:** Individual truck drivers, owner-drivers

| Feature | Priority | Description |
|---------|----------|-------------|
| **Trip Acceptance** | P0 | Accept/reject job offers with 4-digit OTP verification |
| **GPS Tracking** | P0 | Real-time location streaming to customer + admin |
| **Navigation** | P0 | Turn-by-turn to pickup + delivery (Google Maps SDK) |
| **POD Upload** | P0 | Photo capture of delivery proof + e-signature |
| **Earnings Dashboard** | P0 | Trip history, payouts, incentives |
| **Document Wallet** | P1 | DL, RC, insurance, fitness certificates |
| **Breakdown Alert** | P1 | SOS button → nearest mechanic + admin |
| **Fuel Log** | P2 | Fuel expense tracking with GPS mileage |
| **Chat with Agency** | P2 | In-app messaging for trip coordination |
| **Offline Mode** | P1 | Cache trips, sync when network returns |

**Tech Stack:** Kotlin, Jetpack Compose, Firebase Cloud Messaging, Google Maps SDK, Room DB

---

### 1.2 Agency App (`apps/android/agency`)
**Target Users:** Fleet owners, transport agencies, logistics companies

| Feature | Priority | Description |
|---------|----------|-------------|
| **Fleet Management** | P0 | Add/edit trucks, drivers, documents |
| **Job Allocation** | P0 | Assign trips to drivers, track status |
| **Live Fleet Map** | P0 | All trucks on map with status (idle/moving/busy) |
| **Billing & Invoicing** | P0 | Generate invoices, track payments |
| **Driver Performance** | P1 | On-time %, ratings, trip count |
| **Rate Card Manager** | P1 | Set per-route pricing |
| **Customer Leads** | P2 | Incoming booking requests from TruckOpti platform |
| **Commission Tracking** | P1 | Platform fee calculation, payout schedule |
| **Multi-User Access** | P2 | Sub-accounts for dispatchers, accountants |

**Tech Stack:** Kotlin, Jetpack Compose, Retrofit (REST API), MPAndroidChart

---

### 1.3 Customer App (`apps/android/customer`)
**Target Users:** Manufacturers, traders, SMEs, individuals

| Feature | Priority | Description |
|---------|----------|-------------|
| **Smart Booking** | P0 | Enter cargo details → 3D packing suggestion → truck recommendation |
| **Price Estimate** | P0 | Instant quote based on route + cargo + truck type |
| **Live Tracking** | P0 | Real-time truck location + ETA |
| **Order History** | P0 | Past shipments, invoices, PODs |
| **3D Packing Preview** | P0 | Visualize how cargo fits in truck (WebView/Unity) |
| **Multi-Stop Routes** | P1 | Add pickup/delivery waypoints |
| **Insurance Add-on** | P2 | Optional trip insurance at checkout |
| **Rating & Review** | P1 | Rate driver + agency post-delivery |
| **WhatsApp Sharing** | P1 | Share tracking link with recipients |
| **Recurring Shipments** | P2 | Schedule weekly/monthly routes |

**Tech Stack:** Kotlin, Jetpack Compose, Razorpay SDK, Google Maps SDK, WebView (for 3D packing)

---

### 1.4 Management App (`apps/android/management`)
**Target Users:** Relationship Managers, Senior RMs, Region Managers, VPs, Admin

| Feature | Priority | Description |
|---------|----------|-------------|
| **Query Inbox** | P0 | Assigned customer queries with SLA timer |
| **Escalation Dashboard** | P0 | View escalated queries, reassign, track resolution |
| **Performance Analytics** | P0 | Team metrics, resolution time, CSAT |
| **Customer 360°** | P1 | Full customer history, shipments, complaints |
| **Live Operations Map** | P1 | All active shipments, delays, exceptions |
| **Revenue Dashboard** | P1 | Revenue by region, RM, agency |
| **Approval Workflow** | P2 | Driver approvals, agency onboarding, refunds |
| **Broadcast Messaging** | P2 | Push notifications to drivers/agencies by region |
| **Audit Trail** | P2 | Log of all query assignments + escalations |

**Tech Stack:** Kotlin, Jetpack Compose, MPAndroidChart, Firebase Analytics

---

## 2. Management Hierarchy & Query Escalation

### 2.1 Role Hierarchy

```
                    ┌─────────────┐
                    │     VP      │  ← Final escalation
                    │  (Pan-India)│
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────┴────┐  ┌───┴────┐  ┌───┴────┐
         │ North   │  │ South  │  │ West   │  ← Region Managers
         │ Region  │  │ Region │  │ Region │     (3-5 states each)
         │ Manager │  │ Manager│  │ Manager│
         └────┬────┘  └───┬────┘  └───┬────┘
              │           │           │
        ┌─────┴─────┐ ┌──┴───┐  ┌───┴────┐
        │ Senior RM │ │Senior│  │ Senior │  ← Senior RMs
        │ (Delhi)   │ │ RM   │  │ RM     │     (1-2 cities each)
        │           │ │(Mum) │  │(Blr)   │
        └─────┬─────┘ └──┬───┘  └───┬────┘
              │          │          │
         ┌────┴────┐ ┌─┴────┐ ┌───┴────┐
         │   RM    │ │  RM  │ │   RM   │  ← Relationship Managers
         │(Gurgaon)│ │(Navi)│ │(White) │     (1 city / 50-100 customers)
         │         │ │      │ │field)  │
         └─────────┘ └──────┘ └────────┘
```

### 2.2 Escalation Rules

| Rule | Trigger | Action | SLA |
|------|---------|--------|-----|
| **R1: Auto-Escalate** | RM doesn't respond in 15 mins | Auto-assign to Senior RM | 15 min |
| **R2: Senior RM Timeout** | Senior RM doesn't respond in 30 mins | Escalate to Region Manager | 30 min |
| **R3: Region Manager Timeout** | Region Manager doesn't respond in 1 hour | Escalate to VP | 1 hour |
| **R4: Customer Request** | Customer presses "Talk to Manager" | Escalate 1 level up immediately | Instant |
| **R5: Critical Issue** | Accident, cargo damage, police | Skip to Region Manager + SMS alert | Instant |
| **R6: Weekend/Night** | After 8 PM / Sunday | Route to on-call Senior RM | Instant |
| **R7: VIP Customer** | Customer tagged "Enterprise" | Direct line to Senior RM | Instant |

### 2.3 Query Assignment Logic

```kotlin
// Pseudo-code for query assignment
fun assignQuery(query: CustomerQuery): Manager {
    val customer = query.customer
    val city = customer.city
    
    // 1. Find primary RM for city
    val primaryRM = getRMForCity(city)
    
    // 2. Check RM availability (online + workload < 10)
    if (primaryRM.isOnline && primaryRM.activeQueries < 10) {
        return primaryRM
    }
    
    // 3. Find backup RM in same city
    val backupRM = getBackupRMForCity(city)
    if (backupRM?.isOnline == true) {
        return backupRM
    }
    
    // 4. Escalate to Senior RM
    val seniorRM = getSeniorRMForCity(city)
    if (seniorRM.isOnline) {
        return seniorRM
    }
    
    // 5. Escalate to Region Manager
    val region = getRegionForCity(city)
    return getRegionManager(region)
}
```

### 2.4 Notification Flow

```
Customer raises query
        ↓
[FCM Push] → RM phone (sound + vibration)
        ↓
RM accepts within 15 min?
   ├─ YES → Query active, SLA timer starts
   └─ NO  → [Auto-escalation]
            ↓
    [FCM + SMS] → Senior RM
            ↓
    Senior RM accepts within 30 min?
       ├─ YES → Query active
       └─ NO  → [Auto-escalation]
                ↓
        [FCM + SMS + Email] → Region Manager
                ↓
        Region Manager accepts within 1 hour?
           ├─ YES → Query active
           └─ NO  → [Auto-escalation]
                    ↓
            [FCM + SMS + Email + Phone Call] → VP
```

---

## 3. Integration Architecture

### 3.1 Backend APIs (Existing Web Platform)

The Android apps will consume the same Supabase + Node.js backend:

| Endpoint | Used By | Auth |
|----------|---------|------|
| `supabase.functions/v1/agency-portal-*` | Agency App | JWT + agency role |
| `supabase.functions/v1/admin-portal-*` | Management App | JWT + admin role |
| `supabase.auth` | All Apps | OTP / Password / Google |
| `POST /api/v1/shipments` | Customer App | JWT + user role |
| `GET /api/v1/drivers/nearby` | Customer App | JWT |
| `POST /api/v1/packing/optimize` | Customer App | JWT |
| `GET /api/v1/tracking/:id` | All Apps | JWT |
| `POST /api/v1/payments/razorpay` | Customer App | JWT |
| `GET /api/v1/queries` | Management App | JWT + manager role |
| `POST /api/v1/queries/escalate` | Management App | JWT + manager role |

### 3.2 Real-Time Layer

| Feature | Technology | Channel |
|---------|------------|---------|
| GPS Tracking | Supabase Realtime | `driver_locations` table |
| Query Notifications | Firebase Cloud Messaging | Topic: `rm_{city_id}` |
| Chat Messages | Supabase Realtime | `chat_messages` table |
| Trip Status | Supabase Realtime | `job_offers` table |
| Admin Alerts | Firebase + SMS (Twilio) | `admin_alerts` topic |

### 3.3 Data Sync Strategy

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Driver App │────→│  Supabase   │←────│  Customer   │
│  (Kotlin)   │     │  Realtime   │     │  App        │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │  Edge       │
                    │  Functions  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         ┌────┴────┐  ┌───┴────┐  ┌───┴────┐
         │ Agency  │  │ Admin   │  │ Mgmt   │
         │ App     │  │ Portal  │  │ App    │
         └─────────┘  └─────────┘  └─────────┘
```

---

## 4. 3D Bin Packing on Mobile

### 4.1 Implementation Strategy

Since the 3D packing algorithm is computationally intensive, the mobile implementation will use a **hybrid approach**:

| Component | Location | Tech |
|-----------|----------|------|
| **UI / Visualization** | Mobile App | WebView → Three.js / React Three Fiber |
| **Algorithm Engine** | Cloud (Supabase Edge Function) | TypeScript (existing `packing.ts`) |
| **Caching** | Mobile | Room DB (store last 10 packing results) |
| **Offline Fallback** | Mobile | Simplified 2D packing heuristic |

### 4.2 User Flow

```
Customer opens app
        ↓
"Book a Truck" → Enter cargo details
        ↓
[Cloud API] → 3D packing optimization (2-3 sec)
        ↓
Mobile renders 3D visualization (WebView)
        ↓
"Recommended Truck: Tata 407"
        ↓
Customer confirms → Route optimization → Price quote
        ↓
Payment → Booking confirmed
```

### 4.3 Nearby Truck Discovery

```
Customer enters pickup location
        ↓
[Cloud API] → Query drivers within 50km radius
        ↓
Filter: truck type match, rating ≥ 4.0, available now
        ↓
Show map with 3-5 best matched drivers
        ↓
Customer selects driver → Instant booking request
        ↓
Driver gets FCM push → Accept/reject (2 min timeout)
```

---

## 5. Development Phases

### Phase 1: Driver App (Weeks 1-6)
- [ ] Project setup (Kotlin + Compose + MVVM)
- [ ] Authentication (OTP + password)
- [ ] Trip list + acceptance flow
- [ ] GPS tracking service (foreground + background)
- [ ] Navigation integration (Google Maps)
- [ ] POD photo upload
- [ ] Earnings dashboard

### Phase 2: Customer App (Weeks 4-10)
- [ ] Project setup
- [ ] Authentication
- [ ] Smart booking flow (cargo → packing → truck)
- [ ] 3D packing WebView integration
- [ ] Live tracking
- [ ] Payments (Razorpay SDK)
- [ ] Order history

### Phase 3: Agency App (Weeks 8-14)
- [ ] Fleet management
- [ ] Job allocation
- [ ] Live fleet map
- [ ] Billing module
- [ ] Driver performance

### Phase 4: Management App + Escalation (Weeks 12-18)
- [ ] Query inbox with SLA timer
- [ ] Escalation engine
- [ ] Performance analytics
- [ ] Customer 360° view
- [ ] Revenue dashboard
- [ ] Approval workflows

---

## 6. Folder Structure

```
apps/android/
├── driver/                    # Driver Android App
│   ├── app/
│   │   ├── src/main/java/com/truckopti/driver/
│   │   │   ├── ui/           # Compose screens
│   │   │   ├── viewmodel/    # MVVM layer
│   │   │   ├── data/         # Repositories, API
│   │   │   ├── service/      # GPS tracking service
│   │   │   └── di/           # Hilt modules
│   │   └── res/
│   └── build.gradle.kts
│
├── customer/                  # Customer Android App
│   ├── app/
│   │   ├── src/main/java/com/truckopti/customer/
│   │   │   ├── ui/
│   │   │   ├── viewmodel/
│   │   │   ├── data/
│   │   │   ├── packing/      # 3D packing WebView wrapper
│   │   │   └── di/
│   │   └── res/
│   └── build.gradle.kts
│
├── agency/                    # Agency Android App
│   ├── app/
│   │   ├── src/main/java/com/truckopti/agency/
│   │   │   ├── ui/
│   │   │   ├── viewmodel/
│   │   │   ├── data/
│   │   │   ├── fleet/        # Fleet management
│   │   │   └── di/
│   │   └── res/
│   └── build.gradle.kts
│
├── management/               # Management Android App
│   ├── app/
│   │   ├── src/main/java/com/truckopti/management/
│   │   │   ├── ui/
│   │   │   ├── viewmodel/
│   │   │   ├── data/
│   │   │   ├── escalation/  # Escalation engine
│   │   │   ├── analytics/     # Charts + reports
│   │   │   └── di/
│   │   └── res/
│   └── build.gradle.kts
│
└── shared/                   # Shared modules
    ├── network/              # Retrofit + API definitions
    ├── auth/                 # Supabase auth wrapper
    ├── realtime/             # Supabase Realtime wrapper
    ├── models/               # Data classes (Kotlin Multiplatform)
    └── ui-components/        # Shared Compose components
```

---

## 7. Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Kotlin + Compose** | Modern Android, less boilerplate, declarative UI |
| **Separate Apps** | Different personas need different store listings, permissions, update cycles |
| **Shared Module** | Common auth, API, models to avoid duplication |
| **WebView for 3D** | Reuse existing Three.js packing visualization, faster to market |
| **Supabase Realtime** | Already used in web platform, no new infrastructure |
| **FCM + SMS** | FCM for real-time, SMS as fallback for critical escalations |
| **Room DB** | Offline support for driver trips, customer order history |
| **Hilt** | Standard DI for Android, Google-backed |

---

## 8. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Driver App Downloads | 1,000 in Month 1 | Play Console |
| Customer App Downloads | 500 in Month 1 | Play Console |
| Query Resolution Time | < 30 min (RM level) | Management dashboard |
| Escalation Rate | < 10% of queries | Management dashboard |
| Driver Acceptance Rate | > 80% | Agency dashboard |
| 3D Packing Usage | > 60% of bookings | Customer app analytics |
| App Crash Rate | < 1% | Firebase Crashlytics |
| CSAT Score | > 4.2/5 | Post-trip survey |

---

*Document created as part of TO-111 product expansion planning.*
