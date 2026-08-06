/**
 * Mobile logic test project.
 *
 * Scope: the PURE decision layer (selection/LOD/ranking math) — no React Native,
 * no native modules, no simulator. These run in plain Node via ts-jest in
 * milliseconds and are where invariants (stable membership, top-N promotion,
 * no oscillation) belong. Rendering/native behavior is validated separately by
 * the perf-scenario harness on a real build.
 *
 * Only `*.spec.ts` is matched (never `.tsx`), so component/native files cannot be
 * pulled into this hermetic project by accident.
 *
 * F2140: that sentence used to be a claim the config did not make. `testMatch`
 * read `**\/*.spec.ts?(x)` — which DOES match `.tsx`. The lane was hermetic only
 * because `moduleFileExtensions` omits `tsx`, and jest filters discovered test
 * paths by that list. So the stated guarantee was credited to one setting and
 * actually held by another, whose documented job is module RESOLUTION: adding
 * `'tsx'` there (a natural, unrelated-looking change) would have silently begun
 * pulling `.spec.tsx` component files into this node lane, with the comment
 * above insisting that could not happen. Proven by probe: at the old config a
 * `.spec.tsx` under src/ was undiscovered, but appeared in `--listTests` the
 * moment `tsx` was added to moduleFileExtensions. `testMatch` now states the
 * law itself, so the guarantee no longer depends on a setting that is not about
 * test selection.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  // @sentry/react-native ships untranspiled ESM and node_modules is not transformed in
  // this hermetic lane — see jest.sentry-stub.js for why a stub (not an avoidance) is
  // the right answer.
  moduleNameMapper: {
    '^@sentry/react-native$': '<rootDir>/jest.sentry-stub.js',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
};
