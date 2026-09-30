// Focused policy tests for the canonical launch/closure gates (TO-121).
// Run: node --test scripts/launch_gate_policy.test.mjs
//
// These tests execute the real PowerShell gate scripts inside throwaway fixture
// repositories plus pure helper evaluations against scripts/launch-gates.core.ps1.
// Scenarios required by agent-tasks/011-canonical-readiness-gates.md:
//   missing canonical file, failing command, missing browser/Python,
//   unavailable live credentials, dirty unrelated user files, successful fixture.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const coreScript = path.join(repoRoot, 'scripts', 'launch-gates.core.ps1')

const POWERSHELL = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'

const powershellProbe = spawnSync(POWERSHELL, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
  encoding: 'utf8',
  timeout: 30000,
})
const powershellAvailable = powershellProbe.status === 0
const psSkipMessage = powershellAvailable ? false : 'PowerShell is not available on this host'

function toPsPath(p) {
  return p.split(path.sep).join('/')
}

function evalCore(expression) {
  return spawnSync(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `. '${toPsPath(coreScript)}'; ${expression}`],
    { encoding: 'utf8', timeout: 60000 },
  )
}

function evalCoreJson(expression) {
  const res = evalCore(expression)
  assert.equal(res.status, 0, `core evaluation failed: ${res.stderr || res.stdout}`)
  return JSON.parse(res.stdout)
}

function makeFixture(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `t121-${name}-`))
}

function readJsonMaybeBom(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
}

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, ...rel.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
}

const TASKS_FIXTURE = [
  '# TASKS - Fixture',
  '',
  '| ID | Task | Status | Owner | Brief | Result |',
  '|---|---|---|---|---|---|',
  '| F-1 | Done thing | DONE | someone | `agent-tasks/001-f1.md` | `agent-results/001-f1.md` |',
  '| F-2 | Ready thing | READY | someone | `agent-tasks/002-f2.md` | - |',
  '',
].join('\n')

function seedCanonicalFixture(root) {
  writeFiles(root, {
    'AGENTS.md': '# AGENTS fixture\n',
    'ARCHITECTURE.md': '# ARCHITECTURE fixture\n',
    'TASKS.md': TASKS_FIXTURE,
    'agent-tasks/README.md': '# briefs\n',
    'agent-tasks/001-f1.md': '# brief f1\n',
    'agent-tasks/002-f2.md': '# brief f2\n',
    'agent-results/001-f1.md': '# result f1\n',
  })
}

// Hand-written empty lockfiles let `npm audit --omit=dev` pass offline.
function emptyLock(name) {
  return `${JSON.stringify({
    name,
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: { '': { name, version: '1.0.0', dependencies: {} } },
  })}\n`
}

function seedLaunchFixture(root) {
  seedCanonicalFixture(root)
  writeFiles(root, {
    '.gitignore': 'logs/\nnode_modules/\ndist/\n',
    'package.json': `${JSON.stringify({
      name: 't121-fixture',
      version: '1.0.0',
      scripts: {
        'track-errors': 'node -e ""',
        'test:hidden-errors': 'node -e ""',
      },
      dependencies: {},
    })}\n`,
    'package-lock.json': emptyLock('t121-fixture'),
    'frontend/package.json': `${JSON.stringify({
      name: 't121-fixture-frontend',
      version: '1.0.0',
      scripts: { build: 'node -e ""' },
    })}\n`,
    'frontend/package-lock.json': emptyLock('t121-fixture-frontend'),
    'tools/glue-check.mjs': 'process.exit(0)\n',
  })
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  for (const name of ['launch-gates.core.ps1', 'launch-readiness.ps1', 'close-day.ps1']) {
    fs.copyFileSync(path.join(repoRoot, 'scripts', name), path.join(root, 'scripts', name))
  }
  gitInFixture(root, ['init', '-q'])
  gitInFixture(root, ['add', '-A'])
  gitInFixture(root, ['-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '-qm', 'fixture baseline'])
}

function gitInFixture(root, args) {
  const res = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  assert.equal(res.status, 0, `git ${args.join(' ')} failed in fixture: ${res.stderr}`)
}

function runGateScript(root, scriptName) {
  // Always run the fixture copy so $RepoRoot resolves to the fixture.
  return spawnSync(
    POWERSHELL,
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', scriptName)],
    { cwd: root, encoding: 'utf8', timeout: 300000 },
  )
}

test('verdict: any FAIL forces exit 1; BLOCKED gates prevent production-ready; clean local pass stays local', {
  skip: psSkipMessage,
}, () => {
  const failing = evalCoreJson('Get-GateVerdict -PassCount 3 -FailCount 1 -BlockedCount 2 -SkipCount 0 | ConvertTo-Json -Compress')
  assert.equal(failing.ExitCode, 1)
  assert.equal(failing.ProductionReady, false)

  const blocked = evalCoreJson('Get-GateVerdict -PassCount 20 -FailCount 0 -BlockedCount 2 -SkipCount 1 | ConvertTo-Json -Compress')
  assert.equal(blocked.ExitCode, 0)
  assert.equal(blocked.ProductionReady, false)
  assert.doesNotMatch(blocked.Label, /PRODUCTION_READY/)

  const full = evalCoreJson('Get-GateVerdict -PassCount 23 -FailCount 0 -BlockedCount 0 -SkipCount 0 | ConvertTo-Json -Compress')
  assert.equal(full.ExitCode, 0)
  assert.equal(full.ProductionReady, true)
  assert.match(full.Label, /PRODUCTION_READY/)
})

test('missing canonical file is reported as a gap and a complete control plane is not', { skip: psSkipMessage }, () => {
  const incomplete = makeFixture('canon-missing')
  writeFiles(incomplete, { 'AGENTS.md': '# a\n', 'TASKS.md': '# t\n', 'agent-tasks/README.md': '# r\n' })
  const gaps = evalCoreJson(`ConvertTo-Json -Compress -InputObject @(Get-GateCanonicalControlPlaneGaps -RepoRoot '${toPsPath(incomplete)}')`)
  assert.ok(Array.isArray(gaps), 'gaps must be a list')
  assert.ok(gaps.includes('ARCHITECTURE.md'), `expected ARCHITECTURE.md gap, got: ${JSON.stringify(gaps)}`)

  const complete = makeFixture('canon-complete')
  seedCanonicalFixture(complete)
  const noGaps = evalCoreJson(`ConvertTo-Json -Compress -InputObject @(Get-GateCanonicalControlPlaneGaps -RepoRoot '${toPsPath(complete)}')`)
  assert.deepEqual(noGaps, [])
})

test('dirty unrelated user files block; ignored files do not; allowed paths can be waived', { skip: psSkipMessage }, () => {
  const lines = [' M frontend/src/App.tsx', '?? notes/scratch.txt', 'R  old.md -> new.md', '!! dist/output.js', '']
  const blocking = evalCoreJson(`ConvertTo-Json -Compress -InputObject @(Get-GateBlockingDirtyPaths -StatusLines @('${lines[0]}','${lines[1]}','${lines[2]}','${lines[3]}','${lines[4]}'))`)
  assert.deepEqual(blocking.sort(), ['frontend/src/App.tsx', 'new.md', 'notes/scratch.txt'].sort())

  const waived = evalCoreJson(`ConvertTo-Json -Compress -InputObject @(Get-GateBlockingDirtyPaths -StatusLines @('${lines[0]}','${lines[1]}') -AllowedPaths @('notes/scratch.txt'))`)
  assert.deepEqual(waived, ['frontend/src/App.tsx'])
})

test('missing browser/Python style command probes classify correctly', { skip: psSkipMessage }, () => {
  const nodeAvailable = evalCoreJson(`Test-GateCommandAvailable -CommandName 'node' | ConvertTo-Json -Compress`)
  assert.equal(nodeAvailable, true)
  const missing = evalCoreJson(`Test-GateCommandAvailable -CommandName 't121-definitely-missing-tool' | ConvertTo-Json -Compress`)
  assert.equal(missing, false)
})

test('unavailable live credentials are classified absent; placeholder values never count as configured', { skip: psSkipMessage }, () => {
  const absent = makeFixture('creds-absent')
  assert.equal(evalCoreJson(`Get-GateSupabaseCredentialState -RepoRoot '${toPsPath(absent)}' | ConvertTo-Json -Compress`), 'absent')

  const placeholder = makeFixture('creds-placeholder')
  writeFiles(placeholder, { 'frontend/.env': 'VITE_SUPABASE_URL=replace_me_supabase_url\n' })
  assert.equal(evalCoreJson(`Get-GateSupabaseCredentialState -RepoRoot '${toPsPath(placeholder)}' | ConvertTo-Json -Compress`), 'absent')

  const present = makeFixture('creds-present')
  writeFiles(present, { 'frontend/.env': 'VITE_SUPABASE_URL=https://example-project.supabase.co\n' })
  assert.equal(evalCoreJson(`Get-GateSupabaseCredentialState -RepoRoot '${toPsPath(present)}' | ConvertTo-Json -Compress`), 'present')
})

test('failing commands report their exit code; succeeding commands report zero', { skip: psSkipMessage }, () => {
  const failing = evalCoreJson(`Invoke-GateCommand -Label 'probe-fail' -WorkingDirectory '${toPsPath(os.tmpdir())}' -Command { cmd /c exit 3 } | ConvertTo-Json -Compress`)
  assert.equal(failing.ExitCode, 3)

  const passing = evalCoreJson(`Invoke-GateCommand -Label 'probe-pass' -WorkingDirectory '${toPsPath(os.tmpdir())}' -Command { node -e "process.exit(0)" } | ConvertTo-Json -Compress`)
  assert.equal(passing.ExitCode, 0)
})

test('retired 0.dev-matrix framework references are gone from active gate surfaces', () => {
  const retiredMarkers = [
    /0\.dev-matrix/,
    /deep-error-scanner/,
    /AI-HANDOFF/,
    /resume-work/,
    /pause-work/,
    /project-progress/,
    /LAUNCH_CHECKLIST/,
    /TREE-HYGIENE/,
    /DOCUMENTATION-GOVERNANCE/,
    /CLOSING-DAY/,
    /RUNTIME-ERROR-LOOP/,
    /STATE\.md/,
    /DISCUSSION\.md/,
  ]
  const surfaces = [
    'scripts/launch-readiness.ps1',
    'scripts/close-day.ps1',
    'scripts/test-hidden-errors.ps1',
    'scripts/track-errors.ps1',
    'package.json',
  ]
  for (const rel of surfaces) {
    const content = fs.readFileSync(path.join(repoRoot, rel), 'utf8')
    for (const marker of retiredMarkers) {
      assert.doesNotMatch(content, marker, `${rel} must not reference retired framework artifact ${marker}`)
    }
  }
})

test('every root npm script file target exists (deep-scan retirement enforced)', { skip: psSkipMessage }, () => {
  const gaps = evalCoreJson(`ConvertTo-Json -Compress -InputObject @(Get-GateNpmScriptTargetGaps -RepoRoot '${toPsPath(repoRoot)}')`)
  assert.deepEqual(gaps, [], `broken npm script file targets: ${JSON.stringify(gaps)}`)

  const synthetic = makeFixture('npm-targets')
  writeFiles(synthetic, {
    'package.json': `${JSON.stringify({ scripts: { 'deep-scan': 'node 0.dev-matrix/deep-error-scanner.mjs' } })}\n`,
  })
  const syntheticGaps = evalCoreJson(`ConvertTo-Json -Compress -InputObject @(Get-GateNpmScriptTargetGaps -RepoRoot '${toPsPath(synthetic)}')`)
  assert.equal(syntheticGaps.length, 1)
  assert.match(syntheticGaps[0], /deep-scan/)
  assert.match(syntheticGaps[0], /0\.dev-matrix\/deep-error-scanner\.mjs/)
})

test('real TASKS.md board resolves its brief/result references and names a READY next task', { skip: psSkipMessage }, () => {
  const board = evalCoreJson(`Get-GateTaskBoardReport -RepoRoot '${toPsPath(repoRoot)}' | ConvertTo-Json -Depth 5 -Compress`)
  assert.deepEqual(board.MissingBriefs, [], `missing briefs: ${JSON.stringify(board.MissingBriefs)}`)
  assert.deepEqual(board.MissingResults, [], `missing results: ${JSON.stringify(board.MissingResults)}`)
  assert.deepEqual(board.TerminalRowsWithoutResult, [], `terminal rows without results: ${JSON.stringify(board.TerminalRowsWithoutResult)}`)
  assert.deepEqual(board.ParseErrors, [])
  assert.ok(board.RowsFound >= 20, `expected the full task board, found ${board.RowsFound} rows`)
  assert.ok(board.NextRecommended, 'board must name a next recommended task')
  assert.match(board.NextRecommended.Status, /^READY/)
  assert.ok(board.NextRecommended.Brief, 'next recommended task must carry a brief reference')
})

test('launch-check on a clean fixture passes locally but refuses a production-ready verdict', { skip: psSkipMessage, timeout: 300000 }, () => {
  const root = makeFixture('launch-ok')
  seedLaunchFixture(root)
  const res = runGateScript(root, 'launch-readiness.ps1')
  const output = `${res.stdout}\n${res.stderr}`
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}\n${output}`)
  assert.match(output, /LOCAL GATES PASSED/)
  assert.match(output, /PRODUCTION NOT PROVEN/)
  assert.doesNotMatch(output, /ALL GATES PASSED/)
  assert.doesNotMatch(output, /\[FAIL\]/)
  assert.equal(fs.existsSync(path.join(root, '0.dev-matrix')), false, 'launch-check must not recreate 0.dev-matrix')

  const statusPath = path.join(root, 'logs', 'launch-check', 'launch-check-status.json')
  assert.equal(fs.existsSync(statusPath), true, 'launch-check must record machine-readable status')
  const status = readJsonMaybeBom(statusPath)
  assert.equal(status.state, 'passed')
  assert.equal(status.productionReady, false)
  assert.equal(status.fail, 0)
  assert.ok(status.blocked >= 1, 'production gates must be recorded as blocked without credentials')

  // Evidence trail: the status log pointer must resolve to a flushed transcript.
  assert.equal(typeof status.log, 'string', 'status must name its transcript log')
  const transcriptPath = path.join(root, ...status.log.split('/'))
  assert.equal(fs.existsSync(transcriptPath), true, `transcript log must exist at ${status.log}`)
  const transcript = fs.readFileSync(transcriptPath, 'utf8')
  assert.match(transcript, /TruckOpti Launch-Readiness Check/)
  assert.match(transcript, /RESULT:/)
})

test('launch-check fails the run when a gate command fails', { skip: psSkipMessage, timeout: 300000 }, () => {
  const root = makeFixture('launch-cmdfail')
  seedLaunchFixture(root)
  fs.writeFileSync(path.join(root, 'tools', 'glue-check.mjs'), 'process.exit(1)\n')
  gitInFixture(root, ['add', '-A'])
  gitInFixture(root, ['-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '-qm', 'break glue'])

  const res = runGateScript(root, 'launch-readiness.ps1')
  const output = `${res.stdout}\n${res.stderr}`
  assert.notEqual(res.status, 0, 'a failing gate command must fail launch-check')
  assert.match(output, /\[FAIL\]/)
  assert.match(output, /GATE\(S\) FAILED/)

  const status = readJsonMaybeBom(path.join(root, 'logs', 'launch-check', 'launch-check-status.json'))
  assert.equal(status.state, 'failed')
  assert.equal(status.productionReady, false)
})

test('launch-check fails on dirty unrelated user files', { skip: psSkipMessage, timeout: 300000 }, () => {
  const root = makeFixture('launch-dirty')
  seedLaunchFixture(root)
  fs.writeFileSync(path.join(root, 'unrelated-user-note.txt'), 'user scratch\n')

  const res = runGateScript(root, 'launch-readiness.ps1')
  const output = `${res.stdout}\n${res.stderr}`
  assert.notEqual(res.status, 0, 'unrelated dirty files must fail launch-check')
  assert.match(output, /unrelated-user-note\.txt/)
})

test('close-day consumes the task board and writes its report under logs/ without retired artifacts', { skip: psSkipMessage, timeout: 300000 }, () => {
  const root = makeFixture('close-ok')
  seedCanonicalFixture(root)
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  for (const name of ['launch-gates.core.ps1', 'close-day.ps1']) {
    fs.copyFileSync(path.join(repoRoot, 'scripts', name), path.join(root, 'scripts', name))
  }
  gitInFixture(root, ['init', '-q'])
  gitInFixture(root, ['add', '-A'])
  gitInFixture(root, ['-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '-qm', 'fixture baseline'])

  const res = runGateScript(root, 'close-day.ps1')
  const output = `${res.stdout}\n${res.stderr}`
  assert.equal(res.status, 0, `expected exit 0, got ${res.status}\n${output}`)
  assert.equal(fs.existsSync(path.join(root, '0.dev-matrix')), false, 'close-day must not recreate 0.dev-matrix')

  const reportPath = path.join(root, 'logs', 'closeout', 'last-closeout.md')
  assert.equal(fs.existsSync(reportPath), true, 'close-day must write its report under logs/closeout/')
  const report = fs.readFileSync(reportPath, 'utf8')
  assert.match(report, /F-2/)
  assert.match(report, /READY/)
  assert.doesNotMatch(report, /AI Handoff/)
})

test('close-day fails when a DONE task lacks its result record', { skip: psSkipMessage, timeout: 300000 }, () => {
  const root = makeFixture('close-missing-result')
  seedCanonicalFixture(root)
  fs.writeFileSync(path.join(root, 'TASKS.md'), TASKS_FIXTURE.replace('agent-results/001-f1.md', 'agent-results/404-missing.md'))
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true })
  for (const name of ['launch-gates.core.ps1', 'close-day.ps1']) {
    fs.copyFileSync(path.join(repoRoot, 'scripts', name), path.join(root, 'scripts', name))
  }
  gitInFixture(root, ['init', '-q'])
  gitInFixture(root, ['add', '-A'])
  gitInFixture(root, ['-c', 'user.email=fixture@example.com', '-c', 'user.name=fixture', 'commit', '-qm', 'fixture baseline'])

  const res = runGateScript(root, 'close-day.ps1')
  const output = `${res.stdout}\n${res.stderr}`
  assert.notEqual(res.status, 0, 'a DONE row without its result record must fail close-day')
  assert.match(output, /404-missing\.md/)
})
