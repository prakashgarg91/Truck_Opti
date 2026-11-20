#!/usr/bin/env node
/**
 * DOCUMENT NUMBER GENERATORS on PGlite (migration 20261048000000_document_number_generators.sql).
 * generate_lr_number() / generate_invoice_number() must not be callable by clients (they advance the
 * shipment_lr_seq / invoice_seq sequences), while the normal shipment insert path and
 * ensure_shipment_document_numbers() keep producing numbers in the same format.
 *
 * Usage:  node scripts/document_number_generators.db.test.mjs   (from the repo root)
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
if (!existsSync(PGLITE_BASE)) {
  console.error('FAIL: PGlite not found at ' + PGLITE_BASE + ' — run `npm ci` in frontend/ first.')
  process.exit(1)
}
const { PGlite } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'index.js')).href)
const { uuid_ossp } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'contrib', 'uuid_ossp.js')).href)

const db = await PGlite.create({ extensions: { uuid_ossp } })
const results = []
async function testCase(name, fn) {
  try {
    await fn()
    results.push(true)
    console.log(`PASS  ${name}`)
  } catch (error) {
    results.push(false)
    console.log(`FAIL  ${name} — ${String((error && error.message) || error).split('\n')[0].slice(0, 400)}`)
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message)
}
async function expectError(promise, fragment) {
  try {
    await promise
  } catch (error) {
    const message = String((error && error.message) || error).split('\n')[0]
    expect(message.includes(fragment), `expected error containing "${fragment}", got: ${message}`)
    return message
  }
  throw new Error(`expected an error containing "${fragment}", but the call succeeded`)
}

await db.exec(BOOTSTRAP)
let replayError = null
for (const f of readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  } catch (e) {
    replayError = `migration ${f} failed: ${String(e.message).split('\n')[0]}`
    break
  }
}
const rows = async (sql, params = []) => (await db.query(sql, params)).rows

let n = 0
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
async function createUserWithCustomer(tag) {
  const id = uid()
  const email = `${tag}-${n}@example.com`
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{}'::jsonb)`, [id, email])
  await db.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  const customerId = uid()
  await db.query(
    `INSERT INTO public.customers (id, name, phone, email, address, city, state, pincode, gst_number, pan_number, created_by)
     VALUES ($1, $2, $3, $4, 'Street', 'Delhi', 'Delhi', '110001', $5, $6, $7)`,
    [customerId, `${tag} Logistics`, '99999999' + String(n).padStart(2, '0'), `c-${email}`, `ABCDE${1000 + n}F`, `FGHIJ${2000 + n}K`, id]
  )
  return { userId: id, customerId }
}
async function actAs(sub) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [sub ? JSON.stringify({ sub, role: 'authenticated' }) : '{}'])
  await db.exec(sub ? 'SET ROLE authenticated' : 'SET ROLE anon')
}
async function actAsOwner() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', '{}', false)`)
}
const insertShipment = (tag, customerId, userId) =>
  db.query(
    `INSERT INTO public.shipments
       (shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, 'Delhi', 'Jaipur', 'pending', 1200, 1850, 'eicher_14ft', '2026-10-10', 'Electronics', 75000)
     RETURNING id, invoice_number, lr_number`,
    [`DNG-${tag}-${Date.now()}-${n}`, customerId, userId]
  )
const lrSeq = async () => (await rows(`SELECT last_value::bigint AS v, is_called FROM public.shipment_lr_seq`))[0]

await testCase('G01 every migration replays on a fresh database', async () => expect(replayError === null, replayError))

const GENS = ['public.generate_lr_number()', 'public.generate_invoice_number()']
await testCase('G02 catalog: anon, authenticated and PUBLIC cannot EXECUTE the generators; service_role can', async () => {
  for (const g of GENS) {
    const [r] = await rows(`SELECT has_function_privilege('anon', '${g}', 'EXECUTE') AS a,
      has_function_privilege('authenticated', '${g}', 'EXECUTE') AS u,
      has_function_privilege('service_role', '${g}', 'EXECUTE') AS s,
      EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
              WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') AS pub
      FROM pg_proc p WHERE p.oid = '${g}'::regprocedure`)
    expect(!r.a && !r.u && !r.pub && r.s, `${g} anon=${r.a} authenticated=${r.u} PUBLIC=${r.pub} service_role=${r.s}`)
  }
})

await testCase('G03 calling either generator as anon or authenticated is permission denied', async () => {
  const { userId } = await createUserWithCustomer('G03')
  for (const who of [null, userId]) {
    await actAs(who)
    for (const g of GENS) {
      await expectError(db.query(`SELECT ${g.replace('()', '')}() AS v`), 'permission denied for function')
    }
  }
  await actAsOwner()
})

await testCase('G04 the trigger function is SECURITY DEFINER, pinned search_path, closed to anon and authenticated', async () => {
  const [r] = await rows(`SELECT p.prosecdef, p.proconfig::text AS cfg,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS a, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS u
    FROM pg_proc p WHERE p.oid = 'public.set_shipment_document_numbers()'::regprocedure`)
  expect(r.prosecdef === true, 'trigger function must be SECURITY DEFINER')
  expect(/search_path=public, extensions, pg_temp/.test(r.cfg), `search_path ${r.cfg}`)
  expect(!r.a && !r.u, `anon=${r.a} authenticated=${r.u}`)
})

await testCase('G05 sequences are not usable by anon or authenticated', async () => {
  for (const s of ['public.shipment_lr_seq', 'public.invoice_seq']) {
    const [r] = await rows(`SELECT has_sequence_privilege('anon', '${s}', 'USAGE') AS a,
      has_sequence_privilege('authenticated', '${s}', 'USAGE') AS u, has_sequence_privilege('service_role', '${s}', 'USAGE') AS s`)
    expect(!r.a && !r.u && r.s, `${s} anon=${r.a} authenticated=${r.u} service_role=${r.s}`)
  }
})

let customerA
let userA
await testCase('G06 a signed-in customer insert still gets LR and invoice numbers in the old format; sequence advances by exactly one', async () => {
  const c = await createUserWithCustomer('G06')
  customerA = c.customerId
  userA = c.userId
  await actAsOwner()
  const before = await lrSeq()
  await actAs(userA)
  const [r] = (await insertShipment('G06', customerA, userA)).rows
  await actAsOwner()
  const after = await lrSeq()
  expect(/^LR-\d{6}-\d{6}$/.test(r.lr_number), `lr_number ${r.lr_number}`)
  expect(/^INV-\d{6}-\d{6}$/.test(r.invoice_number), `invoice_number ${r.invoice_number}`)
  const used = Number(after.v) - Number(before.v) + (before.is_called ? 0 : 1) - (after.is_called ? 0 : 1)
  expect(used === 1, `sequence advanced by ${used}`)
  await actAsOwner()
})

await testCase('G07 a signed-out insert is still refused by row security, not by function permission', async () => {
  await actAs(null)
  const msg = await expectError(
    db.query(
      `INSERT INTO public.shipments (shipment_id, origin, destination, status, total_weight, estimated_cost, vehicle_type, pickup_date, goods_description, estimated_value)
       VALUES ('DNG-ANON', 'Delhi', 'Jaipur', 'pending', 1, 1, 'eicher_14ft', '2026-10-12', 'x', 1)`
    ),
    'row-level security'
  )
  expect(!/permission denied for function/.test(msg), msg)
  await actAsOwner()
})

await testCase('G08 ensure_shipment_document_numbers still works for the owner of the shipment and is guarded for others', async () => {
  const other = await createUserWithCustomer('G08o')
  await actAs(userA)
  const [made] = (await insertShipment('G08', customerA, userA)).rows
  const same = await rows(`SELECT * FROM public.ensure_shipment_document_numbers($1)`, [made.id])
  expect(same[0].lr_number === made.lr_number && same[0].invoice_number === made.invoice_number, 'idempotent numbers')
  await actAsOwner()
  // a shipment created without numbers (as written by a path that nulls them) is filled by the RPC
  await db.query(`ALTER TABLE public.shipments DISABLE TRIGGER trg_set_shipment_document_numbers`)
  const [bare] = (await insertShipment('G08b', customerA, userA)).rows
  await db.query(`ALTER TABLE public.shipments ENABLE TRIGGER trg_set_shipment_document_numbers`)
  expect(bare.lr_number === null && bare.invoice_number === null, 'bare shipment should have no numbers')
  await actAs(userA)
  const filled = await rows(`SELECT * FROM public.ensure_shipment_document_numbers($1)`, [bare.id])
  expect(/^LR-\d{6}-\d{6}$/.test(filled[0].lr_number) && /^INV-\d{6}-\d{6}$/.test(filled[0].invoice_number), JSON.stringify(filled[0]))
  await actAs(other.userId)
  await expectError(db.query(`SELECT * FROM public.ensure_shipment_document_numbers($1)`, [made.id]), 'Shipment not found or access denied')
  await actAs(null)
  await expectError(db.query(`SELECT * FROM public.ensure_shipment_document_numbers($1)`, [made.id]), 'permission denied')
  await actAsOwner()
})

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} cases passed`)
process.exit(passed === results.length ? 0 : 1)
