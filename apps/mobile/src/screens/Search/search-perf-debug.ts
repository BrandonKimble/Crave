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

const isDevEnvironment = __DEV__;
const perfLogsEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_PERF_DEBUG_ENABLED'], false)
  : false;
const overlayLogsEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_OVERLAY_DEBUG_ENABLED'], false)
  : false;
const searchResponsePayloadEnabled = isDevEnvironment
  ? resolveEnvFlag(['SEARCH_LOG_RESPONSE_PAYLOAD_ENABLED'], true)
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
  logSuggestionOverlayState: overlayLogsEnabled,
  logSearchResponsePayload: searchResponsePayloadEnabled,
  logSearchResponseTimings: perfLogsEnabled,
  logSearchResponseTimingMinMs: isDevEnvironment ? 0 : 5,
};

export type { SearchPerfDebugFlags };
export default searchPerfDebug;
