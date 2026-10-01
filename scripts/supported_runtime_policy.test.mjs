import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

// Supported runtime policy: build, CI and container must select one supported
// Node LTS line. Node 24 became LTS on 2025-10-28 and is supported until
// 2028-04-30 (maintenance starts 2026-10-20). Node 20 ended maintenance on
// 2026-04-30 and must not be selected anywhere.
// Evidence: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
const SUPPORTED_NODE_MAJOR = '24'

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const rootLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
const dockerfile = fs.readFileSync('Dockerfile', 'utf8')
const ciWorkflow = fs.readFileSync('.github/workflows/frontend-ci.yml', 'utf8')

test('root package.json selects the supported Node 24 LTS runtime', () => {
  assert.match(
    String(packageJson.engines?.node),
    new RegExp(`^${SUPPORTED_NODE_MAJOR}\\.`),
    'root engines.node must pin the supported Node major (e.g. "24.x")',
  )
})

test('root lockfile records the same engines range for clean-install reproducibility', () => {
  assert.equal(
    rootLock.packages?.['']?.engines?.node,
    packageJson.engines.node,
    'package-lock.json root entry must stay in sync with package.json engines',
  )
})

test('production container image runs the supported Node runtime', () => {
  assert.match(
    dockerfile,
    new RegExp(`^FROM node:${SUPPORTED_NODE_MAJOR}-alpine`, 'm'),
    'Dockerfile must build on the supported Node major',
  )
})

test('CI installs dependencies and runs checks on the supported Node runtime', () => {
  assert.match(
    ciWorkflow,
    new RegExp(`node-version:\\s*${SUPPORTED_NODE_MAJOR}\\s*$`, 'm'),
    'frontend CI must run on the supported Node major',
  )
})
