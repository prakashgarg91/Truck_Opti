import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import { execFileSync, execSync } from 'node:child_process';
import {
  isPlaceholder,
  summarizeAppUrl,
  summarizeAuthProviders,
  summarizeOfficePassword,
  summarizePhonePe,
  summarizeRazorpay,
  summarizeSupabaseBackendUrl,
  summarizeSupabaseClientKey,
  summarizeViteSecretExposure,
} from './production_config_policy.mjs';

const appName = process.env.HEROKU_APP_NAME || 'truck-opti-app';
const outputPath = path.join('logs', 'production_config_audit.json');
const healthTimeoutMs = Number(process.env.AUDIT_HEALTH_TIMEOUT_MS || 10000);

function runHerokuConfig() {
  if (process.platform === 'win32') {
    const raw = execSync(`heroku config --json --app ${appName}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return JSON.parse(raw);
  }

  const raw = execFileSync('heroku', ['config', '--json', '--app', appName], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return JSON.parse(raw);
}

function summarizeSentry(dsn) {
  if (!dsn) {
    return { status: 'fail', level: 'missing', detail: 'missing VITE_SENTRY_DSN' };
  }
  return { status: 'pass', level: 'configured', detail: 'Sentry DSN present' };
}

async function defaultDnsLookup(hostname) {
  return dns.lookup(hostname, { all: true });
}

async function defaultFetchHealth(url) {
  return fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(healthTimeoutMs) });
}

/**
 * Run the static production configuration audit against a raw config record.
 * Deps are injectable so tests can simulate NXDOMAIN / health failures without
 * touching a real backend. The report carries capability levels and proof
 * requirements: a passing static audit is 'config_ready' at best — never
 * production-ready, because live operational verification (auth + payment
 * round trips) is always still required. A local-first configuration is
 * reported as 'local_only' and can never be mistaken for a cloud-ready
 * deployment.
 */
export async function runAudit(config = {}, deps = {}) {
  const dnsLookup = deps.dnsLookup || defaultDnsLookup;
  const fetchHealth = deps.fetchHealth || defaultFetchHealth;

  const supabaseKey = summarizeSupabaseClientKey(config.VITE_SUPABASE_ANON_KEY);
  const supabaseBackend = await summarizeSupabaseBackendUrl(config.VITE_SUPABASE_URL, {
    dnsLookup,
    fetchHealth,
  });
  const authProviders = summarizeAuthProviders(config);
  const officePassword = summarizeOfficePassword(config);
  const razorpay = summarizeRazorpay(config.VITE_RAZORPAY_KEY_ID, config.VITE_RAZORPAY_KEY_SECRET);
  const phonePe = summarizePhonePe({
    merchantId: config.VITE_PHONEPE_MERCHANT_ID,
    apiUrl: config.VITE_PHONEPE_API_URL,
  });
  const sentry = summarizeSentry(config.VITE_SENTRY_DSN);
  const secretExposure = summarizeViteSecretExposure(config);
  const appUrl = summarizeAppUrl(config.VITE_APP_URL);

  const checks = [
    { name: 'app_url', status: appUrl.status, level: appUrl.level, detail: appUrl.detail },
    {
      name: 'supabase_client_key',
      status: supabaseKey.status,
      level: supabaseKey.level,
      detail: supabaseKey.detail,
    },
    {
      name: 'supabase_auth_backend',
      status: supabaseBackend.status,
      level: supabaseBackend.level,
      detail: supabaseBackend.detail,
    },
    {
      name: 'auth_provider_configuration',
      status: authProviders.status,
      level: authProviders.level,
      detail: authProviders.detail,
      liveProofRequired: authProviders.liveProofRequired === true,
    },
    {
      name: 'office_password_policy',
      status: officePassword.status,
      level: officePassword.level,
      detail: officePassword.detail,
      liveProofRequired: officePassword.liveProofRequired === true,
    },
    {
      name: 'razorpay_launch_readiness',
      status: razorpay.status,
      level: razorpay.level,
      detail: razorpay.detail,
      liveProofRequired: razorpay.liveProofRequired === true,
    },
    {
      name: 'phonepe_mode',
      status: phonePe.status,
      level: phonePe.level,
      detail: phonePe.detail,
      liveProofRequired: phonePe.liveProofRequired === true,
    },
    { name: 'sentry_dsn', status: sentry.status, level: sentry.level, detail: sentry.detail },
    {
      name: 'vite_secret_exposure',
      status: secretExposure.status,
      level: secretExposure.level,
      detail: secretExposure.detail,
    },
  ];

  const failedChecks = checks.filter((check) => check.status === 'fail');
  const localFirst = ['missing', 'placeholder', 'invalid'].includes(supabaseBackend.level);
  const verdict = localFirst
    ? 'local_only'
    : failedChecks.length > 0
      ? 'not_ready'
      : 'config_ready';

  const productionReadyBlockers = [];
  if (localFirst) {
    productionReadyBlockers.push(
      'local-first configuration: no cloud auth backend is configured, so this deployment is not cloud-ready'
    );
  }
  for (const check of failedChecks) {
    productionReadyBlockers.push(`${check.name}: ${check.detail}`);
  }
  productionReadyBlockers.push(
    'live operational verification (cloud sign-in and payment round trips) is required before production readiness; this static audit proves configuration only'
  );

  return {
    appName,
    timestamp: new Date().toISOString(),
    auditKind: 'static_configuration',
    verdict,
    productionReady: false,
    productionReadyBlockers,
    summary: {
      passed: checks.filter((check) => check.status === 'pass').length,
      failed: failedChecks.length,
      notApplicable: checks.filter((check) => check.status === 'not_applicable').length,
    },
    checks,
  };
}

async function main() {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // AUDIT_CONFIG_JSON (JSON record of VITE_* vars) allows a local dry run
  // without Heroku access; evidence from such a run is configuration-fixture
  // evidence, not live production configuration. Secrets may be present in the
  // input record but are never echoed into the report.
  const config = process.env.AUDIT_CONFIG_JSON
    ? JSON.parse(process.env.AUDIT_CONFIG_JSON)
    : runHerokuConfig();

  const report = await runAudit(config);

  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Production config audit complete: ${outputPath}`);
  console.log(`Verdict: ${report.verdict} (productionReady=${report.productionReady})`);
  for (const check of report.checks) {
    const marker =
      check.status === 'pass' ? 'PASS' : check.status === 'not_applicable' ? 'N/A ' : 'FAIL';
    console.log(`[${marker}] ${check.name} (${check.level}): ${check.detail}`);
  }

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

import { pathToFileURL } from 'node:url';

function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    if (import.meta.url === pathToFileURL(process.argv[1]).href) return true;
  } catch {
    // fall through to suffix check
  }
  // Windows path-casing tolerance
  return process.argv[1].toLowerCase().endsWith('production_config_audit.mjs');
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
