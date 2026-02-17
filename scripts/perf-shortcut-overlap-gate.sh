#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/perf-shortcut-overlap-gate.sh \
    --control <control_candidate_log> [--control <control_candidate_log_b> ...] \
    --candidate <candidate_log_a> [--candidate <candidate_log_b> ...] \
    [--components <comma_separated_component_ids>] \
    [--summary <summary_json_path>]

Notes:
  - Overlap is computed only inside the run-1 worst JS frame window.
  - Policy:
      1) median candidate total overlap across heavy components must improve vs control,
      2) no heavy component median overlap regression may exceed +10%.
USAGE
}

CONTROL_LOG_PATHS=()
CANDIDATE_LOG_PATHS=()
COMPONENTS="SearchScreen,SearchMapTree,SearchResultsSheetTree,SearchOverlayChrome,BottomNav"
SUMMARY_PATH="/tmp/perf-shortcut-overlap-gate-$(date -u +%Y%m%dT%H%M%SZ).json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --control)
      CONTROL_LOG_PATHS+=("${2:-}")
      shift 2
      ;;
    --candidate)
      CANDIDATE_LOG_PATHS+=("${2:-}")
      shift 2
      ;;
    --components)
      COMPONENTS="${2:-}"
      shift 2
      ;;
    --summary)
      SUMMARY_PATH="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ${#CONTROL_LOG_PATHS[@]} -eq 0 ]]; then
  echo "At least one --control is required." >&2
  usage >&2
  exit 1
fi
if [[ ${#CANDIDATE_LOG_PATHS[@]} -eq 0 ]]; then
  echo "At least one --candidate is required." >&2
  usage >&2
  exit 1
fi
for control_path in "${CONTROL_LOG_PATHS[@]}"; do
  if [[ ! -f "$control_path" ]]; then
    echo "Control log not found: $control_path" >&2
    exit 1
  fi
done
for candidate_path in "${CANDIDATE_LOG_PATHS[@]}"; do
  if [[ ! -f "$candidate_path" ]]; then
    echo "Candidate log not found: $candidate_path" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$SUMMARY_PATH")"

node - "$COMPONENTS" "$SUMMARY_PATH" "${CONTROL_LOG_PATHS[@]}" -- "${CANDIDATE_LOG_PATHS[@]}" <<'NODE'
const fs = require('fs');

const args = process.argv.slice(2);
const [componentsRaw, summaryPath, ...pathArgs] = args;
const separatorIndex = pathArgs.indexOf('--');
if (separatorIndex === -1) {
  throw new Error('Missing control/candidate separator.');
}
const controlLogPaths = pathArgs.slice(0, separatorIndex);
const candidateLogPaths = pathArgs.slice(separatorIndex + 1);
if (controlLogPaths.length === 0) {
  throw new Error('At least one control log path is required.');
}
if (candidateLogPaths.length === 0) {
  throw new Error('At least one candidate log path is required.');
}

const components = componentsRaw
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
if (components.length === 0) {
  throw new Error('At least one component id is required.');
}
const componentSet = new Set(components);
const MAX_COMPONENT_REGRESSION_PCT = 10;
const EPSILON = 1e-9;

const toFiniteNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const parseJsonSuffix = (line, marker) => {
  const markerIndex = line.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }
  const jsonStart = line.indexOf('{', markerIndex + marker.length);
  if (jsonStart === -1) {
    return null;
  }
  try {
    return JSON.parse(line.slice(jsonStart));
  } catch {
    return null;
  }
};
const median = (values) => {
  const finiteValues = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finiteValues.length === 0) {
    return null;
  }
  const mid = Math.floor(finiteValues.length / 2);
  if (finiteValues.length % 2 === 1) {
    return finiteValues[mid];
  }
  return (finiteValues[mid - 1] + finiteValues[mid]) / 2;
};
const overlapMs = (leftStart, leftEnd, rightStart, rightEnd) =>
  Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
const deltaPct = (controlValue, candidateValue) => {
  if (controlValue <= EPSILON) {
    return candidateValue <= EPSILON ? 0 : Number.POSITIVE_INFINITY;
  }
  return ((candidateValue - controlValue) / controlValue) * 100;
};

const parseRunOneOverlap = (logPath) => {
  const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);
  let worstRunOneWindow = null;
  const runOneSpans = [];

  for (const line of lines) {
    const jsSamplerPayload = parseJsonSuffix(line, '[SearchPerf][JsFrameSampler]');
    if (jsSamplerPayload) {
      const shortcutSessionId =
        toFiniteNumber(jsSamplerPayload.shortcutSessionId) ?? toFiniteNumber(jsSamplerPayload.runNumber);
      if (shortcutSessionId !== 1) {
        continue;
      }
      const nowMs = toFiniteNumber(jsSamplerPayload.nowMs);
      const windowMs = toFiniteNumber(jsSamplerPayload.windowMs);
      const maxFrameMs = toFiniteNumber(jsSamplerPayload.maxFrameMs);
      if (nowMs == null || windowMs == null || windowMs <= 0 || maxFrameMs == null) {
        continue;
      }
      const candidateWindow = {
        nowMs,
        windowMs,
        maxFrameMs,
        startMs: nowMs - windowMs,
        endMs: nowMs,
        shortcutStage:
          typeof jsSamplerPayload.shortcutStage === 'string'
            ? jsSamplerPayload.shortcutStage
            : null,
      };
      if (
        worstRunOneWindow == null ||
        candidateWindow.maxFrameMs > worstRunOneWindow.maxFrameMs + EPSILON ||
        (Math.abs(candidateWindow.maxFrameMs - worstRunOneWindow.maxFrameMs) <= EPSILON &&
          candidateWindow.nowMs > worstRunOneWindow.nowMs)
      ) {
        worstRunOneWindow = candidateWindow;
      }
      continue;
    }

    const profilerPayload = parseJsonSuffix(line, '[SearchPerf][Profiler]');
    if (!profilerPayload || profilerPayload.event !== 'profiler_span') {
      continue;
    }
    const runNumber = toFiniteNumber(profilerPayload.runNumber);
    if (runNumber !== 1) {
      continue;
    }
    const id = typeof profilerPayload.id === 'string' ? profilerPayload.id : '';
    if (!componentSet.has(id)) {
      continue;
    }
    const nowMs = toFiniteNumber(profilerPayload.nowMs);
    const commitSpanMs = toFiniteNumber(profilerPayload.commitSpanMs);
    if (nowMs == null || commitSpanMs == null || commitSpanMs <= 0) {
      continue;
    }
    runOneSpans.push({
      id,
      nowMs,
      commitSpanMs,
      startMs: nowMs - commitSpanMs,
      endMs: nowMs,
    });
  }

  if (worstRunOneWindow == null) {
    throw new Error(
      `Unable to resolve run-1 worst JS window from log: ${logPath}. Missing [SearchPerf][JsFrameSampler] run-1 payloads.`
    );
  }
  if (runOneSpans.length === 0) {
    throw new Error(
      `No run-1 profiler spans found for configured components in log: ${logPath}. Ensure profiler span logging is enabled.`
    );
  }

  const overlapByComponent = Object.fromEntries(components.map((componentId) => [componentId, 0]));
  let intersectingSpanCount = 0;
  for (const span of runOneSpans) {
    const overlappedMs = overlapMs(
      span.startMs,
      span.endMs,
      worstRunOneWindow.startMs,
      worstRunOneWindow.endMs
    );
    if (overlappedMs <= 0) {
      continue;
    }
    overlapByComponent[span.id] += overlappedMs;
    intersectingSpanCount += 1;
  }
  if (intersectingSpanCount === 0) {
    throw new Error(
      `No run-1 profiler spans intersect the run-1 worst JS window in log: ${logPath}.`
    );
  }

  const totalOverlapMs = components.reduce(
    (sum, componentId) => sum + (overlapByComponent[componentId] ?? 0),
    0
  );

  return {
    logPath,
    runOneWorstWindow: worstRunOneWindow,
    overlapByComponent,
    totalOverlapMs,
    intersectingSpanCount,
    profilerRunOneSpanCount: runOneSpans.length,
  };
};

const controls = controlLogPaths.map((logPath) => parseRunOneOverlap(logPath));
const candidates = candidateLogPaths.map((logPath) => parseRunOneOverlap(logPath));

const candidateMedianOverlapByComponent = Object.fromEntries(
  components.map((componentId) => [
    componentId,
    median(candidates.map((entry) => entry.overlapByComponent[componentId] ?? 0)),
  ])
);
const controlMedianOverlapByComponent = Object.fromEntries(
  components.map((componentId) => [
    componentId,
    median(controls.map((entry) => entry.overlapByComponent[componentId] ?? 0)),
  ])
);
const candidateMedianTotalOverlapMs = median(candidates.map((entry) => entry.totalOverlapMs));
const controlMedianTotalOverlapMs = median(controls.map((entry) => entry.totalOverlapMs));

const componentDeltaPct = Object.fromEntries(
  components.map((componentId) => [
    componentId,
    deltaPct(
      controlMedianOverlapByComponent[componentId] ?? 0,
      candidateMedianOverlapByComponent[componentId] ?? 0
    ),
  ])
);

const regressedComponents = components.filter((componentId) => {
  const pct = componentDeltaPct[componentId];
  return !Number.isFinite(pct) || pct > MAX_COMPONENT_REGRESSION_PCT + EPSILON;
});
const directionalImprovement =
  candidateMedianTotalOverlapMs != null &&
  controlMedianTotalOverlapMs != null &&
  candidateMedianTotalOverlapMs < controlMedianTotalOverlapMs - EPSILON;

const failures = [];
if (!directionalImprovement) {
  failures.push(
    `Median candidate total overlap (${String(
      candidateMedianTotalOverlapMs
    )}ms) must improve vs control (${String(controlMedianTotalOverlapMs)}ms).`
  );
}
if (regressedComponents.length > 0) {
  failures.push(
    `Component overlap regression exceeds +${MAX_COMPONENT_REGRESSION_PCT}%: ${regressedComponents
      .map((componentId) => `${componentId}=${String(componentDeltaPct[componentId])}%`)
      .join(', ')}`
  );
}

const summary = {
  schemaVersion: 'perf-shortcut-overlap-gate.v1',
  generatedAt: new Date().toISOString(),
  policy: {
    requiredDirectionalSignal: 'candidate median total overlap improves vs control',
    maxPerComponentRegressionPct: MAX_COMPONENT_REGRESSION_PCT,
    windowScope: 'run-1 worst JS window',
  },
  components,
  control: controls[0] ?? null,
  controls,
  candidates,
  medians: {
    controlOverlapByComponent: controlMedianOverlapByComponent,
    candidateMedianOverlapByComponent,
    componentDeltaPct,
    controlTotalOverlapMs: controlMedianTotalOverlapMs,
    candidateMedianTotalOverlapMs,
    totalDeltaPct: deltaPct(controlMedianTotalOverlapMs ?? 0, candidateMedianTotalOverlapMs ?? 0),
  },
  pass: failures.length === 0,
  failures,
};

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
process.exit(summary.pass ? 0 : 1);
NODE

echo "[perf-overlap-gate] Summary: $SUMMARY_PATH"
