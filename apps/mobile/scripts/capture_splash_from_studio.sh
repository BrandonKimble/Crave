#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_SCRIPT="$SCRIPT_DIR/install_captured_splash.sh"
METRO_LOG="${EXPO_METRO_LOG_PATH:-/tmp/expo-metro.log}"
READY_PATTERN='[SPLASH-STUDIO] capture_window_open'
TIMEOUT_SECONDS="${SPLASH_CAPTURE_TIMEOUT_SECONDS:-90}"
POLL_INTERVAL_SECONDS="${SPLASH_CAPTURE_POLL_INTERVAL_SECONDS:-1}"
OUTPUT_PATH="${1:-$APP_DIR/tmp/captured-splash.png}"

mkdir -p "$(dirname "$OUTPUT_PATH")"

if [[ ! -f "$INSTALL_SCRIPT" ]]; then
  echo "install script not found: $INSTALL_SCRIPT" >&2
  exit 1
fi

if ! xcrun simctl list devices booted | grep -q 'Booted'; then
  echo "No booted iOS simulator found." >&2
  echo "This capture script is simulator-only." >&2
  echo "Start Metro with splash studio mode, launch the app in a booted simulator, then rerun." >&2
  exit 1
fi

start_epoch="$(date +%s)"
start_offset=""

echo "Waiting for Metro log at $METRO_LOG ..."

while [[ -z "$start_offset" ]]; do
  current_epoch="$(date +%s)"
  elapsed="$((current_epoch - start_epoch))"
  if (( elapsed > TIMEOUT_SECONDS )); then
    echo "Timed out after ${TIMEOUT_SECONDS}s waiting for Metro log." >&2
    exit 1
  fi

  if [[ -f "$METRO_LOG" ]]; then
    start_offset="$(wc -c < "$METRO_LOG" | tr -d ' ')"
    break
  fi

  sleep "$POLL_INTERVAL_SECONDS"
done

echo "Waiting for splash studio capture window in $METRO_LOG ..."

if [[ -f "$METRO_LOG" ]] && grep -Fq "$READY_PATTERN" "$METRO_LOG"; then
  echo "Capture window already logged. Capturing immediately ..."
else

  while true; do
    current_epoch="$(date +%s)"
    elapsed="$((current_epoch - start_epoch))"
    if (( elapsed > TIMEOUT_SECONDS )); then
      echo "Timed out after ${TIMEOUT_SECONDS}s waiting for splash studio capture window." >&2
      exit 1
    fi

    if [[ -f "$METRO_LOG" ]]; then
      current_size="$(wc -c < "$METRO_LOG" | tr -d ' ')"
      if (( current_size >= start_offset )); then
        if tail -c +"$((start_offset + 1))" "$METRO_LOG" | grep -Fq "$READY_PATTERN"; then
          break
        fi
      fi
    fi

    sleep "$POLL_INTERVAL_SECONDS"
  done
fi

echo "Capture window open. Taking simulator screenshot ..."
xcrun simctl io booted screenshot --type=png --mask ignored "$OUTPUT_PATH"

echo "Installing captured splash into app assets ..."
bash "$INSTALL_SCRIPT" "$OUTPUT_PATH"

echo "Captured and installed splash: $OUTPUT_PATH"
