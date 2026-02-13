#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/ci-compare-perf-reports.sh <baseline_json> <candidate_json>

Environment overrides:
  PERF_FLOOR_MAX_REGRESSION            default: 0.30
  PERF_STALL_P95_MAX_REGRESSION_PCT    default: 10
  PERF_UI_FLOOR_MAX_REGRESSION         default: 0.30
  PERF_UI_STALL_P95_MAX_REGRESSION_PCT default: 10
  PERF_CATASTROPHIC_FRAME_MS           default: 300
  PERF_CATASTROPHIC_RUN_FRACTION       default: 0.6666666667
  PERF_MIN_RUNS                        default: 3
  PERF_REPORT_SCHEMA_VERSION           default: perf-shortcut-report.v1
USAGE
}

if [[ $# -ne 2 ]]; then
  usage >&2
  exit 1
fi

BASELINE_JSON="$1"
CANDIDATE_JSON="$2"

if [[ ! -f "$BASELINE_JSON" ]]; then
  echo "Baseline report not found: $BASELINE_JSON" >&2
  exit 1
fi
if [[ ! -f "$CANDIDATE_JSON" ]]; then
  echo "Candidate report not found: $CANDIDATE_JSON" >&2
  exit 1
fi

node - "$BASELINE_JSON" "$CANDIDATE_JSON" <<'NODE'
const fs = require('fs');

const baselinePath = process.argv[2];
const candidatePath = process.argv[3];

const floorMaxRegression = Number.parseFloat(process.env.PERF_FLOOR_MAX_REGRESSION || '0.30');
const stallP95MaxRegressionPct = Number.parseFloat(
  process.env.PERF_STALL_P95_MAX_REGRESSION_PCT || '10'
);
const uiFloorMaxRegression = Number.parseFloat(
  process.env.PERF_UI_FLOOR_MAX_REGRESSION || '0.30'
);
const uiStallP95MaxRegressionPct = Number.parseFloat(
  process.env.PERF_UI_STALL_P95_MAX_REGRESSION_PCT || '10'
);
const catastrophicFrameMs = Number.parseFloat(process.env.PERF_CATASTROPHIC_FRAME_MS || '300');
const catastrophicRunFraction = Number.parseFloat(
  process.env.PERF_CATASTROPHIC_RUN_FRACTION || '0.6666666667'
);
const minRuns = Number.parseInt(process.env.PERF_MIN_RUNS || '3', 10);
const expectedSchemaVersion = process.env.PERF_REPORT_SCHEMA_VERSION || 'perf-shortcut-report.v1';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const safeNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const safeString = (value) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const toPercentDelta = (baselineValue, candidateValue) => {
  if (baselineValue == null || candidateValue == null) {
    return null;
  }
  if (baselineValue <= 0) {
    return candidateValue > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return ((candidateValue - baselineValue) / baselineValue) * 100;
};

const readExpectedRuns = (report) =>
  safeNumber(report?.runCountExpected) ?? safeNumber(report?.markerIntegrity?.expectedRuns);

const readCompletedRuns = (report) => {
  const completed = safeNumber(report?.runCountCompleted);
  if (completed != null) {
    return completed;
  }
  if (Array.isArray(report?.markerIntegrity?.completedRuns)) {
    return report.markerIntegrity.completedRuns.length;
  }
  return null;
};

const readCatRunCount = (report, key) => {
  const runCount = safeNumber(report?.[key]?.runCount);
  if (runCount != null) {
    return runCount;
  }
  if (Array.isArray(report?.[key]?.runNumbers)) {
    return report[key].runNumbers.length;
  }
  return 0;
};

const failures = [];
const baseline = readJson(baselinePath);
const candidate = readJson(candidatePath);

const requireValidBound = (value, envName, min, maxInclusive) => {
  if (!Number.isFinite(value) || value < min || value > maxInclusive) {
    failures.push(`Invalid ${envName} value: ${String(value)}.`);
  }
};

requireValidBound(floorMaxRegression, 'PERF_FLOOR_MAX_REGRESSION', 0, Number.POSITIVE_INFINITY);
requireValidBound(
  stallP95MaxRegressionPct,
  'PERF_STALL_P95_MAX_REGRESSION_PCT',
  0,
  Number.POSITIVE_INFINITY
);
requireValidBound(uiFloorMaxRegression, 'PERF_UI_FLOOR_MAX_REGRESSION', 0, Number.POSITIVE_INFINITY);
requireValidBound(
  uiStallP95MaxRegressionPct,
  'PERF_UI_STALL_P95_MAX_REGRESSION_PCT',
  0,
  Number.POSITIVE_INFINITY
);
requireValidBound(catastrophicFrameMs, 'PERF_CATASTROPHIC_FRAME_MS', 1, Number.POSITIVE_INFINITY);
requireValidBound(catastrophicRunFraction, 'PERF_CATASTROPHIC_RUN_FRACTION', 0.000000001, 1);
if (!Number.isInteger(minRuns) || minRuns < 1) {
  failures.push(`Invalid PERF_MIN_RUNS value: ${String(minRuns)}.`);
}

const baselineSchemaVersion = safeString(baseline?.schemaVersion);
const candidateSchemaVersion = safeString(candidate?.schemaVersion);
if (baselineSchemaVersion == null) {
  failures.push('Baseline report is missing schemaVersion.');
}
if (candidateSchemaVersion == null) {
  failures.push('Candidate report is missing schemaVersion.');
}
if (
  baselineSchemaVersion != null &&
  candidateSchemaVersion != null &&
  baselineSchemaVersion !== candidateSchemaVersion
) {
  failures.push(
    `Schema mismatch: baseline=${baselineSchemaVersion} candidate=${candidateSchemaVersion}.`
  );
}
if (
  baselineSchemaVersion != null &&
  candidateSchemaVersion != null &&
  (baselineSchemaVersion !== expectedSchemaVersion || candidateSchemaVersion !== expectedSchemaVersion)
) {
  failures.push(
    `Unexpected schemaVersion: expected=${expectedSchemaVersion} baseline=${baselineSchemaVersion} candidate=${candidateSchemaVersion}.`
  );
}

const baselineIntegrity = Boolean(baseline?.markerIntegrity?.complete);
const candidateIntegrity = Boolean(candidate?.markerIntegrity?.complete);
if (!baselineIntegrity) {
  failures.push('Baseline marker integrity is incomplete.');
}
if (!candidateIntegrity) {
  failures.push('Candidate marker integrity is incomplete.');
}

const baselineExpectedRuns = readExpectedRuns(baseline);
const candidateExpectedRuns = readExpectedRuns(candidate);
const baselineCompletedRuns = readCompletedRuns(baseline);
const candidateCompletedRuns = readCompletedRuns(candidate);
if (baselineExpectedRuns == null || baselineExpectedRuns < minRuns) {
  failures.push(
    `Baseline runCountExpected=${String(
      baselineExpectedRuns
    )} is below required minimum ${minRuns}.`
  );
}
if (candidateExpectedRuns == null || candidateExpectedRuns < minRuns) {
  failures.push(
    `Candidate runCountExpected=${String(
      candidateExpectedRuns
    )} is below required minimum ${minRuns}.`
  );
}
if (baselineCompletedRuns == null || baselineCompletedRuns < minRuns) {
  failures.push(
    `Baseline runCountCompleted=${String(
      baselineCompletedRuns
    )} is below required minimum ${minRuns}.`
  );
}
if (candidateCompletedRuns == null || candidateCompletedRuns < minRuns) {
  failures.push(
    `Candidate runCountCompleted=${String(
      candidateCompletedRuns
    )} is below required minimum ${minRuns}.`
  );
}
if (
  baselineCompletedRuns != null &&
  baselineExpectedRuns != null &&
  baselineCompletedRuns < baselineExpectedRuns
) {
  failures.push(
    `Baseline runCountCompleted=${baselineCompletedRuns} is below runCountExpected=${baselineExpectedRuns}.`
  );
}
if (
  candidateCompletedRuns != null &&
  candidateExpectedRuns != null &&
  candidateCompletedRuns < candidateExpectedRuns
) {
  failures.push(
    `Candidate runCountCompleted=${candidateCompletedRuns} is below runCountExpected=${candidateExpectedRuns}.`
  );
}

const baselineSignatureStable = safeString(baseline?.harnessSignatureStable);
const candidateSignatureStable = safeString(candidate?.harnessSignatureStable);
if (baselineSignatureStable == null) {
  failures.push('Baseline harnessSignatureStable is missing.');
}
if (candidateSignatureStable == null) {
  failures.push('Candidate harnessSignatureStable is missing.');
}
if (
  baselineSignatureStable != null &&
  candidateSignatureStable != null &&
  baselineSignatureStable !== candidateSignatureStable
) {
  failures.push('Harness signature mismatch between baseline and candidate.');
}

const compareRequiredEnvironmentString = (field, label) => {
  const baselineValue = safeString(baseline?.environment?.[field]);
  const candidateValue = safeString(candidate?.environment?.[field]);
  if (baselineValue == null) {
    failures.push(`Baseline environment.${field} is missing.`);
  }
  if (candidateValue == null) {
    failures.push(`Candidate environment.${field} is missing.`);
  }
  if (baselineValue != null && candidateValue != null && baselineValue !== candidateValue) {
    failures.push(`${label} mismatch: baseline=${baselineValue} candidate=${candidateValue}.`);
  }
};

compareRequiredEnvironmentString('platform', 'Platform');
compareRequiredEnvironmentString('launchTargetMode', 'Launch target');
compareRequiredEnvironmentString('runtimeTarget', 'Runtime target');

const baselineLaunchPreferDevice = safeNumber(baseline?.environment?.launchPreferDevice);
const candidateLaunchPreferDevice = safeNumber(candidate?.environment?.launchPreferDevice);
if (baselineLaunchPreferDevice == null) {
  failures.push('Baseline environment.launchPreferDevice is missing.');
}
if (candidateLaunchPreferDevice == null) {
  failures.push('Candidate environment.launchPreferDevice is missing.');
}
if (
  baselineLaunchPreferDevice != null &&
  candidateLaunchPreferDevice != null &&
  baselineLaunchPreferDevice !== candidateLaunchPreferDevice
) {
  failures.push(
    `launchPreferDevice mismatch: baseline=${baselineLaunchPreferDevice} candidate=${candidateLaunchPreferDevice}.`
  );
}

const baselineFloor = safeNumber(baseline?.floorMean);
const candidateFloor = safeNumber(candidate?.floorMean);
if (baselineFloor == null) {
  failures.push('Baseline floorMean is missing.');
}
if (candidateFloor == null) {
  failures.push('Candidate floorMean is missing.');
}
const floorDelta =
  baselineFloor != null && candidateFloor != null ? candidateFloor - baselineFloor : null;
if (floorDelta != null && floorDelta < -floorMaxRegression) {
  failures.push(
    `floorMean regression ${floorDelta.toFixed(2)} exceeds allowed -${floorMaxRegression.toFixed(2)}.`
  );
}

const baselineStallP95 = safeNumber(baseline?.stallP95);
const candidateStallP95 = safeNumber(candidate?.stallP95);
if (baselineStallP95 == null) {
  failures.push('Baseline stallP95 is missing.');
}
if (candidateStallP95 == null) {
  failures.push('Candidate stallP95 is missing.');
}
const stallRegressionPct = toPercentDelta(baselineStallP95, candidateStallP95);
if (stallRegressionPct != null && stallRegressionPct > stallP95MaxRegressionPct) {
  const formatted = Number.isFinite(stallRegressionPct)
    ? `${stallRegressionPct.toFixed(2)}%`
    : 'infinite';
  failures.push(
    `stallP95 regression ${formatted} exceeds allowed ${stallP95MaxRegressionPct.toFixed(2)}%.`
  );
}

const baselineUiFloor = safeNumber(baseline?.uiFloorMean);
const candidateUiFloor = safeNumber(candidate?.uiFloorMean);
if (baselineUiFloor == null) {
  failures.push('Baseline uiFloorMean is missing.');
}
if (candidateUiFloor == null) {
  failures.push('Candidate uiFloorMean is missing.');
}
const uiFloorDelta =
  baselineUiFloor != null && candidateUiFloor != null ? candidateUiFloor - baselineUiFloor : null;
if (uiFloorDelta != null && uiFloorDelta < -uiFloorMaxRegression) {
  failures.push(
    `uiFloorMean regression ${uiFloorDelta.toFixed(2)} exceeds allowed -${uiFloorMaxRegression.toFixed(2)}.`
  );
}

const baselineUiStallP95 = safeNumber(baseline?.uiStallP95);
const candidateUiStallP95 = safeNumber(candidate?.uiStallP95);
if (baselineUiStallP95 == null) {
  failures.push('Baseline uiStallP95 is missing.');
}
if (candidateUiStallP95 == null) {
  failures.push('Candidate uiStallP95 is missing.');
}
const uiStallRegressionPct = toPercentDelta(baselineUiStallP95, candidateUiStallP95);
if (uiStallRegressionPct != null && uiStallRegressionPct > uiStallP95MaxRegressionPct) {
  const formatted = Number.isFinite(uiStallRegressionPct)
    ? `${uiStallRegressionPct.toFixed(2)}%`
    : 'infinite';
  failures.push(
    `uiStallP95 regression ${formatted} exceeds allowed ${uiStallP95MaxRegressionPct.toFixed(2)}%.`
  );
}

const baselineCatRuns = readCatRunCount(baseline, 'catastrophic');
const candidateCatRuns = readCatRunCount(candidate, 'catastrophic');
const baselineUiCatRuns = readCatRunCount(baseline, 'uiCatastrophic');
const candidateUiCatRuns = readCatRunCount(candidate, 'uiCatastrophic');

const candidateRunCountForCatastrophic = candidateCompletedRuns ?? candidateExpectedRuns;
const catastrophicRunThreshold =
  candidateRunCountForCatastrophic == null
    ? null
    : Math.max(1, Math.ceil(candidateRunCountForCatastrophic * catastrophicRunFraction - 1e-6));

if (catastrophicRunThreshold == null) {
  failures.push('Unable to compute catastrophic run threshold from candidate run counts.');
}
if (
  catastrophicRunThreshold != null &&
  candidateRunCountForCatastrophic != null &&
  candidateCatRuns >= catastrophicRunThreshold &&
  candidateCatRuns > 0
) {
  failures.push(
    `Catastrophic JS frame gate failed: candidate has ${candidateCatRuns}/${candidateRunCountForCatastrophic} runs > ${catastrophicFrameMs}ms (threshold ${catastrophicRunThreshold}).`
  );
}
if (
  catastrophicRunThreshold != null &&
  candidateRunCountForCatastrophic != null &&
  candidateUiCatRuns >= catastrophicRunThreshold &&
  candidateUiCatRuns > 0
) {
  failures.push(
    `Catastrophic UI frame gate failed: candidate has ${candidateUiCatRuns}/${candidateRunCountForCatastrophic} runs > ${catastrophicFrameMs}ms (threshold ${catastrophicRunThreshold}).`
  );
}

const summary = {
  baselinePath,
  candidatePath,
  thresholds: {
    floorMaxRegression,
    stallP95MaxRegressionPct,
    uiFloorMaxRegression,
    uiStallP95MaxRegressionPct,
    catastrophicFrameMs,
    catastrophicRunFraction,
    minRuns,
  },
  schema: {
    expectedSchemaVersion,
    baselineSchemaVersion,
    candidateSchemaVersion,
  },
  runCounts: {
    baselineExpectedRuns,
    baselineCompletedRuns,
    candidateExpectedRuns,
    candidateCompletedRuns,
    catastrophicRunThreshold,
  },
  metrics: {
    baseline: {
      harnessRunId: baseline?.harnessRunId ?? null,
      harnessSignatureStable: baselineSignatureStable,
      environment: baseline?.environment ?? null,
      floorMean: baselineFloor,
      stallP95: baselineStallP95,
      stallMaxMean: safeNumber(baseline?.stallMaxMean),
      uiFloorMean: baselineUiFloor,
      uiStallP95: baselineUiStallP95,
      uiStallMaxMean: safeNumber(baseline?.uiStallMaxMean),
      catastrophicRunCount: baselineCatRuns,
      uiCatastrophicRunCount: baselineUiCatRuns,
      markerIntegrityComplete: baselineIntegrity,
    },
    candidate: {
      harnessRunId: candidate?.harnessRunId ?? null,
      harnessSignatureStable: candidateSignatureStable,
      environment: candidate?.environment ?? null,
      floorMean: candidateFloor,
      stallP95: candidateStallP95,
      stallMaxMean: safeNumber(candidate?.stallMaxMean),
      uiFloorMean: candidateUiFloor,
      uiStallP95: candidateUiStallP95,
      uiStallMaxMean: safeNumber(candidate?.uiStallMaxMean),
      catastrophicRunCount: candidateCatRuns,
      uiCatastrophicRunCount: candidateUiCatRuns,
      markerIntegrityComplete: candidateIntegrity,
    },
    deltas: {
      floorMean: floorDelta,
      stallP95Pct: stallRegressionPct,
      uiFloorMean: uiFloorDelta,
      uiStallP95Pct: uiStallRegressionPct,
    },
  },
  pass: failures.length === 0,
  failures,
};

process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
process.exit(failures.length === 0 ? 0 : 1);
NODE
