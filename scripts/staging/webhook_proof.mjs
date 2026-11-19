#!/usr/bin/env node
/**
 * Webhook-path proof against the hosted STAGING Supabase project (ref ydkhgclfjdksicpwqzmw), Razorpay TEST mode only.
 *   node scripts/staging/webhook_proof.mjs
 * Reads .env.proof, .env.staging, .env.staging.users. Delivers correctly signed (and deliberately bad) events to the
 * deployed razorpay-webhook function. State is read only as the signed-in smoke owners (RPCs). No service-role key.
 * Prints and writes NO secret; payment/order ids are redacted to the last 4 characters.
 * Output: one line per check, evidence/staging/webhook-proof-<date>.json, exit 1 on any FAIL.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REF = 'ydkhgclfjdksicpwqzmw'

function parseEnv(file) {
  const out = {}
  for (const raw of readFileSync(resolve(REPO, file), 'utf8').split(/\r?\n/)) {
    const l = raw.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i > 0) out[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}
const red = (id) => (id ? `...${String(id).slice(-4)}` : '(none)')
const proof = parseEnv('.env.proof')
const stg = parseEnv('.env.staging')
const users = parseEnv('.env.staging.users')
const keyId = proof.RAZORPAY_KEY_ID ?? ''
if (!keyId.startsWith('rzp_test_')) { console.error('ABORT: RAZORPAY_KEY_ID must start with rzp_test_'); process.exit(3) }
const keySecret = proof.RAZORPAY_KEY_SECRET
const whSecret = proof.RAZORPAY_WEBHOOK_SECRET
const base = (stg.STAGING_SUPABASE_URL ?? '').replace(/\/+$/, '')
if (new URL(base).hostname !== `${REF}.supabase.co`) { console.error('ABORT: not the staging project'); process.exit(3) }
const anon = stg.STAGING_SUPABASE_ANON_KEY
const secrets = [keySecret, whSecret, anon, users.SMOKE_OWNER_PASSWORD, users.SMOKE_OWNER2_PASSWORD].filter((s) => s && s.length >= 6)
const scrub = (t) => secrets.reduce((s, x) => s.split(x).join('***'), String(t))

const runId = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`
const results = []
let failed = 0
function record(id, ok, desc, detail, extra = {}) {
  results.push({ id, status: ok ? 'PASS' : 'FAIL', description: desc, detail: scrub(detail), ...extra })
  if (!ok) failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}  ${desc}  (${scrub(detail)})`)
}
const sign = (raw, secret = whSecret) => createHmac('sha256', secret).update(raw).digest('hex')

async function http(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, text, json }
}

async function signIn(email, password) {
  const r = await http(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon }, body: JSON.stringify({ email, password }),
  })
  if (!r.json?.access_token) throw new Error(`sign-in failed (${r.status})`)
  return r.json.access_token
}
const rpc = (token, name, args = {}) => http(`${base}/rest/v1/rpc/${name}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` }, body: JSON.stringify(args),
})
async function snapshot(token) {
  const ent = (await rpc(token, 'agency_subscription_entitlement')).json ?? {}
  const inv = (await rpc(token, 'agency_subscription_invoices')).json?.invoices ?? []
  return {
    agencyId: ent.agency_id, status: ent.status, periodEnd: ent.period_end, planTier: ent.plan_tier, canWrite: ent.can_write,
    issuedAt: inv[0]?.issued_at,
    invoices: inv.map((i) => ({
      number: i.invoice_number, total: i.total_paise, taxable: i.taxable_paise, cgst: i.cgst_paise, sgst: i.sgst_paise, igst: i.igst_paise,
      credit_notes: (i.credit_notes ?? []).map((c) => ({ number: c.credit_note_number, total: c.total_paise, keys: Object.keys(c) })),
    })),
  }
}

let evtN = 0
async function webhook(payload, { eventId, signature, omitSignature } = {}) {
  const raw = JSON.stringify(payload)
  const id = eventId ?? `evt_wp_${runId}_${++evtN}`
  const headers = { 'Content-Type': 'application/json', 'x-razorpay-event-id': id }
  if (!omitSignature) headers['x-razorpay-signature'] = signature ?? sign(raw)
  const r = await http(`${base}/functions/v1/razorpay-webhook`, { method: 'POST', headers, body: raw })
  return { ...r, eventId: id }
}
const now = () => Math.floor(Date.now() / 1000)
const capturedBody = (pay, order, amount, method = 'netbanking') => ({
  entity: 'event', account_id: 'acc_webhookproof', event: 'payment.captured', contains: ['payment'],
  payload: { payment: { entity: { id: pay, entity: 'payment', amount, currency: 'INR', status: 'captured', order_id: order, method } } },
  created_at: now(),
})
const brief = (r) => `${r.status} ${scrub(r.text).slice(0, 120)}`
const guard5xx = (id, r) => { if (r.status >= 500) record(`${id}-5xx`, false, '5xx from the function', `${r.status} ${scrub(r.text).slice(0, 300)}`) }

async function main() {
  console.log(`webhook proof run ${runId}  target ${new URL(base).host}  razorpay key TEST ...${keyId.slice(-4)}`)

  // Step 0: real payments
  const pr = await http('https://api.razorpay.com/v1/payments?count=10', { headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` } })
  const captured = (pr.json?.items ?? []).filter((p) => p.status === 'captured' && p.amount === 199900 && p.currency === 'INR').sort((a, b) => a.created_at - b.created_at)
  record('0', pr.status === 200 && captured.length >= 2, 'fetched >=2 captured 199900 INR TEST payments',
    `${pr.status}; ` + captured.map((p) => `pay ${red(p.id)} order ${red(p.order_id)} ${p.method} ${p.status}`).join(' | '))
  if (captured.length < 2) return
  const t1 = await signIn(users.SMOKE_OWNER_EMAIL, users.SMOKE_OWNER_PASSWORD)
  const t2 = await signIn(users.SMOKE_OWNER2_EMAIL, users.SMOKE_OWNER2_PASSWORD)
  const s1 = await snapshot(t1)
  const s2 = await snapshot(t2)
  // Neither RPC exposes a payment/order reference, so match by time: invoice issue time follows payment time.
  const [pA, pB] = captured.slice(-2) // older, newer
  const owner1IsOlder = new Date(s1.issuedAt) < new Date(s2.issuedAt)
  const P1 = owner1IsOlder ? pA : pB
  const P2 = owner1IsOlder ? pB : pA
  console.log(`note: RPCs expose no payment reference; matched by time (invoice issued_at vs payment created_at): owner1=${red(P1.id)} owner2=${red(P2.id)}`)
  record('0b', !!s1.agencyId && !!s2.agencyId && s1.status === 'active' && s2.status === 'active' && s1.invoices.length === 1 && s2.invoices.length === 1,
    'both owners active with exactly 1 invoice before the run', `owner1 ${s1.status}/${s1.invoices[0]?.number}, owner2 ${s2.status}/${s2.invoices[0]?.number}`, { owner1_before: s1, owner2_before: s2 })

  // 1 bad signature
  const good1 = capturedBody(P1.id, P1.order_id, P1.amount, P1.method)
  const bad = await webhook(good1, { signature: sign(JSON.stringify(good1), `${whSecret}x`) })
  record('1', bad.status === 400 && bad.json?.error === 'invalid_signature', 'wrong signature rejected', brief(bad))
  // 2 missing signature
  const miss = await webhook(good1, { omitSignature: true })
  record('2', miss.status === 400, 'missing signature header rejected', brief(miss))

  // 3 replay
  const evReplay = `evt_wp_${runId}_replay`
  const w1 = await webhook(good1, { eventId: evReplay })
  const w2 = await webhook(good1, { eventId: evReplay })
  guard5xx('3a', w1); guard5xx('3b', w2)
  record('3a', w1.status === 200 && w1.json?.result === 'replay', 'signed payment.captured for already-activated payment -> replay', brief(w1))
  record('3b', w2.status === 200 && w2.json?.result === 'duplicate', 'identical body + event id again -> duplicate', brief(w2))
  let a1 = await snapshot(t1)
  record('3c', a1.invoices.length === 1 && a1.periodEnd === s1.periodEnd && a1.status === 'active', 'owner1 still 1 invoice, same period end, active',
    `${a1.invoices.length} invoice(s), period end ${a1.periodEnd === s1.periodEnd ? 'unchanged' : 'CHANGED'}, ${a1.status}`)

  // 4 wrong amount, new payment id
  const fakePay = `pay_wp${runId}`.replace(/[^A-Za-z0-9_]/g, '').slice(0, 24)
  const w4 = await webhook(capturedBody(fakePay, P1.order_id, 100))
  guard5xx('4', w4)
  a1 = await snapshot(t1)
  record('4', w4.status === 200 && w4.json?.result === 'failed_recorded' && a1.invoices.length === 1 && a1.periodEnd === s1.periodEnd && a1.status === 'active',
    'wrong amount (100 paise, new payment id) -> failed_recorded, owner1 unchanged',
    `${brief(w4)}; invoices ${a1.invoices.length}, period end ${a1.periodEnd === s1.periodEnd ? 'unchanged' : 'CHANGED'}`)

  // 5 unknown order
  const w5 = await webhook(capturedBody(`pay_wpx${runId}`.slice(0, 24), `order_WP${runId}Unknown`.slice(0, 30), 199900))
  guard5xx('5', w5)
  const a1b = await snapshot(t1), a2b = await snapshot(t2)
  record('5', w5.status === 200 && w5.json?.result === 'orphan' && a1b.invoices.length === 1 && a2b.invoices.length === 1 && a2b.periodEnd === s2.periodEnd,
    'unknown order -> acknowledged (orphan), nothing changed', `${brief(w5)}; invoices ${a1b.invoices.length}/${a2b.invoices.length}`)

  // 6 refund owner 2 (never owner 1)
  const refundId = `rfnd_wp${runId}`.slice(0, 24)
  const refundBody = {
    entity: 'event', account_id: 'acc_webhookproof', event: 'refund.processed', contains: ['refund', 'payment'],
    payload: {
      refund: { entity: { id: refundId, entity: 'refund', payment_id: P2.id, amount: P2.amount, currency: 'INR', status: 'processed' } },
      payment: { entity: { id: P2.id, entity: 'payment', amount: P2.amount, currency: 'INR', status: 'refunded', order_id: P2.order_id } },
    },
    created_at: now(),
  }
  const evRef = `evt_wp_${runId}_refund`
  const r1 = await webhook(refundBody, { eventId: evRef })
  guard5xx('6a', r1)
  record('6a', r1.status === 200 && r1.json?.result === 'refunded', 'signed refund.processed (full amount) for owner2 payment -> refunded', brief(r1))
  const after2 = await snapshot(t2)
  const cns = after2.invoices.flatMap((i) => i.credit_notes)
  record('6b', !['active', 'trial', 'grace', 'past_due'].includes(after2.status), 'owner2 subscription no longer active', `status ${after2.status}, can_write ${after2.canWrite}`, { owner2_after_refund: after2 })
  record('6c', cns.length === 1 && /^CN\/\d{2}-\d{2}\/\d{6}$/.test(cns[0].number) && cns[0].total === P2.amount,
    'owner2 invoices RPC shows 1 credit note CN/yy-yy/nnnnnn, total = refund', `credit notes: ${cns.map((c) => `${c.number} ${c.total}`).join(', ') || 'none'}`)
  const r2 = await webhook(refundBody, { eventId: evRef })
  guard5xx('6d', r2)
  const after2b = await snapshot(t2)
  const cns2 = after2b.invoices.flatMap((i) => i.credit_notes)
  record('6d', r2.status === 200 && r2.json?.result === 'duplicate' && cns2.length === 1, 'identical refund event again -> duplicate, still 1 credit note', `${brief(r2)}; credit notes ${cns2.length}`)
  const a1f = await snapshot(t1)
  record('6e', a1f.status === 'active' && a1f.invoices.length === 1 && a1f.invoices[0].credit_notes.length === 0 && a1f.periodEnd === s1.periodEnd,
    'owner1 untouched by the whole run (active, 1 invoice, no credit note)', `${a1f.status}, ${a1f.invoices.length} invoice(s)`, { owner1_after: a1f })

  console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAIL`} (${results.length} checks)`)
}

let crashed = null
try { await main() } catch (e) { crashed = e instanceof Error ? e.message : 'unknown'; failed += 1; console.log(`FAIL crash  ${scrub(crashed)}`) }

const date = new Date().toISOString().slice(0, 10)
const out = resolve(REPO, 'evidence', 'staging', `webhook-proof-${date}.json`)
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, scrub(JSON.stringify({
  run_id: runId, finished_at: new Date().toISOString(), mode: 'razorpay_test', supabase_ref: REF,
  razorpay_key: `rzp_test_...${keyId.slice(-4)}`, failed, crashed, results,
}, null, 2)))
console.log(`evidence: ${out}`)
process.exit(failed ? 1 : 0)
