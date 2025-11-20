const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.alias = {
  ...(config.resolver.alias || {}),
  'react-native$': path.resolve(projectRoot, 'src/shims/reactNativeProxy.js'),
  'react-native/Libraries/Utilities/codegenNativeComponent': path.resolve(
    projectRoot,
    'src/shims/codegenNativeComponentShim.js'
  ),
  '@rnmapbox/maps': path.resolve(
    workspaceRoot,
    'node_modules/@rnmapbox/maps/lib/module/index.native.js'
  ),
  '@rnmapbox/maps$': path.resolve(
    workspaceRoot,
    'node_modules/@rnmapbox/maps/lib/module/index.native.js'
  ),
  'react-native-svg': path.resolve(
    workspaceRoot,
    'node_modules/react-native-svg'
  ),
  'react-native-svg$': path.resolve(
    workspaceRoot,
    'node_modules/react-native-svg'
  ),
};

module.exports = config;
