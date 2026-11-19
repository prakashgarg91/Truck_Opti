// Shared boot for small batteries: PGlite + the auth/storage stub + the whole migration chain.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')

export async function bootstrapDb() {
  if (!existsSync(PGLITE_BASE)) {
    console.error('FAIL: PGlite not found at ' + PGLITE_BASE + ': run `npm ci` in frontend/ first.')
    process.exit(1)
  }
  const { PGlite } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'index.js')).href)
  const { uuid_ossp } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'contrib', 'uuid_ossp.js')).href)
  const db = await PGlite.create({ extensions: { uuid_ossp } })
  await db.exec(BOOTSTRAP)
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    } catch (error) {
      console.error(`FAIL: migration ${file} did not apply: ${String(error && error.message).split('\n')[0]}`)
      process.exit(1)
    }
  }
  return { db, close: () => db.close() }
}
