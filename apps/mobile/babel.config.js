module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      '@babel/plugin-transform-flow-strip-types',
      // @formatjs/intl-pluralrules (i18n wave 2) ships static class blocks; Metro's babel
      // must transform them or the bundle fails at that polyfill.
      '@babel/plugin-transform-class-static-block',
      'react-native-reanimated/plugin',
    ],
  };
};
