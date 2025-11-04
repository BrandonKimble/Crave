#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/mobile"

PORT="${EXPO_METRO_PORT:-8107}"

if command -v lsof >/dev/null 2>&1; then
  existing="$(lsof -ti tcp:"$PORT" || true)"
  if [[ -n "$existing" ]]; then
    kill $existing 2>/dev/null || true
  fi
fi

cd "$APP_DIR"
nohup npx expo start --clear --reset-cache --port "$PORT" >/tmp/expo-metro.log 2>&1 &

sleep 5

npx expo run:ios
