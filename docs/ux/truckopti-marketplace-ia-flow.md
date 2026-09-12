# TruckOpti Marketplace Information Architecture and Flow Specification

## Design intent

TruckOpti should support self-serve and assisted Indian logistics operations across shipper, driver, fleet/agency, operations and admin roles. The product spine is dispatch, pricing, trip execution, POD, settlement, disputes and support.

## Role navigation

### Customer / Shipper
Home · Loads · Trips · Billing · Help · More

Primary actions: repeat/create load, track trip, download POD/invoice, dispute a charge, manage company/users/documents.

### Driver
Home · Loads · Trips · Earnings · Help · Profile

Primary actions: accept work, follow next trip task, check in, upload proof/POD, inspect payout, request emergency/support help.

### Agency / Fleet Owner
Home · Dispatch · Fleet · Trips · Ledger · Help · More

Primary actions: find/bid loads, calculate margin, assign/reassign truck and driver, monitor exceptions, reconcile payout/disputes, maintain compliance.

### TruckOpti Operations
Control Tower · Pricing Desk · Dispatch Desk · Support & Disputes · Finance Ops · KYC & Compliance · Analytics

Design around prioritized queues, SLA, severity, owner, evidence and next action—not around scattered dashboards.

### Manager / Admin
Overview · Operations · Finance · Marketplace Config · Users & Roles · Risk & Audit · Settings

Policy/configuration changes require permissioning, auditability and safe approval paths.

## Primary flow states

Use explicit states rather than ambiguous success labels:

`draft → quote_pending/quoted → booked → assignment_pending/assigned → pickup_arrived → loaded/in_transit → delivery_arrived → pod_submitted → pod_approved → settlement_pending → settled`

Exception branches include cancellation/reassignment, contact failure, network/location uncertainty, incident/breakdown, POD rejection, payment hold and dispute.

## Happy paths

### Shipper booking
1. Select repeat lane or enter pickup/drop.
2. Add material, truck requirement, timing, contacts and documents.
3. Validate serviceability/required information.
4. Produce instant/bid/ops-assisted pricing state.
5. Explain price, validity, SLA and cancellation terms.
6. Confirm booking and expose assignment-pending status.

### Dispatch
1. Booking enters assignment queue.
2. Match using lane, vehicle/body type, capacity, location/readiness and performance.
3. Fleet/ops assigns truck + driver.
4. Driver accepts/acknowledges.
5. Shipper receives vehicle/driver and ETA confidence.

### Pickup → delivery
1. Driver checks in at pickup.
2. Capture loading proof and detention timing.
3. Start trip and passive/low-interaction tracking.
4. Handle checkpoints/exceptions.
5. At delivery capture required POD evidence.
6. Mark POD submitted, then approved separately.

### Settlement
1. Approved POD unlocks settlement calculation.
2. Calculate freight/extras/deductions/tax/payout split.
3. Expose line items to affected parties.
4. Release payout/invoice according to policy.
5. Mark settled and enable rating/repeat flow.

## Unhappy-path requirements

- **No capacity:** show quote-under-review with SLA and alternatives; not generic failure.
- **Changed load:** invalidate/re-price affected commercial terms and require reconfirmation.
- **Truck no-show:** raise high-severity reassignment state with revised ETA and owner.
- **Pickup contact failure:** offer retry/masked call/report/ops escalation with trip context.
- **GPS/network loss:** show last confirmed location/confidence, support offline action queue, avoid false movement claims.
- **Breakdown/accident:** urgent incident path with automatic trip context and controlled stakeholder notification.
- **OTP/POD failure:** fallback evidence flow; do not mark delivered/complete prematurely.
- **POD rejection:** exact reason and targeted resubmission without reopening whole trip.
- **Settlement hold:** show hold reason, owner, needed action and SLA.
- **Short payment:** prefill dispute with rate snapshot, trip events and evidence.

## Common screen-state contract

Every important screen needs:
- Empty with role-specific CTA
- Loading without layout collapse
- Retriable error
- Offline/cached state where applicable
- Blocked state with exact reason and unblock action

## Mobile/field constraints

- Large touch targets and minimal typing for drivers.
- Save/resume forms and queued uploads under weak connectivity.
- Language-ready content architecture.
- Avoid safety-critical interaction while driving.
- Treat GPS as probabilistic evidence, not perfect truth.

## Trust, evidence and audit

Commercial and operational snapshots must remain explainable:
- quote assumptions and validity
- assignment/reassignment history
- pickup/detention timestamps
- location confidence
- POD evidence and review history
- settlement components and deductions
- dispute conversation/evidence
- admin overrides and permissioned policy changes

## Product boundary

This IA is a product design reference, not a task board or implementation authority. Current implementation priorities and verified architecture remain governed by root `AGENTS.md`, `ARCHITECTURE.md`, `TASKS.md`, and bounded task briefs.
