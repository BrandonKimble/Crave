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
      // F3103's ordering-determinism spec exercises the raw service's SQL
      // ORDER BY directly — no viewer is involved, same standing as the
      // unit spec above.
      'src/modules/photos/restaurant-gallery-pagination-tiebreak.integration.spec.ts',
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
      // Owns the one boolean vocabulary, so it is where the literals live.
      'src/shared/config/env-flag.ts',
      // THE owner of subject-identity resolution.
      'src/modules/signals/subject-identity.ts',
      'src/modules/signals/subject-identity.spec.ts',
      // Merge-WRITE and projection machinery: they create redirects, or resolve
      // identity on tables that are not the ledger (documents, entity events,
      // connections), so the ledger builder does not apply to them.
      'src/modules/signals/signals.service.ts',
      'src/modules/content-processing/entity-resolver/entity-anchor-rehome.service.ts',
      'src/modules/content-processing/entity-resolver/food-dedupe-merge.service.ts',
      'src/modules/content-processing/reddit-collector/extraction-scope.service.ts',
      'src/modules/content-processing/reddit-collector/projection-rebuild.service.ts',
      'src/modules/content-processing/reddit-collector/unified-processing.service.ts',
      'src/modules/restaurant-enrichment/restaurant-entity-merge.service.ts',
      // Resolves CURATED ROW identity at read time (the archived-leak law), not
      // signals.subject_id — same category as the projection machinery.
      'src/modules/home/home-feed.service.ts',
      // Ledger readers the original finding named as not yet converted. Listed
      // rather than silently excluded, so the debt is visible and countable.
      'src/modules/polls/supply/demand-mass.reader.ts',
      'src/modules/polls/supply/poll-ballot-mention.service.ts',
      // EXTRACTION-SCOPE owners: the service IS the definition, and these
      // three WRITE activation (evidence, projection rebuild, the reextract
      // runner). Everything else must ask ExtractionScopeService.
      'src/modules/content-processing/reddit-collector/collection-evidence.service.ts',
      'src/modules/content-processing/reddit-collector/city-reextract.runner.ts',
      // scripts/activate-shadow WRITES activation; scripts/prompt-audit REPORTS
      // on it (which run is live, per prompt hash), so both must name the
      // pointer. The src-only Jest walk never saw either — nor the third
      // script, backfill-attribute-evidence, which really was hand-rolling the
      // activation join and now uses the shared fragment.
      'scripts/activate-shadow.ts',
      'scripts/prompt-audit.ts',
      // Asserts on the scope service's own emitted SQL.
      'src/modules/polls/supply/poll-ballot-mention.service.spec.ts',
      // FIXTURE-PLANTS the activation pointer (a synthetic run + documents
      // whose active run is that run) to prove the market-membership
      // reconciler reads crediting communities through the scope service's
      // fragment — same standing as the rt-activation-scope crime-scene
      // probe below; events go through writePlaceEvents, the one door.
      'src/modules/restaurant-enrichment/market-membership.integration.spec.ts',
      // Same standing (one-comment-one-vote, 2026-09-04): seeds documents
      // whose active run is the fixture run so the vote-total CTE's carrier
      // lane (active-run events, the praise lane's scope) sees them; events
      // go through writePlaceEvents, the one door.
      'src/modules/search/restaurant-vote-totals-per-document.integration.spec.ts',
      // Owns the only legal write to enrichmentFailureCount, so its own type
      // annotation names the field.
      'src/modules/restaurant-enrichment/enrichment-failure-counter.ts',
      // THE TomTom vendor door, and the config layer that holds its key.
      'src/modules/places/tomtom-chain-probe.adapter.ts',
      'src/config/configuration.ts',
      // THE GEMINI vendor door. Same law, same shape as TomTom above:
      // LlmService owns the host and the key, and configuration.ts (already
      // listed) resolves LLM_API_KEY. vendor-cap-detector.spec.ts names the
      // host inside VENDOR QUOTA-METRIC STRINGS it parses
      // ('generativelanguage.googleapis.com/generate_content_requests_...') —
      // that is Google's own identifier for a quota, not a call to the API,
      // and obfuscating it would make the spec stop resembling what the
      // vendor actually returns.
      'src/modules/external-integrations/llm/llm.service.ts',
      'src/modules/external-integrations/llm/vendor-cap-detector.spec.ts',
      // THE ONE OWNER of pg advisory locks, and the two specs that must
      // hold a lock from a SECOND session to prove the mechanism is a real
      // cross-process fact. Nothing else may spell the lock functions.
      'src/shared/advisory-lock/advisory-lock.service.ts',
      'src/shared/advisory-lock/advisory-lock.integration.spec.ts',
      'src/modules/entity-display/knowledge-maintenance-lock.integration.spec.ts',
      // The invariant registry holds forbidden patterns AS DATA — its
      // mutations are the defects the rules must reject, spelled out so the
      // harness can plant them. Linting the crime-scene photos as crimes
      // would force every mutation string to be obfuscated.
      'src/shared/invariants/registry.ts',
      // CRIME-SCENE PHOTOS, same standing as the invariant registry above.
      // These two red-team probes exist to prove the activation and ballot
      // lanes behave, and to do that they must PLANT the fixture by hand: a
      // synthetic extraction run, a poll_surface document carrying
      // active_extraction_run_id, and a teardown that deletes those rows
      // again. Both call the REAL ExtractionScopeService for the behaviour
      // under test — the raw SQL is setup and cleanup, on a database
      // requireNonProdDatabase() has already refused to run against in prod.
      // Note the cleanup deletes are run-INCLUDING (`WHERE extraction_run_id
      // IN (…)`), the opposite of the run-EXCLUDING supersede the selector is
      // written to catch; it matches them only because it keys on the DELETE's
      // table, which is the coarseness the rule accepts elsewhere.
      'scripts/search-harness/rt-activation-scope.ts',
      'scripts/search-harness/rt-ballot-lane.ts',
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
      // ONE no-restricted-syntax BLOCK FOR THE WHOLE TREE. NON-NEGOTIABLE.
      //
      // THREE separate additions to this file have each silently replaced the
      // selectors already here, because flat config does not merge rule
      // OPTIONS — a later block wins outright for any file matching both. Every
      // time, a RED re-run caught it and reading the config did not. So there
      // is exactly one block, its `ignores` is the union of every selector's
      // exemptions, and adding a selector means adding it HERE.
      //
      // The cost of the union is that a file exempted for one selector is
      // exempted for all of them. That is a real loss of precision, accepted
      // knowingly: a rule that is silently absent is worth less than a rule
      // that is present and slightly broad.
      // A separate block for the boolean-flag selector below silently REPLACED
      // these APP_ENV selectors for all of src/, because flat config does not
      // merge rule OPTIONS. That is the second time this exact trap has bitten
      // in this file, and the second time a RED re-run caught it rather than a
      // reading. Every no-restricted-syntax selector belongs here.
      'no-restricted-syntax': [
        'error',
        {
          // ONE BOOLEAN DIALECT, AND NO ALLOWLIST.
          //
          // COLLECTION_SCHEDULER_ENABLED once had two readers with two answers
          // — one lowercased, one tested `=== 'true'` — so `=TRUE` started the
          // collection pacer while Reddit skipped credential validation.
          //
          // Two Jest scanners regex'd for this, and one carried a FIFTEEN-FILE
          // allowlist of "known remaining" offenders. A documented debt list is
          // still a debt list: each of those files kept a dialect a plausible
          // value ('yes', 'TRUE', '1') read the wrong way. All 31 sites are
          // converted, so this needs no exceptions — the only kind of boundary
          // that stays true. shared/config/env-flag.ts owns the literals and is
          // exempted at the block level.
          selector:
            'BinaryExpression[operator=/^[!=]==$/] > Literal[value=/^(true|false|TRUE|FALSE)$/]',
          message:
            "Comparing against the STRING 'true'/'false' is a hand-rolled flag dialect — the failure mode is a plausible value (yes, TRUE, on) reading the wrong way, silently. Use isEnvFlagEnabled / isEnvFlagExplicitlyDisabled from shared/config/env-flag.",
        },
        {
          // THE TOMTOM VENDOR HAS ONE DOOR: TomtomChainProbeAdapter. Two
          // operator scripts read TOMTOM_API_KEY themselves and fetch()ed
          // api.tomtom.com directly — ungoverned (racing the drain past the
          // vendor QPS), unmetered (zero ledger rows, the photoMedia
          // incident's shape), money-ungated, and printing a 429 as "the
          // vendor models nothing here" (red team 2026-08-04). Same law as
          // @google/genai: the raw vendor surface is only spellable in its
          // owner. configuration.ts and the adapter are exempted at the
          // block level.
          selector:
            "Literal[value=/TOMTOM_API_KEY|api\\.tomtom\\.com/], TemplateElement[value.raw=/api\\.tomtom\\.com/], MemberExpression[object.object.name='process'][object.property.name='env'][property.name='TOMTOM_API_KEY']",
          message:
            'The TomTom vendor surface has one owner: TomtomChainProbeAdapter (behind the TOMTOM_CHAIN_PROBE port). A direct key read or fetch is ungoverned, unmetered and money-ungated — consume the port.',
        },
        {
          // THE GEMINI VENDOR HAS ONE DOOR: LlmService — specifically
          // `generateForCaller`, its public gateway for callers outside the
          // service. TomTom got this rule after two operator scripts fetched
          // api.tomtom.com themselves; Gemini, the vendor we spend the MOST
          // on, never got the twin (D4, 2026-08-13). The search harness's
          // launch gate was reading LLM_API_KEY out of the environment and
          // POSTing to generativelanguage.googleapis.com directly: a real
          // billable call that no spend gate admitted, no campaign envelope
          // debited, and no api_usage_ledger row recorded — spend that reaches
          // the BigQuery billing export with nothing on our side that saw it.
          // Exactly the photoMedia / $118-Places shape.
          //
          // The door gives a caller spend admission, the caller profile
          // (model, ceiling, thinking level), retry classification and full
          // ledger accounting by construction. There is no reason to hold the
          // raw key, so holding it is banned. llm.service.ts and
          // configuration.ts are exempted at the block level.
          selector:
            "Literal[value=/LLM_API_KEY|generativelanguage\\.googleapis\\.com/], TemplateElement[value.raw=/generativelanguage\\.googleapis\\.com/], MemberExpression[object.object.name='process'][object.property.name='env'][property.name='LLM_API_KEY']",
          message:
            'The Gemini vendor surface has one owner: LlmService. A direct key read or fetch is unadmitted, unmetered and outside every campaign envelope — call llmService.generateForCaller({ caller, prompt }) instead.',
        },
        {
          // EXTRACTION SCOPE IS DEFINED ONCE. The activation pointer decides
          // which extraction run OWNS a document, and a second definition of
          // "active" is a second answer to "what is live" — the shape that let
          // three copies of the activation pair coexist.
          selector:
            "Identifier[name='activeExtractionRunId'], TemplateElement[value.raw=/active_extraction_run_id/]",
          message:
            'The activation pointer has one owner: ExtractionScopeService. Ask it rather than joining active_extraction_run_id yourself.',
        },
        {
          // A DELETE on an event ledger that EXCLUDES a run is the supersede
          // step. Expressed anywhere but the scope service it is a second
          // supersede, and the two can disagree about what survives.
          selector:
            "TemplateElement[value.raw=/DELETE\\s+FROM\\s+core_restaurant(_entity)?_events/i], Property[key.name='extractionRunId'] > ObjectExpression > Property[key.name='not']",
          message:
            'A run-excluding delete on the event ledgers is the supersede step, and it belongs to ExtractionScopeService.supersedeAndActivate — a second one is a second answer about what survives.',
        },
        {
          // The fold-back, hand-rolled. This exact form lived at FOURTEEN sites
          // in one file, which is how three SQL dialects coexisted under one
          // vocabulary; a reader that joined entity_redirects and then ignored
          // the fold-back satisfied the guard this replaced
          // (`toContain('entity_redirects')`).
          selector:
            'TemplateElement[value.raw=/COALESCE\\(\\s*\\w+\\.to_entity_id\\s*,/]',
          message:
            'Hand-rolled subject-identity fold-back. Use resolvedSubjectSql()/subjectMatchesSql() from signals/subject-identity — they take one alias argument, so a caller cannot take the join and skip the fold-back.',
        },
        {
          selector:
            'TemplateElement[value.raw=/LEFT JOIN\\s+entity_redirects/i]',
          message:
            'Hand-rolled redirect join. Use redirectJoinSql() from signals/subject-identity.',
        },
        {
          // A DOUBLE THAT ANSWERS EVERY ARGUMENT THE SAME WAY (F2200-F2206).
          //
          // Four specs stubbed `prisma.entityRedirect.findMany` with an
          // unconditional mockResolvedValue. All four existed to prove the
          // merged-entity leak was CLOSED, and none could show it open: mutate
          // the production call to `fromEntityId: { in: [] }` and every one
          // stayed green. The redirect read is a pure lookup whose only input
          // is an id set, so a one-answer mock erases the only thing worth
          // asserting.
          //
          // Within a day of fixing them there were already two byte-identical
          // private `redirectTable` helpers and two more inline variants — the
          // hand-rolled-resolver pattern restarting. entityRedirectDouble()
          // keys on its input; this makes the blind form unavailable rather
          // than merely fixed.
          // Scoped to `findMany` specifically. A broader selector also caught
          // `entityRedirect.findUnique` — a different query shape this double
          // does not model, so flagging it would be a false positive, and a
          // rule with false positives gets disabled rather than obeyed.
          selector:
            "Property[key.name='entityRedirect'] > ObjectExpression > Property[key.name='findMany'] CallExpression[callee.property.name=/^mock(Resolved|Return)Value$/]",
          message:
            'A one-answer entityRedirect mock cannot tell a resolver asking about the right ids from one asking about none — which is the exact leak these specs exist to catch. Use entityRedirectDouble() from shared/testing/prisma-doubles.',
        },
        {
          // A COUNTER THAT CAN ONLY COUNT. Its predecessor was ASSIGNED the
          // number of Google candidates, so the restaurants with the MOST
          // evidence got archived, and the error path wrote nothing at all and
          // re-enriched those placeholders weekly at real Places spend. Prisma's
          // update type accepts a bare `number`, so the increment form is a
          // convention the type system permits breaking — this refuses it.
          // `{ increment: 1 }` is an ObjectExpression and passes; a Prisma
          // `select: { enrichmentFailureCount: true }` is a boolean and passes.
          // SCOPED TO THE VALUE, NOT A CHILD. `Property > Identifier` matches
          // the KEY as well, so the first attempt flagged every Prisma
          // `select: { enrichmentFailureCount: true }` — caught by testing the
          // legitimate case, which is as important as testing the defect.
          selector:
            "Property[key.name='enrichmentFailureCount'][value.type=/^(Identifier|BinaryExpression|CallExpression|MemberExpression|ConditionalExpression)$/], Property[key.name='enrichmentFailureCount'][value.type='Literal'][value.raw=/^[0-9]/]",
          message:
            'enrichmentFailureCount may only be INCREMENTED, never assigned — an assigned value is how the candidate-count blob archived the best-evidenced restaurants. Use countEnrichmentFailure() from restaurant-enrichment/enrichment-failure-counter.',
        },
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
          // A SESSION LOCK MUST NOT MEET A CONNECTION POOL. pg advisory locks
          // belong to the backend that took them; taken through the pooled
          // PrismaService the release lands on a different connection and
          // frees nothing, and Prisma never closes a pooled connection — so
          // the lock strands for the life of the process and the lane it
          // guards is dead, reporting zeros. Measured 25/25 failed
          // round-trips under 8-way pool traffic (A0 R1, 2026-08-11).
          //
          // SCOPED TO THE SESSION-LOCK FUNCTIONS ONLY. `pg_advisory_xact_lock`
          // is deliberately NOT matched: a transactional lock releases at
          // COMMIT/ROLLBACK and cannot be stranded at all, which is the better
          // shape wherever the guarded work fits inside a transaction. Two
          // sites already use it correctly (the per-poll leaderboard rebuild
          // and the demand-aggregate day slice) and flagging them would be a
          // false positive — and a rule with false positives gets disabled
          // rather than obeyed.
          selector:
            'Literal[value=/pg_(try_)?advisory_(un)?lock/], TemplateElement[value.raw=/pg_(try_)?advisory_(un)?lock/]',
          message:
            'Advisory locks are session-scoped and the shared Prisma client is POOLED — an acquire/release pair across it strands the lock and permanently disables the lane. Use AdvisoryLockService.withAdvisoryLock(key, fn) from shared/advisory-lock, which holds a dedicated single connection for the lock\u0027s lifetime.',
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
    files: ['scripts/**/*.ts'],
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
