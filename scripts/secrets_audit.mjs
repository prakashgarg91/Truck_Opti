#!/usr/bin/env node
// secrets_audit.mjs: secret-pattern scanner for tracked source and the built frontend.
// Output never contains secret values: only severity, rule name, and file:line.
// Exit 1 if any FAIL finding remains after the allow-list, otherwise exit 0.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = path.join(ROOT, 'frontend');
const TMP_DIST = process.env.SECRETS_AUDIT_DIST || 'D:/tmp/secrets-audit-dist';
const MAX_BYTES = 2 * 1024 * 1024;
const SELF = 'scripts/secrets_audit.mjs';

// Every VITE_* name read by frontend/src. The build overrides all of them with
// dummy values so the real frontend/.env.local is never baked into the scan target.
const VITE_NAMES = [
  'VITE_ALLOW_TEST_RAZORPAY_ON_PRODUCTION', 'VITE_APP_URL', 'VITE_APP_VERSION',
  'VITE_AUTH_EMAIL_OTP_ENABLED', 'VITE_AUTH_PASSWORD_ENABLED', 'VITE_AUTH_PHONE_OTP_ENABLED',
  'VITE_BILLING_GST_ENABLED', 'VITE_BILLING_GST_RATE_PERCENT', 'VITE_GOOGLE_CLIENT_ID',
  'VITE_GOOGLE_MAPS_API_KEY', 'VITE_PHONEPE_API_URL', 'VITE_PHONEPE_MERCHANT_ID',
  'VITE_RAZORPAY_KEY_ID', 'VITE_SENTRY_DSN', 'VITE_SENTRY_RELEASE', 'VITE_SENTRY_STAGING_PROBE',
  'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SYNC_URL', 'VITE_TEST_EMAIL', 'VITE_TEST_PASSWORD',
];

// Allow-list. `patterns` is '*' or a list of rule names. Each waived hit is counted as ALLOWED
// and the reason is printed once per entry so reviewers can see what was waived.
const ALLOWLIST = [
  {
    file: SELF,
    patterns: '*',
    reason: 'the auditor contains its own detection regexes and rule-name strings',
  },
  {
    file: 'scripts/razorpay_sandbox_proof.test.mjs',
    patterns: ['Razorpay key/webhook secret literal'],
    reason: 'test fixtures for the secret-masking assertions (dummy values; the test asserts they never print)',
  },
];

const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Files that ship to browsers: frontend source (non-test), the frontend HTML shell, frontend
// public assets, and apps/web static JS/HTML.
function isBrowserDelivered(posix) {
  if (posix.startsWith('frontend/src/') && !TEST_FILE_RE.test(posix)) return true;
  if (posix === 'frontend/index.html' || posix.startsWith('frontend/public/')) return true;
  if (/^apps\/web\/(?:.*\/)?static\/.*\.(?:m?js|cjs|html?)$/.test(posix)) return true;
  return false;
}

// Line rules. `re` runs against every line of text; severity is FAIL or INFO.
const LINE_RULES = [
  { rule: 'PEM private key block', severity: 'FAIL',
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/ },
  { rule: 'sk_live / sk_test secret key', severity: 'FAIL',
    re: /\bsk_(?:live|test)_[A-Za-z0-9]{10,}/ },
  { rule: 'Razorpay key/webhook secret literal', severity: 'FAIL',
    re: /RAZORPAY_(?:KEY_SECRET|WEBHOOK_SECRET)['"`]?\s*(?:[:=]|\?\?|\|\|)\s*['"`][A-Za-z0-9_-]{16,}['"`]/ },
  { rule: 'PhonePe salt literal', severity: 'FAIL',
    re: /PHONEPE_SALT_KEY['"`]?\s*(?:[:=]|\?\?|\|\|)\s*['"`][^'"`\s]{8,}['"`]/ },
  { rule: 'Razorpay public key id (rzp_live / rzp_test)', severity: 'INFO',
    re: /\brzp_(?:live|test)_[A-Za-z0-9]+/ },
];

// Build-only literal strings. Any hit in the built frontend is a FAIL.
const BUILD_STRINGS = ['service_role', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'];

const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;

// Decode the JWT payload (never printed) and return its role claim, or undefined if not a JWT.
function jwtRole(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
    return payload && typeof payload === 'object' ? (payload.role ?? null) : undefined;
  } catch {
    return undefined;
  }
}

function isAllowed(relFile, rule) {
  return ALLOWLIST.some((entry) => {
    if (entry.file !== relFile) return false;
    return entry.patterns === '*' || entry.patterns.includes(rule);
  });
}

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

// Scan one text blob. `relFile` is the label printed; `buildMode` adds the build-only string rules.
function scanText(relFile, text, findings, buildMode) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const add = (rule, severity) => findings.push({ file: relFile, line: lineNo, rule, severity });

    for (const m of line.matchAll(JWT_RE)) {
      const role = jwtRole(m[0]);
      if (role === undefined) continue;
      if (role === 'service_role') add('Supabase service_role JWT', 'FAIL');
      else add('JWT (non-service role)', 'INFO');
    }
    for (const r of LINE_RULES) {
      if (r.re.test(line)) add(r.rule, r.severity);
    }
    if (buildMode) {
      for (const s of BUILD_STRINGS) {
        if (line.includes(s)) add(`"${s}" string in built output`, 'FAIL');
      }
    }
  });
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  return out.toString('utf8').split('\0').filter(Boolean);
}

function scanTracked(findings) {
  const files = trackedFiles();
  let scanned = 0;
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    const posix = rel.split(path.sep).join('/');
    const base = path.posix.basename(posix);

    // Rule: tracked .env files (except *.example) are FAIL.
    if (/^\.env/.test(base) && !base.endsWith('.example')) {
      findings.push({ file: posix, line: 0, rule: 'tracked .env file', severity: 'FAIL' });
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    const stat = fs.statSync(abs);
    if (stat.size > MAX_BYTES) continue;
    const buf = fs.readFileSync(abs);
    if (isBinary(buf)) continue;
    scanned++;
    const text = buf.toString('utf8');
    scanText(posix, text, findings, false);

    // Rule: service_role in frontend source; FAIL unless it is a test file.
    if (posix.startsWith('frontend/src/') && text.includes('service_role')) {
      const severity = TEST_FILE_RE.test(posix) ? 'INFO' : 'FAIL';
      const rule = TEST_FILE_RE.test(posix)
        ? 'service_role in frontend test (mock)'
        : 'service_role referenced in frontend source';
      text.split(/\r?\n/).forEach((line, idx) => {
        if (line.includes('service_role')) findings.push({ file: posix, line: idx + 1, rule, severity });
      });
    }

    // Rule: the SUPABASE_SERVICE_ROLE_KEY name is FAIL only in browser-delivered code.
    // Naming it anywhere else (docs, server scripts, Edge functions) is INFO. Key values are
    // caught separately by the JWT rule, which applies to every tracked file.
    if (text.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      const browser = isBrowserDelivered(posix);
      text.split(/\r?\n/).forEach((line, idx) => {
        if (line.includes('SUPABASE_SERVICE_ROLE_KEY')) {
          findings.push({ file: posix, line: idx + 1,
            rule: browser
              ? 'SUPABASE_SERVICE_ROLE_KEY name in browser-delivered code'
              : 'SUPABASE_SERVICE_ROLE_KEY name (server-side or docs)',
            severity: browser ? 'FAIL' : 'INFO' });
        }
      });
    }
  }
  return { scanned, total: files.length };
}

function buildFrontend() {
  const viteBin = path.join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteBin)) return { ok: false, reason: 'frontend/node_modules/vite not installed' };
  const env = { ...process.env };
  for (const name of VITE_NAMES) env[name] = 'audit-dummy';
  env.VITE_SUPABASE_URL = 'https://audit.invalid';
  env.VITE_SUPABASE_ANON_KEY = 'audit-dummy-anon';
  fs.rmSync(TMP_DIST, { recursive: true, force: true });
  const res = spawnSync(process.execPath, [viteBin, 'build', '--outDir', TMP_DIST, '--emptyOutDir'],
    { cwd: FRONTEND, env, stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
  if (res.status !== 0) return { ok: false, reason: `vite build exited ${res.status}` };
  return { ok: true };
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(m?js|cjs|html)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function scanBuild(findings) {
  const files = walk(TMP_DIST);
  for (const abs of files) {
    const rel = 'build:' + path.relative(TMP_DIST, abs).split(path.sep).join('/');
    scanText(rel, fs.readFileSync(abs, 'utf8'), findings, true);
  }
  return files.length;
}

function main() {
  const findings = [];
  const { scanned, total } = scanTracked(findings);

  let builtCount = 0;
  let buildNote = '';
  const build = buildFrontend();
  try {
    if (build.ok) builtCount = scanBuild(findings);
    else {
      findings.push({ file: 'frontend (build)', line: 0, rule: `build failed: ${build.reason}`, severity: 'FAIL' });
    }
  } finally {
    fs.rmSync(TMP_DIST, { recursive: true, force: true });
    buildNote = build.ok ? 'built' : 'not built';
  }

  const allowedCounts = new Map();
  const reported = [];
  for (const f of findings) {
    if (isAllowed(f.file, f.rule)) {
      allowedCounts.set(f.rule + ' @ ' + f.file, (allowedCounts.get(f.rule + ' @ ' + f.file) || 0) + 1);
      continue;
    }
    reported.push(f);
  }

  const counts = { FAIL: 0, WARN: 0, INFO: 0 };
  for (const f of reported) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const allowedTotal = [...allowedCounts.values()].reduce((a, b) => a + b, 0);

  const order = { FAIL: 0, WARN: 1, INFO: 2 };
  reported.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);

  console.log(`secrets-audit: ${scanned}/${total} tracked text files scanned; frontend ${buildNote}, ${builtCount} built JS/HTML files scanned`);
  for (const f of reported) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    console.log(`${f.severity.padEnd(4)}  ${loc}  [${f.rule}]`);
  }
  if (allowedCounts.size) {
    console.log('ALLOWED (waived by allow-list):');
    for (const [k, n] of allowedCounts) console.log(`  ${n} x ${k}`);
    for (const e of ALLOWLIST) console.log(`  reason for ${e.file}: ${e.reason}`);
  }
  console.log(`summary: FAIL=${counts.FAIL} WARN=${counts.WARN} INFO=${counts.INFO} ALLOWED=${allowedTotal}`);
  const failed = counts.FAIL > 0;
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS');
  process.exit(failed ? 1 : 0);
}

main();
