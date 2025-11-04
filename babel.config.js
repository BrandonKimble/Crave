const getMobileConfig = require('./apps/mobile/babel.config');

module.exports = function (api) {
  return getMobileConfig(api);
};
