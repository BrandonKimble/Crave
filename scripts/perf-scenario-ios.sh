#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  scripts/perf-scenario-ios.sh <maestro_flow.yaml> [scenario_name]

Runs a Maestro-driven iOS performance scenario while the app records JS frame,
UI frame, and JS task latency samples through crave://perf-scenario.

Environment overrides:
  PERF_SCENARIO_RUN_ID
  PERF_SCENARIO_DURATION_MS
  PERF_SCENARIO_TIMEOUT_SECS
  PERF_SCENARIO_LOG_FILE
  PERF_SCENARIO_REPORT_FILE
  PERF_SCENARIO_RECORD_VIDEO
  PERF_SCENARIO_VIDEO_FILE
  PERF_SCENARIO_SIM_LOCATION_LAT
  PERF_SCENARIO_SIM_LOCATION_LNG
  # optional flow comment: # perf-scenario-sim-location: <lat>,<lng>
  EXPO_METRO_PORT
  IOS_RUN
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

flow_path="${1:-}"
if [[ -z "$flow_path" ]]; then
  usage >&2
  exit 2
fi

if [[ ! -f "$flow_path" ]]; then
  echo "[perf-scenario-ios] Maestro flow not found: ${flow_path}" >&2
  exit 2
fi
flow_path="$(cd "$(dirname "$flow_path")" && pwd)/$(basename "$flow_path")"

if ! command -v maestro >/dev/null 2>&1; then
  echo "[perf-scenario-ios] Maestro CLI is not installed." >&2
  echo "[perf-scenario-ios] Install it from https://docs.maestro.dev/get-started/installing-maestro, then rerun this command." >&2
  exit 127
fi

timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
random_suffix="$(printf '%04x' $((RANDOM % 65536)))"
flow_basename="$(basename "$flow_path")"
scenario_default="${flow_basename%.*}"
scenario_name="${2:-${PERF_SCENARIO_NAME:-$scenario_default}}"
run_id="${PERF_SCENARIO_RUN_ID:-scenario-${scenario_name}-${timestamp_utc}-${random_suffix}}"
request_id="${run_id}-$(date +%s)"
flow_sim_location="$(
  python3 - "$flow_path" <<'PY'
import re
import sys

pattern = re.compile(
    r"^\s*#\s*perf-scenario-sim-location\s*:\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*$"
)
try:
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        for line in handle:
            match = pattern.match(line)
            if match:
                print(f"{match.group(1)},{match.group(2)}")
                break
except OSError:
    pass
PY
)"
default_sim_location_lat="30.2672"
default_sim_location_lng="-97.7431"
if [[ -n "$flow_sim_location" && -z "${PERF_SCENARIO_SIM_LOCATION_LAT:-}" && -z "${PERF_SCENARIO_SIM_LOCATION_LNG:-}" ]]; then
  IFS=, read -r default_sim_location_lat default_sim_location_lng <<<"$flow_sim_location"
fi
if { [[ -n "${PERF_SCENARIO_SIM_LOCATION_LAT:-}" ]] && [[ -z "${PERF_SCENARIO_SIM_LOCATION_LNG:-}" ]]; } || { [[ -z "${PERF_SCENARIO_SIM_LOCATION_LAT:-}" ]] && [[ -n "${PERF_SCENARIO_SIM_LOCATION_LNG:-}" ]]; }; then
  echo "[perf-scenario-ios] PERF_SCENARIO_SIM_LOCATION_LAT and PERF_SCENARIO_SIM_LOCATION_LNG must be set together." >&2
  exit 2
fi

export EXPO_METRO_PORT="${EXPO_METRO_PORT:-8082}"
export PERF_SCENARIO_URL_SCHEME="${PERF_SCENARIO_URL_SCHEME:-crave}"
export PERF_SCENARIO_DURATION_MS="${PERF_SCENARIO_DURATION_MS:-180000}"
export PERF_SCENARIO_TIMEOUT_SECS="${PERF_SCENARIO_TIMEOUT_SECS:-240}"
export PERF_SHORTCUT_USE_SIMULATOR="${PERF_SHORTCUT_USE_SIMULATOR:-1}"
export IOS_SIMULATOR_NAME="${IOS_SIMULATOR_NAME:-iPhone 16e}"
export IOS_RUN="${IOS_RUN:-0}"
export EXPO_FORCE_START="${EXPO_FORCE_START:-1}"
export IOS_REFRESH_WRITE_ENV_LOCAL="${IOS_REFRESH_WRITE_ENV_LOCAL:-0}"
export FOLLOW_METRO_LOGS=0
export EXPO_PUBLIC_PERF_NAV_SWITCH_ATTRIBUTION="${EXPO_PUBLIC_PERF_NAV_SWITCH_ATTRIBUTION:-1}"
export EXPO_PUBLIC_PERF_NAV_SWITCH_RUNTIME_ATTRIBUTION="${EXPO_PUBLIC_PERF_NAV_SWITCH_RUNTIME_ATTRIBUTION:-1}"
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"
export MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED="${MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:-true}"

if [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home ]]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home"
  export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
elif [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
fi

if [[ "$PERF_SHORTCUT_USE_SIMULATOR" == "1" ]]; then
  export IOS_PREFER_DEVICE=0
  export IOS_DEVICE_UDID=""
  export IOS_DEVICE_NAME=""
  export EXPO_PACKAGER_HOSTNAME="${EXPO_PACKAGER_HOSTNAME:-localhost}"
else
  export IOS_PREFER_DEVICE="${IOS_PREFER_DEVICE:-1}"
  export IOS_DEVICE_UDID="${IOS_DEVICE_UDID:-${IOS_SIMULATOR_UDID:-}}"
  export IOS_DEVICE_NAME="${IOS_DEVICE_NAME:-${IOS_SIMULATOR_NAME:-}}"
fi

export EXPO_PUBLIC_PERF_JS_FRAME_SAMPLER="${EXPO_PUBLIC_PERF_JS_FRAME_SAMPLER:-1}"
export EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS="${EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS:-500}"
export EXPO_PUBLIC_PERF_JS_FRAME_STALL_FRAME_MS="${EXPO_PUBLIC_PERF_JS_FRAME_STALL_FRAME_MS:-50}"
export EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS="${EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS:-58}"
export EXPO_PUBLIC_PERF_JS_TASK_LATENCY_SAMPLER="${EXPO_PUBLIC_PERF_JS_TASK_LATENCY_SAMPLER:-1}"
export EXPO_PUBLIC_PERF_JS_TASK_LATENCY_WINDOW_MS="${EXPO_PUBLIC_PERF_JS_TASK_LATENCY_WINDOW_MS:-500}"
export EXPO_PUBLIC_PERF_JS_TASK_LATENCY_SAMPLE_INTERVAL_MS="${EXPO_PUBLIC_PERF_JS_TASK_LATENCY_SAMPLE_INTERVAL_MS:-8}"
export EXPO_PUBLIC_PERF_JS_TASK_LATENCY_STALL_LAG_MS="${EXPO_PUBLIC_PERF_JS_TASK_LATENCY_STALL_LAG_MS:-50}"
export EXPO_PUBLIC_PERF_JS_TASK_LATENCY_LOG_ONLY_ABOVE_MS="${EXPO_PUBLIC_PERF_JS_TASK_LATENCY_LOG_ONLY_ABOVE_MS:-12}"
export EXPO_PUBLIC_PERF_UI_FRAME_SAMPLER="${EXPO_PUBLIC_PERF_UI_FRAME_SAMPLER:-1}"
export EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS="${EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS:-500}"
export EXPO_PUBLIC_PERF_UI_FRAME_STALL_FRAME_MS="${EXPO_PUBLIC_PERF_UI_FRAME_STALL_FRAME_MS:-50}"
export EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS="${EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS:-58}"

METRO_LOG_PATH_DEFAULT="/tmp/expo-metro-${run_id}.log"
SCENARIO_LOG_DEFAULT="/tmp/perf-scenario-${run_id}.log"
SCENARIO_REPORT_DEFAULT="/tmp/perf-scenario-${run_id}.json"
SCENARIO_SCREENSHOT_DIR_DEFAULT="/tmp/perf-scenario-screenshots-${run_id}"
SCENARIO_VIDEO_DEFAULT="/tmp/perf-scenario-video-${run_id}.mov"
export EXPO_METRO_LOG_PATH="${EXPO_METRO_LOG_PATH:-$METRO_LOG_PATH_DEFAULT}"
export PERF_SCENARIO_LOG_FILE="${PERF_SCENARIO_LOG_FILE:-$SCENARIO_LOG_DEFAULT}"
export PERF_SCENARIO_REPORT_FILE="${PERF_SCENARIO_REPORT_FILE:-$SCENARIO_REPORT_DEFAULT}"
export PERF_SCENARIO_SCREENSHOT_DIR="${PERF_SCENARIO_SCREENSHOT_DIR:-$SCENARIO_SCREENSHOT_DIR_DEFAULT}"
export PERF_SCENARIO_RECORD_VIDEO="${PERF_SCENARIO_RECORD_VIDEO:-0}"
export PERF_SCENARIO_VIDEO_FILE="${PERF_SCENARIO_VIDEO_FILE:-$SCENARIO_VIDEO_DEFAULT}"
export PERF_SCENARIO_SIM_LOCATION_LAT="${PERF_SCENARIO_SIM_LOCATION_LAT:-$default_sim_location_lat}"
export PERF_SCENARIO_SIM_LOCATION_LNG="${PERF_SCENARIO_SIM_LOCATION_LNG:-$default_sim_location_lng}"

mkdir -p "$(dirname "$EXPO_METRO_LOG_PATH")" "$(dirname "$PERF_SCENARIO_LOG_FILE")" "$(dirname "$PERF_SCENARIO_REPORT_FILE")" "$(dirname "$PERF_SCENARIO_VIDEO_FILE")" "$PERF_SCENARIO_SCREENSHOT_DIR"
: > "$PERF_SCENARIO_LOG_FILE"
rm -f "$PERF_SCENARIO_SCREENSHOT_DIR"/*.png
if [[ "$PERF_SCENARIO_RECORD_VIDEO" == "1" ]]; then
  rm -f "$PERF_SCENARIO_VIDEO_FILE"
fi

echo "[perf-scenario-ios] Starting scenario:"
echo "  scenario=${scenario_name}"
echo "  scenarioRunId=${run_id}"
echo "  flow=${flow_path}"
echo "  metroLog=${EXPO_METRO_LOG_PATH}"
echo "  runLog=${PERF_SCENARIO_LOG_FILE}"
echo "  report=${PERF_SCENARIO_REPORT_FILE}"
echo "  screenshots=${PERF_SCENARIO_SCREENSHOT_DIR}"
echo "  simulatorLocation=${PERF_SCENARIO_SIM_LOCATION_LAT},${PERF_SCENARIO_SIM_LOCATION_LNG}"
if [[ "$PERF_SCENARIO_RECORD_VIDEO" == "1" ]]; then
  echo "  video=${PERF_SCENARIO_VIDEO_FILE}"
fi

tail_pid=""
visual_screenshot_watcher_pid=""
record_video_pid=""
cleanup() {
  if [[ -n "$tail_pid" ]]; then
    kill "$tail_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$visual_screenshot_watcher_pid" ]]; then
    kill "$visual_screenshot_watcher_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$record_video_pid" ]]; then
    kill -INT "$record_video_pid" >/dev/null 2>&1 || true
    wait "$record_video_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

cd "$REPO_ROOT"

resolve_simulator_udid() {
  if [[ -n "${IOS_SIMULATOR_UDID:-}" ]]; then
    printf '%s\n' "$IOS_SIMULATOR_UDID"
    return 0
  fi
  xcrun simctl list devices booted -j 2>/dev/null | ruby -rjson -e 'data = JSON.parse(STDIN.read); preferred = ENV.fetch("IOS_SIMULATOR_NAME", "").strip; devices = data.fetch("devices").values.flatten.select { |entry| entry["state"] == "Booted" }; device = devices.find { |entry| preferred != "" && entry["name"] == preferred } || devices.find { |entry| preferred == "" || entry["name"].to_s.start_with?("iPhone 16") } || devices.first; puts(device ? device["udid"] : "")'
}

wait_for_metro_log() {
  local deadline="$1"
  while [[ ! -f "$EXPO_METRO_LOG_PATH" ]]; do
    if [[ $SECONDS -ge $deadline ]]; then
      echo "[perf-scenario-ios] Timed out waiting for Metro log: ${EXPO_METRO_LOG_PATH}" | tee -a "$PERF_SCENARIO_LOG_FILE"
      exit 1
    fi
    sleep 1
  done
}

wait_for_log_pattern() {
  local pattern="$1"
  local deadline="$2"
  local description="$3"
  while [[ $SECONDS -lt $deadline ]]; do
    if grep -a -q "$pattern" "$PERF_SCENARIO_LOG_FILE"; then
      return 0
    fi
    sleep 1
  done
  echo "[perf-scenario-ios] Timed out waiting for ${description}." | tee -a "$PERF_SCENARIO_LOG_FILE"
  return 1
}

build_scenario_url() {
  python3 - <<'PY'
import os
from urllib.parse import urlencode

params = {
    "requestId": os.environ["PERF_SCENARIO_REQUEST_ID"],
    "scenario": os.environ["PERF_SCENARIO_NAME"],
    "scenarioRunId": os.environ["PERF_SCENARIO_RUN_ID_VALUE"],
    "durationMs": os.environ["PERF_SCENARIO_DURATION_MS"],
    "jsSampler": os.environ["EXPO_PUBLIC_PERF_JS_FRAME_SAMPLER"],
    "jsWindowMs": os.environ["EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS"],
    "jsStallFrameMs": os.environ["EXPO_PUBLIC_PERF_JS_FRAME_STALL_FRAME_MS"],
    "jsFpsThreshold": os.environ["EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS"],
    "taskSampler": os.environ["EXPO_PUBLIC_PERF_JS_TASK_LATENCY_SAMPLER"],
    "taskWindowMs": os.environ["EXPO_PUBLIC_PERF_JS_TASK_LATENCY_WINDOW_MS"],
    "taskSampleIntervalMs": os.environ["EXPO_PUBLIC_PERF_JS_TASK_LATENCY_SAMPLE_INTERVAL_MS"],
    "taskStallLagMs": os.environ["EXPO_PUBLIC_PERF_JS_TASK_LATENCY_STALL_LAG_MS"],
    "taskLogOnlyAboveLagMs": os.environ["EXPO_PUBLIC_PERF_JS_TASK_LATENCY_LOG_ONLY_ABOVE_MS"],
    "uiSampler": os.environ["EXPO_PUBLIC_PERF_UI_FRAME_SAMPLER"],
    "uiWindowMs": os.environ["EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS"],
    "uiStallFrameMs": os.environ["EXPO_PUBLIC_PERF_UI_FRAME_STALL_FRAME_MS"],
    "uiFpsThreshold": os.environ["EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS"],
    "signature": "|".join([
        f"scenario:{os.environ['PERF_SCENARIO_NAME']}",
        f"scenarioRunId:{os.environ['PERF_SCENARIO_RUN_ID_VALUE']}",
        f"flow:{os.environ['PERF_SCENARIO_FLOW_PATH']}",
    ]),
}
print(os.environ["PERF_SCENARIO_URL_SCHEME"] + "://perf-scenario?" + urlencode(params))
PY
}

build_clear_url() {
  python3 - <<'PY'
import os
from urllib.parse import urlencode

print(os.environ["PERF_SCENARIO_URL_SCHEME"] + "://perf-scenario-clear?" + urlencode({"scenarioRunId": os.environ["PERF_SCENARIO_RUN_ID_VALUE"]}))
PY
}

build_clear_all_url() {
  printf '%s://perf-scenario-clear\n' "$PERF_SCENARIO_URL_SCHEME"
}

build_run_flow_path() {
  python3 - <<'PY'
import os
import tempfile
from pathlib import Path
from urllib.parse import quote

source_path = Path(os.environ["PERF_SCENARIO_FLOW_PATH"])
run_id = os.environ["PERF_SCENARIO_RUN_ID_VALUE"]
scheme = os.environ["PERF_SCENARIO_URL_SCHEME"]
source_url_prefix = "crave://perf-scenario-mark?phase="
replacement_prefix = (
    scheme
    + "://perf-scenario-mark?"
    + "scenarioRunId="
    + quote(run_id, safe="")
    + "&phase="
)
lines = []
for line in source_path.read_text().splitlines():
    if "openLink:" in line and "://perf-scenario-" in line:
        prefix, value = line.split("openLink:", 1)
        url = value.strip().strip('"').strip("'")
        if url.startswith(source_url_prefix):
            url = url.replace(source_url_prefix, replacement_prefix, 1)
        elif url.startswith("crave://"):
            url = scheme + "://" + url[len("crave://"):]
        if "://perf-scenario-" in url and "scenarioRunId=" not in url:
            separator = "&" if "?" in url else "?"
            url = f"{url}{separator}scenarioRunId={quote(run_id, safe='')}"
        line = f"{prefix}openLink: '{url}'"
    lines.append(line)
text = "\n".join(lines) + "\n"
fd, path = tempfile.mkstemp(
    prefix=f"{source_path.stem}-{quote(run_id, safe='')}-",
    suffix=source_path.suffix,
)
with os.fdopen(fd, "w") as handle:
    handle.write(text)
print(path)
PY
}

build_dev_client_url() {
  python3 - <<'PY'
import os
from urllib.parse import quote

port = os.environ["EXPO_METRO_PORT"]
scheme = os.environ.get("EXPO_APP_SCHEME") or os.environ["PERF_SCENARIO_URL_SCHEME"]
print(f"{scheme}://expo-development-client/?url=" + quote(f"http://localhost:{port}", safe=""))
PY
}

open_simulator_url() {
  local url="$1"
  if ! xcrun simctl openurl "$simulator_udid" "$url" >/dev/null 2>&1; then
    xcrun simctl openurl booted "$url" >/dev/null 2>&1 || true
  fi
}

tap_dev_client_server_if_visible() {
  local server_url="http://localhost:${EXPO_METRO_PORT}"
  local flow
  flow="$(mktemp "${TMPDIR:-/tmp}/perf-dev-client-server-XXXXXXXX.yaml")"
  cat >"$flow" <<YAML
appId: com.brandonkimble.cravesearch
---
- tapOn:
    text: '${server_url}'
    optional: true
- waitForAnimationToEnd:
    timeout: 1500
- tapOn:
    text: '${server_url}'
    optional: true
- waitForAnimationToEnd:
    timeout: 1500
- tapOn:
    text: 'localhost:${EXPO_METRO_PORT}'
    optional: true
- waitForAnimationToEnd:
    timeout: 3000
YAML
  (
    cd "$PERF_SCENARIO_SCREENSHOT_DIR"
    maestro test \
      --platform ios \
      --udid "$simulator_udid" \
      --config "$REPO_ROOT/maestro/perf/config.yaml" \
      "$flow"
  ) >>"$PERF_SCENARIO_LOG_FILE" 2>&1 || true
  rm -f "$flow"
}

deadline=$((SECONDS + PERF_SCENARIO_TIMEOUT_SECS))

IOS_RUN="$IOS_RUN" EXPO_FORCE_START="$EXPO_FORCE_START" bash ./scripts/ios-refresh.sh 2>&1 | tee -a "$PERF_SCENARIO_LOG_FILE"
wait_for_metro_log "$deadline"
tail -n 0 -F "$EXPO_METRO_LOG_PATH" | ruby -ne 'printf("[perf-scenario-ios][hostEpochMs=%.1f] %s", Time.now.to_f * 1000.0, $_)' | tee -a "$PERF_SCENARIO_LOG_FILE" &
tail_pid=$!

simulator_udid="$(resolve_simulator_udid)"
if [[ -z "$simulator_udid" ]]; then
  echo "[perf-scenario-ios] No booted simulator found." | tee -a "$PERF_SCENARIO_LOG_FILE"
  exit 1
fi
xcrun simctl terminate "$simulator_udid" com.brandonkimble.cravesearch >/dev/null 2>&1 || true
if [[ -n "$PERF_SCENARIO_SIM_LOCATION_LAT" && -n "$PERF_SCENARIO_SIM_LOCATION_LNG" ]]; then
  xcrun simctl location "$simulator_udid" set "${PERF_SCENARIO_SIM_LOCATION_LAT},${PERF_SCENARIO_SIM_LOCATION_LNG}" >/dev/null 2>&1 || true
fi
xcrun simctl launch "$simulator_udid" com.brandonkimble.cravesearch >/dev/null 2>&1 || true
sleep 2

if [[ "$PERF_SCENARIO_RECORD_VIDEO" == "1" ]]; then
  video_start_host_epoch_ms="$(ruby -e 'printf("%.1f", Time.now.to_f * 1000.0)')"
  printf '[perf-scenario-ios][video_timing] {"event":"video_recording_started","hostEpochMs":%s,"videoFile":"%s","scenarioRunId":"%s"}\n' "$video_start_host_epoch_ms" "$PERF_SCENARIO_VIDEO_FILE" "$run_id" | tee -a "$PERF_SCENARIO_LOG_FILE"
  echo "[perf-scenario-ios] Recording simulator video: ${PERF_SCENARIO_VIDEO_FILE}" | tee -a "$PERF_SCENARIO_LOG_FILE"
  xcrun simctl io "$simulator_udid" recordVideo "$PERF_SCENARIO_VIDEO_FILE" >/dev/null 2>&1 &
  record_video_pid=$!
  sleep 1
fi

export PERF_SCENARIO_REQUEST_ID="$request_id"
export PERF_SCENARIO_NAME="$scenario_name"
export PERF_SCENARIO_RUN_ID_VALUE="$run_id"
export PERF_SCENARIO_FLOW_PATH="$flow_path"

scenario_url="$(build_scenario_url)"
clear_url="$(build_clear_url)"
clear_all_url="$(build_clear_all_url)"
run_flow_path="$(build_run_flow_path)"
dev_client_url="$(build_dev_client_url)"

echo "[perf-scenario-ios] Generated Maestro run flow: ${run_flow_path}" | tee -a "$PERF_SCENARIO_LOG_FILE"
echo "[perf-scenario-ios] Dev client URL: ${dev_client_url}" | tee -a "$PERF_SCENARIO_LOG_FILE"
echo "[perf-scenario-ios] Generated perf-scenario mark links:" | tee -a "$PERF_SCENARIO_LOG_FILE"
grep -n "perf-scenario-mark" "$run_flow_path" | tee -a "$PERF_SCENARIO_LOG_FILE" || true

echo "[perf-scenario-ios] Enabling app-side performance samplers..." | tee -a "$PERF_SCENARIO_LOG_FILE"
open_simulator_url "$dev_client_url"
bundle_ready_deadline=$((SECONDS + 25))
while [[ $SECONDS -lt $bundle_ready_deadline ]]; do
  if grep -a -q "iOS Bundled" "$PERF_SCENARIO_LOG_FILE"; then
    break
  fi
  if (( (bundle_ready_deadline - SECONDS) % 5 == 0 )); then
    open_simulator_url "$dev_client_url"
  fi
  sleep 1
done
open_simulator_url "$dev_client_url"
tap_dev_client_server_if_visible
sleep 1
open_simulator_url "$clear_all_url"
sleep 1
scenario_started_deadline=$((SECONDS + 30))
while [[ $SECONDS -lt $scenario_started_deadline ]]; do
  open_simulator_url "$scenario_url"
  sleep 2
  if grep -a -q "\"event\":\"scenario_config_received\".*\"scenarioRunId\":\"${run_id}\"" "$PERF_SCENARIO_LOG_FILE"; then
    break
  fi
done
wait_for_log_pattern "\"event\":\"scenario_config_received\".*\"scenarioRunId\":\"${run_id}\"" "$scenario_started_deadline" "scenario_config_received for scenarioRunId=${run_id}"

if [[ -n "$PERF_SCENARIO_SIM_LOCATION_LAT" && -n "$PERF_SCENARIO_SIM_LOCATION_LNG" ]]; then
  echo "[perf-scenario-ios] Pulsing simulator location after scenario start: ${PERF_SCENARIO_SIM_LOCATION_LAT},${PERF_SCENARIO_SIM_LOCATION_LNG}" | tee -a "$PERF_SCENARIO_LOG_FILE"
  xcrun simctl location "$simulator_udid" set "${PERF_SCENARIO_SIM_LOCATION_LAT},${PERF_SCENARIO_SIM_LOCATION_LNG}" >/dev/null 2>&1 || true
  sleep 1
fi

capture_perf_scenario_screenshot() {
  local screenshot_name="$1"
  local trigger_label="${2:-manual}"
  local screenshot_path="${PERF_SCENARIO_SCREENSHOT_DIR}/${screenshot_name}.png"
  printf 'Take screenshot %s trigger=%s...\n' "$screenshot_name" "$trigger_label" | tee -a "$PERF_SCENARIO_LOG_FILE"
  if xcrun simctl io "$simulator_udid" screenshot "$screenshot_path" >/dev/null 2>&1; then
    printf 'Take screenshot %s trigger=%s... COMPLETED\n' "$screenshot_name" "$trigger_label" | tee -a "$PERF_SCENARIO_LOG_FILE"
    return 0
  fi
  printf 'Take screenshot %s trigger=%s... FAILED\n' "$screenshot_name" "$trigger_label" | tee -a "$PERF_SCENARIO_LOG_FILE"
  return 1
}

start_visual_parity_screenshot_watcher() {
  if [[ "$scenario_name" != "search_submit_visual_parity" ]]; then
    return 0
  fi

  (
    capture_pids=()
    capture_perf_scenario_screenshot_async() {
      local screenshot_name="$1"
      local trigger_label="$2"
      capture_perf_scenario_screenshot "$screenshot_name" "$trigger_label" &
      capture_pids+=("$!")
    }
    wait_for_perf_scenario_screenshots() {
      local pid
      for pid in "${capture_pids[@]}"; do
        wait "$pid" >/dev/null 2>&1 || true
      done
    }
    entering_ready_seen=0
    entering_captured=0
    close_press_seen=0
    close_captured=0
    early_captured=0
    mid_captured=0
    boundary_handoff_seen=0
    boundary_captured=0
    tail -n 0 -F "$PERF_SCENARIO_LOG_FILE" 2>/dev/null | while IFS= read -r line; do
      if [[ $entering_ready_seen -eq 0 &&
        "$line" == *'"scenarioRunId":"'"$run_id"'"'* &&
        "$line" == *'"event":"search_results_header_source_contract"'* &&
        "$line" == *'"surfaceMode":"initial_loading"'* &&
        "$line" == *'"hasStableHeaderChromeForRender":true'* ]]; then
        entering_ready_seen=1
      fi

      if [[ $entering_ready_seen -eq 1 &&
        $entering_captured -eq 0 &&
        "$line" == *'"scenarioRunId":"'"$run_id"'"'* &&
        "$line" == *'"event":"nav_cutout_lockstep_contract"'* &&
        "$line" == *'"navMotionTarget":"hide"'* &&
        "$line" == *'"navBarCutoutIsHiding":true'* &&
        "$line" == *'"sheetClippedFromNavBody":true'* &&
        "$line" == *'"singleNavSilhouetteHost":true'* &&
        "$line" == *'"navSilhouetteSheetMaskUsesInversePath":true'* &&
        "$line" == *'"sheetClipUsesNavProgress":true'* &&
        "$line" == *'"sheetClipUsesSilhouettePath":true'* &&
        "$line" != *'"expectedSheetMaskHeight":0'* &&
        "$line" != *'"navTranslateY":0,'* ]]; then
        entering_captured=1
        capture_perf_scenario_screenshot_async "search-visual-results-entering" "nav_hide"
      fi

      if [[ $close_press_seen -eq 0 &&
        "$line" == *'"scenarioRunId":"'"$run_id"'"'* &&
        "$line" == *'"event":"results_dismiss_press_up_contract"'* ]]; then
        close_press_seen=1
      fi

      if [[ $close_press_seen -eq 1 &&
        $close_captured -eq 0 &&
        "$line" == *'"scenarioRunId":"'"$run_id"'"'* &&
        "$line" == *'"event":"nav_cutout_lockstep_contract"'* &&
        "$line" == *'"navMotionTarget":"show"'* &&
        "$line" == *'"isResultsClosing":true'* &&
        "$line" == *'"searchSurfacePhase":"results_dismissing"'* &&
        "$line" == *'"searchSurfaceBottomBandOwner":"results_header"'* &&
        "$line" == *'"searchSurfaceCanReleasePersistentPolls":false'* &&
        ( "$line" == *'"sheetMotionSource":"searchSurfaceMotionPlane"'* ||
          "$line" == *'"sheetMotionSource":"routeSheetMotionCommandObservedBySearchSurfaceMotionPlane"'* ) &&
        "$line" == *'"navReturnProgressSource":"bottomNavTiming"'* &&
        "$line" == *'"navSilhouetteSheetMaskUsesInversePath":true'* &&
        "$line" == *'"sheetClipUsesSilhouettePath":true'* ]]; then
        close_captured=1
      fi

      if [[ $close_press_seen -eq 1 &&
        $early_captured -eq 0 &&
	    "$line" == *'"scenarioRunId":"'"$run_id"'"'* &&
	    "$line" == *'"event":"search_dismiss_motion_plane_contract"'* &&
	    "$line" == *'"resultSheetSlidingDown":true'* &&
	    "$line" == *'"proofStage":"early_progress"'* &&
	    ( "$line" == *'"sheetMotionSource":"searchSurfaceMotionPlane"'* ||
	      "$line" == *'"sheetMotionSource":"routeSheetMotionCommandObservedBySearchSurfaceMotionPlane"'* ) &&
	    "$line" == *'"navReturnProgressSource":"bottomNavTiming"'* &&
	    "$line" == *'"boundaryCommitSource":"searchSurfaceMotionPlane"'* ]]; then
        early_captured=1
      fi

      if [[ $close_press_seen -eq 1 &&
        $mid_captured -eq 0 &&
	    "$line" == *'"scenarioRunId":"'"$run_id"'"'* &&
	    "$line" == *'"event":"search_dismiss_motion_plane_contract"'* &&
	    "$line" == *'"resultSheetSlidingDown":true'* &&
	    "$line" == *'"proofStage":"mid_progress"'* &&
	    ( "$line" == *'"sheetMotionSource":"searchSurfaceMotionPlane"'* ||
	      "$line" == *'"sheetMotionSource":"routeSheetMotionCommandObservedBySearchSurfaceMotionPlane"'* ) &&
	    "$line" == *'"navReturnProgressSource":"bottomNavTiming"'* &&
	    "$line" == *'"boundaryCommitSource":"searchSurfaceMotionPlane"'* ]]; then
        mid_captured=1
      fi

      if [[ $close_press_seen -eq 1 &&
        $boundary_handoff_seen -eq 0 &&
        "$line" == *'"scenarioRunId":"'"$run_id"'"'* &&
        "$line" == *'"event":"results_dismiss_bottom_snap_handoff_contract"'* &&
        "$line" == *'"boundaryTrigger":"collapsed_motion_plane_boundary"'* &&
        "$line" == *'"persistentPollsSwitchAtBottomSnap":true'* ]]; then
        boundary_handoff_seen=1
      fi

      if [[ $close_press_seen -eq 1 &&
        $boundary_handoff_seen -eq 1 &&
        $boundary_captured -eq 0 &&
        "$line" == *'"scenarioRunId":"'"$run_id"'"'* &&
        "$line" == *'"event":"persistent_polls_restore_settled_contract"'* &&
        "$line" == *'"restoredToCollapsed":true'* ]]; then
        boundary_captured=1
      fi

      if [[ $entering_captured -eq 1 &&
        $close_captured -eq 1 &&
        $early_captured -eq 1 &&
        $mid_captured -eq 1 &&
        $boundary_captured -eq 1 ]]; then
        wait_for_perf_scenario_screenshots
        break
      fi
    done
  ) &
  visual_screenshot_watcher_pid=$!
}

maestro_status=0
start_visual_parity_screenshot_watcher
(
  cd "$PERF_SCENARIO_SCREENSHOT_DIR"
  maestro test \
    --platform ios \
    --udid "$simulator_udid" \
    --config "$REPO_ROOT/maestro/perf/config.yaml" \
    --test-output-dir "$PERF_SCENARIO_SCREENSHOT_DIR" \
    "$run_flow_path"
) > >(tee -a "$PERF_SCENARIO_LOG_FILE") 2>&1 &
maestro_pid=$!
maestro_deadline=$((SECONDS + PERF_SCENARIO_TIMEOUT_SECS))
while kill -0 "$maestro_pid" >/dev/null 2>&1; do
  if (( SECONDS >= maestro_deadline )); then
    echo "[perf-scenario-ios] Maestro timed out after ${PERF_SCENARIO_TIMEOUT_SECS}s; terminating flow." | tee -a "$PERF_SCENARIO_LOG_FILE"
    pkill -TERM -P "$maestro_pid" >/dev/null 2>&1 || true
    kill -TERM "$maestro_pid" >/dev/null 2>&1 || true
    sleep 2
    pkill -KILL -P "$maestro_pid" >/dev/null 2>&1 || true
    kill -KILL "$maestro_pid" >/dev/null 2>&1 || true
    maestro_status=124
    break
  fi
  sleep 1
done
if [[ "$maestro_status" -eq 0 ]]; then
  wait "$maestro_pid" || maestro_status=$?
else
  wait "$maestro_pid" >/dev/null 2>&1 || true
fi

echo "[perf-scenario-ios] Clearing app-side performance samplers..." | tee -a "$PERF_SCENARIO_LOG_FILE"
xcrun simctl openurl "$simulator_udid" "$clear_url" || true
sleep 1

if [[ -n "$record_video_pid" ]]; then
  echo "[perf-scenario-ios] Stopping simulator video recording..." | tee -a "$PERF_SCENARIO_LOG_FILE"
  video_stop_requested_host_epoch_ms="$(ruby -e 'printf("%.1f", Time.now.to_f * 1000.0)')"
  printf '[perf-scenario-ios][video_timing] {"event":"video_recording_stop_requested","hostEpochMs":%s,"videoFile":"%s","scenarioRunId":"%s"}\n' "$video_stop_requested_host_epoch_ms" "$PERF_SCENARIO_VIDEO_FILE" "$run_id" | tee -a "$PERF_SCENARIO_LOG_FILE"
  kill -INT "$record_video_pid" >/dev/null 2>&1 || true
  wait "$record_video_pid" >/dev/null 2>&1 || true
  record_video_pid=""
  video_stop_host_epoch_ms="$(ruby -e 'printf("%.1f", Time.now.to_f * 1000.0)')"
  printf '[perf-scenario-ios][video_timing] {"event":"video_recording_stopped","hostEpochMs":%s,"videoFile":"%s","scenarioRunId":"%s"}\n' "$video_stop_host_epoch_ms" "$PERF_SCENARIO_VIDEO_FILE" "$run_id" | tee -a "$PERF_SCENARIO_LOG_FILE"
  echo "[perf-scenario-ios] Video saved: ${PERF_SCENARIO_VIDEO_FILE}" | tee -a "$PERF_SCENARIO_LOG_FILE"
  if [[ "$scenario_name" == "search_submit_visual_parity" || "$scenario_name" == "search_submit_dismiss_repeat_dense" ]]; then
    if ! node ./scripts/perf-scenario-extract-video-proofs.js "$PERF_SCENARIO_LOG_FILE" "$PERF_SCENARIO_VIDEO_FILE" "$PERF_SCENARIO_SCREENSHOT_DIR" | tee -a "$PERF_SCENARIO_LOG_FILE"; then
      echo "[perf-scenario-ios] Video proof extraction failed; report generation will continue for diagnostics." | tee -a "$PERF_SCENARIO_LOG_FILE"
      maestro_status=1
    fi
  fi
fi

node ./scripts/perf-scenario-report.js "$PERF_SCENARIO_LOG_FILE" "$PERF_SCENARIO_REPORT_FILE" | tee -a "$PERF_SCENARIO_LOG_FILE"

exit "$maestro_status"
