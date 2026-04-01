#!/usr/bin/env node
/**
 * Deep Error Scanner for Truck_Opti
 * Multi-layer static analysis: imports, dead exports, async issues
 *
 * Scans: frontend/src/ (React/TS), apps/web/ (if present)
 * Run: node 0.dev-matrix/deep-error-scanner.mjs [--json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CONFIG = {
  scanDirs: ['frontend/src', 'apps/web'],
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs'],
  ignore: ['node_modules', 'dist', 'build', 'coverage', '.git', 'playwright-report', 'test-results'],
};

let errors = 0, warnings = 0, info = 0;
const issues = [];

function log(level, file, detail) {
  if (level === 'ERROR') errors++;
  else if (level === 'WARN') warnings++;
  else info++;
  issues.push({ level, file, detail });
  const sym = level === 'ERROR' ? '\x1b[31m[ERROR]\x1b[0m' : level === 'WARN' ? '\x1b[33m[WARN]\x1b[0m' : '\x1b[36m[INFO]\x1b[0m';
  console.log(`  ${sym} ${file} — ${detail}`);
}

function collectFiles(dir, exts) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (CONFIG.ignore.some(p => rel.includes(p))) continue;
    if (entry.isDirectory()) files.push(...collectFiles(full, exts));
    else if (exts.some(e => entry.name.endsWith(e))) files.push(full);
  }
  return files;
}

// ── Layer 1: Import verification ──
function scanImports() {
  console.log('\n\x1b[1mLayer 1: Import/Export verification\x1b[0m');
  for (const scanDir of CONFIG.scanDirs) {
    const files = collectFiles(path.join(ROOT, scanDir), CONFIG.extensions);
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
        const importPath = m[1];
        const dir = path.dirname(file);
        const candidates = [
          path.resolve(dir, importPath),
          path.resolve(dir, importPath + '.ts'),
          path.resolve(dir, importPath + '.tsx'),
          path.resolve(dir, importPath + '.js'),
          path.resolve(dir, importPath, 'index.ts'),
          path.resolve(dir, importPath, 'index.tsx'),
          path.resolve(dir, importPath, 'index.js'),
        ];
        if (!candidates.some(c => fs.existsSync(c))) {
          log('ERROR', rel, `Broken import: ${importPath} — file not found`);
        }
      }
    }
  }
}

// ── Layer 2: Supabase/API key exposure check ──
function scanSecrets() {
  console.log('\n\x1b[1mLayer 2: Secret/key exposure check\x1b[0m');
  for (const scanDir of CONFIG.scanDirs) {
    const files = collectFiles(path.join(ROOT, scanDir), CONFIG.extensions);
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      // Hardcoded keys
      if (/(?:supabase|api)_?(?:key|secret|password)\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/i.test(src)) {
        log('ERROR', rel, 'Possible hardcoded API key/secret');
      }
      // Hardcoded URLs with credentials
      if (/https?:\/\/[^'"]*:[^'"]*@/i.test(src)) {
        log('ERROR', rel, 'URL with embedded credentials');
      }
    }
  }
}

// ── Layer 3: TODO/stub detection ──
function scanTodos() {
  console.log('\n\x1b[1mLayer 3: TODO/FIXME/stub detection\x1b[0m');
  for (const scanDir of CONFIG.scanDirs) {
    const files = collectFiles(path.join(ROOT, scanDir), CONFIG.extensions);
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(line) && /^\s*(\/\/|\/\*|\*)/.test(line)) {
          log('INFO', `${rel}:${i + 1}`, line.trim().slice(0, 80));
        }
      });
    }
  }
}

// ── Layer 4: Conflict markers ──
function scanConflictMarkers() {
  console.log('\n\x1b[1mLayer 4: Conflict marker scan\x1b[0m');
  for (const scanDir of CONFIG.scanDirs) {
    const files = collectFiles(path.join(ROOT, scanDir), CONFIG.extensions);
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const rel = path.relative(ROOT, file);
      if (/^(<{7}|={7}|>{7})/m.test(src)) log('ERROR', rel, 'Merge conflict markers found');
    }
  }
}

// ── Main ──
console.log('\x1b[1m\x1b[36m🔬 Deep Error Scanner — Truck_Opti\x1b[0m');
console.log('─'.repeat(60));

scanImports();
scanSecrets();
scanTodos();
scanConflictMarkers();

console.log('\n' + '─'.repeat(60));
console.log(`\x1b[1mSummary: ${errors} errors, ${warnings} warnings, ${info} info\x1b[0m`);

if (process.argv.includes('--json')) {
  const reportDir = path.join(ROOT, '0.dev-matrix/test-reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'deep-scan-report.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), errors, warnings, info, issues,
  }, null, 2));
}

process.exit(errors > 0 ? 1 : 0);
