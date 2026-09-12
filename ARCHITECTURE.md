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
- Packing logic must remain deterministic/testable where promised; performance work requires regression evidence.
- External providers are adapters, not sources of core business truth.
- Production database/payment/deploy changes are owner-gated.
- Keep local-first validation before production verification.

## Agent architecture
`GPT-6 supervisor -> bounded task briefs -> GLM-5.3 Flash workers -> result files -> GPT-6 review/integration`.

## Legacy documentation
Existing `docs/` and `0.dev-matrix/` files may contain useful deep history. Root `AGENTS.md`, `ARCHITECTURE.md`, and `TASKS.md` control current agent execution.
