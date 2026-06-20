#!/usr/bin/env node
'use strict';

/**
 * Sheet V4 proof gate — "sheet motion must not jank the map or the JS thread".
 *
 * Consumes a perf-scenario report.json (from `perf:scenario:report`) for the
 * `search_map_lod_sheet_drag` flow, scopes to the MEASURED REPEAT LOOP window
 * (the actual sheet-drag gestures — NOT app launch / results hydration, which
 * have their own unrelated stalls), and asserts frame health:
 *
 * HARD contracts (gate the exit code — a stall is a >50ms frame = a visible hitch):
 *   - JS frame stalls in the measured window  == 0
 *   - UI frame stalls in the measured window  == 0
 *   - JS task-latency stalls in the window     == 0
 *
 * ADVISORY (reported as WARN, do NOT fail the gate — sub-60 windows with no
 * >50ms frame are minor smoothness dips, and avg/p95 are sensitive to a
 * contaminated run, e.g. results that never hydrate):
 *   - min avg fps (JS + UI)                     >= MIN_AVG_FPS (55)
 *   - min p95 fps (JS + UI)                     >= MIN_P95_FPS (45)
 *
 * Exits non-zero on a HARD violation so a sheet-motion hitch can't land
 * silently (the exact failure mode that let the toggle-strip cover regress).
 *
 *   node scripts/perf-scenario-sheet-drag-contract.js <report.json>
 *   yarn perf:scenario:sheet-drag-contract /tmp/sheet-drag-proof.json
 */

const fs = require('fs');

const MIN_AVG_FPS = 55;
const MIN_P95_FPS = 45;

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('usage: perf-scenario-sheet-drag-contract.js <report.json>');
  process.exit(2);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`[sheet-drag-contract] cannot read report: ${error.message}`);
  process.exit(2);
}

const range = report?.measuredRepeatLoop?.range;
if (!range || typeof range.startMs !== 'number' || typeof range.endMs !== 'number') {
  console.error(
    '[sheet-drag-contract] report has no measuredRepeatLoop.range — the flow must mark measured_repeat_loop_start/end'
  );
  process.exit(2);
}

const logPath = report.logPath;
if (!logPath || !fs.existsSync(logPath)) {
  console.error(`[sheet-drag-contract] log not found at report.logPath: ${logPath}`);
  process.exit(2);
}

const CHANNELS = {
  JsFrameSampler: { event: 'window', label: 'JS frame' },
  UiFrameSampler: { event: 'window', label: 'UI frame' },
  JsTaskLatencySampler: { event: 'task_window', label: 'JS task' },
};

// Parse every sampler window line and keep those whose nowMs falls in the
// measured drag window.
const windowsByChannel = { JsFrameSampler: [], UiFrameSampler: [], JsTaskLatencySampler: [] };
const logLines = fs.readFileSync(logPath, 'utf8').split('\n');
for (const line of logLines) {
  for (const channel of Object.keys(CHANNELS)) {
    const marker = `[SearchPerf][${channel}]`;
    const idx = line.indexOf(marker);
    if (idx === -1) continue;
    const jsonStart = line.indexOf('{', idx);
    if (jsonStart === -1) continue;
    let payload;
    try {
      payload = JSON.parse(line.slice(jsonStart));
    } catch {
      continue;
    }
    if (payload.event !== CHANNELS[channel].event) continue;
    if (typeof payload.nowMs !== 'number') continue;
    if (payload.nowMs < range.startMs || payload.nowMs > range.endMs) continue;
    windowsByChannel[channel].push(payload);
  }
}

const results = [];
const pass = (contract, detail) => results.push({ contract, status: 'PASS', detail });
const fail = (contract, detail) => results.push({ contract, status: 'FAIL', detail });
const warn = (contract, detail) => results.push({ contract, status: 'WARN', detail });
const skip = (contract, detail) => results.push({ contract, status: 'SKIP', detail });

for (const [channel, meta] of Object.entries(CHANNELS)) {
  const windows = windowsByChannel[channel];
  const stallContract = `${meta.label}.measured_window_stalls==0`;
  if (windows.length === 0) {
    skip(stallContract, `no ${channel} windows in the measured drag window`);
    continue;
  }
  const totalStalls = windows.reduce((sum, w) => sum + (Number(w.stallCount) || 0), 0);
  if (totalStalls > 0) {
    const worst = windows.reduce((a, b) =>
      (Number(b.stallLongestMs) || 0) > (Number(a.stallLongestMs) || 0) ? b : a
    );
    fail(
      stallContract,
      `${totalStalls} stall(s) across ${windows.length} ${channel} windows during sheet drag (longest ${worst.stallLongestMs}ms)`
    );
  } else {
    pass(stallContract, `0 stalls across ${windows.length} ${channel} windows during sheet drag`);
  }

  // FPS floor only applies to the frame samplers (task latency has no fps).
  if (channel === 'JsTaskLatencySampler') continue;
  const avgContract = `${meta.label}.measured_window_avgFps>=${MIN_AVG_FPS}`;
  const minAvg = Math.min(...windows.map((w) => Number(w.avgFps) ?? 0));
  if (minAvg < MIN_AVG_FPS) {
    warn(
      avgContract,
      `min avgFps ${minAvg.toFixed(1)} during the window (advisory; target >= ${MIN_AVG_FPS})`
    );
  } else {
    pass(avgContract, `min avgFps ${minAvg.toFixed(1)} across the drag window`);
  }
  const p95Contract = `${meta.label}.measured_window_p95Fps>=${MIN_P95_FPS}`;
  const minP95 = Math.min(...windows.map((w) => Number(w.p95Fps) ?? 0));
  if (minP95 < MIN_P95_FPS) {
    warn(
      p95Contract,
      `min p95Fps ${minP95.toFixed(1)} during the window (advisory; target >= ${MIN_P95_FPS})`
    );
  } else {
    pass(p95Contract, `min p95Fps ${minP95.toFixed(1)} across the drag window`);
  }
}

const failed = results.filter((r) => r.status === 'FAIL');
const warned = results.filter((r) => r.status === 'WARN');
const windowMs = range.endMs - range.startMs;
console.log(
  `\n[sheet-drag-contract] ${report.scenarioName} — measured window ${windowMs.toFixed(0)}ms`
);
if (windowMs > 30000) {
  console.log(
    `  ⚠ measured window is ${(windowMs / 1000).toFixed(0)}s — far longer than a clean ~13s drag loop. Likely a contaminated run (results never hydrated); fps advisories below may reflect that, not the drag.`
  );
}
const TAG = { PASS: '✓', FAIL: '✗', WARN: '⚠', SKIP: '–' };
for (const r of results) {
  console.log(`  ${TAG[r.status]} ${r.status}  ${r.contract} — ${r.detail}`);
}
console.log(
  `\n[sheet-drag-contract] ${results.filter((r) => r.status === 'PASS').length} pass, ${failed.length} fail (hard), ${warned.length} warn, ${results.filter((r) => r.status === 'SKIP').length} skip`
);

process.exit(failed.length > 0 ? 1 : 0);
