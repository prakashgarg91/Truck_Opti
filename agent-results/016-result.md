# TO-126 Result — Implement private KYC storage and authoritative state

**Task:** `agent-tasks/016-private-kyc-backend.md`
**Verdict:** **PASS** (ready for GPT-6 review; authorizes no deployment, no hosted change, no DONE)
**Date:** 2026-10-03 · **Worker:** GLM-5.3 Flash (Implementer TO-126) · **Branch:** `main` (no push, per policy)
**Evidence level:** all functional evidence below is **local** (disposable Docker Supabase stack, CLI-standard dev keys, real HTTP through the served edge function). No mock was substituted for a required check. No production bucket or database was touched.

---

## 1. What was done

The driver-docs bucket is now **private** (world-readable SELECT policy dropped, `public = false`, `application/pdf` added to the allowed MIME list, 5 MiB limit kept), stale world-readable URL references on `public.drivers` are nulled by the same forward migration, and a new durable, versioned, **server-authoritative** KYC record exists:

- **`public.driver_kyc_documents`** — one row per document version per kind (`rc_book`, `driving_license`, `aadhaar`, `truck_photo`) with `version`, `status` (`pending_review|accepted|rejected`), `rejection_reason`, `reviewed_by`, `reviewed_at`, `uploaded_at`, owner-scoped `storage_path`, server-sniffed `mime_type`, `size_bytes`, `original_name` (display-only). RLS: owner/admin SELECT, owner INSERT, admin DELETE, **no UPDATE or DELETE grant to anon/authenticated at all** — accept/reject can only happen through the trusted edge function (service role).
- **DB-enforced version chain** (`trg_driver_kyc_version_chain`): every insert (including service-role) must be `status='pending_review'`, exactly `max(version)+1` for `(driver_id, kind)`, in an owner-scoped path `{userId}/{kind}/…`, and for a driver row that belongs to `user_id`. A replacement upload therefore automatically supersedes (invalidates) the review state of older versions.
- **`supabase/functions/driver-kyc`** — trusted boundary with actions `state`, `upload`, `submit`, `review`, `access`. Driver identity from the Supabase session + `drivers` row (`requireDriverContext`, new additive helper in `_shared/portal-auth.ts`); admin identity from `public.users.role` via the existing `requireAdminContext` — **never `user_metadata`**. Uploads are byte-validated server-side (≤5 MiB + JPEG/PNG/WebP/PDF magic-byte sniff, `_shared/kyc-files.ts`); invalid bytes are removed from storage. `submit` refuses unless all four kinds exist and none is rejected. `review` writes only with a version+`pending_review` guard; a stale version returns **409**. `access` mints **60-second signed URLs** for the owner or an authorized admin only. The all-accepted `locked` / `submitted` state is **computed server-side** in every response.
- **`frontend/src/services/driverKycApi.ts`** — adapter exporting exactly the brief's surface: `getState(): Promise<KycSubmissionState>`, `uploadDocument(kind, file): Promise<KycSubmissionState>`, `submit(): Promise<KycSubmissionState>`, `reviewDocument(driverId, kind, version, decision, reason?): Promise<KycSubmissionState>` (using the existing `KycDocKind`/`KycSubmissionState` from `driverKycDocuments.ts`), plus `getDocumentAccessUrl()` for signed access. Deliberate metadata extension: `KycApiSubmissionState.versions` (server-authoritative current version per kind — the value review must be called with). UI wiring itself is TO-127/TO-128 and was **not** touched.
- `frontend/src/types/database.types.ts` regenerated from the verified schema (TO-125 procedure); diff = header + the new table only.

## 2. Changed files

| File | Change |
|---|---|
| `supabase/migrations/20261003000000_private_kyc_documents.sql` | **new** — privatize bucket, add PDF MIME, drop public SELECT policy, add owner SELECT policy, null stale public URLs, create `driver_kyc_documents` + RLS + version-chain trigger |
| `supabase/functions/driver-kyc/index.ts` | **new** — state/upload/submit/review/access actions, byte validation, version-guarded review, signed access |
| `supabase/functions/_shared/kyc-files.ts` | **new** — pure magic-byte/size validator (Deno- and Node-importable) |
| `supabase/functions/_shared/kyc-files.test.ts` | **new** — 6 node tests for the validator |
| `supabase/functions/_shared/portal-auth.ts` | additive `requireDriverContext()` (session + `drivers` row resolution; no behavior change to existing exports) |
| `supabase/functions/driver-kyc/local-disposable-battery.mjs` | **new** — reproducible disposable-stack battery (33 checks; self-cleaning fixtures; env-gated, not part of CI) |
| `frontend/src/services/driverKycApi.ts` | **new** — adapter (four brief methods + signed access + normalizer) |
| `frontend/src/services/driverKycApi.test.ts` | **new** — 17 vitest mapping/guard tests |
| `frontend/src/types/database.types.ts` | regenerated from verified local schema (header + `driver_kyc_documents` only) |
| `TASKS.md` | TO-126 row → AWAITING_REVIEW + result reference |

## 3. Verification (all run in this session)

| Check | Command (dir) | Result | Evidence class |
|---|---|---|---|
| Byte-validator unit tests (sniff 4 types; spoofed/truncated/RIFF-WAVE rejected; 5 MiB boundary; empty rejected) | `node --test supabase/functions/_shared/kyc-files.test.ts` (repo root) | **6/6 pass, exit 0** | local unit (Node 24.14 type stripping; module is Deno-compatible) |
| **Required battery** — anon read denied, other-driver read/update denied, spoofed-role denied, admin permitted, oversized rejected, declared-type rejected, PDF accepted, replacement invalidates old review, conflicting review rejected, version-chain violations (dup/skip/accepted-insert/foreign-path/cross-owner), byte-spoof rejected + object removed, submit gating, non-admin review 403, stale-version review 409, reject-reason required, server-computed `locked`, signed access (other 403 / owner+admin 200, fetched bytes `%PDF-`) | `SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… node supabase/functions/driver-kyc/local-disposable-battery.mjs` (repo root, disposable stack) | **33/33 PASS, exit 0** — run twice: on the applied stack and again after `npx supabase db reset` | **local DB/Storage/Function** (real HTTP; function served by the CLI's edge runtime `supabase-edge-runtime-1.77.1` / Deno-compatible v2.1.4 via `npx supabase functions serve driver-kyc`) |
| Migration-chain replay with the new migration | `npx supabase migration up` then `npx supabase db reset` (repo root) | exit 0; **31/31 migrations applied**, final state: bucket `public=f`, MIME `{jpeg,png,webp,pdf}`, table RLS `t`, trigger present (psql-verified) | local DB |
| Adapter mapping/guard tests | `npm-cli.js --prefix frontend run test:unit -- --run src/services/driverKycApi.test.ts` | **17/17 pass** | local unit (mock tier — mapping only; DB battery carries the authority evidence) |
| Frontend build | `npm-cli.js --prefix frontend run build` | **exit 0** | local |
| Frontend lint | `npm-cli.js --prefix frontend run lint` (`--max-warnings 0`) | **exit 0** | local |
| Frontend unit suite (full) | `npm-cli.js --prefix frontend run test:unit` | **498/498, exit 0** (32 files; includes the 17 new) | local |
| Policy suites (all 7) | `node --test scripts/deployment_safety.test.mjs scripts/launch_gate_policy.test.mjs scripts/payment_readiness_policy.test.mjs scripts/production_config_audit.test.mjs scripts/production_config_policy.test.mjs scripts/security_boundary_policy.test.mjs scripts/supported_runtime_policy.test.mjs` | **70/70, exit 0** | local |
| Server routing | `npm-cli.js run test:server-routing` (repo root) | **exit 0** | local |

### Red → green

- **Red (pre-slice, from the coverage sweep this ask provided and re-confirmed by reading the sources):** `driver-docs` public with a world-readable SELECT policy (`20260306000000:12,27-29`); zero KYC tables/functions/API (`grep -in kyc supabase/migrations supabase/functions server.js` empty); client-simulated states with self-approving timers (`DriverKycPage.tsx:487-497`); bucket MIME list excluded PDF while the UI accepts it.
- **Green (executed here):** the battery's negative controls (anon/other-driver/spoofed-role/oversize/spoofed-bytes/stale-version/non-admin/missing-reason all **denied** with recorded statuses) against the positive paths (owner PDF upload 200, owner insert 201, admin reads 200, full review → server-computed `locked=true`, signed URL fetch returns `%PDF-`). Within the adapter tests, the normalizer first failed red on missing-kind version defaults, was fixed, and the file passed 17/17.

## 4. Design decisions worth review

1. **Submission is derived, not a separate row** (smallest durable record per the brief): `submitted` = all four kinds have a current version; `submittedAt` = max current `uploaded_at`; `locked` = all four current versions accepted; `lockedAt` = max `reviewed_at`. Computed server-side on every response, so a client can never display a verified state the backend did not return.
2. **Uploads go browser→storage→function** (no file bytes through the edge function): browser uploads to its own folder under the storage owner-folder policies, then the function downloads, byte-validates, removes invalid content, and registers the version. This keeps request bodies small, keeps bucket-level enforcement, and concentrates byte authority in one trusted place.
3. **No client UPDATE path exists** (grant revoked, not just policy): review integrity does not depend on RLS policy drift.
4. **Replacement-after-accept is allowed and correctly resets verification** (new version ⇒ `pending_review` ⇒ server-computed `locked` drops) — truthful behavior; the UI decision to offer it belongs to TO-127.
5. Stale public URL references are **nulled**, not rewritten: short-lived signed URLs cannot be persisted; UIs already render null as "no document" (e.g. `DriverDetailPage.tsx:319`).

## 5. Limitations, risks, and follow-ups

- **Legacy registration upload (`DriverRegisterPage.tsx:80-91`) is outside my allowed files and is NOT rewired:** it still uploads to `driver-docs` (now private — the upload itself still succeeds under owner policies) and stores `getPublicUrl()` output in `drivers.dl_url/rc_url`, which now resolves to a dead URL. Existing rows were nulled by the migration; new registrations will store dead links until TO-127 rewires that flow onto `driverKycApi`. Flagged as the top TO-127 item.
- The old `Admins can manage all driver documents` storage policy, owner INSERT/UPDATE/DELETE storage policies, and the `trip-photos`/`billing-documents` buckets are unchanged (billing-documents remains public-by-policy — different bucket, out of scope, worth a future hardening slice if it carries sensitive PDFs).
- The function is not deployed anywhere; `verify_jwt` default (true) applies, which is correct here (every action expects a user JWT).
- Local-stack quirk (test-harness only): the local storage service mints signed URLs against its internal `kong:8000` hostname; hosted projects return the real host. The battery rewrites the host before fetching and notes why.
- The local Docker Supabase stack remains initialized (project id `Truck_Opti`), disposable via `npx supabase stop --no-backup`; the served-function process was stopped after the battery.

## 6. Owner gates (unchanged, unchanged by this slice)

- No `supabase db push`, no `supabase functions deploy`, no hosted project access — applying this migration and deploying `driver-kyc` to the production project remains owner-gated (recovery/cutover steps per `agent-results/015-result.md` §8).

## 7. Next recommendation

GPT-6 review of this slice (especially the derived-submission design and the no-UPDATE-grant posture). Then TO-127 (brief 017): wire `DriverKycPage.tsx` onto `driverKycApi.ts` (real uploads, real states, remove the fabricated progress timers and the `?demo=midflow` unguarded seed) and rewire the legacy `DriverRegisterPage` upload, followed by TO-128 for the admin per-document review UI on top of `reviewDocument`/`getDocumentAccessUrl`.

## 8. Git state at completion

- Branch `main` at parent `fe36d8e4`; **not pushed** (policy). Single cohesive commit of the 10 files in §2 (named paths only).
- Pre-existing untracked items preserved untouched: `.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup`, `agent-results/completion-truth-20261002.md`, `agent-results/functional-coverage.md`, `closeout-logs/`. (The latter three plus `.serena/` were already present at session start; the orchestrator brief listed two of them as expected — all five left as found.)
- Thirteen parked AI-work-factory worktrees under `D:/Github/0.dev-matrix/…` are untouched (TO-140 scope).
