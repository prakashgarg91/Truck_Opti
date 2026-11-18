// Scope and approval matrix for the six agency-portal Edge functions.
// Expectations mirror supabase/functions/_shared/portalScopes.ts (PORTAL_READ_SCOPES, resolvePortalAccess,
// canWriteThroughPortal) and the write guards in portal-auth.ts / rates/index.ts.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction } from './run.mjs'

const ENV = {
  SUPABASE_URL: 'http://db.test',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
}
const AGENCY = 'A'
const ALL_SCOPES = ['dispatcher', 'fleet_manager', 'finance', 'viewer']

const MSG = {
  scopeDenied: 'Your access scope does not allow this action.',
  agencyRequired: 'Agency access is required.',
  approvalRequired: 'Agency approval is required.',
  multipleAgencies: 'Multiple agency profiles found for this account.',
  ownerOnlyWrite: 'Only the agency owner can make changes here.',
}

// Read body and the scopes the portalScopes.ts PORTAL_READ_SCOPES table allows for each function.
const FUNCTIONS = {
  dashboard: { body: { action: 'snapshot' }, readScopes: ['dispatcher', 'fleet_manager', 'finance', 'viewer'] },
  jobs: { body: { action: 'list' }, readScopes: ['dispatcher', 'fleet_manager', 'finance', 'viewer'] },
  drivers: { body: { action: 'snapshot' }, readScopes: ['dispatcher', 'fleet_manager', 'finance'] },
  fleet: { body: { action: 'list' }, readScopes: ['fleet_manager', 'dispatcher'] },
  rates: { body: { action: 'list' }, readScopes: ['finance', 'dispatcher'] },
  billing: { body: { action: 'list' }, readScopes: ['finance'] },
}

const handles = {}
for (const name of Object.keys(FUNCTIONS)) {
  handles[name] = await loadFunction(`agency-portal-${name}`)
}

/**
 * Seeds the fake Supabase client for one caller.
 * owned: transport_agencies rows the caller owns ({id, status}).
 * memberships: ACTIVE agency_memberships rows ({agency_id, scope}).
 * statuses: status rows for member agencies (defaults to 'approved' for every membership agency).
 */
function seed(name, { user = 'user-1', owned = [], memberships = [], statuses } = {}) {
  const h = handles[name]
  h.reset({ env: ENV, fetch: null })
  const statusRows = statuses ?? memberships.map((m) => ({ id: m.agency_id, status: 'approved' }))
  h.fake
    .onGetUser(() => ({ data: { user: { id: user } }, error: null }))
    .onFrom('transport_agencies', (rec) => {
      if (rec.ops.some((op) => op[0] === 'in')) {
        const ids = rec.ops.find((op) => op[0] === 'in')[2]
        return { data: statusRows.filter((row) => ids.includes(row.id)), error: null }
      }
      if (rec.ops.some((op) => op[0] === 'eq' && op[1] === 'user_id')) {
        return { data: owned, error: null }
      }
      return { data: { id: AGENCY, company_name: 'Test Agency', status: 'approved' }, error: null }
    })
    .onFrom('agency_memberships', () => ({ data: memberships, error: null }))
    .onFrom('agency_jobs', () => ({ data: [], count: 0, error: null }))
    .onFrom('agency_trucks', () => ({ data: [], count: 0, error: null }))
    .onFrom('agency_rate_cards', (rec) => {
      if (rec.ops.some((op) => op[0] === 'insert')) return { data: { id: 'R1' }, error: null }
      if (rec.ops.some((op) => op[0] === 'maybeSingle')) return { data: { id: 'R1', agency_id: AGENCY }, error: null }
      return { data: [], error: null }
    })
}

function call(name, body, { token = 'tok', method = 'POST' } = {}) {
  return handles[name].call(`http://edge.test/agency-portal-${name}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  })
}

const writes = (name) => handles[name].fake.calls.filter((c) => c.kind === 'from' && c.ops.some((op) => ['insert', 'update', 'delete', 'upsert'].includes(op[0])))

async function errorOf(res) {
  return (await res.json()).error
}

describe('read scopes per portal function (portalScopes.ts PORTAL_READ_SCOPES)', () => {
  for (const [name, spec] of Object.entries(FUNCTIONS)) {
    test(`${name}: owner is allowed and queries are pinned to the owned agency`, async () => {
      seed(name, { owned: [{ id: AGENCY, status: 'approved' }] })
      const res = await call(name, spec.body)
      assert.equal(res.status, 200, `owner status for ${name}`)
      const agencyScoped = handles[name].fake.calls.filter((c) => c.kind === 'from' && c.table !== 'transport_agencies' && c.table !== 'agency_memberships')
      assert.ok(agencyScoped.length > 0, 'expected at least one agency-scoped query')
      for (const c of agencyScoped) {
        assert.ok(c.ops.some((op) => op[0] === 'eq' && op[1] === 'agency_id' && op[2] === AGENCY) || c.table === 'transport_agencies' || c.ops.some((op) => op[0] === 'eq' && op[1] === 'id' && op[2] === AGENCY), `unscoped query on ${c.table}`)
      }
    })

    test(`${name}: each staff scope is allowed or refused exactly as portalScopes.ts says`, async () => {
      for (const scope of ALL_SCOPES) {
        seed(name, { memberships: [{ agency_id: AGENCY, scope }] })
        const res = await call(name, spec.body)
        if (spec.readScopes.includes(scope)) {
          assert.equal(res.status, 200, `${scope} should read ${name}`)
        } else {
          assert.equal(res.status, 403, `${scope} should be refused ${name}`)
          assert.equal(await errorOf(res), MSG.scopeDenied)
        }
      }
    })

    test(`${name}: a user with no agency is refused (agencyRequired)`, async () => {
      seed(name)
      const res = await call(name, spec.body)
      assert.equal(res.status, 403)
      assert.equal(await errorOf(res), MSG.agencyRequired)
    })

    test(`${name}: staff of an unapproved agency is refused (approvalRequired) for every scope`, async () => {
      for (const status of ['pending', 'suspended', null]) {
        for (const scope of ALL_SCOPES) {
          seed(name, { memberships: [{ agency_id: AGENCY, scope }], statuses: [{ id: AGENCY, status }] })
          const res = await call(name, spec.body)
          assert.equal(res.status, 403, `${scope} at ${status}`)
          assert.equal(await errorOf(res), MSG.approvalRequired)
        }
      }
    })

    test(`${name}: an unknown staff scope grants nothing (scopeDenied)`, async () => {
      seed(name, { memberships: [{ agency_id: AGENCY, scope: 'admin' }] })
      const res = await call(name, spec.body)
      assert.equal(res.status, 403)
      assert.equal(await errorOf(res), MSG.scopeDenied)
    })

    test(`${name}: owner of a pending agency can still read (requireApproved is false for reads)`, async () => {
      seed(name, { owned: [{ id: AGENCY, status: 'pending' }] })
      const res = await call(name, spec.body)
      assert.equal(res.status, 200)
    })

    test(`${name}: owner plus an active staff membership at another agency is refused (409)`, async () => {
      seed(name, {
        owned: [{ id: AGENCY, status: 'approved' }],
        // A membership only counts when its scope may read this function (portalScopes.ts drops the rest).
        memberships: [{ agency_id: 'B', scope: spec.readScopes[0] }],
        statuses: [{ id: 'B', status: 'approved' }],
      })
      const res = await call(name, spec.body)
      assert.equal(res.status, 409)
      assert.equal(await errorOf(res), MSG.multipleAgencies)
    })
  }
})

describe('write actions require the owner', () => {
  test('rates: dispatcher (allowed to read) is refused add-rate and writes nothing', async () => {
    seed('rates', { memberships: [{ agency_id: AGENCY, scope: 'dispatcher' }] })
    const res = await call('rates', { action: 'add-rate', vehicle_type: 'truck', origin_city: 'Pune', dest_city: 'Delhi' })
    assert.equal(res.status, 403)
    assert.equal(await errorOf(res), MSG.ownerOnlyWrite)
    assert.equal(writes('rates').length, 0)
  })

  test('rates: finance is refused update-rate and delete-rate and writes nothing', async () => {
    seed('rates', { memberships: [{ agency_id: AGENCY, scope: 'finance' }] })
    const upd = await call('rates', { action: 'update-rate', rateId: 'R1', data: { notes: 'x' } })
    const del = await call('rates', { action: 'delete-rate', rateId: 'R1' })
    for (const res of [upd, del]) {
      assert.equal(res.status, 403)
      assert.equal(await errorOf(res), MSG.ownerOnlyWrite)
    }
    assert.equal(writes('rates').length, 0)
  })

  test('rates: the owner can add a rate (control case)', async () => {
    seed('rates', { owned: [{ id: AGENCY, status: 'approved' }] })
    const res = await call('rates', { action: 'add-rate', vehicle_type: 'truck', origin_city: 'Pune', dest_city: 'Delhi' })
    assert.equal(res.status, 200)
    assert.equal(writes('rates').length, 1)
  })

  test('rates: owner of a pending agency is refused writes (approvalRequired) and writes nothing', async () => {
    seed('rates', { owned: [{ id: AGENCY, status: 'pending' }] })
    const res = await call('rates', { action: 'add-rate', vehicle_type: 'truck', origin_city: 'Pune', dest_city: 'Delhi' })
    assert.equal(res.status, 403)
    assert.equal(await errorOf(res), MSG.approvalRequired)
    assert.equal(writes('rates').length, 0)
  })

  test('fleet: has no write actions; staff and owner POST of any other action is refused with no writes', async () => {
    for (const membership of [
      { owned: [{ id: AGENCY, status: 'approved' }] },
      { memberships: [{ agency_id: AGENCY, scope: 'fleet_manager' }] },
    ]) {
      seed('fleet', membership)
      const res = await call('fleet', { action: 'create', vehicle_type: 'truck', rc_number: 'MH01' })
      assert.equal(res.status, 400)
      assert.equal(await errorOf(res), 'Unsupported action.')
      assert.equal(writes('fleet').length, 0)
    }
  })

  test('fleet: viewer and finance cannot even read (scopeDenied), so cannot write', async () => {
    for (const scope of ['viewer', 'finance']) {
      seed('fleet', { memberships: [{ agency_id: AGENCY, scope }] })
      const res = await call('fleet', { action: 'create' })
      assert.equal(res.status, 403)
      assert.equal(await errorOf(res), MSG.scopeDenied)
    }
  })
})

describe('removed actions answer 410 where the function says so', () => {
  test('jobs: status change and assignment moved to DB commands, so they answer 410 (owner)', async () => {
    for (const action of ['update-status', 'assign-driver']) {
      seed('jobs', { owned: [{ id: AGENCY, status: 'approved' }] })
      const res = await call('jobs', { action, jobId: 'J1' })
      assert.equal(res.status, 410, action)
      assert.equal(writes('jobs').length, 0)
    }
  })

  test('drivers: removed actions answer 410 (owner)', async () => {
    seed('drivers', { owned: [{ id: AGENCY, status: 'approved' }] })
    const res = await call('drivers', { action: 'assign', driverId: 'D1', truckId: 'T1' })
    assert.equal(res.status, 410)
    assert.equal(writes('drivers').length, 0)
  })

  test('drivers: removed action answers 410 even for a staff member with read scope', async () => {
    seed('drivers', { memberships: [{ agency_id: AGENCY, scope: 'dispatcher' }] })
    const res = await call('drivers', { action: 'assign', driverId: 'D1', truckId: 'T1' })
    assert.equal(res.status, 410)
  })
})

describe('unauthenticated and malformed requests', () => {
  test('no Authorization header is 401 for every function and nothing is queried', async () => {
    for (const name of Object.keys(FUNCTIONS)) {
      seed(name, { owned: [{ id: AGENCY, status: 'approved' }] })
      const res = await handles[name].call(`http://edge.test/agency-portal-${name}`, {
        method: 'POST',
        body: JSON.stringify(FUNCTIONS[name].body),
        headers: { 'content-type': 'application/json' },
      })
      assert.equal(res.status, 401, name)
      assert.equal(handles[name].fake.calls.length, 0, name)
    }
  })

  test('an invalid token (getUser error) is 401', async () => {
    seed('billing', { owned: [{ id: AGENCY, status: 'approved' }] })
    handles.billing.fake.onGetUser(() => ({ data: { user: null }, error: { message: 'bad jwt' } }))
    const res = await call('billing', { action: 'list' })
    assert.equal(res.status, 401)
  })
})
