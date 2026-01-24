#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$REPO_ROOT/apps/mobile"

PORT="${EXPO_METRO_PORT:-${EXPO_DEV_SERVER_PORT:-${RCT_METRO_PORT:-8081}}}"
IOS_DEVICE_UDID="${IOS_DEVICE_UDID:-${IOS_SIMULATOR_UDID:-}}"
IOS_DEVICE_NAME="${IOS_DEVICE_NAME:-${IOS_SIMULATOR_NAME:-}}"
IOS_PREFER_DEVICE="${IOS_PREFER_DEVICE:-0}"
IOS_RUN="${IOS_RUN:-1}"
FOLLOW_METRO_LOGS="${FOLLOW_METRO_LOGS:-1}"
METRO_LOG="/tmp/expo-metro.log"
EXPO_START_HOST="${EXPO_START_HOST:-lan}"
EXPO_RESET_CACHE="${EXPO_RESET_CACHE:-0}"
EXPO_FORCE_START="${EXPO_FORCE_START:-0}"
METRO_ALREADY_RUNNING=0

is_ipv4() {
  [[ "${1:-}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

is_loopback_ip() {
  [[ "${1:-}" =~ ^127\. ]]
}

is_link_local_ip() {
  [[ "${1:-}" =~ ^169\.254\. ]]
}

is_cgnat_ip() {
  # 100.64.0.0/10 (includes Tailscale, often not reachable from devices unless both are on the same tailnet)
  local ip="${1:-}"
  if ! is_ipv4 "$ip"; then
    return 1
  fi
  local a b
  a="${ip%%.*}"
  b="${ip#*.}"
  b="${b%%.*}"
  [[ "$a" == "100" ]] && [[ "$b" -ge 64 ]] && [[ "$b" -le 127 ]]
}

is_rfc1918_ip() {
  local ip="${1:-}"
  if ! is_ipv4 "$ip"; then
    return 1
  fi

  if [[ "$ip" =~ ^10\. ]]; then
    return 0
  fi
  if [[ "$ip" =~ ^192\.168\. ]]; then
    return 0
  fi
  if [[ "$ip" =~ ^172\. ]]; then
    local b
    b="${ip#172.}"
    b="${b%%.*}"
    [[ "$b" -ge 16 ]] && [[ "$b" -le 31 ]]
    return $?
  fi

  return 1
}

is_unusable_host_ip() {
  local ip="${1:-}"
  [[ -z "$ip" ]] && return 0
  is_loopback_ip "$ip" && return 0
  is_link_local_ip "$ip" && return 0
  return 1
}

detect_lan_ip() {
  local candidates=()
  local ip=""

  ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
  [[ -n "$ip" ]] && candidates+=("$ip")

  ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
  [[ -n "$ip" ]] && candidates+=("$ip")

  if command -v route >/dev/null 2>&1; then
    local iface=""
    iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
    if [[ -n "$iface" ]]; then
      ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
      [[ -n "$ip" ]] && candidates+=("$ip")
    fi
  fi

  if command -v ifconfig >/dev/null 2>&1; then
    while IFS= read -r ip; do
      [[ -n "$ip" ]] && candidates+=("$ip")
    done < <(ifconfig 2>/dev/null | awk '/inet /{print $2}' | sort -u)
  fi

  local candidate
  for candidate in "${candidates[@]}"; do
    if is_rfc1918_ip "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  for candidate in "${candidates[@]}"; do
    if ! is_unusable_host_ip "$candidate" && ! is_cgnat_ip "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  for candidate in "${candidates[@]}"; do
    if ! is_unusable_host_ip "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done

  echo ""
}

APP_SCHEME="${EXPO_APP_SCHEME:-}"
APP_SLUG="${EXPO_APP_SLUG:-}"
IOS_BUNDLE_ID="${EXPO_IOS_BUNDLE_ID:-}"
if command -v python3 >/dev/null 2>&1; then
  if [[ -z "$APP_SCHEME" ]] && [[ -f "$APP_DIR/app.json" ]]; then
    APP_SCHEME="$(
      python3 - <<'PY' "$APP_DIR/app.json"
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f).get("expo", {})
    print(data.get("scheme", "") or "")
except Exception:
    print("")
PY
    )"
  fi
  if [[ -z "$APP_SLUG" ]] && [[ -f "$APP_DIR/app.json" ]]; then
    APP_SLUG="$(
      python3 - <<'PY' "$APP_DIR/app.json"
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f).get("expo", {})
    print(data.get("slug", "") or "")
except Exception:
    print("")
PY
    )"
  fi
  if [[ -z "$IOS_BUNDLE_ID" ]] && [[ -f "$APP_DIR/app.json" ]]; then
    IOS_BUNDLE_ID="$(
      python3 - <<'PY' "$APP_DIR/app.json"
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f).get("expo", {})
    print((data.get("ios") or {}).get("bundleIdentifier", "") or "")
except Exception:
    print("")
PY
    )"
  fi
fi

PACKAGER_HOSTNAME="${EXPO_PACKAGER_HOSTNAME:-}"
if [[ -z "$PACKAGER_HOSTNAME" ]]; then
  PACKAGER_HOSTNAME="$(detect_lan_ip || true)"
fi
if [[ -z "$PACKAGER_HOSTNAME" ]]; then
  if [[ "$IOS_PREFER_DEVICE" == "1" ]] || [[ -n "${IOS_DEVICE_UDID:-}" ]] || [[ -n "${IOS_DEVICE_NAME:-}" ]]; then
    echo "Could not detect a LAN IP address for your Mac." >&2
    echo "Fix: connect to Wi‑Fi/Ethernet and re-run, or set EXPO_PACKAGER_HOSTNAME manually." >&2
    echo "Example: EXPO_PACKAGER_HOSTNAME=192.168.1.123 yarn ios:device" >&2
    exit 1
  fi
  PACKAGER_HOSTNAME="localhost"
fi

if is_cgnat_ip "$PACKAGER_HOSTNAME"; then
  echo "Warning: EXPO_PACKAGER_HOSTNAME is ${PACKAGER_HOSTNAME} (CGNAT/Tailscale range 100.64.0.0/10)."
  echo "If your iPhone is not on the same tailnet, it will not be able to reach Metro."
  echo "Prefer a Wi‑Fi/Ethernet LAN IP (usually 192.168.x.x / 10.x.x.x / 172.16-31.x.x)."
fi

maybe_fix_invalid_api_url() {
  local env_url="${EXPO_PUBLIC_API_URL:-}"
  [[ -n "$env_url" ]] || return 0

  if command -v python3 >/dev/null 2>&1; then
    local host
    host="$(
      python3 - <<'PY' "$env_url"
import sys
from urllib.parse import urlparse

u = sys.argv[1].strip()
try:
    p = urlparse(u)
    print(p.hostname or "")
except Exception:
    print("")
PY
    )"
    if [[ -z "$host" ]]; then
      echo "Warning: EXPO_PUBLIC_API_URL is invalid; missing hostname. ({\"envUrl\":\"${env_url}\"})"
      if [[ "$PACKAGER_HOSTNAME" == "localhost" || "$PACKAGER_HOSTNAME" == "127.0.0.1" ]]; then
        export EXPO_PUBLIC_API_URL="http://localhost:3000/api/v1"
      else
        export EXPO_PUBLIC_API_URL="http://${PACKAGER_HOSTNAME}:3000/api/v1"
      fi
      echo "Using API base: ${EXPO_PUBLIC_API_URL}"
    fi
  fi
}

maybe_fix_invalid_api_url

if [[ -z "${EXPO_PUBLIC_API_URL:-}" ]]; then
  if [[ "$PACKAGER_HOSTNAME" == "localhost" || "$PACKAGER_HOSTNAME" == "127.0.0.1" ]]; then
    export EXPO_PUBLIC_API_URL="http://localhost:3000/api/v1"
  else
    export EXPO_PUBLIC_API_URL="http://${PACKAGER_HOSTNAME}:3000/api/v1"
  fi
fi

upsert_env_line() {
  local file="$1"
  local key="$2"
  local value="$3"

  if ! command -v python3 >/dev/null 2>&1; then
    return 0
  fi

  python3 - <<'PY' "$file" "$key" "$value"
import os
import sys

path, key, value = sys.argv[1], sys.argv[2], sys.argv[3]
line = f"{key}={value}"

existing = ""
if os.path.exists(path):
    try:
        existing = open(path, "r", encoding="utf-8").read()
    except Exception:
        existing = ""

lines = existing.splitlines()
replaced = False
out = []
for l in lines:
    if l.startswith(f"{key}="):
        out.append(line)
        replaced = True
    else:
        out.append(l)

if not replaced:
    if out and out[-1].strip() != "":
        out.append("")
    out.append("# Managed by scripts/ios-refresh.sh (safe to edit/remove)")
    out.append(line)

os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as f:
    f.write("\n".join(out).rstrip() + "\n")
PY
}

# Expo's dotenv loader is sometimes more reliable than shell env injection on device.
# Keep this file gitignored via apps/mobile/.gitignore (.env*.local).
if [[ -n "${EXPO_PUBLIC_API_URL:-}" ]]; then
  upsert_env_line "$APP_DIR/.env.local" "EXPO_PUBLIC_API_URL" "$EXPO_PUBLIC_API_URL" || true
fi

if [[ -n "${EXPO_PUBLIC_API_URL:-}" ]]; then
  echo "Using API base: ${EXPO_PUBLIC_API_URL}"
else
  echo "Using API base: (default) http://localhost:3000/api/v1"
fi

check_api_reachable() {
  if ! command -v curl >/dev/null 2>&1; then
    return 0
  fi

  local api_base="${EXPO_PUBLIC_API_URL:-http://localhost:3000/api/v1}"
  api_base="${api_base%/}"
  local api_root
  api_root="$(echo "$api_base" | sed -E 's#/api(/v[0-9]+)?/?$##')"
  local health_url="${api_root}/health/live"

  if curl -fsS --max-time 1 "$health_url" >/dev/null 2>&1; then
    echo "API reachable: ${health_url}"
  else
    echo "API not reachable from this Mac: ${health_url}"
    echo "Start API with: yarn workspace api start:dev"
  fi
}

check_api_reachable || true

wait_for_metro() {
  if command -v curl >/dev/null 2>&1; then
    deadline=$((SECONDS + 30))
    until curl -fs "http://127.0.0.1:${PORT}/status" >/dev/null 2>&1; do
      if [[ $SECONDS -ge $deadline ]]; then
        echo "Metro did not start on port ${PORT}."
        return 1
      fi
      sleep 1
    done
    if [[ "$PACKAGER_HOSTNAME" != "localhost" && "$PACKAGER_HOSTNAME" != "127.0.0.1" ]]; then
      deadline=$((SECONDS + 10))
      until curl -fs "http://${PACKAGER_HOSTNAME}:${PORT}/status" >/dev/null 2>&1; do
        if [[ $SECONDS -ge $deadline ]]; then
          echo "Metro is running locally but not reachable on http://${PACKAGER_HOSTNAME}:${PORT}."
          echo "This usually means the network blocks peer-to-peer traffic (client isolation), or macOS Firewall is blocking port ${PORT}."
          if is_cgnat_ip "$PACKAGER_HOSTNAME"; then
            echo "Note: ${PACKAGER_HOSTNAME} looks like a Tailscale/CGNAT IP. Use a LAN IP or enable Tailscale on both Mac and iPhone."
          fi
          return 1
        fi
        sleep 1
      done
    fi
  else
    sleep 5
  fi
}

urlencode() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.stdin.read().strip(), safe=""))'
  else
    cat
  fi
}

dev_server_url() {
  echo "http://${PACKAGER_HOSTNAME}:${PORT}"
}

dev_client_urls() {
  local server
  server="$(dev_server_url)"
  local encoded
  encoded="$(printf '%s' "$server" | urlencode)"

  if [[ -n "$APP_SCHEME" ]]; then
    echo "${APP_SCHEME}://expo-development-client/?url=${encoded}"
  fi
  if [[ -n "$APP_SLUG" ]]; then
    echo "exp+${APP_SLUG}://expo-development-client/?url=${encoded}"
  fi
}

is_simulator_udid() {
  local udid="$1"
  if [[ -z "$udid" ]] || ! command -v python3 >/dev/null 2>&1; then
    return 1
  fi
  python3 - <<'PY' "$udid"
import json, subprocess, sys
udid = sys.argv[1].strip()
try:
  data = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "devices", "--json"]))
  for runtime, devices in (data.get("devices") or {}).items():
    for d in devices or []:
      if d.get("udid") == udid:
        sys.exit(0)
except Exception:
  pass
sys.exit(1)
PY
}

open_dev_client() {
  local url
  while IFS= read -r url; do
    [[ -n "$url" ]] || continue
    echo "Dev client URL: ${url}"
    if [[ -n "$IOS_DEVICE_UDID" ]]; then
      if is_simulator_udid "$IOS_DEVICE_UDID"; then
        if ! xcrun simctl openurl "$IOS_DEVICE_UDID" "$url" >/dev/null 2>&1; then
          echo "Note: Failed to open dev client URL in simulator. Open it manually:"
          echo "  ${url}"
        fi
      elif [[ -n "$IOS_BUNDLE_ID" ]]; then
        if ! xcrun devicectl device process launch --device "$IOS_DEVICE_UDID" \
          --terminate-existing --payload-url "$url" "$IOS_BUNDLE_ID" >/dev/null 2>&1; then
          echo "Note: Failed to deep-link dev client on device. Open it manually:"
          echo "  ${url}"
          echo "Or in the app, enter: $(dev_server_url)"
        fi
      fi
    fi
  done < <(dev_client_urls)
}

detect_physical_ios_device() {
  if ! command -v xcrun >/dev/null 2>&1; then
    return 0
  fi

  local line=""
  line="$(
    xcrun xctrace list devices 2>/dev/null | awk '
      $0=="== Devices ==" {in_devices=1; next}
      $0=="== Simulators ==" {in_devices=0}
      in_devices && $0 !~ /^Mac/ && $0 ~ /\) \([0-9A-Fa-f-]+\)$/ {print; exit}
    '
  )"
  echo "$line"
}

run_ios() {
  if [[ "$IOS_RUN" == "0" ]]; then
    echo "Skipping Xcode build/install (IOS_RUN=0)."
    echo "If the app is already installed, open the dev client URL below:"
    open_dev_client
    return 0
  fi

  if [[ -n "$IOS_DEVICE_NAME" ]]; then
    EXPO_PACKAGER_HOSTNAME="$PACKAGER_HOSTNAME" REACT_NATIVE_PACKAGER_HOSTNAME="$PACKAGER_HOSTNAME" \
      EXPO_DEV_SERVER_PORT="$PORT" RCT_METRO_PORT="$PORT" \
      npx expo run:ios --device "$IOS_DEVICE_NAME" --no-bundler
  elif [[ -n "$IOS_DEVICE_UDID" ]]; then
    EXPO_PACKAGER_HOSTNAME="$PACKAGER_HOSTNAME" REACT_NATIVE_PACKAGER_HOSTNAME="$PACKAGER_HOSTNAME" \
      EXPO_DEV_SERVER_PORT="$PORT" RCT_METRO_PORT="$PORT" \
      npx expo run:ios --device "$IOS_DEVICE_UDID" --no-bundler
  else
    EXPO_PACKAGER_HOSTNAME="$PACKAGER_HOSTNAME" REACT_NATIVE_PACKAGER_HOSTNAME="$PACKAGER_HOSTNAME" \
      EXPO_DEV_SERVER_PORT="$PORT" RCT_METRO_PORT="$PORT" \
      npx expo run:ios --no-bundler
  fi

  echo "If the app says “No development servers found”, manually enter:"
  echo "  $(dev_server_url)"
  open_dev_client
}

if command -v lsof >/dev/null 2>&1; then
  existing="$(lsof -ti tcp:"$PORT" || true)"
  if [[ -n "$existing" ]]; then
    if command -v curl >/dev/null 2>&1 && curl -fs "http://127.0.0.1:${PORT}/status" >/dev/null 2>&1; then
      echo "Metro already running on port ${PORT} (reusing)."
      METRO_ALREADY_RUNNING=1
    else
      kill $existing 2>/dev/null || true
    fi
  fi
fi

cd "$APP_DIR"

if [[ -z "$IOS_DEVICE_UDID" && -z "$IOS_DEVICE_NAME" ]]; then
  if [[ "$IOS_PREFER_DEVICE" == "1" ]]; then
    device_line="$(detect_physical_ios_device || true)"
    if [[ -n "$device_line" ]]; then
      IOS_DEVICE_UDID="$(echo "$device_line" | sed -E 's/.*\\(([0-9A-Fa-f-]+)\\)\\s*$/\\1/')"
      IOS_DEVICE_NAME="$(echo "$device_line" | sed -E 's/ \\([0-9.]+\\) \\([0-9A-Fa-f-]+\\)\\s*$//')"
      echo "Using iOS device: ${IOS_DEVICE_NAME} (${IOS_DEVICE_UDID})"
    fi
  fi
fi

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
  if [[ "$METRO_ALREADY_RUNNING" == "1" && "$EXPO_FORCE_START" != "1" ]]; then
    wait_for_metro || true
    run_ios
    exit 0
  fi
  (
    wait_for_metro || true
    run_ios
  ) &
  EXPO_PACKAGER_HOSTNAME="$PACKAGER_HOSTNAME" REACT_NATIVE_PACKAGER_HOSTNAME="$PACKAGER_HOSTNAME" \
    EXPO_DEV_SERVER_PORT="$PORT" RCT_METRO_PORT="$PORT" \
    npx expo start --dev-client \
    $( [[ "$EXPO_RESET_CACHE" == "1" ]] && printf '%s' '--clear --reset-cache' ) \
    --host "$EXPO_START_HOST" --port "$PORT"
  exit 0
fi

if [[ "$METRO_ALREADY_RUNNING" == "1" && "$EXPO_FORCE_START" != "1" ]]; then
  wait_for_metro || true
  run_ios
  exit 0
fi

EXPO_PACKAGER_HOSTNAME="$PACKAGER_HOSTNAME" REACT_NATIVE_PACKAGER_HOSTNAME="$PACKAGER_HOSTNAME" \
  EXPO_DEV_SERVER_PORT="$PORT" RCT_METRO_PORT="$PORT" \
  nohup npx expo start --dev-client \
  $( [[ "$EXPO_RESET_CACHE" == "1" ]] && printf '%s' '--clear --reset-cache' ) \
  --host "$EXPO_START_HOST" --port "$PORT" \
  >"$METRO_LOG" 2>&1 &

wait_for_metro || true
run_ios

if [[ "$FOLLOW_METRO_LOGS" != "0" ]]; then
  echo "Tailing Metro logs from ${METRO_LOG} (Ctrl+C to stop)."
  tail -n 200 -f "$METRO_LOG"
fi
