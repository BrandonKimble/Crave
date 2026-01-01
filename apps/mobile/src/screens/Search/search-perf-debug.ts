type SearchPerfDebugFlags = {
  enabled: boolean;
  disableBlur: boolean;
  disableMarkerViews: boolean;
  disableTopFoodMeasurement: boolean;
  usePlaceholderRows: boolean;
  logCommitInfo: boolean;
  logCommitMinMs: number;
};

// Dev-only perf toggles; flip `enabled` to true to apply.
const searchPerfDebug: SearchPerfDebugFlags = __DEV__
  ? {
      enabled: true,
      disableBlur: false,
      disableMarkerViews: false,
      disableTopFoodMeasurement: false,
      usePlaceholderRows: false,
      logCommitInfo: true,
      logCommitMinMs: 5,
    }
  : {
      enabled: false,
      disableBlur: false,
      disableMarkerViews: false,
      disableTopFoodMeasurement: false,
      usePlaceholderRows: false,
      logCommitInfo: false,
      logCommitMinMs: 8,
    };

export type { SearchPerfDebugFlags };
export default searchPerfDebug;
