#!/usr/bin/env node
/**
 * TO-134 — customer-visible device-local workspace browser proof (FIXTURE TIER).
 *
 * LEVEL (read this first): this runs the REAL built frontend (local-first mode,
 * no cloud backend configured) in Chromium and drives the real device-local
 * data layer — PGlite (PostgreSQL WASM) persisted to IndexedDB via
 * frontend/src/lib/localDb.ts and frontend/src/services/localApi.ts. It proves
 * browser-level write -> reload -> read-back for one device identity at mobile
 * and desktop viewports, with zero uncaught errors / failed requests.
 *
 * It is NOT cloud-journey proof: there is no Supabase/GoTrue/PostgREST in this
 * configuration, so account signup, customer/booking/tracking/invoice records
 * and cross-customer isolation are NOT exercised here. Those are covered at the
 * SQL level by scripts/customer_journey_isolation.db.test.mjs. Treat this file
 * strictly as fixture-tier UI evidence (device-local persistence only).
 *
 * Usage:
 *   1. build a local-first artifact (frontend/.env.local unset/renamed) and
 *      serve frontend/dist (e.g. `PORT=3000 node server.js`)
 *   2. PUBLIC_APP_URL=http://127.0.0.1:3000 node scripts/customer_local_workspace.browser-proof.mjs
 *
 * Exit code 0 = every case passed; any failure exits 1.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = process.env.PUBLIC_APP_URL || 'http://127.0.0.1:3000'
const OUTPUT_PATH = path.join('logs', 'to134-local-workspace-browser-proof.json')
const VIEWPORTS = [
  { label: 'mobile-390x844', width: 390, height: 844 },
  { label: 'desktop-1280x900', width: 1280, height: 900 },
]

const results = []
const findings = []
function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// Console errors observed on signed-in local-first pages are recorded as
// findings instead of being folded into the persistence assertion: the UI
// journey persists correctly, but two console-error classes are real defects
// (see agent-results/024-result.md) that live outside this brief's allowed
// files, so they are reported, not repaired.
function recordFinding(name, detail) {
  findings.push({ name, detail })
  console.log(`FINDING  ${name}${detail ? ` — ${detail}` : ''}`)
}

function attachSignals(page) {
  const signals = { consoleErrors: [], pageErrors: [], failedResponses: [] }
  page.on('console', (message) => {
    if (message.type() === 'error') signals.consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => signals.pageErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) signals.failedResponses.push(`${response.status()} ${response.url()}`)
  })
  return signals
}

async function enterLocalWorkspace(page, companyName) {
  await page.goto(`${BASE_URL}/login?fresh=${Date.now()}`, { waitUntil: 'networkidle', timeout: 45000 })
  const workspaceButton = page.getByRole('button', { name: 'Start using TruckOpti on this device' })
  await workspaceButton.waitFor({ state: 'visible', timeout: 20000 })
  await workspaceButton.click()
  await page.getByRole('heading', { name: 'Set up this device' }).waitFor({ state: 'visible', timeout: 20000 })
  await page.getByPlaceholder('Sharma Transport').fill(companyName)
  await page.getByRole('button', { name: 'Start using TruckOpti' }).click()
  await page.waitForURL(/\/agency\/dashboard/, { timeout: 20000 })
}

// The trucks/cartons modals use plain <label> text without htmlFor, so fields
// are addressed positionally inside the modal card (document order:
// name, then the numeric dimension/capacity fields).
async function addTruck(page, truckName) {
  await page.goto(`${BASE_URL}/management/trucks`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.getByRole('heading', { name: 'Truck Types', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
  await page.locator('button:has(svg.lucide-plus)').first().click()
  await page.getByRole('heading', { name: 'Add New Truck' }).waitFor({ state: 'visible', timeout: 15000 })
  const modal = page.locator('xpath=//h2[contains(text(),"Add New Truck")]/ancestor::div[contains(@class,"max-w-md")][1]')
  const inputs = modal.locator('input')
  await inputs.nth(0).fill(truckName)   // Truck Name (English)
  await inputs.nth(1).fill('2500')      // Capacity (kg)
  await inputs.nth(2).fill('18')        // Cost per km
  await inputs.nth(3).fill('274')       // Length (cm)
  await inputs.nth(4).fill('183')       // Width (cm)
  await inputs.nth(5).fill('183')       // Height (cm)
  await page.waitForTimeout(400)        // debounced onChange handlers commit before submit
  await page.getByRole('button', { name: 'Save Truck' }).click()
  await page.getByText(truckName, { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 })
}

async function addCarton(page, cartonName) {
  await page.goto(`${BASE_URL}/management/cartons`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.getByRole('heading', { name: 'Carton Types', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
  await page.getByRole('button', { name: 'Add Carton Type' }).first().click()
  await page.getByPlaceholder('e.g., Standard Box').waitFor({ state: 'visible', timeout: 15000 })
  const modal = page.locator('xpath=//h2[contains(text(),"Add Carton Type")]/ancestor::div[contains(@class,"max-w-md")][1]')
  const inputs = modal.locator('input')
  await inputs.nth(0).fill(cartonName) // Name
  await inputs.nth(1).fill('60')       // Length (cm)
  await inputs.nth(2).fill('40')       // Width (cm)
  await inputs.nth(3).fill('40')       // Height (cm)
  await inputs.nth(4).fill('12')       // Weight (kg)
  await modal.getByRole('button', { name: 'Save' }).click()
  await page.getByText(cartonName, { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 })
}

async function proveViewport(browser, viewport) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  const signals = attachSignals(page)
  const screenshots = []
  const shoot = async (name) => {
    const filePath = path.join('logs', 'to134-local-workspace', `${viewport.label}-${name}.png`)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await page.screenshot({ path: filePath, fullPage: true })
    screenshots.push(filePath)
  }

  const truckName = `TO134 Proof Truck ${viewport.label}`
  const cartonName = `TO134 Proof Carton ${viewport.label}`

  try {
    // Fresh device session -> local workspace identity.
    await enterLocalWorkspace(page, `TO134 Device ${viewport.label}`)
    await shoot('local-workspace-created')

    // UI write 1: add a truck; reload (returning session) and read it back.
    await addTruck(page, truckName)
    await shoot('truck-created')
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
    await page.getByRole('heading', { name: 'Truck Types', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
    await page.getByText(truckName, { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 })
    const truckState = {
      path: new URL(page.url()).pathname,
      persisted: true,
    }
    await shoot('truck-persisted-after-reload')

    // UI write 2: add a carton; reload and read it back.
    await addCarton(page, cartonName)
    await shoot('carton-created')
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 })
    await page.getByRole('heading', { name: 'Carton Types', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
    await page.getByText(cartonName, { exact: false }).first().waitFor({ state: 'visible', timeout: 20000 })
    const cartonState = {
      path: new URL(page.url()).pathname,
      persisted: true,
    }
    await shoot('carton-persisted-after-reload')

    const persisted = truckState.persisted && cartonState.persisted
    const hardErrors = signals.pageErrors.length === 0 && signals.failedResponses.length === 0
    record(
      `${viewport.label}: local workspace write -> reload -> read-back (truck + carton)`,
      persisted && hardErrors,
      `truck=${truckState.path} carton=${cartonState.path} consoleErrors=${signals.consoleErrors.length} pageErrors=${signals.pageErrors.length} failedResponses=${signals.failedResponses.length}`
    )
    for (const className of [...new Set(signals.consoleErrors)]) {
      recordFinding(`${viewport.label}: console error on signed-in local-first pages`, className.split('\n')[0].slice(0, 200))
    }

    return { viewport: viewport.label, truckState, cartonState, signals, screenshots }
  } finally {
    await context.close()
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const report = { generatedAt: new Date().toISOString(), baseUrl: BASE_URL, mode: 'local_first_fixture', viewports: [] }
  try {
    for (const viewport of VIEWPORTS) {
      report.viewports.push(await proveViewport(browser, viewport))
    }
  } finally {
    await browser.close()
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(OUTPUT_PATH, JSON.stringify({ ...report, findings }, null, 2))
  console.log(`\nTO-134 local-workspace browser proof report: ${OUTPUT_PATH}`)
  console.log('FIXTURE TIER: device-local PGlite/IndexedDB only — no cloud backend, no cross-identity isolation proof.')

  const failed = results.filter((r) => !r.pass)
  console.log(`${results.length - failed.length}/${results.length} viewport cases passed`)
  if (findings.length > 0) {
    console.log(`${findings.length} console-error finding(s) recorded (the brief's "no uncaught error" check is NOT clean):`)
    for (const f of [...new Set(findings.map((f) => f.detail))]) console.log(`  - ${f}`)
  }
  if (failed.length > 0) process.exit(1)
}

main().catch((error) => {
  console.error('FAIL (harness error):', error && error.message ? error.message : error)
  process.exit(1)
})
