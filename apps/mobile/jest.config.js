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
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
};
