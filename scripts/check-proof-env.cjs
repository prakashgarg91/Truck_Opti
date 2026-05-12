const { validateRequiredEnv } = require('./_proofEnv.cjs')

const mode = process.argv[2] || 'auth'

const requiredKeysByMode = {
  auth: ['SEED_DEMO_PASSWORD'],
  seed: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SEED_DEMO_PASSWORD'],
}

const requiredKeys = requiredKeysByMode[mode]

if (!requiredKeys) {
  console.error(`Unknown proof env mode: ${mode}`)
  console.error(`Supported modes: ${Object.keys(requiredKeysByMode).join(', ')}`)
  process.exit(1)
}

process.exit(validateRequiredEnv(requiredKeys) ? 0 : 1)