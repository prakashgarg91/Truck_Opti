#!/usr/bin/env node
/**
 * TO-129 — behavioral RLS test for respond_to_job_offer.
 *
 * Required by agent-tasks/019-atomic-job-offer-response.md:
 * "Test against real local RLS, not only mocked Supabase."
 *
 * This script is NOT a mocked unit test: it drives the real PostgREST/GoTrue
 * endpoints of a disposable local Supabase stack (started with
 * `npx supabase start`, migrations replayed with `npx supabase db reset` —
 * see agent-results/015-result.md for the disposable-stack pattern).
 * Drivers sign in with real password grants; the RPC is invoked exactly the
 * way the browser calls it; service-role access is used only to build and
 * verify fixtures.
 *
 * Usage:  node scripts/atomic_job_offer_response.rls.test.mjs
 * Env:    SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *         (defaults are read from `npx supabase status -o env`).
 *
 * Exit code 0 = every case passed. Any failure exits 1. Missing stack = loud
 * failure, never a silent skip.
 */

const REPO_ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

function assertLocalUrl(url) {
  const parsed = new URL(url)
  const host = parsed.hostname
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error(
      `Refusing to run destructive fixtures against non-local host "${host}". ` +
      'Point SUPABASE_URL at a disposable local stack (npx supabase start).'
    )
  }
  return url.replace(/\/$/, '')
}

async function readStatusEnv() {
  const { execFileSync } = await import('node:child_process')
  try {
    const out = execFileSync('npx', ['--yes', 'supabase@2.119.0', 'status', '-o', 'env'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    })
    const vars = {}
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/^([A-Z_]+)="?(.*?)"?$/)
      if (m) vars[m[1]] = m[2].replace(/'/g, '')
    }
    return vars
  } catch {
    return {}
  }
}

const statusEnv = await readStatusEnv()
const SUPABASE_URL = assertLocalUrl(
  process.env.SUPABASE_URL || process.env.SUPABASE_LOCAL_URL || statusEnv.SUPABASE_URL || 'http://127.0.0.1:54321'
)
const ANON_KEY = process.env.SUPABASE_ANON_KEY || statusEnv.ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || statusEnv.SERVICE_ROLE_KEY

if (!ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('FAIL: local API keys not found. Start the disposable stack: npx supabase start')
  process.exit(1)
}

const REST = `${SUPABASE_URL}/rest/v1`
const AUTH = `${SUPABASE_URL}/auth/v1`
const RUN = `to129-${Date.now()}`

function headers(key, token) {
  const h = {
    apikey: key,
    Authorization: `Bearer ${token || key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  return h
}

async function rest(method, path, { key = ANON_KEY, token, body } = {}) {
  const res = await fetch(`${REST}${path}`, {
    method,
    headers: headers(key, token),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}

async function rpc(name, body, token) {
  return rest('POST', `/rpc/${name}`, { token, body })
}

async function adminCreateUser(email, password) {
  const res = await fetch(`${AUTH}/admin/users`, {
    method: 'POST',
    headers: headers(SERVICE_ROLE_KEY),
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`admin user create failed (${res.status}): ${JSON.stringify(json)}`)
  return json
}

async function adminDeleteUser(id) {
  await fetch(`${AUTH}/admin/users/${id}`, { method: 'DELETE', headers: headers(SERVICE_ROLE_KEY) })
}

async function passwordToken(email, password) {
  const res = await fetch(`${AUTH}/token?grant_type=password`, {
    method: 'POST',
    headers: headers(ANON_KEY),
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json()
  if (!res.ok || !json.access_token) {
    throw new Error(`password sign-in failed for ${email}: ${JSON.stringify(json)}`)
  }
  return json.access_token
}

async function serviceInsert(table, row) {
  const { status, json } = await rest('POST', `/${table}`, { key: SERVICE_ROLE_KEY, body: row })
  if (status !== 201) throw new Error(`insert into ${table} failed (${status}): ${JSON.stringify(json)}`)
  // PostgREST returns inserted rows wrapped in an array.
  return Array.isArray(json) ? json[0] : json
}

async function serviceUpdate(table, column, value, patch) {
  const { status, json } = await rest('PATCH', `/${table}?${column}=eq.${value}`, { key: SERVICE_ROLE_KEY, body: patch })
  if (status < 200 || status >= 300) throw new Error(`update ${table} failed (${status}): ${JSON.stringify(json)}`)
  return json
}

async function serviceSelect(table, query) {
  const { status, json } = await rest('GET', `/${table}?${query}`, { key: SERVICE_ROLE_KEY })
  if (status !== 200) throw new Error(`select ${table} failed (${status}): ${JSON.stringify(json)}`)
  return json
}

async function serviceDelete(table, query) {
  await rest('DELETE', `/${table}?${query}`, { key: SERVICE_ROLE_KEY })
}

const results = []
function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function expect(cond, message) {
  if (!cond) throw new Error(message)
}

async function expectReject(promise, expectedMessage) {
  const { status, json } = await promise
  expect(status >= 400, `expected an error status, got ${status}: ${JSON.stringify(json)}`)
  if (expectedMessage) {
    expect(
      json && json.message === expectedMessage,
      `expected message "${expectedMessage}", got: ${JSON.stringify(json)}`
    )
  }
  return json
}

async function main() {
  // ---- fixtures -----------------------------------------------------------
  const driverGood = await adminCreateUser(`${RUN}-good@example.com`, 'to129-Passw0rd!')
  const driverEvil = await adminCreateUser(`${RUN}-evil@example.com`, 'to129-Passw0rd!')
  const driverBusy = await adminCreateUser(`${RUN}-busy@example.com`, 'to129-Passw0rd!')

  const goodDriverRow = await serviceInsert('drivers', {
    user_id: driverGood.id,
    full_name: 'TO129 Good Driver',
    phone: `9${Date.now() % 1000000000}`,
    vehicle_type: 'tata_407',
    status: 'approved',
    is_online: true,
    pan_number: 'ABCDE1234F',
  })
  const evilDriverRow = await serviceInsert('drivers', {
    user_id: driverEvil.id,
    full_name: 'TO129 Evil Driver',
    phone: `8${Date.now() % 1000000000}`,
    vehicle_type: 'eicher_14ft',
    status: 'approved',
    is_online: true,
    pan_number: 'ABCDE1234F',
  })
  const busyDriverRow = await serviceInsert('drivers', {
    user_id: driverBusy.id,
    full_name: 'TO129 Busy Driver',
    phone: `7${Date.now() % 1000000000}`,
    vehicle_type: 'eicher_17ft',
    status: 'approved',
    is_online: true,
    pan_number: 'ABCDE1234F',
  })

  async function makeShipment(tag) {
    return serviceInsert('shipments', {
      shipment_id: `TO129-${RUN}-${tag}`,
      customer_id: null,
      truck_id: null,
      origin: `TO129 Origin ${tag}`,
      destination: `TO129 Destination ${tag}`,
      status: 'pending',
      total_weight: 500,
      total_volume: 2,
      estimated_cost: 1500,
      driver_name: 'TO129 Fixture',
      vehicle_number: 'TO129XX0000',
    })
  }

  async function makeOffer(shipment, driverRowId, { expiresInMs = 30 * 60 * 1000 } = {}) {
    return serviceInsert('job_offers', {
      shipment_id: shipment.id,
      driver_id: driverRowId,
      status: 'pending',
      offered_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + expiresInMs).toISOString(),
    })
  }

  const goodToken = await passwordToken(`${RUN}-good@example.com`, 'to129-Passw0rd!')
  const evilToken = await passwordToken(`${RUN}-evil@example.com`, 'to129-Passw0rd!')
  const busyToken = await passwordToken(`${RUN}-busy@example.com`, 'to129-Passw0rd!')

  const offers = []
  const shipments = []
  try {
    // ---- 1. valid accept --------------------------------------------------
    const shipA = await makeShipment('A')
    const offerA = await makeOffer(shipA, goodDriverRow.id)
    shipments.push(shipA)
    offers.push(offerA)

    {
      const { status, json } = await rpc('respond_to_job_offer', { p_job_offer_id: offerA.id, p_accept: true }, goodToken)
      const row = Array.isArray(json) ? json[0] : json
      expect(status === 200, `valid accept should succeed, got ${status}: ${JSON.stringify(json)}`)
      expect(row && row.offer_status === 'accepted', `authoritative status should be accepted: ${JSON.stringify(json)}`)
      expect(row && row.active_job_id === offerA.id, `active_job_id should be the offer: ${JSON.stringify(json)}`)
      expect(row && typeof row.responded_at === 'string' && row.responded_at.length > 0, 'responded_at must be set by the server')
      const [dbOffer] = await serviceSelect('job_offers', `id=eq.${offerA.id}&select=status,responded_at`)
      const [dbDriver] = await serviceSelect('drivers', `id=eq.${goodDriverRow.id}&select=active_job_id,total_trips`)
      expect(dbOffer.status === 'accepted', 'DB job_offers.status must be accepted')
      expect(dbOffer.responded_at !== null, 'DB responded_at must be persisted')
      expect(dbDriver.active_job_id === offerA.id, 'DB drivers.active_job_id must be assigned in the same transaction')
      expect(dbDriver.total_trips === 0, 'accept must not increment total_trips')
      record('1. valid accept (offer + active job assigned atomically)', true)
    }

    // ---- 2. duplicate accept is idempotent (double click / realtime replay)
    {
      const before = (await serviceSelect('job_offers', `id=eq.${offerA.id}&select=responded_at`))[0]
      const { status, json } = await rpc('respond_to_job_offer', { p_job_offer_id: offerA.id, p_accept: true }, goodToken)
      const row = Array.isArray(json) ? json[0] : json
      const after = (await serviceSelect('job_offers', `id=eq.${offerA.id}&select=responded_at`))[0]
      expect(status === 200, `duplicate accept should be idempotent success, got ${status}: ${JSON.stringify(json)}`)
      expect(row.offer_status === 'accepted' && row.active_job_id === offerA.id, 'duplicate accept returns authoritative state')
      expect(before.responded_at === after.responded_at, 'duplicate accept must not overwrite responded_at')
      record('2. duplicate accept replay is idempotent (no second write)', true)
    }

    // ---- 3. the old direct browser UPDATE path stays denied by RLS --------
    {
      const { status } = await rest(
        'PATCH',
        `/job_offers?id=eq.${offerA.id}`,
        { token: goodToken, body: { status: 'delivered', delivered_at: new Date().toISOString() } }
      )
      expect(status === 401 || status === 403 || status === 404, `direct job_offers UPDATE must stay denied, got ${status}`)
      record('3. direct browser job_offers UPDATE remains RLS-denied (two-write path dead)', true, `status ${status}`)
    }

    // ---- 4. valid decline (with reason) + idempotent duplicate ------------
    const shipB = await makeShipment('B')
    const offerB = await makeOffer(shipB, evilDriverRow.id)
    shipments.push(shipB)
    offers.push(offerB)
    {
      const { status, json } = await rpc(
        'respond_to_job_offer',
        { p_job_offer_id: offerB.id, p_accept: false, p_decline_reason: 'Too far away' },
        evilToken
      )
      const row = Array.isArray(json) ? json[0] : json
      expect(status === 200 && row.offer_status === 'declined', `decline should succeed: ${status} ${JSON.stringify(json)}`)
      expect(row.active_job_id === null, 'decline must not set an active job')
      const [dbOffer] = await serviceSelect('job_offers', `id=eq.${offerB.id}&select=status,decline_reason`)
      expect(dbOffer.status === 'declined' && dbOffer.decline_reason === 'Too far away', 'decline_reason must persist')
      const dup = await rpc('respond_to_job_offer', { p_job_offer_id: offerB.id, p_accept: false }, evilToken)
      expect(dup.status === 200, 'duplicate decline must be idempotent success')
      record('4. valid decline (reason persisted) + idempotent duplicate decline', true)
    }

    // ---- 5. unauthorized driver cannot respond to another driver's offer --
    const shipC = await makeShipment('C')
    const offerC = await makeOffer(shipC, goodDriverRow.id)
    shipments.push(shipC)
    offers.push(offerC)
    {
      const json = await expectReject(
        rpc('respond_to_job_offer', { p_job_offer_id: offerC.id, p_accept: true }, evilToken),
        'Job offer not found or access denied'
      )
      const [dbOffer] = await serviceSelect('job_offers', `id=eq.${offerC.id}&select=status`)
      expect(dbOffer.status === 'pending', 'unauthorized response must not mutate the offer')
      record('5. unauthorized driver rejected and offer untouched', true, JSON.stringify(json.message))
    }

    // ---- 6. expired offer cannot be responded to ---------------------------
    const shipD = await makeShipment('D')
    const offerD = await makeOffer(shipD, evilDriverRow.id, { expiresInMs: -1000 })
    shipments.push(shipD)
    offers.push(offerD)
    {
      await expectReject(
        rpc('respond_to_job_offer', { p_job_offer_id: offerD.id, p_accept: true }, evilToken),
        'Job offer has expired'
      )
      const [dbOffer] = await serviceSelect('job_offers', `id=eq.${offerD.id}&select=status`)
      expect(dbOffer.status === 'pending', 'expired accept attempt must not accept the offer')
      record('6. expired offer rejected server-side (client countdown is not the gate)', true)
    }

    // ---- 7. suspended/unapproved driver rejected ---------------------------
    const shipE = await makeShipment('E')
    const offerE = await makeOffer(shipE, evilDriverRow.id)
    shipments.push(shipE)
    offers.push(offerE)
    {
      await serviceUpdate('drivers', 'id', evilDriverRow.id, { status: 'suspended' })
      await expectReject(
        rpc('respond_to_job_offer', { p_job_offer_id: offerE.id, p_accept: true }, evilToken),
        'Driver account is not approved to respond to offers'
      )
      await expectReject(
        rpc('respond_to_job_offer', { p_job_offer_id: offerE.id, p_accept: false }, evilToken),
        'Driver account is not approved to respond to offers'
      )
      await serviceUpdate('drivers', 'id', evilDriverRow.id, { status: 'approved' })
      const [dbOffer] = await serviceSelect('job_offers', `id=eq.${offerE.id}&select=status`)
      expect(dbOffer.status === 'pending', 'suspended driver must not mutate the offer')
      record('7. suspended driver cannot accept or decline', true)
    }

    // ---- 8. zero-row path: unknown offer id is a rejection, never success --
    {
      await expectReject(
        rpc('respond_to_job_offer', { p_job_offer_id: '00000000-0000-0000-0000-000000000000', p_accept: true }, goodToken),
        'Job offer not found or access denied'
      )
      record('8. unknown offer id (zero-row lookup) is a rejection, not success', true)
    }

    // ---- 9. decline-after-accept rejected ----------------------------------
    {
      await expectReject(
        rpc('respond_to_job_offer', { p_job_offer_id: offerA.id, p_accept: false }, goodToken),
        'Job offer has already been accepted'
      )
      record('9. decline after acceptance is rejected (no state corruption)', true)
    }

    // ---- 10. active-trip conflict ------------------------------------------
    const shipF = await makeShipment('F')
    const offerF = await makeOffer(shipF, goodDriverRow.id)
    shipments.push(shipF)
    offers.push(offerF)
    {
      await expectReject(
        rpc('respond_to_job_offer', { p_job_offer_id: offerF.id, p_accept: true }, goodToken),
        'Driver already has an active trip'
      )
      const [dbOffer] = await serviceSelect('job_offers', `id=eq.${offerF.id}&select=status`)
      expect(dbOffer.status === 'pending', 'conflicting accept must stay pending')
      record('10. second offer while a trip is active is rejected', true)
    }

    // ---- 11. two concurrent accepts on two different offers (same driver) --
    const shipG1 = await makeShipment('G1')
    const shipG2 = await makeShipment('G2')
    const offerG1 = await makeOffer(shipG1, busyDriverRow.id)
    const offerG2 = await makeOffer(shipG2, busyDriverRow.id)
    shipments.push(shipG1, shipG2)
    offers.push(offerG1, offerG2)
    {
      const [r1, r2] = await Promise.all([
        rpc('respond_to_job_offer', { p_job_offer_id: offerG1.id, p_accept: true }, busyToken),
        rpc('respond_to_job_offer', { p_job_offer_id: offerG2.id, p_accept: true }, busyToken),
      ])
      const ok = [r1, r2].filter((r) => r.status === 200)
      const rejected = [r1, r2].filter((r) => r.status >= 400)
      expect(ok.length === 1 && rejected.length === 1,
        `exactly one concurrent accept must win (got ${ok.length} ok / ${rejected.length} rejected)`)
      expect(rejected[0].json.message === 'Driver already has an active trip',
        `loser must fail with the active-trip conflict, got ${JSON.stringify(rejected[0].json)}`)
      const [dbDriver] = await serviceSelect('drivers', `id=eq.${busyDriverRow.id}&select=active_job_id`)
      const acceptedCount = (await serviceSelect('job_offers', `id=in.(${offerG1.id},${offerG2.id})&select=status&status=eq.accepted`)).length
      expect(dbDriver.active_job_id === offerG1.id || dbDriver.active_job_id === offerG2.id, 'winner offer must be the active job')
      expect(acceptedCount === 1, `exactly one offer may be accepted (got ${acceptedCount})`)
      record('11. two concurrent accepts on different offers: exactly one wins', true,
        `winner=${dbDriver.active_job_id === offerG1.id ? 'G1' : 'G2'}`)
    }

    // ---- 12. two concurrent duplicate accepts on the SAME offer ------------
    const shipH = await makeShipment('H')
    const offerH = await makeOffer(shipH, evilDriverRow.id)
    shipments.push(shipH)
    offers.push(offerH)
    {
      const [r1, r2] = await Promise.all([
        rpc('respond_to_job_offer', { p_job_offer_id: offerH.id, p_accept: true }, evilToken),
        rpc('respond_to_job_offer', { p_job_offer_id: offerH.id, p_accept: true }, evilToken),
      ])
      expect(r1.status === 200 && r2.status === 200,
        `both duplicate accepts must succeed idempotently (${r1.status}/${r2.status})`)
      const rows = await serviceSelect('job_offers', `id=eq.${offerH.id}&select=status,responded_at`)
      expect(rows.length === 1 && rows[0].status === 'accepted', 'offer must be accepted exactly once')
      const [dbDriver] = await serviceSelect('drivers', `id=eq.${evilDriverRow.id}&select=active_job_id,total_trips`)
      expect(dbDriver.active_job_id === offerH.id, 'active job must point at the offer')
      expect(dbDriver.total_trips === 0, 'accept must not inflate total_trips')
      record('12. concurrent duplicate accepts on one offer: safe, consistent state', true)
    }

    // ---- 13. anon/unauthenticated execution is rejected by the function ----
    // (Supabase default privileges grant EXECUTE to anon on every RPC, same as
    // the sibling persist/tracking functions; the in-function auth.uid()
    // driver lookup is the authorization boundary and must reject.)
    {
      const json = await expectReject(
        rpc('respond_to_job_offer', { p_job_offer_id: offerA.id, p_accept: true }, null),
        'Driver profile not found for the signed-in user'
      )
      const [dbOffer] = await serviceSelect('job_offers', `id=eq.${offerA.id}&select=status`)
      expect(dbOffer.status === 'accepted', 'anon attempt must not mutate the offer')
      record('13. anon/unauthenticated RPC execution rejected without side effects', true, JSON.stringify(json.message))
    }

    // ---- 14. the driver can READ their own pending offer (modal reachability)
    const shipI = await makeShipment('I')
    const offerI = await makeOffer(shipI, evilDriverRow.id)
    shipments.push(shipI)
    offers.push(offerI)
    {
      const q = `driver_id=eq.${evilDriverRow.id}&status=eq.pending&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,shipment_id,offered_at,expires_at,status,shipments(origin,destination,total_weight,estimated_cost)`
      const { status, json } = await rest('GET', `/job_offers?${q}`, { token: evilToken })
      expect(status === 200, `driver pending-offer read must not error (42P17 would surface here), got ${status}`)
      const own = Array.isArray(json) ? json.find((row) => row.id === offerI.id) : null
      expect(own, `driver must see their own pending offer, got ${JSON.stringify(json)}`)
      expect(own.shipments && own.shipments.origin === `TO129 Origin I`, 'embedded shipment summary must be readable')
      record('14. driver reads own pending offer with shipment summary (modal hydration works)', true)
    }

    // ---- 15. another driver cannot read it (isolation, no over-sharing) -----
    {
      const { status, json } = await rest('GET', `/job_offers?id=eq.${offerI.id}&select=id,driver_id,status`, { token: goodToken })
      expect(status === 200, `isolation read must not error, got ${status}`)
      expect(Array.isArray(json) && json.length === 0, 'another driver must not see the offer')
      const shipRead = await rest('GET', `/shipments?id=eq.${shipI.id}&select=id,origin`, { token: goodToken })
      expect(status === 200 && Array.isArray(shipRead.json) && shipRead.json.length === 0, 'another driver must not read the assigned shipment')
      record('15. offer + assigned shipment invisible to other drivers', true)
    }

    // ---- cleanup ------------------------------------------------------------
  } finally {
    await serviceDelete('job_offers', `id=in.(${offers.map((o) => o.id).join(',') || '00000000-0000-0000-0000-000000000000'})`)
    await serviceDelete('shipments', `id=in.(${shipments.map((s) => s.id).join(',') || '00000000-0000-0000-0000-000000000000'})`)
    await serviceDelete('drivers', `id=in.(${[goodDriverRow.id, evilDriverRow.id, busyDriverRow.id].join(',')})`)
    await adminDeleteUser(driverGood.id)
    await adminDeleteUser(driverEvil.id)
    await adminDeleteUser(driverBusy.id)
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} cases passed against local RLS (${SUPABASE_URL})`)
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error('FAIL (harness error):', error && error.message ? error.message : error)
  process.exit(1)
})
