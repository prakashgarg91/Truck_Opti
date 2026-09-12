import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const deployScript = fs.readFileSync('deploy-heroku.sh', 'utf8')
const herokuYaml = fs.readFileSync('heroku.yml', 'utf8')
const dockerfile = fs.readFileSync('Dockerfile', 'utf8')

test('manual Heroku deploy never writes placeholder or embedded Supabase credentials', () => {
  assert.doesNotMatch(deployScript, /YOUR_PROJECT_ID|YOUR_PROJECT_REF/)
  assert.doesNotMatch(deployScript, /VITE_SUPABASE_ANON_KEY=eyJ/)
})

test('manual Heroku deploy requires explicit app and Supabase configuration', () => {
  assert.match(deployScript, /HEROKU_APP_NAME/)
  assert.match(deployScript, /VITE_SUPABASE_URL/)
  assert.match(deployScript, /VITE_SUPABASE_ANON_KEY/)
  assert.match(deployScript, /exit 1/)
})

test('manual Heroku deploy binds the git remote to the explicitly approved app before push', () => {
  assert.match(deployScript, /heroku git:remote --app "\$APP_NAME"/)
  assert.match(deployScript, /git push heroku main/)
  assert.ok(
    deployScript.indexOf('heroku git:remote --app "$APP_NAME"') < deployScript.indexOf('git push heroku main'),
    'Heroku remote binding must occur before deployment push',
  )
})

test('container deployment uses the canonical Node production server', () => {
  assert.match(herokuYaml, /web:\s*node server\.js/)
  assert.match(dockerfile, /CMD\s+\["node",\s*"server\.js"\]/)
})
