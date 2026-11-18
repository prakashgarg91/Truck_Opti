/**
 * Local Supabase shim for the browser journey harness (task H2: server core).
 *
 * A small node:http server on 127.0.0.1 that speaks just enough of GoTrue (/auth/v1/*) and
 * PostgREST (/rest/v1/rpc/<fn>) for supabase-js, backed by the embedded PostgreSQL 18 started by
 * scripts/race/_realPg.mjs. Every data request runs in ONE transaction as the real roles:
 *   BEGIN; SET LOCAL ROLE authenticated|anon; set_config('request.jwt.claims', ..., true); <call>; COMMIT
 * so auth.uid(), RLS and the subscription guards behave exactly as on a hosted project.
 *
 * Hard rules:
 *  - binds 127.0.0.1 only;
 *  - no request ever runs as service_role or postgres; service_role keys are refused outright;
 *  - tables (/rest/v1/<table>) are a plug-in: registerRestHandler(fn) (rest.mjs, task H3);
 *  - /functions/v1/* and websocket upgrades answer 501.
 *
 * API:
 *   const h = await startHarnessServer({ port?, pg, users, anonKey?, maxConnections? })
 *   h.url, h.port, h.anonKey, h.close(), h.setClock(msOrDateOrFnOrNull), h.getRequestLog(),
 *   h.clearRequestLog(), h.addUser(user), h.mintAccessToken(email|id, { expiresIn }), h.registerRestHandler(fn)
 *   `pg` is the object returned by startServer() in scripts/race/_realPg.mjs (needs .connect()).
 *   users: [{ email, password, id, app_metadata?, user_metadata? }]
 *
 * REST plug-in contract: registerRestHandler(async (ctx) => handled?) where ctx is
 *   { req, res, method, table, url, headers, readBody(), identity: {role, claims}, withIdentity(fn(client)),
 *     sendJson(status, body, headers?), sendError(status, errorBody), mapPgError(err) }
 *   Return true once the response was written; anything else passes the request on.
 */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

const IDENT = /^[a-z_][a-z0-9_]*$/
const ALLOWED_ROLES = new Set(['authenticated', 'anon'])
const DEFAULT_ALLOW_HEADERS =
  'apikey, authorization, content-type, x-client-info, prefer, range, accept, accept-profile, content-profile, x-supabase-api-version'
const MAX_BODY = 5 * 1024 * 1024
const TOKEN_TTL_SECONDS = 3600

const globalRestHandlers = []
/** Plug-in hook for /rest/v1/<table>. Returns an unregister function. */
export function registerRestHandler(fn) {
  if (typeof fn !== 'function') throw new TypeError('registerRestHandler expects a function')
  globalRestHandlers.push(fn)
  return () => {
    const i = globalRestHandlers.indexOf(fn)
    if (i >= 0) globalRestHandlers.splice(i, 1)
  }
}

// ---------------------------------------------------------------------------------------------
// JWT (HS256) helpers
// ---------------------------------------------------------------------------------------------
const b64u = (buf) => Buffer.from(buf).toString('base64url')
const fromB64uJson = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'))

function signJwt(claims, secret) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64u(JSON.stringify(claims))
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest()
  return `${head}.${body}.${b64u(sig)}`
}

/** Decode without verifying (only used to refuse service_role keys early). */
function peekClaims(token) {
  try {
    const parts = String(token).split('.')
    if (parts.length !== 3) return null
    return fromB64uJson(parts[1])
  } catch {
    return null
  }
}

/** Returns { claims } or { error: 'invalid'|'expired' }. */
function verifyJwt(token, secret, nowSeconds) {
  const parts = String(token).split('.')
  if (parts.length !== 3) return { error: 'invalid' }
  let header
  let claims
  try {
    header = fromB64uJson(parts[0])
    claims = fromB64uJson(parts[1])
  } catch {
    return { error: 'invalid' }
  }
  if (!header || header.alg !== 'HS256') return { error: 'invalid' }
  const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest()
  let given
  try {
    given = Buffer.from(parts[2], 'base64url')
  } catch {
    return { error: 'invalid' }
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { error: 'invalid' }
  if (!claims || typeof claims !== 'object') return { error: 'invalid' }
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return { error: 'expired' }
  return { claims }
}

const sha = (v) => createHash('sha256').update(String(v)).digest()
const safeEqual = (a, b) => timingSafeEqual(sha(a), sha(b))

// ---------------------------------------------------------------------------------------------
// Error mapping (PostgreSQL -> PostgREST)
// ---------------------------------------------------------------------------------------------
export function mapPgError(err, { anon = false } = {}) {
  const code = err && typeof err.code === 'string' ? err.code : null
  const message = String((err && err.message) || err)
  const body = { code: code ?? 'PGRST000', message, details: (err && err.detail) || null, hint: (err && err.hint) || null }
  let status = 500
  if (!code) status = 500
  else if (code === '42501') status = anon ? 401 : 403
  else if (code === '23505' || code === '23503') status = 409
  else if (code === '40001' || code === '40P01') status = 409
  else if (code === '42883' || code === '42P01') status = 404
  else if (code === '57014') status = 504
  else if (/^(08|53|54|55|57|58|XX)/.test(code)) status = 503
  else status = 400 // P0001, SB00x, 22xxx, 23xxx, 42xxx, ... all client faults as in PostgREST
  return { status, body }
}

// ---------------------------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------------------------
export async function startHarnessServer({ port = 0, pg, users = [], anonKey, maxConnections = 6 } = {}) {
  if (!pg || typeof pg.connect !== 'function') throw new TypeError('startHarnessServer: pg (from _realPg startServer) with connect() is required')

  const jwtSecret = randomBytes(32)
  let clock = null // null | number | Date | () => number
  const nowMs = () => {
    if (clock === null) return Date.now()
    if (typeof clock === 'function') return Number(clock())
    if (clock instanceof Date) return clock.getTime()
    return Number(clock)
  }
  const nowSec = () => Math.floor(nowMs() / 1000)

  const anon = anonKey ?? signJwt({ iss: 'truckopti-harness', role: 'anon', iat: nowSec(), exp: nowSec() + 10 * 365 * 86400 }, jwtSecret)

  // users --------------------------------------------------------------------------------------
  const usersByEmail = new Map()
  const usersById = new Map()
  const addUser = (u) => {
    if (!u || !u.email || !u.password || !u.id) throw new TypeError('user needs email, password and id')
    if (u.role && u.role !== 'authenticated') throw new Error('harness users are always role authenticated')
    const user = {
      id: u.id,
      email: String(u.email).toLowerCase(),
      password: String(u.password),
      app_metadata: { provider: 'email', providers: ['email'], ...(u.app_metadata ?? {}) },
      user_metadata: u.user_metadata ?? {},
      created_at: new Date(nowMs()).toISOString(),
    }
    usersByEmail.set(user.email, user)
    usersById.set(user.id, user)
    return user
  }
  users.forEach(addUser)

  // sessions / refresh tokens --------------------------------------------------------------------
  const sessions = new Map() // sessionId -> { userId }
  const refreshTokens = new Map() // token -> { sessionId, userId, used }

  const publicUser = (u) => ({
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: u.email,
    email_confirmed_at: u.created_at,
    phone: '',
    confirmed_at: u.created_at,
    last_sign_in_at: new Date(nowMs()).toISOString(),
    app_metadata: u.app_metadata,
    user_metadata: u.user_metadata,
    identities: [],
    created_at: u.created_at,
    updated_at: u.created_at,
    is_anonymous: false,
  })

  function accessToken(user, sessionId, expiresIn = TOKEN_TTL_SECONDS) {
    const iat = nowSec()
    const exp = iat + expiresIn
    const token = signJwt(
      {
        iss: 'truckopti-harness',
        aud: 'authenticated',
        sub: user.id,
        role: 'authenticated',
        email: user.email,
        phone: '',
        iat,
        exp,
        session_id: sessionId,
        app_metadata: user.app_metadata,
        user_metadata: user.user_metadata,
        is_anonymous: false,
      },
      jwtSecret
    )
    return { token, exp }
  }

  function newSession(user) {
    const sessionId = randomUUID()
    sessions.set(sessionId, { userId: user.id })
    return issue(user, sessionId)
  }

  function issue(user, sessionId) {
    const { token, exp } = accessToken(user, sessionId)
    const refresh = randomBytes(18).toString('base64url')
    refreshTokens.set(refresh, { sessionId, userId: user.id, used: false })
    return {
      access_token: token,
      token_type: 'bearer',
      expires_in: TOKEN_TTL_SECONDS,
      expires_at: exp,
      refresh_token: refresh,
      user: publicUser(user),
    }
  }

  function mintAccessToken(who, { expiresIn = TOKEN_TTL_SECONDS } = {}) {
    const user = usersById.get(who) ?? usersByEmail.get(String(who).toLowerCase())
    if (!user) throw new Error(`unknown harness user ${who}`)
    const sessionId = randomUUID()
    sessions.set(sessionId, { userId: user.id })
    return accessToken(user, sessionId, expiresIn).token
  }

  // connection pool ---------------------------------------------------------------------------------
  const idle = []
  const waiters = []
  const all = new Set()
  let closing = false

  async function acquire() {
    if (closing) throw new Error('harness server is closing')
    const c = idle.pop()
    if (c) return c
    if (all.size < maxConnections) {
      const conn = await pg.connect() // superuser backend; every request drops to a real role in its txn
      all.add(conn)
      return conn
    }
    return new Promise((resolve) => waiters.push(resolve))
  }
  function release(c) {
    const w = waiters.shift()
    if (w) w(c)
    else idle.push(c)
  }
  async function destroy(c) {
    all.delete(c)
    await c.close().catch(() => {})
    const w = waiters.shift()
    if (w) acquire().then(w)
  }

  /** One transaction as the given identity. fn(client) gets {query(text, params)}. */
  async function withIdentity(identity, fn) {
    if (!identity || !ALLOWED_ROLES.has(identity.role)) throw new Error('refusing to run as a non-API role')
    const c = await acquire()
    try {
      await c.query('BEGIN')
      await c.query(`SET LOCAL ROLE ${identity.role}`) // role comes from the fixed allow-list above
      const claims = identity.claims ?? { role: identity.role }
      const probe = await c.query(
        `SELECT current_user AS u,
                set_config('request.jwt.claims', $1, true),
                set_config('request.jwt.claim.sub', $2, true),
                set_config('request.jwt.claim.role', $3, true),
                set_config('statement_timeout', '15000', true)`,
        [JSON.stringify(claims), claims.sub ?? '', identity.role]
      )
      if (probe.rows[0].u !== identity.role) throw new Error(`role switch failed: running as ${probe.rows[0].u}`)
      const result = await fn(c)
      await c.query('COMMIT')
      release(c)
      return result
    } catch (err) {
      try {
        await c.query('ROLLBACK')
        release(c)
      } catch {
        await destroy(c)
      }
      throw err
    }
  }

  // request log -------------------------------------------------------------------------------------
  const requestLog = []

  // HTTP helpers ------------------------------------------------------------------------------------
  function corsHeaders(req) {
    const origin = req.headers.origin
    const h = {
      'Access-Control-Allow-Origin': origin ?? '*',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Profile, X-Supabase-Api-Version',
    }
    if (origin) h.Vary = 'Origin'
    return h
  }

  function sendJson(req, res, status, body, extra = {}) {
    const payload = body === undefined ? '' : JSON.stringify(body)
    res.writeHead(status, {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
      ...extra,
    })
    res.end(payload)
  }
  function sendEmpty(req, res, status) {
    res.writeHead(status, { ...corsHeaders(req), 'Content-Length': 0 })
    res.end()
  }
  const restError = (code, message, details = null, hint = null) => ({ code, message, details, hint })
  const authError = (status, errorCode, msg) => ({ code: status, error_code: errorCode, msg })

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (c) => {
        size += c.length
        if (size > MAX_BODY) {
          reject(Object.assign(new Error('request body too large'), { status: 413 }))
          req.destroy()
          return
        }
        chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }
  async function readJson(req) {
    const text = await readBody(req)
    if (text.trim() === '') return {}
    try {
      return JSON.parse(text)
    } catch {
      throw Object.assign(new Error('invalid JSON body'), { status: 400, jsonError: true })
    }
  }

  // identity ------------------------------------------------------------------------------------------
  const bearerOf = (req) => {
    const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? '').trim())
    return m ? m[1].trim() : null
  }
  const isAnonCredential = (tok) => {
    if (typeof tok !== 'string' || !tok) return false
    if (safeEqual(tok, anon)) return true
    const v = verifyJwt(tok, jwtSecret, nowSec())
    return Boolean(v.claims && v.claims.role === 'anon')
  }

  /** Returns { identity } or { fail: {status, body} } in PostgREST error style. */
  function resolveRestIdentity(req) {
    const bearer = bearerOf(req)
    const apikey = req.headers.apikey ? String(req.headers.apikey) : null
    for (const tok of [bearer, apikey]) {
      const peek = tok ? peekClaims(tok) : null
      if (peek && (peek.role === 'service_role' || peek.role === 'postgres' || peek.role === 'supabase_admin')) {
        return { fail: { status: 401, body: restError('PGRST301', 'The harness never accepts service_role keys', null, null) } }
      }
    }
    if (bearer && !isAnonCredential(bearer)) {
      const v = verifyJwt(bearer, jwtSecret, nowSec())
      if (v.error === 'expired') return { fail: { status: 401, body: restError('PGRST301', 'JWT expired') } }
      if (v.error) return { fail: { status: 401, body: restError('PGRST301', 'JWT invalid') } }
      if (v.claims.role !== 'authenticated' || !v.claims.sub) {
        return { fail: { status: 401, body: restError('PGRST301', 'JWT role not permitted') } }
      }
      return { identity: { role: 'authenticated', claims: v.claims } }
    }
    if (isAnonCredential(bearer) || isAnonCredential(apikey)) {
      return { identity: { role: 'anon', claims: { role: 'anon' } } }
    }
    return { fail: { status: 401, body: restError('PGRST302', 'No valid credentials: send the anon key or a user access token') } }
  }

  // /auth/v1 -----------------------------------------------------------------------------------------
  async function handleAuth(req, res, url) {
    const sub = url.pathname.slice('/auth/v1'.length) || '/'

    if (sub === '/settings' && req.method === 'GET') {
      return sendJson(req, res, 200, {
        external: { email: true, phone: false, google: false, github: false },
        disable_signup: true,
        mailer_autoconfirm: true,
        phone_autoconfirm: false,
        sms_provider: '',
        saml_enabled: false,
      })
    }

    if (sub === '/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type')
      const body = await readJson(req)
      if (grant === 'password') {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        const user = usersByEmail.get(email)
        const ok = user && typeof body.password === 'string' && safeEqual(body.password, user.password)
        if (!ok) return sendJson(req, res, 400, authError(400, 'invalid_credentials', 'Invalid login credentials'))
        return sendJson(req, res, 200, newSession(user))
      }
      if (grant === 'refresh_token') {
        const entry = typeof body.refresh_token === 'string' ? refreshTokens.get(body.refresh_token) : null
        if (!entry || entry.used || !sessions.has(entry.sessionId)) {
          return sendJson(req, res, 400, authError(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found'))
        }
        entry.used = true
        return sendJson(req, res, 200, issue(usersById.get(entry.userId), entry.sessionId))
      }
      return sendJson(req, res, 400, authError(400, 'unsupported_grant_type', `Unsupported grant_type ${JSON.stringify(grant)}`))
    }

    if (sub === '/user' && req.method === 'GET') {
      const bearer = bearerOf(req)
      if (!bearer) return sendJson(req, res, 401, authError(401, 'no_authorization', 'This endpoint requires a Bearer token'))
      const peek = peekClaims(bearer)
      if (peek && peek.role === 'service_role') return sendJson(req, res, 401, authError(401, 'bad_jwt', 'service_role keys are not accepted by the harness'))
      const v = verifyJwt(bearer, jwtSecret, nowSec())
      if (v.error === 'expired') return sendJson(req, res, 403, authError(403, 'bad_jwt', 'invalid JWT: token has invalid claims: token is expired'))
      if (v.error || v.claims.role !== 'authenticated') return sendJson(req, res, 401, authError(401, 'bad_jwt', 'invalid JWT: unable to parse or verify signature'))
      const user = usersById.get(v.claims.sub)
      if (!user) return sendJson(req, res, 404, authError(404, 'user_not_found', 'User from sub claim in JWT does not exist'))
      if (!v.claims.session_id || !sessions.has(v.claims.session_id)) {
        return sendJson(req, res, 403, authError(403, 'session_not_found', 'Session from session_id claim in JWT does not exist'))
      }
      return sendJson(req, res, 200, publicUser(user))
    }

    if (sub === '/logout' && req.method === 'POST') {
      const bearer = bearerOf(req)
      const v = bearer ? verifyJwt(bearer, jwtSecret, nowSec()) : { error: 'invalid' }
      if (v.claims && v.claims.session_id) {
        const scope = url.searchParams.get('scope') || 'global'
        const own = v.claims.session_id
        for (const [sid, s] of [...sessions]) {
          if (scope === 'global' ? s.userId === v.claims.sub : scope === 'local' ? sid === own : sid !== own && s.userId === v.claims.sub) {
            sessions.delete(sid)
          }
        }
        for (const [tok, e] of [...refreshTokens]) if (!sessions.has(e.sessionId)) refreshTokens.delete(tok)
      } else if (v.error === 'invalid') {
        return sendJson(req, res, 401, authError(401, 'bad_jwt', 'invalid JWT: unable to parse or verify signature'))
      }
      return sendEmpty(req, res, 204)
    }

    return sendJson(req, res, 501, { code: 501, error_code: 'not_implemented', msg: `${req.method} ${sub} is not implemented by the local harness` })
  }

  // /rest/v1/rpc/<fn> --------------------------------------------------------------------------------
  const FN_SQL = `
    SELECT p.proargnames, p.proargmodes, p.pronargdefaults, p.proretset, p.prorettype::regtype::text AS rettype,
           t.typtype AS rettyp,
           (SELECT coalesce(array_agg(format_type(x.t, NULL) ORDER BY x.o), ARRAY[]::text[])
              FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS x(t, o)) AS argtypes
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_type t ON t.oid = p.prorettype
     WHERE n.nspname = 'public' AND p.proname = $1 AND p.prokind = 'f'`

  /** Names of IN/INOUT/VARIADIC arguments, positionally aligned with argtypes. */
  function inputNames(row) {
    const names = row.proargnames ?? []
    const modes = row.proargmodes
    const out = []
    for (let i = 0; i < Math.max(names.length, row.argtypes.length); i++) {
      const mode = modes ? modes[i] : 'i'
      if (mode === 'i' || mode === 'b' || mode === 'v') out.push(names[i] ?? '')
    }
    return out.slice(0, row.argtypes.length)
  }

  async function handleRpc(req, res, url, fn, identity) {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return sendJson(req, res, 405, restError('PGRST117', `Unsupported HTTP method: ${req.method}`))
    }
    if (!IDENT.test(fn)) {
      return sendJson(req, res, 400, restError('PGRST100', 'Invalid function name', 'function names must match [a-z_][a-z0-9_]*', null))
    }
    const profile = req.headers[req.method === 'GET' ? 'accept-profile' : 'content-profile']
    if (profile && profile !== 'public') {
      return sendJson(req, res, 406, restError('PGRST106', 'The schema must be one of the following: public'))
    }

    let args
    if (req.method === 'GET') args = Object.fromEntries(url.searchParams)
    else {
      args = await readJson(req)
      if (args === null || typeof args !== 'object' || Array.isArray(args)) {
        return sendJson(req, res, 400, restError('PGRST102', 'Only a JSON object of named arguments is accepted'))
      }
    }
    const keys = Object.keys(args)
    for (const k of keys) {
      if (!IDENT.test(k)) return sendJson(req, res, 400, restError('PGRST100', 'Invalid argument name', 'argument names must match [a-z_][a-z0-9_]*', null))
    }

    try {
      const out = await withIdentity(identity, async (c) => {
        const rows = (await c.query(FN_SQL, [fn])).rows
        const candidates = rows.filter((row) => {
          const names = inputNames(row)
          if (keys.some((k) => !names.includes(k))) return false
          const required = names.length - (row.pronargdefaults ?? 0)
          for (let i = 0; i < required; i++) if (!names[i] || !keys.includes(names[i])) return false
          return true
        })
        if (candidates.length === 0) {
          return {
            status: 404,
            body: restError(
              'PGRST202',
              `Could not find the function public.${fn}(${[...keys].sort().join(', ')}) in the schema cache`,
              null,
              'Perhaps you meant to call a different function; arguments are matched by name.'
            ),
          }
        }
        if (candidates.length > 1) {
          return { status: 300, body: restError('PGRST203', `Could not choose the best candidate function public.${fn}`, null, 'Try renaming the parameters or the function itself') }
        }
        const row = candidates[0]
        const names = inputNames(row)
        const params = []
        const parts = []
        for (const k of keys) {
          const type = row.argtypes[names.indexOf(k)]
          const v = args[k]
          if (v === null || v === undefined) {
            params.push(null)
            parts.push(`${k} => $${params.length}::${type}`)
          } else if (type.endsWith('[]') && Array.isArray(v)) {
            params.push(JSON.stringify(v))
            parts.push(`${k} => ARRAY(SELECT jsonb_array_elements_text($${params.length}::jsonb))::${type}`)
          } else if (type === 'json' || type === 'jsonb') {
            params.push(JSON.stringify(v))
            parts.push(`${k} => $${params.length}::${type}`)
          } else {
            params.push(typeof v === 'object' ? JSON.stringify(v) : String(v))
            parts.push(`${k} => $${params.length}::${type}`)
          }
        }
        const call = `public.${fn}(${parts.join(', ')})` // fn and k validated against IDENT and the catalog
        if (row.rettype === 'void') {
          await c.query(`SELECT ${call}`, params)
          return { status: 204 }
        }
        if (row.proretset) {
          const r = await c.query(`SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) AS j FROM ${call} AS x`, params)
          return { status: 200, body: r.rows[0].j }
        }
        const r = await c.query(`SELECT to_jsonb(x) AS j FROM ${call} AS x`, params)
        return { status: 200, body: r.rows[0] ? r.rows[0].j : null }
      })
      if (out.status === 204) return sendEmpty(req, res, 204)
      return sendJson(req, res, out.status, out.body)
    } catch (err) {
      if (err && err.pgFatal) throw err
      const mapped = mapPgError(err, { anon: identity.role === 'anon' })
      return sendJson(req, res, mapped.status, mapped.body)
    }
  }

  // router ------------------------------------------------------------------------------------------------
  async function route(req, res, url) {
    const p = url.pathname

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...corsHeaders(req),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || DEFAULT_ALLOW_HEADERS,
        'Access-Control-Max-Age': '600',
        'Content-Length': 0,
      })
      return res.end()
    }

    if (p === '/auth/v1' || p.startsWith('/auth/v1/')) return handleAuth(req, res, url)

    if (p === '/functions/v1' || p.startsWith('/functions/v1/')) {
      return sendJson(req, res, 501, restError('HARNESS501', 'Edge functions are not available in the local harness (no Deno); this page stays a hosted gate'))
    }
    if (p === '/realtime/v1' || p.startsWith('/realtime/v1/')) {
      return sendJson(req, res, 501, restError('HARNESS501', 'Realtime is not available in the local harness'))
    }

    if (p.startsWith('/rest/v1/')) {
      const rest = decodeURIComponent(p.slice('/rest/v1/'.length))
      const auth = resolveRestIdentity(req)
      if (auth.fail) return sendJson(req, res, auth.fail.status, auth.fail.body)
      const { identity } = auth

      if (rest.startsWith('rpc/')) return handleRpc(req, res, url, rest.slice(4), identity)

      const table = rest.replace(/\/+$/, '')
      if (table && IDENT.test(table)) {
        const ctx = {
          req,
          res,
          method: req.method,
          table,
          url,
          headers: req.headers,
          readBody: () => readBody(req),
          readJson: () => readJson(req),
          identity,
          withIdentity: (fn) => withIdentity(identity, fn),
          sendJson: (status, body, headers) => sendJson(req, res, status, body, headers),
          sendEmpty: (status) => sendEmpty(req, res, status),
          sendError: (status, body) => sendJson(req, res, status, body),
          mapPgError: (err) => mapPgError(err, { anon: identity.role === 'anon' }),
        }
        for (const handler of [...globalRestHandlers, ...restHandlers]) {
          if ((await handler(ctx)) === true) return undefined
          if (res.writableEnded) return undefined
        }
        return sendJson(req, res, 501, restError('HARNESS501', `Table access (/rest/v1/${table}) is handled by rest.mjs, which is not registered`))
      }
      return sendJson(req, res, 404, restError('PGRST125', `Invalid path specified in request URL`))
    }

    return sendJson(req, res, 404, restError('HARNESS404', `No route for ${req.method} ${p}`))
  }

  const restHandlers = []

  const server = createServer((req, res) => {
    const started = process.hrtime.bigint()
    let url
    try {
      url = new URL(req.url, 'http://127.0.0.1')
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    res.on('finish', () => {
      requestLog.push({
        method: req.method,
        path: url.pathname, // never the query string or any header
        status: res.statusCode,
        ms: Number(process.hrtime.bigint() - started) / 1e6,
      })
    })
    route(req, res, url).catch((err) => {
      if (res.headersSent) {
        res.end()
        return
      }
      const status = err && err.status ? err.status : 500
      if (err && err.jsonError) {
        sendJson(req, res, 400, url.pathname.startsWith('/auth/') ? authError(400, 'validation_failed', 'Request body is not valid JSON') : restError('PGRST102', 'Empty or invalid json'))
      } else {
        sendJson(req, res, status, restError('HARNESS500', String((err && err.message) || err)))
      }
    })
  })

  // Realtime / any websocket upgrade: 501 and close.
  server.on('upgrade', (req, socket) => {
    socket.end('HTTP/1.1 501 Not Implemented\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()

  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    anonKey: anon,
    setClock(value) {
      clock = value === undefined ? null : value
    },
    getRequestLog: () => requestLog.slice(),
    clearRequestLog: () => {
      requestLog.length = 0
    },
    addUser,
    mintAccessToken,
    registerRestHandler(fn) {
      if (typeof fn !== 'function') throw new TypeError('registerRestHandler expects a function')
      restHandlers.push(fn)
      return () => {
        const i = restHandlers.indexOf(fn)
        if (i >= 0) restHandlers.splice(i, 1)
      }
    },
    async close() {
      closing = true
      server.closeAllConnections?.()
      await new Promise((resolve) => server.close(() => resolve()))
      for (const w of waiters.splice(0)) w(null)
      await Promise.all([...all].map((c) => c.close().catch(() => {})))
      all.clear()
      idle.length = 0
    },
  }
}
