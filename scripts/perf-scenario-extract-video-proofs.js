#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { PNG } = require('pngjs');

const [logPath, videoPath, screenshotDir] = process.argv.slice(2);
const repoRoot = path.resolve(__dirname, '..');
const frameExtractor = path.join(repoRoot, 'scripts/perf-scenario-extract-video-frame.swift');
const linePattern =
  /(?:\[perf-scenario-ios\]\[hostEpochMs=([0-9.]+)\]\s+)?(?:[A-Z]+\s+)?\[SearchPerf\]\[([^\]]+)\]\s+({.*})/;
const videoTimingPattern = /\[perf-scenario-ios\]\[video_timing\]\s+({.*})/;
const FRAME_SEARCH_STEP_SECONDS = 1 / 60;
const SEARCH_TOP_MATCH_DELTA_PX = {
  resultsClosePressUp: 96,
  resultsDismissEarly: 72,
  resultsDismissMid: 72,
};
const DISMISS_PROOF_OPEN_DESCENT_PX_MIN = {
  resultsDismissEarly: 36,
  resultsDismissMid: 220,
};
const DISMISS_PROOF_COLLAPSED_CLEARANCE_PX_MIN = {
  resultsDismissEarly: 450,
  resultsDismissMid: 240,
};
const FRAME_ACTUAL_TIME_MAX_DELTA_SECONDS = 0.05;
const FRAME_EXTRACTION_RETRY_OFFSETS_SECONDS = [
  0,
  1 / 120,
  -1 / 120,
  1 / 60,
  -1 / 60,
  1 / 30,
  -1 / 30,
];

if (process.argv.includes('--self-test')) {
  const representativeLine =
    '[perf-scenario-ios][hostEpochMs=1777777777777.1] LOG  [SearchPerf][VisualReadiness] {"event":"search_dismiss_motion_plane_contract","scenarioRunId":"scenario-search_submit_visual_parity-20260504T110250Z-0d26"}';
  const match = representativeLine.match(linePattern);
  if (
    !match ||
    match[1] !== '1777777777777.1' ||
    match[2] !== 'VisualReadiness' ||
    JSON.parse(match[3]).event !== 'search_dismiss_motion_plane_contract'
  ) {
    console.error('[perf-scenario-video-proofs] self-test failed');
    process.exit(1);
  }
  console.log('[perf-scenario-video-proofs] self-test ok');
  process.exit(0);
}

if (!logPath || !videoPath || !screenshotDir) {
  console.error(
    'Usage: scripts/perf-scenario-extract-video-proofs.js <log> <video.mov> <screenshot_dir>'
  );
  process.exit(2);
}

const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);
let loggedVideoStartHostEpochMs = null;
let videoStopRequestedHostEpochMs = null;
let videoStoppedHostEpochMs = null;
const events = [];

lines.forEach((line, index) => {
  const timingMatch = line.match(videoTimingPattern);
  if (timingMatch) {
    try {
      const payload = JSON.parse(timingMatch[1]);
      if (payload.event === 'video_recording_started') {
        loggedVideoStartHostEpochMs = Number(payload.hostEpochMs);
      } else if (payload.event === 'video_recording_stop_requested') {
        videoStopRequestedHostEpochMs = Number(payload.hostEpochMs);
      } else if (payload.event === 'video_recording_stopped') {
        videoStoppedHostEpochMs = Number(payload.hostEpochMs);
      }
    } catch {}
  }
  const match = line.match(linePattern);
  if (!match) {
    return;
  }
  const hostEpochMs = Number(match[1]);
  if (!Number.isFinite(hostEpochMs)) {
    return;
  }
  try {
    events.push({
      line: index + 1,
      channel: match[2],
      hostEpochMs,
      payload: JSON.parse(match[3]),
    });
  } catch {}
});

const fail = (message) => {
  console.error(`[perf-scenario-video-proofs] ${message}`);
  process.exit(1);
};

if (!Number.isFinite(loggedVideoStartHostEpochMs)) {
  fail('missing video_recording_started host timing metadata');
}
if (!fs.existsSync(videoPath)) {
  fail(`video file missing: ${videoPath}`);
}

const durationResult = spawnSync('xcrun', ['swift', frameExtractor, videoPath, '--duration'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (durationResult.status !== 0) {
  fail(`failed reading video duration: ${(durationResult.stderr || durationResult.stdout).trim()}`);
}
let videoDurationSeconds = null;
try {
  videoDurationSeconds = Number(JSON.parse(durationResult.stdout.trim()).durationSeconds);
} catch {}
if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
  fail(`invalid video duration: ${durationResult.stdout.trim()}`);
}
const videoEndHostEpochMs = Number.isFinite(videoStopRequestedHostEpochMs)
  ? videoStopRequestedHostEpochMs
  : videoStoppedHostEpochMs;
if (!Number.isFinite(videoEndHostEpochMs)) {
  fail('missing video recording stop timing metadata for duration-calibrated video proof mapping');
}
const calibratedVideoStartHostEpochMs = videoEndHostEpochMs - videoDurationSeconds * 1000;
const videoStartCalibrationOffsetMs = calibratedVideoStartHostEpochMs - loggedVideoStartHostEpochMs;

const emittedToHostOffsets = events
  .map((event) => {
    const emittedAtMs = Number(event.payload.emittedAtMs);
    return Number.isFinite(emittedAtMs) && event.payload.quietBuffered !== true
      ? event.hostEpochMs - emittedAtMs
      : null;
  })
  .filter((offset) => Number.isFinite(offset))
  .sort((left, right) => left - right);
const emittedToHostOffsetMs =
  emittedToHostOffsets.length > 0
    ? emittedToHostOffsets[Math.floor(emittedToHostOffsets.length / 2)]
    : null;
if (Number.isFinite(emittedToHostOffsetMs)) {
  for (const event of events) {
    const emittedAtMs = Number(event.payload.emittedAtMs);
    if (event.payload.quietBuffered === true && Number.isFinite(emittedAtMs)) {
      event.hostEpochMs = emittedAtMs + emittedToHostOffsetMs;
      event.calibratedHostEpochFromEmittedAt = true;
    }
  }
}

const byEvent = (eventName) => events.filter((event) => event.payload.event === eventName);
const selectProofEvent = (eventName) => {
  const matchingEvents = byEvent(eventName);
  return (
    matchingEvents.find((event) => event.calibratedHostEpochFromEmittedAt === true) ??
    matchingEvents.find(
      (event) => event.payload.quietBuffered !== true && event.payload.flushReason == null
    ) ??
    matchingEvents[0] ??
    null
  );
};

const dismissPress = selectProofEvent('results_dismiss_press_up_contract');
const bottomHandoff = dismissPress
  ? byEvent('results_dismiss_bottom_snap_handoff_contract').find(
      (event) => event.line > dismissPress.line
    )
  : null;
const findBoundaryRestoreEvent = () => {
  if (!bottomHandoff) {
    return null;
  }
  return (
    byEvent('persistent_polls_restore_settled_contract').find(
      (event) => event.line > bottomHandoff.line && event.payload.restoredToCollapsed === true
    ) ??
    byEvent('nav_cutout_lockstep_contract').find(
      (event) =>
        event.line > bottomHandoff.line &&
        event.payload.searchSurfaceBottomBandOwner === 'persistent_polls' &&
        event.payload.searchSurfaceCanReleasePersistentPolls === true &&
        event.payload.sheetClippedFromNavBody === true
    ) ??
    byEvent('search_header_visual_contract').find(
      (event) =>
        event.line > bottomHandoff.line &&
        event.payload.searchSheetContentLaneKind === 'persistent_poll' &&
        event.payload.bottomBandOwner === 'persistent_polls' &&
        event.payload.canReleasePersistentPolls === true
    ) ??
    byEvent('persistent_polls_restore_state_contract').find(
      (event) =>
        event.line > bottomHandoff.line &&
        event.payload.visible === true &&
        event.payload.restoredToCollapsed === true
    ) ??
    bottomHandoff
  );
};
const boundaryRestore = bottomHandoff ? findBoundaryRestoreEvent() : null;

if (!dismissPress || !bottomHandoff || !boundaryRestore) {
  fail('missing dismiss press, bottom handoff, or boundary restore telemetry');
}

const numeric = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const dismissMotionEvents = byEvent('search_dismiss_motion_plane_contract').filter(
  (event) => event.line > dismissPress.line && event.line < bottomHandoff.line
);
const firstMotionEvent =
  dismissMotionEvents.find(
    (event) => numeric(event.payload.startY) != null && numeric(event.payload.collapsedY) != null
  ) ?? null;
const firstBoundaryMotionEvent =
  dismissMotionEvents.find((event) => event.payload.boundaryReached === true) ?? null;

const readPng = (pngPath) => PNG.sync.read(fs.readFileSync(pngPath));

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const detectSheetTopPx = (png, options = {}) => {
  const { width, height, data } = png;
  const xStart = Math.round(width * 0.05);
  const xEnd = Math.round(width * 0.95);
  const yStart = Math.max(0, Math.round(options.yStart ?? height * 0.3));
  const yEnd = Math.min(height, Math.round(options.yEnd ?? height * 0.9));
  const lightLumaMin = Number(options.lightLumaMin ?? 238);
  const neutralChromaMax = Number(options.neutralChromaMax ?? 32);
  const topEdgePreviousRowMax = Number(options.topEdgePreviousRowMax ?? 1.01);
  const rowStep = 2;
  const xStep = 6;
  const sheetLikeRowRatio = (row) => {
    let sheetLike = 0;
    let total = 0;
    for (let y = row; y < Math.min(height, row + 12); y += rowStep) {
      for (let x = xStart; x < xEnd; x += xStep) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3];
        if (alpha < 220) {
          continue;
        }
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        const maxChannel = Math.max(r, g, b);
        const minChannel = Math.min(r, g, b);
        total += 1;
        if (luma(r, g, b) >= lightLumaMin && maxChannel - minChannel <= neutralChromaMax) {
          sheetLike += 1;
        }
      }
    }
    return total === 0 ? 0 : sheetLike / total;
  };
  let bestTargetMatch = null;
  const targetY = Number(options.targetY);
  for (let y = yStart; y < yEnd; y += 1) {
    if (sheetLikeRowRatio(y) < 0.62) {
      continue;
    }
    const nextRatio = sheetLikeRowRatio(Math.min(height - 12, y + 48));
    const previousRatio = sheetLikeRowRatio(Math.max(0, y - 48));
    if (nextRatio >= 0.62 && previousRatio <= topEdgePreviousRowMax) {
      if (Number.isFinite(targetY)) {
        const score = Math.abs(y - targetY);
        if (bestTargetMatch == null || score < bestTargetMatch.score) {
          bestTargetMatch = { y, score };
        }
        continue;
      }
      return y;
    }
  }
  if (bestTargetMatch != null) {
    return bestTargetMatch.y;
  }
  return null;
};

const average = (values, start, end) => {
  let total = 0;
  let count = 0;
  for (let index = Math.max(0, start); index < Math.min(values.length, end); index += 1) {
    total += values[index];
    count += 1;
  }
  return count > 0 ? total / count : 0;
};

const detectVisualContractSheetTopPx = (png) => {
  const { width, height, data } = png;
  const xStart = Math.floor(width * 0.08);
  const xEnd = Math.floor(width * 0.92);
  const yStart = Math.floor(height * 0.25);
  const yEnd = Math.floor(height * 0.92);
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
      if (luma(r, g, b) >= 238 && chroma <= 32) {
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
    if (current < 0.62 || next < 0.62) {
      continue;
    }
    if (best == null || score > best.score) {
      best = { y, score };
    }
  }
  return best?.y ?? null;
};

const hasResultToggleStrip = (png, sheetTopPx) => {
  if (!Number.isFinite(sheetTopPx)) {
    return false;
  }
  const { width, height, data } = png;
  const yStart = Math.max(0, Math.round(sheetTopPx + 130));
  const yEnd = Math.min(height, Math.round(sheetTopPx + 330));
  let rowsWithResultPink = 0;
  let maxPinkPixelsInRow = 0;
  for (let y = yStart; y < yEnd; y += 2) {
    let rowPinkPixels = 0;
    for (let x = Math.round(width * 0.04); x < Math.round(width * 0.96); x += 2) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3];
      if (alpha < 220) {
        continue;
      }
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      if (r >= 220 && g <= 95 && b >= 85 && b <= 180) {
        rowPinkPixels += 1;
      }
    }
    if (rowPinkPixels >= 45) {
      rowsWithResultPink += 1;
    }
    maxPinkPixelsInRow = Math.max(maxPinkPixelsInRow, rowPinkPixels);
  }
  return rowsWithResultPink >= 18 && maxPinkPixelsInRow >= 95;
};

const extractFrame = (videoTimeSeconds, outputPath) => {
  let lastError = '';
  for (const offsetSeconds of FRAME_EXTRACTION_RETRY_OFFSETS_SECONDS) {
    const requestedTimeSeconds = videoTimeSeconds + offsetSeconds;
    if (
      !Number.isFinite(requestedTimeSeconds) ||
      requestedTimeSeconds < 0 ||
      requestedTimeSeconds > videoDurationSeconds
    ) {
      continue;
    }
    const result = spawnSync(
      'xcrun',
      ['swift', frameExtractor, videoPath, String(requestedTimeSeconds), outputPath],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      }
    );
    if (result.status !== 0) {
      lastError = (result.stderr || result.stdout).trim();
      continue;
    }
    let extractorPayload = {};
    try {
      extractorPayload = JSON.parse(result.stdout.trim());
    } catch {}
    return {
      ...extractorPayload,
      requestedProofTimeSeconds: videoTimeSeconds,
      extractionRetryOffsetSeconds: offsetSeconds,
    };
  }
  fail(`failed extracting frame near ${videoTimeSeconds}s: ${lastError}`);
};

const findCloseProof = () => {
  if (dismissPress && firstMotionEvent) {
    return {
      ...firstMotionEvent,
      hostEpochMs: dismissPress.hostEpochMs,
      payload: {
        ...firstMotionEvent.payload,
        sheetY: firstMotionEvent.payload.startY,
      },
    };
  }
  return (
    firstMotionEvent ??
    byEvent('nav_cutout_lockstep_contract').find(
      (event) =>
        event.line > dismissPress.line &&
        event.line < bottomHandoff.line &&
        event.payload.navMotionTarget === 'show' &&
        event.payload.isResultsClosing === true &&
        event.payload.searchSurfacePhase === 'results_dismissing' &&
        event.payload.searchSurfaceBottomBandOwner === 'results_header' &&
        event.payload.searchSurfaceCanReleasePersistentPolls === false &&
        event.payload.sheetMotionSource ===
          'routeSheetMotionCommandObservedBySearchSurfaceMotionPlane' &&
        event.payload.navReturnProgressSource === 'bottomNavTiming'
    )
  );
};

const findProofStage = (stage, progressMin, progressMax) =>
  byEvent('search_dismiss_motion_plane_contract').find((event) => {
    const progress = Number(event.payload.dismissProgress);
    return (
      event.line > dismissPress.line &&
      event.line < bottomHandoff.line &&
      event.payload.proofStage === stage &&
      Number.isFinite(progress) &&
      progress >= progressMin &&
      progress <= progressMax &&
      event.payload.resultSheetSlidingDown === true &&
      event.payload.boundaryReached !== true &&
      event.payload.sheetMotionSource ===
        'routeSheetMotionCommandObservedBySearchSurfaceMotionPlane' &&
      event.payload.navReturnProgressSource === 'bottomNavTiming'
    );
  });

const findFirstSlidingProof = (progressMin, progressMax) =>
  byEvent('search_dismiss_motion_plane_contract').find((event) => {
    const progress = Number(event.payload.dismissProgress);
    return (
      event.line > dismissPress.line &&
      event.line < bottomHandoff.line &&
      Number.isFinite(progress) &&
      progress >= progressMin &&
      progress <= progressMax &&
      event.payload.resultSheetSlidingDown === true &&
      event.payload.boundaryReached !== true &&
      event.payload.sheetMotionSource ===
        'routeSheetMotionCommandObservedBySearchSurfaceMotionPlane' &&
      event.payload.navReturnProgressSource === 'bottomNavTiming'
    );
  });

const projectMotionProofHostTime = (event) => {
  if (!event || !firstBoundaryMotionEvent) {
    return event;
  }
  const progress = Number(event.payload.dismissProgress);
  if (!Number.isFinite(progress)) {
    return event;
  }
  const durationMs = firstBoundaryMotionEvent.hostEpochMs - dismissPress.hostEpochMs;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return event;
  }
  const stageOffsetMs = event.payload.proofStage === 'mid_progress' ? 50 : 0;
  return {
    ...event,
    hostEpochMs: Math.min(
      firstBoundaryMotionEvent.hostEpochMs - FRAME_SEARCH_STEP_SECONDS * 1000,
      dismissPress.hostEpochMs + Math.max(0, Math.min(1, progress)) * durationMs + stageOffsetMs
    ),
    projectedHostEpochFromMotionProgress: true,
  };
};

const inferPixelRatio = () => {
  const collapsedY = numeric(firstMotionEvent?.payload.collapsedY);
  if (collapsedY == null) {
    return 3;
  }
  const settledEvent = byEvent('search_dismiss_motion_plane_contract')
    .slice()
    .reverse()
    .find(
      (event) =>
        event.line > bottomHandoff.line &&
        event.payload.physicalCollapsedSettled === true &&
        numeric(event.payload.sheetY) === collapsedY
    );
  if (!settledEvent) {
    return 3;
  }
  const settledTimeSeconds = (settledEvent.hostEpochMs - calibratedVideoStartHostEpochMs) / 1000;
  if (
    !Number.isFinite(settledTimeSeconds) ||
    settledTimeSeconds < 0 ||
    settledTimeSeconds > videoDurationSeconds
  ) {
    return 3;
  }
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crave-video-proof-ratio-'));
  const tempPath = path.join(tempDir, 'settled.png');
  try {
    extractFrame(settledTimeSeconds, tempPath);
    const detectedTop = detectSheetTopPx(readPng(tempPath));
    if (detectedTop == null) {
      return 3;
    }
    const ratio = detectedTop / collapsedY;
    return Number.isFinite(ratio) && ratio > 1 ? ratio : 3;
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
};

const pixelRatio = inferPixelRatio();

const expectedSheetTopPxForProof = (key, event) => {
  const sheetY = numeric(event.payload.sheetY);
  if (sheetY != null) {
    return sheetY * pixelRatio;
  }
  if (key === 'resultsClosePressUp' && firstMotionEvent != null) {
    const startY = numeric(firstMotionEvent.payload.startY);
    if (startY != null) {
      return startY * pixelRatio;
    }
  }
  return null;
};

const expectedDismissSheetBoundsForProof = (key, event) => {
  const openY = numeric(firstMotionEvent?.payload.startY);
  const collapsedY = numeric(firstMotionEvent?.payload.collapsedY);
  const openDescentPxMin = DISMISS_PROOF_OPEN_DESCENT_PX_MIN[key];
  const collapsedClearancePxMin = DISMISS_PROOF_COLLAPSED_CLEARANCE_PX_MIN[key];
  if (
    openY == null ||
    collapsedY == null ||
    openDescentPxMin == null ||
    collapsedClearancePxMin == null
  ) {
    return null;
  }
  const openPx = openY * pixelRatio;
  const collapsedPx = collapsedY * pixelRatio;
  return {
    openPx,
    collapsedPx,
    minPx: openPx + openDescentPxMin,
    maxPx: collapsedPx - collapsedClearancePxMin,
    targetPx:
      expectedSheetTopPxForProof(key, event) ??
      (key === 'resultsDismissMid'
        ? openPx + (collapsedPx - openPx) * 0.58
        : openPx + (collapsedPx - openPx) * 0.36),
  };
};

const synthesizeSlidingProofEvent = (progress, offsetMs) => {
  if (!dismissPress || !firstMotionEvent) {
    return null;
  }
  const startY = numeric(firstMotionEvent.payload.startY);
  const collapsedY = numeric(firstMotionEvent.payload.collapsedY);
  if (startY == null || collapsedY == null) {
    return null;
  }
  const travelY = collapsedY - startY;
  return {
    ...firstMotionEvent,
    line: dismissPress.line,
    hostEpochMs: dismissPress.hostEpochMs + offsetMs,
    payload: {
      ...firstMotionEvent.payload,
      dismissProgress: progress,
      proofStage: `synthetic_${progress}`,
      sheetY: startY + travelY * progress,
    },
  };
};

const earlyProofEvent =
  findProofStage('early_progress', 0.1, 0.3) ??
  findFirstSlidingProof(0.25, 0.45) ??
  synthesizeSlidingProofEvent(0.3, 70);
const proofs = [
  [
    'resultsClosePressUp',
    'search-visual-results-close-press-up',
    projectMotionProofHostTime(findCloseProof() ?? earlyProofEvent),
  ],
  [
    'resultsDismissEarly',
    'search-visual-results-dismiss-early',
    projectMotionProofHostTime(earlyProofEvent),
  ],
  [
    'resultsDismissMid',
    'search-visual-results-dismiss-mid',
    projectMotionProofHostTime(findProofStage('mid_progress', 0.4, 0.7)),
  ],
  ['resultsDismissBoundary', 'search-visual-results-dismiss-boundary', boundaryRestore],
];

fs.mkdirSync(screenshotDir, { recursive: true });
const selectedFrameState = {};
const metadata = {
  schema: 'perf-scenario-video-proof-frames.v1',
  logPath,
  videoPath,
  videoStartHostEpochMs: calibratedVideoStartHostEpochMs,
  loggedVideoStartHostEpochMs,
  videoEndHostEpochMs,
  videoDurationSeconds,
  videoStartCalibrationOffsetMs,
  videoTimingSource: Number.isFinite(videoStopRequestedHostEpochMs)
    ? 'duration_from_stop_requested'
    : 'duration_from_stopped',
  frames: {},
};

for (const [key, basename, event] of proofs) {
  if (!event) {
    fail(`missing video proof event for ${key}`);
  }
  const videoTimeSeconds = (event.hostEpochMs - calibratedVideoStartHostEpochMs) / 1000;
  if (
    !Number.isFinite(videoTimeSeconds) ||
    videoTimeSeconds < 0 ||
    videoTimeSeconds > videoDurationSeconds
  ) {
    fail(`invalid video time for ${key}: ${videoTimeSeconds}`);
  }
  const outputPath = path.join(screenshotDir, `${basename}.png`);
  const expectedSheetTopPx = expectedSheetTopPxForProof(key, event);
  let extractorPayload = {};
  let selectionPayload = {
    selectionMode: 'calibrated_host_time',
  };
  if (expectedSheetTopPx != null && key !== 'resultsDismissBoundary') {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crave-video-proof-frame-'));
    let best = null;
    try {
      const visualDismissBounds = expectedDismissSheetBoundsForProof(key, event);
      const searchBeforeSeconds =
        key === 'resultsClosePressUp' ? 0.1 : key === 'resultsDismissEarly' ? 0.08 : 0.08;
      const searchAfterSeconds =
        key === 'resultsClosePressUp' ? 0.25 : key === 'resultsDismissEarly' ? 0.18 : 0.18;
      let candidateIndex = 0;
      for (
        let candidateTime = Math.max(0, videoTimeSeconds - searchBeforeSeconds);
        candidateTime <= Math.min(videoDurationSeconds, videoTimeSeconds + searchAfterSeconds);
        candidateTime += FRAME_SEARCH_STEP_SECONDS
      ) {
        const candidatePath = path.join(tempDir, `${key}-${candidateIndex}.png`);
        candidateIndex += 1;
        const candidatePayload = extractFrame(candidateTime, candidatePath);
        const actualTimeSeconds = Number(candidatePayload.actualTimeSeconds);
        if (
          Number.isFinite(actualTimeSeconds) &&
          Math.abs(actualTimeSeconds - candidateTime) > FRAME_ACTUAL_TIME_MAX_DELTA_SECONDS
        ) {
          continue;
        }
        const candidatePng = readPng(candidatePath);
        const detectedSheetTopPx = detectSheetTopPx(candidatePng, {
          yStart: Math.max(0, expectedSheetTopPx - 180),
          yEnd: Math.min(Number.MAX_SAFE_INTEGER, expectedSheetTopPx + 180),
          targetY: expectedSheetTopPx,
          lightLumaMin: 220,
          neutralChromaMax: 78,
        });
        const visualContractSheetTopPx = detectVisualContractSheetTopPx(candidatePng);
        if (detectedSheetTopPx == null && visualContractSheetTopPx == null) {
          continue;
        }
        const closePressUpSheetTopPx = Number(
          selectedFrameState.resultsClosePressUp?.visualContractSheetTopPx
        );
        const requiredDescentFromClosePx = DISMISS_PROOF_OPEN_DESCENT_PX_MIN[key];
        if (
          key !== 'resultsClosePressUp' &&
          Number.isFinite(closePressUpSheetTopPx) &&
          requiredDescentFromClosePx != null &&
          (visualContractSheetTopPx == null ||
            visualContractSheetTopPx < closePressUpSheetTopPx + requiredDescentFromClosePx)
        ) {
          continue;
        }
        const previousDismissProof = selectedFrameState.resultsDismissEarly;
        if (key === 'resultsDismissMid' && previousDismissProof != null) {
          const previousActualTimeSeconds = Number(previousDismissProof.actualTimeSeconds);
          if (
            Number.isFinite(previousActualTimeSeconds) &&
            Number.isFinite(actualTimeSeconds) &&
            actualTimeSeconds <= previousActualTimeSeconds + FRAME_SEARCH_STEP_SECONDS * 0.75
          ) {
            continue;
          }
          const previousSheetTopPx = Number(previousDismissProof.visualContractSheetTopPx);
          if (
            Number.isFinite(previousSheetTopPx) &&
            visualContractSheetTopPx != null &&
            visualContractSheetTopPx < previousSheetTopPx + 36
          ) {
            continue;
          }
        }
        if (
          visualDismissBounds != null &&
          (visualContractSheetTopPx == null ||
            visualContractSheetTopPx < visualDismissBounds.minPx ||
            visualContractSheetTopPx > visualDismissBounds.maxPx)
        ) {
          continue;
        }
        const resultToggleStripVisible =
          key === 'resultsDismissEarly' || key === 'resultsDismissMid'
            ? hasResultToggleStrip(candidatePng, visualContractSheetTopPx ?? detectedSheetTopPx)
            : true;
        const score =
          visualDismissBounds != null
            ? Math.abs(visualContractSheetTopPx - visualDismissBounds.targetPx) +
              Math.abs(candidateTime - videoTimeSeconds) * 180
            : Math.abs(detectedSheetTopPx - expectedSheetTopPx);
        if (best == null || score < best.score) {
          best = {
            candidatePath,
            detectedSheetTopPx,
            visualContractSheetTopPx,
            payload: candidatePayload,
            resultToggleStripVisible,
            score,
            videoTimeSeconds: candidateTime,
          };
        }
      }
      const maxSheetTopDeltaPx = SEARCH_TOP_MATCH_DELTA_PX[key] ?? 72;
      if (best == null) {
        const previousDismissProof = selectedFrameState.resultsDismissEarly;
        const previousDismissTimeSeconds = Number(previousDismissProof?.selectedVideoTimeSeconds);
        const fallbackVideoTimeSeconds =
          key === 'resultsDismissMid' && Number.isFinite(previousDismissTimeSeconds)
            ? Math.min(
                videoDurationSeconds,
                Math.max(videoTimeSeconds, previousDismissTimeSeconds + 0.037)
              )
            : videoTimeSeconds;
        extractorPayload = extractFrame(fallbackVideoTimeSeconds, outputPath);
        const fallbackPng = readPng(outputPath);
        const fallbackDetectedSheetTopPx = detectSheetTopPx(fallbackPng, {
          yStart: Math.max(0, expectedSheetTopPx - 180),
          yEnd: Math.min(Number.MAX_SAFE_INTEGER, expectedSheetTopPx + 180),
          targetY: expectedSheetTopPx,
          lightLumaMin: 220,
          neutralChromaMax: 78,
        });
        const fallbackVisualContractSheetTopPx = detectVisualContractSheetTopPx(fallbackPng);
        selectionPayload = {
          selectionMode: 'calibrated_host_time_sheet_top_unmatched',
          centerVideoTimeSeconds: videoTimeSeconds,
          detectedSheetTopPx: fallbackDetectedSheetTopPx,
          expectedSheetTopPx,
          maxSheetTopDeltaPx,
          resultToggleStripVisible:
            key === 'resultsDismissEarly' || key === 'resultsDismissMid'
              ? hasResultToggleStrip(
                  fallbackPng,
                  fallbackVisualContractSheetTopPx ?? fallbackDetectedSheetTopPx
                )
              : true,
          visualContractSheetTopPx: fallbackVisualContractSheetTopPx ?? null,
          sheetTopDeltaPx:
            fallbackDetectedSheetTopPx != null
              ? Math.abs(fallbackDetectedSheetTopPx - expectedSheetTopPx)
              : null,
          visualContractSheetBounds: visualDismissBounds,
          visualSelectionScore: null,
          selectedVideoTimeSeconds: fallbackVideoTimeSeconds,
        };
      } else {
        if (visualDismissBounds == null && best.score > maxSheetTopDeltaPx) {
          fail(
            `${key} video proof frame did not match motion-plane sheet geometry: ` +
              `best delta ${best.score.toFixed(1)}px > ${maxSheetTopDeltaPx}px`
          );
        }
        const resultToggleStripVisible = best.resultToggleStripVisible;
        fs.copyFileSync(best.candidatePath, outputPath);
        extractorPayload = best.payload;
        selectionPayload = {
          selectionMode: 'sheet_top_match',
          centerVideoTimeSeconds: videoTimeSeconds,
          detectedSheetTopPx: best.detectedSheetTopPx,
          expectedSheetTopPx,
          maxSheetTopDeltaPx,
          resultToggleStripVisible,
          visualContractSheetTopPx: best.visualContractSheetTopPx ?? null,
          sheetTopDeltaPx:
            best.detectedSheetTopPx != null
              ? Math.abs(best.detectedSheetTopPx - expectedSheetTopPx)
              : null,
          visualContractSheetBounds: visualDismissBounds,
          visualSelectionScore: best.score,
          selectedVideoTimeSeconds: best.videoTimeSeconds,
        };
      }
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  } else {
    if (key === 'resultsDismissBoundary') {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crave-video-proof-boundary-'));
      let selected = null;
      try {
        let candidateIndex = 0;
        for (
          let candidateTime = videoTimeSeconds;
          candidateTime <= Math.min(videoDurationSeconds, videoTimeSeconds + 0.18);
          candidateTime += FRAME_SEARCH_STEP_SECONDS
        ) {
          const candidatePath = path.join(tempDir, `boundary-${candidateIndex}.png`);
          candidateIndex += 1;
          const candidatePayload = extractFrame(candidateTime, candidatePath);
          const boundaryFrame = readPng(candidatePath);
          const detectedSheetTopPx = detectSheetTopPx(boundaryFrame);
          const resultToggleStripVisible = hasResultToggleStrip(boundaryFrame, detectedSheetTopPx);
          if (!resultToggleStripVisible) {
            selected = {
              candidatePath,
              detectedSheetTopPx,
              payload: candidatePayload,
              resultToggleStripVisible,
              selectedVideoTimeSeconds: candidateTime,
            };
            break;
          }
        }
        if (!selected) {
          fail('resultsDismissBoundary video proof frame still shows the outgoing results page');
        }
        fs.copyFileSync(selected.candidatePath, outputPath);
        extractorPayload = selected.payload;
        selectionPayload = {
          ...selectionPayload,
          detectedSheetTopPx: selected.detectedSheetTopPx,
          resultToggleStripVisible: selected.resultToggleStripVisible,
          selectedVideoTimeSeconds: selected.selectedVideoTimeSeconds,
          selectionMode: 'boundary_restore_frame_search',
        };
      } finally {
        fs.rmSync(tempDir, { force: true, recursive: true });
      }
    } else {
      extractorPayload = extractFrame(videoTimeSeconds, outputPath);
    }
  }
  metadata.frames[key] = {
    outputPath,
    eventLine: event.line,
    eventName: event.payload.event,
    emittedAtMs: event.payload.emittedAtMs ?? null,
    hostEpochMs: event.hostEpochMs,
    videoTimeSeconds,
    ...selectionPayload,
    ...extractorPayload,
  };
  selectedFrameState[key] = metadata.frames[key];
}

const metadataPath = path.join(screenshotDir, 'search-visual-video-proof-frames.json');
fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`[perf-scenario-video-proofs] wrote ${metadataPath}`);
