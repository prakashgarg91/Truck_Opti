/**
 * Real PostgreSQL harness for concurrency tests (PGlite is single-session and cannot race).
 *
 * Starts an embedded PostgreSQL server (no Docker), replays the whole supabase/migrations
 * chain with the same Supabase-shaped bootstrap the PGlite batteries use, and hands out
 * independent client connections, each able to act as a different JWT user
 * (SET ROLE + request.jwt.claims, exactly what PostgREST does).
 *
 * The two npm packages are NOT repo dependencies: install them anywhere and point
 *   RACE_MODULES=<folder with node_modules>   (default D:/tmp/pgrace)
 *   npm i embedded-postgres pg            (in that folder)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from '../_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..', '..')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MODULES = process.env.RACE_MODULES ?? 'D:/tmp/pgrace'

if (!existsSync(join(MODULES, 'node_modules', 'embedded-postgres'))) {
  console.error(`FAIL: embedded-postgres not found in ${MODULES}/node_modules. Run: npm i embedded-postgres pg (in ${MODULES}) or set RACE_MODULES.`)
  process.exit(1)
}
const req = createRequire(join(MODULES, 'package.json'))
const { default: EmbeddedPostgres } = await import(pathToFileURL(req.resolve('embedded-postgres')).href)
const pg = req('pg')

const BOOT = BOOTSTRAP.replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '-- uuid-ossp not shipped by the embedded build; the base schema defines its own uuid_generate_v4')

export async function startServer(label = 'race') {
  const dataDir = `${MODULES}/data-${label}-${Date.now()}`
  const port = 54000 + Math.floor(Math.random() * 1000)
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    // Windows would default to WIN1252; the migrations contain UTF-8 text
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  })
  await server.initialise()
  await server.start()
  await server.createDatabase('race')
  const conn = { host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'race' }
  const admin = new pg.Client(conn)
  await admin.connect()
  await admin.query(BOOT)
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    try {
      await admin.query(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    } catch (error) {
      throw new Error(`migration ${file} failed on real PostgreSQL: ${String(error.message).split('\n')[0]}`)
    }
  }
  const version = (await admin.query('SHOW server_version')).rows[0].server_version

  /** A new independent connection (its own backend process), as the given user or as superuser. */
  async function connect(userId = null) {
    const c = new pg.Client(conn)
    await c.connect()
    const api = {
      raw: c,
      async as(uid) {
        if (uid) {
          await c.query('RESET ROLE')
          await c.query(`SET ROLE authenticated`)
          await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
        } else {
          await c.query('RESET ROLE')
          await c.query(`SELECT set_config('request.jwt.claims', '', false)`)
        }
        return api
      },
      query: (sql, params) => c.query(sql, params),
      async rows(sql, params) {
        return (await c.query(sql, params)).rows
      },
      close: () => c.end(),
    }
    if (userId) await api.as(userId)
    return api
  }

  return {
    version,
    files: files.length,
    admin: {
      query: (s, p) => admin.query(s, p),
      rows: async (s, p) => (await admin.query(s, p)).rows,
      exec: (s) => admin.query(s),
    },
    connect,
    async stop() {
      await admin.end().catch(() => {})
      await server.stop().catch(() => {})
      try {
        rmSync(dataDir, { recursive: true, force: true })
      } catch {
        /* temp data dir: best effort */
      }
    },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  // smoke test: node scripts/race/_realPg.mjs
  const s = await startServer('smoke')
  console.log(`real PostgreSQL ${s.version}: ${s.files} migrations replayed`)
  const a = await s.connect()
  const b = await s.connect()
  const pids = [(await a.rows('SELECT pg_backend_pid() AS p'))[0].p, (await b.rows('SELECT pg_backend_pid() AS p'))[0].p]
  console.log(`two independent backends: ${pids.join(' and ')} (${pids[0] !== pids[1] ? 'distinct' : 'SAME'})`)
  await a.close()
  await b.close()
  await s.stop()
}
