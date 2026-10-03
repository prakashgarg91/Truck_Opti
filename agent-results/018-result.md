# TO-128 — Result: Complete the admin KYC review loop

**Task:** `agent-tasks/018-admin-kyc-review.md`
**Verdict:** **PASS** (worker-complete; ready for GPT-6 review. Not DONE, not deployed, authorizes no live change.)
**Date:** 2026-10-03 · **Worker:** GLM-5.3 Flash (Implementer TO-128) · **Branch:** `main` (no push, per policy)
**Evidence level:** backend/journey evidence is **local** — real HTTP through the served `driver-kyc` edge function against the disposable local Supabase stack (Docker), plus component/unit tiers. Browser evidence is the **denial/redirect flow only** (the app's TO-124 capability resolution requires an https backend, so a local-HTTP browser journey is architecturally refused by design; hosted journey proof stays owner-gated — see Blockers).

---

## 1. What was done

The admin half of the KYC loop now exists inside the existing `/admin/drivers/:id` journey (no competing admin system):

- **Authoritative admin state read (reviewed contract adjustment):** the `driver-kyc` `state` action now accepts an optional `driverId` resolved through the existing `resolveAccessContext` — an authorized admin (server-verified `public.users.role`, never `user_metadata`) gets the driver's server-computed document versions; a non-admin asking for a foreign driver gets **403**; a driver passing their own id is allowed; an admin without `driverId` gets **400** (mirrors `access`). Previously `state` ignored `driverId` entirely (admin read = 403, and a cross-driver request silently returned the caller's own state).
- **Reviewer/time surfaced:** `buildKycState` documents now carry `reviewedAt` (server-recorded `reviewed_at`; `reviewed_by` remains a DB-recorded UUID, not displayed). Additive field; driver-side consumers unaffected.
- **`DriverDetailPage` KYC Verification section:** loads `getDriverKycState(driverId)` on mount and after every action; renders all four kinds (`KYC_DOC_META` titles) with status badge (`Not uploaded / Pending review / Accepted / Review Needed`), version chip, file meta + upload time, `Reviewed <time>`, and the server rejection reason. Review actions exist **only** for `pending_review` current versions and go **only** through `driverKycApi.reviewDocument` (reason required, trimmed, enforced again server-side); the returned server state replaces the local one. Any review failure (including the 409 stale-version conflict) toasts the user-facing message **and reloads the authoritative state**, so the UI shows the version that actually won.
- **Private signed previews:** images render an inline preview only after minting a fresh 60-second signed URL via `getDocumentAccessUrl(kind, { driverId })` per click (nothing long-lived is stored or re-rendered later); a broken image (expired/unavailable) switches the row to "Preview link expired or the file is unavailable" with a re-mint button; PDFs open in a new tab from a fresh mint per click. Mint failures surface the user-facing error (covers the 404 unavailable-file case).
- **Driver approval connected to reviewed versions:** the pending-state "Approve Driver" button now checks the server-computed `locked` flag. Fully accepted → approves directly (existing behavior). Otherwise an amber confirmation card states the shortfall ("Only N of 4 KYC documents are accepted. Approving now makes this driver operational without full document verification." — or "KYC status could not be verified right now." when the state fetch failed) and requires an explicit **Approve Anyway**. The additional approval decision is thereby documented, never silent. Reject/Suspend/Reinstate flows are untouched.
- **Adapter (`driverKycApi.ts`):** new `getDriverKycState(driverId)` (rejects empty id before any call); `reviewDocument` now truthfully declares its existing `KycApiSubmissionState` return (normalizer always produced it); `reviewedAt` added to the payload/`KycDocument` types as optional. `adminSupabaseApi.ts` needed **no change** (whole-driver status actions stay; KYC authority is the `driver-kyc` function). `AdminDriversPage.tsx` needed **no change** (untouched).
- Local-first/local hardening inherited from TO-127 applies: nothing in the section fabricates state — every rendered status/version came from the backend, and the failure path is an explicit error card with Retry.

## 2. Changed files

| File | Change |
|---|---|
| `supabase/functions/driver-kyc/index.ts` | `state` action accepts admin `driverId` via `resolveAccessContext`; `reviewedAt` in `buildKycState` docs; request parsing/validation for the extension |
| `supabase/functions/driver-kyc/local-disposable-battery.mjs` | 2 new checks: admin state read (200/locked/versions/`reviewedAt`), cross-driver 403 + own-id 200 + admin-no-id 400 (33 → 35 checks) |
| `frontend/src/services/driverKycApi.ts` | `getDriverKycState(driverId)`; `reviewDocument` returns `KycApiSubmissionState`; `reviewedAt?` on `KycApiDocumentPayload` |
| `frontend/src/services/driverKycDocuments.ts` | `reviewedAt?` on `KycDocument` |
| `frontend/src/pages/DriverDetailPage.tsx` | KYC Verification section (review actions, signed previews, 409 reload, refresh), approve-shortfall confirmation gate |
| `frontend/src/pages/DriverDetailPage.test.ts` | **new** — 7 component tests (react-dom + mocked APIs; `.ts` not `.tsx` because the vitest include is `src/**/*.test.ts`) |
| `frontend/src/services/driverKycApi.test.ts` | +3 tests for `getDriverKycState` incl. `reviewedAt` passthrough and empty-id guard |
| `docs/design-audit.md` | §4 KYC rows → both directions RESOLVED; summary updated; backlog item 2 closed with next proposal |
| `TASKS.md` | TO-128 row → AWAITING_REVIEW with this result file |
| `agent-results/018-result.md` | This file |

## 3. Verification (all executed in this session)

| Check | Command (repo root unless noted) | Result | Evidence class |
|---|---|---|---|
| Baseline battery (pre-change) | `SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… node supabase/functions/driver-kyc/local-disposable-battery.mjs` | **33/33, exit 0** (local CLI 2.119 `sb_publishable_`/`sb_secret_` dev keys) | local DB/Storage/Function |
| **Red** — new admin-state checks against the old function | same battery, before the function edit | **33/35** — `admin state read … status=403`; `cross-driver state read denied … otherDriver=200 adminNoId=403` (exactly the 2 new checks fail) | local |
| **Green** — battery after the function change + serve restart | same battery | **35/35, exit 0** — admin state read 200 with `locked=true rcV=3 reviewedAt=true`; `otherDriver=403 ownId=200 adminNoId=400`; all 33 prior checks still pass | local DB/Storage/Function (function served by `npx supabase functions serve driver-kyc`, edge runtime 1.77.1) |
| Focused frontend tests | `npm-cli.js --prefix frontend run test:unit -- src/pages/DriverDetailPage.test.ts src/services/driverKycApi.test.ts src/services/driverKycDocuments.test.ts` | **51/51, exit 0** (7 new page + 20 adapter + 24 documents) | local unit |
| Full unit suite | `npm-cli.js --prefix frontend run test:unit` | **522/522, exit 0** (34 files; 522 = 512 pre-existing + 10 new) | local unit |
| Lint | `npm-cli.js --prefix frontend run lint` (`--max-warnings 0`) | **exit 0** | local |
| Build (tsc + vite) | `npm-cli.js --prefix frontend run build` | **exit 0** (PWA precache 86) — first run caught the `reviewDocument` return-type error TS2345, fixed, re-run green | local |
| Server routing | `npm-cli.js run test:server-routing` | **exit 0** | local |
| Policy suite (7 files) | `node --test scripts/deployment_safety.test.mjs scripts/launch_gate_policy.test.mjs scripts/payment_readiness_policy.test.mjs scripts/production_config_audit.test.mjs scripts/production_config_policy.test.mjs scripts/security_boundary_policy.test.mjs scripts/supported_runtime_policy.test.mjs` | **70/70 pass, 0 fail** | local |
| Browser 390×844 + 1280×900 | env ritual (`.env`/`.env.local` → `*.sync-hold`, dev on :5199, restore + sha256 `cb5f52d3…`/`6433136d…` byte-identical); Playwright: unauthenticated `/admin/drivers/<id>` | both widths redirect to `/login` ("Office Login") — admin route guard intact; **0 console errors/warnings**; screenshots `agent-results/to128-admin-mobile-390x844-denied-login.png`, `to128-admin-desktop-1280x900-denied-login.png` (gitignored `*.png`, on disk for review) | local browser (denial tier) |

### Red → green summary

- **Red (executed):** the two new battery checks fail against the unmodified function (admin state read 403; cross-driver read wrongly 200 because `state` ignored `driverId`). Component-level red comes from the pre-slice coverage sweep: no admin per-document review existed (`DriverDetailPage` had only whole-driver Approve/Reject/Suspend; raw public DocBadge links).
- **Green (executed):** 35/35 battery (server authority, reason enforcement, 409, signed access, reviewer/time), 51/51 focused + 522/522 unit, lint/build/routing/policy all exit 0.

## 4. Required-check mapping (brief "Required checks")

| Check | Status | Evidence |
|---|---|---|
| Admin opens a pending submission | ✅ (battery + component tier) | battery registers pending_review v3 and the new admin state read returns it; page test "loads and renders the server-authoritative per-document outcomes" |
| Accepts / rejects individual documents | ✅ | battery `review` accepts v3/rejects aadhaar with reason (400 without); page tests: accept → `reviewDocument(driverId, kind, version, 'accept', undefined)`; reject requires non-empty reason before any call, then `'reject'` + reason |
| Reviews a resubmission | ✅ | battery: rejected aadhaar v1 → replacement v2 → accepted (review of the *new* current version); page re-renders from the returned state, version chip updates |
| Sees stale-version conflict | ✅ | battery 409 on v99; page test: conflict → toast.error + authoritative reload (`getDriverKycState` called again) |
| Driver-side status after refresh | ✅ (server tier) | driver `state` returns server-computed outcomes after reviews (battery `locked=true` flow); TO-127 page tests prove `/driver/kyc` renders `getState()` on mount. A *browser* driver-refresh journey needs hosted Supabase (owner-gated) |
| Non-admin and cross-driver requests fail at the server | ✅ | battery: non-admin review 403, cross-driver state 403, spoofed-role controls; signed access other-driver 403 |
| Mobile/desktop layouts and keyboard flow | ⚠️ partial | denial flow verified at both widths (screenshots, 0 console errors); all review controls are native buttons/textarea (tabbable, `aria-expanded`, `aria-label`, labelled textarea, `disabled` while busy) verified in component tests; the signed-in layout itself needs a reachable backend — owner-gated |
| Focused tests, full unit suite, lint, build | ✅ | see table — all exit 0 |

## 5. Design decisions worth review

1. **Admin read reuses the `state` action + `resolveAccessContext`** instead of a new action — one authority path for owner/admin resolution, and the same normalization feeds both driver and admin UIs.
2. **Review actions render only for the current `pending_review` version**, and every review response/reload replaces the whole state — the UI cannot display a status the server did not return.
3. **Previews are mint-per-click**, never persisted: an expired link cannot be rendered because no link is kept; the inline-preview expiry path (image error → "expired or unavailable" + re-mint) is handled for images that sit open longer than 60 s.
4. **Approve-with-shortfall is a documented confirmation, not a block:** legacy drivers without KYC documents can still be approved deliberately (existing policy), but never silently — the shortfall text names the count or the verification failure. Reinstate (previously approved driver) keeps its single-click behavior; flagged for review if the owner wants the gate there too.
5. `reviewDocument`'s declared return narrowed to `KycApiSubmissionState` (what `normalizeKycState` always produced) — this is the TS2345 build fix, not a cast.

## 6. Limitations, risks, follow-ups

- The stale legacy "Documents" DocBadge section (now-dead public URLs, all null after the TO-126 migration) is untouched — outside the smallest fix; candidate for removal in a cleanup pass.
- `drivers.status` self-approval via RLS (coverage row) remains open — outside this brief's allowed paths; the approve-confirmation does not change that authority gap (TO-129/TO-130 or a hardening slice).
- Job gating still keys on `drivers.status` only; the KYC "unlock" copy on the driver screen remains TO-129/TO-130 scope.
- Denial-tier browser evidence only (see Blockers); keyboard-flow claims rest on native controls + component tests, not a signed-in browser run.
- Two transient docker flakes during the session (edge-runtime container SIGKILL 137 / `functions serve` exit) — recovered by restarting `functions serve`; final battery run was clean. The served-function process was stopped after verification; the disposable stack itself stays initialized (`npx supabase stop --no-backup` disposes it, owner call).

## 7. Owner gates (blockers)

- **Hosted/staging journey proof:** applying migration `20261003000000_private_kyc_documents.sql`, deploying the updated `driver-kyc` function, and pointing a frontend env at the live project are all owner-gated (`supabase db push`, functions deploy, credential/env handling). Ask: owner provides the staging env + deploys, then the full admin→driver browser journey (accept/reject/resubmission/refresh, both widths) is rerun as staging evidence.
- No push performed (orchestrator pushes in the release phase).

## 8. Git state at completion

- Branch `main`; single cohesive commit of the 10 files in §2 (named paths only); nothing pushed.
- Pre-existing untracked items preserved untouched: `.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup`, `agent-results/completion-truth-20261002.md`, `agent-results/functional-coverage.md`, `closeout-logs/`.
- `frontend/.env` and `frontend/.env.local` restored byte-identical after the browser ritual (sha256 re-verified: `cb5f52d3…` / `6433136d…`).

## 9. Next recommendation

GPT-6 review of this slice (focus: the `state` driverId contract extension and the approve-shortfall confirmation semantics). Then the completion queue's next item **TO-129 (brief 019)** — atomic/reachable driver job-offer acceptance — which is also the design-audit backlog's remaining P0.
