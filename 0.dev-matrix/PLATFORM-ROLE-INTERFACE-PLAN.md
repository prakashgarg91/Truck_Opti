# PLATFORM ROLE, INTERFACE, AND DEMO ACCESS PLAN

> **Canonical future-state planning note**
> Date: 2026-04-17
> Source: owner strategy update for password login, demo access, role-specific interfaces, partner integrations, and TruckOpti office-team permissions.
> Status: APPROVED FOR ROADMAPPING — not fully implemented yet.

---

## Purpose

This document is the source of truth for the next-stage TruckOpti product shape across:

- user categories
- interface families
- password-login expansion
- role and permission design
- demo-account planning
- office-team ownership and rights
- partner and ERP integration access

It exists so future agents and human team members do not treat the current route structure as the final operating model.

---

## Current Shipped State

As of 2026-04-17, the live product is still centered on four real route surfaces:

| Surface | Current route family | Current top-level role |
|--------|----------------------|------------------------|
| Public + customer portal | `/`, `/dashboard`, `/booking/new`, `/pricing`, `/checkout` | `user` in code, effectively customer in UX |
| Driver app | `/driver/*` | `driver` |
| Agency portal | `/agency/*` | `agency` |
| Admin / backoffice | `/admin/*` | `admin` |

Current auth posture is launch-safe:

- Email OTP
- Google OAuth
- Phone OTP hidden unless explicitly re-enabled
- no first-class password login in the public auth UI yet

This plan extends that model without pretending it already exists.

---

## Product Principles

1. Keep **customer, driver, agency, admin** as the current route-level pillars until migration is staged safely.
2. Add **password login as a secondary auth path**, not as a replacement for OTP and Google.
3. Treat **customer segments as subtypes**, not as separate top-level portals unless their workflows diverge heavily.
4. Treat **office teams as permission bundles inside backoffice**, not as a new portal for each department.
5. Treat **ERP/partner integrations as API-first**, then add a partner console only when account and key management need a UI.
6. Keep **demo accounts isolated from production-sensitive actions** and never store live credentials in git.
7. Use **permissions for rights**, not hard-coded UI assumptions.
8. Use an **internal API + typed event plane** as the canonical contract between portals, partners, and office workflows.
9. Model **customer invoicing, agency settlement, and platform fees** as separate financial legs instead of one blended flow.

---

## User Families

### 1. Customers / Shippers

These all belong to the same primary business family and should initially share one customer portal with subtype-driven UX:

- individual users booking occasional trucks
- small firms and traders
- business owners moving goods regularly
- company logistics managers
- enterprise consignors with multi-user teams
- ERP-connected customers booking from sale orders or dispatch plans

**Recommended future subtype values:**

- `customer_individual`
- `customer_business`
- `customer_enterprise`
- `customer_partner_managed`
- `customer_consignee`

### 2. Drivers

- independent owner-driver
- agency-attached driver
- future fleet-driver supervisor view if needed

**Recommended future subtype values:**

- `driver_independent`
- `driver_agency`

### 3. Agencies / Transport Companies

- fleet owner / truck owner with a micro-fleet but no formal transport company structure yet
- small transport operator
- regional fleet operator
- national transport company
- 3PL / dispatch team managing multiple drivers and trucks

**Recommended future subtype values:**

- `agency_micro_fleet`
- `agency_small_fleet`
- `agency_mid_market`
- `agency_enterprise`

### 4. Partners / Integrators

- SAP integration partner
- Busy / Tally addon partner
- implementation partner / reseller
- customer IT team using APIs and webhooks

**Recommended future top-level role:**

- `partner`

### 5. Platform Office / Internal Teams

- super admin
- marketplace ops manager
- customer support
- driver onboarding + KYC reviewer
- agency onboarding manager
- finance and settlements
- growth / sales / account management
- integration manager
- analytics / read-only leadership
- engineering / infra operators

These should remain inside the admin/backoffice surface, but with permission bundles instead of one shared admin superpower.

### 6. Time-Scoped Oversight Actors

- regulatory auditor
- insurance auditor
- investigation / dispute reviewer

**Recommended future treatment:**

- `auditor` as a time-scoped, entity-scoped read-only role provisioned through backoffice only

---

## Target Interface Map

| Interface | Primary users | Status | Notes |
|----------|---------------|--------|-------|
| Public marketing + onboarding | all prospects | current | keep public routes for discovery, signup, pricing, contact |
| Customer portal | all shipper/customer subtypes | current, expand | keep one customer portal first; personalize by subtype across spot, contract, consignee, and ERP-assisted journeys |
| Driver app | independent and agency drivers | current, expand | mobile-first operational workflow |
| Agency portal | transport companies and dispatch teams | current, expand | add deeper fleet, branch, revenue/cost, dispatcher, and staff rights |
| Admin / backoffice | TruckOpti office teams | current, expand | split by permission bundles and department ownership |
| Partner console | ERP/addon partners and integration managers | future | API keys, webhook logs, tenant mapping, onboarding docs |
| Demo / reviewer workspace | reviewers, sales demos, QA, external evaluators | future or seeded accounts | can be served by seeded role accounts before a dedicated UI exists |
| Internal API | partners, ERP systems, future office automations | future/current hybrid | canonical service boundary for booking creation, status sync, tenant mapping, and delegated actions |
| Event + notification plane | all actors indirectly | future | typed status events for webhooks, push, email, SMS, and backoffice subscriptions |

---

## Shared Tenant And Delegation Boundaries

Use one contract model across customer, agency, partner, and backoffice flows:

- `organization_id` = primary tenant boundary for customers, agencies, partners, and office visibility.
- `branch_id` = optional secondary scope for large agencies and enterprise customer teams.
- `booking_type` = `spot | contract | erp_synced` so recurring-lane work and partner-originated work are not forced into one generic booking flow.
- `delegated_by` and `source_system` = required when a partner or office flow creates or mutates a record on behalf of a customer or agency.
- audit logging = required for delegated actions, permission-sensitive changes, and financial approvals.

---

## Recommended Role And Permission Model

### Route-Level Roles

These roles control the first redirect and the main portal family:

| Role | Purpose | Current or future |
|------|---------|-------------------|
| `user` | current customer role in code | current |
| `customer` | preferred future label in UI/domain language | future migration target |
| `driver` | driver app | current |
| `agency` | agency portal | current |
| `admin` | backoffice | current |
| `partner` | partner console | future |

### Permission Bundles

Inside admin/backoffice and future partner/agency staff flows, rights should come from permission bundles rather than more top-level route roles.

| Bundle | Intended team | Example rights |
|--------|---------------|----------------|
| `super_admin` | founders / platform owners | cross-domain overrides, exceptional approvals, and final authority across all modules |
| `security_admin` | infra / access control owners | role assignment, secret rotation, feature flags, and security-sensitive approvals |
| `ops_manager` | marketplace operations | booking intervention, dispatch escalation, shipment reassignment, issue resolution |
| `support_agent` | customer support | read customer/agency/driver state, limited update rights, no destructive deletes |
| `support_lead` | senior support | escalation rights, hold overrides, and limited low-value refund actions without full finance control |
| `finance_ops` | settlements / revenue | subscription review, payout approval, refund review, revenue/cost dashboards |
| `compliance_reviewer` | KYC / onboarding | driver and agency verification, document review, approval workflows |
| `growth_sales` | sales / account growth | lead ownership, pricing visibility, account notes, and sales-stage account transitions |
| `integration_manager` | partner ecosystem | API keys, partner tenants, webhook inspection, ERP onboarding |
| `analytics_viewer` | founders / leadership | read-only business reports and dashboards |
| `demo_operator` | demos / reviewer readiness | demo workspace seeding, reviewer provisioning, and scenario resets |

**Recommended transition note:**

- the current broad `platform_super_admin` concept should eventually split into `super_admin` + `security_admin` before non-founder office staff are onboarded.

### Entity-Scoped Staff Roles

Agencies and partners will eventually need their own staff model.

| Scoped role | Target entity |
|------------|---------------|
| `customer_team_admin` | customer organization |
| `customer_consignee` | shipment receiver / destination-side stakeholder |
| `agency_owner` | transport agency |
| `agency_dispatcher` | transport agency |
| `agency_branch_manager` | transport agency branch |
| `agency_finance` | transport agency |
| `agency_ops_viewer` | transport agency or branch |
| `partner_admin` | partner organization |
| `partner_operator` | partner organization |

### Centralized Vs Delegated Rights

**Centralized rights** should remain with `super_admin` or `security_admin` only:

- role and permission assignment
- feature-flag and rollout control
- secret rotation and platform-wide API credential changes
- schema and environment changes
- payout execution and high-value financial approvals

**Delegated rights** can move to team-lead bundles once audit logging exists:

- KYC approve/reject decisions
- low-value refund approvals below a documented threshold
- demo workspace reset and reviewer reprovisioning
- agency onboarding approval within policy bounds
- partner tenant provisioning and webhook troubleshooting

---

## Authentication Roadmap

### Phase A — Current Launch-Safe Auth

- Email OTP stays enabled
- Google OAuth stays enabled
- Phone OTP remains optional and feature-flagged

### Phase B — Add Password Login As Secondary Path

Password login is required for:

- demo reviewers
- Razorpay / external platform verification
- partner operators
- internal office teams that need stable credentials
- repeat business accounts that prefer classic login

**Recommended implementation shape:**

1. Keep OTP and Google on the login page.
2. Add a separate **Password** mode to login and signup.
3. Add password reset and change-password flows.
4. Gate rollout behind an env/config flag so launch-safe auth is preserved while the path is hardened.
5. Do not remove OTP acquisition for customer growth funnels.

**Recommended config additions:**

- `VITE_AUTH_PASSWORD_ENABLED=true|false`
- backoffice flag for demo/reviewer account provisioning

**Recommended implementation note:**

Do not rename the current DB role model and auth UI in the same release. Add password auth first, then normalize role labels later.

**Recommended rollout order:**

1. internal office users and external reviewers
2. partner operators and demo identities
3. repeat business customers that explicitly need stable credentials
4. broader customer availability only after password recovery, audit logging, and session controls are stable

---

## Onboarding Tracks

### Customer / Shipper onboarding

- self-serve retail / common-user booking
- business account onboarding for firms and traders
- enterprise organization onboarding with team invites and recurring lanes
- partner-managed onboarding for ERP-connected customers
- consignee onboarding as a read-only tracking and POD stakeholder

### Driver onboarding

- independent driver self-registration
- agency-driver invitation or attach-to-agency flow
- driver activation gated by document, KYC, and safety checks

### Agency onboarding

- micro-fleet onboarding for owner-operators with multiple trucks
- transport-company onboarding for dispatch, branch, and finance-capable teams
- future branch-level staff onboarding without forcing every staff user into owner rights

### Partner onboarding

- API-first partner setup
- sandbox / test credentials
- webhook verification and tenant mapping
- delegated booking permissions tied to customer organizations

### Office-team onboarding

- admin-created accounts only
- permission bundle assignment at creation time
- explicit audit log for every bundle change and elevation

---

## Demo Account Strategy

### Planning Rules

1. Every major interface should have **two demo identities**.
2. `01` = happy-path account.
3. `02` = alternate scenario / edge-case / upgrade path account.
4. Demo credentials must live in a password manager, secret vault, or secure owner handoff doc, not in git.
5. Demo accounts should point to seeded demo data and avoid live payouts or real customer-impacting writes.

### Recommended Demo ID Naming Convention

| Interface family | Demo ID 01 | Demo ID 02 | Use |
|------------------|------------|------------|-----|
| Customer portal | `demo.customer.01@truckopti.in` | `demo.customer.02@truckopti.in` | retail / business spot-booking vs enterprise / consignee / ERP-assisted scenarios |
| Driver app | `demo.driver.01@truckopti.in` | `demo.driver.02@truckopti.in` | independent-driver vs agency-driver scenarios |
| Agency portal | `demo.agency.01@truckopti.in` | `demo.agency.02@truckopti.in` | micro-fleet / small-fleet vs enterprise-dispatch scenarios |
| Admin / office | `demo.admin.01@truckopti.in` | `demo.admin.02@truckopti.in` | super-admin / security-admin vs ops-manager / demo-operator scenarios |
| Partner console | `demo.partner.01@truckopti.in` | `demo.partner.02@truckopti.in` | ERP integrator vs implementation-partner / reseller scenarios |

### Reviewer Accounts

External review should use dedicated identities, not founder or production admin accounts.

| External use | Recommended ID |
|--------------|----------------|
| Razorpay / payment review | `reviewer.razorpay.01@truckopti.in` |
| Generic external product review | `reviewer.public.01@truckopti.in` |

### Important Constraint

This document defines **planned IDs**, not currently provisioned credentials. Real accounts still need to be created in Supabase/Auth and backed by real inboxes or password flows.

Office-team-specific QA accounts can later be seeded under the same admin/backoffice interface once permission bundles exist; they should not replace the two canonical admin demo identities above.

---

## Recommended Experience Mapping

### Customer Portal

All of the following should stay under one portal first:

- casual truck booking
- contract / recurring-lane booking
- business shipping
- company dispatch and operations
- enterprise planning and recurring lanes
- ERP-assisted booking

Different experiences should come from:

- subtype-aware dashboard modules
- organization settings
- team/member permissions
- API and webhook capabilities

### Driver App

Should cover:

- independent drivers
- agency-assigned drivers
- document/KYC state
- live trip operations
- wallet, earnings, and payout workflows

### Agency Portal

Should cover:

- fleet management
- branch-aware operations for larger transport companies
- driver assignment
- route/rate management
- job dispatch and monitoring
- operational revenue and cost visibility
- limited business management without becoming a full accounting suite

### Partner Console

Should cover:

- API key creation
- delegated customer and tenant mapping
- tenant mapping
- webhook setup
- sale-order booking integration
- shipment sync status
- implementation docs and logs

This is the correct home for SAP, Busy, Tally, Zoho, Odoo, and custom ERP addon workflows.

---

## Interlinking Model

### 1. Marketplace Spot Flow

Customer booking -> matching/dispatch -> agency and/or driver workflow -> live tracking -> POD -> customer invoice + settlement visibility -> admin oversight.

### 2. Contract / Recurring Lane Flow

Enterprise customer configures recurring lane -> rate / service terms are managed through the customer and agency relationship -> recurring bookings are created under `booking_type=contract` -> dispatch and trip execution reuse the same trip engine -> finance and ops track contracted and spot flows separately.

### 3. Agency-Managed Driver Flow

Agency creates or accepts work -> dispatcher or branch manager assigns driver -> driver executes trip -> agency monitors progress -> admin sees exceptions.

### 4. Partner / ERP Delegated Flow

ERP partner creates shipment request through API -> TruckOpti creates booking/order with `delegated_by` and `source_system` set -> customer and operations teams see the shipment under the customer organization -> dispatch follows the same core trip engine -> status is pushed back by webhook.

### 5. Office-Team Event Flow

Support, compliance, finance, ops, sales, integrations, and demo operations should consume the same core platform state through permission-filtered views plus a typed event stream for key transitions.

### 6. Agency / Partner Future Integration Flow

Agency or transport-company systems may later create or sync jobs through the same internal API and event model used by ERP-connected customer partners. Design the service contract once so agency-side integrations do not require a separate architecture later.

---

## TruckOpti Office Team Ownership Model

| Team | Primary surfaces | Rights needed | Should not own |
|------|------------------|---------------|----------------|
| Security / Access Control | permissions, secrets, rollout approvals | role assignment, key rotation, feature-flag control, security approval | routine support and payout operations |
| Marketplace Ops | shipments, dispatch, tracking, escalation tools | intervene in jobs, reassign, resolve exceptions | payout configuration and security settings |
| Driver Ops / KYC | driver onboarding, docs, activation | approve drivers, review documents, suspend unsafe accounts | platform finance and partner API keys |
| Agency Success | agency onboarding, fleet readiness, rate setup | approve agencies, help configure fleet and routes | founder-level config changes |
| Finance Ops | subscriptions, payouts, refunds, revenue/cost views | payout approvals, settlement reconciliation, refund workflow | KYC approval and engineering config |
| Support | read-most customer and shipment records | view and limited note/update actions | destructive deletes, role elevation |
| Sales / Growth | demos, leads, pricing and account transitions | manage demo workspaces, sales notes, plan discussions | production payout and security admin |
| Integrations | partner console, APIs, webhooks | provision partner accounts, inspect sync failures | driver payouts and direct KYC approvals |
| Demo Operations | demo workspace, seeded data, reviewer provisioning | reset demo identities, reseed demo scenarios, maintain reviewer readiness | production finance, production role grants |
| Engineering / Infra | feature flags, audit tools, config, release ops | environment and schema changes, observability, rollout safety | routine customer support actions |
| Leadership / Admin | cross-product oversight | read everything, approve sensitive exceptions | none, but actions should be logged |

---

## Recommended Delivery Phases

### Phase 1 — Auth And Demo Foundation

- add password login and password signup as secondary auth
- add reset-password flow
- keep OTP + Google intact
- provision demo IDs and reviewer IDs outside git

### Phase 2 — Actor, Tenant, And Booking Contract Model

- define `organization_id`, `branch_id`, `booking_type`, `delegated_by`, and `source_system`
- keep partner-originated and office-originated actions auditable from day one
- separate spot, contract, and ERP-synced flows in the service contract even if the UI still looks unified

### Phase 3 — Role Normalization And Permissions

- preserve current route-level roles
- introduce refined permission bundles for office teams
- introduce subtype fields for customer, driver, and agency personas
- decide the initial delegated-right thresholds and approval rules

### Phase 4 — Backoffice Segmentation And Audit

- split current admin surface into ops, support, finance, compliance, and integration capabilities
- add audit-friendly role management
- keep centralized vs delegated rights explicit in the design

### Phase 5 — Partner Console And Internal API/Event Plane

- API keys
- webhook management
- partner tenant mapping
- ERP onboarding status and logs
- typed event taxonomy for partner, agency, customer, and office consumers

### Phase 6 — Demo And Sales Workspace

- seeded non-production-like demo data
- two demo IDs per major interface
- repeatable reviewer environment
- role-scoped office and partner demo scenarios once permissions are live

---

## Guardrails

- Do not break launch-safe Email OTP + Google while adding passwords.
- Do not store demo passwords or reviewer credentials in git.
- Do not create a separate portal for every customer subtype too early.
- Do not turn TruckOpti into a full accounting system; integrate with SAP/Busy/Tally instead.
- Do not overload `admin` forever; migrate to permissions once the launch-critical blockers are cleared.
- Do not collapse customer invoicing, agency settlement, and platform fee accounting into one undifferentiated flow.

---

## Immediate Planning Backlog

1. Add password auth as a secondary login path.
2. Define the actor and tenant boundary model (`organization_id`, `branch_id`, `booking_type`, `delegated_by`, `source_system`).
3. Provision the first seeded demo and reviewer identities.
4. Design the refined permission-bundle schema for backoffice teams, including centralized vs delegated rights.
5. Design the partner account, internal API, and typed event model.
6. Normalize customer language in UI from generic `user` toward `customer` without breaking current code.

---

## Canonical Note

Use this document when planning:

- password login rollout
- demo accounts
- portal expansion
- office-team rights
- partner/ERP access
- future module ownership inside TruckOpti office

Do not overwrite current-state architecture docs with this target state until implementation lands.