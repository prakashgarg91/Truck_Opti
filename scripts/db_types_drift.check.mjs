#!/usr/bin/env node
/**
 * Database-types drift check / delta writer (TO-144-D2 types delta).
 *
 * No container runtime is available on every machine, so `supabase gen types`
 * cannot always run. This script replays the full supabase/migrations chain in
 * PGlite (real PostgreSQL), introspects every table and public function that a
 * migration at or after SINCE added, renders them in the exact shape of
 * frontend/src/types/database.types.ts, and either:
 *
 *   node scripts/db_types_drift.check.mjs            CHECK: exit 1 when the types
 *                                                    file lacks an entry or differs
 *                                                    from the database definition.
 *   node scripts/db_types_drift.check.mjs --write    insert missing entries only
 *                                                    (never rewrites existing ones).
 *   node scripts/db_types_drift.check.mjs --since 20261010000000
 *
 * Evidence class: local DB only (PGlite, single session). Regenerating with the
 * real Supabase generator on a Docker machine is still required before hosted
 * proof (TO-153).
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const TYPES_FILE = join(REPO_ROOT, 'frontend', 'src', 'types', 'database.types.ts')

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const sinceIdx = args.indexOf('--since')
const SINCE = sinceIdx >= 0 ? args[sinceIdx + 1] : '20261010000000'

if (!existsSync(PGLITE_BASE)) {
  console.error('FAIL: PGlite not found at ' + PGLITE_BASE + ' — run `npm ci` in frontend/ first.')
  process.exit(1)
}
const { PGlite } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'index.js')).href)
const { uuid_ossp } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'contrib', 'uuid_ossp.js')).href)
const db = await PGlite.create({ extensions: { uuid_ossp } })

// ---------------------------------------------------------------------------
// Replay the chain, snapshotting the public objects that exist before SINCE.
// ---------------------------------------------------------------------------
const SNAPSHOT_SQL = {
  tables: `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r','p')`,
  functions: `SELECT p.oid::regprocedure::text AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.prokind = 'f'`,
}
const before = { tables: new Set(), functions: new Set() }
let snapshotTaken = false

async function snapshot() {
  for (const key of Object.keys(SNAPSHOT_SQL)) {
    const { rows } = await db.query(SNAPSHOT_SQL[key])
    before[key] = new Set(rows.map((r) => r.name))
  }
  snapshotTaken = true
}

await db.exec(BOOTSTRAP)
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
for (const file of files) {
  if (!snapshotTaken && file.slice(0, 14) >= SINCE) await snapshot()
  try {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  } catch (error) {
    console.error(`FAIL: migration ${file} failed: ${String(error.message).split('\n')[0]}`)
    process.exit(1)
  }
}
if (!snapshotTaken) await snapshot()

// ---------------------------------------------------------------------------
// Type mapping (matches supabase gen types for the types used in this schema).
// Anything unmapped is a loud failure, never a silent `unknown`.
// ---------------------------------------------------------------------------
const STRING_TYPES = new Set(['uuid', 'text', 'varchar', 'bpchar', 'citext', 'timestamptz', 'timestamp', 'date', 'time', 'timetz', 'name'])
const NUMBER_TYPES = new Set(['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'oid'])

function tsType(udt) {
  if (udt.startsWith('_')) return `${tsType(udt.slice(1))}[]`
  if (STRING_TYPES.has(udt)) return 'string'
  if (NUMBER_TYPES.has(udt)) return 'number'
  if (udt === 'bool') return 'boolean'
  if (udt === 'jsonb' || udt === 'json') return 'Json'
  if (udt === 'inet') return 'unknown'
  throw new Error(`unmapped PostgreSQL type "${udt}" — extend tsType() deliberately`)
}

const q = async (sql, params) => (await db.query(sql, params)).rows

// ---------------------------------------------------------------------------
// Render tables
// ---------------------------------------------------------------------------
async function renderTable(name) {
  const cols = await q(
    `SELECT column_name, udt_name, is_nullable, column_default, is_generated, is_identity
       FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1
      ORDER BY column_name COLLATE "C"`,
    [name]
  )
  const row = []
  const insert = []
  const update = []
  for (const c of cols) {
    const nullable = c.is_nullable === 'YES'
    const t = tsType(c.udt_name) + (nullable ? ' | null' : '')
    const optionalOnInsert = nullable || c.column_default !== null || c.is_identity === 'YES'
    const generated = c.is_generated === 'ALWAYS'
    row.push(`"${c.column_name}": ${t}`)
    if (!generated) {
      insert.push(`"${c.column_name}"${optionalOnInsert ? '?' : ''}: ${t}`)
      update.push(`"${c.column_name}"?: ${t}`)
    }
  }
  const fks = await q(
    `SELECT con.conname, con.conkey, con.confkey, con.conrelid, con.confrelid, ft.relname AS ref_table
       FROM pg_constraint con JOIN pg_class ft ON ft.oid = con.confrelid JOIN pg_namespace fn ON fn.oid = ft.relnamespace AND fn.nspname = 'public'
      WHERE con.contype = 'f' AND con.conrelid = ('public.' || quote_ident($1))::regclass
      ORDER BY con.conname COLLATE "C"`,
    [name]
  )
  const rels = []
  for (const fk of fks) {
    const names = async (rel, nums) =>
      (await q(
        `SELECT a.attname FROM unnest($2::int2[]) WITH ORDINALITY k(n, ord)
           JOIN pg_attribute a ON a.attrelid = $1::oid AND a.attnum = k.n ORDER BY k.ord`,
        [rel, nums]
      )).map((r) => r.attname)
    const colsFrom = await names(fk.conrelid, fk.conkey)
    const colsTo = await names(fk.confrelid, fk.confkey)
    const uniq = await q(
      `SELECT 1 FROM pg_index i WHERE i.indrelid = $1::oid AND i.indisunique AND i.indpred IS NULL
          AND i.indnatts = $3 AND (SELECT array_agg(k ORDER BY k) FROM unnest(i.indkey::int2[]) k) = $2::int2[] LIMIT 1`,
      [fk.conrelid, [...fk.conkey].sort((a, b) => a - b), fk.conkey.length]
    )
    rels.push(
      `{\n      foreignKeyName: "${fk.conname}"\n      columns: [${colsFrom.map((c) => `"${c}"`).join(', ')}]\n` +
        `isOneToOne: ${uniq.length > 0}\n      referencedRelation: "${fk.ref_table}"\n      referencedColumns: [${colsTo.map((c) => `"${c}"`).join(', ')}]\n    }`
    )
  }
  return (
    `"${name}": {\n` +
    `                  Row: {\n                    ${row.join(',')}\n                  }\n` +
    `                  Insert: {\n                    ${insert.join(',')}\n                  }\n` +
    `                  Update: {\n                    ${update.join(',')}\n                  }\n` +
    `                  Relationships: [\n                    ${rels.join(',')}\n                  ]\n` +
    `                }`
  )
}

// ---------------------------------------------------------------------------
// Render functions
// ---------------------------------------------------------------------------
async function renderFunction(oid) {
  const [p] = await q(
    `SELECT p.proname, p.pronargs, p.pronargdefaults, p.proargnames, p.proargmodes, p.proallargtypes::oid[] AS allargtypes,
            p.proargtypes::oid[] AS argtypes, p.proretset, p.prorettype,
            (SELECT typname FROM pg_type WHERE oid = p.prorettype) AS rettype
       FROM pg_proc p WHERE p.oid = $1::oid`,
    [oid]
  )
  const typeName = async (typeOid) => (await q(`SELECT typname FROM pg_type WHERE oid = $1::oid`, [typeOid]))[0].typname
  const modes = p.proargmodes
  const names = p.proargnames || []
  const all = p.allargtypes || p.argtypes
  const inArgs = []
  const outCols = []
  for (let i = 0; i < all.length; i++) {
    const mode = modes ? modes[i] : 'i'
    const t = tsType(await typeName(all[i]))
    if (mode === 'i' || mode === 'b' || mode === 'v') inArgs.push({ name: names[i], t })
    else if (mode === 't' || mode === 'o') outCols.push({ name: names[i], t })
  }
  if (inArgs.some((a) => !a.name)) throw new Error(`function ${p.proname} has unnamed arguments`)
  const firstDefault = inArgs.length - p.pronargdefaults
  const argStrs = inArgs
    .map((a, i) => ({ ...a, optional: i >= firstDefault }))
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((a) => `"${a.name}"${a.optional ? '?' : ''}: ${a.t}`)
  const argsText = argStrs.length ? `{ ${argStrs.join(',')} }` : 'Record<PropertyKey, never>'
  let returns
  if (outCols.length) {
    const body = `{\n              ${outCols.map((c) => `"${c.name}": ${c.t}`).join(',')}\n            }`
    returns = p.proretset ? `${body}[]` : body
  } else if (p.rettype === 'void') {
    returns = 'undefined'
  } else {
    const t = nowTables.includes(p.rettype)
      ? `Database["public"]["Tables"]["${p.rettype}"]["Row"]`
      : tsType(p.rettype)
    returns = p.proretset ? `${t}[]` : t
  }
  return `"${p.proname}":\n{ Args: ${argsText}; Returns: ${returns}\n                           }`
}

// ---------------------------------------------------------------------------
// Delta
// ---------------------------------------------------------------------------
const nowTables = (await q(SNAPSHOT_SQL.tables)).map((r) => r.name).sort()
const nowFunctions = await q(
  `SELECT p.oid::int AS oid, p.oid::regprocedure::text AS sig, p.proname FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prorettype <> 'trigger'::regtype`
)
const newTables = nowTables.filter((t) => !before.tables.has(t))
const newFunctions = nowFunctions.filter((f) => !before.functions.has(f.sig)).sort((a, b) => (a.proname < b.proname ? -1 : 1))
const dupNames = newFunctions.map((f) => f.proname).filter((n, i, a) => a.indexOf(n) !== i)
if (dupNames.length) {
  console.error(`FAIL: overloaded new functions are not representable by this tool: ${[...new Set(dupNames)].join(', ')}`)
  process.exit(1)
}

const expectedTables = new Map()
for (const t of newTables) expectedTables.set(t, await renderTable(t))
const expectedFunctions = new Map()
for (const f of newFunctions) expectedFunctions.set(f.proname, await renderFunction(f.oid))

// The checkout may carry CRLF endings (git autocrlf); compare and edit on LF, write back as found.
const rawSource = readFileSync(TYPES_FILE, 'utf8')
const EOL_CRLF = rawSource.includes('\r\n')
let source = rawSource.replace(/\r\n/g, '\n')
const publicStart = source.indexOf('"public": {')
const viewsAnchor = source.indexOf('          Views: {', publicStart)
const enumsAnchor = source.indexOf('          Enums: {', publicStart)
if (publicStart < 0 || viewsAnchor < 0 || enumsAnchor < 0) {
  console.error('FAIL: could not locate the public Tables/Functions blocks in database.types.ts')
  process.exit(1)
}

const problems = []
const missingTables = []
const missingFunctions = []
const publicBlock = () => source.slice(publicStart)

for (const [name, text] of expectedTables) {
  if (publicBlock().includes(text)) continue
  if (publicBlock().includes(`"${name}": {\n                  Row: {`)) problems.push(`table ${name}: present but differs from the database definition`)
  else missingTables.push(name)
}
for (const [name, text] of expectedFunctions) {
  if (publicBlock().includes(text)) continue
  if (publicBlock().includes(`"${name}":\n{ Args:`)) problems.push(`function ${name}: present but differs from the database definition`)
  else missingFunctions.push(name)
}

if (WRITE && (missingTables.length || missingFunctions.length)) {
  // Tables: closing `}` of the last public table sits just before `Views: {`.
  if (missingTables.length) {
    const tablesTail = source.lastIndexOf('\n          }\n', viewsAnchor)
    const add = missingTables.map((n) => `,${expectedTables.get(n)}`).join('')
    source = source.slice(0, tablesTail) + add + source.slice(tablesTail)
  }
  if (missingFunctions.length) {
    const enumsNow = source.indexOf('          Enums: {', publicStart)
    const fnTail = source.lastIndexOf('\n          }\n', enumsNow)
    const add = missingFunctions.map((n) => `,\n${expectedFunctions.get(n)}`).join('')
    source = source.slice(0, fnTail) + add + source.slice(fnTail)
  }
  writeFileSync(TYPES_FILE, EOL_CRLF ? source.replace(/\n/g, '\r\n') : source, 'utf8')
  console.log(`WROTE ${missingTables.length} table(s), ${missingFunctions.length} function(s) into database.types.ts`)
  missingTables.length = 0
  missingFunctions.length = 0
}

console.log(`since ${SINCE}: ${newTables.length} new table(s) [${newTables.join(', ')}]`)
console.log(`since ${SINCE}: ${newFunctions.length} new public function(s)`)
for (const n of missingTables) problems.push(`table ${n}: missing from database.types.ts`)
for (const n of missingFunctions) problems.push(`function ${n}: missing from database.types.ts`)

if (problems.length) {
  for (const p of problems) console.error('DRIFT  ' + p)
  console.error(`FAIL: ${problems.length} drift finding(s). Run with --write to add missing entries; fix differing ones deliberately.`)
  process.exit(1)
}
console.log('PASS: database.types.ts matches the migration chain for every table and function added since ' + SINCE)
