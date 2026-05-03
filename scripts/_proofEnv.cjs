const path = require('path')
const { config } = require('dotenv')

const repoRoot = path.resolve(__dirname, '..')

function loadProofEnv() {
  const envFiles = [
    '.env.proof.local',
    '.env.local',
    '.env',
    path.join('frontend', '.env.local'),
    path.join('frontend', '.env'),
  ]

  for (const relativePath of envFiles) {
    config({ path: path.join(repoRoot, relativePath) })
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

loadProofEnv()

module.exports = {
  loadProofEnv,
  readEnvValue,
}