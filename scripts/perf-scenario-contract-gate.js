#!/usr/bin/env node

// Core Crave map LOD acceptance-contract GATE.
//
// The v4 plan (plans/map-lod-ideal-model-v4.md, "Acceptance contracts") lists
// invariants that the app emits as `logPerfScenarioAttributionEvent(...)`
// telemetry. Those events report; nothing FAILS on a violation. This script
// turns the CORE subset of those contracts into an enforced gate: it parses a
// perf-scenario run (a report JSON or a raw log), asserts the contracts, prints
// a PASS / FAIL / SKIP line per contract, and EXITS NON-ZERO if any contract is
// violated.
//
// It is read-only over run artifacts. It does NOT touch app/native runtime code.
//
// Enforced contracts (see plan "Acceptance contracts" section):
//   1. native_live_lod_transition_contract.flashReversalCount == 0
//        (no pin reversed mid-fade — the "fade out -> flash full -> out" blink).
//   2. lod_membership_churn_contract: zero pinRemoved/dotRemoved while the camera
//        is moving (now that natural + shortcut search are resident, viewport
//        pan/zoom must not drop markers from the source — invariant 1).
//
// A contract whose event never appears in the run (the scenario didn't exercise
// it) is reported as SKIP, not FAIL, so a narrowly-scoped scenario does not
// false-fail the gate.
//
// Usage:
//   node scripts/perf-scenario-contract-gate.js <report.json | run.log>
//   node scripts/perf-scenario-contract-gate.js <report.json> --log <run.log>
//
// When given a perf-scenario report JSON, the log is taken from the report's
// `logPath` field (override with --log). A raw `.log`/`.txt` input is parsed
// directly.

const fs = require('fs');
const path = require('path');

const usage = () => {
  console.error(
    'Usage: scripts/perf-scenario-contract-gate.js <report.json | run.log> [--log <run.log>]'
  );
};

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  usage();
  process.exit(0);
}

let inputPath = null;
let logPathOverride = null;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--log') {
    logPathOverride = args[index + 1] ?? null;
    index += 1;
    continue;
  }
  if (inputPath == null) {
    inputPath = arg;
    continue;
  }
  console.error(`Unknown argument: ${arg}`);
  usage();
  process.exit(2);
}

if (!inputPath) {
  usage();
  process.exit(2);
}

const resolvedInputPath = path.resolve(inputPath);
if (!fs.existsSync(resolvedInputPath)) {
  console.error(`Input not found: ${resolvedInputPath}`);
  process.exit(2);
}

// Resolve the raw run log we will parse contract events from. The perf-scenario
// report JSON does not embed every VisualReadiness event, so the contracts are
// read straight from the log lines (same line shape the report/parity scripts
// parse).
const resolveLogPath = () => {
  if (logPathOverride) {
    return path.resolve(logPathOverride);
  }
  const extension = path.extname(resolvedInputPath).toLowerCase();
  if (extension === '.json') {
    let report;
    try {
      report = JSON.parse(fs.readFileSync(resolvedInputPath, 'utf8'));
    } catch (error) {
      console.error(`Could not parse report JSON ${resolvedInputPath}: ${error.message}`);
      process.exit(2);
    }
    if (typeof report.logPath !== 'string' || report.logPath.length === 0) {
      console.error(
        `Report ${resolvedInputPath} has no logPath; pass the run log with --log <run.log>.`
      );
      process.exit(2);
    }
    return path.resolve(report.logPath);
  }
  // Treat any non-.json input as the raw log itself.
  return resolvedInputPath;
};

const logPath = resolveLogPath();
if (!fs.existsSync(logPath)) {
  console.error(`Run log not found: ${logPath}`);
  process.exit(2);
}

const numeric = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

// Parse [SearchPerf][VisualReadiness] {json} lines into events. This mirrors the
// line shape used by perf-scenario-report.js / perf-scenario-parity-contracts.js.
const readVisualReadinessEvents = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const events = [];
  content.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/\[SearchPerf\]\[VisualReadiness\]\s+(\{.*\})/);
    if (!match) {
      return;
    }
    try {
      events.push({ line: index + 1, ...JSON.parse(match[1]) });
    } catch {
      // Ignore malformed partial console lines from simulator logging.
    }
  });
  return events;
};

const visualEvents = readVisualReadinessEvents(logPath);
const byEvent = (eventName) => visualEvents.filter((event) => event.event === eventName);

const results = [];
const recordPass = (contract, detail) => results.push({ contract, status: 'PASS', detail });
const recordFail = (contract, detail) => results.push({ contract, status: 'FAIL', detail });
const recordSkip = (contract, detail) => results.push({ contract, status: 'SKIP', detail });

// ---------------------------------------------------------------------------
// Contract 1: native_live_lod_transition_contract.flashReversalCount == 0
// ---------------------------------------------------------------------------
{
  const contract = 'native_live_lod_transition_contract.flashReversalCount==0';
  const transitionEvents = byEvent('native_live_lod_transition_contract');
  if (transitionEvents.length === 0) {
    recordSkip(
      contract,
      'no native_live_lod_transition_contract events in run (scenario exercised no LOD crossfade)'
    );
  } else {
    const totalFlashReversals = transitionEvents.reduce(
      (sum, event) => sum + (numeric(event.flashReversalCount) ?? 0),
      0
    );
    const firstOffender = transitionEvents.find(
      (event) => (numeric(event.flashReversalCount) ?? 0) > 0
    );
    if (totalFlashReversals > 0) {
      recordFail(
        contract,
        `flashReversalCount totals ${totalFlashReversals} across ${transitionEvents.length} transition frames (a pin reversed mid-fade); first offending frame near line ${
          firstOffender?.line ?? 'n/a'
        }`
      );
    } else {
      recordPass(contract, `0 flash reversals across ${transitionEvents.length} transition frames`);
    }
  }
}

// ---------------------------------------------------------------------------
// Contract 2: lod_membership_churn_contract — zero source add/remove on camera
// motion. Now that natural + shortcut search are resident, a pan/zoom (camera
// motion, no data change) must not add or remove markers from the pin/dot
// sources. We gate on pinRemoved/dotRemoved (markers disappearing — the visible
// failure) AND pinAdded/dotAdded (membership churning back in) while isMapMoving.
// ---------------------------------------------------------------------------
{
  const contract = 'lod_membership_churn_contract.zero-source-churn-on-camera-motion';
  const churnEvents = byEvent('lod_membership_churn_contract');
  if (churnEvents.length === 0) {
    recordSkip(
      contract,
      'no lod_membership_churn_contract events in run (no publish exercised; e.g. no pan/zoom)'
    );
  } else {
    // Only CAMERA-DRIVEN publishes can violate invariant 1. A data republish
    // (churnReason "full"/"replace"/"initial"/"coverage"/"reset" — a new search,
    // coverage arrival, or result replacement) legitimately adds/removes markers and
    // is exempt even if it lands while the camera is still settling (isMapMoving=true).
    // The camera-motion publish reason is "viewport_lod"; assert only against those.
    const DATA_PUBLISH_REASONS = new Set([
      'full',
      'replace',
      'initial',
      'coverage',
      'reset',
      'data',
    ]);
    const movingChurnEvents = churnEvents.filter(
      (event) =>
        event.isMapMoving === true && !DATA_PUBLISH_REASONS.has(String(event.churnReason ?? ''))
    );
    if (movingChurnEvents.length === 0) {
      recordSkip(
        contract,
        `lod_membership_churn_contract emitted ${churnEvents.length} time(s) but none were a camera-driven publish with isMapMoving=true (only data republishes / settled publishes — nothing to assert invariant 1 against)`
      );
    } else {
      const offender = movingChurnEvents.find(
        (event) =>
          (numeric(event.pinRemoved) ?? 0) > 0 ||
          (numeric(event.dotRemoved) ?? 0) > 0 ||
          (numeric(event.pinAdded) ?? 0) > 0 ||
          (numeric(event.dotAdded) ?? 0) > 0
      );
      if (offender) {
        recordFail(
          contract,
          `source membership churned during camera motion at line ${offender.line}: ${JSON.stringify(
            {
              churnReason: offender.churnReason ?? null,
              pinAdded: offender.pinAdded ?? null,
              pinRemoved: offender.pinRemoved ?? null,
              dotAdded: offender.dotAdded ?? null,
              dotRemoved: offender.dotRemoved ?? null,
              vanishedFromBothFamilies: offender.vanishedFromBothFamilies ?? null,
            }
          )} — markers must stay resident on pan/zoom (invariant 1)`
        );
      } else {
        recordPass(
          contract,
          `zero pin/dot add or remove across ${movingChurnEvents.length} camera-motion publish event(s)`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Contract 3: reveal-no-hang — every reveal that STARTS must SETTLE, and the
// reveal-start deadlock guard must never have exhausted. The reveal-start gate
// (isActiveFrameLabelPlacementReady) can deadlock the whole reveal (pins+dots+labels
// share one opacity animation) at ~0 opacity = the "search hangs" symptom. This is the
// class of bug that JS-phase signals (chrome_ready) silently passed.
// ---------------------------------------------------------------------------
{
  const contract = 'reveal_no_hang.every-started-reveal-settles';
  const rawLog = fs.readFileSync(logPath, 'utf8');
  // (a) the reveal-start deadlock watchdog exhausted -> a confirmed hang.
  const deadlockHits = (rawLog.match(/reveal_start_deadlock_placement_uncommitted/g) || []).length;
  // (b) reveals that STARTED but never SETTLED (started-but-hung). These surface as
  // scenario_work_span lines with nativeEventType + frameGenerationId.
  const framesFor = (nativeEventType) => {
    const frames = new Set();
    const re = new RegExp(
      `"nativeEventType":"${nativeEventType}"[^\\n]*?"frameGenerationId":"([^"]+)"|"frameGenerationId":"([^"]+)"[^\\n]*?"nativeEventType":"${nativeEventType}"`,
      'g'
    );
    let m;
    while ((m = re.exec(rawLog)) !== null) {
      frames.add(m[1] ?? m[2]);
    }
    return frames;
  };
  const startedFrames = framesFor('presentation_enter_started');
  const settledFrames = framesFor('presentation_enter_settled');
  const orphanStarts = [...startedFrames].filter((frame) => !settledFrames.has(frame));
  if (startedFrames.size === 0 && deadlockHits === 0) {
    recordSkip(
      contract,
      'no reveal (presentation_enter_started) events in run — nothing to assert'
    );
  } else if (deadlockHits > 0) {
    recordFail(
      contract,
      `reveal-start deadlock watchdog exhausted ${deadlockHits} time(s) (reveal_start_deadlock_placement_uncommitted) — the reveal gate never opened = SEARCH HANG`
    );
  } else if (orphanStarts.length > 0) {
    recordFail(
      contract,
      `${orphanStarts.length} reveal(s) started but never settled (frames ${orphanStarts
        .slice(0, 5)
        .join(', ')}) — reveal hung after start`
    );
  } else {
    recordPass(
      contract,
      `all ${startedFrames.size} started reveals settled; 0 deadlock-watchdog exhaustions`
    );
  }
}

// ---------------------------------------------------------------------------
// Summary + exit
// ---------------------------------------------------------------------------
const failures = results.filter((result) => result.status === 'FAIL');
const skips = results.filter((result) => result.status === 'SKIP');
const passes = results.filter((result) => result.status === 'PASS');

console.log('Crave map LOD acceptance-contract gate');
console.log(`  log: ${logPath}`);
console.log(`  VisualReadiness events parsed: ${visualEvents.length}`);
console.log('');
for (const result of results) {
  console.log(`  [${result.status}] ${result.contract}`);
  console.log(`         ${result.detail}`);
}
console.log('');
console.log(
  `Summary: ${passes.length} PASS, ${failures.length} FAIL, ${skips.length} SKIP (of ${results.length} core contracts)`
);

if (failures.length > 0) {
  console.error(`\nGate FAILED: ${failures.length} contract violation(s).`);
  process.exit(1);
}

console.log('\nGate PASSED: no core contract violations.');
process.exit(0);
