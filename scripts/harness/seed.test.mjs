// node:test battery for scripts/harness/seed.mjs on the embedded PostgreSQL 18.
// Run: RACE_MODULES=D:/tmp/pgrace node scripts/harness/seed.test.mjs
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { after, before, describe, test } from 'node:test'
import { startServer } from '../race/_realPg.mjs'
import { registerRest } from './rest.mjs'
import { seedJourney, SEED_IDS } from './seed.mjs'
import { startHarnessServer } from './server.mjs'

const MODULES = process.env.RACE_MODULES ?? 'D:/tmp/pgrace'
const ANON = 'dummy-anon-key'

let pgs
let h
let first
let second
let snapshotBefore

const post = (path, body, headers = {}) =>
  fetch(h.url + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON, ...headers },
    body: JSON.stringify(body ?? {}),
  })
const login = (u) => post('/auth/v1/token?grant_type=password', { email: u.email, password: u.password })
const tokenOf = async (u) => {
  const r = await login(u)
  assert.equal(r.status, 200, `login ${u.email}: ${r.status}`)
  return (await r.json()).access_token
}
const rpc = async (fn, token, body = {}) => {
  const r = await post(`/rest/v1/rpc/${fn}`, body, token ? { authorization: `Bearer ${token}` } : {})
  assert.equal(r.status, 200, `${fn}: ${r.status} ${await r.clone().text()}`)
  return r.json()
}
const count = async (sql, params = []) => Number((await pgs.admin.query(sql, params)).rows[0].n)

async function snapshot() {
  return {
    authUsers: await count(`SELECT count(*)::int AS n FROM auth.users WHERE email LIKE '%@journey.test'`),
    publicUsers: await count(`SELECT count(*)::int AS n FROM public.users WHERE email LIKE '%@journey.test'`),
    agencies: await count(`SELECT count(*)::int AS n FROM public.transport_agencies WHERE id IN ($1, $2)`, [SEED_IDS.agency, SEED_IDS.otherAgency]),
    memberships: await count(`SELECT count(*)::int AS n FROM public.agency_memberships WHERE agency_id = $1`, [SEED_IDS.agency]),
    agreements: await count(`SELECT count(*)::int AS n FROM public.agency_client_agreements WHERE agency_id = $1`, [SEED_IDS.agency]),
    sites: await count(`SELECT count(*)::int AS n FROM public.agency_client_sites WHERE agency_id = $1`, [SEED_IDS.agency]),
    tariffs: await count(`SELECT count(*)::int AS n FROM public.agency_tariff_versions WHERE agency_id = $1`, [SEED_IDS.agency]),
    trucks: await count(`SELECT count(*)::int AS n FROM public.agency_trucks WHERE agency_id = $1`, [SEED_IDS.agency]),
    drivers: await count(`SELECT count(*)::int AS n FROM public.drivers WHERE id = $1`, [SEED_IDS.driver]),
    employment: await count(`SELECT count(*)::int AS n FROM public.agency_driver_employment WHERE agency_id = $1 AND status = 'active'`, [SEED_IDS.agency]),
    subscriptions: await count(`SELECT count(*)::int AS n FROM public.subscriptions WHERE agency_id = $1`, [SEED_IDS.agency]),
    orders: await count(`SELECT count(*)::int AS n FROM public.agency_orders WHERE agency_id = $1`, [SEED_IDS.agency]),
    plans: await count(`SELECT count(*)::int AS n FROM public.subscription_plans`),
  }
}

before(async () => {
  pgs = await startServer('seed')
  first = await seedJourney(pgs.admin)
  snapshotBefore = await snapshot()
  second = await seedJourney(pgs.admin)
  h = await startHarnessServer({ pg: pgs, anonKey: ANON, users: Object.values(first.users) })
  registerRest(h)
})

after(async () => {
  await h?.close()
  await pgs?.stop()
  const left = readdirSync(MODULES).filter((n) => n.startsWith('data-seed-'))
  if (left.length) throw new Error(`temp data dirs left behind: ${left.join(', ')}`)
})

describe('seed contents and idempotency', () => {
  test('second run returns the same ids and changes no row count', async () => {
    assert.deepEqual(second, first)
    assert.deepEqual(await snapshot(), snapshotBefore)
  })

  test('expected counts: 7 people, 2 agencies, 1 membership (dispatcher only), 1 agreement, 2 sites, 1 tariff, 2 trucks, 1 driver', async () => {
    const s = await snapshot()
    assert.equal(s.authUsers, 7)
    assert.equal(s.publicUsers, 7)
    assert.equal(s.agencies, 2)
    assert.equal(s.memberships, 1)
    assert.equal(s.agreements, 1)
    assert.equal(s.sites, 2)
    assert.equal(s.tariffs, 1)
    assert.equal(s.trucks, 2)
    assert.equal(s.drivers, 1)
    assert.equal(s.employment, 1)
  })

  test('no subscription, order, invoice or payment is seeded; platform plans are untouched', async () => {
    const s = await snapshot()
    assert.equal(s.subscriptions, 0)
    assert.equal(s.orders, 0)
    assert.equal(await count(`SELECT count(*)::int AS n FROM public.subscription_invoices`), 0)
    assert.equal(await count(`SELECT count(*)::int AS n FROM public.payment_history`), 0)
    assert.ok(s.plans >= 1, 'migrations must have seeded plans')
  })

  test('platform billing is filled and valid; the admin role and driver role are set', async () => {
    const b = (await pgs.admin.query(`SELECT legal_name, gstin, state_code, enforcement_enabled FROM public.platform_billing_settings`)).rows
    assert.equal(b.length, 1)
    assert.equal(b[0].legal_name, 'Truck Opti Test Pvt Ltd')
    assert.equal(b[0].state_code, '27')
    assert.equal(b[0].gstin.slice(0, 2), b[0].state_code)
    const roles = (await pgs.admin.query(`SELECT email, role FROM public.users WHERE email LIKE '%@journey.test' ORDER BY email`)).rows
    const role = Object.fromEntries(roles.map((r) => [r.email, r.role]))
    assert.equal(role['admin@journey.test'], 'admin')
    assert.equal(role['driver@journey.test'], 'driver')
  })

  test('the ids returned match the rows (agency, owner, trucks, sites, driver)', async () => {
    assert.equal(first.agencyId, SEED_IDS.agency)
    const a = (await pgs.admin.query(`SELECT user_id, status FROM public.transport_agencies WHERE id = $1`, [first.agencyId])).rows[0]
    assert.equal(a.user_id, first.users.owner.id)
    assert.equal(a.status, 'approved')
    const trucks = (await pgs.admin.query(`SELECT payload_kg::int AS p FROM public.agency_trucks WHERE id = ANY($1) ORDER BY payload_kg`, [first.truckIds])).rows
    assert.deepEqual(trucks.map((t) => t.p), [9000, 16000])
    const sites = (await pgs.admin.query(`SELECT site_kind FROM public.agency_client_sites WHERE id = ANY($1) ORDER BY city`, [first.siteIds])).rows
    assert.equal(sites.length, 2)
  })
})

describe('logins through the harness', () => {
  test('every seeded user signs in and gets a token for its own id', async () => {
    for (const [key, u] of Object.entries(first.users)) {
      const r = await login(u)
      assert.equal(r.status, 200, `${key} login`)
      const s = await r.json()
      assert.equal(s.user.id, u.id, `${key} id`)
    }
  })

  test('a wrong password is refused', async () => {
    const r = await login({ ...first.users.owner, password: 'nope' })
    assert.equal(r.status, 400)
  })
})

describe('owner entitlement and tenant isolation', () => {
  test('before the trial the owner entitlement is status none and read-only', async () => {
    const e = await rpc('agency_subscription_entitlement', await tokenOf(first.users.owner))
    assert.equal(e.status, 'none')
    assert.equal(e.can_write, false)
  })

  test('the other agency owner sees none of this agency trucks; the owner sees both', async () => {
    const ownerRows = await (await fetch(h.url + `/rest/v1/agency_trucks?select=*&agency_id=eq.${first.agencyId}`, {
      headers: { apikey: ANON, authorization: `Bearer ${await tokenOf(first.users.owner)}` },
    })).json()
    assert.equal(ownerRows.length, 2, 'positive control: the owner must see its own two trucks')

    const r = await fetch(h.url + `/rest/v1/agency_trucks?select=*&agency_id=eq.${first.agencyId}`, {
      headers: { apikey: ANON, authorization: `Bearer ${await tokenOf(first.users.otherOwner)}` },
    })
    assert.equal(r.status, 200, await r.clone().text())
    assert.deepEqual(await r.json(), [])
  })
})

describe('trial start (last: it mutates the agency)', () => {
  test('agency_subscription_start_trial works for the owner and the entitlement becomes trial', async () => {
    const token = await tokenOf(first.users.owner)
    const trial = await rpc('agency_subscription_start_trial', token)
    assert.equal(trial.status, 'trial')
    assert.equal(trial.plan_tier, 'starter')
    assert.equal(trial.agency_id, first.agencyId)
    const e = await rpc('agency_subscription_entitlement', token)
    assert.equal(e.status, 'trial')
    assert.equal(e.can_write, true)
  })
})
