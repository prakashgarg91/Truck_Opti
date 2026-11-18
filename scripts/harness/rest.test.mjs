// node:test battery for scripts/harness/rest.mjs (PostgREST-style table endpoints) on the embedded PostgreSQL 18.
// Run: RACE_MODULES=D:/tmp/pgrace node scripts/harness/rest.test.mjs
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startServer } from '../race/_realPg.mjs'
import { registerRest } from './rest.mjs'
import { startHarnessServer } from './server.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const frontendRequire = createRequire(resolve(here, '..', '..', 'frontend', 'package.json'))

const ANON = 'dummy-anon-key'
const A = { email: 'owner-a@harness.test', password: 'correct-horse-9' }
const B = { email: 'owner-b@harness.test', password: 'battery-staple-7' }

let pgs
let h
let idA
let idB
let agencyA
let agencyB
let tokA
let tokB
const orderIdsA = []

const call = (method, path, { token, headers = {}, body } = {}) =>
  fetch(h.url + '/rest/v1' + path, {
    method,
    headers: {
      apikey: ANON,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const get = (path, token = tokA, headers = {}) => call('GET', path, { token, headers })
const json = async (r) => JSON.parse(await r.text())

before(async () => {
  pgs = await startServer('harness-rest')
  idA = randomUUID()
  idB = randomUUID()
  agencyA = randomUUID()
  agencyB = randomUUID()
  for (const [id, who] of [[idA, A], [idB, B]]) {
    await pgs.admin.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{}'::jsonb)`, [id, who.email])
    await pgs.admin.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, who.email])
  }
  let n = 0
  for (const [aid, uid, name] of [[agencyA, idA, 'Alpha Transport'], [agencyB, idB, 'Bravo Transport']]) {
    n++
    await pgs.admin.query(
      `INSERT INTO public.transport_agencies (id, user_id, company_name, city, state, status, gstin, pan_number)
       VALUES ($1, $2, $3, 'Delhi', 'Delhi', 'approved', $4, $5)`,
      [aid, uid, name, `07ABCDE100${n}A1Z5`, `ABCDE400${n}Q`]
    )
  }
  // agreements + orders (A: 6 orders, B: 2) and one ERP connection for A
  const agr = {}
  for (const [aid, key] of [[agencyA, 'a'], [agencyB, 'b']]) {
    const r = await pgs.admin.query(
      `INSERT INTO public.agency_client_agreements (agency_id, client_name, idempotency_key) VALUES ($1, $2, $3) RETURNING id`,
      [aid, `Client ${key}`, `idem-${key}`]
    )
    agr[key] = r.rows[0].id
  }
  for (let i = 1; i <= 6; i++) {
    const r = await pgs.admin.query(
      `INSERT INTO public.agency_orders (agency_id, agreement_id, client_order_ref, status) VALUES ($1, $2, $3, $4) RETURNING id`,
      [agencyA, agr.a, `A-${i}`, i === 6 ? 'cancelled' : 'draft']
    )
    orderIdsA.push(r.rows[0].id)
  }
  for (let i = 1; i <= 2; i++) {
    await pgs.admin.query(`INSERT INTO public.agency_orders (agency_id, agreement_id, client_order_ref) VALUES ($1, $2, $3)`, [agencyB, agr.b, `B-${i}`])
  }
  await pgs.admin.query(
    `INSERT INTO public.agency_erp_connections (agency_id, client_id, agreement_id, name, kind, secret_hash, secret_hint, idempotency_key)
     VALUES ($1, $2, $2, 'feed', 'webhook', $3, 'erpk_...abcd', 'idem-erp')`,
    [agencyA, agr.a, 'a'.repeat(64)]
  )
  // a synthetic table with RLS, a revoked column and a unique key for the write paths
  await pgs.admin.query(`
    CREATE TABLE public.zz_rest_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      owner uuid NOT NULL DEFAULT auth.uid(),
      name text NOT NULL,
      qty integer,
      note text,
      done boolean NOT NULL DEFAULT false,
      tags text[],
      meta jsonb,
      amount numeric(10,2),
      secret text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (owner, name)
    );
    ALTER TABLE public.zz_rest_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY zz_sel ON public.zz_rest_items FOR SELECT TO authenticated USING (owner = auth.uid());
    CREATE POLICY zz_ins ON public.zz_rest_items FOR INSERT TO authenticated WITH CHECK (owner = auth.uid());
    CREATE POLICY zz_upd ON public.zz_rest_items FOR UPDATE TO authenticated USING (owner = auth.uid()) WITH CHECK (owner = auth.uid());
    CREATE POLICY zz_anon ON public.zz_rest_items FOR SELECT TO anon USING (false);
    REVOKE ALL ON public.zz_rest_items FROM PUBLIC, anon, authenticated;
    GRANT SELECT (id, owner, name, qty, note, done, tags, meta, amount, created_at) ON public.zz_rest_items TO authenticated;
    GRANT SELECT ON public.zz_rest_items TO anon;
    GRANT INSERT (id, owner, name, qty, note, done, tags, meta, amount, created_at) ON public.zz_rest_items TO authenticated;
    GRANT UPDATE (name, qty, note, done, tags, meta, amount) ON public.zz_rest_items TO authenticated;`)
  const seed = [
    ['apple', 5, 'fruit', true],
    ['banana', 3, null, false],
    ['cherry', 9, 'fruit', false],
    ['date', null, 'dried', false],
  ]
  for (const [name, qty, note, done] of seed) {
    await pgs.admin.query(`INSERT INTO public.zz_rest_items (owner, name, qty, note, done, secret) VALUES ($1, $2, $3, $4, $5, 's3cret')`, [idA, name, qty, note, done])
  }
  await pgs.admin.query(`INSERT INTO public.zz_rest_items (owner, name, qty) VALUES ($1, 'bravo-only', 1)`, [idB])

  h = await startHarnessServer({ pg: pgs, anonKey: ANON, users: [{ ...A, id: idA }, { ...B, id: idB }] })
  registerRest(h)
  tokA = h.mintAccessToken(idA)
  tokB = h.mintAccessToken(idB)
})

after(async () => {
  await h?.close()
  await pgs?.stop()
})

describe('reads', () => {
  test('select list, filter, order, limit', async () => {
    const r = await get('/zz_rest_items?select=name,qty&qty=gte.3&order=qty.desc&limit=2')
    assert.equal(r.status, 200, await r.clone().text())
    assert.deepEqual(await json(r), [{ name: 'cherry', qty: 9 }, { name: 'apple', qty: 5 }])
  })

  test('select=* on a table with no revoked column returns full rows and honours limit', async () => {
    const r = await get('/agency_orders?select=*&limit=5')
    assert.equal(r.status, 200, await r.clone().text())
    const rows = await json(r)
    assert.equal(rows.length, 5)
    assert.ok(rows.every((x) => x.agency_id === agencyA))
    assert.ok('client_order_ref' in rows[0])
  })

  test('operators: eq neq gt lt in is like ilike not', async () => {
    const names = async (qs) => (await json(await get(`/zz_rest_items?select=name&order=name.asc&${qs}`))).map((x) => x.name)
    assert.deepEqual(await names('name=eq.apple'), ['apple'])
    assert.deepEqual(await names('name=neq.apple'), ['banana', 'cherry', 'date'])
    assert.deepEqual(await names('qty=gt.5'), ['cherry'])
    assert.deepEqual(await names('qty=lt.5'), ['banana'])
    assert.deepEqual(await names('qty=lte.5'), ['apple', 'banana'])
    assert.deepEqual(await names('name=in.(apple,"date",zzz)'), ['apple', 'date'])
    assert.deepEqual(await names('name=in.()'), [])
    assert.deepEqual(await names('qty=is.null'), ['date'])
    assert.deepEqual(await names('qty=not.is.null'), ['apple', 'banana', 'cherry'])
    assert.deepEqual(await names('done=is.true'), ['apple'])
    assert.deepEqual(await names('note=like.fr%25'), ['apple', 'cherry'])
    assert.deepEqual(await names('note=ilike.*FRUIT'), ['apple', 'cherry'])
    assert.deepEqual(await names('name=not.in.(apple,banana)'), ['cherry', 'date'])
    assert.deepEqual(await names('qty=gte.3&qty=lte.5'), ['apple', 'banana'])
    assert.deepEqual(await names('done=eq.false&note=not.eq.fruit'), ['date'])
  })

  test('order modifiers: nullsfirst / nullslast, multi-column', async () => {
    const asc = (await json(await get('/zz_rest_items?select=name&order=qty.asc.nullsfirst'))).map((x) => x.name)
    assert.deepEqual(asc, ['date', 'banana', 'apple', 'cherry'])
    const last = (await json(await get('/zz_rest_items?select=name&order=qty.desc.nullslast,name.asc'))).map((x) => x.name)
    assert.deepEqual(last, ['cherry', 'apple', 'banana', 'date'])
  })

  test('offset, Range header and Content-Range with count=exact', async () => {
    const r = await get('/zz_rest_items?select=name&order=name.asc&limit=2&offset=1', tokA, { prefer: 'count=exact' })
    assert.equal(r.status, 206)
    assert.equal(r.headers.get('content-range'), '1-2/4')
    assert.deepEqual((await json(r)).map((x) => x.name), ['banana', 'cherry'])

    const rg = await get('/zz_rest_items?select=name&order=name.asc', tokA, { range: '0-1', 'range-unit': 'items', prefer: 'count=exact' })
    assert.equal(rg.headers.get('content-range'), '0-1/4')
    assert.equal((await json(rg)).length, 2)

    const all = await get('/zz_rest_items?select=name', tokA, { prefer: 'count=exact' })
    assert.equal(all.status, 200)
    assert.equal(all.headers.get('content-range'), '0-3/4')

    const none = await get('/zz_rest_items?select=name&name=eq.nope', tokA, { prefer: 'count=exact' })
    assert.equal(none.headers.get('content-range'), '*/0')
    assert.deepEqual(await json(none), [])

    const far = await get('/zz_rest_items?select=name&offset=50', tokA, { prefer: 'count=exact' })
    assert.equal(far.status, 416)
    assert.equal((await json(far)).code, 'PGRST103')
  })

  test('HEAD returns the count and no body', async () => {
    const r = await call('HEAD', '/agency_orders?select=id&status=eq.draft', { token: tokA, headers: { prefer: 'count=exact' } })
    assert.equal(r.status, 200)
    assert.equal(r.headers.get('content-range'), '0-4/5')
    assert.equal(await r.text(), '')
    const empty = await call('HEAD', '/agency_orders?select=id&status=eq.planned', { token: tokA, headers: { prefer: 'count=exact' } })
    assert.equal(empty.headers.get('content-range'), '*/0')
  })

  test('typed values: numeric, jsonb, text[] and boolean round-trip through insert and select', async () => {
    const r = await call('POST', '/zz_rest_items?select=name,amount,tags,meta,done', {
      token: tokA,
      headers: { prefer: 'return=representation' },
      body: { name: 'typed', amount: '12.50', tags: ['x', 'y,z'], meta: { a: [1, 2], b: 'c' }, done: true },
    })
    assert.equal(r.status, 201, await r.clone().text())
    assert.deepEqual(await json(r), [{ name: 'typed', amount: 12.5, tags: ['x', 'y,z'], meta: { a: [1, 2], b: 'c' }, done: true }])
    const back = await json(await get('/zz_rest_items?select=amount,tags&name=eq.typed&amount=eq.12.50'))
    assert.deepEqual(back, [{ amount: 12.5, tags: ['x', 'y,z'] }])
    const del = await pgs.admin.query(`DELETE FROM public.zz_rest_items WHERE name = 'typed'`)
    assert.equal(del.rowCount, 1)
  })
})

describe('single / maybeSingle', () => {
  const single = { accept: 'application/vnd.pgrst.object+json' }

  test('exactly one row returns the object', async () => {
    const r = await get('/zz_rest_items?select=name,qty&name=eq.apple', tokA, single)
    assert.equal(r.status, 200)
    assert.deepEqual(await json(r), { name: 'apple', qty: 5 })
  })

  test('0 rows and >1 rows: 406 PGRST116 with the PostgREST error JSON', async () => {
    const none = await get('/zz_rest_items?select=name&name=eq.zzz', tokA, single)
    assert.equal(none.status, 406)
    assert.deepEqual(await json(none), {
      code: 'PGRST116',
      details: 'The result contains 0 rows',
      hint: null,
      message: 'JSON object requested, multiple (or no) rows returned',
    })
    const many = await get('/zz_rest_items?select=name', tokA, single)
    assert.equal(many.status, 406)
    const body = await json(many)
    assert.equal(body.code, 'PGRST116')
    assert.equal(body.details, 'The result contains 4 rows')
  })

  test('maybeSingle on GET reads a plain array (supabase-js maps 0 rows to null client side)', async () => {
    const r = await get('/zz_rest_items?select=name&name=eq.zzz', tokA, { accept: 'application/json' })
    assert.equal(r.status, 200)
    assert.deepEqual(await json(r), [])
  })
})

describe('writes', () => {
  test('insert with return=representation returns the row; defaults and auth.uid() apply', async () => {
    const r = await call('POST', '/zz_rest_items?select=id,owner,name,done', {
      token: tokA,
      headers: { prefer: 'return=representation' },
      body: { name: 'elder', qty: 2 },
    })
    assert.equal(r.status, 201, await r.clone().text())
    const rows = await json(r)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].owner, idA)
    assert.equal(rows[0].done, false)
  })

  test('insert + single object (supabase-js insert().select().single())', async () => {
    const r = await call('POST', '/zz_rest_items?select=name', {
      token: tokA,
      headers: { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' },
      body: { name: 'fig' },
    })
    assert.equal(r.status, 201, await r.clone().text())
    assert.deepEqual(await json(r), { name: 'fig' })
  })

  test('insert return=minimal: 201 empty body; bulk insert of an array', async () => {
    const r = await call('POST', '/zz_rest_items', { token: tokA, headers: { prefer: 'return=minimal' }, body: [{ name: 'grape' }, { name: 'honeydew', qty: 4 }] })
    assert.equal(r.status, 201)
    assert.equal(await r.text(), '')
    const n = await json(await get('/zz_rest_items?select=name&name=in.(grape,honeydew)'))
    assert.equal(n.length, 2)
  })

  test('duplicate key: 409 / 23505; RLS check refuses a row for another owner', async () => {
    const dup = await call('POST', '/zz_rest_items', { token: tokA, body: { name: 'apple' } })
    assert.equal(dup.status, 409)
    assert.equal((await json(dup)).code, '23505')
    const foreign = await call('POST', '/zz_rest_items', { token: tokA, body: { name: 'sneaky', owner: idB } })
    assert.equal(foreign.status, 403)
    assert.equal((await json(foreign)).code, '42501')
  })

  test('upsert: merge-duplicates with on_conflict updates, ignore-duplicates keeps the row', async () => {
    const merged = await call('POST', '/zz_rest_items?on_conflict=owner,name&select=name,qty', {
      token: tokA,
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: { owner: idA, name: 'banana', qty: 33 },
    })
    assert.equal(merged.status, 201, await merged.clone().text())
    assert.deepEqual(await json(merged), [{ name: 'banana', qty: 33 }])
    const kept = await call('POST', '/zz_rest_items?on_conflict=owner,name&select=name,qty', {
      token: tokA,
      headers: { prefer: 'resolution=ignore-duplicates,return=representation' },
      body: { owner: idA, name: 'banana', qty: 1 },
    })
    assert.deepEqual(await json(kept), [])
    const now = await json(await get('/zz_rest_items?select=qty&name=eq.banana'))
    assert.deepEqual(now, [{ qty: 33 }])
  })

  test('upsert on the primary key (users, as authStore does on every sign-in)', async () => {
    const r = await call('POST', '/users?on_conflict=id', {
      token: tokA,
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: { id: idA, email: A.email, name: 'Alpha Owner' },
    })
    assert.ok([200, 201, 204].includes(r.status), `${r.status} ${await r.text()}`)
    const row = await json(await get('/users?select=name&id=eq.' + idA, tokA, { accept: 'application/vnd.pgrst.object+json' }))
    assert.deepEqual(row, { name: 'Alpha Owner' })
  })

  test('PATCH with filter: minimal 204; representation returns rows; single object semantics roll back', async () => {
    const r = await call('PATCH', '/zz_rest_items?name=eq.cherry', { token: tokA, body: { qty: 10 } })
    assert.equal(r.status, 204)
    assert.deepEqual(await json(await get('/zz_rest_items?select=qty&name=eq.cherry')), [{ qty: 10 }])

    const rep = await call('PATCH', '/zz_rest_items?note=eq.fruit&select=name,note', { token: tokA, headers: { prefer: 'return=representation' }, body: { note: 'fresh' } })
    assert.equal(rep.status, 200)
    assert.equal((await json(rep)).length, 2)

    const bad = await call('PATCH', '/zz_rest_items?note=eq.fresh&select=name', {
      token: tokA,
      headers: { prefer: 'return=representation', accept: 'application/vnd.pgrst.object+json' },
      body: { note: 'rolled-back' },
    })
    assert.equal(bad.status, 406)
    assert.equal((await json(bad)).code, 'PGRST116')
    assert.equal((await json(await get('/zz_rest_items?select=name&note=eq.rolled-back'))).length, 0)
  })

  test('PATCH cannot touch another owner: RLS filters the rows, nothing changes', async () => {
    const r = await call('PATCH', '/zz_rest_items?name=eq.bravo-only&select=name', { token: tokA, headers: { prefer: 'return=representation' }, body: { qty: 999 } })
    assert.equal(r.status, 200)
    assert.deepEqual(await json(r), [])
    const q = await pgs.admin.query(`SELECT qty FROM public.zz_rest_items WHERE name = 'bravo-only'`)
    assert.equal(q.rows[0].qty, 1)
  })

  test('PATCH without any filter is refused (400, 21000) and changes nothing', async () => {
    const r = await call('PATCH', '/zz_rest_items', { token: tokA, body: { qty: 0 } })
    assert.equal(r.status, 400)
    const body = await json(r)
    assert.equal(body.code, '21000')
    assert.match(body.message, /requires a WHERE clause/)
    const zero = await pgs.admin.query(`SELECT count(*)::int AS n FROM public.zz_rest_items WHERE qty = 0`)
    assert.equal(zero.rows[0].n, 0)
  })

  test('unknown body column: 400 PGRST204; revoked column write: 403 / 42501', async () => {
    const r = await call('POST', '/zz_rest_items', { token: tokA, body: { name: 'q1', nope: 1 } })
    assert.equal(r.status, 400)
    assert.equal((await json(r)).code, 'PGRST204')
    const sec = await call('PATCH', '/zz_rest_items?name=eq.apple', { token: tokA, body: { secret: 'x' } })
    assert.equal(sec.status, 403)
    assert.equal((await json(sec)).code, '42501')
  })

  test('DELETE and PUT answer 501 naming the feature', async () => {
    for (const m of ['DELETE', 'PUT']) {
      const r = await call(m, '/zz_rest_items?name=eq.apple', { token: tokA })
      assert.equal(r.status, 501)
      assert.match((await json(r)).message, new RegExp(m))
    }
    assert.equal((await pgs.admin.query(`SELECT 1 FROM public.zz_rest_items WHERE name = 'apple'`)).rowCount, 1)
  })
})

describe('RLS and privileges are real', () => {
  test("another agency's rows are invisible", async () => {
    const a = await json(await get('/agency_orders?select=client_order_ref&order=client_order_ref.asc', tokA))
    assert.ok(a.length === 6 && a.every((x) => x.client_order_ref.startsWith('A-')))
    const b = await json(await get('/agency_orders?select=client_order_ref&order=client_order_ref.asc', tokB))
    assert.deepEqual(b.map((x) => x.client_order_ref), ['B-1', 'B-2'])
    const peek = await json(await get(`/agency_orders?select=id&agency_id=eq.${agencyA}`, tokB))
    assert.deepEqual(peek, [])
    const t = await json(await get('/transport_agencies?select=company_name', tokB))
    assert.ok(t.every((x) => x.company_name !== 'Alpha Transport'))
    const items = await json(await get('/zz_rest_items?select=name', tokB))
    assert.deepEqual(items, [{ name: 'bravo-only' }])
  })

  test('anon sees nothing: no table grant is 401 / 42501, an RLS-empty table is an empty list', async () => {
    const orders = await get('/agency_orders?select=id', null)
    assert.equal(orders.status, 401)
    assert.equal((await json(orders)).code, '42501')
    const items = await get('/zz_rest_items?select=name', null)
    assert.equal(items.status, 200)
    assert.deepEqual(await json(items), [])
    // the anon key as a bearer works the same
    const viaBearer = await get('/zz_rest_items?select=name', ANON)
    assert.deepEqual(await json(viaBearer), [])
  })

  test('a revoked column selected as authenticated is 403 / 42501, never silently dropped', async () => {
    const r = await get('/agency_erp_connections?select=id,secret_hash', tokA)
    assert.equal(r.status, 403)
    const body = await json(r)
    assert.equal(body.code, '42501')
    assert.match(body.message, /permission denied/)
    const star = await get('/agency_erp_connections?select=*', tokA)
    assert.equal(star.status, 403)
    const allowed = await get('/agency_erp_connections?select=id,name,secret_hint', tokA)
    assert.equal(allowed.status, 200)
    assert.equal((await json(allowed))[0].secret_hint, 'erpk_...abcd')
    const filt = await get('/zz_rest_items?select=name&secret=eq.s3cret', tokA)
    assert.equal(filt.status, 403)
    const ord = await get('/zz_rest_items?select=name&order=secret.asc', tokA)
    assert.equal(ord.status, 403)
  })

  test('subscriptions (billing) is not readable by authenticated: 403', async () => {
    const r = await get('/subscriptions?select=*', tokA)
    assert.equal(r.status, 403)
    assert.equal((await json(r)).code, '42501')
  })

  test('bad, expired and service_role credentials are refused before any query', async () => {
    assert.equal((await get('/agency_orders?select=id', 'garbage')).status, 401)
    const svc = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from('{"role":"service_role"}').toString('base64url')}.x`
    assert.equal((await get('/agency_orders?select=id', svc)).status, 401)
  })
})

describe('501 for what is not implemented, and hostile input', () => {
  const cases = [
    ['embedded select', '/agency_jobs?select=id,shipments(origin,destination)', /embedded/],
    ['embedded select with hint', '/agency_orders?select=id,agency_client_agreements!inner(client_name)', /embedded/],
    ['or group', '/zz_rest_items?select=name&or=(name.eq.apple,name.eq.date)', /or/],
    ['and group', '/zz_rest_items?select=name&and=(qty.gt.1,qty.lt.9)', /and/],
    ['unsupported operator cs', '/zz_rest_items?select=name&tags=cs.%7Bx%7D', /operator cs/],
    ['unsupported operator fts', '/zz_rest_items?select=name&note=fts.fruit', /operator fts/],
    ['alias in select', '/zz_rest_items?select=label:name', /alias/],
    ['json path in select', '/zz_rest_items?select=meta->a', /JSON path/],
    ['filter on embedded resource', '/zz_rest_items?select=name&shipments.status=eq.x', /embedded resource/],
    ['csv output', '/zz_rest_items?select=name', /Accept/, { accept: 'text/csv' }],
  ]
  for (const [label, path, re, headers] of cases) {
    test(`501: ${label}`, async () => {
      const r = await get(path, tokA, headers)
      assert.equal(r.status, 501)
      const body = await json(r)
      assert.equal(body.code, 'HARNESS501')
      assert.match(body.message, re)
      assert.ok(body.feature)
    })
  }

  test('injection in select, filter column, order, table and values is rejected or harmlessly bound', async () => {
    const enc = encodeURIComponent
    const attempts = [
      `/zz_rest_items?select=${enc('name; DROP TABLE public.zz_rest_items;--')}`,
      `/zz_rest_items?select=${enc('name"')}`,
      `/zz_rest_items?select=name&${enc('name" OR 1=1 --')}=eq.x`,
      `/zz_rest_items?select=name&order=${enc('name; DROP TABLE public.zz_rest_items')}`,
      `/zz_rest_items?select=name&order=name.asc${enc('; DROP TABLE x')}`,
      `/zz_rest_items?select=name&limit=${enc('1; DROP TABLE x')}`,
      `/zz_rest_items?select=name&offset=${enc('-1')}`,
      `/${enc('zz_rest_items; DROP TABLE x')}?select=name`,
      `/${enc('pg_catalog.pg_user')}?select=usename`,
      `/zz_rest_items?select=name&name=${enc('eq.apple')}${enc("' OR '1'='1")}`,
    ]
    for (const path of attempts) {
      const r = await get(path)
      const text = await r.text()
      assert.ok([400, 404, 501, 200].includes(r.status), `${path} -> ${r.status} ${text}`)
      if (r.status === 200) assert.deepEqual(JSON.parse(text), [], `${path} leaked rows`)
    }
    assert.equal((await pgs.admin.query(`SELECT to_regclass('public.zz_rest_items') AS t`)).rows[0].t, 'zz_rest_items')
    // values are bound: a quote payload matches nothing and does not execute
    const hostile = await json(await get(`/zz_rest_items?select=name&name=eq.${enc("apple' OR '1'='1")}`))
    assert.deepEqual(hostile, [])
    const like = await json(await get(`/zz_rest_items?select=name&note=like.${enc("%'; DROP TABLE x; --")}`))
    assert.deepEqual(like, [])
    const inList = await json(await get(`/zz_rest_items?select=name&name=in.(${enc("apple','banana")})`))
    assert.deepEqual(inList, [])
    // insert values are bound too
    const ins = await call('POST', '/zz_rest_items?select=name', {
      token: tokA,
      headers: { prefer: 'return=representation' },
      body: { name: "Robert'); DROP TABLE zz_rest_items;--" },
    })
    assert.equal(ins.status, 201)
    assert.equal((await pgs.admin.query(`SELECT count(*)::int AS n FROM public.zz_rest_items`)).rows[0].n > 5, true)
    // a uuid column given garbage is a 400 from the database cast, not an injection
    const bad = await get(`/agency_orders?select=id&id=eq.${enc("x' OR 1=1 --")}`)
    assert.equal(bad.status, 400)
    assert.equal((await json(bad)).code, '22P02')
  })

  test('unknown table: 404 PGRST205; unknown column: 400 42703; other schema profile: 406', async () => {
    const t = await get('/no_such_table?select=*')
    assert.equal(t.status, 404)
    assert.equal((await json(t)).code, 'PGRST205')
    const c = await get('/zz_rest_items?select=nope')
    assert.equal(c.status, 400)
    assert.equal((await json(c)).code, '42703')
    const p = await get('/zz_rest_items?select=name', tokA, { 'accept-profile': 'auth' })
    assert.equal(p.status, 406)
    const sys = await get('/users?select=id', tokA, {})
    assert.equal(sys.status, 200)
  })

  test('invalid JSON body is 400 PGRST102', async () => {
    const r = await fetch(h.url + '/rest/v1/zz_rest_items', {
      method: 'POST',
      headers: { apikey: ANON, authorization: `Bearer ${tokA}`, 'content-type': 'application/json' },
      body: '{not json',
    })
    assert.equal(r.status, 400)
    assert.equal((await json(r)).code, 'PGRST102')
  })
})

describe('real @supabase/supabase-js client end to end', () => {
  let supabase

  before(async () => {
    const entry = frontendRequire.resolve('@supabase/supabase-js')
    const { createClient } = await import(pathToFileURL(entry).href)
    supabase = createClient(h.url, ANON, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  })

  after(async () => {
    await supabase?.auth.signOut().catch(() => {})
  })

  test('signInWithPassword, rpc entitlement, from(agency_orders).select(*).limit(5)', async () => {
    const { data: signed, error: signErr } = await supabase.auth.signInWithPassword({ email: A.email, password: A.password })
    assert.equal(signErr, null)
    assert.equal(signed.user.id, idA)
    assert.ok(signed.session.access_token)

    const { data: ent, error: entErr } = await supabase.rpc('agency_subscription_entitlement')
    assert.equal(entErr, null, JSON.stringify(entErr))
    assert.ok(ent !== null && typeof ent === 'object')

    const { data: orders, error: ordErr } = await supabase.from('agency_orders').select('*').limit(5)
    assert.equal(ordErr, null, JSON.stringify(ordErr))
    assert.equal(orders.length, 5)
    assert.ok(orders.every((o) => o.agency_id === agencyA))
  })

  test('count head, single, maybeSingle, filters and order through supabase-js', async () => {
    const head = await supabase.from('agency_orders').select('id', { count: 'exact', head: true }).eq('status', 'draft')
    assert.equal(head.error, null, JSON.stringify(head.error))
    assert.equal(head.count, 5)
    assert.equal(head.data, null)

    const counted = await supabase.from('agency_orders').select('id', { count: 'exact' }).in('status', ['draft', 'cancelled']).order('created_at', { ascending: false }).limit(2)
    assert.equal(counted.error, null)
    assert.equal(counted.count, 6)
    assert.equal(counted.data.length, 2)

    const one = await supabase.from('transport_agencies').select('id').eq('user_id', idA).maybeSingle()
    assert.equal(one.error, null)
    assert.deepEqual(one.data, { id: agencyA })

    const none = await supabase.from('transport_agencies').select('id').eq('user_id', randomUUID()).maybeSingle()
    assert.equal(none.error, null)
    assert.equal(none.data, null)

    const single = await supabase.from('agency_orders').select('id').eq('client_order_ref', 'nope').single()
    assert.equal(single.data, null)
    assert.equal(single.error.code, 'PGRST116')

    const range = await supabase.from('zz_rest_items').select('name').is('note', null).gte('qty', 1).order('name')
    assert.equal(range.error, null)
    assert.ok(Array.isArray(range.data))
  })

  test('writes through supabase-js: insert().select().single(), upsert, update().eq(), revoked column', async () => {
    const ins = await supabase.from('zz_rest_items').insert({ name: 'js-item', qty: 7 }).select('id, name').single()
    assert.equal(ins.error, null, JSON.stringify(ins.error))
    assert.equal(ins.data.name, 'js-item')

    const dup = await supabase.from('zz_rest_items').insert({ name: 'js-item' })
    assert.equal(dup.error.code, '23505')

    const up = await supabase.from('zz_rest_items').upsert({ owner: idA, name: 'js-item', qty: 8 }, { onConflict: 'owner,name' }).select('name, qty')
    assert.equal(up.error, null, JSON.stringify(up.error))
    assert.deepEqual(up.data, [{ name: 'js-item', qty: 8 }])

    const upd = await supabase.from('zz_rest_items').update({ qty: 9 }).eq('id', ins.data.id).select('qty').single()
    assert.equal(upd.error, null, JSON.stringify(upd.error))
    assert.deepEqual(upd.data, { qty: 9 })

    const users = await supabase.from('users').upsert({ id: idA, email: A.email, name: 'Via js' }, { onConflict: 'id', ignoreDuplicates: false })
    assert.equal(users.error, null, JSON.stringify(users.error))

    const sec = await supabase.from('agency_erp_connections').select('id, secret_hash')
    assert.equal(sec.data, null)
    assert.equal(sec.error.code, '42501')
    assert.equal(sec.status, 403)
  })

  test('embedded select through supabase-js surfaces the 501 as an error, never an empty list', async () => {
    const r = await supabase.from('agency_orders').select('id, agency_client_agreements(client_name)')
    assert.equal(r.data, null)
    assert.equal(r.error.code, 'HARNESS501')
    assert.equal(r.status, 501)
  })
})
