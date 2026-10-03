#!/usr/bin/env node
/**
 * TO-129 — browser dashboard-to-trip proof.
 *
 * Drives the REAL frontend (Vite build of the actual components) in a real
 * Chromium against the disposable local Supabase stack, and proves the brief's
 * acceptance criterion: an approved driver signs in, sees the pending offer
 * modal, taps Accept, and lands on the existing trip route
 * /driver/trip/<offerId>.
 *
 * Transport note: the app is https-only by design (TO-124 fail-closed config —
 * frontend/src/lib/authCapabilities.ts isValidHttpsBackendUrl rejects http and
 * localhost hostnames but accepts 127.0.0.1), so the script serves a local
 * self-signed HTTPS reverse proxy on 127.0.0.1 that forwards to the local Kong
 * endpoint (http://127.0.0.1:54321) and points VITE_SUPABASE_URL at it.
 * Application code, schema, RLS and data are all the real local ones; only the
 * TLS termination is local. Realtime websockets are not proxied, so the offer
 * modal appears through the mount/focus hydration path (same data).
 *
 * Env-trap handling (owner instruction): frontend/.env.local and frontend/.env
 * are renamed to *.sync-hold for the run and restored byte-identically
 * afterwards (sha256-verified). They are never read, edited or deleted.
 *
 * Usage: node scripts/atomic_job_offer_response.browser-proof.mjs
 * Requires: disposable local stack (npx supabase start + npx supabase db reset).
 */

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, rename, readFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND_ROOT = path.join(REPO_ROOT, 'frontend')
const SCREENSHOT_DIR = path.join(REPO_ROOT, 'screenshots', 'to129-atomic-accept')
const PROXY_HOST = 'kong.to129-proxy.test'
const FRONT_PORT = 5277
const TLS_PORT = 5443

function findOpenssl() {
  for (const candidate of ['openssl', 'C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe']) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore', shell: process.platform === 'win32' && candidate === 'openssl' })
      return candidate
    } catch {
      /* try next */
    }
  }
  throw new Error('openssl not found (needed for the local self-signed HTTPS proxy)')
}

/** Self-signed HTTPS reverse proxy in front of the local Kong endpoint. */
async function startTlsProxy() {
  const openssl = findOpenssl()
  await import('node:fs/promises').then((fs) => fs.mkdir(SCREENSHOT_DIR, { recursive: true }))
  const key = path.join(REPO_ROOT, 'screenshots', 'to129-atomic-accept', 'proxy-key.pem')
  const cert = path.join(REPO_ROOT, 'screenshots', 'to129-atomic-accept', 'proxy-cert.pem')
  execFileSync(
    openssl,
    ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', key, '-out', cert, '-days', '1', '-nodes', '-subj', '/CN=127.0.0.1'],
    { stdio: 'ignore' }
  )
  const [keyPem, certPem] = await Promise.all([readFile(key), readFile(cert)])
  const server = https.createServer({ key: keyPem, cert: certPem }, (req, res) => {
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: 54321,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: '127.0.0.1:54321' },
      },
      (up) => {
        res.writeHead(up.statusCode || 502, up.headers)
        up.pipe(res)
      }
    )
    upstream.on('error', (err) => {
      res.writeHead(502)
      res.end(`proxy error: ${err.message}`)
    })
    req.pipe(upstream)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(TLS_PORT, '127.0.0.1', resolve)
  })
  return server
}

function assertLocalUrl(url) {
  const parsed = new URL(url)
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local Supabase URL host "${parsed.hostname}"`)
  }
  return url.replace(/\/$/, '')
}

async function readStatusEnv() {
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
const SUPABASE_URL = assertLocalUrl(process.env.SUPABASE_URL || statusEnv.SUPABASE_URL || 'http://127.0.0.1:54321')
const ANON_KEY = process.env.SUPABASE_ANON_KEY || statusEnv.ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || statusEnv.SERVICE_ROLE_KEY
if (!ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('FAIL: local API keys not found. Start the disposable stack first: npx supabase start')
  process.exit(1)
}

const REST = `${SUPABASE_URL}/rest/v1`
const AUTH = `${SUPABASE_URL}/auth/v1`
const RUN = `to129browser-${Date.now()}`
const DRIVER_EMAIL = `${RUN}@example.com`
const DRIVER_PASSWORD = 'to129-Passw0rd!'

function headers(key, token) {
  return {
    apikey: key,
    Authorization: `Bearer ${token || key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

async function rest(method, requestPath, { key = ANON_KEY, token, body } = {}) {
  const res = await fetch(`${REST}${requestPath}`, {
    method,
    headers: headers(key, token),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

const results = []
function record(name, pass, detail = '') {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// ---- env trap: hold the stale env files for the duration of the run ---------
const ENV_HOLD_FILES = [
  { live: path.join(FRONTEND_ROOT, '.env.local'), hold: path.join(FRONTEND_ROOT, '.env.local.sync-hold') },
  { live: path.join(FRONTEND_ROOT, '.env'), hold: path.join(FRONTEND_ROOT, '.env.sync-hold') },
]

async function sha256(file) {
  try {
    return createHash('sha256').update(await readFile(file)).digest('hex')
  } catch {
    return null
  }
}

async function holdEnvFiles() {
  for (const { live, hold } of ENV_HOLD_FILES) {
    await access(hold).then(
      () => {
        throw new Error(`${hold} already exists; refusing to run until it is resolved`)
      },
      () => {}
    )
  }
  for (const { live, hold } of ENV_HOLD_FILES) {
    const exists = await access(live).then(
      () => true,
      () => false
    )
    if (!exists) {
      console.log(`env-hold: ${live} absent, nothing to hold`)
      continue
    }
    await rename(live, hold)
    console.log(`env-hold: renamed ${live} -> ${path.basename(hold)}`)
  }
}

async function restoreEnvFiles(beforeHashes) {
  for (const { live, hold } of ENV_HOLD_FILES) {
    const held = await access(hold).then(
      () => true,
      () => false
    )
    if (!held) continue
    await rename(hold, live)
    console.log(`env-hold: restored ${live}`)
  }
  for (const { live } of ENV_HOLD_FILES) {
    const before = beforeHashes.get(live)
    const after = await sha256(live)
    if (after !== before) {
      throw new Error(
        `env file ${live} did not restore byte-identically (before=${before} after=${after})`
      )
    }
  }
}

// ---- fixture helpers ---------------------------------------------------------
async function adminCreateUser() {
  const res = await fetch(`${AUTH}/admin/users`, {
    method: 'POST',
    headers: headers(SERVICE_ROLE_KEY),
    body: JSON.stringify({ email: DRIVER_EMAIL, password: DRIVER_PASSWORD, email_confirm: true }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`admin user create failed: ${JSON.stringify(json)}`)
  return json
}

async function main() {
  const envHashes = new Map()
  for (const { live } of ENV_HOLD_FILES) envHashes.set(live, await sha256(live))

  // ---- seed fixture ---------------------------------------------------------
  const user = await adminCreateUser()
  const { status: driverStatus, json: driverRows } = await rest('POST', '/drivers', {
    key: SERVICE_ROLE_KEY,
    body: {
      user_id: user.id,
      full_name: 'TO129 Browser Driver',
      phone: `6${Date.now() % 1000000000}`,
      vehicle_type: 'tata_407',
      status: 'approved',
      is_online: true,
      pan_number: 'ABCDE1234F',
    },
  })
  if (driverStatus !== 201) throw new Error(`driver insert failed: ${JSON.stringify(driverRows)}`)
  const driverRow = Array.isArray(driverRows) ? driverRows[0] : driverRows

  const { status: shipStatus, json: shipRows } = await rest('POST', '/shipments', {
    key: SERVICE_ROLE_KEY,
    body: {
      shipment_id: `TO129-BROWSER-${Date.now()}`,
      customer_id: null,
      truck_id: null,
      origin: 'Browser Proof Pickup',
      destination: 'Browser Proof Drop',
      status: 'pending',
      total_weight: 800,
      total_volume: 3,
      estimated_cost: 3600,
      driver_name: 'TO129 Browser Driver',
      vehicle_number: 'TO129BR0001',
    },
  })
  if (shipStatus !== 201) throw new Error(`shipment insert failed: ${JSON.stringify(shipRows)}`)
  const shipment = Array.isArray(shipRows) ? shipRows[0] : shipRows

  const { status: offerStatus, json: offerRows } = await rest('POST', '/job_offers', {
    key: SERVICE_ROLE_KEY,
    body: {
      shipment_id: shipment.id,
      driver_id: driverRow.id,
      status: 'pending',
      offered_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
  })
  if (offerStatus !== 201) throw new Error(`job offer insert failed: ${JSON.stringify(offerRows)}`)
  const offer = Array.isArray(offerRows) ? offerRows[0] : offerRows
  console.log(`fixture: offer=${offer.id} driver=${driverRow.id}`)

  let vite = null
  let browser = null
  let tlsProxy = null
  try {
    await holdEnvFiles()
    tlsProxy = await startTlsProxy()

    const { default: playwrightModule } = await import(
      pathToFileURL(path.join(REPO_ROOT, 'node_modules', 'playwright', 'index.mjs')).href
    )

    // ---- start Vite with local-stack env ------------------------------------
    vite = spawn(
      process.execPath,
      [path.join(FRONTEND_ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(FRONT_PORT), '--strictPort'],
      {
        cwd: FRONTEND_ROOT,
        env: {
          ...process.env,
          VITE_SUPABASE_URL: `https://127.0.0.1:${TLS_PORT}`,
          VITE_SUPABASE_ANON_KEY: ANON_KEY,
          VITE_AUTH_PASSWORD_ENABLED: 'true',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
    let viteLog = ''
    vite.stdout.on('data', (d) => {
      viteLog += d
    })
    vite.stderr.on('data', (d) => {
      viteLog += d
    })

    const frontUrl = `http://127.0.0.1:${FRONT_PORT}`
    const deadline = Date.now() + 120000
    let frontUp = false
    while (Date.now() < deadline) {
      try {
        const res = await fetch(frontUrl)
        if (res.ok) {
          frontUp = true
          break
        }
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    if (!frontUp) throw new Error(`Vite did not start: ${viteLog.slice(-800)}`)
    console.log(`frontend: ${frontUrl}`)

    // ---- browser journey -----------------------------------------------------
    browser = await playwrightModule.chromium.launch({ headless: true, ignoreHTTPSErrors: true })
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 420, height: 900 } })
    const page = await context.newPage()
    const shot = async (name) => {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false })
    }

    // 1. sign in on the driver surface with a real password grant
    await page.goto(`${frontUrl}/login?mode=driver`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[autocomplete="username"], input[inputmode="email"]').first().fill(DRIVER_EMAIL)
    await page.locator('input[autocomplete="current-password"]').first().fill(DRIVER_PASSWORD)
    await shot('01-login-filled')
    await page.getByRole('button', { name: /Sign In with Password/i }).click()
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
    console.log(`after login: ${page.url()}`)
    record('1. driver password sign-in succeeds against the local stack', true, page.url())

    // 2. open the driver dashboard and wait for the incoming offer modal
    if (!page.url().includes('/driver/dashboard')) {
      await page.goto(`${frontUrl}/driver/dashboard`, { waitUntil: 'domcontentloaded' })
    }
    try {
      await page.waitForSelector('text=Online, text=Offline', { timeout: 20000 })
    } catch {
      /* dashboard chrome may differ; diagnostics below will show the state */
    }
    try {
      await page.waitForSelector('text=New Job Offer', { timeout: 30000 })
    } catch (error) {
      await shot('debug-modal-timeout')
      const debugBody = await page.locator('body').innerText().catch(() => '')
      console.error(`DEBUG url=${page.url()}`)
      console.error(`DEBUG body=${debugBody.slice(0, 600).replace(/\n+/g, ' | ')}`)
      throw error
    }
    await page.waitForSelector('text=Browser Proof Pickup', { timeout: 15000 })
    record('2. pending offer modal visible on the real dashboard (pickup/fare hydrated)', true)
    await shot('02-offer-modal')

    // 3. tap Accept and require arrival on the existing trip route
    await Promise.all([
      page.waitForURL(`**/driver/trip/${offer.id}`, { timeout: 30000 }),
      page.getByRole('button', { name: /Accept/i }).click(),
    ])
    await page.waitForSelector('text=Shipment Details', { timeout: 30000 })
    const bodyText = await page.locator('body').innerText()
    if (!bodyText.includes('Browser Proof Pickup') || /Application Error/.test(bodyText)) {
      throw new Error(`trip page content unexpected: ${bodyText.slice(0, 300)}`)
    }
    record('3. Accept lands on the existing trip route /driver/trip/:jobId with real shipment details', true, page.url())
    await shot('03-trip-page')

    // 4. server-side authoritative state after the browser acceptance
    const { json: dbOffers } = await rest('GET', `/job_offers?id=eq.${offer.id}&select=status,responded_at`, { key: SERVICE_ROLE_KEY })
    const { json: dbDrivers } = await rest('GET', `/drivers?id=eq.${driverRow.id}&select=active_job_id,total_trips`, { key: SERVICE_ROLE_KEY })
    const dbOffer = Array.isArray(dbOffers) ? dbOffers[0] : dbOffers
    const dbDriver = Array.isArray(dbDrivers) ? dbDrivers[0] : dbDrivers
    if (dbOffer.status !== 'accepted' || dbDriver.active_job_id !== offer.id) {
      throw new Error(`unexpected DB state: offer=${JSON.stringify(dbOffer)} driver=${JSON.stringify(dbDriver)}`)
    }
    record('4. one authorized transaction: offer accepted AND active job assigned server-side', true,
      `status=${dbOffer.status} active_job_id=${dbDriver.active_job_id}`)
  } finally {
    if (browser) await browser.close().catch(() => {})
    if (tlsProxy) await new Promise((resolve) => tlsProxy.close(resolve))
    if (vite) {
      const exited = new Promise((resolve) => vite.once('exit', resolve))
      vite.kill()
      await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))])
      if (vite.exitCode === null) {
        try {
          execFileSync('taskkill', ['/F', '/PID', String(vite.pid), '/T'], { stdio: 'ignore' })
        } catch {
          /* already gone */
        }
      }
    }
    await restoreEnvFiles(envHashes)
    // cleanup fixture
    await rest('DELETE', `/job_offers?id=eq.${offer.id}`, { key: SERVICE_ROLE_KEY })
    await rest('DELETE', `/shipments?id=eq.${shipment.id}`, { key: SERVICE_ROLE_KEY })
    await rest('DELETE', `/drivers?id=eq.${driverRow.id}`, { key: SERVICE_ROLE_KEY })
    await fetch(`${AUTH}/admin/users/${user.id}`, { method: 'DELETE', headers: headers(SERVICE_ROLE_KEY) })
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} browser proof steps passed; screenshots in ${SCREENSHOT_DIR}`)
  if (failed.length > 0) process.exit(1)
}

main().catch(async (error) => {
  console.error('FAIL (harness error):', error && error.message ? error.message : error)
  process.exit(1)
})
