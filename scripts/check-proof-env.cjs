const { readEnvValue, validateRequiredEnv } = require('./_proofEnv.cjs')

const mode = process.argv[2] || 'auth'

const requiredKeysByMode = {
  auth: ['SEED_DEMO_PASSWORD'],
  seed: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
}

const requiredKeys = requiredKeysByMode[mode]

if (!requiredKeys) {
  console.error(`Unknown proof env mode: ${mode}`)
  console.error(`Supported modes: ${Object.keys(requiredKeysByMode).join(', ')}`)
  process.exit(1)
}

if (!validateRequiredEnv(requiredKeys)) {
  process.exit(1)
}

if (mode === 'seed' && !readEnvValue('SEED_DEMO_PASSWORD') && !readEnvValue('RAZORPAY_REVIEW_DEMO_PASSWORD')) {
  console.error('Missing required seed password: set SEED_DEMO_PASSWORD for shared demo accounts or RAZORPAY_REVIEW_DEMO_PASSWORD for the isolated Razorpay reviewer account.')
  process.exit(1)
}

process.exit(0)