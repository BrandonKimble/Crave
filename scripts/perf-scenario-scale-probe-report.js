#!/usr/bin/env node
// FEATURE-COUNT DEGRADATION REPORT (#21)
//
// Reads a scale-probe run log and charts frame performance vs synthetic
// marker-count. The harness sets N via `set_scale_probe_markers` (each emits a
// `map_scale_probe_marker_count_applied` event carrying markerCount+emittedAtMs);
// between two consecutive applied-events the map runs a fixed pan/zoom workout at
// that N. We bucket every frame-sampler window (by emittedAtMs) into the segment it
// falls in, drop the first window after each count change (GPU upload spike), and
// summarize fps / dropped-frame ratio per N.
//
// Run with the frame samplers logging ALL windows (not just sub-threshold):
//   EXPO_PUBLIC_PERF_JS_FRAME_LOG_ONLY_BELOW_FPS=240
//   EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS=240
// otherwise healthy (>=58fps) windows are never emitted and the baseline is blind.

const fs = require('fs');

const usage = () => {
  console.log(
    'Usage: scripts/perf-scenario-scale-probe-report.js <log_path> [output_json_path]'
  );
};

if (process.argv.includes('-h') || process.argv.includes('--help')) {
  usage();
  process.exit(0);
}

const logPath = process.argv[2];
const outputPath = process.argv[3];
if (!logPath) {
  usage();
  process.exit(2);
}

const linePattern = /\[SearchPerf\]\[([^\]]+)\]\s+({.*})/;

const readEvents = (content) => {
  const events = [];
  content.split(/\r?\n/).forEach((line) => {
    const match = line.match(linePattern);
    if (!match) {
      return;
    }
    try {
      events.push({ channel: match[1], payload: JSON.parse(match[2]) });
    } catch {
      // ignore unparseable lines
    }
  });
  return events;
};

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const median = (values) => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const minOf = (values) => {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length ? Math.min(...finite) : null;
};

const maxOf = (values) => {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length ? Math.max(...finite) : null;
};

const round1 = (value) => (value == null ? null : Number(value.toFixed(1)));
const round3 = (value) => (value == null ? null : Number(value.toFixed(3)));

const main = () => {
  const content = fs.readFileSync(logPath, 'utf8');
  const events = readEvents(content);

  // The marker-count boundary is the coordinator's executed-command event (channel
  // Scenario), which always carries the applied `count` + `emittedAtMs` regardless of
  // whether RuntimeMechanism attribution is enabled.
  const appliedEvents = events
    .filter(
      (e) =>
        e.channel === 'Scenario' &&
        e.payload.event === 'perf_scenario_command_executed' &&
        e.payload.action === 'set_scale_probe_markers' &&
        e.payload.step === 'set_scale_probe_markers' &&
        Number.isFinite(Number(e.payload.count)) &&
        Number.isFinite(Number(e.payload.emittedAtMs))
    )
    .map((e) => ({
      markerCount: Number(e.payload.count),
      emittedAtMs: Number(e.payload.emittedAtMs),
    }))
    .sort((a, b) => a.emittedAtMs - b.emittedAtMs);

  if (appliedEvents.length === 0) {
    const message =
      'No set_scale_probe_markers executed-command events found. Was the scale-probe flow run with an active scenario?';
    console.error(`[scale-probe-report] ${message}`);
    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify({ error: message, segments: [] }, null, 2));
    }
    process.exit(1);
  }

  const windowOf = (channel) =>
    events
      .filter(
        (e) =>
          e.channel === channel &&
          e.payload.event === 'window' &&
          Number.isFinite(Number(e.payload.emittedAtMs))
      )
      .map((e) => ({
        emittedAtMs: Number(e.payload.emittedAtMs),
        avgFps: num(e.payload.avgFps),
        floorFps: num(e.payload.floorFps),
        p95FrameMs: num(e.payload.p95FrameMs),
        maxFrameMs: num(e.payload.maxFrameMs),
        droppedFrameRatio: num(e.payload.droppedFrameRatio),
        stallCount: num(e.payload.stallCount) ?? 0,
      }));

  const uiWindows = windowOf('UiFrameSampler');
  const jsWindows = windowOf('JsFrameSampler');

  // Build [start, end) segments per applied count. The teardown (count=0) marks the
  // end of the last measured segment.
  const segments = appliedEvents.map((applied, index) => {
    const next = appliedEvents[index + 1];
    return {
      markerCount: applied.markerCount,
      startMs: applied.emittedAtMs,
      endMs: next ? next.emittedAtMs : Number.POSITIVE_INFINITY,
    };
  });

  const summarizeSegment = (segment, allWindows) => {
    const inRange = allWindows
      .filter((w) => w.emittedAtMs >= segment.startMs && w.emittedAtMs < segment.endMs)
      .sort((a, b) => a.emittedAtMs - b.emittedAtMs);
    // Drop the first window after the count change (upload/settle spike).
    const measured = inRange.length > 1 ? inRange.slice(1) : inRange;
    return {
      windowCount: measured.length,
      medianAvgFps: round1(median(measured.map((w) => w.avgFps))),
      minFloorFps: round1(minOf(measured.map((w) => w.floorFps))),
      medianP95FrameMs: round1(median(measured.map((w) => w.p95FrameMs))),
      maxFrameMs: round1(maxOf(measured.map((w) => w.maxFrameMs))),
      maxDroppedFrameRatio: round3(maxOf(measured.map((w) => w.droppedFrameRatio))),
      totalStalls: measured.reduce((sum, w) => sum + (w.stallCount ?? 0), 0),
    };
  };

  const rows = segments
    .filter((segment) => Number.isFinite(segment.endMs)) // skip the trailing teardown segment
    .map((segment) => ({
      markerCount: segment.markerCount,
      durationMs: round1(segment.endMs - segment.startMs),
      ui: summarizeSegment(segment, uiWindows),
      js: summarizeSegment(segment, jsWindows),
    }));

  const report = {
    logPath,
    appliedCount: appliedEvents.length,
    uiWindowTotal: uiWindows.length,
    jsWindowTotal: jsWindows.length,
    rows,
  };

  // Pretty console table (UI sampler = device/native frame pacing, the signal that
  // matters for Mapbox render cost).
  console.log('\n=== Feature-count degradation (UI / device frame pacing) ===');
  console.log(
    'markerCount | windows | medianAvgFps | minFloorFps | medianP95ms | maxDroppedRatio | stalls'
  );
  console.log(
    '------------+---------+--------------+-------------+-------------+-----------------+-------'
  );
  rows.forEach((row) => {
    const u = row.ui;
    console.log(
      [
        String(row.markerCount).padStart(11),
        String(u.windowCount).padStart(7),
        String(u.medianAvgFps ?? '-').padStart(12),
        String(u.minFloorFps ?? '-').padStart(11),
        String(u.medianP95FrameMs ?? '-').padStart(11),
        String(u.maxDroppedFrameRatio ?? '-').padStart(15),
        String(u.totalStalls).padStart(6),
      ].join(' | ')
    );
  });
  console.log('');

  if (uiWindows.length === 0) {
    console.warn(
      '[scale-probe-report] No UiFrameSampler windows logged. Re-run with EXPO_PUBLIC_PERF_UI_FRAME_LOG_ONLY_BELOW_FPS=240 so all windows are emitted.'
    );
  }

  if (outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(`[scale-probe-report] Wrote ${outputPath}`);
  }
};

main();
