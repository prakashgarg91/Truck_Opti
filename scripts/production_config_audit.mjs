import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import { execFileSync, execSync } from 'node:child_process';

const appName = process.env.HEROKU_APP_NAME || 'truck-opti-app';
const outputPath = path.join('logs', 'production_config_audit.json');

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

function isPlaceholder(value) {
  if (!value) return true;
  const lowered = value.toLowerCase();
  return (
    lowered.includes('replace_me') ||
    lowered.includes('your_') ||
    lowered.includes('placeholder')
  );
}

function summarizeRazorpay(keyId, secret) {
  if (!keyId) {
    return { status: 'fail', detail: 'missing VITE_RAZORPAY_KEY_ID' };
  }
  if (keyId.startsWith('rzp_live_') && secret && !isPlaceholder(secret)) {
    return { status: 'pass', detail: 'live Razorpay key + non-placeholder secret present' };
  }
  if (keyId.startsWith('rzp_test_')) {
    return { status: 'fail', detail: 'test Razorpay key is still configured' };
  }
  return { status: 'fail', detail: 'Razorpay key/secret is not launch-ready' };
}

function summarizeSentry(dsn) {
  if (!dsn) {
    return { status: 'fail', detail: 'missing VITE_SENTRY_DSN' };
  }
  return { status: 'pass', detail: 'Sentry DSN present' };
}

function isPhonePeNonProduction(url) {
  const lowered = (url || '').toLowerCase();
  return lowered.includes('sandbox') || lowered.includes('preprod');
}

async function summarizeSupabase(url) {
  if (!url) {
    return { status: 'fail', detail: 'missing VITE_SUPABASE_URL' };
  }

  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { status: 'fail', detail: `invalid Supabase URL: ${url}` };
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    return {
      status: 'pass',
      detail: `DNS resolves (${addresses.map((entry) => entry.address).join(', ')})`,
      hostname,
    };
  } catch (error) {
    return {
      status: 'fail',
      detail: `DNS lookup failed for ${hostname}: ${error instanceof Error ? error.message : String(error)}`,
      hostname,
    };
  }
}

async function main() {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const config = runHerokuConfig();
  const supabase = await summarizeSupabase(config.VITE_SUPABASE_URL);
  const razorpay = summarizeRazorpay(config.VITE_RAZORPAY_KEY_ID, config.VITE_RAZORPAY_KEY_SECRET);
  const sentry = summarizeSentry(config.VITE_SENTRY_DSN);

  const checks = [
    {
      name: 'app_url',
      status: config.VITE_APP_URL ? 'pass' : 'fail',
      detail: config.VITE_APP_URL || 'missing VITE_APP_URL',
    },
    {
      name: 'supabase_auth_backend',
      status: supabase.status,
      detail: supabase.detail,
    },
    {
      name: 'email_otp_flag',
      status: config.VITE_AUTH_EMAIL_OTP_ENABLED === 'true' ? 'pass' : 'fail',
      detail: `VITE_AUTH_EMAIL_OTP_ENABLED=${config.VITE_AUTH_EMAIL_OTP_ENABLED ?? 'missing'}`,
    },
    {
      name: 'razorpay_launch_readiness',
      status: razorpay.status,
      detail: razorpay.detail,
    },
    {
      name: 'sentry_dsn',
      status: sentry.status,
      detail: sentry.detail,
    },
    {
      name: 'phonepe_mode',
      status: isPhonePeNonProduction(config.VITE_PHONEPE_API_URL) ? 'fail' : 'pass',
      detail: config.VITE_PHONEPE_API_URL || 'missing VITE_PHONEPE_API_URL',
    },
  ];

  const report = {
    appName,
    timestamp: new Date().toISOString(),
    summary: {
      passed: checks.filter((check) => check.status === 'pass').length,
      failed: checks.filter((check) => check.status === 'fail').length,
    },
    checks,
  };

  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Production config audit complete: ${outputPath}`);
  for (const check of checks) {
    const marker = check.status === 'pass' ? 'PASS' : 'FAIL';
    console.log(`[${marker}] ${check.name}: ${check.detail}`);
  }

  if (checks.some((check) => check.status === 'fail')) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
