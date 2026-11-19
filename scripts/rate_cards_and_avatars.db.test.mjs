#!/usr/bin/env node
/**
 * agency_rate_cards + avatars bucket (migration 20261045000000) on PGlite, after the whole chain is replayed.
 *   RC: table shape, constraints, RLS, per-role privileges, cascade, updated_at, idempotent re-run.
 *   AV: bucket row, storage policies (own-folder writes allowed, other-folder and anon refused, public read).
 *
 * Usage:  node scripts/rate_cards_and_avatars.db.test.mjs   (from the repo root)
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
const MIGRATION = '20261045000000_rate_cards_and_avatars.sql'
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
async function su(sql, params = []) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', '{}', false)`)
  return db.query(sql, params)
}
/** Runs one statement as `role` (optionally with a JWT sub). Returns { raised, message, rows }. */
async function asRole(role, sql, params = [], sub = null) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [sub ? JSON.stringify({ sub, role }) : '{}'])
  await db.exec(`SET ROLE ${role}`)
  try {
    const res = await db.query(sql, params)
    return { raised: false, rows: res.rows }
  } catch (error) {
    return { raised: true, message: String(error.message).split('\n')[0] }
  } finally {
    await db.exec('RESET ROLE')
    await db.query(`SELECT set_config('request.jwt.claims', '{}', false)`)
  }
}

const U1 = '11111111-1111-4111-8111-111111111111'
const U2 = '22222222-2222-4222-8222-222222222222'
const AG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

await testCase('RC00 every migration replays on a fresh database', async () => expect(replayError === null, replayError))

if (replayError === null) {
  await su(`INSERT INTO auth.users (id, email) VALUES ($1, 'u1@invalid.test'), ($2, 'u2@invalid.test')`, [U1, U2])
  await su(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number) VALUES
      ($1, $2, 'Agency A', 'Pune', 'approved', '07ABCDE1001A1Z5', 'ABCDE4001Q'),
      ($3, $4, 'Agency B', 'Delhi', 'approved', '07ABCDE1002A1Z5', 'ABCDE4002Q')`,
    [AG_A, U1, AG_B, U2]
  )
}

await testCase('RC01 table has the columns, types and nullability the Edge function and page use', async () => {
  const r = await rows(`SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'agency_rate_cards'`)
  const by = new Map(r.map((x) => [x.column_name, x]))
  const want = {
    id: ['uuid', 'NO'], agency_id: ['uuid', 'NO'], vehicle_type: ['text', 'NO'], origin_city: ['text', 'NO'],
    dest_city: ['text', 'NO'], rate_per_km: ['numeric', 'YES'], flat_rate: ['numeric', 'YES'],
    min_weight_kg: ['numeric', 'YES'], max_weight_kg: ['numeric', 'YES'], is_active: ['boolean', 'NO'],
    valid_from: ['timestamp with time zone', 'YES'], valid_until: ['timestamp with time zone', 'YES'],
    notes: ['text', 'YES'], created_at: ['timestamp with time zone', 'NO'], updated_at: ['timestamp with time zone', 'NO'],
  }
  for (const [c, [t, n]] of Object.entries(want)) {
    const x = by.get(c)
    expect(x && x.data_type === t && x.is_nullable === n, `${c}: got ${x ? x.data_type + '/' + x.is_nullable : 'missing'} want ${t}/${n}`)
  }
  expect(by.size === Object.keys(want).length, `unexpected extra columns: ${[...by.keys()].filter((k) => !(k in want)).join(',')}`)
})

await testCase('RC02 insert exactly as the Edge function does works and applies defaults', async () => {
  const r = await asRole('service_role',
    `INSERT INTO public.agency_rate_cards (agency_id, vehicle_type, origin_city, dest_city, rate_per_km, flat_rate, min_weight_kg, max_weight_kg, valid_until, notes)
     VALUES ($1, 'tata_407', 'Pune', 'Mumbai', 12.5, NULL, NULL, NULL, NULL, NULL) RETURNING is_active, valid_from, created_at`, [AG_A])
  expect(!r.raised, r.message)
  expect(r.rows[0].is_active === true && r.rows[0].valid_from && r.rows[0].created_at, 'defaults missing')
})

await testCase('RC03 NOT NULL on vehicle_type, origin_city, dest_city and agency_id; a date-only valid_until is accepted', async () => {
  for (const col of ['vehicle_type', 'origin_city', 'dest_city', 'agency_id']) {
    const vals = { agency_id: AG_A, vehicle_type: 'x', origin_city: 'x', dest_city: 'x' }
    vals[col] = null
    const r = await asRole('service_role',
      `INSERT INTO public.agency_rate_cards (agency_id, vehicle_type, origin_city, dest_city) VALUES ($1,$2,$3,$4)`,
      [vals.agency_id, vals.vehicle_type, vals.origin_city, vals.dest_city])
    expect(r.raised && /null value/i.test(r.message), `${col} NULL not refused: ${r.message}`)
  }
  const ok = await asRole('service_role',
    `INSERT INTO public.agency_rate_cards (agency_id, vehicle_type, origin_city, dest_city, valid_until) VALUES ($1,'x','a','b','2027-03-31')`, [AG_A])
  expect(!ok.raised, ok.message)
})

await testCase('RC04 agency_id must reference transport_agencies', async () => {
  const r = await asRole('service_role',
    `INSERT INTO public.agency_rate_cards (agency_id, vehicle_type, origin_city, dest_city) VALUES (gen_random_uuid(),'x','a','b')`)
  expect(r.raised && /foreign key/i.test(r.message), `got ${r.message}`)
})

await testCase('RC05 RLS is enabled and the agency index exists', async () => {
  const [c] = await rows(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agency_rate_cards'::regclass`)
  expect(c.relrowsecurity === true, 'RLS off')
  const idx = await rows(`SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='agency_rate_cards' AND indexdef ILIKE '%(agency_id%'`)
  expect(idx.length >= 1, 'no index on agency_id')
})

await testCase('RC06 anon and authenticated hold no privilege at all; service_role holds all four', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const [r] = await rows(`SELECT has_table_privilege('${role}', 'public.agency_rate_cards', '${p}') AS x`)
      expect(r.x === false, `${role} has ${p}`)
    }
  }
  for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    const [r] = await rows(`SELECT has_table_privilege('service_role', 'public.agency_rate_cards', '${p}') AS x`)
    expect(r.x === true, `service_role lacks ${p}`)
  }
  const pub = await rows(`SELECT 1 FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    WHERE c.oid = 'public.agency_rate_cards'::regclass AND a.grantee = 0`)
  expect(pub.length === 0, 'PUBLIC still holds a privilege')
})

await testCase('RC07 no client path reaches any agency rows: read, insert, update, delete refused for anon and both agency owners', async () => {
  for (const [role, sub] of [['anon', null], ['authenticated', U1], ['authenticated', U2]]) {
    const ops = [
      [`SELECT * FROM public.agency_rate_cards`, []],
      [`INSERT INTO public.agency_rate_cards (agency_id, vehicle_type, origin_city, dest_city) VALUES ($1,'x','a','b')`, [AG_A]],
      [`UPDATE public.agency_rate_cards SET notes = 'hacked'`, []],
      [`DELETE FROM public.agency_rate_cards`, []],
    ]
    for (const [sql, p] of ops) {
      const r = await asRole(role, sql, p, sub)
      expect(r.raised && /permission denied/i.test(r.message), `${role}/${sub ?? '-'} ${sql.split(' ')[0]} not refused: ${r.raised ? r.message : 'succeeded'}`)
    }
  }
  const [n] = await rows(`SELECT count(*)::int AS n FROM public.agency_rate_cards WHERE notes = 'hacked'`)
  expect(n.n === 0, 'a client write landed')
})

await testCase('RC08 service role can list, update and delete by agency (what the function does); updated_at moves', async () => {
  await su(`INSERT INTO public.agency_rate_cards (id, agency_id, vehicle_type, origin_city, dest_city) VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', $1, 'x','a','b')`, [AG_B])
  const list = await asRole('service_role', `SELECT id FROM public.agency_rate_cards WHERE agency_id = $1 ORDER BY created_at DESC`, [AG_B])
  expect(!list.raised && list.rows.length === 1, 'service list failed')
  await su(`UPDATE public.agency_rate_cards SET updated_at = now() - interval '1 day' WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'`)
  const up = await asRole('service_role', `UPDATE public.agency_rate_cards SET is_active = false WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' RETURNING updated_at > now() - interval '1 hour' AS fresh`)
  expect(!up.raised && up.rows[0].fresh === true, 'updated_at not bumped: ' + up.message)
  const del = await asRole('service_role', `DELETE FROM public.agency_rate_cards WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'`)
  expect(!del.raised, del.message)
})

await testCase('RC09 deleting an agency cascades to its rate cards only', async () => {
  const before = await rows(`SELECT agency_id FROM public.agency_rate_cards WHERE agency_id = $1`, [AG_A])
  expect(before.length >= 1, 'no rows to cascade')
  await su(`INSERT INTO public.agency_rate_cards (agency_id, vehicle_type, origin_city, dest_city) VALUES ($1,'x','a','b')`, [AG_B])
  await su(`DELETE FROM public.transport_agencies WHERE id = $1`, [AG_A])
  const a = await rows(`SELECT 1 FROM public.agency_rate_cards WHERE agency_id = $1`, [AG_A])
  const b = await rows(`SELECT 1 FROM public.agency_rate_cards WHERE agency_id = $1`, [AG_B])
  expect(a.length === 0 && b.length === 1, `after cascade A=${a.length} B=${b.length}`)
})

await testCase('RC10 the migration is idempotent (second run changes nothing and does not error)', async () => {
  await su(`INSERT INTO public.agency_rate_cards (agency_id, vehicle_type, origin_city, dest_city) VALUES ($1,'keep','a','b')`, [AG_B])
  await db.exec(readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf8'))
  const [n] = await rows(`SELECT count(*)::int AS n FROM public.agency_rate_cards WHERE vehicle_type = 'keep'`)
  const [b] = await rows(`SELECT count(*)::int AS n FROM storage.buckets WHERE id = 'avatars'`)
  expect(n.n === 1 && b.n === 1, 'data lost or bucket duplicated')
})

await testCase('AV01 avatars bucket exists, public (frontend uses getPublicUrl), image-only and small', async () => {
  const [b] = await rows(`SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'avatars'`)
  expect(b, 'bucket missing')
  expect(b.public === true, 'bucket not public')
  expect(Number(b.file_size_limit) === 2097152, `size ${b.file_size_limit}`)
  expect(b.allowed_mime_types.length > 0 && b.allowed_mime_types.every((m) => m.startsWith('image/')), 'mime list not images only')
})

const ins = (role, sub, name, bucket = 'avatars') =>
  asRole(role, `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ($1, $2, $3)`, [bucket, name, sub], sub)

await testCase('AV02 a signed-in user can upload, overwrite and delete under their own folder', async () => {
  const i = await ins('authenticated', U1, `${U1}/avatar.png`)
  expect(!i.raised, 'insert: ' + i.message)
  const u = await asRole('authenticated', `UPDATE storage.objects SET updated_at = now() WHERE bucket_id='avatars' AND name = $1 RETURNING id`, [`${U1}/avatar.png`], U1)
  expect(!u.raised && u.rows.length === 1, 'own update not allowed')
  const d = await asRole('authenticated', `DELETE FROM storage.objects WHERE bucket_id='avatars' AND name = $1 RETURNING id`, [`${U1}/avatar.png`], U1)
  expect(!d.raised && d.rows.length === 1, 'own delete not allowed')
})

await testCase('AV03 writes into another user folder, a bare root file, or via anon are refused', async () => {
  for (const name of [`${U2}/avatar.png`, 'avatar.png']) {
    const r = await ins('authenticated', U1, name)
    expect(r.raised && /row-level security/i.test(r.message), `${name} not refused: ${r.message}`)
  }
  const a = await ins('anon', null, `${U1}/avatar.png`)
  expect(a.raised && /row-level security|permission denied/i.test(a.message), 'anon insert not refused')
})

await testCase('AV04 users cannot update or delete another user object, nor move their own into another folder', async () => {
  await su(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('avatars', $1, $2)`, [`${U2}/avatar.png`, U2])
  await su(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('avatars', $1, $2)`, [`${U1}/mine.png`, U1])
  const u = await asRole('authenticated', `UPDATE storage.objects SET owner = $2 WHERE bucket_id='avatars' AND name = $1 RETURNING id`, [`${U2}/avatar.png`, U1], U1)
  expect(!u.raised && u.rows.length === 0, 'updated another user object')
  const d = await asRole('authenticated', `DELETE FROM storage.objects WHERE bucket_id='avatars' AND name = $1 RETURNING id`, [`${U2}/avatar.png`], U1)
  expect(!d.raised && d.rows.length === 0, 'deleted another user object')
  const mv = await asRole('authenticated', `UPDATE storage.objects SET name = $2 WHERE bucket_id='avatars' AND name = $1`, [`${U1}/mine.png`, `${U2}/stolen.png`], U1)
  expect(mv.raised && /row-level security/i.test(mv.message), 'moved object into another folder')
})

await testCase('AV05 avatars are readable by anyone (public bucket); the policies do not open other buckets', async () => {
  const r = await asRole('anon', `SELECT name FROM storage.objects WHERE bucket_id='avatars'`)
  expect(!r.raised && r.rows.length >= 1, 'anon cannot read avatars')
  const other = await ins('authenticated', U1, `${U1}/x.png`, 'some-other-bucket')
  expect(other.raised, 'avatar policy let a write into a different bucket through')
})

await testCase('AV06 exactly four avatar policies exist (select, insert, update, delete)', async () => {
  const r = await rows(`SELECT cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND coalesce(qual,'')||coalesce(with_check,'') LIKE '%''avatars''%' ORDER BY cmd`)
  expect(JSON.stringify(r.map((x) => x.cmd)) === JSON.stringify(['DELETE', 'INSERT', 'SELECT', 'UPDATE']), `got ${r.map((x) => x.cmd)}`)
})

const failed = results.filter((x) => !x).length
console.log(`\n${results.length - failed}/${results.length} passed`)
await db.close()
process.exit(failed === 0 ? 0 : 1)
