/**
 * Hermetic-lane stub for `react-native`.
 *
 * The mobile logic project is a PURE decision layer that runs in plain Node — no native
 * modules, no Metro/babel transform for node_modules. `react-native` ships untranspiled
 * ESM, so when a spec transitively imports it at module scope (e.g.
 * `src/screens/Search/constants/search.ts` does `import { Dimensions } from 'react-native'`)
 * the real `node_modules/react-native/index.js` was loaded untransformed and the WHOLE
 * suite died with "Cannot use import statement outside a module".
 *
 * Specs used to paper over this with a per-file `jest.mock('react-native', …, { virtual: true })`.
 * That was the F4700/F7800 flake: a `virtual` mock is registered under the LITERAL specifier
 * resolved from the CALLING file, so it covers the spec's own import but NOT a transitive
 * import issued from another directory — the real ESM file then loads and the result becomes
 * a function of which siblings share the worker process. This maps the module to a stub ONCE,
 * as a config fact (the same shape as jest.sentry-stub.js), so hermeticity no longer depends
 * on a per-spec incantation. A spec needing a richer or different surface still
 * `jest.mock('react-native', factory)`s it normally (no `virtual`), which overrides this stub.
 *
 * Surface = the union of what the lane's transitive importers touch at module scope:
 * Dimensions, StyleSheet, Platform, NativeModules, NativeEventEmitter.
 */
const StyleSheet = {
  create: (styles) => styles,
  absoluteFillObject: {},
  flatten: (style) => style,
  hairlineWidth: 1,
};

const Platform = { OS: 'ios', select: (spec) => (spec ? spec.ios : undefined) };

const Dimensions = {
  get: () => ({ width: 393, height: 852, scale: 3, fontScale: 1 }),
  addEventListener: () => ({ remove: () => undefined }),
};

class NativeEventEmitter {
  addListener() {
    return { remove: () => undefined };
  }
  removeAllListeners() {}
}

module.exports = {
  StyleSheet,
  Platform,
  Dimensions,
  NativeModules: {},
  NativeEventEmitter,
};
