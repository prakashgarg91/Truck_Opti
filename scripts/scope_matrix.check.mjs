#!/usr/bin/env node
// Static checker: agency staff scopes in SQL RPCs vs the UI access matrix.
//
// SQL side : supabase/migrations/*.sql, in filename order. The LAST file that
//            defines `public.<name>` wins. Its `resolve_caller_agency_for_scopes(ARRAY[...])`
//            scope list is the SQL scope set. Owners always pass (transport_agencies.user_id),
//            so they are excluded from comparison. An empty ARRAY[] means owner-only.
// UI side  : frontend/src/lib/agencyAccess.ts ROUTE_ACCESS (act lists), mapped to RPCs
//            through frontend/src/services/*.ts (export -> RPC literal) and
//            frontend/src/pages/*.tsx (page -> service export) and App.tsx (route -> page).
//
// Exit 1 when the UI shows an action to a scope the SQL refuses (user would see an error).
// Warnings (exit 0) when the SQL allows a scope the UI hides (feature unreachable there).
// Regex-based by design: no dependencies, no TypeScript or SQL parser.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const ALL_SCOPES = ['dispatcher', 'fleet_manager', 'finance', 'viewer']
const parseList = (s) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])

// ---------- SQL side ----------
const migDir = join(ROOT, 'supabase/migrations')
const migFiles = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()
const sqlScopes = new Map() // fn -> { scopes: string[] | null, file }
const unclassified = [] // { fn, file, reason }
const DEF_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi
const RESOLVE_ARRAY_RE = /resolve_caller_agency_for_scopes\(\s*ARRAY\[([^\]]*)\]/i
const RESOLVE_ANY_RE = /resolve_caller_agency_for_scopes\(/i

for (const file of migFiles) {
  const text = readFileSync(join(migDir, file), 'utf8')
  const defs = [...text.matchAll(DEF_RE)]
  defs.forEach((m, i) => {
    const name = m[1].toLowerCase()
    const end = i + 1 < defs.length ? defs[i + 1].index : text.length
    const body = text.slice(m.index, end)
    const arr = body.match(RESOLVE_ARRAY_RE)
    if (arr) {
      sqlScopes.set(name, { scopes: parseList(arr[1]), file })
    } else if (RESOLVE_ANY_RE.test(body)) {
      // Latest definition is not classifiable (scope list is not a literal array).
      sqlScopes.set(name, { scopes: null, file })
      unclassified.push({ fn: name, file, reason: 'scope argument is not a literal ARRAY[...]' })
    } else {
      // Latest definition does not gate on resolve_caller_agency_for_scopes at all.
      sqlScopes.set(name, { scopes: null, file })
    }
  })
}
// Functions whose latest definition has no literal scope gate are not scope-classified.
for (const [name, v] of sqlScopes) {
  if (v.scopes === null && !unclassified.some((u) => u.fn === name)) {
    unclassified.push({ fn: name, file: v.file, reason: 'no resolve_caller_agency_for_scopes call in latest definition' })
  }
}

// ---------- UI matrix ----------
const access = read('frontend/src/lib/agencyAccess.ts')
const routeAccess = new Map()
for (const m of access.matchAll(/'(\/[^']+)':\s*\{\s*read:\s*([^,]+),\s*act:\s*([^}]+?)\s*\}/g)) {
  const expand = (raw) => {
    const t = raw.trim()
    if (t === 'ALL') return ALL_SCOPES
    if (t === "'owner'") return []
    return parseList(t)
  }
  routeAccess.set(m[1], expand(m[3]))
}
const actFor = (path) => {
  const p = path.replace(/\/+$/, '') || '/'
  if (routeAccess.has(p)) return routeAccess.get(p)
  if (p.startsWith('/agency/clients/')) return routeAccess.get('/agency/clients')
  return null // not in matrix: UI does not gate it (owner-only checks still apply)
}

// services: export -> RPC names it calls (only names that are SQL functions)
const svcDir = join(ROOT, 'frontend/src/services')
const exportRpcs = new Map() // exportName -> Set(rpc)
const RPC_LIT = /['"]((?:agency|subscription|admin)_[a-z0-9_]+)['"]/g
for (const f of readdirSync(svcDir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
  const text = readFileSync(join(svcDir, f), 'utf8')
  const exps = [...text.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)]
  exps.forEach((m, i) => {
    const end = i + 1 < exps.length ? exps[i + 1].index : text.length
    for (const lit of text.slice(m.index, end).matchAll(RPC_LIT)) {
      if (sqlScopes.has(lit[1])) {
        if (!exportRpcs.has(m[1])) exportRpcs.set(m[1], new Set())
        exportRpcs.get(m[1]).add(lit[1])
      }
    }
  })
}
// services that call RPCs outside an export (e.g. inside a class/object): attribute to file-level fallback
const literalOnlyRpcs = new Set()
for (const f of readdirSync(svcDir).filter((x) => x.endsWith('.ts') && !x.endsWith('.test.ts'))) {
  const text = readFileSync(join(svcDir, f), 'utf8')
  for (const lit of text.matchAll(RPC_LIT)) if (sqlScopes.has(lit[1])) literalOnlyRpcs.add(lit[1])
}

// App.tsx: route path -> page component; component -> page file
const app = read('frontend/src/App.tsx')
const importFile = new Map()
for (const m of app.matchAll(/import\s+(?:(\w+)|\{([^}]+)\})\s+from\s+'\.\/pages\/(\w+)'/g)) {
  if (m[1]) importFile.set(m[1], m[3])
  if (m[2]) for (const n of m[2].split(',').map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean)) importFile.set(n, m[3])
}
// Lazy pages: const X = React.lazy(() => import('./pages/Y'))
for (const m of app.matchAll(/const\s+(\w+)\s*=\s*(?:React\.)?lazy\(\s*\(\)\s*=>\s*import\(\s*'\.\/pages\/(\w+)'/g)) {
  importFile.set(m[1], m[2])
}
const routeToPage = []
for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{[^<]*<(\w+)/g)) {
  const page = importFile.get(m[2])
  if (page) routeToPage.push({ path: m[1], page })
}

// page -> RPCs, via service exports it imports and uses
const pageRpcs = new Map() // page -> Set(rpc)
const pagesDir = join(ROOT, 'frontend/src/pages')
for (const f of readdirSync(pagesDir).filter((x) => x.endsWith('.tsx') && !x.endsWith('.test.tsx'))) {
  const text = readFileSync(join(pagesDir, f), 'utf8')
  const page = f.replace(/\.tsx$/, '')
  for (const [exp, rpcs] of exportRpcs) {
    if (new RegExp(`\\b${exp}\\b`).test(text)) {
      if (!pageRpcs.has(page)) pageRpcs.set(page, new Set())
      rpcs.forEach((r) => pageRpcs.get(page).add(r))
    }
  }
}

// RPC -> UI scopes (union over every matrix route whose page reaches it)
const uiScopes = new Map() // rpc -> { scopes:Set, routes:Set }
const uiRoutesFor = (rpc) => {
  if (!uiScopes.has(rpc)) uiScopes.set(rpc, { scopes: new Set(), routes: new Set() })
  return uiScopes.get(rpc)
}
const reachedBy = new Map() // rpc -> Set(route) for any route (matrix or not)
for (const { path, page } of routeToPage) {
  const rpcs = pageRpcs.get(page)
  if (!rpcs) continue
  for (const r of rpcs) {
    if (!reachedBy.has(r)) reachedBy.set(r, new Set())
    reachedBy.get(r).add(path)
    // Not in the matrix: canActOnRoute() is true for every caller, so every scope sees it.
    const act = actFor(path) ?? ALL_SCOPES
    const e = uiRoutesFor(r)
    act.forEach((s) => e.scopes.add(s))
    e.routes.add(path)
  }
}

// ---------- compare ----------
const rows = []
let mismatches = 0
const warnings = []
const rpcNames = [...new Set([...literalOnlyRpcs])].sort()
for (const rpc of rpcNames) {
  const sql = sqlScopes.get(rpc)
  if (!sql || sql.scopes === null) continue // unclassified, reported below
  const sqlSet = new Set(sql.scopes)
  const ui = uiScopes.get(rpc)
  const uiSet = ui ? ui.scopes : new Set()
  const reach = reachedBy.get(rpc)
  const routes = ui ? [...ui.routes] : []
  const refused = [...uiSet].filter((s) => !sqlSet.has(s)) // UI shows, SQL refuses
  const hidden = [...sqlSet].filter((s) => !uiSet.has(s)) // SQL allows, UI hides
  let status = 'ok'
  if (!reach) status = 'no-ui-route (not checked)'
  else if (refused.length) {
    status = 'MISMATCH'
    mismatches++
  } else if (hidden.length) {
    status = 'warn: hidden'
    warnings.push({ rpc, hidden, routes: [...reach] })
  }
  rows.push({
    rpc,
    sql: sql.scopes.length ? sql.scopes.join(',') : 'owner-only',
    ui: reach ? (uiSet.size ? [...uiSet].join(',') : 'owner-only') : '-',
    routes: routes.join(' ') || [...(reach || [])].join(' ') || '-',
    status,
    detail: refused.length ? `UI shows to refused: ${refused.join(',')}` : hidden.length ? `SQL allows, UI hides: ${hidden.join(',')}` : '',
  })
}

const pad = (s, n) => String(s).padEnd(n)
const widths = { rpc: 40, sql: 26, ui: 26 }
console.log(`${pad('RPC', widths.rpc)}${pad('SQL scopes', widths.sql)}${pad('UI scopes', widths.ui)}STATUS  ROUTES`)
for (const r of rows) {
  console.log(`${pad(r.rpc, widths.rpc)}${pad(r.sql, widths.sql)}${pad(r.ui, widths.ui)}${pad(r.status, 24)}${r.routes}`)
  if (r.detail) console.log(`${' '.repeat(widths.rpc)}  -> ${r.detail}`)
}

console.log(`\nChecked ${rows.length} RPCs with a SQL scope gate and a UI route.`)
console.log(`MISMATCH (UI shows, SQL refuses): ${mismatches}`)
for (const r of rows.filter((x) => x.status === 'MISMATCH')) console.log(`  - ${r.rpc}: ${r.detail}`)
console.log(`WARNINGS (SQL allows, UI hides): ${warnings.length}`)
for (const w of warnings) console.log(`  - ${w.rpc}: ${w.hidden.join(',')} (routes: ${w.routes.join(' ')})`)

const unmapped = [...literalOnlyRpcs].filter((r) => !reachedBy.has(r)).sort()
console.log(`\nRPCs with no UI route found (services only, not classified for UI): ${unmapped.length}`)
if (unmapped.length) console.log(`  ${unmapped.join(', ')}`)
const unc = [...new Set(unclassified.filter((u) => literalOnlyRpcs.has(u.fn)).map((u) => `${u.fn} (${u.file}): ${u.reason}`))].sort()
console.log(`\nSQL functions not classified: ${unc.length}`)
for (const u of unc) console.log(`  - ${u}`)

process.exit(mismatches > 0 ? 1 : 0)
