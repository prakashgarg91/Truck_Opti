# TO-127 — Result: Replace simulated driver KYC with real uploads

**Worker:** GLM-5.3 Flash (TO-127 slice) · **Date:** 2026-10-03 · **Verdict:** worker PASS (ready for GPT-6 review; not DONE, not deployed)
**Evidence level:** `local` — full local disposable Supabase stack battery + unit/component/browser-denial checks. Hosted-Supabase driver journey is owner-gated (see Blockers).

## What changed

DriverKycPage no longer simulates anything. It consumes the TO-126 contract (`driverKycApi.getState/uploadDocument/submit/getDocumentAccessUrl`) as its only source of truth:

- **Real uploads:** file bytes go to the private `driver-docs` bucket (`supabase.storage.upload` at a randomized owner-scoped path) and the `driver-kyc` edge validates the stored bytes and registers the next versioned record. Transfer state is an honest indeterminate "Uploading…" spinner — **no percentage is invented** (old `setInterval` + `Math.random` progress ring deleted).
- **Server-authoritative outcomes:** pending_review/rejected/accepted, `submitted`, and the locked "KYC Verified" banner come only from `buildKycState` on the server. The old `setTimeout` chain that self-approved documents (page called `acceptDocument` 900–3000 ms after submit) is deleted; no client code path can accept/reject/submit/lock a document (regression-tested).
- **Load on navigation/refresh:** `getState()` on mount; retryable error phase if the backend is unreachable; denial card without a driver session. In local-first mode (no configured Supabase) the page never reaches `ready`, so **local users cannot upload or report KYC verified**.
- **Offline guard:** `navigator.onLine` + online/offline events disable every upload input and the submit CTA with an honest banner.
- **Signed previews:** server-stored image documents render through short-lived signed URLs (`getDocumentAccessUrl`, 60 s); local object URLs are used only for the in-flight preview and are revoked on settle/replacement/unmount (registry-tracked).
- **Demo gating:** `?demo=midflow` seeds the fabricated snapshot **only when `import.meta.env.DEV`** (`demoQueryEnabled`); production query strings do nothing, and the dev snapshot is read-only.
- **Preserved:** retry (`Try again`), replace/re-upload for pending_review/rejected, accessible validation (5 MB / JPG-PNG-WebP-PDF messages, aria-labels, `aria-live` helper). **Cancel removed with cause** — see Unresolved risks #1.
- **Profile entry (DriverProfilePage):** the "Documents & KYC" entry now shows the authoritative badge — Verified (server `locked`), Action needed (any rejection), Pending review — or no badge at all when the backend is unreachable (no invented status).

## Changed files

| File | Change |
|---|---|
| `frontend/src/pages/DriverKycPage.tsx` | Rewritten onto the TO-126 contract; simulated progress/acceptance/cancel removed; offline/auth/denial/loading/error phases; signed + blob previews |
| `frontend/src/services/driverKycDocuments.ts` | Deleted simulation surface (`setUploadProgress`, `completeUpload`, `cancelUpload`, `rejectDocument`, `acceptDocument`, `approvePendingReviews`, `submitForVerification`); added `mergeServerState` (in-flight-safe), `demoQueryEnabled`, `kycProfileSummary`; demo seed rebuilt without mock review functions |
| `frontend/src/services/driverKycDocuments.test.ts` | Rewritten for the new surface; includes the "no client path to accepted/submitted/locked" regression |
| `frontend/src/pages/DriverKycPage.test.ts` | **New** component tests (react-dom + mocked `driverKycApi`): server-state rendering, real upload call + indeterminate transfer with no `%`, retryable failure, submit-stays-pending, no-session denial, offline lockout, dev-only demo |
| `frontend/src/pages/DriverProfilePage.tsx` | Authoritative KYC badge on the entry (state effect + `kycProfileSummary`) |
| `docs/design-audit.md` | §3/§4/§6 KYC rows updated: driver side RESOLVED (TO-126+TO-127), admin side remains TO-128; backlog item 2 rewritten with evidence; next proposal = TO-128 admin review UI |
| `TASKS.md` | TO-127 row → AWAITING_REVIEW with this result file |
| `agent-results/017-result.md` | This file |

Unchanged by design: `frontend/src/services/driverKycApi.ts` (the TO-126 adapter consumed as-is), App.tsx routing, all Supabase migrations/functions.

## Verification (all executed in this session)

| Command (repo root unless noted) | Result |
|---|---|
| `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" --prefix frontend run test:unit -- src/services/driverKycDocuments.test.ts src/services/driverKycApi.test.ts src/pages/DriverKycPage.test.ts` | exit 0 — 3 files, **49/49 tests** (includes TO-126's `driverKycApi.test.ts` unchanged and green) |
| `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" --prefix frontend run lint` | exit 0 (0 warnings, `--max-warnings 0`) |
| `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" --prefix frontend run build` | exit 0 (tsc + vite, PWA precache 86 entries) |
| `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" --prefix frontend run test:unit` (full suite) | exit 0 — 33 files, **512/512 tests** |
| `node --test scripts/test-server-routing.mjs` | exit 0 — 10/10 |
| `node supabase/functions/driver-kyc/local-disposable-battery.mjs` (env: local stack URL + `supabase status` keys, keys not printed) | **33/33 PASS** on the running local disposable stack — proves every backend behavior this page consumes: anon/other-driver reads denied, owner-scoped paths, version-chain guard (duplicate/skip/accepted-insert rejected), byte-spoofed upload rejected + object removed, submit refused until 4 documents, non-admin review 403, stale-version review 409, reject-reason enforcement, `locked` computed server-side, short-lived signed access |

### Browser checks (env trap ritual applied)

`frontend/.env.local` and `frontend/.env` renamed to `*.sync-hold` for the run, then restored byte-identical (sha256 verified: `6433136d…` / `cb5f52d3…`). Vite dev on :5199 (local-first mode), Playwright-driven:

- **390×844:** unauthenticated `/driver/kyc` → redirected to `/login` ("Driver Login"); screenshot `agent-results/to127-kyc-mobile-390x844-denied-login.png` (gitignored by the repo's `*.png` policy; on disk for review).
- **1280×900:** same denial; screenshot `agent-results/to127-kyc-desktop-1280x900-denied-login.png`.
- 0 console errors/warnings in both runs.

A signed-in driver journey in a real browser requires a reachable hosted Supabase (env trap documented in the brief), which is owner-gated — the driver-side behaviors are instead proven at the two strongest local tiers: the component tests (mocked contract, exact page behavior) and the 33/33 disposable-stack battery (the real edge function + storage + RLS the page calls).

### Red/green regression evidence

- **Red (pre-change state, from the assessment this slice was cut from):** `DriverKycPage.tsx` ran `setInterval` with `Math.random` progress and `setTimeout` chains calling `acceptDocument`; `?demo=midflow` was unguarded; no backend calls existed in the page.
- **Green (this session):** `grep -n "setInterval\|setTimeout\|Math.random\|acceptDocument\|submitForVerification\|approvePendingReviews\|completeUpload\|setUploadProgress\|cancelUpload" frontend/src/pages/DriverKycPage.tsx` → **zero matches** (only `URL.createObjectURL` at line 493, the revocable in-flight preview). Component test asserts no `/Uploading \d+%/` text during transfer and that "KYC Verified" appears only for a server `locked` payload; service test asserts no client transition sequence can produce accepted/submitted/locked.
- Old-suite regression: full 512-test suite and TO-126's own `driverKycApi.test.ts` pass unchanged.

## Required-check mapping (brief "Required checks")

| Check | Status |
|---|---|
| Refresh retains uploaded documents | ✅ `getState()` on mount renders persisted docs; battery proves server persistence across calls (v3 registration + `submitted=true`) |
| Failed upload leaves retryable state | ✅ component test (error card → Try again → picker re-enabled) |
| Submit remains pending until actual admin decision | ✅ component test (stays "Submitted — under review", no "KYC Verified"); battery: `locked` only after real reviews |
| Rejection/resubmission works | ✅ rejected card renders server reason + Re-upload → new version (battery: replacement supersedes accepted v1 → v2 `pending_review`; review flow enforces reasons) |
| Changed document version invalidates previous acceptance | ✅ battery: "replacement upload supersedes the accepted v1 (current is v2 pending_review)" + stale-version review 409 |
| Local/unauthenticated access is denied | ✅ no-session denial card + route redirect (browser, both widths); local-first mode never enables inputs |
| Browser 390×844 and 1280×900 | ✅ denial flow verified at both widths (journey itself owner-gated, see below) |
| Build, lint, focused and full unit tests | ✅ all exit 0 (see table) |

## Unresolved risks / review notes

1. **In-transfer Cancel was removed, not faked.** `@supabase/supabase-js` 2.90 `storage.upload` exposes no `AbortSignal` (verified in `storage-js` `FileOptions`) and no progress callback, so a Cancel button could not actually stop the bytes or prevent version registration — it would have been a simulated success. The screen therefore shows an honest indeterminate transfer with no cancel affordance; retry/replace paths are preserved. If the owner wants true cancel/progress, the transport must move to XHR/fetch-with-signal against the Storage REST endpoint (consumer-level change, propose as its own slice).
2. **Signed thumbnails expire after 60 s** (edge constant). Images mint + load immediately; on mint failure the file-icon fallback renders. Richer preview lifecycle (refresh-on-expiry, full-view) belongs to TO-128's signed-preview scope.
3. **"Jobs unlock once all 4 are approved" copy retained** on the KYC screen; actual job gating still keys on `drivers.status` (TO-129/TO-130 scope, per the coverage table).
4. Driver self-approval of `drivers.status` via RLS (coverage row) is untouched here — outside this brief's allowed paths.

## Blockers (owner-gated)

- **Hosted Supabase driver journey proof:** `frontend/.env.local` points at a dead host; verifying the real upload→review→verified loop in a browser against the live project needs a working hosted env and deployed `driver-kyc` function + migration `20261003000000_private_kyc_documents.sql` (`supabase db push` is owner-gated). Ask: owner to provide/repoint the hosted env and push the TO-126 migration, then rerun the journey.
- No push performed (orchestrator pushes in the release phase).

## Next recommendation

**TO-128 (brief 018): admin KYC review loop** — wire `DriverDetailPage` to `driverKycApi.reviewDocument` + signed previews (`getDocumentAccessUrl`), closing the inbound half of the loop this slice's evidence battery already exercises server-side (per-document accept/reject with 409 conflict protection).

## Git state at close

- Branch `main` at parent `5c6d8af0` (TO-126); single cohesive commit added for this slice; nothing pushed.
- Pre-existing untouched dirty entries remain: `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`, `.serena/`, `agent-results/completion-truth-20261002.md`, `agent-results/functional-coverage.md`.
- `frontend/.env`/`frontend/.env.local` restored byte-identical (sha256 re-verified after the browser ritual).
