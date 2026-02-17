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
  scripts/perf-shortcut-local-ci.sh promote-slice <slice_id> [baseline_report_json]

Commands:
  record-baseline
    Runs a live shortcut loop harness pass, parses the log into a baseline JSON report,
    and writes it to the provided path (or default baseline path).

  gate
    Runs a live shortcut loop harness candidate pass (unless candidate_log_path is provided),
    parses candidate report JSON, and compares it against the baseline report.
    Exit code is non-zero when comparator gates fail.

  promote-slice
    Runs matched live candidate gates and evaluates promotion using robust median deltas.
    Intended for slice promotion decisions where single-run shortcut-loop noise is high.
    For S3, this also enforces natural-path contract checks via:
      scripts/search-runtime-natural-cutover-contract.sh
    For S5, this also enforces hydration cutover contract checks via:
      scripts/search-runtime-s5-hydration-cutover-contract.sh
    For S6, this also enforces map cutover contract checks via:
      scripts/search-runtime-s6-map-cutover-contract.sh

Notes:
  - The comparator contract is enforced by scripts/ci-compare-perf-reports.sh.
  - Minimum required run count is controlled by PERF_MIN_RUNS (default: 3).
  - Baseline regression-denominator floors are enforced by:
      PERF_BASELINE_MIN_STALL_P95 (default: 1)
      PERF_BASELINE_MIN_UI_STALL_P95 (default: 1)
    Set either to 0 only when intentionally allowing zero-stall baselines.
  - Baseline default path:
      plans/perf-baselines/perf-shortcut-live-baseline.json
  - Robust promotion defaults:
      PERF_PROMOTION_MATCHED_RUNS=2
      PERF_PROMOTION_FLOOR_MAX_REGRESSION=0.30
      PERF_PROMOTION_UI_FLOOR_MAX_REGRESSION=0.30
      PERF_PROMOTION_STALL_P95_MAX_REGRESSION_PCT=10 (S3/S4 default: 20)
      PERF_PROMOTION_UI_STALL_P95_MAX_REGRESSION_PCT=10 (S3/S4 default: 20)
  - Promotion heavy-component gate defaults:
      PERF_PROMOTION_HEAVY_COMPONENTS=SearchScreen,SearchMapTree,SearchResultsSheetTree,SearchOverlayChrome,BottomNav
  - Root ownership gate defaults (S7+ and S9/S10/S11 decomposition+completion slices):
      PERF_PROMOTION_ROOT_OWNERSHIP_RULES_PATH=plans/perf-baselines/runtime-root-ownership-gates.json
  - Map runtime budget thresholds:
      PERF_S6_INDEX_QUERY_P95_MAX_MS / PERF_S6_READ_MODEL_BUILD_P95_MAX_MS / PERF_S6_MAP_DIFF_APPLY_P95_MAX_MS
      PERF_S9A_INDEX_QUERY_P95_MAX_MS / PERF_S9A_READ_MODEL_BUILD_P95_MAX_MS / PERF_S9A_MAP_DIFF_APPLY_P95_MAX_MS
  - Mechanism telemetry thresholds (decomposition slices):
      PERF_S9C_MIN_QUERY_MUTATION_COALESCED
      PERF_S9D_MIN_PROFILE_INTENT_CANCELLED
      PERF_S9E_MIN_SETTLE_EVAL_COUNT / PERF_S9E_MAX_OBSERVER_RENDER_BUMP_COUNT
  - JS tranche thresholds (JS1-JS4):
      PERF_JS_TRANCHE_MIN_STALL_P95_IMPROVEMENT_PCT (default: 5)
      PERF_JS_TRANCHE_MAX_UI_STALL_P95_REGRESSION_PCT (default: 0)
  - Legacy LOC deletion gate (deprecated, disabled by default):
      PERF_PROMOTION_LOC_BASELINE_PATH=plans/perf-baselines/runtime-owner-loc-baseline.json
      PERF_PROMOTION_LOC_ENFORCE_SLICES=
      PERF_PROMOTION_LOC_MIN_AGGREGATE_DELTA=-1
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
  mechanismSignals: report.mechanismSignals ?? null,
  mapIndexQueryDurationP95: report?.mapRuntime?.indexQueryDurationP95 ?? null,
  mapReadModelBuildSliceP95: report?.mapRuntime?.readModelBuildSliceP95 ?? null,
  mapDiffApplySliceP95: report?.mapRuntime?.mapDiffApplySliceP95 ?? null,
  mapFullCatalogScanCount: report?.mapRuntime?.fullCatalogScanCount ?? null,
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

validate_baseline_regression_denominators() {
  local report_path="$1"
  node - "$report_path" <<'NODE'
const fs = require('fs');

const reportPath = process.argv[2];
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const minJsStallP95 = Number.parseFloat(process.env.PERF_BASELINE_MIN_STALL_P95 || '1');
const minUiStallP95 = Number.parseFloat(process.env.PERF_BASELINE_MIN_UI_STALL_P95 || '1');
if (!Number.isFinite(minJsStallP95) || minJsStallP95 < 0) {
  throw new Error(`Invalid PERF_BASELINE_MIN_STALL_P95 value: ${String(minJsStallP95)}`);
}
if (!Number.isFinite(minUiStallP95) || minUiStallP95 < 0) {
  throw new Error(`Invalid PERF_BASELINE_MIN_UI_STALL_P95 value: ${String(minUiStallP95)}`);
}

const baselineStallP95 = report?.stallP95;
const baselineUiStallP95 = report?.uiStallP95;
if (typeof baselineStallP95 !== 'number' || !Number.isFinite(baselineStallP95)) {
  throw new Error('Baseline stallP95 must be a finite number.');
}
if (typeof baselineUiStallP95 !== 'number' || !Number.isFinite(baselineUiStallP95)) {
  throw new Error('Baseline uiStallP95 must be a finite number.');
}
if (baselineStallP95 < minJsStallP95) {
  throw new Error(
    `Baseline stallP95=${baselineStallP95} is below floor ${minJsStallP95}. Refresh baseline or set PERF_BASELINE_MIN_STALL_P95=0 to bypass.`
  );
}
if (baselineUiStallP95 < minUiStallP95) {
  throw new Error(
    `Baseline uiStallP95=${baselineUiStallP95} is below floor ${minUiStallP95}. Refresh baseline or set PERF_BASELINE_MIN_UI_STALL_P95=0 to bypass.`
  );
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
  local profiler_attribution_enabled="${EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_ATTRIBUTION:-1}"
  local profiler_span_log_enabled="${EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_SPAN_LOG:-1}"
  EXPO_PUBLIC_PERF_HARNESS_RUN_ID="$run_id" \
    EXPO_PUBLIC_PERF_HARNESS_RUNS="$harness_runs" \
    EXPO_PUBLIC_PERF_HARNESS_START_DELAY_MS="$harness_start_delay_ms" \
    EXPO_PUBLIC_PERF_JS_FRAME_WINDOW_MS="$js_window_ms" \
    EXPO_PUBLIC_PERF_UI_FRAME_WINDOW_MS="$ui_window_ms" \
    EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS="$js_fps_threshold" \
    EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS="$ui_fps_threshold" \
    EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_ATTRIBUTION="$profiler_attribution_enabled" \
    EXPO_PUBLIC_PERF_SHORTCUT_PROBE_PROFILER_SPAN_LOG="$profiler_span_log_enabled" \
    PERF_SHORTCUT_LOOP_LOG_FILE="$log_path" \
    bash "$SCRIPT_DIR/perf-shortcut-loop.sh"
}

run_gate_once() {
  local baseline_report_path="$1"
  local provided_candidate_log_path="${2:-}"
  local timestamp
  timestamp="$(utc_timestamp)"
  local candidate_log_path="$provided_candidate_log_path"
  local candidate_report_path="/tmp/perf-shortcut-candidate-${timestamp}.json"
  local compare_summary_path="/tmp/perf-shortcut-compare-${timestamp}.json"

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
  validate_baseline_regression_denominators "$baseline_report_path"

  print_report_summary "$baseline_report_path" "baseline"
  print_report_summary "$candidate_report_path" "candidate"

  set +e
  PERF_MIN_RUNS="$(read_min_runs)" "$SCRIPT_DIR/ci-compare-perf-reports.sh" \
    "$baseline_report_path" \
    "$candidate_report_path" > "$compare_summary_path"
  local compare_exit=$?
  set -e

  cat "$compare_summary_path"
  echo "[perf-local-ci] Compare summary: $compare_summary_path"
  echo "[perf-local-ci] Candidate log: $candidate_log_path"
  echo "[perf-local-ci] Candidate report: $candidate_report_path"

  RUN_GATE_COMPARE_SUMMARY_PATH="$compare_summary_path"
  RUN_GATE_CANDIDATE_LOG_PATH="$candidate_log_path"
  RUN_GATE_CANDIDATE_REPORT_PATH="$candidate_report_path"
  RUN_GATE_EXIT_CODE="$compare_exit"
}

summarize_slice_promotion() {
  local slice_id="$1"
  local baseline_report_path="$2"
  local promotion_summary_path="$3"
  local compare_paths_joined="$4"
  local candidate_report_paths_joined="$5"
  local overlap_gate_summary_path="${6:-}"
  local commit_span_gate_summary_path="${7:-}"
  local loc_baseline_path="${PERF_PROMOTION_LOC_BASELINE_PATH:-$REPO_ROOT/plans/perf-baselines/runtime-owner-loc-baseline.json}"
  local loc_enforce_slices="${PERF_PROMOTION_LOC_ENFORCE_SLICES:-}"
  local loc_min_aggregate_delta="${PERF_PROMOTION_LOC_MIN_AGGREGATE_DELTA:--1}"

  PROMOTION_REPO_ROOT="$REPO_ROOT" \
    PROMOTION_LOC_BASELINE_PATH="$loc_baseline_path" \
    PROMOTION_LOC_ENFORCE_SLICES="$loc_enforce_slices" \
    PROMOTION_LOC_MIN_AGGREGATE_DELTA="$loc_min_aggregate_delta" \
    PROMOTION_OVERLAP_GATE_SUMMARY_PATH="$overlap_gate_summary_path" \
    PROMOTION_COMMIT_SPAN_GATE_SUMMARY_PATH="$commit_span_gate_summary_path" \
  PROMOTION_COMPARE_PATHS="$compare_paths_joined" \
    PROMOTION_CANDIDATE_REPORT_PATHS="$candidate_report_paths_joined" \
    node - "$slice_id" "$baseline_report_path" "$promotion_summary_path" <<'NODE'
const fs = require('fs');
const path = require('path');

const sliceId = process.argv[2];
const baselinePath = process.argv[3];
const summaryPath = process.argv[4];
const comparePaths = (process.env.PROMOTION_COMPARE_PATHS || '')
  .split('\n')
  .map((entry) => entry.trim())
  .filter(Boolean);
const candidateReportPaths = (process.env.PROMOTION_CANDIDATE_REPORT_PATHS || '')
  .split('\n')
  .map((entry) => entry.trim())
  .filter(Boolean);
const repoRoot = process.env.PROMOTION_REPO_ROOT || process.cwd();
const locBaselinePathRaw = process.env.PROMOTION_LOC_BASELINE_PATH || '';
const locGateSliceSet = new Set(
  (process.env.PROMOTION_LOC_ENFORCE_SLICES || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
);
const defaultLocMinAggregateDeltaRaw = process.env.PROMOTION_LOC_MIN_AGGREGATE_DELTA || '-1';
const defaultLocMinAggregateDelta = Number.parseInt(defaultLocMinAggregateDeltaRaw, 10);
const overlapGateSummaryPath = process.env.PROMOTION_OVERLAP_GATE_SUMMARY_PATH || '';
const commitSpanGateSummaryPath = process.env.PROMOTION_COMMIT_SPAN_GATE_SUMMARY_PATH || '';

const fail = (message) => {
  throw new Error(message);
};

if (!sliceId) {
  fail('slice_id is required.');
}
if (comparePaths.length === 0) {
  fail('No compare summaries provided for promotion evaluation.');
}
if (comparePaths.length !== candidateReportPaths.length) {
  fail(
    `Mismatch between compare summaries (${comparePaths.length}) and candidate reports (${candidateReportPaths.length}).`
  );
}
if (!Number.isFinite(defaultLocMinAggregateDelta)) {
  fail(
    `Invalid PROMOTION_LOC_MIN_AGGREGATE_DELTA value: ${String(defaultLocMinAggregateDeltaRaw)}.`
  );
}
if (!overlapGateSummaryPath) {
  fail('PROMOTION_OVERLAP_GATE_SUMMARY_PATH is required.');
}
if (!commitSpanGateSummaryPath) {
  fail('PROMOTION_COMMIT_SPAN_GATE_SUMMARY_PATH is required.');
}
if (!fs.existsSync(overlapGateSummaryPath)) {
  fail(`Overlap gate summary not found: ${overlapGateSummaryPath}`);
}
if (!fs.existsSync(commitSpanGateSummaryPath)) {
  fail(`Commit-span gate summary not found: ${commitSpanGateSummaryPath}`);
}

const safeNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const safeInteger = (value) => (Number.isInteger(value) ? value : null);
const safeNonNegativeNumber = (value) => {
  const parsed = safeNumber(value);
  if (parsed == null || parsed < 0) {
    return 0;
  }
  return parsed;
};
const safeNonNegativeInteger = (value) => {
  const parsed = safeInteger(value);
  if (parsed == null || parsed < 0) {
    return 0;
  }
  return parsed;
};
const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const median = (values) => {
  const nums = values.filter((value) => Number.isFinite(value));
  if (nums.length === 0) {
    return null;
  }
  nums.sort((a, b) => a - b);
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) {
    return nums[mid];
  }
  return (nums[mid - 1] + nums[mid]) / 2;
};
const readCatRunCount = (report, key) => {
  const runCount = safeNumber(report?.[key]?.runCount);
  if (runCount != null) {
    return runCount;
  }
  if (Array.isArray(report?.[key]?.runNumbers)) {
    return report[key].runNumbers.length;
  }
  return 0;
};
const readStageWindowCount = (report, stage, histogramKey = 'stageHistogram') => {
  return (
    safeNumber(report?.[histogramKey]?.byStageWindowCount?.[stage]) ??
    safeNumber(report?.[histogramKey]?.byStageWindows?.[stage]) ??
    0
  );
};
const readStageCatWindowCount = (report, stage, histogramKey = 'stageHistogram') => {
  return safeNumber(report?.[histogramKey]?.byStageCatastrophicWindowCount?.[stage]) ?? 0;
};
const resolveRepoPath = (relativeOrAbsolutePath) => {
  if (!relativeOrAbsolutePath || typeof relativeOrAbsolutePath !== 'string') {
    return null;
  }
  return path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.join(repoRoot, relativeOrAbsolutePath);
};
const parseGateSummary = (summaryPath, expectedSchema, gateLabel) => {
  const summary = readJson(summaryPath);
  if (summary?.schemaVersion !== expectedSchema) {
    fail(
      `${gateLabel} gate schema mismatch: expected ${expectedSchema}, got ${String(
        summary?.schemaVersion
      )}.`
    );
  }
  const failures = Array.isArray(summary?.failures) ? summary.failures : [];
  return {
    summaryPath,
    schemaVersion: summary?.schemaVersion ?? null,
    pass: summary?.pass === true,
    failures,
    medians: summary?.medians ?? null,
  };
};
const countFileLines = (absolutePath) => {
  const contents = fs.readFileSync(absolutePath, 'utf8');
  const match = contents.match(/\n/g);
  return match ? match.length : 0;
};
const collectFilesRecursively = (dirPath, extensions) => {
  const output = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      output.push(...collectFilesRecursively(entryPath, extensions));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (extensions.length === 0 || extensions.includes(path.extname(entry.name))) {
      output.push(entryPath);
    }
  }
  return output;
};
const countTargetLoc = (target) => {
  const targetPath = resolveRepoPath(target?.path);
  if (!targetPath) {
    fail('LOC deletion gate target.path is required.');
  }
  const targetKind = target?.kind === 'directory' ? 'directory' : 'file';
  if (!fs.existsSync(targetPath)) {
    fail(`LOC deletion gate target path does not exist: ${target.path}`);
  }
  if (targetKind === 'directory') {
    const extensions = Array.isArray(target?.extensions)
      ? target.extensions.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
      : ['.ts', '.tsx'];
    const files = collectFilesRecursively(targetPath, extensions);
    return files.reduce((sum, filePath) => sum + countFileLines(filePath), 0);
  }
  return countFileLines(targetPath);
};

const baseline = readJson(baselinePath);
const overlapGate = parseGateSummary(
  overlapGateSummaryPath,
  'perf-shortcut-overlap-gate.v1',
  'overlap'
);
const commitSpanGate = parseGateSummary(
  commitSpanGateSummaryPath,
  'perf-shortcut-commit-span-gate.v1',
  'commit-span'
);
const baselineCatRuns = readCatRunCount(baseline, 'catastrophic');
const baselineUiCatRuns = readCatRunCount(baseline, 'uiCatastrophic');

const floorThreshold = Number.parseFloat(
  process.env.PERF_PROMOTION_FLOOR_MAX_REGRESSION || process.env.PERF_FLOOR_MAX_REGRESSION || '0.30'
);
const uiFloorThreshold = Number.parseFloat(
  process.env.PERF_PROMOTION_UI_FLOOR_MAX_REGRESSION ||
    process.env.PERF_UI_FLOOR_MAX_REGRESSION ||
    '0.30'
);
const defaultStallThreshold = sliceId === 'S3' || sliceId === 'S4' ? '20' : '10';
const stallThreshold = Number.parseFloat(
  process.env.PERF_PROMOTION_STALL_P95_MAX_REGRESSION_PCT ||
    process.env.PERF_STALL_P95_MAX_REGRESSION_PCT ||
    defaultStallThreshold
);
const uiStallThreshold = Number.parseFloat(
  process.env.PERF_PROMOTION_UI_STALL_P95_MAX_REGRESSION_PCT ||
    process.env.PERF_UI_STALL_P95_MAX_REGRESSION_PCT ||
    defaultStallThreshold
);

if (!Number.isFinite(floorThreshold) || floorThreshold < 0) {
  fail(`Invalid promotion floor threshold: ${String(floorThreshold)}.`);
}
if (!Number.isFinite(uiFloorThreshold) || uiFloorThreshold < 0) {
  fail(`Invalid promotion ui floor threshold: ${String(uiFloorThreshold)}.`);
}
if (!Number.isFinite(stallThreshold) || stallThreshold < 0) {
  fail(`Invalid promotion stall threshold: ${String(stallThreshold)}.`);
}
if (!Number.isFinite(uiStallThreshold) || uiStallThreshold < 0) {
  fail(`Invalid promotion ui stall threshold: ${String(uiStallThreshold)}.`);
}

const regressionFailurePatterns = [
  /^floorMean regression /,
  /^stallP95 regression /,
  /^uiFloorMean regression /,
  /^uiStallP95 regression /,
];
const catastrophicFailurePattern = /^Catastrophic (JS|UI) frame gate failed:/;

const runDetails = comparePaths.map((comparePath, index) => {
  const compare = readJson(comparePath);
  const candidateReportPath = candidateReportPaths[index];
  const candidateReport = readJson(candidateReportPath);
  const failures = Array.isArray(compare?.failures) ? compare.failures : [];
  const hardFailures = failures.filter((failure) => {
    if (catastrophicFailurePattern.test(failure)) {
      return false;
    }
    if (regressionFailurePatterns.some((pattern) => pattern.test(failure))) {
      return false;
    }
    return true;
  });

  const stageCat = Object.entries(
    candidateReport?.stageHistogram?.byStageCatastrophicWindowCount ?? {}
  )
    .filter(([, count]) => safeNumber(count) != null && Number(count) > 0)
    .map(([stage]) => stage);
  const uiStageCat = Object.entries(
    candidateReport?.uiStageHistogram?.byStageCatastrophicWindowCount ?? {}
  )
    .filter(([, count]) => safeNumber(count) != null && Number(count) > 0)
    .map(([stage]) => stage);

  return {
    comparePath,
    candidateReportPath,
    failures,
    hardFailures,
    deltas: {
      floorMean: safeNumber(compare?.metrics?.deltas?.floorMean),
      stallP95Pct: safeNumber(compare?.metrics?.deltas?.stallP95Pct),
      uiFloorMean: safeNumber(compare?.metrics?.deltas?.uiFloorMean),
      uiStallP95Pct: safeNumber(compare?.metrics?.deltas?.uiStallP95Pct),
    },
    catastrophic: {
      jsRunCount: safeNumber(compare?.metrics?.candidate?.catastrophicRunCount) ?? 0,
      uiRunCount: safeNumber(compare?.metrics?.candidate?.uiCatastrophicRunCount) ?? 0,
      runThreshold: safeNumber(compare?.runCounts?.catastrophicRunThreshold) ?? null,
    },
    stageWindowCountByStage: candidateReport?.stageHistogram?.byStageWindowCount ?? {},
    stageCatWindowCountByStage: candidateReport?.stageHistogram?.byStageCatastrophicWindowCount ?? {},
    uiStageWindowCountByStage: candidateReport?.uiStageHistogram?.byStageWindowCount ?? {},
    uiStageCatWindowCountByStage:
      candidateReport?.uiStageHistogram?.byStageCatastrophicWindowCount ?? {},
    stageCatastrophicFamilies: stageCat,
    uiStageCatastrophicFamilies: uiStageCat,
    mapRuntime: {
      fullCatalogScanCount: safeNonNegativeInteger(candidateReport?.mapRuntime?.fullCatalogScanCount),
      indexQueryDurationP95: safeNonNegativeNumber(candidateReport?.mapRuntime?.indexQueryDurationP95),
      readModelBuildSliceP95: safeNonNegativeNumber(
        candidateReport?.mapRuntime?.readModelBuildSliceP95
      ),
      mapDiffApplySliceP95: safeNonNegativeNumber(candidateReport?.mapRuntime?.mapDiffApplySliceP95),
      indexQuerySampleCount: safeNonNegativeInteger(candidateReport?.mapRuntime?.indexQuerySampleCount),
      readModelBuildSampleCount: safeNonNegativeInteger(
        candidateReport?.mapRuntime?.readModelBuildSampleCount
      ),
      mapDiffApplySampleCount: safeNonNegativeInteger(
        candidateReport?.mapRuntime?.mapDiffApplySampleCount
      ),
    },
    mechanismSignals: {
      queryMutationCoalescedCount: safeNonNegativeInteger(
        candidateReport?.mechanismSignals?.queryMutationCoalescedCount
      ),
      profileIntentCancelledCount: safeNonNegativeInteger(
        candidateReport?.mechanismSignals?.profileIntentCancelledCount
      ),
      harnessSettleEvalCount: safeNonNegativeInteger(
        candidateReport?.mechanismSignals?.harnessSettleEvalCount
      ),
      observerRenderBumpCount: safeNonNegativeInteger(
        candidateReport?.mechanismSignals?.observerRenderBumpCount
      ),
    },
  };
});

const aggregateHardFailures = runDetails.flatMap((detail, index) =>
  detail.hardFailures.map((failure) => `run ${index + 1}: ${failure}`)
);

const floorMedians = {
  floorMean: median(runDetails.map((detail) => detail.deltas.floorMean)),
  stallP95Pct: median(runDetails.map((detail) => detail.deltas.stallP95Pct)),
  uiFloorMean: median(runDetails.map((detail) => detail.deltas.uiFloorMean)),
  uiStallP95Pct: median(runDetails.map((detail) => detail.deltas.uiStallP95Pct)),
};
const jsOptimizationSlices = new Set(['JS1', 'JS2', 'JS3', 'JS4']);

const nonCatFailures = [];
if (!overlapGate.pass) {
  nonCatFailures.push(
    `Overlap gate failed: ${overlapGate.failures.length > 0 ? overlapGate.failures.join(' | ') : 'unknown failure.'}`
  );
}
if (!commitSpanGate.pass) {
  nonCatFailures.push(
    `Commit-span gate failed: ${commitSpanGate.failures.length > 0 ? commitSpanGate.failures.join(' | ') : 'unknown failure.'}`
  );
}
const comparisonEpsilon = Number.parseFloat(
  process.env.PERF_PROMOTION_COMPARISON_EPSILON || '1e-9'
);
if (!Number.isFinite(comparisonEpsilon) || comparisonEpsilon < 0) {
  fail(
    `Invalid PERF_PROMOTION_COMPARISON_EPSILON value: ${String(
      process.env.PERF_PROMOTION_COMPARISON_EPSILON || ''
    )}.`
  );
}
if (floorMedians.floorMean == null) {
  nonCatFailures.push('Missing floorMean delta for robust promotion evaluation.');
} else if (floorMedians.floorMean < -floorThreshold - comparisonEpsilon) {
  nonCatFailures.push(
    `Median floorMean regression ${floorMedians.floorMean.toFixed(2)} exceeds allowed -${floorThreshold.toFixed(2)}.`
  );
}
if (floorMedians.stallP95Pct == null) {
  nonCatFailures.push('Missing stallP95 delta for robust promotion evaluation.');
} else if (floorMedians.stallP95Pct > stallThreshold + comparisonEpsilon) {
  nonCatFailures.push(
    `Median stallP95 regression ${floorMedians.stallP95Pct.toFixed(2)}% exceeds allowed ${stallThreshold.toFixed(2)}%.`
  );
}
if (floorMedians.uiFloorMean == null) {
  nonCatFailures.push('Missing uiFloorMean delta for robust promotion evaluation.');
} else if (floorMedians.uiFloorMean < -uiFloorThreshold - comparisonEpsilon) {
  nonCatFailures.push(
    `Median uiFloorMean regression ${floorMedians.uiFloorMean.toFixed(2)} exceeds allowed -${uiFloorThreshold.toFixed(2)}.`
  );
}
if (floorMedians.uiStallP95Pct == null) {
  nonCatFailures.push('Missing uiStallP95 delta for robust promotion evaluation.');
} else if (floorMedians.uiStallP95Pct > uiStallThreshold + comparisonEpsilon) {
  nonCatFailures.push(
    `Median uiStallP95 regression ${floorMedians.uiStallP95Pct.toFixed(2)}% exceeds allowed ${uiStallThreshold.toFixed(2)}%.`
  );
}
if (jsOptimizationSlices.has(sliceId)) {
  const minJsStallImprovementPct = Number.parseFloat(
    process.env.PERF_JS_TRANCHE_MIN_STALL_P95_IMPROVEMENT_PCT || '5'
  );
  const maxUiStallRegressionPct = Number.parseFloat(
    process.env.PERF_JS_TRANCHE_MAX_UI_STALL_P95_REGRESSION_PCT || '0'
  );
  if (!Number.isFinite(minJsStallImprovementPct) || minJsStallImprovementPct < 0) {
    nonCatFailures.push('Invalid PERF_JS_TRANCHE_MIN_STALL_P95_IMPROVEMENT_PCT threshold.');
  }
  if (!Number.isFinite(maxUiStallRegressionPct) || maxUiStallRegressionPct < 0) {
    nonCatFailures.push('Invalid PERF_JS_TRANCHE_MAX_UI_STALL_P95_REGRESSION_PCT threshold.');
  }
  if (floorMedians.stallP95Pct == null) {
    nonCatFailures.push('JS tranche requires stallP95 median delta evidence.');
  } else if (
    Number.isFinite(minJsStallImprovementPct) &&
    floorMedians.stallP95Pct > -minJsStallImprovementPct + comparisonEpsilon
  ) {
    nonCatFailures.push(
      `JS tranche requires median stallP95 improvement <= -${minJsStallImprovementPct.toFixed(
        2
      )}%; observed ${floorMedians.stallP95Pct.toFixed(2)}%.`
    );
  }
  if (floorMedians.uiStallP95Pct == null) {
    nonCatFailures.push('JS tranche requires uiStallP95 median delta evidence.');
  } else if (
    Number.isFinite(maxUiStallRegressionPct) &&
    floorMedians.uiStallP95Pct > maxUiStallRegressionPct + comparisonEpsilon
  ) {
    nonCatFailures.push(
      `JS tranche requires uiStallP95 regression <= ${maxUiStallRegressionPct.toFixed(
        2
      )}%; observed ${floorMedians.uiStallP95Pct.toFixed(2)}%.`
    );
  }
}

let mapRuntimeMedians = null;
let mapRuntimeThresholds = null;
const mapRuntimeGateSlices = new Set(['S6', 'S9A']);
if (mapRuntimeGateSlices.has(sliceId)) {
  const isS9A = sliceId === 'S9A';
  const thresholdPrefix = isS9A ? 'PERF_S9A_' : 'PERF_S6_';
  mapRuntimeMedians = {
    indexQueryDurationP95: median(runDetails.map((detail) => detail.mapRuntime.indexQueryDurationP95)),
    readModelBuildSliceP95: median(runDetails.map((detail) => detail.mapRuntime.readModelBuildSliceP95)),
    mapDiffApplySliceP95: median(runDetails.map((detail) => detail.mapRuntime.mapDiffApplySliceP95)),
    fullCatalogScanCount: median(runDetails.map((detail) => detail.mapRuntime.fullCatalogScanCount)),
    indexQuerySampleCount: median(runDetails.map((detail) => detail.mapRuntime.indexQuerySampleCount)),
    readModelBuildSampleCount: median(
      runDetails.map((detail) => detail.mapRuntime.readModelBuildSampleCount)
    ),
    mapDiffApplySampleCount: median(
      runDetails.map((detail) => detail.mapRuntime.mapDiffApplySampleCount)
    ),
  };

  mapRuntimeThresholds = {
    indexQueryDurationP95: Number.parseFloat(
      process.env[`${thresholdPrefix}INDEX_QUERY_P95_MAX_MS`] ||
        process.env.PERF_S6_INDEX_QUERY_P95_MAX_MS ||
        '2'
    ),
    readModelBuildSliceP95: Number.parseFloat(
      process.env[`${thresholdPrefix}READ_MODEL_BUILD_P95_MAX_MS`] ||
        process.env.PERF_S6_READ_MODEL_BUILD_P95_MAX_MS ||
        '4'
    ),
    mapDiffApplySliceP95: Number.parseFloat(
      process.env[`${thresholdPrefix}MAP_DIFF_APPLY_P95_MAX_MS`] ||
        process.env.PERF_S6_MAP_DIFF_APPLY_P95_MAX_MS ||
        '3'
    ),
  };

  if (!Number.isFinite(mapRuntimeThresholds.indexQueryDurationP95)) {
    nonCatFailures.push(`Invalid ${thresholdPrefix}INDEX_QUERY_P95_MAX_MS threshold.`);
  }
  if (!Number.isFinite(mapRuntimeThresholds.readModelBuildSliceP95)) {
    nonCatFailures.push(`Invalid ${thresholdPrefix}READ_MODEL_BUILD_P95_MAX_MS threshold.`);
  }
  if (!Number.isFinite(mapRuntimeThresholds.mapDiffApplySliceP95)) {
    nonCatFailures.push(`Invalid ${thresholdPrefix}MAP_DIFF_APPLY_P95_MAX_MS threshold.`);
  }

  if (mapRuntimeMedians.fullCatalogScanCount == null) {
    nonCatFailures.push(`${sliceId} requires mapRuntime.fullCatalogScanCount evidence.`);
  } else if (mapRuntimeMedians.fullCatalogScanCount !== 0) {
    nonCatFailures.push(
      `${sliceId} requires fullCatalogScanCount == 0; observed median ${mapRuntimeMedians.fullCatalogScanCount}.`
    );
  }
  if (mapRuntimeMedians.indexQuerySampleCount == null || mapRuntimeMedians.indexQuerySampleCount <= 0) {
    nonCatFailures.push(`${sliceId} requires mapRuntime index query samples for budget evidence.`);
  }
  if (
    mapRuntimeMedians.readModelBuildSampleCount == null ||
    mapRuntimeMedians.readModelBuildSampleCount <= 0
  ) {
    nonCatFailures.push(`${sliceId} requires mapRuntime read-model build samples for budget evidence.`);
  }
  if (
    mapRuntimeMedians.mapDiffApplySampleCount == null ||
    mapRuntimeMedians.mapDiffApplySampleCount <= 0
  ) {
    nonCatFailures.push(`${sliceId} requires mapRuntime diff-apply samples for budget evidence.`);
  }
  if (
    mapRuntimeMedians.indexQueryDurationP95 != null &&
    Number.isFinite(mapRuntimeThresholds.indexQueryDurationP95) &&
    mapRuntimeMedians.indexQueryDurationP95 > mapRuntimeThresholds.indexQueryDurationP95
  ) {
    nonCatFailures.push(
      `${sliceId} indexQueryDurationP95 ${mapRuntimeMedians.indexQueryDurationP95.toFixed(2)}ms exceeds ${mapRuntimeThresholds.indexQueryDurationP95.toFixed(2)}ms.`
    );
  }
  if (
    mapRuntimeMedians.readModelBuildSliceP95 != null &&
    Number.isFinite(mapRuntimeThresholds.readModelBuildSliceP95) &&
    mapRuntimeMedians.readModelBuildSliceP95 > mapRuntimeThresholds.readModelBuildSliceP95
  ) {
    nonCatFailures.push(
      `${sliceId} readModelBuildSliceP95 ${mapRuntimeMedians.readModelBuildSliceP95.toFixed(2)}ms exceeds ${mapRuntimeThresholds.readModelBuildSliceP95.toFixed(2)}ms.`
    );
  }
  if (
    mapRuntimeMedians.mapDiffApplySliceP95 != null &&
    Number.isFinite(mapRuntimeThresholds.mapDiffApplySliceP95) &&
    mapRuntimeMedians.mapDiffApplySliceP95 > mapRuntimeThresholds.mapDiffApplySliceP95
  ) {
    nonCatFailures.push(
      `${sliceId} mapDiffApplySliceP95 ${mapRuntimeMedians.mapDiffApplySliceP95.toFixed(2)}ms exceeds ${mapRuntimeThresholds.mapDiffApplySliceP95.toFixed(2)}ms.`
    );
  }
}

const disallowNewCatastrophicFamilySlices = new Set(['S3', 'S4', 'JS1', 'JS2', 'JS3', 'JS4']);
if (disallowNewCatastrophicFamilySlices.has(sliceId)) {
  const knownHotspots = new Set([
    'none',
    'results_hydration_commit',
    'results_list_materialization',
    'results_list_ramp',
    'marker_reveal_state',
    'visual_sync_state',
  ]);
  runDetails.forEach((detail, index) => {
    const unknownJsFamilies = detail.stageCatastrophicFamilies.filter((stage) => !knownHotspots.has(stage));
    if (unknownJsFamilies.length > 0) {
      nonCatFailures.push(
        `run ${index + 1}: new JS catastrophic stage family outside known hotspots: ${unknownJsFamilies.join(', ')}.`
      );
    }
    const unknownUiFamilies = detail.uiStageCatastrophicFamilies.filter(
      (stage) => !knownHotspots.has(stage)
    );
    if (unknownUiFamilies.length > 0) {
      nonCatFailures.push(
        `run ${index + 1}: new UI catastrophic stage family outside known hotspots: ${unknownUiFamilies.join(', ')}.`
      );
    }
  });
}

const perfBearingOwnershipSlices = new Set([
  'S5',
  'S6',
  'S7',
  'S8',
  'S9A',
  'S9B',
  'S9D',
  'S9E',
  'JS1',
  'JS2',
  'JS3',
  'JS4',
]);
const noWaiverSlices = new Set(['S10', 'S11', 'JS1', 'JS2', 'JS3', 'JS4']);
const targetedHotspotRules = {
  JS1: {
    stages: ['results_hydration_commit'],
    description:
      'JS1 targeted hotspot (`results_hydration_commit`) catastrophic pressure must improve vs baseline.',
    requiredDirectionalSignal: 'catastrophic',
  },
  JS2: {
    stages: ['results_hydration_commit', 'visual_sync_state'],
    description:
      'JS2 targeted hotspot (`results_hydration_commit` / `visual_sync_state`) must improve vs baseline.',
  },
  JS3: {
    stages: ['results_hydration_commit', 'visual_sync_state', 'results_list_ramp'],
    description:
      'JS3 targeted hotspot (`results_hydration_commit` / `visual_sync_state` / `results_list_ramp`) must improve vs baseline.',
  },
  JS4: {
    stages: ['results_hydration_commit', 'visual_sync_state'],
    description:
      'JS4 policy lock requires directional hotspot improvement evidence for hydration/visual-sync hotspots.',
    requiredDirectionalSignal: 'catastrophic',
  },
  S5: {
    stages: ['results_list_materialization', 'results_list_ramp'],
    description:
      'S5 targeted hotspot (`results_list_materialization` / `results_list_ramp`) must improve vs baseline.',
  },
  S6: {
    stages: ['marker_reveal_state'],
    description: 'S6 targeted hotspot (`marker_reveal_state`) must improve vs baseline.',
  },
  S7: {
    stages: ['results_list_ramp', 'visual_sync_state'],
    description:
      'S7 targeted hotspot (`results_list_ramp` / `visual_sync_state`) must improve vs baseline.',
  },
  S8: {
    stages: ['results_list_ramp'],
    description:
      'S8 targeted hotspot (`results_list_ramp`) stage pressure must improve vs baseline.',
    requiredDirectionalSignal: 'pressure',
  },
  S9A: {
    stages: ['marker_reveal_state', 'results_list_ramp'],
    description:
      'S9A targeted hotspot (`marker_reveal_state` / `results_list_ramp`) must improve vs baseline.',
  },
  S9B: {
    stages: ['results_list_ramp'],
    description:
      'S9B targeted hotspot (`results_list_ramp`) stage pressure must improve vs baseline.',
    requiredDirectionalSignal: 'pressure',
    requiredUiPressure: true,
  },
  S9D: {
    stages: ['visual_sync_state', 'results_list_ramp'],
    description:
      'S9D targeted hotspot (`visual_sync_state` / `results_list_ramp`) must improve vs baseline.',
  },
  S9E: {
    stages: ['results_list_ramp', 'visual_sync_state'],
    description:
      'S9E targeted hotspot (`results_list_ramp` / `visual_sync_state`) must improve vs baseline.',
  },
};
const sumStageCounts = (stageMap, stages) =>
  stages.reduce((sum, stage) => sum + (safeNumber(stageMap?.[stage]) ?? 0), 0);

const mechanismTelemetryRules = {
  S9C: {
    metric: 'queryMutationCoalescedCount',
    min: Number.parseInt(process.env.PERF_S9C_MIN_QUERY_MUTATION_COALESCED || '1', 10),
    description:
      'S9C requires observable mutation coalescing in runtime telemetry (`query_mutation_coalesced`).',
  },
  S9D: {
    metric: 'profileIntentCancelledCount',
    min: Number.parseInt(process.env.PERF_S9D_MIN_PROFILE_INTENT_CANCELLED || '1', 10),
    description:
      'S9D requires observable profile intent cancellation in runtime telemetry (`profile_intent_cancelled`).',
  },
  S9E: {
    metric: 'harnessSettleEvalCount',
    min: Number.parseInt(process.env.PERF_S9E_MIN_SETTLE_EVAL_COUNT || '1', 10),
    maxMetric: 'observerRenderBumpCount',
    max: Number.parseInt(process.env.PERF_S9E_MAX_OBSERVER_RENDER_BUMP_COUNT || '0', 10),
    description:
      'S9E requires event-driven settle evaluation telemetry and zero render-bump observer churn (`shortcut_harness_settle_eval`, `shortcut_harness_observer_render_bump`).',
  },
};

let mechanismTelemetry = null;
if (Object.prototype.hasOwnProperty.call(mechanismTelemetryRules, sliceId)) {
  const rule = mechanismTelemetryRules[sliceId];
  if (!Number.isInteger(rule.min) || rule.min < 0) {
    nonCatFailures.push(`Invalid mechanism min threshold for ${sliceId}.`);
  }
  if (
    Object.prototype.hasOwnProperty.call(rule, 'max') &&
    (!Number.isInteger(rule.max) || rule.max < 0)
  ) {
    nonCatFailures.push(`Invalid mechanism max threshold for ${sliceId}.`);
  }
  const metricValues = runDetails.map((detail) => detail.mechanismSignals[rule.metric]);
  const metricMedian = median(metricValues);
  const metricWorst = Math.max(...metricValues);
  let pass = metricMedian != null && metricMedian >= rule.min;

  let maxMetricMedian = null;
  let maxMetricWorst = null;
  if (rule.maxMetric) {
    const maxValues = runDetails.map((detail) => detail.mechanismSignals[rule.maxMetric]);
    maxMetricMedian = median(maxValues);
    maxMetricWorst = Math.max(...maxValues);
    pass = pass && maxMetricWorst <= rule.max;
  }

  mechanismTelemetry = {
    sliceId,
    description: rule.description,
    metric: rule.metric,
    min: rule.min,
    metricMedian,
    metricWorst,
    maxMetric: rule.maxMetric ?? null,
    max: Object.prototype.hasOwnProperty.call(rule, 'max') ? rule.max : null,
    maxMetricMedian,
    maxMetricWorst,
    pass,
  };

  if (!pass) {
    nonCatFailures.push(
      `${rule.description} Observed ${rule.metric} median=${String(metricMedian)} worst=${String(
        metricWorst
      )}${rule.maxMetric ? `; ${rule.maxMetric} median=${String(maxMetricMedian)} worst=${String(maxMetricWorst)} max=${String(rule.max)}` : ''}.`
    );
  }
}

let targetedHotspot = null;
if (perfBearingOwnershipSlices.has(sliceId)) {
  const rule = targetedHotspotRules[sliceId];
  if (!rule) {
    nonCatFailures.push(
      `${sliceId} requires targeted hotspot directional-improvement evidence, but no hotspot rule is configured.`
    );
  } else {
    const uiStages = Array.isArray(rule.uiStages) && rule.uiStages.length > 0 ? rule.uiStages : rule.stages;
    const baselineWindowCount = sumStageCounts(
      baseline?.stageHistogram?.byStageWindowCount ?? {},
      rule.stages
    );
    const baselineCatWindowCount = sumStageCounts(
      baseline?.stageHistogram?.byStageCatastrophicWindowCount ?? {},
      rule.stages
    );
    const candidateWindowMedian = median(
      runDetails.map((detail) => sumStageCounts(detail.stageWindowCountByStage, rule.stages))
    );
    const candidateCatWindowMedian = median(
      runDetails.map((detail) => sumStageCounts(detail.stageCatWindowCountByStage, rule.stages))
    );
    const baselineUiWindowCount = sumStageCounts(
      baseline?.uiStageHistogram?.byStageWindowCount ?? {},
      uiStages
    );
    const candidateUiWindowMedian = median(
      runDetails.map((detail) => sumStageCounts(detail.uiStageWindowCountByStage, uiStages))
    );

    const catDirectionalImprovement =
      baselineCatWindowCount > 0 &&
      candidateCatWindowMedian != null &&
      candidateCatWindowMedian < baselineCatWindowCount;
    const pressureDirectionalImprovement =
      baselineWindowCount > 0 &&
      candidateWindowMedian != null &&
      candidateWindowMedian < baselineWindowCount;
    const requiredDirectionalSignal =
      rule.requiredDirectionalSignal === 'pressure'
        ? 'pressure'
        : rule.requiredDirectionalSignal === 'catastrophic'
          ? 'catastrophic'
          : 'either';
    const directionalImprovementBaseRaw =
      requiredDirectionalSignal === 'pressure'
        ? pressureDirectionalImprovement
        : requiredDirectionalSignal === 'catastrophic'
          ? catDirectionalImprovement
          : catDirectionalImprovement || pressureDirectionalImprovement;
    const hasBaselineDirectionalEvidence = baselineWindowCount > 0 || baselineCatWindowCount > 0;
    const directionalImprovementBase = hasBaselineDirectionalEvidence
      ? directionalImprovementBaseRaw
      : true;
    const requiredUiPressure = rule.requiredUiPressure === true;
    const uiPressureDirectionalImprovement =
      baselineUiWindowCount > 0 &&
      candidateUiWindowMedian != null &&
      candidateUiWindowMedian < baselineUiWindowCount;
    const directionalImprovement = requiredUiPressure
      ? directionalImprovementBase && uiPressureDirectionalImprovement
      : directionalImprovementBase;

    targetedHotspot = {
      sliceId,
      description: rule.description,
      stages: rule.stages,
      uiStages,
      baselineWindowCount,
      baselineCatWindowCount,
      candidateWindowMedian,
      candidateCatWindowMedian,
      baselineUiWindowCount,
      candidateUiWindowMedian,
      catDirectionalImprovement,
      pressureDirectionalImprovement,
      uiPressureDirectionalImprovement,
      requiredDirectionalSignal,
      requiredUiPressure,
      hasBaselineDirectionalEvidence,
      directionalImprovement,
    };

    if (!directionalImprovement && hasBaselineDirectionalEvidence) {
      nonCatFailures.push(
        `${rule.description} Required signal=${requiredDirectionalSignal}${
          requiredUiPressure ? ', uiPressure=true' : ''
        }. Baseline windows=${baselineWindowCount}, baseline catastrophic windows=${baselineCatWindowCount}, candidate median windows=${String(
          candidateWindowMedian
        )}, candidate median catastrophic windows=${String(
          candidateCatWindowMedian
        )}, baseline UI windows=${baselineUiWindowCount}, candidate UI median windows=${String(
          candidateUiWindowMedian
        )}.`
      );
    }
  }
}

let locDeletionGate = {
  enabled: locGateSliceSet.has(sliceId),
  baselinePath: locBaselinePathRaw || null,
};
if (locGateSliceSet.has(sliceId)) {
  if (!locBaselinePathRaw) {
    nonCatFailures.push(
      'LOC deletion gate is enabled but PROMOTION_LOC_BASELINE_PATH is empty.'
    );
    locDeletionGate = {
      ...locDeletionGate,
      pass: false,
      failures: ['PROMOTION_LOC_BASELINE_PATH is empty.'],
    };
  } else {
    const resolvedLocBaselinePath = resolveRepoPath(locBaselinePathRaw);
    if (!resolvedLocBaselinePath || !fs.existsSync(resolvedLocBaselinePath)) {
      nonCatFailures.push(
        `LOC deletion gate baseline not found: ${String(locBaselinePathRaw)}.`
      );
      locDeletionGate = {
        ...locDeletionGate,
        baselinePath: resolvedLocBaselinePath,
        pass: false,
        failures: [`LOC deletion gate baseline not found: ${String(locBaselinePathRaw)}.`],
      };
    } else {
      const locConfig = readJson(resolvedLocBaselinePath);
      const configuredSlices = Array.isArray(locConfig?.enforcedSliceIds)
        ? locConfig.enforcedSliceIds
            .filter((entry) => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [];
      const effectiveSliceSet =
        configuredSlices.length > 0 ? new Set(configuredSlices) : locGateSliceSet;
      if (!effectiveSliceSet.has(sliceId)) {
        locDeletionGate = {
          enabled: false,
          baselinePath: resolvedLocBaselinePath,
          schemaVersion: locConfig?.schemaVersion ?? null,
          reason: `slice ${sliceId} is outside LOC deletion baseline enforcement.`,
        };
      } else {
      const targets = Array.isArray(locConfig?.targets) ? locConfig.targets : [];
      const sliceOverride =
        locConfig &&
        typeof locConfig === 'object' &&
        locConfig.sliceOverrides &&
        typeof locConfig.sliceOverrides === 'object' &&
        !Array.isArray(locConfig.sliceOverrides) &&
        locConfig.sliceOverrides[sliceId] &&
        typeof locConfig.sliceOverrides[sliceId] === 'object' &&
        !Array.isArray(locConfig.sliceOverrides[sliceId])
          ? locConfig.sliceOverrides[sliceId]
          : null;
      const overrideTargets =
        sliceOverride &&
        sliceOverride.targets &&
        typeof sliceOverride.targets === 'object' &&
        !Array.isArray(sliceOverride.targets)
          ? sliceOverride.targets
          : null;
      const targetFailures = [];
      if (targets.length === 0) {
        targetFailures.push('LOC deletion baseline has no targets.');
      }

      const targetDetails = targets.map((target) => {
        const baselineLoc = safeInteger(target?.baselineLoc);
        const id = typeof target?.id === 'string' ? target.id : target?.path ?? 'unknown_target';
        const targetOverride =
          overrideTargets &&
          overrideTargets[id] &&
          typeof overrideTargets[id] === 'object' &&
          !Array.isArray(overrideTargets[id])
            ? overrideTargets[id]
            : null;
        const maxDelta = safeInteger(targetOverride?.maxDelta) ?? safeInteger(target?.maxDelta) ?? 0;

        if (baselineLoc == null || baselineLoc < 0) {
          targetFailures.push(`LOC baseline target ${id} has invalid baselineLoc.`);
          return {
            id,
            path: target?.path ?? null,
            kind: target?.kind === 'directory' ? 'directory' : 'file',
            baselineLoc: target?.baselineLoc ?? null,
            currentLoc: null,
            delta: null,
            maxDelta,
            pass: false,
          };
        }

        const currentLoc = countTargetLoc(target);
        const delta = currentLoc - baselineLoc;
        if (delta > maxDelta) {
          targetFailures.push(
            `LOC target ${id} grew by ${delta} lines (allowed max delta ${maxDelta}).`
          );
        }
        return {
          id,
          path: target?.path ?? null,
          kind: target?.kind === 'directory' ? 'directory' : 'file',
          baselineLoc,
          currentLoc,
          delta,
          maxDelta,
          pass: delta <= maxDelta,
        };
      });

      const baselineAggregate =
        safeInteger(locConfig?.aggregate?.baselineLoc) ??
        targetDetails.reduce(
          (sum, detail) => sum + (safeInteger(detail?.baselineLoc) ?? 0),
          0
        );
      const currentAggregate = targetDetails.reduce(
        (sum, detail) => sum + (safeInteger(detail?.currentLoc) ?? 0),
        0
      );
      const aggregateDelta = currentAggregate - baselineAggregate;
      const minAggregateDelta =
        safeInteger(sliceOverride?.minAggregateDelta) ??
        safeInteger(locConfig?.minAggregateDelta) ?? defaultLocMinAggregateDelta;
      if (aggregateDelta > minAggregateDelta) {
        targetFailures.push(
          `LOC aggregate delta ${aggregateDelta} must be <= ${minAggregateDelta}.`
        );
      }

      if (targetFailures.length > 0) {
        nonCatFailures.push(...targetFailures);
      }
      locDeletionGate = {
        enabled: true,
        baselinePath: resolvedLocBaselinePath,
        schemaVersion: locConfig?.schemaVersion ?? null,
        sliceOverrideUsed: sliceOverride,
        minAggregateDelta,
        aggregate: {
          baselineLoc: baselineAggregate,
          currentLoc: currentAggregate,
          delta: aggregateDelta,
        },
        targets: targetDetails,
        pass: targetFailures.length === 0,
        failures: targetFailures,
      };
      }
    }
  }
}

const worstCandidateCatRuns = Math.max(...runDetails.map((detail) => detail.catastrophic.jsRunCount));
const worstCandidateUiCatRuns = Math.max(...runDetails.map((detail) => detail.catastrophic.uiRunCount));
const catastrophicThreshold = Math.max(
  ...runDetails
    .map((detail) => detail.catastrophic.runThreshold)
    .filter((value) => Number.isFinite(value))
);
const catastrophicBlocked =
  (Number.isFinite(catastrophicThreshold) &&
    worstCandidateCatRuns >= catastrophicThreshold &&
    worstCandidateCatRuns > 0) ||
  (Number.isFinite(catastrophicThreshold) &&
    worstCandidateUiCatRuns >= catastrophicThreshold &&
    worstCandidateUiCatRuns > 0);

const nonCatPass = aggregateHardFailures.length === 0 && nonCatFailures.length === 0;
const waiverAllowedForSlice = !noWaiverSlices.has(sliceId);
const waiverEligible =
  waiverAllowedForSlice &&
  catastrophicBlocked &&
  nonCatPass &&
  worstCandidateCatRuns <= baselineCatRuns &&
  worstCandidateUiCatRuns <= baselineUiCatRuns;
const pass = nonCatPass && (!catastrophicBlocked || waiverEligible);

const summary = {
  sliceId,
  baselinePath,
  comparePaths,
  candidateReportPaths,
  overlapGate,
  commitSpanGate,
  thresholds: {
    floorMaxRegression: floorThreshold,
    stallP95MaxRegressionPct: stallThreshold,
    uiFloorMaxRegression: uiFloorThreshold,
    uiStallP95MaxRegressionPct: uiStallThreshold,
  },
  medians: floorMedians,
  mapRuntimeMedians,
  mapRuntimeThresholds,
  mechanismTelemetry,
  targetedHotspot,
  locDeletionGate,
  baselineCatastrophic: {
    jsRunCount: baselineCatRuns,
    uiRunCount: baselineUiCatRuns,
  },
  candidateCatastrophic: {
    worstJsRunCount: worstCandidateCatRuns,
    worstUiRunCount: worstCandidateUiCatRuns,
    threshold: Number.isFinite(catastrophicThreshold) ? catastrophicThreshold : null,
  },
  waiverAllowedForSlice,
  waiverEligible,
  waiverApplied: waiverEligible,
  pass,
  failures: [
    ...aggregateHardFailures,
    ...nonCatFailures,
    ...(catastrophicBlocked && !waiverEligible
      ? ['Catastrophic gate remains blocking and waiver conditions are not met.']
      : []),
  ],
  runDetails,
};

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
process.exit(pass ? 0 : 1);
NODE
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
    validate_baseline_regression_denominators "$baseline_report_path"

    echo "[perf-local-ci] Baseline log: $baseline_log_path"
    echo "[perf-local-ci] Baseline report: $baseline_report_path"
    print_report_summary "$baseline_report_path" "baseline"
    ;;

  gate)
    baseline_report_path="${1:-$DEFAULT_BASELINE_REPORT}"
    candidate_log_path="${2:-}"
    run_gate_once "$baseline_report_path" "$candidate_log_path"
    if [[ "$RUN_GATE_EXIT_CODE" -ne 0 ]]; then
      echo "[perf-local-ci] Gate FAILED." >&2
      exit "$RUN_GATE_EXIT_CODE"
    fi

    echo "[perf-local-ci] Gate PASSED."
    ;;

  promote-slice)
    slice_id="${1:-}"
    baseline_report_path="${2:-$DEFAULT_BASELINE_REPORT}"
    if [[ -z "$slice_id" ]]; then
      echo "slice_id is required. Example: scripts/perf-shortcut-local-ci.sh promote-slice S3" >&2
      exit 1
    fi

    if [[ ! -f "$baseline_report_path" ]]; then
      echo "Baseline report not found: $baseline_report_path" >&2
      echo "Run: scripts/perf-shortcut-local-ci.sh record-baseline" >&2
      exit 1
    fi

    validate_report_contract "$baseline_report_path" "baseline"
    validate_report_min_runs "$baseline_report_path" "baseline"
    validate_baseline_regression_denominators "$baseline_report_path"

    root_ownership_rules_path="${PERF_PROMOTION_ROOT_OWNERSHIP_RULES_PATH:-$REPO_ROOT/plans/perf-baselines/runtime-root-ownership-gates.json}"
    root_ownership_summary_path="/tmp/perf-root-ownership-${slice_id}-$(utc_timestamp).json"
    echo "[perf-local-ci] Running root ownership gate checks for ${slice_id}..."
    SEARCH_RUNTIME_ROOT_OWNERSHIP_GATE_SUMMARY_PATH="$root_ownership_summary_path" \
      bash "$SCRIPT_DIR/search-runtime-root-ownership-gate.sh" "$slice_id" "$root_ownership_rules_path"
    echo "[perf-local-ci] Root ownership summary: $root_ownership_summary_path"

    if [[ "$slice_id" == "S3" ]]; then
      echo "[perf-local-ci] Running S3 natural cutover contract checks..."
      bash "$SCRIPT_DIR/search-runtime-natural-cutover-contract.sh"
    fi
    if [[ "$slice_id" == "S4" ]]; then
      echo "[perf-local-ci] Running S4 mode cutover contract checks..."
      bash "$SCRIPT_DIR/search-runtime-s4-mode-cutover-contract.sh"
    fi
    if [[ "$slice_id" == "S5" ]]; then
      echo "[perf-local-ci] Running S5 hydration cutover contract checks..."
      bash "$SCRIPT_DIR/search-runtime-s5-hydration-cutover-contract.sh"
    fi
    if [[ "$slice_id" == "S6" ]]; then
      echo "[perf-local-ci] Running S6 map cutover contract checks..."
      bash "$SCRIPT_DIR/search-runtime-s6-map-cutover-contract.sh"
    fi

    matched_runs="${PERF_PROMOTION_MATCHED_RUNS:-2}"
    if ! [[ "$matched_runs" =~ ^[0-9]+$ ]] || [[ "$matched_runs" -lt 2 ]]; then
      echo "Invalid PERF_PROMOTION_MATCHED_RUNS=$matched_runs (must be integer >= 2)." >&2
      exit 1
    fi

    compare_paths=()
    candidate_report_paths=()
    candidate_log_paths=()

    for ((run_index = 1; run_index <= matched_runs; run_index += 1)); do
      echo "[perf-local-ci] Running matched gate ${run_index}/${matched_runs} for ${slice_id}..."
      run_gate_once "$baseline_report_path"
      compare_paths+=("$RUN_GATE_COMPARE_SUMMARY_PATH")
      candidate_report_paths+=("$RUN_GATE_CANDIDATE_REPORT_PATH")
      candidate_log_paths+=("$RUN_GATE_CANDIDATE_LOG_PATH")
    done

    overlap_control_log_paths=()
    for ((run_index = 1; run_index <= matched_runs; run_index += 1)); do
      overlap_control_log_path="/tmp/perf-shortcut-overlap-control-${slice_id}-${run_index}-$(utc_timestamp).log"
      echo "[perf-local-ci] Running overlap/commit-span control harness ${run_index}/${matched_runs} for ${slice_id}..."
      run_live_shortcut_loop "overlap-control-${run_index}" "$overlap_control_log_path"
      overlap_control_log_paths+=("$overlap_control_log_path")
      echo "[perf-local-ci] Overlap/commit-span control log ${run_index}: $overlap_control_log_path"
    done

    heavy_components="${PERF_PROMOTION_HEAVY_COMPONENTS:-SearchScreen,SearchMapTree,SearchResultsSheetTree,SearchOverlayChrome,BottomNav}"
    overlap_summary_path="/tmp/perf-shortcut-overlap-${slice_id}-$(utc_timestamp).json"
    commit_span_summary_path="/tmp/perf-shortcut-commit-span-${slice_id}-$(utc_timestamp).json"

    overlap_gate_args=(
      --components "$heavy_components"
      --summary "$overlap_summary_path"
    )
    commit_span_gate_args=(
      --components "$heavy_components"
      --summary "$commit_span_summary_path"
    )

    for control_log_path in "${overlap_control_log_paths[@]}"; do
      overlap_gate_args+=(--control "$control_log_path")
      commit_span_gate_args+=(--control "$control_log_path")
    done

    for candidate_log_path in "${candidate_log_paths[@]}"; do
      overlap_gate_args+=(--candidate "$candidate_log_path")
      commit_span_gate_args+=(--candidate "$candidate_log_path")
    done

    echo "[perf-local-ci] Running overlap gate for ${slice_id}..."
    set +e
    bash "$SCRIPT_DIR/perf-shortcut-overlap-gate.sh" "${overlap_gate_args[@]}"
    overlap_gate_exit=$?
    set -e
    echo "[perf-local-ci] Overlap gate summary: $overlap_summary_path"

    echo "[perf-local-ci] Running commit-span gate for ${slice_id}..."
    set +e
    bash "$SCRIPT_DIR/perf-shortcut-commit-span-gate.sh" "${commit_span_gate_args[@]}"
    commit_span_gate_exit=$?
    set -e
    echo "[perf-local-ci] Commit-span gate summary: $commit_span_summary_path"

    gate_failure_exit=0
    if [[ "$overlap_gate_exit" -ne 0 ]]; then
      gate_failure_exit="$overlap_gate_exit"
    fi
    if [[ "$commit_span_gate_exit" -ne 0 ]]; then
      gate_failure_exit="$commit_span_gate_exit"
    fi

    promotion_summary_path="/tmp/perf-shortcut-promotion-${slice_id}-$(utc_timestamp).json"
    compare_paths_joined="$(printf '%s\n' "${compare_paths[@]}")"
    candidate_report_paths_joined="$(printf '%s\n' "${candidate_report_paths[@]}")"

    set +e
    summarize_slice_promotion \
      "$slice_id" \
      "$baseline_report_path" \
      "$promotion_summary_path" \
      "$compare_paths_joined" \
      "$candidate_report_paths_joined" \
      "$overlap_summary_path" \
      "$commit_span_summary_path"
    promotion_exit=$?
    set -e

    echo "[perf-local-ci] Promotion summary: $promotion_summary_path"
    if [[ "$gate_failure_exit" -ne 0 ]]; then
      echo "[perf-local-ci] Promotion gate FAILED for ${slice_id}: overlap/commit-span regression gate failed." >&2
      exit "$gate_failure_exit"
    fi
    if [[ "$promotion_exit" -ne 0 ]]; then
      echo "[perf-local-ci] Promotion gate FAILED for ${slice_id}." >&2
      exit "$promotion_exit"
    fi

    echo "[perf-local-ci] Promotion gate PASSED for ${slice_id}."
    ;;

  *)
    usage >&2
    exit 1
    ;;
esac
