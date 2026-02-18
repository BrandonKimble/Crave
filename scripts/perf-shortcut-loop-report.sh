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

const safeInteger = (value) =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

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

const parseNonNegativeNumberRecord = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const entries = Object.entries(value).filter(
    ([key, rawValue]) =>
      typeof key === 'string' &&
      key.trim().length > 0 &&
      typeof rawValue === 'number' &&
      Number.isFinite(rawValue) &&
      rawValue >= 0
  );
  return Object.fromEntries(entries.map(([key, rawValue]) => [key.trim(), rawValue]));
};

const parseAttributionTopContributors = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const contributor = safeString(entry.contributor);
      const totalMs = safeNonNegativeNumber(entry.totalMs);
      const sampleCount = safeNonNegativeInteger(entry.sampleCount);
      const meanMs = safeNonNegativeNumber(entry.meanMs);
      if (contributor == null) {
        return null;
      }
      return {
        contributor,
        totalMs,
        sampleCount,
        meanMs,
      };
    })
    .filter((entry) => entry != null);
};

const parseMapRuntimePayload = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value;
  return {
    fullCatalogScanCount: safeNonNegativeInteger(payload.fullCatalogScanCount),
    indexQueryDurationP95: safeNonNegativeNumber(payload.indexQueryDurationP95),
    readModelBuildSliceP95: safeNonNegativeNumber(payload.readModelBuildSliceP95),
    mapDiffApplySliceP95: safeNonNegativeNumber(payload.mapDiffApplySliceP95),
    indexQuerySampleCount: safeNonNegativeInteger(payload.indexQuerySampleCount),
    readModelBuildSampleCount: safeNonNegativeInteger(payload.readModelBuildSampleCount),
    mapDiffApplySampleCount: safeNonNegativeInteger(payload.mapDiffApplySampleCount),
    runtimeAttributionTotalsMs: parseNonNegativeNumberRecord(payload.runtimeAttributionTotalsMs),
    runtimeAttributionSampleCountByContributor: parseNonNegativeNumberRecord(
      payload.runtimeAttributionSampleCountByContributor
    ),
    runtimeAttributionTopContributors: parseAttributionTopContributors(
      payload.runtimeAttributionTopContributors
    ),
  };
};

const parseWindowOwnerTopComponents = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const componentId = safeString(entry.componentId);
      if (componentId == null) {
        return null;
      }
      return {
        componentId,
        overlapMs: safeNonNegativeNumber(entry.overlapMs),
        maxCommitSpanMs: safeNonNegativeNumber(entry.maxCommitSpanMs),
        spanCount: safeNonNegativeInteger(entry.spanCount),
      };
    })
    .filter((entry) => entry != null);
};

const parseWindowOwnerAttribution = (payload) => {
  const primaryComponentId = safeString(payload?.windowOwnerPrimaryComponentId);
  const primaryOverlapMs = safeNonNegativeNumber(payload?.windowOwnerPrimaryOverlapMs);
  const primaryMaxCommitSpanMs = safeNonNegativeNumber(payload?.windowOwnerPrimaryMaxCommitSpanMs);
  const primarySpanCount = safeNonNegativeInteger(payload?.windowOwnerPrimarySpanCount);
  const topComponents = parseWindowOwnerTopComponents(payload?.windowOwnerTopComponents);

  if (primaryComponentId == null && topComponents.length === 0) {
    return null;
  }
  return {
    primaryComponentId,
    primaryOverlapMs,
    primaryMaxCommitSpanMs,
    primarySpanCount,
    topComponents,
  };
};

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

const topStageContributors = (stageHistogram, limit = 3) => {
  const stallTotals = stageHistogram?.byStageStallLongestTotalMs ?? {};
  const windowCounts = stageHistogram?.byStageWindowCount ?? {};
  const catastrophicCounts = stageHistogram?.byStageCatastrophicWindowCount ?? {};
  const maxFrameTotals = stageHistogram?.byStageMaxFrameTotalMs ?? {};
  return Object.entries(stallTotals)
    .map(([stage, stallTotalMs]) => ({
      stage,
      stallLongestTotalMs: safeNonNegativeNumber(stallTotalMs),
      maxFrameTotalMs: safeNonNegativeNumber(maxFrameTotals[stage]),
      windowCount: safeNonNegativeInteger(windowCounts[stage]),
      catastrophicWindowCount: safeNonNegativeInteger(catastrophicCounts[stage]),
    }))
    .sort((left, right) => {
      if (right.stallLongestTotalMs !== left.stallLongestTotalMs) {
        return right.stallLongestTotalMs - left.stallLongestTotalMs;
      }
      if (right.catastrophicWindowCount !== left.catastrophicWindowCount) {
        return right.catastrophicWindowCount - left.catastrophicWindowCount;
      }
      return right.windowCount - left.windowCount;
    })
    .slice(0, limit);
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

const selectRunWindows = ({ windows, runNumber, startMs, endMs, startLine, endLine }) => {
  const scoped = windows.filter((evt) =>
    eventBelongsToRun({ evt, runNumber, startMs, endMs, startLine, endLine })
  );
  if (!scoped.length) {
    return scoped;
  }

  // Prefer explicitly session-tagged samples. This avoids attributing startup/background
  // sampler windows (often `shortcutSessionId: null`) into active run metrics.
  const tagged = scoped.filter((evt) => safeNumber(evt.data.shortcutSessionId) === runNumber);
  return tagged.length > 0 ? tagged : scoped;
};

const collectRunWindowMetrics = ({
  windows,
  runNumber,
  runStartMs,
  stageHistogram,
  allStallValues,
  catastrophicRuns,
  dominantFloor,
}) => {
  let runFloorMin = null;
  let runStallMax = null;
  let runCatastrophicWindowCount = 0;
  let runStallOver50WindowCount = 0;
  let runStallOver80WindowCount = 0;
  let firstStallOver50 = null;
  let worstWindow = null;

  for (const evt of windows) {
    const floorFps = safeNumber(evt.data.floorFps);
    const stallLongestMs = safeNumber(evt.data.stallLongestMs) ?? 0;
    const maxFrameMs = safeNumber(evt.data.maxFrameMs) ?? 0;
    const nowMs = safeNumber(evt.data.nowMs);
    const windowMs = safeNumber(evt.data.windowMs);
    const explicitElapsedMs = safeNumber(evt.data.shortcutElapsedMs);
    const elapsedMs =
      explicitElapsedMs != null
        ? explicitElapsedMs
        : nowMs != null && runStartMs != null
          ? nowMs - runStartMs
          : null;
    const stage = safeString(evt.data.shortcutStage) ?? 'none';
    const owner = parseWindowOwnerAttribution(evt.data);
    const windowSample = {
      durationMs: stallLongestMs,
      stage,
      elapsedMs,
      nowMs,
      windowMs,
      owner,
    };

    stageHistogram.byStageWindowCount[stage] = (stageHistogram.byStageWindowCount[stage] || 0) + 1;
    stageHistogram.byStageStallLongestTotalMs[stage] =
      (stageHistogram.byStageStallLongestTotalMs[stage] || 0) + stallLongestMs;
    stageHistogram.byStageMaxFrameTotalMs[stage] =
      (stageHistogram.byStageMaxFrameTotalMs[stage] || 0) + maxFrameMs;
    allStallValues.push(stallLongestMs);

    if (maxFrameMs > CATASTROPHIC_FRAME_MS) {
      runCatastrophicWindowCount += 1;
      stageHistogram.byStageCatastrophicWindowCount[stage] =
        (stageHistogram.byStageCatastrophicWindowCount[stage] || 0) + 1;
      catastrophicRuns.add(runNumber);
    }
    if (stallLongestMs > 50) {
      runStallOver50WindowCount += 1;
    }
    if (stallLongestMs > 80) {
      runStallOver80WindowCount += 1;
    }

    if (floorFps != null && (runFloorMin == null || floorFps < runFloorMin)) {
      runFloorMin = floorFps;
    }

    if (runStallMax == null || stallLongestMs > runStallMax) {
      runStallMax = stallLongestMs;
    }
    if (
      worstWindow == null ||
      stallLongestMs > worstWindow.durationMs ||
      (stallLongestMs === worstWindow.durationMs &&
        (nowMs ?? Number.NEGATIVE_INFINITY) > (worstWindow.nowMs ?? Number.NEGATIVE_INFINITY))
    ) {
      worstWindow = windowSample;
    }
    if (
      stallLongestMs > 50 &&
      (firstStallOver50 == null ||
        (nowMs ?? Number.POSITIVE_INFINITY) < (firstStallOver50.nowMs ?? Number.POSITIVE_INFINITY))
    ) {
      firstStallOver50 = windowSample;
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
    stallOver50WindowCount: runStallOver50WindowCount,
    stallOver80WindowCount: runStallOver80WindowCount,
    firstStallOver50,
    worstWindow,
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
const settleEvalEvents = scopedHarness.filter((evt) => evt.data.event === 'shortcut_harness_settle_eval');
const allowedSettleEvalSources = new Set(['shadow_subscription', 'settle_retry_timeout']);
const renderDrivenSettleEvalCount = settleEvalEvents.filter((evt) => {
  const source = safeString(evt.data.source);
  return source !== null && !allowedSettleEvalSources.has(source);
}).length;

const mechanismSignals = {
  queryMutationCoalescedCount: scopedHarness.filter(
    (evt) =>
      evt.data.event === 'query_mutation_coalesced' &&
      safeString(evt.data.mechanismSource) === 'runtime'
  ).length,
  profileIntentCancelledCount: scopedHarness.filter(
    (evt) =>
      evt.data.event === 'profile_intent_cancelled' &&
      safeString(evt.data.mechanismSource) === 'runtime'
  ).length,
  harnessSettleEvalCount: settleEvalEvents.filter(
    (evt) => safeString(evt.data.mechanismSource) === 'harness'
  ).length,
  observerRenderBumpCount: scopedHarness.filter(
    (evt) =>
      evt.data.event === 'shortcut_harness_observer_render_bump' &&
      safeString(evt.data.mechanismSource) === 'harness'
  ).length + renderDrivenSettleEvalCount,
};

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
const runMapRuntimeByNumber = new Map();
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
  const mapRuntime = parseMapRuntimePayload(evt.data.mapRuntime);
  if (mapRuntime != null) {
    runMapRuntimeByNumber.set(runNumber, mapRuntime);
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
  byStageStallLongestTotalMs: {},
  byStageMaxFrameTotalMs: {},
};
const uiStageHistogram = {
  byStageWindowCount: {},
  byStageCatastrophicWindowCount: {},
  byStageStallLongestTotalMs: {},
  byStageMaxFrameTotalMs: {},
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
        stallOver50WindowCount: null,
        stallOver80WindowCount: null,
        uiFloorMin: null,
        uiStallLongestMax: null,
        uiCatastrophicWindowCount: 0,
        firstOver50: null,
        worstWindow: null,
        durationMs: runDurationByNumber.get(runNumber) ?? null,
        finalStage: runFinalStageByNumber.get(runNumber) ?? null,
        mapRuntime: runMapRuntimeByNumber.get(runNumber) ?? null,
      });
      continue;
    }

  const jsWindows = selectRunWindows({
    windows: jsWindowEvents,
    runNumber,
    startMs,
    endMs,
    startLine,
    endLine,
  });
  const uiWindows = selectRunWindows({
    windows: uiWindowEvents,
    runNumber,
    startMs,
    endMs,
    startLine,
    endLine,
  });

  const jsRunMetrics = collectRunWindowMetrics({
    windows: jsWindows,
    runNumber,
    runStartMs: startMs,
    stageHistogram,
    allStallValues: jsAllStallValues,
    catastrophicRuns: jsCatastrophicRuns,
    dominantFloor: dominantJsFloor,
  });

  const uiRunMetrics = collectRunWindowMetrics({
    windows: uiWindows,
    runNumber,
    runStartMs: startMs,
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
      stallOver50WindowCount: jsRunMetrics.stallOver50WindowCount,
      stallOver80WindowCount: jsRunMetrics.stallOver80WindowCount,
      uiFloorMin: uiRunMetrics.floorMin,
      uiStallLongestMax: uiRunMetrics.stallLongestMax,
      uiCatastrophicWindowCount: uiRunMetrics.catastrophicWindowCount,
      firstOver50: jsRunMetrics.firstStallOver50,
      worstWindow: jsRunMetrics.worstWindow,
      durationMs: runDurationByNumber.get(runNumber) ?? null,
      finalStage: runFinalStageByNumber.get(runNumber) ?? null,
      mapRuntime: runMapRuntimeByNumber.get(runNumber) ?? null,
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
const mapIndexQueryP95Values = runMetrics
  .map((metric) => safeNumber(metric?.mapRuntime?.indexQueryDurationP95))
  .filter((value) => value != null);
const mapReadModelBuildP95Values = runMetrics
  .map((metric) => safeNumber(metric?.mapRuntime?.readModelBuildSliceP95))
  .filter((value) => value != null);
const mapDiffApplyP95Values = runMetrics
  .map((metric) => safeNumber(metric?.mapRuntime?.mapDiffApplySliceP95))
  .filter((value) => value != null);
const mapFullCatalogScanCount = runMetrics.reduce(
  (sum, metric) => sum + (safeInteger(metric?.mapRuntime?.fullCatalogScanCount) ?? 0),
  0
);
const mapIndexQuerySampleCount = runMetrics.reduce(
  (sum, metric) => sum + (safeInteger(metric?.mapRuntime?.indexQuerySampleCount) ?? 0),
  0
);
const mapReadModelBuildSampleCount = runMetrics.reduce(
  (sum, metric) => sum + (safeInteger(metric?.mapRuntime?.readModelBuildSampleCount) ?? 0),
  0
);
const mapDiffApplySampleCount = runMetrics.reduce(
  (sum, metric) => sum + (safeInteger(metric?.mapRuntime?.mapDiffApplySampleCount) ?? 0),
  0
);
const mapRuntimeAttributionTotalsMs = {};
const mapRuntimeAttributionSampleCountByContributor = {};
for (const metric of runMetrics) {
  const totals = metric?.mapRuntime?.runtimeAttributionTotalsMs ?? {};
  const sampleCounts = metric?.mapRuntime?.runtimeAttributionSampleCountByContributor ?? {};
  for (const [contributor, totalMs] of Object.entries(totals)) {
    const value = safeNonNegativeNumber(totalMs);
    if (value == null || value <= 0) {
      continue;
    }
    mapRuntimeAttributionTotalsMs[contributor] =
      (mapRuntimeAttributionTotalsMs[contributor] ?? 0) + value;
  }
  for (const [contributor, sampleCount] of Object.entries(sampleCounts)) {
    const value = safeNonNegativeNumber(sampleCount);
    if (value == null || value <= 0) {
      continue;
    }
    mapRuntimeAttributionSampleCountByContributor[contributor] =
      (mapRuntimeAttributionSampleCountByContributor[contributor] ?? 0) + value;
  }
}
const runtimeTopContributorsByTotalMs = Object.entries(mapRuntimeAttributionTotalsMs)
  .map(([contributor, totalMs]) => {
    const sampleCount = safeNonNegativeNumber(
      mapRuntimeAttributionSampleCountByContributor[contributor] ?? 0
    );
    return {
      contributor,
      totalMs: safeNonNegativeNumber(totalMs),
      sampleCount: sampleCount ?? 0,
      meanMs: sampleCount && sampleCount > 0 ? totalMs / sampleCount : 0,
    };
  })
  .sort((left, right) => right.totalMs - left.totalMs)
  .slice(0, 5);
const jsTopStageContributors = topStageContributors(stageHistogram, 3);
const uiTopStageContributors = topStageContributors(uiStageHistogram, 3);
const firstOver50ByRun = runMetrics.map((metric) => ({
  runNumber: metric.runNumber,
  firstOver50: metric.firstOver50 ?? null,
}));
const worstWindowByRun = runMetrics.map((metric) => ({
  runNumber: metric.runNumber,
  worstWindow: metric.worstWindow ?? null,
}));

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
    firstOver50ByRun:
      'Per-run earliest JS sampler window where stallLongestMs exceeded 50ms, with stage/elapsedMs and optional owner attribution.',
    worstWindowByRun:
      'Per-run maximum JS sampler window with stage/elapsedMs and optional owner attribution.',
    mapRuntime:
      'Optional per-run map runtime budget snapshot emitted in shortcut_loop_run_complete events.',
    mechanismSignals:
      'Optional harness instrumentation counters emitted via [SearchPerf][Harness] events for runtime mechanisms (coalescing/cancellation/observer behavior).',
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
  firstOver50ByRun,
  worstWindowByRun,
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
  stageAttribution: {
    jsTopByStallMs: jsTopStageContributors,
    uiTopByStallMs: uiTopStageContributors,
    runtimeTopByTotalMs: runtimeTopContributorsByTotalMs,
  },
  dominantFloorStage: dominantJsFloor.stage,
  dominantUiFloorStage: dominantUiFloor.stage,
  mapRuntime: {
    fullCatalogScanCount: mapFullCatalogScanCount,
    indexQueryDurationP95: percentile(mapIndexQueryP95Values, 95),
    readModelBuildSliceP95: percentile(mapReadModelBuildP95Values, 95),
    mapDiffApplySliceP95: percentile(mapDiffApplyP95Values, 95),
    indexQuerySampleCount: mapIndexQuerySampleCount,
    readModelBuildSampleCount: mapReadModelBuildSampleCount,
    mapDiffApplySampleCount: mapDiffApplySampleCount,
    runtimeAttributionTotalsMs: mapRuntimeAttributionTotalsMs,
    runtimeAttributionSampleCountByContributor: mapRuntimeAttributionSampleCountByContributor,
    runtimeTopContributorsByTotalMs,
  },
  mechanismSignals,
};

const payload = JSON.stringify(report, null, 2);
if (outputPath) {
  fs.writeFileSync(outputPath, payload + '\n');
}
process.stdout.write(payload + '\n');
NODE
