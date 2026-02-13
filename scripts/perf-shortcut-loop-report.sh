#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/perf-shortcut-loop-report.sh <log_path> [output_json_path]

Parses a perf-shortcut loop log and emits a normalized JSON report.
USAGE
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 1
fi

LOG_PATH="$1"
OUTPUT_PATH="${2:-}"

if [[ ! -f "$LOG_PATH" ]]; then
  echo "Log file not found: $LOG_PATH" >&2
  exit 1
fi

node - "$LOG_PATH" "$OUTPUT_PATH" <<'NODE'
const fs = require('fs');

const logPath = process.argv[2];
const outputPath = process.argv[3] || '';
const SCHEMA_VERSION = 'perf-shortcut-report.v1';
const CATASTROPHIC_FRAME_MS = Number.parseFloat(process.env.PERF_CATASTROPHIC_FRAME_MS || '300');

const readLines = (path) => fs.readFileSync(path, 'utf8').split(/\r?\n/);

const parseLogEvents = (lines) => {
  const events = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const jsonStart = line.indexOf('{');
    if (jsonStart < 0) {
      continue;
    }
    const candidate = line.slice(jsonStart);
    try {
      const data = JSON.parse(candidate);
      events.push({ line: idx + 1, raw: line, data });
    } catch {
      // Ignore non-JSON lines.
    }
  }
  return events;
};

const safeNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const safeString = (value) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const percentile = (values, p) => {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0];
  }
  const pos = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  const weight = pos - lower;
  if (upper === lower) {
    return sorted[lower];
  }
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const mean = (values) => {
  if (!values.length) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const parseSignatureParts = (signature) => {
  const raw = safeString(signature);
  if (raw == null) {
    return {};
  }
  const parts = {};
  for (const segment of raw.split('|')) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }
    const separator = trimmed.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1);
    parts[key] = value;
  }
  return parts;
};

const buildStableSignature = (parts) =>
  Object.entries(parts)
    .filter(([key]) => key !== 'runId')
    .map(([key, value]) => `${key}:${value}`)
    .join('|');

const normalizeMaybeEmpty = (value) => {
  const stringValue = safeString(value);
  if (stringValue == null || stringValue === '<empty>') {
    return null;
  }
  return stringValue;
};

const stripAnsi = (value) => value.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '');

const parseLaunchEnvironment = (lines) => {
  let launchTargetMode = null;
  let launchPreferDevice = null;
  let launchIosDeviceUdid = null;
  let launchIosDeviceName = null;
  let runtimeTarget = null;
  let runtimeDeviceDescriptor = null;

  for (const line of lines) {
    const sanitizedLine = stripAnsi(line);
    const launchMatch = sanitizedLine.match(
      /target=([^ ]+)\s+preferDevice=([0-9]+)\s+iosDeviceUdid=([^ ]+)\s+iosDeviceName=(.+)$/
    );
    if (launchMatch) {
      launchTargetMode = normalizeMaybeEmpty(launchMatch[1]);
      const parsedPreferDevice = Number.parseInt(launchMatch[2] ?? '', 10);
      launchPreferDevice = Number.isFinite(parsedPreferDevice) ? parsedPreferDevice : null;
      launchIosDeviceUdid = normalizeMaybeEmpty(launchMatch[3]);
      launchIosDeviceName = normalizeMaybeEmpty(launchMatch[4]);
      continue;
    }

    if (sanitizedLine.includes('Using iOS simulator:')) {
      runtimeTarget = 'simulator';
      runtimeDeviceDescriptor = sanitizedLine
        .slice(sanitizedLine.indexOf('Using iOS simulator:') + 'Using iOS simulator:'.length)
        .trim();
      continue;
    }

    if (sanitizedLine.includes('Using iOS device:')) {
      runtimeTarget = 'device';
      runtimeDeviceDescriptor = sanitizedLine
        .slice(sanitizedLine.indexOf('Using iOS device:') + 'Using iOS device:'.length)
        .trim();
      continue;
    }
  }

  return {
    platform: 'ios',
    launchTargetMode:
      launchTargetMode ??
      (runtimeTarget === 'simulator'
        ? 'simulator(default)'
        : runtimeTarget === 'device'
          ? 'device-eligible'
          : null),
    launchPreferDevice:
      launchPreferDevice ??
      (runtimeTarget === 'simulator' ? 0 : runtimeTarget === 'device' ? 1 : null),
    launchIosDeviceUdid,
    launchIosDeviceName,
    runtimeTarget,
    runtimeDeviceDescriptor,
  };
};

const eventBelongsToRun = ({
  evt,
  runNumber,
  startMs,
  endMs,
  startLine,
  endLine,
}) => {
  // Prefer marker line ranges; they are robust across JS/UI clock domain differences.
  if (typeof startLine === 'number' && typeof endLine === 'number') {
    return evt.line >= startLine && evt.line <= endLine;
  }
  const sessionId = safeNumber(evt.data.shortcutSessionId);
  if (sessionId != null) {
    return sessionId === runNumber;
  }
  const nowMs = safeNumber(evt.data.nowMs);
  return nowMs != null && nowMs >= startMs && nowMs <= endMs;
};

const collectWindowEvents = (events, channelTag) =>
  events.filter((evt) => {
    if (!evt.raw.includes(channelTag)) {
      return false;
    }
    if (evt.data.event !== 'window') {
      return false;
    }
    return safeNumber(evt.data.nowMs) != null;
  });

const collectRunWindowMetrics = ({
  windows,
  runNumber,
  stageHistogram,
  allStallValues,
  catastrophicRuns,
  dominantFloor,
}) => {
  let runFloorMin = null;
  let runStallMax = null;
  let runCatastrophicWindowCount = 0;

  for (const evt of windows) {
    const floorFps = safeNumber(evt.data.floorFps);
    const stallLongestMs = safeNumber(evt.data.stallLongestMs) ?? 0;
    const maxFrameMs = safeNumber(evt.data.maxFrameMs) ?? 0;
    const stage = safeString(evt.data.shortcutStage) ?? 'none';

    stageHistogram.byStageWindowCount[stage] = (stageHistogram.byStageWindowCount[stage] || 0) + 1;
    allStallValues.push(stallLongestMs);

    if (maxFrameMs > CATASTROPHIC_FRAME_MS) {
      runCatastrophicWindowCount += 1;
      stageHistogram.byStageCatastrophicWindowCount[stage] =
        (stageHistogram.byStageCatastrophicWindowCount[stage] || 0) + 1;
      catastrophicRuns.add(runNumber);
    }

    if (floorFps != null && (runFloorMin == null || floorFps < runFloorMin)) {
      runFloorMin = floorFps;
    }

    if (runStallMax == null || stallLongestMs > runStallMax) {
      runStallMax = stallLongestMs;
    }

    if (floorFps != null && (dominantFloor.value == null || floorFps < dominantFloor.value)) {
      dominantFloor.value = floorFps;
      dominantFloor.stage = stage;
    }
  }

  return {
    floorMin: runFloorMin,
    stallLongestMax: runStallMax,
    catastrophicWindowCount: runCatastrophicWindowCount,
  };
};

const toSortedNumericArray = (set) =>
  Array.from(set)
    .map((value) => safeNumber(value))
    .filter((value) => value != null)
    .sort((a, b) => a - b);

const lines = readLines(logPath);
const parsed = parseLogEvents(lines);
if (!parsed.length) {
  throw new Error('No parseable JSON events found in log.');
}

const harnessEvents = parsed.filter(
  (evt) =>
    evt.raw.includes('[SearchPerf][Harness]') &&
    evt.data &&
    typeof evt.data.event === 'string' &&
    typeof evt.data.harnessRunId === 'string'
);
if (!harnessEvents.length) {
  throw new Error('No harness events found in log.');
}

const loopStarts = harnessEvents.filter((evt) => evt.data.event === 'shortcut_loop_start');
if (!loopStarts.length) {
  throw new Error('No shortcut_loop_start marker found.');
}

const activeLoopStart = loopStarts[loopStarts.length - 1];
const harnessRunId = activeLoopStart.data.harnessRunId;
const harnessSignatureRaw = safeString(activeLoopStart.data.signature);
const harnessSignatureParts = parseSignatureParts(harnessSignatureRaw);
const harnessSignatureStable = buildStableSignature(harnessSignatureParts);
const harnessScenario =
  safeString(activeLoopStart.data.scenario) ?? safeString(harnessSignatureParts.scenario);
const environment = parseLaunchEnvironment(lines);
if (environment.launchTargetMode == null) {
  if (environment.runtimeTarget === 'simulator') {
    environment.launchTargetMode = 'simulator(default)';
  } else if (environment.runtimeTarget === 'device') {
    environment.launchTargetMode = 'device-eligible';
  }
}
if (environment.launchPreferDevice == null) {
  if (environment.runtimeTarget === 'simulator') {
    environment.launchPreferDevice = 0;
  } else if (environment.runtimeTarget === 'device') {
    environment.launchPreferDevice = 1;
  }
}

const scopedEvents = parsed.filter((evt) => {
  if (evt.line < activeLoopStart.line) {
    return false;
  }
  if (typeof evt.data.harnessRunId === 'string') {
    return evt.data.harnessRunId === harnessRunId;
  }
  return true;
});

const scopedHarness = scopedEvents.filter(
  (evt) =>
    evt.raw.includes('[SearchPerf][Harness]') &&
    typeof evt.data.event === 'string' &&
    evt.data.harnessRunId === harnessRunId
);

const runStartEvents = scopedHarness.filter((evt) => evt.data.event === 'shortcut_loop_run_start');
const runCompleteEvents = scopedHarness.filter(
  (evt) => evt.data.event === 'shortcut_loop_run_complete'
);
const loopCompleteEvents = scopedHarness.filter((evt) => evt.data.event === 'shortcut_loop_complete');

const expectedRuns =
  safeNumber(runStartEvents[0]?.data.totalRuns) ??
  safeNumber(activeLoopStart.data.runs) ??
  runStartEvents.length;

const runStartByNumber = new Map();
const runStartLineByNumber = new Map();
for (const evt of runStartEvents) {
  const runNumber = safeNumber(evt.data.runNumber);
  const nowMs = safeNumber(evt.data.nowMs);
  if (runNumber == null || nowMs == null) {
    continue;
  }
  runStartByNumber.set(runNumber, nowMs);
  runStartLineByNumber.set(runNumber, evt.line);
}

const runCompleteByNumber = new Map();
const runCompleteLineByNumber = new Map();
const runDurationByNumber = new Map();
const runFinalStageByNumber = new Map();
for (const evt of runCompleteEvents) {
  const runNumber = safeNumber(evt.data.runNumber);
  const nowMs = safeNumber(evt.data.nowMs);
  if (runNumber == null || nowMs == null) {
    continue;
  }
  runCompleteByNumber.set(runNumber, nowMs);
  runCompleteLineByNumber.set(runNumber, evt.line);
  const durationMs = safeNumber(evt.data.durationMs);
  if (durationMs != null) {
    runDurationByNumber.set(runNumber, durationMs);
  }
  const finalStage = safeString(evt.data.finalStage);
  if (finalStage != null) {
    runFinalStageByNumber.set(runNumber, finalStage);
  }
}

const runNumbers = Array.from(
  new Set([...runStartByNumber.keys(), ...runCompleteByNumber.keys()])
).sort((a, b) => a - b);

const loopComplete = loopCompleteEvents.find((evt) => {
  const completed = safeNumber(evt.data.completedRuns);
  return completed != null && completed === expectedRuns;
});

const markerIntegrity = {
  harnessRunId,
  expectedRuns,
  startedRuns: Array.from(runStartByNumber.keys()).sort((a, b) => a - b),
  completedRuns: Array.from(runCompleteByNumber.keys()).sort((a, b) => a - b),
  hasLoopCompleteMarker: Boolean(loopComplete),
  complete: false,
};

markerIntegrity.complete =
  markerIntegrity.startedRuns.length === expectedRuns &&
  markerIntegrity.completedRuns.length === expectedRuns &&
  markerIntegrity.startedRuns.every((run) => markerIntegrity.completedRuns.includes(run)) &&
  markerIntegrity.hasLoopCompleteMarker;

const jsWindowEvents = collectWindowEvents(scopedEvents, '[SearchPerf][JsFrameSampler]');
const uiWindowEvents = collectWindowEvents(scopedEvents, '[SearchPerf][UiFrameSampler]');

const runMetrics = [];
const stageHistogram = {
  byStageWindowCount: {},
  byStageCatastrophicWindowCount: {},
};
const uiStageHistogram = {
  byStageWindowCount: {},
  byStageCatastrophicWindowCount: {},
};
const jsAllStallValues = [];
const uiAllStallValues = [];
const jsCatastrophicRuns = new Set();
const uiCatastrophicRuns = new Set();
const dominantJsFloor = { stage: null, value: null };
const dominantUiFloor = { stage: null, value: null };

for (const runNumber of runNumbers) {
  const startMs = runStartByNumber.get(runNumber);
  const endMs = runCompleteByNumber.get(runNumber);
  const startLine = runStartLineByNumber.get(runNumber);
  const endLine = runCompleteLineByNumber.get(runNumber);
  if (startMs == null || endMs == null) {
    runMetrics.push({
      runNumber,
      startMs: startMs ?? null,
      endMs: endMs ?? null,
      floorMin: null,
      stallLongestMax: null,
      catastrophicWindowCount: 0,
      uiFloorMin: null,
      uiStallLongestMax: null,
      uiCatastrophicWindowCount: 0,
      durationMs: runDurationByNumber.get(runNumber) ?? null,
      finalStage: runFinalStageByNumber.get(runNumber) ?? null,
    });
    continue;
  }

  const jsWindows = jsWindowEvents.filter((evt) =>
    eventBelongsToRun({ evt, runNumber, startMs, endMs, startLine, endLine })
  );
  const uiWindows = uiWindowEvents.filter((evt) =>
    eventBelongsToRun({ evt, runNumber, startMs, endMs, startLine, endLine })
  );

  const jsRunMetrics = collectRunWindowMetrics({
    windows: jsWindows,
    runNumber,
    stageHistogram,
    allStallValues: jsAllStallValues,
    catastrophicRuns: jsCatastrophicRuns,
    dominantFloor: dominantJsFloor,
  });

  const uiRunMetrics = collectRunWindowMetrics({
    windows: uiWindows,
    runNumber,
    stageHistogram: uiStageHistogram,
    allStallValues: uiAllStallValues,
    catastrophicRuns: uiCatastrophicRuns,
    dominantFloor: dominantUiFloor,
  });

  runMetrics.push({
    runNumber,
    startMs,
    endMs,
    floorMin: jsRunMetrics.floorMin,
    stallLongestMax: jsRunMetrics.stallLongestMax,
    catastrophicWindowCount: jsRunMetrics.catastrophicWindowCount,
    uiFloorMin: uiRunMetrics.floorMin,
    uiStallLongestMax: uiRunMetrics.stallLongestMax,
    uiCatastrophicWindowCount: uiRunMetrics.catastrophicWindowCount,
    durationMs: runDurationByNumber.get(runNumber) ?? null,
    finalStage: runFinalStageByNumber.get(runNumber) ?? null,
  });
}

const jsFloorValues = runMetrics
  .map((metric) => safeNumber(metric.floorMin))
  .filter((value) => value != null);
const jsStallRunMaxValues = runMetrics
  .map((metric) => safeNumber(metric.stallLongestMax))
  .filter((value) => value != null);
const uiFloorValues = runMetrics
  .map((metric) => safeNumber(metric.uiFloorMin))
  .filter((value) => value != null);
const uiStallRunMaxValues = runMetrics
  .map((metric) => safeNumber(metric.uiStallLongestMax))
  .filter((value) => value != null);

const report = {
  schemaVersion: SCHEMA_VERSION,
  metricSource: 'js_frame_sampler_window',
  uiMetricSource: 'ui_frame_sampler_window',
  metricDefinitions: {
    floorMean:
      'Mean of per-run minimum floorFps across [SearchPerf][JsFrameSampler] window events scoped by shortcutSessionId (fallback: run start/complete nowMs bounds).',
    stallMaxMean:
      'Mean of per-run maximum stallLongestMs across scoped [SearchPerf][JsFrameSampler] window events.',
    stallP95: 'P95 of scoped [SearchPerf][JsFrameSampler] window stallLongestMs values.',
    uiFloorMean:
      'Mean of per-run minimum floorFps across [SearchPerf][UiFrameSampler] window events scoped by shortcutSessionId (fallback: run start/complete nowMs bounds).',
    uiStallMaxMean:
      'Mean of per-run maximum stallLongestMs across scoped [SearchPerf][UiFrameSampler] window events.',
    uiStallP95: 'P95 of scoped [SearchPerf][UiFrameSampler] window stallLongestMs values.',
  },
  harnessRunId,
  harnessScenario,
  harnessSignatureRaw,
  harnessSignatureStable,
  harnessSignatureParts,
  environment,
  generatedAt: new Date().toISOString(),
  sourceLogPath: logPath,
  markerIntegrity,
  runCountExpected: expectedRuns,
  runCountStarted: markerIntegrity.startedRuns.length,
  runCountCompleted: markerIntegrity.completedRuns.length,
  runMetrics,
  floorMean: mean(jsFloorValues),
  floorMin: jsFloorValues.length ? Math.min(...jsFloorValues) : null,
  stallP95: percentile(jsAllStallValues, 95),
  stallMaxMean: mean(jsStallRunMaxValues),
  uiFloorMean: mean(uiFloorValues),
  uiFloorMin: uiFloorValues.length ? Math.min(...uiFloorValues) : null,
  uiStallP95: percentile(uiAllStallValues, 95),
  uiStallMaxMean: mean(uiStallRunMaxValues),
  catastrophic: {
    thresholdMs: CATASTROPHIC_FRAME_MS,
    runNumbers: toSortedNumericArray(jsCatastrophicRuns),
    runCount: jsCatastrophicRuns.size,
    windowCount: Object.values(stageHistogram.byStageCatastrophicWindowCount).reduce(
      (sum, count) => sum + count,
      0
    ),
  },
  uiCatastrophic: {
    thresholdMs: CATASTROPHIC_FRAME_MS,
    runNumbers: toSortedNumericArray(uiCatastrophicRuns),
    runCount: uiCatastrophicRuns.size,
    windowCount: Object.values(uiStageHistogram.byStageCatastrophicWindowCount).reduce(
      (sum, count) => sum + count,
      0
    ),
  },
  stageHistogram,
  uiStageHistogram,
  dominantFloorStage: dominantJsFloor.stage,
  dominantUiFloorStage: dominantUiFloor.stage,
};

const payload = JSON.stringify(report, null, 2);
if (outputPath) {
  fs.writeFileSync(outputPath, payload + '\n');
}
process.stdout.write(payload + '\n');
NODE
