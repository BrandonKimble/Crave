import Constants from 'expo-constants';

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

const parseEnvBoolean = (value?: string | boolean): boolean | undefined => {
  if (value == null) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return undefined;
};

const parseEnvNumber = (value?: string | boolean): number | undefined => {
  if (value == null || typeof value === 'boolean') {
    return undefined;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getExtraValue = (key: string): string | boolean | undefined => {
  const extra =
    Constants.expoConfig?.extra ??
    (Constants.manifest2 as { extra?: Record<string, unknown> } | undefined)?.extra ??
    (Constants.manifest as { extra?: Record<string, unknown> } | undefined)?.extra;
  if (!extra || typeof extra !== 'object') {
    return undefined;
  }
  const value = (extra as Record<string, unknown>)[key];
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  return undefined;
};

const getEnvValue = (key: string): string | boolean | undefined => {
  if (typeof process !== 'undefined' && process.env && key in process.env) {
    const value = process.env[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return getExtraValue(key);
};

const resolveEnvFlag = (keys: string[], fallback: boolean): boolean => {
  for (const key of keys) {
    const value = parseEnvBoolean(getEnvValue(key));
    if (value !== undefined) {
      return value;
    }
  }
  return fallback;
};

const resolveEnvNumber = (keys: string[], fallback: number): number => {
  for (const key of keys) {
    const value = parseEnvNumber(getEnvValue(key));
    if (value !== undefined) {
      return value;
    }
  }
  return fallback;
};

const isDevEnvironment = __DEV__;
const perfLogsEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_PERF_DEBUG_ENABLED'], false)
  : false;
const overlayLogsEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_OVERLAY_DEBUG_ENABLED'], false)
  : false;
const searchResponsePayloadEnabled = isDevEnvironment
  ? resolveEnvFlag(
      ['EXPO_PUBLIC_SEARCH_LOG_RESPONSE_PAYLOAD', 'SEARCH_LOG_RESPONSE_PAYLOAD_ENABLED'],
      false
    )
  : false;
const disableMarkerViewsEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_PERF_DISABLE_MARKER_VIEWS'], false)
  : false;
const disableTopFoodMeasurementEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_PERF_DISABLE_TOP_FOOD_MEASUREMENT'], false)
  : false;
const usePlaceholderRowsEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_PERF_USE_PLACEHOLDER_ROWS'], false)
  : false;
const disableFiltersHeaderEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_PERF_DISABLE_FILTERS_HEADER'], false)
  : false;
const disableResultsHeaderEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_PERF_DISABLE_RESULTS_HEADER'], false)
  : false;
const disableSearchShortcutsEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_PERF_DISABLE_SEARCH_SHORTCUTS'], false)
  : false;
const deferBestHereUiEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_PERF_DEFER_BEST_HERE_UI'], false)
  : false;
const logResultsViewabilityEnabled = isDevEnvironment
  ? resolveEnvFlag(
      ['SEARCH_PERF_LOG_RESULTS_VIEWABILITY', 'SEARCH_PERF_LOG_RESULTS_BLANK_AREA'],
      false
    )
  : false;
const logCommitMinMs = resolveEnvNumber(
  ['SEARCH_PERF_LOG_COMMIT_MIN_MS'],
  isDevEnvironment ? 20 : 8
);
const logJsStallMinMs = resolveEnvNumber(
  ['SEARCH_PERF_LOG_JS_STALL_MIN_MS'],
  isDevEnvironment ? 40 : 32
);
const logSearchComputeMinMs = resolveEnvNumber(
  ['SEARCH_PERF_LOG_SEARCH_COMPUTE_MIN_MS'],
  isDevEnvironment ? 8 : 8
);
const logTopFoodMeasurementMinMs = resolveEnvNumber(
  ['SEARCH_PERF_LOG_TOP_FOOD_MIN_MS'],
  isDevEnvironment ? 8 : 8
);
const logSearchResponseTimingMinMs = resolveEnvNumber(
  ['SEARCH_PERF_LOG_RESPONSE_TIMING_MIN_MS'],
  isDevEnvironment ? 20 : 5
);

// Dev-only perf toggles; flip env vars to enable logging.
const searchPerfDebug: SearchPerfDebugFlags = {
  enabled: perfLogsEnabled,
  disableBlur: false,
  disableMarkerViews: disableMarkerViewsEnabled,
  disableTopFoodMeasurement: disableTopFoodMeasurementEnabled,
  usePlaceholderRows: usePlaceholderRowsEnabled,
  disableFiltersHeader: disableFiltersHeaderEnabled,
  disableResultsHeader: disableResultsHeaderEnabled,
  disableSearchShortcuts: disableSearchShortcutsEnabled,
  deferBestHereUi: deferBestHereUiEnabled,
  logCommitInfo: perfLogsEnabled,
  logCommitMinMs,
  logJsStalls: perfLogsEnabled,
  logJsStallMinMs,
  logMapEventRates: perfLogsEnabled,
  logMapEventIntervalMs: 1000,
  logSearchComputes: perfLogsEnabled,
  logSearchComputeMinMs,
  logTopFoodMeasurement: perfLogsEnabled,
  logTopFoodMeasurementMinMs,
  logSearchStateChanges: perfLogsEnabled,
  logSearchStateWhenSettlingOnly: !isDevEnvironment,
  logSuggestionOverlayState: overlayLogsEnabled,
  logSearchResponsePayload: searchResponsePayloadEnabled,
  logSearchResponseTimings: perfLogsEnabled,
  logSearchResponseTimingMinMs,
  logResultsViewability: logResultsViewabilityEnabled,
};

export type { SearchPerfDebugFlags };
export default searchPerfDebug;
