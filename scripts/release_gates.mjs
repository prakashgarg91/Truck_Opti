#!/usr/bin/env node
/**
 * Release gates 1-6 of docs/FABLE-RULINGS-2026-11-17-B.md section 3 ("Ready for staging").
 *
 *   node scripts/release_gates.mjs                  run gates 1-6          (npm run release:gates)
 *   node scripts/release_gates.mjs --fast           skip gate 3 (race) and gate 5 (journey)
 *   node scripts/release_gates.mjs --only 1,4       run only the listed gate numbers (or --only 1 4)
 *   node scripts/release_gates.mjs --json           print results as JSON on stdout (report is still written)
 *
 * Every check is a child process with a timeout. Only the last 30 lines of its output are kept,
 * with secret-looking values masked. This runner never reads .env files; child scripts load
 * whatever they load themselves (the proof scripts read only their documented names).
 *
 * Report: logs/release-gates/<UTC timestamp>.md (logs/ is gitignored).
 * Verdict: "READY FOR STAGING" only when every check of gates 1-6 is PASS. Exit 0 only then.
 * SKIPPED counts as NOT READY.
 *
 * Not checked by this runner: the independent Codex review of the diff (gate 6, manual).
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const FRONTEND = join(ROOT, 'frontend')
const RACE_MODULES = 'D:/tmp/pgrace'
const TAIL_LINES = 30
const MAX_BUFFER = 4_000_000
const MIN = 60_000
const TIMEOUT_SHORT = 10 * MIN
const TIMEOUT_LONG = 30 * MIN

const GATE_NAMES = {
  1: 'Typecheck, lint, unit tests, build',
  2: 'DB batteries (scripts/*.db.test.mjs)',
  3: 'Concurrency races on real PostgreSQL',
  4: 'Edge writes, types drift, prod config, edge harness, secrets',
  5: 'Journey (desktop), screenshots kept',
  6: 'Razorpay sandbox proof (dry run)',
}

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = { fast: false, json: false, only: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--fast') opts.fast = true
    else if (arg === '--json') opts.json = true
    else if (arg === '--only') {
      const nums = []
      while (i + 1 < argv.length && /^\d+(,\d+)*$/.test(argv[i + 1])) {
        nums.push(...argv[++i].split(',').map(Number))
      }
      if (nums.length === 0) throw new Error('--only needs gate numbers, for example: --only 1,4')
      opts.only = new Set(nums)
    } else {
      throw new Error(`unknown argument: ${arg} (valid: --fast, --only <gates>, --json)`)
    }
  }
  if (opts.only) {
    for (const n of opts.only) {
      if (!(n >= 1 && n <= 6)) throw new Error(`gate ${n} does not exist (gates are 1-6)`)
    }
  }
  return opts
}

// ---------------------------------------------------------------- redaction

const SECRET_RULES = [
  [/\b(rzp_(?:test|live)_)[A-Za-z0-9]+/g, '$1[REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, '[REDACTED_JWT]'],
  [/\bsbp_[A-Za-z0-9_-]{8,}/g, '[REDACTED_TOKEN]'],
  [/\bsk_(?:test|live)_[A-Za-z0-9]+/g, '[REDACTED_TOKEN]'],
  [/(\b[A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|SALT|DSN)[A-Za-z0-9_]*\s*[=:]\s*)\S+/gi, '$1[REDACTED]'],
  [/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]'],
  [/(postgres(?:ql)?:\/\/)[^\s'"]+/gi, '$1[REDACTED]'],
  [/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi, '$1[REDACTED]@'],
]

function redact(text) {
  return SECRET_RULES.reduce((t, [re, rep]) => t.replace(re, rep), text)
}

function tailLines(text, n = TAIL_LINES) {
  const lines = redact(text).split(/\r?\n/).map((l) => l.replace(/\s+$/, ''))
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.slice(-n)
}

// ---------------------------------------------------------------- process runner

function killTree(child) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGKILL')
  }
}

function runProcess({ command, cwd, env, timeoutMs }) {
  return new Promise((done) => {
    const started = Date.now()
    let output = ''
    let timedOut = false
    const child = spawn(command, {
      cwd,
      env: { ...process.env, ...(env ?? {}) },
      shell: true,
      windowsHide: true,
    })
    const onData = (chunk) => {
      output += chunk.toString('utf8')
      if (output.length > MAX_BUFFER) output = output.slice(-MAX_BUFFER)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)
    child.on('error', (err) => {
      output += `\nspawn error: ${err.message}`
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ exitCode: timedOut ? null : code, timedOut, durationMs: Date.now() - started, output })
    })
  })
}

// ---------------------------------------------------------------- checks

function npmScript(name) {
  return { command: `npm run ${name}`, cwd: ROOT }
}

function dbTestCheck(file) {
  return {
    id: `2.${file}`,
    label: file,
    command: `node "scripts/${file}"`,
    cwd: ROOT,
    timeoutMs: TIMEOUT_SHORT,
    summarize: (out) => {
      const matches = [...redact(out).matchAll(/(\d+)\/(\d+) cases passed/g)]
      if (matches.length === 0) return { detail: 'no "N/M cases passed" line in output' }
      const last = matches[matches.length - 1]
      return { detail: `${last[1]}/${last[2]} cases passed`, cases: `${last[1]}/${last[2]} cases passed` }
    },
  }
}

function buildGates() {
  const pkg = JSON.parse(readFileSync(join(FRONTEND, 'package.json'), 'utf8'))
  const lintCommand = pkg.scripts?.lint ? 'npm run lint' : 'npx eslint src --max-warnings 0'
  const dbFiles = readdirSync(join(ROOT, 'scripts'))
    .filter((f) => f.endsWith('.db.test.mjs'))
    .sort()
  const raceAvailable = existsSync(RACE_MODULES)
  const raceEnv = { RACE_MODULES }

  return {
    1: [
      { id: '1.tsc', label: 'frontend: tsc --noEmit', command: 'npx tsc --noEmit', cwd: FRONTEND, timeoutMs: TIMEOUT_SHORT },
      { id: '1.lint', label: `frontend: ${lintCommand}`, command: lintCommand, cwd: FRONTEND, timeoutMs: TIMEOUT_SHORT },
      { id: '1.vitest', label: 'frontend: vitest run', command: 'npx vitest run', cwd: FRONTEND, timeoutMs: TIMEOUT_LONG },
      {
        id: '1.build',
        label: 'frontend: npm run build',
        command: 'npm run build',
        cwd: FRONTEND,
        timeoutMs: TIMEOUT_LONG,
        note: 'build script (tsc && vite build) takes no --outDir, so it writes frontend/dist (gitignored)',
      },
    ],
    2: dbFiles.map(dbTestCheck),
    3: [
      { id: '3.race', label: 'npm run test:race', ...npmScript('test:race'), env: raceEnv, timeoutMs: TIMEOUT_LONG },
      {
        id: '3.race-new-commands',
        label: 'race: scripts/race/new_commands.race.mjs',
        command: 'node scripts/race/new_commands.race.mjs',
        cwd: ROOT,
        env: raceEnv,
        timeoutMs: TIMEOUT_LONG,
      },
      {
        id: '3.race-subscription',
        label: 'race: scripts/race/subscription.race.mjs',
        command: 'node scripts/race/subscription.race.mjs',
        cwd: ROOT,
        env: raceEnv,
        timeoutMs: TIMEOUT_LONG,
      },
    ].map((c) =>
      raceAvailable ? c : { ...c, skip: `SKIPPED: ${RACE_MODULES} is missing (embedded-postgres + pg not installed there)` },
    ),
    4: [
      { id: '4.edge-writes', label: 'npm run test:edge-writes', ...npmScript('test:edge-writes'), timeoutMs: TIMEOUT_LONG },
      { id: '4.types-drift', label: 'npm run types:drift', ...npmScript('types:drift'), timeoutMs: TIMEOUT_SHORT },
      { id: '4.prod-config', label: 'npm run test:prod-config', ...npmScript('test:prod-config'), timeoutMs: TIMEOUT_SHORT },
      { id: '4.edge-harness', label: 'npm run test:edge-harness', ...npmScript('test:edge-harness'), timeoutMs: TIMEOUT_SHORT },
      { id: '4.secrets', label: 'npm run test:secrets', ...npmScript('test:secrets'), timeoutMs: TIMEOUT_SHORT },
    ],
    5: [
      { id: '5.journey', label: 'npm run test:journey', ...npmScript('test:journey'), env: raceEnv, timeoutMs: TIMEOUT_LONG },
      {
        id: '5.evidence',
        label: 'evidence/journey has screenshots',
        custom: () => {
          const dir = join(ROOT, 'evidence', 'journey')
          if (!existsSync(dir)) return { status: 'FAIL', detail: 'evidence/journey does not exist' }
          const images = readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f))
          if (images.length === 0) return { status: 'FAIL', detail: 'evidence/journey has no screenshots' }
          return { status: 'PASS', detail: `${images.length} screenshots in evidence/journey` }
        },
      },
    ],
    6: [
      {
        id: '6.razorpay-dry-run',
        label: 'node scripts/razorpay_sandbox_proof.mjs --dry-run',
        command: 'node scripts/razorpay_sandbox_proof.mjs --dry-run',
        cwd: ROOT,
        timeoutMs: TIMEOUT_SHORT,
      },
    ],
  }
}

function skipReasonFor(gate, opts) {
  if (opts.only && !opts.only.has(gate)) return 'not selected (--only)'
  if (opts.fast && (gate === 3 || gate === 5)) return 'skipped by --fast'
  return null
}

async function runCheck(check) {
  if (check.skip) {
    return { ...check, status: 'SKIPPED', durationMs: 0, exitCode: null, detail: check.skip, tail: [] }
  }
  if (check.custom) {
    const r = check.custom()
    return { ...check, status: r.status, durationMs: 0, exitCode: null, detail: r.detail, tail: [] }
  }
  process.stderr.write(`[${check.id}] ${check.label} ...\n`)
  const r = await runProcess({ command: check.command, cwd: check.cwd, env: check.env, timeoutMs: check.timeoutMs })
  const ok = !r.timedOut && r.exitCode === 0
  const summary = check.summarize ? check.summarize(r.output) : {}
  let detail = ''
  if (r.timedOut) detail = `timeout after ${Math.round(check.timeoutMs / 1000)}s`
  else if (!ok) detail = [`exit ${r.exitCode}`, summary.detail].filter(Boolean).join('; ')
  else detail = summary.detail ?? check.note ?? ''
  return {
    ...check,
    status: ok ? 'PASS' : 'FAIL',
    durationMs: r.durationMs,
    exitCode: r.timedOut ? null : r.exitCode,
    detail,
    cases: summary.cases ?? null,
    tail: tailLines(r.output),
  }
}

// ---------------------------------------------------------------- git and output

function git(args, { trim = true } = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  if (r.status !== 0) return null
  return trim ? r.stdout.trim() : r.stdout
}

function formatTable(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)))
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ')
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n')
}

function fmtDuration(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function buildMarkdown({ stamp, commit, dirtyPaths, opts, results, gateStatus, verdict }) {
  const out = []
  out.push('# Release gates report', '')
  out.push(`- UTC run: ${stamp}`)
  out.push(`- Git commit: \`${commit}\``)
  out.push(
    dirtyPaths === null
      ? '- Working tree: unknown (git status failed)'
      : dirtyPaths.length === 0
        ? '- Working tree: clean'
        : `- Working tree: DIRTY (${dirtyPaths.length} paths: ${dirtyPaths.slice(0, 20).join(', ')}${dirtyPaths.length > 20 ? ', ...' : ''})`,
  )
  out.push(`- Mode: ${opts.fast ? '--fast' : 'full'}${opts.only ? `, --only ${[...opts.only].join(',')}` : ''}`)
  out.push(`- Node: ${process.version}`, '')
  out.push('## Gate status', '')
  out.push('| Gate | Name | Status |', '| --- | --- | --- |')
  for (const g of [1, 2, 3, 4, 5, 6]) out.push(`| ${g} | ${GATE_NAMES[g]} | ${gateStatus[g]} |`)
  out.push('', '## Checks', '')
  out.push('| Gate | Check | Status | Duration | Exit | Detail |', '| --- | --- | --- | --- | --- | --- |')
  for (const r of results) {
    const exit = r.exitCode === null || r.exitCode === undefined ? '-' : String(r.exitCode)
    const detail = (r.detail || '').replace(/\|/g, '\\|')
    out.push(`| ${r.gate} | ${r.label} | ${r.status} | ${fmtDuration(r.durationMs)} | ${exit} | ${detail} |`)
  }
  out.push('', '## Output tails (last 30 lines, secrets masked)', '')
  for (const r of results) {
    if (!r.tail || r.tail.length === 0) continue
    out.push(`### ${r.id}: ${r.label} (${r.status})`, '', '```text', ...r.tail, '```', '')
  }
  out.push(`**Verdict: ${verdict}**`, '')
  out.push('Not checked by this runner (manual): independent Codex review of the diff (gate 6).', '')
  return out.join('\n')
}

// ---------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const gates = buildGates()
  const results = []

  for (const gate of [1, 2, 3, 4, 5, 6]) {
    const reason = skipReasonFor(gate, opts)
    for (const check of gates[gate]) {
      if (reason) {
        results.push({ ...check, gate, status: 'SKIPPED', durationMs: 0, exitCode: null, detail: reason, tail: [] })
        continue
      }
      const r = await runCheck(check)
      results.push({ ...r, gate })
    }
  }

  const gateStatus = {}
  for (const g of [1, 2, 3, 4, 5, 6]) {
    const mine = results.filter((r) => r.gate === g).map((r) => r.status)
    gateStatus[g] = mine.includes('FAIL') ? 'FAIL' : mine.every((s) => s === 'PASS') ? 'PASS' : 'SKIPPED'
  }
  const ready = [1, 2, 3, 4, 5, 6].every((g) => {
    const mine = results.filter((r) => r.gate === g)
    return mine.length > 0 && mine.every((r) => r.status === 'PASS')
  })
  const verdict = ready ? 'READY FOR STAGING' : 'NOT READY'

  const commit = git(['rev-parse', 'HEAD']) ?? 'unknown'
  const statusOut = git(['status', '--porcelain'], { trim: false })
  const dirtyPaths = statusOut === null ? null : statusOut.split('\n').filter(Boolean).map((l) => l.slice(3))
  const stamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '')

  const reportDir = join(ROOT, 'logs', 'release-gates')
  mkdirSync(reportDir, { recursive: true })
  const reportPath = join(reportDir, `${stamp}.md`)
  writeFileSync(
    reportPath,
    buildMarkdown({ stamp, commit, dirtyPaths, opts, results, gateStatus, verdict }),
    'utf8',
  )

  if (opts.json) {
    const payload = {
      verdict,
      utc: stamp,
      commit,
      dirty: dirtyPaths === null ? null : dirtyPaths.length > 0,
      report: reportPath,
      gates: gateStatus,
      checks: results.map((r) => ({
        gate: r.gate,
        id: r.id,
        label: r.label,
        status: r.status,
        durationMs: r.durationMs,
        exitCode: r.exitCode ?? null,
        detail: r.detail,
        cases: r.cases ?? null,
      })),
    }
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
  } else {
    const rows = results.map((r) => [
      r.gate,
      r.label,
      r.status,
      fmtDuration(r.durationMs),
      r.exitCode === null || r.exitCode === undefined ? '-' : r.exitCode,
      r.detail,
    ])
    console.log(`\nRelease gates (commit ${commit.slice(0, 12)}, ${dirtyPaths?.length ? 'DIRTY' : 'clean'} tree)\n`)
    console.log(formatTable(['Gate', 'Check', 'Status', 'Time', 'Exit', 'Detail'], rows))
    console.log(`\nReport: ${reportPath}`)
    console.log(`\nVerdict: ${verdict}`)
  }

  process.exitCode = ready ? 0 : 1
}

main().catch((err) => {
  console.error(`release_gates: ${err.message}`)
  process.exitCode = 2
})
