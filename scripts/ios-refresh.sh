#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/mobile"

PORT="${EXPO_METRO_PORT:-${EXPO_DEV_SERVER_PORT:-${RCT_METRO_PORT:-8081}}}"
IOS_DEVICE_UDID="${IOS_DEVICE_UDID:-${IOS_SIMULATOR_UDID:-}}"
IOS_DEVICE_NAME="${IOS_DEVICE_NAME:-${IOS_SIMULATOR_NAME:-}}"
FOLLOW_METRO_LOGS="${FOLLOW_METRO_LOGS:-1}"
METRO_LOG="/tmp/expo-metro.log"

wait_for_metro() {
  if command -v curl >/dev/null 2>&1; then
    deadline=$((SECONDS + 30))
    until curl -fs "http://localhost:${PORT}/status" >/dev/null 2>&1; do
      if [[ $SECONDS -ge $deadline ]]; then
        echo "Metro did not start on port ${PORT}."
        return 1
      fi
      sleep 1
    done
  else
    sleep 5
  fi
}

run_ios() {
  if [[ -n "$IOS_DEVICE_UDID" ]]; then
    EXPO_DEV_SERVER_PORT="$PORT" RCT_METRO_PORT="$PORT" \
      npx expo run:ios --device "$IOS_DEVICE_UDID" --port "$PORT"
  elif [[ -n "$IOS_DEVICE_NAME" ]]; then
    EXPO_DEV_SERVER_PORT="$PORT" RCT_METRO_PORT="$PORT" \
      npx expo run:ios --device "$IOS_DEVICE_NAME" --port "$PORT"
  else
    EXPO_DEV_SERVER_PORT="$PORT" RCT_METRO_PORT="$PORT" \
      npx expo run:ios --port "$PORT"
  fi
}

if command -v lsof >/dev/null 2>&1; then
  existing="$(lsof -ti tcp:"$PORT" || true)"
  if [[ -n "$existing" ]]; then
    kill $existing 2>/dev/null || true
  fi
fi

cd "$APP_DIR"

if [[ -z "$IOS_DEVICE_UDID" && -z "$IOS_DEVICE_NAME" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    device_info="$(
      python3 - <<'PY'
import json
import subprocess
import re
from datetime import datetime

data = json.loads(
    subprocess.check_output(["xcrun", "simctl", "list", "devices", "--json"])
)

def parse_version(key):
    match = re.search(r"iOS-([0-9-]+)$", key)
    if not match:
        return ()
    parts = []
    for piece in match.group(1).split("-"):
        try:
            parts.append(int(piece))
        except ValueError:
            pass
    return tuple(parts)

runtime_keys = [
    key
    for key in data.get("devices", {})
    if "SimRuntime.iOS-" in key
]

runtime_keys = sorted(runtime_keys, key=parse_version, reverse=True)

def select_device(devices):
    available = [
        d for d in devices
        if d.get("isAvailable") and d.get("state") != "Shutting Down"
    ]
    if not available:
        return None
    iphones = [d for d in available if "iPhone" in d.get("name", "")]
    candidates = iphones or available
    booted = [d for d in candidates if d.get("state") == "Booted"]
    if booted:
        return booted[0]
    def booted_at(device):
        value = device.get("lastBootedAt")
        if not value:
            return datetime.fromtimestamp(0)
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return datetime.fromtimestamp(0)
    candidates.sort(key=booted_at, reverse=True)
    return candidates[0] if candidates else None

selected = None
selected_runtime = None
for runtime in runtime_keys:
    device = select_device(data["devices"].get(runtime, []))
    if device:
        selected = device
        selected_runtime = runtime
        break

if selected:
    print(
        f"{selected.get('udid','')}|{selected.get('name','')}|{selected_runtime}"
    )
PY
    )"

    if [[ -n "$device_info" ]]; then
      IOS_DEVICE_UDID="${device_info%%|*}"
      rest="${device_info#*|}"
      IOS_DEVICE_NAME="${rest%%|*}"
      IOS_DEVICE_RUNTIME="${rest#*|}"
      echo "Using iOS simulator: ${IOS_DEVICE_NAME} (${IOS_DEVICE_UDID}) ${IOS_DEVICE_RUNTIME}"
    else
      echo "No available iOS simulators found. Install an iOS runtime in Xcode > Settings > Platforms."
    fi
  fi
fi

if [[ -t 1 && "$FOLLOW_METRO_LOGS" != "0" ]]; then
  (
    wait_for_metro || true
    run_ios
  ) &
  EXPO_DEV_SERVER_PORT="$PORT" RCT_METRO_PORT="$PORT" \
    npx expo start --dev-client --clear --reset-cache --port "$PORT"
  exit 0
fi

EXPO_DEV_SERVER_PORT="$PORT" RCT_METRO_PORT="$PORT" \
  nohup npx expo start --dev-client --clear --reset-cache --port "$PORT" \
  >"$METRO_LOG" 2>&1 &

wait_for_metro || true
run_ios

if [[ "$FOLLOW_METRO_LOGS" != "0" ]]; then
  echo "Tailing Metro logs from ${METRO_LOG} (Ctrl+C to stop)."
  tail -n 200 -f "$METRO_LOG"
fi
