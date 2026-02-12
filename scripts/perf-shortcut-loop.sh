#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
random_suffix="$(printf '%04x' $((RANDOM % 65536)))"
default_run_id="shortcut-loop-${timestamp_utc}-${random_suffix}"

export EXPO_PUBLIC_PERF_HARNESS_ENABLED="${EXPO_PUBLIC_PERF_HARNESS_ENABLED:-1}"
export EXPO_PUBLIC_PERF_HARNESS_ALLOW_NON_DEV="${EXPO_PUBLIC_PERF_HARNESS_ALLOW_NON_DEV:-0}"
export EXPO_PUBLIC_PERF_HARNESS_SCENARIO="${EXPO_PUBLIC_PERF_HARNESS_SCENARIO:-search_shortcut_loop}"
export EXPO_PUBLIC_PERF_HARNESS_RUNS="${EXPO_PUBLIC_PERF_HARNESS_RUNS:-3}"
export EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS="${EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS:-3000}"
export EXPO_PUBLIC_PERF_HARNESS_COOLDOWN_MS="${EXPO_PUBLIC_PERF_HARNESS_COOLDOWN_MS:-1800}"
export EXPO_PUBLIC_PERF_HARNESS_RUN_ID="${EXPO_PUBLIC_PERF_HARNESS_RUN_ID:-$default_run_id}"

export EXPO_PUBLIC_PERF_SHORTCUT_LABEL="${EXPO_PUBLIC_PERF_SHORTCUT_LABEL:-Best restaurants}"
export EXPO_PUBLIC_PERF_SHORTCUT_TAB="${EXPO_PUBLIC_PERF_SHORTCUT_TAB:-restaurants}"
export EXPO_PUBLIC_PERF_SHORTCUT_SCORE_MODE="${EXPO_PUBLIC_PERF_SHORTCUT_SCORE_MODE:-coverage_display}"
export EXPO_PUBLIC_PERF_SHORTCUT_PRESERVE_SHEET_STATE="${EXPO_PUBLIC_PERF_SHORTCUT_PRESERVE_SHEET_STATE:-0}"
export EXPO_PUBLIC_PERF_SHORTCUT_TRANSITION_FROM_DOCKED_POLLS="${EXPO_PUBLIC_PERF_SHORTCUT_TRANSITION_FROM_DOCKED_POLLS:-1}"

export EXPO_PUBLIC_PERF_JS_FRAME_SAMPLER="${EXPO_PUBLIC_PERF_JS_FRAME_SAMPLER:-1}"
export EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS="${EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS:-500}"
export EXPO_PUBLIC_PERF_JS_FRAME_STALL_FRAME_MS="${EXPO_PUBLIC_PERF_JS_FRAME_STALL_FRAME_MS:-80}"
export EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS="${EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS:-58}"
export EXPO_PUBLIC_PERF_UI_FRAME_SAMPLER="${EXPO_PUBLIC_PERF_UI_FRAME_SAMPLER:-1}"
export EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS="${EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS:-500}"
export EXPO_PUBLIC_PERF_UI_FRAME_STALL_FRAME_MS="${EXPO_PUBLIC_PERF_UI_FRAME_STALL_FRAME_MS:-80}"
export EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS="${EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS:-58}"

export PERF_SHORTCUT_USE_SIMULATOR="${PERF_SHORTCUT_USE_SIMULATOR:-1}"
if [[ "$PERF_SHORTCUT_USE_SIMULATOR" == "1" ]]; then
  export IOS_PREFER_DEVICE=0
  export IOS_DEVICE_UDID=""
  export IOS_DEVICE_NAME=""
  target_mode="simulator(default)"
else
  export IOS_PREFER_DEVICE="${IOS_PREFER_DEVICE:-1}"
  export IOS_DEVICE_UDID="${IOS_DEVICE_UDID:-${IOS_SIMULATOR_UDID:-}}"
  export IOS_DEVICE_NAME="${IOS_DEVICE_NAME:-${IOS_SIMULATOR_NAME:-}}"
  target_mode="device-eligible"
fi
export IOS_RUN="${IOS_RUN:-0}"
export EXPO_FORCE_START="${EXPO_FORCE_START:-1}"
export FOLLOW_METRO_LOGS=0

METRO_LOG_PATH_DEFAULT="/tmp/expo-metro-${EXPO_PUBLIC_PERF_HARNESS_RUN_ID}.log"
PERF_LOOP_LOG_DEFAULT="/tmp/perf-shortcut-loop-${EXPO_PUBLIC_PERF_HARNESS_RUN_ID}.log"
export EXPO_METRO_LOG_PATH="${EXPO_METRO_LOG_PATH:-$METRO_LOG_PATH_DEFAULT}"
export PERF_SHORTCUT_LOOP_LOG_FILE="${PERF_SHORTCUT_LOOP_LOG_FILE:-$PERF_LOOP_LOG_DEFAULT}"
export PERF_SHORTCUT_LOOP_TIMEOUT_SECS="${PERF_SHORTCUT_LOOP_TIMEOUT_SECS:-0}"

echo "[perf-shortcut-loop] Starting iOS dev client with harness config:"
echo "  runId=${EXPO_PUBLIC_PERF_HARNESS_RUN_ID}"
echo "  scenario=${EXPO_PUBLIC_PERF_HARNESS_SCENARIO} runs=${EXPO_PUBLIC_PERF_HARNESS_RUNS} startDelayMs=${EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS} cooldownMs=${EXPO_PUBLIC_PERF_HARNESS_COOLDOWN_MS}"
echo "  harnessAllowNonDev=${EXPO_PUBLIC_PERF_HARNESS_ALLOW_NON_DEV}"
echo "  shortcut tab=${EXPO_PUBLIC_PERF_SHORTCUT_TAB} label=\"${EXPO_PUBLIC_PERF_SHORTCUT_LABEL}\" scoreMode=${EXPO_PUBLIC_PERF_SHORTCUT_SCORE_MODE}"
echo "  jsFrameSampler enabled=${EXPO_PUBLIC_PERF_JS_FRAME_SAMPLER} windowMs=${EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS} stallFrameMs=${EXPO_PUBLIC_PERF_JS_FRAME_STALL_FRAME_MS} fpsThreshold=${EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS}"
echo "  uiFrameSampler enabled=${EXPO_PUBLIC_PERF_UI_FRAME_SAMPLER} windowMs=${EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS} stallFrameMs=${EXPO_PUBLIC_PERF_UI_FRAME_STALL_FRAME_MS} fpsThreshold=${EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS}"
echo "  metroLog=${EXPO_METRO_LOG_PATH}"
echo "  runLog=${PERF_SHORTCUT_LOOP_LOG_FILE}"
echo "  target=${target_mode} preferDevice=${IOS_PREFER_DEVICE} iosDeviceUdid=${IOS_DEVICE_UDID:-<empty>} iosDeviceName=${IOS_DEVICE_NAME:-<empty>}"
echo "  launcher=scripts/ios-refresh.sh (follow logs handled by this script)"

if ! [[ "$EXPO_PUBLIC_PERF_HARNESS_RUNS" =~ ^[0-9]+$ ]] || [[ "$EXPO_PUBLIC_PERF_HARNESS_RUNS" -lt 1 ]]; then
  echo "Invalid EXPO_PUBLIC_PERF_HARNESS_RUNS value: ${EXPO_PUBLIC_PERF_HARNESS_RUNS}" >&2
  exit 1
fi

if ! [[ "$EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS" =~ ^[0-9]+$ ]]; then
  echo "Invalid EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS value: ${EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS}" >&2
  exit 1
fi

mkdir -p "$(dirname "$EXPO_METRO_LOG_PATH")" "$(dirname "$PERF_SHORTCUT_LOOP_LOG_FILE")"
: > "$PERF_SHORTCUT_LOOP_LOG_FILE"

default_timeout_secs=$((120 + (EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS / 1000) + (EXPO_PUBLIC_PERF_HARNESS_RUNS * 20)))
if [[ "$PERF_SHORTCUT_LOOP_TIMEOUT_SECS" == "0" ]]; then
  PERF_SHORTCUT_LOOP_TIMEOUT_SECS="$default_timeout_secs"
fi
if ! [[ "$PERF_SHORTCUT_LOOP_TIMEOUT_SECS" =~ ^[0-9]+$ ]] || [[ "$PERF_SHORTCUT_LOOP_TIMEOUT_SECS" -lt 1 ]]; then
  echo "Invalid PERF_SHORTCUT_LOOP_TIMEOUT_SECS value: ${PERF_SHORTCUT_LOOP_TIMEOUT_SECS}" >&2
  exit 1
fi

tail_pid=""
cleanup() {
  if [[ -n "$tail_pid" ]]; then
    kill "$tail_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

cd "$REPO_ROOT"

IOS_RUN="$IOS_RUN" EXPO_FORCE_START="$EXPO_FORCE_START" \
  bash ./scripts/ios-refresh.sh 2>&1 | tee -a "$PERF_SHORTCUT_LOOP_LOG_FILE"

deadline=$((SECONDS + PERF_SHORTCUT_LOOP_TIMEOUT_SECS))
while [[ ! -f "$EXPO_METRO_LOG_PATH" ]]; do
  if [[ $SECONDS -ge $deadline ]]; then
    echo "[perf-shortcut-loop] Timed out waiting for Metro log: ${EXPO_METRO_LOG_PATH}" | tee -a "$PERF_SHORTCUT_LOOP_LOG_FILE"
    exit 1
  fi
  sleep 1
done

echo "[perf-shortcut-loop] Following Metro output until harness completes..." | tee -a "$PERF_SHORTCUT_LOOP_LOG_FILE"
tail -n 0 -F "$EXPO_METRO_LOG_PATH" | tee -a "$PERF_SHORTCUT_LOOP_LOG_FILE" &
tail_pid=$!

expected_runs="$EXPO_PUBLIC_PERF_HARNESS_RUNS"
harness_run_id="$EXPO_PUBLIC_PERF_HARNESS_RUN_ID"

have_run_marker() {
  local marker="$1"
  local run_number="$2"
  grep -a -q "\"event\":\"${marker}\".*\"harnessRunId\":\"${harness_run_id}\".*\"runNumber\":${run_number}" "$PERF_SHORTCUT_LOOP_LOG_FILE"
}

have_loop_complete_marker() {
  grep -a -q "\"event\":\"shortcut_loop_complete\".*\"harnessRunId\":\"${harness_run_id}\".*\"completedRuns\":${expected_runs}" "$PERF_SHORTCUT_LOOP_LOG_FILE"
}

validate_completion() {
  local run_num
  for run_num in $(seq 1 "$expected_runs"); do
    if ! have_run_marker "shortcut_loop_run_start" "$run_num"; then
      return 1
    fi
    if ! have_run_marker "shortcut_loop_run_complete" "$run_num"; then
      return 1
    fi
  done
  have_loop_complete_marker
}

while [[ $SECONDS -lt $deadline ]]; do
  if validate_completion; then
    echo "[perf-shortcut-loop] Harness complete for runId=${harness_run_id} (${expected_runs}/${expected_runs} runs)." | tee -a "$PERF_SHORTCUT_LOOP_LOG_FILE"
    exit 0
  fi
  sleep 1
done

echo "[perf-shortcut-loop] Timed out waiting for complete harness markers for runId=${harness_run_id}." | tee -a "$PERF_SHORTCUT_LOOP_LOG_FILE"
echo "[perf-shortcut-loop] Expected run markers: 1..${expected_runs} + shortcut_loop_complete(completedRuns=${expected_runs})." | tee -a "$PERF_SHORTCUT_LOOP_LOG_FILE"
echo "[perf-shortcut-loop] Check log: ${PERF_SHORTCUT_LOOP_LOG_FILE}" | tee -a "$PERF_SHORTCUT_LOOP_LOG_FILE"
exit 1
