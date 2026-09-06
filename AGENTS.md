# AGENTS.md — Truck_Opti

India logistics SaaS (truck booking, agency dispatch, driver app, admin).
Prod: `https://www.truckopti.in`. Stack: React 18 + TS + Vite + Tailwind + Supabase + Zustand + React Router v6.

## Which code is live

- `frontend/` — the production app. Entry `frontend/src/App.tsx` (auth pages eager, rest lazy); state in `frontend/src/stores/` (`authStore`, `languageStore`); Supabase client in `frontend/src/lib/supabase.ts`. Work here by default.
- `apps/web/` — legacy Flask + py3dbp app (`run.py` → `app.create_app`). Touch only when the task says Flask/legacy.
- `server.js` — Heroku static server for `frontend/dist`, 301s Heroku host → canonical domain. Express 5: SPA fallback uses `/{*splat}`, not `*`.
- `supabase/` — Edge Functions + `schema.sql` + migrations. Deploy-related DB changes need a human (`supabase db push` is human-blocked).
- README's Flask-first narrative is stale; trust `package.json` / `vercel.json` / `server.js` / `.github/workflows/frontend-ci.yml` instead.

## Commands (run from stated dir)

```powershell
cd frontend; npm run dev        # Vite :5173, /api proxied to localhost:5000
cd frontend; npm run build      # tsc + vite build — must show 0 TS errors before push
cd frontend; npm run test:unit  # vitest run; only matches src/**/*.test.ts
cd frontend; npm run test:packing
cd frontend; npm run lint       # eslint, --max-warnings 80 (warnings don't fail below 80)
npm run launch-check            # repo root; full readiness gate, 17/17 target
npm run test:public-smoke       # root; hits preview/prod frontend, writes logs/*_report.json
npm run close-day               # root; end-of-day handoff
```

Python (legacy, from `apps/web/`): `python -m pytest tests/unit/test_authentication_middleware.py -q -o addopts=`
(`pytest.ini` addopts enforce `--cov-fail-under=80` + `--cov=app`; the `-o addopts=` override is how CI runs the single bounded test.)
Pre-commit is flake8 scoped to `apps/web/app` + `apps/web/tests` only.

CI (`frontend-ci.yml`, runs on `frontend/**`, `scripts/**`, `apps/web/**` changes): job 1 = `npm ci` (root + frontend) → frontend build → preview on `127.0.0.1:4173` → public + frontend smoke; job 2 = the bounded Python auth test above.

## Env

Copy `frontend/.env.example` → `frontend/.env`. Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Optional-with-fallback: no `VITE_GOOGLE_MAPS_API_KEY` → Leaflet/OpenStreetMap. Never commit real keys.
Human-blocked secrets — don't spin, note in `0.dev-matrix/AI-HANDOFF.md` under `Blockers:` and move on: Razorpay prod keys, Google OAuth, Twilio SMS, Supabase PITR, `supabase db push`, Sentry DSN.

## Conventions that differ from defaults

- Auth: `import { useAuthStore } from '../stores/authStore'` (plural `stores`; repo-guide's `../store/authStore` is stale) — never local `useState` for auth. Server-side use `supabase.auth.getUser()`, never `getSession()` alone.
- Supabase: always `const { data, error } = ...`; on error log with context + bilingual friendly toast. Never surface raw `error.message` (leaks DB internals).
- Every new Supabase table needs RLS enabled + explicit policies. Never `USING (true)` on user-owned tables.
- Razorpay: production keys only in Heroku env; `VITE_ALLOW_TEST_RAZORPAY_ON_PRODUCTION` stays false.
- PWA: service worker file is `sw-v2.js`; large vendor chunks (`three/map/pdf/excel`) are glob-ignored from precache and cached at runtime.
- Launch-check gate 8 requires a clean git tree except `0.dev-matrix/{STATE,TASK,DISCUSSION,AI-HANDOFF,LAST-CLOSEOUT}.md`, `closeout-logs/`, `test-reports/`.

## Session wiring (repo expects this)

- Start: read `0.dev-matrix/AI-HANDOFF.md` (latest `Continue from:`) + `0.dev-matrix/STATE.md` alerts, then run `0.dev-matrix/resume-work.ps1` early so background launch-check accumulates.
- Before broad work: see `.github/instructions/repo-guide.instructions.md` + `0.dev-matrix/SECURITY.md` (15-item checklist), `PATTERNS.md`, `DEPENDENCIES.md`, `RULES.md`.
- Verify external-agent claims against files before trusting them; report counts and raw errors, never "all pass" without command output.
- Close: `npm run close-day`, update `AI-HANDOFF.md` (`Changed, Verified, Operational proof, Continue from, Next step, Blockers`), commit + push.
