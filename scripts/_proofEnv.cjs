const path = require('path')
const { config } = require('dotenv')

const repoRoot = path.resolve(__dirname, '..')
const PROOF_ENV_FILES = Object.freeze([
  '.env.proof.local',
  '.env.local',
  '.env',
  path.join('frontend', '.env.local'),
  path.join('frontend', '.env'),
])

function loadProofEnv() {
  for (const relativePath of PROOF_ENV_FILES) {
    config({ path: path.join(repoRoot, relativePath), quiet: true })
  }
}

function readEnvValue(name, fallbackNames = []) {
  const keys = [name, ...fallbackNames]

  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return null
}

function formatMissingProofEnvMessage(missingKeys) {
  return [
    `Missing required proof environment variables: ${missingKeys.join(', ')}`,
    `Set them in one of: ${PROOF_ENV_FILES.join(', ')}, or the shell environment.`,
    'See .env.proof.example for the supported proof and seeding contract.',
  ].join('\n')
}

function validateRequiredEnv(requiredKeys) {
  const missingKeys = requiredKeys.filter((key) => !readEnvValue(key))

  if (missingKeys.length > 0) {
    console.error(formatMissingProofEnvMessage(missingKeys))
    return false
  }

  return true
}

loadProofEnv()

module.exports = {
  PROOF_ENV_FILES,
  formatMissingProofEnvMessage,
  loadProofEnv,
  readEnvValue,
  validateRequiredEnv,
}