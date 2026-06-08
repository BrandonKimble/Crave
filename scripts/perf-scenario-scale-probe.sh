#!/usr/bin/env bash
set -euo pipefail

# FEATURE-COUNT DEGRADATION HARNESS RUNNER (#21)
#
# Wraps perf-scenario-ios.sh for the scale-probe flow with the settings the probe
# needs, then renders the fps-vs-feature-count report:
#   - frame samplers log ALL windows (threshold 240), so the healthy baseline is
#     visible — without this only sub-58fps windows are emitted and the curve is blind
#   - longer duration/timeout to fit all 7 count steps + workouts
#
# Usage: scripts/perf-scenario-scale-probe.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Optional flow arg: pass the collision probe to measure the allowOverlap:false
# capacity, e.g. scripts/perf-scenario-scale-probe.sh maestro/perf/flows/search-map-scale-probe-collision.yaml
FLOW="${1:-$REPO_ROOT/maestro/perf/flows/search-map-scale-probe.yaml}"
if [[ ! -f "$FLOW" ]]; then
  echo "[scale-probe] flow not found: $FLOW" >&2
  exit 2
fi
FLOW="$(cd "$(dirname "$FLOW")" && pwd)/$(basename "$FLOW")"
SCENARIO_NAME="search_map_scale_probe"

timestamp_utc="$(date -u +%Y%m%dT%H%M%SZ)"
run_id="scenario-${SCENARIO_NAME}-${timestamp_utc}-probe"
log_file="/tmp/perf-scenario-${run_id}.log"
report_file="/tmp/perf-scenario-${run_id}.json"
scale_report_file="/tmp/perf-scenario-scale-probe-${run_id}.json"

export PERF_SCENARIO_RUN_ID="$run_id"
export PERF_SCENARIO_LOG_FILE="$log_file"
export PERF_SCENARIO_REPORT_FILE="$report_file"
# Log every frame window regardless of fps so the baseline + full curve is captured.
export EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS=240
export EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS=240
# Room for all 7 count steps × workout.
export PERF_SCENARIO_DURATION_MS="${PERF_SCENARIO_DURATION_MS:-240000}"
export PERF_SCENARIO_TIMEOUT_SECS="${PERF_SCENARIO_TIMEOUT_SECS:-360}"

echo "[scale-probe] run_id=${run_id}"
echo "[scale-probe] log=${log_file}"
echo "[scale-probe] scale-report=${scale_report_file}"

status=0
bash "$SCRIPT_DIR/perf-scenario-ios.sh" "$FLOW" "$SCENARIO_NAME" || status=$?

echo "[scale-probe] rendering feature-count degradation report..."
node "$SCRIPT_DIR/perf-scenario-scale-probe-report.js" "$log_file" "$scale_report_file" || true

exit "$status"
