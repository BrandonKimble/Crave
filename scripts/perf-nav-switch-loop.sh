#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
random_suffix="$(printf '%04x' $((RANDOM % 65536)))"
default_run_id="nav-switch-loop-${timestamp_utc}-${random_suffix}"

export EXPO_PUBLIC_PERF_HARNESS_ENABLED="${EXPO_PUBLIC_PERF_HARNESS_ENABLED:-1}"
export EXPO_PUBLIC_PERF_HARNESS_ALLOW_NON_DEV="${EXPO_PUBLIC_PERF_HARNESS_ALLOW_NON_DEV:-0}"
export EXPO_PUBLIC_PERF_HARNESS_SCENARIO="${EXPO_PUBLIC_PERF_HARNESS_SCENARIO:-search_nav_switch_loop}"
export EXPO_PUBLIC_PERF_HARNESS_RUNS="${EXPO_PUBLIC_PERF_HARNESS_RUNS:-5}"
export EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS="${EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS:-3000}"
export EXPO_PUBLIC_PERF_HARNESS_COOLDOWN_MS="${EXPO_PUBLIC_PERF_HARNESS_COOLDOWN_MS:-1200}"
export EXPO_PUBLIC_PERF_HARNESS_RUN_ID="${EXPO_PUBLIC_PERF_HARNESS_RUN_ID:-$default_run_id}"

export EXPO_PUBLIC_PERF_NAV_SWITCH_SEQUENCE="${EXPO_PUBLIC_PERF_NAV_SWITCH_SEQUENCE:-bookmarks,profile,bookmarks,search}"
export EXPO_PUBLIC_PERF_NAV_SWITCH_STEP_COOLDOWN_MS="${EXPO_PUBLIC_PERF_NAV_SWITCH_STEP_COOLDOWN_MS:-250}"
export EXPO_PUBLIC_PERF_NAV_SWITCH_SETTLE_QUIET_PERIOD_MS="${EXPO_PUBLIC_PERF_NAV_SWITCH_SETTLE_QUIET_PERIOD_MS:-250}"
export EXPO_PUBLIC_PERF_NAV_SWITCH_STEP_TIMEOUT_MS="${EXPO_PUBLIC_PERF_NAV_SWITCH_STEP_TIMEOUT_MS:-2500}"

export EXPO_PUBLIC_PERF_JS_FRAME_SAMPLER="${EXPO_PUBLIC_PERF_JS_FRAME_SAMPLER:-1}"
export EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS="${EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS:-500}"
export EXPO_PUBLIC_PERF_JS_FRAME_STALL_FRAME_MS="${EXPO_PUBLIC_PERF_JS_FRAME_STALL_FRAME_MS:-50}"
export EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS="${EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS:-58}"
export EXPO_PUBLIC_PERF_UI_FRAME_SAMPLER="${EXPO_PUBLIC_PERF_UI_FRAME_SAMPLER:-1}"
export EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS="${EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS:-500}"
export EXPO_PUBLIC_PERF_UI_FRAME_STALL_FRAME_MS="${EXPO_PUBLIC_PERF_UI_FRAME_STALL_FRAME_MS:-50}"
export EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS="${EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS:-58}"

export PERF_SHORTCUT_USE_SIMULATOR="${PERF_SHORTCUT_USE_SIMULATOR:-1}"
export EXPO_METRO_PORT="${EXPO_METRO_PORT:-8082}"
export PERF_NAV_SWITCH_TRIGGER_MODE="${PERF_NAV_SWITCH_TRIGGER_MODE:-runtime}"
export PERF_NAV_SWITCH_BOOTSTRAP_APP="${PERF_NAV_SWITCH_BOOTSTRAP_APP:-0}"
if [[ "$PERF_SHORTCUT_USE_SIMULATOR" == "1" ]]; then
  export IOS_PREFER_DEVICE=0
  export IOS_DEVICE_UDID=""
  export IOS_DEVICE_NAME=""
  export EXPO_PACKAGER_HOSTNAME="${EXPO_PACKAGER_HOSTNAME:-localhost}"
  target_mode="simulator(default)"
else
  export IOS_PREFER_DEVICE="${IOS_PREFER_DEVICE:-1}"
  export IOS_DEVICE_UDID="${IOS_DEVICE_UDID:-${IOS_SIMULATOR_UDID:-}}"
  export IOS_DEVICE_NAME="${IOS_DEVICE_NAME:-${IOS_SIMULATOR_NAME:-}}"
  target_mode="device-eligible"
fi
export IOS_RUN="${IOS_RUN:-0}"
export EXPO_FORCE_START="${EXPO_FORCE_START:-1}"
export IOS_REFRESH_WRITE_ENV_LOCAL="${IOS_REFRESH_WRITE_ENV_LOCAL:-0}"

METRO_LOG_PATH_DEFAULT="/tmp/expo-metro-${EXPO_PUBLIC_PERF_HARNESS_RUN_ID}.log"
PERF_LOOP_LOG_DEFAULT="/tmp/perf-nav-switch-loop-${EXPO_PUBLIC_PERF_HARNESS_RUN_ID}.log"
export EXPO_METRO_LOG_PATH="${EXPO_METRO_LOG_PATH:-$METRO_LOG_PATH_DEFAULT}"
export PERF_NAV_SWITCH_LOOP_LOG_FILE="${PERF_NAV_SWITCH_LOOP_LOG_FILE:-$PERF_LOOP_LOG_DEFAULT}"
export PERF_NAV_SWITCH_LOOP_TIMEOUT_SECS="${PERF_NAV_SWITCH_LOOP_TIMEOUT_SECS:-0}"

echo "[perf-nav-switch-loop] Starting iOS dev client with harness config:"
echo "  runId=${EXPO_PUBLIC_PERF_HARNESS_RUN_ID}"
echo "  scenario=${EXPO_PUBLIC_PERF_HARNESS_SCENARIO} runs=${EXPO_PUBLIC_PERF_HARNESS_RUNS} startDelayMs=${EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS} cooldownMs=${EXPO_PUBLIC_PERF_HARNESS_COOLDOWN_MS}"
echo "  navSequence=${EXPO_PUBLIC_PERF_NAV_SWITCH_SEQUENCE}"
echo "  navStepCooldownMs=${EXPO_PUBLIC_PERF_NAV_SWITCH_STEP_COOLDOWN_MS} navSettleQuietPeriodMs=${EXPO_PUBLIC_PERF_NAV_SWITCH_SETTLE_QUIET_PERIOD_MS} navStepTimeoutMs=${EXPO_PUBLIC_PERF_NAV_SWITCH_STEP_TIMEOUT_MS}"
echo "  jsFrameSampler enabled=${EXPO_PUBLIC_PERF_JS_FRAME_SAMPLER} windowMs=${EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS} stallFrameMs=${EXPO_PUBLIC_PERF_JS_FRAME_STALL_FRAME_MS} fpsThreshold=${EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS}"
echo "  uiFrameSampler enabled=${EXPO_PUBLIC_PERF_UI_FRAME_SAMPLER} windowMs=${EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS} stallFrameMs=${EXPO_PUBLIC_PERF_UI_FRAME_STALL_FRAME_MS} fpsThreshold=${EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS}"
echo "  triggerMode=${PERF_NAV_SWITCH_TRIGGER_MODE} bootstrapApp=${PERF_NAV_SWITCH_BOOTSTRAP_APP}"
echo "  metroLog=${EXPO_METRO_LOG_PATH}"
echo "  runLog=${PERF_NAV_SWITCH_LOOP_LOG_FILE}"
echo "  target=${target_mode} preferDevice=${IOS_PREFER_DEVICE} iosDeviceUdid=${IOS_DEVICE_UDID:-<empty>} iosDeviceName=${IOS_DEVICE_NAME:-<empty>}"

mkdir -p "$(dirname "$EXPO_METRO_LOG_PATH")" "$(dirname "$PERF_NAV_SWITCH_LOOP_LOG_FILE")"
: > "$PERF_NAV_SWITCH_LOOP_LOG_FILE"

default_timeout_secs=$((120 + (EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS / 1000) + (EXPO_PUBLIC_PERF_HARNESS_RUNS * 20)))
if [[ "$PERF_NAV_SWITCH_LOOP_TIMEOUT_SECS" == "0" ]]; then
  PERF_NAV_SWITCH_LOOP_TIMEOUT_SECS="$default_timeout_secs"
fi

tail_pid=""
harness_port="${EXPO_METRO_PORT}"
should_cleanup_metro=0
cleanup() {
  if [[ -n "$tail_pid" ]]; then
    kill "$tail_pid" >/dev/null 2>&1 || true
  fi
  if [[ "$should_cleanup_metro" == "1" ]]; then
    local metro_pid
    metro_pid="$(lsof -iTCP:"$harness_port" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [[ -n "$metro_pid" ]]; then
      echo "[perf-nav-switch-loop] Killing Metro (PID ${metro_pid}) on port ${harness_port}." | tee -a "${PERF_NAV_SWITCH_LOOP_LOG_FILE:-/dev/null}"
      kill "$metro_pid" 2>/dev/null || true
    fi
  fi
}
trap cleanup EXIT INT TERM

cd "$REPO_ROOT"

resolve_simulator_udid() {
  if [[ -n "${IOS_SIMULATOR_UDID:-}" ]]; then
    printf '%s\n' "$IOS_SIMULATOR_UDID"
    return 0
  fi
  xcrun simctl list devices booted -j 2>/dev/null | ruby -rjson -e 'data = JSON.parse(STDIN.read); device = data.fetch("devices").values.flatten.find { |entry| entry["state"] == "Booted" }; puts(device ? device["udid"] : "")'
}

bootstrap_app() {
  IOS_RUN="$IOS_RUN" EXPO_FORCE_START="$EXPO_FORCE_START" \
    bash ./scripts/ios-refresh.sh 2>&1 | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
  should_cleanup_metro=1
}

start_runtime_log_stream() {
  local simulator_udid="$1"
  echo "[perf-nav-switch-loop] Following simulator log stream for harness markers..." | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
  xcrun simctl spawn "$simulator_udid" log stream --style compact \
    --predicate 'eventMessage CONTAINS[c] "[SearchPerf]" OR eventMessage CONTAINS[c] "[NAV-SWITCH"' \
    2>&1 | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE" &
  tail_pid=$!
}

resolve_recent_metro_log_path() {
  find /tmp -maxdepth 1 -type f -name 'expo-metro-*.log' -mmin -15 -print 2>/dev/null \
    | xargs ls -t 2>/dev/null \
    | head -n 1
}

start_metro_log_stream() {
  local deadline="$1"
  local explicit_path="${2:-}"
  local metro_log_path="$explicit_path"
  if [[ -z "$metro_log_path" ]]; then
    metro_log_path="$EXPO_METRO_LOG_PATH"
  fi
  while [[ ! -f "$metro_log_path" ]]; do
    if [[ $SECONDS -ge $deadline ]]; then
      echo "[perf-nav-switch-loop] Timed out waiting for Metro log: ${metro_log_path}" | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
      exit 1
    fi
    sleep 1
  done

  echo "[perf-nav-switch-loop] Following Metro output from ${metro_log_path} until harness completes..." | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
  tail -n 0 -F "$metro_log_path" | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE" &
  tail_pid=$!
}

send_runtime_trigger() {
  local simulator_udid="$1"
  local request_id="$2"
  local trigger_url
  trigger_url="$(PERF_HARNESS_REQUEST_ID="$request_id" python3 - <<'PY'
import os
from urllib.parse import urlencode

params = {
    "requestId": os.environ["PERF_HARNESS_REQUEST_ID"],
    "scenario": os.environ["EXPO_PUBLIC_PERF_HARNESS_SCENARIO"],
    "runId": os.environ["EXPO_PUBLIC_PERF_HARNESS_RUN_ID"],
    "runs": os.environ["EXPO_PUBLIC_PERF_HARNESS_RUNS"],
    "startDelayMs": os.environ["EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS"],
    "cooldownMs": os.environ["EXPO_PUBLIC_PERF_HARNESS_COOLDOWN_MS"],
    "navSequence": os.environ["EXPO_PUBLIC_PERF_NAV_SWITCH_SEQUENCE"],
    "navStepCooldownMs": os.environ["EXPO_PUBLIC_PERF_NAV_SWITCH_STEP_COOLDOWN_MS"],
    "navSettleQuietPeriodMs": os.environ["EXPO_PUBLIC_PERF_NAV_SWITCH_SETTLE_QUIET_PERIOD_MS"],
    "navStepTimeoutMs": os.environ["EXPO_PUBLIC_PERF_NAV_SWITCH_STEP_TIMEOUT_MS"],
    "jsSampler": os.environ["EXPO_PUBLIC_PERF_JS_FRAME_SAMPLER"],
    "jsWindowMs": os.environ["EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS"],
    "jsStallFrameMs": os.environ["EXPO_PUBLIC_PERF_JS_FRAME_STALL_FRAME_MS"],
    "jsFpsThreshold": os.environ["EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS"],
    "uiSampler": os.environ["EXPO_PUBLIC_PERF_UI_FRAME_SAMPLER"],
    "uiWindowMs": os.environ["EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS"],
    "uiStallFrameMs": os.environ["EXPO_PUBLIC_PERF_UI_FRAME_STALL_FRAME_MS"],
    "uiFpsThreshold": os.environ["EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS"],
    "signature": "|".join([
        f"scenario:{os.environ['EXPO_PUBLIC_PERF_HARNESS_SCENARIO']}",
        f"runId:{os.environ['EXPO_PUBLIC_PERF_HARNESS_RUN_ID']}",
        f"runs:{os.environ['EXPO_PUBLIC_PERF_HARNESS_RUNS']}",
        f"sequence:{os.environ['EXPO_PUBLIC_PERF_NAV_SWITCH_SEQUENCE']}",
    ]),
}
print("crave://perf-harness?" + urlencode(params))
PY
)"
  echo "[perf-nav-switch-loop] Triggering runtime harness URL:" | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
  echo "  ${trigger_url}" | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
  xcrun simctl openurl "$simulator_udid" "$trigger_url"
}

deadline=$((SECONDS + PERF_NAV_SWITCH_LOOP_TIMEOUT_SECS))
metro_pid="$(lsof -iTCP:"$harness_port" -sTCP:LISTEN -t 2>/dev/null || true)"
simulator_udid="$(resolve_simulator_udid)"

if [[ "$PERF_NAV_SWITCH_TRIGGER_MODE" == "runtime" ]]; then
  if [[ -z "$simulator_udid" ]]; then
    echo "[perf-nav-switch-loop] No booted simulator found for runtime trigger mode." | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
    exit 1
  fi
  if [[ -z "$metro_pid" || "$PERF_NAV_SWITCH_BOOTSTRAP_APP" == "1" ]]; then
    bootstrap_app
    start_metro_log_stream "$deadline"
  else
    if [[ -f "$EXPO_METRO_LOG_PATH" ]]; then
      start_metro_log_stream "$deadline" "$EXPO_METRO_LOG_PATH"
    elif existing_metro_log_path="$(resolve_recent_metro_log_path)" && [[ -n "$existing_metro_log_path" ]]; then
      echo "[perf-nav-switch-loop] Attaching to recent Metro log: ${existing_metro_log_path}" | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
      start_metro_log_stream "$deadline" "$existing_metro_log_path"
    else
      echo "[perf-nav-switch-loop] No run-specific Metro log found for attach mode; following simulator logs instead." | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
      start_runtime_log_stream "$simulator_udid"
    fi
  fi
  send_runtime_trigger "$simulator_udid" "${EXPO_PUBLIC_PERF_HARNESS_RUN_ID}-$(date +%s)"
else
  bootstrap_app
  start_metro_log_stream "$deadline"
fi

expected_runs="$EXPO_PUBLIC_PERF_HARNESS_RUNS"
harness_run_id="$EXPO_PUBLIC_PERF_HARNESS_RUN_ID"

have_run_marker() {
  local marker="$1"
  local run_number="$2"
  grep -a -q "\"event\":\"${marker}\".*\"harnessRunId\":\"${harness_run_id}\".*\"runNumber\":${run_number}" "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
}

have_loop_complete_marker() {
  grep -a -q "\"event\":\"nav_switch_loop_complete\".*\"harnessRunId\":\"${harness_run_id}\".*\"completedRuns\":${expected_runs}" "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
}

validate_completion() {
  local run_num
  for run_num in $(seq 1 "$expected_runs"); do
    if ! have_run_marker "nav_switch_run_start" "$run_num"; then
      return 1
    fi
    if ! have_run_marker "nav_switch_run_complete" "$run_num"; then
      return 1
    fi
  done
  have_loop_complete_marker
}

while [[ $SECONDS -lt $deadline ]]; do
  if validate_completion; then
    echo "[perf-nav-switch-loop] Harness complete for runId=${harness_run_id} (${expected_runs}/${expected_runs} runs)." | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
    exit 0
  fi
  sleep 1
done

echo "[perf-nav-switch-loop] Timed out waiting for complete harness markers for runId=${harness_run_id}." | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
echo "[perf-nav-switch-loop] Check log: ${PERF_NAV_SWITCH_LOOP_LOG_FILE}" | tee -a "$PERF_NAV_SWITCH_LOOP_LOG_FILE"
exit 1
