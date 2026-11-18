# Drift review: 20261035000000_subscription_write_guards.sql

Read-only verification, 2026-11-18. Method: a throwaway Node script (`D:/tmp/drift.mjs`, `d2.mjs`, `d3.mjs`, not in the repo) found, for each function, the highest-numbered earlier migration that contains `CREATE [OR REPLACE] FUNCTION public.<name>`. It extracted signature, attributes and body from both versions, normalised line endings, whitespace and comments, and diffed them. A second raw diff, with only line endings and trailing whitespace stripped, was run to catch changes inside string literals. The GRANT/REVOKE statements for every function were compared across all earlier migrations and the new file.

Result: 0 suspect differences in the 14 bodies. The only changes are the allowed ones: the added guard line and, in 8 functions, `SET search_path = public` becoming `public, pg_temp`. The only non-allowed finding is a lock-order inversion (MED-1, below). It comes from where the guard sits, not from drift.

## 1. Per-function table

New-file lines are for `supabase/migrations/20261035000000_subscription_write_guards.sql`. "First write" is the first INSERT/UPDATE/set_config after the guard. No INSERT/UPDATE/DELETE/PERFORM side effect precedes the guard in any function. In `agency_payroll_open_period`, `agency_payroll_close_period` and `agency_maintenance_service_done`, the `pg_advisory_xact_lock` calls come after the guard.

| # | Function | Latest earlier def | New fn / guard line | Guard action | First write after guard | Args / defaults / RETURNS / LANGUAGE / DEFINER / volatility | search_path | Grants | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 1 | agency_consignment_create | 20261019 | 271 / 303 | record_add | 359 (gr_sequences) | identical | public, pg_temp (already) | identical (384-385) | clean |
| 2 | agency_expense_record | 20261022 | 390 / 421 | record_add | 473 | identical | already | identical (481-482) | clean |
| 3 | agency_fuel_fill_record | 20261022 | 487 / 523 | record_add | 592 | identical | already | identical (604-605) | clean |
| 4 | agency_maintenance_item_upsert | 20261022 | 610 / 641 | record_add | 676 | identical | already | identical (702-703) | clean |
| 5 | agency_payroll_open_period | 20261023 | 708 / 732 | record_add | 788 | identical | `public` to `public, pg_temp` (allowed) | identical (797-798) | clean |
| 6 | agency_driver_rate_set | 20261023 | 803 / 827 | record_add | 850 | identical | `public` to `public, pg_temp` (allowed) | identical (871-872) | clean |
| 7 | agency_load_plan_save | 20261025 | 877 / 927 | record_add | 1188 | identical | already | identical (1233-1234) | clean |
| 8 | agency_invoice_issue | 20261021 | 1239 / 1301 | settle | 1443 | identical | `public` to `public, pg_temp` (allowed) | identical (1471-1472) | clean |
| 9 | agency_payroll_close_period | 20261023 | 1477 / 1516 | settle | 1586 | identical | `public` to `public, pg_temp` (allowed) | identical (1724-1725) | clean |
| 10 | agency_payroll_adjust | 20261023 | 1730 / 1755 | settle | 1787 | identical | `public` to `public, pg_temp` (allowed) | identical (1795-1796) | clean |
| 11 | agency_maintenance_service_done | 20261022 | 1801 / 1833 | settle | 1886 | identical | already | identical (1905-1906) | clean |
| 12 | agency_erp_connection_create | 20261024 | 1911 / 1939 | erp | 1991 | identical | `public` to `public, pg_temp` (allowed) | identical (2004-2005) | clean |
| 13 | agency_erp_connection_rotate_secret | 20261024 | 2010 / 2032 | erp | 2052 | identical | `public` to `public, pg_temp` (allowed) | identical (2061-2062) | clean |
| 14 | erp_event_ingest | 20261024 | 2067 / 2146 (block 2145-2152) | erp | 2164 (set_config, then the import) | identical | `public` to `public, pg_temp` (allowed) | identical, service_role only (2207-2208) | clean (see section 3) |

Evidence for the "clean" verdicts:
- Each function is defined exactly once in the old set and once in the new file. 20261027 contains no definition of any of the 14. The ruling's "20261019 to 20261025, 20261027" range is just a range, not a list of definitions.
- No `ALTER FUNCTION` for these functions exists in any later migration.
- Old grants: `REVOKE ALL ... FROM PUBLIC, anon` plus `GRANT EXECUTE ... TO authenticated, service_role` for 13 functions. `erp_event_ingest` is `REVOKE ... FROM PUBLIC, anon, authenticated` plus `GRANT ... TO service_role`. The new file repeats each statement verbatim, with the same argument lists.
- Scope and agency resolution (`resolve_caller_agency_for_scopes`, `agency_is_operational`, and the `agency_caller_agencies` forbidden_scope check where present) are unchanged. The guard sits after them in every function.
- Error codes and messages in all 14 bodies are unchanged. The raw diff shows only the guard line, its comment, the search_path line and (for `erp_event_ingest`) the sub-block.
- In `agency_load_plan_save` the guard (927) is before the function's own `BEGIN`, so its exception handler cannot intercept the SB002.

Supporting functions:
- `agency_subscription_assert` (old def 20261027): the diff is exactly the three new actions, `settle` allowed in grace, the SB004 block, and the early-return list. Signature, attributes, search_path and REVOKEs are the same (177-179).
- `subscription_entitlement_snapshot` (old def 20261034): the diff is exactly the added `features{erp}` line. STABLE, SECURITY DEFINER and search_path are preserved, and the REVOKE is re-asserted (266).

## 2. "Never guarded" list (docs/FABLE-RULINGS-2026-11-17-B.md section 1)

The new file contains `CREATE ... FUNCTION` for 16 functions only: the assert, the snapshot and the 14 guarded commands. None of these is defined or touched: agency_invoice_record_payment, agency_invoice_cancel, agency_consignment_event, agency_consignment_qr, tracking_ping_record, agency_incident_open, agency_incident_update, agency_job_set_status, agency_driver_payout_request, agency_order_cancel, agency_load_plan_cancel, agency_erp_connection_set_status, agency_vehicle_update, agency_truck_unassign_driver. The file also has no `ALTER FUNCTION` and no GRANT or REVOKE for them. Verified OK.

## 3. erp_event_ingest sub-block (lines 2145-2152)

- The block contains one statement, `PERFORM public.agency_subscription_assert(v_conn.agency_id, 'erp', 0)`. Its handlers are `WHEN SQLSTATE 'SB002'` and `WHEN SQLSTATE 'SB004'`, not `OTHERS`. Every other error propagates: 22023 (bad action), SB001, SB003, 40P01 deadlock, 55P03 lock timeout, and 57014 cancel.
- No partial writes are possible. Before the block, the function does only reads and the outer `pg_advisory_xact_lock` (2129), which is taken before `BEGIN` and kept. The block opens a subtransaction. When the exception is caught, anything the assert took (the `sub:` advisory lock) is rolled back with it. After the block, the first write is `set_config` at 2164, then the import and the events INSERT.
- Order is correct: credentials, status, operational check, shape, payload size, then the duplicate/replay lookup (2132-2140), then the guard, then the import. Replays are still answered after a lapse.
- A refused call stores no `agency_erp_events` row, so a retry after upgrading the plan works.
- Typed returns are `{ok:false,error,code}` as documented (the header says so too).

## 4. Findings, severity-ranked

### MED-1: lock-order inversion between the new erp guard and agency_order_import (deadlock possible when enforcement is ON)
- `agency_order_import` (20261027:723) takes the per-agreement advisory lock first, then calls the assert (`order_import`, 20261027:860), which takes `sub:`.
- The new `erp_event_ingest` takes `sub:` first (guard, line 2146; assert lock at line 81), then calls `agency_order_import`, which takes the agreement lock (second).
- Opposite order on the same agency means a manual or UI order import and an ERP push for the same agency and agreement can deadlock. Postgres aborts one with 40P01. No data is lost, but the ERP call returns a 500 or an unmapped error (the Edge function maps only certain codes), and a manual import can fail.
- 20261027's header documents "sub: FIRST" as the uniform order, but `agency_order_import` already violated it. The new erp guard exposes that.
- Fix (preferred): in `agency_subscription_assert`, move the `pg_advisory_xact_lock` at line 81 below the early return for the count-free actions. For example, before the lock, add `IF p_action IN ('record_add','settle','erp') THEN` and run the status check without the lock. Alternatively, `RETURN` early for these actions after the status matrix, and take the lock only when a count is needed (`truck_add`, `staff_add`, `driver_add`, `order_import`).
- Rationale: these three actions read no counters, so the lock buys no protection (status races are benign). It also removes the second issue below. Apply the same change to the `v_add = 0` case if wanted.

### MED-2: the per-agency `sub:` lock now serialises every guarded write for that agency until commit (enforcement ON)
- `record_add`, `settle` and `erp` now take the same exclusive advisory lock as limit checks. It is held to the end of the transaction.
- Long transactions then block all other guarded writes for the agency, for example `agency_payroll_close_period` (1516, up to 93 days of drivers), `agency_load_plan_save` (927, up to 5000 lines) and `agency_invoice_issue`. That also blocks truck, staff and driver additions and dispatch.
- Single fix: the same as MED-1 (do not lock for count-free actions).

### LOW-1: Edge mapper returns 422, not 403, for the new typed ERP refusals
- `erp_event_ingest` now returns `error:'subscription_read_only'` and `error:'subscription_feature_not_in_plan'` with `ok:false`.
- `supabase/functions/_shared/erpIngest.ts:96` has `FORBIDDEN_CODES = {'connection_not_active','agency_not_operational'}`. The new codes fall to the default (lines 163-165): HTTP 422 and "a corrected retry works", while the comment on line 103 promises 403 for subscription refusals.
- A client may retry a refusal that needs a payment or plan upgrade.
- Fix: add both strings to `FORBIDDEN_CODES` and extend `scripts/edge-harness/erp-ingest.test.mjs`.
- The file is unmodified in the working tree, so this is a gap in the change set, not drift.

### LOW-2: guard precedes the idempotency/replay lookup in 12 functions (not erp_event_ingest)
- At lines 303, 421, 523, 732, 1301, 1516, 1833 and 1939 (functions that take an idempotency key), the guard runs before the replay lookup; the other guarded functions are affected only by input-validation ordering.
- Consequence: when enforcement is ON, a client that retries an already-committed request after the agency lapses gets SB002 instead of the cached success. The duplicate stays unwritten, but the client does not learn the first attempt succeeded. `erp_event_ingest` and `agency_order_import` (20261027:20) deliberately answer replays first.
- This matches ruling wording ("after scope resolution and before any write"), so it is not drift. Consider documenting it, or moving the guard below the replay SELECT in the functions that have one (consignment_create, expense_record, fuel_fill_record, payroll_open_period, payroll_close_period, invoice_issue, maintenance_service_done, erp_connection_create; load_plan_save also has a key).
- Related: validation errors (`idempotency_key_required`, `invalid_*`) are now masked by SB002 for a lapsed agency.

### LOW-3: seed UPDATE is unconditional (line 29-31)
- `UPDATE public.subscription_plans SET erp_enabled = (tier IN ('growth','professional','enterprise'))` has no WHERE clause. If the migration is replayed (for example a repair or a re-run of the file), it overwrites any manual per-plan override. Tiers are constrained to the four known values (`20260108000000_subscriptions.sql:21`), so the values are right for today.
- Fix: `WHERE erp_enabled IS DISTINCT FROM (tier IN (...))`, or run only when the column was just added (guard on `information_schema.columns`).

### LOW-4: pre-existing, not introduced here (informational)
- If `platform_billing_settings` is empty, the `EXECUTE ... LIMIT 1` returns NULL and the assert fails open. The table is a singleton by design (20261028).
- The inner `agency_order_import` call in `erp_event_ingest` can still raise SB001 (the count limit), which is not typed. It propagates through the re-raise at line 2175 and returns an RPC error, which the Edge mapper turns into 403 `subscription_limit`.
- An unknown action still raises 22023 even when enforcement is off, which is expected.

## 5. Review of the new agency_subscription_assert branches (lines 33-175)

- **Action mapping (60-65):** record_add to `records`, settle to `settlement`, erp to `erp`. NULL agency, unknown action or negative add raises 22023. OK.
- **Enforcement off (72-79):** `to_regclass('public.platform_billing_settings') IS NULL` returns first, so the guard works before the settings table exists (20261028). Then `EXECUTE 'SELECT enforcement_enabled ...'` goes through dynamic SQL, so the function compiles without the table; NULL or false returns at once. With enforcement off, nothing is checked and no lock is taken. All 14 functions behave as before, which is the stated default. OK.
- **Advisory lock (81):** taken after the enforcement check and before the subscription row read and any count, as in 20261027. Correct for the counted actions. See MED-1 and MED-2 for the new actions.
- **Subscription pick (83-87):** prefers live statuses, newest first. A missing plan row raises SB002 (fail closed). OK.
- **Status matrix (105-122):**

| Status | record_add | settle | erp |
|---|---|---|---|
| trial, active, past_due | pass | pass | pass (plan flag next) |
| grace | SB002 | pass (line 111, `p_action IN ('dispatch','settle')`) | SB002 |
| expired, cancelled | SB002 | SB002 | SB002 |
| none | SB002 | SB002 | SB002 |

The code matches the ruling table. SB003 stays dispatch-only.
- **SB004 (125-132):** only reached for trial, active and past_due, so status is checked first. `coalesce(v_plan.erp_enabled,false)` makes it fail closed. The DETAIL JSON carries plan and status. With no subscription it never reaches SB004. OK.
- **No-count early return (134):** `IF p_action IN ('dispatch','record_add','settle','erp') OR v_add = 0 THEN RETURN` prevents a count-limit lookup for the new actions. The calls pass 0 anyway. OK.
- **erp_enabled column and seed (27-31):** `NOT NULL DEFAULT false`, `ADD COLUMN IF NOT EXISTS` (idempotent). Seed is true for growth, professional and enterprise. Starter is false. See LOW-3. The starter-tier trial given to new agencies (20261026:584) means new trials have no ERP once enforcement is ON; this matches the ruling.
- **Snapshot `features{erp}` (249):** `CASE WHEN v_found THEN coalesce(v_plan.erp_enabled,false) ELSE false END`. Consistent with the guard (no subscription means false, and the guard is SB002 first). OK.
