# Truck_Opti Stitch Prompt Pack

> Improved method based on Trading Rex AI Terminal patterns (2026-05-11).
> Project URL: `projects/817968552986251880`

---

## What Trading Rex Does Better (Reference)

1. **AI governs the canvas**: They use Stitch chat to tag/organize screens, not just generate them.
2. **Legacy tagging**: Old screens tagged "Legacy" — preserved but out of the active flow.
3. **Tight naming**: Short, functional names, no ID bloat.
4. **One visual grammar held across all sessions**: Never mixed.
5. **Domain-matched design language**: Their terminal looks like a trading terminal.
6. **Chat-first**: Canvas is output, not control surface.

---

## Session 0 — Canvas Governance (Run First)

Paste into Stitch chat before any new session:

```text
Audit the current project canvas. Do the following in order:
1. List every screen grouped by actor: Public, Customer, Driver, Agency, Admin.
2. Identify any screen that is a duplicate, has an old title variant, or is no longer
   on the active development path.
3. Tag all such screens as Legacy — preserve all content and layout exactly, do not
   modify visual structure. Add the word "Legacy:" as a prefix to the screen title.
4. Report the final list of active screens (not Legacy) per actor, with their current titles.
Do not create any new screens during this audit.
```

---

## Master Prompt — Full Brand Foundation

Use this once to set the visual grammar. Never override it with follow-up prompts.

```text
Design a mobile-first logistics booking web app for the Indian market called TruckOpti.

Idea:
- Primary users: Customers (businesses and SMEs shipping goods), Drivers (independent truck
  operators), Agency partners (fleet aggregators), Admin/backoffice (internal ops team).
- Core job: connect shippers with available trucks, show real-time trip status, handle
  payments, and help drivers track their earnings.
- Business context: Indian road logistics, multi-city routes, Hindi/English bilingual,
  Razorpay payments, trust-first UX for first-time SME users.

Theme:
- Visual direction: operational dispatch platform, clean and trustworthy, not generic SaaS.
  Use a strong brand blue (#1A56DB) as primary, white backgrounds for customer-facing screens,
  and a dark slate (#0F172A) sidebar/nav. Keep layouts information-dense but not cluttered.
- Typography: Inter or Poppins, clear hierarchy, 16px minimum body on mobile.
- Status chips: green/amber/red for trip states, consistent across all roles.
- Brand traits: reliable, fast, transparent, professional, modern India.

Content:
- Show realistic Indian logistics data: cities like Mumbai, Delhi, Pune, Ahmedabad;
  truck types like 10-ft SXL, 14-ft HXL, 17-ft Trailer; freight categories like
  electronics, textiles, FMCG, pharma.
- All prices in INR (₹). Distances in km. Time in IST.
- Include OTP auth, Google sign-in, and mobile-number entry.

Quality bar:
- Every screen must communicate status clearly without ambiguity.
- Booking confidence must be visible at every step (estimated fare, truck details, ETA).
- Mobile-first (375px baseline), but desktop-ready for admin and agency views.
- No placeholder lorem ipsum — use realistic operational copy throughout.
```

---

## Session 1 — Customer Journey

```text
Generate the complete customer booking and tracking journey for TruckOpti. Use the
visual grammar already established in this project.

Screens to create:
1. Customer: Dashboard — recent shipments, quick-book CTA, status summary
2. Customer: New Booking — origin/destination, truck type selector, date/time picker
3. Customer: Fare Estimate — fare breakdown, truck options with price comparison, insurance badge
4. Customer: Booking Confirmation — order ID, truck assigned, driver name and rating, ETA
5. Customer: Live Tracking — map view, driver location, estimated arrival, trip timeline
6. Customer: Payment — Razorpay UPI/card/netbanking, invoice summary, GST line
7. Customer: Payment Success — confirmation, receipt download, rate-driver CTA
8. Customer: Shipment History — list with status chips, search/filter, repeat booking

Naming: all screens must start with "Customer: " prefix.
Do not modify any existing screens.
```

---

## Session 2 — Driver Journey

```text
Generate the complete driver job and trip management journey for TruckOpti.
Use the visual grammar already established in this project.
Driver screens should be mobile-first (375px), thumb-friendly, bold status chips,
minimal reading required while driving.

Screens to create:
1. Driver: Home — current job status, earnings summary, availability toggle
2. Driver: Job Offer — pickup/delivery details, distance, estimated payout, accept/decline
3. Driver: Active Trip — map, current waypoint, delivery instructions, call-customer button
4. Driver: Delivery Confirmation — OTP entry or photo upload to confirm delivery
5. Driver: Trip Complete — payout earned, trip summary, next available jobs
6. Driver: Earnings — weekly/monthly breakdown, pending settlements, bank transfer status
7. Driver: Profile & Docs — license, truck registration, insurance status badges

Naming: all screens must start with "Driver: " prefix.
Do not modify any existing screens.
```

---

## Session 3 — Agency / Partner Journey

```text
Generate the agency fleet and dispatch management journey for TruckOpti.
Agency views are desktop-first, tabular, data-dense, operational.

Screens to create:
1. Agency: Dashboard — active fleet count, jobs in progress, revenue this month, alerts
2. Agency: Fleet Management — truck list, each with availability, driver assigned, docs status
3. Agency: Job Assignment — assign driver/truck to booking, distance and route preview
4. Agency: Driver Roster — all drivers, availability, rating, trip count
5. Agency: Settlement — pending payouts, transaction history, export to CSV

Naming: all screens must start with "Agency: " prefix.
Do not modify any existing screens.
```

---

## Session 4 — Admin / Backoffice Journey

```text
Generate the admin backoffice operations journey for TruckOpti.
Admin views are desktop-first, high-density, with strong alert visibility.

Screens to create:
1. Admin: Dashboard — platform KPIs, active bookings, disputes pending, system health
2. Admin: Driver Approvals — driver verification queue, docs review, approve/reject/suspend
3. Admin: Booking Management — all bookings with advanced filter, status override
4. Admin: Payment Reconciliation — Razorpay webhook events, failed payments, refund triggers
5. Admin: User Management — customers, drivers, agencies, role assignment
6. Admin: Dispute Center — open disputes, resolution workflow, refund initiation

Naming: all screens must start with "Admin: " prefix.
Do not modify any existing screens.
```

---

## Iteration Prompt Patterns

Use ONE change per follow-up:

```text
On the Customer: Live Tracking screen, make the driver status and ETA the dominant
element. Add an emergency-contact button, delay alert chip, and estimated toll cost.
Do not change any other screens.
```

```text
On all Driver screens, increase touch target sizes, reduce text density by 30%,
and use larger status chips with high-contrast colors for outdoor/sunlight use.
```

```text
Add empty states, loading skeletons, and error banners to all Customer screens
that depend on live data. Do not change the layout or color system.
```

```text
Make the Admin: Dashboard feel like an operational control tower.
Dense data grid, alert tray at the top, heat-map for active routes by region.
```

---

## Prototype Wiring (Session 5)

After all role sessions are done:

```text
Wire the Customer journey as an interactive prototype:
Customer: Dashboard → Customer: New Booking → Customer: Fare Estimate →
Customer: Booking Confirmation → Customer: Live Tracking → Customer: Payment →
Customer: Payment Success.
Use tap/click on primary CTAs to trigger transitions. Do not modify screen content.
```

---

## Known Gaps (as of 2026-05-11)

| Gap | Screen needed | Priority |
|-----|--------------|----------|
| Live shipment tracking (mobile) | Customer: Live Tracking | P0 |
| Partner console home | Agency: Dashboard | P0 |
| Cancellation/refund flow | Customer: Cancellation + Refund | P1 |
| Driver earnings detail | Driver: Earnings | P1 |
| Support escalation | All roles: Support | P2 |

---

## Canvas State (as of 2026-05-11)

- Project: `projects/817968552986251880`
- Known active screens: ~53 on canvas, 0 edges (not yet wired)
- Duplicate: `Contact & Support - TruckOpti` (Legacy) vs `Contact Support - TruckOpti` (active)
- **First action**: run Session 0 governance prompt to tag Legacy screens before generating new ones.
