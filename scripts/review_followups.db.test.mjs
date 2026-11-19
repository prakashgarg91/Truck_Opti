// Battery for 20261047: the avatars bucket settings converge even when the bucket already existed with
// other values (the old production project made it by hand).
import { readFileSync } from 'node:fs'
import { bootstrapDb } from './_reviewFollowupsBoot.mjs'

const { db, close } = await bootstrapDb()
let pass = 0, fail = 0
const t = async (name, fn) => { try { await fn(); pass++; console.log('PASS', name) } catch (e) { fail++; console.log('FAIL', name, '::', e.message) } }
const one = async (sql) => (await db.query(sql)).rows[0]

await t('F04 avatars bucket has the intended settings after the chain', async () => {
  const r = await one(`SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'avatars'`)
  if (!(r && r.public === true && Number(r.file_size_limit) === 2097152 && r.allowed_mime_types.length === 4)) throw new Error(JSON.stringify(r))
})
await t('F05 a hand-made private avatars bucket converges when 20261047 runs again', async () => {
  await db.query(`UPDATE storage.buckets SET public = false, file_size_limit = 999, allowed_mime_types = ARRAY['image/png'] WHERE id = 'avatars'`)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261047000000_review_followups.sql', import.meta.url), 'utf8'))
  const r = await one(`SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'avatars'`)
  if (!(r.public === true && Number(r.file_size_limit) === 2097152 && r.allowed_mime_types.length === 4)) throw new Error(JSON.stringify(r))
})

console.log(`\nreview_followups: ${pass} passed, ${fail} failed`)
await close()
process.exit(fail ? 1 : 0)
