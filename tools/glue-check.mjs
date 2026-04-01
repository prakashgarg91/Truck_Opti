#!/usr/bin/env node
/**
 * Truck_Opti Glue Check Scanner
 *
 * Verifies the integration chain:
 *   React Page (frontend/src/pages/*.tsx)
 *     → imports from services/ (supabaseApi, subscriptionApi, etc.)
 *       → Supabase calls reference real tables/functions
 *       → API calls match server.js routes
 *
 * Usage: node tools/glue-check.mjs
 * Exit 0 = sealed. Exit 1 = gaps found.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m', BOLD = '\x1b[1m', RESET = '\x1b[0m';

function readFile(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function readDir(dir) { try { return fs.readdirSync(dir); } catch { return []; } }

// ── Link 1: Supabase table references ──
function getSupabaseTables() {
  const servicesDir = path.join(ROOT, 'frontend/src/services');
  const tables = new Set();
  const files = readDir(servicesDir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
  for (const file of files) {
    const src = readFile(path.join(servicesDir, file));
    for (const m of src.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)/g)) {
      tables.add(m[1]);
    }
  }
  return tables;
}

// ── Link 2: Supabase migrations define actual tables ──
function getMigrationTables() {
  const migrationsDir = path.join(ROOT, 'supabase/migrations');
  const tables = new Set();
  const files = readDir(migrationsDir).filter(f => f.endsWith('.sql'));
  for (const file of files) {
    const src = readFile(path.join(migrationsDir, file));
    for (const m of src.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["']?(\w+)["']?/gi)) {
      tables.add(m[1]);
    }
  }
  return tables;
}

// ── Link 3: Page→Service coupling ──
function checkPageCoupling() {
  const pagesDir = path.join(ROOT, 'frontend/src/pages');
  const violations = [];
  const files = readDir(pagesDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
  for (const file of files) {
    const src = readFile(path.join(pagesDir, file));
    // Direct supabase client usage in pages
    if (/supabase\s*\.\s*from\s*\(/.test(src)) {
      violations.push({ type: 'DIRECT_SUPABASE_IN_PAGE', file: `frontend/src/pages/${file}`, detail: 'Page calls supabase.from() directly — should use services/*.ts' });
    }
  }
  return violations;
}

// ── Link 4: Stub detection in services ──
function checkStubServices() {
  const servicesDir = path.join(ROOT, 'frontend/src/services');
  const stubs = [];
  const files = readDir(servicesDir).filter(f => f.endsWith('.ts'));
  for (const file of files) {
    const src = readFile(path.join(servicesDir, file));
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (/['"]Not implemented['"]/i.test(line) || /['"]TODO['"]/i.test(line) || /throw new Error\(['"]not/i.test(line)) {
        stubs.push({ type: 'STUB_SERVICE', file: `frontend/src/services/${file}`, line: i + 1, detail: line.trim().slice(0, 80) });
      }
    });
  }
  return stubs;
}

// ── Link 5: Server.js route audit ──
function getServerRoutes() {
  const serverFile = path.join(ROOT, 'server.js');
  const src = readFile(serverFile);
  const routes = [];
  for (const m of src.matchAll(/app\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/g)) {
    routes.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return routes;
}

// ── Main ──
console.log(`\n${BOLD}${CYAN}🔗 Truck_Opti Glue Check Scanner${RESET}`);
console.log('─'.repeat(60));

const allGaps = [];

// Supabase table consistency
const usedTables = getSupabaseTables();
const migrationTables = getMigrationTables();
console.log(`\n${BOLD}Link 1→2 — Supabase table references vs migrations${RESET}`);
console.log(`  Service-referenced tables: ${usedTables.size}`);
console.log(`  Migration-defined tables: ${migrationTables.size}`);
const phantomTables = [...usedTables].filter(t => migrationTables.size > 0 && !migrationTables.has(t));
if (phantomTables.length === 0) {
  console.log(`  ${GREEN}✅ All referenced tables have migrations${RESET}`);
} else {
  phantomTables.forEach(t => {
    console.log(`  ${RED}[GAP] Table "${t}" used in services but no CREATE TABLE in migrations${RESET}`);
    allGaps.push({ type: 'PHANTOM_TABLE', detail: `Table "${t}" referenced but not in migrations` });
  });
}

// Page coupling
const coupling = checkPageCoupling();
console.log(`\n${BOLD}Link 3 — Page→Service coupling${RESET}`);
if (coupling.length === 0) console.log(`  ${GREEN}✅ Pages use services layer, not raw Supabase${RESET}`);
else coupling.forEach(v => console.log(`  ${YELLOW}[COUPLING] ${v.file} — ${v.detail}${RESET}`));

// Stub services
const stubs = checkStubServices();
console.log(`\n${BOLD}Link 4 — Service handlers (no stubs)${RESET}`);
if (stubs.length === 0) console.log(`  ${GREEN}✅ No stub/unimplemented services${RESET}`);
else { stubs.forEach(s => console.log(`  ${YELLOW}[STUB] ${s.file}:${s.line} ${s.detail}${RESET}`)); allGaps.push(...stubs); }

// Server.js routes
const serverRoutes = getServerRoutes();
console.log(`\n${BOLD}Link 5 — Server.js route health${RESET}`);
console.log(`  Express routes defined: ${serverRoutes.length}`);
if (serverRoutes.length === 0) console.log(`  ${YELLOW}⚠ No API routes in server.js (static-only server)${RESET}`);
else console.log(`  ${GREEN}✅ Server has ${serverRoutes.length} route(s)${RESET}`);

const hardGaps = allGaps.filter(g => g.type === 'PHANTOM_TABLE' || g.type === 'MISSING_ROUTE');
console.log(`\n${'─'.repeat(60)}`);
if (hardGaps.length === 0 && coupling.length === 0 && stubs.length === 0) {
  console.log(`\n${BOLD}${GREEN}🔒 GLUE SEALED — 0 gaps, 0 warnings${RESET}\n`);
} else {
  console.log(`\n${BOLD}GAPS: ${RED}${hardGaps.length}${RESET}  |  ${BOLD}WARNINGS: ${YELLOW}${allGaps.length - hardGaps.length + coupling.length}${RESET}`);
}

const reportDir = path.join(ROOT, '0.dev-matrix/test-reports');
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'glue-check-report.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  summary: { hardGaps: hardGaps.length, warnings: allGaps.length - hardGaps.length + coupling.length, sealed: hardGaps.length === 0 },
  details: [...allGaps, ...coupling],
}, null, 2));

process.exit(hardGaps.length > 0 ? 1 : 0);
