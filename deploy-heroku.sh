#!/bin/bash
set -euo pipefail

# TruckOpti Heroku deployment helper.
# This script intentionally fails closed: it never invents app names or provider credentials.
# Usage:
#   HEROKU_APP_NAME=... \
#   VITE_SUPABASE_URL=... \
#   VITE_SUPABASE_ANON_KEY=... \
#   VITE_APP_URL=https://www.truckopti.in \
#   ./deploy-heroku.sh

APP_NAME=${1:-${HEROKU_APP_NAME:-}}

require_env() {
  local name="$1"
  local value="${!name:-}"
  if [ -z "$value" ]; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
}

if [ -z "$APP_NAME" ]; then
  echo "Missing Heroku app name. Pass it as the first argument or set HEROKU_APP_NAME." >&2
  exit 1
fi

require_env VITE_SUPABASE_URL
require_env VITE_SUPABASE_ANON_KEY
require_env VITE_APP_URL

if ! command -v heroku >/dev/null 2>&1; then
  echo "Heroku CLI is required. Install and authenticate it before deployment." >&2
  exit 1
fi

# Refuse to create or guess a production app. The target must already exist and be accessible.
heroku apps:info --app "$APP_NAME" >/dev/null

echo "Applying approved build-time configuration to Heroku app: $APP_NAME"
heroku config:set \
  "VITE_SUPABASE_URL=$VITE_SUPABASE_URL" \
  "VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY" \
  "VITE_APP_URL=$VITE_APP_URL" \
  --app "$APP_NAME"

echo "Deploying current main branch to existing Heroku app: $APP_NAME"
git push heroku main

echo "Deployment push completed for $APP_NAME."
echo "Verify the canonical site, auth redirect configuration, and production smoke checks before launch sign-off."
