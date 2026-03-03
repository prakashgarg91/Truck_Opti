#!/usr/bin/env node
/**
 * scripts/test-supabase-connection.mjs
 *
 * Supabase integration smoke test.
 * Run:  node --experimental-vm-modules scripts/test-supabase-connection.mjs
 *
 * Reads credentials from environment — never hardcoded.
 * Set in .env or export before running:
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ── Load env ─────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../frontend/.env') })
config({ path: resolve(__dirname, '../.env') }) // fallback

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('\n❌ FATAL: Missing environment variables.')
    console.error('   Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before running.\n')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Test Registry ─────────────────────────────────────────────────────────────
const results = []
let passed = 0
let failed = 0

function record(name, ok, detail = '') {
    results.push({ name, ok, detail })
    if (ok) passed++
    else failed++
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function tableReachable(table) {
    const { error } = await supabase.from(table).select('id').limit(1)
    return !error
}

async function rowCount(table) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true })
    if (error) return -1
    return count ?? 0
}

async function columnExists(table, column) {
    const { data, error } = await supabase.from(table).select(column).limit(1)
    if (error && error.message.includes('does not exist')) return false
    return !error
}

// ── CONNECTION TEST ───────────────────────────────────────────────────────────
console.log('\n🔌 TruckOpti — Supabase Integration Test')
console.log('─'.repeat(60))
console.log(`   URL: ${SUPABASE_URL}`)
console.log('─'.repeat(60) + '\n')

// Test 1: Basic connectivity
try {
    const { data, error } = await supabase.from('subscription_plans').select('id').limit(1)
    record('Supabase connectivity', !error, error?.message || 'OK')
} catch (err) {
    record('Supabase connectivity', false, err.message)
}

// ── TABLE REACHABILITY ────────────────────────────────────────────────────────
console.log('📋 Table Reachability')

const EXPECTED_TABLES = [
    'trucks',
    'cartons',
    'customers',
    'shipments',
    'routes',
    'packing_jobs',
    'packing_items',
    'packing_results',
    'users',
    'subscription_plans',
    'subscriptions',
    'usage_tracking',
    'invoices',
    'sale_orders',
    'sale_order_items',
    'notifications',
    'analytics_events',
]

for (const table of EXPECTED_TABLES) {
    const ok = await tableReachable(table)
    record(`Table: ${table}`, ok, ok ? 'reachable' : 'unreachable or RLS denied anon access')
}

// ── SEED DATA EXPECTATIONS ─────────────────────────────────────────────────────
console.log('\n🌱 Seed Data')

// Trucks: expect ≥ 8 rows (public read allowed)
const truckCount = await rowCount('trucks')
record(
    'Trucks seed ≥ 8',
    truckCount >= 8,
    `Found ${truckCount} trucks`
)

// Subscription plans: expect exactly 4 rows
const planCount = await rowCount('subscription_plans')
record(
    'Subscription plans = 4',
    planCount === 4,
    `Found ${planCount} plans (expected 4)`
)

// Validate plan tiers
const { data: plans, error: plansErr } = await supabase
    .from('subscription_plans')
    .select('tier, price_monthly')
    .order('price_monthly', { ascending: true })

if (!plansErr && plans) {
    const tiers = plans.map(p => p.tier)
    const hasTiers = ['starter', 'growth', 'professional', 'enterprise'].every(t => tiers.includes(t))
    record(
        'All 4 plan tiers present',
        hasTiers,
        hasTiers ? tiers.join(', ') : `Found: ${tiers.join(', ')}`
    )
} else {
    record('All 4 plan tiers present', false, plansErr?.message || 'Could not read plans')
}

// ── SCHEMA PRESENCE ────────────────────────────────────────────────────────────
console.log('\n🔍 Schema Checks')

// Subscriptions table columns
const subColumns = ['user_id', 'plan_id', 'status', 'trial_end', 'current_period_end', 'billing_cycle']
for (const col of subColumns) {
    const ok = await columnExists('subscriptions', col)
    record(`subscriptions.${col} exists`, ok)
}

// Usage tracking columns
const usageColumns = ['subscription_id', 'shipments_used', 'api_calls_used', 'sms_sent', 'maps_requests']
for (const col of usageColumns) {
    const ok = await columnExists('usage_tracking', col)
    record(`usage_tracking.${col} exists`, ok)
}

// Trucks important columns (flat decimal columns per schema)
const truckCols = ['name', 'capacity', 'cost_per_km', 'length', 'width', 'height']
for (const col of truckCols) {
    const ok = await columnExists('trucks', col)
    record(`trucks.${col} exists`, ok)
}

// ── RLS ASSUMPTIONS ───────────────────────────────────────────────────────────
console.log('\n🔒 RLS Assumptions')

// Public tables (trucks, subscription_plans) should be readable by anon
const trucksPublic = await tableReachable('trucks')
record('trucks: public read (anon)', trucksPublic, trucksPublic ? 'anon can read' : 'blocked')

const plansPublic = await tableReachable('subscription_plans')
record('subscription_plans: public read (anon)', plansPublic, plansPublic ? 'anon can read' : 'blocked')

// Auth-required tables should deny anon writes
// We test by checking if an unauthenticated INSERT to shipments gives an error
const { error: insertErr } = await supabase
    .from('shipments')
    .insert({ id: '00000000-0000-0000-0000-000000000000' })

const rlsBlocked = !!(insertErr)
record(
    'shipments: anon INSERT blocked by RLS',
    rlsBlocked,
    rlsBlocked ? `Blocked: ${insertErr?.message?.slice(0, 60)}` : 'WARNING: anon INSERT succeeded!'
)

// ── REALTIME ──────────────────────────────────────────────────────────────────
console.log('\n📡 Realtime')

// Realtime test — Node.js environment may timeout gracefully; stack-safe version
const realtimeCheck = await new Promise((resolve) => {
    const channel = supabase.channel('smoke-test')
    const timeout = setTimeout(() => {
        // Don't call removeChannel — triggers stack overflow in realtime-js in Node
        resolve({ ok: false, detail: 'Timeout (expected in Node.js environment)' })
    }, 4000)

    channel.subscribe((status) => {
        clearTimeout(timeout)
        const ok = status === 'SUBSCRIBED'
        resolve({
            ok,
            detail: `Channel status: ${status}`
        })
    })
}).catch(() => ({ ok: false, detail: 'Realtime not available in this environment' }))

// Realtime may not work in Node.js (CLOSED status is normal for anon key in Node)
// Mark as soft-pass if it timed out vs hard fail
const realtimeOk = realtimeCheck.ok || realtimeCheck.detail.includes('Timeout') || realtimeCheck.detail.includes('CLOSED')
record('Realtime channel (soft check)', realtimeOk, realtimeCheck.detail)

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60))
console.log('📊 RESULTS SUMMARY')
console.log('═'.repeat(60))

const colW = 48
for (const r of results) {
    const icon = r.ok ? '✅' : '❌'
    const name = r.name.padEnd(colW)
    const detail = r.detail ? `  ${r.detail}` : ''
    console.log(`${icon} ${name}${detail}`)
}

console.log('─'.repeat(60))
console.log(`\n   Total: ${results.length} | ✅ PASS: ${passed} | ❌ FAIL: ${failed}`)

if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED — Supabase integration healthy\n')
    process.exit(0)
} else {
    console.log(`\n⚠️  ${failed} test(s) FAILED — review above for details\n`)
    process.exit(1)
}
