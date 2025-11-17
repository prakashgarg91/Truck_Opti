#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
SCREENSHOT_DIR="$ROOT_DIR/artifacts/screenshots/e2e"
REPORT_PATH="$SCREENSHOT_DIR/screenshot_test_report.html"

mkdir -p "$SCREENSHOT_DIR"

# Activate virtual environment if present
if [ -f "$ROOT_DIR/venv/bin/activate" ]; then
    # shellcheck disable=SC1090
    source "$ROOT_DIR/venv/bin/activate"
fi

# Ensure Python and Node dependencies are installed
pip install -r "$WEB_DIR/requirements.txt"

if [ ! -d "$WEB_DIR/node_modules" ]; then
    (cd "$WEB_DIR" && npm install)
fi

cleanup() {
    if [ -n "${SERVER_PID:-}" ] && ps -p "$SERVER_PID" >/dev/null 2>&1; then
        kill "$SERVER_PID"
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT

python "$WEB_DIR/run.py" &
SERVER_PID=$!

sleep 5

export TRUCKOPTI_SCREENSHOT_DIR="$SCREENSHOT_DIR"
(cd "$WEB_DIR" && npm run test:e2e) || {
    echo "Screenshot journey tests failed. See logs above." >&2
    exit 1
}

if [ -f "$WEB_DIR/screenshots/dashboard-onboarding.png" ]; then
    mv "$WEB_DIR"/screenshots/*.png "$SCREENSHOT_DIR" 2>/dev/null || true
fi

echo "Screenshot artifacts stored in $SCREENSHOT_DIR"