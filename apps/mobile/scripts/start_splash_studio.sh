#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${EXPO_METRO_PORT:-${EXPO_DEV_SERVER_PORT:-${RCT_METRO_PORT:-8081}}}"
METRO_LOG="${EXPO_METRO_LOG_PATH:-/tmp/expo-metro.log}"
BUNDLE_ID="com.brandonkimble.cravesearch"
DEV_CLIENT_URL="crave://expo-development-client/?url=http%3A%2F%2Flocalhost%3A${PORT}"

cd "$APP_DIR"

wait_for_metro() {
  local deadline=$((SECONDS + 30))
  until curl -fs "http://127.0.0.1:${PORT}/status" >/dev/null 2>&1; do
    if [[ $SECONDS -ge $deadline ]]; then
      echo "Metro did not start on port ${PORT}." >&2
      return 1
    fi
    sleep 1
  done
}

echo "Starting splash studio Metro on port ${PORT}..."
echo "Writing Metro output to ${METRO_LOG}"
echo "Will relaunch the already-installed simulator app once Metro is ready, then run:"
echo "bash apps/mobile/scripts/capture_splash_from_studio.sh"

mkdir -p "$(dirname "$METRO_LOG")"
rm -f "$METRO_LOG"

EXPO_PUBLIC_SPLASH_STUDIO="${EXPO_PUBLIC_SPLASH_STUDIO:-1}" \
EXPO_PUBLIC_SPLASH_STUDIO_LABEL="${EXPO_PUBLIC_SPLASH_STUDIO_LABEL:-1}" \
EXPO_PUBLIC_SPLASH_STUDIO_FROST="${EXPO_PUBLIC_SPLASH_STUDIO_FROST:-1}" \
EXPO_PUBLIC_SPLASH_STUDIO_GRID="${EXPO_PUBLIC_SPLASH_STUDIO_GRID:-1}" \
EXPO_PUBLIC_SPLASH_STUDIO_NATIVE_BLUR="${EXPO_PUBLIC_SPLASH_STUDIO_NATIVE_BLUR:-1}" \
EXPO_DEV_SERVER_PORT="$PORT" \
RCT_METRO_PORT="$PORT" \
nohup npx expo start --dev-client --host localhost --port "$PORT" >"$METRO_LOG" 2>&1 &

wait_for_metro

if xcrun simctl list devices booted | grep -q 'Booted'; then
  echo "Relaunching splash studio app in booted simulator ..."
  xcrun simctl terminate booted "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl launch booted "$BUNDLE_ID" >/dev/null 2>&1 || true
  xcrun simctl openurl booted "$DEV_CLIENT_URL"
else
  echo "No booted simulator found. Open the app manually, then run:"
  echo "bash apps/mobile/scripts/capture_splash_from_studio.sh"
fi

tail -n 200 -f "$METRO_LOG"
