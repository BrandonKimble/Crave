#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let PNG = null;
try {
  ({ PNG } = require('pngjs'));
} catch {
  PNG = null;
}

const repoRoot = path.resolve(__dirname, '..');
const defaultConfigPath = path.join(
  repoRoot,
  'maestro/perf/contracts/search-submit-visual-parity.json'
);

const usage = () => {
  console.error(
    'Usage: scripts/perf-scenario-visual-contracts.js <perf_scenario_report.json> [config.json] [--screenshot-dir <dir>] [--output <path>]'
  );
};

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(0);
}

const reportPath = args[0];
let configPath = defaultConfigPath;
let screenshotDirOverride = null;
let outputPathOverride = null;

for (let index = 1; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--screenshot-dir') {
    screenshotDirOverride = args[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (arg === '--output') {
    outputPathOverride = args[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (!arg.startsWith('--')) {
    configPath = arg;
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
const config = readJson(path.resolve(configPath));

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
  return path.join(directory, `perf-scenario-visual-contracts-${suffix}.json`);
};

const outputPath = path.resolve(outputPathOverride ?? deriveDefaultOutputPath(resolvedReportPath));

const failures = [];
const evidence = [];
const manualGaps = [];

const fail = (message) => failures.push(message);
const pass = (message) => evidence.push(message);
const gap = (message) => manualGaps.push(message);

const round = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : value);
const numeric = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};
const MAX_HANDOFF_RELEASE_DELAY_MS = 20;
const MAX_MEASURED_REPEAT_VISUAL_READINESS_EVENTS = 240;
const MAX_MEASURED_REPEAT_NAV_LOCKSTEP_EVENTS = 18;
const MAX_MEASURED_REPEAT_DISMISS_MOTION_EVENTS = 15;
const approxEqual = (left, right, tolerance = 0.03) =>
  Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const contractConstantOk = (event, legacyField, legacyValue, compactOkField) =>
  event[legacyField] === legacyValue || event[compactOkField] === true;
const navBodySamplesMapOnlyRequired = (event) =>
  contractConstantOk(
    event,
    'navBodySamplesMapOnly',
    'pixel_contract_required',
    'navBodySamplesMapOnlyRequired'
  );
const cutoutSamplesSheetRequired = (event) =>
  contractConstantOk(
    event,
    'cutoutSamplesSheet',
    'pixel_contract_required',
    'cutoutSamplesSheetRequired'
  );
const navSilhouetteMaterialFrosted = (event) =>
  contractConstantOk(event, 'navSilhouetteMaterial', 'frosted', 'navSilhouetteMaterialFrosted');
const bottomNavMotionEasingOutCubic = (event) =>
  contractConstantOk(event, 'bottomNavMotionEasing', 'outCubic', 'bottomNavMotionEasingOk');
const navCutoutFormulaOk = (event) =>
  contractConstantOk(
    event,
    'expectedCutoutFormula',
    'appRouteNavSilhouetteAuthority.inverseSheetMaskProjection',
    'cutoutFormulaOk'
  );
const navCutoutProgressSourceOk = (event) =>
  contractConstantOk(
    event,
    'navCutoutProgressSource',
    'bottomNavVisualProgress',
    'navCutoutProgressSourceOk'
  );
const navCutoutIsHidingSourceOk = (event) =>
  contractConstantOk(event, 'navBarCutoutIsHidingSource', 'boolean', 'navBarCutoutIsHidingSourceOk');
const navCutoutHidingProgressSourceOk = (event) =>
  contractConstantOk(
    event,
    'navBarCutoutHidingProgressSource',
    '1 - bottomNavVisualProgress',
    'navBarCutoutHidingProgressSourceOk'
  );
const loadingResultsSettledSheetExclusionModeOk = (event) =>
  contractConstantOk(
    event,
    'loadingResultsSettledSheetExclusionMode',
    'animatedSearchTransition projects inverse sheet mask from nav silhouette',
    'loadingResultsSettledSheetExclusionModeOk'
  );

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
      // Ignore malformed partial simulator log lines.
    }
  });
  return events;
};

const visualEvents = readVisualReadinessEventsFromLog(report.logPath);
const byEvent = (eventName) => visualEvents.filter((event) => event.event === eventName);
const scenarioName = report.scenarioName ?? '';
const measuredRepeatLoopRange = report.measuredRepeatLoop?.range ?? null;
const measuredVisualEvents =
  scenarioName.includes('search_submit_dismiss_repeat') && measuredRepeatLoopRange != null
    ? visualEvents.filter((event) => {
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
    : visualEvents;
const byMeasuredEvent = (eventName) =>
  measuredVisualEvents.filter((event) => event.event === eventName);
const screenshotScenarioNames = config.screenshots?.scenarioNames ?? [];
const isConfiguredScreenshotScenario =
  screenshotScenarioNames.length === 0 || screenshotScenarioNames.includes(scenarioName);
const scenarioExpectsResultsDismiss =
  scenarioName.includes('search_submit_visual_parity') ||
  scenarioName.includes('search_submit_dismiss');
const skipScreenshotScenarioContract = (label) => {
  if (isConfiguredScreenshotScenario) {
    return false;
  }
  gap(
    `${label} skipped for scenario ${
      scenarioName || '<unknown>'
    }; configured screenshot scenarios=${screenshotScenarioNames.join(',')}`
  );
  return true;
};
const skipMapInteractionScenarioContract = (label) => {
  const mapScenarioNames = config.mapInteraction?.scenarioNames ?? [];
  if (mapScenarioNames.length === 0 || mapScenarioNames.includes(scenarioName)) {
    return false;
  }
  gap(
    `${label} skipped for scenario ${
      scenarioName || '<unknown>'
    }; configured map interaction scenarios=${mapScenarioNames.join(',')}`
  );
  return true;
};

const readScreenshotCaptureLineFromLog = (screenshotName) => {
  if (!report.logPath || !fs.existsSync(report.logPath)) {
    return null;
  }
  const screenshotBaseName = screenshotName.endsWith('.png')
    ? screenshotName.slice(0, -'.png'.length)
    : screenshotName;
  const needle = `Take screenshot ${screenshotBaseName}`;
  const content = fs.readFileSync(report.logPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(needle));
  return index >= 0 ? index + 1 : null;
};

const readVideoProofFrameMetadata = () => {
  const metadataPath = path.join(resolveScreenshotDir(), 'search-visual-video-proof-frames.json');
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch {
    return null;
  }
};

const readVideoProofFrame = (proofKey) => {
  const metadata = readVideoProofFrameMetadata();
  return metadata?.frames?.[proofKey] ?? null;
};

const assertSourceContains = ({ file, label, pattern }) => {
  const filePath = path.join(repoRoot, file);
  if (!fs.existsSync(filePath)) {
    fail(`${label} source file missing: ${file}`);
    return;
  }
  const source = fs.readFileSync(filePath, 'utf8');
  const didMatch = new RegExp(pattern).test(source);
  if (didMatch) {
    pass(`${label} source contract matched`);
  } else {
    fail(`${label} source contract did not match ${pattern}`);
  }
};

const assertSourceNotContains = ({ file, label, pattern }) => {
  const filePath = path.join(repoRoot, file);
  if (!fs.existsSync(filePath)) {
    fail(`${label} source file missing: ${file}`);
    return;
  }
  const source = fs.readFileSync(filePath, 'utf8');
  const didMatch = new RegExp(pattern).test(source);
  if (didMatch) {
    fail(`${label} source contract unexpectedly matched ${pattern}`);
  } else {
    pass(`${label} source contract excluded`);
  }
};

const checkSearchMapSlottedPinStackSourceContract = () => {
  const searchMapFile = 'apps/mobile/src/screens/Search/components/search-map.tsx';
  const nativeRenderControllerFile =
    'apps/mobile/ios/cravesearch/SearchMapRenderController.swift';
  const jsSlottedLayerPatterns = [
    'const\\s+STYLE_PIN_STACK_SLOTS\\s*=\\s*30\\s*;',
    'restaurant-style-pins-shadow-slot-\\$\\{slotIndex\\}',
    'restaurant-style-pins-base-slot-\\$\\{slotIndex\\}',
    'restaurant-style-pins-fill-slot-\\$\\{slotIndex\\}',
    'restaurant-style-pins-rank-slot-\\$\\{slotIndex\\}',
    'restaurant-pin-interaction-slot-\\$\\{slotIndex\\}',
    'pinInteractionLayerIds:\\s*PIN_INTERACTION_LAYER_IDS',
  ];
  const nativeSourceOpacityPatterns = [
    'presentationOpacityFeatureCollection',
    'numericProperties:\\s*\\["nativePresentationOpacity":\\s*opacity\\]',
    'mapboxMap\\.updateGeoJSONSource\\(',
    'operationCount:\\s*targets\\.count',
  ];

  for (const pattern of jsSlottedLayerPatterns) {
    assertSourceContains({
      file: searchMapFile,
      label: 'slotted pin stack preserves nav body map-only visual contract',
      pattern,
    });
  }
  for (const pattern of nativeSourceOpacityPatterns) {
    assertSourceContains({
      file: nativeRenderControllerFile,
      label: 'native source opacity preserves nav body map-only visual contract',
      pattern,
    });
  }
  for (const pattern of [
    "const\\s+PIN_INTERACTION_LAYER_ID\\s*=\\s*['\"]restaurant-pin-interaction['\"]",
    'id=\\{STYLE_PINS_SHADOW_LAYER_ID\\}',
    'id=\\{STYLE_PINS_BASE_LAYER_ID\\}',
    'id=\\{STYLE_PINS_FILL_LAYER_ID\\}',
    'id=\\{STYLE_PINS_RANK_LAYER_ID\\}',
  ]) {
    assertSourceNotContains({
      file: searchMapFile,
      label: 'flattened pin stack can regress idle nav body map-only sampling',
      pattern,
    });
  }
  for (const pattern of [
    'mapboxMap\\.setLayerProperty[\\s\\S]{0,500}restaurant-style-pins',
    'mapboxMap\\.setFeatureState\\([\\s\\S]{0,500}nativePresentationOpacity',
    'layerId:\\s*"restaurant-style-pins-shadow"',
    'layerId:\\s*"restaurant-style-pins-base"',
    'layerId:\\s*"restaurant-style-pins-fill"',
    'layerId:\\s*"restaurant-style-pins-rank"',
    'restaurant-style-pins-shadow-slot-\\\\\\(slotIndex\\)',
    'restaurant-style-pins-base-slot-\\\\\\(slotIndex\\)',
    'restaurant-style-pins-fill-slot-\\\\\\(slotIndex\\)',
    'restaurant-style-pins-rank-slot-\\\\\\(slotIndex\\)',
  ]) {
    assertSourceNotContains({
      file: nativeRenderControllerFile,
      label: 'native pin opacity layer/feature churn can regress idle nav body map-only sampling',
      pattern,
    });
  }
};

const checkSearchRouteSheetMaskSourceContract = () => {
  const nativeSheetMaskFile =
    'apps/mobile/ios/cravesearch/SearchRouteSheetNavExclusionMaskView.swift';
  const nativeBridgeFile = 'apps/mobile/ios/cravesearch/UIFrameSamplerBridge.m';
  for (const pattern of [
    'private\\s+var\\s+isMaskPathUpdateScheduled\\s*=\\s*false',
    'DispatchQueue\\.main\\.async\\s*\\{\\s*\\[weak\\s+self\\]',
    'pendingMaskPathUpdate\\s*=\\s*false[\\s\\S]{0,120}updateMaskPath\\(\\)',
    'ensureTranslatedMaskPath',
      '@objc\\s+var\\s+navBodyBoundaryTranslateY',
      'CATransform3DMakeTranslation',
      'translated_static_path_shared_nav_translate_y',
      'native_sheet_mask_transition_setup',
    ]) {
    assertSourceContains({
      file: nativeSheetMaskFile,
      label: 'native sheet nav exclusion mask uses a coalesced translated static path',
      pattern,
    });
  }
  assertSourceContains({
    file: nativeBridgeFile,
    label: 'native sheet nav exclusion mask bridge exports shared translateY prop',
    pattern:
      'SearchRouteSheetNavExclusionMaskViewManager[\\s\\S]*RCT_EXPORT_VIEW_PROPERTY\\(navBodyBoundaryTranslateY, CGFloat\\)',
  });
  assertSourceNotContains({
    file: nativeBridgeFile,
    label: 'native sheet nav exclusion mask bridge does not export stale progress prop',
    pattern: 'SearchRouteSheetNavExclusionMaskViewManager[\\s\\S]*navBodyBoundaryProgress',
  });
  for (const pattern of [
    'maskPathDisplayLink',
    'CADisplayLink\\(target:\\s*self,\\s*selector:\\s*#selector\\(handleMaskPathDisplayLink\\)\\)',
    'handleMaskPathDisplayLink',
	    'CAKeyframeAnimation\\(keyPath:\\s*"path"\\)',
	    'CABasicAnimation\\(keyPath:\\s*"transform"\\)',
	    'activeBoundaryAnimationTargetProgress',
	    'boundaryAnimationTargetProgress',
	    'CAKeyframeAnimation\\(keyPath:\\s*"transform\\.translation\\.y"\\)',
    'makeBoundaryPathAnimation',
    'makeBoundaryTransformAnimation',
  ]) {
    assertSourceNotContains({
      file: nativeSheetMaskFile,
      label: 'native sheet nav exclusion mask can regress dismiss-frame UI stalls',
      pattern,
    });
  }
};

const checkStaticSourceContracts = () => {
  for (const check of config.sourceChecks ?? []) {
    assertSourceContains(check);
  }
  checkSearchMapSlottedPinStackSourceContract();
  checkSearchRouteSheetMaskSourceContract();
  for (const scenario of config.requiredFunctionalScenarios ?? []) {
    const flow = scenario.flow;
    const label = scenario.label ?? scenario.scenarioName ?? flow;
    if (typeof flow !== 'string' || flow.includes('/_draft/')) {
      fail(
        `${label} required functional scenario must point to a promoted flow, saw ${String(flow)}`
      );
      continue;
    }
    for (const pattern of scenario.requiredPatterns ?? []) {
      assertSourceContains({
        file: flow,
        label: `${label} promoted flow`,
        pattern,
      });
    }
  }
};

const checkRevealTimingContracts = () => {
  const gateEvents = byEvent('cards_pins_transaction_commit_gate');
  const cardReadyEvents = byEvent('result_cards_ready');
  const coverRevealEvents = byEvent('cards_pins_cover_reveal_started');
  const cardRevealStartEvents = byEvent('result_cards_reveal_started');
  const cardRevealSettledEvents = byEvent('result_cards_reveal_settled');
  const markerEnterEvents = byEvent('native_marker_enter_started');
  const mountedHiddenEvents = byEvent('native_execution_batch_mounted_hidden_ready');
  const visualSourceEvents = byEvent('map_marker_visual_sources_contract');
  const pinsExpected =
    visualSourceEvents.some((event) => (event.pinCount ?? 0) > 0 || event.hasPins === true) ||
    markerEnterEvents.some((event) => (event.pinCount ?? 0) > 0) ||
    String(report.scenarioName ?? '').includes('search_submit');
  if (gateEvents.length === 0) {
    fail('visual timing missing cards_pins_transaction_commit_gate event');
    return;
  }
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
  const badGate = gateEvents.find(
    (event) =>
      !hasPreparedCardsReadySignal(event) ||
      event.mapSearchSurfaceResultsSourcesReady !== true ||
      event.isShortcutCoverageLoading !== false ||
      (event.transactionId != null &&
        event.mapSearchSurfaceResultsSourcesReadyKey != null &&
        event.transactionId !== event.mapSearchSurfaceResultsSourcesReadyKey)
  );
  if (badGate) {
    fail(`visual timing gate released before readiness at line ${badGate.line}`);
  } else {
    pass(`visual timing surface transaction gate ready events=${gateEvents.length}`);
  }

  if (cardReadyEvents.length === 0) {
    fail('visual timing missing result_cards_ready event');
  }
  if (coverRevealEvents.length === 0) {
    fail('visual timing missing cards_pins_cover_reveal_started event');
  }
  if (cardRevealStartEvents.length === 0) {
    fail('visual timing missing real result_cards_reveal_started event');
  }

  if (markerEnterEvents.length === 0) {
    fail('marker enter timing missing native_marker_enter_started event');
  } else {
    const firstRevealLine = Math.min(...coverRevealEvents.map((event) => event.line));
    const earlyMarker = markerEnterEvents.find((event) => event.line < firstRevealLine);
    if (earlyMarker) {
      fail(`marker enter started before cover/card reveal at line ${earlyMarker.line}`);
    } else {
      pass(`marker enter starts after cover/card reveal events=${markerEnterEvents.length}`);
    }
  }

  const nativePrerollEvents = byEvent('native_marker_preroll_started');
  const firstRevealLine =
    coverRevealEvents.length > 0
      ? Math.min(...coverRevealEvents.map((event) => event.line))
      : Number.POSITIVE_INFINITY;
  const earlyVisibleCoveredPreroll = nativePrerollEvents.find(
    (event) =>
      event.line < firstRevealLine &&
      event.phase === 'covered' &&
      event.coverState === 'initial_loading' &&
      ((numeric(event.pinCount) ?? 0) > 0 ||
        (numeric(event.dotCount) ?? 0) > 0 ||
        (numeric(event.labelCount) ?? 0) > 0)
  );
  if (earlyVisibleCoveredPreroll) {
    fail(
      `native map sources were visible during covered submit before card reveal at line ${
        earlyVisibleCoveredPreroll.line
      }: ${JSON.stringify({
        pinCount: earlyVisibleCoveredPreroll.pinCount ?? null,
        dotCount: earlyVisibleCoveredPreroll.dotCount ?? null,
        labelCount: earlyVisibleCoveredPreroll.labelCount ?? null,
        coverState: earlyVisibleCoveredPreroll.coverState ?? null,
      })}`
    );
  } else {
    pass('native map sources stay visually empty while submit loading cover owns the reveal');
  }

  const markerSettledEvents = byEvent('native_marker_enter_settled');
  const earlyCoverReveal = coverRevealEvents.find((event) => {
    const matchingCardsReady = cardReadyEvents.find(
      (ready) =>
        ready.line < event.line &&
        ready.requestKey === event.transactionId &&
        (ready.activeRowCount ?? 0) > 0
    );
    const matchingMountedHidden = mountedHiddenEvents.find(
      (hidden) =>
        hidden.line < event.line &&
        hidden.requestKey === event.transactionId &&
        hidden.executionBatchId === event.executionBatchId
    );
    return !matchingCardsReady || !matchingMountedHidden;
  });
  if (earlyCoverReveal) {
    fail(
      `cover reveal started before cards/native hidden readiness at line ${earlyCoverReveal.line}`
    );
  } else if (coverRevealEvents.length > 0) {
    pass(
      `cover reveal waited for cards/native hidden readiness events=${coverRevealEvents.length}`
    );
  }
  if (cardRevealStartEvents.length === 0 || cardRevealSettledEvents.length === 0) {
    fail('real card reveal start/settle timing is missing');
    return;
  }
  if (pinsExpected && (markerEnterEvents.length === 0 || markerSettledEvents.length === 0)) {
    fail('marker start/settle timing pair is incomplete while pins are expected');
    return;
  }
  if (!pinsExpected && (markerEnterEvents.length === 0 || markerSettledEvents.length === 0)) {
    gap('marker start/settle timing pair is incomplete, but no pin expectation was observed');
    return;
  }

  const eventTimeMs = (event) => {
    if (!event) {
      return null;
    }
    const value = [event.emittedAtMs, event.startedAtMs, event.readyAtMs, event.settledAtMs]
      .map(Number)
      .find(Number.isFinite);
    return Number.isFinite(value) ? value : null;
  };
  const eventDeltaMs = (left, right) => {
    const leftMs = eventTimeMs(left);
    const rightMs = eventTimeMs(right);
    return leftMs == null || rightMs == null ? null : Math.abs(rightMs - leftMs);
  };
  const sameExecutionBatch = (left, right) =>
    left != null && right != null && left.executionBatchId === right.executionBatchId;
  const perRevealStartTolerance = config.revealTiming?.cardMarkerStartToleranceMs ?? 16;
  const misalignedReveal = coverRevealEvents.find((coverReveal) => {
    const matchingCardStart = cardRevealStartEvents.find(
      (event) =>
        event.requestKey === coverReveal.transactionId &&
        sameExecutionBatch(event, coverReveal) &&
        (eventDeltaMs(event, coverReveal) ?? Number.POSITIVE_INFINITY) <= perRevealStartTolerance
    );
    const matchingMarkerStart = markerEnterEvents.find(
      (event) =>
        event.requestKey === coverReveal.transactionId &&
        sameExecutionBatch(event, coverReveal) &&
        (eventDeltaMs(event, coverReveal) ?? Number.POSITIVE_INFINITY) <= perRevealStartTolerance
    );
    return !matchingCardStart || !matchingMarkerStart;
  });
  if (misalignedReveal) {
    fail(
      `cover/card/native reveal starts were not aligned within ${perRevealStartTolerance}ms at line ${misalignedReveal.line}`
    );
  } else {
    pass(`cover/card/native reveal starts aligned events=${coverRevealEvents.length}`);
  }

  const firstCardStart = eventTimeMs(cardRevealStartEvents[0]);
  const firstCoverStart = eventTimeMs(coverRevealEvents[0]);
  const firstMarkerStart = eventTimeMs(markerEnterEvents[0]);
  const firstCardSettled = eventTimeMs(cardRevealSettledEvents[0]);
  const firstMarkerSettled = eventTimeMs(markerSettledEvents[0]);
  const startDelta = Math.max(
    Math.abs(firstMarkerStart - firstCardStart),
    Math.abs(firstCoverStart - firstCardStart),
    Math.abs(firstMarkerStart - firstCoverStart)
  );
  const settleDelta = Math.abs(firstMarkerSettled - firstCardSettled);
  const startTolerance = perRevealStartTolerance;
  const settleTolerance = config.revealTiming?.cardMarkerSettleToleranceMs ?? 120;

  if (Number.isFinite(startDelta) && startDelta <= startTolerance) {
    pass(`cover/card/marker reveal start delta ${round(startDelta)}ms <= ${startTolerance}ms`);
  } else {
    fail(`cover/card/marker reveal start delta ${round(startDelta)}ms > ${startTolerance}ms`);
  }
  if (Number.isFinite(settleDelta) && settleDelta <= settleTolerance) {
    pass(`card/marker reveal settle delta ${round(settleDelta)}ms <= ${settleTolerance}ms`);
  } else {
    fail(`card/marker reveal settle delta ${round(settleDelta)}ms > ${settleTolerance}ms`);
  }
};

const checkMapInteractionContracts = () => {
  if (skipMapInteractionScenarioContract('map interaction runtime contract')) {
    return;
  }
  const mapGestureEvents = byEvent('map_post_results_gesture_contract');
  if (mapGestureEvents.length === 0) {
    fail('missing map_post_results_gesture_contract after visual flow map drag');
    return;
  }
  const validGestureEvent = mapGestureEvents.find(
    (event) =>
      event.touchReachedMap === true ||
      (event.isGestureActive === true &&
        Number.isFinite(Number(event.centerLat)) &&
        Number.isFinite(Number(event.centerLng)))
  );
  if (validGestureEvent) {
    pass(`map gesture reached Mapbox surface events=${mapGestureEvents.length}`);
  } else {
    fail('map_post_results_gesture_contract did not include a valid map touch/camera update');
  }

  const firstGestureLine = Math.min(...mapGestureEvents.map((event) => event.line));
  const mapMovementEvents = byEvent('map_post_results_movement_contract').filter(
    (event) => event.line > firstGestureLine
  );
  if (mapMovementEvents.length === 0) {
    fail(
      'missing map_post_results_movement_contract after map drag; contract must prove map movement does not drive result sheet snap'
    );
    return;
  }
  const validMovementEvent = mapMovementEvents.find(
    (event) =>
      event.materialUserGesture === true &&
      event.mapMovedSinceSearchRequested === true &&
      event.searchThisAreaRevealScheduled === true &&
      event.resultSheetSnapRequested === false &&
      event.isSearchOverlay === true &&
      event.isSearchSessionActive === true
  );
  if (validMovementEvent) {
    pass(
      `map movement scheduled Search This Area without result sheet snap events=${mapMovementEvents.length}`
    );
  } else {
    const latest = mapMovementEvents[mapMovementEvents.length - 1];
    fail(
      `map movement contract did not prove Search This Area without sheet snap; latest line ${
        latest.line
      }: ${JSON.stringify({
        materialUserGesture: latest.materialUserGesture,
        mapMovedSinceSearchRequested: latest.mapMovedSinceSearchRequested,
        searchThisAreaRevealScheduled: latest.searchThisAreaRevealScheduled,
        resultSheetSnapRequested: latest.resultSheetSnapRequested,
        isSearchOverlay: latest.isSearchOverlay,
        isSearchSessionActive: latest.isSearchSessionActive,
      })}`
    );
    return;
  }

  const buttonConfig = config.mapInteraction?.searchThisAreaButton ?? {};
  const minWidth = Number(buttonConfig.minWidth ?? 120);
  const minHeight = Number(buttonConfig.minHeight ?? 36);
  const minY = Number(buttonConfig.minY ?? 0);
  const maxY = Number(buttonConfig.maxY ?? Number.POSITIVE_INFINITY);
  const searchThisAreaEvents = byEvent('search_this_area_visibility_geometry_contract').filter(
    (event) => event.line > firstGestureLine
  );
  if (searchThisAreaEvents.length === 0) {
    fail('missing Search This Area visibility geometry event after map drag');
    return;
  }
  const visibleButtonEvent = searchThisAreaEvents.find((event) => {
    const width = Number(event.buttonWidth);
    const height = Number(event.buttonHeight);
    const y = Number(event.buttonY);
    return (
      event.visible === true &&
      event.enabled === true &&
      width >= minWidth &&
      height >= minHeight &&
      y >= minY &&
      y <= maxY &&
      event.hasUsableGeometry === true
    );
  });
  if (visibleButtonEvent) {
    pass(
      `Search This Area visible after map drag geometry=${round(
        Number(visibleButtonEvent.buttonWidth)
      )}x${round(Number(visibleButtonEvent.buttonHeight))}@y=${round(
        Number(visibleButtonEvent.buttonY)
      )}`
    );
  } else {
    const latest = searchThisAreaEvents[searchThisAreaEvents.length - 1];
    fail(
      `Search This Area did not expose usable visible geometry after map drag; latest line ${
        latest.line
      }: ${JSON.stringify({
        visible: latest.visible,
        enabled: latest.enabled,
        buttonWidth: latest.buttonWidth,
        buttonHeight: latest.buttonHeight,
        buttonY: latest.buttonY,
        hasUsableGeometry: latest.hasUsableGeometry,
      })}`
    );
  }
};

const checkLoadingCoverRuntimeContracts = () => {
  const loadingHeaderEvents = byEvent('search_results_header_source_contract').filter(
    (event) => event.surfaceMode === 'initial_loading'
  );
  if (loadingHeaderEvents.length === 0) {
    fail('missing initial_loading header source event for cover-over-toggle contract');
    return;
  }
  const validLoadingEvent = loadingHeaderEvents.find(
    (event) =>
      event.hasStableHeaderChromeForRender === true &&
      event.hasListHeaderForRender === true &&
      event.stableHeaderChromeLane === 'mounted_results_list_header' &&
      event.stableHeaderChromeOwner === 'search_mounted_results_list' &&
      event.stableHeaderChromeCoveredByLoadingCover === true &&
      event.shouldHideScrollHeaderForSurface === true
  );
  if (validLoadingEvent) {
    pass(
      `loading cover keeps results page toggle strip mounted behind cover events=${loadingHeaderEvents.length}`
    );
  } else {
    fail('initial_loading did not keep the results page toggle strip mounted behind the loading cover');
  }
};

const checkNavCutoutLockstepRuntimeContracts = () => {
  const lockstepEvents = byEvent('nav_cutout_lockstep_contract');
  if (lockstepEvents.length === 0) {
    fail('missing nav_cutout_lockstep_contract event');
    return;
  }
  const hasValidNavCutoutFormula = (event) => {
    const navBarHeight = numeric(event.navBarHeight);
    const navTranslateY = numeric(event.navTranslateY);
    const hideLead = numeric(event.hideLead);
    const expectedNavCutout = numeric(event.expectedNavCutout);
    const expectedSheetBodyExclusionHeight = numeric(event.expectedSheetBodyExclusionHeight);
    const expectedSheetMaskHeight = numeric(event.expectedSheetMaskHeight);
    const expectedVisiblePaintedHeight = numeric(event.expectedVisiblePaintedHeight);
    const navBarExtraTop = numeric(event.navBarExtraTop);
    const navBarCutoutProgress = numeric(event.navBarCutoutProgress);
    const navBarCutoutHidingProgress = numeric(event.navBarCutoutHidingProgress);
    const navBarHiddenTranslateY = numeric(event.navBarHiddenTranslateY);
    if (
      navBarHeight == null ||
      navTranslateY == null ||
      hideLead == null ||
      expectedNavCutout == null ||
      expectedSheetMaskHeight == null ||
      expectedVisiblePaintedHeight == null ||
      navBarExtraTop == null ||
      navBarCutoutProgress == null ||
      navBarCutoutHidingProgress == null ||
      navBarHiddenTranslateY == null
    ) {
      return false;
    }
    const expectedTranslate = (1 - navBarCutoutProgress) * navBarHiddenTranslateY;
    const expectedPaintedHeight = clamp(
      navBarHeight + navBarExtraTop - navTranslateY * hideLead,
      0,
      navBarHeight + navBarExtraTop
    );
    const expectedCutout = clamp(expectedPaintedHeight, 0, navBarHeight);
    const expectedSheetBodyExclusion = clamp(navBarHeight - navTranslateY, 0, navBarHeight);
    const expectedHideLead = 1;
    const expectedHidingProgress =
      event.navBarCutoutIsHiding === true ? 1 - navBarCutoutProgress : 0;
    const sheetMaskFollowsPaintedSilhouette =
      expectedSheetMaskHeight != null &&
      expectedSheetMaskHeight >= 0 &&
      approxEqual(expectedSheetMaskHeight, expectedPaintedHeight);
    return (
      navCutoutFormulaOk(event) &&
      navCutoutIsHidingSourceOk(event) &&
      navCutoutHidingProgressSourceOk(event) &&
      approxEqual(navBarCutoutHidingProgress, expectedHidingProgress) &&
      approxEqual(navTranslateY, expectedTranslate) &&
      approxEqual(hideLead, expectedHideLead) &&
      approxEqual(expectedVisiblePaintedHeight, expectedPaintedHeight) &&
      approxEqual(expectedNavCutout, expectedCutout) &&
      expectedSheetBodyExclusionHeight != null &&
      approxEqual(expectedSheetBodyExclusionHeight, expectedSheetBodyExclusion) &&
      event.sheetExclusionMode === 'animatedSearchTransition' &&
      event.navSilhouetteSheetMaskUsesInversePath === true &&
      event.sheetClipUsesSilhouettePath === true &&
      sheetMaskFollowsPaintedSilhouette
    );
  };
  const validEvents = lockstepEvents.filter(
    (event) =>
      event.navAndCutoutShareProgress === true &&
      event.navMaskMovesWithChrome === true &&
      event.groupedNavChromeMaskContainer === true &&
      event.sheetClipUsesNavProgress === true &&
      event.sheetClippedFromNavBody === true &&
      event.singleNavSilhouetteHost === true &&
      navBodySamplesMapOnlyRequired(event) &&
      cutoutSamplesSheetRequired(event) &&
      navSilhouetteMaterialFrosted(event) &&
      event.navHiddenTranslateCoversSilhouette === true &&
      event.bottomNavMotionDurationMs === 360 &&
      bottomNavMotionEasingOutCubic(event) &&
      navCutoutProgressSourceOk(event) &&
      loadingResultsSettledSheetExclusionModeOk(event) &&
      hasValidNavCutoutFormula(event)
  );
  const hideEvent = validEvents.find((event) => {
    const navTranslateY = numeric(event.navTranslateY);
    const expectedNavCutout = numeric(event.expectedNavCutout);
    const navBarHeight = numeric(event.navBarHeight);
    return (
      event.navMotionTarget === 'hide' &&
      event.navBarCutoutIsHiding === true &&
      event.hideLead === 1 &&
      navTranslateY != null &&
      navTranslateY > 0 &&
      expectedNavCutout != null &&
      navBarHeight != null &&
      expectedNavCutout < navBarHeight
    );
  });
  const dismissPreHandoffReturnEvent = validEvents.find(
    (event) =>
      event.navMotionTarget === 'show' &&
      event.isResultsClosing === true &&
      event.shouldHideBottomNavForSearchResultsMotion === false &&
      event.searchSurfacePhase === 'results_dismissing' &&
      event.searchSurfaceBottomBandOwner === 'results_header' &&
      event.searchSurfaceCanReleasePersistentPolls === false &&
      event.navBarCutoutIsHiding === false &&
      event.navReturnProgressSource === 'bottomNavTiming' &&
      event.sheetMotionSource === 'routeSheetMotion'
  );
  if (!hideEvent) {
    fail('nav/cutout lockstep contract did not prove submit hide motion');
  } else {
    pass('nav/cutout lockstep contract proved submit hide motion');
  }
  if (!scenarioExpectsResultsDismiss) {
    gap(`nav/cutout dismiss proof skipped for non-dismiss scenario ${scenarioName || '<unknown>'}`);
    return;
  }
  if (!dismissPreHandoffReturnEvent) {
    fail(
      'nav/cutout lockstep contract did not prove dismiss pre-boundary nav return/results-owned state'
    );
  } else {
    pass('nav/cutout lockstep contract proved dismiss pre-boundary nav return/results-owned state');
    const navTranslateY = numeric(dismissPreHandoffReturnEvent.navTranslateY);
    const navBarHiddenTranslateY = numeric(dismissPreHandoffReturnEvent.navBarHiddenTranslateY);
    const navBarCutoutProgress = numeric(dismissPreHandoffReturnEvent.navBarCutoutProgress);
    if (
      navTranslateY != null &&
      navBarHiddenTranslateY != null &&
      navTranslateY >= navBarHiddenTranslateY - 0.5 &&
      (navBarCutoutProgress ?? 0) <= 0.001
    ) {
      fail(
        `dismiss pre-boundary nav return was still hidden at line ${dismissPreHandoffReturnEvent.line}: navTranslateY=${navTranslateY}, hidden=${navBarHiddenTranslateY}, progress=${navBarCutoutProgress}`
      );
    } else {
      pass('dismiss pre-boundary nav return had visible progress before handoff');
    }
  }

  const firstCardsReady = byEvent('result_cards_ready')[0] ?? null;
  const firstDismissPress = byEvent('results_dismiss_press_up_contract')[0] ?? null;
  if (firstCardsReady && firstDismissPress) {
    const replayAfterReveal = validEvents.find(
      (event) =>
        event.line > firstCardsReady.line &&
        event.line < firstDismissPress.line &&
        event.navMotionTarget === 'show' &&
        event.searchSurfacePhase !== 'results_dismissing'
    );
    if (replayAfterReveal) {
      fail(
        `nav replayed after results reveal before dismiss at line ${replayAfterReveal.line}`
      );
    } else {
      pass('nav did not replay after cards/pins reveal before dismiss');
    }
  }
};

const checkDismissHandoffRuntimeContracts = () => {
  if (!scenarioExpectsResultsDismiss) {
    gap(
      `dismiss handoff runtime proof skipped for non-dismiss scenario ${
        scenarioName || '<unknown>'
      }`
    );
    return;
  }
  const dismissPressEvents = byEvent('results_dismiss_press_up_contract');
  const dismissBottomEvents = byEvent('results_dismiss_bottom_snap_handoff_contract');
  const dismissMotionPlaneEvents = byEvent('search_dismiss_motion_plane_contract');
  const submitPressEvents = byEvent('shortcut_submit_press_up_contract');
  const headerEvents = byEvent('search_header_visual_contract');
  const headerSourceEvents = byEvent('search_results_header_source_contract');
  const pollPageReadyEvents = byEvent('search_surface_poll_page_part_ready_contract');
  const pollPageReadySummaryEvents = byEvent('search_surface_poll_page_ready_contract');
  const retainedDismissPrewarmEvents = byEvent('retained_dismiss_prewarm_contract');
  const persistentPollsSheetHostEvents = byEvent('persistent_polls_sheet_host_contract');
  const persistentPollsSceneHeaderEvents = byEvent(
    'persistent_polls_scene_header_restoration_contract'
  );
  const boundaryFrame = readVideoProofFrame('resultsDismissBoundary');
  if (dismissPressEvents.length === 0) {
    fail('dismiss handoff runtime missing results_dismiss_press_up_contract event');
    return;
  }
  const isAtomicReleaseTelemetryLead = (event) =>
    dismissBottomEvents.some(
      (bottomEvent) =>
        bottomEvent.line >= event.line &&
        bottomEvent.line - event.line <= 5 &&
        bottomEvent.boundaryTrigger === 'collapsed_motion_plane_boundary' &&
        bottomEvent.canReleasePersistentPolls === true &&
        bottomEvent.isPersistentPollHostReady === true
    );
  const dismissWindows = dismissPressEvents.map((event) => ({
    dismissEvent: event,
    nextBoundaryLine:
      dismissBottomEvents.find((bottomEvent) => bottomEvent.line > event.line)?.line ??
      submitPressEvents.find((submitEvent) => submitEvent.line > event.line)?.line ??
      Number.POSITIVE_INFINITY,
  }));
  const instantCollapseWindow = dismissWindows.find(({ dismissEvent, nextBoundaryLine }) => {
    const samples = dismissMotionPlaneEvents.filter(
      (event) => event.line > dismissEvent.line && event.line < nextBoundaryLine
    );
    if (samples.length === 0) {
      return true;
    }
    const firstSample = samples[0];
    const travelPx = numeric(firstSample.sheetTravelPx);
    if (travelPx == null || travelPx < 8) {
      return true;
    }
    return !samples.some((event) => {
      const progress = numeric(event.dismissProgress);
      return (
        progress != null &&
        progress > 0 &&
        progress < 1 &&
        event.resultSheetSlidingDown === true &&
        event.sheetMotionSource === 'routeSheetMotionCommandObservedBySearchSurfaceMotionPlane' &&
        event.navReturnProgressSource === 'bottomNavTiming'
      );
    });
  });
  if (instantCollapseWindow) {
    fail(
      `dismiss motion plane did not prove multi-sample sheet descent after line ${instantCollapseWindow.dismissEvent.line}`
    );
  } else {
    pass('dismiss motion plane proved non-instant sheet descent');
  }
  const staleStartWindow = dismissWindows.find(({ dismissEvent, nextBoundaryLine }) => {
    if (
      dismissEvent.currentSheetSnap === 'collapsed' ||
      dismissEvent.currentSheetSnap === 'hidden'
    ) {
      return false;
    }
    const firstSample = dismissMotionPlaneEvents.find(
      (event) => event.line > dismissEvent.line && event.line < nextBoundaryLine
    );
    if (!firstSample) {
      return true;
    }
    const startY = numeric(firstSample.startY);
    const rawStartY = numeric(firstSample.rawStartY);
    const collapsedY = numeric(firstSample.collapsedY);
    const travelPx = numeric(firstSample.sheetTravelPx);
    if (startY == null || collapsedY == null || travelPx == null || travelPx < 8) {
      return true;
    }
    if (startY >= collapsedY - 0.5) {
      return true;
    }
    if (
      rawStartY != null &&
      rawStartY >= collapsedY - 0.5 &&
      firstSample.startSource !== 'visibleSnap'
    ) {
      return true;
    }
    return false;
  });
  if (staleStartWindow) {
    fail(
      `dismiss motion plane started from a collapsed/hidden shared value without reseeding the visible sheet snap after line ${staleStartWindow.dismissEvent.line}`
    );
  } else {
    pass('dismiss motion plane reseeded stale shared sheet value from visible snap when needed');
  }
  const missingRealMotionProgressProofWindow = dismissWindows.find(
    ({ dismissEvent, nextBoundaryLine }) => {
      const proofSample = dismissMotionPlaneEvents.find((event) => {
        const progress = numeric(event.dismissProgress);
        const sheetY = numeric(event.sheetY);
        const collapsedY = numeric(event.collapsedY);
        return (
          event.line > dismissEvent.line &&
          event.line < nextBoundaryLine &&
          progress != null &&
          progress >= 0.4 &&
          progress <= 0.7 &&
          sheetY != null &&
          collapsedY != null &&
          sheetY < collapsedY - 24 &&
          event.resultSheetSlidingDown === true &&
          event.proofStage === 'mid_progress' &&
          event.sheetMotionSource === 'routeSheetMotionCommandObservedBySearchSurfaceMotionPlane' &&
          event.navReturnProgressSource === 'bottomNavTiming' &&
          event.boundaryCommitSource === 'searchSurfaceMotionPlane'
        );
      });
      return proofSample == null;
    }
  );
  if (missingRealMotionProgressProofWindow) {
    fail(
      `dismiss motion plane did not expose a video-selectable real-motion mid-dismiss sample after line ${missingRealMotionProgressProofWindow.dismissEvent.line}`
    );
  } else {
    pass('dismiss motion plane exposed video-selectable real-motion mid-dismiss sample');
  }
  const badDismissNavSource = dismissWindows.find(({ dismissEvent, nextBoundaryLine }) =>
    dismissMotionPlaneEvents.some(
      (event) =>
        event.line > dismissEvent.line &&
        event.line < nextBoundaryLine &&
        (event.sheetMotionSource !== 'routeSheetMotionCommandObservedBySearchSurfaceMotionPlane' ||
          event.navReturnProgressSource !== 'bottomNavTiming' ||
          event.boundaryCommitSource !== 'searchSurfaceMotionPlane')
    )
  );
  if (badDismissNavSource) {
    fail(
      `dismiss motion plane sampled an invalid sheet/nav/handoff source after line ${badDismissNavSource.dismissEvent.line}`
    );
  } else {
    pass('dismiss motion plane kept sheet motion on the route runtime and nav return on bottom-nav timing');
  }
  const boundaryBeforePollReady = dismissMotionPlaneEvents.find(
    (event) => event.boundaryReached === true && event.pollPageReadyForBoundary !== true
  );
  if (boundaryBeforePollReady) {
    fail(
      `dismiss motion plane reached collapsed boundary before poll page readiness at line ${boundaryBeforePollReady.line}`
    );
  } else {
    pass('dismiss motion plane only reaches collapsed boundary after poll page readiness');
  }
  const resultHeaderOnlyRiskSample = dismissMotionPlaneEvents.find((event) => {
    const progress = numeric(event.dismissProgress);
    return (
      event.pollPageReadyForBoundary === true &&
      event.boundaryReached !== true &&
      progress != null &&
      progress > 0.82
    );
  });
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
  const badHandoffGeometrySample = dismissMotionPlaneEvents.find((event) => {
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
  const boundaryWithoutPollReleaseSample = dismissMotionPlaneEvents.find(
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
  const releasedHeaderBeforeBoundary = dismissWindows.find(({ dismissEvent, nextBoundaryLine }) =>
    headerEvents.some(
      (event) =>
        event.line > dismissEvent.line &&
        event.line < nextBoundaryLine &&
        !isAtomicReleaseTelemetryLead(event) &&
        (event.chromeMode !== 'results' ||
          event.searchSheetContentLaneKind !== 'results_closing' ||
          event.canAdmitResultsBody !== true ||
          event.shouldHoldResultsHeader !== true ||
          event.canReleasePersistentPolls !== false ||
          event.bottomBandOwner !== 'results_header')
    )
  );
  if (releasedHeaderBeforeBoundary) {
    fail(
      `dismiss handoff runtime released results header before boundary after line ${releasedHeaderBeforeBoundary.dismissEvent.line}`
    );
  } else {
    pass('dismiss handoff runtime kept results header until boundary');
  }
  const stripOnlyBeforeBoundary = dismissWindows.find(({ dismissEvent, nextBoundaryLine }) =>
    headerSourceEvents.some(
      (event) =>
        event.line > dismissEvent.line &&
        event.line < nextBoundaryLine &&
        (event.shouldShowResultsSurface !== true ||
          event.hasListHeaderForRender !== true ||
          event.hasStableHeaderChromeForRender !== true)
    )
  );
  if (stripOnlyBeforeBoundary) {
    fail(
      `dismiss handoff runtime dropped cards/header to strip-only before boundary after line ${stripOnlyBeforeBoundary.dismissEvent.line}`
    );
  } else {
    pass('dismiss handoff runtime did not sample strip-only before boundary');
  }
  if (dismissBottomEvents.length === 0) {
    fail('dismiss handoff runtime missing bottom handoff event');
    return;
  }
  const badBottomHandoff = dismissBottomEvents.find((event) => {
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
  if (badBottomHandoff) {
    fail(
      `dismiss handoff runtime released late or without renderable polls at line ${
        badBottomHandoff.line
      }: ${JSON.stringify({
        canExposePersistentPolls: badBottomHandoff.canExposePersistentPolls ?? null,
        canReleasePersistentPolls: badBottomHandoff.canReleasePersistentPolls ?? null,
        boundaryTrigger: badBottomHandoff.boundaryTrigger ?? null,
        isPersistentPollHostReady: badBottomHandoff.isPersistentPollHostReady ?? null,
        releaseDelayAfterCollapsedBoundaryMs:
          badBottomHandoff.releaseDelayAfterCollapsedBoundaryMs ??
          badBottomHandoff.releaseDelayAfterCollapsedBoundaryMs ??
          null,
        releasedAtCollapsedBoundary:
          badBottomHandoff.releasedAtCollapsedBoundary ?? null,
      })}`
    );
  } else {
    pass('dismiss handoff runtime releases at collapsed boundary with renderable polls');
  }
  const collapsedBoundaryBoundaryEvents = byEvent('results_dismiss_collapsed_boundary_contract');
  const missingPrewarmBeforeCollapsedBoundary = dismissPressEvents.find((dismissEvent) => {
    const boundaryEvent = collapsedBoundaryBoundaryEvents.find(
      (event) => event.line > dismissEvent.line && event.boundarySource === 'motion_plane'
    );
    if (!boundaryEvent) {
      return false;
    }
    const prewarmedBeforeDismissLine = dismissEvent.line - 12;
    const hasWarmPollReadiness = pollPageReadyEvents.some(
      (event) =>
        event.line >= prewarmedBeforeDismissLine &&
        event.line < boundaryEvent.line &&
        event.accepted === true &&
        event.activeTransactionId === dismissEvent.transactionId
    ) || pollPageReadySummaryEvents.some(
      (event) =>
        event.line >= prewarmedBeforeDismissLine &&
        event.line < boundaryEvent.line &&
        event.accepted === true &&
        event.activeTransactionId === dismissEvent.transactionId &&
        event.transactionId === dismissEvent.transactionId &&
        event.pollHeaderReady === true &&
        event.pollBodyReady === true &&
        event.pollHostReady === true
    ) || retainedDismissPrewarmEvents.some(
      (event) =>
        event.line >= prewarmedBeforeDismissLine &&
        event.line < boundaryEvent.line &&
        event.accepted === true &&
        event.activeTransactionId === dismissEvent.transactionId &&
        event.transactionId === dismissEvent.transactionId &&
        event.pollPageReadyBeforeMotion === true &&
        event.pollHeaderReady === true &&
        event.pollBodyReady === true &&
        event.pollHostReady === true &&
        event.outgoingResultsHeld === true &&
        event.outgoingResultsBodyAdmitted === true
    );
    const hasHeldResultsHeader = headerEvents.some(
      (event) =>
        event.line > dismissEvent.line &&
        event.line < boundaryEvent.line &&
        event.searchSurfacePhase === 'results_dismissing' &&
        event.searchSheetContentLaneKind === 'results_closing' &&
        event.canReleasePersistentPolls === false &&
        event.bottomBandOwner === 'results_header' &&
        event.shouldHoldResultsHeader === true
    ) || retainedDismissPrewarmEvents.some(
      (event) =>
        event.line >= prewarmedBeforeDismissLine &&
        event.line < boundaryEvent.line &&
        event.activeTransactionId === dismissEvent.transactionId &&
        event.transactionId === dismissEvent.transactionId &&
        event.outgoingResultsHeld === true &&
        event.outgoingResultsBodyAdmitted === true &&
        event.outgoingResultsChromeHeld === true &&
        event.searchSurfacePhase === 'results_dismissing' &&
        event.searchSheetContentLaneKind === 'results_closing' &&
        event.canReleasePersistentPolls === false &&
        event.bottomBandOwner === 'results_header' &&
        event.shouldHoldResultsHeader === true
    );
    return !hasWarmPollReadiness || !hasHeldResultsHeader;
  });
  if (missingPrewarmBeforeCollapsedBoundary) {
    fail(
      `dismiss handoff runtime did not prewarm persistent polls while visibly holding results after line ${missingPrewarmBeforeCollapsedBoundary.line}`
    );
  } else {
    pass('dismiss handoff runtime prewarms polls before collapsed boundary while results stay visible');
  }
  const isVisiblePollHostSwitchBeforeBoundary = (event) =>
    event.searchSurfacePhase === 'results_dismissing' &&
    event.searchSurfaceCanReleasePersistentPolls !== true &&
    (event.displayedSceneKey === 'polls' ||
      event.sheetPresentationSceneKey === 'polls' ||
      event.activeSemanticOverlayKey === 'polls');
  const preBoundaryPollHostSwitch = dismissPressEvents.find((dismissEvent) => {
    const collapsedBoundaryBoundaryEvent = collapsedBoundaryBoundaryEvents.find(
      (event) => event.line > dismissEvent.line && event.boundarySource === 'motion_plane'
    );
    if (!collapsedBoundaryBoundaryEvent) {
      return false;
    }
    return persistentPollsSheetHostEvents.some(
      (event) =>
        event.line > dismissEvent.line &&
        event.line < collapsedBoundaryBoundaryEvent.line &&
        isVisiblePollHostSwitchBeforeBoundary(event)
    );
  });
  if (preBoundaryPollHostSwitch) {
    const collapsedBoundaryBoundaryEvent = collapsedBoundaryBoundaryEvents.find(
      (event) =>
        event.line > preBoundaryPollHostSwitch.line && event.boundarySource === 'motion_plane'
    );
    const badHost = persistentPollsSheetHostEvents.find(
      (event) =>
        event.line > preBoundaryPollHostSwitch.line &&
        event.line < (collapsedBoundaryBoundaryEvent?.line ?? Number.POSITIVE_INFINITY) &&
        isVisiblePollHostSwitchBeforeBoundary(event)
    );
    fail(
      `dismiss handoff runtime switched persistent poll host before collapsed boundary at line ${
        badHost?.line ?? preBoundaryPollHostSwitch.line
      }: ${JSON.stringify({
        activeSemanticOverlayKey: badHost?.activeSemanticOverlayKey ?? null,
        displayedSceneKey: badHost?.displayedSceneKey ?? null,
        searchSurfaceBottomBandOwner: badHost?.searchSurfaceBottomBandOwner ?? null,
        searchSurfaceCanReleasePersistentPolls:
          badHost?.searchSurfaceCanReleasePersistentPolls ?? null,
        sheetPresentationSceneKey: badHost?.sheetPresentationSceneKey ?? null,
      })}`
    );
  } else {
    pass('dismiss handoff runtime keeps the visible sheet host on results before boundary');
  }
  const isMountedPollHeader = (event) =>
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
  const isAtomicHost = (event) =>
    event.isPersistentPollLane === true &&
    event.displayedSceneKey === 'polls' &&
    event.sheetPresentationSceneKey === 'polls' &&
    event.activeSemanticOverlayKey === 'polls' &&
    event.overlaySheetVisible === true &&
    event.runtimeConfigVisible === true &&
    event.canRenderSurface === true &&
    event.isRenderable === true &&
    event.isVisibleRenderablePersistentPollHost === true &&
    event.searchSurfacePhase === 'results_dismissing' &&
    event.searchSurfaceBottomBandOwner === 'persistent_polls' &&
    event.searchSurfaceCanReleasePersistentPolls === true &&
    event.navProjectionSheetClipMode === 'dockedPersistentPoll' &&
    event.navSilhouetteSheetClipMode === 'dockedPersistentPoll' &&
    event.searchSurfaceSheetClipMode === 'dockedPersistentPoll';
  const badAtomicHandoff = dismissBottomEvents.find((bottomEvent) => {
    const dismissEvent =
      dismissPressEvents.filter((event) => event.line < bottomEvent.line).at(-1) ?? null;
    const startLine = dismissEvent?.line ?? 0;
    const atomicHost = persistentPollsSheetHostEvents.some(
      (event) => event.line > startLine && event.line <= bottomEvent.line && isAtomicHost(event)
    );
    const mountedPollHeader = persistentPollsSceneHeaderEvents.some(
      (event) =>
        event.line > startLine && event.line <= bottomEvent.line && isMountedPollHeader(event)
    );
    const readyPollPageParts = new Set(
      pollPageReadyEvents
        .filter(
          (event) =>
            event.line > startLine &&
            event.line <= bottomEvent.line &&
            event.accepted === true &&
            event.transactionId === bottomEvent.transactionId &&
            event.pollBodyReady === true &&
            event.pollHeaderReady === true &&
            event.pollHostReady === true
        )
        .map((event) => event.part)
    );
    const mountedPollPageReady =
      (readyPollPageParts.has('header') &&
        readyPollPageParts.has('body') &&
        readyPollPageParts.has('host')) ||
      pollPageReadySummaryEvents.some(
        (event) =>
          event.line > startLine &&
          event.line <= bottomEvent.line &&
          event.accepted === true &&
          event.transactionId === bottomEvent.transactionId &&
          event.pollBodyReady === true &&
          event.pollHeaderReady === true &&
          event.pollHostReady === true
      ) ||
      retainedDismissPrewarmEvents.some(
        (event) =>
          event.line >= startLine - 12 &&
          event.line <= bottomEvent.line &&
          event.accepted === true &&
          event.transactionId === bottomEvent.transactionId &&
          event.pollPageReadyBeforeMotion === true &&
          event.pollBodyReady === true &&
          event.pollHeaderReady === true &&
          event.pollHostReady === true
      );
    const videoBoundaryFrameShowsPollPage =
      boundaryFrame?.resultToggleStripVisible === false &&
      typeof boundaryFrame?.outputPath === 'string';
    return (
      !atomicHost ||
      (!mountedPollHeader && !mountedPollPageReady && !videoBoundaryFrameShowsPollPage)
    );
  });
  if (badAtomicHandoff) {
    const dismissEvent =
      dismissPressEvents.filter((event) => event.line < badAtomicHandoff.line).at(-1) ?? null;
    const startLine = dismissEvent?.line ?? 0;
    const latestHost =
      persistentPollsSheetHostEvents
        .filter((event) => event.line > startLine && event.line <= badAtomicHandoff.line)
        .at(-1) ?? null;
    fail(
      `dismiss handoff runtime did not atomically switch to docked persistent polls at line ${
        badAtomicHandoff.line
      }: ${JSON.stringify({
        activeSemanticOverlayKey: latestHost?.activeSemanticOverlayKey ?? null,
        displayedSceneKey: latestHost?.displayedSceneKey ?? null,
        navProjectionSheetClipMode: latestHost?.navProjectionSheetClipMode ?? null,
        navSilhouetteSheetClipMode: latestHost?.navSilhouetteSheetClipMode ?? null,
        searchSurfaceBottomBandOwner: latestHost?.searchSurfaceBottomBandOwner ?? null,
        searchSurfaceCanReleasePersistentPolls:
          latestHost?.searchSurfaceCanReleasePersistentPolls ?? null,
        sheetPresentationSceneKey: latestHost?.sheetPresentationSceneKey ?? null,
      })}`
    );
  } else {
    pass('dismiss handoff runtime atomically switched to docked persistent polls');
  }
  const resultHeaderOnlyAfterBoundary = dismissBottomEvents.find((bottomEvent) => {
    const nextAtomicHostLine =
      persistentPollsSheetHostEvents.find(
        (event) => event.line >= bottomEvent.line && isAtomicHost(event)
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
        (event) => event.line >= resultHeaderOnlyAfterBoundary.line && isAtomicHost(event)
      )?.line ?? Number.POSITIVE_INFINITY;
    const badHeaderSource = headerSourceEvents.find(
      (event) =>
        event.line >= resultHeaderOnlyAfterBoundary.line &&
        event.line < nextAtomicHostLine &&
        event.stableHeaderChromeOwner === 'result_page' &&
        (event.shouldShowResultsSurface !== true || event.hasListHeaderForRender !== true)
    );
    fail(
      `dismiss handoff runtime exposed result-header-only chrome after boundary at line ${
        badHeaderSource?.line ?? resultHeaderOnlyAfterBoundary.line
      }: ${JSON.stringify({
        hasListHeaderForRender: badHeaderSource?.hasListHeaderForRender ?? null,
        shouldShowResultsSurface: badHeaderSource?.shouldShowResultsSurface ?? null,
        stableHeaderChromeOwner: badHeaderSource?.stableHeaderChromeOwner ?? null,
        surfaceMode: badHeaderSource?.surfaceMode ?? null,
      })}`
    );
  } else {
    pass('dismiss handoff runtime never exposes result-header-only chrome after boundary');
  }
};

const checkTransitionGapRuntimeContracts = () => {
  const transitionConfig = config.transitionGap;
  if (!transitionConfig) {
    return;
  }
  if (skipScreenshotScenarioContract('transition gap runtime/screenshot-line contract')) {
    return;
  }

  const lockstepEvents = byEvent('nav_cutout_lockstep_contract');
  const enteringScreenshotName = transitionConfig.resultsEnteringScreenshot
    ? config.screenshots?.names?.[transitionConfig.resultsEnteringScreenshot]
    : null;
  const enteringScreenshotLine = enteringScreenshotName
    ? readScreenshotCaptureLineFromLog(enteringScreenshotName)
    : null;
  const closeVideoProof = readVideoProofFrame('resultsClosePressUp');
  const earlyDismissVideoProof = readVideoProofFrame('resultsDismissEarly');
  const midDismissVideoProof = readVideoProofFrame('resultsDismissMid');
  const dismissingScreenshotLine = Number(closeVideoProof?.eventLine);
  const dismissMotionProofLine = Number(
    midDismissVideoProof?.eventLine ?? earlyDismissVideoProof?.eventLine ?? closeVideoProof?.eventLine
  );
  const firstCoverReveal = byEvent('cards_pins_cover_reveal_started')[0] ?? null;
  const firstDismissPress = byEvent('results_dismiss_press_up_contract')[0] ?? null;
  const firstDismissBottom = firstDismissPress
    ? byEvent('results_dismiss_bottom_snap_handoff_contract').find(
        (event) => event.line > firstDismissPress.line
      ) ?? null
    : null;
  const boundaryRenderProof = firstDismissBottom
    ? byEvent('persistent_polls_restore_settled_contract').find(
        (event) =>
          event.line > firstDismissBottom.line &&
          event.snap === 'collapsed' &&
          event.restoredToCollapsed === true
      ) ??
      byEvent('nav_cutout_lockstep_contract').find(
        (event) =>
          event.line > firstDismissBottom.line &&
          event.searchSurfaceBottomBandOwner === 'persistent_polls' &&
          event.searchSurfaceCanReleasePersistentPolls === true &&
          event.sheetClippedFromNavBody === true
      ) ??
      byEvent('search_header_visual_contract').find(
        (event) =>
          event.line > firstDismissBottom.line &&
          event.searchSheetContentLaneKind === 'persistent_poll' &&
          event.bottomBandOwner === 'persistent_polls' &&
          event.canReleasePersistentPolls === true
      ) ??
      byEvent('persistent_polls_restore_state_contract').find(
        (event) =>
          event.line > firstDismissBottom.line &&
          event.visible === true &&
          event.restoredToCollapsed === true
      ) ??
      firstDismissBottom
    : null;

  if (!transitionConfig.resultsEnteringScreenshot) {
    gap('resultsEntering screenshot proof is not required by this contract');
  } else if (enteringScreenshotLine == null) {
    fail('resultsEntering screenshot capture line is missing; cannot prove enter transition gap');
  } else if (firstCoverReveal != null && enteringScreenshotLine > firstCoverReveal.line) {
    gap(
      `resultsEntering screenshot was captured after cover reveal: screenshot line ${enteringScreenshotLine}, cover line ${firstCoverReveal.line}`
    );
  } else {
    pass(
      `resultsEntering screenshot captured before cover reveal at line ${enteringScreenshotLine}`
    );
  }

  const hideDuringEnter = lockstepEvents.find((event) => {
    if (enteringScreenshotLine != null && event.line > enteringScreenshotLine) {
      return false;
    }
    const navTranslateY = numeric(event.navTranslateY);
    const expectedNavCutout = numeric(event.expectedNavCutout);
    const navBarHeight = numeric(event.navBarHeight);
    return (
      event.navMotionTarget === 'hide' &&
      event.navBarCutoutIsHiding === true &&
      event.sheetClippedFromNavBody === true &&
      event.singleNavSilhouetteHost === true &&
      navBodySamplesMapOnlyRequired(event) &&
      cutoutSamplesSheetRequired(event) &&
      navSilhouetteMaterialFrosted(event) &&
      event.sheetClipUsesNavProgress === true &&
      event.sheetClipUsesSilhouettePath === true &&
      event.sheetExclusionMode === 'animatedSearchTransition' &&
      numeric(event.expectedSheetMaskHeight) != null &&
      navTranslateY != null &&
      navTranslateY > 0 &&
      expectedNavCutout != null &&
      navBarHeight != null &&
      expectedNavCutout < navBarHeight
    );
  });
  if (!hideDuringEnter) {
    fail(
      'missing nav_cutout_lockstep_contract sample proving no gap while nav hides/results enter'
    );
  } else {
    pass(`nav hide/results enter no-gap sample line=${hideDuringEnter.line}`);
  }

  if (!Number.isFinite(dismissingScreenshotLine)) {
    fail(
      'resultsClosePressUp video proof frame metadata is missing; cannot prove dismiss transition gap'
    );
  } else if (!firstDismissPress) {
    fail('resultsClosePressUp screenshot exists but results_dismiss_press_up_contract is missing');
  } else if (dismissingScreenshotLine <= firstDismissPress.line) {
    fail(
      `resultsClosePressUp video proof was selected before dismiss press-up event: proof line ${dismissingScreenshotLine}, dismiss line ${firstDismissPress.line}`
    );
  } else if (firstDismissBottom != null && dismissingScreenshotLine >= firstDismissBottom.line) {
    fail(
      `resultsClosePressUp video proof was selected after bottom handoff: proof line ${dismissingScreenshotLine}, handoff line ${firstDismissBottom.line}`
    );
  } else {
    pass(
      `resultsClosePressUp video proof selected inside dismiss transition at line ${dismissingScreenshotLine}`
    );
  }

  const returningDuringDismiss = lockstepEvents.find((event) => {
    if (
      firstDismissPress &&
      (event.line <= firstDismissPress.line ||
        (firstDismissBottom != null && event.line >= firstDismissBottom.line))
    ) {
      return false;
    }
    return (
      event.navMotionTarget === 'show' &&
      event.isResultsClosing === true &&
      event.shouldHideBottomNavForSearchResultsMotion === false &&
      event.searchSurfacePhase === 'results_dismissing' &&
      event.searchSurfaceBottomBandOwner === 'results_header' &&
      event.searchSurfaceCanReleasePersistentPolls === false &&
      event.sheetClippedFromNavBody === true &&
      event.singleNavSilhouetteHost === true &&
      navBodySamplesMapOnlyRequired(event) &&
      cutoutSamplesSheetRequired(event) &&
      navSilhouetteMaterialFrosted(event) &&
      event.navReturnProgressSource === 'bottomNavTiming' &&
      event.sheetMotionSource === 'routeSheetMotion' &&
      event.sheetClipUsesNavProgress === true &&
      event.sheetClipUsesSilhouettePath === true &&
      event.sheetExclusionMode === 'animatedSearchTransition' &&
      numeric(event.expectedSheetMaskHeight) != null
    );
  });
  if (!returningDuringDismiss) {
    fail(
      'missing nav_cutout_lockstep_contract sample proving no gap while results dismiss/nav return remains results-owned pre-boundary'
    );
  } else {
    pass(
      `results dismiss pre-boundary nav-return/results-owned no-gap sample line=${returningDuringDismiss.line}`
    );
  }
};

const resolveScreenshotDir = () => {
  const configured = screenshotDirOverride ?? process.env.PERF_SCENARIO_SCREENSHOT_DIR;
  if (configured) {
    return path.resolve(configured);
  }
  if (typeof report.screenshotDirectory === 'string' && report.screenshotDirectory.length > 0) {
    return path.resolve(report.screenshotDirectory);
  }
  return path.resolve(repoRoot, config.screenshots?.directory ?? '.');
};

const resolveScreenshotPath = (name) => {
  const fileName = name.endsWith('.png') ? name : `${name}.png`;
  const screenshotDir = resolveScreenshotDir();
  const directPath = path.join(screenshotDir, fileName);
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  return path.join(screenshotDir, 'screenshots', fileName);
};

const readPng = (filePath) => {
  if (PNG == null) {
    gap('pngjs is unavailable; screenshot pixel contracts were skipped');
    return null;
  }
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return PNG.sync.read(fs.readFileSync(filePath));
};

const resolveProbeFramePaths = (patterns = []) => {
  const paths = [];
  for (const pattern of patterns) {
    const resolvedPattern = path.resolve(
      String(pattern)
        .replaceAll('{screenshotDirectory}', resolveScreenshotDir())
        .replaceAll('{scenarioRunId}', report.scenarioRunId ?? '')
    );
    const directory = path.dirname(resolvedPattern);
    const basename = path.basename(resolvedPattern);
    if (!basename.includes('*')) {
      if (fs.existsSync(resolvedPattern)) {
        paths.push(resolvedPattern);
      }
      continue;
    }
    if (!fs.existsSync(directory)) {
      continue;
    }
    const regex = new RegExp(
      `^${basename
        .split('*')
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`
    );
    for (const entry of fs.readdirSync(directory)) {
      if (regex.test(entry)) {
        paths.push(path.join(directory, entry));
      }
    }
  }
  const minMtimeMs =
    typeof report.videoFile === 'string' && fs.existsSync(report.videoFile)
      ? fs.statSync(report.videoFile).mtimeMs - 5000
      : Date.parse(report.generatedAt ?? '') - 5000;
  const uniquePaths = [...new Set(paths)];
  if (!Number.isFinite(minMtimeMs)) {
    return uniquePaths.sort();
  }
  return uniquePaths.filter((filePath) => fs.statSync(filePath).mtimeMs >= minMtimeMs).sort();
};

const sampleTintRatio = (png, region, predicate) => {
  const { width, height, data } = png;
  const xStart = Math.max(0, Math.min(width, Math.round(region.x)));
  const yStart = Math.max(0, Math.min(height, Math.round(region.y)));
  const xEnd = Math.max(xStart, Math.min(width, Math.round(region.x + region.width)));
  const yEnd = Math.max(yStart, Math.min(height, Math.round(region.y + region.height)));
  let matching = 0;
  let total = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      const a = data[offset + 3];
      if (a < 220) {
        continue;
      }
      total += 1;
      if (predicate(data[offset], data[offset + 1], data[offset + 2], a)) {
        matching += 1;
      }
    }
  }
  return total === 0 ? 0 : matching / total;
};

const resolveRegion = (png, detection, regionConfig, defaults) => ({
  x: png.width * (regionConfig.xRatio ?? defaults.xRatio),
  y:
    typeof regionConfig.yOffsetPx === 'number' && detection != null
      ? detection.y + regionConfig.yOffsetPx
      : png.height * (regionConfig.yRatio ?? defaults.yRatio),
  width: png.width * (regionConfig.widthRatio ?? defaults.widthRatio),
  height:
    typeof regionConfig.heightPx === 'number'
      ? regionConfig.heightPx
      : png.height * (regionConfig.heightRatio ?? defaults.heightRatio),
});

const samplePollHeaderForegroundProof = (png, detection, proofConfig = {}) => {
  const headerRegion = resolveRegion(
    png,
    detection,
    proofConfig.headerRegion ?? {},
    { xRatio: 0.04, yRatio: 0.8, widthRatio: 0.92, heightRatio: 0.06 }
  );
  const titleRegion = resolveRegion(
    png,
    detection,
    proofConfig.titleRegion ?? {},
    { xRatio: 0.06, yRatio: 0.8, widthRatio: 0.56, heightRatio: 0.06 }
  );
  const badgeRegion = resolveRegion(
    png,
    detection,
    proofConfig.badgeRegion ?? {},
    { xRatio: 0.62, yRatio: 0.8, widthRatio: 0.28, heightRatio: 0.06 }
  );
  const isWhiteHeaderPixel = (r, g, b) =>
    luma(r, g, b) >= 238 && Math.max(r, g, b) - Math.min(r, g, b) <= 34;
  const isDarkGlyphPixel = (r, g, b) =>
    luma(r, g, b) <= 135 && Math.max(r, g, b) - Math.min(r, g, b) <= 90;
  return {
    headerWhiteRatio: sampleTintRatio(png, headerRegion, isWhiteHeaderPixel),
    titleDarkGlyphRatio: sampleTintRatio(png, titleRegion, isDarkGlyphPixel),
    badgeDarkGlyphRatio: sampleTintRatio(png, badgeRegion, isDarkGlyphPixel),
  };
};

const checkMapMovedScreenshotContract = () => {
  if (skipMapInteractionScenarioContract('map moved screenshot contract')) {
    return;
  }
  if (skipScreenshotScenarioContract('map moved screenshot contract')) {
    return;
  }
  const mapInteractionConfig = config.mapInteraction;
  if (!mapInteractionConfig) {
    return;
  }
  const names = config.screenshots?.names ?? {};
  const beforeName = names[mapInteractionConfig.beforeDragScreenshot];
  const afterName = names[mapInteractionConfig.afterDragScreenshot];
  if (!beforeName || !afterName) {
    fail('map interaction screenshot keys are not configured');
    return;
  }
  const beforePng = readPng(resolveScreenshotPath(beforeName));
  const afterPng = readPng(resolveScreenshotPath(afterName));
  if (beforePng == null || afterPng == null) {
    fail('map interaction screenshots are missing');
    return;
  }
  if (beforePng.width !== afterPng.width || beforePng.height !== afterPng.height) {
    fail('map interaction screenshots have mismatched dimensions');
    return;
  }
  const region = mapInteractionConfig.region ?? {};
  const xStart = Math.floor(beforePng.width * (region.xRatioStart ?? 0.05));
  const xEnd = Math.floor(beforePng.width * (region.xRatioEnd ?? 0.95));
  const yStart = Math.floor(beforePng.height * (region.yRatioStart ?? 0.2));
  const yEnd = Math.floor(beforePng.height * (region.yRatioEnd ?? 0.36));
  const sampleStep = Math.max(1, Number(region.sampleStep ?? 3));
  let totalDiff = 0;
  let count = 0;
  for (let y = yStart; y < yEnd; y += sampleStep) {
    for (let x = xStart; x < xEnd; x += sampleStep) {
      const offset = (y * beforePng.width + x) * 4;
      totalDiff +=
        Math.abs(beforePng.data[offset] - afterPng.data[offset]) +
        Math.abs(beforePng.data[offset + 1] - afterPng.data[offset + 1]) +
        Math.abs(beforePng.data[offset + 2] - afterPng.data[offset + 2]);
      count += 1;
    }
  }
  const averageDiff = count > 0 ? totalDiff / count : 0;
  const minAverageDiff = Number(mapInteractionConfig.averageRgbDiffMin ?? 12);
  if (averageDiff >= minAverageDiff) {
    pass(`map screenshot changed after drag avgDiff=${round(averageDiff)} >= ${minAverageDiff}`);
  } else {
    fail(
      `map screenshot did not move after drag avgDiff=${round(averageDiff)} < ${minAverageDiff}`
    );
  }

  const sheetScreenshotKeys = [
    mapInteractionConfig.afterDragScreenshot,
    mapInteractionConfig.searchThisAreaVisibleScreenshot,
  ].filter(Boolean);
  const targetSnap = mapInteractionConfig.resultsSheetStillVisibleTargetSnap ?? 'middle';
  const expectedPx = Number(config.sheetSnap?.snapPointsPx?.[targetSnap]);
  const tolerancePx = Number(config.sheetSnap?.tolerancePx ?? 18);
  const bottomBandRegion = mapInteractionConfig.resultsSheetBottomBandRegion;
  const bottomBandMinRatio = Number(
    mapInteractionConfig.resultsSheetBottomBandSheetLikeRatioMin ?? 0.65
  );
  for (const screenshotKey of sheetScreenshotKeys) {
    const screenshotName = names[screenshotKey];
    if (!screenshotName) {
      fail(`post-drag sheet screenshot key ${screenshotKey} is not configured`);
      continue;
    }
    const png = readPng(resolveScreenshotPath(screenshotName));
    if (png == null) {
      fail(`post-drag sheet screenshot missing for ${screenshotKey}`);
      continue;
    }
    const detection = detectSheetTopPx(png, config.sheetSnap?.detection);
    if (detection == null) {
      fail(`post-drag results sheet disappeared in ${screenshotKey}: sheet top not detected`);
      continue;
    }
    const deltaPx = Math.abs(detection.y - expectedPx);
    if (Number.isFinite(expectedPx) && deltaPx <= tolerancePx) {
      pass(
        `post-drag results sheet ${screenshotKey} top ${detection.y}px matches ${targetSnap} ${expectedPx}px +/- ${tolerancePx}px`
      );
    } else {
      fail(
        `post-drag results sheet ${screenshotKey} top ${detection.y}px expected ${targetSnap} ${expectedPx}px +/- ${tolerancePx}px`
      );
    }
    if (bottomBandRegion) {
      const stats = sampleNavUnderlayRegionStats(
        png,
        bottomBandRegion,
        config.navUnderlay?.sheetLikePixel ?? {}
      );
      if (stats == null) {
        fail(`post-drag results sheet bottom band was empty for ${screenshotKey}`);
      } else if (stats.sheetLikePixelRatio >= bottomBandMinRatio) {
        pass(
          `post-drag results sheet bottom band ${screenshotKey} sheet-like ratio ${round(
            stats.sheetLikePixelRatio
          )} >= ${bottomBandMinRatio}`
        );
      } else {
        fail(
          `post-drag results sheet bottom band ${screenshotKey} looks clipped ratio ${round(
            stats.sheetLikePixelRatio
          )} < ${bottomBandMinRatio}; meanLuma=${round(stats.meanLuma)} meanChroma=${round(
            stats.meanChroma
          )}`
        );
      }
    }
  }
};

const average = (values, start, end) => {
  let total = 0;
  let count = 0;
  for (let index = start; index < end; index += 1) {
    total += values[index] ?? 0;
    count += 1;
  }
  return count > 0 ? total / count : 0;
};

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const detectSheetTopPx = (png, detectionConfig) => {
  const { width, height, data } = png;
  const xStart = Math.floor(width * (detectionConfig?.xStartRatio ?? 0.08));
  const xEnd = Math.floor(width * (detectionConfig?.xEndRatio ?? 0.92));
  const yStart = Math.floor(height * (detectionConfig?.yStartRatio ?? 0.25));
  const yEnd = Math.floor(height * (detectionConfig?.yEndRatio ?? 0.92));
  const rowRatios = [];

  for (let y = 0; y < height; y += 1) {
    let lightPixels = 0;
    let totalPixels = 0;
    for (let x = xStart; x < xEnd; x += 3) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (
        luma(r, g, b) >= (detectionConfig?.lightLumaMin ?? 246) &&
        chroma <= (detectionConfig?.neutralChromaMax ?? 18)
      ) {
        lightPixels += 1;
      }
      totalPixels += 1;
    }
    rowRatios.push(totalPixels > 0 ? lightPixels / totalPixels : 0);
  }

  let best = null;
  for (let y = yStart; y < yEnd; y += 1) {
    const current = average(rowRatios, y, Math.min(height, y + 8));
    const previous = average(rowRatios, Math.max(0, y - 50), Math.max(0, y - 10));
    const next = average(rowRatios, y + 10, Math.min(height, y + 80));
    const score = current - previous + next - previous;
    if (current < (detectionConfig?.currentLightRatioMin ?? 0.72)) {
      continue;
    }
    if (next < (detectionConfig?.nextLightRatioMin ?? 0.72)) {
      continue;
    }
    if (best == null || score > best.score) {
      best = {
        y,
        score,
        currentLightRatio: current,
        previousLightRatio: previous,
        nextLightRatio: next,
      };
    }
  }
  return best;
};

const nearestSnap = (valuePx, snaps) => {
  let nearest = null;
  for (const [snap, snapValue] of Object.entries(snaps)) {
    const delta = Math.abs(valuePx - Number(snapValue));
    if (nearest == null || delta < nearest.deltaPx) {
      nearest = {
        snap,
        valuePx: snapValue,
        deltaPx: delta,
      };
    }
  }
  return nearest;
};

const sampleRegionStats = (png, region) => {
  const { width, height, data } = png;
  const xStart = Math.max(0, Math.min(width, Math.round(region.x)));
  const yStart = Math.max(0, Math.min(height, Math.round(region.y)));
  const xEnd = Math.max(xStart, Math.min(width, Math.round(region.x + region.width)));
  const yEnd = Math.max(yStart, Math.min(height, Math.round(region.y + region.height)));
  const values = [];
  let whiteSheetPixelCount = 0;
  let chromaTotal = 0;
  const whiteSheetMin = Number(region.whiteSheetMin ?? 248);
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      const pixelLuma = luma(r, g, b);
      values.push(pixelLuma);
      chromaTotal += Math.max(r, g, b) - Math.min(r, g, b);
      if (a > 220 && r >= whiteSheetMin && g >= whiteSheetMin && b >= whiteSheetMin) {
        whiteSheetPixelCount += 1;
      }
    }
  }
  if (values.length === 0) {
    return null;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length;
  return {
    meanLuma: mean,
    stddevLuma: Math.sqrt(variance),
    meanChroma: chromaTotal / values.length,
    pixelCount: values.length,
    whiteSheetPixelCount,
    whiteSheetPixelRatio: whiteSheetPixelCount / values.length,
  };
};

const sampleNavUnderlayRegionStats = (png, region, pixelConfig = {}) => {
  const { width, height, data } = png;
  const xStart = Math.max(0, Math.min(width, Math.round(region.x)));
  const yStart = Math.max(0, Math.min(height, Math.round(region.y)));
  const xEnd = Math.max(xStart, Math.min(width, Math.round(region.x + region.width)));
  const yEnd = Math.max(yStart, Math.min(height, Math.round(region.y + region.height)));
  const lumaValues = [];
  let sheetLikePixelCount = 0;
  let pollProfileTintPixelCount = 0;
  let whiteSheetPixelCount = 0;
  let chromaTotal = 0;
  const lumaMin = Number(pixelConfig.lumaMin ?? 246);
  const neutralChromaMax = Number(pixelConfig.neutralChromaMax ?? 18);
  const pollProfileTintRedMin = Number(pixelConfig.pollProfileTintRedMin ?? 230);
  const pollProfileTintGreenMin = Number(pixelConfig.pollProfileTintGreenMin ?? 120);
  const pollProfileTintGreenMax = Number(pixelConfig.pollProfileTintGreenMax ?? 225);
  const pollProfileTintBlueMin = Number(pixelConfig.pollProfileTintBlueMin ?? 150);
  const pollProfileTintBlueMax = Number(pixelConfig.pollProfileTintBlueMax ?? 235);
  const pollProfileTintRedGreenDeltaMin = Number(pixelConfig.pollProfileTintRedGreenDeltaMin ?? 20);
  const whiteSheetMin = Number(pixelConfig.whiteSheetMin ?? 248);
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      const pixelLuma = luma(r, g, b);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      lumaValues.push(pixelLuma);
      chromaTotal += chroma;
      if (a > 220 && pixelLuma >= lumaMin && chroma <= neutralChromaMax) {
        sheetLikePixelCount += 1;
      }
      if (
        a > 220 &&
        r >= pollProfileTintRedMin &&
        g >= pollProfileTintGreenMin &&
        g <= pollProfileTintGreenMax &&
        b >= pollProfileTintBlueMin &&
        b <= pollProfileTintBlueMax &&
        r - g >= pollProfileTintRedGreenDeltaMin
      ) {
        pollProfileTintPixelCount += 1;
      }
      if (a > 220 && r >= whiteSheetMin && g >= whiteSheetMin && b >= whiteSheetMin) {
        whiteSheetPixelCount += 1;
      }
    }
  }
  if (lumaValues.length === 0) {
    return null;
  }
  const meanLuma = lumaValues.reduce((sum, value) => sum + value, 0) / lumaValues.length;
  const variance =
    lumaValues.reduce((sum, value) => sum + (value - meanLuma) * (value - meanLuma), 0) /
    lumaValues.length;
  return {
    meanLuma,
    stddevLuma: Math.sqrt(variance),
    meanChroma: chromaTotal / lumaValues.length,
    pixelCount: lumaValues.length,
    sheetLikePixelCount,
    sheetLikePixelRatio: sheetLikePixelCount / lumaValues.length,
    pollProfileTintPixelCount,
    pollProfileTintPixelRatio: pollProfileTintPixelCount / lumaValues.length,
    whiteSheetPixelCount,
    whiteSheetPixelRatio: whiteSheetPixelCount / lumaValues.length,
  };
};

const sampleDismissResultBodyContentStats = (png, region) => {
  const { width, height, data } = png;
  const xStart = Math.max(0, Math.min(width, Math.round(region.x)));
  const yStart = Math.max(0, Math.min(height, Math.round(region.y)));
  const xEnd = Math.max(xStart, Math.min(width, Math.round(region.x + region.width)));
  const yEnd = Math.max(yStart, Math.min(height, Math.round(region.y + region.height)));
  let total = 0;
  let ink = 0;
  for (let y = yStart; y < yEnd; y += 2) {
    for (let x = xStart; x < xEnd; x += 2) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const pixelLuma = luma(r, g, b);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (pixelLuma < 135 || (chroma > 44 && pixelLuma < 245)) {
        ink += 1;
      }
      total += 1;
    }
  }
  if (total === 0) {
    return null;
  }
  return {
    heightPx: yEnd - yStart,
    inkPixelRatio: ink / total,
    pixelCount: total,
  };
};

const countTrailingNonSheetLikeRows = (png, region, pixelConfig = {}, rowRatioMin = 0.65) => {
  const { width, height, data } = png;
  const xStart = Math.max(0, Math.min(width, Math.round(region.x)));
  const yStart = Math.max(0, Math.min(height, Math.round(region.y)));
  const xEnd = Math.max(xStart, Math.min(width, Math.round(region.x + region.width)));
  const yEnd = Math.max(yStart, Math.min(height, Math.round(region.y + region.height)));
  const lumaMin = Number(pixelConfig.lumaMin ?? 246);
  const neutralChromaMax = Number(pixelConfig.neutralChromaMax ?? 18);
  let trailingNonSheetLikeRows = 0;
  for (let y = yEnd - 1; y >= yStart; y -= 1) {
    let rowPixels = 0;
    let sheetLikePixels = 0;
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      const pixelLuma = luma(r, g, b);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      rowPixels += 1;
      if (a > 220 && pixelLuma >= lumaMin && chroma <= neutralChromaMax) {
        sheetLikePixels += 1;
      }
    }
    if (rowPixels === 0 || sheetLikePixels / rowPixels >= rowRatioMin) {
      break;
    }
    trailingNonSheetLikeRows += 1;
  }
  return trailingNonSheetLikeRows;
};

const checkTransitionGapScreenshotContracts = () => {
  if (skipScreenshotScenarioContract('transition gap screenshot contract')) {
    return;
  }
  const transitionConfig = config.transitionGap;
  if (!transitionConfig) {
    return;
  }
  const names = config.screenshots?.names ?? {};
  const sheetLikePixel = config.navUnderlay?.sheetLikePixel ?? {};
  const defaultRegion =
    transitionConfig.bottomBandRegion ?? config.navUnderlay?.hiddenNavBandRegion ?? null;
  const minRatio = Number(
    transitionConfig.bottomBandSheetLikeRatioMin ??
      config.navUnderlay?.hiddenNavBandSheetLikeRatioMin ??
      0.65
  );
  const navChromePinkPixelMin = Number(transitionConfig.bottomBandNavChromePinkPixelMin ?? 500);
  if (!defaultRegion && !transitionConfig.bottomBandRegionsByScreenshot) {
    fail('transition gap bottom band region is not configured');
    return;
  }
  const firstCoverReveal = byEvent('cards_pins_cover_reveal_started')[0] ?? null;
  const firstDismissPress = byEvent('results_dismiss_press_up_contract')[0] ?? null;
  const firstDismissBottom = firstDismissPress
    ? byEvent('results_dismiss_bottom_snap_handoff_contract').find(
        (event) => event.line > firstDismissPress.line
      ) ?? null
    : null;
  const boundaryRenderProof = firstDismissBottom
    ? byEvent('persistent_polls_restore_settled_contract').find(
        (event) =>
          event.line > firstDismissBottom.line &&
          event.snap === 'collapsed' &&
          event.restoredToCollapsed === true
      ) ??
      byEvent('nav_cutout_lockstep_contract').find(
        (event) =>
          event.line > firstDismissBottom.line &&
          event.searchSurfaceBottomBandOwner === 'persistent_polls' &&
          event.searchSurfaceCanReleasePersistentPolls === true &&
          event.sheetClippedFromNavBody === true
      ) ??
      byEvent('search_header_visual_contract').find(
        (event) =>
          event.line > firstDismissBottom.line &&
          event.searchSheetContentLaneKind === 'persistent_poll' &&
          event.bottomBandOwner === 'persistent_polls' &&
          event.canReleasePersistentPolls === true
      ) ??
      byEvent('persistent_polls_restore_state_contract').find(
        (event) =>
          event.line > firstDismissBottom.line &&
          event.visible === true &&
          event.restoredToCollapsed === true
      ) ??
      firstDismissBottom
    : null;
  const dismissMotionPlaneEvents = byEvent('search_dismiss_motion_plane_contract');
  const dismissProofSheetTops = {};
  const videoProofKeysByScreenshot = new Map([
    [transitionConfig.resultsClosePressUpScreenshot, 'resultsClosePressUp'],
    [transitionConfig.resultsDismissEarlyScreenshot, 'resultsDismissEarly'],
    [transitionConfig.resultsDismissMidScreenshot, 'resultsDismissMid'],
    [transitionConfig.resultsDismissBoundaryScreenshot, 'resultsDismissBoundary'],
  ]);
  const checkDismissProofScreenshot = ({
    screenshotKey,
    label,
    progressMin,
    progressMax,
    expectedProofStage,
    collapsedClearancePxMin,
    openDescentPxMin,
  }) => {
    const screenshotName = names[screenshotKey];
    if (!screenshotName) {
      fail(`${label} screenshot key ${screenshotKey} is not configured`);
      return;
    }
    const proofKey = videoProofKeysByScreenshot.get(screenshotKey);
    const videoProof = proofKey ? readVideoProofFrame(proofKey) : null;
    if (videoProof == null) {
      fail(`${label} video proof frame metadata is missing for ${screenshotKey}`);
      return;
    }
    const screenshotLine = Number(videoProof.eventLine);
    if (firstDismissPress == null || firstDismissBottom == null) {
      fail(`${label} screenshot cannot be placed without dismiss press and boundary events`);
      return;
    }
    if (screenshotLine <= firstDismissPress.line || screenshotLine >= firstDismissBottom.line) {
      fail(
        `${label} video proof line ${screenshotLine} was outside dismiss pre-boundary lines ${firstDismissPress.line}-${firstDismissBottom.line}`
      );
      return;
    }
    const proofSample = dismissMotionPlaneEvents.find((event) => {
      const progress = numeric(event.dismissProgress);
      return (
        event.line > firstDismissPress.line &&
        event.line <= screenshotLine &&
        progress != null &&
        progress >= progressMin &&
        progress <= progressMax &&
        event.proofStage === expectedProofStage &&
        event.resultSheetSlidingDown === true &&
        event.sheetMotionSource === 'routeSheetMotionCommandObservedBySearchSurfaceMotionPlane' &&
        event.navReturnProgressSource === 'bottomNavTiming' &&
        event.boundaryCommitSource === 'searchSurfaceMotionPlane'
      );
    });
    if (proofSample == null) {
      fail(
        `${label} video proof line ${screenshotLine} does not have a matching ${expectedProofStage} dismiss progress sample in ${progressMin}-${progressMax}`
      );
      return;
    }
    const screenshotPath = resolveScreenshotPath(screenshotName);
    const png = readPng(screenshotPath);
    if (png == null) {
      fail(`${label} screenshot missing for ${screenshotKey}: ${screenshotPath}`);
      return;
    }
    const detection = detectSheetTopPx(png, config.sheetSnap?.detection);
    const collapsedPx = Number(config.sheetSnap?.snapPointsPx?.collapsed);
    const openPx = Number(config.sheetSnap?.snapPointsPx?.middle);
    if (detection == null) {
      fail(`${label} screenshot ${screenshotKey} did not contain a detectable sheet`);
      return;
    }
    dismissProofSheetTops[screenshotKey] = detection.y;
    if (Number.isFinite(openPx) && detection.y <= openPx + openDescentPxMin) {
      fail(
        `${label} screenshot ${screenshotKey} did not visually descend from open: sheet top ${detection.y}px, open ${openPx}px, required descent ${openDescentPxMin}px`
      );
    } else {
      pass(
        `${label} screenshot ${screenshotKey} visually descended from open by ${round(
          detection.y - openPx
        )}px`
      );
    }
    if (Number.isFinite(collapsedPx) && detection.y >= collapsedPx - collapsedClearancePxMin) {
      fail(
        `${label} screenshot ${screenshotKey} is visually too close to collapsed: sheet top ${detection.y}px, collapsed ${collapsedPx}px, required clearance ${collapsedClearancePxMin}px`
      );
    } else {
      pass(
        `${label} screenshot ${screenshotKey} sheet top ${detection.y}px before collapsed ${collapsedPx}px`
      );
    }
    const bodyOffsetY = Number(transitionConfig.closeResultBodyContentOffsetY ?? 260);
    const bodyHeight = Number(transitionConfig.closeResultBodyContentHeight ?? 420);
    const bodyMinHeight = Number(transitionConfig.closeResultBodyContentMinHeight ?? 240);
    const inkRatioMin = Number(transitionConfig.closeResultBodyInkRatioMin ?? 0.012);
    const bodyRegion = {
      x: Math.round(png.width * 0.08),
      y: detection.y + bodyOffsetY,
      width: Math.round(png.width * 0.84),
      height: bodyHeight,
    };
    const bodyStats = sampleDismissResultBodyContentStats(png, bodyRegion);
    if (bodyStats == null || bodyStats.heightPx < bodyMinHeight) {
      fail(
        `${label} screenshot ${screenshotKey} does not leave enough visible result body; body height ${
          bodyStats?.heightPx ?? 0
        }px < ${bodyMinHeight}px`
      );
    } else if (bodyStats.inkPixelRatio < inkRatioMin) {
      fail(
        `${label} screenshot ${screenshotKey} does not show attached result body/card content; ink ratio ${round(
          bodyStats.inkPixelRatio
        )} < ${inkRatioMin}`
      );
    } else {
      pass(
        `${label} screenshot ${screenshotKey} shows attached result body/card content ink ratio ${round(
          bodyStats.inkPixelRatio
        )} >= ${inkRatioMin}`
      );
    }
  };
  checkDismissProofScreenshot({
    screenshotKey: transitionConfig.resultsDismissEarlyScreenshot ?? 'resultsDismissEarly',
    label: 'early dismiss',
    progressMin: Number(transitionConfig.dismissEarlyProgressMin ?? 0.1),
    progressMax: Number(transitionConfig.dismissEarlyProgressMax ?? 0.4),
    expectedProofStage: 'early_progress',
    collapsedClearancePxMin: Number(
      transitionConfig.dismissEarlyCollapsedBoundaryClearancePxMin ??
        transitionConfig.dismissEarlyCollapsedBoundaryClearancePxMin ??
        450
    ),
    openDescentPxMin: Number(transitionConfig.dismissEarlyOpenDescentPxMin ?? 80),
  });
  checkDismissProofScreenshot({
    screenshotKey: transitionConfig.resultsDismissMidScreenshot ?? 'resultsDismissMid',
    label: 'mid dismiss',
    progressMin: Number(transitionConfig.dismissMidProgressMin ?? 0.4),
    progressMax: Number(transitionConfig.dismissMidProgressMax ?? 0.7),
    expectedProofStage: 'mid_progress',
    collapsedClearancePxMin: Number(
      transitionConfig.dismissMidCollapsedBoundaryClearancePxMin ??
        transitionConfig.dismissMidCollapsedBoundaryClearancePxMin ??
        260
    ),
    openDescentPxMin: Number(transitionConfig.dismissMidOpenDescentPxMin ?? 220),
  });
  const boundaryScreenshotKey =
    transitionConfig.resultsDismissBoundaryScreenshot ?? 'resultsDismissBoundary';
  const boundaryScreenshotName = names[boundaryScreenshotKey];
  if (!boundaryScreenshotName) {
    fail(`boundary dismiss screenshot key ${boundaryScreenshotKey} is not configured`);
  } else if (firstDismissBottom == null) {
    fail('boundary dismiss screenshot cannot be placed without bottom handoff event');
  } else if (boundaryRenderProof == null) {
    fail('boundary dismiss screenshot cannot be placed without render proof event');
  } else {
    const boundaryLine = Number(readVideoProofFrame('resultsDismissBoundary')?.eventLine);
    const boundaryTolerance = Number(transitionConfig.dismissBoundaryLineTolerance ?? 80);
    if (!Number.isFinite(boundaryLine)) {
      fail('boundary dismiss video proof frame metadata is missing');
    } else if (
      boundaryLine < boundaryRenderProof.line ||
      boundaryLine > boundaryRenderProof.line + boundaryTolerance
    ) {
      fail(
        `boundary dismiss video proof line ${boundaryLine} was not tied to render proof line ${boundaryRenderProof.line} +/- ${boundaryTolerance}`
      );
    } else if (
      firstDismissBottom.canReleasePersistentPolls === true &&
      firstDismissBottom.arePersistentPollsHeaderReady === true &&
      firstDismissBottom.arePersistentPollsBodyReady === true &&
      firstDismissBottom.isPersistentPollHostReady === true
    ) {
      pass(
        `boundary dismiss video proof ${boundaryScreenshotKey} captured at atomic handoff line ${boundaryLine}`
      );
    } else {
      fail(
        'boundary dismiss screenshot was captured without renderable one-page poll handoff proof'
      );
    }
  }
  const configuredBottomBandScreenshots =
    transitionConfig.bottomBandRequiredScreenshots ??
    [
      transitionConfig.resultsEnteringScreenshot,
      transitionConfig.resultsClosePressUpScreenshot,
    ].filter(Boolean);
  const uniqueBottomBandScreenshots = [...new Set(configuredBottomBandScreenshots.filter(Boolean))];
  for (const screenshotKey of uniqueBottomBandScreenshots) {
    const screenshotName = names[screenshotKey];
    if (!screenshotName) {
      fail(`transition gap screenshot key ${screenshotKey} is not configured`);
      continue;
    }
    const videoProofKey = videoProofKeysByScreenshot.get(screenshotKey);
    const screenshotLine = videoProofKey
      ? Number(readVideoProofFrame(videoProofKey)?.eventLine)
      : readScreenshotCaptureLineFromLog(screenshotName);
    const region = transitionConfig.bottomBandRegionsByScreenshot?.[screenshotKey] ?? defaultRegion;
    if (!region) {
      fail(`transition gap bottom band region is not configured for ${screenshotKey}`);
      continue;
    }
    if (
      screenshotKey === transitionConfig.resultsEnteringScreenshot &&
      screenshotLine != null &&
      firstCoverReveal != null &&
      screenshotLine > firstCoverReveal.line
    ) {
      gap(
        `transition gap bottom band ${screenshotKey} skipped because screenshot line ${screenshotLine} was after cover reveal line ${firstCoverReveal.line}`
      );
      continue;
    }
    if (
      screenshotKey === transitionConfig.resultsClosePressUpScreenshot &&
      screenshotLine != null &&
      firstDismissPress != null &&
      firstDismissBottom != null &&
      (screenshotLine <= firstDismissPress.line || screenshotLine >= firstDismissBottom.line)
    ) {
      fail(
        `transition gap bottom band ${screenshotKey} cannot use a post-boundary proof frame: screenshot line ${screenshotLine} was outside dismiss pre-boundary lines ${firstDismissPress.line}-${firstDismissBottom.line}`
      );
      continue;
    }
    const isDismissBurstScreenshot = [
      transitionConfig.resultsClosePressUpScreenshot,
      transitionConfig.resultsDismissEarlyScreenshot,
      transitionConfig.resultsDismissMidScreenshot,
      transitionConfig.resultsDismissBoundaryScreenshot,
    ].includes(screenshotKey);
    if (
      isDismissBurstScreenshot &&
      screenshotLine != null &&
      firstDismissPress != null &&
      firstDismissBottom != null &&
      screenshotKey !== transitionConfig.resultsDismissBoundaryScreenshot &&
      (screenshotLine <= firstDismissPress.line || screenshotLine >= firstDismissBottom.line)
    ) {
      fail(
        `transition gap bottom band ${screenshotKey} cannot use a non-pre-boundary proof frame: screenshot line ${screenshotLine} was outside dismiss pre-boundary lines ${firstDismissPress.line}-${firstDismissBottom.line}`
      );
      continue;
    }
    if (
      screenshotKey === transitionConfig.resultsDismissBoundaryScreenshot &&
      screenshotLine != null &&
      boundaryRenderProof != null
    ) {
      const boundaryTolerance = Number(transitionConfig.dismissBoundaryLineTolerance ?? 80);
      if (
        screenshotLine < boundaryRenderProof.line ||
        screenshotLine > boundaryRenderProof.line + boundaryTolerance
      ) {
        fail(
          `transition gap bottom band ${screenshotKey} was not captured at boundary render proof: screenshot line ${screenshotLine}, proof line ${boundaryRenderProof.line}, tolerance ${boundaryTolerance}`
        );
        continue;
      }
    }
    const screenshotPath = resolveScreenshotPath(screenshotName);
    const png = readPng(screenshotPath);
    if (png == null) {
      fail(`transition gap screenshot missing for ${screenshotKey}: ${screenshotPath}`);
      continue;
    }
    if (screenshotKey === transitionConfig.resultsClosePressUpScreenshot) {
      const detection = detectSheetTopPx(png, config.sheetSnap?.detection);
      const collapsedPx = Number(config.sheetSnap?.snapPointsPx?.collapsed);
      const openPx = Number(config.sheetSnap?.snapPointsPx?.middle);
      const collapsedClearancePxMin = Number(
        transitionConfig.closeCollapsedBoundaryClearancePxMin ??
          transitionConfig.closeCollapsedBoundaryClearancePxMin ??
          260
      );
      if (detection == null) {
        fail(`close transition screenshot ${screenshotKey} did not contain a detectable sheet`);
      } else if (
        Number.isFinite(collapsedPx) &&
        detection.y >= collapsedPx - collapsedClearancePxMin
      ) {
        fail(
          `close transition screenshot ${screenshotKey} is visually at/near collapsed boundary: sheet top ${detection.y}px, collapsed ${collapsedPx}px, required clearance ${collapsedClearancePxMin}px`
        );
      } else {
        pass(
          `close transition screenshot ${screenshotKey} proves result page is still attached at dismiss start: sheet top ${detection.y}px, open ${openPx}px, collapsed ${collapsedPx}px`
        );
      }

      if (detection != null) {
        dismissProofSheetTops[screenshotKey] = detection.y;
        const bodyOffsetY = Number(transitionConfig.closeResultBodyContentOffsetY ?? 260);
        const bodyHeight = Number(transitionConfig.closeResultBodyContentHeight ?? 420);
        const bodyMinHeight = Number(transitionConfig.closeResultBodyContentMinHeight ?? 240);
        const inkRatioMin = Number(transitionConfig.closeResultBodyInkRatioMin ?? 0.012);
        const bodyRegion = {
          x: Math.round(png.width * 0.08),
          y: detection.y + bodyOffsetY,
          width: Math.round(png.width * 0.84),
          height: bodyHeight,
        };
        const bodyStats = sampleDismissResultBodyContentStats(png, bodyRegion);
        if (bodyStats == null || bodyStats.heightPx < bodyMinHeight) {
          fail(
            `close transition screenshot ${screenshotKey} does not leave enough visible result body below the header; body height ${
              bodyStats?.heightPx ?? 0
            }px < ${bodyMinHeight}px`
          );
        } else if (bodyStats.inkPixelRatio < inkRatioMin) {
          fail(
            `close transition screenshot ${screenshotKey} does not show attached result body/card content; ink ratio ${round(
              bodyStats.inkPixelRatio
            )} < ${inkRatioMin}`
          );
        } else {
          pass(
            `close transition screenshot ${screenshotKey} shows attached result body/card content ink ratio ${round(
              bodyStats.inkPixelRatio
            )} >= ${inkRatioMin}`
          );
        }
      }
    }
    const stats = sampleNavUnderlayRegionStats(png, region, sheetLikePixel);
    const navChromePinkPixelCount = countPixelsMatching(png, region, isActiveTogglePinkPixel);
    if (stats == null) {
      fail(`transition gap bottom band was empty for ${screenshotKey}`);
    } else if (stats.sheetLikePixelRatio >= minRatio) {
      pass(
        `transition gap bottom band ${screenshotKey} sheet-like ratio ${round(
          stats.sheetLikePixelRatio
        )} >= ${minRatio}`
      );
    } else if (
      isDismissBurstScreenshot &&
      screenshotKey !== transitionConfig.resultsDismissBoundaryScreenshot &&
      navChromePinkPixelCount >= navChromePinkPixelMin
    ) {
      pass(
        `transition gap bottom band ${screenshotKey} is occupied by frosted nav chrome pink pixels ${navChromePinkPixelCount} >= ${navChromePinkPixelMin}`
      );
    } else {
      fail(
        `transition gap bottom band ${screenshotKey} exposed a cutout/gap ratio ${round(
          stats.sheetLikePixelRatio
        )} < ${minRatio} and nav chrome pink pixels ${navChromePinkPixelCount} < ${navChromePinkPixelMin}; meanLuma=${round(
          stats.meanLuma
        )} meanChroma=${round(stats.meanChroma)}`
      );
    }
  }
  const dismissProofSequence = [
    transitionConfig.resultsDismissEarlyScreenshot,
    transitionConfig.resultsDismissMidScreenshot,
  ].filter(Boolean);
  const distinctSheetTopPxMin = Number(transitionConfig.dismissProofDistinctSheetTopPxMin ?? 36);
  for (let index = 1; index < dismissProofSequence.length; index += 1) {
    const previousKey = dismissProofSequence[index - 1];
    const currentKey = dismissProofSequence[index];
    const previousTop = dismissProofSheetTops[previousKey];
    const currentTop = dismissProofSheetTops[currentKey];
    if (!Number.isFinite(previousTop) || !Number.isFinite(currentTop)) {
      fail(
        `dismiss proof screenshots ${previousKey}->${currentKey} could not prove distinct sheet positions`
      );
      continue;
    }
    const deltaPx = currentTop - previousTop;
    if (deltaPx < distinctSheetTopPxMin) {
      fail(
        `dismiss proof screenshots ${previousKey}->${currentKey} did not show monotonic distinct sheet descent: ${round(
          previousTop
        )}px -> ${round(currentTop)}px, required delta ${distinctSheetTopPxMin}px`
      );
    } else {
      pass(
        `dismiss proof screenshots ${previousKey}->${currentKey} showed monotonic sheet descent delta ${round(
          deltaPx
        )}px >= ${distinctSheetTopPxMin}px`
      );
    }
  }
};

const checkNavUnderlayScreenshotContracts = () => {
  if (skipScreenshotScenarioContract('nav underlay screenshot contract')) {
    return;
  }
  const underlayConfig = config.navUnderlay;
  if (!underlayConfig) {
    return;
  }
  const names = config.screenshots?.names ?? {};
  const navBodyRegion = underlayConfig.navBodyRegion ?? underlayConfig.visibleCutoutRegion;
  const cutoutRevealRegion =
    underlayConfig.cutoutRevealRegion ?? underlayConfig.visibleMapCutoutRegion;
  const hiddenRegion = underlayConfig.hiddenNavBandRegion;
  const sheetLikePixel = underlayConfig.sheetLikePixel ?? {};
  const navBodyRatioMax = Number(
    underlayConfig.navBodySheetLikeRatioMax ??
      underlayConfig.visibleCutoutSheetLikeRatioMax ??
      0.45
  );
  const navBodyWhiteRatioMax = Number(underlayConfig.navBodyWhiteSheetRatioMax ?? 0.18);
  const hiddenRatioMin = Number(underlayConfig.hiddenNavBandSheetLikeRatioMin ?? 0.65);
  const navBodyTintRatioMax = Number(
    underlayConfig.navBodyPollProfileTintRatioMax ??
      underlayConfig.visibleNavBodyPollProfileTintRatioMax ??
      1
  );
  const allowFrostedNavWhiteBody = underlayConfig.allowFrostedNavWhiteBody === true;
  const cutoutRevealRatioMin = Number(
    underlayConfig.cutoutRevealSheetLikeRatioMin ??
      underlayConfig.dockedSheetUnderSilhouetteSheetLikeRatioMin ??
      0.62
  );
  const cutoutRevealWhiteRatioMin = Number(underlayConfig.cutoutRevealWhiteSheetRatioMin ?? 0);
  const navBodyMapOnlyScreenshots = new Set(
    underlayConfig.requiredNavBodyMapOnlyScreenshots ??
      underlayConfig.requiredVisibleCutoutScreenshots ??
      []
  );
  const cutoutSheetVisibleScreenshots = new Set(
    underlayConfig.requiredCutoutSheetVisibleScreenshots ??
      underlayConfig.requiredDockedSheetUnderSilhouetteScreenshots ??
      []
  );
  const hiddenResidualRowsMax = Number(underlayConfig.hiddenNavResidualRowsMax ?? 2);
  const hiddenSheetLikeRowRatioMin = Number(underlayConfig.hiddenNavSheetLikeRowRatioMin ?? 0.65);

  for (const screenshotKey of navBodyMapOnlyScreenshots) {
    const screenshotName = names[screenshotKey];
    if (!screenshotName) {
      fail(`nav body map-only screenshot key ${screenshotKey} is not configured`);
      continue;
    }
    const screenshotPath = resolveScreenshotPath(screenshotName);
    const png = readPng(screenshotPath);
    if (png == null) {
      fail(`nav body map-only screenshot missing for ${screenshotKey}: ${screenshotPath}`);
      continue;
    }
    const stats = sampleNavUnderlayRegionStats(png, navBodyRegion, sheetLikePixel);
    if (stats == null) {
      fail(`nav body map-only region was empty for ${screenshotKey}`);
      continue;
    }
    if (
      allowFrostedNavWhiteBody ||
      (stats.sheetLikePixelRatio <= navBodyRatioMax &&
        stats.whiteSheetPixelRatio <= navBodyWhiteRatioMax)
    ) {
      pass(
        allowFrostedNavWhiteBody
          ? `nav body ${screenshotKey} allows owned frosted-white nav material while sheet tint/glyph checks enforce no sheet leakage: sheet ratio ${round(
              stats.sheetLikePixelRatio
            )}, white ratio ${round(stats.whiteSheetPixelRatio)}`
          : `nav body ${screenshotKey} stays map-like: sheet ratio ${round(
              stats.sheetLikePixelRatio
            )} <= ${navBodyRatioMax}, white ratio ${round(
              stats.whiteSheetPixelRatio
            )} <= ${navBodyWhiteRatioMax}`
      );
    } else {
      fail(
        `nav body ${screenshotKey} is seeing sheet instead of map: sheet ratio ${round(
          stats.sheetLikePixelRatio
        )}, white ratio ${round(stats.whiteSheetPixelRatio)}`
      );
    }
    if (stats.pollProfileTintPixelRatio <= navBodyTintRatioMax) {
      pass(
        `nav body ${screenshotKey} poll/profile tint ratio ${round(
          stats.pollProfileTintPixelRatio
        )} <= ${navBodyTintRatioMax}`
      );
    } else {
      fail(
        `nav body ${screenshotKey} looks poll/profile-tinted ratio ${round(
          stats.pollProfileTintPixelRatio
        )} > ${navBodyTintRatioMax}; meanLuma=${round(stats.meanLuma)} meanChroma=${round(
          stats.meanChroma
        )}`
      );
    }
  }

  for (const screenshotKey of cutoutSheetVisibleScreenshots) {
    const screenshotName = names[screenshotKey];
    if (!screenshotName) {
      fail(`nav cutout sheet-visible screenshot key ${screenshotKey} is not configured`);
      continue;
    }
    const screenshotPath = resolveScreenshotPath(screenshotName);
    const png = readPng(screenshotPath);
    if (png == null) {
      fail(`nav cutout sheet-visible screenshot missing for ${screenshotKey}: ${screenshotPath}`);
      continue;
    }
    const stats = sampleNavUnderlayRegionStats(png, cutoutRevealRegion, sheetLikePixel);
    if (stats == null) {
      fail(`nav cutout reveal region was empty for ${screenshotKey}`);
      continue;
    }
    if (
      stats.sheetLikePixelRatio >= cutoutRevealRatioMin &&
      stats.whiteSheetPixelRatio >= cutoutRevealWhiteRatioMin
    ) {
      pass(
        `nav cutout ${screenshotKey} reveals sheet: sheet ratio ${round(
          stats.sheetLikePixelRatio
        )} >= ${cutoutRevealRatioMin}, white ratio ${round(
          stats.whiteSheetPixelRatio
        )} >= ${cutoutRevealWhiteRatioMin}`
      );
    } else {
      fail(
        `nav cutout ${screenshotKey} does not reveal sheet enough: sheet ratio ${round(
          stats.sheetLikePixelRatio
        )}, white ratio ${round(stats.whiteSheetPixelRatio)}`
      );
    }
  }

  for (const screenshotKey of underlayConfig.requiredHiddenNavScreenshots ?? []) {
    const screenshotName = names[screenshotKey];
    if (!screenshotName) {
      fail(`nav hidden band screenshot key ${screenshotKey} is not configured`);
      continue;
    }
    const screenshotPath = resolveScreenshotPath(screenshotName);
    const png = readPng(screenshotPath);
    if (png == null) {
      fail(`nav hidden band screenshot missing for ${screenshotKey}: ${screenshotPath}`);
      continue;
    }
    const stats = sampleNavUnderlayRegionStats(png, hiddenRegion, sheetLikePixel);
    if (stats == null) {
      fail(`nav hidden band region was empty for ${screenshotKey}`);
      continue;
    }
    if (stats.sheetLikePixelRatio >= hiddenRatioMin) {
      pass(
        `nav hidden band ${screenshotKey} sheet-like ratio ${round(
          stats.sheetLikePixelRatio
        )} >= ${hiddenRatioMin}`
      );
    } else {
      fail(
        `nav hidden band ${screenshotKey} looks clipped by a static cutout ratio ${round(
          stats.sheetLikePixelRatio
        )} < ${hiddenRatioMin}; meanLuma=${round(stats.meanLuma)} meanChroma=${round(
          stats.meanChroma
        )}`
      );
    }
    const nonSheetLikeRows = countTrailingNonSheetLikeRows(
      png,
      hiddenRegion,
      sheetLikePixel,
      hiddenSheetLikeRowRatioMin
    );
    if (nonSheetLikeRows <= hiddenResidualRowsMax) {
      pass(
        `nav hidden residual band ${screenshotKey} ${nonSheetLikeRows}px <= ${hiddenResidualRowsMax}px`
      );
    } else {
      fail(
        `nav hidden residual band ${screenshotKey} ${nonSheetLikeRows}px > ${hiddenResidualRowsMax}px`
      );
    }
  }
};

const checkPostClosePollPageScreenshotContract = () => {
  const pollPageConfig = config.postClosePollPage;
  if (!pollPageConfig) {
    return;
  }
  if (skipScreenshotScenarioContract('post-close poll page screenshot contract')) {
    return;
  }
  const names = config.screenshots?.names ?? {};
  const screenshotKey = pollPageConfig.afterResultsCloseScreenshot ?? 'afterResultsClose';
  const screenshotName = names[screenshotKey];
  if (!screenshotName) {
    fail(`post-close poll page screenshot key ${screenshotKey} is not configured`);
    return;
  }
  const screenshotPath = resolveScreenshotPath(screenshotName);
  const png = readPng(screenshotPath);
  if (png == null) {
    fail(`post-close poll page screenshot missing for ${screenshotKey}: ${screenshotPath}`);
    return;
  }
  const resultRegion = pollPageConfig.resultTogglePinkRegion ?? {
    xRatio: 0.05,
    yRatio: 0.55,
    widthRatio: 0.9,
    heightRatio: 0.08,
  };
  const detectionConfig = {
    ...(config.sheetSnap?.detection ?? {}),
    ...(pollPageConfig.sheetDetection ?? {}),
  };
  const sheetDetection = detectSheetTopPx(png, detectionConfig);
  const pollRegion = pollPageConfig.pollPillGreenRegion ?? {
    xRatio: 0.62,
    yRatio: 0.83,
    widthRatio: 0.25,
    heightRatio: 0.06,
  };
  const resultTogglePinkRatio = sampleTintRatio(
    png,
    {
      x: png.width * resultRegion.xRatio,
      y: png.height * resultRegion.yRatio,
      width: png.width * resultRegion.widthRatio,
      height: png.height * resultRegion.heightRatio,
    },
    (r, g, b) => r >= 230 && g <= 120 && b >= 100 && b <= 220
  );
  const pollHeaderProof = samplePollHeaderForegroundProof(png, sheetDetection, {
    ...(pollPageConfig.pollHeaderProof ?? {}),
    badgeRegion: pollPageConfig.pollHeaderProof?.badgeRegion ?? pollRegion,
  });
  const resultTogglePinkRatioMax = Number(pollPageConfig.resultTogglePinkRatioMax ?? 0.02);
  const pollHeaderWhiteRatioMin = Number(pollPageConfig.pollHeaderWhiteRatioMin ?? 0.72);
  const pollHeaderTitleDarkRatioMin = Number(pollPageConfig.pollHeaderTitleDarkRatioMin ?? 0.0025);
  const pollHeaderBadgeDarkRatioMin = Number(pollPageConfig.pollHeaderBadgeDarkRatioMin ?? 0.0015);
  if (resultTogglePinkRatio > resultTogglePinkRatioMax) {
    fail(
      `post-close ${screenshotKey} still shows result-page toggle proof: pink ratio ${round(
        resultTogglePinkRatio
      )} > ${resultTogglePinkRatioMax}`
    );
  } else {
    pass(
      `post-close ${screenshotKey} has no result-page toggle proof ratio ${round(
        resultTogglePinkRatio
      )} <= ${resultTogglePinkRatioMax}`
    );
  }
  if (pollHeaderProof.headerWhiteRatio < pollHeaderWhiteRatioMin) {
    fail(
      `post-close ${screenshotKey} is missing poll header foreground plate proof: white ratio ${round(
        pollHeaderProof.headerWhiteRatio
      )} < ${pollHeaderWhiteRatioMin}`
    );
  } else {
    pass(
      `post-close ${screenshotKey} has poll header foreground plate proof ratio ${round(
        pollHeaderProof.headerWhiteRatio
      )} >= ${pollHeaderWhiteRatioMin}`
    );
  }
  if (pollHeaderProof.titleDarkGlyphRatio < pollHeaderTitleDarkRatioMin) {
    fail(
      `post-close ${screenshotKey} is missing poll title glyph proof: dark ratio ${round(
        pollHeaderProof.titleDarkGlyphRatio
      )} < ${pollHeaderTitleDarkRatioMin}`
    );
  } else {
    pass(
      `post-close ${screenshotKey} has poll title glyph proof ratio ${round(
        pollHeaderProof.titleDarkGlyphRatio
      )} >= ${pollHeaderTitleDarkRatioMin}`
    );
  }
  if (pollHeaderProof.badgeDarkGlyphRatio < pollHeaderBadgeDarkRatioMin) {
    fail(
      `post-close ${screenshotKey} is missing poll badge/count glyph proof: dark ratio ${round(
        pollHeaderProof.badgeDarkGlyphRatio
      )} < ${pollHeaderBadgeDarkRatioMin}`
    );
  } else {
    pass(
      `post-close ${screenshotKey} has poll badge/count glyph proof ratio ${round(
        pollHeaderProof.badgeDarkGlyphRatio
      )} >= ${pollHeaderBadgeDarkRatioMin}`
    );
  }
};

const checkPostHandoffFrameProbeContracts = () => {
  const frameConfig = config.postHandoffFrameProbe;
  if (!frameConfig) {
    return;
  }
  if (skipScreenshotScenarioContract('post-handoff frame probe contract')) {
    return;
  }
  const framePaths = resolveProbeFramePaths(frameConfig.candidateFrameGlobs ?? []);
  if (framePaths.length === 0) {
    gap('post-handoff frame probe skipped because no extracted frame PNGs matched this run');
    return;
  }
  const collapsedSheetTopRatioMin = Number(frameConfig.collapsedSheetTopRatioMin ?? 0.78);
  const collapsedSheetTopRatioMax = Number(frameConfig.collapsedSheetTopRatioMax ?? 0.9);
  const navPinkRatioMin = Number(frameConfig.navVisiblePinkRatioMin ?? 0.02);
  const pollHeaderWhiteRatioMin = Number(frameConfig.pollHeaderWhiteRatioMin ?? 0.72);
  const pollHeaderTitleDarkRatioMin = Number(frameConfig.pollHeaderTitleDarkRatioMin ?? 0.0025);
  const pollHeaderBadgeDarkRatioMin = Number(frameConfig.pollHeaderBadgeDarkRatioMin ?? 0.0015);
  const detectionConfig = {
    ...(config.sheetSnap?.detection ?? {}),
    ...(frameConfig.sheetDetection ?? {}),
  };
  const badHeaderOnlyFrame = framePaths.find((framePath) => {
    const png = readPng(framePath);
    if (png == null) {
      return false;
    }
    const detection = detectSheetTopPx(png, detectionConfig);
    if (detection == null) {
      return false;
    }
    const sheetTopRatio = detection.y / png.height;
    if (sheetTopRatio < collapsedSheetTopRatioMin || sheetTopRatio > collapsedSheetTopRatioMax) {
      return false;
    }
    const navRegion = frameConfig.navVisiblePinkRegion ?? {
      xRatio: 0.08,
      yRatio: 0.88,
      widthRatio: 0.22,
      heightRatio: 0.1,
    };
    const navPinkRatio = sampleTintRatio(
      png,
      {
        x: png.width * navRegion.xRatio,
        y: png.height * navRegion.yRatio,
        width: png.width * navRegion.widthRatio,
        height: png.height * navRegion.heightRatio,
      },
      (r, g, b) => r >= 230 && g <= 120 && b >= 100 && b <= 220
    );
    if (navPinkRatio < navPinkRatioMin) {
      return false;
    }
    const pollRegion = frameConfig.pollPillRegion ?? {
      xRatio: 0.62,
      yOffsetPx: 45,
      widthRatio: 0.25,
      heightPx: 130,
    };
    const pollHeaderProof = samplePollHeaderForegroundProof(png, detection, {
      ...(frameConfig.pollHeaderProof ?? {}),
      badgeRegion: frameConfig.pollHeaderProof?.badgeRegion ?? pollRegion,
    });
    return (
      pollHeaderProof.headerWhiteRatio < pollHeaderWhiteRatioMin ||
      pollHeaderProof.titleDarkGlyphRatio < pollHeaderTitleDarkRatioMin ||
      pollHeaderProof.badgeDarkGlyphRatio < pollHeaderBadgeDarkRatioMin
    );
  });
  if (badHeaderOnlyFrame) {
    fail(
      `post-handoff frame probe found nav-visible collapsed sheet without poll header foreground/title/badge proof: ${badHeaderOnlyFrame}`
    );
  } else {
    pass(
      `post-handoff frame probe rejected collapsed frames missing poll header foreground/title/badge count=${framePaths.length}`
    );
  }
};

const countPixelsMatching = (png, region, predicate) => {
  const { width, height, data } = png;
  const xStart = Math.max(0, Math.min(width, Math.round(region.x)));
  const yStart = Math.max(0, Math.min(height, Math.round(region.y)));
  const xEnd = Math.max(xStart, Math.min(width, Math.round(region.x + region.width)));
  const yEnd = Math.max(yStart, Math.min(height, Math.round(region.y + region.height)));
  let count = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      if (predicate(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) {
        count += 1;
      }
    }
  }
  return count;
};

const isActiveTogglePinkPixel = (r, g, b, a) =>
  a > 220 && r >= 225 && g <= 95 && b >= 90 && b <= 170;

const sampleResultsHeaderLeakStats = (png, region, leakConfig = {}) => {
  const { width, height, data } = png;
  const xStart = Math.max(0, Math.min(width, Math.round(region.x)));
  const yStart = Math.max(0, Math.min(height, Math.round(region.y)));
  const xEnd = Math.max(xStart, Math.min(width, Math.round(region.x + region.width)));
  const yEnd = Math.max(yStart, Math.min(height, Math.round(region.y + region.height)));
  const greenPixel = leakConfig.mapGreenPixel ?? {};
  const greenMin = Number(greenPixel.greenMin ?? 128);
  const greenRedDeltaMin = Number(greenPixel.greenRedDeltaMin ?? 22);
  const greenBlueDeltaMin = Number(greenPixel.greenBlueDeltaMin ?? 12);
  const greenLumaMax = Number(greenPixel.lumaMax ?? 225);
  let total = 0;
  let greenMapBleed = 0;
  let transparentMapTexture = 0;
  let sheetLike = 0;
  let whiteHeader = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];
      if (a < 220) {
        continue;
      }
      total += 1;
      const pixelLuma = luma(r, g, b);
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      if (
        g >= greenMin &&
        g - r >= greenRedDeltaMin &&
        g - b >= greenBlueDeltaMin &&
        pixelLuma <= greenLumaMax
      ) {
        greenMapBleed += 1;
      }
      if (pixelLuma < 232 && chroma >= 18) {
        transparentMapTexture += 1;
      }
      if (pixelLuma >= 238 && chroma <= 28) {
        sheetLike += 1;
      }
      if (pixelLuma >= 248 && chroma <= 12) {
        whiteHeader += 1;
      }
    }
  }
  if (total === 0) {
    return null;
  }
  return {
    greenMapBleedRatio: greenMapBleed / total,
    transparentMapTextureRatio: transparentMapTexture / total,
    sheetLikeRatio: sheetLike / total,
    whiteHeaderRatio: whiteHeader / total,
    total,
  };
};

const checkFrostyPixelContract = (png, sheetTop) => {
  const pixelConfig = config.frosty?.pixelContract;
  if (!pixelConfig || sheetTop == null) {
    return;
  }
  const region = {
    x: pixelConfig.sheetInteriorRegion.x,
    y: sheetTop + pixelConfig.sheetInteriorRegion.offsetY,
    width: pixelConfig.sheetInteriorRegion.width,
    height: pixelConfig.sheetInteriorRegion.height,
    whiteSheetMin: pixelConfig.sheetInteriorWhitePixelMin,
  };
  const stats = sampleRegionStats(png, region);
  if (stats == null) {
    gap('frosty sheet interior region was empty');
    return;
  }
  const minLuma = pixelConfig.sheetInteriorMeanLumaMin;
  if (stats.meanLuma >= minLuma) {
    pass(`frosty sheet interior mean luma ${round(stats.meanLuma)} >= ${minLuma}`);
  } else {
    fail(`frosty sheet interior mean luma ${round(stats.meanLuma)} < ${minLuma}`);
  }
  const maxWhiteRatio = pixelConfig.sheetInteriorWhitePixelRatioMax;
  if (typeof maxWhiteRatio === 'number') {
    if (stats.whiteSheetPixelRatio <= maxWhiteRatio) {
      pass(
        `frosty sheet interior white pixel ratio ${round(
          stats.whiteSheetPixelRatio
        )} <= ${maxWhiteRatio}`
      );
    } else {
      fail(
        `frosty sheet interior white pixel ratio ${round(
          stats.whiteSheetPixelRatio
        )} > ${maxWhiteRatio}; meanLuma=${round(stats.meanLuma)} stddevLuma=${round(
          stats.stddevLuma
        )} meanChroma=${round(stats.meanChroma)}`
      );
    }
  }
  const minLumaStddev = pixelConfig.sheetInteriorLumaStddevMin;
  if (typeof minLumaStddev === 'number') {
    if (stats.stddevLuma >= minLumaStddev) {
      pass(`frosty sheet interior luma stddev ${round(stats.stddevLuma)} >= ${minLumaStddev}`);
    } else {
      fail(
        `frosty sheet interior luma stddev ${round(
          stats.stddevLuma
        )} < ${minLumaStddev}; white ratio=${round(stats.whiteSheetPixelRatio)}`
      );
    }
  }
};

const checkResultsHeaderLeakScreenshotContract = ({ screenshotKey, screenshotName }) => {
  const leakConfig = config.resultsHeaderLeak;
  if (!leakConfig) {
    return;
  }
  const screenshotPath = resolveScreenshotPath(screenshotName);
  const png = readPng(screenshotPath);
  if (png == null) {
    fail(`results header leak screenshot missing for ${screenshotKey}: ${screenshotPath}`);
    return;
  }
  const detection = detectSheetTopPx(png, config.sheetSnap?.detection);
  if (detection == null) {
    fail(`could not detect sheet top for results header leak screenshot ${screenshotPath}`);
    return;
  }
  const regionConfig = leakConfig.region ?? {};
  const region = {
    x: png.width * (regionConfig.xRatioStart ?? 0.04),
    y: detection.y + (regionConfig.offsetY ?? 18),
    width: png.width * ((regionConfig.xRatioEnd ?? 0.96) - (regionConfig.xRatioStart ?? 0.04)),
    height: regionConfig.height ?? 150,
  };
  const stats = sampleResultsHeaderLeakStats(png, region, leakConfig);
  if (stats == null) {
    fail(`results header leak region was empty for ${screenshotKey}`);
    return;
  }
  const greenMax = Number(leakConfig.greenMapBleedRatioMax ?? 0.025);
  if (stats.greenMapBleedRatio <= greenMax) {
    pass(
      `results header ${screenshotKey} green/map bleed ratio ${round(
        stats.greenMapBleedRatio
      )} <= ${greenMax}`
    );
  } else {
    fail(
      `results header ${screenshotKey} shows map/pin green bleed ratio ${round(
        stats.greenMapBleedRatio
      )} > ${greenMax}`
    );
  }
  const textureMax = Number(leakConfig.transparentMapTextureRatioMax ?? 0.16);
  if (stats.transparentMapTextureRatio <= textureMax) {
    pass(
      `results header ${screenshotKey} map texture ratio ${round(
        stats.transparentMapTextureRatio
      )} <= ${textureMax}`
    );
  } else {
    fail(
      `results header ${screenshotKey} looks clear over map texture ratio ${round(
        stats.transparentMapTextureRatio
      )} > ${textureMax}`
    );
  }
  const sheetLikeMin = Number(leakConfig.sheetLikeRatioMin ?? 0.62);
  if (stats.sheetLikeRatio >= sheetLikeMin) {
    pass(
      `results header ${screenshotKey} sheet-owned light ratio ${round(
        stats.sheetLikeRatio
      )} >= ${sheetLikeMin}`
    );
  } else {
    fail(
      `results header ${screenshotKey} is not sufficiently sheet-owned ratio ${round(
        stats.sheetLikeRatio
      )} < ${sheetLikeMin}`
      );
  }
  const whiteHeaderMin = Number(leakConfig.whiteHeaderRatioMin ?? 0);
  if (stats.whiteHeaderRatio >= whiteHeaderMin) {
    pass(
      `results header ${screenshotKey} white header ratio ${round(
        stats.whiteHeaderRatio
      )} >= ${whiteHeaderMin}`
    );
  } else {
    fail(
      `results header ${screenshotKey} is not opaque white enough ratio ${round(
        stats.whiteHeaderRatio
      )} < ${whiteHeaderMin}`
    );
  }
};

const checkPollHeaderLeakScreenshotContract = ({ screenshotKey, screenshotName }) => {
  const leakConfig = config.pollHeaderLeak;
  if (!leakConfig) {
    return;
  }
  const screenshotPath = resolveScreenshotPath(screenshotName);
  const png = readPng(screenshotPath);
  if (png == null) {
    fail(`poll header leak screenshot missing for ${screenshotKey}: ${screenshotPath}`);
    return;
  }
  const detection = detectSheetTopPx(png, {
    ...config.sheetSnap?.detection,
    ...(leakConfig.sheetDetection ?? {}),
  });
  if (detection == null) {
    fail(`could not detect poll sheet top for poll header screenshot ${screenshotPath}`);
    return;
  }
  const regionConfig = leakConfig.region ?? {};
  const region = {
    x: png.width * (regionConfig.xRatioStart ?? 0.04),
    y: detection.y + (regionConfig.offsetY ?? 18),
    width: png.width * ((regionConfig.xRatioEnd ?? 0.96) - (regionConfig.xRatioStart ?? 0.04)),
    height: regionConfig.height ?? 150,
  };
  const stats = sampleResultsHeaderLeakStats(png, region, leakConfig);
  if (stats == null) {
    fail(`poll header leak region was empty for ${screenshotKey}`);
    return;
  }
  const greenMax = Number(leakConfig.greenMapBleedRatioMax ?? 0.025);
  if (stats.greenMapBleedRatio <= greenMax) {
    pass(
      `poll header ${screenshotKey} green/map bleed ratio ${round(
        stats.greenMapBleedRatio
      )} <= ${greenMax}`
    );
  } else {
    fail(
      `poll header ${screenshotKey} shows map/pin green bleed ratio ${round(
        stats.greenMapBleedRatio
      )} > ${greenMax}`
    );
  }
  const textureMax = Number(leakConfig.transparentMapTextureRatioMax ?? 0.16);
  if (stats.transparentMapTextureRatio <= textureMax) {
    pass(
      `poll header ${screenshotKey} map texture ratio ${round(
        stats.transparentMapTextureRatio
      )} <= ${textureMax}`
    );
  } else {
    fail(
      `poll header ${screenshotKey} looks clear over map texture ratio ${round(
        stats.transparentMapTextureRatio
      )} > ${textureMax}`
    );
  }
  const sheetLikeMin = Number(leakConfig.sheetLikeRatioMin ?? 0.62);
  if (stats.sheetLikeRatio >= sheetLikeMin) {
    pass(
      `poll header ${screenshotKey} sheet-owned light ratio ${round(
        stats.sheetLikeRatio
      )} >= ${sheetLikeMin}`
    );
  } else {
    fail(
      `poll header ${screenshotKey} is not sufficiently sheet-owned ratio ${round(
        stats.sheetLikeRatio
      )} < ${sheetLikeMin}`
      );
  }
  const whiteHeaderMin = Number(leakConfig.whiteHeaderRatioMin ?? 0);
  if (stats.whiteHeaderRatio >= whiteHeaderMin) {
    pass(
      `poll header ${screenshotKey} white header ratio ${round(
        stats.whiteHeaderRatio
      )} >= ${whiteHeaderMin}`
    );
  } else {
    fail(
      `poll header ${screenshotKey} is not opaque white enough ratio ${round(
        stats.whiteHeaderRatio
      )} < ${whiteHeaderMin}`
    );
  }
};

const checkPollHeaderLeakScreenshotContracts = () => {
  if (skipScreenshotScenarioContract('poll header leak screenshot contract')) {
    return;
  }
  const names = config.screenshots?.names ?? {};
  const requiredScreenshots = config.pollHeaderLeak?.requiredScreenshots ?? [];
  for (const screenshotKey of requiredScreenshots) {
    const screenshotName = names[screenshotKey];
    if (!screenshotName) {
      fail(`poll header leak screenshot key ${screenshotKey} is not configured`);
      continue;
    }
    checkPollHeaderLeakScreenshotContract({ screenshotKey, screenshotName });
  }
};

const checkResultsToggleScreenshotContract = ({ screenshotKey, screenshotName }) => {
  const toggleConfig = config.resultsToggle;
  if (!toggleConfig) {
    return;
  }
  const screenshotPath = resolveScreenshotPath(screenshotName);
  const png = readPng(screenshotPath);
  if (png == null) {
    fail(`results toggle screenshot missing for ${screenshotKey}: ${screenshotPath}`);
    return;
  }
  const detection = detectSheetTopPx(png, config.sheetSnap?.detection);
  if (detection == null) {
    fail(`could not detect sheet top for results toggle screenshot ${screenshotPath}`);
    return;
  }
  const regionConfig = toggleConfig.region ?? {};
  const region = {
    x: png.width * (regionConfig.xRatioStart ?? 0.03),
    y: detection.y + (regionConfig.offsetY ?? 150),
    width: png.width * ((regionConfig.xRatioEnd ?? 0.97) - (regionConfig.xRatioStart ?? 0.03)),
    height: regionConfig.height ?? 140,
  };
  const pinkPixelCount = countPixelsMatching(png, region, isActiveTogglePinkPixel);
  const minPinkPixels = toggleConfig.pinkPixelMin ?? 1200;
  if (pinkPixelCount >= minPinkPixels) {
    pass(
      `results toggle ${screenshotKey} active segment pixels ${pinkPixelCount} >= ${minPinkPixels}`
    );
  } else {
    fail(
      `results toggle ${screenshotKey} active segment pixels ${pinkPixelCount} < ${minPinkPixels}`
    );
  }
};

const checkResultsToggleCoveredScreenshotContract = ({ screenshotKey, screenshotName }) => {
  const toggleConfig = config.resultsToggle;
  if (!toggleConfig) {
    return;
  }
  const screenshotLine = readScreenshotCaptureLineFromLog(screenshotName);
  if (screenshotLine != null) {
    const loadingHeaderEventsBeforeScreenshot = byEvent(
      'search_results_header_source_contract'
    ).filter((event) => event.surfaceMode === 'initial_loading' && event.line < screenshotLine);
    if (loadingHeaderEventsBeforeScreenshot.length === 0) {
      fail(
        `results toggle ${screenshotKey} covered pixel check cannot prove initial_loading before screenshot line ${screenshotLine}`
      );
      return;
    }

    const coverReleaseBeforeScreenshot = byEvent('cards_pins_cover_reveal_started').find(
      (event) => event.line < screenshotLine
    );
    if (coverReleaseBeforeScreenshot) {
      gap(
        `results toggle ${screenshotKey} screenshot line ${screenshotLine} was after cover reveal line ${coverReleaseBeforeScreenshot.line}`
      );
      return;
    }
  }

  const screenshotPath = resolveScreenshotPath(screenshotName);
  const png = readPng(screenshotPath);
  if (png == null) {
    fail(`results toggle covered screenshot missing for ${screenshotKey}: ${screenshotPath}`);
    return;
  }
  const detection = detectSheetTopPx(png, config.sheetSnap?.detection);
  if (detection == null) {
    fail(`could not detect sheet top for covered toggle screenshot ${screenshotPath}`);
    return;
  }
  const regionConfig = toggleConfig.region ?? {};
  const region = {
    x: png.width * (regionConfig.xRatioStart ?? 0.03),
    y: detection.y + (regionConfig.offsetY ?? 150),
    width: png.width * ((regionConfig.xRatioEnd ?? 0.97) - (regionConfig.xRatioStart ?? 0.03)),
    height: regionConfig.height ?? 140,
  };
  const pinkPixelCount = countPixelsMatching(png, region, isActiveTogglePinkPixel);
  const maxPinkPixels = toggleConfig.loadingPinkPixelMax ?? 100;
  if (pinkPixelCount <= maxPinkPixels) {
    pass(
      `results toggle ${screenshotKey} covered during loading pixels ${pinkPixelCount} <= ${maxPinkPixels}`
    );
  } else {
    fail(
      `results toggle ${screenshotKey} should be covered during loading, active pixels ${pinkPixelCount} > ${maxPinkPixels}`
    );
  }
};

const checkScreenshotContracts = () => {
  if (skipScreenshotScenarioContract('screenshot contracts')) {
    return;
  }
  const names = config.screenshots?.names ?? {};
  const openSettledName = names.resultsOpenSettled;
  if (!openSettledName) {
    gap('results-open-settled screenshot name is not configured');
    return;
  }
  const screenshotPath = resolveScreenshotPath(openSettledName);
  const png = readPng(screenshotPath);
  if (png == null) {
    gap(`results-open-settled screenshot missing: ${screenshotPath}`);
    return;
  }
  const viewport = config.viewport;
  if (png.width !== viewport.widthPx || png.height !== viewport.heightPx) {
    fail(
      `screenshot viewport ${png.width}x${png.height} does not match configured ${viewport.widthPx}x${viewport.heightPx}`
    );
    return;
  }
  pass(`screenshot viewport ${png.width}x${png.height}`);

  const detection = detectSheetTopPx(png, config.sheetSnap?.detection);
  if (detection == null) {
    fail(`could not detect results sheet top in ${screenshotPath}`);
    return;
  }
  const targetSnap = config.sheetSnap?.shortcutResultsOpenTargetSnap ?? 'middle';
  const expectedPx = Number(config.sheetSnap?.snapPointsPx?.[targetSnap]);
  const tolerancePx = Number(config.sheetSnap?.tolerancePx ?? 18);
  const deltaPx = Math.abs(detection.y - expectedPx);
  const nearest = nearestSnap(detection.y, config.sheetSnap?.snapPointsPx ?? {});
  if (deltaPx <= tolerancePx) {
    pass(
      `shortcut results open sheet top ${detection.y}px matches ${targetSnap} ${expectedPx}px +/- ${tolerancePx}px`
    );
  } else {
    fail(
      `shortcut results open sheet top ${
        detection.y
      }px expected ${targetSnap} ${expectedPx}px +/- ${tolerancePx}px; nearest=${
        nearest?.snap ?? 'unknown'
      } delta=${round(nearest?.deltaPx ?? NaN)}px`
    );
  }
  checkFrostyPixelContract(png, detection.y);

  const requiredHeaderLeakScreenshots = config.resultsHeaderLeak?.requiredScreenshots ?? [];
  for (const screenshotKey of requiredHeaderLeakScreenshots) {
    const screenshotName = names[screenshotKey];
    if (!screenshotName) {
      fail(`results header leak screenshot key ${screenshotKey} is not configured`);
      continue;
    }
    checkResultsHeaderLeakScreenshotContract({ screenshotKey, screenshotName });
  }

  const toggleConfig = config.resultsToggle;
  const coveredToggleScreenshots = toggleConfig?.coveredDuringLoadingScreenshots ?? [];
  for (const screenshotKey of coveredToggleScreenshots) {
    const screenshotName = names[screenshotKey];
    if (!screenshotName) {
      fail(`results toggle covered screenshot key ${screenshotKey} is not configured`);
      continue;
    }
    checkResultsToggleCoveredScreenshotContract({ screenshotKey, screenshotName });
  }
  const requiredToggleScreenshots = toggleConfig?.requiredScreenshots ?? [];
  for (const screenshotKey of requiredToggleScreenshots) {
    const screenshotName = names[screenshotKey];
    if (!screenshotName) {
      fail(`results toggle screenshot key ${screenshotKey} is not configured`);
      continue;
    }
    checkResultsToggleScreenshotContract({ screenshotKey, screenshotName });
  }
};

const checkConfigSanity = () => {
  const viewport = config.viewport;
  if (!viewport || viewport.widthPx !== viewport.widthPt * viewport.pixelRatio) {
    fail('viewport width px/pt/pixelRatio config is inconsistent');
  }
  if (!viewport || viewport.heightPx !== viewport.heightPt * viewport.pixelRatio) {
    fail('viewport height px/pt/pixelRatio config is inconsistent');
  }
  if (config.navCutout?.radiusPt === 22 && config.navCutout?.cutoutHeightPt === 46) {
    pass('nav cutout recovered baseline radius=22pt height=46pt');
  } else {
    fail('nav cutout recovered baseline config is not radius=22pt height=46pt');
  }
};

const checkMeasuredLoopProofDensityContracts = () => {
  if (!scenarioName.includes('search_submit_dismiss_repeat')) {
    return;
  }
  const navLockstepEventCount = byMeasuredEvent('nav_cutout_lockstep_contract').length;
  const dismissMotionEventCount = byMeasuredEvent('search_dismiss_motion_plane_contract').length;
  if (measuredVisualEvents.length > MAX_MEASURED_REPEAT_VISUAL_READINESS_EVENTS) {
    fail(
      `measured submit/dismiss loop emitted too many VisualReadiness events: ${measuredVisualEvents.length} > ${MAX_MEASURED_REPEAT_VISUAL_READINESS_EVENTS}`
    );
  } else {
    pass(`measured submit/dismiss VisualReadiness event count=${measuredVisualEvents.length}`);
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
};

const checkNoDisplacedVisualPaths = () => {
  const patterns = [
    ['SearchMountedScene', 'ExternalListHost'].join(''),
    ['syncSearchMountedSceneBody', 'RuntimeSnapshot'].join(''),
    ['hidden', 'Flash', 'List|Hidden', 'Flash', 'List'].join(''),
    'resultPageBundleDismissAnimatedStyle',
  ];
  for (const pattern of patterns) {
    try {
      execFileSync('rg', ['-n', pattern, 'apps/mobile/src'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      fail(`displaced visual path is present for pattern ${pattern}`);
    } catch (error) {
      if (error.status === 1) {
        pass(`no displaced visual path for pattern ${pattern}`);
      } else {
        gap(`could not run rg for displaced visual path pattern ${pattern}`);
      }
    }
  }
};

checkConfigSanity();
checkMeasuredLoopProofDensityContracts();
checkStaticSourceContracts();
checkRevealTimingContracts();
checkMapInteractionContracts();
checkMapMovedScreenshotContract();
checkLoadingCoverRuntimeContracts();
checkNavCutoutLockstepRuntimeContracts();
checkDismissHandoffRuntimeContracts();
checkTransitionGapRuntimeContracts();
checkScreenshotContracts();
checkTransitionGapScreenshotContracts();
checkNavUnderlayScreenshotContracts();
checkPollHeaderLeakScreenshotContracts();
checkPostClosePollPageScreenshotContract();
checkPostHandoffFrameProbeContracts();
checkNoDisplacedVisualPaths();

const output = {
  schema: 'perf-scenario-visual-contracts.v1',
  contractName: config.name ?? path.basename(configPath, path.extname(configPath)),
  reportPath: resolvedReportPath,
  outputPath,
  configPath: path.resolve(configPath),
  scenarioName: report.scenarioName ?? null,
  logPath: report.logPath ?? null,
  referenceCommit: config.reference?.commit ?? null,
  screenshotDirectory: resolveScreenshotDir(),
  passed: failures.length === 0,
  evidence,
  manualGaps,
  failures,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output, null, 2));

if (failures.length > 0) {
  process.exit(1);
}
