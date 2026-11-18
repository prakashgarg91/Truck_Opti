#!/usr/bin/env node
/**
 * PRIVILEGE MATRIX (PM) on PGlite: which database role may execute, read or write what, after the whole
 * supabase/migrations chain is replayed.
 *
 * LEVEL: catalogue-level proof on a REAL PostgreSQL engine (PGlite WASM). The migrations are replayed from zero,
 * then the grants that PostgREST would honour are read back from pg_proc / pg_class / pg_policies / has_*_privilege
 * and compared with an EXPLICIT allow-list written in this file. A behavioural walk then calls a sample of
 * 25 RPCs as `anon` and as an `authenticated` user with no agency and asserts denial, never success.
 *
 * Scope: every function that migrations >= 20261008000000 create or replace (candidates parsed from the SQL, then
 * confirmed in pg_proc); every public table that migrations >= 20261008000000 create; every public policy; the
 * column privileges of the secret and billing columns.
 *
 * A case that finds a REAL defect keeps failing and is named 'BUG: ...'. The test is never weakened to pass.
 *
 * Usage:  node scripts/privilege_matrix.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const FROM_VERSION = '20261008000000'

if (!existsSync(PGLITE_BASE)) {
  console.error('FAIL: PGlite not found at ' + PGLITE_BASE + ' — run `npm ci` in frontend/ first.')
  process.exit(1)
}

const { PGlite } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'index.js')).href)
const { uuid_ossp } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'contrib', 'uuid_ossp.js')).href)

// ---------------------------------------------------------------------------
// EXPLICIT ALLOW-LISTS (the intended privilege design, written by hand; reviewed against the migrations)
// ---------------------------------------------------------------------------

/** Functions an `authenticated` caller may EXECUTE. Every one is caller-bound (auth.uid()), an agency command or
 *  reader, a tracking/subscription reader, or an RLS / caller-resolution helper that policies need. */
const AUTHENTICATED_RPC = [
  // agency commands and readers (client calls via PostgREST rpc)
  'agency_client_agreement_create', 'agency_client_agreement_update', 'agency_client_contact_create',
  'agency_client_contact_update', 'agency_client_site_create', 'agency_client_site_update',
  'agency_consignment_create', 'agency_consignment_event', 'agency_consignment_qr',
  'admin_agencies_without_subscription', 'admin_webhook_events', 'admin_webhook_attempts', 'admin_subscription_coupons',
  'agency_driver_directory', 'agency_identity_update', 'agency_driver_employment_create', 'agency_driver_employment_end',
  'agency_driver_employment_update', 'agency_driver_invitation_accept', 'agency_driver_invitation_create',
  'agency_driver_invitation_revoke', 'agency_driver_payout_request', 'agency_driver_rate_set',
  'agency_erp_connection_create', 'agency_erp_connection_rotate_secret', 'agency_erp_connection_set_status',
  'agency_expense_record', 'agency_expense_summary', 'agency_fuel_fill_record', 'agency_incident_open',
  'agency_incident_update', 'agency_invoice_cancel', 'agency_invoice_issue', 'agency_invoice_record_payment',
  'agency_job_assign_driver', 'agency_job_set_status', 'agency_load_plan_approve', 'agency_load_plan_cancel',
  'agency_load_plan_save', 'agency_maintenance_item_upsert', 'agency_maintenance_service_done',
  'agency_member_accept', 'agency_member_change_scope', 'agency_member_invitation_revoke', 'agency_member_invite',
  'agency_member_revoke', 'agency_order_cancel', 'agency_order_import', 'agency_payroll_adjust',
  'agency_payroll_close_period', 'agency_payroll_my_lines', 'agency_payroll_open_period',
  'agency_subscription_entitlement', 'agency_subscription_invoices', 'agency_subscription_start_trial',
  'agency_tariff_version_publish', 'agency_trip_live', 'agency_truck_assign_driver',
  'agency_truck_unassign_driver', 'agency_vehicle_create', 'agency_vehicle_update', 'release_fleet_assignment',
  'reserve_fleet_assignment', 'tracking_ping_record', 'platform_billing_settings_update', 'driver_trip_agency_job',
  // caller-bound usage / plan RPCs (each raises 42501 unless p_user_id = auth.uid())
  'check_usage_limit', 'get_user_plan', 'has_active_subscription', 'increment_usage', 'subscription_usage_visible',
  // RLS and caller-resolution helpers (policies evaluate them as the caller)
  'agency_caller_agencies', 'agency_driver_allocation_eligible',
  'agency_member_has_scope', 'agency_payroll_caller_driver_ids', 'agency_vehicle_allocation_eligible',
  'driver_is_assigned_to_agency', 'resolve_caller_agency_for_scopes', 'resolve_caller_agency_id',
  'shipment_accepts_agency_jobs', 'tracking_caller_driver_ids',
]

/** Non-trigger functions that must NOT be executable by anon, authenticated or PUBLIC (service_role only). */
const SERVICE_ONLY_FN = [
  'agency_erp_hash', 'agency_erp_new_secret', 'agency_load_plan_flatten', 'agency_load_plan_weight',
  'agency_random_token', 'agency_subscription_assert', 'agency_subscription_lock', 'agency_subscription_state',
  'agency_tariff_rate_at', 'agency_token_hash', 'erp_event_ingest', 'release_stale_fleet_reservations',
  'run_expiry_sweeps', 'run_subscription_sweeps', 'subscription_activate_payment', 'subscription_cancel_pending_order',
  'subscription_create_order', 'subscription_entitlement_snapshot', 'subscription_next_invoice_number',
  'subscription_place_of_supply', 'subscription_quote_order', 'subscription_record_refund', 'subscription_row_for_user',
  'subscription_support_reopen', 'subscription_tax_checked', 'subscription_tax_split',
  'subscription_verify_webhook_signature', 'subscription_webhook_process', 'agency_caller_email',
]

/** Trigger functions. They are invoker-rights and only run when a trigger fires. Anon/PUBLIC EXECUTE on them is
 *  not intended (least privilege), so they are listed here for classification but get no anon/PUBLIC exemption. */
const TRIGGER_FN = [
  'agency_consignment_events_append_only', 'agency_consignments_freeze_identity', 'agency_expense_append_only_guard',
  'agency_incidents_guard', 'agency_invoice_append_only', 'agency_invoice_check_ledger', 'agency_invoice_guard_frozen',
  'agency_jobs_set_completed_at', 'agency_load_plan_children_guard', 'agency_load_plan_order_status_sync',
  'agency_load_plans_guard', 'agency_maintenance_item_guard', 'agency_payroll_guard_adjustments',
  'agency_payroll_guard_line_jobs', 'agency_payroll_guard_lines', 'agency_payroll_guard_period',
  'bump_agency_employment_version', 'bump_agency_truck_version', 'bump_fleet_reservation_version',
  'enforce_agency_truck_driver_assignment', 'guard_fleet_reservation_overlap', 'payment_history_snapshot_guard',
  'platform_billing_settings_no_delete', 'prevent_agency_tariff_mutation', 'release_fleet_reservations_on_job_cancel',
  'release_fleet_reservations_on_offer_transition', 'subscription_append_only_guard', 'subscription_credit_note_guard',
  'subscription_invoice_counters_guard', 'subscription_ledger_append_only', 'subscription_ledger_number_guard',
  'subscriptions_guard_update', 'tracking_pings_immutable', 'guard_transport_agency_rows',
]

/** Internal, no grant to any API role at all. */
const INTERNAL_NO_GRANT_FN = ['subscription_note_refund_exception', 'subscription_note_refusal']

/** The ONLY roles allowed to hold EXECUTE on a candidate function: none for anon/PUBLIC (see PM03). */
const ANON_OR_PUBLIC_EXECUTE_ALLOWED = []

/** Tables that are counters, sequences, ledgers or service-internal: RLS may be off here, but authenticated must
 *  hold no INSERT/UPDATE/DELETE on them. */
const LEDGER_EXEMPT_TABLES = [
  'agency_gr_sequences', 'agency_invoice_sequences', 'agency_consignment_events', 'agency_erp_events',
  'agency_invoice_payments', 'expiry_sweep_runs', 'subscription_invoice_counters', 'subscription_invoices',
  'subscription_credit_notes', 'subscription_sweep_runs', 'subscription_reminders', 'subscription_trial_claims',
  'subscription_backfill_conflicts', 'subscription_refund_exceptions', 'subscription_coupons',
  'subscription_coupon_redemptions', 'razorpay_webhook_events', 'razorpay_webhook_attempts', 'platform_billing_settings',
]

/** Policies whose USING / WITH CHECK is literally true for a write command, reviewed and intended.
 *  contact_inquiries is the public marketing contact form (anonymous insert by design). */
const REVIEWED_OPEN_WRITE_POLICIES = [{ table: 'contact_inquiries', cmd: 'INSERT' }]

/** Column privileges that must be absent for authenticated. */
const SECRET_OR_BILLING_COLUMNS = [
  ['agency_consignments', 'qr_token'],
  ['agency_erp_connections', 'secret_hash'],
  ['subscriptions', 'razorpay_subscription_id'],
]

/** 25 RPCs for the behavioural walk. Each has a real signature. Anon must get 42501; an authenticated caller with
 *  no agency must get a typed denial (42501, no_agency, forbidden, not_authorized or permission denied). */
const U = `'00000000-0000-4000-a000-000000000001'`
const WALK = [
  ['agency_driver_directory', `SELECT public.agency_driver_directory()`],
  ['agency_subscription_entitlement', `SELECT public.agency_subscription_entitlement()`],
  ['agency_subscription_start_trial', `SELECT public.agency_subscription_start_trial()`],
  ['agency_subscription_invoices', `SELECT public.agency_subscription_invoices()`],
  ['agency_payroll_my_lines', `SELECT public.agency_payroll_my_lines()`],
  ['agency_member_invite', `SELECT public.agency_member_invite('probe@invalid.test', 'viewer', 1, 'probe')`],
  ['agency_vehicle_create', `SELECT public.agency_vehicle_create('TN00X0000', 'Probe', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`],
  ['agency_order_import', `SELECT public.agency_order_import(${U}::uuid, 'probe', 'probe', '[]'::jsonb)`],
  ['agency_order_cancel', `SELECT public.agency_order_cancel(${U}::uuid, 1)`],
  ['agency_job_set_status', `SELECT public.agency_job_set_status(${U}::uuid, 'probe')`],
  ['agency_consignment_create', `SELECT public.agency_consignment_create(${U}::uuid, 'probe')`],
  ['agency_consignment_qr', `SELECT public.agency_consignment_qr(${U}::uuid)`],
  ['agency_expense_record', `SELECT public.agency_expense_record(${U}::uuid, 'probe', 1::bigint, '2026-01-01'::date, 'probe', 'probe')`],
  ['agency_expense_summary', `SELECT public.agency_expense_summary('2026-01-01'::date, '2026-01-31'::date)`],
  ['agency_incident_open', `SELECT public.agency_incident_open(${U}::uuid, 'probe', '{}'::jsonb, 'probe')`],
  ['agency_invoice_issue', `SELECT public.agency_invoice_issue(${U}::uuid, '{}'::jsonb, 'probe', 'probe', 18, false, false, 'probe')`],
  ['agency_payroll_open_period', `SELECT public.agency_payroll_open_period('2026-01-01'::date, '2026-01-31'::date, 'probe')`],
  ['agency_payroll_close_period', `SELECT public.agency_payroll_close_period('2026-01-01'::date, '2026-01-31'::date, 'probe')`],
  ['agency_erp_connection_create', `SELECT public.agency_erp_connection_create(${U}::uuid, ${U}::uuid, 'probe', 'probe', 'probe')`],
  ['agency_load_plan_save', `SELECT public.agency_load_plan_save('probe', ${U}::uuid, '{}'::jsonb, '{}'::jsonb, 'probe')`],
  ['agency_tariff_version_publish', `SELECT public.agency_tariff_version_publish(${U}::uuid, 'probe', 'probe', 'probe', 1, '2026-01-01'::date, 'probe', NULL, NULL, 'probe')`],
  ['agency_driver_payout_request', `SELECT public.agency_driver_payout_request(${U}::uuid, 1, 'probe', 'probe')`],
  ['agency_trip_live', `SELECT public.agency_trip_live(${U}::uuid)`],
  ['tracking_ping_record', `SELECT public.tracking_ping_record(${U}::uuid, 1, 1, 1, now())`],
  ['platform_billing_settings_update', `SELECT public.platform_billing_settings_update('probe', 'probe', 'probe', 'probe', 'probe', false)`],
]

// ---------------------------------------------------------------------------
// Harness (same shape as scripts/subscription_journey.db.test.mjs)
// ---------------------------------------------------------------------------
const db = await PGlite.create({ extensions: { uuid_ossp } })
const rawQuery = db.query.bind(db)
const rawExec = db.exec.bind(db)
db.query = async (sql, params) => {
  try {
    return await rawQuery(sql, params)
  } catch (error) {
    error.message = `${error.message} [SQL: ${String(sql).replace(/\s+/g, ' ').trim().slice(0, 140)}]`
    throw error
  }
}
db.exec = async (sql) => {
  try {
    return await rawExec(sql)
  } catch (error) {
    error.message = `${error.message} [SQL: ${String(sql).replace(/\s+/g, ' ').trim().slice(0, 140)}]`
    throw error
  }
}

const results = []
const findings = []

function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function expect(cond, message) {
  if (!cond) throw new Error(message)
}

function firstLine(error) {
  const raw = error && error.message ? error.message : String(error)
  return raw.split('\n')[0].split(' [SQL:')[0].trim()
}

/** A case. A failing assertion records FAIL and the battery keeps going. */
async function pm(id, title, fn) {
  try {
    await fn()
    record(`${id} ${title}`, true)
  } catch (error) {
    record(`${id} ${title}`, false, (error && error.message ? error.message : String(error)).split('\n')[0].slice(0, 300))
  }
}

/** A case whose failure is a real defect in a migration. Failing it is named 'BUG: ...'. */
async function defect(id, title, fn) {
  try {
    await fn()
    record(`${id} ${title}`, true)
  } catch (error) {
    record(`${id} BUG: ${title}`, false, (error && error.message ? error.message : String(error)).split('\n')[0].slice(0, 400))
  }
}

async function su(sql, params = []) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', '{}', false)`)
  return db.query(sql, params)
}

async function suOne(sql, params = []) {
  return (await su(sql, params)).rows[0]
}

/** Runs one statement as `role` with no JWT claims (anon, authenticated, service_role). Restores superuser after. */
async function asRole(role, sql, params = [], claimsSub = null) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    claimsSub ? JSON.stringify({ sub: claimsSub, role }) : '{}',
  ])
  await db.exec(`SET ROLE ${role}`)
  try {
    const res = await db.query(sql, params)
    const cell = res.rows.length ? Object.values(res.rows[0])[0] : null
    return { raised: false, value: typeof cell === 'string' ? safeJson(cell) : cell }
  } catch (error) {
    return { raised: true, code: error.code || null, message: firstLine(error) }
  } finally {
    await db.exec('RESET ROLE')
    await db.query(`SELECT set_config('request.jwt.claims', '{}', false)`)
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// ---------------------------------------------------------------------------
// Replay (fresh database, every migration, in filename order)
// ---------------------------------------------------------------------------
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
const laterFiles = files.filter((f) => f.slice(0, 14) >= FROM_VERSION)
let replayError = null

await db.exec(BOOTSTRAP)
for (const file of files) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  } catch (error) {
    replayError = `migration ${file} failed: ${firstLine(error)}`
    break
  }
}

// Candidate functions: every CREATE [OR REPLACE] FUNCTION public.<name> in migrations >= FROM_VERSION.
const candidates = new Set()
for (const f of laterFiles) {
  for (const m of readFileSync(join(MIGRATIONS_DIR, f), 'utf8').matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_0-9]+)/gi)) {
    candidates.add(m[1])
  }
}
// Tables created by migrations >= FROM_VERSION.
const createdTables = new Set()
for (const f of laterFiles) {
  for (const m of readFileSync(join(MIGRATIONS_DIR, f), 'utf8').matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-z_0-9]+)/gi)) {
    createdTables.add(m[1])
  }
}

// Confirmed in pg_proc (schema public), with the privilege matrix recorded for anon, authenticated, service_role, PUBLIC.
const procRows = replayError
  ? []
  : (
      await su(
        `SELECT p.proname, p.oid::regprocedure::text AS sig, p.prosecdef AS secdef, p.proconfig::text AS cfg,
                p.prorettype::regtype::text AS rettype,
                has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_x,
                has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x,
                has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_x,
                EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS pub_x
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
          WHERE p.proname = ANY($1::text[]) ORDER BY p.proname, p.oid`,
        [[...candidates]]
      )
    ).rows
const confirmed = new Set(procRows.map((p) => p.proname))
const matrix = procRows.map((p) => ({
  name: p.proname,
  sig: p.sig,
  rettype: p.rettype,
  secdef: p.secdef === true,
  searchPathPinned: /search_path=/.test(p.cfg || ''),
  anon: p.anon_x === true,
  authenticated: p.auth_x === true,
  service_role: p.svc_x === true,
  PUBLIC: p.pub_x === true,
}))
const isTrigger = (row) => row.rettype === 'trigger'

const AUTH_SET = new Set(AUTHENTICATED_RPC)
const SVC_SET = new Set(SERVICE_ONLY_FN)
const TRIG_SET = new Set(TRIGGER_FN)
const INTERNAL_SET = new Set(INTERNAL_NO_GRANT_FN)

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------
await pm('PM01', 'every migration replays on a fresh database', async () => {
  expect(replayError === null, replayError || 'replay ok')
})

await pm('PM02', 'candidate enumeration: every function from migrations >= 20261008 exists in pg_proc', async () => {
  expect(laterFiles.length > 0, 'no migrations >= 20261008 found')
  expect(candidates.size > 0, 'no candidate functions parsed')
  const missing = [...candidates].filter((n) => !confirmed.has(n))
  expect(missing.length === 0, `parsed but absent from pg_proc: ${missing.join(', ')}`)
  console.log(`      candidates parsed=${candidates.size} confirmed=${confirmed.size} migrations=${laterFiles.length}`)
})

await pm('PM03', 'every candidate function is classified in exactly one explicit list', async () => {
  const unclassified = matrix.filter((m) => !(AUTH_SET.has(m.name) || SVC_SET.has(m.name) || TRIG_SET.has(m.name) || INTERNAL_SET.has(m.name)))
  expect(unclassified.length === 0, `unclassified: ${unclassified.map((m) => m.name).join(', ')}`)
  const overlap = AUTHENTICATED_RPC.filter((n) => SVC_SET.has(n) || TRIG_SET.has(n))
  expect(overlap.length === 0, `listed in two classes: ${overlap.join(', ')}`)
})

await pm('PM04', 'every allow-listed authenticated RPC exists and is executable by authenticated (no allow-list drift)', async () => {
  const absent = AUTHENTICATED_RPC.filter((n) => !confirmed.has(n))
  expect(absent.length === 0, `allow-listed but not in pg_proc: ${absent.join(', ')}`)
  const notGranted = matrix.filter((m) => AUTH_SET.has(m.name) && !m.authenticated).map((m) => m.name)
  expect(notGranted.length === 0, `allow-listed but not executable by authenticated: ${notGranted.join(', ')}`)
})

await defect('PM05', 'anon and PUBLIC hold EXECUTE only on the explicit allow-list (empty)', async () => {
  const offenders = matrix.filter((m) => (m.anon || m.PUBLIC) && !ANON_OR_PUBLIC_EXECUTE_ALLOWED.includes(m.name))
  for (const m of offenders) console.log(`      PM05 ${m.sig} anon=${m.anon} PUBLIC=${m.PUBLIC} rettype=${m.rettype}`)
  expect(
    offenders.length === 0,
    `anon/PUBLIC EXECUTE on ${offenders.length}: ${offenders.map((m) => `${m.name}[${m.anon ? 'anon' : ''}${m.anon && m.PUBLIC ? ',' : ''}${m.PUBLIC ? 'PUBLIC' : ''}]`).join(', ')}`
  )
})

await defect('PM06', 'every SECURITY DEFINER function executable by authenticated is allow-listed', async () => {
  const offenders = matrix.filter((m) => m.secdef && m.authenticated && !AUTH_SET.has(m.name)).map((m) => m.name)
  expect(offenders.length === 0, `SECURITY DEFINER + authenticated, not allow-listed: ${offenders.join(', ')}`)
})

await pm('PM07', 'service-only and trigger functions are not executable by authenticated', async () => {
  const offenders = matrix.filter((m) => (SVC_SET.has(m.name) || INTERNAL_SET.has(m.name)) && m.authenticated).map((m) => m.name)
  expect(offenders.length === 0, `service-only but authenticated can execute: ${offenders.join(', ')}`)
})

await defect('PM08', 'every SECURITY DEFINER function in schema public pins search_path (proconfig)', async () => {
  const rows = (
    await su(
      `SELECT p.oid::regprocedure::text AS sig, p.proconfig::text AS cfg
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.prosecdef`
    )
  ).rows
  const unpinned = rows.filter((r) => !/search_path=/.test(r.cfg || '')).map((r) => r.sig)
  expect(unpinned.length === 0, `SECURITY DEFINER without pinned search_path: ${unpinned.join(', ')}`)
  console.log(`      SECURITY DEFINER functions in public: ${rows.length}`)
})

await pm('PM09', 'every table created by migrations >= 20261008 exists and has RLS enabled (or is a reviewed ledger)', async () => {
  const rows = (
    await su(
      `SELECT c.relname, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`
    )
  ).rows
  const byName = new Map(rows.map((r) => [r.relname, r.rls === true]))
  const absent = [...createdTables].filter((t) => !byName.has(t))
  expect(absent.length === 0, `created by migration but absent: ${absent.join(', ')}`)
  const noRls = [...createdTables].filter((t) => !byName.get(t) && !LEDGER_EXEMPT_TABLES.includes(t))
  expect(noRls.length === 0, `RLS disabled and not a reviewed ledger/counter: ${noRls.join(', ')}`)
  console.log(`      tables created >= 20261008: ${createdTables.size}, RLS off: ${[...createdTables].filter((t) => !byName.get(t)).join(', ') || 'none'}`)
})

await pm('PM10', 'ledger, counter and sequence tables: authenticated holds no INSERT, UPDATE or DELETE', async () => {
  const offenders = []
  for (const t of LEDGER_EXEMPT_TABLES) {
    const r = await suOne(
      `SELECT has_table_privilege('authenticated', format('public.%I', $1::text), 'INSERT') AS i,
              has_table_privilege('authenticated', format('public.%I', $1::text), 'UPDATE') AS u,
              has_table_privilege('authenticated', format('public.%I', $1::text), 'DELETE') AS d`,
      [t]
    )
    if (r.i || r.u || r.d) offenders.push(`${t}(i=${r.i},u=${r.u},d=${r.d})`)
  }
  expect(offenders.length === 0, `authenticated can write: ${offenders.join(', ')}`)
})

await defect('PM11', 'no policy grants write to authenticated/PUBLIC with USING (true) or WITH CHECK (true)', async () => {
  const pols = (
    await su(
      `SELECT tablename, policyname, cmd, array_to_string(roles, ',') AS roles, qual, with_check
         FROM pg_policies WHERE schemaname = 'public'`
    )
  ).rows
  const offenders = pols.filter((p) => {
    if (!['INSERT', 'UPDATE', 'DELETE', 'ALL'].includes(p.cmd)) return false
    const roles = p.roles.split(',')
    if (!roles.includes('authenticated') && !roles.includes('public')) return false
    const open = (p.qual || '').trim() === 'true' || (p.with_check || '').trim() === 'true'
    if (!open) return false
    return !REVIEWED_OPEN_WRITE_POLICIES.some((r) => r.table === p.tablename && (r.cmd === p.cmd || p.cmd === 'ALL'))
  })
  // Drift guard: a reviewed exemption that no longer exists must be removed from the list, not silently kept.
  for (const r of REVIEWED_OPEN_WRITE_POLICIES) {
    expect(pols.some((p) => p.tablename === r.table && p.cmd === r.cmd), `reviewed exemption no longer present: ${r.table} ${r.cmd}`)
    findings.push(`reviewed open write policy kept (intended public form): ${r.table} ${r.cmd} for anon/authenticated`)
  }
  expect(offenders.length === 0, `open write policy: ${offenders.map((p) => `${p.tablename}.${p.policyname}(${p.cmd})`).join(', ')}`)
})

await pm('PM12', 'secret, token and payment-identifier columns: authenticated has no column SELECT', async () => {
  const offenders = []
  for (const [table, col] of SECRET_OR_BILLING_COLUMNS) {
    const r = await suOne(
      `SELECT has_column_privilege('authenticated', format('public.%I', $1::text), $2::text, 'SELECT') AS ok`,
      [table, col]
    )
    if (r.ok) offenders.push(`${table}.${col}`)
  }
  // Every column that holds a secret or credential material, on the tenant tables and the billing tables.
  // Business identifiers (payment ids, order ids, file / payload hashes, secret_hint) are reviewed below, not failed.
  const SECRETISH = '(secret_hash|^secret$|_secret$|token|signature|password|api_key)'
  const cols = (
    await su(
      `SELECT c.table_name, c.column_name FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND (c.table_name = ANY($1::text[]) OR c.table_name LIKE 'subscription%' OR c.table_name LIKE 'razorpay%'
               OR c.table_name = 'payment_history' OR c.table_name = 'platform_billing_settings')
          AND c.column_name ~ $2`,
      [[...createdTables], SECRETISH]
    )
  ).rows
  for (const c of cols) {
    const r = await suOne(
      `SELECT has_column_privilege('authenticated', format('public.%I', $1::text), $2::text, 'SELECT') AS ok`,
      [c.table_name, c.column_name]
    )
    if (r.ok) offenders.push(`${c.table_name}.${c.column_name}`)
  }
  expect(offenders.length === 0, `authenticated can read: ${offenders.join(', ')}`)
  // Informational: identifiers and hashes that authenticated can read (reviewed, not failing).
  const idCols = (
    await su(
      `SELECT c.table_name, c.column_name FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_name ~ '(razorpay|payment_id|order_id|_hash$)'
          AND (c.table_name = ANY($1::text[]) OR c.table_name LIKE 'subscription%' OR c.table_name LIKE 'razorpay%' OR c.table_name = 'payment_history')`,
      [[...createdTables]]
    )
  ).rows
  const readableIds = []
  for (const c of idCols) {
    const r = await suOne(`SELECT has_column_privilege('authenticated', format('public.%I', $1::text), $2::text, 'SELECT') AS ok`, [c.table_name, c.column_name])
    if (r.ok) readableIds.push(`${c.table_name}.${c.column_name}`)
  }
  findings.push(`reviewed: ${readableIds.length} identifier/hash columns readable by authenticated (business ids, not credentials): ${readableIds.join(', ')}`)
  console.log(`      secret columns checked: ${cols.length + SECRET_OR_BILLING_COLUMNS.length}`)
  findings.push('reviewed: subscription_invoices / subscription_credit_notes are readable by authenticated by design (GST invoice copy, RLS-scoped to the agency)')
})

// Real least-privilege gap: agency_driver_employment keeps the default anon table grant (sibling agency tables REVOKE it).
// RLS blocks anon today because every policy is TO authenticated, so this is hygiene, not an open door.
await defect('PM13', 'anon holds no table DML on any public table created by migrations >= 20261008 (RLS masks agency_driver_employment)', async () => {
  const offenders = []
  for (const t of createdTables) {
    const r = await suOne(
      `SELECT has_table_privilege('anon', format('public.%I', $1::text), 'INSERT') OR
              has_table_privilege('anon', format('public.%I', $1::text), 'UPDATE') OR
              has_table_privilege('anon', format('public.%I', $1::text), 'DELETE') AS w`,
      [t]
    )
    if (r.w) offenders.push(t)
  }
  expect(offenders.length === 0, `anon can write: ${offenders.join(', ')}`)
})

// Behavioural walk: real calls, real roles.
const CALLER_ID = '00000000-0000-4000-b000-0000000000aa'
await su(`INSERT INTO auth.users (id, email) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [CALLER_ID, 'no-agency@invalid.test'])

/** Typed denial: SQLSTATE 42501, a typed token in the raised message, or a typed refusal {ok:false, error:<token>}.
 *  A raw exception without a typed token (e.g. P0001 "No agency profile found") and any {ok:true} are NOT typed. */
const denialTyped = (r) => {
  if (r.raised) return r.code === '42501' || /\b(no_agency|forbidden|not_authorized|unauthorized|permission denied)\b/i.test(r.message)
  return r.value && typeof r.value === 'object' && r.value.ok === false && typeof r.value.error === 'string' && r.value.error.length > 0
}
const denialAnon = (r) => r.raised && (r.code === '42501' || /permission denied/i.test(r.message))

/** Read-style success that discloses nothing: ok:true and every array-valued field is empty (no rows of any agency). */
const emptyRead = (r) =>
  !r.raised &&
  r.value &&
  typeof r.value === 'object' &&
  r.value.ok === true &&
  Object.values(r.value).every((v) => !Array.isArray(v) || v.length === 0)

const walkAnon = []
const walkAuth = []
const walkAuthRaised = []
for (const [name, sql] of WALK) {
  const a = await asRole('anon', sql)
  if (!denialAnon(a)) walkAnon.push(`${name} -> ${a.raised ? `${a.code} ${a.message}` : JSON.stringify(a.value).slice(0, 80)}`)
  const u = await asRole('authenticated', sql, [], CALLER_ID)
  const refused = u.raised || (u.value && typeof u.value === 'object' && u.value.ok === false && typeof u.value.error === 'string')
  if (!refused && !emptyRead(u)) walkAuth.push(`${name} -> ${u.raised ? `${u.code} ${u.message}` : JSON.stringify(u.value).slice(0, 80)}`)
  walkAuthRaised.push(`${name}:${u.raised ? 'raised' : u.value && u.value.ok === false ? 'typed-refusal' : 'empty-read'}`)
}

await defect('PM14', 'behavioural walk, anon: 25 sampled RPCs are denied with 42501, never succeed', async () => {
  expect(WALK.length === 25, `walk has ${WALK.length} RPCs, expected 25`)
  expect(walkAnon.length === 0, `not denied for anon: ${walkAnon.join(' | ')}`)
})

await defect('PM15', 'behavioural walk, authenticated with no agency: 25 sampled RPCs raise, return a typed refusal, or return empty data; never a row', async () => {
  console.log(`      PM15 outcomes: ${walkAuthRaised.join(', ')}`)
  for (const line of walkAuth) console.log(`      PM15 leaks or unexpected success: ${line}`)
  expect(walkAuth.length === 0, `no-agency caller got data or unexpected success for ${walkAuth.length} of 25 (see lines above)`)
})

// ---------------------------------------------------------------------------
// Findings: helper functions executable by authenticated that take an arbitrary id (oracle, no caller bind)
// ---------------------------------------------------------------------------
for (const name of ['driver_is_assigned_to_agency', 'shipment_accepts_agency_jobs', 'agency_vehicle_allocation_eligible', 'agency_driver_allocation_eligible']) {
  if (AUTH_SET.has(name)) findings.push(`reviewed: ${name} is authenticated-executable and takes an arbitrary id (boolean oracle only)`)
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.pass).length
const failed = results.filter((r) => !r.pass)
console.log(`\nFINDINGS (reviewed, not failing):`)
for (const f of findings) console.log(`  - ${f}`)
console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
for (const f of failed) console.log(`  FAIL ${f.name} — ${f.detail}`)
process.exit(failed.length === 0 ? 0 : 1)
