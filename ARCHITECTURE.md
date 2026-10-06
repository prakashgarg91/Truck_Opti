# ARCHITECTURE — Truck_Opti

Concise canonical architecture for agent decisions.

## Product shape
Truck_Opti is a web application for truck/carton packing and logistics workflows with a browser frontend plus backend/services and Supabase-backed production capabilities.

Verified active boundaries include:
- `frontend/`: browser UI, auth/session flows, packing/truck recommendation UX, protected routes, payments/subscription surfaces.
- `apps/web/`: Python application/packing-related backend code and tests.
- Supabase: authentication/data/edge-function production services.
- Deployment/runtime surfaces include Heroku and external providers such as Google Maps and payment/auth services.

## Architectural rules
- Production authorization must come from trusted server/Supabase auth, not client-decoded identity claims.
- Privileged agency/admin data access belongs behind trusted service/edge-function boundaries rather than direct browser table access.
- Packing logic must remain deterministic/testable where promised; performance work requires regression evidence.
- External providers are adapters, not sources of core business truth.
- Production database/payment/deploy changes are owner-gated.
- Keep local-first validation before production verification.
- Treat old launch counts/status snapshots as historical evidence, not current truth; rerun the repository gates before making readiness claims.

## Owner-selected pilot direction (2026-10-06; proposed modules, not implemented claims)

Retain the existing React/TypeScript PWA and Supabase/PostgreSQL authority boundaries. Build a shared multi-tenant agency/client/driver/platform workflow for 1–2 agencies, 5–10 trucks each and 1–2 support staff. Explicit memberships and client-consented agency order access must precede shared dispatch; do not reuse a browser-selected global role as company authority.

Product spec, screen inventory, command contracts, persistence rules and dependency plan: `docs/PRODUCT_ROADMAP.md`. Single execution board: `TASKS.md`. Reusable implementation prompt: `agent-tasks/031-transport-agency-pilot-plan.md`.

Priority: fix tenant/usage/document access → authorized dispatch/status propagation → company/sites/fleet → sales-order allocations and feasibility → GR/QR/POD → tracking/incidents → freight invoicing/collections → costs/fuel/payroll → first-client ERP → platform ops → hosted/restore proof. Existing local SQL/fixture evidence does not certify hosted identity, storage or Edge behavior.

Freight invoices, goods invoices and SaaS invoices are separate models. All money, document issue and trip/approval transitions are server-authoritative. Browser/Python/optional phone calculation output is untrusted planning input until revalidated.

SMS is an optional delivery adapter; trusted password/Google as configured and stop-scoped handover confirmation allow a pilot without an SMS contract. Browser GPS is not a promise of continuous background tracking.

Serdroid at `D:/Github/Serdroid` uses PocketBase/Termux/cloudflared according to inspected documents; it is not a drop-in replacement for this backend. Optional worker/backup/demo is the recommended trial role. Full backend migration or sole phone hosting needs explicit architectural choice and measured recovery/device proof.

## Agent architecture
`GPT-6 supervisor -> bounded task briefs -> GLM-5.3 Flash workers -> result files -> GPT-6 review/integration`.

## Historical material
Superseded agent frameworks, generated handoffs, old gap snapshots, and retired planning artifacts are recoverable from Git history and do not belong on the active read path. Current deep implementation documentation belongs in `docs/` or subsystem-local READMEs.
