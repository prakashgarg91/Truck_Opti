// node:test battery for scripts/harness/server.mjs on the embedded PostgreSQL 18.
// Run: RACE_MODULES=D:/tmp/pgrace node scripts/harness/server.test.mjs
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, test } from 'node:test'
import { startServer } from '../race/_realPg.mjs'
import { startHarnessServer } from './server.mjs'

let pgs
let h
let ownerId
let agencyId
const OWNER = { email: 'owner@harness.test', password: 'correct-horse-9' }
const ANON = 'dummy-anon-key'

const post = (path, body, headers = {}) =>
  fetch(h.url + path, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON, ...headers }, body: JSON.stringify(body ?? {}) })
const login = async () => (await post('/auth/v1/token?grant_type=password', OWNER)).json()
const rpc = (fn, args, token) => post(`/rest/v1/rpc/${fn}`, args, token ? { authorization: `Bearer ${token}` } : {})

before(async () => {
  pgs = await startServer('harness-server')
  ownerId = randomUUID()
  agencyId = randomUUID()
  await pgs.admin.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{}'::jsonb)`, [ownerId, OWNER.email])
  await pgs.admin.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [ownerId, OWNER.email])
  await pgs.admin.query(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, state, status, gstin, pan_number)
     VALUES ($1, $2, 'Harness Transport Pvt Ltd', 'Delhi', 'Delhi', 'approved', '07ABCDE1001A1Z5', 'ABCDE4001Q')`,
    [agencyId, ownerId]
  )
  await pgs.admin.query(`
    CREATE OR REPLACE FUNCTION public.zz_harness_probe(p_echo jsonb DEFAULT NULL, p_n integer DEFAULT 1)
    RETURNS jsonb LANGUAGE sql SECURITY INVOKER AS $$
      SELECT jsonb_build_object('user', current_user, 'session_user_is_super', (SELECT rolsuper FROM pg_roles WHERE rolname = session_user),
                                'uid', auth.uid(), 'echo', p_echo, 'n', p_n) $$;
    CREATE OR REPLACE FUNCTION public.zz_harness_rows(p_k integer) RETURNS SETOF integer LANGUAGE sql AS $$ SELECT generate_series(1, p_k) $$;
    CREATE OR REPLACE FUNCTION public.zz_harness_dup() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO public.users (id, email) VALUES ((SELECT id FROM public.users LIMIT 1), 'dup@x.test'); END $$;
    CREATE OR REPLACE FUNCTION public.zz_harness_raise() RETURNS void LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'boom' USING DETAIL = 'the detail', HINT = 'the hint'; END $$;
    GRANT EXECUTE ON FUNCTION public.zz_harness_probe(jsonb, integer), public.zz_harness_rows(integer),
      public.zz_harness_dup(), public.zz_harness_raise() TO anon, authenticated;`)
  h = await startHarnessServer({ pg: pgs, anonKey: ANON, users: [{ ...OWNER, id: ownerId }] })
})

after(async () => {
  await h?.close()
  await pgs?.stop()
})

describe('auth', () => {
  test('password login returns the supabase-js session shape', async () => {
    const r = await post('/auth/v1/token?grant_type=password', OWNER)
    assert.equal(r.status, 200)
    const s = await r.json()
    assert.equal(s.token_type, 'bearer')
    assert.equal(typeof s.expires_in, 'number')
    assert.equal(typeof s.expires_at, 'number')
    assert.ok(s.refresh_token)
    assert.equal(s.user.id, ownerId)
    assert.equal(s.user.email, OWNER.email)
    const claims = JSON.parse(Buffer.from(s.access_token.split('.')[1], 'base64url'))
    assert.equal(claims.sub, ownerId)
    assert.equal(claims.role, 'authenticated')
    assert.equal(claims.aud, 'authenticated')
    assert.equal(claims.email, OWNER.email)
    assert.ok(claims.exp > claims.iat)
  })

  test('wrong password and unknown user fail with invalid_credentials', async () => {
    for (const body of [{ ...OWNER, password: 'nope' }, { email: 'ghost@harness.test', password: 'x' }]) {
      const r = await post('/auth/v1/token?grant_type=password', body)
      assert.equal(r.status, 400)
      assert.equal((await r.json()).error_code, 'invalid_credentials')
    }
  })

  test('refresh rotates the token, a reused refresh token is refused', async () => {
    const s = await login()
    const r = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token })
    assert.equal(r.status, 200)
    const s2 = await r.json()
    assert.notEqual(s2.refresh_token, s.refresh_token)
    assert.equal(s2.user.id, ownerId)
    const again = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token })
    assert.equal(again.status, 400)
    const bad = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: 'nonsense' })
    assert.equal(bad.status, 400)
  })

  test('/user: good, garbage and expired tokens; logout ends the session', async () => {
    const s = await login()
    const get = (t) => fetch(h.url + '/auth/v1/user', { headers: { apikey: ANON, authorization: `Bearer ${t}` } })
    const ok = await get(s.access_token)
    assert.equal(ok.status, 200)
    assert.equal((await ok.json()).id, ownerId)
    assert.equal((await get('garbage')).status, 401)
    const tampered = s.access_token.slice(0, -2) + (s.access_token.endsWith('AA') ? 'BB' : 'AA')
    assert.equal((await get(tampered)).status, 401)
    assert.equal((await fetch(h.url + '/auth/v1/user')).status, 401)

    const out = await post('/auth/v1/logout', {}, { authorization: `Bearer ${s.access_token}` })
    assert.equal(out.status, 204)
    assert.equal((await get(s.access_token)).status, 403)

    const fresh = await login()
    h.setClock(Date.now() + 2 * 3600 * 1000)
    try {
      const expired = await get(fresh.access_token)
      assert.equal(expired.status, 403)
      assert.match((await expired.json()).msg, /expired/)
    } finally {
      h.setClock(null)
    }
  })

  test('/settings answers', async () => {
    const r = await fetch(h.url + '/auth/v1/settings', { headers: { apikey: ANON } })
    assert.equal(r.status, 200)
    assert.equal((await r.json()).external.email, true)
  })
})

describe('rpc', () => {
  test('happy path: agency_subscription_entitlement for the seeded owner', async () => {
    const s = await login()
    const r = await rpc('agency_subscription_entitlement', {}, s.access_token)
    assert.equal(r.status, 200, await r.clone().text())
    const body = await r.json()
    assert.equal(typeof body, 'object')
    assert.ok(body !== null && !Array.isArray(body))
  })

  test('probe runs as authenticated with a real auth.uid(), never superuser; args round-trip', async () => {
    const s = await login()
    const r = await rpc('zz_harness_probe', { p_echo: { a: [1, 2], b: 'x' }, p_n: 7 }, s.access_token)
    assert.equal(r.status, 200, await r.clone().text())
    const j = await r.json()
    assert.equal(j.user, 'authenticated')
    assert.equal(j.uid, ownerId)
    assert.deepEqual(j.echo, { a: [1, 2], b: 'x' })
    assert.equal(j.n, 7)
    const anonR = await rpc('zz_harness_probe', {})
    assert.equal(anonR.status, 200)
    const aj = await anonR.json()
    assert.equal(aj.user, 'anon')
    assert.equal(aj.uid, null)
    // the pooled backend is a superuser session; after the request nothing may leak into the next one
    const again = await rpc('zz_harness_probe', {}, s.access_token)
    assert.equal((await again.json()).user, 'authenticated')
  })

  test('set-returning function returns an array', async () => {
    const r = await rpc('zz_harness_rows', { p_k: 3 }, (await login()).access_token)
    assert.deepEqual(await r.json(), [1, 2, 3])
  })

  test('void function answers 204', async () => {
    // zz_harness_raise is void but raises: use set-returning check above; void path via pg_sleep wrapper
    await pgs.admin.query(`CREATE OR REPLACE FUNCTION public.zz_harness_void() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
                           GRANT EXECUTE ON FUNCTION public.zz_harness_void() TO authenticated`)
    const r = await rpc('zz_harness_void', {}, (await login()).access_token)
    assert.equal(r.status, 204)
  })

  test('401 without any credential, with garbage, expired token; service_role refused', async () => {
    const noKey = await fetch(h.url + '/rest/v1/rpc/zz_harness_probe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    assert.equal(noKey.status, 401)
    assert.equal((await noKey.json()).code, 'PGRST302')
    const bad = await rpc('zz_harness_probe', {}, 'garbage.token.here')
    assert.equal(bad.status, 401)
    assert.equal((await bad.json()).code, 'PGRST301')
    const token = (await login()).access_token
    h.setClock(Date.now() + 2 * 3600 * 1000)
    try {
      const exp = await rpc('zz_harness_probe', {}, token)
      assert.equal(exp.status, 401)
      assert.equal((await exp.json()).message, 'JWT expired')
    } finally {
      h.setClock(null)
    }
    const fake = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"role":"service_role"}').toString('base64url')}.sig`
    const sr = await rpc('zz_harness_probe', {}, fake)
    assert.equal(sr.status, 401)
    const asApikey = await post('/rest/v1/rpc/zz_harness_probe', {}, { apikey: fake })
    assert.equal(asApikey.status, 401)
  })

  test('error mapping: 404 PGRST202, 409 unique, 400 with DETAIL and HINT, 403 permission', async () => {
    const t = (await login()).access_token
    const unknown = await rpc('zz_no_such_fn', {}, t)
    assert.equal(unknown.status, 404)
    assert.equal((await unknown.json()).code, 'PGRST202')
    const wrongArg = await rpc('zz_harness_probe', { p_nope: 1 }, t)
    assert.equal(wrongArg.status, 404)

    const dup = await rpc('zz_harness_dup', {}, t)
    assert.equal(dup.status, 409, await dup.clone().text())
    assert.equal((await dup.json()).code, '23505')

    const raised = await rpc('zz_harness_raise', {}, t)
    assert.equal(raised.status, 400)
    assert.deepEqual(await raised.json(), { code: 'P0001', message: 'boom', details: 'the detail', hint: 'the hint' })

    const typeErr = await rpc('zz_harness_probe', { p_n: 'abc' }, t)
    assert.equal(typeErr.status, 400)
    assert.match((await typeErr.json()).code, /^22/)

    await pgs.admin.query(`CREATE OR REPLACE FUNCTION public.zz_harness_noexec() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;
                           REVOKE EXECUTE ON FUNCTION public.zz_harness_noexec() FROM PUBLIC, anon, authenticated`)
    const denied = await rpc('zz_harness_noexec', {}, t)
    assert.equal(denied.status, 403)
    assert.equal((await denied.json()).code, '42501')
    assert.equal((await rpc('zz_harness_noexec', {})).status, 401)
  })

  test('SB002 refusal reaches the client with message prefix and DETAIL JSON intact', async () => {
    await pgs.admin.query(`UPDATE public.platform_billing_settings SET enforcement_enabled = true`)
    try {
      const r = await rpc('agency_vehicle_create', { p_rc_number: `RC-H-${Date.now()}`, p_vehicle_type: 'eicher_14ft' }, (await login()).access_token)
      assert.equal(r.status, 400, await r.clone().text())
      const e = await r.json()
      assert.equal(e.code, 'SB002')
      assert.match(e.message, /^SB002\b/)
      const detail = JSON.parse(e.details)
      assert.equal(detail.code, 'SB002')
      assert.equal(detail.status, 'none')
      assert.ok('resource' in detail)
    } finally {
      await pgs.admin.query(`UPDATE public.platform_billing_settings SET enforcement_enabled = false`)
    }
    const n = (await pgs.admin.query(`SELECT count(*)::int AS n FROM public.agency_trucks WHERE agency_id = $1`, [agencyId])).rows[0].n
    assert.equal(n, 0)
  })

  test('injection attempts on function and argument names are rejected, nothing executes', async () => {
    const t = (await login()).access_token
    const names = ['zz_harness_probe;select 1', 'ZZ_HARNESS_PROBE', 'x"y', 'pg_sleep(10)', '1abc', 'public.zz_harness_probe', 'a-b']
    for (const n of names) {
      const r = await post(`/rest/v1/rpc/${encodeURIComponent(n)}`, {}, { authorization: `Bearer ${t}` })
      assert.ok([400, 404].includes(r.status), `${n} -> ${r.status}`)
    }
    for (const k of ['p_n; drop table users', 'P_N', 'p_n"', "p_n' or '1'='1"]) {
      const r = await rpc('zz_harness_probe', { [k]: 1 }, t)
      assert.equal(r.status, 400, `${k} -> ${r.status}`)
    }
    // value injection stays a bound parameter
    const r = await rpc('zz_harness_probe', { p_echo: "x'); drop table public.users; --" }, t)
    assert.equal(r.status, 200)
    assert.equal((await r.json()).echo, "x'); drop table public.users; --")
    assert.equal((await pgs.admin.query(`SELECT count(*)::int AS n FROM public.users`)).rows[0].n, 1)
  })
})

describe('transport rules', () => {
  test('CORS preflight echoes origin and allows the supabase-js headers', async () => {
    const r = await fetch(h.url + '/rest/v1/rpc/zz_harness_probe', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'apikey, authorization, content-type, x-client-info, prefer, range, accept-profile, content-profile',
      },
    })
    assert.equal(r.status, 204)
    assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:5173')
    const hdrs = r.headers.get('access-control-allow-headers')
    for (const x of ['apikey', 'authorization', 'content-type', 'x-client-info', 'prefer', 'range', 'accept-profile', 'content-profile']) assert.ok(hdrs.includes(x), x)
    assert.match(r.headers.get('access-control-allow-methods'), /POST/)
    const plain = await fetch(h.url + '/auth/v1/settings', { headers: { origin: 'https://harness.truckopti.test', apikey: ANON } })
    assert.equal(plain.headers.get('access-control-allow-origin'), 'https://harness.truckopti.test')
  })

  test('501 for tables, functions and websocket upgrade; 404 elsewhere', async () => {
    const t = (await login()).access_token
    const tbl = await fetch(h.url + '/rest/v1/agency_trucks?select=*', { headers: { apikey: ANON, authorization: `Bearer ${t}` } })
    assert.equal(tbl.status, 501)
    assert.match((await tbl.json()).message, /rest\.mjs/)
    const fn = await post('/functions/v1/anything', {})
    assert.equal(fn.status, 501)
    assert.equal((await fetch(h.url + '/nowhere')).status, 404)

    const { connect } = await import('node:net')
    const reply = await new Promise((resolve, reject) => {
      const sock = connect(h.port, '127.0.0.1', () =>
        sock.write('GET /realtime/v1/websocket HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n'))
      let data = ''
      sock.on('data', (d) => (data += d))
      sock.on('close', () => resolve(data))
      sock.on('error', reject)
    })
    assert.match(reply, /^HTTP\/1\.1 501/)
  })

  test('registerRestHandler lets a plug-in answer a table', async () => {
    const off = h.registerRestHandler(async (ctx) => {
      if (ctx.table !== 'zz_plugin') return false
      const row = await ctx.withIdentity(async (c) => (await c.query(`SELECT current_user AS u`)).rows[0])
      ctx.sendJson(200, [row])
      return true
    })
    const r = await fetch(h.url + '/rest/v1/zz_plugin', { headers: { apikey: ANON, authorization: `Bearer ${(await login()).access_token}` } })
    assert.deepEqual(await r.json(), [{ u: 'authenticated' }])
    off()
  })

  test('binds 127.0.0.1 only', () => {
    assert.match(h.url, /^http:\/\/127\.0\.0\.1:\d+$/)
  })

  test('request log records method/path/status/ms and never the credentials or query', async () => {
    h.clearRequestLog()
    const t = (await login()).access_token
    await rpc('zz_harness_probe', {}, t)
    await fetch(h.url + '/auth/v1/settings?secret=abc', { headers: { apikey: ANON } })
    const log = h.getRequestLog()
    assert.ok(log.length >= 3)
    for (const e of log) {
      assert.deepEqual(Object.keys(e).sort(), ['method', 'ms', 'path', 'status'])
    }
    const text = JSON.stringify(log)
    assert.ok(!text.includes(t) && !text.includes('secret=abc') && !text.includes(OWNER.password))
    assert.ok(log.some((e) => e.path === '/rest/v1/rpc/zz_harness_probe' && e.status === 200))
  })
})
