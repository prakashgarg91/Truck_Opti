/**
 * Local full-journey launcher (task H5): `npm run test:journey`.
 *
 * Starts, all on this machine and nothing else:
 *   1. the embedded PostgreSQL 18 cluster with every migration (scripts/race/_realPg.mjs);
 *   2. the journey seed (scripts/harness/seed.mjs);
 *   3. the Supabase-shaped shim on 127.0.0.1 (server.mjs + rest.mjs);
 *   4. the real Vite dev server of frontend/ with PROCESS ENV overrides (the real .env.local is never read here);
 *   5. headless Chromium (Playwright) whose network is routed: harness.truckopti.test -> the shim,
 *      the Vite origin -> itself, EVERYTHING else is aborted and recorded.
 * Then runs journey.browser.mjs, writes evidence/journey/, and tears everything down, even on failure.
 *
 * Exit code 0 only when every journey step passed (hosted-only steps are reported, not counted as pass,
 * and do not fail the run) AND no forbidden request (supabase.co, razorpay, any unlisted third party) was attempted.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.RACE_MODULES ??= 'D:/tmp/pgrace'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(here, '..', '..')
const FRONTEND = join(REPO, 'frontend')
const EVIDENCE = join(REPO, 'evidence', 'journey')
const HARNESS_HOST = 'harness.truckopti.test'
const HARNESS_ORIGIN = `https://${HARNESS_HOST}`
// Hosts that may be aborted silently (they are still listed). Anything else non-local is a FORBIDDEN request.
const BENIGN_ABORT = [/(^|\.)fonts\.googleapis\.com$/, /(^|\.)fonts\.gstatic\.com$/, /(^|\.)googletagmanager\.com$/, /(^|\.)google-analytics\.com$/, /(^|\.)analytics\.google\.com$/]
const FORBIDDEN_HOST = [/supabase\.(co|in)$/, /razorpay/i, /phonepe/i, /sentry\.io$/]

const started = Date.now()
const cleanup = []
let tornDown = false
async function teardown() {
  if (tornDown) return
  tornDown = true
  for (const fn of cleanup.reverse()) {
    try {
      await fn()
    } catch (e) {
      console.error('teardown step failed:', String(e?.message ?? e).split('\n')[0])
    }
  }
}
process.on('SIGINT', () => void teardown().finally(() => process.exit(130)))
process.on('SIGTERM', () => void teardown().finally(() => process.exit(143)))

const log = (...a) => console.log('[journey]', ...a)

function freePort() {
  return new Promise((res, rej) => {
    const s = createNetServer()
    s.once('error', rej)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => res(port))
    })
  })
}

async function waitHttp(url, ms, isAlive) {
  const end = Date.now() + ms
  let last = ''
  while (Date.now() < end) {
    if (isAlive && !isAlive()) throw new Error('process exited before it became ready')
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (r.status < 500) return
      last = `HTTP ${r.status}`
    } catch (e) {
      last = String(e?.cause?.code ?? e?.message ?? e)
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`${url} not ready after ${ms} ms (${last})`)
}

/** Names (never values) of every VITE_* variable declared in frontend/.env*, plus the ones the code reads. */
function viteVariableNames() {
  const names = new Set()
  for (const f of readdirSync(FRONTEND).filter((x) => x.startsWith('.env'))) {
    for (const line of readFileSync(join(FRONTEND, f), 'utf8').split(/\r?\n/)) {
      const m = /^\s*#?\s*(VITE_[A-Z0-9_]+)\s*=/.exec(line)
      if (m) names.add(m[1])
    }
  }
  return [...names]
}

let exitCode = 1
let results = null
try {
  // ---------------------------------------------------------------------------------------------
  // 1 + 2: cluster, migrations, seed
  // ---------------------------------------------------------------------------------------------
  const { startServer } = await import('../race/_realPg.mjs')
  const { startHarnessServer } = await import('./server.mjs')
  const { registerRest } = await import('./rest.mjs')
  const { seedJourney } = await import('./seed.mjs')

  const modulesDir = process.env.RACE_MODULES
  const leftovers = () => (existsSync(modulesDir) ? readdirSync(modulesDir).filter((d) => d.startsWith('data-journey-')) : [])
  const dirsBefore = new Set(leftovers())
  // runs LAST (cleanup is LIFO): remove any data dir of this run that the cluster stop could not delete on Windows
  cleanup.push(async () => {
    for (let i = 0; i < 5; i++) {
      for (const d of leftovers().filter((x) => !dirsBefore.has(x))) rmSync(join(modulesDir, d), { recursive: true, force: true })
      if (leftovers().every((x) => dirsBefore.has(x))) return
      await new Promise((r) => setTimeout(r, 500))
    }
  })
  log('starting embedded PostgreSQL and replaying migrations ...')
  const pg = await startServer('journey')
  cleanup.push(() => pg.stop())
  log(`PostgreSQL ${pg.version}, ${pg.files} migrations applied`)
  const seed = await seedJourney(pg.admin)
  log(`seeded: ${Object.keys(seed.users).length} people, agency ${seed.agencyId.slice(0, 8)}, ${seed.truckIds.length} trucks`)

  // ---------------------------------------------------------------------------------------------
  // 3: shim
  // ---------------------------------------------------------------------------------------------
  const shim = await startHarnessServer({ pg, users: Object.values(seed.users).map((u) => ({ id: u.id, email: u.email, password: u.password })) })
  cleanup.push(() => shim.close())
  registerRest(shim)
  log(`shim listening on ${shim.url} (127.0.0.1 only)`)

  // ---------------------------------------------------------------------------------------------
  // 4: Vite dev server with process-env overrides
  // ---------------------------------------------------------------------------------------------
  const viteBin = join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(viteBin)) throw new Error('frontend/node_modules/vite is missing: run npm ci in frontend/')
  const vitePort = await freePort()
  const env = { ...process.env }
  for (const name of viteVariableNames()) env[name] = '' // process env beats frontend/.env*: blank everything real
  Object.assign(env, {
    VITE_SUPABASE_URL: HARNESS_ORIGIN,
    VITE_SUPABASE_ANON_KEY: shim.anonKey,
    VITE_AUTH_PASSWORD_ENABLED: 'true',
    VITE_AUTH_EMAIL_OTP_ENABLED: 'false',
    VITE_AUTH_PHONE_OTP_ENABLED: 'false',
    VITE_GOOGLE_CLIENT_ID: '',
    VITE_GOOGLE_MAPS_API_KEY: '',
    VITE_SENTRY_DSN: '',
    VITE_RAZORPAY_KEY_ID: '',
    VITE_PHONEPE_MERCHANT_ID: '',
    VITE_PHONEPE_API_URL: '',
    VITE_SYNC_URL: '',
    VITE_API_URL: '',
    VITE_APP_URL: `http://127.0.0.1:${vitePort}`,
    BROWSER: 'none',
  })
  const logDir = mkdtempSync(join(tmpdir(), 'truckopti-journey-'))
  cleanup.push(() => rmSync(logDir, { recursive: true, force: true }))
  const viteLogFile = join(logDir, 'vite.log')
  let viteOut = ''
  const vite = spawn(process.execPath, [viteBin, '--port', String(vitePort), '--strictPort', '--host', '127.0.0.1'], {
    cwd: FRONTEND,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let viteAlive = true
  vite.on('exit', () => {
    viteAlive = false
  })
  const onChunk = (c) => {
    viteOut = (viteOut + c.toString()).slice(-20000)
  }
  vite.stdout.on('data', onChunk)
  vite.stderr.on('data', onChunk)
  cleanup.push(async () => {
    writeFileSync(viteLogFile, viteOut)
    if (viteAlive) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { stdio: 'ignore' })
      else vite.kill('SIGKILL')
    }
  })
  const appUrl = `http://127.0.0.1:${vitePort}`
  try {
    await waitHttp(`${appUrl}/`, 120000, () => viteAlive)
  } catch (e) {
    throw new Error(`Vite did not start: ${e.message}\n--- vite output (tail) ---\n${viteOut.slice(-2000)}`)
  }
  log(`vite dev server on ${appUrl}`)

  // HARD STOP: read back the env Vite actually resolved (import.meta.env is inlined into every module that uses it).
  const supaModule = await (await fetch(`${appUrl}/src/lib/supabase.ts`)).text()
  const envJson = /import\.meta\.env\s*=\s*(\{.*?\});/s.exec(supaModule)?.[1]
  if (!envJson) throw new Error('HARD STOP: could not read the resolved import.meta.env from Vite')
  const resolvedEnv = JSON.parse(envJson)
  const resolvedUrl = String(resolvedEnv.VITE_SUPABASE_URL ?? '')
  if (/supabase\.(co|in)/i.test(envJson)) throw new Error('HARD STOP: a resolved VITE_* value contains supabase.co')
  if (resolvedUrl !== HARNESS_ORIGIN) throw new Error(`HARD STOP: resolved VITE_SUPABASE_URL is not ${HARNESS_ORIGIN}`)
  const realHosts = Object.entries(resolvedEnv).filter(([, v]) => /^https?:\/\//i.test(String(v)) && !/^https:\/\/harness\.truckopti\.test$|^http:\/\/127\.0\.0\.1:/.test(String(v)))
  if (realHosts.length) throw new Error(`HARD STOP: resolved VITE_* values point at real hosts: ${realHosts.map(([k]) => k).join(', ')}`)
  log(`resolved VITE_SUPABASE_URL = ${resolvedUrl}; no other VITE_* value points at a host`)

  // ---------------------------------------------------------------------------------------------
  // 5: browser with a closed network
  // ---------------------------------------------------------------------------------------------
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  cleanup.push(() => browser.close())

  const aborted = [] // { url, host, kind: 'forbidden'|'benign'|'unlisted' }
  const realtimeClosed = new Set()
  const functionCalls = [] // edge calls answered 501 by the shim (hosted-only evidence)
  const contexts = []

  async function newContext(label, { viewport = { width: 1280, height: 800 } } = {}) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: false, ignoreHTTPSErrors: false })
    const rec = { label, context, consoleErrors: [], pageErrors: [], failed: [], page: null }
    await context.route('**/*', async (route) => {
      const request = route.request()
      let u
      try {
        u = new URL(request.url())
      } catch {
        return route.abort('blockedbyclient')
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return route.continue()
      if (u.hostname === '127.0.0.1' && u.port === String(vitePort)) return route.continue()
      if (u.hostname === HARNESS_HOST) {
        const origin = request.headers().origin
        const cors = { 'access-control-allow-origin': origin ?? '*', 'access-control-expose-headers': 'Content-Range, Content-Profile, X-Supabase-Api-Version' }
        if (u.pathname === '/auth/v1/health' && request.method() === 'GET') {
          // reachability probe of the app: answered here (server.mjs has no /health route)
          return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{"status":"ok","source":"harness"}' })
        }
        try {
          const resp = await route.fetch({ url: `${shim.url}${u.pathname}${u.search}` })
          return route.fulfill({ response: resp, headers: { ...resp.headers(), ...cors } })
        } catch (e) {
          rec.failed.push({ method: request.method(), url: `${u.pathname}`, error: String(e?.message ?? e).split('\n')[0] })
          return route.abort('failed')
        }
      }
      const host = u.hostname
      const kind = FORBIDDEN_HOST.some((re) => re.test(host)) ? 'forbidden' : BENIGN_ABORT.some((re) => re.test(host)) ? 'benign' : 'unlisted'
      aborted.push({ url: `${u.protocol}//${u.host}${u.pathname}`, host, kind, context: label })
      return route.abort('blockedbyclient')
    })
    // WebSockets bypass context.route: Realtime to the harness host is closed (501 equivalent), the Vite HMR socket
    // passes through, anything else is recorded as an aborted request.
    await context.routeWebSocket(/.*/, (ws) => {
      let u
      try {
        u = new URL(ws.url())
      } catch {
        return ws.close()
      }
      if (u.hostname === '127.0.0.1' && u.port === String(vitePort)) return ws.connectToServer()
      if (u.hostname !== HARNESS_HOST) {
        const kind = FORBIDDEN_HOST.some((re) => re.test(u.hostname)) ? 'forbidden' : 'unlisted'
        aborted.push({ url: `${u.protocol}//${u.host}${u.pathname}`, host: u.hostname, kind, context: label })
      } else {
        realtimeClosed.add(u.pathname)
      }
      return ws.close({ code: 1013, reason: 'harness: no realtime' })
    })
    const page = await context.newPage()
    rec.page = page
    page.on('console', (m) => {
      if (m.type() === 'error') rec.consoleErrors.push({ text: m.text().slice(0, 400), at: Date.now() })
    })
    page.on('pageerror', (e) => rec.pageErrors.push({ text: String(e?.message ?? e).slice(0, 400), at: Date.now() }))
    page.on('requestfailed', (r) => {
      const url = r.url()
      if (/harness\.truckopti\.test/.test(url) || url.startsWith(appUrl)) rec.failed.push({ method: r.method(), url: new URL(url).pathname, error: r.failure()?.errorText })
    })
    contexts.push(rec)
    return rec
  }

  // ---------------------------------------------------------------------------------------------
  // 6: journey
  // ---------------------------------------------------------------------------------------------
  rmSync(EVIDENCE, { recursive: true, force: true })
  mkdirSync(EVIDENCE, { recursive: true })
  const { runJourney } = await import('./journey.browser.mjs')
  log('running the journey (sign in .. renewal, then the 375px mobile pass) ...')
  results = await runJourney({ appUrl, shim, pg, seed, evidenceDir: EVIDENCE, newContext, harnessHost: HARNESS_HOST })

  // request audit -----------------------------------------------------------------------------------
  const shimLog = shim.getRequestLog()
  for (const e of shimLog) if (e.path.startsWith('/functions/v1/') && e.status === 501) functionCalls.push(e.path)
  const forbidden = aborted.filter((a) => a.kind === 'forbidden' || a.kind === 'unlisted')
  const benign = aborted.filter((a) => a.kind === 'benign')
  const rest501 = shimLog.filter((e) => e.path.startsWith('/rest/v1/') && e.status === 501)
  const errorCounts = {}
  for (const e of shimLog) if (e.status >= 400) errorCounts[`${e.method} ${e.path} -> ${e.status}`] = (errorCounts[`${e.method} ${e.path} -> ${e.status}`] ?? 0) + 1
  const consoleErrors = contexts.flatMap((c) => c.consoleErrors.map((x) => `[${c.label}] ${x.text}`))
  const pageErrors = contexts.flatMap((c) => c.pageErrors.map((x) => `[${c.label}] ${x.text}`))
  const audit = {
    forbiddenRequests: forbidden,
    benignAborted: [...new Set(benign.map((b) => b.url))],
    shimRequests: shimLog.length,
    edgeCalls501: [...new Set(functionCalls)],
    realtimeSocketsClosed: [...realtimeClosed],
    restTable501: [...new Set(rest501.map((e) => e.path))],
    shimErrors: errorCounts,
    consoleErrorCount: consoleErrors.length,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 40),
    pageErrors: [...new Set(pageErrors)].slice(0, 20),
  }

  const failedSteps = results.steps.filter((s) => s.status === 'fail')
  const passed = results.steps.filter((s) => s.status === 'pass').length
  const hosted = results.steps.filter((s) => s.status === 'hosted-only').length
  const skipped = results.steps.filter((s) => s.status === 'skipped').length
  const ok = failedSteps.length === 0 && forbidden.length === 0 && rest501.length === 0

  const report = { startedAt: new Date(started).toISOString(), seconds: Math.round((Date.now() - started) / 1000), appUrl, resolvedSupabaseUrl: resolvedUrl, summary: { passed, failed: failedSteps.length, hostedOnly: hosted, skipped }, steps: results.steps, notes: results.notes, pageConsole: results.pageConsole, mobileFindings: results.mobileFindings, audit }
  writeFileSync(join(EVIDENCE, 'report.json'), JSON.stringify(report, null, 2))

  console.log('\n================ JOURNEY RESULT ================')
  for (const s of results.steps) {
    const tag = { pass: 'PASS', fail: 'FAIL', 'hosted-only': 'HOSTED-ONLY', skipped: 'SKIP' }[s.status]
    console.log(`${tag.padEnd(12)} ${s.name}${s.detail ? ` - ${s.detail}` : ''}`)
    if (s.status === 'fail' && s.failure) {
      console.log(`    error: ${s.failure.error}`)
      if (s.failure.pageText) console.log(`    page text: ${s.failure.pageText.replace(/\s+/g, ' ').slice(0, 500)}`)
      for (const c of s.failure.console ?? []) console.log(`    console: ${c}`)
      for (const r of s.failure.requests ?? []) console.log(`    shim: ${r}`)
    }
  }
  for (const n of results.notes) console.log(`note: ${n}`)
  console.log(`\nsteps: ${passed} passed, ${failedSteps.length} failed, ${hosted} hosted-only, ${skipped} skipped`)
  console.log(`forbidden requests attempted: ${forbidden.length}${forbidden.length ? ' -> ' + forbidden.map((f) => f.url).join(', ') : ''}`)
  console.log(`benign aborted (fonts/analytics): ${audit.benignAborted.join(', ') || 'none'}`)
  console.log(`edge calls answered 501 (hosted-only): ${audit.edgeCalls501.join(', ') || 'none'}`)
  console.log(`rest table requests answered 501 (unsupported by rest.mjs, fails the run): ${audit.restTable501.join(', ') || 'none'}`)
  console.log(`console errors: ${audit.consoleErrorCount}, page errors: ${audit.pageErrors.length}`)
  console.log(`evidence: ${EVIDENCE}`)
  exitCode = ok ? 0 : 1
} catch (e) {
  console.error('\n[journey] HARNESS FAILURE:', e?.stack ?? e)
  exitCode = 2
} finally {
  await teardown()
  console.log(`[journey] torn down; exit ${exitCode}; ${Math.round((Date.now() - started) / 1000)} s`)
}
process.exit(exitCode)
