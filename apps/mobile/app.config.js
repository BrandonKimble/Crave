const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const EXTRA_ENV_KEYS = [
  'SEARCH_PERF_DEBUG_ENABLED',
  'SEARCH_OVERLAY_DEBUG_ENABLED',
  'SEARCH_LOG_RESPONSE_PAYLOAD_ENABLED',
  'SEARCH_PERF_DISABLE_MARKER_VIEWS',
  'SEARCH_PERF_DISABLE_TOP_FOOD_MEASUREMENT',
  'SEARCH_PERF_USE_PLACEHOLDER_ROWS',
  'SEARCH_PERF_DISABLE_FILTERS_HEADER',
  'SEARCH_PERF_DISABLE_RESULTS_HEADER',
  'SEARCH_PERF_DISABLE_SEARCH_SHORTCUTS',
  'SEARCH_PERF_DEFER_BEST_HERE_UI',
  'SEARCH_PERF_LOG_RESULTS_VIEWABILITY',
  'SEARCH_PERF_LOG_RESULTS_BLANK_AREA',
  'SEARCH_PERF_LOG_COMMIT_MIN_MS',
  'SEARCH_PERF_LOG_JS_STALL_MIN_MS',
  'SEARCH_PERF_LOG_SEARCH_COMPUTE_MIN_MS',
  'SEARCH_PERF_LOG_TOP_FOOD_MIN_MS',
  'SEARCH_PERF_LOG_RESPONSE_TIMING_MIN_MS',
];

const getEnv = (key) => {
  if (Object.prototype.hasOwnProperty.call(process.env, key)) {
    return process.env[key];
  }
  return undefined;
};

module.exports = ({ config }) => {
  const extra = { ...(config.extra ?? {}) };

  EXTRA_ENV_KEYS.forEach((key) => {
    const value = getEnv(key);
    if (value !== undefined) {
      extra[key] = value;
    }
  });

  return {
    ...config,
    extra,
  };
};
