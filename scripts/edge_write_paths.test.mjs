#!/usr/bin/env node
/**
 * Wave 2 launch blocker guard: the legacy agency Edge functions must no longer expose the
 * service-role write actions that bypassed staff scopes, transition rules, employment
 * authority and reservations. The writes now live in database commands
 * (20261015000000_agency_job_truck_commands.sql).
 *
 * Static source check (no network): node scripts/edge_write_paths.test.mjs
 * Exit 0 only when every case passes.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const jobs = read('supabase/functions/agency-portal-jobs/index.ts')
const drivers = read('supabase/functions/agency-portal-drivers/index.ts')

const results = []
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? ' — ' + detail : ''}`)
}

check('W1. agency-portal-jobs no longer accepts update-status', !/'update-status'/.test(jobs))
check('W2. agency-portal-jobs no longer accepts assign-driver', !/'assign-driver'/.test(jobs))
check('W3. agency-portal-jobs never writes agency_jobs (no .update/.insert/.delete/.upsert)', !/agency_jobs'\)\s*\.(update|insert|delete|upsert)/.test(jobs.replace(/\s+/g, ' ')) && !/\.update\(\{/.test(jobs))
check('W4. agency-portal-jobs keeps the read-only list action', /'list'/.test(jobs))
check('W5. agency-portal-drivers no longer accepts assign-truck', !/'assign-truck'/.test(drivers))
check('W6. agency-portal-drivers no longer accepts unassign-truck', !/'unassign-truck'/.test(drivers))
check('W7. agency-portal-drivers never writes agency_trucks', !/agency_trucks'\)\s*\.(update|insert|delete|upsert)/.test(drivers.replace(/\s+/g, ' ')))
check('W8. agency-portal-drivers keeps the read-only snapshot action', /'snapshot'/.test(drivers))
check('W9. the removed actions answer with a clear "moved" refusal, not a silent success', /moved to database commands/i.test(jobs) && /moved to database commands/i.test(drivers))

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} cases passed (static Edge source check)`)
process.exit(failed.length ? 1 : 0)
