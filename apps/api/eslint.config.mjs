// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'eslint.config.mjs',
      'test/**/*.d.ts',
      // Deliberately outside tsconfig's `include` (throwaway red-team
      // harnesses, run ad hoc with ts-node). Linting them yields only
      // "not found by the project service" parse errors. ESLint's view of
      // the tree has to match the compiler's, or extending the lint glob to
      // scripts/ turns CI red on files nothing type-checks either.
      'scripts/search-harness/**',
    ],
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
      // THE owner of the raw Gemini client.
      'src/modules/external-integrations/llm/gated-gemini-client.ts',
      // Consumes the SDK's response/enum types only, and is the one place
      // allowed to CONSTRUCT the gated client (see the second pattern below).
      'src/modules/external-integrations/llm/llm.service.ts',
      'src/modules/external-integrations/llm/gated-gemini-client.spec.ts',
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
          // EVERYTHING IS A `patterns` ENTRY, DELIBERATELY. A `paths` entry
          // matches the specifier EXACTLY, which a red team walked straight
          // past: `@google/genai/node` is a real published subpath export, so
          // `import { GoogleGenAI } from '@google/genai/node'` satisfied a
          // `paths: [{ name: '@google/genai' }]` rule completely — and in
          // scripts/, where no-unsafe-assignment is off, it raised nothing at
          // all. The same mistake had already been made once here with
          // '*/photo-read.service'. Twice is a pattern: use `patterns`.
          patterns: [
            {
              group: ['@google/genai', '@google/genai/**'],
              allowTypeImports: true,
              message:
                'The Gemini SDK has one owner: GatedGeminiClient. A second client is a second spend gate to forget — consume the gateway ops from LlmService instead.',
            },
            {
              // CONSTRUCTING the gated client is as dangerous as importing the
              // SDK. Its gate is a constructor ARGUMENT, so `new
              // GatedGeminiClient(key, async () => {})` is an ungated paid
              // client in one line — which is why the original claim that an
              // ungated call was "unrepresentable" was too strong. It is
              // unrepresentable from anywhere that cannot name this module.
              group: ['**/gated-gemini-client'],
              allowTypeImports: true,
              message:
                'GatedGeminiClient takes its gate as a constructor argument, so constructing it elsewhere means constructing it with a no-op gate. LlmService owns the one instance — consume its ops.',
            },
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
    ],
    rules: {
      // FIVE SELECTORS, BECAUSE THE FIRST ONE HAD FOUR HOLES.
      //
      // The original was a single MemberExpression selector keyed on
      // `property.name`. A red team walked past it four ways, all silent:
      // `process['env']['APP_ENV']` (a computed member has property.VALUE,
      // not property.name), `const { APP_ENV } = process.env`, and
      // `const env = process.env; env.APP_ENV` (one level of aliasing).
      //
      // Aliasing through an intermediate variable is not statically
      // decidable in general, so the last selector bans taking a reference to
      // `process.env` as a whole in these files. That is blunter than the
      // invariant strictly needs, and it is the right trade here: the reason
      // this rule exists is that two spellings of APP_ENV became two Redis
      // key prefixes and silently doubled the rate-limit ceiling on the two
      // vendors that cost the most.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^(APP_ENV|CRAVE_ENV)$/]",
          message:
            "APP_ENV's value becomes a Redis key prefix, so a second spelling means two disjoint rate-limit windows on the vendors that cost the most. Call resolveAppEnv()/normalizeAppEnv() from shared/config/app-env.",
        },
        {
          // process['env']['APP_ENV'] and process.env['APP_ENV']
          selector:
            'MemberExpression[computed=true][property.value=/^(APP_ENV|CRAVE_ENV)$/]',
          message:
            'Bracket access is the same read as dot access. Call resolveAppEnv()/normalizeAppEnv() from shared/config/app-env.',
        },
        {
          // const { APP_ENV } = process.env
          selector:
            "VariableDeclarator[init.object.name='process'][init.property.name='env'] > ObjectPattern > Property[key.name=/^(APP_ENV|CRAVE_ENV)$/]",
          message:
            'Destructuring APP_ENV out of process.env is the same read. Call resolveAppEnv()/normalizeAppEnv() from shared/config/app-env.',
        },
        {
          // const env = process.env  (defeats every selector above)
          selector:
            "VariableDeclarator[init.object.name='process'][init.property.name='env'][id.type='Identifier']",
          message:
            'Aliasing process.env hides which variables are read from it. Call resolveAppEnv()/normalizeAppEnv() from shared/config/app-env, or read the specific variable inline.',
        },
        {
          // A dynamic import is an import; no-restricted-imports cannot see it.
          selector:
            'ImportExpression > Literal[value=/^@google\\u002Fgenai/], ImportExpression > Literal[value=/(gated-gemini-client|photo-read\\u002Eservice)$/]',
          message:
            'A dynamic import is an import. These modules have one owner each — see the no-restricted-imports messages.',
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
