# Design Audit — Truck_Opti × Stitch coverage

## 2026-10-24 backlog item `driver-delivery-proof-refresh` — screen `180752ea` refreshed & integrated (delivery sub-flow of `/driver/trip/:jobId`)

Design side (done upstream, 1 generation): Stitch edit of `180752ea` produced refreshed screen **`c241f6c1673b45e6b3eabb0fa05f7993`** "Driver: Delivery & Proof — TruckOpti" (MOBILE, 780×2504; journaled artifact `…stitch-mcp-state\artifacts\10636db1\…\projects_…_180752ea….2026-10-24T04-19-56-462Z.json`). This screen is a **sub-flow design of the same `/driver/trip/:jobId` page** (steps 5–7), so the integration delta sits on top of the `591699f3` integration above — **0 Stitch calls from this integration, 0 mutations**.

### What changed on `frontend/src/pages/DriverTripPage.tsx` (delta vs the `591699f3` integration)

| Artifact intent | App implementation |
|---|---|
| Upload-failure banner with explicit Retry (was toast-only) | **New state:** `uploadFailure` tracks the last failed photo field; `handlePhotoCapture` sets it on failure and clears it on a fresh attempt. The delivery proof card renders a `role="alert"` banner ("Photo upload failed. Please retry before continuing.") with a 44px **Retry Upload** button that re-opens the camera capture. Completion stays photo-gated and no progress RPC is written on failure. (The loading-photo card keeps its toast-only retry for now — that is the `b54728a4` pickup sub-flow's refresh scope, still listed in §6.) |
| Capture/submit aria-labels | Capture button: `aria-label` "Capture / Retake / Uploading proof of delivery photo" (state-aware); Complete Delivery: `aria-label="Complete delivery"` |
| Delivery OTP card (linked input, hint, live error, gated Verify) | Already wired by the `591699f3` integration (id/htmlFor, aria-describedby, aria-invalid, aria-live error, 4-digit gating) — contract strings intact, `jobOfferOtpContract.test.ts` still green |
| Private-bucket signed-URL proof caption | Already wired (TO-142 caption under the preview) |
| Slim 3-step breadcrumb (Delivery OTP, Proof Photo, Done) | **Adaptation decision: not added** — the page already carries the full 7-step stepper with `aria-current="step"` and the `aria-live` step announcer, which marks steps 5–7 exactly; a second breadcrumb would double-announce the same state to assistive tech |
| Resend-OTP affordance with timer | **Not implemented — no backend capability exists** (the recipient OTP is shown in the recipient's app; there is no resend endpoint to wire). Honest gap of the generated design, not of the app |
| State-switcher test bar | Reviewer-only simulator; the real states are covered by the tests below instead |
| Complete card with earnings note | Existing "Delivery Complete!" card ("earnings credited within 24 hours") + 44px Back to Dashboard with focus ring — unchanged |

- **Proof run this round (from `frontend/`):** `npx vitest run src/pages/DriverTripPage.test.ts src/services/jobOfferOtpContract.test.ts` → **18/18 passed** (trip page 12 = 9 from the `591699f3` round + 3 new: capture/submit labels with photo-gated completion; failed upload → `role="alert"` banner + Retry Upload re-opening capture with completion still gated and zero RPC writes; successful upload → RPC persists `photo_delivery_url` (call 1, `newStatus` null), completion enables, Complete Delivery persists `delivered` + `delivery_otp` (call 2) and navigates to `/driver/dashboard` — asserted via a route probe because the success handler navigates immediately). Two fix cycles: the first run timed out because the success test captured the Complete button before the job patch re-rendered it (fixed by re-querying inside the wait), and because completion navigates away before the complete card can be asserted (fixed with the dashboard route probe). `npx tsc --noEmit` → exit 0. `npx eslint src/pages/DriverTripPage.tsx src/pages/DriverTripPage.test.ts --max-warnings 0` → exit 0.
- **NOT run this tier:** browser pass (owner-gated driver journey, same tier limitation as the two sections above); real bucket uploads (`supabase.storage` mocked — the failure and success paths are exercised against the mocked client convention `{ error }`); camera hardware.
- Rubric row for `180752ea` (§5): generated scores retained; app mitigations annotated. §1/§2/§3/§6 rows updated below.

## 2026-10-24 backlog item `driver-trip-detail-refresh` — screen `591699f3` refreshed & integrated into `/driver/trip/:jobId`

Design side (done upstream, 1 generation): Stitch edit of `591699f3` produced refreshed screen **`98648447567740749b708244dbda03fe`** "Driver Trip Detail — TruckOpti" (MOBILE, 780×2808; journaled artifact `…stitch-mcp-state\artifacts\10636db1\…\projects_…_591699f3….2026-10-24T03-52-09-822Z.json`). Integration adapted the artifact's layout intent to the live 7-step page — **0 Stitch calls from this integration, 0 mutations**; repo tokens/terminology kept; the flow logic (TO-129/TO-130 progress RPC, TO-142 signed-URL photos) is untouched.

### What changed on `frontend/src/pages/DriverTripPage.tsx`

| Artifact intent | App implementation |
|---|---|
| Labelled back button, 44px | Back button now `aria-label="Back to dashboard"`, 44×44px, focus-visible ring (was an unlabelled icon-only button — a §D2-class gap) |
| Real tel: support link | Already wired to `config/support.ts` (TO-139 §C3); bumped to a 44px target with focus ring |
| 7-step stepper: `aria-live` announcements + `aria-current="step"` | An sr-only `aria-live="polite"` paragraph announces "Step N of 7: <label>" on every step change; the active chip carries `aria-current="step"`; connectors `aria-hidden` |
| Mirrored OTP cards: linked input, hint, invalid, live error, gated Verify | Both OTP inputs now have `id` + `htmlFor` label links (contract strings "4-Digit OTP from Sender"/"Recipient" preserved — `jobOfferOtpContract.test.ts` stays green), `aria-describedby` → hint + error ids, `aria-invalid` when a rejection is showing, error text in an `aria-live="assertive"` container, Verify gated on 4 digits at 44px with focus rings. **New state:** server OTP_INCORRECT/OTP_LOCKED rejections (TO-130) now surface inline ("Incorrect OTP. N attempts remaining." / lockout copy) instead of only a vanishing toast — `handleProgressRejection` sets the live-region error |
| Photo cards: take/retake, uploading, signed-URL caption, photo-gated actions | Take/Retake buttons 44px with focus rings; hidden file inputs labelled; preview images keep their alt text; **new caption** when a preview exists: "Stored in the secure private trip-photos bucket; the preview uses a fresh signed URL." (TO-142 honesty); primary actions remain photo-gated |
| GPS panel: icon+label chip, message, last sync | Chip now pairs an icon with the label via a `GPS_STATUS_CHIPS` map (Active tracking / Starting / Attention needed / Idle — never color alone); amber-700-on-amber-100 = 4.51:1 AA; message and last-sync timestamp unchanged |
| States | Loading is `role="status"` + `aria-busy` + sr-only text; trip-not-found message is `role="alert"`; submitting/disabled states kept; all step CTAs ≥44px with the shared `FOCUS_RING` |

- **Proof run this round (from `frontend/`):** `npx vitest run src/pages/DriverTripPage.test.ts src/services/jobOfferOtpContract.test.ts` → **15/15 passed** (trip page 9/9 — new file covering busy loading, not-found alert, labelled back + tel support, step announcer/aria-current, labelled+gated pickup OTP through Verify, server OTP rejection → inline announced error with cleared input and `aria-invalid`, GPS no-geolocation failure with the labelled chip, labelled delivery OTP, delivered completion; OTP contract 6/6 — the source pins survived the edit). `npx tsc --noEmit` → exit 0. `npx eslint src/pages/DriverTripPage.tsx src/pages/DriverTripPage.test.ts --max-warnings 0` → exit 0.
- **NOT run this tier:** browser pass at 390×844/1280×900 — the local-first tier cannot render a signed-in approved-driver trip (cloud-credentialed driver journeys remain owner-gated per the TO-139 addendum); camera capture (`capture="environment"`) and real geolocation watchers are device capabilities not exercisable in jsdom or this tier. Realtime/RPC behavior against hosted Supabase is covered by the TO-130 DB batteries, not re-run here.
- Rubric row for `591699f3` (§5): generated scores retained; the app implementation now carries the A=1/R=1 mitigations. §1/§2/§3/§6 rows updated below.

## 2026-10-24 backlog item `driver-app-home-refresh` — screen `05bf2a23` refreshed & integrated into `/driver/dashboard`

Design side (done upstream, 1 generation): Stitch edit of `05bf2a23` produced refreshed screen **`96715dd2b8cd45abb568e27cbf384498`** "Driver App Home" (MOBILE, generated 2026-10-24T03:22:02Z; journaled artifact `…stitch-mcp-state\artifacts\10636db1\…\projects_…_05bf2a23….2026-10-24T03-22-02-566Z.json`). Integration (this section) adapted the artifact's layout intent to the live page — **0 Stitch calls from this integration, 0 mutations**; the HTML was never pasted wholesale; repo tokens/terminology kept ("View Trip" retained, app slate/emerald palette).

### What changed on `frontend/src/pages/DriverDashboardPage.tsx`

| Artifact intent | App implementation |
|---|---|
| Header: name, verified chip, star rating, support quick icon | New driver header card: `full_name` + "Verified" chip (approved only), "★ rating · N trips" line, and a real `tel:+919999352050` quick action (44×44px, `SUPPORT_PHONE_TEL` from `frontend/src/config/support.ts`) |
| Online/offline switch: `role="switch"`, `aria-checked`, labelled, ≥48px target, "Updating status…" | Toggle is now `role="switch"` with dynamic `aria-checked` and `aria-label` "Go offline"/"Go online", 76×48px target, `disabled` + "Updating status…" copy while the request runs |
| Dominant offer sheet: countdown, labelled Decline/Accept ≥48px, focus rings | Offer sheet is `role="dialog"` + `aria-modal` + `aria-labelledby="job-offer-dialog-title"`; countdown carries `role="timer"` + "N seconds left to respond"; Decline/Accept have `aria-label="Decline job offer"`/`"Accept job offer"` and `min-h-[48px]` |
| Active trip card: View Trip + Support | "View Trip" kept (repo terminology, → `/driver/trip/:active_job_id`); Support converted from the fake `toast.success('Calling customer support...')` button (a buttons-to-nowhere) to a real 48px `tel:` link from the shared support config — same fix pattern as TO-139 §C3 on the trip page |
| Today's stats row | "Trips" label renamed "Delivered" (it already counted only `delivered_at`-today trips) |
| Recent trips: icon+label status chips, never color alone | Status chips now pair an icon with the text via a `TRIP_STATUS_CHIPS` map (delivered/accepted → check, declined → cancel, expired/other → clock); chip color pairs verified ≥AA (green-700/green-100 4.57:1, red-700/red-100 5.30:1, slate-600/slate-100 6.92:1) |
| State coverage + Retry | New honest load-error state: a failed profile fetch used to masquerade as "No Driver Profile Found"; now `loadError` renders a `role="alert"` card ("Couldn't load your dashboard") with a ≥44px Retry that re-runs the load. Loading spinner is `role="status"` + `aria-busy` + sr-only text; pending/rejected/suspended banners carry `role="status"`; online-waiting (no offers) state carries `role="status"` |
| Focus-visible rings everywhere | Shared `FOCUS_RING` constant applied to all interactive controls incl. the previously unlabelled withdrawal-modal ✕ (now `aria-label="Close withdrawal dialog"`, 44×44px) and both dialogs got `role="dialog"`/`aria-modal`/`aria-labelledby` |

- **Proof run this round (from `frontend/`):** `npx vitest run src/pages/DriverDashboardPage.test.ts` → **10/10 passed** (2 pre-existing TO-129 + 2 response-states + 6 new: busy loading region, switch semantics + flip through `setDriverOnlineStatus`, error→Retry recovery, offer dialog/timer/named actions, header name+rating+Verified, both `tel:` links); first run 9/10 — the error test asserted the heading inside the `[role="alert"]` paragraph, fixed to assert paragraph + sibling `h2`. `npx tsc --noEmit` → exit 0 (first run flagged the `waitForElement` null-narrowing and 2 unused vars — fixed). `npx eslint src/pages/DriverDashboardPage.tsx src/pages/DriverDashboardPage.test.ts --max-warnings 0` → exit 0.
- **NOT run this tier:** browser pass at 390×844/1280×900 — the local-first tier cannot sign in as an approved driver (no cloud backend; driver routes render only in denied/no-profile state per the TO-139 addendum), and cloud-credentialed driver journeys remain owner-gated. The six new DOM-level tests cover the wired states/semantics in jsdom instead. Realtime delivery of offers (Supabase channel) is also not exercisable in this tier; the subscription code path is unchanged from TO-129/TO-130.
- Rubric row for `05bf2a23` (§5): generated scores retained; the app implementation now carries the accessibility/state/responsive mitigations the refresh brief required. §1/§2/§3/§6 rows updated below.

## 2026-10-24 backlog item `wcag-aa-contrast-fixes-shipment-agency-jobs` — WCAG AA contrast repair (code-only, no Stitch)

Three light-mode contrast failures on the TO-143-D1 command/consent panels, recomputed this run with the WCAG 2.x relative-luminance formula and repaired in code (**0 Stitch calls, 0 mutations**; route-level screens unchanged — these are implemented panels on `/booking/new` and `/agency/jobs`):

| # | Surface | Before | After |
|---|---|---|---|
| 1 | `NewShipmentPage.tsx:346-348` — authorization success copy (`role="status"`) | `text-green-600` on white = **3.30:1** | `text-green-700` = **5.02:1**; `dark:text-green-400` kept (8.40:1 on `dark:bg-slate-800`) |
| 2 | `AgencyJobsPage.tsx:383` — Authorizations empty state (white card) | `text-slate-400` on white = **2.56:1** | `text-slate-600 dark:text-slate-400` = **7.58:1** light / **5.71:1** dark |
| 3 | `AgencyJobsPage.tsx:394` — grant date on the `bg-slate-50` authorization row (`:389`; the ask cited `:387`, the container — file drifted) | `text-slate-400` on `bg-slate-50` = **2.45:1** | `text-slate-600 dark:text-slate-400` = **7.24:1** light / **4.83:1** dark on the `dark:bg-slate-700/50` row |

All AA-normal-text thresholds now met (≥4.5:1). Scope note: other bare `text-slate-400` instances remain elsewhere in `AgencyJobsPage` (`:429`, `:449`, `:472`, `:635`, `:660` + the `:656` spinner icon) — they were **not** part of the three verified failures in this item and are left untouched as owner-selectable polish.

- **Contract test (new):** `frontend/src/pages/wcagContrastContract.test.ts` — implements the luminance/ratio math, reproduces the three recorded failures as below-AA (`toBeCloseTo` 3.30 / 2.56 / 2.45), asserts the repaired pairs (light + dark) meet 4.5:1, and pins the class tokens in both page sources (boundary-guarded negatives so the preserved `dark:` variants stay legal; the grant-date pin anchors on the "Authorized" copy to survive line drift, the same drift the ask itself hit).
- Proof run this round (from `frontend/`): `npx vitest run src/pages/wcagContrastContract.test.ts` → **5/5 passed** (first run 4/5 — the initial `not.toContain('text-slate-400 mt-3')` negative matched the tail of my own `dark:text-slate-400 mt-3` replacement; fixed with the boundary guard); `npx tsc --noEmit` → exit 0; `npx eslint src/pages/wcagContrastContract.test.ts src/pages/NewShipmentPage.tsx src/pages/AgencyJobsPage.tsx --max-warnings 0` → exit 0. Contrast ratios printed via node one-liner: values as in the table.
- Generated-screen rubric rows for `141531b6` (New Shipment Booking) and `a8b23ee2` (Agency Dispatch Board) are **unchanged** — §5 scores the generated HTML, not the app implementation (same precedent as the `e72905ba` note). Coverage/button/API maps are unaffected: no routes, actions, or API calls changed.

## 2026-10-23 backlog item `driver-job-offer-acceptance` — screen `202377b7` RETIRED (retrieve-only, code-only)

This closes backlog §6 P0 #1 in its corrected form: the audit's "dead end / build `/driver/job-offer/:offerId`" premise was **superseded in code by TO-129/TO-130** — offer acceptance is live on `/driver/dashboard` and lands on the existing `/driver/trip/:jobId` flow. The item became a retrieve-only diff of screen `202377b7` against the live flow, then edit-or-retire. **Decision: RETIRE** (doc-level; no screen deletion via Stitch, **0 Stitch calls, 0 mutations, 0 retries** — the HTML was read from the journaled audit artifact `.stitch-mcp/scratch/audit/202377b7233d4772adbe6745d5d00e2f.html`, 12,454 bytes, generated 2026-09-19; no live re-fetch, and the payload has no update-time field so drift cannot be excluded).

### Diff: screen `202377b7` ("Job Offer - Driver App", MOBILE) vs the live flow

| Aspect | Screen `202377b7` (generated HTML) | Live app (implemented) |
|---|---|---|
| Placement | Standalone full-screen page with its own header and close button (`202377b7…html:122-130`) | Inline bottom-sheet modal over `/driver/dashboard` (`frontend/src/pages/DriverDashboardPage.tsx:472-545`); no offer route exists (`frontend/src/App.tsx:168-169` defines only `/driver/dashboard` and `/driver/trip/:jobId`) |
| Expiry | Static text "OFFER EXPIRES IN 01:59" (`…html:136`) | Per-second countdown derived from `expires_at`, auto-dismiss at zero with pending-offer re-hydration (`DriverDashboardPage.tsx:317-340`), realtime `job_offers` subscription (`:257-296`) and focus hydration (`:298-315`) |
| Offer payload | Fabricated fields: ₹45,000 hero payout, 984 km distance, "Steel Coils" cargo, "32ft Multi-Axle" required vehicle, pickup/drop date-times (`…html:139-203`) | The `job_offers` select carries only origin/destination/total_weight/estimated_cost (`frontend/src/services/customerSupabaseApi.ts:725-737`); distance/cargo/required-vehicle do not exist in the data contract |
| Accept action | Terminal "Accept Job" — the design ends at accept (`…html:206-217`) | Accept → single atomic `respond_to_job_offer` RPC (`customerSupabaseApi.ts:808-831`) → success toast → navigate `/driver/trip/:jobId` (`DriverDashboardPage.tsx:360-385`) |
| OTP | None designed | 4-digit contract locked by `frontend/src/services/jobOfferOtpContract.test.ts` (page inputs + migration `20260601223849` trigger/CHECKs) and implemented as pickup/delivery steps |
| Downstream | None | 7-step trip flow navigate → pickup OTP → load photo → in transit → delivery OTP → proof photo → done (`frontend/src/pages/DriverTripPage.tsx:55-65`) |
| States | One happy state | Responding/disabled buttons (`DriverDashboardPage.tsx:527,535`), decline, expiry auto-dismiss, and a bounded server-rejection message map (`customerSupabaseApi.ts:704-714`) |
| Look & feel | Material-style token palette, amber accept (`…html:213`) | App slate/emerald Tailwind tokens, green accept |

**Why retire, not edit:** the journey the screen designed is shipped through a different interaction model (ephemeral card → atomic response → 7-step trip page), the screen has no route and no consumer, and editing it to mimic the shipped flow would create a zero-consumer mock of working software. Precedent: the `bc073b70` stale-husk retirement (§2, §6 #8). The screen's rubric score is retained as generated and annotated retired (§5); the inventory and orphan rows are annotated (§1, §2). Also confirmed: the `jobOfferOtpContract` *service file* no longer exists — only the contract test remains, with no importers (`grep -rn jobOfferOtpContract frontend/src` matches the test file only).

### Proof run this round

- New wiring tests in `frontend/src/pages/DriverDashboardPage.test.ts` (response-states describe): (1) a rejected `respondToJobOffer` surfaces the bounded message ("This job offer has expired.") via toast, calls the RPC exactly once with `accept=true`, never navigates, and dismisses the offer card; (2) acceptance with `activeJobId: null` falls back to the incoming offer id and still navigates to `/driver/trip/offer-777`.
- `npx vitest run src/pages/DriverDashboardPage.test.ts src/services/jobOfferOtpContract.test.ts` (from `frontend/`) → **2 files, 10/10 passed** (dashboard: 4 = 2 pre-existing TO-129 + 2 new; OTP contract: 6).
- `npx tsc --noEmit` (from `frontend/`) → exit 0. `npx eslint src/pages/DriverDashboardPage.test.ts --max-warnings 0` → exit 0 (hygiene, not a named gate).
- NOT run this item: browser pass (no UI source changed — tests + docs only; the live offer UI's browser evidence remains the TO-129/TO-130 acceptance record) and any hosted-backend round-trip.

## 2026-10-10 TO-144-D1 fleet-foundation state wiring (no design generation)

Minimal state wiring on two EXISTING agency routes — no new routes, no visual redesign, no Stitch generation, no stitch_* mutation (mutations 0; retries 0; no new screens):

- **AgencyFleetPage** (`frontend/src/pages/AgencyFleetPage.tsx`): fleet list now loads over the RLS path (`agencyFleetApi.listVehicles()` — the legacy Edge `list()` stays exported and untouched), and commands run through the typed RPCs (`createVehicle` on the add form with insurance/fitness/permit/PUC dates; `updateVehicle` via a per-vehicle availability toggle). Five distinct states, each with a `data-testid` hook: loading (`fleet-loading`), empty (`fleet-empty`), retryable load error (`fleet-error` with Retry), success rows (`fleet-vehicle-card`, now showing payload/body dims, PUC chip and Maintenance/Available/On Trip status), and denied (`fleet-denied`, `role="alert"` — rendered for controlled agency denials: approval-required / agency-profile resolution). Expected-version conflict path: a `{ok:false,error:'version_conflict'}` result triggers exactly ONE list refetch and ONE conflict toast ("updated elsewhere. Showing the latest version.") — never an auto-retry; create replay returns the distinct "already in your fleet" copy. Form labels now carry `htmlFor`/`id` associations (fleet-vehicle-type/-rc-number/-insurance/-fitness/-permit/-puc); the toggle carries a full aria-label (action + vehicle + RC).
- **AgencyDriversPage** (`frontend/src/pages/AgencyDriversPage.tsx`): the existing Edge snapshot (drivers/trucks, agency-portal-drivers) is untouched; an additive "Employment Records" panel lists RLS-scoped `agency_driver_employment` rows (licence number/class/expiry chip with expiry coloring, contact) with an "End Employment" command running `agencyDriversApi.endEmployment(employmentId, expectedVersion)`. Same five states (`drivers-loading` / `employments-empty` / `drivers-error` with Retry / `employment-card` / `drivers-denied`); the end command has the same single-refetch conflict handling ("changed elsewhere. Showing the latest version.") and `already_ended` replay copy. Driver invitation/creation UI stays out of scope (TO-144-D2).
- Authority: migration `20261008000000_agency_fleet_foundation.sql` (policy rewrite, catalog FK, `agency_driver_employment`, five SECURITY DEFINER command RPCs, two eligibility predicates); services in `frontend/src/services/agencyPortalApi.ts` (controlled denial message map + `isAgencyDenial` predicate; raw provider errors are redacted to stable fallbacks). Edge functions agency-portal-fleet/-drivers remain live and untouched.
- Proof run this round: red-first battery `scripts/agency_fleet_foundation.db.test.mjs` 0/32 red → 32/32 green (PGlite full-chain replay), vitest 584/584 (17 new service tests incl. conflict-branch and redaction pins), lint 0, build (tsc) 0, scripted browser pass **46/46 at BOTH 390×844 and 1280×900, 0 console errors, 0 page errors** (`agent-results/browser-evidence/to144-d1-browser-pass.mjs`, results JSON + 28 screenshots with the `to144-` prefix, untracked): all five states on both pages, create/created + idempotent-replay, end/ended + already_ended, both conflict paths (single call + single refetch asserted via route counters), both denial banners, retry recovery, and selected-Hindi rendering (fleet/driver surfaces are English strings; the hi selection renders without crash — no new Hindi strings added, consistent with the TO-143-D1 posture). NOT verified in this tier: hosted Supabase round-trips (RLS/RPC stay proven by the PGlite battery), keyboard-walk transcripts on the new controls (native buttons/inputs only; no custom widgets), programmatic contrast measurement (historical contrast sample below stays open). Backend screen designs remain reuse candidates; no new Stitch designs were generated for these states.

## 2026-10-07 TO-143-D1 consent-writer command wiring (no design generation)

Minimal command wiring only — no new routes, no visual redesign, no Stitch generation, no browser audit rerun (mutations 0; retries 0):

- **NewShipmentPage success panel** (`frontend/src/pages/NewShipmentPage.tsx`): one "Authorize an agency" control (uuid input + submit + inline success/error status). State mapping: idle → Authorizing… → granted / reactivated / already_active success copy, or the controlled server rejection verbatim (self-grant, approval-required, not-open-for-dispatch, not-found); client-side uuid shape validation. The agency id travels out-of-band (customers cannot list agencies — 'Agencies: own record'); agency discovery stays with TO-144. Revoke ships RPC-only in delivery 1 (explicit supervisor acceptance; no UI surface).
- **AgencyJobsPage** (`frontend/src/pages/AgencyJobsPage.tsx`): an "Authorized Shipments" panel listing the agency party's `shipment_agency_consents` rows as shipment uuid + grant date ONLY (shipments RLS is owner-only), each with fare entry + "Create Job" running the DIRECT supabase client (`agencyJobsApi as agencyJobsDirectApi` alias import — the dual-export trap is pinned by a unit-test regression guard). States: empty-copy when no authorizations, per-row submitting state, success toast + list refresh, typed already-exists info toast (SQLSTATE 23505 mapping in the service), error toast with the server message.
- Authority: `authorize_agency_for_shipment` / `revoke_agency_for_shipment` SECURITY DEFINER RPCs (migration `20261007120000_consent_writer_and_job_command.sql`); job creation is the agency's own RLS INSERT re-validated by the consent+status policies.
- Proof run this round: vitest unit 98/98 (incl. alias-binding guard), `npm run lint` exit 0, `npm run build` exit 0, DB batteries dispatch 50/50 + customer 30/30 + admin 57/57 (G8 audit) + trip 21/21, all exit 0 on PGlite. **NOT yet verified at that time: real-browser rendering at mobile 390×844 and desktop 1280×900 and keyboard navigation on the two wired controls — owner/supervisor-gated browser pass before acceptance. CLEARED 2026-10-08, see the browser-pass closure below.** No Hindi strings added (command wiring only); existing audit below remains the historical evidence.
- Round-2 verification addendum (2026-10-08, source-level only): the agency-id input on NewShipmentPage now carries a proper `htmlFor`/`id` label association (it previously had no accessible name), and the AgencyJobsPage authorizations panel surfaces fetch failures with a visible `role="alert"` error instead of reading as empty. Full gate sweep re-run green (vitest 567/567, lint/build 0, dispatch 52/52). The real-browser pass was executed after this addendum — closure below.
- Browser-pass closure (2026-10-08, supervisor acceptance of TO-143-D1): headless Playwright on `npm run dev` (vite :5173) at HEAD `b362e83e`, mocks on `https://localhost.invalid` (`frontend/src/lib/authCapabilities.ts:47`); **verdict PASS — 58/58 scripted checks at BOTH 390×844 and 1280×900**, covering rendering, keyboard-only authorize (Tab→type→Enter) and keyboard-only job create, the `htmlFor`/`id` label association, submitting/disabled states, all grant-state copy, 23505 already-exists and error toasts, double-submit suppression, and empty/zero-fare guards. 20 screenshots + per-step evidence JSON under `agent-results/browser-evidence/` (untracked); 10 console errors observed are the intentional 400/409 error-state exercises, no page errors. Still not exercisable in this tier (recorded, not failed): hosted Supabase round-trips (RLS/RPC stay proven by the PGlite batteries), the revoke RPC (RPC-only, no UI), programmatic contrast measurement (not part of the 58 checks; the historical contrast sample below stays open). Evidence: supervisor acceptance addendum in `agent-results/033-result.md`.

## 2026-10-06 pilot planning alignment (documentation only)

Current requirements and pending product screens: [PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md), sections 4–5. Execution: [TASKS.md](../TASKS.md), TO-142–153. Existing designs/routes below are reuse candidates, not proof of connected transport operations. New pilot surfaces cover memberships/sites, planning/allocations, GR QR/POD, incidents, expenses/fuel, freight collections/payroll, ERP and platform operations.

Historical October 6 SQL proofs reproduced foreign agency claims, suspended writes/assignment guards, missing booking producer, absent delivery propagation, foreign usage RPCs and public billing files. October 7 recheck of the uncommitted TO-142 candidate: dispatch 42/42 and customer 28/28, 0 findings; admin 56/56 with only G4 invoice display-source finding. Candidate private-link UI consumers were changed by another writer, but no new browser/Storage/Edge or Stitch verification was performed in this documentation update. Review/integrate the candidate and prove its runtime behavior before closing the affected product gaps. D1 cloud/local honesty, D2 accessibility and selected Hindi driver journeys remain open.

No routes/visual designs changed, no browser audit rerun, and no Stitch projects/screens mutated in this assessment (mutations 0; retries 0; no new IDs/screenshots). Existing audit below remains historical evidence. Before the first implementation screen, follow current stitch_status/stitch_guide and repository audit rules; record real action/API and mobile/desktop proof.

Date: 2026-09-19 · Project: Stitch `projects/817968552986251880` ("TruckOpti: India's Logistics Operating System") · Adapter 0.2.0 · Read-only audit (zero mutations).

## Method & sources

- **Screens:** one `stitch_list_screens` call (journaled artifact `…stitch-mcp-state\artifacts\10636db1\817968552986251880\screen.2026-09-19T14-36-43-725Z.json`, 111,696 bytes) + one `stitch_get_screen` for `e72905bab5794849b0fcb495b7c474bc`. All 58 screen HTMLs downloaded to `.stitch-mcp/scratch/audit/*.html` (1.19 MB) and scored by script (`signals.js`, `score.js` — kept for re-runs).
- **Repo:** `frontend/src/App.tsx` (56 routes), `src/layouts/*`, `src/services/*` (API families), page-level navigation/API greps for the customer and driver journeys.
- **Deviations from the `stitch_guide` workflow:** (1) the `stitch_guide` tool is not exposed in this session (known adapter-discovery gap; skill says "prefer `stitch_guide` when exposed"), so the six rubric criteria are declared explicitly in §5 instead of quoted from section 8; (2) the list payload carries **no update-time field**, so the inventory's "Updated" column is n/a; (3) **`stitch_list_screens` under-reports: it returns 57 screens while `stitch_get_screen` still fetches `e72905bab5794849b0fcb495b7c474bc`** (generated 2026-09-19 07:40 UTC). Treat the list as eventually-inconsistent; this audit uses 58 screens.

---

## 1. Screen inventory (58)

ids are 8-char tails of `projects/817968552986251880/screens/<id>`; full ids in `.stitch-mcp/scratch/audit/inventory.json`.

| Screen id (8-char tail) | Title | Device | HTML bytes | Updated |
|---|---|---|---|---|
| `5141ba81` | Admin Health Dashboard | DESKTOP | 27166 | n/a (payload has no update time) |
| `34b07dd7` | Admin: Agency Management Hub | DESKTOP | 25852 | n/a (payload has no update time) |
| `499ab4be` | Admin: Driver Detail & Compliance Review | DESKTOP | 22893 | n/a (payload has no update time) |
| `595aec8e` | Admin: Driver Management Hub | DESKTOP | 21949 | n/a (payload has no update time) |
| `d9fafd06` | Admin: KYC Verification Detail | DESKTOP | 26721 | n/a (payload has no update time) |
| `e27cd905` | Admin: Payout Management & Triage | DESKTOP | 24877 | n/a (payload has no update time) |
| `c6441e5d` | Admin: Settlement Reconciliation | DESKTOP | 23598 | n/a (payload has no update time) |
| `52aa57b7` | Admin: Subscription Management | DESKTOP | 26554 | n/a (payload has no update time) |
| `142aa41c` | Admin: Support & Contact Inbox | DESKTOP | 25265 | n/a (payload has no update time) |
| `c16aa8ef` | Admin: User Management Hub | DESKTOP | 21919 | n/a (payload has no update time) |
| `a8b23ee2` | Agency Dispatch Board | DESKTOP | 24948 | n/a (payload has no update time) |
| `e18e7ca3` | Agency Operations Dashboard | DESKTOP | 26077 | n/a (payload has no update time) |
| `efa6bcef` | Agency Registration — TruckOpti | DESKTOP | 18153 | n/a (payload has no update time) |
| `76d2e9e6` | Agency: Billing & Financials Hub | DESKTOP | 22576 | n/a (payload has no update time) |
| `f5ac1529` | Agency: Driver Roster & Management | DESKTOP | 27798 | n/a (payload has no update time) |
| `2f54d59c` | Agency: Fleet Management & Vehicle Status | DESKTOP | 23700 | n/a (payload has no update time) |
| `05b1da56` | Agency: Rate Card Management | DESKTOP | 24237 | n/a (payload has no update time) |
| `c7700d0d` | Auth Callback — TruckOpti | DESKTOP | 11042 | n/a (payload has no update time) |
| `f1185d19` | Checkout — TruckOpti | DESKTOP | 17213 | n/a (payload has no update time) |
| `cd34b109` | Company Profile & GST Settings | DESKTOP | 20851 | n/a (payload has no update time) |
| `6ed56451` | Contact & Support — TruckOpti | DESKTOP | 18686 | n/a (payload has no update time) |
| `0b4d18c8` | Contact Support - TruckOpti | DESKTOP | 18678 | n/a (payload has no update time) |
| `37a00a15` | Customer Dashboard | DESKTOP | 24684 | n/a (payload has no update time) |
| `6d6286d4` | Customer Master — TruckOpti | DESKTOP | 22423 | n/a (payload has no update time) |
| `fc97f63d` | Customer Team & Branch Management - TruckOpti | DESKTOP | 24578 | n/a (payload has no update time) |
| `0afcac09` | Customer Tracking Control Center - TruckOpti | DESKTOP | 25577 | n/a (payload has no update time) |
| `141531b6` | Customer: New Shipment Booking | DESKTOP | 16578 | n/a (payload has no update time) |
| `05bf2a23` | Driver App Home **(refreshed 2026-10-24 → screen `96715dd2b8cd45abb568e27cbf384498`; integrated — see top section)** | MOBILE | 15726 | n/a (payload has no update time) |
| `3c30c0e5` | Driver Registration — TruckOpti | DESKTOP | 14842 | n/a (payload has no update time) |
| `591699f3` | Driver Trip Detail - TruckOpti **(refreshed 2026-10-24 → screen `98648447567740749b708244dbda03fe`; integrated — see top section)** | MOBILE | 16363 | n/a (payload has no update time) |
| `180752ea` | Driver: Delivery & Proof **(refreshed 2026-10-24 → screen `c241f6c1673b45e6b3eabb0fa05f7993`; integrated — see top section)** | MOBILE | 13157 | n/a (payload has no update time) |
| `e72905ba` | Driver: Documents & KYC Upload | MOBILE | 22138 | n/a (payload has no update time) |
| `202377b7` | Driver: New Job Offer **(RETIRED 2026-10-23 — see top section)** | MOBILE | 12454 | n/a (payload has no update time) |
| `b54728a4` | Driver: Pickup Workflow | MOBILE | 15954 | n/a (payload has no update time) |
| `efcc993e` | Earnings & Wallet — TruckOpti | MOBILE | 16256 | n/a (payload has no update time) |
| `b1b215f2` | Forgot Password — TruckOpti | DESKTOP | 11746 | n/a (payload has no update time) |
| `9f6e7777` | Growth & Sales Account Workspace - TruckOpti | DESKTOP | 22525 | n/a (payload has no update time) |
| `8db564ce` | Help Center - TruckOpti | DESKTOP | 22185 | n/a (payload has no update time) |
| `d7e58516` | Login — TruckOpti | DESKTOP | 14545 | n/a (payload has no update time) |
| `812ce430` | Management Hub - TruckOpti | DESKTOP | 23028 | n/a (payload has no update time) |
| `d8615375` | OTP Verification — TruckOpti | DESKTOP | 12523 | n/a (payload has no update time) |
| `e4a2980a` | Packing Optimizer — TruckOpti | DESKTOP | 20881 | n/a (payload has no update time) |
| `f0e5cc94` | Partner Webhook Logs - TruckOpti | DESKTOP | 23614 | n/a (payload has no update time) |
| `1e1497ab` | Payment Success - TruckOpti | DESKTOP | 11935 | n/a (payload has no update time) |
| `28d39c9a` | Pricing Options | DESKTOP | 21244 | n/a (payload has no update time) |
| `399e6386` | Privacy Policy — TruckOpti | DESKTOP | 19831 | n/a (payload has no update time) |
| `4a7d8f66` | Profile - TruckOpti | DESKTOP | 18716 | n/a (payload has no update time) |
| `9360baca` | Public Landing Page | DESKTOP | 23037 | n/a (payload has no update time) |
| `07a60c72` | Reset Password — TruckOpti | DESKTOP | 11861 | n/a (payload has no update time) |
| `5f312d88` | Route Planner — TruckOpti | DESKTOP | 20106 | n/a (payload has no update time) |
| `08e898da` | Sale Orders — TruckOpti | DESKTOP | 22649 | n/a (payload has no update time) |
| `a89a0c1d` | Shipment History — TruckOpti | DESKTOP | 22330 | n/a (payload has no update time) |
| `d9c0586c` | Shipment Invoice — TruckOpti | DESKTOP | 19552 | n/a (payload has no update time) |
| `daab73c1` | Signup — TruckOpti | DESKTOP | 15463 | n/a (payload has no update time) |
| `89025628` | Terms of Service — TruckOpti | DESKTOP | 17933 | n/a (payload has no update time) |
| `0d032afa` | Trip History — TruckOpti Driver App | MOBILE | 15320 | n/a (payload has no update time) |
| `7479e1a8` | Truck Catalog - TruckOpti | DESKTOP | 21480 | n/a (payload has no update time) |
| `bc073b70` | TruckOpti - India's Logistics Operating System | DESKTOP | 52654 | n/a (payload has no update time) |

## 2. Coverage matrix — routes × auth × screen

Statuses: **COVERED** (one screen maps to the route) · **DUPLICATE** (≥2 screens map to one route) · **STALE** (superseded/empty design) · **MISSING** (no covering screen). "dev-only" gaps are accepted.

| Route | Auth scope | Covering screen(s) | Status |
|---|---|---|---|
| `/` | public | Public Landing Page `9360baca` | COVERED |
| — (landing dup) | — | TruckOpti – India's LOS `bc073b70` | STALE (46-char husk; superseded by `9360baca`) |
| `/auth/callback` | public | Auth Callback `c7700d0d` | COVERED |
| `/login` | public | Login `d7e58516` | COVERED |
| `/signup` | public | Signup `daab73c1` | COVERED |
| `/otp` | public | OTP Verification `d8615375` | COVERED |
| `/forgot-password` | public | Forgot Password `b1b215f2` | COVERED |
| `/reset-password` | public | Reset Password `07a60c72` | COVERED |
| `/pricing` | public | Pricing Options `28d39c9a` | COVERED |
| `/terms` | public | Terms of Service `89025628` | COVERED |
| `/privacy` | public | Privacy Policy `399e6386` | COVERED |
| `/contact` | public | Contact & Support `6ed56451` | COVERED |
| — (contact dup) | — | Contact Support `0b4d18c8` | DUPLICATE (byte-identical text content, 1,082 ch) |
| `/support` | auth | Contact & Support `6ed56451` (authenticated variant) | COVERED |
| `/checkout` | auth | Checkout `f1185d19` | COVERED |
| `/payment/callback` | public | Payment Success `1e1497ab` | COVERED (pending/failure states undesigned — note) |
| `/payment/success` | public | Payment Success `1e1497ab` | COVERED |
| `/subscription` | auth | — | **MISSING** (customer subscription management has no design) |
| `/driver/register` | public | Driver Registration `3c30c0e5` | COVERED (device mismatch: DESKTOP design for a mobile-first signup) |
| `/agency/register` | public | Agency Registration `efa6bcef` | COVERED |
| `/dashboard` | user | Customer Dashboard `37a00a15` | COVERED |
| `/booking/new` | user | Customer: New Shipment Booking `141531b6` | COVERED |
| `/packing` | user | Packing Optimizer `e4a2980a` | COVERED |
| `/routes` | user | Route Planner `5f312d88` | COVERED |
| `/tracking` | user | Customer Tracking Control Center `0afcac09` | COVERED |
| `/history` | user | Shipment History `a89a0c1d` | COVERED |
| `/invoice/:shipmentId` | user | Shipment Invoice `d9c0586c` | COVERED |
| `/profile` | user | Profile `4a7d8f66` | COVERED (drivers are linked here from Driver Profile — cross-role, see §3) |
| `/settings/company` | user | Company Profile & GST Settings `cd34b109` | COVERED |
| `/management` | user | Management Hub `812ce430` | COVERED |
| `/management/trucks` | user | Truck Catalog `7479e1a8` | COVERED |
| `/management/cartons` | user | — | **MISSING** |
| `/management/customers` | user | Customer Master `6d6286d4` | COVERED |
| — (customer dup) | — | Customer Team & Branch Mgmt `fc97f63d` | DUPLICATE (no distinct route; overlaps `/management/customers`) |
| `/sale-orders` | user | Sale Orders `08e898da` | COVERED |
| `/admin` | admin | Admin Health Dashboard `5141ba81` | COVERED (title↔page mapping assumed; verify intent) |
| `/admin/drivers` | admin | Admin: Driver Management Hub `595aec8e` | COVERED |
| `/admin/drivers/:id` | admin | Admin: Driver Detail `499ab4be` + Admin: KYC Verification Detail `d9fafd06` | DUPLICATE (detail page + KYC review; the KYC screen was the terminology source for `e72905ba`, not a 1:1 page) |
| `/admin/agencies` | admin | Admin: Agency Management Hub `34b07dd7` | COVERED |
| `/admin/payouts` | admin | Admin: Payout Management & Triage `e27cd905` | COVERED |
| `/admin/contact` | admin | Admin: Support & Contact Inbox `142aa41c` | COVERED |
| `/admin/users` | admin | Admin: User Management Hub `c16aa8ef` | COVERED |
| `/admin/subscriptions` | admin | Admin: Subscription Management `52aa57b7` | COVERED |
| `/driver/dashboard` | driver | Driver App Home `05bf2a23` (refreshed → `96715dd2b8cd45abb568e27cbf384498`) | COVERED (MOBILE ✔; refresh integrated 2026-10-24 — top section) |
| `/driver/trip/:jobId` | driver | Driver Trip Detail `591699f3` (refreshed → `98648447567740749b708244dbda03fe`) + Driver: Pickup Workflow `b54728a4` + Driver: Delivery & Proof `180752ea` (refreshed → `c241f6c1673b45e6b3eabb0fa05f7993`) | DUPLICATE (one page implements both stage flows; stage screens are sub-flows; both refreshes integrated 2026-10-24 — top sections) |
| `/driver/earnings` | driver | Earnings & Wallet `efcc993e` | COVERED (device mismatch: DESKTOP design for a driver screen) |
| `/driver/history` | driver | Trip History `0d032afa` | COVERED (MOBILE ✔) |
| `/driver/profile` | driver | — | **MISSING** (no driver-profile design) |
| `/driver/kyc` | driver | Driver: Documents & KYC Upload `e72905ba` | COVERED (integrated 2026-09-19, `d66f10db`) |
| `/agency/dashboard` | agency | Agency Operations Dashboard `e18e7ca3` | COVERED |
| — (agency dup) | — | Agency Dispatch Board `a8b23ee2` | DUPLICATE (could equally be the `/agency/dashboard` design; ambiguous) |
| `/agency/fleet` | agency | Agency: Fleet Management `2f54d59c` | COVERED |
| `/agency/jobs` | agency | Agency Dispatch Board `a8b23ee2` | COVERED (ambiguous pairing — verify intent) |
| `/agency/billing` | agency | Agency: Billing & Financials Hub `76d2e9e6` | COVERED |
| `/agency/drivers` | agency | Agency: Driver Roster & Management `f5ac1529` | COVERED |
| `/agency/rates` | agency | Agency: Rate Card Management `05b1da56` | COVERED |
| `/agency/profile` | agency | — | **MISSING** |
| `/local-start` | dev-only | — | MISSING (accepted, dev tooling) |
| `/test-payment` | dev-only | — | MISSING (accepted, dev tooling) |
| `*` (404) | any | — | MISSING (accepted — NotFoundPage is utilitarian) |

### Orphan screens (no route consumes them)

| Screen | id | Assessment |
|---|---|---|
| Help Center | `8db564ce` | No `/help` route; candidate for a public help entry linked from footer/contact |
| Growth & Sales Account Workspace | `9f6e7777` | No matching route or page |
| Partner Webhook Logs | `f0e5cc94` | No matching route (admin-adjacent; no consumer) |
| Settlement Reconciliation | `c6441e5d` | No matching route (admin-adjacent; no consumer) |
| Customer Team & Branch Management | `fc97f63d` | No distinct route; overlaps `/management/customers` |
| TruckOpti – India's LOS landing | `bc073b70` | STALE husk (46 chars of text) |
| Contact Support | `0b4d18c8` | Identical content to `6ed56451`; keep one |
| Admin: KYC Verification Detail | `d9fafd06` | Intentional: terminology pairing for `e72905ba`; no 1:1 route |
| Driver: Pickup Workflow / Delivery & Proof | `b54728a4` / `180752ea` | Intentional: stage designs inside `/driver/trip/:jobId` |
| Driver: New Job Offer | `202377b7` | **RETIRED 2026-10-23** — routeless and superseded: the offer journey ships as the inline card on `/driver/dashboard` + the `/driver/trip/:jobId` flow (TO-129/TO-130); diff in the top section |

### Near-duplicate clusters

1. **Landing ×2** — `9360baca` (2,342 ch) vs `bc073b70` (46 ch husk). Keep `9360baca`, delete/retire `bc073b70`.
2. **Contact ×2** — `6ed56451` vs `0b4d18c8`: **identical 1,082-char text**. Pure duplicate.
3. **Agency dashboard ×2** — `e18e7ca3` (ops dashboard) vs `a8b23ee2` (dispatch board): overlapping purpose; needs an explicit route pairing decision.
4. **Customer master ×2** — `6d6286d4` vs `fc97f63d`: overlapping `/management/customers` scope.
5. **Admin KYC ×2** — `499ab4be` vs `d9fafd06` both map onto `/admin/drivers/:id` (defensible if KYC becomes its own tab/page).

## 3. Button & action map

### Customer journey

| Screen/page | Action | Target | Status |
|---|---|---|---|
| Landing `9360baca` | Sign Up / Get Started, Login, Pricing, Drivers, Agencies, Contact | `/signup`, `/login`, `/pricing`, `/driver/register`, `/agency/register`, `/contact` | OK |
| Landing | "Features" / "How it works" | `#features`, `#how-it-works` anchors | OK (in-page) |
| Login/Signup/OTP/Forgot/Reset | auth submit, OTP verify, reset | supabase.auth + `/auth/callback` | OK |
| Dashboard `/dashboard` | "New Booking" | `/booking/new` | OK |
| Dashboard | "Optimize Packing", "Plan Routes" | `/packing`, `/routes` | OK |
| Dashboard | Sale-order cards / "view all" (×3) | `/sale-orders` | OK |
| New Shipment `/booking/new` | estimate pricing | `/pricing` | OK |
| New Shipment | submit booking | `customerShipmentsApi` (shipments) → redirect `/tracking` | OK |
| New Shipment | cancel/back | `navigate(-1)` | OK |
| Tracking `/tracking` | "View invoice" | `/invoice/:shipmentId` | OK |
| Tracking | "Book another" | `/booking/new` | OK |
| Tracking | history item | `/tracking?shipment=:id` (from `/history`) | OK |
| Checkout `/checkout` | pay (Razorpay) | `initiateRazorpayPayment` → `verify-payment` edge → `/payment/success` | OK |
| Checkout | pay (PhonePe) | `initiatePhonePePayment` → `/payment/callback` (polls `phonepe-status`) | OK |
| Checkout | unauthenticated / no plan | redirect `/login`, `/pricing` | OK |
| Invoice | back to tracking; "complete your profile" | `/tracking`, `/settings/company` | OK |
| Shipment History | open tracking | `/tracking?shipment=:id` | OK |
| Profile | company settings | `/settings/company` | OK |
| Contact `/contact` | submit inquiry | `contact_inquiries` via `contactInquiry` service | OK |

**Customer dead ends: none found.** Notes: `/payment/callback` covers pending/success but no designed failure state; `/subscription` route exists without a design (nav reachability depends on plan state).

### Driver journey

| Screen/page | Action | Target | Status |
|---|---|---|---|
| Driver Register `/driver/register` | multi-step register | `driverSupabaseApi.register` → `/login?mode=driver` | OK |
| Driver App Home `/driver/dashboard` | online/offline toggle | `setDriverOnlineStatus` (drivers.is_online); `role="switch"` + `aria-checked` + labelled, 76×48px target (2026-10-24 refresh) | OK |
| Driver App Home | active-job card | `/driver/trip/:active_job_id` | OK |
| Driver App Home | active-job "Support" | real `tel:+919999352050` from `config/support.ts` (was a fake success toast; fixed 2026-10-24 refresh) — header carries the same tel quick action | OK |
| Driver App Home | "complete registration" (no profile) | `/driver/register` | OK |
| Driver App Home | incoming `job_offers` realtime events | inline bottom-sheet offer card → `respond_to_job_offer` → `/driver/trip/:jobId` | **RESOLVED (2026-10-23; TO-129/TO-130)** — offer arrives as an inline card with countdown, realtime subscription + focus hydration, accept/decline through the atomic RPC (`DriverDashboardPage.tsx:257-296,298-315,360-385,472-545`); screen `202377b7` retired (top section). Original DEAD END note superseded. |
| Driver Trip `/driver/trip/:jobId` | stage progression (arrived→loaded→in transit→delivered+POD) | `persist_driver_job_offer_progress` rpc + `driverTripsApi` | OK (2026-10-24 refresh: stepper announces steps via `aria-live` + `aria-current`; OTP inputs programmatically linked with live inline rejections; GPS chip icon+label; all controls ≥44px with focus rings) |
| Driver Trip | location tracking | `driverSupabaseApi.upsertLocation` (driver_locations) | OK |
| Driver Trip | delivery proof photo upload | `supabase.storage` → private `trip-photos` bucket + `persist_driver_job_offer_progress` (TO-142) | OK (2026-10-24 refresh: labelled capture/submit, signed-URL caption, failed-upload `role="alert"` banner with Retry Upload re-opening capture; completion photo-gated) |
| Driver Trip | "call support" | `tel:18001234567` — **hardcoded, unverified number** | **FLAG (P1)** buttons-to-nowhere risk if the number is not live |
| Driver Trip | back | `/driver/dashboard` | OK |
| Earnings `/driver/earnings` | balance snapshot, trips, withdraw | `driverEarningsApi.getBalanceSnapshot/getDeliveredTrips/requestPayout` (driver_payouts) | OK |
| Trip History `/driver/history` | filter + list | `driverTripsApi.getHistory` | OK |
| Driver Profile `/driver/profile` | doc "View" links | `dl_url`/`rc_url`/`insurance_url`/`selfie_url` or "Missing" | OK (missing docs render inert label — acceptable) |
| Driver Profile | "Earnings", "Trip History" quick actions | `/driver/earnings`, `/driver/history` | OK |
| Driver Profile | "Account Center", "Refresh Settings" | `/profile` (customer MobileLayout!) | **FLAG (P2)** — cross-role navigation leaves DriverLayout mid-session |
| Driver Profile | "Documents & KYC" | `/driver/kyc` + server KYC status badge (`driver-kyc` `state`) | OK (badge added 2026-10-03, TO-127) |
| Driver KYC `/driver/kyc` | uploads, submit | **real** since 2026-10-03 (TO-127): `driverKycApi` → `driver-docs` private bucket + `driver-kyc` edge (TO-126); server-authoritative states, dev-only demo, offline/auth denial | RESOLVED driver-side (P0 closed; admin-side loop tracked in §6 item 2 update) |

**Driver dead ends: 0 P0** (job-offer acceptance resolved 2026-10-23 — see the row above and the top section), **1 P1** (hardcoded support number — **fixed 2026-10-05**: `DriverTripPage` now reads `SUPPORT_PHONE_TEL`/`SUPPORT_PHONE_DISPLAY` from `frontend/src/config/support.ts`, `DriverTripPage.tsx:19,481-488`), **1 P2** (cross-role `/profile` links).

## 4. API map — endpoints ↔ screen actions

| API family (service) | Endpoints / tables | Consumed by (screens/actions) | Gaps |
|---|---|---|---|
| auth (`lib/supabase`) | supabase.auth | Login, Signup, OTP, Forgot/Reset, AuthCallback | — |
| shipments (`customerShipmentsApi` etc., 19×) | `shipments`, `invoices`, `ensure_shipment_document_numbers` rpc | New Shipment create; Tracking; History; Invoice | — |
| dashboard (`customerDashboardApi`, `packingJobsSupabaseApi`, `saleOrdersSupabaseApi`, `analyticsSupabaseApi`) | `packing_jobs`, `sale_orders`, `analytics_events` | Customer Dashboard cards/stats | — |
| tracking (`customerTrackingApi`, `notificationsSupabaseApi`) | `shipments`, `notifications`, `routes` | Tracking | — |
| payments (`razorpayPayment`, `phonepePayment`) | `verify-payment`, `phonepe-status` edges; `payment_history` | Checkout, PaymentCallback | failure-state design missing |
| subscription (`subscriptionApi`) | `subscription_plans`, `subscriptions`, `usage_tracking`, `check_usage_limit`/`increment_usage`/`has_active_subscription` rpcs | Checkout, `/subscription` | `/subscription` has **no design** |
| contact (`contactInquiry`) | `contact_inquiries` | Contact/Support | — |
| driver core (`driverSupabaseApi`) | `drivers` | DriverRegister, DriverProfile, DriverDashboard, DriverTrip | — |
| driver trips (`driverTripsApi`, `driverTripProgress`) | `job_offers`, `persist_driver_job_offer_progress` rpc, `driver_locations` | DriverTrip, DriverHistory, DriverDashboard (realtime) | RESOLVED — inbound offer acceptance UI is live (`respond_to_job_offer` via `driverDashboardApi`, `customerSupabaseApi.ts:808-831`; 2026-10-23 section) |
| driver earnings (`driverEarningsApi`) | `driver_payouts` | DriverEarnings | — |
| **driver KYC (`driverKycApi` + `driverKycDocuments`)** | `driver-kyc` edge (`state`/`upload`/`submit`/`review`/`access`; `state` accepts admin `driverId` since TO-128), `driver_kyc_documents` versioned rows, private `driver-docs` bucket (signed 60 s previews) | `/driver/kyc` uploads/review states/submit (TO-127, 2026-10-03); profile entry badge; **admin review on `/admin/drivers/:id`** (TO-128, 2026-10-03): per-document accept/reject via `reviewDocument`, `getDriverKycState` + `getDocumentAccessUrl` signed previews, 409-conflict state reload, approve-with-shortfall confirmation | RESOLVED both directions (P0 closed 2026-10-03, TO-126+TO-127+TO-128) |
| **OTP job-offer contract (`jobOfferOtpContract`)** | 4-digit `job_offers.pickup_otp`/`delivery_otp` contract: page inputs + migration `20260601223849` (trigger + CHECKs), locked by `jobOfferOtpContract.test.ts` | consumed by the live flow: `DriverDashboardPage` (offer response) and `DriverTripPage` (OTP steps); the legacy `jobOfferOtpContract` **service file no longer exists** (test-only contract lock, no importers) | RESOLVED both directions (supersedes the P0 "unmapped" note — first recorded in the 2026-10-05 addendum §B, annotated here 2026-10-23) |
| admin (`adminSupabaseApi`) | `users`, `drivers`, `agencies`, `contact_inquiries` | `/admin/*` pages | KYC review authority lives in `driverKycApi` (`getDriverKycState`/`reviewDocument`/`getDocumentAccessUrl`) consumed by DriverDetailPage (TO-128); `adminSupabaseApi` keeps whole-driver status actions only |
| agency portal (`agencyPortalApi`, `agencySupabaseApi`) | `agency-portal-{rates,jobs,fleet,drivers,billing}` edges, `agency_jobs`, `transport_agencies` | `/agency/*` pages | — |
| local-first (`localApi`, PGlite) | local db | packing/dashboard local mode | — |

**Summary of unmapped (both directions):** none — `jobOfferOtpContract`/job-offer acceptance is resolved (TO-129/TO-130; `202377b7` retired 2026-10-23, top section); driver KYC is fully mapped both directions (TO-126/TO-127/TO-128, 2026-10-03). Single-direction gaps: 4 routes without designs (`/subscription`, `/agency/profile`, `/management/cartons`, `/driver/profile`), 6 orphan screens without routes (`202377b7` now among them, retired), 2 duplicate clusters needing dedupe.

## 5. Quality rubric

`stitch_guide` §8 was unavailable (tool not exposed this session), so the six criteria are declared here; each screen scored 1–5 mechanically from its HTML (script kept at `.stitch-mcp/scratch/audit/{signals,score}.js`):

1. **St — Semantic structure**: viewport meta, exactly one `h1`, main/header/nav/section landmarks.
2. **C — Content richness**: text volume bands (empty → overstuffed).
3. **I — Interaction affordances**: count/variety of labeled buttons, inputs, links.
4. **A — Accessibility**: `aria-*`, `alt`, `label`, focus styles, ≥44 px touch hints.
5. **R — Responsive**: media queries / breakpoint classes (for DESKTOP boards a low R means "fixed layout, no adaptive breakpoints" — moderate severity; the real-world issue is device *mismatch*, called out in §2).
6. **Cn — Consistency**: Tailwind usage, app-blue palette presence, Inter, sane color count.

**POOR verdict** = average < 3.0 or any criterion scored 1.

| id | Screen | St | C | I | A | R | Cn | Avg | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `5141ba81` | Admin Health Dashboard | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `34b07dd7` | Admin: Agency Management Hub | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `499ab4be` | Admin: Driver Detail & Compliance Review | 5 | 5 | 5 | 2 | 1 | 3 | 3.5 | **POOR** |
| `595aec8e` | Admin: Driver Management Hub | 5 | 5 | 4 | 3 | 3 | 3 | 3.83 | ok |
| `d9fafd06` | Admin: KYC Verification Detail | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `e27cd905` | Admin: Payout Management & Triage | 5 | 5 | 4 | 3 | 3 | 3 | 3.83 | ok |
| `c6441e5d` | Admin: Settlement Reconciliation | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `52aa57b7` | Admin: Subscription Management | 5 | 5 | 4 | 3 | 1 | 3 | 3.5 | **POOR** |
| `142aa41c` | Admin: Support & Contact Inbox | 5 | 5 | 4 | 3 | 1 | 3 | 3.5 | **POOR** |
| `c16aa8ef` | Admin: User Management Hub | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `a8b23ee2` | Agency Dispatch Board | 3 | 5 | 5 | 2 | 3 | 3 | 3.5 | ok |
| `e18e7ca3` | Agency Operations Dashboard | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `efa6bcef` | Agency Registration — TruckOpti | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `76d2e9e6` | Agency: Billing & Financials Hub | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `f5ac1529` | Agency: Driver Roster & Management | 5 | 5 | 4 | 3 | 1 | 3 | 3.5 | **POOR** |
| `2f54d59c` | Agency: Fleet Management & Vehicle Status | 5 | 5 | 4 | 3 | 1 | 3 | 3.5 | **POOR** |
| `05b1da56` | Agency: Rate Card Management | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `c7700d0d` | Auth Callback — TruckOpti | 5 | 3 | 3 | 2 | 1 | 3 | 2.83 | **POOR** |
| `f1185d19` | Checkout — TruckOpti | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `cd34b109` | Company Profile & GST Settings | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `6ed56451` | Contact & Support — TruckOpti | 5 | 5 | 4 | 3 | 3 | 3 | 3.83 | ok |
| `0b4d18c8` | Contact Support - TruckOpti | 5 | 5 | 4 | 3 | 3 | 3 | 3.83 | ok |
| `37a00a15` | Customer Dashboard | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `6d6286d4` | Customer Master — TruckOpti | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `fc97f63d` | Customer Team & Branch Management - TruckOpti | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `0afcac09` | Customer Tracking Control Center - TruckOpti | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `141531b6` | Customer: New Shipment Booking | 5 | 3 | 5 | 3 | 3 | 3 | 3.67 | ok |
| `05bf2a23` | Driver App Home | 4 | 3 | 5 | 2 | 1 | 3 | 3 | **POOR** — refreshed 2026-10-24 (screen `96715dd2`); the app implementation now adds the switch semantics, labelled offer actions, ≥44/48px targets, focus-visible rings, icon+label chips and honest error/Retry states the generated HTML lacked (top section); generated scores kept as generated |
| `3c30c0e5` | Driver Registration — TruckOpti | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `591699f3` | Driver Trip Detail - TruckOpti | 5 | 3 | 5 | 1 | 1 | 3 | 3 | **POOR** — refreshed 2026-10-24 (screen `98648447`); the app implementation now adds the labelled back action, step announcer, linked OTP inputs with live inline rejections, GPS icon+label chip, ≥44px targets and focus rings the generated HTML lacked (top section); generated scores kept as generated |
| `180752ea` | Driver: Delivery & Proof | 5 | 3 | 5 | 2 | 1 | 3 | 3.17 | **POOR** — refreshed 2026-10-24 (screen `c241f6c1`); the app implementation now adds the retryable upload-failure state, labelled capture/submit actions, and the linked OTP/live-error a11y from the `591699f3` integration (top section); generated scores kept as generated |
| `e72905ba` | Driver: Documents & KYC Upload | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `202377b7` | Driver: New Job Offer | 4 | 3 | 3 | 1 | 1 | 3 | 2.5 | **POOR** — **RETIRED 2026-10-23** (superseded by the live offer flow; scores kept as generated — see top section) |
| `b54728a4` | Driver: Pickup Workflow | 5 | 3 | 5 | 3 | 1 | 3 | 3.33 | **POOR** |
| `efcc993e` | Earnings & Wallet — TruckOpti | 5 | 3 | 5 | 2 | 1 | 3 | 3.17 | **POOR** |
| `b1b215f2` | Forgot Password — TruckOpti | 5 | 3 | 5 | 3 | 3 | 3 | 3.67 | ok |
| `9f6e7777` | Growth & Sales Account Workspace - TruckOpti | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `8db564ce` | Help Center - TruckOpti | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `d7e58516` | Login — TruckOpti | 5 | 3 | 5 | 3 | 3 | 3 | 3.67 | ok |
| `812ce430` | Management Hub - TruckOpti | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `d8615375` | OTP Verification — TruckOpti | 4 | 3 | 5 | 1 | 3 | 3 | 3.17 | **POOR** |
| `e4a2980a` | Packing Optimizer — TruckOpti | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `f0e5cc94` | Partner Webhook Logs - TruckOpti | 5 | 5 | 4 | 2 | 3 | 3 | 3.67 | ok |
| `1e1497ab` | Payment Success - TruckOpti | 5 | 3 | 3 | 1 | 1 | 3 | 2.67 | **POOR** |
| `28d39c9a` | Pricing Options | 5 | 5 | 3 | 2 | 3 | 3 | 3.5 | ok |
| `399e6386` | Privacy Policy — TruckOpti | 5 | 4 | 5 | 1 | 3 | 3 | 3.5 | **POOR** |
| `4a7d8f66` | Profile - TruckOpti | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `9360baca` | Public Landing Page | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `07a60c72` | Reset Password — TruckOpti | 4 | 3 | 5 | 3 | 3 | 3 | 3.5 | ok |
| `5f312d88` | Route Planner — TruckOpti | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `08e898da` | Sale Orders — TruckOpti | 5 | 5 | 4 | 2 | 1 | 3 | 3.33 | **POOR** |
| `a89a0c1d` | Shipment History — TruckOpti | 5 | 5 | 4 | 3 | 3 | 3 | 3.83 | ok |
| `d9c0586c` | Shipment Invoice — TruckOpti | 5 | 5 | 5 | 2 | 1 | 3 | 3.5 | **POOR** |
| `daab73c1` | Signup — TruckOpti | 4 | 3 | 5 | 3 | 1 | 3 | 3.17 | **POOR** |
| `89025628` | Terms of Service — TruckOpti | 5 | 4 | 5 | 1 | 3 | 3 | 3.5 | **POOR** |
| `0d032afa` | Trip History — TruckOpti Driver App | 5 | 3 | 5 | 1 | 1 | 3 | 3 | **POOR** |
| `7479e1a8` | Truck Catalog - TruckOpti | 4 | 5 | 4 | 2 | 1 | 3 | 3.17 | **POOR** |
| `bc073b70` | TruckOpti - India's Logistics Operating System | 3 | 1 | 5 | 2 | 3 | 3 | 2.83 | **POOR** |

**Systemic findings (averages):** structure 4.83 · content 4.38 · interactions 4.66 · **accessibility 2.43** · **responsive 2.14** · consistency 3.00.

- **Accessibility is the systemic failure:** average **0.2 `aria-*` attributes per screen** across all 58; 20 screens have zero focus styles; alt/label usage is near-zero. Screen-level a11y must come from the app implementation (as done in `DriverKycPage`, which adds aria-labels, focus rings and 48 px targets the generated screen lacked) **and** from briefs (add explicit a11y requirements to every future generation brief).
- **Responsive** failures are mostly DESKTOP boards with fixed layouts (moderate), plus genuine device mismatches: driver-journey screens designed as DESKTOP (`efcc993e` earnings, `3c30c0e5` registration) although drivers work on phones.
- **POOR set (29):** `05bf2a23` `08e898da` `0d032afa` `142aa41c` `180752ea` `1e1497ab` `202377b7` `2f54d59c` `399e6386` `3c30c0e5` `499ab4be` `52aa57b7` `591699f3` `5f312d88` `6d6286d4` `7479e1a8` `76d2e9e6` `89025628` `9f6e7777` `b54728a4` `bc073b70` `c7700d0d` `d8615375` `d9c0586c` `daab73c1` `e72905ba` `efcc993e` `f5ac1529` `fc97f63d`. (Includes the freshly integrated KYC screen `e72905ba` — its app implementation mitigates A/R; the *screen* still scores as generated.)

## 6. Prioritized backlog

### P0 — core-journey gaps (block the driver revenue loop)

1. **Driver job-offer acceptance — RESOLVED / superseded (2026-10-23).** The P0 was closed in code by TO-129/TO-130 before any design work: offers arrive in realtime and on focus as an inline bottom-sheet card on `/driver/dashboard` (`DriverDashboardPage.tsx:257-296,298-315,472-545`), accept/decline runs the single atomic `respond_to_job_offer` RPC (`customerSupabaseApi.ts:808-831`) and acceptance navigates to the existing `/driver/trip/:jobId` 7-step flow (`DriverDashboardPage.tsx:360-385`; `DriverTripPage.tsx:55-65`). The proposed `/driver/job-offer/:offerId` route was never built and is not needed; screen `202377b7` is **RETIRED** after a retrieve-only diff showed it designing a conflicting standalone page (static 01:59 timer, fabricated distance/cargo/vehicle fields, terminal accept — full diff in the top section). Original text: "Screen `202377b7` (MOBILE) exists; `job_offers` table + realtime channel exist; `jobOfferOtpContract` service exists and is unused. Build `/driver/job-offer/:offerId` (accept → OTP verify → trip start) wiring screen ↔ service ↔ table."
2. **KYC loop is real both directions (updated 2026-10-03, TO-126+TO-127+TO-128).** `/driver/kyc` uploads real bytes to the private `driver-docs` bucket and renders server-authoritative review states; the admin half closed the same day: `/admin/drivers/:id` now embeds a KYC Verification section consuming `getDriverKycState` (admin-scoped `state` read), `reviewDocument` (reason-required, 409 conflict → authoritative reload) and fresh `getDocumentAccessUrl` signed previews, and approving a driver without full KYC requires an explicit documented confirmation. *Evidence: `DriverDetailPage.tsx` KYC section consumes `driverKycApi` only; battery 35/35 (incl. admin state read + cross-driver 403) and unit tests 522/522 on 2026-10-03.* Next proposal (one line): the remaining P0 in this backlog is #1 — driver job-offer acceptance (`202377b7` + `jobOfferOtpContract`), matching completion queue TO-129/TO-130.
3. **`stitch_list_screens` under-reports** (57 listed vs 58 fetchable; no update timestamps). Adapter/upstream consistency issue — blocks reliable audits/automation. Escalate to the adapter owner; not a repo code change.

### P1 — POOR screens on live journeys + missing designs

4. Regenerate/fix driver MOBILE screens in the POOR set with a11y + true MOBILE device: `b54728a4` (pickup) and `0d032afa` (history), and redesign `efcc993e` (earnings) + `3c30c0e5` (registration) as MOBILE (device mismatch). (`202377b7` job-offer retired 2026-10-23; `05bf2a23` home, `591699f3` trip, `180752ea` delivery+proof all refreshed and integrated 2026-10-24 — see top sections.)
5. Design the four MISSING screens: `/driver/profile`, `/subscription`, `/agency/profile`, `/management/cartons`.
6. Fix driver dead ends: replace hardcoded `tel:18001234567` with the real support number (or a config), and stop linking drivers into the customer `/profile` layout (driver-scoped account section).
7. Auth/public POOR screens (`d8615375` OTP, `daab73c1` signup, `c7700d0d` auth-callback, `1e1497ab` payment success + failure states): add error/empty/loading states and a11y before next regeneration cycle.

### P2 — polish & dedupe

8. Retire `bc073b70` (stale landing husk) and one of the identical contact pair (`0b4d18c8`/`6ed56451`).
9. Decide agency pairing: `e18e7ca3` ↔ `/agency/dashboard`, `a8b23ee2` ↔ `/agency/jobs` (or merge); decide `fc97f63d` vs `6d6286d4` for `/management/customers`.
10. Judge orphan value: `8db564ce` Help Center (candidate for a public route), `9f6e7777`, `f0e5cc94`, `c6441e5d` (park or delete with owner sign-off).
11. Consistency pass on high-traffic screens: Material-style hexes → app token equivalents in briefs; add a standing a11y clause (aria labels, focus styles, 48 px targets, alt text) to the generation-brief template.

---

*Audit artifacts kept for re-runs: `.stitch-mcp/scratch/audit/` (inventory.json, signals.json, rubric.json, 58 HTMLs, scripts). Stitch calls used: `stitch_status` ×1, `stitch_list_screens` ×1, `stitch_get_screen` ×1 — all read-only.*

---

## 2026-10-03 addendum — TO-123 auth-surface usability pass (no Stitch mutations)

Scope: the five auth routes (`/login` + `?mode=driver|agency|office|partner`, `/signup`, `/forgot-password`) were repaired in code, not regenerated — P0 journey fix (login surfaces could render unusable/dead methods). No new screens; coverage table above is unchanged. Zero Stitch mutations this session (read-only `stitch_status` + `stitch_guide` only).

### What changed on each surface (actual route evidence)

| Route | Before | After (verified in browser, see evidence below) |
|---|---|---|
| `/login` (any surface mode) | OTP form rendered even with zero OTP channels; Google rendered "(needs setup)" with env-var copy; office blocked state leaked `VITE_AUTH_PASSWORD_ENABLED=true` | Method availability now comes from the canonical capability model (`frontend/src/lib/authSurfaceMethods.ts`): only enabled+configured methods render; no-method state shows honest maintenance copy plus a clearly separate device-local workspace entry |
| `/login?mode=office|partner` | Dead end when password flag off (env-name notice, no usable path) | Working password path when provisioned; honest administrator-notice blocked state otherwise; keyboard focus lands on the identifier field |
| `/signup` | "Email Signup Disabled" button rendered when flags off | Honest notice + Google path when available, or maintenance card with device-local entry; chooser only when both email-OTP and password exist |
| `/forgot-password` | Reset form reachable even with password auth disabled | Honest "resets unavailable" notice; form only renders when password sign-in is enabled |

Accessibility added: `aria-pressed` on the sign-in/signup method toggles and OTP channel buttons, `role="alert"` + `aria-describedby` on inline errors, `autoComplete` on identifier/password/email/tel/name inputs, pending/disabled submit states preserved, keyboard flow to the local workspace verified by script.

### Route evidence (executed 2026-10-03)

- Command: `PUBLIC_APP_URL=http://localhost:4173 npm run test:frontend-smoke` (local-first build) → exit 0, **63/63 checks** (`logs/frontend_launch_smoke_report.json`). New checks this pass: 5 login surfaces × 2 viewports (390×844, 1280×900) asserting surface titles, zero console/page errors and forbidden copy (`VITE_`, `needs setup`, `in this environment`), plus a keyboard-driven check (Tab → Enter) from `/login` to `/local-start`.
- Screenshots: `logs/auth-surface-smoke/login-{default,driver,agency,office,partner}-{mobile-390x844,desktop-1280x900}.png` (10 files; gitignored artifact folder).
- Method-combination matrix (no-provider / Google-only / password-only / email-only / phone combos) is proven by unit tests on the real page components because env flags are baked at build time: `frontend/src/pages/auth/LoginPage.test.ts` (16 tests), `SignupPage.test.ts` (5), `lib/authSurfaceMethods.test.ts` (5); full suite 481/481.

### Backlog update

- Resolved from §2/§3: `/login`, `/signup`, `/forgot-password` honest-state gaps and the §5 accessibility systemic finding **for the auth surfaces only** (auth pages now carry labels, error semantics and focus behavior the generated screens lacked).
- Still open (P1, unchanged): §6 item 7's non-auth POOR screens (`d8615375` OTP, `c7700d0d` auth-callback, `1e1497ab` payment success/failure states) and the §2 MISSING designs (`/subscription`, `/agency/profile`, `/management/cartons`, `/driver/profile`).
- Next proposed item (one-line evidence): OTP screen `d8615375` remains the only auth-adjacent POOR screen with no error-state design — fold its error/loading states into TO-139 (UX audit) rather than a new generation.

---

## 2026-10-05 addendum — TO-139 actual-app UX/accessibility audit (implemented routes, not generated screens)

**Scope shift:** §1–§6 and the 2026-10-03 addendum audit *generated Stitch screens*. This addendum audits the **implemented application** — every route in `frontend/src/App.tsx`, what it renders, which API it calls, and how it behaves at both required viewports. Generated-screen scores are not evidence of app behaviour and vice versa.

**Tier:** local-first fixture browser tier (`frontend/dist` built with no backend configured, served by `node server.js` on :3000). The only signed-in identity obtainable without a cloud backend is the device-local agency profile created at `/local-start`; driver/admin pages are verified through their denied-role state. Cloud-credentialed browser proof remains owner-gated (unchanged).

**Evidence (all executed 2026-10-05, all exit 0):**

| Check | Command | Result | Artifact |
|---|---|---|---|
| UX route audit (new) | `PUBLIC_APP_URL=http://127.0.0.1:3000 node scripts/ux_route_audit.mjs` | 104 checks · 0 hard failures (red baseline: 100 checks · 18 hard failures) | `logs/to139-audit-final.txt`, `logs/to139-ux-audit-report.json`, screenshots `logs/to139-ux-audit/**/`; red: `logs/to139-audit-red.baseline.txt`, `logs/to139-ux-audit-report.red.json` |
| Launch smoke | `PUBLIC_APP_URL=http://127.0.0.1:3000 node scripts/frontend_launch_smoke.mjs` | 63/63 | `logs/frontend_launch_smoke_report.json` |
| Device-local workspace proof (TO-134 harness, regression) | `PUBLIC_APP_URL=http://127.0.0.1:3000 node scripts/customer_local_workspace.browser-proof.mjs` | 2/2 viewports · **0 console errors, 0 page errors, 0 failed responses** (was 4 console-error findings) | `logs/to134-local-workspace-browser-proof.json` |
| Frontend lint / typecheck / build / unit | `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:unit` | exit 0 / exit 0 / exit 0 / **551/551** (545 baseline + 6 new) | — |
| Repo gates | `node --test` policy suite, `npm run test:server-routing`, `npm run test:packing`, `node tools/glue-check.mjs` | 70/70, 15/15, 18/18, 0 gaps | — |

### A. Route inventory and browser result (actual app, 48 routes)

Viewport columns: **M** = 390×844, **D** = 1280×900. "Renders" = page reached without a `pageerror`/ErrorBoundary/404/redirect; deep-link checks (fresh context) plus layout-nav and link-target checks.

| Route | Gate | Page → data source | Renders |
|---|---|---|---|
| `/` | public | `RoleHome` → LandingPage (guest) / role home (auth) | M ✔ D ✔ |
| `/auth/callback` | public | AuthCallbackPage → `supabase.auth` | not driven (needs real OAuth params; smoke covers sign-in surfaces) |
| `/pricing`, `/terms`, `/privacy`, `/contact` | public | static pages; contact → `contactInquiry` (device queue on failure) | M ✔ D ✔ |
| `/login`, `/signup`, `/otp`, `/forgot-password`, `/reset-password` | public | auth pages → `supabase.auth` + capability model | M ✔ D ✔ (5 login surfaces × 2 viewports in smoke) |
| `/checkout`, `/subscription`, `/support` | auth | CheckoutPage → `razorpayPayment`/`phonepePayment`/`subscriptionApi`; SubscriptionPage → `invoicesApi`; ContactPage | M ✔ D ✔ |
| `/payment/callback`, `/payment/success` | public | PaymentCallbackPage → `phonepePayment`, `paymentSupabaseApi` | M ✔ D ✔ |
| `/driver/register`, `/agency/register` | public | registration gates → login (`driverSupabaseApi`, `agencyRegistrationApi`) | M ✔ D ✔ |
| `/local-start` | public | LocalSetupPage → `agencyProfileLocalApi` (PGlite) | M ✔ D ✔ |
| `/test-payment` | DEV only | production build renders the 404 page | M ✔ D ✔ (404 expected) |
| `/dashboard` | auth | Dashboard → `customerDashboardApi`/`saleOrdersSupabaseApi`/`analyticsSupabaseApi` | M ✔ D ✔ |
| `/packing` | auth | PackingPage → `trucksSupabaseApi` + `lib/packing` | M ✔ D ✔ |
| `/routes` | auth | RoutesPage → `routesSupabaseApi` | M ✔ D ✔ |
| `/tracking` | auth | TrackingPage → `customerTrackingApi` + realtime (guarded) | M ✔ D ✔ |
| `/booking/new` | auth | NewShipmentPage → `customerShipmentsApi` + `supabase.rpc('dispatch_job_to_drivers')` | M ✔ D ✔ (title not set — finding D2) |
| `/profile` | auth | ProfilePage → `supabase` | M ✔ D ✔ |
| `/management` | auth | ManagementPage → `customerDashboardApi` | M ✔ D ✔ |
| `/management/trucks`, `/management/cartons` | auth | TrucksPage/CartonsPage → **`trucksLocalApi`/`cartonsLocalApi`** (device-local PGlite; 7 default trucks seeded) | M ✔ D ✔ |
| `/management/customers` | auth | CustomersPage → `customersSupabaseApi` (cloud-only today) | M ✔ D ✔ (error state in local mode) |
| `/sale-orders`, `/invoice/:shipmentId`, `/settings/company`, `/history` | auth | `saleOrdersSupabaseApi`, `shipmentsSupabaseApi`, `supabase`, `customerShipmentsApi` | M ✔ D ✔ (titles not set on `/settings/company`, `/history` — finding D2) |
| `/admin`, `/admin/drivers`, `/admin/drivers/:id`, `/admin/agencies`, `/admin/payouts`, `/admin/contact`, `/admin/users`, `/admin/subscriptions` | admin | `adminSupabaseApi` (+ `driverKycApi` on detail) | denied-role ✔ M ✔ D (PermissionDenied state, working "Go to my home") |
| `/driver/dashboard`, `/driver/trip/:jobId`, `/driver/earnings`, `/driver/history`, `/driver/profile`, `/driver/kyc` | driver | `driver*Api` + `driverJobProgress` RPC + `driverKycApi` | denied-role ✔ M ✔ D |
| `/agency/dashboard` | agency | `agencyDashboardApi` → **device-local branch when no backend** | M ✔ D ✔ |
| `/agency/fleet`, `/agency/jobs`, `/agency/billing`, `/agency/drivers`, `/agency/rates`, `/agency/profile` | agency | `agency*Api` (edge functions) | M ✔ D ✔ (empty/error states in local mode — finding D1) |
| `*` | any | NotFoundPage | M ✔ D ✔ |

Layout nav integrity: all `/agency/*` anchors and `/dashboard` nav anchors resolve; the five settings entries (Management, Subscription, Company Profile, Settings, Help & Support) are `onClick` buttons, present and labelled. Terms/Privacy/Contact link targets verified from `/` and `/login`.

### B. Action → API map refresh (delta vs §4)

`/agency/dashboard` now reads `agencyProfileLocalApi`/`trucksLocalApi`/`cartonsLocalApi` in no-backend mode (previously always `agency-portal-dashboard`); `ContactPage` now imports its support constants from `frontend/src/config/support.ts`; `DriverTripPage` support action reads the same config; `ErrorBoundary`/`PaymentCallbackPage` use the configured support email. `jobOfferOtpContract` is no longer dead code — `/driver/trip/:jobId` and `DriverDashboardPage` consume the offer flow (TO-129/TO-130, accepted); §4's "unmapped both directions" note is superseded.

### C. Findings fixed in this slice (P0 / explicitly instructed)

1. **Agency layout crash (P0, journey-breaking).** `AgencyLayout.tsx` rendered `user_metadata.company` directly; the device-local profile stores `{ name }` (object), so React error #31 collapsed **every** `/agency/*` route into the ErrorBoundary fallback (red audit: 7 agency routes × 2 viewports + broken nav). Fix: `toDisplayName()` (`frontend/src/utils/displayName.ts`) + unit test; browser red→green.
2. **Device-local landing contradiction (P0 for the local-first journey).** With no backend, `/agency/dashboard` failed its edge fetch and told the user "No Agency Profile Found — Register your transport agency" immediately after `/local-start` had created their device workspace. Fix: `AgencyDashboardPage` no-backend branch renders the device workspace (company name, local truck/carton counts, quick actions to the working local screens, honest cloud-feature note); no cloud call, no failure toast. Regression tests: `AgencyDashboardPage.test.ts` (2).
3. **Invented support number removed (brief instruction).** `DriverTripPage` "Support" called `tel:18001234567` (hardcoded, unverified). Now `tel:+919999352050` from `frontend/src/config/support.ts`, with an accessible label.
4. **Support contact inconsistency.** `ErrorBoundary` and `PaymentCallbackPage` offered `support@truckopti.in` while the Contact page publishes the owner-configured address; both now read `SUPPORT_EMAIL` from the same config module (ContactPage unchanged in behaviour).
5. **Local-first placeholder WebSocket.** Every signed-in page opened `wss://localhost.invalid/realtime/...` (AgencyLayout, MobileLayout notifications, TrackingPage). Fixed with `isSupabaseConfigured` guards (and a corrected effect cleanup in AgencyLayout). Console errors on the workspace proof dropped 4 → 0.
6. **Misleading success toast.** `NewShipmentPage` showed an empty `✅` toast when the dispatch RPC failed. Now an explicit warning: "Booking created — driver dispatch is temporarily unavailable."
7. **Unlabelled back buttons** on `/terms` and `/privacy` got `aria-label="Go back"`.

### D. Open findings — owner selection (P1/P2)

**D1 (P1) — local-first mode degrades cloud routes.** With no backend configured, 12 endpoint families are attempted and fail (`ERR_NAME_NOT_RESOLVED` to `https://localhost.invalid`): `/rest/v1/{trucks,shipments,routes,packing_jobs,cartons,customers}` and `/functions/v1/agency-portal-{dashboard,fleet,jobs,billing,drivers,rates}`. Pages render honest empty/error states with a failure toast (`/routes`, `/tracking`, `/history`, `/management/customers`, all agency pages except the dashboard), but there is no in-app explanation that the cloud is absent and no retry affordance on `/management/customers`. Decision needed: (a) gate cloud-only routes/pages in local mode with a clear "connect an account" state, (b) make more routes device-local, or (c) accept as documented local-mode limitation. Evidence: `logs/to139-ux-audit-report.json` (`failedRequestUrls`), screenshots `agency-jobs`, `management-customers`.
**D2 (P1) — accessibility gaps (heuristic sweep).** 20 icon-only buttons without accessible names across 14 routes (16 of them on `/management/trucks` card actions), 4 unlabelled form fields on 2 routes (`/booking/new` 2, `/settings/company` 2), `no-h1` on 5 routes (`/driver/register`, `/agency/register`, `/agency/dashboard`, `/dashboard`, `/invoice/:shipmentId` desktop), `multiple-h1` on 12 authenticated routes, and `document.title` never set on 11 routes (both registration gates, all six `/agency/*` portal pages incl. the dashboard, `/booking/new`, `/settings/company`, `/history` — all fall back to the index title). No automated WCAG audit was run — these are DOM-inspection findings; each is a small, owner-selectable fix.
**D3 (P2) — contrast heuristic.** 50 sampled text elements below AA thresholds (e.g. `slate-400`-on-white labels ≈2.5:1, `pricing` fine print, login hero). Sample-based and noise-prone (gradient backgrounds skipped, translucency not modelled); recommend a real contrast pass on high-traffic public pages before acting.
**D4 (P2) — dead language state.** The app renders English-only at both viewports, including with a persisted `truckopti-language='hi'` returning context (no Devanagari found on 8 surfaces). The `languageStore` still drives a `document.title` effect and unused `labelHi` nav strings remain in `MobileLayout`. Cleanup candidate, not a live inconsistency.
**D5 (P1, carried) — product findings from TO-134/135 that surface in UX.** The missing `dispatch_job_to_drivers` RPC (booking dispatch has no producer; toast is now honest but the feature is absent) and the cross-tenant RPC surfaces remain open in the DB/product slices, not repairable in UI files.

### E. Not run / limitations

- No cloud-credentialed browser journey (hosted Supabase absent; owner-gated), no driver/admin signed-in journeys, no Stitch regeneration, no staging tier.
- `stroke-only` history/aria checks are DOM heuristics at two viewports; no screen-reader (NVDA/VoiceOver) pass and no axe-core run.
- Screenshots and JSON reports live under `logs/` (gitignored working evidence).

### F. Stitch record

`stitch_status` ×1 and `stitch_guide` ×1 (read-only), project `projects/817968552986251880` reused; **0 mutations, 0 retries, 0 generations** in this slice. Screen IDs referenced from the existing inventory only.
