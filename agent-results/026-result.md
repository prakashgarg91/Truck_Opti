# TO-136 Result — Verify admin authority and final database policies

**Task:** `agent-tasks/026-admin-and-rls-proof.md`
**Verdict:** **PASS** (ready for GPT-6 review; no deployment or live change authorized by this work)
**Date:** 2026-10-05 · **Worker:** GLM-5.3 Flash (worker-TO136) · **Branch:** `main` (no push)
**Evidence level:** **local DB** (real PostgreSQL engine, PGlite WASM 18.3, full committed migration chain, real RLS/roles/grants/triggers) + **source-level Edge Function verification** + **fixture-tier browser regression**. The disposable Supabase stack (REST/GoTrue/Storage HTTP) and the **credentialed admin staging browser proof were NOT executable** and are reported below with exact evidence — no mock was substituted for them.

---

## 1. What was done

After replaying all 36 migrations of the final chain, this task enumerated the **final installed policy/grant state** (RLS policies, table/column grants, views, SECURITY DEFINER ACLs, Storage policies) and executed a **role/tenant denial matrix** for every actor class the brief names: anonymous, two customers, approved/pending drivers, approved/pending/suspended agencies, a **metadata-forged "admin"** (`user_metadata.role='admin'`, DB role `user`), a real DB admin, and the service authority used by the Edge Functions.

Result: **53/53 matrix cases pass on the final schema**, with **4 hardening/design findings** recorded (none P0/P1). The run **reproduced one real P1 authorization defect** — the `billing-documents` Storage policy still derived admin authority from user-writable `user_metadata` — and fixed it with a forward migration, with red→green evidence:

| Run | Chain | Cases | Defects | Command |
|---|---|---|---|---|
| RED (before fix) | 35 files | **50/53**, 3 failed | 3 | `node scripts/admin_rls_proof.db.test.mjs` → exit 1 (`logs/to136-db-proof-red.txt`) |
| GREEN (after fix) | 36 files | **53/53**, 0 failed | 0 | `node scripts/admin_rls_proof.db.test.mjs` → exit 0 (`logs/to136-db-proof-green.txt`) |

What the red state proved, exactly:
- `A3` — 1 of 83 final policies trusts `user_metadata`: `storage.objects :: "Admins can manage all billing documents"`.
- `E6` — the forged user (`user_metadata.role='admin'`, DB role `user`) **inserted an object into `billing-documents` (ACCEPTED) and deleted an existing invoice row (1 row)**, i.e. full write over every invoice PDF in that bucket.
- `E7` — a real DB admin (no forged metadata) was **denied** the same operation (`new row violates row-level security policy`).

After the fix both directions are correct: forged = denied, real admin = allowed; `is_admin_user()` is the sole authority. All other hardened admin surfaces (drivers, agencies, KYC, payouts, contact inbox, OTP RPCs, trip photos, driver docs) already used the database-backed predicate and passed.

## 2. Changed files

| File | Change |
|---|---|
| `scripts/admin_rls_proof.db.test.mjs` | **New.** Final-schema inventory + 53-case role/tenant denial matrix on the real PostgreSQL engine (allowed scope: local SQL integration test). Exits 1 on any failed case; missing PGlite is a loud failure. |
| `supabase/migrations/20261005010000_restore_billing_documents_admin_authority.sql` | **New forward migration** (allowed scope: "forward migrations when necessary"). Rewrites the `billing-documents` admin Storage policy from `auth.jwt() -> 'user_metadata' ->> 'role'` onto `public.is_admin_user()` — the same predicate used by every other hardened Storage policy (driver-docs, trip-photos in `20260418003000`). Closes a proven P1 escalation; service-role writers unaffected (BYPASSRLS). |
| `scripts/dispatch_delivery_journey.db.test.mjs` | One assertion updated: the TO-135 harness compared the newest migration filename **exactly**, so appending a legitimate forward migration made it fail. Now monotonic (`last >= '20261005000000_…'`), same intent, no weakening. |
| `agent-results/026-result.md` | This result. |
| `TASKS.md` | TO-136 row → `AWAITING_REVIEW` (board commit). |

No product/runtime code changed. Nothing else in the tree was touched (see §10).

## 3. Why the disposable local Supabase stack and staging browser proof were not run (exact evidence, re-verified this session)

The run's dependency note said the Docker daemon was up; that is **not** the state of this machine. Probes executed here (captured in `logs/to136-stack-state.txt`):

| Probe | Result |
|---|---|
| `command -v docker` / `docker --version` | `not found` (exit 1 / 127) |
| `powershell Test-Path '\\.\pipe\docker_engine'` and `'\\.\pipe\dockerDesktopLinuxEngine'` | **False / False** (no engine pipe) |
| `C:\Program Files\Docker` | **empty** (binaries removed 2026-10-05 08:07) |
| `Get-ChildItem C:\,D:\ -Filter docker.exe -Recurse -Depth 5` | **0 matches** |
| `npx --no-install supabase status` | **exit 1** — `failed to inspect container health: docker: command not found (podman also not found)` |
| WSL `docker-desktop` | distro present but its CLI shim refuses direct use; no dockerd/containerd (recorded in `agent-results/024-result.md` §3, same day) |

`agent-results/024-result.md` §3 (TO-134, 2026-10-05) records the same gap with additional probes (`winget list --name Docker` → no package, no Docker service/process, not elevated). The 2026-10-04 completion verdict sanctions this fallback: "rebuild the disposable Supabase stack … **or extend the PGlite harness**".

Credentialed **staging** admin browser proof is additionally owner-gated: the historical hosted project is NXDOMAIN (TO-125 §3) and staging identities/hosted access are owner-controlled (`TASKS.md` owner gates). No hosted request was made.

## 4. Final-schema inventory (what the harness observed, post-fix)

- **28/28 public base tables** have `rowsecurity = true`; **83 policies** across `public` + `storage`; **0** derive authority from `user_metadata` (after the fix).
- **11 SECURITY DEFINER functions**; 7 pin `search_path`; 4 do not (`check_usage_limit`, `get_user_plan`, `has_active_subscription`, `increment_usage`) → finding A4.
- **Grants**: `authenticated` has no table-level `SELECT` on `job_offers` and no access to `pickup_otp`/`delivery_otp` columns (`table_select=false`, `otp_select=false`), while `status` remains readable — the TO-125 OTP lockout holds in the final state.
- **Views**: `public.production_setup_status` (owner-rights, `security_invoker=false`) exposes **only** `table_name,row_count` aggregates; anon-readable → finding A5 (P3).
- **Storage buckets**: `driver-docs` private (KYC, after `20261003000000`); `trip-photos` public-read by design; `billing-documents` public-read (finding A7, owner decision).

## 5. The 53-case denial matrix (green run, `node scripts/admin_rls_proof.db.test.mjs` → exit 0)

| Group | Cases | Result |
|---|---|---|
| A. inventory (A1–A7) | chain 36 files; RLS 28/28; 0 user_metadata policies; SECURITY DEFINER inventory; view aggregates only; OTP column lock; buckets | **7/7** |
| B. anonymous (B1–B6) | public catalog preserved (trucks 8/cartons 5/plans 4); zero rows on users/customers/shipments/drivers/agencies/offers/payouts/inquiries/KYC; contact inquiry insert allowed; shipment insert denied (`42501`); `is_admin_user=false` and OTP RPC `permission denied`; driver-docs hidden from anon | **6/6** |
| C. customer isolation (C1–C6) | own shipment 1 / foreign 0; foreign update+delete 0 rows; scope = self only; **self-role change rejected** (`Only admins can change roles`); OTP column `permission denied` but sanctioned RPC returns OTPs; foreign tracking `Access denied` | **6/6** |
| D. driver/agency status (D1–D8) | pending driver cannot accept (`Driver account is not approved…`); foreign offer read 0 / update `permission denied`; approved driver own-only; **pending agency self-approve reverted**, suspended self-reactivate reverted; agency scope own-only; **DB admin approves agency and driver** | **8/8** |
| E. forged metadata (E1–E7) | `is_admin_user=false`; no admin read scope; cannot change roles/edit drivers/release payouts; admin-guarded RPC denies; hardened buckets deny admin storage; **billing-documents: forged insert/delete denied after fix (was ACCEPTED), real admin allowed (was denied)** | **7/7** |
| F. admin operations, service path (F1–F9) | service reads portal users + inbox; service grants/revokes roles (only path); client role mutation rejected; service approves driver; admin resolves contact inquiry; client subscription mutation locked; admin reads all payouts, releases status-only (`paid`, amount 5000 unchanged, **0 payment rows**); admin user-list remains Edge-mediated (self-only at RLS, by design) | **9/9** |
| G. Edge Function authority (G1–G6, source-level + SQL replica) | 7/7 admin-portal functions guard before service use (5 shared `requireAdminContext`, 2 inline `requireAdmin`); no admin function reads metadata for authority; `portal-auth.ts` = `getUser(token)` → DB `users.role` → 403; frontend role is DB-derived (`authStore.resolveAppRole`), not localStorage/metadata; replicated DB-role gate admits admin, denies forged/customer | **6/6** |
| H. storage/KYC matrix (H1–H4) | driver own KYC rows + own folder only; foreign KYC read 0 / update `permission denied`; admin reads all KYC + manages hardened buckets; cross-driver folder upload denied | **4/4** |

Recorded as non-case FINDINGS (printed by the harness, `logs/to136-admin-rls-proof.json`):
1. **A4 (P2 hardening)** — 4 SECURITY DEFINER functions with mutable `search_path` (`check_usage_limit`, `get_user_plan`, `has_active_subscription`, `increment_usage`). House fix: add `SET search_path = public` (pattern used by all post-20260418003000 functions). Not rated exploitable from this harness (no `CREATE` grant modelling); verify deployed role grants.
2. **A5 (P3)** — `production_setup_status` aggregate row-count view is anon-readable; recommend `REVOKE … FROM anon, authenticated` or `security_invoker` if the deployed project grants it.
3. **A7 (P3, owner decision)** — `billing-documents` bucket is public-read by design (invoice PDFs linked by URL); paths are system-generated document numbers. Not changed (brief: preserve legitimate public policies); needs owner confirmation.
4. **G4 (P3)** — `_shared/invoice-delivery.ts` reads `user_metadata.full_name/company/phone` for **display** fields only, after GoTrue authentication; not an authority path. Flagged for the invoice slice.

**TO-135 findings (unchanged by this task, re-verified by its regression run):** cross-tenant dispatch claim, suspended-agency DB write, inert service-path fleet/payout guards, missing `dispatch_job_to_drivers`, no trip→shipment→agency-job status propagation. These are agency/journey gaps owned by the queued repair slice, not admin-authority gaps.

## 6. Edge Function authority verification (labelled)

The Edge runtime cannot execute here (no Deno). What was verified:
- **Source assertions (G1–G4)**: every `admin-portal-*` function calls a guard (`requireAdminContext` or an identical inline `requireAdmin`) *before* creating/using the service client; all guards call `authClient.auth.getUser(accessToken)` (trusted GoTrue validation) and then read `public.users.role` through the service client; **no** admin function reads `user_metadata`/`app_metadata` for authorization; `admin-portal-users` additionally rejects `body.userId === caller.id` (self-modification) and delegates ban/delete to `auth.admin`.
- **SQL replica (G6)**: the authority half of the guard (caller id → DB role → admin?) was executed against the real schema: admin `true`, forged/customer `false`.
- **Not proven here**: HTTP status mapping (401/403), GoTrue token rejection for tampered/forged tokens, and Storage API enforcement. Those need the disposable stack (Docker) or staging.

## 7. Required-check ledger (all run in this session)

| Brief check | Command / method | Result | Evidence class |
|---|---|---|---|
| Enumerate final RLS policies, grants, views, SECURITY DEFINER ACLs, Storage access | `node scripts/admin_rls_proof.db.test.mjs` cases A1–A7 | **PASS** 7/7 (83 policies, 28 tables, 11 definer functions, 3 buckets) | local DB |
| Role/tenant denial matrix for every actor class | same harness, cases B1–H4 | **PASS** 53/53, exit 0 (red 50/53 before fix) | local DB |
| Self-role changes and forged metadata/localStorage | cases C4, E1–E5, G5 | **PASS** — trigger + no metadata authority + DB-derived frontend role | local DB + source |
| Foreign IDs, view reads, function execution, document access, suspended identity, admin-only mutations | cases B2/B4–B6, C1–C6, D1–D8, E2–E7, H1–H4 | **PASS** (one real P1 found and fixed) | local DB |
| Privileged Edge Functions authenticate with trusted authority before service-role operations | cases G1–G4, G6 (source + SQL replica) | **PASS (source-level; HTTP execution NOT run)** | source |
| Prove user management, driver/agency approval, contact inbox, subscriptions, payout review with fixtures | cases F1–F9 | **PASS** | local DB |
| Red→green regression for the fix | `logs/to136-db-proof-red.txt` → `logs/to136-db-proof-green.txt` | **PASS** (A3/E6/E7 flip) | local DB |
| Full unit suite | `npm test` (`frontend`, vitest) | **PASS** 545/545, 36 files, exit 0 | local |
| Policy suites | `node --test scripts/{production_config_policy,deployment_safety,payment_readiness_policy,security_boundary_policy,supported_runtime_policy,production_config_audit,launch_gate_policy}.test.mjs` | **PASS** 70/70, 0 fail, exit 0 | local |
| Packing | `npm run test:packing` | **PASS** 18/18, exit 0 | local |
| Server routing | `npm run test:server-routing` | **PASS** 15/15, 0 fail, exit 0 | local |
| Glue check | `node tools/glue-check.mjs` | **PASS** 0 gaps, 0 warnings, exit 0 | local |
| Lint | `npm --prefix frontend run lint` (`--max-warnings 0`) | **PASS** exit 0 | local |
| Build | `npm --prefix frontend run build` (local-first, `.env.local` set aside/restored) | **PASS** exit 0 | local |
| Trip DB regression | `node scripts/trip_transition_integrity.db.test.mjs` | **PASS** 21/21, exit 0 | local DB |
| Customer DB regression | `node scripts/customer_journey_isolation.db.test.mjs` | **PASS** 25/25 (+3 known findings), exit 0 | local DB |
| Dispatch DB regression | `node scripts/dispatch_delivery_journey.db.test.mjs` | **PASS** 35/35 (+6 known TO-135 findings), exit 0 | local DB |
| Admin-route browser gating (fixture tier) | `PUBLIC_APP_URL=http://127.0.0.1:3000 node scripts/frontend_launch_smoke.mjs` on the local-first build | **PASS** 63/63, `backendMode: local_first`, exit 0 — includes all 7 `/admin/*` routes redirecting guests to `/login` | fixture browser |
| Credentialed admin staging browser proof | not run | **BLOCKED (owner)** — no hosted project/credentials (NXDOMAIN), no Docker for the local stack | n/a |

## 8. Authority record (what was proven, by layer)

- **Anonymous:** only the public catalog, contact-form insert, public-read buckets; zero rows on every private table; no admin authority; OTP RPC execute revoked.
- **Customer:** own-tenant rows only; OTPs only through the sanctioned SECURITY DEFINER RPC; cannot read OTP columns or foreign tenants; role changes rejected by trigger.
- **Driver/agency (approved/pending/suspended):** own-row scope; pending driver blocked by the atomic offer RPC; pending/suspended agency status writes reverted by trigger; operational mutations stay service-mediated.
- **Forged metadata:** no admin authority anywhere in the hardened schema (reads, writes, RPCs, storage, role mutation); the single exception (billing-documents) was reproduced and fixed.
- **DB admin:** `is_admin_user()` works across drivers, agencies, contact inbox, payouts, KYC, hardened storage; the billing-documents policy now follows the same predicate.
- **Service authority (Edge path):** the only path for user listing/ban/delete, role grants, and cross-tenant reads; guards verified at source + replicated predicate.

## 9. Limitations and not-run items

- No PostgREST/GoTrue/Storage HTTP round trip, no GoTrue-issued token, no second concurrent session. "Forged metadata" is modelled the way GoTrue embeds `raw_user_meta_data` into a signed JWT; the JWT signature itself is not exercised.
- Edge Functions were not executed (no Deno): their guards are source-verified, their DB authority path replicated — **not** live HTTP auth proof. `live-admin-proof.cjs` (Playwright admin proof) was not run: it requires `SEED_DEMO_PASSWORD` against a live backend.
- The browser tier is fixture-only (route gating). The **credentialed admin staging browser proof required by the brief is owner-gated** and remains unexecuted.
- PGlite is PostgreSQL 18.3 while `supabase/config.toml` pins 17; same engine class, minor-version difference.
- `logs/` artifacts are gitignored working evidence, not committed.
- The fix migration is validated by the PGlite replay and all regression harnesses; it has **not** been applied to any hosted project (no `supabase db push`).

## 10. Owner gates

1. **Docker/Podman unavailable** (needs elevation): reinstall Docker Desktop to enable `npx supabase start` and the REST/Storage/GoTrue tier for TO-134/135/136.
2. **Hosted staging** restore/replace + staging identities: required for the credentialed admin browser proof and any production security claim (TO-125 blockers unchanged; host NXDOMAIN).
3. **Fix rollout**: `supabase/migrations/20261005010000_restore_billing_documents_admin_authority.sql` rides the next authorized migration rollout (owner-gated; no push performed). If the historical project is ever revived, this closes the same live exposure there.
4. **A7 decision**: confirm whether `billing-documents` remaining public-read is intended.

## 11. Next smallest recommendation

- GPT-6 review of this result and the two-step red→green evidence; then accept/queue **(a)** the A4 `search_path` pinning migration (4 functions, mechanical, house pattern) and **(b)** the queued TO-135 repair slice (agency status/cross-tenant dispatch + guards) — both are now the only known unowned authorization gaps.
- After Docker/staging is restored, re-run `scripts/admin_rls_proof.db.test.mjs` on the disposable stack (PostgREST/GoTrue/Storage) and execute `scripts/live-admin-proof.cjs` for the credentialed browser tier.

## 12. Git state at completion

- Branch `main`; **not pushed**. Changed: `scripts/admin_rls_proof.db.test.mjs` (new), `supabase/migrations/20261005010000_restore_billing_documents_admin_authority.sql` (new), `scripts/dispatch_delivery_journey.db.test.mjs` (1 assertion made monotonic), `agent-results/026-result.md`, `TASKS.md` row.
- Pre-existing untracked items preserved, not staged: `.ai-work-factory/`, `.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`.
- Local evidence (gitignored): `logs/to136-*` including the red/green harness runs and `logs/to136-admin-rls-proof.json`.
