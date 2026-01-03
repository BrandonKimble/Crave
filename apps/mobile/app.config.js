const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const getEnv = (key) => {
  if (Object.prototype.hasOwnProperty.call(process.env, key)) {
    return process.env[key];
  }
  return undefined;
};

module.exports = ({ config }) => {
  const extra = { ...(config.extra ?? {}) };
  const perfFlag = getEnv('SEARCH_PERF_DEBUG_ENABLED');
  const overlayFlag = getEnv('SEARCH_OVERLAY_DEBUG_ENABLED');
  const payloadFlag = getEnv('SEARCH_LOG_RESPONSE_PAYLOAD_ENABLED');

  if (perfFlag !== undefined) {
    extra.SEARCH_PERF_DEBUG_ENABLED = perfFlag;
  }
  if (overlayFlag !== undefined) {
    extra.SEARCH_OVERLAY_DEBUG_ENABLED = overlayFlag;
  }
  if (payloadFlag !== undefined) {
    extra.SEARCH_LOG_RESPONSE_PAYLOAD_ENABLED = payloadFlag;
  }

  return {
    ...config,
    extra,
  };
};
