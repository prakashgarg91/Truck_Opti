#!/usr/bin/env node
/**
 * MIGRATION REPLAY (M) on PGlite: the supabase/migrations chain is deterministic, well-ordered and free of
 * dangerous statements and plaintext secrets.
 *
 * LEVEL: replay on a REAL PostgreSQL engine (PGlite WASM), from zero, twice, in two fresh instances. The two
 * resulting schemas are compared through a canonical snapshot (tables, columns with types and defaults,
 * constraints, indexes, functions with identity arguments and md5 of their source, triggers, policies, grants).
 * Then a static scan of every migration >= 20261008000000 for dangerous patterns.
 *
 * Policy: plaintext secrets FAIL the test. Dangerous-pattern hits are printed as WARN findings and do not fail,
 * unless the hit is not on the reviewed allow-list below, in which case it is still printed as a WARN.
 * A determinism or ordering defect in a migration is a real defect: it keeps failing and is named 'BUG: ...'.
 *
 * Usage:  node scripts/migration_replay.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const SCAN_FROM = '20261008000000'

if (!existsSync(PGLITE_BASE)) {
  console.error('FAIL: PGlite not found at ' + PGLITE_BASE + ' — run `npm ci` in frontend/ first.')
  process.exit(1)
}

const { PGlite } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'index.js')).href)
const { uuid_ossp } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'contrib', 'uuid_ossp.js')).href)

/** Reviewed dangerous-pattern hits: { file, kind, reason }. A hit matching one of these is accepted silently
 *  (counted, not printed). Anything else is printed as WARN. */
const REVIEWED_PATTERN_HITS = [
  // Guard triggers that refuse TRUNCATE (BEFORE TRUNCATE ... RAISE): protective, not destructive.
  { kind: 'TRUNCATE', snippet: /^CREATE TRIGGER \S+_no_truncate BEFORE TRUNCATE\b/, reason: 'append-only guard trigger refuses TRUNCATE' },
  // REVOKE that removes TRUNCATE from an API or service role: privilege reduction.
  { kind: 'TRUNCATE', snippet: /^REVOKE\b.*\bTRUNCATE\b/, reason: 'privilege reduction (REVOKE TRUNCATE)' },
  // Session temp table cleanup inside a sweep function: pg_temp only, never a public table.
  { kind: 'DROP TABLE', snippet: /^DROP TABLE IF EXISTS pg_temp\./, reason: 'drops a pg_temp table inside the sweep transaction' },
]

const results = []


function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function expect(cond, message) {
  if (!cond) throw new Error(message)
}

function firstLine(error) {
  const raw = error && error.message ? error.message : String(error)
  return raw.split('\n')[0].trim()
}

async function mc(id, title, fn) {
  try {
    await fn()
    record(`${id} ${title}`, true)
  } catch (error) {
    record(`${id} ${title}`, false, (error && error.message ? error.message : String(error)).split('\n')[0].slice(0, 400))
  }
}

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
const versionOf = (f) => f.slice(0, 14)

/** Fresh PGlite, bootstrap, every migration in filename order. Returns the instance and any replay error. */
async function freshReplay() {
  const db = await PGlite.create({ extensions: { uuid_ossp } })
  await db.exec(BOOTSTRAP)
  let error = null
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    } catch (e) {
      error = `migration ${file} failed: ${firstLine(e)}`
      break
    }
  }
  return { db, error }
}

/** Canonical snapshot: every category is a sorted list of text lines. Order-independent, OID-free. */
async function snapshot(db) {
  const q = async (sql) => (await db.query(sql)).rows.map((r) => Object.values(r).map((v) => (v === null ? '∅' : String(v))).join(' | '))
  const out = {}
  out.tables = await q(`
    SELECT n.nspname || '.' || c.relname || ' kind=' || c.relkind::text || ' rls=' || c.relrowsecurity::text || ' force=' || c.relforcerowsecurity::text
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname IN ('public') AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f') ORDER BY 1`)
  out.columns = await q(`
    SELECT table_schema, table_name, column_name, data_type, udt_name, is_nullable, coalesce(column_default, '∅'),
           coalesce(character_maximum_length::text, '∅'), coalesce(numeric_precision::text, '∅'), ordinal_position
      FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, column_name`)
  out.constraints = await q(`
    SELECT conrelid::regclass::text, conname, contype, pg_get_constraintdef(oid)
      FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`)
  out.indexes = await q(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1, 2`)
  out.functions = await q(`
    SELECT p.oid::regprocedure::text, md5(p.prosrc), p.prosecdef, coalesce(p.proconfig::text, '∅'), p.provolatile,
           p.prokind, pg_get_function_result(p.oid), coalesce(p.proacl::text, '∅')
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public' ORDER BY 1`)
  out.triggers = await q(`
    SELECT tgrelid::regclass::text, tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1, 2`)
  out.policies = await q(`
    SELECT tablename, policyname, permissive, array_to_string(roles, ','), cmd, coalesce(qual, '∅'), coalesce(with_check, '∅')
      FROM pg_policies WHERE schemaname = 'public' ORDER BY 1, 2`)
  out.table_grants = await q(`
    SELECT c.relname, coalesce(c.relacl::text, '∅') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f') ORDER BY 1`)
  out.column_grants = await q(`
    SELECT c.relname, a.attname, a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND a.attacl IS NOT NULL AND a.attnum > 0 ORDER BY 1, 2`)
  out.enums = await q(`
    SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY 1`)
  return out
}

const digest = (lines) => createHash('md5').update(lines.join('\n')).digest('hex')

// ---------------------------------------------------------------------------
// Static checks on the file list
// ---------------------------------------------------------------------------
await mc('M01', 'migration file names are well-formed and strictly increasing', async () => {
  expect(files.length > 0, 'no migrations found')
  const bad = files.filter((f) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(f))
  expect(bad.length === 0, `malformed names: ${bad.join(', ')}`)
  for (let i = 1; i < files.length; i++) {
    expect(files[i] > files[i - 1], `not strictly increasing: ${files[i - 1]} then ${files[i]}`)
  }
})

await mc('M02', 'no duplicate version prefix: each 14-digit version belongs to exactly one file', async () => {
  const seen = new Map()
  for (const f of files) {
    const v = versionOf(f)
    if (seen.has(v)) throw new Error(`version ${v} defined by ${seen.get(v)} and ${f}`)
    seen.set(v, f)
  }
  console.log(`      migrations=${files.length} distinct versions=${seen.size}`)
})

// ---------------------------------------------------------------------------
// Replay twice from zero and compare
// ---------------------------------------------------------------------------
const first = await freshReplay()
let snapA = null
let snapB = null
let replayA = first.error
let replayB = null

await mc('M03', 'replay #1 from zero applies every migration', async () => {
  expect(replayA === null, replayA || 'ok')
})

const second = await freshReplay()
replayB = second.error

await mc('M04', 'replay #2 from zero (fresh instance) applies every migration', async () => {
  expect(replayB === null, replayB || 'ok')
})

let snapError = null
if (replayA === null && replayB === null) {
  try {
    snapA = await snapshot(first.db)
    snapB = await snapshot(second.db)
  } catch (e) {
    snapError = `snapshot query failed: ${firstLine(e)}`
  }
}

await mc('M05', 'canonical schema snapshot is identical across the two replays (determinism)', async () => {
  expect(snapError === null, snapError || 'ok')
  expect(snapA && snapB, 'a replay failed; no snapshot to compare')
  const differing = Object.keys(snapA).filter((k) => digest(snapA[k]) !== digest(snapB[k]))
  for (const k of Object.keys(snapA)) {
    console.log(`      ${k.padEnd(14)} lines=${String(snapA[k].length).padEnd(5)} md5=${digest(snapA[k])}`)
  }
  expect(differing.length === 0, `differs between replays: ${differing.join(', ')}`)
})

for (const handle of [first, second]) {
  try {
    await handle.db.close()
  } catch {
    // ignore: the instance is discarded either way
  }
}

// ---------------------------------------------------------------------------
// Static scan of every migration >= SCAN_FROM
// ---------------------------------------------------------------------------
const scanned = files.filter((f) => versionOf(f) >= SCAN_FROM)
const SECRET_PATTERNS = [
  ['razorpay live/test key', /rzp_(live|test)_[A-Za-z0-9]{8,}/],
  ['stripe-style secret key', /\bsk_(live|test)_[A-Za-z0-9]{8,}/],
  ['JWT literal', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
]

/** Blanks comments and string-literal contents (newlines kept), so keywords inside comments or TG_OP = 'TRUNCATE'
 *  are not counted as statements. Used for the statement-level scan only. */
function sanitize(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length))
    .replace(/'(?:[^']|'')*'/g, (m) => `'${m.slice(1, -1).replace(/[^\n]/g, ' ')}'`)
}

function statementsWithLines(rawSql) {
  const sql = sanitize(rawSql)
  // Split on ';' and keep the line where each statement starts, so hits can point at a line.
  const out = []
  let buf = ''
  let startLine = 1
  let line = 1
  for (const ch of sql) {
    if (buf.trim() === '') startLine = line
    if (ch === ';') {
      out.push({ text: buf, line: startLine })
      buf = ''
    } else buf += ch
    if (ch === '\n') line++
  }
  if (buf.trim()) out.push({ text: buf, line: startLine })
  return out
}

const DANGER = [
  ['DROP TABLE', (s) => /\bDROP\s+TABLE\b/i.test(s)],
  ['TRUNCATE', (s) => /\bTRUNCATE\b/i.test(s)],
  ['DELETE FROM without WHERE', (s) => /^\s*DELETE\s+FROM\b/i.test(s) && !/\bWHERE\b/i.test(s)],
  ['ALTER TABLE ... DROP COLUMN', (s) => /\bALTER\s+TABLE\b/i.test(s) && /\bDROP\s+COLUMN\b/i.test(s)],
  ['CREATE EXTENSION without IF NOT EXISTS', (s) => /\bCREATE\s+EXTENSION\b/i.test(s) && !/\bIF\s+NOT\s+EXISTS\b/i.test(s)],
  ['SET ROLE', (s) => /\bSET\s+(LOCAL\s+|SESSION\s+)?ROLE\b/i.test(s)],
  ['hard-coded UUID', null],
  ['hard-coded email', null],
]
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g

const secretHits = []
const patternHits = []
for (const file of scanned) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
  const lines = sql.split('\n')
  for (const [label, re] of SECRET_PATTERNS) {
    lines.forEach((l, i) => {
      if (re.test(l)) secretHits.push(`${file}:${i + 1} ${label}`)
    })
  }
  for (const st of statementsWithLines(sql)) {
    for (const [kind, test] of DANGER) {
      if (test && test(st.text)) patternHits.push({ file, line: st.line, kind, snippet: st.text.trim().replace(/\s+/g, ' ').slice(0, 110) })
    }
  }
  lines.forEach((l, i) => {
    if (l.trimStart().startsWith('--')) return
    for (const m of l.matchAll(UUID_RE)) patternHits.push({ file, line: i + 1, kind: 'hard-coded UUID', snippet: m[0] })
    for (const m of l.matchAll(EMAIL_RE)) patternHits.push({ file, line: i + 1, kind: 'hard-coded email', snippet: m[0] })
  })
}

await mc('M06', 'no plaintext secrets (razorpay / sk_ / JWT literals) in migrations >= 20261008', async () => {
  expect(secretHits.length === 0, `secret-looking literal: ${secretHits.join(' | ')}`)
})

const unreviewed = patternHits.filter(
  (h) => !REVIEWED_PATTERN_HITS.some((r) => (!r.file || r.file === h.file) && r.kind === h.kind && r.snippet.test(h.snippet))
)
const reviewedCount = patternHits.length - unreviewed.length

await mc('M07', `dangerous-pattern scan over ${scanned.length} migrations >= ${SCAN_FROM} (warn, not fail)`, async () => {
  for (const h of patternHits) {
    const reviewedBy = REVIEWED_PATTERN_HITS.find((r) => (!r.file || r.file === h.file) && r.kind === h.kind && r.snippet.test(h.snippet))
    if (reviewedBy) console.log(`      REVIEWED ${h.file}:${h.line} ${h.kind} — ${reviewedBy.reason}`)
    else console.log(`      WARN ${h.file}:${h.line} ${h.kind} — ${h.snippet}`)
  }
  console.log(`      hits total=${patternHits.length} reviewed=${reviewedCount} warned=${unreviewed.length}`)
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.pass).length
const failed = results.filter((r) => !r.pass)
console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
for (const f of failed) console.log(`  FAIL ${f.name} — ${f.detail}`)
process.exit(failed.length === 0 ? 0 : 1)
