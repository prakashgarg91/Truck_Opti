// Type-checks supabase/functions with Node's tsc plus Deno stubs (no Deno needed).
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const tscJs = resolve(here, '../../frontend/node_modules/typescript/bin/tsc')
const result = spawnSync(process.execPath, [tscJs, '-p', resolve(here, 'tsconfig.edge.json')], { stdio: 'inherit' })
process.exit(result.status ?? 1)
