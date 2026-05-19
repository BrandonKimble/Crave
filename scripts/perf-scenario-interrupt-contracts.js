#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const visualConfigPath = path.join(
  repoRoot,
  'maestro/perf/contracts/search-submit-visual-parity.json'
);

const usage = () => {
  console.error(
    'Usage: scripts/perf-scenario-interrupt-contracts.js <perf_scenario_report.json> [--output <path>]'
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
const config = readJson(visualConfigPath);
const linePattern = /\[SearchPerf\]\[([^\]]+)\]\s+({.*})/;
const scenarioRunIdPattern = /(?:^|[^A-Za-z0-9_])(scenario-[A-Za-z0-9_]+-\d{8}T\d{6}Z-[A-Za-z0-9]+)(?=$|[^A-Za-z0-9_])/g;

const deriveScenarioRunIdFromPath = (filePath) => {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return null;
  }
  const basename = path.basename(filePath, path.extname(filePath));
  const matches = [...basename.matchAll(scenarioRunIdPattern)].map((match) => match[1]);
  return matches.length > 0 ? matches[matches.length - 1] : null;
};

const deriveScenarioNameFromRunId = (runId) => {
  const match = String(runId ?? '').match(/^scenario-(.+)-\d{8}T\d{6}Z-[A-Za-z0-9]+$/);
  return match ? match[1] : null;
};

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
  return path.join(directory, `perf-scenario-interrupt-contracts-${suffix}.json`);
};

const outputPath = path.resolve(outputPathOverride ?? deriveDefaultOutputPath(resolvedReportPath));

const readSearchPerfEventsFromLog = (logPath) => {
  if (!logPath || !fs.existsSync(logPath)) {
    return [];
  }
  const content = fs.readFileSync(logPath, 'utf8');
  const events = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(linePattern);
    if (!match) {
      return;
    }
    try {
      events.push({
        line: index + 1,
        channel: match[1],
        payload: JSON.parse(match[2]),
      });
    } catch {
      // Ignore malformed partial simulator lines.
    }
  });
  return events;
};

const eventRunId = (event) => event.payload?.scenarioRunId ?? null;
const eventBelongsToRun = (event, scenarioRunId) => {
  if (!scenarioRunId) {
    return true;
  }
  const runId = eventRunId(event);
  return runId == null || runId === scenarioRunId;
};
const earliestByLine = (events) =>
  events
    .filter(Boolean)
    .sort((left, right) => Number(left.line ?? 0) - Number(right.line ?? 0))[0] ?? null;
const rawEvents = readSearchPerfEventsFromLog(report.logPath);
const rawScenarioEvents = rawEvents
  .filter((event) => event.channel === 'Scenario')
  .map((event) => ({ line: event.line, ...event.payload }));
const reportRunId = report.activeRun?.scenarioRunId ?? report.scenarioRunId ?? null;
const reportScenarioName = report.activeRun?.scenarioName ?? report.scenarioName ?? null;
const reportWindow = report.activeRun?.window ?? null;
const expectedRunId =
  reportRunId ??
  deriveScenarioRunIdFromPath(resolvedReportPath) ??
  deriveScenarioRunIdFromPath(report.logPath) ??
  null;
const expectedScenarioName = reportScenarioName ?? deriveScenarioNameFromRunId(expectedRunId);
const scenarioConfigs = rawScenarioEvents.filter((event) => event.event === 'scenario_config_received');
const matchingConfigs = expectedRunId
  ? scenarioConfigs.filter((event) => event.scenarioRunId === expectedRunId)
  : [];
const matchingNameConfigs =
  matchingConfigs.length === 0 && expectedRunId == null && expectedScenarioName
    ? scenarioConfigs.filter((event) => event.scenarioName === expectedScenarioName)
    : [];
const activeConfig =
  matchingConfigs[matchingConfigs.length - 1] ??
  matchingNameConfigs[matchingNameConfigs.length - 1] ??
  (expectedRunId == null ? scenarioConfigs[scenarioConfigs.length - 1] : null) ??
  null;
const activeRunId = expectedRunId ?? activeConfig?.scenarioRunId ?? null;
const activeScenarioName =
  expectedScenarioName ?? activeConfig?.scenarioName ?? deriveScenarioNameFromRunId(activeRunId);
const activeStartLine = reportWindow?.startLine ?? activeConfig?.line ?? 1;
const activeClear = rawScenarioEvents.find(
  (event) =>
    event.line > activeStartLine &&
    event.event === 'scenario_config_cleared' &&
    (activeRunId == null || event.scenarioRunId == null || event.scenarioRunId === activeRunId)
);
const nextConfig = activeConfig
  ? scenarioConfigs.find((event) => event.line > activeConfig.line)
  : null;
const reportEndLine = reportWindow?.endLine
  ? { line: reportWindow.endLine }
  : null;
const activeEnd = earliestByLine([activeClear, nextConfig]) ?? reportEndLine;
const activeEndLine = activeEnd?.line ?? Number.MAX_SAFE_INTEGER;
const currentRunEvents = rawEvents.filter(
  (event) =>
    event.line >= activeStartLine &&
    event.line <= activeEndLine &&
    eventBelongsToRun(event, activeRunId)
);
const currentScenarioEvents = currentRunEvents
  .filter((event) => event.channel === 'Scenario')
  .map((event) => ({ line: event.line, ...event.payload }));
const measuredStart = currentScenarioEvents.find(
  (event) => event.event === 'scenario_phase_mark' && event.phase === 'measured_repeat_loop_start'
);
const measuredEnd = measuredStart
  ? currentScenarioEvents.find(
      (event) =>
        event.line > measuredStart.line &&
        event.event === 'scenario_phase_mark' &&
        event.phase === 'measured_repeat_loop_end'
    )
  : null;
const contractStartLine = measuredStart?.line ?? activeStartLine;
const contractEndLine = measuredEnd?.line ?? activeEndLine;
const visualEndLine = activeEndLine;
const visualEvents =
  currentRunEvents.length > 0
    ? currentRunEvents
        .filter(
          (event) =>
            event.channel === 'VisualReadiness' &&
            event.line >= contractStartLine &&
            event.line <= visualEndLine
        )
        .map((event) => ({ line: event.line, ...event.payload }))
    : (report.measuredRepeatLoop?.visualReadiness?.events ?? report.visualReadiness?.events ?? []);
const failures = [];
const evidence = [];

const fail = (message) => failures.push(message);
const pass = (message) => evidence.push(message);

const byEvent = (eventName) => visualEvents.filter((event) => event.event === eventName);
const numeric = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};
const MAX_HANDOFF_RELEASE_DELAY_MS = 120;
const eventTime = (event) => {
  const emittedAtMs = Number(event?.emittedAtMs);
  return Number.isFinite(emittedAtMs) ? emittedAtMs : Number(event?.line ?? 0);
};
const isAfter = (event, floorEvent) =>
  eventTime(event) > eventTime(floorEvent) ||
  (eventTime(event) === eventTime(floorEvent) && event.line > floorEvent.line);
const isBefore = (event, ceilingEvent) =>
  eventTime(event) < eventTime(ceilingEvent) ||
  (eventTime(event) === eventTime(ceilingEvent) && event.line < ceilingEvent.line);
const between = (event, startEvent, endEvent) => isAfter(event, startEvent) && isBefore(event, endEvent);
const withinMsAfter = (event, startEvent, toleranceMs) => {
  const deltaMs = eventTime(event) - eventTime(startEvent);
  return deltaMs >= 0 && deltaMs <= toleranceMs;
};
const transactionNumber = (transactionId) => {
  const match = String(transactionId ?? '').match(/search-surface-results-transaction:(\d+)/);
  return match ? Number(match[1]) : null;
};
const firstAfter = (events, floorEvent, predicate = () => true) =>
  events.find((event) => isAfter(event, floorEvent) && predicate(event));
const firstBetween = (events, startEvent, endEvent, predicate = () => true) =>
  events.find((event) => between(event, startEvent, endEvent) && predicate(event));

if (activeScenarioName !== 'search_submit_dismiss_interrupt') {
  fail(
    `interrupt contracts expect scenarioName=search_submit_dismiss_interrupt, saw ${String(
      activeScenarioName
    )}`
  );
} else {
  pass(
    `active interrupt run selected scenarioRunId=${activeRunId ?? '<unknown>'} measuredLines=${contractStartLine}-${contractEndLine} visualLines=${contractStartLine}-${visualEndLine} visualEvents=${visualEvents.length}`
  );
}

const assertSourceContains = ({ file, label, pattern }) => {
  const filePath = path.join(repoRoot, file);
  if (!fs.existsSync(filePath)) {
    fail(`${label} source file missing: ${file}`);
    return;
  }
  const source = fs.readFileSync(filePath, 'utf8');
  if (new RegExp(pattern).test(source)) {
    pass(`${label} source contract matched`);
  } else {
    fail(`${label} source contract did not match ${pattern}`);
  }
};

const assertNoSourceMatch = (label, pattern, targets = ['apps/mobile/src']) => {
  try {
    const output = execFileSync('rg', ['-n', pattern, ...targets], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    fail(`${label} is present:\n${output.trim()}`);
  } catch (error) {
    if (error.status === 1) {
      pass(`${label} is absent`);
      return;
    }
    throw error;
  }
};

const requireDismissFanout = (dismissEvent, nextBoundaryEvent, label) => {
  const badPressPayload =
    dismissEvent.outgoingResultCardsHeldForDismissTransition !== true ||
    dismissEvent.queryClearedToPlaceholder !== true ||
    dismissEvent.queryHeldForDismissTransition !== false ||
    dismissEvent.shortcutsFadeInRequested !== true ||
    dismissEvent.pinsLabelsDotsFadeOutRequested !== true ||
    dismissEvent.pinsLabelsFadeOutRequested !== true ||
    (dismissEvent.resultSheetBeginsSlidingDown !== true && dismissEvent.pollsSwitchImmediate !== true);
  if (badPressPayload) {
    fail(`${label} dismiss press-up did not hold outgoing results while starting marker/sheet exit`);
  } else {
    pass(`${label} dismiss press-up held outgoing results while starting marker/sheet exit`);
  }

  const dismissMotionPlaneSample = firstBetween(
    byEvent('search_dismiss_motion_plane_contract'),
    dismissEvent,
    nextBoundaryEvent,
    (event) => {
      const progress = numeric(event.dismissProgress);
      const travelPx = numeric(event.sheetTravelPx);
      return (
        progress != null &&
        progress > 0 &&
        progress < 1 &&
        travelPx != null &&
        travelPx >= 8 &&
        event.resultSheetSlidingDown === true &&
        event.sheetMotionSource === 'routeSheetMotionCommandObservedBySearchSurfaceMotionPlane' &&
        event.navReturnProgressSource === 'searchSurfaceMotionPlane' &&
        event.boundaryCommitSource === 'searchSurfaceMotionPlane'
      );
    }
  );
  if (!dismissMotionPlaneSample && dismissEvent.pollsSwitchImmediate !== true) {
    fail(`${label} dismiss did not prove shared sheet/nav motion-plane descent`);
  } else {
    pass(`${label} dismiss proved shared sheet/nav motion-plane descent`);
  }

  const headerHold = firstBetween(
    byEvent('search_header_visual_contract'),
    dismissEvent,
    nextBoundaryEvent,
    (event) =>
      event.chromeMode === 'results' &&
      event.searchSheetContentLaneKind === 'results_closing' &&
      event.canAdmitResultsBody === true &&
      event.canExposePersistentPolls === true &&
      event.shouldHoldResultsHeader === true &&
      event.shouldHoldSearchDisplayForPollRestore === true &&
      event.canReleasePersistentPolls === false &&
      event.bottomBandOwner === 'results_header' &&
      event.sheetClipMode === 'animatedSearchTransition' &&
      event.shortcutsVisibleTarget === false
  );
  if (!headerHold) {
    fail(`${label} header did not hold outgoing results before boundary`);
  } else if (!withinMsAfter(headerHold, dismissEvent, 180)) {
    fail(`${label} header hold lagged dismiss by ${Math.round(eventTime(headerHold) - eventTime(dismissEvent))}ms`);
  } else {
    pass(`${label} header hold started with dismiss`);
  }

  const badHeaderRelease = firstBetween(
    byEvent('search_header_visual_contract'),
    dismissEvent,
    nextBoundaryEvent,
    (event) =>
      event.chromeMode !== 'results' ||
      event.searchSheetContentLaneKind !== 'results_closing' ||
      event.canAdmitResultsBody !== true ||
      event.canExposePersistentPolls !== true ||
      event.shouldHoldResultsHeader !== true ||
      event.canReleasePersistentPolls !== false ||
      event.bottomBandOwner !== 'results_header'
  );
  if (badHeaderRelease) {
    fail(`${label} header released outgoing results before boundary at line ${badHeaderRelease.line}`);
  } else {
    pass(`${label} header did not release outgoing results before boundary`);
  }

  const badHeaderSourceRelease = firstBetween(
    byEvent('search_results_header_source_contract'),
    dismissEvent,
    nextBoundaryEvent,
    (event) =>
      event.shouldShowResultsSurface !== true ||
      event.hasListHeaderForRender !== true ||
      event.hasStableHeaderChromeForRender !== true
  );
  if (badHeaderSourceRelease) {
    fail(`${label} dropped cards/header to strip-only before boundary at line ${badHeaderSourceRelease.line}`);
  } else {
    pass(`${label} kept cards/header source mounted before boundary`);
  }

  const markerExit = firstBetween(
    byEvent('native_marker_exit_started'),
    dismissEvent,
    nextBoundaryEvent,
    (event) => event.requestKey == null || event.requestKey === dismissEvent.transactionId
  );
  const anyMarkerExit = markerExit ?? firstBetween(byEvent('native_marker_exit_started'), dismissEvent, nextBoundaryEvent);
  if (!anyMarkerExit) {
    fail(`${label} marker exit did not start before bottom handoff`);
  } else if (!withinMsAfter(anyMarkerExit, dismissEvent, 180)) {
    fail(`${label} marker exit lagged dismiss by ${Math.round(eventTime(anyMarkerExit) - eventTime(dismissEvent))}ms`);
  } else {
    pass(`${label} marker exit started with dismiss`);
  }
};

const requireFullSubmitCycle = (submitEvent, endEvent, label) => {
  const transactionId = submitEvent.transactionId;
  if (!transactionId) {
    fail(`${label} submit missing transaction id`);
    return;
  }
  const sourceFrame = firstBetween(
    byEvent('map_surface_results_source_frame_ready_contract'),
    submitEvent,
    endEvent,
    (event) =>
      event.transactionId === transactionId &&
      event.readinessKey === transactionId &&
      event.sourceFrameVisualCycleKey === transactionId &&
      event.didPublishSourceFrame === true &&
      event.hasVisualSources === true &&
      event.mapSearchSurfaceResultsSourcesReady === true &&
      event.coalescedBeforeNativeEnter !== true
  );
  if (!sourceFrame) {
    fail(`${label} did not publish a fresh prepared map source frame for ${transactionId}`);
  } else {
    pass(`${label} published fresh prepared map source frame for ${transactionId}`);
  }

  const preparedGate = firstBetween(
    byEvent('cards_pins_transaction_commit_gate'),
    submitEvent,
    endEvent,
    (event) =>
      event.transactionId === transactionId &&
      event.mapSearchSurfaceResultsSourcesReady === true &&
      event.mapSearchSurfaceResultsSourcesReadyKey === transactionId &&
      event.isShortcutCoverageLoading === false
  );
  if (!preparedGate) {
    fail(`${label} missing cards/map surface transaction gate for ${transactionId}`);
    return;
  }
  pass(`${label} surface transaction gate matched ${transactionId}`);

  const mountedHiddenReady = firstBetween(
    byEvent('native_execution_batch_mounted_hidden_ready'),
    preparedGate,
    endEvent,
    (event) => event.requestKey === transactionId
  );
  const markerStarted = firstBetween(
    byEvent('native_marker_enter_started'),
    preparedGate,
    endEvent,
    (event) => event.requestKey === transactionId
  );
  const markerSettled = markerStarted
    ? firstBetween(
        byEvent('native_marker_enter_settled'),
        markerStarted,
        endEvent,
        (event) => event.requestKey === transactionId && event.pinsLabelsDotsFadeTogether === true
      )
    : null;
  const coverReveal = markerStarted
    ? firstBetween(
        byEvent('cards_pins_cover_reveal_started'),
        markerStarted,
        endEvent,
        (event) =>
          event.transactionId === transactionId &&
          event.executionBatchId === markerStarted.executionBatchId
      )
    : null;
  if (!mountedHiddenReady) {
    fail(`${label} missing mounted-hidden native batch before marker enter for ${transactionId}`);
  } else if (!markerStarted) {
    fail(`${label} missing native marker enter start for ${transactionId}`);
  } else if (!coverReveal) {
    fail(`${label} missing cover/card reveal start aligned with native marker enter for ${transactionId}`);
  } else if (!markerSettled) {
    fail(`${label} missing native marker enter settle for ${transactionId}`);
  } else {
    pass(`${label} mounted-hidden, cover/card reveal, marker enter, and settle matched ${transactionId}`);
  }
};

for (const check of config.sourceChecks ?? []) {
  assertSourceContains(check);
}

assertNoSourceMatch(
  'routePollsSceneRuntime.sceneAuthority.subscribe delete gate',
  'routePollsSceneRuntime\\.sceneAuthority\\.subscribe'
);
assertNoSourceMatch('polls panel sheet control runtime delete gate', 'polls-panel-sheet-control-runtime');
assertNoSourceMatch(
  'routeOverlayChromeModeAuthority.subscribe delete gate',
  'routeOverlayChromeModeAuthority\\.subscribe'
);
assertNoSourceMatch('chromeMotionSnapTargets delete gate', 'chromeMotionSnapTargets');
assertNoSourceMatch(
  'use-app-route-scene-chrome-snaps-runtime delete gate',
  'use-app-route-scene-chrome-snaps-runtime'
);

const submitEvents = byEvent('shortcut_submit_press_up_contract');
const dismissEvents = byEvent('results_dismiss_press_up_contract');
const bottomHandoffEvents = byEvent('results_dismiss_bottom_snap_handoff_contract');
const collapsedBoundaryEvents = byEvent('results_dismiss_collapsed_boundary_contract');

if (submitEvents.length < 2) {
  fail(`interrupt scenario expected at least 2 shortcut submits, saw ${submitEvents.length}`);
} else {
  pass(`interrupt scenario shortcut submits=${submitEvents.length}`);
}

const firstSubmit = submitEvents[0];
const firstDismiss = firstSubmit ? firstAfter(dismissEvents, firstSubmit) : null;
const secondSubmit = firstDismiss ? firstAfter(submitEvents, firstDismiss) : null;
const finalDismiss = secondSubmit ? firstAfter(dismissEvents, secondSubmit) : null;

if (!firstDismiss) {
  fail('interrupt scenario missing dismiss after first submit');
} else {
  pass('interrupt scenario observed dismiss after first submit');
}

if (!secondSubmit) {
  fail('interrupt scenario missing resubmit after dismiss/exit');
} else {
  const firstNumber = transactionNumber(firstSubmit.transactionId);
  const secondNumber = transactionNumber(secondSubmit.transactionId);
  if (
    firstSubmit.transactionId === secondSubmit.transactionId ||
    firstNumber == null ||
    secondNumber == null ||
    secondNumber <= firstNumber
  ) {
    fail(
      `resubmit reused stale transaction ${String(secondSubmit.transactionId)} after ${String(
        firstSubmit.transactionId
      )}`
    );
  } else {
    pass(`resubmit started fresh transaction ${secondSubmit.transactionId}`);
  }
}

if (firstSubmit && firstDismiss) {
  const firstCoverReveal = byEvent('cards_pins_cover_reveal_started').find(
    (event) => event.transactionId === firstSubmit.transactionId
  );
  if (firstCoverReveal && isBefore(firstCoverReveal, firstDismiss)) {
    fail(
      `first dismiss waited until after cover/card reveal for ${firstSubmit.transactionId}; interrupt did not close before reveal start`
    );
  } else {
    pass('first dismiss interrupted before cover/card reveal start');
  }
}

if (firstDismiss) {
  const firstBottomBeforeResubmit = secondSubmit
    ? firstBetween(bottomHandoffEvents, firstDismiss, secondSubmit)
    : firstAfter(bottomHandoffEvents, firstDismiss);
  const firstBoundaryBeforeBottom = firstBottomBeforeResubmit
    ? firstBetween(collapsedBoundaryEvents, firstDismiss, firstBottomBeforeResubmit)
    : null;
  const firstHandoffBoundary =
    firstBottomBeforeResubmit ??
    secondSubmit ?? { line: Number.MAX_SAFE_INTEGER, emittedAtMs: Number.MAX_SAFE_INTEGER };
  requireDismissFanout(firstDismiss, firstHandoffBoundary, 'first interrupt');
  if (firstBottomBeforeResubmit && !firstBoundaryBeforeBottom) {
    fail(
      `first interrupt bottom handoff at line ${firstBottomBeforeResubmit.line} did not have a collapsed visual boundary after dismiss and before handoff`
    );
  } else if (firstBottomBeforeResubmit) {
    fail(
      `first interrupt reached bottom handoff before resubmit at line ${firstBottomBeforeResubmit.line}`
    );
  } else {
    pass('first interrupt did not bottom-handoff before resubmit');
  }
  if (!secondSubmit) {
    fail('first interrupt could not prove resubmit before bottom handoff because second submit is missing');
  } else if (firstBottomBeforeResubmit) {
    fail(
      `resubmit did not interrupt dismiss before bottom handoff: submit ${secondSubmit.transactionId} at line ${secondSubmit.line}, bottom handoff at line ${firstBottomBeforeResubmit.line}`
    );
  } else {
    pass(`resubmit interrupted dismiss before any bottom handoff with ${secondSubmit.transactionId}`);
  }
  const earlyPolls = firstBetween(
    byEvent('search_header_visual_contract'),
    firstDismiss,
    firstBottomBeforeResubmit ?? firstHandoffBoundary,
    (event) => event.searchSheetContentLaneKind === 'persistent_poll'
  );
  if (earlyPolls) {
    fail(`first interrupt switched to persistent polls before bottom handoff at line ${earlyPolls.line}`);
  } else {
    pass('first interrupt kept results sheet content until resubmit/handoff boundary');
  }
}

if (secondSubmit) {
  const secondEnd = finalDismiss ?? { line: Number.MAX_SAFE_INTEGER, emittedAtMs: Number.MAX_SAFE_INTEGER };
  if (
    secondSubmit.coverState !== 'initial_loading' ||
    secondSubmit.loadingStateVisible !== true ||
    secondSubmit.resultSheetBeginsSlidingUp !== true ||
    secondSubmit.shortcutButtonsFadeOutRequested !== true
  ) {
    fail('resubmit did not start loading cover, shortcut fade-out, and sheet slide-up together');
  } else {
    pass('resubmit started loading cover, shortcut fade-out, and sheet slide-up together');
  }
  requireFullSubmitCycle(secondSubmit, secondEnd, 'resubmit');
}

if (finalDismiss) {
  const finalBottom = firstAfter(bottomHandoffEvents, finalDismiss) ?? {
    line: Number.MAX_SAFE_INTEGER,
    emittedAtMs: Number.MAX_SAFE_INTEGER,
  };
  requireDismissFanout(finalDismiss, finalBottom, 'final dismiss');
}

const badBottomHandoff = bottomHandoffEvents.find(
  (event) => {
    const releaseDelayMs = numeric(event.releaseDelayAfterCollapsedBoundaryMs);
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
  }
);
const bottomHandoffWithoutBoundary = bottomHandoffEvents.find(
  (handoff) => !collapsedBoundaryEvents.some((boundary) => isBefore(boundary, handoff))
);
if (badBottomHandoff) {
  fail(`bottom handoff switched incorrectly at line ${badBottomHandoff.line}`);
} else if (bottomHandoffWithoutBoundary) {
  fail(`bottom handoff at line ${bottomHandoffWithoutBoundary.line} is missing a prior collapsed visual boundary`);
} else if (bottomHandoffEvents.length > 0) {
  pass(`bottom handoff releases at collapsed visual boundary events=${bottomHandoffEvents.length}`);
}

const toggleStartEvent = firstSubmit ?? { line: 0, emittedAtMs: 0 };
const toggleEndEvent =
  finalDismiss ?? { line: Number.MAX_SAFE_INTEGER, emittedAtMs: Number.MAX_SAFE_INTEGER };
const toggleEvents = byEvent('search_results_toggle_bar_contract').filter((event) =>
  between(event, toggleStartEvent, toggleEndEvent)
);
if (toggleEvents.length === 0) {
  fail('missing search_results_toggle_bar_contract event');
} else {
  const badToggle = toggleEvents.find(
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
    fail(`results toggle strip left stable chrome lane at line ${badToggle.line}`);
  } else {
    pass(`results toggle strip stayed in stable chrome lane samples=${toggleEvents.length}`);
  }
}

const headerSourceEvents = byEvent('search_results_header_source_contract');
const unstableHeader = headerSourceEvents.find(
  (event) =>
      event.shouldShowResultsSurface === true &&
    (event.hasListHeaderForRender !== true ||
      event.hasStableHeaderChromeForRender !== true ||
      event.stableHeaderChromeLane !== 'mounted_results_list_header' ||
      event.stableHeaderChromeOwner !== 'search_mounted_results_list')
);
if (unstableHeader) {
  fail(`results header/toggle source became unstable at line ${unstableHeader.line}`);
} else if (headerSourceEvents.length > 0) {
  pass(`results header/toggle source stayed stable samples=${headerSourceEvents.length}`);
}

const rowHeaderBoundaryEvents = byEvent('result_row_header_chrome_boundary_contract');
if (rowHeaderBoundaryEvents.length === 0) {
  fail(
    'missing result_row_header_chrome_boundary_contract; runtime must emit firstRowTopY, headerChromeBottomY, rowHeaderOverlapPx, overlapsHeaderChrome, activeTab, surfaceMode, and transactionId when first result rows mount'
  );
} else {
  const badRowBoundary = rowHeaderBoundaryEvents.find((event) => {
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
      `first result row occupied header chrome region at line ${badRowBoundary.line}: ${JSON.stringify({
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
    pass(`first result row stayed below header chrome samples=${rowHeaderBoundaryEvents.length}`);
  }
}

const persistentPollsSceneHeaderEvents = byEvent(
  'persistent_polls_scene_header_restoration_contract'
);
const persistentPollsSheetHostEvents = byEvent('persistent_polls_sheet_host_contract');
if (finalDismiss) {
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
  const isAtomicPersistentPollHandoffHostEvent = (event) =>
    isVisibleRenderablePersistentPollHostEvent(event) &&
    event.searchSurfacePhase === 'results_dismissing' &&
    event.searchSurfaceBottomBandOwner === 'persistent_polls' &&
    event.searchSurfaceCanReleasePersistentPolls === true &&
    event.navSilhouetteSheetClipMode === 'dockedPersistentPoll' &&
    event.frameHostSheetClipMode !== 'animatedSearchTransition';
  const releaseEvent = headerSourceEvents.find(
    (event) =>
      event.line > finalDismiss.line &&
      (event.hasStableHeaderChromeForRender === false ||
        event.hasListHeaderForRender === false ||
        event.shouldShowResultsSurface === false)
  );
  if (releaseEvent) {
    const mountedPollHeader = persistentPollsSceneHeaderEvents.find(
      (event) =>
        event.line > finalDismiss.line &&
        event.line <= releaseEvent.line &&
        isMountedRenderablePersistentPollHeaderEvent(event)
    );
    const renderablePollHost = persistentPollsSheetHostEvents.find(
      (event) =>
        event.line > finalDismiss.line &&
        event.line <= releaseEvent.line &&
        isVisibleRenderablePersistentPollHostEvent(event)
    );
    if (!mountedPollHeader || !renderablePollHost) {
      fail(
        `results header source released before polls header mounted/renderable after final dismiss at line ${finalDismiss.line}`
      );
    } else {
      pass('results header source released only after mounted/renderable polls header');
    }
  } else {
    pass('no results header source release observed before polls header restore in interrupt run');
  }
  const finalBottom = firstAfter(bottomHandoffEvents, finalDismiss);
  if (!finalBottom) {
    fail('final dismiss did not emit bottom handoff for atomic persistent polls restore');
  } else {
    const startLine = finalDismiss.line;
    const atomicHost = persistentPollsSheetHostEvents.find(
      (event) =>
        event.line > startLine &&
        event.line <= finalBottom.line &&
        isAtomicPersistentPollHandoffHostEvent(event)
    );
    const mountedPollHeader = persistentPollsSceneHeaderEvents.find(
      (event) =>
        event.line > startLine &&
        event.line <= finalBottom.line &&
        isMountedRenderablePersistentPollHeaderEvent(event)
    );
    if (!atomicHost || !mountedPollHeader) {
      fail(
        `final dismiss handoff did not atomically expose docked renderable persistent polls at line ${finalBottom.line}`
      );
    } else {
      pass('final dismiss handoff atomically exposed docked renderable persistent polls');
    }
  }
}

const visualSources = byEvent('map_marker_visual_sources_contract').filter(
  (event) => event.hasPins === true && event.hasDots === true && event.hasPinLabels === true
);
const terminalEmptyCoverageEvents = byEvent('shortcut_coverage_terminal_empty_visual_contract');
const badTerminalEmptyCoverageEvent = terminalEmptyCoverageEvents.find(
  (event) =>
    (event.resultRestaurantCount ?? 0) > 0 &&
    (event.pinCount ?? 0) + (event.dotCount ?? 0) === 0
);
if (badTerminalEmptyCoverageEvent) {
  fail(
    `shortcut coverage terminal visual contract failed at line ${badTerminalEmptyCoverageEvent.line}: results=${badTerminalEmptyCoverageEvent.resultRestaurantCount} pins=${badTerminalEmptyCoverageEvent.pinCount ?? 0} dots=${badTerminalEmptyCoverageEvent.dotCount ?? 0}`
  );
} else {
  pass(`shortcut coverage terminal empty visual failures=${terminalEmptyCoverageEvents.length}`);
}
const labelVisibility = byEvent('map_pin_label_visibility_contract').filter(
  (event) => event.hasVisiblePinLabels === true
);
const labelVisibilitySamples = byEvent('map_pin_label_visibility_contract');
const latestLabelVisibility = labelVisibilitySamples[labelVisibilitySamples.length - 1] ?? null;
const latestVisualSource = visualSources[visualSources.length - 1] ?? null;
if (visualSources.length === 0) {
  fail('missing visual source contract with pins, dots, and labels');
} else {
  pass(`visual source contracts with pins/dots/labels=${visualSources.length}`);
}
if (labelVisibility.length === 0) {
  const sourceEvidence = latestVisualSource
    ? `latest visual source line ${latestVisualSource.line}: pins=${latestVisualSource.pinCount} dots=${latestVisualSource.dotCount} labels=${latestVisualSource.labelCount}`
    : 'no pins/dots/labels visual source was present';
  const visibilityEvidence = latestLabelVisibility
    ? `latest label visibility line ${latestLabelVisibility.line}: visible=${latestLabelVisibility.visibleLabelCount} layerRendered=${latestLabelVisibility.layerRenderedFeatureCount} effective=${latestLabelVisibility.effectiveRenderedFeatureCount}`
    : 'no map_pin_label_visibility_contract event was emitted in the active measured window';
  fail(`missing visible pin label contract in active measured window; ${sourceEvidence}; ${visibilityEvidence}`);
} else {
  pass(`visible pin label contracts=${labelVisibility.length}`);
}

const output = {
  schema: 'perf-scenario-interrupt-contracts.v1',
  reportPath: resolvedReportPath,
  outputPath,
  scenarioName: activeScenarioName ?? null,
  scenarioRunId: activeRunId ?? null,
  logPath: report.logPath ?? null,
  activeWindow: {
    startLine: activeStartLine,
    endLine: activeEndLine === Number.MAX_SAFE_INTEGER ? null : activeEndLine,
    contractStartLine,
    contractEndLine: contractEndLine === Number.MAX_SAFE_INTEGER ? null : contractEndLine,
    visualStartLine: contractStartLine,
    visualEndLine: visualEndLine === Number.MAX_SAFE_INTEGER ? null : visualEndLine,
    measuredStartLine: measuredStart?.line ?? null,
    measuredEndLine: measuredEnd?.line ?? null,
    visualEventCount: visualEvents.length,
  },
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
