/**
 * Tracksheet RENDER lane (transition contract F3).
 *
 * The main jest project is deliberately pure-TS spec-only ("*.spec.ts", never
 * .tsx) — the falsifier suites there cover the pure decision modules. This
 * SEPARATE project renders the REAL TrackSheetRouteHost / TrackSheetPage wiring
 * with react-test-renderer, stubbing only the native boundary (TrackScrollPhysics,
 * TrackShellSlot/TrackTouchCarve views, FlashList, reanimated) and the app-runtime
 * module seams (presentation frame, transition txn, search surface runtime,
 * panels). Mocks are THIN: they record calls and hand back controllable data —
 * they never re-implement host logic (that would be the mirror F3 forbids).
 *
 * Run: yarn test:tracksheet-render
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  // THE PAINT BOUNDARY IS TEST-CONTROLLED, NOT EVENT-LOOP LUCK. The setup file
  // maps requestAnimationFrame onto setTimeout(0); under REAL timers that 0ms
  // macrotask can fire inside any `await act(async …)` that yields — so the
  // press-up handoff's rAF release could land inside the flip frame itself and
  // turn the handoff falsifier RED for timing reasons (observed 3/8 runs,
  // 2026-08-05). With fake timers installed globally the rAF shim only advances
  // where flushFrame() explicitly advances the clock, so "the flip frame" and
  // "the release frame" are separated by an explicit step, always.
  fakeTimers: { enableGlobally: true },
  setupFiles: ['<rootDir>/jest.tracksheet-render.setup.js'],
  roots: ['<rootDir>/src/tracksheet'],
  testMatch: ['**/*.render-spec.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^react-native$': '<rootDir>/src/tracksheet/__render__/mocks/react-native-mock.ts',
    '^react-native-reanimated$': '<rootDir>/src/tracksheet/__render__/mocks/reanimated-mock.ts',
    '^@shopify/flash-list$': '<rootDir>/src/tracksheet/__render__/mocks/flash-list-mock.tsx',
    '^react-native-svg$': '<rootDir>/src/tracksheet/__render__/mocks/svg-mock.ts',
    '^@sentry/react-native$': '<rootDir>/jest.sentry-stub.js',
    // App-runtime seams (module boundaries, never host logic):
    '.*overlays/panels/.*': '<rootDir>/src/tracksheet/__render__/mocks/panels-mock.tsx',
    '.*overlays/SceneBodyFoundationSurface$':
      '<rootDir>/src/tracksheet/__render__/mocks/surfaces-mock.tsx',
    '.*overlays/SearchRouteSheetFrameHost$':
      '<rootDir>/src/tracksheet/__render__/mocks/surfaces-mock.tsx',
    '.*components/skeletons$': '<rootDir>/src/tracksheet/__render__/mocks/surfaces-mock.tsx',
    '.*components/MaskedHoleOverlay$':
      '<rootDir>/src/tracksheet/__render__/mocks/surfaces-mock.tsx',
    '.*overlays/HeaderNavAction$': '<rootDir>/src/tracksheet/__render__/mocks/surfaces-mock.tsx',
    '.*components/FrostedGlassBackground$':
      '<rootDir>/src/tracksheet/__render__/mocks/surfaces-mock.tsx',
    '.*navigation/runtime/AppRouteSceneRuntimeProvider$':
      '<rootDir>/src/tracksheet/__render__/mocks/runtime-mock.ts',
    '.*navigation/runtime/AppRouteSharedSheetRuntimeProvider$':
      '<rootDir>/src/tracksheet/__render__/mocks/runtime-mock.ts',
    '.*navigation/runtime/use-presentation-frame$':
      '<rootDir>/src/tracksheet/__render__/mocks/runtime-mock.ts',
    '.*navigation/runtime/scene-foundation-spec$':
      '<rootDir>/src/tracksheet/__render__/mocks/runtime-mock.ts',
    '.*navigation/runtime/app-route-persistent-header-registry$':
      '<rootDir>/src/tracksheet/__render__/mocks/runtime-mock.ts',
    '.*navigation/runtime/header-nav-action-registry$':
      '<rootDir>/src/tracksheet/__render__/mocks/runtime-mock.ts',
    '.*transition-engine/transition-transaction$':
      '<rootDir>/src/tracksheet/__render__/mocks/runtime-mock.ts',
    '.*overlays/scene-chrome-ack-runtime$':
      '<rootDir>/src/tracksheet/__render__/mocks/runtime-mock.ts',
    '.*overlays/useAppOverlayRouteController$':
      '<rootDir>/src/tracksheet/__render__/mocks/runtime-mock.ts',
    '.*surface/search-surface-runtime$':
      '<rootDir>/src/tracksheet/__render__/mocks/runtime-mock.ts',
    '.*shared/search-startup-geometry-seed-runtime$':
      '<rootDir>/src/tracksheet/__render__/mocks/runtime-mock.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.tracksheet-render.json',
        // Runtime lane: type honesty is the main tsc gate's job; transpile-only
        // keeps this lane fast and immune to unrelated type churn.
        isolatedModules: true,
      },
    ],
  },
};
