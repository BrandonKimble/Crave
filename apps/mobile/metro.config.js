const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

config.cacheVersion = 'crave-search-expo54';

const sourceExts = config.resolver.sourceExts || [];
config.resolver.sourceExts = [
  'ts',
  'tsx',
  ...sourceExts.filter((ext) => ext !== 'ts' && ext !== 'tsx'),
];

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// NOTE (F807, verified 2026-08-03): there used to be a `config.resolver.alias`
// block here proxying react-native + codegenNativeComponent through shims and
// deduping @rnmapbox/maps + react-native-svg. It was INERT and partly fictional:
//   - Metro has no `resolver.alias` option at all — the key is absent from
//     metro-config/src/types.js.flow, from metro-resolver, and from
//     @expo/metro-config's build output (all three grepped).
//   - Two of its targets (src/shims/reactNativeProxy.js,
//     src/shims/codegenNativeComponentShim.js) DO NOT EXIST, so had the option
//     been real the bundle would not have built.
// A reader reasonably believed react-native was being proxied. It was not.
// If a hoisting/dedupe problem ever appears, express it with the options Metro
// DOES support: `resolver.resolveRequest` or `resolver.extraNodeModules`.

module.exports = config;
