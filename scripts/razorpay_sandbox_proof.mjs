#!/usr/bin/env node
// TO-152 S8: Razorpay TEST-mode + hosted staging Supabase proof of the subscription money path.
//
//   node scripts/razorpay_sandbox_proof.mjs --dry-run   plan only: no keys needed, NO network, exit 0
//   node scripts/razorpay_sandbox_proof.mjs             live run (needs every env var listed below)
//
// Hard rules: a key id that does not start with rzp_test_ is refused (rzp_live_ is a hard stop);
// secrets are masked to their last 4 characters, never printed in full and never written to disk.
// The JSON report goes to proof-output/ (the script also drops a self-ignoring .gitignore there).

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createInterface } from 'node:readline'

export const REQUIRED_ENV = [
  ['RAZORPAY_KEY_ID', 'Razorpay TEST key id (must start with rzp_test_)', false],
  ['RAZORPAY_KEY_SECRET', 'Razorpay TEST key secret', true],
  ['RAZORPAY_WEBHOOK_SECRET', 'Webhook secret registered for the staging endpoint', true],
  ['SUPABASE_URL', 'Hosted STAGING Supabase project URL (https://<ref>.supabase.co)', false],
  ['SUPABASE_SERVICE_ROLE_KEY', 'Staging service-role key (read-only evidence queries)', true],
  ['SUPABASE_ANON_KEY', 'Staging anon key (sign-in and function calls)', true],
  ['PROOF_OWNER_EMAIL', 'Email of a test agency owner (approved agency, no subscription yet)', false],
  ['PROOF_OWNER_PASSWORD', 'Password of that test owner', true],
]
export const OPTIONAL_ENV = [
  ['PROOF_PAYMENT_ID', 'Manual fallback: pay_... id of a TEST payment made in Razorpay Checkout for the printed order'],
]

export const STEPS = [
  ['1', 'Sign in as the test agency owner', 'Supabase Auth returns an access token for the owner; the owner has an agency.'],
  ['2', 'create-razorpay-order {plan_tier:starter, billing_cycle:monthly, coupon_code:null}', 'HTTP 200; returned amount equals the server-stored total (payment_history.amount); no client amount was sent.'],
  ['3', 'Tamper check: same request carrying amount, price and agency_id fields', 'The extra fields are ignored: returned amount equals the step 2 amount.'],
  ['4', 'Pay the order with a Razorpay TEST payment, then verify-razorpay-payment with the real signature', 'HTTP 200 state active; subscription active; exactly one new invoice TO/yy-yy/nnnnnn with CGST=SGST or IGST only; totals add up.'],
  ['5', 'Replay: verify again; deliver the same signed payment.captured webhook twice', 'verify returns already_active; webhook answers 200 (replay, then duplicate); still one invoice; period end unchanged.'],
  ['6', 'Bad signature webhook; wrong-amount payment.captured webhook', 'Bad signature -> HTTP 400. Wrong amount -> recorded failed_recorded, no extra invoice, subscription unchanged.'],
  ['7', 'Signed refund.processed webhook for the payment', 'Result refunded; one credit note CN/yy-yy/nnnnnn; subscription cancelled.'],
  ['8', 'Summary table and JSON report', 'Every step PASS; report written under proof-output/.'],
]

// ---------------------------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------------------------

/** Masks all but the last 4 characters. Short values are fully masked. */
export function mask(value) {
  const s = typeof value === 'string' ? value : ''
  if (!s) return '(unset)'
  if (s.length <= 8) return '*'.repeat(s.length)
  return `${'*'.repeat(Math.min(s.length - 4, 12))}${s.slice(-4)}`
}

export class HardStop extends Error {}

/** Throws HardStop unless the key id is a Razorpay TEST key. rzp_live_ is named explicitly. */
export function assertTestKeyId(keyId) {
  const id = typeof keyId === 'string' ? keyId.trim() : ''
  if (id.startsWith('rzp_live_')) {
    throw new HardStop('HARD STOP: RAZORPAY_KEY_ID is a LIVE key (rzp_live_...). This harness only runs against Razorpay TEST mode. Nothing was called.')
  }
  if (!id.startsWith('rzp_test_')) {
    throw new HardStop('HARD STOP: RAZORPAY_KEY_ID must start with rzp_test_. Nothing was called.')
  }
  return id
}

export function missingEnv(env) {
  return REQUIRED_ENV.filter(([name]) => !String(env[name] ?? '').trim()).map(([name]) => name)
}

/** Razorpay webhook signature: HMAC-SHA256 of the RAW body, hex. */
export function signWebhookBody(secret, rawBody) {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

/** Checkout signature: HMAC-SHA256 of "<order_id>|<payment_id>" with the key secret, hex. */
export function signCheckout(keySecret, orderId, paymentId) {
  return createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex')
}

export function safeEqualHex(a, b) {
  const x = Buffer.from(String(a), 'utf8')
  const y = Buffer.from(String(b), 'utf8')
  return x.length === y.length && timingSafeEqual(x, y)
}

export function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex')
}

/** Judges an invoice row. Returns a list of problems (empty = fine). */
export function checkInvoiceShape(inv) {
  const problems = []
  if (!inv || typeof inv !== 'object') return ['no invoice row']
  if (!/^TO\/\d{2}-\d{2}\/\d{6}$/.test(String(inv.invoice_number))) problems.push(`invoice number ${inv.invoice_number} is not TO/yy-yy/nnnnnn`)
  const c = Number(inv.cgst_paise), s = Number(inv.sgst_paise), i = Number(inv.igst_paise)
  const t = Number(inv.taxable_paise), total = Number(inv.total_paise)
  const intra = c > 0 && c === s && i === 0
  const inter = c === 0 && s === 0 && i > 0
  if (!intra && !inter) problems.push(`tax split is neither CGST=SGST nor IGST (cgst=${c} sgst=${s} igst=${i})`)
  if (t + c + s + i !== total) problems.push(`taxable+tax (${t + c + s + i}) differs from total (${total})`)
  return problems
}

export function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run'), help: argv.includes('--help') || argv.includes('-h') }
}

export function renderPlan(env = {}) {
  const lines = []
  lines.push('TO-152 S8 Razorpay sandbox proof: PLAN (dry run, no network calls)')
  lines.push('')
  lines.push('Environment variables a live run needs (values are never printed in full):')
  for (const [name, why, secret] of REQUIRED_ENV) {
    const v = String(env[name] ?? '')
    const state = v ? (secret ? `set (${mask(v)})` : name === 'RAZORPAY_KEY_ID' ? `set (${v.slice(0, 9)}...${v.slice(-4)})` : 'set') : 'NOT SET'
    lines.push(`  ${name.padEnd(28)} ${state.padEnd(22)} ${why}`)
  }
  for (const [name, why] of OPTIONAL_ENV) lines.push(`  ${name.padEnd(28)} ${'optional'.padEnd(22)} ${why}`)
  lines.push('')
  lines.push('Safety: a key id starting with rzp_live_ is a hard stop; anything but rzp_test_ is refused.')
  lines.push('Webhook URL under test: <SUPABASE_URL>/functions/v1/razorpay-webhook')
  lines.push('')
  lines.push('Steps and expected results:')
  for (const [n, what, expect] of STEPS) {
    lines.push(`  ${n}. ${what}`)
    lines.push(`     expect: ${expect}`)
  }
  lines.push('')
  lines.push('Report: proof-output/razorpay-sandbox-proof-<UTC timestamp>.json (directory self-ignores via its own .gitignore; secrets never written).')
  lines.push('Run live with: node scripts/razorpay_sandbox_proof.mjs')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------------------------
// Live run
// ---------------------------------------------------------------------------------------------

function makeScrubber(values) {
  const secrets = values.filter((v) => typeof v === 'string' && v.length >= 6)
  return (text) => {
    let out = String(text)
    for (const s of secrets) out = out.split(s).join(mask(s))
    return out
  }
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => rl.question(question, (a) => { rl.close(); res(a.trim()) }))
}

export async function runLive(env, { fetchImpl = fetch, log = console.log, outDir = join(process.cwd(), 'proof-output') } = {}) {
  const keyId = assertTestKeyId(env.RAZORPAY_KEY_ID)
  const miss = missingEnv(env)
  if (miss.length) throw new HardStop(`Missing environment variables: ${miss.join(', ')}. Run with --dry-run to see the plan.`)

  const keySecret = env.RAZORPAY_KEY_SECRET
  const whSecret = env.RAZORPAY_WEBHOOK_SECRET
  const base = env.SUPABASE_URL.replace(/\/+$/, '')
  if (!/^https:\/\//.test(base)) throw new HardStop('SUPABASE_URL must be an https hosted project URL.')
  const service = env.SUPABASE_SERVICE_ROLE_KEY
  const anon = env.SUPABASE_ANON_KEY
  const runId = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
  let accessToken = ''
  const scrub = makeScrubber([keySecret, whSecret, service, anon, env.PROOF_OWNER_PASSWORD, keyId])
  const scrubAll = (t) => makeScrubber([accessToken])(scrub(t))
  const say = (t) => log(scrubAll(t))

  say(`Target Supabase host: ${new URL(base).host}   Razorpay key: ${keyId.slice(0, 9)}...${keyId.slice(-4)} (TEST)   run ${runId}`)

  const steps = []
  const ctx = { agencyId: null, userId: null, orderA: null, orderB: null, paymentId: null, amountPaise: null, invoiceCount0: 0, periodEnd: null }
  let blocked = null

  async function http(url, init = {}) {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(30000) })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* not json */ }
    return { status: res.status, text, json }
  }
  const rest = (path) => http(`${base}/rest/v1/${path}`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })
  const fn = (name, body, token = accessToken) => http(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const rzAuth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`
  const rz = (path, method = 'GET', body) => http(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: { Authorization: rzAuth, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let evtN = 0
  async function webhook(payload, { eventId, signature } = {}) {
    const raw = JSON.stringify(payload)
    const id = eventId ?? `evt_proof_${runId}_${++evtN}`
    const res = await http(`${base}/functions/v1/razorpay-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-event-id': id,
        'x-razorpay-signature': signature ?? signWebhookBody(whSecret, raw),
      },
      body: raw,
    })
    return { ...res, eventId: id }
  }
  const countInvoices = async () => {
    const r = await rest(`subscription_invoices?agency_id=eq.${ctx.agencyId}&select=id`)
    return Array.isArray(r.json) ? r.json.length : -1
  }
  const readSub = async () => {
    const r = await rest(`subscriptions?agency_id=eq.${ctx.agencyId}&select=status,current_period_end`)
    const rows = Array.isArray(r.json) ? r.json : []
    return rows.find((x) => x.status !== 'cancelled' && x.status !== 'expired') ?? rows[0] ?? null
  }
  const readEvent = async (eventId) => {
    const r = await rest(`razorpay_webhook_events?event_id=eq.${eventId}&select=event_type,result,error`)
    return Array.isArray(r.json) ? r.json[0] ?? null : null
  }

  async function step(id, title, body) {
    const rec = { step: id, title, status: 'PASS', evidence: [] }
    const ev = (line) => rec.evidence.push(scrubAll(line))
    if (blocked) {
      rec.status = 'SKIP'
      ev(`skipped: ${blocked}`)
    } else {
      try {
        const out = await body(ev)
        if (out === false) rec.status = 'FAIL'
      } catch (e) {
        rec.status = 'FAIL'
        ev(`error: ${e instanceof Error ? e.message : 'unknown'}`)
        if (e && e.blocking) blocked = `step ${id} failed (${e.message})`
      }
    }
    if (rec.status === 'FAIL' && !blocked && ['1', '2', '4'].includes(id)) blocked = `step ${id} failed`
    steps.push(rec)
    say(`[${rec.status}] ${id}. ${title}`)
    for (const l of rec.evidence) say(`        ${l}`)
    return rec
  }
  const check = (ev, ok, pass, fail) => { ev(`${ok ? 'ok  ' : 'FAIL'} ${ok ? pass : fail}`); return ok }

  // 1. sign in
  await step('1', STEPS[0][1], async (ev) => {
    const r = await http(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anon },
      body: JSON.stringify({ email: env.PROOF_OWNER_EMAIL, password: env.PROOF_OWNER_PASSWORD }),
    })
    ev(`auth status ${r.status}`)
    accessToken = r.json?.access_token ?? ''
    ctx.userId = r.json?.user?.id ?? null
    if (!check(ev, !!accessToken, 'access token received', 'no access token')) return false
    const a = await rest(`transport_agencies?user_id=eq.${ctx.userId}&select=id,status&order=created_at.asc&limit=1`)
    ctx.agencyId = Array.isArray(a.json) ? a.json[0]?.id ?? null : null
    ev(`agency ${ctx.agencyId ? 'found' : 'NOT found'}, status ${Array.isArray(a.json) ? a.json[0]?.status : '?'}`)
    ctx.invoiceCount0 = ctx.agencyId ? await countInvoices() : 0
    ev(`invoices before: ${ctx.invoiceCount0}`)
    return !!ctx.agencyId
  })

  // 2. create order
  const orderReq = { plan_tier: 'starter', billing_cycle: 'monthly', coupon_code: null }
  await step('2', STEPS[1][1], async (ev) => {
    ev(`request keys: ${Object.keys(orderReq).join(',')} (no amount, price or agency id)`)
    const r = await fn('create-razorpay-order', orderReq)
    ev(`http ${r.status}`)
    if (!check(ev, r.status === 200 && typeof r.json?.id === 'string', 'order created', `order not created: ${scrubAll(r.text).slice(0, 160)}`)) return false
    ctx.orderA = r.json.id
    ctx.amountPaise = r.json.amount
    const row = await rest(`payment_history?razorpay_order_id=eq.${ctx.orderA}&select=amount,status,agency_id`)
    const stored = Array.isArray(row.json) ? row.json[0] : null
    ev(`returned amount ${r.json.amount} paise, currency ${r.json.currency}, stored amount ${stored?.amount}, stored status ${stored?.status}`)
    const a = check(ev, Number(stored?.amount) === Number(r.json.amount), 'returned amount equals the server-stored quote', 'returned amount differs from the stored quote')
    const b = check(ev, r.json.currency === 'INR' && Number.isSafeInteger(r.json.amount) && r.json.amount > 0, 'INR, positive integer paise', 'bad currency or amount')
    return a && b
  })

  // 3. tamper
  await step('3', STEPS[2][1], async (ev) => {
    const tampered = { ...orderReq, amount: 1, amount_paise: 1, price: 1, total_paise: 1, agency_id: '00000000-0000-0000-0000-000000000000' }
    const r = await fn('create-razorpay-order', tampered)
    ev(`http ${r.status}; sent extra fields: amount, amount_paise, price, total_paise, agency_id`)
    if (r.status !== 200) {
      // A refusal is also a safe outcome, but we want the ignore behaviour, so report it as is.
      return check(ev, false, '', `expected the extras to be ignored (200), got ${scrubAll(r.text).slice(0, 160)}`)
    }
    ctx.orderB = r.json?.id ?? null
    const same = check(ev, Number(r.json?.amount) === Number(ctx.amountPaise), `amount ${r.json?.amount} equals the untampered quote ${ctx.amountPaise}`, `amount ${r.json?.amount} differs from the quote ${ctx.amountPaise}`)
    const row = ctx.orderB ? await rest(`payment_history?razorpay_order_id=eq.${ctx.orderB}&select=agency_id,amount`) : { json: [] }
    const r0 = Array.isArray(row.json) ? row.json[0] : null
    const own = check(ev, !r0 || r0.agency_id === ctx.agencyId, 'order belongs to the caller agency, not the sent agency_id', 'order stored for a different agency')
    return same && own
  })

  // 4. real payment + verify
  await step('4', STEPS[3][1], async (ev) => {
    const orderId = ctx.orderB ?? ctx.orderA
    ctx.payOrder = orderId
    let paymentId = null
    const pay = await rz('payments/create/json', 'POST', {
      amount: ctx.amountPaise, currency: 'INR', order_id: orderId, email: 'proof@example.test', contact: '9000090000',
      method: 'card', card: { number: '5267318187975449', cvv: '123', expiry_month: '12', expiry_year: '2030', name: 'Proof Test' },
    })
    ev(`razorpay payments/create/json http ${pay.status}`)
    if (pay.status === 200 && typeof pay.json?.razorpay_payment_id === 'string') {
      paymentId = pay.json.razorpay_payment_id
    } else {
      ev('Razorpay TEST API could not create the payment server-side (normal: needs the S2S feature or 3DS).')
      paymentId = (env.PROOF_PAYMENT_ID ?? '').trim()
      if (!paymentId) {
        say('')
        say('MANUAL STEP: pay this order in Razorpay Checkout (TEST mode), then give the pay_... id.')
        say(`  order id: ${orderId}   amount: ${ctx.amountPaise} paise`)
        say('  1. Open any Razorpay TEST checkout for this order (e.g. the staging app checkout, or the Razorpay dashboard test payment link).')
        say('  2. Card 5267 3181 8797 5449, any future expiry, CVV 123, OTP 1234 (Razorpay published test card).')
        say('  3. Copy the razorpay_payment_id (pay_...) from the success screen or the dashboard Payments page.')
        if (process.stdin.isTTY) paymentId = await ask('Payment id (pay_...): ')
        if (!paymentId) {
          ev('MANUAL_REQUIRED: re-run with PROOF_PAYMENT_ID=pay_... for this order, or answer the prompt.')
          ctx.manual = true
          throw Object.assign(new Error('manual payment required'), { blocking: true })
        }
      }
    }
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) return check(ev, false, '', 'payment id is not pay_...')
    ctx.paymentId = paymentId
    let p = await rz(`payments/${paymentId}`)
    if (p.json?.status === 'authorized') {
      await rz(`payments/${paymentId}/capture`, 'POST', { amount: ctx.amountPaise, currency: 'INR' })
      p = await rz(`payments/${paymentId}`)
    }
    ev(`razorpay payment status ${p.json?.status}, amount ${p.json?.amount}, order ${p.json?.order_id === orderId ? 'matches' : 'MISMATCH'}`)
    if (!check(ev, p.json?.status === 'captured' && p.json?.order_id === orderId, 'payment captured for the order', 'payment is not captured for this order')) return false

    const signature = signCheckout(keySecret, orderId, paymentId)
    const v = await fn('verify-razorpay-payment', { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature })
    ev(`verify http ${v.status}, state ${v.json?.state}, success ${v.json?.success}`)
    const ok1 = check(ev, v.status === 200 && v.json?.success === true && v.json?.state === 'active', 'verify activated the subscription', `verify did not activate: ${scrubAll(v.text).slice(0, 160)}`)
    const sub = await readSub()
    ctx.periodEnd = sub?.current_period_end ?? null
    const ok2 = check(ev, sub?.status === 'active', `subscription status active, period end ${ctx.periodEnd}`, `subscription status is ${sub?.status}`)
    const inv = await rest(`subscription_invoices?agency_id=eq.${ctx.agencyId}&select=invoice_number,taxable_paise,cgst_paise,sgst_paise,igst_paise,total_paise`)
    const rows = Array.isArray(inv.json) ? inv.json : []
    const ok3 = check(ev, rows.length === ctx.invoiceCount0 + 1, `exactly one new invoice (now ${rows.length})`, `invoice count went ${ctx.invoiceCount0} -> ${rows.length}`)
    const latest = rows.map((r) => r).sort((a, b) => String(a.invoice_number).localeCompare(String(b.invoice_number))).at(-1)
    const problems = checkInvoiceShape(latest)
    ev(`invoice ${latest?.invoice_number}: taxable ${latest?.taxable_paise} cgst ${latest?.cgst_paise} sgst ${latest?.sgst_paise} igst ${latest?.igst_paise} total ${latest?.total_paise}`)
    const ok4 = check(ev, problems.length === 0, 'invoice number format and tax split are valid', problems.join('; '))
    ctx.invoiceCount1 = rows.length
    return ok1 && ok2 && ok3 && ok4
  })

  // 5. replay
  await step('5', STEPS[4][1], async (ev) => {
    const orderId = ctx.payOrder
    const signature = signCheckout(keySecret, orderId, ctx.paymentId)
    const v = await fn('verify-razorpay-payment', { razorpay_order_id: orderId, razorpay_payment_id: ctx.paymentId, razorpay_signature: signature })
    ev(`second verify http ${v.status}, state ${v.json?.state}`)
    const a = check(ev, v.status === 200 && v.json?.success === true && v.json?.state === 'already_active', 'second verify is an idempotent replay', 'second verify was not already_active')
    const body = {
      entity: 'event', account_id: 'acc_proof', event: 'payment.captured', contains: ['payment'],
      payload: { payment: { entity: { id: ctx.paymentId, entity: 'payment', amount: ctx.amountPaise, currency: 'INR', status: 'captured', order_id: orderId, method: 'card' } } },
      created_at: Math.floor(Date.now() / 1000),
    }
    const eventId = `evt_proof_${runId}_replay`
    const w1 = await webhook(body, { eventId })
    const w2 = await webhook(body, { eventId })
    ev(`webhook delivery 1: http ${w1.status} ${scrubAll(w1.text).slice(0, 80)}`)
    ev(`webhook delivery 2: http ${w2.status} ${scrubAll(w2.text).slice(0, 80)}`)
    const b = check(ev, w1.status === 200 && w2.status === 200, 'both deliveries answered 200', 'a delivery did not answer 200')
    const c = check(ev, w1.json?.result === 'replay' && w2.json?.result === 'duplicate', 'first delivery replay, second duplicate', `results were ${w1.json?.result} / ${w2.json?.result}`)
    const n = await countInvoices()
    const d = check(ev, n === ctx.invoiceCount1, `still ${n} invoice(s): no second invoice`, `invoice count changed ${ctx.invoiceCount1} -> ${n}`)
    const sub = await readSub()
    const e = check(ev, sub?.current_period_end === ctx.periodEnd, 'period end unchanged: no extension', `period end moved ${ctx.periodEnd} -> ${sub?.current_period_end}`)
    return a && b && c && d && e
  })

  // 6. bad signature and wrong amount
  await step('6', STEPS[5][1], async (ev) => {
    const orderId = ctx.payOrder
    const base1 = { entity: 'event', event: 'payment.captured', contains: ['payment'], created_at: Math.floor(Date.now() / 1000) }
    const good = { ...base1, payload: { payment: { entity: { id: ctx.paymentId, amount: ctx.amountPaise, currency: 'INR', status: 'captured', order_id: orderId } } } }
    const bad = await webhook(good, { signature: signWebhookBody(`${whSecret}x`, JSON.stringify(good)) })
    ev(`bad signature webhook: http ${bad.status}`)
    const a = check(ev, bad.status === 400, 'bad signature rejected with 400', `expected 400, got ${bad.status}`)
    const noSig = await webhook(good, { signature: 'not-hex' })
    const a2 = check(ev, noSig.status === 400, 'malformed signature rejected with 400', `expected 400, got ${noSig.status}`)

    const wrongPay = `pay_proof${runId}`.slice(0, 24)
    const wrong = { ...base1, payload: { payment: { entity: { id: wrongPay, amount: 100, currency: 'INR', status: 'captured', order_id: orderId, method: 'card' } } } }
    const w = await webhook(wrong)
    ev(`wrong-amount webhook (amount 100 paise): http ${w.status} ${scrubAll(w.text).slice(0, 100)}`)
    const row = await readEvent(w.eventId)
    ev(`ledger row: result ${row?.result}, error ${row?.error}`)
    const b = check(ev, row?.result === 'failed_recorded', 'wrong-amount event recorded as failed_recorded', `ledger result is ${row?.result}`)
    const n = await countInvoices()
    const c = check(ev, n === ctx.invoiceCount1, 'no extra invoice', `invoice count is ${n}`)
    const sub = await readSub()
    const d = check(ev, sub?.status === 'active' && sub?.current_period_end === ctx.periodEnd, 'subscription unchanged and still active', 'subscription changed')
    return a && a2 && b && c && d
  })

  // 7. refund
  await step('7', STEPS[6][1], async (ev) => {
    const refundId = `rfnd_proof${runId}`.slice(0, 24)
    const body = {
      entity: 'event', event: 'refund.processed', contains: ['refund', 'payment'], created_at: Math.floor(Date.now() / 1000),
      payload: {
        refund: { entity: { id: refundId, entity: 'refund', payment_id: ctx.paymentId, amount: ctx.amountPaise, currency: 'INR', status: 'processed' } },
        payment: { entity: { id: ctx.paymentId, amount: ctx.amountPaise, currency: 'INR', status: 'refunded' } },
      },
    }
    const w = await webhook(body)
    ev(`refund webhook: http ${w.status} ${scrubAll(w.text).slice(0, 100)}`)
    const a = check(ev, w.status === 200 && w.json?.result === 'refunded', 'refund recorded', 'refund not recorded as refunded')
    const cn = await rest(`subscription_credit_notes?agency_id=eq.${ctx.agencyId}&refund_id=eq.${refundId}&select=credit_note_number,total_paise`)
    const row = Array.isArray(cn.json) ? cn.json[0] : null
    ev(`credit note ${row?.credit_note_number ?? '(none)'} total ${row?.total_paise}`)
    const b = check(ev, /^CN\/\d{2}-\d{2}\/\d{6}$/.test(String(row?.credit_note_number)), 'credit note issued', 'no credit note issued')
    const sub = await readSub()
    const c = check(ev, sub?.status === 'cancelled', 'subscription cancelled', `subscription status is ${sub?.status}`)
    return a && b && c
  })

  // 8. summary
  const failed = steps.filter((s) => s.status === 'FAIL').length
  const skipped = steps.filter((s) => s.status === 'SKIP').length
  const summary = steps.map((s) => ({ step: s.step, title: s.title, status: s.status }))
  say('')
  say('SUMMARY')
  for (const s of steps) say(`  ${s.step}  ${s.status.padEnd(5)} ${s.title}`)
  const overall = failed === 0 && skipped === 0 ? 'PASS' : 'FAIL'
  say(`  8  ${overall.padEnd(5)} overall: ${steps.length - failed - skipped}/${steps.length} passed, ${failed} failed, ${skipped} skipped`)

  mkdirSync(outDir, { recursive: true })
  const ign = join(outDir, '.gitignore')
  if (!existsSync(ign)) writeFileSync(ign, '*\n')
  const file = join(outDir, `razorpay-sandbox-proof-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  const report = {
    run_id: runId,
    finished_at: new Date().toISOString(),
    mode: 'razorpay_test',
    supabase_host: new URL(base).host,
    razorpay_key: `${keyId.slice(0, 9)}...${keyId.slice(-4)}`,
    overall,
    summary,
    steps,
  }
  writeFileSync(file, scrubAll(JSON.stringify(report, null, 2)))
  say(`Report: ${file}`)
  return { overall, manual: !!ctx.manual, file, steps }
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.dryRun) {
    console.log(renderPlan(process.env))
    return 0
  }
  try {
    const result = await runLive(process.env)
    if (result.manual) return 2
    return result.overall === 'PASS' ? 0 : 1
  } catch (e) {
    if (e instanceof HardStop) {
      console.error(e.message)
      return 3
    }
    console.error(`Proof run aborted: ${e instanceof Error ? e.message : 'unknown error'}`)
    return 1
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  main().then((code) => { process.exitCode = code })
}
