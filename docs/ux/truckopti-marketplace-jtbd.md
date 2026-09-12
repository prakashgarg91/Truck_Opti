# TruckOpti Marketplace JTBD and Product Frame

## Scope

TruckOpti is assumed to be an India-first digital trucking marketplace for road freight, with strong operator support rather than a pure self-serve marketplace. The product must work for:

- spot and scheduled dispatch
- shipper-booked and ops-assisted booking
- owner-driver, attached-driver, and fleet-owner models
- interstate and intrastate movement
- weak-network, multilingual, documentation-heavy operations

This UX frame assumes full-truck-load is the core business motion, while part-load and multimodal flows can be layered later.

## Shared Domain Objects

Design the system around a common language that all roles understand:

- `Load request`: shipper demand before pricing is confirmed
- `Quote`: price offer with validity, assumptions, and service terms
- `Booking`: confirmed commercial agreement
- `Trip`: execution object created after assignment
- `Stop`: pickup, checkpoint, halt, or drop point
- `Vehicle`: truck profile, body type, capacity, permits, fitness
- `Driver`: person executing the trip
- `Dispatch assignment`: mapping between trip, vehicle, and driver
- `Milestone`: assigned, arrived pickup, loaded, departed, checkpoint, arrived drop, delivered, POD submitted, settled
- `Document`: invoice, e-way bill, RC, insurance, permit, challan, POD, dispute evidence
- `POD`: proof of delivery, including OTP, signature, stamp, photo, geotag, timestamp
- `Settlement`: freight, advance, detention, toll, loading-unloading, deductions, tax lines, payout state
- `Dispute`: rate, delay, damage, shortage, POD rejection, deduction, cancellation, fraud, behavior, safety
- `Support case`: inbound issue and resolution workflow across chat, call, and ticketing

## Primary Personas

| Role | Typical user in India logistics | Primary device | Digital comfort | Most stressful moment |
|---|---|---|---|---|
| Customer / Shipper | SME owner, transport coordinator, plant dispatch officer, procurement executive | Mobile plus desktop | Medium | No truck available when goods are ready to move |
| Driver | Owner-driver or employed driver on Android phone | Android mobile | Low to medium | Reaching pickup/drop without clear instructions or payment certainty |
| Agency / Fleet Owner | Small transport agency or fleet operator managing 5 to 100 trucks | Mobile plus desktop | Medium | Empty truck time and delayed payout |
| TruckOpti Ops Team | Pricing desk, dispatch desk, support, KYC, finance ops | Desktop first | High | Large exception pileup during active trips |
| Manager / Admin | Ops manager, business head, finance controller, super admin | Desktop first | High | Revenue leakage, fraud, and SLA misses without clean visibility |

## Jobs To Be Done

### Customer / Shipper
When I need to move goods quickly and reliably across India, I want to get a trustworthy truck, clear pricing, and live execution visibility in one place, so I can dispatch on time without depending on endless calls and WhatsApp follow-ups.

Must-win outcomes:
- create a load in under 3 minutes for repeat lanes
- understand why price changed before booking
- know who is assigned and whether pickup will happen on time
- receive trusted POD and settlement proof without calling ops

### Driver
When I am looking for the next load or executing a trip, I want simple task-by-task instructions, trusted earnings visibility, and fast help when something goes wrong, so I can keep moving safely and get paid without argument.

Must-win outcomes:
- know the net payable before accepting or starting
- finish pickup and delivery tasks with minimal typing
- upload POD even with weak internet
- access emergency help and escalation in one tap

### Agency / Fleet Owner
When I have trucks and drivers to deploy, I want to see demand, assign the right truck fast, monitor all active trips, and reconcile payouts cleanly, so I can increase utilization and protect my margins.

Must-win outcomes:
- shortlist loads by lane, body type, and net margin
- assign truck and driver without repeated data entry
- see delayed or risky trips immediately
- close payout and dispute cycles with evidence

### TruckOpti Ops Team
When marketplace demand and live trips are flowing at the same time, I want one operational control tower that shows queue priority, exception severity, customer commitments, and required actions, so I can keep the network moving and resolve issues before they become escalations.

Must-win outcomes:
- identify what needs action in under 30 seconds
- reassign loads and communicate changes with minimal clicks
- resolve exceptions with full evidence history
- operate from queues and SLAs, not ad hoc chats

### Manager / Admin
When I am responsible for marketplace health, risk, and growth, I want reliable operational and financial visibility plus controllable rules, permissions, and audit trails, so I can scale the business without losing trust or control.

Must-win outcomes:
- monitor throughput, fill rate, and margin by lane/segment
- inspect policy exceptions and settlement leakage quickly
- configure rules with approval gates and audit logs
- manage role-based access without engineering dependency

## Experience Principles

1. **Trust before cleverness** — explain price, match, holds, and dispute decisions.
2. **Dispatch is a workflow, not a screen** — demand → price → assignment → milestones → proof → settlement → support.
3. **Separate commercial certainty from operational certainty** — quote, booking, assignment, pickup, delivery, POD approval, and settlement are distinct states.
4. **Design for intermittent reality** — weak network, imperfect GPS, multilingual use, shared devices, delayed banking confirmations.
5. **Reduce phone calls without eliminating assisted operations** — every intervention should be visible, traceable, and faster than phone/WhatsApp workflows.

## Success Metrics

- Customer: quote-to-book conversion, repeat lane booking, on-time pickup, POD turnaround, dispute rate.
- Driver: acceptance-to-start, on-time arrival, task completion time, POD first-pass acceptance, payout turnaround.
- Fleet: utilization, assignment rate, margin/trip, settlement time, dispute reopen rate.
- Ops: SLA adherence, unassigned-load aging, exception-resolution time, support response, override rate.
- Admin: gross margin, fill rate, cancellation rate, fraud loss, satisfaction trend.

## Research Questions

Validate before final UI/product decisions:
- FTL-only at launch or mini-truck/intra-city too?
- instant price, reverse bid, broker-assisted quote, or hybrid?
- SME, enterprise, or aggregator as primary shipper?
- drivers direct to TruckOpti or mainly through fleets?
- dominant payout modes and credit cycles?
- POD requirement: OTP only or stamp/signature/photo too?
- launch languages by active corridors?
