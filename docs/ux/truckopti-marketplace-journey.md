# TruckOpti Marketplace Journey Map

This document captures the durable cross-role operating journey for an India-first road-freight marketplace.

## Lifecycle

1. Demand appears.
2. Price is generated or negotiated.
3. Truck and driver are assigned.
4. Pickup is executed and evidenced.
5. Trip is tracked through normal and exception states.
6. Delivery/POD is captured and verified.
7. Settlement is calculated and released or disputed.
8. Support quality and repeat booking determine retention.

## Cross-role journey

| Stage | Shipper | Driver | Fleet / Agency | TruckOpti Ops | Admin signal |
|---|---|---|---|---|---|
| Demand | Create/repeat load | Await work | Search demand | Assist intake | Demand mix/conversion |
| Pricing | Evaluate rate/ETA | Check net earning | Check margin | Handle overrides | Take-rate/override patterns |
| Dispatch | Expect assignment | Receive task | Assign truck/driver | Fill gaps | Fill rate/aging |
| Pickup | Need proof/confidence | Check in/load | Watch detention | Handle late pickup | Pickup SLA |
| Transit | Need ETA | Drive/update | Monitor fleet | Control tower | Exceptions/support load |
| Delivery | Need trusted POD | Submit proof | Validate evidence | Review POD | POD acceptance/claims |
| Settlement | Need invoice clarity | Need payout | Need trip ledger | Reconcile | Leakage/cycle time |
| Support | Raise issue/rebook | Raise incident/payment issue | Dispute deduction | Triage/resolve | Repeat disputes/process debt |

## Shipper journey

- **Need → create load:** repeat-lane shortcuts, saved addresses, urgency-aware creation, progressive disclosure.
- **Price → book:** explain price components, quote validity, SLA and cancellation terms.
- **Assignment:** show pending/confirmed assignment separately and communicate ETA confidence.
- **Transit:** timeline plus last trusted location, exception owner and revised ETA.
- **POD:** distinguish submitted vs approved; expose proof completeness/download.
- **Settlement:** line-item ledger with reason codes/evidence.
- **Support/repeat:** carry trip context into support; enable one-tap repeat lane booking.

## Driver journey

- Small onboarding steps with save/resume, language support and document-readiness status.
- Load brief leads with net earnings, exact pickup/drop context and escalation path.
- Pickup check-in creates timestamped detention evidence.
- Driving interaction minimizes typing; weak network must not imply dishonest/non-moving status.
- POD supports offline queue plus OTP/signature/stamp/photo fallbacks according to customer policy.
- Settlement exposes payout status, deductions and required unblock action.
- Emergency/breakdown is a distinct urgent support path.

## Fleet / agency journey

- Fleet readiness dashboard for vehicle/driver/document eligibility.
- Demand ranked by lane fit, truck position, capacity and estimated margin.
- Unified dispatch board avoids repeated data entry.
- Live operations are exception-first rather than map-only.
- Trip ledger ties payout, deductions and disputes to evidence.

## TruckOpti operations journey

- Intake/pricing/dispatch/support/finance queues expose SLA, severity, owner and required next action.
- Pricing overrides show lane history, margin and approval impact.
- Unassigned/no-show risk is surfaced proactively.
- Control tower prioritizes exceptions and provides communication/reassignment actions.
- POD review and settlement decisions remain evidence-backed and auditable.

## Manager/admin journey

- KPIs drill from marketplace metric → lane/user/queue → operational cause.
- Operations views distinguish system/process problems from staffing/ownership problems.
- Finance/risk views connect leakage/dispute/fraud signals to underlying evidence.
- Rules/permissions require audit trail and approval; risky policy changes should expose blast radius before activation.

## Critical handoffs

| Handoff | Required behavior |
|---|---|
| Quote → booking | Freeze assumptions/commercial snapshot |
| Booking → assignment | Expose pending state and fallback owner |
| Assignment → pickup | Make next actor/action/proof explicit |
| Pickup → transit | Confirm loading and reset relevant timers |
| Normal trip → exception | Show owner, revised ETA and communication |
| Delivery → POD | Separate submitted from approved |
| POD → settlement | Explain blockers and unblock owner |
| Settlement → dispute | Preserve immutable commercial/proof snapshot |

## Failure flows to design explicitly

- no capacity / manual quote needed
- quote invalidated after load edits
- assigned truck cancellation/no-show and reassignment
- unreachable pickup contact
- GPS/network loss
- breakdown/accident
- OTP/POD failure or rejection
- payout hold / short-payment dispute
- duplicate support cases for the same incident
- document/GPS/POD/account fraud signals

## Prototype risks

Test at minimum: urgent load with missing docs, weak-network pickup/POD, fleet margin ambiguity, ops exception overload, and admin inability to trace margin leakage to its cause.
