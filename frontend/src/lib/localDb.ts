// Local-first database: PGlite (real Postgres, WASM) persisted to IndexedDB.
// Lazy-loaded via dynamic import so the ~3MB engine never touches the initial
// bundle. Supabase code paths are untouched; services opt into this module.
import type { PGlite as PGliteType } from '@electric-sql/pglite'

const DB_NAME = 'idb://truckopti-v1'
// Vitest runs without IndexedDB: same Postgres engine, memory-backed.
const DB_URL = import.meta.env.MODE === 'test' ? 'memory://' : DB_NAME
const SCHEMA_VERSION = 1

let dbPromise: Promise<PGliteType> | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS local_schema_version (version INT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS trucks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  name_hi TEXT,
  category TEXT,
  length INT NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  capacity INT NOT NULL,
  cost_per_km NUMERIC NOT NULL,
  available INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cartons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  length NUMERIC NOT NULL,
  width NUMERIC NOT NULL,
  height NUMERIC NOT NULL,
  weight NUMERIC NOT NULL,
  fragile BOOLEAN NOT NULL DEFAULT FALSE,
  stackable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS agency_profiles (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'agency',
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
`

// Canonical defaults — identical to TrucksPage DEFAULT_INDIAN_TRUCKS so the
// "load defaults" flow and first-run seeding agree on names.
export const DEFAULT_INDIAN_TRUCKS = [
  { name: 'Tata Ace 7.5ft', length: 228, width: 152, height: 152, capacity: 750, cost_per_km: 12, available: 10, category: 'Mini Truck' },
  { name: 'Tata 407 9ft', length: 274, width: 183, height: 183, capacity: 2500, cost_per_km: 18, available: 8, category: 'Light Commercial' },
  { name: 'Eicher 14ft', length: 427, width: 198, height: 198, capacity: 4000, cost_per_km: 22, available: 6, category: 'Medium Commercial' },
  { name: 'Eicher 17ft', length: 518, width: 213, height: 213, capacity: 6000, cost_per_km: 28, available: 5, category: 'Medium Commercial' },
  { name: 'Eicher 19ft', length: 579, width: 213, height: 213, capacity: 7500, cost_per_km: 32, available: 4, category: 'Heavy Commercial' },
  { name: 'BharatBenz 32ft', length: 975, width: 244, height: 244, capacity: 15000, cost_per_km: 45, available: 3, category: 'Heavy Commercial' },
  { name: 'Tata LPT 3718 36ft', length: 1097, width: 259, height: 259, capacity: 20000, cost_per_km: 55, available: 2, category: 'Extra Heavy' },
]

async function seedDefaults(db: PGliteType) {
  const existing = await db.query<{ name: string }>('SELECT name FROM trucks')
  const have = new Set(existing.rows.map((r) => r.name))
  for (const t of DEFAULT_INDIAN_TRUCKS) {
    if (have.has(t.name)) continue
    await db.query(
      `INSERT INTO trucks(id, name, length, width, height, capacity, cost_per_km, available, category)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [crypto.randomUUID(), t.name, t.length, t.width, t.height, t.capacity, t.cost_per_km, t.available, t.category]
    )
  }
}

export function getLocalDb(): Promise<PGliteType> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { PGlite } = await import('@electric-sql/pglite')
      const db = new PGlite(DB_URL)
      await db.exec(SCHEMA)
      const v = await db.query<{ version: number }>('SELECT version FROM local_schema_version ORDER BY version DESC LIMIT 1').catch(() => ({ rows: [] as { version: number }[] }))
      if (!v.rows.length) {
        await seedDefaults(db)
        await db.exec(`INSERT INTO local_schema_version(version) VALUES(${SCHEMA_VERSION})`)
      }
      return db as PGliteType
    })()
  }
  return dbPromise
}

// Test hook: in-memory database, bypasses IndexedDB.
export async function openTestDb(): Promise<PGliteType> {
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite('memory://')
  await db.exec(SCHEMA)
  return db as PGliteType
}

export async function resetLocalDbForTests(db: PGliteType) {
  await db.exec('TRUNCATE trucks, cartons, agency_profiles, sync_meta')
}
