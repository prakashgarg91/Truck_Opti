# Pilot completion plan (owner goal, 2026-11-06)

Goal (owner words, R-1057): all modules and features working, the app deployable, and the trucking-business subscription sellable end to end. Scope decisions are recorded in `TASKS.md` (full scope kept; real Razorpay for subscriptions; freight collected by the agency, not pooled by the platform; staff scopes enforced; `agency_driver_employment` is the driver authority).

## How work is split (owner rule: cheap workers under Sonnet supervision)

| Worker | Does | Never does |
|---|---|---|
| ZCode GLM-5.3-Flash (via AWF, isolated job worktree) | Stitch-driven pages, services, tests, docs from a written brief with exact allowed files | Migrations, RLS policies, money code, secrets, deploys |
| Haiku 5.5 (Sonnet-supervised) | Red-first test batteries, read-only maps, fixture fixes | Final authority on anything |
| Sonnet (director) | Briefs, migrations/policies/money code, verification, landing on `main` | Self-approval |
| Opus / Codex | Independent review and rulings | Writing |

Every job: brief with verified facts, allowed paths, a focused check command; landing = patch applied to the primary checkout, full gates, independent review, one commit on `main`. Hard gates stay owner-only: hosted `db push`, deploys, keys, live-money tests, archiving legacy apps.

## Waves

| Wave | Slices | Worker | Needs |
|---|---|---|---|
| 1 UI close-out of D2 | Clients page (Stitch `0768c6ac`), Tariffs page (`20944736`), Team change-scope action | ZCode | services exist (`agencyOrganizationApi`) |
| 2 Launch blockers | Remove legacy Edge write paths (update-status, assign-driver, assign-truck); new RPC for job status + driver assignment through reservations; scope-aware UI hiding | Sonnet + Haiku (SQL), ZCode (UI rewire) | red-first batteries |
| 3 Concurrency and ops | Two-session Postgres race test; `pg_cron` expiry sweeps; hosted backfill inventory SQL | Sonnet + Haiku | embedded-postgres |
| 4 TO-145 orders and load planning | Sales-order import, load planning, client approval | SQL: Sonnet; UI: ZCode (new Stitch screens) | wave 2 |
| 5 TO-146 GR/LR and proof | QR GR/LR, pickup-to-receipt proof | same split | wave 4 |
| 6 TO-147 tracking | Trip tracking, stoppages, breakdown/emergency | same split | wave 4 |
| 7 TO-148 freight invoices and collections | Invoices, private documents, UPI QR / payment links, reconciliation by reference | SQL/money: Sonnet + Opus review; UI: ZCode | wave 4, owner payments decision (recorded) |
| 8 TO-149 / TO-150 | Expenses, fuel, advances, maintenance; driver salary, settlement, reports | same split | wave 7 |
| 9 TO-151 ERP connector | Normalized order API + first-client connector | Sonnet | first client's ERP access (owner) |
| 10 TO-152 subscriptions and onboarding | Razorpay subscription billing, tenant onboarding, support, export | money: Sonnet + Opus; UI: ZCode | Razorpay merchant KYC and keys (owner) |
| 11 TO-153 hosted proof and launch | Staging project, backup, inventory queries, `db push`, hosted journey, Sentry, rollback rehearsal, deploy | Sonnet; owner gates | all above, owner go/no-go |

## Owner-gated (cannot be done by any worker)

Razorpay/PhonePe merchant activation and keys, Sentry DSN, hosted Supabase project and `db push`, Heroku deploy, first client's ERP access, live-money test approval, archiving legacy apps (`apps/desktop`, `.kilo`, `apps/web`), deciding the 7 old branches and 3 stashes, Dependabot archive decisions.

## Status

See `TASKS.md` for the live board; this file is the roadmap and is updated as waves land.
