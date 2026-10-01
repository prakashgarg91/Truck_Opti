# TO-125 Result — Prepare a reproducible Supabase recovery and staging backend

**Task:** `agent-tasks/015-supabase-recovery-rehearsal.md`
**Verdict:** **PASS** (ready for GPT-6 review; no deployment or live change authorized by this work)
**Date:** 2026-10-01 · **Worker:** GLM-5.3 Flash (worker-TO125) · **Branch:** `main` (no push)
**Evidence level:** all functional evidence below is **local DB** (disposable Docker Supabase stack, CLI-standard local dev keys). Hosted evidence is a read-only DNS probe only. No mock was substituted for a required check.

---

## 1. What was done

The committed migration chain was rehearsed against an **empty disposable local Supabase** (Docker, CLI via `npx supabase` v2.119.0, Postgres 17.6.1.063 per `config.toml`). The rehearsal found the chain **did not replay** (three distinct defects), plus a live security defect in the OTP hardening migration and a reference-data duplication defect. All were repaired in place (migrations are in allowed scope), and the chain now applies cleanly end-to-end with the full identity/RLS/RPC battery passing. `frontend/src/types/database.types.ts` was regenerated from the verified schema after the committed copy proved badly stale. A backup/restore rehearsal and a demo-account seeding rehearsal completed the recovery picture.

## 2. Changed files (all inside allowed scope)

| File | Change |
|---|---|
| `supabase/migrations/20260107000000_base_schema.sql` | `trucks.name` → `TEXT NOT NULL UNIQUE` (1 line + comment) — makes the identical catalog re-seed in `production_setup` a true no-op; fixes 16→8 duplicated rows on replay |
| `supabase/migrations/20260212000000_production_setup.sql` | 50 invalid `CREATE POLICY IF NOT EXISTS` statements → `DROP POLICY IF EXISTS … ; CREATE POLICY …` (Postgres has no `CREATE POLICY IF NOT EXISTS`); 5 `ALTER PUBLICATION … ADD TABLE` → guarded `DO $$ … pg_publication_tables … $$` blocks (repo's own idempotent pattern from `20260305010000`) |
| `supabase/migrations/20260307000000_fix_rls_ownership.sql` | Removed self-duplicating "STEP 8" section (100 lines): it re-created the identical policies already created in STEP 2–7 (unqualified table names resolve to `public.*`), guaranteeing `SQLSTATE 42710` on fresh replay; its DROPs were no-ops and its CREATEs duplicated STEP 2–7 definitions exactly, so final security state is unchanged (with explanatory note in file) |
| `supabase/migrations/20260730110000_enforce_job_offer_otp_verification.sql` | **Security fix.** `REVOKE SELECT (pickup_otp, delivery_otp) FROM authenticated` was a silent no-op: the role holds *table-level* SELECT (platform default grants), which covers every column. Now `REVOKE SELECT ON public.job_offers FROM authenticated;` + `GRANT SELECT (<16 non-OTP columns>) TO authenticated;` |
| `frontend/src/types/database.types.ts` | Regenerated from the verified local schema (`npx supabase gen types typescript --local`) with provenance header (allowed scope: "regenerate only after verified schema" — schema verified by §4) |

Not modified (findings recorded instead): `supabase/config.toml` — `[db.seed] sql_paths=["./seed.sql"]` references a file that never existed in git history (`git log --all -- supabase/seed.sql` is empty); the CLI only warns (`no files matched pattern: supabase/seed.sql`) and reference data is inserted by migrations, so seeding still works. The `[inbucket]` section is deprecated in favor of `[local_smtp]` (warning only, still functional). Both are safe cleanup candidates for a follow-up; left untouched as the smallest validated change set.

## 3. Inventory (recovery facts, no credentials)

- **Historical hosted project:** ref `jbxncejtcbpcronndqlx`, name "TruckOpti", org `cgibwzenlletujchgbav`, pooler region `aws-1-ap-south-1`, PG 17.6.1.063 (from `supabase/.temp/linked-project.json`, gitignored). DNS probe 2026-10-01: **NXDOMAIN** ("Non-existent domain" via `nslookup` and `socket.gethostbyname`).
- **Migrations:** 30 files, `20260107000000_base_schema` → `20260730110000_enforce_job_offer_otp_verification` (§5). Reference data is inserted by migrations: 8 trucks, 5 cartons, 3 sample customers, 4 subscription_plans (starter/growth/professional/enterprise; ₹49,900–₹14,99,900 monthly).
- **Tables:** 27 public tables, all RLS-enabled (verified via `pg_class.relrowsecurity`). Buckets: `driver-docs` (5 MiB, public, jpeg/png/webp), `trip-photos` (5 MiB, public, jpeg/png/webp), `billing-documents` (10 MiB, public, pdf).
- **Edge Functions (`supabase/functions/`, 21 + `_shared`):** admin-backfill-invoice-delivery; admin-portal-{agencies,contact,dashboard,drivers,payouts,subscriptions,users}; agency-portal-{billing,dashboard,drivers,fleet,jobs,rates}; create-razorpay-order; phonepe-{checkout,status}; razorpay-webhook; verify-payment; verify-razorpay-payment. Shared: `billing.ts`, `invoice-delivery.ts`, `plans.ts`, `portal-auth.ts(+test)`.
- **Function secrets (names only, from `Deno.env.get`):** `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`; `PHONEPE_MERCHANT_ID/SALT_KEY/SALT_INDEX/API_URL/CALLBACK_ORIGIN/ALLOWED_CALLBACK_ORIGINS`; AWS SES (`AWS_*`, `AWS_SES_*`); billing config (`BILLING_APP_URL/EMAIL_FROM/GST_ENABLED/GST_RATE_PERCENT/SUPPORT_EMAIL`); platform `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY`. URL/public-anon-key provisioning stays distinct from these secrets.
- **Deploy note (rollout order):** no `[functions.*]` entries exist in `config.toml`, so CLI default `verify_jwt=true` applies. `razorpay-webhook` (and any provider-callback function) must deploy with `verify_jwt=false` — it authenticates via its own HMAC-SHA256 webhook-secret check (`razorpay-webhook/index.ts:32-49`); otherwise provider callbacks are rejected.
- **Key grants/revokes in chain:** client mutations locked on `subscriptions/invoices/usage_tracking/payment_history` (`REVOKE INSERT/UPDATE/DELETE FROM authenticated`, `20260501101500`); OTP columns locked per §4; RPC EXECUTE grants explicit (`REVOKE … FROM PUBLIC` + `GRANT … TO authenticated`) for `get_shipment_job_offer_tracking`, `persist_driver_job_offer_progress`, `ensure_shipment_document_numbers`, `is_admin_user`, `resolve_login_identifier`.

## 4. Security rehearsal — OTP exposure found and closed (red → green)

The OTP migration's stated goal is "Drivers must not read OTP columns directly." The committed statement did not achieve it:

- **RED (pre-fix),** via REST as a real authenticated stakeholder (test signup `to125-rehearsal@example.com`, fixture customer+shipment+job_offer created via psql with `pickup_otp=1234`):
  `GET /rest/v1/job_offers?select=pickup_otp,delivery_otp,status` → **HTTP 200** `[{"pickup_otp":"1234","delivery_otp":"5678","status":"pending"}]`; `select=*` returned all 18 columns. SQL proof: `has_table_privilege('authenticated','public.job_offers','SELECT') = t` (psql, `information_schema.role_table_grants`).
- **Fix:** table-level `REVOKE SELECT` + column `GRANT` for the 16 non-OTP columns (see §2).
- **GREEN (post-fix),** same request → **HTTP 403** `{"code":"42501","message":"permission denied for table job_offers"}`; `select=*` → 42501 (PostgREST expands `*` to all columns; verified no frontend query uses `select='*'` on `job_offers` — all 13 `.from('job_offers')` calls in `frontend/src/services/customerSupabaseApi.ts` use explicit granted column lists, e.g. lines 294, 431, 460, 531, 554, 576-580, 598, 612, 630); `select=id,shipment_id,status,photo_loading_url,delivered_at` → HTTP 200; **customer OTP RPC `get_shipment_job_offer_tracking` still returns OTPs to the stakeholder (HTTP 200, rows:1, pickup_otp via RPC = 1234)** — the sanctioned path (`customerSupabaseApi.ts:321`) is intact; `persist_driver_job_offer_progress` with fake id → `P0001 'Job offer not found or access denied'` (guard + EXECUTE grant intact).
- **Impact note:** if the historical hosted project is ever revived, it carries the same exposure (the committed statement was a no-op there too). This fix rides the migration replay in any recovery/cutover, closing it at restore time. Flagged to owner under §8.

## 5. Migration rehearsal on an empty disposable DB (red → green)

Three consecutive failures on fresh replay, each reproduced, then fixed and re-proven from a wiped volume (`npx supabase stop --no-backup` destroys only the disposable local volume created minutes earlier; no shared/existing database was ever touched):

1. **RED:** `npx supabase start` aborted in migration 4 — `ERROR: syntax error at or near "NOT" (SQLSTATE 42601)` at statement 37 (`CREATE POLICY IF NOT EXISTS …`, production_setup:354). Invalid on every Postgres version. → fixed (50 statements).
2. **RED:** next run — `ERROR: relation "shipments" is already member of publication "supabase_realtime" (SQLSTATE 42710)` (duplicate of base_schema:207; no `ADD TABLE IF NOT EXISTS` exists in Postgres). → fixed (DO-block guards).
3. **RED:** next run — `ERROR: policy "customers_select_own" for table "customers" already exists (SQLSTATE 42710)` — fix_rls_ownership duplicated its own STEP 2–7 policies as STEP 8. → fixed (STEP 8 removed; final state identical).
4. **GREEN:** `npx supabase start` exit 0, all 30 migrations applied (`grep -c "^Applying migration"` = 30, no ERROR lines).
5. **Trucks duplication:** after policy fixes, replay produced **16 trucks (each catalog row twice)** — production_setup re-inserts the identical 8-row catalog and `trucks.name` had no unique constraint, so targetless `ON CONFLICT DO NOTHING` suppressed nothing. Fixed with `UNIQUE` on `trucks.name` (§2). **Final canonical rebuild:** exit 0, 30/30 migrations, `trucks=8, plans=4, buckets=3`.

## 6. Identity, RLS and grants verification (local DB)

Via REST (`curl`, CLI-standard local keys) and psql against the canonical build:

- anon read `trucks` → HTTP 200, `Content-Range: 0-7/*` (8 rows, public reference read); anon read `subscription_plans` → 200, 4 tiers with correct prices.
- anon INSERT `shipments` → **HTTP 401/42501 "new row violates row-level security policy"** (anon writes blocked).
- authenticated full CRUD on `customers` → insert 201, update 204, delete 204, ownership-scoped (`created_by`); insert **without** PAN blocked by DB contract (`P0001 'PAN number is required for customers'` — `enforce_pan_contracts` trigger active).
- RLS on 27/27 public tables; policy counts per table inspected (e.g. `job_offers` 3, `driver_payouts` 5, `notifications` 6); post-fix `has_table_privilege('authenticated','public.job_offers','SELECT') = f` and column privilege on `pickup_otp` = `f`.
- Demo/staging data contract: `node scripts/seed-portal-demo-accounts.cjs` (env: local `SUPABASE_URL`, `SERVICE_ROLE_KEY`, throwaway `SEED_DEMO_PASSWORD`) → **5/5 accounts seeded** (driver/agency/customer/razorpay-reviewer/admin) with `login_id`s, roles and approved profiles; seeded driver password sign-in → `access_token: true, role: authenticated`. Note for operators: `supabase status -o env` emits shell-quoted values — strip surrounding quotes or GoTrue rejects the key as malformed JWT.

## 7. Generated types vs schema; frontend gates

- Committed `database.types.ts` was generated from the historical hosted project and is **stale by 14 tables** (entire driver/agency/portal subsystem missing: `agency_jobs`, `agency_trucks`, `analytics_events`, `contact_inquiries`, `driver_locations`, `driver_payouts`, `drivers`, `job_offers`, `notifications`, `packing_items`, `packing_jobs`, `sale_order_items`, `sale_orders`, `transport_agencies`) plus the OTP RPC, `production_setup_status` view and `graphql_public` section. No frontend file imports it directly, so drift was latent, not breaking.
- Regenerated from the verified schema (§2). **`npx tsc --noEmit` → 0 errors; `npm run test:unit` → 413/413 passed (28 files); `npm run lint` → 0 errors / 26 warnings (identical to the recorded repo baseline).**

## 8. Backup/recovery verification and rollout order (concrete steps)

- **Backup/restore rehearsal:** `pg_dump -Fc` of the local DB (536 KB) → `pg_restore` into a second database in the same disposable container. All application state restored exactly: trucks=8, plans=4, fixture job_offers=1, buckets=3, auth_users=6; **OTP column lockout and trucks unique constraint survive restore**. 34 errors were "ignored on restore" — all platform-internal (realtime/vault/graphql function definitions and grants, `ALTER DEFAULT PRIVILEGES` owned by `supabase_admin`, `vault.secrets` COPY denied). **Documented recovery command shape:** scope dumps to app schemas (`pg_dump --schema=public --schema=storage --schema=auth`) or use `supabase db dump`; never copy `vault.secrets` across environments; platform internals are re-created by the platform, not the dump.
- **Owner decision required (restore vs replace)** — cannot be inferred locally: inspect the Supabase dashboard for `jbxncejtcbpcronndqlx` (status, region, recoverable backups). The hostname is NXDOMAIN today.
- **If replace (staged cutover):** 1) create new project (PG 17, ap-south-1 to match pooler history); 2) replay verified migration chain (this rehearsal = proof; never `supabase db push` without explicit owner approval); 3) buckets exist via migrations; 4) deploy Edge Functions with secrets set per function (`RAZORPAY_*`, `PHONEPE_*`, AWS SES, `BILLING_*`), `verify_jwt=false` for `razorpay-webhook`; 5) configure auth: Google OAuth client + redirect origins (placeholder `your-google-client-id` must be replaced), SMTP + email templates (`supabase/templates/*.html`); 6) seed demo/test accounts (§6) — password provisioning is owner-gated; 7) run `scripts/test-supabase-connection.mjs` plus this battery against the new project; 8) update `VITE_SUPABASE_URL`/key env and coordinate redeploy; 9) only then cut traffic. **If restore:** restore latest backup into a new project, then replay any migrations missing from its history and apply §4's OTP grant fix before exposure is considered closed.
- **OTP/security changes ride first:** the final replayed state contains all hardening (role guards, OTP RPC-only path, locked payment tables). A revived old project would additionally need the §4 grant fix applied immediately.

## 9. Required-check ledger (all run in this session)

| Check (brief) | Command / method | Result | Evidence class |
|---|---|---|---|
| Rebuild empty disposable local schema with documented commands | `npx supabase stop --no-backup` + `npx supabase start` (workdir repo root), final run exit 0, 30/30 migrations | PASS | local DB |
| Read/write under appropriate test identities | curl REST: anon read 200; anon INSERT blocked 42501; authenticated CRUD 201/204/204 (PAN contract enforced) | PASS | local DB |
| Inspect RLS/grants | psql: 27/27 RLS on; role_table_grants/column grants; post-fix `auth_tbl_select=f`, `auth_otp_col_select=f` | PASS | local DB |
| Enumerate expected functions and buckets | filesystem inventory (21+shared functions, secret names) + `storage.buckets` = 3 expected | PASS | local DB |
| Verify generated types against schema | `npx supabase gen types typescript --local` vs committed file → drift documented; regenerated; tsc/vitest/lint pass | PASS | local DB |
| Backup/recovery verification | `pg_dump -Fc` → `pg_restore` into second DB; app state equal; platform-internal caveats documented | PASS | local DB |
| Hosted DNS/auth health | `nslookup`/`gethostbyname` → NXDOMAIN; hosted auth/functions/dashboard checks **not run** — owner-gated | BLOCKED (owner) | n/a |

## 10. Assumptions and risks

- Assumed editing the four historical migrations in place is correct because they could never have replayed as committed (or, for the OTP grant, never enforced what they claim); recovery replay targets a fresh DB, so no applied-migration-history conflict exists locally. If the supervisor prefers append-only remediation, the same statements can be superseded by a new tail migration — flagged for review.
- `scripts/seed-portal-demo-accounts.cjs` ran against the local stack only, with a throwaway password; no real credential was used or printed. Local keys are CLI-standard dev values, not production secrets.
- Local stack (`supabase start`, project id `Truck_Opti`) remains installed in Docker; it is disposable (`supabase stop --no-backup` removes it). Volumes were recreated four times during the red/green loop.
- The staged cutover steps are concrete but **unexecuted against any hosted project**; hosted recovery remains owner-gated until executed and verified.

## 11. Owner blockers

1. Restore-vs-replace decision for the historical project (dashboard/backup access; hostname NXDOMAIN as of 2026-10-01).
2. Hosted project creation/restore execution and verification; explicit approval before any `supabase db push` or production data change.
3. Provider/auth secrets for the new environment: Razorpay (`KEY_ID/KEY_SECRET/WEBHOOK_SECRET` — same dedicated webhook secret in Razorpay dashboard per the standing gate), PhonePe, AWS SES sending credentials, Google OAuth client + authorized origins/redirects, SMTP; plus `VITE_*` env redeploy coordination.
4. Test/demo account password provisioning on the replacement project (`SEED_DEMO_PASSWORD` policy).

## 12. Next smallest step

Supervisor review of this result (especially the in-place migration edits and the OTP grant fix). After acceptance, per the board: TO-123 remains dependency-gated; the next READY local task in board order (TO-131 safe service error boundaries, or TO-133 local backup restoration — TO-133 can reuse this rehearsal's dump/restore evidence) proceeds while hosted recovery stays owner-gated.

## 13. Git state at completion

- Branch `main` at `43dd72f5`; **not pushed** (per policy). Commit for this task: see TASKS.md / git log — single cohesive commit of the 5 changed files + `TASKS.md` row + this result file.
- Working tree before commit contained only pre-existing untracked items `.vscode/mcp.json.bak-qdrant-cleanup` and `closeout-logs/` (preserved, not staged).
- Local Docker Supabase stack left initialized (project id `Truck_Opti`); disposable via `npx supabase stop --no-backup`.
