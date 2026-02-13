#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEFAULT_BASELINE_REPORT="$REPO_ROOT/plans/perf-baselines/perf-shortcut-live-baseline.json"

ensure_node_22() {
  local node_version=""
  local node_major=""
  node_version="$(node -p "process.versions.node" 2>/dev/null || true)"
  node_major="${node_version%%.*}"
  if [[ "$node_major" == "22" ]]; then
    return
  fi

  if [[ "${CRAVE_PERF_NODE_BOOTSTRAP_ATTEMPTED:-0}" == "1" ]]; then
    echo "[perf-local-ci] Node bootstrap attempted but Node 22 is still unavailable (current: ${node_version:-unknown})." >&2
    echo "[perf-local-ci] Install/use Node 22 (via nvm or volta) and retry." >&2
    exit 1
  fi

  local relaunch_script="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$nvm_dir/nvm.sh" ]]; then
    echo "[perf-local-ci] Detected Node ${node_version:-unknown}; switching to Node 22 via nvm..." >&2
    export NVM_DIR="$nvm_dir"
    # Yarn can export prefix variables that make nvm.sh fail fast.
    unset PREFIX
    unset NPM_CONFIG_PREFIX
    unset npm_config_prefix
    # shellcheck source=/dev/null
    if . "$NVM_DIR/nvm.sh"; then
      if nvm use 22 >/dev/null 2>&1 || nvm install 22 >/dev/null 2>&1; then
        export CRAVE_PERF_NODE_BOOTSTRAP_ATTEMPTED=1
        exec "$relaunch_script" "$@"
      fi
    fi
  fi

  if command -v volta >/dev/null 2>&1; then
    echo "[perf-local-ci] Detected Node ${node_version:-unknown}; switching to Node 22 via volta..." >&2
    export CRAVE_PERF_NODE_BOOTSTRAP_ATTEMPTED=1
    exec volta run node@22 "$relaunch_script" "$@"
  fi

  echo "[perf-local-ci] Node 22 is required for this workflow (current: ${node_version:-unknown})." >&2
  echo "[perf-local-ci] Install/use Node 22 (via nvm or volta) and retry." >&2
  exit 1
}

ensure_node_22 "$@"

usage() {
  cat <<'USAGE'
Usage:
  scripts/perf-shortcut-local-ci.sh record-baseline [baseline_report_json] [baseline_log_path]
  scripts/perf-shortcut-local-ci.sh gate [baseline_report_json] [candidate_log_path]

Commands:
  record-baseline
    Runs a live shortcut loop harness pass, parses the log into a baseline JSON report,
    and writes it to the provided path (or default baseline path).

  gate
    Runs a live shortcut loop harness candidate pass (unless candidate_log_path is provided),
    parses candidate report JSON, and compares it against the baseline report.
    Exit code is non-zero when comparator gates fail.

Notes:
  - The comparator contract is enforced by scripts/ci-compare-perf-reports.sh.
  - Minimum required run count is controlled by PERF_MIN_RUNS (default: 3).
  - Baseline default path:
      plans/perf-baselines/perf-shortcut-live-baseline.json
USAGE
}

ensure_parent_dir() {
  local path="$1"
  mkdir -p "$(dirname "$path")"
}

utc_timestamp() {
  date -u +%Y%m%dT%H%M%SZ
}

read_min_runs() {
  if [[ -n "${PERF_MIN_RUNS:-}" ]]; then
    printf '%s\n' "$PERF_MIN_RUNS"
    return
  fi
  printf '3\n'
}

print_report_summary() {
  local report_path="$1"
  local label="$2"
  node - "$report_path" "$label" <<'NODE'
const fs = require('fs');

const reportPath = process.argv[2];
const label = process.argv[3];
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const payload = {
  label,
  schemaVersion: report.schemaVersion ?? null,
  harnessRunId: report.harnessRunId ?? null,
  harnessSignatureStable: report.harnessSignatureStable ?? null,
  environment: report.environment ?? null,
  markerIntegrityComplete: Boolean(report?.markerIntegrity?.complete),
  runCountExpected: report.runCountExpected ?? null,
  runCountStarted: report.runCountStarted ?? null,
  runCountCompleted: report.runCountCompleted ?? null,
  floorMean: report.floorMean ?? null,
  stallP95: report.stallP95 ?? null,
  stallMaxMean: report.stallMaxMean ?? null,
  uiFloorMean: report.uiFloorMean ?? null,
  uiStallP95: report.uiStallP95 ?? null,
  uiStallMaxMean: report.uiStallMaxMean ?? null,
  catastrophicRunCount: report?.catastrophic?.runCount ?? null,
  uiCatastrophicRunCount: report?.uiCatastrophic?.runCount ?? null,
};

process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
NODE
}

validate_report_min_runs() {
  local report_path="$1"
  local report_label="$2"
  local min_runs
  min_runs="$(read_min_runs)"
  node - "$report_path" "$report_label" "$min_runs" <<'NODE'
const fs = require('fs');

const reportPath = process.argv[2];
const label = process.argv[3];
const minRunsRaw = process.argv[4];
const minRuns = Number.parseInt(minRunsRaw, 10);
if (!Number.isFinite(minRuns) || minRuns < 1) {
  throw new Error(`Invalid PERF_MIN_RUNS value: ${minRunsRaw}`);
}
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const expected = Number.isFinite(report?.runCountExpected) ? report.runCountExpected : null;
const completed = Number.isFinite(report?.runCountCompleted) ? report.runCountCompleted : null;
if (expected == null || expected < minRuns) {
  throw new Error(`${label} report runCountExpected=${String(expected)} < required ${minRuns}`);
}
if (completed == null || completed < minRuns) {
  throw new Error(`${label} report runCountCompleted=${String(completed)} < required ${minRuns}`);
}
if (completed < expected) {
  throw new Error(`${label} report runCountCompleted=${completed} < runCountExpected=${expected}`);
}
NODE
}

validate_report_contract() {
  local report_path="$1"
  local report_label="$2"
  local expected_schema="${PERF_REPORT_SCHEMA_VERSION:-perf-shortcut-report.v1}"
  node - "$report_path" "$report_label" "$expected_schema" <<'NODE'
const fs = require('fs');

const reportPath = process.argv[2];
const label = process.argv[3];
const expectedSchema = process.argv[4];
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

if (report?.schemaVersion !== expectedSchema) {
  throw new Error(
    `${label} schemaVersion mismatch: expected ${expectedSchema}, got ${String(report?.schemaVersion)}`
  );
}
if (!report?.markerIntegrity?.complete) {
  throw new Error(`${label} markerIntegrity.complete must be true`);
}
if (typeof report?.harnessSignatureStable !== 'string' || !report.harnessSignatureStable) {
  throw new Error(`${label} harnessSignatureStable is required`);
}
const env = report?.environment ?? null;
if (typeof env?.platform !== 'string' || !env.platform) {
  throw new Error(`${label} environment.platform is required`);
}
if (typeof env?.launchTargetMode !== 'string' || !env.launchTargetMode) {
  throw new Error(`${label} environment.launchTargetMode is required`);
}
if (typeof env?.runtimeTarget !== 'string' || !env.runtimeTarget) {
  throw new Error(`${label} environment.runtimeTarget is required`);
}
if (typeof env?.launchPreferDevice !== 'number' || !Number.isFinite(env.launchPreferDevice)) {
  throw new Error(`${label} environment.launchPreferDevice is required`);
}
for (const key of [
  'floorMean',
  'stallP95',
  'stallMaxMean',
  'uiFloorMean',
  'uiStallP95',
  'uiStallMaxMean',
]) {
  if (typeof report?.[key] !== 'number' || !Number.isFinite(report[key])) {
    throw new Error(`${label} missing numeric field: ${key}`);
  }
}
NODE
}

run_live_shortcut_loop() {
  local run_label="$1"
  local log_path="$2"
  local run_id="${PERF_LOCAL_RUN_ID_PREFIX:-shortcut-loop-local}-${run_label}-$(utc_timestamp)"

  ensure_parent_dir "$log_path"
  # Lock sampler config so parser metrics are consistently present for gate comparisons.
  local harness_runs="${EXPO_PUBLIC_PERF_HARNESS_RUNS:-3}"
  local harness_start_delay_ms="${EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS:-3000}"
  local js_window_ms="${EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS:-120}"
  local ui_window_ms="${EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS:-120}"
  local js_fps_threshold="${EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS:-240}"
  local ui_fps_threshold="${EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS:-240}"
  EXPO_PUBLIC_PERF_HARNESS_RUN_ID="$run_id" \
    EXPO_PUBLIC_PERF_HARNESS_RUNS="$harness_runs" \
    EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS="$harness_start_delay_ms" \
    EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS="$js_window_ms" \
    EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS="$ui_window_ms" \
    EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS="$js_fps_threshold" \
    EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS="$ui_fps_threshold" \
    PERF_SHORTCUT_LOOP_LOG_FILE="$log_path" \
    bash "$SCRIPT_DIR/perf-shortcut-loop.sh"
}

command="${1:-}"
if [[ -z "$command" ]]; then
  usage >&2
  exit 1
fi
shift

case "$command" in
  record-baseline)
    baseline_report_path="${1:-$DEFAULT_BASELINE_REPORT}"
    baseline_log_path="${2:-$REPO_ROOT/plans/perf-logs/perf-shortcut-live-baseline-$(utc_timestamp).log}"
    ensure_parent_dir "$baseline_report_path"
    ensure_parent_dir "$baseline_log_path"

    echo "[perf-local-ci] Recording live baseline..."
    run_live_shortcut_loop "baseline" "$baseline_log_path"
    "$SCRIPT_DIR/perf-shortcut-loop-report.sh" "$baseline_log_path" "$baseline_report_path" \
      > /tmp/perf-shortcut-live-baseline.pretty.json

    validate_report_contract "$baseline_report_path" "baseline"
    validate_report_min_runs "$baseline_report_path" "baseline"

    echo "[perf-local-ci] Baseline log: $baseline_log_path"
    echo "[perf-local-ci] Baseline report: $baseline_report_path"
    print_report_summary "$baseline_report_path" "baseline"
    ;;

  gate)
    baseline_report_path="${1:-$DEFAULT_BASELINE_REPORT}"
    candidate_log_path="${2:-}"
    timestamp="$(utc_timestamp)"
    candidate_report_path="/tmp/perf-shortcut-candidate-${timestamp}.json"
    compare_summary_path="/tmp/perf-shortcut-compare-${timestamp}.json"

    if [[ ! -f "$baseline_report_path" ]]; then
      echo "Baseline report not found: $baseline_report_path" >&2
      echo "Run: scripts/perf-shortcut-local-ci.sh record-baseline" >&2
      exit 1
    fi

    if [[ -n "$candidate_log_path" ]]; then
      if [[ ! -f "$candidate_log_path" ]]; then
        echo "Candidate log not found: $candidate_log_path" >&2
        exit 1
      fi
      echo "[perf-local-ci] Using provided candidate log: $candidate_log_path"
    else
      candidate_log_path="/tmp/perf-shortcut-candidate-${timestamp}.log"
      echo "[perf-local-ci] Running live candidate harness..."
      run_live_shortcut_loop "candidate" "$candidate_log_path"
    fi

    "$SCRIPT_DIR/perf-shortcut-loop-report.sh" "$candidate_log_path" "$candidate_report_path" \
      > /tmp/perf-shortcut-candidate.pretty.json

    validate_report_contract "$baseline_report_path" "baseline"
    validate_report_contract "$candidate_report_path" "candidate"
    validate_report_min_runs "$baseline_report_path" "baseline"
    validate_report_min_runs "$candidate_report_path" "candidate"

    print_report_summary "$baseline_report_path" "baseline"
    print_report_summary "$candidate_report_path" "candidate"

    set +e
    PERF_MIN_RUNS="$(read_min_runs)" "$SCRIPT_DIR/ci-compare-perf-reports.sh" \
      "$baseline_report_path" \
      "$candidate_report_path" > "$compare_summary_path"
    compare_exit=$?
    set -e

    cat "$compare_summary_path"
    echo "[perf-local-ci] Compare summary: $compare_summary_path"
    echo "[perf-local-ci] Candidate log: $candidate_log_path"
    echo "[perf-local-ci] Candidate report: $candidate_report_path"

    if [[ "$compare_exit" -ne 0 ]]; then
      echo "[perf-local-ci] Gate FAILED." >&2
      exit "$compare_exit"
    fi

    echo "[perf-local-ci] Gate PASSED."
    ;;

  *)
    usage >&2
    exit 1
    ;;
esac
