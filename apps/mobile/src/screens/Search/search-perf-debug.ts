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
};

const parseEnvBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return undefined;
};

const resolveEnvFlag = (key: string, fallback: boolean): boolean => {
  const value = parseEnvBoolean(process.env[key]);
  return value ?? fallback;
};

const isDevEnvironment = __DEV__;
const perfLogsEnabled = isDevEnvironment
  ? resolveEnvFlag('EXPO_PUBLIC_SEARCH_PERF_LOGS', true)
  : false;
const logSearchResponsePayload = isDevEnvironment
  ? resolveEnvFlag('EXPO_PUBLIC_SEARCH_LOG_RESPONSE_PAYLOAD', true)
  : false;

// Dev-only perf toggles; flip env vars to enable logging.
const searchPerfDebug: SearchPerfDebugFlags = {
  enabled: perfLogsEnabled,
  disableBlur: false,
  disableMarkerViews: false,
  disableTopFoodMeasurement: false,
  usePlaceholderRows: false,
  disableFiltersHeader: false,
  disableResultsHeader: false,
  disableSearchShortcuts: false,
  deferBestHereUi: false,
  logCommitInfo: perfLogsEnabled,
  logCommitMinMs: isDevEnvironment ? 5 : 8,
  logJsStalls: perfLogsEnabled,
  logJsStallMinMs: isDevEnvironment ? 20 : 32,
  logMapEventRates: perfLogsEnabled,
  logMapEventIntervalMs: 1000,
  logSearchComputes: perfLogsEnabled,
  logSearchComputeMinMs: isDevEnvironment ? 0 : 8,
  logTopFoodMeasurement: perfLogsEnabled,
  logTopFoodMeasurementMinMs: isDevEnvironment ? 1 : 8,
  logSearchStateChanges: perfLogsEnabled,
  logSearchStateWhenSettlingOnly: !isDevEnvironment,
  logSuggestionOverlayState: perfLogsEnabled,
  logSearchResponsePayload,
  logSearchResponseTimings: perfLogsEnabled,
  logSearchResponseTimingMinMs: isDevEnvironment ? 0 : 5,
};

export type { SearchPerfDebugFlags };
export default searchPerfDebug;
