type SearchPerfDebugFlags = {
  enabled: boolean;
  disableBlur: boolean;
  disableMarkerViews: boolean;
  disableTopFoodMeasurement: boolean;
  usePlaceholderRows: boolean;
  disableFiltersHeader: boolean;
  disableResultsHeader: boolean;
  disableSearchShortcuts: boolean;
  deferBestHereUi: boolean;
  logCommitInfo: boolean;
  logCommitMinMs: number;
  logJsStalls: boolean;
  logJsStallMinMs: number;
  logMapEventRates: boolean;
  logMapEventIntervalMs: number;
  logSearchComputes: boolean;
  logSearchComputeMinMs: number;
  logTopFoodMeasurement: boolean;
  logTopFoodMeasurementMinMs: number;
  logSearchStateChanges: boolean;
  logSearchStateWhenSettlingOnly: boolean;
  logSuggestionOverlayState: boolean;
  logSearchResponsePayload: boolean;
  logSearchResponseTimings: boolean;
  logSearchResponseTimingMinMs: number;
  logResultsViewability: boolean;
};

const isDevEnvironment = __DEV__;

// =============================================================================
// HOT-TOGGLEABLE DEBUG FLAGS
// Flip these to true/false and save - hot reload will pick up the change.
// All flags are disabled in production regardless of values here.
// =============================================================================

const DEV_FLAGS = {
  // Master toggle for perf logging (commit info, js stalls, map events, etc.)
  perfLogsEnabled: true,
  // Overlay state logging
  overlayLogsEnabled: false,
  // Log full search response payloads
  logResponsePayload: false,
  // Disable marker views for perf testing
  disableMarkerViews: false,
  // Disable top food measurement
  disableTopFoodMeasurement: false,
  // Use placeholder rows
  usePlaceholderRows: false,
  // Disable filters header
  disableFiltersHeader: false,
  // Disable results header
  disableResultsHeader: false,
  // Disable search shortcuts
  disableSearchShortcuts: false,
  // Defer best here UI
  deferBestHereUi: false,
  // Log results viewability
  logResultsViewability: false,
};

// Timing thresholds (ms)
const DEV_THRESHOLDS = {
  logCommitMinMs: 20,
  logJsStallMinMs: 40,
  logSearchComputeMinMs: 8,
  logTopFoodMeasurementMinMs: 8,
  logSearchResponseTimingMinMs: 20,
};

const PROD_THRESHOLDS = {
  logCommitMinMs: 8,
  logJsStallMinMs: 32,
  logSearchComputeMinMs: 8,
  logTopFoodMeasurementMinMs: 8,
  logSearchResponseTimingMinMs: 5,
};

// =============================================================================

const thresholds = isDevEnvironment ? DEV_THRESHOLDS : PROD_THRESHOLDS;

const searchPerfDebug: SearchPerfDebugFlags = {
  enabled: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
  disableBlur: false,
  disableMarkerViews: isDevEnvironment && DEV_FLAGS.disableMarkerViews,
  disableTopFoodMeasurement: isDevEnvironment && DEV_FLAGS.disableTopFoodMeasurement,
  usePlaceholderRows: isDevEnvironment && DEV_FLAGS.usePlaceholderRows,
  disableFiltersHeader: isDevEnvironment && DEV_FLAGS.disableFiltersHeader,
  disableResultsHeader: isDevEnvironment && DEV_FLAGS.disableResultsHeader,
  disableSearchShortcuts: isDevEnvironment && DEV_FLAGS.disableSearchShortcuts,
  deferBestHereUi: isDevEnvironment && DEV_FLAGS.deferBestHereUi,
  logCommitInfo: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
  logCommitMinMs: thresholds.logCommitMinMs,
  logJsStalls: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
  logJsStallMinMs: thresholds.logJsStallMinMs,
  logMapEventRates: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
  logMapEventIntervalMs: 1000,
  logSearchComputes: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
  logSearchComputeMinMs: thresholds.logSearchComputeMinMs,
  logTopFoodMeasurement: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
  logTopFoodMeasurementMinMs: thresholds.logTopFoodMeasurementMinMs,
  logSearchStateChanges: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
  logSearchStateWhenSettlingOnly: !isDevEnvironment,
  logSuggestionOverlayState: isDevEnvironment && DEV_FLAGS.overlayLogsEnabled,
  logSearchResponsePayload: isDevEnvironment && DEV_FLAGS.logResponsePayload,
  logSearchResponseTimings: isDevEnvironment && DEV_FLAGS.perfLogsEnabled,
  logSearchResponseTimingMinMs: thresholds.logSearchResponseTimingMinMs,
  logResultsViewability: isDevEnvironment && DEV_FLAGS.logResultsViewability,
};

export type { SearchPerfDebugFlags };
export default searchPerfDebug;
