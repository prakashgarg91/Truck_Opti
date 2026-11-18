/**
 * PostgREST-style TABLE endpoints for the local Supabase shim (task H3).
 *
 * Plugs into scripts/harness/server.mjs through registerRestHandler:
 *   import { startHarnessServer } from './server.mjs'
 *   import { registerRest } from './rest.mjs'
 *   const h = await startHarnessServer({ ... }); registerRest(h)
 *
 * Every request runs inside ctx.withIdentity (BEGIN; SET LOCAL ROLE authenticated|anon;
 * request.jwt.claims; ...; COMMIT), so RLS and column privileges are the real ones.
 *
 * Implemented (exactly what the agency pages use, plus the standard PostgREST basics):
 *   GET / HEAD  /rest/v1/<table>   select= (comma list or *), filters eq neq gt gte lt lte in is like ilike
 *                                  and not.<op>, order=col.asc|desc[.nullsfirst|.nullslast], limit, offset,
 *                                  Range/Range-Unit, Prefer: count=exact (Content-Range), Accept: object+json
 *   POST        insert (return=representation|minimal), upsert (resolution=merge-duplicates|ignore-duplicates,
 *                                  on_conflict)
 *   PATCH       update with filters (no filter: 400 21000 like pg-safeupdate)
 * Answered 501 with a JSON body naming the feature: embedded selects/relations, or/and, aliases and casts in
 * select, JSON paths, operators outside the list above, DELETE, PUT, csv/geojson/plan output.
 *
 * Identifiers are validated against the pg_catalog column list of public.<table> (not information_schema,
 * which hides columns the role may not read: a revoked column must produce 42501, never vanish) and quoted
 * only after that allow-list check. Every value is a bind parameter cast to the column's catalog type.
 */

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

class Abort extends Error {
  constructor(status, body) {
    super(body.message)
    this.status = status
    this.body = body
  }
}
const fail = (status, code, message, details = null, hint = null) => new Abort(status, { code, message, details, hint })
const unsupported = (feature) =>
  new Abort(501, {
    code: 'HARNESS501',
    message: `Unsupported PostgREST feature in the local harness: ${feature}`,
    details: feature,
    hint: 'Implement it in scripts/harness/rest.mjs or keep this page a hosted-only gate',
    feature,
  })

const q = (name) => `"${String(name).replace(/"/g, '""')}"`

const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in'])
const KNOWN_UNSUPPORTED_OPS = new Set([
  'cs', 'cd', 'ov', 'sl', 'sr', 'nxl', 'nxr', 'adj', 'fts', 'plfts', 'phfts', 'wfts', 'match', 'imatch', 'isdistinct',
])
const SQL_OP = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])

class Params {
  constructor() {
    this.values = []
  }
  add(v) {
    this.values.push(v)
    return `$${this.values.length}`
  }
}

/** SQL expression binding JS value v to a column of catalog type `type`. */
function bind(P, type, v) {
  if (v === null || v === undefined) return `${P.add(null)}::${type}`
  if (type.endsWith('[]') && Array.isArray(v)) {
    return `ARRAY(SELECT jsonb_array_elements_text(${P.add(JSON.stringify(v))}::jsonb))::${type}`
  }
  if (type === 'json' || type === 'jsonb') return `${P.add(JSON.stringify(v))}::${type}`
  return `${P.add(typeof v === 'object' ? JSON.stringify(v) : String(v))}::${type}`
}

function parsePrefer(headers) {
  const out = {}
  for (const part of String(headers.prefer ?? '').split(',')) {
    const [k, ...rest] = part.trim().split('=')
    if (k) out[k.trim().toLowerCase()] = rest.join('=').trim().toLowerCase()
  }
  return out
}

/** Split "a,b,\"c,d\"" honouring double quotes with backslash escapes. */
function splitList(s) {
  const items = []
  let cur = ''
  let quoted = false
  let wasQuoted = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '\\' && i + 1 < s.length) cur += s[++i]
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') {
      quoted = true
      wasQuoted = true
    } else if (ch === ',') {
      items.push(cur)
      cur = ''
      wasQuoted = false
    } else cur += ch
  }
  if (quoted) throw fail(400, 'PGRST100', 'Unterminated quoted value in list')
  if (cur !== '' || wasQuoted || items.length) items.push(cur)
  return items
}

async function loadCatalog(c, table) {
  const r = await c.query(
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      ORDER BY a.attnum`,
    [table]
  )
  if (r.rows.length === 0) throw fail(404, 'PGRST205', `Could not find the table 'public.${table}' in the schema cache`, null, null)
  return new Map(r.rows.map((x) => [x.name, x.type]))
}

function requireColumn(cols, name, what = 'column') {
  if (!IDENT.test(name)) {
    if (/->|\.|\(|:/.test(name)) throw unsupported(`${what} expression ${JSON.stringify(name.slice(0, 40))} (JSON path, cast, alias or embedded resource)`)
    throw fail(400, 'PGRST100', `Invalid ${what} name`, 'names must match [A-Za-z_][A-Za-z0-9_]*', null)
  }
  if (!cols.has(name)) throw fail(400, '42703', `column ${name} does not exist`, null, null)
  return name
}

function parseSelect(raw, cols) {
  if (raw === null || raw.trim() === '' || raw.trim() === '*') return { sql: '*', list: null }
  const items = []
  let depth = 0
  let cur = ''
  for (const ch of raw) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      items.push(cur)
      cur = ''
    } else cur += ch
  }
  items.push(cur)
  const parts = []
  for (const item of items.map((s) => s.replace(/\s+/g, ''))) {
    if (item === '*') parts.push('*')
    else if (/[(!]/.test(item)) throw unsupported(`embedded select / relation ${JSON.stringify(item.slice(0, 60))}`)
    else if (item.includes(':') || item.includes('->')) throw unsupported(`select alias, cast or JSON path ${JSON.stringify(item.slice(0, 60))}`)
    else parts.push(q(requireColumn(cols, item, 'select column')))
  }
  return { sql: parts.join(', '), list: parts }
}

function parseFilters(url, cols) {
  const filters = []
  for (const [key, raw] of url.searchParams) {
    if (RESERVED.has(key)) continue
    if (key === 'or' || key === 'and' || key === 'not.or' || key === 'not.and' || /\.(or|and)$/.test(key)) {
      throw unsupported(`logical operator ${key.replace(/^.*\./, '')}= (or/and groups)`)
    }
    if (key.includes('.')) throw unsupported(`filter on an embedded resource (${JSON.stringify(key.slice(0, 40))})`)
    const col = requireColumn(cols, key, 'filter column')
    let rest = raw
    let neg = false
    if (rest.startsWith('not.')) {
      neg = true
      rest = rest.slice(4)
    }
    const dot = rest.indexOf('.')
    if (dot < 1) throw fail(400, 'PGRST100', `failed to parse filter (${key}=${raw.slice(0, 40)})`, 'expected <operator>.<value>', null)
    const op = rest.slice(0, dot)
    const value = rest.slice(dot + 1)
    if (!OPS.has(op)) {
      if (KNOWN_UNSUPPORTED_OPS.has(op) || /[(]/.test(op) || op === 'not') throw unsupported(`filter operator ${op}`)
      throw fail(400, 'PGRST100', `failed to parse filter (${key}=${raw.slice(0, 40)})`, `unknown operator ${JSON.stringify(op.slice(0, 20))}`, null)
    }
    filters.push({ col, neg, op, value })
  }
  return filters
}

function whereSql(filters, cols, P) {
  const parts = filters.map((f) => {
    const type = cols.get(f.col)
    const col = q(f.col)
    let expr
    if (f.op === 'is') {
      const v = f.value.toLowerCase()
      if (!['null', 'true', 'false', 'unknown'].includes(v)) throw fail(400, 'PGRST100', 'Invalid value for is', 'expected null, true, false or unknown', null)
      expr = `${col} IS ${v.toUpperCase()}`
    } else if (f.op === 'in') {
      if (!/^\(.*\)$/s.test(f.value)) throw fail(400, 'PGRST100', 'Invalid value for in', 'expected in.(a,b,c)', null)
      const items = splitList(f.value.slice(1, -1))
      if (items.length > 1000) throw fail(400, 'PGRST100', 'Too many values in in.(...)', 'at most 1000', null)
      expr = items.length === 0 ? 'false' : `${col} IN (${items.map((v) => bind(P, type, v)).join(', ')})`
    } else if (f.op === 'like' || f.op === 'ilike') {
      expr = `${col}::text ${f.op === 'like' ? 'LIKE' : 'ILIKE'} ${P.add(f.value.replace(/\*/g, '%'))}::text`
    } else {
      expr = `${col} ${SQL_OP[f.op]} ${bind(P, type, f.value)}`
    }
    return f.neg ? `NOT (${expr})` : `(${expr})`
  })
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : ''
}

function parseOrder(raw, cols) {
  if (raw === null || raw.trim() === '') return ''
  const parts = splitList(raw).map((item) => {
    const bits = item.trim().split('.')
    const col = requireColumn(cols, bits[0], 'order column')
    let dir = ''
    let nulls = ''
    for (const b of bits.slice(1)) {
      if (b === 'asc') dir = ' ASC'
      else if (b === 'desc') dir = ' DESC'
      else if (b === 'nullsfirst') nulls = ' NULLS FIRST'
      else if (b === 'nullslast') nulls = ' NULLS LAST'
      else throw fail(400, 'PGRST100', `Invalid order modifier ${JSON.stringify(b.slice(0, 20))}`, null, null)
    }
    return `${q(col)}${dir}${nulls}`
  })
  return ` ORDER BY ${parts.join(', ')}`
}

const nonNegInt = (raw, what) => {
  if (!/^\d{1,9}$/.test(raw)) throw fail(400, 'PGRST100', `Invalid ${what}`, 'expected a non-negative integer', null)
  return Number(raw)
}

function parseRange(url, headers) {
  let limit = null
  let offset = 0
  const hdr = typeof headers.range === 'string' ? /^(\d+)-(\d*)$/.exec(headers.range.trim()) : null
  if (hdr && (headers['range-unit'] ?? 'items') === 'items') {
    offset = Number(hdr[1])
    if (hdr[2] !== '') limit = Number(hdr[2]) - offset + 1
    if (limit !== null && limit < 1) throw fail(416, 'PGRST103', 'Requested range not satisfiable', 'upper bound must not be below lower bound', null)
  }
  const l = url.searchParams.get('limit')
  const o = url.searchParams.get('offset')
  if (l !== null) limit = nonNegInt(l, 'limit')
  if (o !== null) offset = nonNegInt(o, 'offset')
  return { limit, offset }
}

const isSingular = (headers) => /application\/vnd\.pgrst\.object\+json/i.test(String(headers.accept ?? ''))

function checkAccept(headers) {
  const a = String(headers.accept ?? '')
  if (/text\/csv|geo\+json|vnd\.pgrst\.plan|vnd\.pgrst\.array/i.test(a)) throw unsupported(`Accept: ${a.slice(0, 60)}`)
}

function singularError(n) {
  return fail(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${n} rows`, null)
}

const SINGULAR_TYPE = 'application/vnd.pgrst.object+json; charset=utf-8'

// ---------------------------------------------------------------------------------------------------
async function doRead(c, ctx, cols) {
  const { url, headers } = ctx
  checkAccept(headers)
  const prefer = parsePrefer(headers)
  const sel = parseSelect(url.searchParams.get('select'), cols)
  const filters = parseFilters(url, cols)
  const P = new Params()
  const where = whereSql(filters, cols, P)
  const order = parseOrder(url.searchParams.get('order'), cols)
  const { limit, offset } = parseRange(url, headers)
  const singular = isSingular(headers) && ctx.method === 'GET'
  const wantCount = ['exact', 'planned', 'estimated'].includes(prefer.count)

  let total = null
  if (wantCount) total = Number((await c.query(`SELECT count(*)::text AS n FROM public.${q(ctx.table)}${where}`, P.values)).rows[0].n)

  const lim = singular ? '' : limit !== null ? ` LIMIT ${limit}` : ''
  const off = singular ? '' : offset > 0 ? ` OFFSET ${offset}` : ''
  let rows = []
  if (ctx.method === 'HEAD') {
    if (!wantCount) rows = []
  } else {
    rows = (await c.query(`SELECT to_json(t) AS j FROM (SELECT ${sel.sql} FROM public.${q(ctx.table)}${where}${order}${lim}${off}) t`, P.values)).rows.map((r) => r.j)
  }

  if (singular) {
    if (rows.length !== 1) throw singularError(rows.length)
    return { status: 200, body: rows[0], headers: { 'Content-Type': SINGULAR_TYPE, 'Content-Range': `0-0/${total ?? '*'}` } }
  }
  if (wantCount && offset > 0 && offset >= total && total > 0) {
    throw fail(416, 'PGRST103', 'Requested range not satisfiable', `An offset of ${offset} was requested, but there are only ${total} rows`, null)
  }
  const n = ctx.method === 'HEAD' ? Math.max(0, Math.min(limit ?? Infinity, (total ?? 0) - offset)) : rows.length
  const range = n > 0 ? `${offset}-${offset + n - 1}/${total ?? '*'}` : `*/${total ?? '*'}`
  const status = wantCount && n < total ? 206 : 200
  return { status, body: ctx.method === 'HEAD' ? undefined : rows, headers: { 'Content-Range': range } }
}

function bodyRows(body) {
  const rows = Array.isArray(body) ? body : [body]
  for (const r of rows) {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) throw fail(400, 'PGRST102', 'All object keys must match', 'the body must be a JSON object or an array of objects', null)
  }
  return rows
}

function checkKeys(cols, table, row) {
  const keys = Object.keys(row)
  for (const k of keys) {
    if (!IDENT.test(k) || !cols.has(k)) throw fail(400, 'PGRST204', `Could not find the '${k.slice(0, 60)}' column of '${table}' in the schema cache`, null, null)
  }
  return keys
}

async function doInsert(c, ctx, cols, body) {
  const { url, headers, table } = ctx
  const prefer = parsePrefer(headers)
  const rows = bodyRows(body)
  const sel = parseSelect(url.searchParams.get('select'), cols)
  const representation = prefer.return === 'representation'
  const singular = isSingular(headers)
  checkAccept(headers)

  let conflict = ''
  const resolution = prefer.resolution
  if (resolution && resolution !== 'merge-duplicates' && resolution !== 'ignore-duplicates') throw unsupported(`Prefer: resolution=${resolution.slice(0, 30)}`)
  let target = null
  if (resolution) {
    const oc = url.searchParams.get('on_conflict')
    if (oc !== null && oc !== '') target = splitList(oc).map((n) => requireColumn(cols, n.trim(), 'on_conflict column'))
    else {
      const pk = await c.query(
        `SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
          WHERE i.indrelid = ('public.' || quote_ident($1))::regclass AND i.indisprimary ORDER BY array_position(i.indkey::int2[], a.attnum)`,
        [table]
      )
      target = pk.rows.map((r) => r.attname)
      if (target.length === 0) throw fail(400, 'PGRST100', 'upsert needs on_conflict or a primary key', null, null)
    }
  }

  const out = []
  for (const row of rows) {
    const keys = checkKeys(cols, table, row)
    const P = new Params()
    let sql
    if (keys.length === 0) sql = `INSERT INTO public.${q(table)} DEFAULT VALUES`
    else sql = `INSERT INTO public.${q(table)} (${keys.map(q).join(', ')}) VALUES (${keys.map((k) => bind(P, cols.get(k), row[k])).join(', ')})`
    if (target) {
      if (resolution === 'ignore-duplicates') conflict = ` ON CONFLICT (${target.map(q).join(', ')}) DO NOTHING`
      else {
        const sets = keys.filter((k) => !target.includes(k))
        const assign = (sets.length ? sets : target).map((k) => `${q(k)} = EXCLUDED.${q(k)}`).join(', ')
        conflict = ` ON CONFLICT (${target.map(q).join(', ')}) DO UPDATE SET ${assign}`
      }
      sql += conflict
    }
    if (representation) {
      const r = await c.query(`WITH w AS (${sql} RETURNING ${sel.sql}) SELECT to_json(w) AS j FROM w`, P.values)
      out.push(...r.rows.map((x) => x.j))
    } else await c.query(sql, P.values)
  }

  if (!representation) return { status: 201, body: undefined, headers: { 'Content-Range': '*/*' } }
  if (singular) {
    if (out.length !== 1) throw singularError(out.length)
    return { status: 201, body: out[0], headers: { 'Content-Type': SINGULAR_TYPE, 'Content-Range': '*/*' } }
  }
  return { status: 201, body: out, headers: { 'Content-Range': '*/*' } }
}

async function doUpdate(c, ctx, cols, body) {
  const { url, headers, table } = ctx
  const prefer = parsePrefer(headers)
  checkAccept(headers)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'PGRST102', 'Payload must be a single JSON object', null, null)
  const keys = checkKeys(cols, table, body)
  if (keys.length === 0) throw fail(400, 'PGRST102', 'Empty or invalid json', 'an update needs at least one column', null)
  const filters = parseFilters(url, cols)
  if (filters.length === 0) throw fail(400, '21000', 'UPDATE requires a WHERE clause', null, null)
  const sel = parseSelect(url.searchParams.get('select'), cols)
  const representation = prefer.return === 'representation'
  const singular = isSingular(headers)
  const P = new Params()
  const sets = keys.map((k) => `${q(k)} = ${bind(P, cols.get(k), body[k])}`).join(', ')
  const sql = `UPDATE public.${q(table)} SET ${sets}${whereSql(filters, cols, P)}`
  if (!representation) {
    await c.query(sql, P.values)
    return { status: 204, body: undefined, headers: { 'Content-Range': '*/*' } }
  }
  const rows = (await c.query(`WITH w AS (${sql} RETURNING ${sel.sql}) SELECT to_json(w) AS j FROM w`, P.values)).rows.map((r) => r.j)
  if (singular) {
    if (rows.length !== 1) throw singularError(rows.length)
    return { status: 200, body: rows[0], headers: { 'Content-Type': SINGULAR_TYPE, 'Content-Range': '0-0/*' } }
  }
  return { status: 200, body: rows, headers: { 'Content-Range': rows.length ? `0-${rows.length - 1}/*` : '*/*' } }
}

// ---------------------------------------------------------------------------------------------------
export async function restHandler(ctx) {
  const { method, headers } = ctx
  const respond = (out) => {
    ctx.sendJson(out.status, out.body, out.headers)
    return true
  }
  const abort = (e) => {
    ctx.sendError(e.status, e.body)
    return true
  }

  if (method === 'DELETE' || method === 'PUT') return abort(unsupported(`${method} on tables (not used by the agency pages)`))
  if (!['GET', 'HEAD', 'POST', 'PATCH'].includes(method)) {
    return abort(fail(405, 'PGRST117', `Unsupported HTTP method: ${method}`))
  }
  const profile = headers[method === 'GET' || method === 'HEAD' ? 'accept-profile' : 'content-profile']
  if (profile && profile !== 'public') return abort(fail(406, 'PGRST106', 'The schema must be one of the following: public'))

  let body
  try {
    if (method === 'POST' || method === 'PATCH') body = await ctx.readJson()
  } catch (e) {
    if (e && e.jsonError) return abort(fail(400, 'PGRST102', 'Empty or invalid json'))
    throw e
  }

  try {
    const out = await ctx.withIdentity(async (c) => {
      const cols = await loadCatalog(c, ctx.table)
      if (method === 'GET' || method === 'HEAD') return doRead(c, ctx, cols)
      if (method === 'POST') return doInsert(c, ctx, cols, body)
      return doUpdate(c, ctx, cols, body)
    })
    return respond(out)
  } catch (e) {
    if (e instanceof Abort) return abort(e)
    if (e && /^[0-9A-Z]{5}$/.test(String(e.code)) && !e.pgFatal) {
      const mapped = ctx.mapPgError(e)
      ctx.sendError(mapped.status, mapped.body)
      return true
    }
    throw e
  }
}

/** Plug the table endpoints into a harness instance returned by startHarnessServer. Returns an unregister fn. */
export function registerRest(harness) {
  return harness.registerRestHandler(restHandler)
}
