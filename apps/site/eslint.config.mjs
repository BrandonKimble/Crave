// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * ONE LINT STANDARD (F9100/F9101).
 *
 * `apps/site` had NO eslint config and NO `lint` script, so `yarn lint` (turbo)
 * ran nothing for it: the public website and the WEB CHECKOUT ENTRY — the one
 * surface that handles a Clerk session and a Stripe hand-off — was the only
 * TypeScript in the repo that no linter had ever read. "Two standards" understated
 * it; this tree had none.
 *
 * The standard is `recommendedTypeChecked` plus the safety set at ERROR, matching
 * packages/shared. A warning is a rule that does not exist — nothing in this repo
 * fails on warnings — so severity is the whole point, and
 * `scripts/check-lint-ban-inheritance.mjs` REDs if one is demoted back to `warn`.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // `node:test`'s `describe`/`test` RETURN a promise the runner itself awaits —
    // floating them is the calling convention, not a dropped rejection. Keyed to
    // the `node:test` module, so any OTHER unawaited promise in a test still fails.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['describe', 'it', 'test'] },
          ],
        },
      ],
    },
  }
);
