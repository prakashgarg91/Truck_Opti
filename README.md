# TruckOpti

TruckOpti is a web application for Indian road transport agencies. It covers load planning, dispatch,
consignment notes (GRs), shipment tracking, freight invoices, expenses, payroll, an ERP connector and
subscriptions. Drivers, agency staff and platform admins each have their own area.

**Status (2026-11-18):** built and tested locally; ready for staging once the local release gates pass;
not yet run on a hosted Supabase project. Production launch is blocked on the owner gates in
[docs/DEPLOYMENT-RUNBOOK.md](docs/DEPLOYMENT-RUNBOOK.md).

## Stack

- Frontend: React and Vite in `frontend/` (TypeScript, Vitest).
- Backend: Supabase (Postgres, Auth, Storage, Edge Functions in `supabase/functions/`).
- Web server: `server.js` (Node/Express) serves `frontend/dist` and the health probes.
- Payments: Razorpay (subscriptions and checkout); PhonePe is present but optional.

## Run it locally

Requirements: Node 24.x, npm. Run every command from the repository root unless noted.

```bash
npm install
cd frontend && npm install && cd ..
npm run dev            # Vite dev server (frontend)
```

Local gates:

```bash
npm run release:gates  # gates 1-6; prints "Verdict: READY FOR STAGING" only when all pass
npm test               # frontend unit suite
npm run test:journey   # local full browser journey (desktop and 375 px); writes evidence/journey/
```

`test:journey` starts an embedded PostgreSQL, the seed data, a Supabase-shaped shim and headless Chromium
(Playwright). It touches no hosted project. Gate details are in
[docs/DEPLOYMENT-RUNBOOK.md](docs/DEPLOYMENT-RUNBOOK.md) section 3.

## Documentation

| What | Where |
|---|---|
| Agency user guide | [docs/USER-GUIDE-AGENCY.md](docs/USER-GUIDE-AGENCY.md) |
| Driver user guide | [docs/USER-GUIDE-DRIVER.md](docs/USER-GUIDE-DRIVER.md) |
| Admin guide | [docs/ADMIN-GUIDE.md](docs/ADMIN-GUIDE.md) |
| Support | [docs/SUPPORT.md](docs/SUPPORT.md) |
| Admin guide | Not written yet. |
| Audits (2026-11-18) | [docs/audit-2026-11-18/](docs/audit-2026-11-18/) |
| Subscription and billing rulings (TO-152) | [docs/TO-152-rulings.md](docs/TO-152-rulings.md), runbook [docs/TO-152-runbook.md](docs/TO-152-runbook.md) |
| Release rulings and gates | [docs/FABLE-RULINGS-2026-11-17-B.md](docs/FABLE-RULINGS-2026-11-17-B.md) |
| Deployment and rollback | [docs/DEPLOYMENT-RUNBOOK.md](docs/DEPLOYMENT-RUNBOOK.md) |
| Staging checklist | [docs/STAGING-SMOKE-CHECKLIST.md](docs/STAGING-SMOKE-CHECKLIST.md) |
| Environment variable names | [docs/ENV-CHECKLIST.md](docs/ENV-CHECKLIST.md) |
| Architecture and working rules | [ARCHITECTURE.md](ARCHITECTURE.md), [AGENTS.md](AGENTS.md), [TASKS.md](TASKS.md) |

## Not yet done

- Staging and production Supabase projects have not been created, migrated or tested.
- Razorpay test-mode proof on a hosted project has not been run. No live payment has been taken.
- Subscription enforcement is off by default and stays off until the owner signs off.
- The admin user guide does not exist yet.

## Legacy code

`apps/web/` (Flask) and `apps/desktop/` are earlier prototypes for the same loading optimiser. They are not
the current product and are not covered by the release gates. Their old feature and percentage claims were
removed from this README.
