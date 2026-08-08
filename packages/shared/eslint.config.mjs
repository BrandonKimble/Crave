import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

/**
 * ONE LINT STANDARD (F9100/F9101).
 *
 * This package used to lint at `recommended` — the SYNTAX-ONLY tier. Every rule
 * that catches the defects that actually reach production here (an unawaited
 * promise, an `any` flowing into a call, an `async` that never awaits) needs
 * TYPE information, and none of them were loaded. So `@crave-search/shared` —
 * the one package BOTH the api and the mobile app import — was the least
 * checked code in the repo, while apps/api ran `recommendedTypeChecked`.
 *
 * The rules below are the standard, at ERROR. A warning is a rule that does not
 * exist: nothing in this repo fails on warnings (`eslint src --fix` exits 0
 * with any number of them), so a "safety rule at warn" is a comment with a
 * severity field. `scripts/check-lint-ban-inheritance.mjs` asserts the floor,
 * so demoting one back to `warn` is a CI failure rather than a quiet drift.
 */
export const SAFETY_RULES = Object.freeze({
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
});

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        // The tests live in tsconfig.test.json (the base config EXCLUDES them);
        // naming both projects is what lets the type-aware rules see every file
        // this package ships, tests included.
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs['recommended-type-checked'].rules,
      ...SAFETY_RULES,
    },
  },
  {
    // `node:test`'s `describe`/`test` RETURN a promise, and the runner itself
    // awaits it — floating them is the documented calling convention, not a
    // dropped rejection. 52 of the 52 first-run violations here were this one
    // shape. The rule stays ERROR; `allowForKnownSafeCalls` is the rule's own
    // mechanism for it, keyed to the `node:test` module, so a promise from
    // anywhere ELSE in a test file still fails. The alternative — 52
    // `eslint-disable-next-line` comments — would have hidden every real
    // unawaited promise in the suite behind the same noise.
    files: ['src/**/*.test.ts'],
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
  },
];
