# TO-113 — Baseline and product inventory result

Date: 2026-09-12

## Fresh evidence
- Main commit entering this slice: `0b0458b2dbadb306ab8496a3bbb0ec1ee36035ec`.
- GitHub Actions run `34679993513` completed successfully on `main` after the CI repair.
- Frontend production build: PASS.
- Frontend unit suite: 329/329 PASS across 19 test files.
- Packing regression: 18/18 PASS.
- Public Playwright smoke: 12/12 public routes PASS in the supported local-first build.
- `apps/web` bounded authentication middleware unit job: PASS.
- Server/runtime path: root `package.json` uses `heroku-postbuild` to build `frontend/` and `node server.js` to serve the SPA; `server.js` canonicalizes apex/Heroku hosts to `https://www.truckopti.in` and serves `frontend/dist`.

## Surface inventory
| Surface | Current state | Evidence / note |
|---|---|---|
| Public frontend / PWA | VERIFIED | Build + 12/12 browser smoke pass. |
| Local-first data / PGlite | VERIFIED | Unit suite plus packing regression pass; supported when Supabase is not configured. |
| Packing optimizer | VERIFIED | 18/18 regression checks pass, including mixed-load, rotation, capacity, utilization and deterministic genetic fixtures. |
| Supabase browser client | IMPLEMENTED_UNVERIFIED | `frontend/src/lib/supabase.ts` supports configured Supabase and a local-first placeholder when absent. Production incident evidence records project ref `jbxncejtcbpcronndqlx` as unreachable/NXDOMAIN at the time of restore. |
| Supabase auth / cloud data | OWNER_BLOCKED | Requires a confirmed live project plus `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; live-auth/live-admin proofs require credentials. |
| Google sign-in | OWNER_BLOCKED | Production incident evidence records missing `VITE_GOOGLE_CLIENT_ID`; Vite variables are build-time and require coordinated redeploy. |
| Admin / agency cloud flows | IMPLEMENTED_UNVERIFIED | Frontend service modules and tests exist, but production authority must be reviewed under TO-114 before launch claims. |
| Heroku SPA origin | VERIFIED_AS_OF_2026-09-11 | Incident closeout records Heroku release v5, web dyno, ACM certificates and public smoke success. No credential/config mutation was performed in TO-113. |
| Cloudflare custom domains | VERIFIED_AS_OF_2026-09-11 | Incident closeout records corrected apex/www CNAME targets and Full (strict) TLS. |
| Razorpay | OWNER_BLOCKED | Production config audit expects a live public key and server-side secret; no real payment may be executed without explicit approval. |
| PhonePe | IMPLEMENTED_UNVERIFIED | Client/tests exist; production mode/provider configuration remains TO-115/TO-117 work. |
| Sentry | OWNER_BLOCKED | Production incident evidence records missing DSN. |

## Maintained verification commands
- `npm test` — frontend Vitest unit suite.
- `npm run test:packing` — packing regression.
- `npm run test:public-smoke` — public Playwright routes.
- `npm run test:frontend-smoke` — wider launch smoke; currently contains cloud-auth assumptions that must be reconciled before it can be a universal local-first gate.
- `npm run test:server-routing` — canonical host/server routing.
- `npm run test:live-auth` — credentialed live auth proof.
- `npm run test:live-admin` — credentialed live admin proof.
- `npm run test:prod-config` — Heroku production configuration audit.
- `npm run launch-check` — broader launch-readiness PowerShell gate.

## Current truth / gaps
1. The public and local-first product path is healthy on current `main` according to fresh CI.
2. Cloud auth/data cannot be called production-ready until the Supabase project state and production Vite credentials are confirmed by the owner.
3. The existing production config audit has stale policy: it fails when `VITE_AUTH_EMAIL_OTP_ENABLED` is not `true`, while the 2026-09-11 incident explicitly records Google-only / email-OTP-off as the intended production posture. This is the next smallest code fix and belongs to TO-115 unless TO-114 uncovers a security dependency first.
4. `scripts/frontend_launch_smoke.mjs` contains an Email OTP fallback scenario even when production auth is intentionally Google-only; it must become feature-flag aware before being used as a universal launch gate.
5. Privileged admin/agency browser access must be traced to trusted server/Supabase authorization under TO-114; passing mocked/unit tests alone is not sufficient evidence of production authorization.

## Restore-versus-replace decision input
Do not replace Supabase solely because of the February–March 2026 India-wide restriction: Supabase's official postmortem says that restriction was lifted on 2026-03-03. The current project-specific status still needs owner/dashboard confirmation. If project `jbxncejtcbpcronndqlx` is recoverable, prefer restore and verification; if it is deleted/unrecoverable, TO-114 should produce a migration/replace plan before any database push or credential change.

## Acceptance / next step
TO-113 is complete. Unblock TO-114, TO-115 and TO-116. Execute TO-114 next because trusted production authorization is a prerequisite for payment readiness and privileged workflows.
