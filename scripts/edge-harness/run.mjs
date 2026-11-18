// Bundles a Supabase Edge function with esbuild (Node, no Deno) and runs its captured handler.
import { createRequire } from 'node:module'
import { mkdtempSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createFake } from './fake.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const functionsDir = resolve(here, '../../supabase/functions')
const require = createRequire(resolve(here, '../../frontend/package.json'))
const esbuild = require('esbuild')

export function listFunctions() {
  return readdirSync(functionsDir)
    .filter((n) => !n.startsWith('_') && statSync(join(functionsDir, n)).isDirectory() && existsSync(join(functionsDir, n, 'index.ts')))
    .sort()
}

function aliasPlugin(unresolved) {
  return {
    name: 'edge-alias',
    setup(build) {
      build.onResolve({ filter: /^https:\/\/deno\.land\/std@0\.168\.0\/http\/server\.ts$/ }, () => ({ path: join(here, 'serve-stub.mjs') }))
      build.onResolve({ filter: /^https:\/\/esm\.sh\/@supabase\/supabase-js@/ }, () => ({ path: join(here, 'fake-supabase-module.mjs') }))
      build.onResolve({ filter: /^https?:\/\// }, (args) => {
        unresolved.push({ import: args.path, importer: args.importer })
        return { path: args.path, external: true }
      })
    },
  }
}

/** Bundles one function; returns { code, unresolved, errors }. Never throws on resolve problems. */
export async function bundleFunction(name) {
  const unresolved = []
  try {
    const result = await esbuild.build({
      entryPoints: [join(functionsDir, name, 'index.ts')],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      logLevel: 'silent',
      plugins: [aliasPlugin(unresolved)],
    })
    return { code: result.outputFiles[0].text, unresolved, errors: [] }
  } catch (error) {
    const errors = (error.errors ?? [{ text: String(error) }]).map((e) => e.text)
    return { code: null, unresolved, errors }
  }
}

let outDir = null
let counter = 0

/**
 * Loads the function once and returns a harness. Per-test state (env, fetch, fake client) is reset
 * with h.reset(); the same captured handler is reused.
 */
export async function loadFunction(name) {
  const bundled = await bundleFunction(name)
  if (!bundled.code) throw new Error('bundle failed for ' + name + ': ' + bundled.errors.join('; '))
  outDir ??= mkdtempSync(join(tmpdir(), 'edge-harness-'))
  const file = join(outDir, name + '-' + counter++ + '.mjs')
  writeFileSync(file, bundled.code)

  const state = { env: {}, fake: createFake(), handler: null, fetchCalls: [], fetchHandler: null }
  globalThis.__edgeHarness = state
  globalThis.Deno = {
    env: { get: (key) => globalThis.__edgeHarness.env[key] },
    serve: (handler) => { globalThis.__edgeHarness.handler = handler },
  }
  globalThis.fetch = async (input, init) => {
    const h = globalThis.__edgeHarness
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    h.fetchCalls.push({ url, init })
    if (!h.fetchHandler) throw new Error('edge-harness: unexpected fetch to ' + url)
    return h.fetchHandler(url, init)
  }
  if (!process.env.EDGE_HARNESS_VERBOSE) {
    console.log = () => {}
    console.error = () => {}
    console.warn = () => {}
  }
  await import(pathToFileURL(file).href)
  if (!state.handler) throw new Error(name + ' never registered a handler')

  return {
    get fake() { return state.fake },
    get fetchCalls() { return state.fetchCalls },
    reset({ env = {}, fetch: fetchHandler = null } = {}) {
      state.env = { ...env }
      state.fake = createFake()
      state.fetchCalls = []
      state.fetchHandler = fetchHandler
      globalThis.__edgeHarness = state
    },
    call(url, init) {
      globalThis.__edgeHarness = state
      return state.handler(new Request(url, init))
    },
  }
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
