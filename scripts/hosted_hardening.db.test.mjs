#!/usr/bin/env node
/**
 * HOSTED HARDENING on PGlite: the findings of the first hosted Supabase security report, proven from the catalog
 * after the whole supabase/migrations chain is replayed (migration 20261044000000_hosted_hardening.sql).
 *   A. no function in schema public lacks a search_path setting (extension-owned functions excluded).
 *   B. the exact set of SECURITY DEFINER functions executable by anon, each with its recorded decision.
 *
 * Usage:  node scripts/hosted_hardening.db.test.mjs   (from the repo root)
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

/** The ONLY SECURITY DEFINER functions anon may execute, each with the reason it is kept. */
const ANON_SECDEF_ALLOW = {
  'platform_gst_registered()': 'public pricing page reads the seller GST flag before sign-in',
  'resolve_login_identifier(text)': 'login screen resolves a login ID to an email before sign-in',
  'is_admin_user(uuid)': 'evaluated inside PUBLIC-role RLS policies and invoker trigger guards; false for signed-out callers',
  'is_shipment_driver(uuid)': 'evaluated inside the PUBLIC-role shipments policy; false for signed-out callers',
}
/** SECURITY DEFINER functions anon must NOT execute (revoked by migration 20261044000000), with the reason. */
const ANON_REVOKED = {
  'propagate_trip_delivery_status()': 'trigger function; EXECUTE is only checked at CREATE TRIGGER',
  'respond_to_job_offer(uuid,boolean,text)': 'signed-in driver action only',
}
/** Trigger function: closed to every client role. */
const REVOKED_FROM_AUTHENTICATED = ['propagate_trip_delivery_status()']
/** Functions that must stay executable by authenticated and service_role. */
const STILL_GRANTED = [
  'respond_to_job_offer(uuid,boolean,text)',
  'is_admin_user(uuid)',
  'is_shipment_driver(uuid)',
  'resolve_login_identifier(text)',
  'platform_gst_registered()',
]
const A_NAMES = [
  'bump_agency_employment_version', 'bump_agency_truck_version', 'create_usage_tracking',
  'enforce_agency_driver_payout_insert', 'enforce_agency_job_driver_assignment',
  'enforce_agency_truck_driver_assignment', 'enforce_driver_kyc_version_chain',
  'enforce_transport_agency_status_writes', 'generate_4digit_otp', 'generate_invoice_number', 'generate_lr_number',
  'guard_user_role_mutations', 'is_job_trip_photo_url', 'job_offers_enforce_4digit_otp',
  'normalize_and_validate_pan_number', 'normalize_user_login_id', 'set_notification_read_at',
  'set_shipment_document_numbers', 'set_updated_at', 'update_updated_at_column',
]

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
const rows = async (sql) => (await db.query(sql)).rows
const PUBLIC_FN = `p.pronamespace = 'public'::regnamespace
  AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')`
const PUBLIC_ACL = `EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')`

await testCase('H01 every migration replays on a fresh database', async () => expect(replayError === null, replayError))

await testCase('H02 no non-extension function in schema public lacks a search_path setting', async () => {
  const r = await rows(`SELECT p.oid::regprocedure::text AS sig FROM pg_proc p
    WHERE ${PUBLIC_FN} AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c WHERE c LIKE 'search_path=%')
    ORDER BY 1`)
  expect(r.length === 0, `no search_path: ${r.map((x) => x.sig).join(', ')}`)
})

await testCase('H03 the 20 functions of finding A pin public, extensions, pg_temp', async () => {
  const r = await rows(`SELECT p.proname, p.proconfig::text AS cfg FROM pg_proc p
    WHERE ${PUBLIC_FN} AND p.proname = ANY(ARRAY['${A_NAMES.join("','")}'])`)
  expect(new Set(r.map((x) => x.proname)).size === A_NAMES.length, `found ${r.length} of ${A_NAMES.length}`)
  const bad = r.filter((x) => !/search_path=public, extensions, pg_temp/.test(x.cfg))
  expect(bad.length === 0, `unexpected path: ${bad.map((x) => `${x.proname} ${x.cfg}`).join(' | ')}`)
})

await testCase('H04 anon-executable SECURITY DEFINER functions are exactly the allow-list', async () => {
  const r = await rows(`SELECT regexp_replace(p.oid::regprocedure::text, ', ', ',', 'g') AS sig FROM pg_proc p
    WHERE ${PUBLIC_FN} AND p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE') ORDER BY 1`)
  const got = r.map((x) => x.sig).sort()
  const want = Object.keys(ANON_SECDEF_ALLOW).sort()
  expect(JSON.stringify(got) === JSON.stringify(want), `anon SECURITY DEFINER got [${got.join(', ')}] want [${want.join(', ')}]`)
})

await testCase('H05 each revoked function is closed to anon and PUBLIC', async () => {
  for (const sig of Object.keys(ANON_REVOKED)) {
    const [r] = await rows(`SELECT has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_x, ${PUBLIC_ACL} AS pub_x
      FROM pg_proc p WHERE p.oid = '${sig}'::regprocedure`)
    expect(r.anon_x === false && r.pub_x === false, `${sig} anon=${r.anon_x} PUBLIC=${r.pub_x} (${ANON_REVOKED[sig]})`)
  }
})

await testCase('H06 kept-for-anon functions are not open through PUBLIC (explicit grants only)', async () => {
  for (const sig of Object.keys(ANON_SECDEF_ALLOW)) {
    const [r] = await rows(`SELECT ${PUBLIC_ACL} AS pub_x FROM pg_proc p WHERE p.oid = '${sig}'::regprocedure`)
    expect(r.pub_x === false, `${sig} still granted to PUBLIC (${ANON_SECDEF_ALLOW[sig]})`)
  }
})

await testCase('H07 trigger function propagate_trip_delivery_status is closed to authenticated too', async () => {
  for (const sig of REVOKED_FROM_AUTHENTICATED) {
    const [r] = await rows(`SELECT has_function_privilege('authenticated', '${sig}'::regprocedure, 'EXECUTE') AS x`)
    expect(r.x === false, `${sig} executable by authenticated`)
  }
})

await testCase('H08 callers that still need the functions keep EXECUTE (authenticated and service_role)', async () => {
  for (const sig of STILL_GRANTED) {
    const [r] = await rows(`SELECT has_function_privilege('authenticated', '${sig}'::regprocedure, 'EXECUTE') AS a,
      has_function_privilege('service_role', '${sig}'::regprocedure, 'EXECUTE') AS s`)
    expect(r.a && r.s, `${sig} authenticated=${r.a} service_role=${r.s}`)
  }
})

await testCase('H09 the delivery-propagation trigger is still installed after the revoke', async () => {
  const [t] = await rows(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'trg_job_offers_delivery_propagation' AND NOT tgisinternal`)
  expect(t.n === 1, 'trigger trg_job_offers_delivery_propagation missing')
})

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} cases passed`)
process.exit(passed === results.length ? 0 : 1)
