// Deployment health drift check (TO-132).
//
// Validates that a deployed release answers its health probes with JSON, not
// merely with HTTP 200. A drifted deployment (an older server.js without the
// probe routes, or an SPA fallback serving index.html for every path) returns
// HTML here and this check fails with an explicit `spa-fallback` verdict.
//
// Usage:
//   node scripts/check-deployment-health.mjs [--timeout=ms] [--json] [baseUrl ...]
//
// Defaults to HEALTH_BASE_URL, then http://127.0.0.1:3000.
// Exit codes: 0 = all probes healthy, 1 = drift/failure, 2 = usage error.
//
// Contract checked:
//   GET /healthz -> 200, application/json, { "status": "ok" }
//   GET /readyz  -> 200, application/json, { "status": "ready" }
//                   (503 { "status": "not_ready" } is a readiness failure)
//
// These probes prove process liveness and frontend-artifact readiness only;
// they do not prove Supabase, auth or payment provider availability.

import { pathToFileURL } from 'node:url'

export const HEALTH_PROBES = [
  { path: '/healthz', healthyStatus: 'ok' },
  { path: '/readyz', healthyStatus: 'ready' },
]

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_BASE_URL = 'http://127.0.0.1:3000'
const BODY_SNIPPET_LENGTH = 120
const MAX_BODY_READ = 4096

const bodySnippet = (body) => {
  const trimmed = String(body ?? '').trim()
  if (!trimmed) {
    return '(empty body)'
  }
  return trimmed.length > BODY_SNIPPET_LENGTH ? `${trimmed.slice(0, BODY_SNIPPET_LENGTH)}…` : trimmed
}

const failure = (path, verdict, message, probe = {}) => ({
  path,
  url: probe.url,
  status: probe.status,
  contentType: probe.contentType,
  ok: false,
  verdict,
  message,
})

/**
 * Classifies one health probe response. Pure function so the drift rules can
 * be tested without a running deployment.
 *
 * @param {{ path: string, status?: number, contentType?: string, body?: string, url?: string }} probe
 */
export function classifyProbe(probe) {
  const { path } = probe
  const status = Number(probe.status)
  const contentType = String(probe.contentType ?? '')
  const mediaType = contentType.split(';')[0].trim().toLowerCase()
  const body = String(probe.body ?? '')
  const trimmed = body.trim()

  const looksLikeHtml =
    mediaType === 'text/html' ||
    /^<!doctype html/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed) ||
    /^<head[\s>]/i.test(trimmed)

  if (looksLikeHtml) {
    return failure(
      path,
      'spa-fallback',
      `SPA fallback HTML served instead of ${path} JSON — the deployed release is drifted from server.js (content-type "${mediaType || '(missing)'}", body starts "${bodySnippet(body)}")`,
      probe,
    )
  }

  if (status >= 300 && status < 400) {
    return failure(
      path,
      'redirect',
      `${path} returned a ${status} redirect instead of a direct JSON response; probe the canonical https URL`,
      probe,
    )
  }

  if (status !== 200 && !(path === '/readyz' && status === 503)) {
    return failure(path, 'http-status', `${path} returned HTTP ${status} (body: ${bodySnippet(body)})`, probe)
  }

  if (mediaType !== 'application/json') {
    return failure(
      path,
      'content-type',
      `${path} returned content-type "${mediaType || '(missing)'}" instead of application/json`,
      probe,
    )
  }

  let payload
  try {
    payload = JSON.parse(trimmed)
  } catch {
    return failure(path, 'unparseable-json', `${path} body is not valid JSON (body: ${bodySnippet(body)})`, probe)
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.status !== 'string') {
    return failure(
      path,
      'payload-shape',
      `${path} JSON does not contain a string "status" field (body: ${bodySnippet(body)})`,
      probe,
    )
  }

  const expected = HEALTH_PROBES.find((entry) => entry.path === path)?.healthyStatus

  if (path === '/readyz' && (status === 503 || payload.status === 'not_ready')) {
    return failure(
      path,
      'not-ready',
      `${path} reports not_ready (HTTP ${status}): the running release is missing the frontend artifact`,
      probe,
    )
  }

  if (expected && payload.status !== expected) {
    return failure(
      path,
      'payload-value',
      `${path} reports status "${payload.status}" instead of "${expected}"`,
      probe,
    )
  }

  return {
    path,
    url: probe.url,
    status,
    contentType: mediaType,
    ok: true,
    verdict: 'healthy',
    message: `${path} returned HTTP ${status} application/json {"status":"${payload.status}"}`,
  }
}

const describeError = (error) => (error instanceof Error ? error.message : String(error))

async function readBody(response) {
  try {
    const text = await response.text()
    return text.slice(0, MAX_BODY_READ)
  } catch (error) {
    return `(unreadable body: ${error instanceof Error ? error.message : String(error)})`
  }
}

/** Probes one endpoint and classifies the response. Never throws. */
export async function probeEndpoint(baseUrl, path, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const url = new URL(path, baseUrl).toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'truckopti-deployment-health-check/1.0' },
    })
    return classifyProbe({
      path,
      url,
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      body: await readBody(response),
    })
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : describeError(error)
    return failure(path, 'unreachable', `${path} probe failed: ${reason}`, { url })
  } finally {
    clearTimeout(timer)
  }
}

/** Runs every health probe against one base URL. */
export async function checkBaseUrl(baseUrl, options = {}) {
  const probes = []
  for (const probe of HEALTH_PROBES) {
    probes.push(await probeEndpoint(baseUrl, probe.path, options))
  }
  return { baseUrl, ok: probes.every((probe) => probe.ok), probes }
}

function parseArgs(argv) {
  const baseUrls = []
  const options = { timeoutMs: DEFAULT_TIMEOUT_MS, json: false }

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg.startsWith('--timeout=')) {
      const value = Number(arg.slice('--timeout='.length))
      if (!Number.isFinite(value) || value <= 0) {
        return { error: `Invalid --timeout value: ${arg}` }
      }
      options.timeoutMs = value
      continue
    }
    if (arg.startsWith('-')) {
      return { error: `Unknown option: ${arg}` }
    }
    baseUrls.push(arg)
  }

  if (baseUrls.length === 0) {
    baseUrls.push(process.env.HEALTH_BASE_URL || DEFAULT_BASE_URL)
  }

  return { baseUrls, options }
}

const USAGE = 'Usage: node scripts/check-deployment-health.mjs [--timeout=ms] [--json] [baseUrl ...]'

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv)
  if (parsed.error) {
    console.error(parsed.error)
    console.error(USAGE)
    return 2
  }

  const results = []
  for (const baseUrl of parsed.baseUrls) {
    results.push(await checkBaseUrl(baseUrl, { timeoutMs: parsed.options.timeoutMs }))
  }

  if (parsed.options.json) {
    console.log(JSON.stringify(results, null, 2))
  } else {
    for (const result of results) {
      for (const probe of result.probes) {
        const marker = probe.ok ? ' OK ' : 'FAIL'
        console.log(`[${marker}] ${probe.url ?? `${result.baseUrl}${probe.path}`} ${probe.verdict}: ${probe.message}`)
      }
    }
  }

  return results.every((result) => result.ok) ? 0 : 1
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(`deployment health check crashed: ${describeError(error)}`)
      process.exitCode = 1
    })
}
