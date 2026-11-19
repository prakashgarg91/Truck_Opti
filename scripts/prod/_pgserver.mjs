// Throwaway embedded PostgreSQL launcher for the production rehearsal.
// Same approach as scripts/race/_realPg.mjs, but WITHOUT replaying the whole chain:
// the caller decides which migrations to apply. Needs RACE_MODULES (default D:/tmp/pgrace)
// with embedded-postgres + pg installed.
import { existsSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BOOTSTRAP } from '../_pgliteBootstrap.mjs'

const MODULES = process.env.RACE_MODULES ?? 'D:/tmp/pgrace'
if (!existsSync(join(MODULES, 'node_modules', 'embedded-postgres'))) {
  console.error(`FAIL: embedded-postgres not found in ${MODULES}/node_modules. Run: npm i embedded-postgres pg (in ${MODULES}) or set RACE_MODULES.`)
  process.exit(1)
}
const req = createRequire(join(MODULES, 'package.json'))
const { default: EmbeddedPostgres } = await import(pathToFileURL(req.resolve('embedded-postgres')).href)
const pg = req('pg')

const BOOT = BOOTSTRAP.replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', '-- uuid-ossp not shipped by the embedded build')

export async function startThrowaway(label = 'legacy') {
  const dataDir = `${MODULES}/data-${label}-${Date.now()}`
  const port = 55000 + Math.floor(Math.random() * 1000)
  const server = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  })
  await server.initialise()
  await server.start()
  await server.createDatabase('legacy')
  const client = new pg.Client({ host: 'localhost', port, user: 'postgres', password: 'postgres', database: 'legacy' })
  await client.connect()
  await client.query(BOOT)
  const version = (await client.query('SHOW server_version')).rows[0].server_version
  return {
    client, version,
    async stop() {
      await client.end().catch(() => {})
      await server.stop().catch(() => {})
      try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* best effort */ }
    },
  }
}
