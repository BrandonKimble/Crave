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
  // Facts in this codebase with exactly one legitimate owner. Each was
  // previously policed by a source-scanning Jest spec that read the tree as
  // text, and each of those shipped a false green (2026-08-02): the Gemini one
  // matched a COMMENT containing the word it was looking for, so the real
  // spend gate could be deleted with CI green. A lint rule fails on the import
  // itself — in the editor, before the commit — and cannot be fooled by prose.
  //
  // ONE BLOCK, BOTH RULES. Flat config does not merge rule OPTIONS: two blocks
  // both setting `@typescript-eslint/no-restricted-imports` means the later
  // one REPLACES the earlier for any file matching both. Split across blocks,
  // the photo rule silently switched the Gemini rule off for all of src/ — a
  // lying guard of exactly the kind this section exists to retire (caught by
  // re-running the RED proof after the split, not by reading the config).
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts'],
    ignores: [
      // THE owner of the raw Gemini client: it exposes only gated operations,
      // so an ungated paid call is unrepresentable rather than audited.
      'src/modules/external-integrations/llm/gated-gemini-client.ts',
      // Consumes the SDK's response/enum types only; holds no client.
      'src/modules/external-integrations/llm/llm.service.ts',
      // THE photo seam, and the module that provides it. The module does not
      // export the raw service, so DI already blocks injection — the rule
      // closes the remaining import-and-construct door.
      'src/modules/photos/photo-reads.ts',
      'src/modules/photos/photos.module.ts',
      'src/modules/photos/photo-read.service.spec.ts',
      // Two operator PROBE SCRIPTS read the raw photo service directly —
      // doors the old src-only Jest scanner never saw either. They are
      // diagnostics with NO VIEWER, and the seam's guarantee is about what a
      // PERSON is served, so the rule genuinely does not apply to them.
      'scripts/tile-gallery-probe.ts',
      'scripts/dish-connection-photo-probe.ts',
    ],
    rules: {
      // The base rule is off in favour of the TS one, which understands
      // `import type`. The invariant is about VALUE imports — a type cannot
      // be injected, constructed, or called, so `import type { SomeDto }` is
      // not a second client and not a second door.
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@google/genai',
              allowTypeImports: true,
              message:
                'The Gemini SDK has one owner: GatedGeminiClient. A second client is a second spend gate to forget — consume the gateway ops from LlmService instead.',
            },
          ],
          // `patterns` for a relative path; a `paths` entry matches the
          // specifier EXACTLY, so '*/photo-read.service' there matched
          // nothing at all — also caught by planting an import, not by
          // reading the config.
          patterns: [
            {
              group: ['**/photo-read.service'],
              allowTypeImports: true,
              message:
                'PhotoReadService has no viewer and no block logic — reading it directly is how a blocked author fronted a list tile. Go through the PhotoReads seam (forViewer).',
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
