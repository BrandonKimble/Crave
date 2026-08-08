/**
 * THE REPO-ROOT LINT STANDARD (F9100/F9101).
 *
 * This file used to hold every safety rule it names at `warn` while apps/api ran
 * `recommendedTypeChecked` — two standards, and the lax one was the DEFAULT that
 * anything new inherited. A warning is a rule that does not exist: no script, no
 * hook and no CI step in this repo fails on warnings (`eslint` exits 0 with any
 * number of them), so `'warn'` on a rule whose whole purpose is to stop an
 * unawaited promise or an `any` reaching a call site is a comment with a severity
 * field attached.
 *
 * These are now ERROR. `scripts/check-lint-ban-inheritance.mjs` asserts the floor
 * directly against this file, so demoting one back to `warn` REDs in CI rather
 * than drifting back silently — which is how the split arose in the first place.
 *
 * SCOPE, STATED PLAINLY: the only consumer of this file today is
 * apps/mobile/.eslintrc.js (`extends: ['../../.eslintrc.js']`). apps/api,
 * apps/site and packages/shared each own a FLAT config. What this file governs,
 * then, is mobile plus anything added later that inherits it — and the point of
 * the promotion is that "later" starts strict.
 *
 * TWO PACKAGES STILL CARRY A MEASURED, DECLARED EXCEPTION, and each says so at
 * its own config with a count: apps/mobile (58 violations / 31 files, see its
 * `rules` block) and apps/api (which restates no-floating-promises,
 * no-unsafe-argument and no-unsafe-call at `warn` and no-explicit-any `off`).
 * Declared-with-a-number is the difference this change buys: the lax severity is
 * no longer the invisible DEFAULT, it is a debt somebody wrote down.
 */
module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint'],
  ignorePatterns: ['dist', 'node_modules', 'build', 'scripts'],
  rules: {
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
  },
};
