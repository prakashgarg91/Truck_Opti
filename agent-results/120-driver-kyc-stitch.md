# TO-120 — Driver "Documents & KYC Upload" screen from Stitch design

Date: 2026-09-19 · Branch: `stitch/driver-docs-upload-20260919` · Status: DONE (merged to main as `0f91bfe5`, owner merge review 2026-09-19; post-merge gates re-run green)

## Source design
- Stitch screen `e72905bab5794849b0fcb495b7c474bc` "Driver: Documents & KYC Upload" (project 817968552986251880, MOBILE, design system `assets/039d7f7b6b7747e8a76dedad4464c9cb`), generated after two failed attempts (attempt 1: lowercase `deviceType` PROVIDER invalid-argument; attempt 2: 30 s client timeout, screen never landed). Attempt 3 succeeded in-call under adapter 0.2.0.
- Full generated payload: `C:\Users\Prakash\AppData\Local\stitch-mcp-state\artifacts\10636db1\817968552986251880\screen.2026-09-19T07-40-13-600Z.json` (48,708 bytes). Generated HTML reference copy: `.stitch-mcp/scratch/driver-kyc-e72905ba.html` (22,138 bytes, gitignored folder).
- The original ~4.6k-char brief was unrecoverable verbatim; attempt 3 used a reconstruction from the recovered opening + owner goal + documented constraints.

## Changed files
- `frontend/src/services/driverKycDocuments.ts` — NEW: pure KYC document/submission state machine (4 doc kinds × 6 statuses, validation, submit gate, lock-at-4-accepted, midflow demo seed).
- `frontend/src/services/driverKycDocuments.test.ts` — NEW: 18 vitest cases (validation, lifecycle, review pipeline, submit gate, purity, demo seed).
- `frontend/src/pages/DriverKycPage.tsx` — NEW: the screen (header/summary card, guidance tips, 4 document cards with all states, sticky bottom CTA, `?demo=midflow` seed, dark mode, a11y).
- `frontend/src/App.tsx` — lazy import + `/driver/kyc` route inside driver ProtectedRoute/DriverLayout.
- `frontend/src/pages/DriverProfilePage.tsx` — "Documents & KYC" entry card in the Compliance section.

## Adaptations from the generated design (deliberate)
1. Material-style palette (#131b2e/#fea619/#ba1a1a…) → app Tailwind tokens (primary blue, slate, amber/red/emerald pill styles matching `DriverProfilePage`).
2. Material icon ligatures → `lucide-react` icons.
3. Security copy "256-bit AES / RTO validation registry" → verifiable claim ("stored securely and shared only with the TruckOpti verification team").
4. Generated mock's "50% Completed / 2 of 4" (internally inconsistent with its 4 cards) → honest computation; real uploads get object-URL image previews (PDFs get an icon tile).
5. Help button in the top bar omitted (no help target wired).
6. DRV chip derives `DRV-` + first 6 chars of the real user id (mock seed shows DRV-88492 only under `?demo=midflow`).
7. Uploads are client-side simulated; per-doc `pending_review`/`rejected`/`accepted` are mock transitions until storage/backend wiring exists (rejection path reachable via demo seed + unit tests).

## Verification (exact)
- `npx tsc` → 0 errors (frontend tsconfig).
- `npx vitest run` → **20 files, 347/347 passed** (329 pre-existing + 18 new).
- `npx eslint` on all 5 changed files → clean (`--max-warnings 0`); fixed two `react-hooks/refs` violations it caught (ref write during render; ref read during render) by moving the state mirror into an effect and preview URLs into state; re-verified.
- Browser journey (Playwright, Vite dev server, env files set aside per known dead-Supabase recipe and restored byte-exact after; injected driver-role session into `authStore`):
  - Auth guard: `/driver/kyc` unauthenticated → redirects to `/login`. ✔
  - Mobile 390×844: initial state → **upload-error path** (5.24 MB file → "Upload failed" pill + "File is too large. Maximum size is 5 MB." banner + toast) → Retry → 4 valid uploads (progress ring observed at 16%) → all "Pending review" → CTA enabled → Submit → "Submitted — under review" → staggered acceptance → **locked "KYC Verified"**, 4 "Accepted", CTA hidden. ✔
  - Desktop 1280×900: same error + full happy path + locked state; sidebar layout intact. ✔
  - `?demo=midflow` seed: rejected banner ("Expiry date is cut off. Retake with the full license in frame."), 62% uploading ring, helper "Upload all 4 documents to submit (1 rejected, 1 uploading)". ✔
  - Profile entry card renders and navigates to `/driver/kyc`. ✔ (profile API stubbed for the journey; backend unavailable locally)
  - Post-refactor re-test of upload→preview→submit→locked. ✔
- Screenshots (gitignored `.stitch-mcp/`): `driver-kyc-mobile-01-initial.png`, `driver-kyc-mobile-02-upload-error.png`, `driver-kyc-mobile-03-ready-to-submit.png`, `driver-kyc-mobile-04-locked-verified.png`, `driver-kyc-mobile-05-midflow-demo.png`, `driver-kyc-desktop-06-locked-verified.png`, `driver-kyc-desktop-07-upload-error.png`, `driver-kyc-desktop-08-midflow-demo.png`, `driver-kyc-mobile-09-profile-entry.png`.

## Blockers / next
- No AI blocker. Next: GPT-6 review → merge `stitch/driver-docs-upload-20260919` into canonical branch (rerun gates post-merge).
- Backend wiring (real storage uploads, admin review outcomes driving driver state) is future work, intentionally not started — no brief exists for it yet.
- `?demo=midflow` is a harmless client-side seed kept for design QA; remove when real backend lands.
