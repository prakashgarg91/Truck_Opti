#!/usr/bin/env node
/**
 * Production rehearsal: apply the NEWER migrations onto a database that already holds LEGACY rows.
 *
 * The migration chain has only ever run on empty databases. The real production project is old and
 * populated. This script rebuilds the "old production" state on a throwaway embedded PostgreSQL
 * (nothing hosted is touched), seeds realistic legacy rows, then applies the remaining migrations
 * one file at a time, each in its own transaction, exactly like `supabase db push` would.
 *
 * Usage:
 *   node scripts/prod/legacy_replay.mjs                       default cut-off, stop at the first failure
 *   node scripts/prod/legacy_replay.mjs --cutoff=20260501120000
 *   node scripts/prod/legacy_replay.mjs --continue-after-failure      keep going after a failed file
 *   node scripts/prod/legacy_replay.mjs --continue-after-failure --remediate
 *        after a failure, apply the owner's data fix for that file (see REMEDIATIONS), retry once, and
 *        record it as "needs_data_fix". The seed is never weakened: the first attempt always runs on
 *        the raw legacy rows.
 *   node scripts/prod/legacy_replay.mjs --drift               also seed rows a drifted production could hold
 *        (old subscriptions.status CHECK missing, unknown status value, unmapped truck catalog row)
 *   node scripts/prod/legacy_replay.mjs --preflight-check     run scripts/prod/preflight_inventory.sql against the seeded legacy DB
 *        (proves every block is a plain SELECT and shows what the owner would see for these hazards); no migrations run
 *   node scripts/prod/legacy_replay.mjs --list                list every migration and mark the cut-off
 *   RACE_MODULES=D:/tmp/pgrace   folder holding node_modules/{embedded-postgres,pg}
 *
 * Cut-off: the production database was "last migrated around mid-2026". The files dated 202605* are
 * 20260501101500, 20260501113000, 20260501120000, 20260517010000, 20260531110000. The default cut-off is
 * 20260501120000: the last of the 20260501 billing-hardening group (unique subscription per user,
 * unique invoice payment id), which is the last file whose presence is certain for any project that was
 * "mid-2026" in the billing sense. The files from 20260517 onward (billing bucket, agency status write
 * guard, 4-digit OTP, driver guards, OTP verification) plus 2026-06/07 files are therefore REPLAYED as
 * pending. The owner confirms the real cut-off with scripts/prod/preflight_inventory.sql (section 1).
 *
 * Exit code: 0 = every pending migration applied; 1 = at least one migration failed.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startThrowaway } from './_pgserver.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..', '..')
const MIG = join(ROOT, 'supabase', 'migrations')
const EVIDENCE = join(ROOT, 'evidence', 'prod-rehearsal')

const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const opt = (n, d) => (args.find((a) => a.startsWith(`--${n}=`)) ?? '').split('=')[1] ?? d
const CUTOFF = opt('cutoff', '20260501120000')
const CONTINUE = flag('--continue-after-failure')
const REMEDIATE = flag('--remediate')
const DRIFT = flag('--drift')
const PREFLIGHT_CHECK = flag('--preflight-check')
const DATE = opt('date', new Date().toISOString().slice(0, 10))

const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
const ver = (f) => f.slice(0, f.indexOf('_'))

if (flag('--list')) {
  for (const f of files) {
    const v = ver(f)
    const tag = v <= CUTOFF ? 'legacy (applied before seed)' : 'PENDING (replayed on legacy rows)'
    const mark = v > '20260501' && v < '20261000' ? '  <-- 2026-05..07' : ''
    console.log(`${v}  ${tag}${mark}  ${f}`)
  }
  process.exit(0)
}
if (CUTOFF < '20260418005000') {
  console.error('The seed supports cut-offs from 20260418005000 (PAN, login_id and payouts contracts exist from there).')
  process.exit(2)
}
const legacyFiles = files.filter((f) => ver(f) <= CUTOFF)
const pendingFiles = files.filter((f) => ver(f) > CUTOFF)
const lastLegacy = legacyFiles[legacyFiles.length - 1]

/** Data fixes an owner would run on production BEFORE the push so the file can apply. Used only by --remediate. */
const REMEDIATIONS = {
  '20261008000000_agency_fleet_foundation.sql': `
    -- Make duplicate (agency_id, rc_number) rows unique by suffixing the newer duplicate (the owner decides the real RC).
    WITH d AS (SELECT id, row_number() OVER (PARTITION BY agency_id, rc_number ORDER BY created_at, id) rn FROM public.agency_trucks)
    UPDATE public.agency_trucks t SET rc_number = t.rc_number || '-DUP-' || left(t.id::text, 4) FROM d WHERE d.id = t.id AND d.rn > 1;
    -- drift only: give a hand-added catalog truck a stable code (the migration refuses to invent one)
    ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS code TEXT;
    UPDATE public.trucks SET code = 'custom_' || left(id::text, 6) WHERE name = 'Mahindra Bolero Pickup';`,
  '20261026000000_agency_subscriptions.sql': `
    -- drift only: map the unknown status the new CHECK rejects
    UPDATE public.subscriptions SET status = 'trial' WHERE status = 'trialing';`,
  '20261015000000_agency_job_truck_commands.sql': `
    WITH d AS (SELECT id, row_number() OVER (PARTITION BY driver_id ORDER BY created_at, id) rn FROM public.agency_trucks WHERE driver_id IS NOT NULL)
    UPDATE public.agency_trucks t SET driver_id = NULL FROM d WHERE d.id = t.id AND d.rn > 1;`,
}

// ---------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------
let uuidSeq = 0
const U = (prefix, n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`
const ID = {
  usr: (n) => U('a1000001', n),
  cus: (n) => U('a2000002', n),
  ag: (n) => U('a3000003', n),
  drv: (n) => U('a4000004', n),
  trk: (n) => U('a5000005', n),
  shp: (n) => U('a6000006', n),
  job: (n) => U('a7000007', n),
  off: (n) => U('a8000008', n),
  sub: (n) => U('a9000009', n),
  inv: (n) => U('aa00000a', n),
  pay: (n) => U('ab00000b', n),
  pot: (n) => U('ac00000c', n),
  ntf: (n) => U('ad00000d', n),
  misc: (n) => U('ae00000e', n),
}
const daysFromNow = (d) => new Date(Date.now() + d * 86400000).toISOString()

const warnings = []
const stepLog = []

async function main() {
  console.log(`legacy_replay: cut-off ${CUTOFF} (${legacyFiles.length} legacy files, ${pendingFiles.length} pending). mode: ${CONTINUE ? 'continue-after-failure' : 'stop-at-first-failure'}${REMEDIATE ? ' + remediate' : ''}${DRIFT ? ' + drift' : ''}`)
  console.log(`last legacy file applied: ${lastLegacy}`)
  const s = await startThrowaway('legacy')
  const db = s.client
  const q = (sql, p) => db.query(sql, p)
  const rows = async (sql, p) => (await db.query(sql, p)).rows
  const report = {
    generated: new Date().toISOString(),
    postgres: s.version,
    cutoff: CUTOFF,
    last_legacy_migration: lastLegacy,
    mode: { continue_after_failure: CONTINUE, remediate: REMEDIATE, drift: DRIFT },
    legacy_files: legacyFiles,
    pending_files: pendingFiles,
    files_2026_05_to_07: files.filter((f) => ver(f) >= '20260501' && ver(f) < '20261000'),
    seed_warnings: warnings,
    migrations: [],
  }

  try {
    // 1. legacy schema -------------------------------------------------------------------
    for (const f of legacyFiles) {
      try {
        await q(readFileSync(join(MIG, f), 'utf8'))
      } catch (e) {
        throw new Error(`legacy base file ${f} failed (cannot build the legacy state): ${e.message}`)
      }
    }
    const legacyTables = (await rows(`SELECT c.relname AS t FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY 1`)).map((r) => r.t)
    report.legacy_tables = legacyTables

    // 2. seed ----------------------------------------------------------------------------
    const cols = {}
    for (const r of await rows(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`)) {
      ;(cols[r.table_name] ??= new Set()).add(r.column_name)
    }
    const hasUniqueUser = (await rows(`SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='subscriptions' AND indexdef ILIKE 'CREATE UNIQUE%(user_id)%'`)).length > 0
    const seedStats = await seed({ q, rows, cols, hasUniqueUser })
    report.seed = seedStats

    if (PREFLIGHT_CHECK) {
      await runPreflightCheck(db, legacyFiles)
      return await s.stop()
    }

    // 3. BEFORE state --------------------------------------------------------------------
    const beforeCounts = await countAll(rows, legacyTables)
    const beforeSnap = await snapshotAll(rows, legacyTables)
    const beforeSubs = await subState(rows, false)
    const beforePlans = await rows(`SELECT name, tier, price_monthly, price_yearly, trucks_limit FROM public.subscription_plans ORDER BY price_monthly`)
    const beforeStorage = await rows(`SELECT count(*)::int n FROM storage.buckets`)
    report.before = { counts: beforeCounts, plans: beforePlans, subscriptions: beforeSubs, storage_buckets: beforeStorage[0].n }

    // 4. apply pending migrations ------------------------------------------------------
    let stopped = false
    for (const f of pendingFiles) {
      const entry = { file: f, version: ver(f) }
      if (stopped) {
        entry.result = 'not_applied'
        entry.note = 'chain stopped at the first failure (default mode, same as db push)'
        report.migrations.push(entry)
        continue
      }
      const sql = readFileSync(join(MIG, f), 'utf8')
      const t0 = Date.now()
      let err = await applyOne(db, sql)
      entry.ms = Date.now() - t0
      if (!err) {
        entry.result = 'ok'
      } else {
        entry.result = 'FAILED'
        entry.sqlstate = err.code ?? null
        entry.message = String(err.message).split('\n')[0]
        entry.detail = err.detail ?? null
        entry.where = err.where ? String(err.where).split('\n')[0] : null
        entry.failing_statement = failingStatement(sql, err)
        entry.cascade = isCascade(err)
        if (CONTINUE && REMEDIATE && REMEDIATIONS[f]) {
          try {
            await q('BEGIN')
            await q(REMEDIATIONS[f])
            await q('COMMIT')
            entry.remediation_sql = REMEDIATIONS[f].trim()
            const err2 = await applyOne(db, sql)
            if (!err2) {
              entry.result = 'needs_data_fix'
              entry.note = 'applies only after the owner data fix in remediation_sql'
            } else {
              entry.retry_error = `${err2.code}: ${String(err2.message).split('\n')[0]}`
            }
          } catch (e) {
            await q('ROLLBACK').catch(() => {})
            entry.retry_error = `remediation itself failed: ${e.message}`
          }
        }
        if (entry.result === 'FAILED' && !CONTINUE) stopped = true
      }
      report.migrations.push(entry)
      const tag = entry.result === 'ok' ? 'ok' : `${entry.result} ${entry.sqlstate ?? ''} ${entry.message ?? ''}`
      console.log(`  ${f}  ${tag}`)
    }

    const failed = report.migrations.filter((m) => m.result === 'FAILED')
    const fixed = report.migrations.filter((m) => m.result === 'needs_data_fix')
    report.summary = {
      applied_ok: report.migrations.filter((m) => m.result === 'ok').length,
      failed: failed.map((m) => ({ file: m.file, sqlstate: m.sqlstate, message: m.message, cascade: m.cascade })),
      needs_data_fix: fixed.map((m) => m.file),
      not_applied: report.migrations.filter((m) => m.result === 'not_applied').length,
    }

    // 5. AFTER state ---------------------------------------------------------------------
    const afterCounts = await countAll(rows, legacyTables)
    report.after = { counts: afterCounts }
    report.row_counts = legacyTables.map((t) => ({
      table: t,
      before: beforeCounts[t],
      after: afterCounts[t],
      lost: afterCounts[t] === null ? null : Math.max(0, beforeCounts[t] - afterCounts[t]),
    }))
    report.rows_lost = report.row_counts.filter((r) => r.lost > 0)
    report.new_table_counts = await newTableCounts(rows, legacyTables)

    const afterSnap = await snapshotAll(rows, legacyTables)
    report.silent_changes = diffSnapshots(beforeSnap, afterSnap)

    const hasAgencyCol = (await rows(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='agency_id'`)).length > 0
    const subsExists = report.migrations.find((m) => ver(m.file) === '20261026000000')?.result
    report.after.subscriptions = await subState(rows, hasAgencyCol)
    report.subscription_changes = joinSubs(beforeSubs, report.after.subscriptions)
    report.after.plans = await rows(`SELECT name, tier, price_monthly, price_yearly, trucks_limit${await colIf(rows, 'subscription_plans', 'drivers_limit')} FROM public.subscription_plans ORDER BY price_monthly`)
    report.plan_price_changes = beforePlans.map((b) => {
      const a = report.after.plans.find((p) => p.name === b.name)
      return { plan: b.name, monthly_before: b.price_monthly, monthly_after: a?.price_monthly, yearly_before: b.price_yearly, yearly_after: a?.price_yearly, yearly_delta_paise: a ? a.price_yearly - b.price_yearly : null }
    })
    report.backfill_conflicts = (await tableExists(rows, 'subscription_backfill_conflicts'))
      ? await rows(`SELECT c.reason, c.subscription_id, c.user_id, c.candidate_agency_ids, c.chosen_agency_id, c.details FROM public.subscription_backfill_conflicts c ORDER BY logged_at, c.id`)
      : null
    report.trial_claims = (await tableExists(rows, 'subscription_trial_claims'))
      ? await rows(`SELECT c.agency_id, ta.company_name, c.gstin_norm, c.phone_norm, c.subscription_id FROM public.subscription_trial_claims c JOIN public.transport_agencies ta ON ta.id = c.agency_id ORDER BY ta.created_at`)
      : null
    report.agencies_attached_without_claim = hasAgencyCol && report.trial_claims
      ? await rows(`SELECT ta.id, ta.company_name, ta.gstin, ta.contact_phone FROM public.transport_agencies ta WHERE EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.agency_id = ta.id) AND NOT EXISTS (SELECT 1 FROM public.subscription_trial_claims c WHERE c.agency_id = ta.id)`)
      : null

    report.unvalidated_constraints = await unvalidatedScan(db)
    report.legacy_values_outside_new_rules = hasAgencyCol ? await legacyOutsideRules(rows, report.after.plans) : null

    // 6. sweep dry-run (rolled back) -----------------------------------------------------
    report.sweep_dry_run = await sweepDryRun(db, rows, hasAgencyCol, report.migrations)

    report.recommendation_inputs = {
      failed_files: failed.map((m) => m.file),
      rows_lost: report.rows_lost.length,
      silent_change_tables: Object.keys(report.silent_changes),
    }
  } finally {
    await s.stop()
  }

  mkdirSync(EVIDENCE, { recursive: true })
  const suffix = [CONTINUE ? 'continue' : '', REMEDIATE ? 'remediated' : '', DRIFT ? 'drift' : '', CUTOFF === '20260501120000' ? '' : `cutoff-${CUTOFF}`].filter(Boolean).join('-')
  const out = join(EVIDENCE, `legacy-replay-${DATE}${suffix ? '-' + suffix : ''}.json`)
  writeFileSync(out, JSON.stringify(report, null, 2))
  printSummary(report)
  console.log(`\nevidence: ${out}`)
  process.exit(report.migrations.some((m) => m.result === 'FAILED') ? 1 : 0)
}

// ---------------------------------------------------------------------------------------------
// applying one file in its own transaction
// ---------------------------------------------------------------------------------------------
async function runPreflightCheck(db, legacy) {
  await db.query('CREATE SCHEMA supabase_migrations')
  await db.query('CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text)')
  for (const f of legacy) await db.query('INSERT INTO supabase_migrations.schema_migrations VALUES ($1, NULL, $2)', [ver(f), f.slice(ver(f).length + 1, -4)])
  const text = readFileSync(join(here, 'preflight_inventory.sql'), 'utf8')
  const blocks = text.split(/^-- (?=Q\d+ )/m).slice(1)
  const out = []
  let bad = 0
  for (const b of blocks) {
    const id = b.slice(0, 3)
    const sql = b.split(/\r?\n/).slice(1).filter((l) => !l.trim().startsWith('--')).join(' ').trim()
    const plain = /^(SELECT|WITH)\b/i.test(sql) && !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT)\b/i.test(sql.replace(/'[^']*'/g, ''))
    let res
    try {
      await db.query('BEGIN READ ONLY')
      const r = await db.query(sql)
      await db.query('ROLLBACK')
      res = { id, plain_select: plain, rows: r.rowCount, sample: r.rows.slice(0, 12) }
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {})
      res = { id, plain_select: plain, error: e.message.split(String.fromCharCode(10))[0] }
    }
    if (!plain || res.error) bad++
    console.log(`  ${id} ${res.error ? 'ERROR ' + res.error : res.rows + ' rows'}${plain ? '' : '  NOT A PLAIN SELECT'}`)
    out.push(res)
  }
  mkdirSync(EVIDENCE, { recursive: true })
  const file = join(EVIDENCE, `preflight-on-seeded-legacy-${DATE}.json`)
  writeFileSync(file, JSON.stringify({ generated: new Date().toISOString(), note: 'preflight_inventory.sql executed (READ ONLY transactions) against the SEEDED legacy rehearsal database, not production. supabase_migrations.schema_migrations is a stub filled from the legacy files.', blocks: blocks.length, problems: bad, results: out }, null, 2))
  console.log(`preflight check: ${blocks.length} blocks, ${bad} problems. evidence: ${file}`)
}

async function applyOne(db, sql) {
  try {
    await db.query('BEGIN')
    await db.query(sql)
    await db.query('COMMIT')
    return null
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {})
    return e
  }
}
const isCascade = (e) => ['42P01', '42703', '42883', '42704', '3F000'].includes(e.code)

/** First 200 chars of the statement that raised the error (best effort for errors raised inside DO blocks). */
function failingStatement(sql, err) {
  const pos = Number(err.position)
  if (pos > 0 && !err.internalPosition) {
    // statement start: previous ';' that ends a line, outside of the error position
    let start = sql.lastIndexOf(';\n', pos - 1)
    start = start < 0 ? 0 : start + 2
    return sql.slice(start, pos + 200).replace(/\s+/g, ' ').trim().slice(0, 200)
  }
  // error raised inside plpgsql (DO block): locate the RAISE text or constraint name in the file
  const needles = [err.constraint, String(err.message).split('\n')[0].slice(0, 40), err.table].filter(Boolean)
  for (const n of needles) {
    const i = sql.indexOf(n)
    if (i >= 0) {
      let start = sql.lastIndexOf('\nDO ', i)
      const alt = sql.lastIndexOf(';\n', i)
      if (start < 0 || alt > start) start = alt < 0 ? 0 : alt + 2
      return sql.slice(start, start + 600).replace(/\s+/g, ' ').trim().slice(0, 200)
    }
  }
  return String(err.where ?? err.message).replace(/\s+/g, ' ').slice(0, 200)
}

// ---------------------------------------------------------------------------------------------
// state capture
// ---------------------------------------------------------------------------------------------
async function countAll(rows, tables) {
  const out = {}
  for (const t of tables) {
    try {
      out[t] = (await rows(`SELECT count(*)::int n FROM public.${JSON.stringify(t)}`))[0].n
    } catch {
      out[t] = null
    }
  }
  return out
}
async function tableExists(rows, t) {
  return (await rows(`SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname=$1 AND relkind='r'`, [t])).length > 0
}
async function colIf(rows, t, c) {
  return (await rows(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`, [t, c])).length ? `, ${c}` : ''
}
async function newTableCounts(rows, legacyTables) {
  const all = (await rows(`SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' ORDER BY 1`)).map((r) => r.relname)
  const out = {}
  for (const t of all.filter((t) => !legacyTables.includes(t))) {
    const n = (await rows(`SELECT count(*)::int n FROM public.${JSON.stringify(t)}`))[0].n
    if (n > 0) out[t] = n
  }
  return out
}

/** table -> { pk-string -> row json } for every legacy table (pk columns read from pg_index). */
async function snapshotAll(rows, tables) {
  const snap = {}
  for (const t of tables) {
    const pk = (await rows(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid=('public.'||quote_ident($1))::regclass AND i.indisprimary ORDER BY a.attnum`, [t])).map((r) => r.attname)
    const keyExpr = pk.length ? pk.map((c) => `t.${JSON.stringify(c)}::text`).join(` || '|' || `) : `t.ctid::text`
    try {
      const data = await rows(`SELECT ${keyExpr} AS k, to_jsonb(t) AS j FROM public.${JSON.stringify(t)} t`)
      snap[t] = Object.fromEntries(data.map((r) => [r.k, r.j]))
    } catch {
      snap[t] = {}
    }
  }
  return snap
}
function diffSnapshots(before, after) {
  const out = {}
  for (const [t, rowsB] of Object.entries(before)) {
    const rowsA = after[t] ?? {}
    const cols = {}
    let changedRows = 0
    let deleted = 0
    for (const [k, b] of Object.entries(rowsB)) {
      const a = rowsA[k]
      if (!a) {
        deleted++
        continue
      }
      let changed = false
      for (const c of Object.keys(b)) {
        if (c === 'updated_at') continue
        if (JSON.stringify(b[c]) !== JSON.stringify(a[c])) {
          changed = true
          const e = (cols[c] ??= { rows: 0, sample: [] })
          e.rows++
          if (e.sample.length < 3) e.sample.push({ key: k, before: b[c], after: a[c] })
        }
      }
      if (changed) changedRows++
    }
    if (changedRows || deleted) out[t] = { rows_changed: changedRows, rows_deleted: deleted, columns: cols }
  }
  return out
}

async function subState(rows, withAgency) {
  const extra = withAgency ? `, s.agency_id, s.grace_end, s.first_paid_at, ta.company_name AS agency_name` : ``
  const join = withAgency ? `LEFT JOIN public.transport_agencies ta ON ta.id = s.agency_id` : ``
  return rows(`
    SELECT s.id, s.status, s.billing_cycle, p.name AS plan, p.tier, s.current_period_start, s.current_period_end, s.trial_end,
           s.cancel_at_period_end, s.user_id, u.email AS user_email${extra}
      FROM public.subscriptions s
      LEFT JOIN public.subscription_plans p ON p.id = s.plan_id
      LEFT JOIN public.users u ON u.id = s.user_id
      ${join}
     ORDER BY s.created_at, s.id`)
}
function joinSubs(before, after) {
  return before.map((b) => {
    const a = after.find((x) => x.id === b.id)
    return {
      id: b.id,
      user: b.user_email,
      before: { status: b.status, plan: b.plan, billing_cycle: b.billing_cycle, period_end: b.current_period_end, trial_end: b.trial_end },
      after: a
        ? { status: a.status, agency_id: a.agency_id ?? null, agency: a.agency_name ?? null, plan: a.plan, billing_cycle: a.billing_cycle, period_end: a.current_period_end, grace_end: a.grace_end ?? null }
        : 'ROW DELETED',
      changed: a ? (a.status !== b.status || (a.agency_id ?? null) !== null) : true,
    }
  })
}

/** Constraints that were added NOT VALID: legacy rows that would fail VALIDATE are reported (rolled back). */
async function unvalidatedScan(db) {
  const list = (await db.query(`SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated ORDER BY 1,2`)).rows
  const out = []
  for (const c of list) {
    let violates = 0
    let sample = null
    try {
      await db.query('BEGIN')
      await db.query(`ALTER TABLE ${c.tbl} VALIDATE CONSTRAINT ${JSON.stringify(c.conname)}`)
      await db.query('ROLLBACK')
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {})
      violates = 1
      sample = String(e.message).split('\n')[0]
    }
    out.push({ table: c.tbl, constraint: c.conname, definition: c.def, legacy_rows_violate: !!violates, validate_error: sample })
  }
  return out
}

/** A few rules the new code relies on, checked against the legacy rows that stayed behind. */
async function legacyOutsideRules(rows) {
  const r = {}
  const one = async (k, sql) => {
    try {
      r[k] = await rows(sql)
    } catch (e) {
      r[k] = `query failed: ${e.message.split('\n')[0]}`
    }
  }
  await one('agency_trucks_vehicle_type_not_a_catalog_code', `SELECT t.id, t.agency_id, t.vehicle_type, t.rc_number FROM public.agency_trucks t LEFT JOIN public.trucks c ON c.code = t.vehicle_type WHERE c.id IS NULL`)
  await one('driver_payouts_amount_not_positive', `SELECT id, amount, status FROM public.driver_payouts WHERE amount <= 0`)
  await one('job_offers_otp_not_4_digit_now', `SELECT id, pickup_otp, delivery_otp FROM public.job_offers WHERE (pickup_otp IS NOT NULL AND pickup_otp !~ '^[0-9]{4}$') OR (delivery_otp IS NOT NULL AND delivery_otp !~ '^[0-9]{4}$')`)
  await one('legacy_payment_history_not_linked_to_agency', `SELECT count(*)::int AS rows, count(*) FILTER (WHERE status='success')::int AS successful FROM public.payment_history WHERE agency_id IS NULL`)
  await one('legacy_invoices_table_rows_not_in_subscription_invoices', `SELECT count(*)::int AS rows, sum(total_amount)::bigint AS total_paise FROM public.invoices`)
  await one('subscriptions_without_agency', `SELECT s.id, s.status, u.email FROM public.subscriptions s LEFT JOIN public.users u ON u.id = s.user_id WHERE s.agency_id IS NULL`)
  await one('agencies_without_any_subscription', `SELECT ta.id, ta.company_name, ta.status FROM public.transport_agencies ta WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.agency_id = ta.id)`)
  return r
}

/** run_subscription_sweeps inside a transaction that is rolled back: what the first hourly cron would do. */
async function sweepDryRun(db, rows, hasAgencyCol, migrations) {
  const ok = migrations.find((m) => ver(m.file) === '20261031000000')?.result
  if (!(await tableExists(rows, 'subscription_sweep_runs')) || !(ok === 'ok' || ok === 'needs_data_fix')) {
    return { skipped: 'run_subscription_sweeps does not exist (20261031000000 was not applied)' }
  }
  const before = await subState(rows, hasAgencyCol)
  async function attempt(prep) {
    try {
      await db.query('BEGIN')
      if (prep) await db.query(prep)
      const res = (await db.query(`SELECT public.run_subscription_sweeps(now()) AS r`)).rows[0].r
      const after = await subState(rows, hasAgencyCol)
      const reminders = (await db.query(`SELECT r.kind, s.id AS subscription_id, u.email FROM public.subscription_reminders r JOIN public.subscriptions s ON s.id = r.subscription_id LEFT JOIN public.users u ON u.id = s.user_id`)).rows
      await db.query('ROLLBACK')
      return {
        function_result: res,
        transitions: before
          .map((b) => ({ id: b.id, user: b.user_email, agency: b.agency_name ?? null, was: b.status, would_become: after.find((a) => a.id === b.id)?.status, period_end: b.current_period_end, trial_end: b.trial_end }))
          .filter((t) => t.was !== t.would_become),
        unchanged_live: after.filter((a) => ['trial', 'active', 'past_due', 'grace'].includes(a.status)).map((a) => ({ user: a.user_email, status: a.status })),
        reminders_that_would_be_written: reminders,
        rolled_back: true,
      }
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {})
      return { error: `${e.code}: ${String(e.message).split(String.fromCharCode(10))[0]}` }
    }
  }
  const asIs = await attempt(null)
  if (!asIs.error) return { as_is: asIs }
  // The sweep is one all-or-nothing function. Show what it WOULD do for the other rows if the blocking
  // CHECK were not in the way (constraint dropped inside the rolled-back transaction only).
  const blocking = (await rows(`SELECT s.id, u.email, s.status, s.current_period_start, s.current_period_end FROM public.subscriptions s LEFT JOIN public.users u ON u.id = s.user_id WHERE s.current_period_end <= s.current_period_start`))
  const withoutCheck = await attempt(`ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_period_order_check`)
  return {
    as_is: asIs,
    meaning: 'the sweep raises on the first row the NOT VALID period CHECK rejects, so EVERY run of the hourly cron fails and nothing is expired or reminded until those rows are repaired',
    blocking_rows: blocking,
    if_blocking_check_were_absent: withoutCheck,
  }
}

// ---------------------------------------------------------------------------------------------
// the legacy seed
// ---------------------------------------------------------------------------------------------
async function seed({ q, rows, cols, hasUniqueUser }) {
  const skipped = []
  /** insert helper: only columns that exist at the cut-off; anything else is reported, never silently dropped */
  async function ins(table, obj) {
    const have = cols[table]
    if (!have) throw new Error(`seed: table ${table} does not exist at cut-off ${CUTOFF}`)
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).filter((k) => {
      if (have.has(k)) return true
      skipped.push(`${table}.${k}`)
      return false
    })
    const vals = keys.map((k) => obj[k])
    const sql = `INSERT INTO public.${JSON.stringify(table)} (${keys.map((k) => JSON.stringify(k)).join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`
    await q(sql, vals.map((v) => (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) ? JSON.stringify(v) : v)))
  }
  const n = {}
  const bump = (t) => (n[t] = (n[t] ?? 0) + 1)
  const I = async (t, o) => {
    await ins(t, o)
    bump(t)
  }
  const authUser = async (id, email, role = 'user', meta = {}) => {
    await q(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1,$2,$3)`, [id, email, JSON.stringify({ role, ...meta })])
  }

  const plans = Object.fromEntries((await rows(`SELECT id, tier FROM public.subscription_plans`)).map((p) => [p.tier, p.id]))
  const catalog = (await rows(`SELECT id, name FROM public.trucks`)).map((t) => t)
  const truckCat = (name) => catalog.find((c) => c.name === name)?.id ?? null

  // ---- users ------------------------------------------------------------------------
  const users = [
    // n, email, role, name, phone
    [1, 'Admin.Ops@truckopti.example', 'admin', 'Ops Admin', '9800000001'],
    [2, 'riya.cust@example.com', 'user', 'Riya Shah (customer)', '9811111101'],
    [3, 'mohan.cust@example.com', 'user', 'Mohan Das (customer, subscription but no agency)', '9811111102'],
    [4, 'Sanjay.Own@TransGo.example', 'user', 'Sanjay (owns two agencies)', '9822222201'],
    [5, 'meena.own@speedline.example', 'user', 'Meena (pending agency, trial)', '9822222202'],
    [6, 'arjun.own@kaveri.example', 'user', 'Arjun (approved, cancelled)', '9822222203'],
    [7, 'farah.own@kaveri2.example', 'user', 'Farah (approved, paused, same GSTIN as Arjun)', '9822222204'],
    [8, 'dinesh.own@lonestar.example', 'user', 'Dinesh (approved, active, stale period)', '9822222205'],
    [9, 'ishaan.own@bluebay.example', 'user', 'Ishaan (approved, active, zero length period)', '9822222206'],
    [10, 'kavita.own@oldtimer.example', 'user', 'Kavita (approved, expired)', '9822222207'],
    [11, 'driver.ramesh@example.com', 'driver', 'Ramesh (driver)', '9833333301'],
    [12, 'driver.salim@example.com', 'driver', 'Salim (driver)', '9833333302'],
    [13, 'driver.tejas@example.com', 'driver', 'Tejas (driver, rejected)', '9833333303'],
    [14, 'driver.uday@example.com', 'driver', 'Uday (driver, suspended)', '9833333304'],
    [15, 'driver.vikram@example.com', 'driver', 'Vikram (driver, pending)', '9833333305'],
    [16, 'manager.lata@example.com', 'manager', 'Lata (manager)', '9844444401'],
    [17, 'nina.nosub@example.com', 'user', 'Nina (agency owner, no subscription)', '9822222208'],
  ]
  for (const [i, email, role, name, phone] of users) {
    await authUser(ID.usr(i), email, role)
    await I('users', { id: ID.usr(i), email, name, phone, role })
  }

  // ---- customers & agencies ----------------------------------------------------------
  const cust = (i, name, pan, extra = {}) =>
    I('customers', { id: ID.cus(i), name, phone: `98100000${i}0`, email: `c${i}@shipper.example`, address: `${i} Industrial Estate`, city: 'Pune', state: 'Maharashtra', pincode: '411001', pan_number: pan, created_by: ID.usr(2), ...extra })
  await cust(1, 'Shah Textiles', 'AAAPS1234A', { gst_number: '27AAAPS1234A1Z5' })
  await cust(2, 'Patel Agro Foods', 'BBBPP5678B')

  const agency = (i, owner, name, status, o = {}) =>
    I('transport_agencies', {
      id: ID.ag(i), user_id: owner ? ID.usr(owner) : null, company_name: name, status,
      pan_number: o.pan ?? `AGEPN${1000 + i}K`, gstin: o.gstin ?? null, contact_name: o.contact ?? 'Owner', contact_phone: o.phone ?? null,
      contact_email: `ag${i}@agency.example`, address: `${i} Transport Nagar`, city: o.city ?? 'Mumbai', state: o.state ?? 'Maharashtra', pincode: '400001',
      fleet_size: o.fleet ?? 5, created_at: o.created, ...(o.extra ?? {}),
    })
  // A2 is OLDER than A1 and rejected: "oldest agency" and "oldest approved agency" differ for owner 4.
  await agency(2, 4, 'TransGo Logistics (old entity)', 'rejected', { created: '2026-01-15T10:00:00Z', gstin: '27AABCT1234F1ZP', phone: '+91 98222 22201', extra: { rejection_reason: 'GST certificate unreadable' } })
  await agency(1, 4, 'TransGo Logistics Pvt Ltd', 'approved', { created: '2026-02-01T10:00:00Z', gstin: '27aabct9999f1zq', phone: '9822222201', extra: { approved_by: ID.usr(1), approved_at: '2026-02-03T10:00:00Z', rating: 4.5, total_jobs: 12 } })
  await agency(3, 5, 'Speedline Carriers', 'pending', { created: '2026-03-10T10:00:00Z', gstin: '29AADCS4321H1Z2', phone: '98222 22202', city: 'Bengaluru', state: 'Karnataka' })
  // Arjun and Farah: same GSTIN written in different cases/spaces, same phone in different formats -> one trial claim collides.
  await agency(4, 6, 'Kaveri Freight', 'approved', { created: '2026-02-11T10:00:00Z', gstin: '33AAACK7777M1Z8', phone: '+91 98765 43210', city: 'Chennai', state: 'Tamil Nadu', extra: { approved_by: ID.usr(1), approved_at: '2026-02-12T10:00:00Z' } })
  await agency(5, 7, 'Kaveri Freight Services', 'approved', { created: '2026-02-20T10:00:00Z', gstin: ' 33aaack7777m1z8 ', phone: '09876543210', city: 'Chennai', state: 'Tamil Nadu', extra: { approved_by: ID.usr(1), approved_at: '2026-02-21T10:00:00Z' } })
  await agency(6, 8, 'Lone Star Haulage', 'approved', { created: '2026-02-25T10:00:00Z', gstin: '07AAACL5555P1ZV', phone: '9822222205', city: 'Delhi', state: 'Delhi', extra: { approved_by: ID.usr(1), approved_at: '2026-02-26T10:00:00Z' } })
  await agency(7, 9, 'Blue Bay Movers', 'approved', { created: '2026-03-01T10:00:00Z', gstin: '', phone: '   ', city: 'Kochi', state: 'Kerala', extra: { approved_by: ID.usr(1), approved_at: '2026-03-02T10:00:00Z' } })
  await agency(8, 10, 'Old Timer Transport', 'approved', { created: '2026-01-05T10:00:00Z', gstin: '24AAACO1111Q1Z1', phone: '12345', city: 'Surat', state: 'Gujarat', extra: { approved_by: ID.usr(1), approved_at: '2026-01-06T10:00:00Z' } })
  await agency(9, 17, 'Nina Roadways', 'approved', { created: '2026-04-01T10:00:00Z', gstin: '19AAACN2222R1ZA', phone: '9822222208', city: 'Kolkata', state: 'West Bengal', extra: { approved_by: ID.usr(1), approved_at: '2026-04-02T10:00:00Z' } })

  // ---- drivers -----------------------------------------------------------------------
  const drv = (i, uid, name, status, o = {}) =>
    I('drivers', { id: ID.drv(i), user_id: uid ? ID.usr(uid) : null, full_name: name, phone: `98333${String(i).padStart(5, '0')}`, vehicle_type: o.vt ?? 'Tata 407', pan_number: `DRVPN${2000 + i}D`, license_number: `MH12 2020 00${i}`, status, home_city: 'Pune', rating: o.rating ?? 4.2, total_trips: o.trips ?? 0, is_online: o.online ?? false, ...(o.extra ?? {}) })
  await drv(1, 11, 'Ramesh Yadav', 'approved', { trips: 40, extra: { dl_url: 'https://old.supabase.co/storage/v1/object/public/driver-docs/11/dl.jpg', rc_url: 'https://old.supabase.co/storage/v1/object/public/driver-docs/11/rc.jpg', selfie_url: 'https://old.supabase.co/storage/v1/object/public/driver-docs/11/selfie.jpg', insurance_url: null, approved_by: ID.usr(1), approved_at: '2026-02-01T00:00:00Z' } })
  await drv(2, 12, 'Salim Khan', 'approved', { trips: 18, online: true, extra: { dl_url: 'https://old.supabase.co/storage/v1/object/public/driver-docs/12/dl.jpg', approved_by: ID.usr(1), approved_at: '2026-02-05T00:00:00Z' } })
  await drv(3, 13, 'Tejas More', 'rejected', { extra: { rejection_reason: 'Licence expired' } })
  await drv(4, 14, 'Uday Singh', 'suspended', { trips: 3 })
  await drv(5, 15, 'Vikram Rao', 'pending')
  await drv(6, null, 'Walk-in Driver (no login)', 'approved', { trips: 2 })

  // ---- agency trucks: duplicates the old schema allowed ------------------------------
  const trk = (i, agency, vt, rc, driver = null, extra = {}) =>
    I('agency_trucks', { id: ID.trk(i), agency_id: ID.ag(agency), vehicle_type: vt, rc_number: rc, driver_id: driver ? ID.drv(driver) : null, insurance_expiry: '2027-03-01', is_available: true, ...extra })
  await trk(1, 1, 'Tata 407', 'MH12AB1234', 1)
  await trk(2, 1, 'Eicher 14ft', 'MH12AB1234', 1) // SAME rc_number in the same agency AND the same driver on two trucks
  await trk(3, 1, 'Mini truck (custom)', 'mh12cd9999', 2) // free-text vehicle type, lower-case RC
  await trk(4, 4, 'Tata Ace', 'TN01XY0001', 6)
  await trk(5, 6, 'BharatBenz 24ft', 'DL01ZZ4444', null, { is_available: false })

  // ---- shipments, agency jobs, offers -------------------------------------------------
  const shp = (i, status, o = {}) =>
    I('shipments', { id: ID.shp(i), shipment_id: `SHP-LEG-${String(i).padStart(4, '0')}`, customer_id: ID.cus(o.cust ?? 1), origin: o.origin ?? 'Pune', destination: o.dest ?? 'Mumbai', status, total_weight: 1200, total_volume: 14, estimated_cost: o.cost ?? 18000, created_by: ID.usr(2), vehicle_type: o.vt ?? 'Tata 407', pickup_date: '2026-04-20', goods_description: 'Textile bales' })
  await shp(1, 'delivered'); await shp(2, 'delivered', { cost: 0 }); await shp(3, 'in_transit'); await shp(4, 'pending'); await shp(5, 'cancelled'); await shp(6, 'pending', { cust: 2 }); await shp(7, 'delivered', { cust: 2 })

  const job = (i, agency, shipment, status, o = {}) =>
    I('agency_jobs', { id: ID.job(i), agency_id: ID.ag(agency), shipment_id: ID.shp(shipment), driver_id: o.driver ? ID.drv(o.driver) : null, truck_id: o.truck ? ID.trk(o.truck) : null, status, fare: o.fare ?? 16000, notes: o.notes ?? null })
  await job(1, 1, 1, 'delivered', { driver: 1, truck: 1, fare: 16500 })
  await job(2, 1, 2, 'delivered', { driver: 1, truck: 1, fare: null }) // delivered with no fare
  await job(3, 1, 3, 'in_transit', { driver: 2, truck: 3 })
  await job(4, 4, 4, 'pending')
  await job(5, 1, 5, 'cancelled', { driver: 1, truck: 2 })
  await job(6, 6, 6, 'accepted', { driver: 6, truck: 5 })
  await job(7, 6, 7, 'delivered', { driver: 6, truck: 5, fare: 21000 })

  const off = (i, shipment, driver, status, o = {}) =>
    I('job_offers', { id: ID.off(i), shipment_id: ID.shp(shipment), driver_id: ID.drv(driver), expires_at: o.exp ?? daysFromNow(1), status, pickup_otp: o.pot ?? null, delivery_otp: o.dot ?? null, delivered_at: o.delivered ?? null })
  await off(1, 1, 1, 'delivered', { pot: '123456', dot: '654321', delivered: '2026-04-22T10:00:00Z', exp: '2026-04-20T00:00:00Z' }) // 6-digit OTPs from before the 4-digit contract
  await off(2, 3, 2, 'in_transit', { pot: '4821', dot: '77', exp: '2026-04-25T00:00:00Z' }) // short delivery OTP
  await off(3, 4, 1, 'pending', { pot: '', dot: null }) // blank / NULL OTPs
  await off(4, 6, 6, 'accepted', { pot: '99999', dot: '00000' })
  await off(5, 5, 1, 'cancelled')
  await off(6, 6, 2, 'expired', { exp: '2026-03-01T00:00:00Z' })
  await off(7, 7, 6, 'declined')

  // ---- plans / subscriptions ---------------------------------------------------------
  const now = Date.now()
  const iso = (d) => new Date(now + d * 86400000).toISOString()
  const sub = async (i, user, status, tier, cycle, startD, endD, o = {}) =>
    I('subscriptions', { id: ID.sub(i), user_id: ID.usr(user), plan_id: plans[tier], status, billing_cycle: cycle, current_period_start: iso(startD), current_period_end: iso(endD), trial_end: o.trialEnd ? iso(o.trialEnd) : null, cancel_at_period_end: o.cancelAtEnd ?? false, cancelled_at: o.cancelledAt ? iso(o.cancelledAt) : null, razorpay_subscription_id: o.rzp ?? null, razorpay_customer_id: o.rzpc ?? null, created_at: iso(o.createdD ?? startD) })
  await sub(1, 4, 'active', 'growth', 'yearly', -100, 265, { rzp: 'sub_LEG0001', rzpc: 'cust_LEG0001', createdD: -300 })      // owner of two agencies, active paid
  await sub(2, 5, 'trial', 'starter', 'monthly', -20, -6, { trialEnd: -6, createdD: -20 })                                          // trial already over (never swept)
  await sub(3, 6, 'cancelled', 'professional', 'monthly', -60, -30, { cancelAtEnd: true, cancelledAt: -35, rzp: 'sub_LEG0003', createdD: -200 })
  await sub(4, 7, 'paused', 'growth', 'monthly', -45, -15, { rzp: 'sub_LEG0004', createdD: -150 })                                  // 'paused' is rewritten to 'cancelled'
  await sub(5, 8, 'active', 'starter', 'monthly', -50, -20, { rzp: 'sub_LEG0005', rzpc: 'cust_LEG0005', createdD: -120 })           // active but period ended 20 days ago
  await sub(6, 9, 'active', 'growth', 'monthly', -10, -10, { rzp: 'sub_LEG0006', createdD: -10 })                                  // period_end = period_start (breaks the new order CHECK)
  await sub(7, 10, 'expired', 'starter', 'monthly', -200, -170, { createdD: -230 })
  await sub(8, 3, 'active', 'enterprise', 'yearly', -30, 335, { rzp: 'sub_LEG0008', rzpc: 'cust_LEG0008', createdD: -30 })          // customer: subscription but NO agency
  await sub(9, 2, 'trial', 'starter', 'monthly', -2, 12, { trialEnd: 12, createdD: -2 })                                            // customer on a live trial, no agency
  await sub(10, 11, 'active', 'professional', 'monthly', -5, 25, { createdD: -5 })                                                // a DRIVER user holding a subscription, no agency
  if (!hasUniqueUser) {
    // the unique-per-user fix (20260501113000) is not applied at this cut-off: the legacy table allows a second row
    await sub(11, 4, 'cancelled', 'starter', 'monthly', -400, -370, { createdD: -400 })
    warnings.push('cut-off is before 20260501113000: user 4 holds TWO subscription rows; 20260501113000 will DELETE the lower-ranked one')
  }
  // "two users of one agency each with a subscription" cannot be built on the legacy schema:
  // the only user<->agency link is transport_agencies.user_id (one user per agency). It first becomes possible
  // after agency_memberships (20261011), so the backfill's live_collision branch is unreachable from legacy rows.
  // Closest legacy shape: two DIFFERENT users whose agencies share a GSTIN/phone (agencies 4 and 5) - see trial claims.

  // ---- invoices, payment history, add-ons --------------------------------------------
  const invoice = (i, subN, userN, status, amount, o = {}) =>
    I('invoices', { id: ID.inv(i), subscription_id: ID.sub(subN), user_id: ID.usr(userN), invoice_number: o.no ?? `INV-LEG-${String(i).padStart(4, '0')}`, amount, tax_amount: Math.round(amount * 0.18), total_amount: Math.round(amount * 1.18), status, billing_period_start: iso(-100), billing_period_end: iso(265), razorpay_payment_id: o.pay ?? null, paid_at: status === 'paid' ? iso(-100) : null })
  await invoice(1, 1, 4, 'paid', 1999900, { pay: 'pay_LEG0001' })
  await invoice(2, 3, 6, 'paid', 499900, { pay: 'pay_LEG0003' })
  await invoice(3, 4, 7, 'failed', 199900)
  await invoice(4, 8, 3, 'paid', 14999900, { pay: 'pay_LEG0008' })
  await invoice(5, 5, 8, 'pending', 49900)
  const payment = (i, userN, subN, invN, status, amount, o = {}) =>
    I('payment_history', { id: ID.pay(i), user_id: ID.usr(userN), subscription_id: subN ? ID.sub(subN) : null, invoice_id: invN ? ID.inv(invN) : null, amount, payment_method: o.method ?? 'upi', status, razorpay_payment_id: o.pay ?? null, razorpay_order_id: o.order ?? null, error_message: o.err ?? null })
  await payment(1, 4, 1, 1, 'success', 2359882, { pay: 'pay_LEG0001', order: 'order_LEG0001' })
  await payment(2, 6, 3, 2, 'success', 589882, { pay: 'pay_LEG0003', order: 'order_LEG0003', method: 'card' })
  await payment(3, 7, 4, 3, 'failed', 235882, { err: 'BAD_REQUEST_ERROR: card declined' })
  await payment(4, 3, 8, 4, 'success', 17699882, { pay: 'pay_LEG0008', order: 'order_LEG0008', method: 'netbanking' })
  await payment(5, 2, null, null, 'pending', 49900)
  await payment(6, 6, 3, 2, 'refunded', 589882, { pay: 'pay_LEG0003_R', order: 'order_LEG0003_R', method: 'card' })
  await I('addon_purchases', { id: ID.misc(1), subscription_id: ID.sub(1), addon_type: 'sms_pack', quantity: 1000, unit_price: 50, total_price: 50000, status: 'active', razorpay_payment_id: 'pay_LEGADD1' })

  // ---- payouts, notifications, misc ---------------------------------------------------
  await I('driver_payouts', { id: ID.pot(1), driver_id: ID.drv(1), amount: 5000, status: 'paid', type: 'withdrawal', processed_at: '2026-04-25T10:00:00Z' })
  await I('driver_payouts', { id: ID.pot(2), driver_id: ID.drv(1), amount: 1200, status: 'pending', type: 'withdrawal' })
  await I('driver_payouts', { id: ID.pot(3), driver_id: ID.drv(2), amount: 0, status: 'pending', type: 'agency_pay', agency_id: ID.ag(1) }) // zero payout (later CHECK amount > 0)
  await I('driver_payouts', { id: ID.pot(4), driver_id: ID.drv(6), amount: 8000, status: 'approved', type: 'agency_pay', agency_id: ID.ag(6), note: 'Trip SHP-LEG-0007' })
  await I('driver_payouts', { id: ID.pot(5), driver_id: ID.drv(3), amount: -250, status: 'rejected', type: 'withdrawal', note: 'adjustment entered as negative' })
  for (let i = 1; i <= 6; i++) await I('notifications', { id: ID.ntf(i), user_id: ID.usr([2, 4, 5, 6, 11, 12][i - 1]), title: `Legacy notice ${i}`, message: 'Your shipment status changed', type: ['info', 'success', 'warning', 'error', 'info', 'info'][i - 1], is_read: i % 2 === 0 })
  await I('contact_inquiries', { id: ID.misc(2), name: 'Site visitor', email: 'visitor@example.com', subject: 'Pricing', message: 'Do you have a yearly discount?', status: 'open' })
  await I('contact_inquiries', { id: ID.misc(3), name: 'Another', email: 'a@example.com', message: 'Hello', status: 'resolved', client_submission_id: 'sub-1' })
  await I('routes', { id: ID.misc(4), name: 'Pune-Mumbai', start_location: 'Pune', destinations: ['Mumbai'], created_by: ID.usr(2) })
  await I('packing_jobs', { id: ID.misc(5), user_id: ID.usr(2), truck_id: truckCat('Tata 407'), status: 'completed', items: '[]', volume_utilization: 71.5 })
  await I('sale_orders', { id: ID.misc(6), user_id: ID.usr(2), order_number: 'SO-LEG-0001', customer_id: ID.cus(1), status: 'pending', total_value: 25000 })
  await I('analytics_events', { id: ID.misc(7), user_id: ID.usr(2), event_type: 'page_view', event_data: { path: '/dashboard' } })
  await I('driver_locations', { driver_id: ID.drv(2), lat: 18.52, lng: 73.85 })

  if (DRIFT) {
    // Rows a DRIFTED production could hold. The old CHECKs were created by 20260108000000; a project that was ever
    // edited by hand in the dashboard may have lost them. These are only seeded with --drift.
    await q(`ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check`)
    await authUser(ID.usr(18), 'razorpay.migrated@example.com')
    await I('users', { id: ID.usr(18), email: 'razorpay.migrated@example.com', name: 'Drift user (status trialing)', role: 'user' })
    await sub(12, 18, 'trialing', 'starter', 'monthly', -3, 11, { trialEnd: 11 })
    await q(`ALTER TABLE public.trucks DROP CONSTRAINT IF EXISTS trucks_name_key`)
    await I('trucks', { id: ID.misc(8), name: 'Mahindra Bolero Pickup', name_hi: 'Mahindra Bolero Pickup', length: 2.4, width: 1.6, height: 1.4, capacity: 1200, cost_per_km: 14 })
    warnings.push('--drift: removed subscriptions_status_check, seeded status "trialing", added an unmapped catalog truck')
  }

  if (skipped.length) warnings.push(`seed columns not present at cut-off ${CUTOFF}, skipped: ${[...new Set(skipped)].join(', ')}`)
  return { rows_inserted: n, uniqueUserSubscriptionAtCutoff: hasUniqueUser }
}

// ---------------------------------------------------------------------------------------------
function printSummary(r) {
  const line = '-'.repeat(78)
  console.log(`\n${line}\nREHEARSAL SUMMARY  (cut-off ${r.cutoff}, last legacy file ${r.last_legacy_migration})\n${line}`)
  console.log(`migrations: ${r.summary.applied_ok} ok, ${r.summary.failed.length} failed, ${r.summary.needs_data_fix.length} need a data fix, ${r.summary.not_applied} not applied`)
  for (const m of r.migrations.filter((m) => m.result === 'FAILED' || m.result === 'needs_data_fix')) {
    console.log(`  ${m.result}  ${m.file}${m.cascade ? '  (cascade: ${m.sqlstate} ${m.message})' : ''}`)
    if (m.cascade) continue
    if (m.sqlstate) console.log(`     SQLSTATE ${m.sqlstate}: ${m.message}`)
    if (m.detail) console.log(`     detail: ${m.detail}`)
    if (m.retry_error) console.log(`     retry after data fix still failed: ${m.retry_error}`)
    if (m.failing_statement) console.log(`     statement: ${m.failing_statement}`)
  }
  console.log(`\nrow counts (legacy tables) with a loss: ${r.rows_lost.length ? JSON.stringify(r.rows_lost) : 'none'}`)
  console.log('\nlegacy table row counts before -> after')
  for (const c of r.row_counts) console.log(`  ${c.table.padEnd(24)} ${String(c.before).padStart(4)} -> ${String(c.after).padStart(4)}`)
  if (Object.keys(r.silent_changes).length) {
    console.log('\nsilent changes to existing rows')
    for (const [t, d] of Object.entries(r.silent_changes)) console.log(`  ${t}: ${d.rows_changed} rows changed, ${d.rows_deleted} deleted; columns ${Object.entries(d.columns).map(([c, e]) => `${c}(${e.rows})`).join(', ')}`)
  }
  if (r.backfill_conflicts) console.log(`\nsubscription_backfill_conflicts: ${r.backfill_conflicts.length} rows ${JSON.stringify(r.backfill_conflicts.map((c) => c.reason))}`)
  if (r.subscription_changes) {
    console.log('\nsubscriptions before -> after')
    for (const s of r.subscription_changes) console.log(`  ${String(s.user).padEnd(34)} ${s.before.status.padEnd(9)} -> ${typeof s.after === 'string' ? s.after : `${s.after.status.padEnd(9)} agency=${s.after.agency ?? '-'}`}`)
  }
  if (r.sweep_dry_run?.transitions) console.log(`\nsweep dry run: ${JSON.stringify(r.sweep_dry_run.function_result)}`)
}

main().catch((e) => {
  console.error('legacy_replay crashed:', e)
  process.exit(3)
})
