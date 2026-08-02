// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'test/**/*.d.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 5,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
    },
  },
  // ── MODULE BOUNDARIES ────────────────────────────────────────────────
  //
  // Two facts in this codebase have exactly one legitimate owner, and both
  // were previously policed by source-scanning Jest specs that read the tree
  // as text. Both scanners shipped false greens (2026-08-02): one matched a
  // COMMENT containing the word it was looking for, so the real spend gate
  // could be deleted with CI green. A lint rule fails on the import itself —
  // in the editor, before the commit — and cannot be fooled by prose.
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    ignores: [
      // THE owner of the raw Gemini client: it exposes only gated operations,
      // so an ungated paid call is unrepresentable rather than audited.
      'src/modules/external-integrations/llm/gated-gemini-client.ts',
      // Consumes the SDK's response/enum types only; holds no client.
      'src/modules/external-integrations/llm/llm.service.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@google/genai',
              message:
                'The Gemini SDK has one owner: GatedGeminiClient. A second client is a second spend gate to forget — consume the gateway ops from LlmService instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    ignores: [
      'src/shared/config/app-env.ts',
      'src/config/configuration.ts',
      // Exposure gates that refuse on prod/staging BY NAME must see the raw
      // value so an unrecognized one fails closed.
      'src/shared/config/debug-routes.gate.ts',
      'src/modules/identity/auth/clerk-auth.service.ts',
      'src/prisma/prisma.service.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^(APP_ENV|CRAVE_ENV)$/]",
          message:
            "APP_ENV's value becomes a Redis key prefix, so a second spelling means two disjoint rate-limit windows on the vendors that cost the most. Call resolveAppEnv()/normalizeAppEnv() from shared/config/app-env.",
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts', 'prisma/**/*.ts', 'test-pipeline.ts'],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
