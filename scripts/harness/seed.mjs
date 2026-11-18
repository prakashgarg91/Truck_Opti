/**
 * Journey seed for the local browser harness (task H4). Deterministic and idempotent.
 *
 * seedJourney(pg) inserts, as superuser, everything the browser journey starts from:
 *   - 7 people (auth.users + public.users): admin, agency owner, dispatcher, finance, viewer,
 *     driver, and the owner of a second, unrelated agency (tenant isolation checks);
 *   - 2 approved agencies, 1 active staff membership (the dispatcher) on the first one;
 *     finance and viewer exist as auth users but are NOT members (the journey invites them), 1 approved driver employed by it;
 *   - platform_billing_settings: fake legal name, valid GSTIN and state code, enforcement on;
 *   - 1 client agreement with a pickup and a drop site, 1 tariff lane Pune -> Mumbai;
 *   - 2 trucks (payload 9000 kg and 16000 kg).
 * It does NOT create subscriptions, plans, orders, invoices or payments: the journey does. Platform plans
 * come from the migrations and are not touched. The first agency has no subscription row at the start.
 *
 * Every row has a fixed UUID and every insert is ON CONFLICT DO NOTHING, so a second run is a no-op.
 * All values are fake: test PAN/GSTIN formats, 10-digit phones, a password that only exists in the local harness.
 *
 * pg: anything with .query(sql, params), e.g. the `admin` of startServer() in scripts/race/_realPg.mjs.
 * Returns { users:{admin,owner,dispatcher,finance,viewer,driver,otherOwner each {id,email,password}},
 *           agencyId, otherAgencyId, agreementId, siteIds:[pickup, drop], truckIds:[t9000, t16000], driverId }
 */

export const JOURNEY_PASSWORD = 'Journey#123'

/** Fixed UUIDs. Hex only, so every value is a valid uuid. */
const fixed = (n) => `7a000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const SEED_IDS = {
  users: { admin: fixed(1), owner: fixed(2), dispatcher: fixed(3), finance: fixed(4), viewer: fixed(5), driver: fixed(6), otherOwner: fixed(7) },
  agency: fixed(101),
  otherAgency: fixed(102),
  agreement: fixed(201),
  pickupSite: fixed(301),
  dropSite: fixed(302),
  tariff: fixed(401),
  truck9t: fixed(501),
  truck16t: fixed(502),
  driver: fixed(601),
  employment: fixed(602),
  membership: { dispatcher: fixed(701), finance: fixed(702), viewer: fixed(703) },
}

const PEOPLE = [
  { key: 'admin', email: 'admin@journey.test', name: 'Journey Admin', role: 'admin' },
  { key: 'owner', email: 'owner@journey.test', name: 'Journey Owner', role: 'user' },
  { key: 'dispatcher', email: 'dispatcher@journey.test', name: 'Journey Dispatcher', role: 'user' },
  { key: 'finance', email: 'finance@journey.test', name: 'Journey Finance', role: 'user' },
  { key: 'viewer', email: 'viewer@journey.test', name: 'Journey Viewer', role: 'user' },
  { key: 'driver', email: 'driver@journey.test', name: 'Journey Driver', role: 'driver' },
  { key: 'otherOwner', email: 'other-owner@journey.test', name: 'Other Owner', role: 'user' },
]

export async function seedJourney(pg) {
  const run = (sql, params = []) => pg.query(sql, params)

  // people
  for (const p of PEOPLE) {
    const id = SEED_IDS.users[p.key]
    await run(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{}'::jsonb) ON CONFLICT DO NOTHING`, [id, p.email])
    await run(`INSERT INTO public.users (id, email, name, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [id, p.email, p.name, p.role])
  }

  // platform billing: the singleton row exists from the migrations; quotes need legal name, GSTIN and state code
  const billing = await run(
    `UPDATE public.platform_billing_settings
        SET legal_name = $1, gstin = $2, address = 'Mumbai, Maharashtra', state_code = '27', sac_code = '997331', enforcement_enabled = true`,
    ['Truck Opti Test Pvt Ltd', '27JRNYX0000A1Z9']
  )
  if (billing.rowCount !== 1) throw new Error(`platform_billing_settings: expected 1 singleton row, updated ${billing.rowCount}`)

  // agencies
  await run(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, state, status, gstin, pan_number, contact_phone)
     VALUES ($1, $2, 'Journey Transport Pvt Ltd', 'Mumbai', 'Maharashtra', 'approved', '27JRNYA1111B1Z5', 'JRNYA1111R', '9810000001')
     ON CONFLICT DO NOTHING`,
    [SEED_IDS.agency, SEED_IDS.users.owner]
  )
  await run(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, state, status, gstin, pan_number, contact_phone)
     VALUES ($1, $2, 'Other Transport Pvt Ltd', 'Bengaluru', 'Karnataka', 'approved', '29JRNYB2222C1Z7', 'JRNYB2222R', '9810000002')
     ON CONFLICT DO NOTHING`,
    [SEED_IDS.otherAgency, SEED_IDS.users.otherOwner]
  )

  // staff of the first agency (the owner is not a membership row: the owner is transport_agencies.user_id).
  // Exactly one seat is used at the start (the trial plan allows 2); finance and viewer join through invitations.
  for (const scope of ['dispatcher']) {
    await run(
      `INSERT INTO public.agency_memberships (id, agency_id, user_id, scope, status, revoked_at)
       VALUES ($1, $2, $3, $4, 'active', NULL) ON CONFLICT DO NOTHING`,
      [SEED_IDS.membership[scope], SEED_IDS.agency, SEED_IDS.users[scope], scope]
    )
  }

  // client agreement, two sites and one tariff lane
  await run(
    `INSERT INTO public.agency_client_agreements (id, agency_id, client_name, status, idempotency_key)
     VALUES ($1, $2, 'Journey Client Pvt Ltd', 'active', 'journey-seed-agreement') ON CONFLICT DO NOTHING`,
    [SEED_IDS.agreement, SEED_IDS.agency]
  )
  // site_kind only allows bill_to / ship_to: the drop site carries the one active bill_to the agreement needs
  await run(
    `INSERT INTO public.agency_client_sites (id, agency_id, agreement_id, site_kind, label, address_line, city, state, pincode, status, idempotency_key)
     VALUES ($1, $2, $3, 'ship_to', 'Pickup Plant Pune', '1 Test Road', 'Pune', 'Maharashtra', '411001', 'active', 'journey-seed-site-pickup')
     ON CONFLICT DO NOTHING`,
    [SEED_IDS.pickupSite, SEED_IDS.agency, SEED_IDS.agreement]
  )
  await run(
    `INSERT INTO public.agency_client_sites (id, agency_id, agreement_id, site_kind, label, address_line, city, state, pincode, status, idempotency_key)
     VALUES ($1, $2, $3, 'bill_to', 'Drop Depot Mumbai', '2 Test Road', 'Mumbai', 'Maharashtra', '400001', 'active', 'journey-seed-site-drop')
     ON CONFLICT DO NOTHING`,
    [SEED_IDS.dropSite, SEED_IDS.agency, SEED_IDS.agreement]
  )
  await run(
    `INSERT INTO public.agency_tariff_versions
       (id, agency_id, agreement_id, origin_label, origin_key, destination_label, destination_key, vehicle_type, vehicle_key,
        rate_basis, rate_amount, currency, effective_from, version_no, idempotency_key)
     VALUES ($1, $2, $3, 'Pune', 'pune', 'Mumbai', 'mumbai', NULL, '*', 'per_trip', 15000.00, 'INR', '2026-01-01', 1, 'journey-seed-tariff-pune-mumbai')
     ON CONFLICT DO NOTHING`,
    [SEED_IDS.tariff, SEED_IDS.agency, SEED_IDS.agreement]
  )

  // trucks
  await run(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number, payload_kg, is_available)
     VALUES ($1, $2, 'eicher_14ft', 'MH04JRNY0901', 9000, true) ON CONFLICT DO NOTHING`,
    [SEED_IDS.truck9t, SEED_IDS.agency]
  )
  await run(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number, payload_kg, is_available)
     VALUES ($1, $2, 'eicher_14ft', 'MH04JRNY1600', 16000, true) ON CONFLICT DO NOTHING`,
    [SEED_IDS.truck16t, SEED_IDS.agency]
  )

  // driver: approved (assignable), linked to the driver login, employed by the first agency
  await run(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, pan_number, aadhaar_last4, license_number)
     VALUES ($1, $2, 'Journey Driver', '9820000001', 'tata_407', 'approved', 'JRNYD1001Q', '4321', 'MH0120200000001')
     ON CONFLICT DO NOTHING`,
    [SEED_IDS.driver, SEED_IDS.users.driver]
  )
  await run(
    `INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, status, licence_number, licence_class, contact_phone)
     VALUES ($1, $2, $3, 'active', 'MH0120200000001', 'LMV', '9820000001') ON CONFLICT DO NOTHING`,
    [SEED_IDS.employment, SEED_IDS.agency, SEED_IDS.driver]
  )

  const users = {}
  for (const p of PEOPLE) users[p.key] = { id: SEED_IDS.users[p.key], email: p.email, password: JOURNEY_PASSWORD }
  return {
    users,
    agencyId: SEED_IDS.agency,
    otherAgencyId: SEED_IDS.otherAgency,
    agreementId: SEED_IDS.agreement,
    siteIds: [SEED_IDS.pickupSite, SEED_IDS.dropSite],
    truckIds: [SEED_IDS.truck9t, SEED_IDS.truck16t],
    driverId: SEED_IDS.driver,
  }
}
