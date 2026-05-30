#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const usage = () => {
  console.error(
    'Usage: scripts/perf-scenario-parity-contracts.js <perf_scenario_report.json> [--output <path>]'
  );
};

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(0);
}

const reportPath = args[0];
let outputPathOverride = null;

for (let index = 1; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--output') {
    outputPathOverride = args[index + 1] ?? null;
    index += 1;
    continue;
  }
  console.error(`Unknown argument: ${arg}`);
  usage();
  process.exit(2);
}

if (!reportPath) {
  usage();
  process.exit(2);
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const resolvedReportPath = path.resolve(reportPath);
const report = readJson(resolvedReportPath);
const repoRoot = path.resolve(__dirname, '..');

const deriveDefaultOutputPath = (inputReportPath) => {
  const directory = path.dirname(inputReportPath);
  const extension = path.extname(inputReportPath) || '.json';
  const basename = path.basename(inputReportPath, extension);
  let suffix = basename;
  if (suffix.startsWith('perf-scenario-scenario-')) {
    suffix = suffix.slice('perf-scenario-scenario-'.length);
  } else if (suffix.startsWith('perf-scenario-')) {
    suffix = suffix.slice('perf-scenario-'.length);
  }
  return path.join(directory, `perf-scenario-parity-contracts-${suffix}.json`);
};

const outputPath = path.resolve(outputPathOverride ?? deriveDefaultOutputPath(resolvedReportPath));

const readVisualReadinessEventsFromLog = (logPath) => {
  if (!logPath || !fs.existsSync(logPath)) {
    return report.visualReadiness?.events ?? [];
  }
  const content = fs.readFileSync(logPath, 'utf8');
  const events = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/\[SearchPerf\]\[VisualReadiness\]\s+(\{.*\})/);
    if (!match) {
      return;
    }
    try {
      events.push({
        line: index + 1,
        ...JSON.parse(match[1]),
      });
    } catch {
      // Ignore malformed partial console lines from simulator logging.
    }
  });
  return events;
};

const readSamplerEventsFromLog = (logPath) => {
  if (!logPath || !fs.existsSync(logPath)) {
    return [];
  }
  const content = fs.readFileSync(logPath, 'utf8');
  const events = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(
      /\[SearchPerf\]\[(JsFrameSampler|JsTaskLatencySampler|UiFrameSampler)\]\s+(\{.*\})/
    );
    if (!match) {
      return;
    }
    try {
      events.push({
        line: index + 1,
        channel: match[1],
        ...JSON.parse(match[2]),
      });
    } catch {
      // Ignore malformed partial console lines from simulator logging.
    }
  });
  return events;
};

const readWorkSpanEventsFromLog = (logPath) => {
  if (!logPath || !fs.existsSync(logPath)) {
    return [];
  }
  const content = fs.readFileSync(logPath, 'utf8');
  const events = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/\[SearchPerf\]\[WorkSpan\]\s+(\{.*\})/);
    if (!match) {
      return;
    }
    try {
      events.push({
        line: index + 1,
        ...JSON.parse(match[1]),
      });
    } catch {
      // Ignore malformed partial console lines from simulator logging.
    }
  });
  return events;
};

const visualEventsFromLog = readVisualReadinessEventsFromLog(report.logPath);
const samplerEventsFromLog = readSamplerEventsFromLog(report.logPath);
const workSpanEventsFromLog = readWorkSpanEventsFromLog(report.logPath);
const scenarioEvents = Array.isArray(report.scenarioEvents) ? report.scenarioEvents : [];
const shouldScopeToMeasuredRepeatLoop =
  (report.scenarioName ?? '').includes('search_submit_dismiss_repeat') &&
  report.measuredRepeatLoop?.range != null;
const measuredRepeatLoopRange = report.measuredRepeatLoop?.range ?? null;
const visualEvents = shouldScopeToMeasuredRepeatLoop
  ? visualEventsFromLog.filter((event) => {
      if (typeof event.emittedAtMs === 'number') {
        return (
          event.emittedAtMs >= measuredRepeatLoopRange.startMs &&
          event.emittedAtMs <= measuredRepeatLoopRange.endMs
        );
      }
      return (
        typeof event.line === 'number' &&
        event.line > measuredRepeatLoopRange.startLine &&
        event.line < measuredRepeatLoopRange.endLine
      );
    })
  : visualEventsFromLog;
const failures = [];
const evidence = [];
const scenarioName = report.scenarioName ?? '';
const scenarioIsMapRuntimeOnly =
  scenarioName.includes('search_map_lod_pan_zoom') ||
  scenarioName.includes('search_pin_selection_profile_open');
const scenarioExpectsResultsDismiss =
  scenarioName.includes('search_submit_visual_parity') ||
  scenarioName.includes('search_submit_dismiss');

const fail = (message) => {
  failures.push(message);
};

const pass = (message) => {
  evidence.push(message);
};

const expandQuietAggregateSamples = (events) =>
  events.flatMap((event) => {
    if (
      event.event !== 'quiet_measured_loop_attribution_aggregate' ||
      !Array.isArray(event.samples)
    ) {
      return [event];
    }
    return event.samples.map((sample) => ({
      ...sample,
      line: sample.line ?? event.line,
      aggregateLine: event.line,
      quietAggregateSourceEvent: event.sourceEvent ?? null,
    }));
  });

const expandedVisualEvents = expandQuietAggregateSamples(visualEvents);
const byEvent = (eventName) => visualEvents.filter((event) => event.event === eventName);
const byExpandedEvent = (eventName) =>
  expandedVisualEvents.filter((event) => event.event === eventName);
const byScenarioEvent = (eventName) => scenarioEvents.filter((event) => event.event === eventName);
const isLineBetween = (event, startLine, endLine) => event.line > startLine && event.line < endLine;
const retainedSubmitReplayEvents = byEvent('retained_submit_replay_contract');
const retainedDismissPrewarmEvents = byEvent('retained_dismiss_prewarm_contract');
const numeric = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};
const isNondecreasingScreenYVisualOrder = (visualOrder) => {
  if (!Array.isArray(visualOrder) || visualOrder.length <= 1) {
    return true;
  }
  let previousY = null;
  for (const entry of visualOrder) {
    const screenY = numeric(entry?.screenY);
    if (screenY == null) {
      return false;
    }
    if (previousY != null && screenY + Number.EPSILON < previousY) {
      return false;
    }
    previousY = screenY;
  }
  return true;
};
const sourceOperationMetric = (signature, key) => {
  if (typeof signature !== 'string' || signature.length === 0) {
    return null;
  }
  const part = signature.split('|').find((entry) => entry.startsWith(`${key}:`));
  if (!part) {
    return null;
  }
  return numeric(part.slice(key.length + 1));
};
const nativeMapApplyContextBuckets = () => {
  const summaries = report.nativeMapApplySummary?.events ?? [];
  return summaries.flatMap((event) =>
    Array.isArray(event.summary?.topContextBuckets)
      ? event.summary.topContextBuckets.map((bucket) => ({
          line: event.line,
          reason: event.reason,
          ...bucket,
        }))
      : []
  );
};
const nativeMapApplyBucketsFromSummary = (summary) => {
  const flattened = [
    ...(summary?.topBucketsByTotalMs ?? []),
    ...(summary?.topBucketsByMaxMs ?? []),
    ...(summary?.events ?? []).flatMap((event) =>
      Array.isArray(event.summary?.topBuckets)
        ? event.summary.topBuckets.map((bucket) => ({
            line: event.line,
            reason: event.reason,
            ...bucket,
          }))
        : []
    ),
  ];
  const seen = new Set();
  return flattened.filter((bucket) => {
    const key = JSON.stringify([
      bucket.line ?? null,
      bucket.reason ?? null,
      bucket.phase ?? null,
      bucket.section ?? null,
      bucket.source ?? null,
      bucket.totalMs ?? null,
      bucket.count ?? null,
      bucket.operationCount ?? null,
      bucket.maxMs ?? null,
    ]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
const nativeMapApplyContextBucketsFromSummary = (summary) => {
  const flattened = [
    ...(summary?.topContextBucketsByTotalMs ?? []),
    ...(summary?.topContextBucketsByMaxMs ?? []),
    ...(summary?.events ?? []).flatMap((event) =>
      Array.isArray(event.summary?.topContextBuckets)
        ? event.summary.topContextBuckets.map((bucket) => ({
            line: event.line,
            reason: event.reason,
            ...bucket,
          }))
        : []
    ),
  ];
  const seen = new Set();
  return flattened.filter((bucket) => {
    const key = JSON.stringify([
      bucket.line ?? null,
      bucket.reason ?? null,
      bucket.phase ?? null,
      bucket.transactionKind ?? null,
      bucket.sourceFamilySignature ?? null,
      bucket.sourceOperationSignature ?? null,
      bucket.totalMs ?? null,
      bucket.count ?? null,
      bucket.maxMs ?? null,
    ]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};
const candidateLabelCountMatchesPins = (event) => {
  const pinCount = numeric(event.pinCount) ?? 0;
  const labelCount = numeric(event.labelCount) ?? 0;
  if (pinCount <= 0) {
    return labelCount === 0;
  }
  const perPin = numeric(event.labelPerPinCandidateCount);
  return perPin === 4 || labelCount === pinCount * 4 || labelCount >= pinCount * 4;
};
const pinCountFromClassification = (event) =>
  numeric(event.pinRestaurantCount) ?? numeric(event.pinVisualIdentityCount) ?? 0;
const dotCountFromClassification = (event) =>
  numeric(event.dotRestaurantCount) ?? numeric(event.dotVisualIdentityCount) ?? 0;
const pinBudgetFromClassification = (event) => numeric(event.fullPinBudget) ?? 30;
const selectedPinCountFromClassification = (event) =>
  numeric(event.selectedPinVisualIdentityCount) ?? numeric(event.selectedPinCount) ?? 0;
const normalPinCountFromClassification = (event) =>
  numeric(event.normalPinVisualIdentityCount) ??
  numeric(event.normalPinCount) ??
  Math.max(0, pinCountFromClassification(event) - selectedPinCountFromClassification(event));
const normalPinRankMismatchFromClassification = (event) => {
  const explicitMismatchCount = numeric(event.normalPinRankMismatchCount);
  if (explicitMismatchCount != null) {
    return explicitMismatchCount;
  }
  if (
    typeof event.expectedNormalPinFingerprint === 'string' &&
    typeof event.actualNormalPinFingerprint === 'string' &&
    event.expectedNormalPinFingerprint !== event.actualNormalPinFingerprint
  ) {
    return 1;
  }
  return 0;
};
const parseRankSignatureSlotMap = (signature) => {
  const entries = Array.isArray(signature) ? signature : [];
  const map = new Map();
  for (const entry of entries) {
    const text = String(entry);
    const slotMatch = text.match(/#z([^#]+)$/);
    if (!slotMatch) {
      continue;
    }
    const markerKey = text.split('#r')[0];
    const slot = Number(slotMatch[1]);
    if (!markerKey || !Number.isFinite(slot)) {
      continue;
    }
    map.set(markerKey, slot);
  }
  return map;
};
const findStableSlotOwnershipRegression = (events) => {
  let previous = null;
  for (const event of events) {
    const current = parseRankSignatureSlotMap(event.actualNormalPinRankSignature);
    if (current.size === 0) {
      continue;
    }
    if (previous != null) {
      for (const [markerKey, previousSlot] of previous.map.entries()) {
        if (!current.has(markerKey)) {
          continue;
        }
        const currentSlot = current.get(markerKey);
        if (currentSlot !== previousSlot) {
          return {
            line: event.line,
            markerKey,
            previousSlot,
            currentSlot,
            previousLine: previous.line,
          };
        }
      }
    }
    previous = {
      line: event.line,
      map: current,
    };
  }
  return null;
};
const selectedPinAllowanceFromBridgeSlice = (event) =>
  numeric(event.markerRoleSelectedPinnedCount) ?? 0;
const normalPinCountFromBridgeSlice = (event) =>
  numeric(event.markerRoleNormalPinnedCount) ??
  Math.max(0, (numeric(event.markerRolePinnedCount) ?? 0) - selectedPinAllowanceFromBridgeSlice(event));
const unclassifiedCountFromClassification = (event) =>
  numeric(event.unclassifiedCandidateRestaurantIdCount) ??
  numeric(event.unclassifiedCandidateVisualIdentityCount) ??
  0;
const slotTopologyEvents = byEvent('search_map_slot_topology_contract');
const badSlotTopologyEvent = slotTopologyEvents.find((event) => {
  const pinStackSlotCount = numeric(event.pinStackSlotCount);
  if (pinStackSlotCount == null) {
    return true;
  }
  return (
    numeric(event.normalSlotCount) !== 30 ||
    numeric(event.pinSlotSourceIdCount) !== pinStackSlotCount ||
    numeric(event.pinInteractionLayerIdCount) !== pinStackSlotCount ||
    numeric(event.labelVisualLayerIdCount) !== pinStackSlotCount * 16 ||
    numeric(event.labelCollisionLayerIdCount) !== 3
  );
});
const MAX_HANDOFF_RELEASE_DELAY_MS = 20;
const MAX_MEASURED_REPEAT_VISUAL_READINESS_EVENTS = 240;
const MAX_MEASURED_REPEAT_NAV_LOCKSTEP_EVENTS = 18;
const MAX_MEASURED_REPEAT_DISMISS_MOTION_EVENTS = 15;
const MAX_ROUTE_WRAPPER_RESULTS_MATERIALIZATION_COMMIT_SPAN_MS = 16;
const MAX_ROUTE_WRAPPER_RESULTS_HYDRATION_COMMIT_SPAN_MS = 24;
const MAX_RETAINED_REPLAY_CHROME_WAKE_COUNT = 4;
const MAX_RETAINED_REPLAY_ROUTE_POST_VISUAL_COMMIT_SPAN_MS = 1;
const MAX_VISUAL_SYNC_ROUTE_WAKE_ACTUAL_MS = 20;
const MAX_VISUAL_SYNC_ROUTE_WAKE_COMMIT_SPAN_MS = 25;
const MAX_REDRAW_COMMITTED_ROUTE_WAKE_ACTUAL_MS = 8;
const MAX_REDRAW_COMMITTED_ROUTE_WAKE_COMMIT_SPAN_MS = 12;
const MIN_MEASURED_REPEAT_FLOOR_FPS = 55;
const MAX_PRESENTATION_OPACITY_OPERATIONS_PER_APPLY = 6;
const VISUAL_SYNC_HANDOFF_PHASES = new Set([
  'body_admitting',
  'redraw_committed',
  'markers_ready',
  'hydration_ready',
  'chrome_ready',
]);
const RETAINED_REPLAY_ROUTE_SNAPSHOT_PROFILER_IDS = new Set([
  'SearchRouteOverlayHost',
  'SearchOverlayRouteSheetSurfaceHost',
  'SearchOverlayRouteSheetFrameSurfaceHost',
  'SearchRouteSheetFrameHost',
  'SearchRouteSceneStackBottomSheetSurfaceHost',
]);
const ROUTE_WRAPPER_PROFILER_IDS = new Set([
  'SearchRouteOverlayHost',
  'SearchOverlayRouteSheetSurfaceHost',
  'SearchOverlayRouteSheetFrameSurfaceHost',
  'SearchRouteSheetFrameHost',
  'SearchRouteSceneStackBottomSheetSurfaceHost',
  'BottomSheetSceneStackHost',
  'SearchSceneStackBodyDisplayTarget:search',
]);
const VISUAL_SYNC_ROUTE_WAKE_PROFILER_IDS = new Set([
  'SearchRouteOverlayHost',
  'SearchOverlayRouteSheetSurfaceHost',
  'SearchOverlayRouteSheetFrameSurfaceHost',
  'SearchRouteSheetFrameHost',
  'SearchRouteSceneStackBottomSheetSurfaceHost',
  'BottomSheetSceneStackHost',
  'ActiveSceneStackHostLayers',
  'ActiveSceneStackSurfaceHost',
  'SearchSceneStackBodyDisplayTarget:search',
  'SceneStackBodyFrameHost:search',
  'SceneStackBodyFrame:search',
  'SearchResultsPersistentBodyHost',
  'SearchMountedSceneBody',
]);
const eventTimeMs = (event) => {
  if (!event) {
    return null;
  }
  const value = [
    event.emittedAtMs,
    event.startedAtMs,
    event.readyAtMs,
    event.settledAtMs,
    event.releasedAtMs,
  ]
    .map(Number)
    .find(Number.isFinite);
  return Number.isFinite(value) ? value : null;
};
const eventDeltaMs = (left, right) => {
  const leftMs = eventTimeMs(left);
  const rightMs = eventTimeMs(right);
  return leftMs == null || rightMs == null ? null : Math.abs(rightMs - leftMs);
};
const isSameExecutionBatch = (left, right) =>
  left != null && right != null && left.executionBatchId === right.executionBatchId;
const readLogLines = () => {
  if (!report.logPath || !fs.existsSync(report.logPath)) {
    return [];
  }
  return fs.readFileSync(report.logPath, 'utf8').split(/\r?\n/);
};
const hasPreparedCardsReadySignal = (event) =>
  event.listFirstPaintReady === true ||
  (event.resultsSnapshotKey != null &&
    event.mountedFirstVisibleRowsReadyKey === event.resultsSnapshotKey &&
    (event.mountedFirstVisibleRowsActiveCount ?? 0) > 0) ||
  (event.resultsSnapshotKey != null &&
    (event.mountedFirstVisibleRowsActiveCount ?? 0) > 0 &&
    event.hydratedResultsKey === event.resultsSnapshotKey &&
    event.isResultsHydrationSettled === true &&
    event.shouldHydrateResultsForRender === false);

const isInMeasuredRepeatLoop = (event) => {
  if (!measuredRepeatLoopRange) {
    return false;
  }
  const emittedAtMs = numeric(event.emittedAtMs);
  if (emittedAtMs != null) {
    return (
      emittedAtMs >= measuredRepeatLoopRange.startMs && emittedAtMs <= measuredRepeatLoopRange.endMs
    );
  }
  return (
    typeof event.line === 'number' &&
    event.line > measuredRepeatLoopRange.startLine &&
    event.line < measuredRepeatLoopRange.endLine
  );
};

const isQuietMeasuredRepeatLoopSamplerEvent = (event) => {
  if (!measuredRepeatLoopRange) {
    return false;
  }
  if (event.quietBuffered !== true || event.flushReason !== 'measured_repeat_loop_end') {
    return false;
  }
  const nowMs = numeric(event.nowMs);
  const maxLagStartedAtMs = numeric(event.maxLagStartedAtMs);
  const maxLagEndedAtMs = numeric(event.maxLagEndedAtMs);
  return [nowMs, maxLagStartedAtMs, maxLagEndedAtMs].some(
    (value) =>
      value != null &&
      value >= measuredRepeatLoopRange.startMs &&
      value <= measuredRepeatLoopRange.endMs
  );
};

const isMeasuredRepeatLoopSamplerEvent = (event) =>
  isInMeasuredRepeatLoop(event) || isQuietMeasuredRepeatLoopSamplerEvent(event);

const measuredRepeatLoopSamplerEvents = shouldScopeToMeasuredRepeatLoop
  ? samplerEventsFromLog.filter(isMeasuredRepeatLoopSamplerEvent)
  : [];

const measuredRepeatSamplerFallbackWindows = (channel, reportKey) =>
  samplerEventsFromLog.length > 0 || !shouldScopeToMeasuredRepeatLoop
    ? []
    : (report.samplers?.[reportKey]?.worstWindows ?? [])
        .filter(isMeasuredRepeatLoopSamplerEvent)
        .map((event) => ({ ...event, channel }));

const measuredRepeatLoopSamplerWindows = [
  ...measuredRepeatLoopSamplerEvents.filter(
    (event) => event.event === 'window' || event.event === 'task_window'
  ),
  ...measuredRepeatSamplerFallbackWindows('JsFrameSampler', 'jsFrame'),
  ...measuredRepeatSamplerFallbackWindows('JsTaskLatencySampler', 'jsTaskLatency'),
  ...measuredRepeatSamplerFallbackWindows('UiFrameSampler', 'uiFrame'),
];

const measuredRepeatLoopSamplerStalls = measuredRepeatLoopSamplerEvents.filter(
  (event) => event.event === 'stall' || event.event === 'task_stall'
);

if (scenarioName.includes('search_submit_dismiss_repeat')) {
  const measuredSamplerStallCount =
    measuredRepeatLoopSamplerStalls.length +
    measuredRepeatLoopSamplerWindows.reduce(
      (total, event) => total + Math.max(0, numeric(event.stallCount) ?? 0),
      0
    );
  const measuredFloorFpsFailure = measuredRepeatLoopSamplerWindows.find((event) => {
    const floorFps = numeric(event.floorFps);
    return floorFps != null && floorFps < MIN_MEASURED_REPEAT_FLOOR_FPS;
  });
  if (measuredSamplerStallCount > 0) {
    const sample =
      measuredRepeatLoopSamplerStalls[0] ??
      measuredRepeatLoopSamplerWindows.find((event) => (numeric(event.stallCount) ?? 0) > 0);
    fail(
      `measured submit/dismiss loop has JS/task/UI sampler stalls: count=${measuredSamplerStallCount}, first=${JSON.stringify(
        {
          channel: sample?.channel ?? null,
          event: sample?.event ?? null,
          line: sample?.line ?? null,
          nowMs: sample?.nowMs ?? null,
          emittedAtMs: sample?.emittedAtMs ?? null,
          frameMs: sample?.frameMs ?? sample?.maxFrameMs ?? null,
          lagMs: sample?.lagMs ?? sample?.maxLagMs ?? null,
          stallCount: sample?.stallCount ?? null,
          quietBuffered: sample?.quietBuffered ?? null,
          flushReason: sample?.flushReason ?? null,
        }
      )}`
    );
  } else {
    pass('measured submit/dismiss loop has no JS/task/UI sampler stalls');
  }
  if (measuredFloorFpsFailure) {
    fail(
      `measured submit/dismiss loop floor FPS below target: channel=${measuredFloorFpsFailure.channel}, line=${measuredFloorFpsFailure.line}, floorFps=${measuredFloorFpsFailure.floorFps} < ${MIN_MEASURED_REPEAT_FLOOR_FPS}`
    );
  } else {
    pass(`measured submit/dismiss loop floor FPS stays >= ${MIN_MEASURED_REPEAT_FLOOR_FPS}`);
  }
  const measuredNativeMapApplySummary = report.measuredRepeatLoop?.nativeMapApplySummary ?? null;
  if ((numeric(measuredNativeMapApplySummary?.eventCount) ?? 0) <= 0) {
    fail(
      'measured submit/dismiss loop is missing measured_repeat_loop_end native map apply summary'
    );
  } else {
    pass('measured submit/dismiss loop includes measured_repeat_loop_end native map apply summary');
    const nativePresentationBuckets = [
      ...(measuredNativeMapApplySummary.topBucketsByTotalMs ?? []),
      ...(measuredNativeMapApplySummary.topBucketsByMaxMs ?? []),
    ].filter((bucket) => bucket.section === 'presentation_opacity.apply');
    const badPresentationOpacityBucket = nativePresentationBuckets.find((bucket) => {
      const operationCount = numeric(bucket.operationCount);
      const count = numeric(bucket.count) ?? 1;
      if (operationCount == null || count <= 0) {
        return false;
      }
      return operationCount / count > MAX_PRESENTATION_OPACITY_OPERATIONS_PER_APPLY;
    });
    if (badPresentationOpacityBucket) {
      fail(
        `presentation_opacity.apply exceeds operation budget: source=${badPresentationOpacityBucket.source}, phase=${badPresentationOpacityBucket.phase}, operationCount=${badPresentationOpacityBucket.operationCount}, count=${badPresentationOpacityBucket.count}, maxOpsPerApply=${MAX_PRESENTATION_OPACITY_OPERATIONS_PER_APPLY}`
      );
    } else {
      pass(
        `presentation_opacity.apply stays <= ${MAX_PRESENTATION_OPACITY_OPERATIONS_PER_APPLY} operations per apply`
      );
    }
  }
  const measuredWorkSpanOwners = report.measuredRepeatLoop?.workSpans?.byOwner ?? [];
  const nativePresentationErrorOwner = measuredWorkSpanOwners.find(
    (owner) =>
      (owner.key === 'search_map_native_presentation_event_inner' ||
        owner.key === 'search_map_native_event_delivery') &&
      (owner.samplePaths ?? []).some((samplePath) => String(samplePath).startsWith('error:'))
  );
  if (nativePresentationErrorOwner) {
    fail(
      `measured submit/dismiss loop has native presentation error events: owner=${
        nativePresentationErrorOwner.key
      }, samplePaths=${JSON.stringify(nativePresentationErrorOwner.samplePaths ?? [])}`
    );
  } else {
    pass('measured submit/dismiss loop has no native presentation error events');
  }
  const surfaceAuthorityNotifyOwner = measuredWorkSpanOwners.find(
    (owner) => owner.key === 'results_presentation_surface_authority_notify'
  );
  const surfaceAuthorityHydrationNotifyPath = (surfaceAuthorityNotifyOwner?.samplePaths ?? []).find(
    (samplePath) => String(samplePath).includes('shouldHydrateResultsForRender')
  );
  if (surfaceAuthorityHydrationNotifyPath) {
    fail(
      `shouldHydrateResultsForRender still fans out through surface authority during measured repeat submit/dismiss: ${surfaceAuthorityHydrationNotifyPath}`
    );
  } else {
    pass(
      'measured repeat submit/dismiss has no shouldHydrateResultsForRender surface-authority fanout'
    );
  }
  const routeHydrationAdmissionNotifyPath = (surfaceAuthorityNotifyOwner?.samplePaths ?? []).find(
    (samplePath) => {
      const path = String(samplePath);
      return (
        path.startsWith('search_response_owner_results_commit:') &&
        path.includes('shouldHydrateResultsForRender')
      );
    }
  );
  if (routeHydrationAdmissionNotifyPath) {
    fail(
      `shouldHydrateResultsForRender still notifies surface authority listeners during measured repeat submit/dismiss: ${routeHydrationAdmissionNotifyPath}`
    );
  } else {
    pass(
      'measured repeat submit/dismiss does not publish shouldHydrateResultsForRender from response owner'
    );
  }
  const measuredLogLines = readLogLines();
  const broadRootHydrationCommitLine = measuredLogLines.find((line, index) => {
    const lineNumber = index + 1;
    return (
      line.includes('[SearchPerf][RuntimeMechanism]') &&
      line.includes('"label":"search_root_state_commit"') &&
      line.includes('shouldHydrateResultsForRender') &&
      (measuredRepeatLoopRange == null ||
        (lineNumber > measuredRepeatLoopRange.startLine &&
          lineNumber < measuredRepeatLoopRange.endLine) ||
        line.includes('"quietBuffered":true'))
    );
  });
  if (broadRootHydrationCommitLine) {
    fail(
      'measured repeat submit/dismiss still records search_root_state_commit changedKeys for shouldHydrateResultsForRender'
    );
  } else {
    pass(
      'measured repeat submit/dismiss has no root route commit for shouldHydrateResultsForRender'
    );
  }
  const nativeSheetMaskOwner = measuredWorkSpanOwners.find(
    (owner) => owner.key === 'native_sheet_nav_exclusion_mask'
  );
  if (!nativeSheetMaskOwner) {
    fail('measured submit/dismiss loop is missing native sheet mask timing aggregate');
  } else if (
    !(nativeSheetMaskOwner.samplePaths ?? []).some(
      (samplePath) => samplePath === 'translated_static_path_shared_nav_translate_y'
    )
  ) {
    fail(
      `native sheet mask timing aggregate did not use transform-only path strategy: samplePaths=${JSON.stringify(
        nativeSheetMaskOwner.samplePaths ?? []
      )}`
    );
  } else {
    pass(
      'measured submit/dismiss loop includes shared-nav-translate native sheet mask timing aggregate'
    );
  }
  const stalledDismissNavSample = byEvent('nav_cutout_lockstep_contract').find((event) => {
    if (
      event.isResultsClosing !== true ||
      event.navMotionTarget !== 'show' ||
      event.resultSheetSlidingDown === false ||
      event.searchSurfacePhase !== 'results_dismissing' ||
      event.searchSurfaceBottomBandOwner !== 'results_header'
    ) {
      return false;
    }
    const navTranslateY = numeric(event.navTranslateY);
    const hiddenTranslateY = numeric(event.navBarHiddenTranslateY);
    const progress = numeric(event.navBarCutoutProgress);
    return (
      navTranslateY != null &&
      hiddenTranslateY != null &&
      navTranslateY >= hiddenTranslateY - 0.5 &&
      (progress ?? 0) <= 0.001
    );
  });
  if (stalledDismissNavSample) {
    fail(
      `dismiss nav return did not start while results sheet was sliding: line=${stalledDismissNavSample.line}, navTranslateY=${stalledDismissNavSample.navTranslateY}, hidden=${stalledDismissNavSample.navBarHiddenTranslateY}, progress=${stalledDismissNavSample.navBarCutoutProgress}`
    );
  } else {
    pass('dismiss nav return starts before/with the sliding results sheet');
  }
  const navLockstepEventCount = byEvent('nav_cutout_lockstep_contract').length;
  const dismissMotionEventCount = byEvent('search_dismiss_motion_plane_contract').length;
  const retainedSubmitPromotedEvents = byEvent(
    'retained_submit_promoted_before_response_lifecycle'
  ).filter(
    (event) =>
      event.responseLifecycleSkipped === true &&
      event.requestPayloadSkipped === true &&
      event.retainedResultsDataReused === true
  );
  const isColdFirstShortcutProfilerSpan = (event) => {
    if (retainedSubmitPromotedEvents.length === 0) {
      return false;
    }
    const samples =
      Array.isArray(event.samples) && event.samples.length > 0 ? event.samples : [event];
    return samples.every((sample) => sample.handoffOperationId === 'shortcut:1');
  };
  if (visualEvents.length > MAX_MEASURED_REPEAT_VISUAL_READINESS_EVENTS) {
    fail(
      `measured submit/dismiss loop emitted too many VisualReadiness events: ${visualEvents.length} > ${MAX_MEASURED_REPEAT_VISUAL_READINESS_EVENTS}`
    );
  } else {
    pass(`measured submit/dismiss VisualReadiness event count=${visualEvents.length}`);
  }
  if (navLockstepEventCount > MAX_MEASURED_REPEAT_NAV_LOCKSTEP_EVENTS) {
    fail(
      `nav_cutout_lockstep_contract proof logging is too dense in measured submit/dismiss: ${navLockstepEventCount} > ${MAX_MEASURED_REPEAT_NAV_LOCKSTEP_EVENTS}`
    );
  } else {
    pass(`nav_cutout_lockstep_contract proof logging count=${navLockstepEventCount}`);
  }
  if (dismissMotionEventCount > MAX_MEASURED_REPEAT_DISMISS_MOTION_EVENTS) {
    fail(
      `search_dismiss_motion_plane_contract proof logging is too dense in measured submit/dismiss: ${dismissMotionEventCount} > ${MAX_MEASURED_REPEAT_DISMISS_MOTION_EVENTS}`
    );
  } else {
    pass(`search_dismiss_motion_plane_contract proof logging count=${dismissMotionEventCount}`);
  }
  if (retainedSubmitPromotedEvents.length === 0) {
    fail('same-key repeat submit never promoted from retained state before response lifecycle');
  } else {
    pass(
      `retained submit promoted before response lifecycle count=${retainedSubmitPromotedEvents.length}`
    );
  }
  const badRouteWrapperMaterializationSpan = (report.profiler?.worstByCommitSpan ?? []).find(
    (event) =>
      ROUTE_WRAPPER_PROFILER_IDS.has(event.id) &&
      event.stageHint === 'results_list_materialization' &&
      numeric(event.commitSpanMs) > MAX_ROUTE_WRAPPER_RESULTS_MATERIALIZATION_COMMIT_SPAN_MS &&
      !isColdFirstShortcutProfilerSpan(event)
  );
  if (badRouteWrapperMaterializationSpan) {
    fail(
      `same-key results list materialization still fans out through route/sheet wrapper ${badRouteWrapperMaterializationSpan.id}: commitSpanMs=${badRouteWrapperMaterializationSpan.commitSpanMs}`
    );
  } else {
    pass('same-key results list materialization does not exceed route/sheet wrapper commit budget');
  }
  const badRouteWrapperHydrationSpan = (report.profiler?.worstByCommitSpan ?? []).find(
    (event) =>
      ROUTE_WRAPPER_PROFILER_IDS.has(event.id) &&
      event.stageHint === 'results_hydration_commit' &&
      numeric(event.commitSpanMs) > MAX_ROUTE_WRAPPER_RESULTS_HYDRATION_COMMIT_SPAN_MS &&
      !isColdFirstShortcutProfilerSpan(event)
  );
  if (badRouteWrapperHydrationSpan) {
    fail(
      `results hydration still fans out through route/sheet wrapper ${badRouteWrapperHydrationSpan.id}: commitSpanMs=${badRouteWrapperHydrationSpan.commitSpanMs}`
    );
  } else {
    pass('results hydration route/sheet wrapper commit fanout stays within budget');
  }
  const badRetainedReplayChromeWake = (report.profiler?.worstByCommitSpan ?? []).find(
    (event) =>
      event.id === 'SearchOverlayChrome' &&
      (event.stageHint === 'post_visual' || event.stageHint === 'visual_sync_state') &&
      numeric(event.count) > MAX_RETAINED_REPLAY_CHROME_WAKE_COUNT
  );
  if (badRetainedReplayChromeWake) {
    fail(
      `retained replay still wakes SearchOverlayChrome during ${badRetainedReplayChromeWake.stageHint}: count=${badRetainedReplayChromeWake.count}`
    );
  } else {
    pass('retained replay keeps SearchOverlayChrome wake count within budget');
  }
  const badRetainedReplayRoutePostVisualSpan = (report.profiler?.worstByCommitSpan ?? []).find(
    (event) =>
      RETAINED_REPLAY_ROUTE_SNAPSHOT_PROFILER_IDS.has(event.id) &&
      event.stageHint === 'post_visual' &&
      numeric(event.commitSpanMs) > MAX_RETAINED_REPLAY_ROUTE_POST_VISUAL_COMMIT_SPAN_MS
  );
  if (badRetainedReplayRoutePostVisualSpan) {
    fail(
      `retained replay post_visual still updates route/sheet snapshot host ${badRetainedReplayRoutePostVisualSpan.id}: commitSpanMs=${badRetainedReplayRoutePostVisualSpan.commitSpanMs} > ${MAX_RETAINED_REPLAY_ROUTE_POST_VISUAL_COMMIT_SPAN_MS}`
    );
  } else {
    pass('retained replay post_visual route/sheet snapshot hosts stay below tiny commit budget');
  }
  const badVisualSyncRouteWakeSpan = (report.profiler?.worstByCommitSpan ?? []).find(
    (event) =>
      VISUAL_SYNC_ROUTE_WAKE_PROFILER_IDS.has(event.id) &&
      event.stageHint === 'visual_sync_state' &&
      VISUAL_SYNC_HANDOFF_PHASES.has(event.handoffPhase) &&
      (numeric(event.actualDurationMs) > MAX_VISUAL_SYNC_ROUTE_WAKE_ACTUAL_MS ||
        numeric(event.commitSpanMs) > MAX_VISUAL_SYNC_ROUTE_WAKE_COMMIT_SPAN_MS)
  );
  if (badVisualSyncRouteWakeSpan) {
    fail(
      `visual_sync_state/${badVisualSyncRouteWakeSpan.handoffPhase} still wakes route/sheet host ${badVisualSyncRouteWakeSpan.id}: actualDurationMs=${badVisualSyncRouteWakeSpan.actualDurationMs}, commitSpanMs=${badVisualSyncRouteWakeSpan.commitSpanMs}`
    );
  } else {
    pass('visual_sync_state route/sheet hosts stay below commit budget for all handoff phases');
  }
  const measuredProfilerSpans =
    report.measuredRepeatLoop?.profiler?.worstByCommitSpan ??
    report.profiler?.worstByCommitSpan ??
    [];
  const badRedrawCommittedRouteWakeSpan = measuredProfilerSpans.find(
    (event) =>
      VISUAL_SYNC_ROUTE_WAKE_PROFILER_IDS.has(event.id) &&
      event.stageHint === 'visual_sync_state' &&
      event.handoffPhase === 'redraw_committed' &&
      (numeric(event.actualDurationMs) > MAX_REDRAW_COMMITTED_ROUTE_WAKE_ACTUAL_MS ||
        numeric(event.commitSpanMs) > MAX_REDRAW_COMMITTED_ROUTE_WAKE_COMMIT_SPAN_MS)
  );
  if (badRedrawCommittedRouteWakeSpan) {
    fail(
      `visual_sync_state/redraw_committed route/sheet host update exceeds measured-loop budget: ${badRedrawCommittedRouteWakeSpan.id} actualDurationMs=${badRedrawCommittedRouteWakeSpan.actualDurationMs}, commitSpanMs=${badRedrawCommittedRouteWakeSpan.commitSpanMs}`
    );
  } else {
    pass('visual_sync_state/redraw_committed route/sheet hosts stay below measured-loop budget');
  }
}

const preparedGateEvents = byEvent('cards_pins_transaction_commit_gate');
const coverRevealStartEvents = byEvent('cards_pins_cover_reveal_started');
const firstPaintAdmissionStartEvents = byEvent('mounted_results_first_paint_admission_started');
const firstPaintAdmissionReadyEvents = byEvent('mounted_results_first_paint_admission_ready');
const resultCardsReadyEvents = byEvent('result_cards_ready');
const resultCardsRevealStartEvents = byEvent('result_cards_reveal_started');
const gateEvents = preparedGateEvents;
if (scenarioIsMapRuntimeOnly) {
  pass(`surface transaction gate readiness skipped for map runtime scenario ${scenarioName}`);
} else if (preparedGateEvents.length === 0) {
  fail('missing cards_pins_transaction_commit_gate event');
} else {
  const badGate = preparedGateEvents.find(
    (event) =>
      !hasPreparedCardsReadySignal(event) ||
      event.mapSearchSurfaceResultsSourcesReady !== true ||
      event.isShortcutCoverageLoading !== false ||
      (event.kind === 'results_enter' &&
        event.transactionId != null &&
        event.mapSearchSurfaceResultsSourcesReadyKey !== event.transactionId)
  );
  if (badGate) {
    fail(
      `surface transaction gate released before cards/map readiness at line ${
        badGate.line
      }: ${JSON.stringify({
        transactionId: badGate.transactionId,
        listFirstPaintReady: badGate.listFirstPaintReady,
        hydratedResultsKey: badGate.hydratedResultsKey,
        isResultsHydrationSettled: badGate.isResultsHydrationSettled,
        shouldHydrateResultsForRender: badGate.shouldHydrateResultsForRender,
        mountedFirstVisibleRowsActiveCount: badGate.mountedFirstVisibleRowsActiveCount,
        mountedFirstVisibleRowsReadyKey: badGate.mountedFirstVisibleRowsReadyKey,
        mapSearchSurfaceResultsSourcesReady: badGate.mapSearchSurfaceResultsSourcesReady,
        mapSearchSurfaceResultsSourcesReadyKey: badGate.mapSearchSurfaceResultsSourcesReadyKey,
        resultsSnapshotKey: badGate.resultsSnapshotKey,
        isShortcutCoverageLoading: badGate.isShortcutCoverageLoading,
      })}`
    );
  } else {
    pass(`surface transaction gate ready events=${preparedGateEvents.length}`);
  }
}

const markerEnterEvents = byEvent('native_marker_enter_started');
if (markerEnterEvents.length > 0 && gateEvents.length > 0) {
  const firstGateLine = Math.min(...gateEvents.map((event) => event.line));
  const earlyMarkerEnter = markerEnterEvents.find((event) => event.line < firstGateLine);
  if (earlyMarkerEnter) {
    fail(`native marker enter started before cards/map gate at line ${earlyMarkerEnter.line}`);
  } else {
    pass(`marker enter starts after surface transaction gate events=${markerEnterEvents.length}`);
  }
}

const initialLoadingVisiblePreroll = byEvent('native_marker_preroll_started').find(
  (event) =>
    event.phase === 'covered' &&
    event.coverState === 'initial_loading' &&
    (coverRevealStartEvents.length === 0 ||
      event.line < Math.min(...coverRevealStartEvents.map((revealEvent) => revealEvent.line))) &&
    ((numeric(event.pinCount) ?? 0) > 0 ||
      (numeric(event.dotCount) ?? 0) > 0 ||
      (numeric(event.labelCount) ?? 0) > 0)
);
if (initialLoadingVisiblePreroll) {
  fail(
    `native map sources were visible during covered submit before cards/map reveal at line ${
      initialLoadingVisiblePreroll.line
    }: ${JSON.stringify({
      pinCount: initialLoadingVisiblePreroll.pinCount ?? null,
      dotCount: initialLoadingVisiblePreroll.dotCount ?? null,
      labelCount: initialLoadingVisiblePreroll.labelCount ?? null,
      coverState: initialLoadingVisiblePreroll.coverState ?? null,
    })}`
  );
} else {
  pass('native map source preroll stays empty while submit loading cover owns reveal');
}

if (scenarioIsMapRuntimeOnly) {
  pass(`search submit reveal/sheet gates skipped for map runtime scenario ${scenarioName}`);
} else if (coverRevealStartEvents.length === 0) {
  fail('missing cards_pins_cover_reveal_started event');
} else {
  const nativeMountedHiddenEvents = byEvent('native_execution_batch_mounted_hidden_ready');
  const earlyCoverReveal = coverRevealStartEvents.find((event) => {
    const matchingCardsReady = resultCardsReadyEvents.find(
      (readyEvent) =>
        readyEvent.line < event.line &&
        readyEvent.requestKey === event.transactionId &&
        (readyEvent.activeRowCount ?? 0) > 0
    );
    const matchingMountedHidden = nativeMountedHiddenEvents.find(
      (hiddenEvent) =>
        hiddenEvent.line < event.line &&
        hiddenEvent.requestKey === event.transactionId &&
        hiddenEvent.executionBatchId === event.executionBatchId
    );
    return !matchingCardsReady || !matchingMountedHidden;
  });
  if (earlyCoverReveal) {
    fail(
      `cover reveal started before active cards/native hidden readiness for transaction ${
        earlyCoverReveal.transactionId ?? 'unknown'
      } at line ${earlyCoverReveal.line}`
    );
  } else {
    pass(
      `cover reveal waited for active cards/native hidden readiness events=${coverRevealStartEvents.length}`
    );
  }
  if (firstPaintAdmissionStartEvents.length === 0) {
    fail('missing chunked first-paint admission start event');
  } else {
    pass(`chunked first-paint admission start events=${firstPaintAdmissionStartEvents.length}`);
  }
  const revealBeforeChunkedFirstPaintReady = coverRevealStartEvents.find((event) => {
    const matchingAdmissionStart = firstPaintAdmissionStartEvents.find(
      (startEvent) => startEvent.transactionId === event.transactionId
    );
    if (!matchingAdmissionStart) {
      return false;
    }
    const matchingAdmissionReady = firstPaintAdmissionReadyEvents.find(
      (readyEvent) =>
        readyEvent.line < event.line &&
        readyEvent.transactionId === event.transactionId &&
        readyEvent.readinessKey === matchingAdmissionStart.readinessKey &&
        (readyEvent.committedRowCount ?? 0) >= (readyEvent.targetRowCount ?? 1) &&
        (readyEvent.fullDetailRowCount ?? 0) >= (readyEvent.targetRowCount ?? 1) &&
        (readyEvent.targetRowCount ?? 0) > 0
    );
    return !matchingAdmissionReady;
  });
  if (revealBeforeChunkedFirstPaintReady) {
    fail(
      `cover reveal started before chunked first-paint rows committed for transaction ${
        revealBeforeChunkedFirstPaintReady.transactionId ?? 'unknown'
      } at line ${revealBeforeChunkedFirstPaintReady.line}`
    );
  } else {
    pass(
      `cover reveal waited for chunked first-paint admission readiness events=${firstPaintAdmissionReadyEvents.length}`
    );
  }
}

const layerEvents = byEvent('mounted_sheet_layer_contract');
if (scenarioIsMapRuntimeOnly) {
  pass(`mounted sheet layer gate skipped for map runtime scenario ${scenarioName}`);
} else if (layerEvents.length === 0) {
  fail('missing mounted_sheet_layer_contract event');
} else {
  const badLayer = layerEvents.find(
    (event) =>
      event.inSheetBody !== true ||
      event.rootExternalListHost !== false ||
      event.hostLayer !== 'SearchMountedSceneBody' ||
      event.usesMountedRowsSnapshot !== true ||
      !(event.renderRowCount > 0)
  );
  if (badLayer) {
    fail(`mounted sheet layer contract failed at line ${badLayer.line}`);
  } else {
    pass(`mounted sheet layer contracts=${layerEvents.length}`);
  }
}

if (
  gateEvents.length > 0 &&
  markerEnterEvents.length > 0 &&
  layerEvents.length > 0 &&
  coverRevealStartEvents.length > 0
) {
  const firstGateLine = Math.min(...gateEvents.map((event) => event.line));
  const firstLayerLine = Math.min(...layerEvents.map((event) => event.line));
  const firstMarkerEnterLine = Math.min(...markerEnterEvents.map((event) => event.line));
  const firstCoverRevealLine = Math.min(...coverRevealStartEvents.map((event) => event.line));
  if (firstLayerLine > firstMarkerEnterLine) {
    fail(
      `cards were not mounted in the sheet before marker enter: layer line ${firstLayerLine}, marker line ${firstMarkerEnterLine}`
    );
  } else if (firstMarkerEnterLine < firstCoverRevealLine) {
    fail(
      `native marker enter started before cover/card reveal: cover line ${firstCoverRevealLine}, marker line ${firstMarkerEnterLine}`
    );
  } else {
    pass(
      `cards/pins reveal order layer=${firstLayerLine} gate=${firstGateLine} reveal=${firstCoverRevealLine} marker=${firstMarkerEnterLine}`
    );
  }
}

const overlapEvents = byEvent('lod_source_overlap_contract');
if (overlapEvents.length === 0) {
  fail('missing lod_source_overlap_contract events');
} else {
  const badOverlap = overlapEvents.find(
    (event) =>
      (numeric(event.pinCount) ?? 0) > 0 &&
      (numeric(event.markerKeyOverlapCount) ?? 0) < (numeric(event.pinCount) ?? 0)
  );
  if (badOverlap) {
    fail(
      `resident dot source did not include all promoted pins at line ${badOverlap.line}: pins=${badOverlap.pinCount} overlap=${badOverlap.markerKeyOverlapCount}`
    );
  } else {
    pass(`resident dot/pin overlap contracts=${overlapEvents.length}`);
  }
}

const classificationEvents = byEvent('lod_classification_contract');
if (classificationEvents.length === 0) {
  fail('missing lod_classification_contract events');
} else {
  const badClassification = classificationEvents.find(
    (event) =>
      event.promotedRestaurantsRenderAsPins !== true ||
      event.nonPromotedRestaurantsRenderAsDots !== true ||
	      event.allEligibleVisualIdentitiesClassified !== true ||
	      unclassifiedCountFromClassification(event) > 0 ||
	      normalPinRankMismatchFromClassification(event) > 0 ||
	      normalPinCountFromClassification(event) > pinBudgetFromClassification(event) ||
	      pinCountFromClassification(event) >
	        pinBudgetFromClassification(event) + selectedPinCountFromClassification(event) ||
      (numeric(event.classifiedVisualIdentityCount) != null &&
        pinCountFromClassification(event) + dotCountFromClassification(event) !==
          numeric(event.classifiedVisualIdentityCount))
  );
  if (badClassification) {
    fail(`LOD classification contract failed at line ${badClassification.line}`);
  } else {
    const mixedLodEvent = classificationEvents.find(
      (event) => pinCountFromClassification(event) > 0 && dotCountFromClassification(event) > 0
    );
    if (!mixedLodEvent) {
      fail('LOD classification never observed both pins and dots in the same scenario');
    } else {
      pass(
        `LOD classification pins=${pinCountFromClassification(
          mixedLodEvent
        )} dots=${dotCountFromClassification(mixedLodEvent)}`
      );
    }
  }
}

if (
  (report.scenarioName ?? '').includes('search_map_lod_pan_zoom') ||
  (report.scenarioName ?? '').includes('search_pin_selection_profile_open')
) {
  if (slotTopologyEvents.length === 0) {
    fail('missing search_map_slot_topology_contract events');
  } else if (badSlotTopologyEvent) {
    fail(
      `search map slot topology contract failed at line ${badSlotTopologyEvent.line}: ${JSON.stringify({
        pinStackSlotCount: badSlotTopologyEvent.pinStackSlotCount,
        normalSlotCount: badSlotTopologyEvent.normalSlotCount,
        pinSlotSourceIdCount: badSlotTopologyEvent.pinSlotSourceIdCount,
        pinInteractionLayerIdCount: badSlotTopologyEvent.pinInteractionLayerIdCount,
        labelVisualLayerIdCount: badSlotTopologyEvent.labelVisualLayerIdCount,
        labelCollisionLayerIdCount: badSlotTopologyEvent.labelCollisionLayerIdCount,
      })}`
    );
  } else {
    const topologyKeys = new Set(
      slotTopologyEvents.map((event) => event.slotTopologyKey).filter(Boolean)
    );
    pass(
      `search map slot topology valid events=${slotTopologyEvents.length} topologies=${[
        ...topologyKeys,
      ].join(',')}`
    );
  }

  // Promotion stability: while the map moves, the promoted pin count must not
  // mass-demote and rebound. A stable selection holds the set near its peak
  // (only small legitimate displacement as markers cross the viewport edge).
  // The LOD demotion bug instead collapses the set from ~30 down to a handful
  // and then bounces back to ~30 repeatedly as the camera moves. We detect that
  // collapse-and-recover oscillation, which is unambiguous instability:
  // legitimate zoom-out demotion is monotonic and never recovers to the peak
  // mid-movement, so this does not false-fail on real zoom changes. This
  // asserts cross-frame stability, which the per-frame lod_classification_contract
  // cannot catch (it reports the intended set, not what natively rendered).
  const COLLAPSE_DROP_TOLERANCE = 12; // drop from running peak that counts as a collapse
  const RECOVERY_MARGIN = 6; // rise back toward peak that counts as a rebound
  const MIN_PEAK_TO_ASSERT = 15; // ignore tiny scenarios with no real promoted set
  const movingPinOrderEvents = byEvent('native_pin_visual_order_contract')
    .filter((event) => event.isMoving === true && numeric(event.pinCount) != null)
    .sort(
      (left, right) =>
        (numeric(left.nativeEmittedAtMs) ?? left.line) -
        (numeric(right.nativeEmittedAtMs) ?? right.line)
    );
  if (movingPinOrderEvents.length === 0) {
    fail('missing moving native_pin_visual_order_contract events — cannot verify promotion stability');
  } else {
    let runningPeak = 0;
    let collapseFloor = null; // deepest pinCount while in an active collapse below the peak
    let oscillationCount = 0;
    let worst = null; // { drop, peak, floor, line }
    for (const event of movingPinOrderEvents) {
      const pinCount = numeric(event.pinCount);
      runningPeak = Math.max(runningPeak, pinCount);
      if (runningPeak < MIN_PEAK_TO_ASSERT) {
        continue;
      }
      if (runningPeak - pinCount >= COLLAPSE_DROP_TOLERANCE) {
        // Still collapsed well below the peak — track the deepest floor.
        collapseFloor = collapseFloor == null ? pinCount : Math.min(collapseFloor, pinCount);
      } else if (collapseFloor != null && pinCount - collapseFloor >= RECOVERY_MARGIN) {
        // Climbed back to within tolerance of the peak after a deep collapse:
        // one collapse-and-recover thrash cycle.
        oscillationCount += 1;
        const drop = runningPeak - collapseFloor;
        if (!worst || drop > worst.drop) {
          worst = { drop, peak: runningPeak, floor: collapseFloor, line: event.line };
        }
        collapseFloor = null;
      }
    }
    if (oscillationCount > 0) {
      fail(
        `promoted pin count collapsed and recovered ${oscillationCount} time(s) during movement (LOD thrash); worst near line ${worst.line}: dropped from peak ${worst.peak} to ${worst.floor} then rebounded`
      );
    } else {
      pass(
        `promotion stability during movement: no collapse-and-recover oscillation (events=${movingPinOrderEvents.length})`
      );
    }
  }

  // LOD crossfade quality: promote/demote must be a clean opacity crossfade.
  // flashReversalCount > 0 means a pin reversed mid-fade (the "fade out -> flash
  // full -> out"); crossfadeGapCount > 0 means a pin faded out with no dot fading
  // in (dot snaps in late). Both must be 0 across the scenario.
  const lodTransitionEvents = byEvent('native_live_lod_transition_contract');
  if (lodTransitionEvents.length === 0) {
    fail('missing native_live_lod_transition_contract events — cannot verify crossfade quality');
  } else {
    const totalFlashReversals = lodTransitionEvents.reduce(
      (sum, event) => sum + (numeric(event.flashReversalCount) ?? 0),
      0
    );
    const totalCrossfadeGaps = lodTransitionEvents.reduce(
      (sum, event) => sum + (numeric(event.crossfadeGapCount) ?? 0),
      0
    );
    const worstFlash = lodTransitionEvents.find((event) => (numeric(event.flashReversalCount) ?? 0) > 0);
    const worstGap = lodTransitionEvents.find((event) => (numeric(event.crossfadeGapCount) ?? 0) > 0);
    if (totalFlashReversals > 0 || totalCrossfadeGaps > 0) {
      fail(
        `LOD crossfade not clean: flashReversals=${totalFlashReversals} (mid-fade promote/demote reversal), crossfadeGaps=${totalCrossfadeGaps} (pin faded out with no dot fade-in); first flash near line ${
          worstFlash?.line ?? 'n/a'
        }, first gap near line ${worstGap?.line ?? 'n/a'}`
      );
    } else {
      pass(
        `LOD crossfade clean: 0 flash reversals, 0 crossfade gaps across ${lodTransitionEvents.length} transition frames`
      );
    }
  }
}

const dismissPressEvents = byEvent('results_dismiss_press_up_contract');
const dismissBottomEvents = byEvent('results_dismiss_bottom_snap_handoff_contract');
const dismissCollapsedBoundaryBoundaryEvents = byEvent(
  'results_dismiss_collapsed_boundary_contract'
);
const persistentPollsRestoreSettleEvents = byEvent('persistent_polls_restore_settled_contract');
const persistentPollsRestoreStateEvents = byEvent('persistent_polls_restore_state_contract');
const persistentPollsSheetHostEvents = byEvent('persistent_polls_sheet_host_contract');
const persistentPollsSceneHeaderEvents = byEvent(
  'persistent_polls_scene_header_restoration_contract'
);
const pollPageReadyEvents = byEvent('search_surface_poll_page_part_ready_contract');
const pollPageReadySummaryEvents = byEvent('search_surface_poll_page_ready_contract');
const firstDismissLine =
  dismissPressEvents.length > 0
    ? Math.min(...dismissPressEvents.map((event) => event.line))
    : Number.POSITIVE_INFINITY;
const shouldAssertResultsDismissContracts =
  scenarioExpectsResultsDismiss || dismissPressEvents.length > 0 || dismissBottomEvents.length > 0;
const isAtomicReleaseTelemetryLead = (event) =>
  dismissBottomEvents.some(
    (bottomEvent) =>
      bottomEvent.line >= event.line &&
      bottomEvent.line - event.line <= 5 &&
      bottomEvent.boundaryTrigger === 'collapsed_motion_plane_boundary' &&
      bottomEvent.canReleasePersistentPolls === true &&
      bottomEvent.isPersistentPollHostReady === true
  );

const visualSourceEvents = byEvent('map_marker_visual_sources_contract').filter(
  (event) => event.searchMode === 'shortcut' && event.line < firstDismissLine
);
const terminalEmptyCoverageEvents = byEvent('shortcut_coverage_terminal_empty_visual_contract');
const badTerminalEmptyCoverageEvent = terminalEmptyCoverageEvents.find(
  (event) =>
    (event.resultRestaurantCount ?? 0) > 0 && (event.pinCount ?? 0) + (event.dotCount ?? 0) === 0
);
if (badTerminalEmptyCoverageEvent) {
  fail(
    `shortcut coverage terminal visual contract failed at line ${
      badTerminalEmptyCoverageEvent.line
    }: results=${badTerminalEmptyCoverageEvent.resultRestaurantCount} pins=${
      badTerminalEmptyCoverageEvent.pinCount ?? 0
    } dots=${badTerminalEmptyCoverageEvent.dotCount ?? 0}`
  );
} else {
  pass(`shortcut coverage terminal empty visual failures=${terminalEmptyCoverageEvents.length}`);
}
if (visualSourceEvents.length === 0) {
  fail('missing shortcut map_marker_visual_sources_contract events before dismiss');
} else {
  const completeVisualSourceEvent = visualSourceEvents.find(
      (event) =>
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        candidateLabelCountMatchesPins(event) &&
        event.promotedPinInteractionCountMatchesPinCount !== false &&
        event.promotedRoleFamiliesAreComplete === true &&
        event.demotedRoleFamiliesAreDotOnly === true &&
        event.promotedDotFeaturesAreResident === true &&
        event.promotedResidentDotsStartHidden === true &&
        event.projectedVisualFeatureCountMatchesCoverage !== false &&
        (numeric(event.pinDotMarkerKeyOverlapCount) ?? 0) >= (numeric(event.pinCount) ?? 0) &&
        (numeric(event.pinDotVisualIdentityOverlapCount) ?? 0) >= (numeric(event.pinCount) ?? 0) &&
        event.hasLabelCollisionSource === true &&
        event.nativeMapLabelCollisionPreserved === true
  );
  if (!completeVisualSourceEvent) {
    const latest = visualSourceEvents[visualSourceEvents.length - 1];
    fail(
      `shortcut map visual sources never included pins, dots, labels, and collision before dismiss; latest line ${
        latest.line
      }: ${JSON.stringify({
        pinCount: latest.pinCount,
        dotCount: latest.dotCount,
        labelCount: latest.labelCount,
        labelCollisionCount: latest.labelCollisionCount,
        nativeMapLabelCollisionPreserved: latest.nativeMapLabelCollisionPreserved,
      })}`
    );
  } else {
    const pinCount = numeric(completeVisualSourceEvent.pinCount) ?? 0;
    const labelCount = numeric(completeVisualSourceEvent.labelCount) ?? 0;
    const pinInteractionCount = numeric(completeVisualSourceEvent.pinInteractionCount) ?? 0;
    const labelCollisionCount = numeric(completeVisualSourceEvent.labelCollisionCount) ?? 0;
    if (
      labelCount !== pinCount * 4 ||
      pinInteractionCount !== pinCount ||
      labelCollisionCount !== pinCount
    ) {
      fail(
        `shortcut map visual source families are not atomically slot-aligned at line ${
          completeVisualSourceEvent.line
        }: ${JSON.stringify({
          pinCount,
          pinInteractionCount,
          labelCount,
          labelCollisionCount,
          promotedRoleFamiliesAreComplete:
            completeVisualSourceEvent.promotedRoleFamiliesAreComplete,
          demotedRoleFamiliesAreDotOnly: completeVisualSourceEvent.demotedRoleFamiliesAreDotOnly,
          promotedDotFeaturesAreResident: completeVisualSourceEvent.promotedDotFeaturesAreResident,
          promotedResidentDotsStartHidden: completeVisualSourceEvent.promotedResidentDotsStartHidden,
        })}`
      );
    } else {
      pass(
        `shortcut map promoted slot families aligned pins=${pinCount} interactions=${pinInteractionCount} labels=${labelCount} collisions=${labelCollisionCount}`
      );
    }
    pass(
      `shortcut map visual sources pins=${completeVisualSourceEvent.pinCount} dots=${completeVisualSourceEvent.dotCount} labels=${completeVisualSourceEvent.labelCount}`
    );
  }
}

if (scenarioIsMapRuntimeOnly) {
  const completedCoverageEvents = workSpanEventsFromLog.filter(
    (event) =>
      event.owner === 'map_source_frame_publish' &&
      event.searchMode === 'shortcut' &&
      event.shortcutCoverageStatus === 'completed' &&
      numeric(event.shortcutCoverageAcceptedFeatureCount) != null
  );
  const latestCoverageEvent = completedCoverageEvents[completedCoverageEvents.length - 1] ?? null;
  const latestVisualSourceEvent = visualSourceEvents[visualSourceEvents.length - 1] ?? null;
  if (!latestCoverageEvent || !latestVisualSourceEvent) {
    fail('map runtime did not expose both shortcut coverage and visual source counts');
  } else {
    const acceptedFeatureCount =
      numeric(latestCoverageEvent.shortcutCoverageAcceptedFeatureCount) ?? 0;
    const visibleFeatureCount =
      numeric(latestVisualSourceEvent.projectedVisualFeatureCount) ??
      (numeric(latestVisualSourceEvent.pinCount) ?? 0) +
        (numeric(latestVisualSourceEvent.visibleDemotedDotCount) ?? 0);
    if (visibleFeatureCount !== acceptedFeatureCount) {
      fail(
        `map resident coverage count mismatch: coverage accepted=${acceptedFeatureCount} visual pins+dots=${visibleFeatureCount}`
      );
    } else {
      pass(
        `map resident coverage preserved accepted=${acceptedFeatureCount} pins=${latestVisualSourceEvent.pinCount} dots=${latestVisualSourceEvent.dotCount}`
      );
    }
  }
}

const nativeEnterStarts = byEvent('native_marker_enter_started');
const nativeEnterSettles = byEvent('native_marker_enter_settled');
  const badNativeEnterStart = nativeEnterStarts.find(
    (event) =>
      (event.pinCount ?? 0) <= 0 ||
      (event.dotCount ?? 0) <= 0 ||
      !candidateLabelCountMatchesPins(event) ||
      event.pinsLabelsDotsFadeTogether !== true
  );
  const badNativeEnterSettle = nativeEnterSettles.find(
    (event) =>
      (event.pinCount ?? 0) <= 0 ||
      (event.dotCount ?? 0) <= 0 ||
      !candidateLabelCountMatchesPins(event) ||
      event.pinsLabelsDotsFadeTogether !== true
  );
if (nativeEnterStarts.length === 0 || nativeEnterSettles.length === 0) {
  fail('missing native marker enter start/settle events with visual source counts');
} else if (badNativeEnterStart || badNativeEnterSettle) {
  fail(
    `native marker enter did not include pins, dots, and labels fading together; startLine=${
      badNativeEnterStart?.line ?? 'ok'
    } settleLine=${badNativeEnterSettle?.line ?? 'ok'}`
  );
} else {
  const enter = nativeEnterStarts[0];
  pass(
    `native marker enter includes pins=${enter.pinCount} dots=${enter.dotCount} labels=${enter.labelCount}`
  );
}

const labelVisibilityEvents = byEvent('map_pin_label_visibility_contract').filter(
  (event) => event.line < firstDismissLine
);
if (labelVisibilityEvents.length === 0) {
  fail('missing map_pin_label_visibility_contract events before dismiss');
} else {
  const visibleLabelEvent = labelVisibilityEvents.find(
    (event) => event.hasVisiblePinLabels === true && (event.visibleLabelCount ?? 0) > 0
  );
  if (!visibleLabelEvent) {
    const latest = labelVisibilityEvents[labelVisibilityEvents.length - 1];
    fail(
      `pin labels were never observed visible before dismiss; latest line ${latest.line}: visible=${latest.visibleLabelCount} layerRendered=${latest.layerRenderedFeatureCount} effective=${latest.effectiveRenderedFeatureCount}`
    );
  } else {
    pass(`pin label visibility observed labels=${visibleLabelEvent.visibleLabelCount}`);
  }
}

const renderedLabelCollisionEvents = byEvent('map_rendered_label_collision_contract').filter(
  (event) => event.line < firstDismissLine
);
if (renderedLabelCollisionEvents.length === 0) {
  fail('missing map_rendered_label_collision_contract events before dismiss');
} else {
  const nativeLiveLodTransitionEventsForLabels = byEvent('native_live_lod_transition_contract');
  const isCoveredBySynchronizedPinExitFade = (event) => {
    const detachedLabelCount = numeric(event.visibleLabelsWithoutPromotedPinCount) ?? 0;
    const demotedLabelCount = numeric(event.visibleLabelsForDemotedMarkerCount) ?? 0;
    if (detachedLabelCount === 0 && demotedLabelCount === 0) {
      return true;
    }
    if (detachedLabelCount !== demotedLabelCount || demotedLabelCount <= 0) {
      return false;
    }
    const emittedAtMs = numeric(event.emittedAtMs);
    if (emittedAtMs == null) {
      return false;
    }
    let activeSynchronizedPinExitCount = 0;
    for (const transitionEvent of nativeLiveLodTransitionEventsForLabels) {
      const transitionAtMs = numeric(transitionEvent.emittedAtMs);
      const durationMs = numeric(transitionEvent.transitionDurationMs) ?? 0;
      if (transitionAtMs == null || durationMs <= 0) {
        continue;
      }
      const elapsedMs = emittedAtMs - transitionAtMs;
      if (
        elapsedMs >= 0 &&
        elapsedMs <= durationMs + 34 &&
        transitionEvent.pinLabelFadeSynchronized === true
      ) {
        activeSynchronizedPinExitCount += numeric(transitionEvent.pinExitTransitionCount) ?? 0;
      }
    }
    return activeSynchronizedPinExitCount >= demotedLabelCount;
  };
  const badRenderedLabelCollisionEvent = renderedLabelCollisionEvents.find(
    (event) =>
      (numeric(event.visibleLabelCount) ?? 0) > 0 &&
      ((numeric(event.multipleVisibleLabelCandidateMarkerCount) ?? 0) > 0 ||
        !isCoveredBySynchronizedPinExitFade(event) ||
        event.promotedPinCollisionObstacleCountMatchesPins !== true ||
        event.labelCollisionConfigured !== true)
  );
  if (badRenderedLabelCollisionEvent) {
    fail(
      `rendered labels are not locked to promoted pin collision at line ${
        badRenderedLabelCollisionEvent.line
      }: ${JSON.stringify({
        visibleLabelCount: badRenderedLabelCollisionEvent.visibleLabelCount,
        multipleVisibleLabelCandidateMarkerCount:
          badRenderedLabelCollisionEvent.multipleVisibleLabelCandidateMarkerCount,
        visibleLabelsWithoutPromotedPinCount:
          badRenderedLabelCollisionEvent.visibleLabelsWithoutPromotedPinCount,
        visibleLabelsForDemotedMarkerCount:
          badRenderedLabelCollisionEvent.visibleLabelsForDemotedMarkerCount,
        visibleLabelsWithoutPromotedPinMarkerKeys:
          badRenderedLabelCollisionEvent.visibleLabelsWithoutPromotedPinMarkerKeys,
        visibleLabelsForDemotedMarkerKeys:
          badRenderedLabelCollisionEvent.visibleLabelsForDemotedMarkerKeys,
        promotedPinCollisionObstacleCount:
          badRenderedLabelCollisionEvent.promotedPinCollisionObstacleCount,
        expectedPromotedPinCount: badRenderedLabelCollisionEvent.expectedPromotedPinCount,
      })}`
    );
  } else {
    const renderedLabelCollisionEvent =
      renderedLabelCollisionEvents.find((event) => (numeric(event.visibleLabelCount) ?? 0) > 0) ??
      renderedLabelCollisionEvents[renderedLabelCollisionEvents.length - 1];
    const synchronizedFadeLabelEvents = renderedLabelCollisionEvents.filter(
      (event) =>
        ((numeric(event.visibleLabelsWithoutPromotedPinCount) ?? 0) > 0 ||
          (numeric(event.visibleLabelsForDemotedMarkerCount) ?? 0) > 0) &&
        isCoveredBySynchronizedPinExitFade(event)
    );
    pass(
      `rendered labels collision-locked labels=${renderedLabelCollisionEvent.visibleLabelCount} promotedPins=${renderedLabelCollisionEvent.expectedPromotedPinCount}`
    );
    if (synchronizedFadeLabelEvents.length > 0) {
      pass(
        `demoting labels only remain visible inside synchronized pin fade-out windows events=${synchronizedFadeLabelEvents.length}`
      );
    }
  }
}

const nativeSetFrameBridgeSlices = byExpandedEvent('native_set_render_frame_bridge_slice');
const liveMovingBridgeSlices = nativeSetFrameBridgeSlices.filter(
  (event) =>
    event.visualFrameTransactionKind === 'live_update' &&
    (event.isMoving === true || event.isGestureActive === true)
);
if ((report.scenarioName ?? '').includes('search_map_lod_pan_zoom')) {
  const liveVisualLodEvents = visualSourceEvents.filter(
    (event) => (numeric(event.pinCount) ?? 0) > 0 || (numeric(event.dotCount) ?? 0) > 0
  );
  const visualLodPinCounts = new Set(
    liveVisualLodEvents.map((event) => numeric(event.pinCount)).filter((value) => value != null)
  );
  const nativeLiveRoleBuckets = nativeMapApplyContextBuckets().filter(
    (bucket) =>
      bucket.phase === 'live' &&
      bucket.transactionKind === 'live_update' &&
      bucket.sourceFamilySignature === 'markerRoles:1' &&
      bucket.sourceModeSignature === 'patch:1'
  );
  const liveRoleSourceDeltaBucket = nativeLiveRoleBuckets.find(
    (bucket) =>
      (numeric(bucket.rawSourceDeltaCount) ?? 0) > 0 ||
      (numeric(bucket.appliedSourceDeltaCount) ?? 0) > 0
  );
  const nativeDirtyRoleBucket = nativeLiveRoleBuckets.find(
    (bucket) =>
      (sourceOperationMetric(bucket.sourceOperationSignature, 'dirty') ?? 0) > 0 &&
      (numeric(bucket.rawSourceDeltaCount) ?? 0) === 0 &&
      (numeric(bucket.appliedSourceDeltaCount) ?? 0) === 0
  );
  const liveSourceDeltaSlice = liveMovingBridgeSlices.find(
    (event) =>
      (numeric(event.sourceDeltaCount) ?? 0) > 0 || (numeric(event.replaceSourceCount) ?? 0) > 0
  );
  const liveSourceFamilyBucket = nativeMapApplyContextBuckets().find(
    (bucket) =>
      bucket.phase === 'live' &&
      bucket.transactionKind === 'live_update' &&
      bucket.sourceFamilySignature !== 'markerRoles:1' &&
      ((numeric(bucket.rawSourceDeltaCount) ?? 0) > 0 ||
        (numeric(bucket.appliedSourceDeltaCount) ?? 0) > 0 ||
        (sourceOperationMetric(bucket.sourceOperationSignature, 'upsert') ?? 0) > 0 ||
        (sourceOperationMetric(bucket.sourceOperationSignature, 'remove') ?? 0) > 0)
  );
  const liveRoleOverBudgetEvent = liveVisualLodEvents.find((event) => {
    const pinCount = numeric(event.pinCount) ?? pinCountFromClassification(event);
    const selectedPinCount =
      numeric(event.selectedPinCount) ?? selectedPinCountFromClassification(event);
    const normalPinCount =
      numeric(event.normalPinCount) ?? Math.max(0, pinCount - selectedPinCount);
    return normalPinCount > 30 || pinCount > 30 + selectedPinCount;
  });
  const liveRoleOverBudgetSlice = liveMovingBridgeSlices.find(
    (event) =>
      event.markerRoleFrameMode === 'patch' &&
      (normalPinCountFromBridgeSlice(event) > 30 ||
        (numeric(event.markerRolePinnedCount) ?? 0) >
          30 + selectedPinAllowanceFromBridgeSlice(event))
  );
  const liveRankMismatchEvent = classificationEvents.find(
    (event) => normalPinRankMismatchFromClassification(event) > 0
  );
  const stableSlotOwnershipRegression = findStableSlotOwnershipRegression(classificationEvents);
  const nativePinVisualOrderEvents = byEvent('native_pin_visual_order_contract');
  const twistCameraCommandEvents = byScenarioEvent('perf_scenario_command_executed').filter(
    (event) => event.step === 'animate_map_camera' && Math.abs(numeric(event.bearing) ?? 0) > 0
  );
  const twistCameraCommandEvent = twistCameraCommandEvents[0] ?? null;
  const nativeMovingPinVisualOrderEvent = nativePinVisualOrderEvents.find(
    (event) => event.isMoving === true && (numeric(event.pinCount) ?? 0) > 0
  );
  const nativeTwistPinVisualOrderEvent = nativePinVisualOrderEvents.find((event) => {
    const eventTime = numeric(event.emittedAtMs);
    if (eventTime == null || event.isMoving !== true || (numeric(event.pinCount) ?? 0) <= 0) {
      return false;
    }
    return twistCameraCommandEvents.some((commandEvent) => {
      const commandTime = numeric(commandEvent.emittedAtMs);
      if (commandTime == null) {
        return false;
      }
      return eventTime >= commandTime - 200 && eventTime <= commandTime + 1600;
    });
  });
  const badNativePinVisualOrderEvent = nativePinVisualOrderEvents.find(
    (event) =>
      event.stableSlotOwnership !== true ||
      event.appliesScreenYOrdering !== true ||
      event.usesLayerMoves !== true ||
      (numeric(event.sourceMutationCount) ?? 0) !== 0 ||
      (numeric(event.screenYOrderViolationCount) ?? 0) !== 0 ||
      !isNondecreasingScreenYVisualOrder(event.screenYVisualOrder) ||
      (numeric(event.pinCount) ?? 0) > 30 + (numeric(event.selectedPinCount) ?? 0)
  );
  const liveRoleDetachedLabelEvent = liveVisualLodEvents.find(
    (event) => !candidateLabelCountMatchesPins(event)
  );
  const measuredNativeMapBuckets = nativeMapApplyBucketsFromSummary(
    report.measuredRepeatLoop?.nativeMapApplySummary
  );
  const measuredNativeMapContextBuckets = nativeMapApplyContextBucketsFromSummary(
    report.measuredRepeatLoop?.nativeMapApplySummary
  );
  const liveSourceReplaceBucket = measuredNativeMapBuckets.find(
    (bucket) =>
      bucket.phase === 'live' &&
      bucket.section === 'mapbox.replace_source_data'
  );
  const liveSharedDotMutationBucket = measuredNativeMapBuckets.find(
    (bucket) =>
      bucket.phase === 'live' &&
      bucket.source === 'dots' &&
      /^mapbox\.(add_features|remove_features|update_features|replace_source_data)$/.test(bucket.section)
  );
  const liveSharedCollisionMutationBucket = measuredNativeMapBuckets.find(
    (bucket) =>
      bucket.phase === 'live' &&
      bucket.source === 'labelCollisions' &&
      /^mapbox\.(add_features|remove_features|update_features)$/.test(bucket.section)
  );
  const livePromotedSlotStructuralMutationBucket = measuredNativeMapBuckets.find(
    (bucket) =>
      bucket.phase === 'live' &&
      bucket.source === 'promotedSlots' &&
      /^mapbox\.(add_features|remove_features|update_features)$/.test(bucket.section)
  );
  const livePromotedSplitFamilyBucket = measuredNativeMapContextBuckets.find(
    (bucket) =>
      bucket.phase === 'live' &&
      bucket.transactionKind === 'live_update' &&
      typeof bucket.sourceFamilySignature === 'string' &&
      /pinInteractionSlots|labelSlots|labelCollisionSlots/.test(bucket.sourceFamilySignature) &&
      ((sourceOperationMetric(bucket.sourceOperationSignature, 'dirty') ?? 0) > 0 ||
        (sourceOperationMetric(bucket.sourceOperationSignature, 'upsert') ?? 0) > 0 ||
        (sourceOperationMetric(bucket.sourceOperationSignature, 'remove') ?? 0) > 0)
  );
  const livePromotedSlotBucket = measuredNativeMapBuckets.find(
    (bucket) =>
      bucket.phase === 'live' &&
      bucket.source === 'promotedSlots' &&
      (bucket.section === 'source_batch.register_pending_commit' ||
        bucket.section === 'source_batch.apply_feature_states')
  );
  const livePromotedSlotFeatureStateBucket = measuredNativeMapBuckets.find(
    (bucket) =>
      bucket.phase === 'live' &&
      bucket.source === 'promotedSlots' &&
      bucket.section === 'source_batch.apply_feature_states'
  );
  const nativeLiveLodTransitionEvents = byEvent('native_live_lod_transition_contract');
  const nativeScopedPromotedSlotEvents = byEvent('native_scoped_promoted_slot_contract');
  const nativeScopedPromotedSlotDirtyEvent = nativeScopedPromotedSlotEvents.find(
    (event) => (numeric(event.affectedMarkerCount) ?? 0) > 0
  );
  const badNativeScopedPromotedSlotEvent = nativeScopedPromotedSlotEvents.find(
    (event) =>
      event.sourceOpacityBacksScopedPins !== true ||
      (numeric(event.pinSourceOpacityMissingCount) ?? 0) !== 0 ||
      (numeric(event.exitingPinSourceOpacityRiskCount) ?? 0) !== 0
  );
  const nativeLiveLodTransitionWithPins = nativeLiveLodTransitionEvents.find(
    (event) => (numeric(event.pinTransitionCount) ?? 0) > 0
  );
  const nativeLiveLodTransitionWithDots = nativeLiveLodTransitionEvents.find(
    (event) => (numeric(event.dotTransitionCount) ?? 0) > 0
  );
  const nativeLiveLodIntermediatePinEvent = nativeLiveLodTransitionEvents.find(
    (event) =>
      (numeric(event.pinTransitionCount) ?? 0) > 0 &&
      event.hasIntermediateOpacity === true &&
      (numeric(event.pinIntermediateOpacityCount) ?? 0) > 0
  );
  const nativeLiveLodIntermediateDotEvent = nativeLiveLodTransitionEvents.find(
    (event) =>
      (numeric(event.dotTransitionCount) ?? 0) > 0 &&
      event.hasIntermediateOpacity === true &&
      (numeric(event.dotIntermediateOpacityCount) ?? 0) > 0
  );
  const badNativeLiveLodTransition = nativeLiveLodTransitionEvents.find(
    (event) =>
      event.pinLabelFadeSynchronized !== true ||
      event.usesNativeFrameStepper !== true ||
      event.usesStyleTransition !== false ||
      (numeric(event.transitionDurationMs) ?? 0) <= 0 ||
      ((numeric(event.pinTransitionCount) ?? 0) > 0 &&
        (numeric(event.labelFeatureStateApplyCount) ?? 0) <
          (numeric(event.pinTransitionCount) ?? 0) * 4)
  );
  if (liveSourceDeltaSlice) {
    fail(
      `live LOD used source deltas instead of marker role frames at line ${liveSourceDeltaSlice.line}: sourceDeltaCount=${liveSourceDeltaSlice.sourceDeltaCount} replaceSourceCount=${liveSourceDeltaSlice.replaceSourceCount}`
    );
  } else if (liveSourceFamilyBucket) {
    fail(
      `native live LOD mutated structural source family ${liveSourceFamilyBucket.sourceFamilySignature} during movement at line ${liveSourceFamilyBucket.line}: ${liveSourceFamilyBucket.sourceOperationSignature}`
    );
  } else if (liveRoleOverBudgetEvent) {
    fail(
      `live LOD promoted more than the viewport pin budget at line ${liveRoleOverBudgetEvent.line}: pinCount=${liveRoleOverBudgetEvent.pinCount}`
    );
  } else if (liveRoleOverBudgetSlice) {
    fail(
      `native live LOD marker role frame exceeded the viewport pin budget at line ${liveRoleOverBudgetSlice.line}: markerRolePinnedCount=${liveRoleOverBudgetSlice.markerRolePinnedCount}`
    );
  } else if (liveRankMismatchEvent) {
    fail(
      `live LOD promoted pins did not match top viewport ranks at line ${liveRankMismatchEvent.line}: expected=${liveRankMismatchEvent.expectedNormalPinFingerprint} actual=${liveRankMismatchEvent.actualNormalPinFingerprint}`
    );
  } else if (stableSlotOwnershipRegression) {
    fail(
      `live LOD changed a stable pin slot for an unchanged promoted marker at line ${stableSlotOwnershipRegression.line}: marker=${stableSlotOwnershipRegression.markerKey} previousSlot=${stableSlotOwnershipRegression.previousSlot} currentSlot=${stableSlotOwnershipRegression.currentSlot} previousLine=${stableSlotOwnershipRegression.previousLine}`
    );
  } else if (!twistCameraCommandEvent) {
    fail('map LOD pan/zoom scenario did not execute a nonzero bearing twist command');
  } else if (nativePinVisualOrderEvents.length === 0) {
    fail('native pin visual order lane did not emit screen-y ordering contracts');
  } else if (!nativeMovingPinVisualOrderEvent) {
    fail('native pin visual order lane did not run during live map movement');
  } else if (!nativeTwistPinVisualOrderEvent) {
    fail('native pin visual order lane did not recompute during nonzero bearing twist movement');
  } else if (badNativePinVisualOrderEvent) {
    fail(
      `native pin visual order contract failed at line ${badNativePinVisualOrderEvent.line}: ${JSON.stringify({
        pinCount: badNativePinVisualOrderEvent.pinCount,
        selectedPinCount: badNativePinVisualOrderEvent.selectedPinCount,
        screenYOrderViolationCount: badNativePinVisualOrderEvent.screenYOrderViolationCount,
        sourceMutationCount: badNativePinVisualOrderEvent.sourceMutationCount,
        stableSlotOwnership: badNativePinVisualOrderEvent.stableSlotOwnership,
        appliesScreenYOrdering: badNativePinVisualOrderEvent.appliesScreenYOrdering,
        usesLayerMoves: badNativePinVisualOrderEvent.usesLayerMoves,
      })}`
    );
  } else if (liveRoleDetachedLabelEvent) {
    fail(
      `live LOD detached label candidates from promoted pins at line ${liveRoleDetachedLabelEvent.line}: pins=${liveRoleDetachedLabelEvent.pinCount} labels=${liveRoleDetachedLabelEvent.labelCount}`
    );
  } else if (liveRoleSourceDeltaBucket) {
    fail(
      `native live role lane carried source deltas at line ${liveRoleSourceDeltaBucket.line}: rawSourceDeltaCount=${liveRoleSourceDeltaBucket.rawSourceDeltaCount} appliedSourceDeltaCount=${liveRoleSourceDeltaBucket.appliedSourceDeltaCount}`
    );
  } else if (!nativeDirtyRoleBucket && !nativeScopedPromotedSlotDirtyEvent) {
    fail('live LOD never proved a scoped dirty role/slot update with sourceDeltaCount=0');
  } else if (liveSourceReplaceBucket) {
    fail(
      `live LOD replaced Mapbox source data during movement: source=${liveSourceReplaceBucket.source} totalMs=${liveSourceReplaceBucket.totalMs} count=${liveSourceReplaceBucket.count}`
    );
  } else if (liveSharedDotMutationBucket) {
    fail(
      `live LOD mutated the resident dot source instead of feature-state only: section=${liveSharedDotMutationBucket.section} totalMs=${liveSharedDotMutationBucket.totalMs} count=${liveSharedDotMutationBucket.count}`
    );
  } else if (livePromotedSplitFamilyBucket) {
    fail(
      `live LOD still writes split promoted slot families instead of one physical promoted slot source at line ${livePromotedSplitFamilyBucket.line}: ${livePromotedSplitFamilyBucket.sourceFamilySignature}`
    );
  } else if (!livePromotedSlotBucket && !nativeScopedPromotedSlotDirtyEvent) {
    fail('live LOD did not prove promoted output is applied through the promotedSlots physical source family');
  } else if (
    !livePromotedSlotFeatureStateBucket &&
    !nativeLiveLodTransitionWithPins &&
    !nativeLiveLodTransitionWithDots
  ) {
    fail('live LOD did not prove promoted output is applied through feature-state updates');
  } else if (nativeScopedPromotedSlotEvents.length === 0) {
    fail('live LOD did not emit scoped promoted slot source-opacity contracts');
  } else if (badNativeScopedPromotedSlotEvent) {
    fail(
      `scoped promoted slot output can fall back to full pin opacity at line ${
        badNativeScopedPromotedSlotEvent.line
      }: ${JSON.stringify({
        pinSourceOpacityMissingCount:
          badNativeScopedPromotedSlotEvent.pinSourceOpacityMissingCount,
        exitingPinSourceOpacityRiskCount:
          badNativeScopedPromotedSlotEvent.exitingPinSourceOpacityRiskCount,
      })}`
    );
  } else if (nativeLiveLodTransitionEvents.length === 0) {
    fail('live LOD did not emit native fade synchronization contracts');
  } else if (!nativeLiveLodTransitionWithPins || !nativeLiveLodTransitionWithDots) {
    fail(
      `live LOD did not prove both pin/label and dot fade transitions: pinEvents=${
        nativeLiveLodTransitionWithPins ? 1 : 0
      } dotEvents=${nativeLiveLodTransitionWithDots ? 1 : 0}`
    );
  } else if (!nativeLiveLodIntermediatePinEvent || !nativeLiveLodIntermediateDotEvent) {
    fail(
      `live LOD did not prove real intermediate opacity for pins and dots: pinIntermediate=${
        nativeLiveLodIntermediatePinEvent ? 1 : 0
      } dotIntermediate=${nativeLiveLodIntermediateDotEvent ? 1 : 0}`
    );
  } else if (badNativeLiveLodTransition) {
    fail(
      `live LOD pin/label fade contract failed at line ${
        badNativeLiveLodTransition.line
      }: ${JSON.stringify({
        pinTransitionCount: badNativeLiveLodTransition.pinTransitionCount,
        labelFeatureStateApplyCount: badNativeLiveLodTransition.labelFeatureStateApplyCount,
        pinLabelFadeSynchronized: badNativeLiveLodTransition.pinLabelFadeSynchronized,
        transitionDurationMs: badNativeLiveLodTransition.transitionDurationMs,
        usesStyleTransition: badNativeLiveLodTransition.usesStyleTransition,
        usesNativeFrameStepper: badNativeLiveLodTransition.usesNativeFrameStepper,
        hasIntermediateOpacity: badNativeLiveLodTransition.hasIntermediateOpacity,
      })}`
    );
  } else {
    pass(
      nativeDirtyRoleBucket
        ? `live LOD marker role patch stayed source-clean line=${nativeDirtyRoleBucket.line}`
        : `live LOD scoped promoted-slot updates stayed source-clean affected=${nativeScopedPromotedSlotDirtyEvent.affectedMarkerCount}`
    );
    pass(
      livePromotedSlotBucket
        ? `live LOD promoted output uses promotedSlots source family section=${livePromotedSlotBucket.section} totalMs=${livePromotedSlotBucket.totalMs}`
        : 'live LOD promoted output uses scoped native promoted-slot contracts'
    );
    if (livePromotedSlotStructuralMutationBucket) {
      pass(
        `live LOD promoted slot source mutations are confined to channel leases section=${livePromotedSlotStructuralMutationBucket.section} totalMs=${livePromotedSlotStructuralMutationBucket.totalMs} count=${livePromotedSlotStructuralMutationBucket.count}`
      );
    }
    if (liveSharedCollisionMutationBucket) {
      pass(
        `live LOD label collision source mutations are confined to obstacle membership section=${liveSharedCollisionMutationBucket.section} totalMs=${liveSharedCollisionMutationBucket.totalMs} count=${liveSharedCollisionMutationBucket.count}`
      );
    }
    pass(
      livePromotedSlotFeatureStateBucket
        ? `live LOD promoted output uses feature-state totalMs=${livePromotedSlotFeatureStateBucket.totalMs}`
        : `live LOD promoted output uses native frame-stepper feature-state events=${nativeLiveLodTransitionEvents.length}`
    );
	    pass(
	      nativeDirtyRoleBucket
	        ? `live LOD native role patches=${nativeLiveRoleBuckets.length} sampleDirty=${sourceOperationMetric(
	            nativeDirtyRoleBucket.sourceOperationSignature,
	            'dirty'
	          )} visualPinCounts=${[...visualLodPinCounts].join(',')}`
	        : `live LOD native scoped patches=${nativeScopedPromotedSlotEvents.length} visualPinCounts=${[...visualLodPinCounts].join(',')}`
	    );
	    pass(
	      `native pin visual order uses layer moves events=${nativePinVisualOrderEvents.length} sampleMoved=${nativeMovingPinVisualOrderEvent.movedGroupCount}`
	    );
	    pass(
	      `live LOD fades are synchronized pinTransitions=${nativeLiveLodTransitionWithPins.pinTransitionCount} dotTransitions=${nativeLiveLodTransitionWithDots.dotTransitionCount}`
	    );
  }
}

if ((report.scenarioName ?? '').includes('search_pin_selection_profile_open')) {
  const measuredBridgeSlices = nativeSetFrameBridgeSlices.filter(isInMeasuredRepeatLoop);
  const measuredWorkSpans = workSpanEventsFromLog.filter(isInMeasuredRepeatLoop);
  const measuredOwnerLifecycleEvents = measuredWorkSpans.filter(
    (event) =>
      event.owner === 'search_map_native_presentation_event_inner' &&
      (event.path === 'detached:status_handler' || event.path === 'attached:status_handler')
  );
  const measuredReplaceFrame = measuredBridgeSlices.find(
    (event) =>
      event.sourceBaselineKind === 'replace_all' ||
      (numeric(event.replaceSourceCount) ?? 0) > 0 ||
      (numeric(event.sourceDeltaCount) ?? 0) > 0
  );
  const measuredSelectedFrames = measuredBridgeSlices.filter(
    (event) =>
      event.visualFrameTransactionKind === 'live_update' &&
      event.selectedRestaurantId != null &&
      (numeric(event.markerRoleSelectedPinnedCount) ?? 0) > 0
  );
  const measuredPinVisualOrderEvents = byEvent('native_pin_visual_order_contract').filter(
    isInMeasuredRepeatLoop
  );
  const broadSelectedRenderFrameOrderEvent = measuredPinVisualOrderEvents.find((event) => {
    if (event.reason !== 'set_render_frame' || (numeric(event.selectedPinCount) ?? 0) <= 0) {
      return false;
    }
    const selectedPinCount = numeric(event.selectedPinCount) ?? 0;
    const movedGroupCount = numeric(event.movedGroupCount) ?? 0;
    return movedGroupCount > Math.max(6, selectedPinCount + 4);
  });
  const selectedFrameWithoutAckBaseline = measuredSelectedFrames.find(
    (event) => event.sourceBaselineKind !== 'ack_delta'
  );
  const selectedFrameWithoutRolePatch = measuredSelectedFrames.find(
    (event) =>
      event.markerRoleFrameMode !== 'patch' &&
      !(
        event.sourceBaselineKind === 'ack_delta' &&
        (numeric(event.replaceSourceCount) ?? 0) === 0 &&
        (numeric(event.sourceDeltaCount) ?? 0) === 0
      )
  );
  const selectedOverBudgetFrame = measuredSelectedFrames.find(
    (event) =>
      normalPinCountFromBridgeSlice(event) > 30 ||
      (numeric(event.pinCount) ?? 0) > 30 + selectedPinAllowanceFromBridgeSlice(event)
  );
  const profileCameraEvents = byEvent('profile_pin_selection_camera_contract');
  const measuredProfileCameraEvents = profileCameraEvents.filter(isInMeasuredRepeatLoop);
  const profileCameraEvent =
    measuredProfileCameraEvents.find((event) => event.source === 'results_sheet') ??
    profileCameraEvents.find((event) => event.source === 'results_sheet');
  const badProfileCameraEvent =
    profileCameraEvent != null &&
    (profileCameraEvent.hasPressedCoordinate !== true ||
      profileCameraEvent.hasTargetCamera !== true ||
      profileCameraEvent.targetMatchesPressedPin !== true ||
      profileCameraEvent.centersAboveSheet !== true ||
      (numeric(profileCameraEvent.paddingBottom) ?? 0) <=
        (numeric(profileCameraEvent.paddingTop) ?? Number.POSITIVE_INFINITY));
  const ownerEpochs = new Set(
    measuredBridgeSlices
      .map((event) => numeric(event.ownerEpoch))
      .filter((value) => value != null)
  );

  if (measuredBridgeSlices.length === 0) {
    fail('pin selection measured loop did not publish native render frame bridge slices');
  } else if (measuredOwnerLifecycleEvents.length > 0) {
    fail(
      `pin selection/profile open detached or attached the native map owner during measured loop at lines=${measuredOwnerLifecycleEvents
        .map((event) => event.line)
        .join(',')}`
    );
  } else if (ownerEpochs.size > 1) {
    fail(`pin selection/profile open changed native owner epoch during measured loop: ${[...ownerEpochs].join(',')}`);
  } else if (measuredReplaceFrame) {
    fail(
      `pin selection/profile open used a structural source frame at line ${
        measuredReplaceFrame.line
      }: baseline=${measuredReplaceFrame.sourceBaselineKind} replace=${
        measuredReplaceFrame.replaceSourceCount
      } sourceDelta=${measuredReplaceFrame.sourceDeltaCount}`
    );
  } else if (measuredSelectedFrames.length === 0) {
    fail('pin selection/profile open did not prove a selected promoted frame');
  } else if (selectedFrameWithoutAckBaseline) {
    fail(
      `pin selection selected frame did not preserve ACK baseline at line ${selectedFrameWithoutAckBaseline.line}: baseline=${selectedFrameWithoutAckBaseline.sourceBaselineKind}`
    );
  } else if (selectedFrameWithoutRolePatch) {
    fail(
      `pin selection selected frame did not stay in source-clean role/presentation lane at line ${selectedFrameWithoutRolePatch.line}`
    );
  } else if (selectedOverBudgetFrame) {
    fail(
      `pin selection selected frame violated normal pin budget at line ${selectedOverBudgetFrame.line}: normal=${normalPinCountFromBridgeSlice(
        selectedOverBudgetFrame
      )} selected=${selectedPinAllowanceFromBridgeSlice(selectedOverBudgetFrame)} total=${
        selectedOverBudgetFrame.pinCount
      }`
    );
  } else if (broadSelectedRenderFrameOrderEvent) {
    fail(
      `pin selection/profile open moved too many pin visual groups for a selected render frame at line ${broadSelectedRenderFrameOrderEvent.line}: moved=${broadSelectedRenderFrameOrderEvent.movedGroupCount} selected=${broadSelectedRenderFrameOrderEvent.selectedPinCount}`
    );
  } else if (!profileCameraEvent) {
    fail('pin selection/profile open did not emit profile_pin_selection_camera_contract');
  } else if (badProfileCameraEvent) {
    fail(
      `pin selection camera did not center the pressed pin above the sheet at line ${
        profileCameraEvent.line
      }: ${JSON.stringify({
        hasPressedCoordinate: profileCameraEvent.hasPressedCoordinate,
        hasTargetCamera: profileCameraEvent.hasTargetCamera,
        targetMatchesPressedPin: profileCameraEvent.targetMatchesPressedPin,
        pressedTargetDistanceMeters: profileCameraEvent.pressedTargetDistanceMeters,
        centersAboveSheet: profileCameraEvent.centersAboveSheet,
        paddingTop: profileCameraEvent.paddingTop,
        paddingBottom: profileCameraEvent.paddingBottom,
      })}`
    );
  } else {
    pass(
      `pin selection stayed source-clean selectedFrames=${measuredSelectedFrames.length} ownerEpoch=${[...ownerEpochs].join(',')}`
    );
    pass(
      `pin selection visual-order diff stayed bounded events=${measuredPinVisualOrderEvents.length}`
    );
    pass(
      `pin selection camera centers pressed pin with paddingTop=${profileCameraEvent.paddingTop} paddingBottom=${profileCameraEvent.paddingBottom}`
    );
  }
}

const searchThisAreaSubmitPressEvents = byEvent('search_this_area_submit_press_up_contract');
const isSearchThisAreaRerunShortcutSubmit = (event) => {
  const precedingSearchThisAreaSubmit = searchThisAreaSubmitPressEvents
    .filter((searchThisAreaEvent) => searchThisAreaEvent.line < event.line)
    .at(-1);
  if (!precedingSearchThisAreaSubmit) {
    return false;
  }
  const nextDismissLine =
    dismissPressEvents.find(
      (dismissEvent) => dismissEvent.line > precedingSearchThisAreaSubmit.line
    )?.line ?? Number.POSITIVE_INFINITY;
  return event.line < nextDismissLine;
};
const submitPressEvents = byEvent('shortcut_submit_press_up_contract').filter(
  (event) => !isSearchThisAreaRerunShortcutSubmit(event)
);
if (submitPressEvents.length === 0) {
  fail('missing shortcut_submit_press_up_contract events');
} else {
  const shortcutVisibilityEvents = byEvent('search_shortcuts_visibility_contract');
  const badSubmitPress = submitPressEvents.find(
    (event) =>
      event.loadingStateVisible !== true ||
      event.resultSheetBeginsSlidingUp !== true ||
      event.queryPopulated !== true ||
      event.shortcutButtonsFadeOutRequested !== true ||
      event.targetSnap !== 'middle'
  );
  if (badSubmitPress) {
    fail(
      `shortcut submit press-up contract failed at line ${badSubmitPress.line}: ${JSON.stringify({
        loadingStateVisible: badSubmitPress.loadingStateVisible,
        resultSheetBeginsSlidingUp: badSubmitPress.resultSheetBeginsSlidingUp,
        queryPopulated: badSubmitPress.queryPopulated,
        shortcutButtonsFadeOutRequested: badSubmitPress.shortcutButtonsFadeOutRequested,
        targetSnap: badSubmitPress.targetSnap,
      })}`
    );
  } else {
    pass(`shortcut submit press-up contracts=${submitPressEvents.length}`);
  }
  const missingShortcutFadeOutTarget = submitPressEvents.find((event) => {
    const nextDismissLine =
      dismissPressEvents.find((dismissEvent) => dismissEvent.line > event.line)?.line ??
      Number.POSITIVE_INFINITY;
    return (
      !shortcutVisibilityEvents.some(
        (visibilityEvent) =>
          visibilityEvent.line > event.line &&
          visibilityEvent.line < nextDismissLine &&
          visibilityEvent.backdropTarget === 'results' &&
          visibilityEvent.shouldShowSearchShortcutsTarget === false &&
          visibilityEvent.shouldEnableSearchShortcutsInteraction === false &&
          visibilityEvent.shortcutBackgroundOpacityTarget === 0 &&
          visibilityEvent.shortcutChipContainerOpacityTarget === 0 &&
          visibilityEvent.shortcutContentOpacityTarget === 0 &&
          visibilityEvent.shortcutOpacityTargetsShareTransition === true
      ) &&
      !retainedSubmitReplayEvents.some(
        (replayEvent) =>
          replayEvent.line > event.line &&
          replayEvent.line < nextDismissLine &&
          replayEvent.transactionId === event.transactionId &&
          replayEvent.shortcutFadeOutTargeted === true &&
          replayEvent.backdropTarget === 'results' &&
          replayEvent.shouldShowSearchShortcutsTarget === false &&
          replayEvent.shouldEnableSearchShortcutsInteraction === false &&
          replayEvent.shortcutBackgroundOpacityTarget === 0 &&
          replayEvent.shortcutChipContainerOpacityTarget === 0 &&
          replayEvent.shortcutContentOpacityTarget === 0 &&
          replayEvent.shortcutOpacityTargetsShareTransition === true
      )
    );
  });
  if (missingShortcutFadeOutTarget) {
    fail(
      `shortcut buttons/content did not target shared fade-out after submit at line ${missingShortcutFadeOutTarget.line}`
    );
  } else {
    pass('shortcut buttons and content target shared fade-out after submit');
  }
}

if (submitPressEvents.length > 0) {
  const nativeMarkerEnterStarts = byEvent('native_marker_enter_started');
  const nativeMarkerEnterSettles = byEvent('native_marker_enter_settled');
  const nativeMountedHiddenEvents = byEvent('native_execution_batch_mounted_hidden_ready');
  const mapSurfaceResultsSourceFrameEvents = byEvent(
    'map_surface_results_source_frame_ready_contract'
  );
  const sourceFrameDataReuseEvents = byEvent('map_source_frame_data_reuse_contract');
  const visualSources = byEvent('map_marker_visual_sources_contract');
  const pinLabelVisibilityEvents = byEvent('map_pin_label_visibility_contract');
  const headerSourceEventsForSubmit = byEvent('search_results_header_source_contract');
  const countEventsForSubmit = byEvent('mounted_results_count_contract');

  const badSubmitCycle = submitPressEvents.find((submitEvent) => {
    const endLine =
      dismissPressEvents.find((dismissEvent) => dismissEvent.line > submitEvent.line)?.line ??
      Number.POSITIVE_INFINITY;
    const matchingRetainedReplay = retainedSubmitReplayEvents.find(
      (event) =>
        isLineBetween(event, submitEvent.line, endLine) &&
        event.transactionId === submitEvent.transactionId &&
        event.responseLifecycleSkipped === true &&
        event.loadingCoverVisible === true &&
        event.cardsReady === true &&
        event.mapSourcesReady === true &&
        event.revealTogether === true &&
        event.resultCardsReady === true &&
        event.resultCardsRevealStarted === true &&
        event.resultCardsRevealSettled === true &&
        event.nativeMarkersReady === true &&
        event.nativeMarkerEnterStarted === true &&
        event.nativeMarkerEnterSettled === true &&
        event.pinsLabelsDotsFadeTogether === true &&
        event.hasVisiblePinLabels === true &&
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        (event.labelCount ?? 0) > 0 &&
        event.hasLabelCollisionSource === true &&
        event.nativeMapLabelCollisionPreserved === true &&
        (event.mountedFirstVisibleRowsActiveCount ?? 0) > 0 &&
        event.reactChromeBodyFrozen === true &&
        event.semanticPageActivationPublishBounded === true &&
        event.redrawTransactionPublishSkipped === true &&
        event.visualRedrawStorePublishSkipped === false
    );
    if (matchingRetainedReplay) {
      return false;
    }
    const matchingGate = gateEvents.find(
      (event) =>
        isLineBetween(event, submitEvent.line, endLine) &&
        event.transactionId === submitEvent.transactionId &&
        event.mapSearchSurfaceResultsSourcesReadyKey === submitEvent.transactionId
    );
    const matchingMapSurfaceResultsSourceFrame = mapSurfaceResultsSourceFrameEvents.find(
      (event) =>
        isLineBetween(event, submitEvent.line, endLine) &&
        event.transactionId === submitEvent.transactionId &&
        event.readinessKey === submitEvent.transactionId &&
        ((event.sourceFrameVisualCycleKey === submitEvent.transactionId &&
          event.didPublishSourceFrame === true &&
          event.coalescedBeforeNativeEnter !== true) ||
          (event.didPublishSourceFrame === false && event.coalescedBeforeNativeEnter === true)) &&
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        (event.labelCount ?? 0) > 0
    );
    const matchingCardsReady = resultCardsReadyEvents.find(
      (event) =>
        isLineBetween(event, submitEvent.line, endLine) &&
        (event.requestKey === submitEvent.transactionId ||
          event.transactionId === submitEvent.transactionId) &&
        (event.activeRowCount ?? 0) > 0
    );
    const matchingMountedHidden = nativeMountedHiddenEvents.find(
      (event) =>
        isLineBetween(event, matchingGate?.line ?? submitEvent.line, endLine) &&
        event.requestKey === submitEvent.transactionId
    );
    const matchingCoverReveal = coverRevealStartEvents.find(
      (event) =>
        matchingCardsReady != null &&
        matchingMountedHidden != null &&
        isLineBetween(
          event,
          Math.max(matchingCardsReady.line, matchingMountedHidden.line),
          endLine
        ) &&
        event.transactionId === submitEvent.transactionId &&
        isSameExecutionBatch(event, matchingMountedHidden)
    );
    const matchingCardRevealStart = resultCardsRevealStartEvents.find(
      (event) =>
        matchingCoverReveal != null &&
        isLineBetween(event, matchingCoverReveal.line - 1, endLine) &&
        event.requestKey === submitEvent.transactionId &&
        isSameExecutionBatch(event, matchingCoverReveal) &&
        (eventDeltaMs(event, matchingCoverReveal) ?? Number.POSITIVE_INFINITY) <= 16
    );
    const matchingMarkerStart = nativeMarkerEnterStarts.find(
      (event) =>
        matchingCoverReveal != null &&
        isLineBetween(event, matchingCoverReveal.line - 1, endLine) &&
        event.requestKey === submitEvent.transactionId &&
        isSameExecutionBatch(event, matchingCoverReveal) &&
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        (event.labelCount ?? 0) > 0 &&
        event.pinsLabelsDotsFadeTogether === true &&
        (eventDeltaMs(event, matchingCoverReveal) ?? Number.POSITIVE_INFINITY) <= 16
    );
    const earlyMarkerStart = nativeMarkerEnterStarts.find(
      (event) =>
        matchingCoverReveal != null &&
        isLineBetween(event, submitEvent.line, matchingCoverReveal.line) &&
        event.requestKey === submitEvent.transactionId &&
        event.executionBatchId === matchingCoverReveal.executionBatchId
    );
    const matchingMarkerSettle = nativeMarkerEnterSettles.find(
      (event) =>
        isLineBetween(event, matchingMarkerStart?.line ?? submitEvent.line, endLine) &&
        event.requestKey === submitEvent.transactionId &&
        isSameExecutionBatch(event, matchingMarkerStart) &&
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        (event.labelCount ?? 0) > 0 &&
        event.pinsLabelsDotsFadeTogether === true
    );
    const matchingVisualSource = visualSources.find(
      (event) =>
        isLineBetween(event, submitEvent.line, endLine) &&
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        (event.labelCount ?? 0) > 0 &&
        candidateLabelCountMatchesPins(event) &&
        event.hasLabelCollisionSource === true &&
        event.nativeMapLabelCollisionPreserved === true
    );
    const matchingReusedVisualSource = sourceFrameDataReuseEvents.find(
      (event) =>
        isLineBetween(event, submitEvent.line, endLine) &&
        event.transactionId === submitEvent.transactionId &&
        event.readinessKey === submitEvent.transactionId &&
        event.sourceFrameDataReused === true &&
        (event.didPublishSourceFrame === true ||
          (event.retainedSourceFrameReplay === true && event.didPublishSourceFrame === false)) &&
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        (event.labelCount ?? 0) > 0 &&
        event.hasLabelCollisionSource === true &&
        event.nativeMapLabelCollisionPreserved === true
    );
    const matchingMapSurfaceResultsByGate =
      matchingGate != null &&
      matchingGate.mapSearchSurfaceResultsSourcesReady === true &&
      matchingGate.mapSearchSurfaceResultsSourcesReadyKey === submitEvent.transactionId &&
      (matchingMapSurfaceResultsSourceFrame != null || matchingReusedVisualSource != null);
    const matchingVisibleLabels = pinLabelVisibilityEvents.find(
      (event) =>
        isLineBetween(event, matchingCoverReveal?.line ?? submitEvent.line, endLine) &&
        event.hasVisiblePinLabels === true &&
        (event.visibleLabelCount ?? 0) > 0
    );
    const earlyVisibleLabels = pinLabelVisibilityEvents.find(
      (event) =>
        matchingCoverReveal != null &&
        isLineBetween(event, submitEvent.line, matchingCoverReveal.line) &&
        event.hasVisiblePinLabels === true &&
        (event.visibleLabelCount ?? 0) > 0
    );
    const matchingVisualRows = countEventsForSubmit.find(
      (event) =>
        isLineBetween(event, submitEvent.line, endLine) &&
        event.mode === 'visual' &&
        (event.admittedRestaurantCardRowCount ?? 0) > 0 &&
        (event.admittedRestaurantCardRowCount ?? 0) <
          (event.backendRestaurantCountOnPage ?? Number.POSITIVE_INFINITY)
    );
    const matchingRows = matchingCardsReady ?? matchingVisualRows;
    const badPartialFullRowsInCycle = countEventsForSubmit.find(
      (event) =>
        isLineBetween(event, submitEvent.line, endLine) &&
        event.mode === 'full' &&
        (event.admittedRestaurantCardRowCount ?? 0) > 0 &&
        (event.admittedRestaurantCardRowCount ?? 0) <
          (event.backendRestaurantCountOnPage ?? Number.POSITIVE_INFINITY)
    );
    const matchingLoadingSurface = headerSourceEventsForSubmit.find(
      (event) =>
        isLineBetween(event, submitEvent.line, matchingCoverReveal?.line ?? endLine) &&
        (event.surfaceMode === 'initial_loading' || event.surfaceMode === 'interaction_loading')
    );
    return (
      !matchingGate ||
      !matchingMapSurfaceResultsByGate ||
      !matchingCardsReady ||
      !matchingMountedHidden ||
      !matchingCoverReveal ||
      !matchingCardRevealStart ||
      !matchingMarkerStart ||
      !matchingMarkerSettle ||
      earlyMarkerStart != null ||
      (!matchingVisualSource && !matchingReusedVisualSource) ||
      !matchingVisibleLabels ||
      earlyVisibleLabels != null ||
      !matchingRows ||
      badPartialFullRowsInCycle != null ||
      !matchingLoadingSurface
    );
  });
  if (scenarioIsMapRuntimeOnly) {
    pass(`shortcut submit cycle sheet/card gate skipped for map runtime scenario ${scenarioName}`);
  } else if (badSubmitCycle) {
    fail(
      `shortcut submit cycle missing gated loading/cards/map reveal before dismiss at line ${badSubmitCycle.line}`
    );
  } else {
    pass(`shortcut submit cycles gated cards/map reveal count=${submitPressEvents.length}`);
  }
}

const assertNonShortcutSubmitPathCycle = ({ eventName, label, pressEvents }) => {
  if (pressEvents.length === 0) {
    fail(`missing ${eventName} events for ${label}`);
    return;
  }

  const nativeMarkerEnterStarts = byEvent('native_marker_enter_started');
  const nativeMarkerEnterSettles = byEvent('native_marker_enter_settled');
  const nativeMountedHiddenEvents = byEvent('native_execution_batch_mounted_hidden_ready');
  const mapSurfaceResultsSourceFrameEvents = byEvent(
    'map_surface_results_source_frame_ready_contract'
  );
  const visualSources = byEvent('map_marker_visual_sources_contract');
  const pinLabelVisibilityEvents = byEvent('map_pin_label_visibility_contract');
  const countEventsForSubmit = byEvent('mounted_results_count_contract');

  const badCycle = pressEvents.find((pressEvent) => {
    const endLine =
      dismissPressEvents.find((dismissEvent) => dismissEvent.line > pressEvent.line)?.line ??
      Number.POSITIVE_INFINITY;
    const matchingGate = gateEvents.find((event) => isLineBetween(event, pressEvent.line, endLine));
    const matchingMapSurfaceResultsSourceFrame = mapSurfaceResultsSourceFrameEvents.find(
      (event) =>
        isLineBetween(event, pressEvent.line, endLine) &&
        event.hasVisualSources === true &&
        event.mapSearchSurfaceResultsSourcesReady === true &&
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        (event.labelCount ?? 0) > 0
    );
    const matchingVisualSource = visualSources.find(
      (event) =>
        isLineBetween(event, pressEvent.line, endLine) &&
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        (event.labelCount ?? 0) > 0 &&
        event.hasLabelCollisionSource === true &&
        event.nativeMapLabelCollisionPreserved === true
    );
    const matchingCardsReady = resultCardsReadyEvents.find(
      (event) => isLineBetween(event, pressEvent.line, endLine) && (event.activeRowCount ?? 0) > 0
    );
    const matchingMountedHidden = nativeMountedHiddenEvents.find((event) =>
      isLineBetween(event, matchingGate?.line ?? pressEvent.line, endLine)
    );
    const matchingCoverReveal = coverRevealStartEvents.find(
      (event) =>
        matchingCardsReady != null &&
        matchingMountedHidden != null &&
        isLineBetween(
          event,
          Math.max(matchingCardsReady.line, matchingMountedHidden.line),
          endLine
        ) &&
        isSameExecutionBatch(event, matchingMountedHidden)
    );
    const matchingCardRevealStart = resultCardsRevealStartEvents.find(
      (event) =>
        matchingCoverReveal != null &&
        isLineBetween(event, matchingCoverReveal.line - 1, endLine) &&
        isSameExecutionBatch(event, matchingCoverReveal) &&
        (eventDeltaMs(event, matchingCoverReveal) ?? Number.POSITIVE_INFINITY) <= 16
    );
    const matchingMarkerStart = nativeMarkerEnterStarts.find(
      (event) =>
        matchingCoverReveal != null &&
        isLineBetween(event, matchingCoverReveal.line - 1, endLine) &&
        isSameExecutionBatch(event, matchingCoverReveal) &&
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        (event.labelCount ?? 0) > 0 &&
        event.pinsLabelsDotsFadeTogether === true &&
        (eventDeltaMs(event, matchingCoverReveal) ?? Number.POSITIVE_INFINITY) <= 16
    );
    const earlyMarkerStart = nativeMarkerEnterStarts.find(
      (event) =>
        matchingCoverReveal != null &&
        isLineBetween(event, pressEvent.line, matchingCoverReveal.line) &&
        event.executionBatchId === matchingCoverReveal.executionBatchId
    );
    const matchingMarkerSettle = nativeMarkerEnterSettles.find(
      (event) =>
        isLineBetween(event, matchingMarkerStart?.line ?? pressEvent.line, endLine) &&
        (event.pinCount ?? 0) > 0 &&
        (event.dotCount ?? 0) > 0 &&
        (event.labelCount ?? 0) > 0 &&
        event.pinsLabelsDotsFadeTogether === true
    );
    const matchingVisibleLabels = pinLabelVisibilityEvents.find(
      (event) =>
        isLineBetween(event, matchingCoverReveal?.line ?? pressEvent.line, endLine) &&
        event.hasVisiblePinLabels === true &&
        (event.visibleLabelCount ?? 0) > 0
    );
    const earlyVisibleLabels = pinLabelVisibilityEvents.find(
      (event) =>
        matchingCoverReveal != null &&
        isLineBetween(event, pressEvent.line, matchingCoverReveal.line) &&
        event.hasVisiblePinLabels === true &&
        (event.visibleLabelCount ?? 0) > 0
    );
    const matchingRows =
      matchingCardsReady ??
      countEventsForSubmit.find(
        (event) =>
          isLineBetween(event, pressEvent.line, endLine) &&
          event.activeTab === 'restaurants' &&
          (event.admittedRestaurantCardRowCount ?? 0) > 0 &&
          (event.backendRestaurantCountOnPage ?? 0) > 0
      );
    return (
      !matchingGate ||
      !matchingMapSurfaceResultsSourceFrame ||
      !matchingVisualSource ||
      !matchingCardsReady ||
      !matchingMountedHidden ||
      !matchingCoverReveal ||
      !matchingCardRevealStart ||
      !matchingMarkerStart ||
      !matchingMarkerSettle ||
      earlyMarkerStart != null ||
      !matchingVisibleLabels ||
      earlyVisibleLabels != null ||
      !matchingRows
    );
  });

  if (badCycle) {
    fail(
      `${label} cycle missing rows/pins/labels/cover reveal after submit at line ${badCycle.line}`
    );
  } else {
    pass(
      `${label} cycles produced rows, pins, labels, and cover reveal count=${pressEvents.length}`
    );
  }
};

if ((report.scenarioName ?? '').includes('search_submit_natural')) {
  const naturalSubmitEvents = byEvent('natural_submit_attempt_contract').filter(
    (event) => event.append !== true
  );
  assertNonShortcutSubmitPathCycle({
    eventName: 'natural_submit_attempt_contract',
    label: 'natural submit',
    pressEvents: naturalSubmitEvents,
  });
}

if ((report.scenarioName ?? '').includes('search_this_area')) {
  const blockedSearchAreaEvents = byEvent('search_this_area_submit_blocked_contract');
  if (blockedSearchAreaEvents.length > 0) {
    fail(`Search This Area was blocked in scenario events=${blockedSearchAreaEvents.length}`);
  }
  const mapGestureEvents = byEvent('map_post_results_gesture_contract');
  const firstMapGestureLine =
    mapGestureEvents.length > 0
      ? Math.min(...mapGestureEvents.map((event) => event.line))
      : Number.NEGATIVE_INFINITY;
  const searchThisAreaGeometryEvents = byEvent(
    'search_this_area_visibility_geometry_contract'
  ).filter((event) => event.line > firstMapGestureLine);
  if (mapGestureEvents.length === 0) {
    fail('Search This Area scenario did not prove a real post-results map gesture');
  } else if (
    !searchThisAreaGeometryEvents.some(
      (event) =>
        event.visible === true &&
        event.enabled === true &&
        event.hasUsableGeometry === true &&
        Number(event.buttonWidth) >= 120 &&
        Number(event.buttonHeight) >= 36
    )
  ) {
    const latest = searchThisAreaGeometryEvents[searchThisAreaGeometryEvents.length - 1];
    fail(
      `Search This Area never became visible with usable geometry after map drag; latest=${JSON.stringify(
        {
          line: latest?.line ?? null,
          visible: latest?.visible,
          enabled: latest?.enabled,
          buttonWidth: latest?.buttonWidth,
          buttonHeight: latest?.buttonHeight,
          buttonY: latest?.buttonY,
          hasUsableGeometry: latest?.hasUsableGeometry,
        }
      )}`
    );
  } else {
    pass('Search This Area became visible with measured geometry after map drag');
  }
  if (searchThisAreaSubmitPressEvents.length === 0) {
    fail('missing Search This Area submit press-up contract');
  }
  const badSearchThisAreaPress = searchThisAreaSubmitPressEvents.find(
    (event) =>
      event.preserveSheetState !== true ||
      event.replaceResultsInPlace !== true ||
      event.forceFreshBounds !== true ||
      event.coverState !== 'interaction_loading' ||
      event.hasResults !== true ||
      event.isSearchSessionActive !== true ||
      event.isSearchLoading !== false ||
      event.isLoadingMore !== false ||
      typeof event.searchThisAreaSubmitId !== 'string' ||
      event.searchThisAreaSubmitId.length === 0 ||
      Number(event.queryLength ?? 0) <= 0 ||
      Number(event.submittedQueryLength ?? 0) <= 0
  );
  if (badSearchThisAreaPress) {
    fail(
      `Search This Area press-up contract failed at line ${
        badSearchThisAreaPress.line
      }: ${JSON.stringify({
        preserveSheetState: badSearchThisAreaPress.preserveSheetState,
        replaceResultsInPlace: badSearchThisAreaPress.replaceResultsInPlace,
        forceFreshBounds: badSearchThisAreaPress.forceFreshBounds,
        coverState: badSearchThisAreaPress.coverState,
        hasResults: badSearchThisAreaPress.hasResults,
        isSearchSessionActive: badSearchThisAreaPress.isSearchSessionActive,
        isSearchLoading: badSearchThisAreaPress.isSearchLoading,
        isLoadingMore: badSearchThisAreaPress.isLoadingMore,
        searchThisAreaSubmitId: badSearchThisAreaPress.searchThisAreaSubmitId,
        queryLength: badSearchThisAreaPress.queryLength,
        submittedQueryLength: badSearchThisAreaPress.submittedQueryLength,
      })}`
    );
  } else if (searchThisAreaSubmitPressEvents.length > 0) {
    pass(`Search This Area press-up contracts=${searchThisAreaSubmitPressEvents.length}`);
  }
  const boundsEvents = byEvent('search_this_area_request_bounds_contract');
  const pendingCoverEvents = byEvent('search_this_area_pending_cover_contract');
  const presentationEvents = byEvent('search_this_area_presentation_intent_contract');
  const nativePrerollEvents = byEvent('native_marker_preroll_started');
  const stageEvents = byEvent('cards_pins_transaction_stage_contract');
  const commitGateEvents = byEvent('cards_pins_transaction_commit_gate');
  const resultCardsReadyEvents = byEvent('result_cards_ready');
  const emptyRowsReadyEvents = byEvent('mounted_results_empty_rows_ready_contract');
  const missingBoundsProof = searchThisAreaSubmitPressEvents.find((pressEvent) => {
    const matchingMapMovementEvent = byEvent('map_post_results_movement_contract').find(
      (event) =>
        event.line < pressEvent.line &&
        event.materialUserGesture === true &&
        event.mapMovedSinceSearchRequested === true &&
        event.searchThisAreaRevealScheduled === true &&
        event.resultSheetSnapRequested === false &&
        (event.searchBaselineWouldMark === true || event.gestureBaselineWouldMark === true)
    );
    const matchingBoundsEvent = boundsEvents.find(
      (event) =>
        event.line > pressEvent.line &&
        event.searchThisAreaSubmitId === pressEvent.searchThisAreaSubmitId &&
        event.forceFreshBounds === true &&
        event.freshMapBoundsCaptured === true &&
        event.requestBoundsSource === 'map_visible_bounds'
    );
    const matchingPendingCoverEvent = pendingCoverEvents.find(
      (event) =>
        event.line > pressEvent.line &&
        (matchingBoundsEvent == null || event.line < matchingBoundsEvent.line) &&
        event.searchThisAreaSubmitId === pressEvent.searchThisAreaSubmitId &&
        event.coverState === 'interaction_loading' &&
        event.preserveSheetState === true &&
        event.loadingStateVisible === true &&
        event.searchSurfaceResultsTransactionKey == null &&
        event.mapSearchSurfaceResultsSourcesReady === false
    );
    return !matchingMapMovementEvent || !matchingBoundsEvent || !matchingPendingCoverEvent;
  });
  if (missingBoundsProof) {
    fail(
      `Search This Area rerun did not prove retained loading cover plus fresh visible bounds after press line ${missingBoundsProof.line}`
    );
  } else if (searchThisAreaSubmitPressEvents.length > 0) {
    pass(
      'Search This Area rerun used retained loading cover and fresh visible map bounds after user movement'
    );
  }
  const missingNativePrerollProof = searchThisAreaSubmitPressEvents.find((pressEvent) => {
    const matchingNativePrerollEvent = nativePrerollEvents.find(
      (event) =>
        event.line > pressEvent.line &&
        event.phase === 'covered' &&
        event.coverState === 'interaction_loading' &&
        Number(event.pinCount ?? 0) > 0 &&
        Number(event.dotCount ?? 0) > 0 &&
        Number(event.labelCount ?? 0) > 0
    );
    const firstNativeEnterAfterPress = byEvent('native_marker_enter_started').find(
      (event) => event.line > pressEvent.line
    );
    return (
      !matchingNativePrerollEvent ||
      (firstNativeEnterAfterPress != null &&
        matchingNativePrerollEvent.line > firstNativeEnterAfterPress.line)
    );
  });
  if (missingNativePrerollProof) {
    fail(
      `Search This Area rerun did not prove current pins/labels/dots preroll faded under interaction loading after press line ${missingNativePrerollProof.line}`
    );
  } else if (searchThisAreaSubmitPressEvents.length > 0) {
    pass('Search This Area rerun prerolled existing pins/labels/dots under retained loading cover');
  }
  const badFreshRevealProof = searchThisAreaSubmitPressEvents.find((pressEvent) => {
    const matchingPresentationEvent = presentationEvents.find(
      (event) =>
        event.line > pressEvent.line &&
        event.searchThisAreaSubmitId === pressEvent.searchThisAreaSubmitId &&
        event.mutationKind === 'search_this_area' &&
        event.coverState === 'interaction_loading' &&
        event.preserveSheetState === true &&
        event.targetSnap == null &&
        event.resultSheetBeginsSlidingUp === false &&
        event.loadingStateVisible === true &&
        event.queryPopulated !== false
    );
    const matchingBoundsEvent = boundsEvents.find(
      (event) =>
        event.line > pressEvent.line &&
        event.searchThisAreaSubmitId === pressEvent.searchThisAreaSubmitId &&
        event.forceFreshBounds === true &&
        event.freshMapBoundsCaptured === true &&
        event.requestBoundsSource === 'map_visible_bounds'
    );
    const matchingStageEvent =
      matchingPresentationEvent == null
        ? null
        : stageEvents.find(
            (event) =>
              event.line > matchingPresentationEvent.line &&
              event.transactionId === matchingPresentationEvent.transactionId &&
              event.searchThisAreaSubmitId === pressEvent.searchThisAreaSubmitId &&
              event.mutationKind === 'search_this_area' &&
              event.coverState === 'interaction_loading'
          );
    const stagedResultsSnapshotKey = matchingStageEvent?.resultsSnapshotKey ?? null;
    const expectedResultsSnapshotKey =
      matchingPresentationEvent?.expectedResultsSnapshotKey ?? null;
    const hasEarlyCommitBeforeFreshBounds =
      matchingPresentationEvent != null &&
      matchingBoundsEvent != null &&
      commitGateEvents.some(
        (event) =>
          event.line > matchingPresentationEvent.line &&
          event.line < matchingBoundsEvent.line &&
          event.transactionId === matchingPresentationEvent.transactionId &&
          event.searchThisAreaSubmitId === pressEvent.searchThisAreaSubmitId
      );
    const hasEarlyCardReadyBeforeFreshBounds =
      matchingPresentationEvent != null &&
      matchingBoundsEvent != null &&
      resultCardsReadyEvents.some(
        (event) =>
          event.line > matchingPresentationEvent.line &&
          event.line < matchingBoundsEvent.line &&
          event.transactionId === matchingPresentationEvent.transactionId &&
          event.searchThisAreaSubmitId === pressEvent.searchThisAreaSubmitId
      );
    const hasEarlyCoverRevealBeforeFreshBounds =
      matchingPresentationEvent != null &&
      matchingBoundsEvent != null &&
      coverRevealStartEvents.some(
        (event) =>
          event.line > matchingPresentationEvent.line &&
          event.line < matchingBoundsEvent.line &&
          event.transactionId === matchingPresentationEvent.transactionId
      );
    const matchingCardReadyEvent =
      matchingPresentationEvent == null || matchingBoundsEvent == null
        ? null
        : resultCardsReadyEvents.find((event) => {
            const activeRowCount = Number(event.activeRowCount ?? 0);
            return (
              event.line > matchingBoundsEvent.line &&
              event.transactionId === matchingPresentationEvent.transactionId &&
              event.searchThisAreaSubmitId === pressEvent.searchThisAreaSubmitId &&
              activeRowCount > 0 &&
              event.resultsSnapshotKey != null &&
              (expectedResultsSnapshotKey != null
                ? event.resultsSnapshotKey === expectedResultsSnapshotKey
                : stagedResultsSnapshotKey == null ||
                  event.resultsSnapshotKey !== stagedResultsSnapshotKey) &&
              (event.listFirstPaintReady === true ||
                event.readinessKey === event.resultsSnapshotKey)
            );
          });
    const matchingPinsReadyEvent =
      matchingPresentationEvent == null || matchingBoundsEvent == null
        ? null
        : commitGateEvents.find(
            (event) =>
              event.line > matchingBoundsEvent.line &&
              event.transactionId === matchingPresentationEvent.transactionId &&
              event.searchThisAreaSubmitId === pressEvent.searchThisAreaSubmitId &&
              event.kind === 'results_enter' &&
              event.resultsSnapshotKey != null &&
              (expectedResultsSnapshotKey != null
                ? event.resultsSnapshotKey === expectedResultsSnapshotKey
                : stagedResultsSnapshotKey == null ||
                  event.resultsSnapshotKey !== stagedResultsSnapshotKey) &&
              hasPreparedCardsReadySignal(event) &&
              event.mapSearchSurfaceResultsSourcesReady === true &&
              event.mapSearchSurfaceResultsSourcesReadyKey ===
                matchingPresentationEvent.transactionId
          );
    const matchingCoverRevealEvent =
      matchingPresentationEvent == null ||
      matchingCardReadyEvent == null ||
      matchingPinsReadyEvent == null
        ? null
        : coverRevealStartEvents.find(
            (event) =>
              event.line > matchingCardReadyEvent.line &&
              event.line > matchingPinsReadyEvent.line &&
              event.transactionId === matchingPresentationEvent.transactionId
          );
    const emptyRowsPublishedBeforeReveal =
      matchingCoverRevealEvent != null &&
      emptyRowsReadyEvents.some(
        (event) =>
          event.line > matchingBoundsEvent.line &&
          event.line < matchingCoverRevealEvent.line &&
          event.resultsHydrationKey === matchingPresentationEvent.transactionId
      );
    return (
      !matchingPresentationEvent ||
      !matchingBoundsEvent ||
      !matchingStageEvent ||
      hasEarlyCommitBeforeFreshBounds ||
      hasEarlyCardReadyBeforeFreshBounds ||
      hasEarlyCoverRevealBeforeFreshBounds ||
      !matchingCardReadyEvent ||
      !matchingPinsReadyEvent ||
      !matchingCoverRevealEvent ||
      emptyRowsPublishedBeforeReveal
    );
  });
  if (badFreshRevealProof) {
    fail(
      `Search This Area rerun did not prove retained-cover fresh-bounds cards/pins reveal after press line ${badFreshRevealProof.line}`
    );
  } else if (searchThisAreaSubmitPressEvents.length > 0) {
    pass(
      'Search This Area rerun kept interaction loading until fresh bounds, fresh cards, and fresh pins were ready'
    );
  }
  assertNonShortcutSubmitPathCycle({
    eventName: 'search_this_area_submit_press_up_contract',
    label: 'Search This Area rerun',
    pressEvents: searchThisAreaSubmitPressEvents,
  });
}

const apiFailureEvents = byScenarioEvent('api_request_failed_contract');
const apiRequestFailureLogLines = readLogLines()
  .map((line, index) => ({ line: index + 1, text: line }))
  .filter((line) => line.text.includes('API request failed'));
if (apiRequestFailureLogLines.length > 0 && apiFailureEvents.length === 0) {
  fail(
    `API request failures appeared without structured baseURL contract events: lines=${apiRequestFailureLogLines
      .slice(0, 5)
      .map((line) => line.line)
      .join(',')}`
  );
} else if (apiFailureEvents.length > 0) {
  const missingBaseUrl = apiFailureEvents.find(
    (event) => typeof event.baseURL !== 'string' || event.baseURL.length === 0
  );
  if (missingBaseUrl) {
    fail(`API request failure contract missing baseURL at line ${missingBaseUrl.line}`);
  } else {
    const first = apiFailureEvents[0];
    fail(
      `API request failures observed during perf scenario count=${
        apiFailureEvents.length
      }; first line=${first.line} baseURL=${first.baseURL} url=${first.url ?? '<unknown>'} status=${
        first.status ?? '<none>'
      }`
    );
  }
} else {
  pass('no API request failures observed during perf scenario');
}

const mapboxSourceErrorLogLines = readLogLines()
  .map((line, index) => ({ line: index + 1, text: line }))
  .filter(
    (line) =>
      line.text.includes('Mapbox [error] MapLoad error') &&
      /duplicate feature|non-exist feature|Failed to (add|remove|update)/.test(line.text)
  );
if (mapboxSourceErrorLogLines.length > 0) {
  fail(
    `Mapbox source mutation errors observed count=${mapboxSourceErrorLogLines.length}; first line=${
      mapboxSourceErrorLogLines[0].line
    } ${mapboxSourceErrorLogLines[0].text.slice(0, 220)}`
  );
} else {
  pass('no Mapbox source mutation errors observed');
}

if ((report.scenarioName ?? '').includes('search_submit_dismiss_repeat')) {
  const resultsDataReuseEvents = byEvent('results_data_reuse_contract');
  const sourceFrameDataReuseEvents = byEvent('map_source_frame_data_reuse_contract');
  const nativeFrameBridgeEvents = byEvent('native_set_render_frame_bridge_slice');
  if (resultsDataReuseEvents.length === 0) {
    fail('missing results_data_reuse_contract events for repeat submit data reuse');
  } else {
    const recomputedResultDataEvents = resultsDataReuseEvents.filter(
      (event) => event.markerPipelineRecomputed === true
    );
    if (recomputedResultDataEvents.length > 1) {
      fail(
        `repeat shortcut submits recomputed marker pipeline ${recomputedResultDataEvents.length} times; expected <= 1`
      );
    } else {
      const reuseEvents = resultsDataReuseEvents.filter(
        (event) => event.markerPipelineCacheHit === true
      );
      if (reuseEvents.length === 0) {
        fail(
          `repeat result data recompute count=${recomputedResultDataEvents.length} reuse events=0`
        );
      } else {
        pass(
          `repeat result data recompute count=${recomputedResultDataEvents.length} reuse events=${reuseEvents.length}`
        );
      }
    }
  }

  if (sourceFrameDataReuseEvents.length === 0) {
    fail('missing map_source_frame_data_reuse_contract events for repeat source-frame reuse');
  } else {
    const recomputedSourceTransactions = new Set(
      sourceFrameDataReuseEvents
        .filter((event) => event.sourceFrameDataRecomputed === true && event.transactionId != null)
        .map((event) => event.transactionId)
    );
    const reusedSourceTransactions = new Set(
      sourceFrameDataReuseEvents
        .filter((event) => event.sourceFrameDataReused === true && event.transactionId != null)
        .map((event) => event.transactionId)
    );
    const badSubmitWithoutSourceReuseSignal = submitPressEvents.find((submitEvent) => {
      const endLine =
        dismissPressEvents.find((dismissEvent) => dismissEvent.line > submitEvent.line)?.line ??
        Number.POSITIVE_INFINITY;
      return !sourceFrameDataReuseEvents.some(
        (event) =>
          isLineBetween(event, submitEvent.line, endLine) &&
          event.transactionId === submitEvent.transactionId &&
          (event.sourceFrameDataRecomputed === true || event.sourceFrameDataReused === true)
      );
    });
    const reusedSourceRepublishEvents = sourceFrameDataReuseEvents.filter(
      (event) => event.sourceFrameDataReused === true && event.didPublishSourceFrame === true
    );
    const cachedReplayNativeSourceApplies = nativeFrameBridgeEvents.filter(
      (event) =>
        (event.visualFrameTransactionKind === 'hidden_preload' ||
          event.visualFrameTransactionKind === 'enter') &&
        event.visualFrameSourceSnapshotKind === 'ready' &&
        Array.isArray(event.effectiveChangedSourceIds) &&
        event.effectiveChangedSourceIds.length >= 7 &&
        event.requestKey != null &&
        reusedSourceTransactions.has(event.requestKey)
    );
    if (recomputedSourceTransactions.size > 1) {
      fail(
        `repeat shortcut submits rebuilt source-frame data in ${recomputedSourceTransactions.size} transactions; expected <= 1`
      );
    } else if (badSubmitWithoutSourceReuseSignal) {
      fail(
        `repeat shortcut submit at line ${badSubmitWithoutSourceReuseSignal.line} has no source-frame data reuse/recompute contract`
      );
    } else if (reusedSourceTransactions.size > 0 && reusedSourceRepublishEvents.length === 0) {
      fail('repeat shortcut reused computed source data but did not republish a full source frame');
    } else if (reusedSourceTransactions.size > 0 && cachedReplayNativeSourceApplies.length === 0) {
      fail(
        'repeat shortcut reused computed source data but did not mount a fresh hidden native source frame'
      );
    } else {
      pass(
        `repeat source-frame recompute transactions=${recomputedSourceTransactions.size} reuse transactions=${reusedSourceTransactions.size}, full republish events=${reusedSourceRepublishEvents.length}, native applies=${cachedReplayNativeSourceApplies.length}`
      );
    }
  }
}

const countEvents = byEvent('mounted_results_count_contract').filter(
  (event) => event.activeTab === 'restaurants' && (event.backendRestaurantCountOnPage ?? 0) > 0
);
if (countEvents.length === 0) {
  fail('missing mounted_results_count_contract events with restaurant page data');
} else {
  const visualAdmissionEvent = countEvents.find(
    (event) =>
      event.mode === 'visual' &&
      (event.admittedRestaurantCardRowCount ?? 0) > 0 &&
      (event.admittedRestaurantCardRowCount ?? 0) <
        (event.backendRestaurantCountOnPage ?? Number.POSITIVE_INFINITY)
  );
  const fullCountEvent = countEvents.find(
    (event) =>
      event.mode === 'full' &&
      (event.rowsByTabRestaurantCardRowCount ?? 0) >=
        (event.backendRestaurantCountOnPage ?? Number.POSITIVE_INFINITY) &&
      (event.admittedRestaurantCardRowCount ?? 0) >=
        (event.backendRestaurantCountOnPage ?? Number.POSITIVE_INFINITY)
  );
  const badPreparedRowsEvent = countEvents.find(
    (event) =>
      event.mode === 'full' &&
      (event.rowsByTabRestaurantCardRowCount ?? 0) <
        (event.backendRestaurantCountOnPage ?? Number.POSITIVE_INFINITY)
  );
  if (badPreparedRowsEvent) {
    fail(
      `mounted result transaction rows did not match backend page count at line ${
        badPreparedRowsEvent.line
      }: ${JSON.stringify({
        rowsByTabRestaurantCardRowCount: badPreparedRowsEvent.rowsByTabRestaurantCardRowCount,
        backendRestaurantCountOnPage: badPreparedRowsEvent.backendRestaurantCountOnPage,
      })}`
    );
  } else {
    const latest = fullCountEvent ?? countEvents[countEvents.length - 1];
    pass(
      `mounted restaurant transaction rows match backend page count ${latest.rowsByTabRestaurantCardRowCount}/${latest.backendRestaurantCountOnPage}`
    );
  }

  const partialPageEvent = countEvents.find(
    (event) =>
      event.mode === 'full' &&
      (event.admittedRestaurantCardRowCount ?? 0) > 0 &&
      (event.admittedRestaurantCardRowCount ?? 0) <
        (event.backendRestaurantCountOnPage ?? Number.POSITIVE_INFINITY)
  );
  if (scenarioIsMapRuntimeOnly) {
    pass(`mounted results staged visual admission gate skipped for map runtime scenario ${scenarioName}`);
  } else if (partialPageEvent) {
    fail(
      `mounted result cards rendered partial first page at line ${
        partialPageEvent.line
      }: ${JSON.stringify({
        mode: partialPageEvent.mode,
        admittedRestaurantCardRowCount: partialPageEvent.admittedRestaurantCardRowCount,
        backendRestaurantCountOnPage: partialPageEvent.backendRestaurantCountOnPage,
        totalRestaurants: partialPageEvent.totalRestaurants,
      })}`
    );
  } else if (visualAdmissionEvent == null) {
    fail('mounted results never used staged visual admission before full-body release');
  } else {
    pass(
      `mounted restaurant visual admission ${visualAdmissionEvent.admittedRestaurantCardRowCount}/${visualAdmissionEvent.backendRestaurantCountOnPage}`
    );
    if (fullCountEvent != null) {
      pass(
        `mounted restaurant cards reached page count ${fullCountEvent.admittedRestaurantCardRowCount}/${countEvents[0].backendRestaurantCountOnPage}`
      );
      pass('mounted restaurant cards release full body after staged reveal admission');
    } else {
      pass(
        `mounted restaurant backend page count remains known while visual rows stay staged ${visualAdmissionEvent.admittedRestaurantCardRowCount}/${visualAdmissionEvent.backendRestaurantCountOnPage}`
      );
    }
  }
}

const rowHeaderBoundaryEvents = byEvent('result_row_header_chrome_boundary_contract');
if (scenarioIsMapRuntimeOnly) {
  pass(`result row header chrome boundary gate skipped for map runtime scenario ${scenarioName}`);
} else if (countEvents.length > 0) {
  if (rowHeaderBoundaryEvents.length === 0) {
    fail(
      'missing result_row_header_chrome_boundary_contract; runtime must emit firstRowTopY, headerChromeBottomY, rowHeaderOverlapPx, overlapsHeaderChrome, activeTab, surfaceMode, and transactionId when first result rows mount'
    );
  } else {
    const latestRowBoundaryByTransaction = new Map();
    rowHeaderBoundaryEvents.forEach((event) => {
      const key = event.transactionId ?? event.requestKey ?? `line:${event.line}`;
      const previous = latestRowBoundaryByTransaction.get(key);
      if (previous == null || event.line > previous.line) {
        latestRowBoundaryByTransaction.set(key, event);
      }
    });
    const latestRowBoundaryEvents = [...latestRowBoundaryByTransaction.values()];
    const badRowBoundary = latestRowBoundaryEvents.find((event) => {
      const firstRowTopY = Number(event.firstRowTopY);
      const headerChromeBottomY = Number(event.headerChromeBottomY);
      const rowHeaderOverlapPx = Number(event.rowHeaderOverlapPx ?? 0);
      return (
        event.activeTab !== 'restaurants' ||
        event.surfaceMode === 'initial_loading' ||
        event.overlapsHeaderChrome !== false ||
        !Number.isFinite(firstRowTopY) ||
        !Number.isFinite(headerChromeBottomY) ||
        firstRowTopY < headerChromeBottomY ||
        rowHeaderOverlapPx > 0
      );
    });
    if (badRowBoundary) {
      fail(
        `first result row occupied header chrome region at line ${
          badRowBoundary.line
        }: ${JSON.stringify({
          activeTab: badRowBoundary.activeTab,
          firstRowTopY: badRowBoundary.firstRowTopY,
          headerChromeBottomY: badRowBoundary.headerChromeBottomY,
          rowHeaderOverlapPx: badRowBoundary.rowHeaderOverlapPx,
          overlapsHeaderChrome: badRowBoundary.overlapsHeaderChrome,
          surfaceMode: badRowBoundary.surfaceMode,
          transactionId: badRowBoundary.transactionId,
        })}`
      );
    } else {
      pass(
        `first result row stayed below header chrome latestSamples=${latestRowBoundaryEvents.length} rawSamples=${rowHeaderBoundaryEvents.length}`
      );
    }
  }
}

const toggleEvents = byEvent('search_results_toggle_bar_contract');
const resultsTogglePressEvents = byEvent('results_toggle_press_up_contract');
const firstResultsLiveHeaderForToggle = byEvent('search_header_visual_contract').find(
  (event) => event.searchSheetContentLaneKind === 'results_live'
);
const firstResultsDismissLineForToggle =
  firstResultsLiveHeaderForToggle == null
    ? Number.POSITIVE_INFINITY
    : (dismissPressEvents.find((event) => event.line > firstResultsLiveHeaderForToggle.line)
        ?.line ?? Number.POSITIVE_INFINITY);
const resultToggleEvents =
  firstResultsLiveHeaderForToggle == null
    ? toggleEvents
    : toggleEvents.filter((event) =>
        isLineBetween(event, firstResultsLiveHeaderForToggle.line, firstResultsDismissLineForToggle)
      );
if (resultToggleEvents.length === 0) {
  fail('missing search_results_toggle_bar_contract events');
} else {
  const badToggle = resultToggleEvents.find(
    (event) =>
      event.inSheetBody !== true ||
      event.hostLayer !== 'SearchMountedSceneBody' ||
      event.hasCutoutMask !== true ||
      event.hasRestaurantsSegment !== true ||
      event.hasDishesSegment !== true ||
      event.hasOpenNowToggle !== true ||
      event.hasPriceToggle !== true ||
      event.hasVotesToggle !== true
  );
  if (badToggle) {
    fail(`results toggle bar contract failed at line ${badToggle.line}`);
  } else {
    pass(`results toggle bar contracts=${resultToggleEvents.length}`);
  }
}
if (resultsTogglePressEvents.length > 0) {
  const nativePrerollEvents = byEvent('native_marker_preroll_started');
  const missingTogglePreroll = resultsTogglePressEvents.find((pressEvent) => {
    const matchingPreroll = nativePrerollEvents.find(
      (event) =>
        event.line > pressEvent.line &&
        event.phase === 'covered' &&
        event.coverState === 'interaction_loading' &&
        Number(event.pinCount ?? 0) > 0 &&
        Number(event.dotCount ?? 0) > 0 &&
        Number(event.labelCount ?? 0) > 0
    );
    const firstNativeEnterAfterPress = byEvent('native_marker_enter_started').find(
      (event) => event.line > pressEvent.line
    );
    return (
      !matchingPreroll ||
      (firstNativeEnterAfterPress != null && matchingPreroll.line > firstNativeEnterAfterPress.line)
    );
  });
  if (missingTogglePreroll) {
    fail(
      `results toggle ${missingTogglePreroll.kind} did not preroll fade existing pins/labels/dots after press line ${missingTogglePreroll.line}`
    );
  } else {
    pass(
      `results toggles prerolled existing pins/labels/dots events=${resultsTogglePressEvents.length}`
    );
  }
}

const headerEvents = byEvent('search_header_visual_contract');
const headerSourceEvents = byEvent('search_results_header_source_contract');
const firstResultsLiveHeader = headerEvents.find(
  (event) => event.searchSheetContentLaneKind === 'results_live'
);
if (firstResultsLiveHeader) {
  const firstDismissLine =
    dismissPressEvents.find((event) => event.line > firstResultsLiveHeader.line)?.line ??
    Number.POSITIVE_INFINITY;
  const unstableHeaderSource = headerSourceEvents.find(
    (event) =>
      event.line > firstResultsLiveHeader.line &&
      event.line < firstDismissLine &&
      event.shouldShowResultsSurface === true &&
      event.hasListHeaderForRender !== true
  );
  if (unstableHeaderSource) {
    fail(
      `results toggle/header source disappeared during live results at line ${unstableHeaderSource.line}`
    );
  } else {
    const sampledHeaderSources = headerSourceEvents.filter(
      (event) => event.line > firstResultsLiveHeader.line && event.line < firstDismissLine
    );
    pass(
      `results toggle/header source stayed mounted during live results samples=${sampledHeaderSources.length}`
    );
  }
  const wrongChromeLane = headerSourceEvents.find(
    (event) =>
      event.hasStableHeaderChromeForRender === true &&
      (event.stableHeaderChromeLane !== 'mounted_results_list_header' ||
        event.stableHeaderChromeOwner !== 'search_mounted_results_list')
  );
  if (scenarioIsMapRuntimeOnly) {
    pass(`results toggle/header chrome lane gate skipped for map runtime scenario ${scenarioName}`);
  } else if (wrongChromeLane) {
    fail(
      `results toggle/header source mounted outside the mounted results list header lane at line ${wrongChromeLane.line}: ${wrongChromeLane.stableHeaderChromeLane}/${wrongChromeLane.stableHeaderChromeOwner}`
    );
  } else {
    pass('results toggle/header source stayed in the mounted results list header lane');
  }
}

if (!shouldAssertResultsDismissContracts) {
  pass(`results dismiss contracts skipped for non-dismiss scenario ${scenarioName || '<unknown>'}`);
} else if (dismissPressEvents.length === 0) {
  fail('missing results_dismiss_press_up_contract events');
} else {
  const badDismissPress = dismissPressEvents.find(
    (event) =>
      event.outgoingResultCardsHeldForDismissTransition !== true ||
      event.queryClearedToPlaceholder !== true ||
      event.queryHeldForDismissTransition !== false ||
      event.shortcutsFadeInRequested !== true ||
      event.pinsLabelsDotsFadeOutRequested !== true ||
      event.pinsLabelsFadeOutRequested !== true ||
      (event.resultSheetBeginsSlidingDown !== true && event.pollsSwitchImmediate !== true)
  );
  if (badDismissPress) {
    fail(`results dismiss press-up contract failed at line ${badDismissPress.line}`);
  } else {
    pass(`results dismiss press-up contracts=${dismissPressEvents.length}`);
  }
  const dismissWindows = dismissPressEvents.map((event) => ({
    dismissEvent: event,
    nextBoundaryLine:
      dismissBottomEvents.find((bottomEvent) => bottomEvent.line > event.line)?.line ??
      submitPressEvents.find((submitEvent) => submitEvent.line > event.line)?.line ??
      Number.POSITIVE_INFINITY,
  }));
  const missingOutgoingHeaderHold = dismissPressEvents.find((event) => {
    const nextBottomLine =
      dismissBottomEvents.find((bottomEvent) => bottomEvent.line > event.line)?.line ??
      Number.POSITIVE_INFINITY;
    return (
      !headerEvents.some(
        (headerEvent) =>
          headerEvent.line > event.line &&
          headerEvent.line < nextBottomLine &&
          headerEvent.chromeMode === 'results' &&
          headerEvent.searchSheetContentLaneKind === 'results_closing' &&
          headerEvent.shortcutsVisibleTarget === false
      ) &&
      !retainedDismissPrewarmEvents.some(
        (prewarmEvent) =>
          prewarmEvent.line >= event.line - 12 &&
          prewarmEvent.line < nextBottomLine &&
          prewarmEvent.activeTransactionId === event.transactionId &&
          prewarmEvent.transactionId === event.transactionId &&
          prewarmEvent.outgoingResultsChromeHeld === true &&
          prewarmEvent.searchSheetContentLaneKind === 'results_closing' &&
          prewarmEvent.canReleasePersistentPolls === false
      )
    );
  });
  if (missingOutgoingHeaderHold) {
    fail(
      `search header did not hold outgoing results chrome before bottom handoff after dismiss at line ${missingOutgoingHeaderHold.line}`
    );
  } else {
    pass('search header holds outgoing results chrome before bottom handoff');
  }
  const missingHeldResultsExitState = dismissPressEvents.find((event) => {
    const nextBottomLine =
      dismissBottomEvents.find((bottomEvent) => bottomEvent.line > event.line)?.line ??
      Number.POSITIVE_INFINITY;
    return (
      !headerEvents.some(
        (headerEvent) =>
          headerEvent.line > event.line &&
          headerEvent.line < nextBottomLine &&
          headerEvent.searchSurfacePhase === 'results_dismissing' &&
          headerEvent.searchSheetContentLaneKind === 'results_closing' &&
          headerEvent.canAdmitResultsBody === true &&
          headerEvent.shouldHoldResultsHeader === true &&
          headerEvent.shouldHoldSearchDisplayForPollRestore === false &&
          headerEvent.canReleasePersistentPolls === false &&
          headerEvent.bottomBandOwner === 'results_header' &&
          headerEvent.sheetClipMode === 'animatedSearchTransition'
      ) &&
      !retainedDismissPrewarmEvents.some(
        (prewarmEvent) =>
          prewarmEvent.line >= event.line - 12 &&
          prewarmEvent.line < nextBottomLine &&
          prewarmEvent.activeTransactionId === event.transactionId &&
          prewarmEvent.transactionId === event.transactionId &&
          prewarmEvent.outgoingResultsHeld === true &&
          prewarmEvent.outgoingResultsBodyAdmitted === true &&
          prewarmEvent.outgoingResultsChromeHeld === true &&
          prewarmEvent.searchSurfacePhase === 'results_dismissing' &&
          prewarmEvent.searchSheetContentLaneKind === 'results_closing' &&
          prewarmEvent.canReleasePersistentPolls === false &&
          prewarmEvent.bottomBandOwner === 'results_header' &&
          prewarmEvent.sheetClipMode === 'animatedSearchTransition'
      )
    );
  });
  if (missingHeldResultsExitState) {
    fail(
      `dismiss did not prove outgoing result body/header remained admitted with animated clip before bottom handoff at line ${missingHeldResultsExitState.line}`
    );
  } else {
    pass('dismiss keeps outgoing results admitted with animated nav clip before bottom handoff');
  }
  const badPreHandoffHeaderSample = dismissWindows.find(({ dismissEvent, nextBoundaryLine }) =>
    headerEvents.some((headerEvent) => {
      if (headerEvent.line <= dismissEvent.line || headerEvent.line >= nextBoundaryLine) {
        return false;
      }
      if (isAtomicReleaseTelemetryLead(headerEvent)) {
        return false;
      }
      return (
        headerEvent.chromeMode !== 'results' ||
        headerEvent.searchSheetContentLaneKind !== 'results_closing' ||
        headerEvent.canAdmitResultsBody !== true ||
        headerEvent.shouldHoldResultsHeader !== true ||
        headerEvent.shouldHoldSearchDisplayForPollRestore !== false ||
        headerEvent.canReleasePersistentPolls !== false ||
        headerEvent.bottomBandOwner !== 'results_header' ||
        headerEvent.sheetClipMode !== 'animatedSearchTransition'
      );
    })
  );
  if (badPreHandoffHeaderSample) {
    const badSample = headerEvents.find(
      (headerEvent) =>
        headerEvent.line > badPreHandoffHeaderSample.dismissEvent.line &&
        headerEvent.line < badPreHandoffHeaderSample.nextBoundaryLine &&
        !isAtomicReleaseTelemetryLead(headerEvent) &&
        (headerEvent.chromeMode !== 'results' ||
          headerEvent.searchSheetContentLaneKind !== 'results_closing' ||
          headerEvent.canAdmitResultsBody !== true ||
          headerEvent.shouldHoldResultsHeader !== true ||
          headerEvent.shouldHoldSearchDisplayForPollRestore !== false ||
          headerEvent.canReleasePersistentPolls !== false ||
          headerEvent.bottomBandOwner !== 'results_header' ||
          headerEvent.sheetClipMode !== 'animatedSearchTransition')
    );
    fail(
      `dismiss pre-boundary header sample dropped outgoing results before handoff at line ${
        badSample?.line ?? badPreHandoffHeaderSample.dismissEvent.line
      }: ${JSON.stringify({
        bottomBandOwner: badSample?.bottomBandOwner ?? null,
        canAdmitResultsBody: badSample?.canAdmitResultsBody ?? null,
        canReleasePersistentPolls: badSample?.canReleasePersistentPolls ?? null,
        chromeMode: badSample?.chromeMode ?? null,
        searchSheetContentLaneKind: badSample?.searchSheetContentLaneKind ?? null,
        sheetClipMode: badSample?.sheetClipMode ?? null,
        shouldHoldResultsHeader: badSample?.shouldHoldResultsHeader ?? null,
      })}`
    );
  } else {
    pass('dismiss pre-boundary header samples keep outgoing results ownership until boundary');
  }
  const badPreHandoffHeaderSourceSample = dismissWindows.find(
    ({ dismissEvent, nextBoundaryLine }) =>
      headerSourceEvents.some((sourceEvent) => {
        if (sourceEvent.line <= dismissEvent.line || sourceEvent.line >= nextBoundaryLine) {
          return false;
        }
        return (
          sourceEvent.shouldShowResultsSurface !== true ||
          sourceEvent.hasListHeaderForRender !== true ||
          sourceEvent.hasStableHeaderChromeForRender !== true
        );
      })
  );
  if (badPreHandoffHeaderSourceSample) {
    const badSource = headerSourceEvents.find(
      (sourceEvent) =>
        sourceEvent.line > badPreHandoffHeaderSourceSample.dismissEvent.line &&
        sourceEvent.line < badPreHandoffHeaderSourceSample.nextBoundaryLine &&
        (sourceEvent.shouldShowResultsSurface !== true ||
          sourceEvent.hasListHeaderForRender !== true ||
          sourceEvent.hasStableHeaderChromeForRender !== true)
    );
    fail(
      `dismiss pre-boundary source sample dropped cards/header to strip-only at line ${
        badSource?.line ?? badPreHandoffHeaderSourceSample.dismissEvent.line
      }: ${JSON.stringify({
        hasListHeaderForRender: badSource?.hasListHeaderForRender ?? null,
        hasStableHeaderChromeForRender: badSource?.hasStableHeaderChromeForRender ?? null,
        shouldShowResultsSurface: badSource?.shouldShowResultsSurface ?? null,
        surfaceMode: badSource?.surfaceMode ?? null,
      })}`
    );
  } else {
    pass('dismiss pre-boundary source samples never drop cards/header to strip-only');
  }
  const boundaryBeforePollReady = byEvent('search_dismiss_motion_plane_contract').find(
    (event) => event.boundaryReached === true && event.pollPageReadyForBoundary !== true
  );
  if (boundaryBeforePollReady) {
    fail(
      `dismiss motion plane reached collapsed boundary before poll page readiness at line ${boundaryBeforePollReady.line}`
    );
  } else {
    pass('dismiss motion plane only reaches collapsed boundary after poll page readiness');
  }
  const resultHeaderOnlyRiskSample = byEvent('search_dismiss_motion_plane_contract').find(
    (event) => {
      const progress = numeric(event.dismissProgress);
      return (
        event.pollPageReadyForBoundary === true &&
        event.boundaryReached !== true &&
        progress != null &&
        progress > 0.82
      );
    }
  );
  if (resultHeaderOnlyRiskSample) {
    fail(
      `dismiss motion plane let ready poll wait while outgoing results descended into collapsed header-only risk at line ${
        resultHeaderOnlyRiskSample.line
      }: ${JSON.stringify({
        boundaryReached: resultHeaderOnlyRiskSample.boundaryReached ?? null,
        dismissProgress: resultHeaderOnlyRiskSample.dismissProgress ?? null,
        boundaryY: resultHeaderOnlyRiskSample.boundaryY ?? null,
        physicalCollapsedSettled: resultHeaderOnlyRiskSample.physicalCollapsedSettled ?? null,
        pollPageReadyForBoundary: resultHeaderOnlyRiskSample.pollPageReadyForBoundary ?? null,
        sheetY: resultHeaderOnlyRiskSample.sheetY ?? null,
      })}`
    );
  } else {
    pass('dismiss motion plane reaches handoff before outgoing results can become header-only');
  }
  const badHandoffGeometrySample = byEvent('search_dismiss_motion_plane_contract').find((event) => {
    const sheetY = numeric(event.sheetY);
    const boundaryY = numeric(event.boundaryY);
    return (
      event.boundaryReached === true &&
      event.pollPageReleasedForBoundary !== true &&
      event.physicalCollapsedSettled !== true &&
      sheetY != null &&
      boundaryY != null &&
      sheetY > boundaryY + 8
    );
  });
  if (badHandoffGeometrySample) {
    fail(
      `dismiss motion plane boundary happened after the complete-result handoff geometry at line ${
        badHandoffGeometrySample.line
      }: ${JSON.stringify({
        boundaryY: badHandoffGeometrySample.boundaryY ?? null,
        physicalCollapsedSettled: badHandoffGeometrySample.physicalCollapsedSettled ?? null,
        pollPageReleasedForBoundary: badHandoffGeometrySample.pollPageReleasedForBoundary ?? null,
        sheetY: badHandoffGeometrySample.sheetY ?? null,
      })}`
    );
  } else {
    pass('dismiss motion plane boundary geometry stays at the complete-result handoff band');
  }
  const boundaryWithoutPollReleaseSample = byEvent('search_dismiss_motion_plane_contract').find(
    (event) =>
      event.boundaryReached === true &&
      event.pollPageReadyForBoundary === true &&
      event.pollPageReleasedForBoundary !== true &&
      event.physicalCollapsedSettled !== true
  );
  if (boundaryWithoutPollReleaseSample) {
    fail(
      `dismiss motion plane reached handoff without same-sample poll ownership release at line ${
        boundaryWithoutPollReleaseSample.line
      }: ${JSON.stringify({
        boundaryY: boundaryWithoutPollReleaseSample.boundaryY ?? null,
        physicalCollapsedSettled: boundaryWithoutPollReleaseSample.physicalCollapsedSettled ?? null,
        pollPageReadyForBoundary: boundaryWithoutPollReleaseSample.pollPageReadyForBoundary ?? null,
        pollPageReleasedForBoundary:
          boundaryWithoutPollReleaseSample.pollPageReleasedForBoundary ?? null,
        sheetY: boundaryWithoutPollReleaseSample.sheetY ?? null,
      })}`
    );
  } else {
    pass('dismiss motion plane handoff releases poll ownership in the boundary sample');
  }
  const badPreHandoffExitState = headerEvents.find((headerEvent) => {
    if (
      headerEvent.searchSurfacePhase !== 'results_dismissing' ||
      headerEvent.searchSheetContentLaneKind !== 'results_closing'
    ) {
      return false;
    }
    const dismissEvent = dismissPressEvents.filter((event) => event.line < headerEvent.line).at(-1);
    if (!dismissEvent) {
      return false;
    }
    const nextBottomLine =
      dismissBottomEvents.find((bottomEvent) => bottomEvent.line > dismissEvent.line)?.line ??
      Number.POSITIVE_INFINITY;
    if (headerEvent.line >= nextBottomLine) {
      return false;
    }
    if (isAtomicReleaseTelemetryLead(headerEvent)) {
      return false;
    }
    return (
      headerEvent.canAdmitResultsBody !== true ||
      headerEvent.shouldHoldResultsHeader !== true ||
      headerEvent.canReleasePersistentPolls !== false ||
      headerEvent.sheetClipMode !== 'animatedSearchTransition'
    );
  });
  if (badPreHandoffExitState) {
    fail(
      `dismiss pre-boundary exit state can drop outgoing cards/header or jump clip at line ${
        badPreHandoffExitState.line
      }: ${JSON.stringify({
        canAdmitResultsBody: badPreHandoffExitState.canAdmitResultsBody,
        shouldHoldResultsHeader: badPreHandoffExitState.shouldHoldResultsHeader,
        canReleasePersistentPolls: badPreHandoffExitState.canReleasePersistentPolls,
        sheetClipMode: badPreHandoffExitState.sheetClipMode,
        searchSheetContentLaneKind: badPreHandoffExitState.searchSheetContentLaneKind,
      })}`
    );
  } else {
    pass('dismiss pre-boundary exit state never drops cards/header or jumps clip');
  }
}

if (dismissPressEvents.length > 0 && dismissBottomEvents.length === 0) {
  fail('missing results_dismiss_bottom_snap_handoff_contract events');
} else if (dismissBottomEvents.length > 0) {
  const badDismissBottom = dismissBottomEvents.find((event) => {
    const releaseDelayMs =
      numeric(event.releaseDelayAfterCollapsedBoundaryMs) ??
      numeric(event.releaseDelayAfterCollapsedBoundaryMs);
    return (
      event.persistentPollsSwitchAtBottomSnap !== true ||
      event.snap !== 'collapsed' ||
      event.boundaryTrigger !== 'collapsed_motion_plane_boundary' ||
      event.canExposePersistentPolls !== true ||
      event.canReleasePersistentPolls !== true ||
      event.isPersistentPollHostReady !== true ||
      event.releasedAtCollapsedBoundary !== true ||
      releaseDelayMs == null ||
      releaseDelayMs > MAX_HANDOFF_RELEASE_DELAY_MS
    );
  });
  if (badDismissBottom) {
    fail(
      `results dismiss bottom snap handoff released late or without renderable polls at line ${
        badDismissBottom.line
      }: ${JSON.stringify({
        canExposePersistentPolls: badDismissBottom.canExposePersistentPolls ?? null,
        canReleasePersistentPolls: badDismissBottom.canReleasePersistentPolls ?? null,
        boundaryTrigger: badDismissBottom.boundaryTrigger ?? null,
        isPersistentPollHostReady: badDismissBottom.isPersistentPollHostReady ?? null,
        releaseDelayAfterCollapsedBoundaryMs:
          badDismissBottom.releaseDelayAfterCollapsedBoundaryMs ??
          badDismissBottom.releaseDelayAfterCollapsedBoundaryMs ??
          null,
        releasedAtCollapsedBoundary: badDismissBottom.releasedAtCollapsedBoundary ?? null,
      })}`
    );
  } else if (
    dismissPressEvents.some(
      (dismissEvent) =>
        dismissEvent.resultSheetBeginsSlidingDown === true &&
        !dismissCollapsedBoundaryBoundaryEvents.some(
          (boundaryEvent) =>
            boundaryEvent.line > dismissEvent.line &&
            boundaryEvent.boundaryTrigger === 'collapsed_reached' &&
            boundaryEvent.boundarySource === 'motion_plane' &&
            boundaryEvent.persistentPollsSwitchAtBottomSnap === true
        )
    )
  ) {
    fail('results dismiss did not observe collapsed boundary preparation boundary before handoff');
  } else if (
    dismissPressEvents.some(
      (dismissEvent) =>
        dismissEvent.resultSheetBeginsSlidingDown === true &&
        !dismissBottomEvents.some(
          (bottomEvent) =>
            bottomEvent.line > dismissEvent.line &&
            bottomEvent.boundaryTrigger === 'collapsed_motion_plane_boundary'
        )
    )
  ) {
    fail('results dismiss handoff did not switch at collapsed boundary');
  } else if (
    dismissPressEvents.some((dismissEvent) => {
      if (dismissEvent.resultSheetBeginsSlidingDown !== true) {
        return false;
      }
      const bottomEvent = dismissBottomEvents.find(
        (event) =>
          event.line > dismissEvent.line &&
          event.boundaryTrigger === 'collapsed_motion_plane_boundary'
      );
      const collapsedBoundaryBoundaryEvent = dismissCollapsedBoundaryBoundaryEvents.find(
        (event) => event.line > dismissEvent.line && event.boundarySource === 'motion_plane'
      );
      const nextHeaderPersistentPoll = byEvent('search_header_visual_contract').find(
        (event) =>
          event.line > dismissEvent.line && event.searchSheetContentLaneKind === 'persistent_poll'
      );
      return (
        Boolean(nextHeaderPersistentPoll && bottomEvent) &&
        nextHeaderPersistentPoll.line < bottomEvent.line &&
        !(
          collapsedBoundaryBoundaryEvent != null &&
          collapsedBoundaryBoundaryEvent.line < nextHeaderPersistentPoll.line
        )
      );
    })
  ) {
    fail('results sheet switched to persistent polls before collapsed visual-boundary handoff');
  } else if (
    dismissBottomEvents.some((bottomEvent) => {
      const restoreEvents = [
        ...persistentPollsRestoreSettleEvents,
        ...persistentPollsRestoreStateEvents,
      ];
      if (restoreEvents.length === 0) {
        return false;
      }
      const hasKnownCollapsedStateBeforeHandoff = persistentPollsRestoreStateEvents.some(
        (restoreEvent) =>
          restoreEvent.line < bottomEvent.line &&
          restoreEvent.currentSnap === 'collapsed' &&
          restoreEvent.restoredToCollapsed === true
      );
      return (
        !restoreEvents.some((restoreEvent) => {
          if (restoreEvent.line <= bottomEvent.line || restoreEvent.restoredToCollapsed !== true) {
            return false;
          }
          if ('snap' in restoreEvent) {
            return (
              restoreEvent.restoreIntentSnap === 'collapsed' && restoreEvent.snap === 'collapsed'
            );
          }
          return restoreEvent.currentSnap === 'collapsed';
        }) && !hasKnownCollapsedStateBeforeHandoff
      );
    })
  ) {
    fail('persistent polls did not settle collapsed after results bottom handoff');
  } else {
    pass(`results dismiss bottom snap handoff contracts=${dismissBottomEvents.length}`);
  }
}

if (dismissBottomEvents.length > 0) {
  const missingPrewarmBeforeCollapsedBoundary = dismissPressEvents.find((dismissEvent) => {
    const boundaryEvent = dismissCollapsedBoundaryBoundaryEvents.find(
      (event) => event.line > dismissEvent.line && event.boundarySource === 'motion_plane'
    );
    if (!boundaryEvent) {
      return false;
    }
    const readyParts = new Set(
      pollPageReadyEvents
        .filter(
          (event) =>
            event.line <= boundaryEvent.line &&
            event.accepted === true &&
            event.transactionId === dismissEvent.transactionId
        )
        .map((event) => event.part)
    );
    const hasReadySummary = pollPageReadySummaryEvents.some(
      (event) =>
        event.line <= boundaryEvent.line &&
        event.accepted === true &&
        event.activeTransactionId === dismissEvent.transactionId &&
        event.transactionId === dismissEvent.transactionId &&
        event.pollHeaderReady === true &&
        event.pollBodyReady === true &&
        event.pollHostReady === true
    );
    const hasRetainedPrewarmSummary = retainedDismissPrewarmEvents.some(
      (event) =>
        event.line >= dismissEvent.line - 12 &&
        event.line <= boundaryEvent.line &&
        event.accepted === true &&
        event.activeTransactionId === dismissEvent.transactionId &&
        event.transactionId === dismissEvent.transactionId &&
        event.pollPageReadyBeforeMotion === true &&
        event.pollHeaderReady === true &&
        event.pollBodyReady === true &&
        event.pollHostReady === true &&
        event.outgoingResultsHeld === true &&
        event.outgoingResultsBodyAdmitted === true &&
        event.bottomBandOwner === 'results_header'
    );
    return (
      !(
        (readyParts.has('header') && readyParts.has('body') && readyParts.has('host')) ||
        hasReadySummary ||
        hasRetainedPrewarmSummary
      ) &&
      !headerEvents.some(
        (event) =>
          event.line < boundaryEvent.line &&
          event.searchSurfacePhase === 'results_dismissing' &&
          event.searchSheetContentLaneKind === 'results_closing' &&
          event.canExposePersistentPolls === true &&
          event.canReleasePersistentPolls === false &&
          event.shouldHoldSearchDisplayForPollRestore === false &&
          event.bottomBandOwner === 'results_header'
      )
    );
  });
  if (missingPrewarmBeforeCollapsedBoundary) {
    fail(
      `persistent polls were not prewarmed while results stayed visible before collapsed boundary after dismiss at line ${missingPrewarmBeforeCollapsedBoundary.line}`
    );
  } else {
    pass('persistent polls prewarm before collapsed boundary while results remain visible');
  }
}

if (dismissBottomEvents.length > 0) {
  const isVisiblePersistentPollSheetHostEvent = (event) =>
    event.isPersistentPollLane === true &&
    event.displayedSceneKey === 'polls' &&
    event.sheetPresentationSceneKey === 'polls' &&
    event.activeSemanticOverlayKey === 'polls' &&
    event.overlaySheetVisible === true &&
    event.runtimeConfigVisible === true &&
    event.canRenderSurface === true &&
    event.isRenderable === true;
  const isAtomicPersistentPollHandoffHostEvent = (event) =>
    isVisiblePersistentPollSheetHostEvent(event) &&
    event.searchSurfacePhase === 'results_dismissing' &&
    event.searchSurfaceBottomBandOwner === 'persistent_polls' &&
    event.searchSurfaceCanReleasePersistentPolls === true &&
    event.navSilhouetteSheetClipMode === 'dockedPersistentPoll' &&
    event.frameHostSheetClipMode !== 'animatedSearchTransition';
  const isMountedPersistentPollHeaderEvent = (event) =>
    event.sheetContentLaneKind === 'persistent_poll' &&
    event.displayedSceneKey === 'polls' &&
    event.sheetPresentationSceneKey === 'polls' &&
    event.isMounted === true &&
    event.headerSurfaceKind === 'mounted' &&
    event.mountedChromeKey === 'polls' &&
    event.mountedBodyKey === 'polls' &&
    event.pollsHeaderChromeNonNull === true &&
    event.pollsBodyMountedContentNonNull === true &&
    event.shouldAttachMountedContent === true;

  const badDismissSheetHostEvent = dismissPressEvents.find((dismissEvent) => {
    const hostEventsAfterDismiss = persistentPollsSheetHostEvents.filter(
      (event) => event.line > dismissEvent.line
    );
    if (hostEventsAfterDismiss.length === 0) {
      return true;
    }
    const latestHostEvent = hostEventsAfterDismiss[hostEventsAfterDismiss.length - 1];
    return !isVisiblePersistentPollSheetHostEvent(latestHostEvent);
  });

  if (badDismissSheetHostEvent) {
    const hostEventsAfterDismiss = persistentPollsSheetHostEvents.filter(
      (event) => event.line > badDismissSheetHostEvent.line
    );
    const latestHostEvent = hostEventsAfterDismiss[hostEventsAfterDismiss.length - 1] ?? null;
    fail(
      `persistent polls sheet host was not visible/renderable after results dismiss at line ${
        badDismissSheetHostEvent.line
      }: ${JSON.stringify({
        activeSemanticOverlayKey: latestHostEvent?.activeSemanticOverlayKey ?? null,
        canRenderSurface: latestHostEvent?.canRenderSurface ?? null,
        displayedSceneKey: latestHostEvent?.displayedSceneKey ?? null,
        hasHeaderComponent: latestHostEvent?.hasHeaderComponent ?? null,
        isPersistentPollLane: latestHostEvent?.isPersistentPollLane ?? null,
        isRenderable: latestHostEvent?.isRenderable ?? null,
        overlaySheetVisible: latestHostEvent?.overlaySheetVisible ?? null,
        runtimeConfigVisible: latestHostEvent?.runtimeConfigVisible ?? null,
        sheetPresentationSceneKey: latestHostEvent?.sheetPresentationSceneKey ?? null,
      })}`
    );
  } else {
    pass(`persistent polls sheet host restore contracts=${persistentPollsSheetHostEvents.length}`);
  }

  const badAtomicHandoff = dismissBottomEvents.find((bottomEvent) => {
    const dismissEvent =
      dismissPressEvents.filter((event) => event.line < bottomEvent.line).at(-1) ?? null;
    const startLine = dismissEvent?.line ?? 0;
    const atomicHost = persistentPollsSheetHostEvents.find(
      (event) =>
        event.line > startLine &&
        event.line <= bottomEvent.line &&
        isAtomicPersistentPollHandoffHostEvent(event)
    );
    const mountedPollHeader = persistentPollsSceneHeaderEvents.find(
      (event) => event.line <= bottomEvent.line && isMountedPersistentPollHeaderEvent(event)
    );
    return !mountedPollHeader || !atomicHost;
  });
  if (badAtomicHandoff) {
    const dismissEvent =
      dismissPressEvents.filter((event) => event.line < badAtomicHandoff.line).at(-1) ?? null;
    const startLine = dismissEvent?.line ?? 0;
    const latestHost =
      persistentPollsSheetHostEvents
        .filter((event) => event.line > startLine && event.line <= badAtomicHandoff.line)
        .at(-1) ?? null;
    const latestHeader =
      persistentPollsSceneHeaderEvents
        .filter((event) => event.line <= badAtomicHandoff.line)
        .at(-1) ?? null;
    fail(
      `dismiss handoff did not atomically expose docked renderable persistent polls at line ${
        badAtomicHandoff.line
      }: ${JSON.stringify({
        activeSemanticOverlayKey: latestHost?.activeSemanticOverlayKey ?? null,
        displayedSceneKey: latestHost?.displayedSceneKey ?? null,
        frameHostSheetClipMode: latestHost?.frameHostSheetClipMode ?? null,
        mountedBodyKey: latestHeader?.mountedBodyKey ?? null,
        mountedChromeKey: latestHeader?.mountedChromeKey ?? null,
        navSilhouetteSheetClipMode: latestHost?.navSilhouetteSheetClipMode ?? null,
        pollsBodyMountedContentNonNull: latestHeader?.pollsBodyMountedContentNonNull ?? null,
        pollsHeaderChromeNonNull: latestHeader?.pollsHeaderChromeNonNull ?? null,
        searchSurfaceBottomBandOwner: latestHost?.searchSurfaceBottomBandOwner ?? null,
        searchSurfaceCanReleasePersistentPolls:
          latestHost?.searchSurfaceCanReleasePersistentPolls ?? null,
        sheetPresentationSceneKey: latestHost?.sheetPresentationSceneKey ?? null,
      })}`
    );
  } else {
    pass('dismiss handoff atomically exposes docked renderable persistent polls');
  }

  const resultHeaderOnlyAfterBoundary = dismissBottomEvents.find((bottomEvent) => {
    const nextAtomicHostLine =
      persistentPollsSheetHostEvents.find(
        (event) => event.line >= bottomEvent.line && isAtomicPersistentPollHandoffHostEvent(event)
      )?.line ?? Number.POSITIVE_INFINITY;
    return headerSourceEvents.some(
      (event) =>
        event.line >= bottomEvent.line &&
        event.line < nextAtomicHostLine &&
        event.stableHeaderChromeOwner === 'result_page' &&
        (event.shouldShowResultsSurface !== true || event.hasListHeaderForRender !== true)
    );
  });
  if (resultHeaderOnlyAfterBoundary) {
    const nextAtomicHostLine =
      persistentPollsSheetHostEvents.find(
        (event) =>
          event.line >= resultHeaderOnlyAfterBoundary.line &&
          isAtomicPersistentPollHandoffHostEvent(event)
      )?.line ?? Number.POSITIVE_INFINITY;
    const badHeaderSource = headerSourceEvents.find(
      (event) =>
        event.line >= resultHeaderOnlyAfterBoundary.line &&
        event.line < nextAtomicHostLine &&
        event.stableHeaderChromeOwner === 'result_page' &&
        (event.shouldShowResultsSurface !== true || event.hasListHeaderForRender !== true)
    );
    fail(
      `dismiss handoff exposed result-header-only chrome after boundary at line ${
        badHeaderSource?.line ?? resultHeaderOnlyAfterBoundary.line
      }: ${JSON.stringify({
        hasListHeaderForRender: badHeaderSource?.hasListHeaderForRender ?? null,
        shouldShowResultsSurface: badHeaderSource?.shouldShowResultsSurface ?? null,
        stableHeaderChromeOwner: badHeaderSource?.stableHeaderChromeOwner ?? null,
        surfaceMode: badHeaderSource?.surfaceMode ?? null,
      })}`
    );
  } else {
    pass('dismiss handoff never exposes result-header-only chrome after boundary');
  }

  const mountedPollHeaderEvent = persistentPollsSceneHeaderEvents.find(
    isMountedPersistentPollHeaderEvent
  );
  if (!mountedPollHeaderEvent) {
    const latestHeaderEvent =
      persistentPollsSceneHeaderEvents[persistentPollsSceneHeaderEvents.length - 1] ?? null;
    fail(
      `persistent polls mounted header/body contract was not satisfied: ${JSON.stringify({
        headerSurfaceKind: latestHeaderEvent?.headerSurfaceKind ?? null,
        isMounted: latestHeaderEvent?.isMounted ?? null,
        mountedBodyKey: latestHeaderEvent?.mountedBodyKey ?? null,
        mountedChromeKey: latestHeaderEvent?.mountedChromeKey ?? null,
        pollsBodyMountedContentNonNull: latestHeaderEvent?.pollsBodyMountedContentNonNull ?? null,
        pollsHeaderChromeNonNull: latestHeaderEvent?.pollsHeaderChromeNonNull ?? null,
        shouldAttachMountedContent: latestHeaderEvent?.shouldAttachMountedContent ?? null,
        shouldRunDataLane: latestHeaderEvent?.shouldRunDataLane ?? null,
        shouldSubscribeDataLane: latestHeaderEvent?.shouldSubscribeDataLane ?? null,
      })}`
    );
  } else {
    pass(
      `persistent polls mounted header/body contracts=${persistentPollsSceneHeaderEvents.length}`
    );
  }

  const badPersistentPollLaneRelease = dismissPressEvents.find((dismissEvent) => {
    const releaseLine =
      dismissBottomEvents.find((bottomEvent) => bottomEvent.line > dismissEvent.line)?.line ??
      submitPressEvents.find((submitEvent) => submitEvent.line > dismissEvent.line)?.line ??
      Number.POSITIVE_INFINITY;
    const persistentPollLaneEvent = byEvent('search_header_visual_contract').find(
      (event) =>
        event.line > dismissEvent.line &&
        event.line < releaseLine &&
        event.searchSheetContentLaneKind === 'persistent_poll' &&
        !isAtomicReleaseTelemetryLead(event)
    );
    if (!persistentPollLaneEvent) {
      return false;
    }
    const mountedPollHeaderBeforeRelease = persistentPollsSceneHeaderEvents.find(
      (event) =>
        event.line > dismissEvent.line &&
        event.line <= persistentPollLaneEvent.line &&
        isMountedPersistentPollHeaderEvent(event)
    );
    const renderablePollHostBeforeRelease = persistentPollsSheetHostEvents.find(
      (event) =>
        event.line > dismissEvent.line &&
        event.line <= persistentPollLaneEvent.line &&
        isVisiblePersistentPollSheetHostEvent(event)
    );
    return !mountedPollHeaderBeforeRelease || !renderablePollHostBeforeRelease;
  });
  if (badPersistentPollLaneRelease) {
    fail(
      `persistent_poll lane became visible before mounted poll body and renderable host were proven after dismiss at line ${badPersistentPollLaneRelease.line}`
    );
  } else {
    pass('persistent_poll lane waits for mounted poll body and renderable host');
  }
}

if (dismissBottomEvents.length > 0) {
  const isMountedRenderablePersistentPollHeaderEvent = (event) =>
    event.sheetContentLaneKind === 'persistent_poll' &&
    event.displayedSceneKey === 'polls' &&
    event.sheetPresentationSceneKey === 'polls' &&
    event.isMounted === true &&
    event.headerSurfaceKind === 'mounted' &&
    event.mountedChromeKey === 'polls' &&
    event.mountedBodyKey === 'polls' &&
    event.pollsHeaderChromeNonNull === true &&
    event.pollsBodyMountedContentNonNull === true &&
    event.shouldAttachMountedContent === true;
  const isVisibleRenderablePersistentPollHostEvent = (event) =>
    event.isPersistentPollLane === true &&
    event.displayedSceneKey === 'polls' &&
    event.sheetPresentationSceneKey === 'polls' &&
    event.activeSemanticOverlayKey === 'polls' &&
    event.overlaySheetVisible === true &&
    event.runtimeConfigVisible === true &&
    event.canRenderSurface === true &&
    event.isRenderable === true;
  const isResultsHeaderReleaseEvent = (event) =>
    event.line != null &&
    (event.hasStableHeaderChromeForRender === false ||
      event.hasListHeaderForRender === false ||
      event.shouldShowResultsSurface === false);
  const badHeaderRelease = dismissPressEvents.find((dismissEvent) => {
    const releaseLine =
      dismissBottomEvents.find((bottomEvent) => bottomEvent.line > dismissEvent.line)?.line ??
      submitPressEvents.find((submitEvent) => submitEvent.line > dismissEvent.line)?.line ??
      Number.POSITIVE_INFINITY;
    const releaseEvent = headerSourceEvents.find(
      (event) =>
        event.line > dismissEvent.line &&
        event.line < releaseLine &&
        isResultsHeaderReleaseEvent(event)
    );
    if (!releaseEvent) {
      return false;
    }
    const mountedPollHeader = persistentPollsSceneHeaderEvents.find(
      (event) =>
        event.line > dismissEvent.line &&
        event.line <= releaseEvent.line &&
        isMountedRenderablePersistentPollHeaderEvent(event)
    );
    const renderablePollHost = persistentPollsSheetHostEvents.find(
      (event) =>
        event.line > dismissEvent.line &&
        event.line <= releaseEvent.line &&
        isVisibleRenderablePersistentPollHostEvent(event)
    );
    return !mountedPollHeader || !renderablePollHost;
  });
  if (badHeaderRelease) {
    fail(
      `results header source released before polls header mounted/renderable after dismiss at line ${badHeaderRelease.line}`
    );
  } else {
    pass('results header source did not release before mounted/renderable polls header');
  }
}

const persistentPollsRestoreNavEvents = byEvent('persistent_polls_restore_nav_contract');
if (persistentPollsRestoreNavEvents.length > 0) {
  const badPersistentRestore = persistentPollsRestoreNavEvents.find((event) => {
    if (
      event.navTarget !== 'search' ||
      event.restoreRequested !== true ||
      event.targetSnap !== 'collapsed' ||
      event.dismissedBeforePress !== true
    ) {
      return true;
    }
    return !persistentPollsRestoreSettleEvents.some(
      (settleEvent) =>
        settleEvent.line > event.line &&
        settleEvent.restoreIntentSnap === 'collapsed' &&
        settleEvent.snap === 'collapsed' &&
        settleEvent.restoredToCollapsed === true
    );
  });
  if (badPersistentRestore) {
    fail(
      `persistent polls did not restore to collapsed after Search nav tap at line ${badPersistentRestore.line}`
    );
  } else {
    pass(`persistent polls Search nav restore contracts=${persistentPollsRestoreNavEvents.length}`);
  }
}

const rgNoMatch = (pattern, targets) => {
  try {
    execFileSync('rg', ['-n', pattern, ...targets], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return false;
  } catch (error) {
    return error.status === 1;
  }
};

const rgMatch = (pattern, targets) => {
  try {
    execFileSync('rg', ['-n', '-U', pattern, ...targets], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch (error) {
    return false;
  }
};

const mapSourceControllerSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/hooks/use-direct-search-map-source-controller.ts'
  ),
  'utf8'
);
if (scenarioIsMapRuntimeOnly) {
  pass(`map source controller route/sheet fanout gate skipped for map runtime scenario ${scenarioName}`);
} else if (
  !mapSourceControllerSource.includes('map_source_controller_surface_state') &&
  !/resultsPresentationSurfaceAuthority\.subscribe\([\s\S]*publishAndFetch/.test(
    mapSourceControllerSource
  ) &&
  /subscribeSearchMountedResultsDataSnapshot\(\s*publishAndFetch\s*,\s*\{[\s\S]*?notifyMode:\s*'deferred'[\s\S]*?\}\s*\)/.test(
    mapSourceControllerSource
  ) &&
  (mapSourceControllerSource.includes('viewportBoundsService.subscribe(publishAndFetch)') ||
    /viewportBoundsService\.subscribe\(\(\) => \{[\s\S]*canSkipSourceRebuildForShortcutViewport[\s\S]*publishSourcesRef\.current\(\)[\s\S]*maybeFetchShortcutCoverage\(\)/.test(
      mapSourceControllerSource
    ))
) {
  pass('map source controller avoids surface authority fanout and follows mounted results');
} else {
  fail(
    'map source controller still uses broad surface authority fanout or is missing mounted results/viewport subscriptions'
  );
}

const busHydrationPreparedOwnershipPattern =
  'searchSurfaceResultsTransactionKey|resultsHydrationKey|hydratedResultsKey|shouldHydrateResultsForRender|isResultsHydrationSettled|resultsFirstPaintKey|listFirstPaintReady|allowHydrationFinalizeCommit|hydrationOperationId|deriveCommittedSearchSurfaceResultsSnapshotKey|deriveSearchSurfaceResultsTransactionKey';
if (
  rgNoMatch(busHydrationPreparedOwnershipPattern, [
    'apps/mobile/src/screens/Search/runtime/shared/search-runtime-bus.ts',
  ])
) {
  pass(
    'SearchRuntimeBus has no hydration/surface-transaction/finalize ownership fields or helpers'
  );
} else {
  fail(
    'SearchRuntimeBus still exposes hydration/surface-transaction/finalize ownership fields or helpers'
  );
}

if (
  rgNoMatch('shouldHydrateResultsForRender', [
    'apps/mobile/src/screens/Search/runtime/shared/results-presentation-surface-authority.ts',
  ])
) {
  pass('ResultsPresentationSurfaceAuthority does not own the render hydration admission bit');
} else {
  fail('ResultsPresentationSurfaceAuthority still owns shouldHydrateResultsForRender');
}

if (
  rgNoMatch(
    'use-search-root-search-scene-list-hydration-publish-effect-runtime|useSearchRootSearchSceneListHydrationPublishEffectRuntime',
    ['apps/mobile/src/screens/Search']
  )
) {
  pass('deleted hydration publish-effect bridge is absent in TS/JS source');
} else {
  fail('deleted hydration publish-effect bridge is still present');
}

if (
  rgNoMatch(
    'searchRuntimeBus\\.getState\\(\\)\\.(resultsHydrationKey|hydratedResultsKey|shouldHydrateResultsForRender|isResultsHydrationSettled|searchSurfaceResultsTransactionKey|allowHydrationFinalizeCommit|hydrationOperationId)|searchRuntimeBus\\.publish\\(\\{[\\s\\S]{0,240}(resultsHydrationKey|hydratedResultsKey|shouldHydrateResultsForRender|isResultsHydrationSettled|searchSurfaceResultsTransactionKey|allowHydrationFinalizeCommit|hydrationOperationId)',
    ['apps/mobile/src/screens/Search']
  )
) {
  pass('hydration/surface-transaction/finalize gates do not read or write SearchRuntimeBus');
} else {
  fail('hydration/surface-transaction/finalize gate still reads or writes SearchRuntimeBus');
}

if (!scenarioIsMapRuntimeOnly) {
const hydrationRuntimeStateSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/runtime/shared/use-search-results-panel-hydration-runtime-state.ts'
  ),
  'utf8'
);
if (
  !hydrationRuntimeStateSource.includes(
    "['allowHydrationFinalizeCommit', 'resultsHydrationKey']"
  ) &&
  !hydrationRuntimeStateSource.includes('useResultsPresentationSurfaceAuthoritySelector') &&
  !hydrationRuntimeStateSource.includes('results_panel_hydration_runtime_surface_state') &&
  /const surfaceResultsHydrationKey\s*=\s*[\s\S]*resultsPresentationSurfaceAuthority\.getSnapshot\(\)\.resultsHydrationKey/.test(
    hydrationRuntimeStateSource
  ) &&
  /getAllowHydrationFinalizeCommit[\s\S]*resultsPresentationSurfaceAuthority\.getSnapshot\(\)\.allowHydrationFinalizeCommit/.test(
    hydrationRuntimeStateSource
  ) &&
  rgMatch(
    'resultsPresentationSurfaceAuthority\\.publish\\([\\s\\S]*allowHydrationFinalizeCommit[\\s\\S]*run_one_handoff_hydration_finalize_policy',
    ['apps/mobile/src/screens/Search/hooks/use-search-runtime-work-coordination-runtime.ts']
  )
) {
  pass(
    'hydration readiness/finalize gates read ResultsPresentationSurfaceAuthority without route sheet subscription'
  );
} else {
  fail(
    'hydration readiness/finalize gates are not sourced from ResultsPresentationSurfaceAuthority without route sheet subscription'
  );
}

const externalMountedListHostPattern = [
  'SearchMountedScene',
  'ExternalListHost|syncSearchMountedSceneBody',
  'RuntimeSnapshot',
].join('');
if (rgNoMatch(externalMountedListHostPattern, ['apps/mobile/src'])) {
  pass('no external mounted list host/runtime snapshot path');
} else {
  fail('external mounted list host/runtime snapshot path is present');
}

const hiddenListPathPattern = [
  'hidden',
  'Flash',
  'List|Hidden',
  'Flash',
  'List|external.*Flash',
  'List|Flash',
  'List.*external',
].join('');
if (rgNoMatch(hiddenListPathPattern, ['apps/mobile/src'])) {
  pass('no hidden/external list path markers');
} else {
  fail('hidden/external list path marker is present');
}

const mountedResultsStoreSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/runtime/shared/search-mounted-results-data-store.ts'
  ),
  'utf8'
);
const mountedSceneBodySource = fs.readFileSync(
  path.join(repoRoot, 'apps/mobile/src/overlays/SearchMountedSceneBody.tsx'),
  'utf8'
);
const restaurantResultCardSource = fs.readFileSync(
  path.join(repoRoot, 'apps/mobile/src/screens/Search/components/restaurant-result-card.tsx'),
  'utf8'
);
const redrawPhaseSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/runtime/controller/search-surface-redraw-phase.ts'
  ),
  'utf8'
);
const shadowTransitionSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/runtime/shared/use-search-session-shadow-transition-runtime.ts'
  ),
  'utf8'
);
const submitResponseOwnerSource = fs.readFileSync(
  path.join(repoRoot, 'apps/mobile/src/screens/Search/hooks/use-search-submit-response-owner.ts'),
  'utf8'
);
if (
  mountedResultsStoreSource.includes('fullDetailRowCount') &&
  mountedResultsStoreSource.includes('debugFirstPaintFullDetailRowCount') &&
  mountedResultsStoreSource.includes('scheduleSearchMountedResultsFirstPaintRowsReady') &&
  /const\s+FIRST_PAINT_ROWS_INITIAL_ADMISSION_COUNT\s*=\s*4/.test(mountedResultsStoreSource) &&
  /const\s+FIRST_PAINT_ROWS_DETAIL_PROMOTION_CHUNK_SIZE\s*=\s*4/.test(mountedResultsStoreSource) &&
  /currentAdmission\.admittedRowCount\s*<\s*currentAdmission\.targetRowCount[\s\S]*currentAdmission\.admittedRowCount\s*=\s*Math\.min[\s\S]*currentAdmission\.fullDetailRowCount\s*=\s*Math\.min/.test(
    mountedResultsStoreSource
  ) &&
  /const\s+initialAdmittedRowCount\s*=\s*Math\.min[\s\S]*admittedRowCount:\s*initialAdmittedRowCount[\s\S]*fullDetailRowCount:\s*0/.test(
    mountedResultsStoreSource
  ) &&
  /canMarkSearchMountedResultsFirstVisibleRowsReadyFromRowLayout[\s\S]*rowsSnapshot\.admission\.mode !== 'visual'[\s\S]*return false/.test(
    mountedResultsStoreSource
  ) &&
  mountedSceneBodySource.includes('firstPaintRenderMode') &&
  mountedSceneBodySource.includes('debugFirstPaintFullDetailRowCount') &&
  mountedSceneBodySource.includes('SearchMountedResultsFirstPaintRow') &&
  /previous\.firstPaintRenderMode\s*===\s*next\.firstPaintRenderMode/.test(
    mountedSceneBodySource
  ) &&
  restaurantResultCardSource.includes("renderMode?: 'shell' | 'full'") &&
  restaurantResultCardSource.includes('shouldRenderFullDetails')
) {
  pass(
    'first-paint admission has shell/full detail row boundaries and post-commit cards-ready reveal'
  );
} else {
  fail(
    'first-paint admission is missing shell/full detail row boundaries or post-commit cards-ready reveal'
  );
}

if (
  submitResponseOwnerSource.includes('scheduleAfterFirstPaintRowsReady') &&
  submitResponseOwnerSource.includes('runtimeState.listFirstPaintReady') &&
  submitResponseOwnerSource.includes('runtimeState.firstVisibleRows.readyReadinessKey') &&
  !submitResponseOwnerSource.includes('scheduleAfterResultsHydrationSettled') &&
  !submitResponseOwnerSource.includes('runtimeState.isResultsHydrationSettled')
) {
  pass('visual release waits for first-paint rows instead of full hydration settle');
} else {
  fail('visual release can still block on full hydration settle before cards/pins reveal');
}

if (
  !redrawPhaseSource.includes("| 'body_admitting'") &&
  /SEARCH_SURFACE_REDRAW_PHASE_ORDER[\s\S]*'idle'[\s\S]*'redraw_committed'[\s\S]*'markers_ready'/.test(
    redrawPhaseSource
  ) &&
  /transition\.eventType === 'phase_a_committed'[\s\S]*advancePhase\('redraw_committed'/.test(
    shadowTransitionSource
  ) &&
  !/transition\.eventType === 'phase_a_committed'[\s\S]*advancePhase\('body_admitting'/.test(
    shadowTransitionSource
  ) &&
  /transition\.eventType === 'visual_released'[\s\S]*advancePhase\('markers_ready'/.test(
    shadowTransitionSource
  ) &&
  !/transition\.eventType === 'visual_released'[\s\S]*advancePhase\('redraw_committed'/.test(
    shadowTransitionSource
  ) &&
  /results\s*!=\s*null[\s\S]{0,260}prepareSearchMountedResultsRowsSnapshotFromAuthority\(\)/.test(
    mountedResultsStoreSource
  ) &&
  /activeTab:\s*resultsDataSnapshot\.activeTab\s*\?\?\s*bodyRuntimeSnapshot\.activeTab/.test(
    mountedResultsStoreSource
  ) &&
  !mountedSceneBodySource.includes('useSearchSurfaceRuntimeSelector') &&
  mountedSceneBodySource.includes('subscribeSearchMountedSceneBodySelection') &&
  mountedSceneBodySource.includes('getSearchMountedSceneBodySelectionSnapshot')
) {
  pass('first-paint rows and body retention are projected outside broad visual runtime selectors');
} else {
  fail(
    'first-paint rows or mounted body retention can still fan out from broad visual runtime selectors'
  );
}

if (
  /results\s*!=\s*null[\s\S]{0,260}prepareSearchMountedResultsRowsSnapshotFromAuthority\(\)/.test(
    mountedResultsStoreSource
  ) &&
  /activeTab:\s*resultsDataSnapshot\.activeTab\s*\?\?\s*bodyRuntimeSnapshot\.activeTab/.test(
    mountedResultsStoreSource
  )
) {
  pass('first-paint rows are prepared before visual redraw handoff without body_admitting fanout');
} else {
  fail('first-paint rows can still be prepared inside a visual handoff route/sheet commit');
}
} else {
  pass(`route/sheet first-paint source gates skipped for map runtime scenario ${scenarioName}`);
}

const nativeMapControllerSource = fs.readFileSync(
  path.join(repoRoot, 'apps/mobile/ios/cravesearch/SearchMapRenderController.swift'),
  'utf8'
);
const androidMapControllerSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/android/app/src/main/java/com/crave/SearchMapRenderControllerModule.java'
  ),
  'utf8'
);
const searchMapSource = fs.readFileSync(
  path.join(repoRoot, 'apps/mobile/src/screens/Search/components/search-map.tsx'),
  'utf8'
);
const searchMapWithMarkerEngineSource = fs.readFileSync(
  path.join(repoRoot, 'apps/mobile/src/screens/Search/components/SearchMapWithMarkerEngine.tsx'),
  'utf8'
);
const searchMapNativeRenderOwnerSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/components/hooks/use-search-map-native-render-owner.ts'
  ),
  'utf8'
);
const directMapSourceControllerSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/hooks/use-direct-search-map-source-controller.ts'
  ),
  'utf8'
);
const mapRenderModelSource = fs.readFileSync(
  path.join(repoRoot, 'apps/mobile/src/screens/Search/utils/map-render-model.ts'),
  'utf8'
);
const searchRootMapEngineInputsSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/runtime/controller/search-root-map-engine-input-controller-runtime.ts'
  ),
  'utf8'
);
const searchRouteSheetFrameHostSource = fs.readFileSync(
  path.join(repoRoot, 'apps/mobile/src/overlays/SearchRouteSheetFrameHost.tsx'),
  'utf8'
);
const searchForegroundBottomNavVisualSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/runtime/shared/use-search-foreground-bottom-nav-visual-runtime.ts'
  ),
  'utf8'
);
const searchBottomNavMotionRuntimeSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/runtime/shared/search-bottom-nav-motion-runtime.ts'
  ),
  'utf8'
);
const searchSurfaceResultsEnterExecutionSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/runtime/shared/use-search-surface-results-enter-transaction-execution-runtime.ts'
  ),
  'utf8'
);
const searchSurfaceResultsExitExecutionSource = fs.readFileSync(
  path.join(
    repoRoot,
    'apps/mobile/src/screens/Search/runtime/shared/use-search-surface-results-exit-transaction-execution-runtime.ts'
  ),
  'utf8'
);
const applyPresentationOpacitySource =
  nativeMapControllerSource.match(
    /private func applyPresentationOpacity\([\s\S]*?\n  private static func phaseSummary/
  )?.[0] ?? '';
const animatePresentationOpacitySource =
  nativeMapControllerSource.match(
    /private func animatePresentationOpacity\([\s\S]*?\n  private func emitEnterFirstVisibleFrameIfNeeded/
  )?.[0] ?? '';
if (
  !nativeMapControllerSource.includes('presentationOpacityFeatureCollection') &&
  !applyPresentationOpacitySource.includes('mapboxMap.updateGeoJSONSource') &&
  applyPresentationOpacitySource.includes('mapboxMap.setFeatureState') &&
  applyPresentationOpacitySource.includes('operationCount: targets.count') &&
  !applyPresentationOpacitySource.includes('mapboxMap.setLayerProperty') &&
  searchMapSource.includes("['feature-state', 'nativePresentationOpacity']") &&
  searchMapSource.includes("['get', 'nativePresentationOpacity']")
) {
  pass(
    'native map presentation opacity uses frame-stepped feature-state updates without source rewrites'
  );
} else {
  fail(
    'native map presentation opacity can regress to source rewrites, layer churn, or missing feature-state targets'
  );
}

if (
  nativeMapControllerSource.includes('PresentationOpacityAnimator') &&
  nativeMapControllerSource.includes('stepPresentationOpacityAnimation') &&
  animatePresentationOpacitySource.includes('PresentationOpacityAnimator(') &&
  animatePresentationOpacitySource.includes('animator.start()') &&
  !/mapboxMap\.updateGeoJSONSource|mapboxMap\.setLayerProperty/.test(
    animatePresentationOpacitySource
  )
) {
  pass(
    'native presentation opacity uses a native frame-stepper with feature-state only, not source or layer churn'
  );
} else {
  fail('native presentation opacity can regress to source rewrites, layer churn, or missing native frame-stepper fade');
}

if (
  nativeMapControllerSource.includes('livePinTransitionAnimators') &&
  nativeMapControllerSource.includes('live_lod_transition.apply_feature_states') &&
  nativeMapControllerSource.includes('CADisplayLink') &&
  nativeMapControllerSource.includes('handleLivePinTransitionFrame') &&
  nativeMapControllerSource.includes('usesNativeFrameStepper') &&
  nativeMapControllerSource.includes('hasIntermediateOpacity')
) {
  pass(
    'native live pin LOD fades use scoped CADisplayLink feature-state stepping with intermediate-opacity proof'
  );
} else {
  fail('native live pin LOD fades can regress to one-shot opacity snaps or unproved intermediate opacity');
}

const lodTimerSources = [
  searchMapWithMarkerEngineSource,
  directMapSourceControllerSource,
  mapRenderModelSource,
  searchRootMapEngineInputsSource,
].join('\n');
if (
  !/lodPin(?:Promote|Demote|Toggle|Offscreen)|promoteStableMs|demoteStableMs|offscreenDemoteStableMs|proposedPromoteSinceByMarkerKey|proposedDemoteSinceByMarkerKey/.test(
    lodTimerSources
  )
) {
  pass('LOD role selection is immediate and has no timer/proposal staging path');
} else {
  fail('LOD role selection can still batch promotion/demotion through timer/proposal staging');
}

if (
  !/assignInitialShortcutLodSlots|shouldSeedInitialRankedShortcutFrame|initialRankedShortcut/.test(
    directMapSourceControllerSource
  )
) {
  pass('shortcut searches use the same viewport LOD rule as live movement, not a separate seed path');
} else {
  fail('shortcut searches can still seed a separate ranked pin frame outside the live viewport LOD rule');
}

if (
  !/DOT_INTERACTION_LAYER_ID|DOT_INTERACTION_LAYER_STYLE|DOT_INTERACTION_SOURCE_ID|dotInteractionSourceStore|dotInteractions|restaurant-dot-interaction/.test(
    searchMapSource
  ) &&
  searchMapSource.includes('dotLayerIds: [visibleDotLayerId]')
) {
  pass('dot hit testing is tied to the rendered glyph dot layer with no dot interaction source family');
} else {
  fail('dots can still expose a separate dot interaction source/layer instead of rendered-glyph hit testing');
}

if (
  !/\bsolver\b|LABEL_SOLVER|labelCollisionSlotSourceIds|LABEL_PLACEMENT_LAYER_IDS|LABEL_COLLISION_OBSTACLE_LAYER_IDS|DOT_PLACEMENT_LAYER_IDS|PlacementLayersFadeOnly|placement_layer_fade_only/i.test(
    [searchMapSource, nativeMapControllerSource, androidMapControllerSource].join('\n')
  )
) {
  pass('search map has no solver-layer or placement-fade-only plumbing');
} else {
  fail('search map can still route through solver-layer or placement-fade-only plumbing');
}

const markerSceneSource =
  searchMapSource.match(/const SearchMapMarkerScene = React\.memo\([\s\S]*?\n\);/)?.[0] ?? '';
const slotSourcesIndex = markerSceneSource.indexOf(
  '{Array.from({ length: pinStackSlotCount }'
);
const sharedCollisionSourceIndex = markerSceneSource.indexOf(
  'id={RESTAURANT_LABEL_COLLISION_SOURCE_ID}'
);
const iOSPromotedSlotBuilderSource =
  nativeMapControllerSource.match(
    /private static func makePromotedSlotRecordsByMarkerKey[\s\S]*?return recordsByMarkerKey[\s\S]*?\n  }/
  )?.[0] ?? '';
const androidPromotedSlotBuilderSource =
  androidMapControllerSource.match(
    /private static ParsedFeatureCollection makePromotedSlotCollection[\s\S]*?return promotedSlotCollection;[\s\S]*?\n  }/
  )?.[0] ?? '';
if (
  slotSourcesIndex >= 0 &&
  sharedCollisionSourceIndex > slotSourcesIndex &&
  !/restaurantLabelPinCollisionLayerId\}-slot|nativeSlotFeatureKind'\],\s*'labelCollision'/.test(
    markerSceneSource
  ) &&
  !/labelCollisionRecordsByMarkerKey|kind:\s*"labelCollision"/.test(iOSPromotedSlotBuilderSource) &&
  !/labelCollisions|\"labelCollision\"/.test(androidPromotedSlotBuilderSource)
) {
  pass('promoted pin collision obstacles use one shared source above all per-slot label layers');
} else {
  fail('promoted pin collision obstacles can still be interleaved inside per-slot label sources');
}

if (
  searchMapNativeRenderOwnerSource.includes('const markerRoleFrameBaselineSnapshot =') &&
  searchMapNativeRenderOwnerSource.includes(
    'transportState.queueState.inFlightFrame?.snapshot ??'
  ) &&
  searchMapNativeRenderOwnerSource.includes('markerRoleFrameBaselineSnapshot')
) {
  pass('queued live LOD role frames diff from the in-flight native snapshot, not stale ACK state');
} else {
  fail('queued live LOD role frames can still diff from stale ACK state while a native frame is in flight');
}

if (
  !nativeMapControllerSource.includes('isInteractionSource') &&
  !androidMapControllerSource.includes('isInteractionSource') &&
  !/previousSourceLifecyclePhase\s*!=\s*\.incremental\s*\|\|/.test(nativeMapControllerSource) &&
  !/previousSourceLifecyclePhase\s*!=\s*SourceLifecyclePhase\.INCREMENTAL\s*\|\|/.test(
    androidMapControllerSource
  )
) {
  pass('native interaction sources use the same incremental mutation path as other resident slots');
} else {
  fail('native interaction sources can still force whole-source replacement during live LOD');
}

const sheetMaskAnimatedPropsSource =
  searchRouteSheetFrameHostSource.match(
    /const nativeMaskAnimatedProps = useAnimatedProps\([\s\S]*?\n    \);/
  )?.[0] ?? '';
if (
  searchRouteSheetFrameHostSource.includes('isPersistentNavBodyExclusionMode') &&
  searchRouteSheetFrameHostSource.includes('shouldEnableSheetMaskForNavSilhouette') &&
  searchRouteSheetFrameHostSource.includes('resolveNativeSheetMaskBoundaryTranslateY') &&
  searchRouteSheetFrameHostSource.includes('return Math.max(0, navTranslateY)') &&
  searchRouteSheetFrameHostSource.includes(
    'Math.max(0, navBarHeight - Math.max(0, navTranslateY)) > 0.25'
  ) &&
  !searchRouteSheetFrameHostSource.includes(
    'isPersistentNavBodyExclusionMode(modeValue) ? 0 : Math.max(0, navTranslateY)'
  ) &&
  searchRouteSheetFrameHostSource.includes(
    'APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.dockedPersistentPoll'
  ) &&
  searchRouteSheetFrameHostSource.includes(
    'APP_ROUTE_NAV_SILHOUETTE_SHEET_EXCLUSION_MODE_VALUE.staticPersistent'
  ) &&
  sheetMaskAnimatedPropsSource.includes('maskEnabled') &&
  sheetMaskAnimatedPropsSource.includes('navBodyBoundaryTranslateY') &&
  sheetMaskAnimatedPropsSource.includes('sheetMaskRuntime.navTranslateY.value') &&
  sheetMaskAnimatedPropsSource.includes('navTranslateY: boundaryTranslateY') &&
  sheetMaskAnimatedPropsSource.includes('shouldEnableSheetMaskForNavSilhouette') &&
  sheetMaskAnimatedPropsSource.includes('resolveNativeSheetMaskBoundaryTranslateY') &&
  !sheetMaskAnimatedPropsSource.includes('sheetMaskRuntime.navBarCutoutProgress.value') &&
  !sheetMaskAnimatedPropsSource.includes('progress') &&
  !sheetMaskAnimatedPropsSource.includes('navBodyBoundaryIsHiding') &&
  !sheetMaskAnimatedPropsSource.includes('navBodyBoundaryAnimationDurationMs') &&
  !sheetMaskAnimatedPropsSource.includes('maskOriginY') &&
  !sheetMaskAnimatedPropsSource.includes('navMaterialTopInset') &&
  !sheetMaskAnimatedPropsSource.includes('cutoutHeight') &&
  !sheetMaskAnimatedPropsSource.includes('cutoutRadius') &&
  /navBodyBoundaryVisibleY=\{sheetMaskRuntime\.navBarTop\}/.test(searchRouteSheetFrameHostSource) &&
  /navBodyBoundaryHiddenY=\{[\s\S]*sheetMaskRuntime\.navBarTop \+ Math\.max\(0, sheetMaskRuntime\.bottomNavHiddenTranslateY\)[\s\S]*\}/.test(
    searchRouteSheetFrameHostSource
  ) &&
  !/navBodyBoundaryIsHiding=/.test(searchRouteSheetFrameHostSource) &&
  !/navBodyBoundaryAnimationDurationMs=/.test(searchRouteSheetFrameHostSource) &&
  /maskOriginY=\{0\}/.test(searchRouteSheetFrameHostSource) &&
  !searchRouteSheetFrameHostSource.includes('APP_ROUTE_NAV_SILHOUETTE_BOUNDARY_SHAPE') &&
  !searchRouteSheetFrameHostSource.includes('navBarCutoutProgress: runtime.navBarCutoutProgress') &&
  !searchRouteSheetFrameHostSource.includes('navMaterialTopInset=') &&
  !searchRouteSheetFrameHostSource.includes('cutoutHeight=') &&
  !searchRouteSheetFrameHostSource.includes('cutoutRadius=')
) {
  pass('nav exclusion mask consumes the same navTranslateY scalar as the nav host');
} else {
  fail('nav exclusion mask can still recompute motion separately from the nav host');
}

const nativeSheetMaskSource = fs.readFileSync(
  path.join(repoRoot, 'apps/mobile/ios/cravesearch/SearchRouteSheetNavExclusionMaskView.swift'),
  'utf8'
);
const nativeBridgeSource = fs.readFileSync(
  path.join(repoRoot, 'apps/mobile/ios/cravesearch/UIFrameSamplerBridge.m'),
  'utf8'
);
if (scenarioIsMapRuntimeOnly) {
  pass(`native sheet mask path gate skipped for map runtime scenario ${scenarioName}`);
} else if (
  nativeSheetMaskSource.includes('CATransform3DMakeTranslation') &&
  nativeSheetMaskSource.includes('ensureTranslatedMaskPath') &&
  nativeSheetMaskSource.includes('@objc var navBodyBoundaryTranslateY') &&
  nativeSheetMaskSource.includes('resolvedBoundaryTranslateY()') &&
  nativeSheetMaskSource.includes('translated_static_path_shared_nav_translate_y') &&
  nativeSheetMaskSource.includes('native_sheet_mask_transition_setup') &&
  nativeSheetMaskSource.includes('@objc var navBodyBoundaryVisibleY') &&
  nativeSheetMaskSource.includes('@objc var navBodyBoundaryHiddenY') &&
  nativeBridgeSource.includes('SearchRouteSheetNavExclusionMaskViewManager') &&
  nativeBridgeSource.includes('RCT_EXPORT_VIEW_PROPERTY(navBodyBoundaryTranslateY, CGFloat)') &&
  !nativeBridgeSource.includes('RCT_EXPORT_VIEW_PROPERTY(navBodyBoundaryProgress') &&
  !nativeBridgeSource.includes(
    'RCT_EXPORT_VIEW_PROPERTY(navMaterialTopInset, CGFloat)\nRCT_EXPORT_VIEW_PROPERTY(cutoutHeight, CGFloat)\nRCT_EXPORT_VIEW_PROPERTY(cutoutRadius, CGFloat)\nRCT_EXPORT_VIEW_PROPERTY(onMaskPerfEvent'
  ) &&
  !nativeSheetMaskSource.includes('@objc var navBodyBoundaryProgress') &&
  !nativeSheetMaskSource.includes('@objc var navBodyBoundaryY') &&
  !nativeSheetMaskSource.includes('@objc var navBodyBoundaryIsHiding') &&
  !nativeSheetMaskSource.includes('@objc var navBodyBoundaryAnimationDurationMs') &&
  !nativeSheetMaskSource.includes('activeBoundaryAnimationTargetProgress') &&
  !nativeSheetMaskSource.includes('CABasicAnimation(keyPath: "transform")') &&
  !nativeSheetMaskSource.includes('boundaryAnimationTargetProgress') &&
  !nativeSheetMaskSource.includes('CAKeyframeAnimation(keyPath: "path")') &&
  !nativeSheetMaskSource.includes('CAKeyframeAnimation(keyPath: "transform.translation.y")') &&
  !nativeSheetMaskSource.includes('makeBoundaryPathAnimation') &&
  !nativeSheetMaskSource.includes('makeBoundaryTransformAnimation') &&
  !nativeSheetMaskSource.includes('CADisplayLink')
) {
  pass('native sheet mask translates one reusable path from shared nav translateY');
} else {
  fail(
    'native sheet mask can regress to progress recompute, path-keyframe, delayed boolean, or JS-driven mask churn'
  );
}

if (
  nativeSheetMaskSource.includes('makeSearchRouteNavSilhouetteMaterialPath') &&
  nativeSheetMaskSource.includes('let materialPath = UIBezierPath(rect: materialRect)') &&
  nativeSheetMaskSource.includes('makeSearchRouteNavCutoutGeometry') &&
  nativeSheetMaskSource.includes('UIBezierPath(') &&
  nativeSheetMaskSource.includes('roundedRect: cutoutGeometry.rect') &&
  nativeSheetMaskSource.includes('cornerRadius: cutoutGeometry.radius') &&
  nativeSheetMaskSource.includes('effectView.layer.mask = effectMaskLayer') &&
  nativeSheetMaskSource.includes('tintView.layer.mask = tintMaskLayer') &&
  nativeSheetMaskSource.includes('private func makeSheetExclusionMaskPath') &&
  nativeSheetMaskSource.includes('let navBodyRect = CGRect') &&
  nativeSheetMaskSource.includes('maskPath.append(UIBezierPath(rect: navBodyRect))') &&
  !nativeSheetMaskSource.includes('maskPath.append(navCutoutPath)') &&
  !nativeSheetMaskSource.includes('roundedRect: navBodyRect') &&
  !nativeSheetMaskSource.includes('roundedRect: visibleRect')
) {
  pass(
    'native nav material keeps the old rounded bite while sheet exclusion clips only the nav body'
  );
} else {
  fail(
    'native nav material/sheet mask shape can regress to rectangle, pill, or header-cutout masking'
  );
}

if (scenarioIsMapRuntimeOnly) {
  pass(`bottom nav submit/dismiss motion gate skipped for map runtime scenario ${scenarioName}`);
} else if (
  searchBottomNavMotionRuntimeSource.includes('registerSearchBottomNavMotionCommandSink') &&
  searchBottomNavMotionRuntimeSource.includes('requestSearchBottomNavMotionTarget') &&
  searchForegroundBottomNavVisualSource.includes('registerSearchBottomNavMotionCommandSink') &&
  searchForegroundBottomNavVisualSource.includes('commandBottomNavMotionOnUI') &&
  searchForegroundBottomNavVisualSource.includes('runOnUI(commandBottomNavMotionOnUI)') &&
  searchForegroundBottomNavVisualSource.includes(
    "navBarCutoutIsHidingValue.value = target === 'hide'"
  ) &&
  searchSurfaceResultsEnterExecutionSource.includes("requestSearchBottomNavMotionTarget('hide')") &&
  searchSurfaceResultsExitExecutionSource.includes("requestSearchBottomNavMotionTarget('show')") &&
  searchSurfaceResultsExitExecutionSource.indexOf("requestSearchBottomNavMotionTarget('show')") <
    searchSurfaceResultsExitExecutionSource.indexOf(
      'runOnUI(requestObservedRouteSheetDismissMotionOnUI)'
    ) &&
  searchSurfaceResultsEnterExecutionSource.indexOf("requestSearchBottomNavMotionTarget('hide')") <
    searchSurfaceResultsEnterExecutionSource.indexOf(
      'runOnUI(requestObservedRouteSheetOpenMotionOnUI)'
    )
) {
  pass('bottom nav show/hide motion is commanded at submit/dismiss action boundaries');
} else {
  fail('bottom nav motion can still be owned only by React visual policy commits');
}

if (scenarioIsMapRuntimeOnly) {
  pass(`dismiss source-snapshot bypass gate skipped for map runtime scenario ${scenarioName}`);
} else if (
  /let\s+shouldBypassDismissSnapshotApply\s*=\s*Self\.readDismissRequestKey\(fromJSON:\s*presentationStateJSON\)\s*!=\s*nil/.test(
    nativeMapControllerSource
  ) &&
  !/let\s+shouldBypassDismissSnapshotApply\s*=\s*Self\.readDismissRequestKey\(fromJSON:\s*presentationStateJSON\)\s*!=\s*nil\s*&&\s*hasPresentationOnlySourcePayload/.test(
    nativeMapControllerSource
  )
) {
  pass('dismiss render frames bypass source snapshot applies on the close-animation hot path');
} else {
  fail(
    'dismiss render frames can still apply source snapshots during the close-animation hot path'
  );
}

const output = {
  schema: 'perf-scenario-parity-contracts.v1',
  reportPath: resolvedReportPath,
  outputPath,
  scenarioName: report.scenarioName ?? null,
  logPath: report.logPath ?? null,
  passed: failures.length === 0,
  evidence,
  failures,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
