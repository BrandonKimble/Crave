type SearchPerfDebugFlags = {
  enabled: boolean;
  logSearchComputes: boolean;
  logSearchComputeMinMs: number;
  logTopFoodMeasurement: boolean;
  logTopFoodMeasurementMinMs: number;
  logSearchStateChanges: boolean;
};

const isDevEnvironment = __DEV__;

// =============================================================================
// HOT-TOGGLEABLE DEBUG FLAGS
// Flip these to true/false and save - hot reload will pick up the change.
// All flags are disabled in production regardless of values here.
//
// F2300: EVERY FIELD BELOW MUST HAVE A READER. 22 fields once lived here whose
// only occurrence in the whole repo was this file — a developer could flip
// `disableMarkerViews`, see no change, and conclude markers were not the cost.
// A flag with no reader is not a flag, it is a comment that type-checks. If you
// add a field here, add the read in the same change.
// =============================================================================

const DEV_FLAGS = {
  // Master toggle for perf logging (search computes, top-food measurement,
  // search state changes).
  perfLogsEnabled: false,
};

// F1036(d): a PROD_THRESHOLDS branch used to sit here selected by
// `isDevEnvironment ? DEV_THRESHOLDS : PROD_THRESHOLDS`, dressed up as production telemetry
// config. It was never reachable: both consumer flags that gate a read of these thresholds
// (logSearchComputes, logTopFoodMeasurement) are themselves `isDevEnvironment &&
// DEV_FLAGS...`, so in a production build the threshold is never consulted — confirmed by
// reading both consumers (use-search-runtime-instrumentation-runtime.ts,
// use-top-food-measurement.ts), which both gate on `searchPerfDebug.enabled` (dev-only)
// before reading a *MinMs field. Deleted the dead prod branch rather than leave a guard
// that can never fail.
// F2300 correction: this comment previously also credited logCommitInfo, logJsStalls and
// logSearchResponseTimings as consumers — none of the three had a reader anywhere in the
// repo. Only consumers that exist are named now.
// Timing thresholds (ms) — dev-only; production never reads these.
const thresholds = {
  logSearchComputeMinMs: 8,
  logTopFoodMeasurementMinMs: 8,
};

const searchPerfDebug: SearchPerfDebugFlags = {
  enabled: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
  logSearchComputes: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
  logSearchComputeMinMs: thresholds.logSearchComputeMinMs,
  logTopFoodMeasurement: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
  logTopFoodMeasurementMinMs: thresholds.logTopFoodMeasurementMinMs,
  logSearchStateChanges: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
};

export type { SearchPerfDebugFlags };
export default searchPerfDebug;
