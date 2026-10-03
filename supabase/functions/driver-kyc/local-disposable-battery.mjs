/**
 * TO-126 — Disposable local DB/Storage battery for the private KYC backend.
 *
 * Run against a THROWAWAY local Supabase stack (`npx supabase start`, CLI
 * CLI-standard dev keys). Never touches a hosted project.
 *
 * Required env:
 *   SUPABASE_URL        e.g. http://127.0.0.1:54321
 *   SUPABASE_ANON_KEY   local CLI anon key
 *   SUPABASE_SERVICE_ROLE_KEY  local CLI service role key
 * Optional env:
 *   PSQL_CONTAINER      default supabase_db_Truck_Opti
 *
 *   node supabase/functions/driver-kyc/local-disposable-battery.mjs
 */
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const SUPABASE_URL = (process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321').replace(/\/$/, '')
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PSQL_CONTAINER = process.env.PSQL_CONTAINER ?? 'supabase_db_Truck_Opti'

if (!ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required (local CLI dev keys).')
  process.exit(2)
}

const results = []
let failures = 0

function check(name, pass, detail) {
  results.push({ name, pass, detail })
  if (!pass) failures += 1
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function http(path, { method = 'GET', token, key = ANON_KEY, headers = {}, body } = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body,
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* binary or empty body */
  }
  return { status: response.status, json, text }
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', PSQL_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8' },
  ).trim()
}

/** Runs psql expecting failure; returns { failed, output }. */
function psqlExpectError(sql) {
  try {
    const out = psql(sql)
    return { failed: false, output: out }
  } catch (error) {
    return { failed: true, output: String(error.stderr ?? error.message) }
  }
}

async function createAuthUser(email, password) {
  const res = await http('/auth/v1/admin/users', {
    method: 'POST',
    key: SERVICE_ROLE_KEY,
    token: SERVICE_ROLE_KEY,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Failed to create ${email}: ${res.status} ${res.text}`)
  }
  return res.json.id
}

async function signIn(email, password) {
  const res = await http('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (res.status !== 200) throw new Error(`Sign-in failed for ${email}: ${res.status} ${res.text}`)
  return res.json.access_token
}

// ---- PDF with real %PDF- magic bytes; tiny but structurally valid header.
const pdfBytes = Buffer.concat([
  Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]),
  Buffer.alloc(64, 0x20),
])
const jpegBytes = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 0x00),
])

const PASSWORD = 'kyc-local-battery-2026'
const emailA = 'kyc-battery-driver-a@local.test'
const emailB = 'kyc-battery-driver-b@local.test'
const emailAdmin = 'kyc-battery-admin@local.test'

// Idempotent fixture cleanup (throwaway stack hygiene).
psql(`DELETE FROM public.driver_kyc_documents WHERE driver_id IN (SELECT id FROM public.drivers WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('${emailA}','${emailB}')));`)
psql(`DELETE FROM public.drivers WHERE user_id IN (SELECT id FROM auth.users WHERE email IN ('${emailA}','${emailB}'));`)
psql(`DELETE FROM public.users WHERE email IN ('${emailA}','${emailB}','${emailAdmin}');`)
{
  const staleIds = psql(`SELECT id FROM auth.users WHERE email IN ('${emailA}','${emailB}','${emailAdmin}');`)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  for (const id of staleIds) {
    await http(`/auth/v1/admin/users/${id}`, { method: 'DELETE', key: SERVICE_ROLE_KEY, token: SERVICE_ROLE_KEY })
  }
}

// ---- Fixtures -----------------------------------------------------------
const uidA = await createAuthUser(emailA, PASSWORD)
const uidB = await createAuthUser(emailB, PASSWORD)
const uidAdmin = await createAuthUser(emailAdmin, PASSWORD)

psql(`INSERT INTO public.users (id, email, role, name) VALUES ('${uidA}','${emailA}','driver','Battery Driver A'), ('${uidB}','${emailB}','driver','Battery Driver B'), ('${uidAdmin}','${emailAdmin}','admin','Battery Admin');`)
const driverAId = randomUUID()
const driverBId = randomUUID()
psql(`INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, pan_number, status) VALUES ('${driverAId}','${uidA}','Battery Driver A','+911000000001','tata_407','ABCDE1234F','pending'), ('${driverBId}','${uidB}','Battery Driver B','+911000000002','tata_407','BCDEA2345G','pending');`)

const tokenA = await signIn(emailA, PASSWORD)
const tokenB = await signIn(emailB, PASSWORD)
const tokenAdmin = await signIn(emailAdmin, PASSWORD)
const tokenService = SERVICE_ROLE_KEY

console.log(`\nFixtures: driverA=${uidA} driverB=${uidB} admin=${uidAdmin}\n`)

// ---- B. Storage checks --------------------------------------------------
const rcToken1 = randomUUID().replace(/-/g, '')
const rcPath1 = `${uidA}/rc_book/${rcToken1}.pdf`

{
  const res = await http(`/storage/v1/object/driver-docs/${rcPath1}`, {
    method: 'POST',
    token: tokenA,
    headers: { 'Content-Type': 'application/pdf' },
    body: pdfBytes,
  })
  check('storage: valid PDF upload by owner is accepted (PDF allowed as intended)', res.status === 200, `status=${res.status}`)
}
{
  const res = await http(`/storage/v1/object/driver-docs/${uidA}/rc_book/${randomUUID().replace(/-/g, '')}.txt`, {
    method: 'POST',
    token: tokenA,
    headers: { 'Content-Type': 'text/plain' },
    body: Buffer.from('not an image'),
  })
  check('storage: declared text/plain upload is rejected by bucket MIME list', res.status >= 400, `status=${res.status}`)
}
{
  const res = await http(`/storage/v1/object/driver-docs/${uidA}/truck_photo/${randomUUID().replace(/-/g, '')}.jpg`, {
    method: 'POST',
    token: tokenA,
    headers: { 'Content-Type': 'image/jpeg' },
    body: Buffer.concat([jpegBytes, Buffer.alloc(6 * 1024 * 1024)]),
  })
  check('storage: oversized (>5 MiB) upload is rejected by bucket limit', res.status >= 400, `status=${res.status}`)
}
{
  const res = await http(`/storage/v1/object/public/driver-docs/${rcPath1}`)
  check('storage: anonymous read of a driver document is denied (no public access)', res.status >= 400, `status=${res.status}`)
}
{
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/driver-docs/${rcPath1}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` },
  })
  check('storage: owner can read own document (authenticated)', res.status === 200, `status=${res.status}`)
}
{
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/driver-docs/${rcPath1}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}` },
  })
  check('storage: another driver cannot read the document', res.status >= 400, `status=${res.status}`)
}
{
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/driver-docs/${rcPath1}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenAdmin}` },
  })
  check('storage: admin can read the document', res.status === 200, `status=${res.status}`)
}

// ---- C. Table/RLS checks ------------------------------------------------
{
  const res = await http('/rest/v1/driver_kyc_documents?select=*')
  check('table: anonymous select returns no rows (RLS denies)', res.status === 200 && Array.isArray(res.json) && res.json.length === 0, `status=${res.status} rows=${Array.isArray(res.json) ? res.json.length : 'n/a'}`)
}

// Owner registers version 1 directly through PostgREST (the adapter
// normally uses the trusted function; this proves the DB guard rails).
{
  const res = await http('/rest/v1/driver_kyc_documents', {
    method: 'POST',
    token: tokenA,
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      driver_id: driverAId,
      user_id: uidA,
      kind: 'rc_book',
      version: 1,
      status: 'pending_review',
      storage_path: rcPath1,
      mime_type: 'application/pdf',
      size_bytes: pdfBytes.length,
      original_name: 'rc-book-original.pdf',
    }),
  })
  check('table: owner can insert version 1 of own document', res.status === 201, `status=${res.status} ${res.text ?? ''}`)
}
{
  const res = await http(`/rest/v1/driver_kyc_documents?select=*&driver_id=eq.${driverAId}`, { token: tokenB })
  check('table: another driver sees zero rows of the driver’s documents', res.status === 200 && res.json.length === 0, `status=${res.status} rows=${res.json.length}`)
}
{
  const res = await http(`/rest/v1/driver_kyc_documents?select=*&driver_id=eq.${driverAId}`, { token: tokenAdmin })
  check('table: admin can read the driver’s document rows', res.status === 200 && res.json.length >= 1, `status=${res.status} rows=${res.json.length}`)
}
{
  const res = await http(`/rest/v1/driver_kyc_documents?kind=eq.rc_book&version=eq.1`, {
    method: 'PATCH',
    token: tokenB,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'accepted' }),
  })
  check('table: another driver cannot update the document row (UPDATE revoked)', res.status === 401 || res.status === 403 || res.status === 42501 || res.json?.code === '42501', `status=${res.status} body=${res.text.slice(0, 120)}`)
}
{
  // Spoofed role: set user_metadata.role='admin' on driver A via the admin API.
  const res = await http(`/auth/v1/admin/users/${uidA}`, {
    method: 'PUT',
    key: SERVICE_ROLE_KEY,
    token: SERVICE_ROLE_KEY,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_metadata: { role: 'admin' } }),
  })
  const spoofOk = res.status === 200
  const tokenSpoofed = spoofOk ? await signIn(emailA, PASSWORD) : null
  const rpc = tokenSpoofed
    ? await http('/rest/v1/rpc/is_admin_user', {
        method: 'POST',
        token: tokenSpoofed,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
    : { json: 'n/a' }
  check('auth: spoofed user_metadata role does not confer admin authority (is_admin_user=false)', spoofOk && rpc.json === false, `metadata-put=${res.status} is_admin_user=${JSON.stringify(rpc.json)}`)

  const patch = await http(`/rest/v1/driver_kyc_documents?driver_id=eq.${driverAId}&kind=eq.rc_book&version=eq.1`, {
    method: 'PATCH',
    token: tokenSpoofed,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'accepted', reviewed_by: uidA }),
  })
  check('auth: spoofed-role client cannot self-accept a document row', patch.status === 401 || patch.status === 403 || patch.json?.code === '42501', `status=${patch.status} body=${patch.text.slice(0, 120)}`)

  const readOther = await http(`/rest/v1/driver_kyc_documents?select=*&user_id=eq.${uidB}`, { token: tokenSpoofed })
  check('auth: spoofed-role client cannot read another driver’s rows', readOther.status === 200 && readOther.json.length === 0, `status=${readOther.status} rows=${readOther.json.length}`)
}

// Version-chain violations (service-role context = trusted server path).
{
  const dup = psqlExpectError(`INSERT INTO public.driver_kyc_documents (driver_id, user_id, kind, version, status, storage_path, mime_type, size_bytes) VALUES ('${driverAId}','${uidA}','rc_book',1,'pending_review','${rcPath1}','application/pdf',${pdfBytes.length});`)
  check('db: duplicate version 1 is rejected (unique driver/kind/version)', dup.failed, dup.output.split('\n').slice(-1)[0]?.slice(0, 140))
}
{
  const skip = psqlExpectError(`INSERT INTO public.driver_kyc_documents (driver_id, user_id, kind, version, status, storage_path, mime_type, size_bytes) VALUES ('${driverAId}','${uidA}','rc_book',3,'pending_review','${uidA}/rc_book/${randomUUID().replace(/-/g, '')}.pdf','application/pdf',${pdfBytes.length});`)
  check('db: version skip (1→3) is rejected by the version-chain trigger', skip.failed, skip.output.split('\n').slice(-1)[0]?.slice(0, 140))
}
{
  const status = psqlExpectError(`INSERT INTO public.driver_kyc_documents (driver_id, user_id, kind, version, status, storage_path, mime_type, size_bytes) VALUES ('${driverAId}','${uidA}','rc_book',2,'accepted','${uidA}/rc_book/${randomUUID().replace(/-/g, '')}.pdf','application/pdf',${pdfBytes.length});`)
  check('db: inserting a row directly as accepted is rejected (pending_review only)', status.failed, status.output.split('\n').slice(-1)[0]?.slice(0, 140))
}
{
  const foreign = psqlExpectError(`INSERT INTO public.driver_kyc_documents (driver_id, user_id, kind, version, status, storage_path, mime_type, size_bytes) VALUES ('${driverAId}','${uidA}','rc_book',2,'pending_review','${uidB}/rc_book/${randomUUID().replace(/-/g, '')}.pdf','application/pdf',${pdfBytes.length});`)
  check('db: storage path outside the owner folder is rejected', foreign.failed, foreign.output.split('\n').slice(-1)[0]?.slice(0, 140))
}
{
  const crossOwner = psqlExpectError(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"${uidB}","role":"authenticated"}'; INSERT INTO public.driver_kyc_documents (driver_id, user_id, kind, version, status, storage_path, mime_type, size_bytes) VALUES ('${driverAId}','${uidA}','rc_book',2,'pending_review','${uidA}/rc_book/${randomUUID().replace(/-/g, '')}.pdf','application/pdf',${pdfBytes.length}); ROLLBACK;`)
  check('db: authenticated non-owner insert is rejected (RLS WITH CHECK + trigger)', crossOwner.failed, crossOwner.output.split('\n').slice(-1)[0]?.slice(0, 140))
}

// Replacement invalidates old review + conflicting review guard.
{
  // Trusted-path review of v1 (the edge function does exactly this write).
  psql(`UPDATE public.driver_kyc_documents SET status='accepted', reviewed_by='${uidAdmin}', reviewed_at=now() WHERE driver_id='${driverAId}' AND kind='rc_book' AND version=1 AND status='pending_review';`)
  // Driver uploads a replacement version 2.
  const res = await http('/rest/v1/driver_kyc_documents', {
    method: 'POST',
    token: tokenA,
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      driver_id: driverAId,
      user_id: uidA,
      kind: 'rc_book',
      version: 2,
      status: 'pending_review',
      storage_path: `${uidA}/rc_book/${randomUUID().replace(/-/g, '')}.pdf`,
      mime_type: 'application/pdf',
      size_bytes: pdfBytes.length,
      original_name: 'rc-book-replacement.pdf',
    }),
  })
  const current = JSON.parse(psql(`SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT kind, version, status FROM public.driver_kyc_documents WHERE driver_id='${driverAId}' AND kind='rc_book' ORDER BY version DESC LIMIT 1) t;`))
  check('db: replacement upload supersedes the accepted v1 (current is v2 pending_review)', res.status === 201 && current[0]?.version === 2 && current[0]?.status === 'pending_review', `insert=${res.status} current=${JSON.stringify(current)}`)
}
{
  // Exact guarded review UPDATE used by the edge function, aimed at the
  // superseded v1 — must match zero rows (conflict guard).
  const matched = psql(`WITH upd AS (UPDATE public.driver_kyc_documents SET status='accepted' WHERE driver_id='${driverAId}' AND kind='rc_book' AND version=1 AND status='pending_review' RETURNING 1) SELECT COUNT(*) FROM upd;`)
  check('db: stale-version review matches zero rows (conflict guard)', matched === '0', `matched=${matched}`)
}
{
  // Stale public URL nulling (same statement as the migration).
  psql(`UPDATE public.drivers SET dl_url='https://host/storage/v1/object/public/driver-docs/${uidA}/licence.jpg' WHERE id='${driverAId}';`)
  psql(`UPDATE public.drivers SET dl_url=NULL WHERE dl_url LIKE '%/storage/v1/object/public/driver-docs/%';`)
  const url = psql(`SELECT dl_url FROM public.drivers WHERE id='${driverAId}';`)
  check('db: stale public driver-docs URL references are nulled', url === '', `dl_url='${url}'`)
}

// ---- D. Function-level checks (served driver-kyc function) --------------
const FN = '/functions/v1/driver-kyc'
async function callFunction(payload, token = tokenA) {
  return http(FN, {
    method: 'POST',
    token,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

let state
{
  const res = await callFunction({ action: 'state' })
  state = res.json?.state
  check('fn: driver getState returns server-computed state', res.status === 200 && state && state.locked === false, `status=${res.status} locked=${state?.locked}`)
}
{
  // Fresh object + function upload → version chain continues at v3.
  const path = `${uidA}/rc_book/${randomUUID().replace(/-/g, '')}.pdf`
  await http(`/storage/v1/object/driver-docs/${path}`, {
    method: 'POST',
    token: tokenA,
    headers: { 'Content-Type': 'application/pdf' },
    body: pdfBytes,
  })
  const res = await callFunction({ action: 'upload', kind: 'rc_book', path, fileName: 'rc-book-via-function.pdf' })
  const version = res.json?.state?.versions?.rc_book
  check('fn: uploadDocument registers the next chain version (v3) with pending_review', res.status === 200 && version === 3, `status=${res.status} version=${JSON.stringify(version)}`)
}
{
  // Byte-spoof: declared PDF, actual text bytes → function rejects and removes.
  const path = `${uidA}/driving_license/${randomUUID().replace(/-/g, '')}.pdf`
  await http(`/storage/v1/object/driver-docs/${path}`, {
    method: 'POST',
    token: tokenA,
    headers: { 'Content-Type': 'application/pdf' },
    body: Buffer.from('plain text pretending to be a pdf'),
  })
  const res = await callFunction({ action: 'upload', kind: 'driving_license', path })
  const gone = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/driver-docs/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenA}` },
  })
  check('fn: byte-spoofed upload is rejected and the object is removed', res.status === 400 && gone.status >= 400, `upload=${res.status} object-after=${gone.status}`)
}
{
  const res = await callFunction({ action: 'submit' })
  check('fn: submit is refused until all four documents exist', res.status === 400, `status=${res.status} msg=${res.json?.error ?? ''}`)
}
{
  // Register the remaining three kinds (objects + trusted registration).
  for (const [kind, ext, mime] of [
    ['driving_license', 'jpg', 'image/jpeg'],
    ['aadhaar', 'jpg', 'image/jpeg'],
    ['truck_photo', 'jpg', 'image/jpeg'],
  ]) {
    const path = `${uidA}/${kind}/${randomUUID().replace(/-/g, '')}.${ext}`
    await http(`/storage/v1/object/driver-docs/${path}`, {
      method: 'POST',
      token: tokenA,
      headers: { 'Content-Type': mime },
      body: jpegBytes,
    })
    const res = await callFunction({ action: 'upload', kind, path, fileName: `${kind}.${ext}` })
    if (res.status !== 200) throw new Error(`fixture upload failed for ${kind}: ${res.status} ${res.text}`)
  }
  const res = await callFunction({ action: 'submit' })
  check('fn: submit succeeds once all four documents are uploaded (submitted=true)', res.status === 200 && res.json?.state?.submitted === true, `status=${res.status} submitted=${res.json?.state?.submitted}`)
}
{
  const res = await callFunction({ action: 'review', driverId: driverAId, kind: 'rc_book', version: 3, decision: 'accept' }, tokenB)
  check('fn: non-admin review attempt is denied (403)', res.status === 403, `status=${res.status}`)
}
{
  const res = await callFunction({ action: 'review', driverId: driverAId, kind: 'rc_book', version: 99, decision: 'accept' }, tokenAdmin)
  check('fn: review of a non-current version is rejected with 409', res.status === 409, `status=${res.status}`)
}
{
  const noReason = await callFunction({ action: 'review', driverId: driverAId, kind: 'aadhaar', version: 1, decision: 'reject' }, tokenAdmin)
  const withReason = await callFunction({ action: 'review', driverId: driverAId, kind: 'aadhaar', version: 1, decision: 'reject', reason: 'Both sides not readable' }, tokenAdmin)
  check('fn: reject without reason is refused; reject with reason records it', noReason.status === 400 && withReason.status === 200 && withReason.json?.state?.docs?.aadhaar?.rejectionReason === 'Both sides not readable', `noReason=${noReason.status} withReason=${withReason.status}`)
}
{
  // Replacement of the rejected aadhaar (v2) then accept → lock possible.
  const path = `${uidA}/aadhaar/${randomUUID().replace(/-/g, '')}.jpg`
  await http(`/storage/v1/object/driver-docs/${path}`, {
    method: 'POST',
    token: tokenA,
    headers: { 'Content-Type': 'image/jpeg' },
    body: jpegBytes,
  })
  const upload = await callFunction({ action: 'upload', kind: 'aadhaar', path, fileName: 'aadhaar-replacement.jpg' })
  const acceptRc = await callFunction({ action: 'review', driverId: driverAId, kind: 'rc_book', version: 3, decision: 'accept' }, tokenAdmin)
  const acceptDl = await callFunction({ action: 'review', driverId: driverAId, kind: 'driving_license', version: 1, decision: 'accept' }, tokenAdmin)
  const acceptTruck = await callFunction({ action: 'review', driverId: driverAId, kind: 'truck_photo', version: 1, decision: 'accept' }, tokenAdmin)
  const acceptAadhaar = await callFunction({ action: 'review', driverId: driverAId, kind: 'aadhaar', version: 2, decision: 'accept' }, tokenAdmin)
  const lockedState = acceptAadhaar.json?.state
  check(
    'fn: server-side review of all four current versions computes locked=true',
    upload.status === 200 && acceptRc.status === 200 && acceptDl.status === 200 && acceptTruck.status === 200 && acceptAadhaar.status === 200 && lockedState?.locked === true,
    `locked=${lockedState?.locked} lockedAt=${Boolean(lockedState?.lockedAt)}`,
  )
}
{
  const asOther = await callFunction({ action: 'access', kind: 'rc_book', driverId: driverAId }, tokenB)
  const asOwner = await callFunction({ action: 'access', kind: 'rc_book' }, tokenA)
  let signedFetchStatus = 0
  let signedBytesMatch = false
  if (asOwner.status === 200 && asOwner.json?.url) {
    // Local stack quirk: the storage service builds signed URLs against its
    // internal hostname (kong:8000). Rewrite to the API origin the harness
    // uses; hosted projects return the correct public host directly.
    const signedUrl = asOwner.json.url.replace(/^http:\/\/kong:8000/, SUPABASE_URL)
    const signed = await fetch(signedUrl)
    signedFetchStatus = signed.status
    const buf = Buffer.from(await signed.arrayBuffer())
    signedBytesMatch = buf.subarray(0, 5).toString('latin1') === '%PDF-'
  }
  const asAdmin = await callFunction({ action: 'access', kind: 'rc_book', driverId: driverAId }, tokenAdmin)
  const asAnon = await callFunction({ action: 'state' }, null)
  check(
    'fn: signed access — other driver denied, owner/admin get a working short-lived URL',
    asOther.status === 403 && asOwner.status === 200 && signedFetchStatus === 200 && signedBytesMatch && asAdmin.status === 200 && asAnon.status === 401,
    `other=${asOther.status} owner=${asOwner.status} signed=${signedFetchStatus}/%PDF=${signedBytesMatch} admin=${asAdmin.status} anonFn=${asAnon.status}`,
  )
}

console.log(`\n=== ${results.length - failures}/${results.length} checks passed ===`)
process.exit(failures === 0 ? 0 : 1)
