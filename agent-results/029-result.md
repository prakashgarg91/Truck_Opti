# TO-139 Result — Audit implemented journeys for UX and accessibility gaps

**Task:** `agent-tasks/029-actual-ui-completeness.md`
**Verdict:** **PASS** (ready for GPT-6 review; no deployment, hosted access or live change authorized by this work)
**Date:** 2026-10-05 · **Worker:** GLM-5.3 Flash (writer-TO-139) · **Branch:** `main` (no push)
**Evidence level:** **fixture tier** — real built frontend (`frontend/dist`, local-first, no backend) driven in Chromium at 390×844 and 1280×900 plus device-local PGlite/IndexedDB identity. Cloud-credentialed browser journeys (staging/production) were **not executable** and are reported below; no mock was substituted for them.

---

## 1. What was done

The September `docs/design-audit.md` scored **generated Stitch HTML**, which cannot establish actual app behaviour and marked "offer acceptance unreachable" while a dashboard modal existed. This slice audited the **implemented application**: every route in `frontend/src/App.tsx`, its role gate, its data source, and its real browser behaviour at both required viewports (fresh + returning contexts, allowed + denied roles), then fixed the journey-breaking defects and documented the rest for owner selection.

**Result: 104 browser checks, 0 hard failures** (red baseline: 100 checks, **18 hard failures**), all other gates green. Five journey-relevant defects were fixed, one invented support number was removed, and the open findings are recorded as P1/P2 owner selections in `docs/design-audit.md` §"2026-10-05 addendum".

## 2. Changed files

| File | Change |
|---|---|
| `scripts/ux_route_audit.mjs` | **New.** Route/action browser audit: 51 route entries (public / device-local agency / denied-role) × 2 viewports with screenshots, console/page-error and failed-request capture, ErrorBoundary/404/redirect hard-failure detection, overflow + a11y DOM signals (nameless controls, unlabelled fields, alt, headings, lang) and a bounded contrast heuristic; layout-nav href integrity + Terms/Privacy/Contact link targets. Exits 1 on any hard failure. |
| `frontend/src/utils/displayName.ts` + `.test.ts` | **New.** Normalizes `user_metadata.company` (string or `{ name }`) to a renderable string — the object shape threw React error #31. 4 unit tests. |
| `frontend/src/pages/AgencyDashboardPage.tsx` + `.test.ts` | **Device-local branch**: with no backend the dashboard renders the device workspace (company, local truck/carton counts, quick actions, cloud-feature note) instead of the failed cloud fetch + "No Agency Profile Found"/cloud-registration CTA. 2 regression tests. |
| `frontend/src/layouts/AgencyLayout.tsx` | Company label via `toDisplayName` (P0 crash); realtime job subscription guarded by `isSupabaseConfigured` and cleanup corrected (effect previously returned no cleanup). |
| `frontend/src/layouts/MobileLayout.tsx` | Notification realtime subscription guarded by `isSupabaseConfigured`. |
| `frontend/src/pages/TrackingPage.tsx` | Realtime subscription guarded by `isSupabaseConfigured`. |
| `frontend/src/pages/DriverTripPage.tsx` | Invented `tel:18001234567` → configured support phone from `config/support.ts` + accessible label. |
| `frontend/src/config/support.ts` | **New.** Single source of truth for the owner-configured support phone/email (values from commit `edcee619`). |
| `frontend/src/pages/ContactPage.tsx` | Reads support constants from the config module (no behaviour change). |
| `frontend/src/components/ErrorBoundary.tsx`, `frontend/src/pages/PaymentCallbackPage.tsx` | Support contact now the owner-configured email (was `support@truckopti.in`). |
| `frontend/src/pages/NewShipmentPage.tsx` | Misleading empty `✅` toast on dispatch failure → explicit warning toast. |
| `frontend/src/pages/TermsPage.tsx`, `frontend/src/pages/PrivacyPage.tsx` | `aria-label="Go back"` on the icon-only back button. |
| `docs/design-audit.md` | New 2026-10-05 addendum: actual-app route inventory + action/API map refresh, red→green evidence, fixed findings, P1/P2 owner backlog, Stitch record. |
| `agent-results/029-result.md`, `TASKS.md` | This result; board row → AWAITING_REVIEW. |

No other file was touched; the diff is 13 modified + 6 new files, all inside the brief's allowed scope (`docs/design-audit.md`; route components/layouts/support config affected by concrete findings; browser checks under `scripts/`).

## 3. Red → green (exact commands, exit codes, counts)

| Check | Command (dir) | RED | GREEN |
|---|---|---|---|
| UX route audit | `node scripts/ux_route_audit.mjs` (`D:\Github\Truck_Opti`, `PUBLIC_APP_URL=http://127.0.0.1:3000`) | **exit 1 · 100 checks · 18 hard failures · 144 findings** — all 7 `/agency/*` routes ×2 viewports rendered the ErrorBoundary fallback (React #31), agency nav hrefs/nav targets broken, invented phone present | **exit 0 · 104 checks · 0 hard failures · 174 findings** (open P1/P2) |
| Device-local workspace proof (TO-134 harness) | `node scripts/customer_local_workspace.browser-proof.mjs` | 2/2 viewports but 4 console-error findings (`React #31` + placeholder WSS) | **2/2 viewports · 0 console errors · 0 page errors · 0 failed responses** |
| Launch smoke | `node scripts/frontend_launch_smoke.mjs` | (baseline ran green pre-change) | **exit 0 · 63/63** |
| Frontend unit | `npm run test:unit` (`frontend`) | 545/545 (repo baseline) | **exit 0 · 38 files · 551/551** (+4 displayName, +2 AgencyDashboardPage) |
| Frontend lint | `npm run lint` (`frontend`) | — | **exit 0 · 0 warnings** |
| Frontend typecheck | `npx tsc --noEmit` (`frontend`) | — | **exit 0** |
| Frontend build | `npm run build` (`frontend`, `.env.local` moved aside for a local-first artifact) | — | **exit 0** |
| Policy suite | `node --test scripts/{launch_gate,payment_readiness,production_config_audit,production_config,security_boundary,supported_runtime,deployment_safety}*.test.mjs` | — | **exit 0 · 70/70** |
| Server routing | `npm run test:server-routing` | — | **exit 0 · 15/15** |
| Packing regression | `npm run test:packing` (`frontend`) | — | **exit 0 · 18/18** |
| Glue check | `node tools/glue-check.mjs` | — | **exit 0 · 0 gaps, 0 warnings** |

Artifacts (gitignored working evidence): `logs/to139-audit-red.baseline.txt`, `logs/to139-ux-audit-report.red.json`, `logs/to139-audit-final.txt`, `logs/to139-ux-audit-report.json`, screenshots `logs/to139-ux-audit/{mobile-390x844,desktop-1280x900}/*.png`, intermediate post-crash-fix evidence `logs/to139-ux-audit-report.after-crash-fix.json` + `logs/to139-ux-audit-after-crash-fix/`, `logs/to134-local-workspace-browser-proof.json`, `logs/frontend_launch_smoke_report.json`.

### Fixed findings (each with red evidence)

1. **P0 — agency layout crash (React #31).** `user_metadata.company` is `{ name }` for the device-local profile, so `AgencyLayout` rendering it collapsed **every** `/agency/*` route to "Something went wrong" (red audit hard failures + red screenshot). Fixed via `toDisplayName`; green: all agency routes render, company label shows.
2. **P0 — device-local landing contradiction.** After `/local-start` created the device workspace, `/agency/dashboard` failed its cloud fetch and told the user "No Agency Profile Found — Register your transport agency" (intermediate evidence `logs/to139-ux-audit-report.after-crash-fix.json`, screenshot preserved). Now the dashboard shows the device workspace (`On this device`, local truck/carton counts, quick actions, honest cloud-feature note; no failure toast) — green screenshot `logs/to139-ux-audit/mobile-390x844/agency-dashboard.png`.
3. **Invented support number removed (brief instruction).** `tel:18001234567` → `tel:+919999352050` (owner-configured). Support email inconsistency (`support@truckopti.in` in ErrorBoundary/PaymentCallback vs the configured address on Contact) resolved through `config/support.ts`.
4. **Local-first placeholder WebSocket.** Every signed-in page opened `wss://localhost.invalid/realtime/...`; guarded in the three reachable subscribers (AgencyLayout, MobileLayout notifications, TrackingPage). Workspace proof console errors 4 → 0.
5. **Misleading success.** Booking dispatch failure showed an empty `✅` toast (`NewShipmentPage.tsx:101`); now an explicit warning.

## 4. Route/action coverage (what the 104 checks prove)

- **Public (15 routes + 5 login surfaces):** all render at both viewports including the 404 page and the DEV-only `/test-payment` (404 in production build); Terms/Privacy/Contact link targets from `/` and `/login` reach their pages.
- **Authenticated device-local agency (23 routes):** all render without error boundary; agency and customer layout nav hrefs/buttons present and each nav target resolves (16 hrefs); `/invoice/:shipmentId` renders; denied-role `/admin*` and `/driver/*` (5 routes) render the PermissionDenied state with a working "Go to my home".
- **Consumer actions checked in-browser:** local workspace setup, truck/carton create → reload → read-back (TO-134 harness), contact form failure fallback (smoke), auth fallback (smoke), keyboard entry to the device workspace (smoke).
- **Still open and documented** (see §5): local-first degradation of cloud routes, a11y gaps, contrast sample, dead language state, and the carried DB/product findings.

## 5. Open findings (owner selection — full detail in `docs/design-audit.md` addendum §D)

- **P1 D1:** local-first mode still attempts 12 cloud endpoint families (`/rest/v1/{trucks,shipments,routes,packing_jobs,cartons,customers}`, `/functions/v1/agency-portal-*`) and shows failure toasts + empty/error states on those routes. Products routes work in cloud mode; the local-mode experience needs a product decision (gate/redirect/offline-cache/accept).
- **P1 D2:** accessibility sweep — 20 nameless icon-only buttons (14 routes), 4 unlabelled fields (2 routes), `no-h1` on 5 routes, `multiple-h1` on 12 routes, `document.title` missing on 11 routes.
- **P2 D3:** 52 sampled contrast mentions below AA thresholds (heuristic, noisy — recommend a real contrast pass before acting).
- **P2 D4:** dead language state (`languageStore` + `labelHi`), English-only rendering verified incl. a returning `hi` localStorage context.
- **P1 D5 (carried):** TO-134/135 product findings (missing `dispatch_job_to_drivers`, cross-tenant RPCs) — not UI-repairable; the dispatch toast is now honest.

## 6. Limitations and not-run items

- **Fixture tier only.** No Supabase/GoTrue/PostgREST backend: cloud sign-in, customer booking/tracking/invoice, driver and admin signed-in journeys, payments and staging behaviour are **not** proven here. Driver/admin routes were verified through their denied-role state only. The hosted project (`jbxncejtcbpcronndqlx`) is owner-gated; the disposable local stack cannot run (`npx supabase status` → `failed to inspect container health: docker: command not found (podman also not found)`, `docker --version` → `command not found`), so no local Supabase stack, no staging browser journey.
- `/auth/callback` was not driven (needs a real OAuth code); its unit test and the smoke's auth surfaces cover adjacent behaviour only.
- A11y signals are DOM heuristics (names/labels/headings/overflow) and a sampled contrast ratio; **no axe-core or screen-reader pass** was run. Overflow was checked at the two briefed viewports only.
- Screenshots/reports are gitignored `logs/` artifacts, not committed.
- Red-baseline audit numbers: the preserved red run is the refined script (100 checks / 18 hard failures); the very first run additionally counted title mismatches as hard failures (32) before the check was corrected to a finding.

## 7. Stitch record (per brief)

`stitch_status` ×1, `stitch_guide` ×1 — both read-only, project `projects/817968552986251880` reused, `keyConfigured=true`, `repoRoot=D:\Github\Truck_Opti`. **0 mutations, 0 retries, 0 generations, 0 edits.** No new screen IDs; the addendum references the existing inventory only.

## 8. Git state

Branch `main`; working tree contains this slice's 13 modified + 6 new files, plus pre-existing untracked local state (`.ai-work-factory/`, `.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`) preserved and not staged. The local static server on :3000 was used for the fixture runs; `frontend/.env.local` was moved aside for the local-first builds and restored afterwards (verified present, 291 bytes). **Not pushed**; no hosted/production action of any kind.

## 9. Next smallest recommendation

GPT-6 review of this result and the `docs/design-audit.md` addendum, then **owner selection of the P1 backlog**: (a) decide the local-first behaviour of cloud-only routes (D1) — the largest remaining journey-quality item; (b) one focused a11y slice for the nameless buttons/unlabelled fields/titles (D2); (c) keep the TO-134/135 DB-repair slice (D5) on its existing track.
