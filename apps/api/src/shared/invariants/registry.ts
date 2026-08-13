/**
 * THE INVARIANTS THIS CODEBASE HOLDS, AND THE PROOF THAT EACH ONE STILL BITES.
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────
 *
 * Two facts, both measured in this repository rather than assumed:
 *
 * 1. Twelve commits and twenty-eight code comments claim a guard was "proven
 *    RED". Exactly ONE of those proofs is reproducible by anyone today. Every
 *    other one was a manual act — mutate, observe the failure, restore, write a
 *    sentence about it — and the sentence is all that survives.
 *
 * 2. A guard's dominant failure mode is not being wrong. It is being ABSENT
 *    while appearing present. Of eight defects found in enforcement mechanisms
 *    written during a single focused session, six were silent absence: a
 *    `paths` entry that matched no specifier, three separate ESLint flat-config
 *    blocks that replaced the selectors already in the file, an AST attribute
 *    that does not regex-match a numeric literal, a boot audit that passed
 *    having inspected zero routes, and an integration test that passed
 *    vacuously against an empty database.
 *
 * Put together: the thing we keep getting wrong is not the invariant, it is
 * knowing whether the invariant is still enforced. Every one of those six was
 * caught the same way — apply the defect, check that the guard complains — and
 * that act was never automated. So it happened when someone thought of it.
 *
 * ─── THE SHAPE THAT FOLLOWS ──────────────────────────────────────────────
 *
 * An invariant is not a guard. It is a PAIR: a mechanism, and a mutation that
 * mechanism must reject. A mechanism without a live mutation is not enforcement,
 * it is a hope with a comment attached. So the pair is the unit declared here,
 * and `yarn test:invariants` runs every mutation in CI: apply it, run the
 * check, require the check to FAIL, restore.
 *
 * Three properties fall out of that, and each is load-bearing:
 *
 *   - A guard that stops working is caught the same day, because its mutation
 *     stops failing.
 *   - A guard that is too BROAD is caught too: every entry may also declare
 *     `legitimate` cases that must keep passing. The false positive on Prisma's
 *     `select: { field: true }` was found this way, and testing the legitimate
 *     case turned out to matter as much as testing the defect.
 *   - A mutation whose `find` text no longer appears is a HARD FAILURE, not a
 *     skip. Code moves; a proof that quietly stops applying is the same lie
 *     this file exists to end.
 *
 * ─── WHAT BELONGS HERE, AND WHAT DOES NOT ───────────────────────────────
 *
 * THE REGISTRY SHRINKS. IT DOES NOT GROW TOWARD THE CENSUS.
 *
 * The census that motivated this file counted ~125 invariants, and the first
 * instinct was to register them all. The census's own data refutes that: of
 * 19 historical guard failures, ZERO were types, schema constraints, or
 * anything else that runs as a side effect of compiling, booting, or testing.
 * All 19 were separate artifacts — scanners, unwired gates, allowlists —
 * because an artifact nothing exercises is an artifact nothing notices dying.
 *
 * So registering a branded type here would be proving that tsc works. Do not.
 * An entry earns its place only when ALL THREE hold:
 *
 *   1. The mechanism CAN SILENTLY DIE. Lint rules qualify (a config edit can
 *      switch one off with no failing test — it happened three times in one
 *      day). Types and CHECK constraints do not qualify: deleting one breaks
 *      compilation or the migration replay loudly, on every push, for free.
 *   2. The defect is an ATTRACTOR, not a one-off. New paid-API surfaces, new
 *      routes, new readers of the ledger — places where ordinary development
 *      keeps regenerating the opportunity for the same mistake. A disease
 *      killed by deleting its pattern and installing a single owner is not an
 *      attractor; nothing regenerates it but deliberate archaeology.
 *   3. Being wrong is EXPENSIVE — money, user trust, or unrecoverable data.
 *
 * Everything else is handled the better way: make the abstraction the only
 * spellable path and let the code be its own enforcement. When an entry's
 * mechanism moves up the ladder — a lint boundary becomes a module that no
 * longer exports the dangerous thing — DELETE the entry with the move. The
 * unrepresentable and behaviour entries below are the deliberate exceptions:
 * they guard money and identity, the two places where "almost certainly
 * cannot regress" is not a sentence anyone should have to say out loud.
 *
 * ─── THREE KINDS OF GUARD, AND WHERE EACH BELONGS ───────────────────────
 *
 * Written down 2026-08-12 because an architecture review re-litigated it, and
 * the next reader should not have to. Sort a guard by asking what happens when
 * someone tries to write the defect:
 *
 *   1. STRUCTURAL-RUNTIME GUARDS — the wrong thing cannot be EXPRESSED, or the
 *      process refuses to carry it. DerivedIndexJob's typed lane, the boot
 *      spend guard, AdvisoryLockService's dedicated connection, the detector-gap
 *      throw. These DO NOT BELONG HERE, and that is a promotion, not an
 *      omission: they are the rung ABOVE registration. Registering one would
 *      prove that the constructor still takes its arguments — the same category
 *      error as registering a branded type. If such a guard is ever softened
 *      into a convention, THAT is when it earns an entry, and the entry should
 *      be filed as a regression.
 *
 *   2. SEPARATE-ARTIFACT SCANNERS — a .mjs, a .sh, a lint selector, a spec that
 *      nothing else exercises. These BELONG HERE, always, when the three tests
 *      hold. They are the population the census's 19 historical failures came
 *      from, because an artifact nothing exercises is an artifact nothing
 *      notices dying. Everything in the repo-root-scanners section below is
 *      one of these.
 *
 *   3. HYGIENE SCANNERS — real, wired, worth keeping, but their defect costs
 *      readability rather than money, trust, or data. coverage-staleness,
 *      doc-claims, the search-runtime hook-name and orphan-key gates,
 *      find-dead-hook-args, the tracksheet R8 invariants, and the cutover
 *      delete-gates (whose diseases were killed by deleting their pattern, so
 *      nothing regenerates them — test 2 fails outright). These stay in CI and
 *      OUT of this registry. Registering them would trade the registry's
 *      strongest property — that every entry is worth the mutation run — for
 *      the appearance of coverage, which is the census instinct this file was
 *      written to refuse.
 *
 * ─── WHAT THIS IS NOT ────────────────────────────────────────────────────
 */

/** Where an invariant sits on the ladder. Higher is better: it costs less to
 *  hold and fails earlier. An entry may move UP freely; moving one DOWN is a
 *  decision that should be argued for in the commit that does it. */
export type EnforcementLevel =
  /** The compiler refuses. A wrong program does not exist. */
  | 'unrepresentable'
  /** The process refuses to start. */
  | 'boot'
  /** CI refuses, having asked the real database. */
  | 'behaviour'
  /** The editor refuses, before the commit. */
  | 'lint'
  /** The DECLARATION refuses — the defect is caught in the schema that
   *  produces the database, not in the database it produced. A live-database
   *  check can only find such a defect after someone has already applied it,
   *  and cannot run without a database at all. */
  | 'schema';

/** Patch an existing file, or add one that did not exist. */
export type Mutation =
  | { readonly file: string; readonly find: string; readonly replace: string }
  | { readonly file: string; readonly content: string };

/**
 * How to ask whether the invariant currently holds. Exit 0 means it holds.
 *
 * A shell command rather than a typed union of check kinds, deliberately: the
 * question "does this still bite" has to be answerable the same way a human
 * would answer it, and any narrower encoding would have to grow a case for
 * every mechanism we invent later.
 */
export interface Check {
  /** Run from apps/api. */
  readonly command: string;
  /** Why this command answers the question. */
  readonly reads: string;
}

export interface Invariant {
  /** Stable, dotted, mechanism-agnostic: it names the LAW, not the guard. */
  readonly id: string;
  /** One clause. What must always be true. */
  readonly statement: string;
  /** The incident that bought this. Absent only if it predates the practice. */
  readonly incident: string;
  readonly level: EnforcementLevel;
  /** Where the enforcement lives — the thing a reader should open next. */
  readonly mechanism: string;
  readonly check: Check;
  /** Each MUST make `check` fail. An empty list is not allowed. */
  readonly mutations: readonly Mutation[];
  /** Each must leave `check` passing. For guards that could be too broad. */
  readonly legitimate?: readonly Mutation[];
}

/** A scratch path used by create-mutations. Never committed; the harness
 *  removes it. Inside src/ so the lint config and tsconfig both see it. */
const SCRATCH = 'src/invariant-probe.ts';

export const INVARIANTS: readonly Invariant[] = [
  // ── SPEND ────────────────────────────────────────────────────────────
  {
    id: 'spend.gemini-sdk-has-one-owner',
    statement:
      'Only GatedGeminiClient may import the Gemini SDK; a second client is a second spend gate to forget.',
    incident:
      'The gate was a call-site convention policed by a scanner that matched the word inside a COMMENT, so the gate on the main generation path could be deleted with CI green.',
    level: 'lint',
    mechanism: 'eslint.config.mjs — no-restricted-imports, @google/genai',
    check: { command: `npx eslint ${SCRATCH}`, reads: 'the boundary rule' },
    mutations: [
      {
        file: SCRATCH,
        content:
          "import { GoogleGenAI } from '@google/genai';\nexport const c = GoogleGenAI;\n",
      },
      {
        // The subpath export that walked past a `paths` entry, because those
        // match a specifier EXACTLY. This mutation is why the rule uses
        // `patterns`, and it is here so it can never regress to `paths`.
        file: SCRATCH,
        content:
          "import { GoogleGenAI } from '@google/genai/node';\nexport const c = GoogleGenAI;\n",
      },
      {
        // A dynamic import is an import, and no-restricted-imports cannot see
        // one — hence a separate syntax selector.
        file: SCRATCH,
        content:
          "export async function f() {\n  return await import('@google/genai');\n}\n",
      },
    ],
    legitimate: [
      {
        // A type cannot be constructed, injected, or called.
        file: SCRATCH,
        content:
          "import type { GenerateContentResponse } from '@google/genai';\nexport type R = GenerateContentResponse;\n",
      },
    ],
  },
  {
    id: 'spend.gated-client-is-not-constructible-elsewhere',
    statement:
      'Only LlmService may construct GatedGeminiClient, because its gate is a constructor argument.',
    incident:
      'The commit claiming an ungated paid call was "unrepresentable" was too strong: `new GatedGeminiClient(key, async () => {})` is an ungated paid client in one line.',
    level: 'lint',
    mechanism: 'eslint.config.mjs — no-restricted-imports, gated-gemini-client',
    check: { command: `npx eslint ${SCRATCH}`, reads: 'the boundary rule' },
    mutations: [
      {
        file: SCRATCH,
        content:
          "import { GatedGeminiClient } from './modules/external-integrations/llm/gated-gemini-client';\nexport const ungated = new GatedGeminiClient('k', async () => {});\n",
      },
    ],
  },
  {
    id: 'spend.every-gemini-surface-is-classified',
    statement:
      'Every method on the Gemini client is declared paid or free, and a paid one runs the spend gate.',
    incident:
      'updateCacheTtl was filed under FREE while the registry calling it metered every extension as billable cache storage — the embeddings defect, one method away from its own fix.',
    level: 'boot',
    mechanism:
      'gemini-billable-surfaces.ts SURFACE_BILLING + the client constructor',
    check: {
      command:
        'npx jest src/modules/external-integrations/llm/gated-gemini-client.spec.ts --silent',
      reads: 'construction, which rejects an unclassified surface',
    },
    mutations: [
      {
        file: 'src/modules/external-integrations/llm/gated-gemini-client.ts',
        find: '  async createBatch(',
        replace:
          '  async patchCache(name: string): Promise<void> {\n    await this.raw.caches.update({ name, config: {} });\n  }\n\n  async createBatch(',
      },
    ],
  },
  {
    id: 'spend.a-ceiling-counts-billed-dollars',
    statement:
      'A spend ceiling or campaign envelope may only be given BilledMicros, never a raw ledger figure.',
    incident:
      'An $82 envelope spent ~$139 billed before registering as breached, because mint and drain used different currencies. A scanner checked two files; the third drain (TomTom) had never been grossed at all.',
    level: 'unrepresentable',
    mechanism: 'spend-currency.ts LedgerMicros / BilledMicros brands',
    check: {
      command: 'npx tsc --noEmit -p tsconfig.json',
      reads: 'the brands',
    },
    mutations: [
      {
        file: 'src/modules/external-integrations/shared/usage-ledger.service.ts',
        find: "this.billed('gemini', ledgerMicros(micros))",
        replace: 'micros',
      },
      {
        file: 'src/modules/external-integrations/shared/usage-ledger.service.ts',
        find: 'recordSpend(campaignId, event.service, ledgerMicros(micros))',
        replace: 'recordSpend(campaignId, event.service, micros)',
      },
    ],
  },
  {
    id: 'spend.enrichment-failure-count-only-increments',
    statement: 'enrichmentFailureCount is incremented, never assigned.',
    incident:
      'Its predecessor was ASSIGNED the number of Google candidates, so the best-evidenced restaurants were archived, and the error path wrote nothing and re-enriched weekly at real Places spend.',
    level: 'lint',
    mechanism: 'eslint.config.mjs + enrichment-failure-counter.ts',
    check: { command: `npx eslint ${SCRATCH}`, reads: 'the counter selector' },
    mutations: [
      {
        file: SCRATCH,
        content:
          'declare const ranked: unknown[];\nexport const d = { enrichmentFailureCount: ranked.length };\n',
      },
      {
        // A numeric literal. The first selector keyed on `value.value`, which
        // does not regex-match a number, so `= 3` slipped through until it
        // keyed on `value.raw`.
        file: SCRATCH,
        content: 'export const d = { enrichmentFailureCount: 3 };\n',
      },
    ],
    legitimate: [
      {
        // The false positive that `Property > Identifier` produced by matching
        // the KEY as well as the value.
        file: SCRATCH,
        content:
          'export const q = { select: { enrichmentFailureCount: true } };\n',
      },
      {
        file: SCRATCH,
        content:
          'export const d = { enrichmentFailureCount: { increment: 1 } };\n',
      },
    ],
  },

  {
    id: 'photos.every-read-names-its-viewer',
    statement:
      'PhotoReadService is reached only through the PhotoReads seam, which makes the viewer mandatory and pushes the block exclusion into the query.',
    incident:
      'Blocking was enforced per call site; PhotoReadService had no block logic at all and cardStrips took no viewer, so a blocked author could front a list tile. The first fix filtered AFTER the LIMIT, which returned short pages and reported totalCount as the page length.',
    level: 'lint',
    mechanism: 'eslint.config.mjs — no-restricted-imports, photo-read.service',
    check: { command: `npx eslint ${SCRATCH}`, reads: 'the seam boundary' },
    mutations: [
      {
        file: SCRATCH,
        content:
          "import { PhotoReadService } from './modules/photos/photo-read.service';\nexport const r = PhotoReadService;\n",
      },
    ],
    legitimate: [
      {
        // A DTO type is not a second door — the tile gallery imports one.
        file: SCRATCH,
        content:
          "import type { PhotoStripItemDto } from './modules/photos/photo-read.service';\nexport type T = PhotoStripItemDto;\n",
      },
    ],
  },

  {
    id: 'spend.tomtom-vendor-has-one-door',
    statement:
      'The TomTom key and host are only spellable in TomtomChainProbeAdapter and configuration.ts; everything else consumes the port.',
    incident:
      'Two operator scripts read TOMTOM_API_KEY themselves and fetch()ed the vendor directly — ungoverned, unmetered (zero ledger rows, the photoMedia shape), money-ungated, and printing a 429 as "the vendor models nothing here".',
    level: 'lint',
    mechanism: 'eslint.config.mjs — TomTom vendor-surface selectors',
    check: { command: `npx eslint ${SCRATCH}`, reads: 'the vendor boundary' },
    mutations: [
      {
        file: SCRATCH,
        content: 'export const k = process.env.TOMTOM_API_KEY;\n',
      },
      {
        file: SCRATCH,
        content:
          'export const u = `https://api.tomtom.com/search/2/reverseGeocode/x.json`;\n',
      },
    ],
  },
  {
    id: 'spend.tomtom-money-gate-inside-the-adapter',
    statement:
      'Every TomTom vendor call passes assertTomtomSpendOpen inside the adapter; a closed budget is a typed denied, and the vendor is never reached.',
    incident:
      'TomTom had NO money gate: per-minute pools alone permit ~$1,400/day of scarce draws indefinitely against a PREPAID balance no API can read.',
    level: 'behaviour',
    mechanism: 'tomtom-chain-probe.adapter + tomtom.monthlySpend perMonth pool',
    check: {
      command:
        'npx jest src/modules/places/tomtom-chain-probe.adapter.spec.ts --silent',
      reads: 'the closed-gate test, which asserts zero governed draws',
    },
    mutations: [
      {
        file: 'src/modules/places/tomtom-chain-probe.adapter.ts',
        // RE-DERIVED 2026-08-05. The gate used to be inlined at the top of
        // probe(), and this mutation deleted that block. It has since moved
        // into spendGateVerdict(), shared by probe() and fetchPolygon() — so
        // the mutation now targets the verdict itself, which is strictly
        // better: one edit disarms the gate at EVERY call site rather than
        // the one that happened to be inlined.
        find: "      if (error instanceof SpendBudgetClosedError) {\n        return { kind: 'denied' };\n      }",
        replace:
          '      if (error instanceof SpendBudgetClosedError) {\n        return null; // MUTATED: a closed budget no longer denies.\n      }',
      },
    ],
  },
  {
    id: 'ledger.a-polygon-fault-is-not-a-vendor-miss',
    statement:
      "fetchPolygon classifies transport faults, malformed bodies and un-echoed ids as 'failed', never as the remembered 'miss'.",
    incident:
      'PolygonFetchResult had no fault arm, so three bad HTTP responses in three hourly ticks read as three vendor misses and PERMANENTLY retired the place from polygon promotion (refused_at) — P5 verbatim, on the scarce-draw money path.',
    level: 'behaviour',
    mechanism: 'PolygonFetchResult failed arm + promoteOne routing',
    check: {
      command:
        'npx jest src/modules/places/tomtom-chain-probe.adapter.spec.ts --silent',
      reads: 'the fault-classification tests against the real adapter',
    },
    mutations: [
      {
        file: 'src/modules/places/tomtom-chain-probe.adapter.ts',
        find: "// recordAttempt, which was right by luck, not by type.\n      return {\n        kind: 'failed',\n        reason: describeTransportFault(error),\n        scope: 'systemic',\n      };",
        replace:
          "// MUTATED: the pre-2026-08-04 conflation.\n      return { kind: 'miss' };",
      },
    ],
  },

  // ── CONFIGURATION ────────────────────────────────────────────────────
  {
    id: 'config.app-env-has-one-reader',
    statement:
      'APP_ENV is read only through resolveAppEnv/normalizeAppEnv, because its value becomes a Redis key prefix.',
    incident:
      'Two spellings meant two disjoint rate-limit windows and a silently doubled ceiling on the two vendors that cost the most.',
    level: 'lint',
    mechanism: 'eslint.config.mjs — no-restricted-syntax, APP_ENV selectors',
    check: { command: `npx eslint ${SCRATCH}`, reads: 'the APP_ENV selectors' },
    mutations: [
      { file: SCRATCH, content: 'export const v = process.env.APP_ENV;\n' },
      // The three evasions a red team walked past, all silent at the time.
      {
        file: SCRATCH,
        content: "export const v = process['env']['APP_ENV'];\n",
      },
      {
        file: SCRATCH,
        content:
          'const { APP_ENV } = process.env;\nexport const v = APP_ENV;\n',
      },
      {
        file: SCRATCH,
        content: 'const env = process.env;\nexport const v = env.APP_ENV;\n',
      },
    ],
  },
  {
    id: 'config.one-boolean-flag-dialect',
    statement:
      'A boolean env flag is read through isEnvFlagEnabled / isEnvFlagExplicitlyDisabled, never compared to a string literal.',
    incident:
      'COLLECTION_SCHEDULER_ENABLED had two readers with two answers, so =TRUE started the collection pacer while Reddit skipped credential validation.',
    level: 'lint',
    mechanism: 'eslint.config.mjs + shared/config/env-flag.ts',
    check: { command: `npx eslint ${SCRATCH}`, reads: 'the flag selector' },
    mutations: [
      {
        file: SCRATCH,
        content: "export const on = process.env.X === 'true';\n",
      },
      {
        file: SCRATCH,
        content: "export const off = process.env.X !== 'false';\n",
      },
    ],
  },

  {
    id: 'schema.every-foreign-key-is-indexed',
    statement:
      "Every @relation's referencing columns are the LEADING columns of some index on that model.",
    incident:
      'poll_topics carried four un-indexed foreign keys to core_entities: 96,025 sequential scans over 18,284 rows (24,006 per key, four per deleted entity, remainder zero) and 624 million tuples read. Entity deletion was already the expensive operation here — the ~$118 Austin wipe — and had been paying a quadratic trigger tax on top the whole time. Nothing broke, nothing logged, no test went red.',
    level: 'schema',
    mechanism: 'scripts/check-foreign-key-indexes.ts over prisma/schema.prisma',
    check: {
      command: 'npx ts-node -T scripts/check-foreign-key-indexes.ts',
      reads: "every @relation fields:[...] against the model's index prefixes",
    },
    mutations: [
      {
        // The defect as it actually shipped: the model declares the relation
        // and simply never indexes it. Checking the SCHEMA rather than the
        // live database is what makes this mutation a file edit at all — a
        // database check could only find the defect after it was applied.
        file: 'prisma/schema.prisma',
        find: '  @@index([targetDishId], map: "idx_poll_topics_target_dish_id")\n',
        replace: '',
      },
    ],
  },

  // ── THE LEDGER ───────────────────────────────────────────────────────
  {
    // D148 REPLACED THE MECHANISM, SO THE ENTRY MOVED WITH IT.
    //
    // The law used to be "every reader remembers to call publicAuthorIdentity",
    // enforced by scripts/check-author-identity.ts — a text scan that F9481
    // proved VACUOUS: its grep for `username: true` matched exactly the eight
    // files it exempted, so the loop body never executed once. It could not
    // have caught anything, and it was the only proof that deleted people stay
    // nameless.
    //
    // The law is now DATA, not diligence: deletion itself nulls the identity
    // columns, so a reader that forgets the resolver renders a BLANK, not a
    // name. That is a property of the database after one statement, and it is
    // proven against a real one.
    id: 'identity.stored-keys-match-the-fold',
    statement:
      'Every stored identity_key equals canonicalFold(name) under the CURRENT fold algorithm (FOLD_ALGORITHM_VERSION) — a behavioral fold change cannot ship without either a corpus backfill or this check going red.',
    incident:
      'Multilingual ruling R5 (2026-08-12): the narrowed heal (456f74894) only re-keys NULL/recent rows, so a fold-law change (the planned tone-mark work) would strand every old key at the previous algorithm; tier-1/2.5 probes and every SQL identity join then silently miss, and nothing in the repo compared the column to the function.',
    level: 'behaviour',
    mechanism:
      'scripts/check-fold-drift.ts — recomputes canonicalFold over a deterministic sample PLUS every non-ASCII-named active row (where fold revisions actually differ) and exits 1 on any divergence; entity-identity.ts FOLD_ALGORITHM_VERSION records which algorithm the corpus is keyed under.',
    check: {
      command: 'npx ts-node -T scripts/check-fold-drift.ts --sample=500',
      reads: 'real stored keys in a real database against the live fold',
    },
    mutations: [
      {
        // A behavioral fold change with no backfill: canonicalFold's output
        // moves, the stored keys do not, and the detector must see it.
        file: 'src/modules/content-processing/entity-resolver/entity-identity.ts',
        find: 'export function canonicalFold(name: string): string {\n  return foldWithAccentPolicy(name, true);\n}',
        replace:
          "export function canonicalFold(name: string): string {\n  return foldWithAccentPolicy(name, true).replace(/a/g, 'z'); // MUTATED fold\n}",
      },
    ],
  },
  {
    id: 'identity.a-deleted-person-has-no-name-in-the-database',
    statement:
      'From the moment deletion is requested, users.username/display_name/avatar_url are NULL and the originals live only in users.deleted_identity — so no read anywhere can expose a departed person’s name, whatever it does with the row.',
    incident:
      "Deletion left the real name in the visible columns for the whole 30-day window and relied on every reader calling publicAuthorIdentity. Five surfaces each invented their own fallback — '?', 'user', a seeded pseudo-name, a bare null, a blank byline — and the scanner meant to catch the sixth was itself vacuous (F9481: its grep matched only its own exemptions).",
    level: 'behaviour',
    mechanism:
      'account-deletion.service.ts deleteAccount — ONE atomic UPDATE stashes {username, displayName, avatarUrl} into deleted_identity and nulls the three columns; restoreAccount swaps them back; the purge nulls the stash. syncFromClerkClaims skips its profile backfill while deletedAt is set, or the next authenticated request would resurrect the name from the Clerk claims.',
    check: {
      command:
        'npx jest --runInBand --testPathIgnorePatterns=/dist/ --testRegex ".*\\.integration\\.spec\\.ts$" --testPathPattern deleted-identity --silent',
      reads: 'a real user in a real database, deleted and restored for real',
    },
    mutations: [
      {
        // Revert the stash-and-null: the request marks the account deleted and
        // leaves the name sitting in the visible columns, which is precisely
        // the pre-D148 world.
        file: 'src/modules/identity/account-deletion.service.ts',
        find: '        deletedIdentity: {\n          username: user.username,\n          displayName: user.displayName,\n          avatarUrl: user.avatarUrl,\n        },\n        username: null,\n        displayName: null,\n        avatarUrl: null,\n      },\n    });',
        replace:
          '      }, // MUTATED: the identity is left visible for the whole grace window.\n    });',
      },
    ],
  },
  {
    id: 'signals.subject-text-emission',
    statement:
      "A person's typed words leave a query only if the read is scoped to that person's own actor, or the words cleared the k-anonymity floor (signal_emittable_terms).",
    incident:
      "Measured 2026-08-03: 26 of 30 distinct search subjects had exactly ONE actor behind them, and the only k-floor in the codebase was one service's private constant — three other readers that emit text had none. Two successor guards were themselves too weak: a shared SQL fragment bound only callers who imported it, and its test counted call sites in ONE file while warm-query-embedding-cache read the raw column and shipped the terms to a third-party embedding API.",
    level: 'lint',
    mechanism:
      'scripts/check-subject-text-emission.ts — a CLOSED allowlist over every file in src/ and scripts/ that touches the column, each classified own-scoped | internal-pipeline | floored | declaration. A new unclassified reader fails until someone writes down which kind it is; the failure IS the design review. The floor itself is the database view, not any TypeScript.',
    check: {
      command: 'npx ts-node -T scripts/check-subject-text-emission.ts',
      reads: 'every file in the repo that names the column, not one file',
    },
    mutations: [
      {
        file: SCRATCH,
        content:
          'export const q = `SELECT subject_text FROM signals GROUP BY subject_text`;\n',
      },
    ],
  },
  {
    id: 'testing.redirect-double-answers-the-question-asked',
    statement:
      'A spec standing in for prisma.entityRedirect.findMany uses entityRedirectDouble, which keys on the id set it was asked about — never a mock that answers every argument identically.',
    incident:
      'Four specs written to prove the merged-entity leak was CLOSED stubbed the redirect read with an unconditional mockResolvedValue. Mutating the production call to `fromEntityId: { in: [] }` — a resolver asking about nothing, so every merged-away entity keeps serving under its stale identity — left all four green. The redirect read is a pure lookup whose only input is an id set, so a one-answer mock erases the only thing worth asserting; and within a day of the fixes there were already two byte-identical private redirectTable helpers plus two inline variants.',
    level: 'lint',
    mechanism:
      'eslint.config.mjs — a no-restricted-syntax selector on `entityRedirect > findMany > mockResolvedValue/mockReturnValue`, scoped to findMany so the differently-shaped findUnique read is not a false positive. src/shared/testing/prisma-doubles.ts is the one honest double (both directions: forward "what did this become", reverse "what points at this"), and it THROWS on a query shape it does not model rather than inventing an answer.',
    check: {
      command: `npx eslint ${SCRATCH}`,
      reads: 'the entityRedirect selector',
    },
    mutations: [
      {
        file: SCRATCH,
        content:
          'export const prisma = { entityRedirect: { findMany: jest.fn().mockResolvedValue([]) } };\n',
      },
      {
        file: SCRATCH,
        content:
          'export const prisma = { entityRedirect: { findMany: jest.fn().mockReturnValue([]) } };\n',
      },
    ],
  },
  {
    id: 'ledger.subject-identity-resolves-in-one-place',
    statement:
      'The redirect join and the fold-back are built by signals/subject-identity, never hand-rolled.',
    incident:
      'The literal COALESCE(r.to_entity_id, s.subject_id) lived at fourteen sites in one reader, which is how three SQL dialects coexisted under one vocabulary.',
    level: 'lint',
    mechanism: 'eslint.config.mjs — TemplateElement selectors',
    check: { command: `npx eslint ${SCRATCH}`, reads: 'the SQL selectors' },
    mutations: [
      {
        file: SCRATCH,
        content:
          'export const q = `SELECT COALESCE(r.to_entity_id, s.subject_id) AS id FROM signals s`;\n',
      },
      {
        file: SCRATCH,
        content:
          'export const q = `FROM signals s LEFT JOIN entity_redirects r ON r.from_entity_id = s.subject_id`;\n',
      },
    ],
  },
  {
    id: 'ledger.a-merged-id-keeps-its-history',
    statement:
      'A reader asked about a survivor id finds acts recorded against the id it absorbed.',
    incident:
      'F202 — lastEntityViewAt filtered subject_id raw, so the repeat-view dedupe valve stopped seeing merged history and re-recorded views it had already seen, forever.',
    level: 'behaviour',
    mechanism: 'subject-identity.integration.spec.ts, against a real Postgres',
    check: {
      command:
        'yarn test:db --testPathPattern="subject-identity.integration" --silent',
      reads: 'a real merge, through the real reader',
    },
    mutations: [
      {
        file: 'src/modules/signals/signal-demand-read.service.ts',
        find: "      ${redirectJoinSql('s')}\n      WHERE s.actor_id = ${actorId}::uuid\n        AND s.kind = 'entity_view'\n        AND ${subjectMatchesSql('s', Prisma.sql`${params.entityId}::uuid`)}",
        replace:
          "      WHERE s.actor_id = ${actorId}::uuid\n        AND s.kind = 'entity_view'\n        AND s.subject_id = ${params.entityId}::uuid",
      },
    ],
  },
  {
    id: 'ledger.extraction-scope-is-defined-once',
    statement:
      'The activation pointer and the run-excluding supersede belong to ExtractionScopeService.',
    incident:
      'Three copies of the activation pair coexisted; the guard covered src/ only and never saw the script hand-rolling the join inside an INSERT.',
    level: 'lint',
    mechanism: 'eslint.config.mjs — activation selectors',
    check: {
      command: `npx eslint ${SCRATCH}`,
      reads: 'the activation selectors',
    },
    mutations: [
      {
        file: SCRATCH,
        content:
          'export const q = `JOIN collection_source_documents d ON d.active_extraction_run_id = e.extraction_run_id`;\n',
      },
      {
        file: SCRATCH,
        content:
          'declare const row: { activeExtractionRunId: string };\nexport const r = row.activeExtractionRunId;\n',
      },
    ],
  },
  {
    id: 'ledger.an-instant-means-the-same-thing-everywhere',
    statement:
      'A signals.occurred_at comparison selects the same rows under any session timezone.',
    incident:
      'occurred_at was the last naive column; one query compared it to now() and read 601 rows under UTC and 613 under America/Chicago. Converting it to timestamptz then made bare ::date literals the hazard — 9 / 0 / 12 rows for one day.',
    level: 'behaviour',
    mechanism: 'occurred-at-timezone.integration.spec.ts + occurred-at.ts',
    check: {
      command: 'yarn test:db --testPathPattern="occurred-at-timezone" --silent',
      reads: 'the same query under six timezones, against a real Postgres',
    },
    mutations: [
      {
        file: 'src/modules/signals/occurred-at.ts',
        find: 'return Prisma.sql`${`${dayKey} 00:00:00+00`}::timestamptz`;',
        replace: 'return Prisma.sql`${dayKey}::date`;',
      },
    ],
  },

  // ── ACCESS ───────────────────────────────────────────────────────────
  {
    id: 'access.no-route-the-paywall-would-403',
    statement:
      'Every registered route either produces a request.user or declares itself public.',
    incident:
      'The ops dashboard and the root route would both have 403d under ENTITLEMENT_GATING=enforce, and log mode cannot warn you because log mode is the mode where it still works.',
    level: 'boot',
    mechanism: 'PaywallCoverageAudit, over the DI graph',
    check: {
      command:
        'npx jest src/modules/entitlements/paywall-coverage.audit.spec.ts --silent',
      reads: 'the audit against synthetic controllers, including its RED cases',
    },
    mutations: [
      {
        // Blind the audit: if nothing looks like a route it must refuse to be
        // silent. This is the vacuity hole the first version shipped with.
        file: 'src/modules/entitlements/paywall-coverage.audit.ts',
        find: "const ROUTE_PATH_METADATA = 'path';",
        replace:
          "const ROUTE_PATH_METADATA = 'path-renamed-by-a-nest-upgrade';",
      },
      {
        // Treat every guard as if it required authentication: the
        // operator-authenticated route then looks covered, which IS the
        // original defect.
        //
        // THIS MUTATION HAS ALREADY ROTTED ONCE, and the harness caught it on
        // its first full run: a parallel session replaced the boolean
        // @BearsRequestUser marker with the three-valued AuthenticationEffect,
        // so the old anchor (`const bearsUser =`) stopped existing. That is the
        // designed behaviour — a proof that quietly stops applying is the same
        // lie as a guard that quietly stops firing — but it is worth naming
        // here, because it is the first evidence that the anti-rot check earns
        // its keep.
        file: 'src/modules/entitlements/paywall-coverage.audit.ts',
        find: "if (effects.includes('required')) continue;",
        replace: 'if (true) continue;',
      },
    ],
  },

  // ── I18N ─────────────────────────────────────────────────────────────
  {
    id: 'i18n.mobile-locales-are-a-subset-of-the-api',
    statement:
      'Every locale the mobile app supports is one the api can serve, and the two DEFAULT_LOCALEs agree.',
    incident:
      'SUPPORTED_LOCALES + DEFAULT_LOCALE are declared independently in api (shared/locale/supported-locales.ts) and mobile (i18n/locale-resolution.ts) with nothing binding them. The mobile client sets Accept-Language from ITS list and the api negotiates against ITS own, so a locale added to one side alone is silently served the DEFAULT — a Spanish/new-language UI answered in English. The two files live in two apps that never import each other, so no type or test spans them.',
    level: 'behaviour',
    mechanism:
      'scripts/check-locale-parity.ts — imports the api set, reads the mobile file textually across the app boundary, asserts subset + default agreement',
    check: {
      command: 'npx ts-node -T scripts/check-locale-parity.ts',
      reads: 'both apps’ SUPPORTED_LOCALES + DEFAULT_LOCALE, cross-app',
    },
    mutations: [
      {
        // A locale the mobile app claims to support but the api cannot serve.
        file: '../mobile/src/i18n/locale-resolution.ts',
        find: "export const SUPPORTED_LOCALES = ['en', 'es'] as const;",
        replace:
          "export const SUPPORTED_LOCALES = ['en', 'es', 'fr'] as const;",
      },
      {
        // The two defaults diverging — mobile falls back to a tag the api does not.
        file: '../mobile/src/i18n/locale-resolution.ts',
        find: "export const DEFAULT_LOCALE: SupportedLocale = 'en';",
        replace: "export const DEFAULT_LOCALE: SupportedLocale = 'es';",
      },
    ],
  },

  // ── CONCURRENCY ──────────────────────────────────────────────────────
  {
    id: 'concurrency.a-session-lock-never-meets-a-pool',
    statement:
      "pg_try_advisory_lock / pg_advisory_unlock are spellable only inside AdvisoryLockService, which holds one dedicated connection for the lock's lifetime. (pg_advisory_xact_lock is unrestricted — a transactional lock cannot strand.)",
    incident:
      'Four single-runner lanes (demand vocabulary, the polygon promotion drain, the knowledge rail, the global rescore) took their advisory lock through the POOLED PrismaService: the release landed on a different backend and freed nothing. Measured 25/25 failed round-trips under 8-way pool traffic. Prisma never closes a pooled connection, so the "it self-heals when the connection closes" comment each site carried was false — the lock stranded for the life of the process, every later pass lost the try-lock, and run() returned its EMPTY_SUMMARY zeros forever, which reads exactly like "there was nothing to do".',
    level: 'lint',
    mechanism: 'eslint.config.mjs — the session-advisory-lock selector',
    check: {
      command: `npx eslint ${SCRATCH}`,
      reads: 'the advisory-lock selector',
    },
    mutations: [
      {
        // The defect exactly as it occurred, in a template literal...
        file: SCRATCH,
        content:
          'export const sql = (k: number) => `SELECT pg_try_advisory_lock(${k})`;\n',
      },
      {
        // ...and as a plain string, which the TemplateElement half misses.
        file: SCRATCH,
        content: "export const sql = 'SELECT pg_advisory_unlock(1)';\n",
      },
    ],
    legitimate: [
      {
        // THE TRANSACTIONAL LOCK IS THE OTHER RIGHT ANSWER, and two live
        // sites use it. A rule that flagged it would be telling people to
        // replace a strand-proof mechanism with a merely careful one.
        file: SCRATCH,
        content:
          "export const sql = 'SELECT pg_advisory_xact_lock(hashtext($1))';\n",
      },
    ],
  },

  // ── SOURCE ───────────────────────────────────────────────────────────
  {
    id: 'source.files-are-text',
    statement:
      'No file a person can review — every tracked or not-yet-added file in the REPOSITORY, minus a short denylist of formats that are binary by definition — contains a raw NUL byte. A file a person cannot grep or diff is a file nobody reviews.',
    incident:
      'Two files carried a literal NUL typed into a dedupe-key template (`${locale}\\0${form}`). It compiled and ran correctly, and made both files BINARY to content sniffing: grep refused them without -a, git diff printed "Binary files differ" instead of the change, and the line could not be code-reviewed. The escape `\\0` produces the identical string. Nothing in a test run reads source as BYTES, so nothing could ever have noticed.',
    level: 'behaviour',
    mechanism:
      'scripts/check-source-is-text.ts — enumerates the repository with `git ls-files --cached --others --exclude-standard`, reads each file as a Buffer and refuses a zero byte (and refuses to pass having scanned nothing). SCOPE, stated exactly, because it used to be narrower than the name (F-infra, 2026-08-11): it walked four directories under apps/api and matched eleven extensions, so a NUL in a .sh, a .txt, the mobile app or the repo-root scripts passed by never being looked at. Scope is now the whole repo by DENYLIST — the ONLY exclusions are git-ignored paths (node_modules, dist, build output) and the BINARY_EXTENSIONS list in the script (images, fonts, archives, media, key material). A new language or config format is covered the day it is committed. Measured 3,257 files in 0.7s.',
    check: {
      command: 'npx ts-node -T scripts/check-source-is-text.ts',
      reads:
        'the bytes of every reviewable file in the repo, which no other gate does',
    },
    mutations: [
      {
        // The defect exactly as it occurred: a NUL inside a template literal.
        file: SCRATCH,
        // The NUL is written as a SOURCE ESCAPE so this file stays
        // text; the harness writes the real byte into the probe.
        content:
          'export const key = (a: string, b: string) => `${a}\u0000${b}`;\n',
      },
      {
        // THE SCOPE ITSELF, proven: a shell script at the REPO ROOT — outside
        // apps/api, with an extension the old scanner never matched. Before
        // the repo-wide rewrite this mutation passed, which is the whole
        // finding.
        file: '../../scripts/invariant-probe-nul.sh',
        content: 'echo "a\u0000b"\n',
      },
    ],
    legitimate: [
      {
        // The ESCAPE is the fix, not the defect — the guard must not refuse
        // the very thing it tells people to write.
        file: SCRATCH,
        content:
          'export const key = (a: string, b: string) => `${a}\\0${b}`;\n',
      },
    ],
  },

  // ── THE REPO-ROOT SCANNERS ───────────────────────────────────────────
  //
  // Everything above lives in apps/api. These five mechanisms live at the
  // REPOSITORY root — scripts/*.mjs and scripts/*.sh, run by CI rather than by
  // anything apps/api owns — and until now not one of them was registered,
  // which is precisely backwards: the census's 19 historical guard failures
  // were dominated by exactly this population (separate artifacts, exercised by
  // nothing else, defeated by a comment, a rename, or a regex that only matched
  // the already-fixed shape). Each entry below earns its place on all three
  // tests, and the ones DECLINED are named in the doc block at the bottom of
  // this file so the next author does not re-litigate them.
  //
  // The checks run `node ../../scripts/...` because every check.command runs
  // from apps/api. The mutations reach out of apps/api the same way the i18n
  // and source entries already do.
  {
    id: 'source.a-backtick-cannot-quietly-end-a-sql-template',
    statement:
      'No line-initial SQL comment inside a TypeScript file contains a backtick — including in a file nobody has `git add`ed yet.',
    incident:
      'CLAUDE.md, "cost 4 round trips in one day": a backtick in a `Prisma.sql` comment CLOSES the template, and tsc then reports TS1005/TS1134 about commas and variable declarations, anchored a line or two off and naming neither the backtick nor the template. tsc catches the break; only this names it. And a parser-based rule cannot run at all on a file that no longer parses.',
    level: 'lint',
    mechanism:
      'scripts/check-sql-comment-backticks.mjs, on scripts/lib/scan-repo.mjs',
    check: {
      command: 'node ../../scripts/check-sql-comment-backticks.mjs',
      reads: 'every .ts/.tsx in the repository, tracked or merely present',
    },
    mutations: [
      {
        // THE UNTRACKED PROBE IS THE POINT. This file is not in the index, and
        // before scan-repo.mjs the gate enumerated the index ONLY — so this
        // exact mutation PASSED, and the author of a brand-new file got the
        // TS1005 cascade with no gate to name it. The mutation is therefore
        // proof of the scope as much as of the rule.
        file: SCRATCH,
        content:
          'export const q = `\n  SELECT 1\n  -- a bare `::date` literal resolves in the session timezone\n`;\n',
      },
    ],
    legitimate: [
      {
        // The fix the gate tells you to write: the term bare. A gate that
        // refused its own remedy would be untrustworthy.
        file: SCRATCH,
        content:
          'export const q = `\n  SELECT 1\n  -- a bare ::date literal resolves in the session timezone\n`;\n',
      },
    ],
  },
  {
    id: 'ledger.the-evidence-ledger-has-one-write-door',
    statement:
      'Every write to the two event-ledger tables goes through writeRestaurantEvents / writeRestaurantEntityEvents, which resolve entity_redirects at insert time.',
    incident:
      'The rule was prose in a header and enforced by nothing. A direct write lands live evidence on a merged-away tombstone, where the projection rebuild will never see it again — the evidence is not lost loudly, it is simply never counted. ESLint cannot hold this: the tree-wide no-restricted-syntax block already exempts the two files that legitimately write the ledger.',
    level: 'lint',
    mechanism:
      'scripts/check-event-ledger-chokepoint.mjs, on scripts/lib/scan-repo.mjs',
    check: {
      command: 'node ../../scripts/check-event-ledger-chokepoint.mjs',
      reads: 'every .ts/.tsx/.sql in the repository, tracked or merely present',
    },
    mutations: [
      {
        // A new service writing the ledger directly — the attractor exactly.
        // Untracked again, and again that is load-bearing: a new writer is a
        // live defect from the moment the file exists, not from the moment
        // somebody stages it.
        file: SCRATCH,
        content:
          'declare const tx: {\n  restaurantEvent: { createMany: (a: unknown) => Promise<void> };\n};\ndeclare const rows: unknown[];\nexport const w = async () => tx.restaurantEvent.createMany({ data: rows });\n',
      },
    ],
  },
  {
    id: 'deploy.a-manifest-cannot-silently-not-serve',
    statement:
      'No railway*.json declares deploy.startCommand or a non-empty build.watchPatterns.',
    incident:
      'Both are burned into CLAUDE.md after real production incidents. `startCommand` OVERRIDES the Dockerfile CMD and is exec\'d WITHOUT a shell, so `sh -c "migrate && start"` becomes argv: the container migrates, exits 0, and never serves — exit 0 is the cruelty. `watchPatterns` makes Railway SKIP a deploy while printing "Deploy complete"; on 2026-08-02 prod ran the wrong commit and the smoke passed because it checked uptime rather than the running commit.',
    level: 'lint',
    mechanism: 'scripts/check-railway-manifests.mjs',
    check: {
      command: 'node ../../scripts/check-railway-manifests.mjs',
      reads: 'every railway*.json in the repository',
    },
    mutations: [
      {
        file: '../../railway.json',
        find: '    "healthcheckPath": "/health",',
        replace:
          '    "startCommand": "node apps/api/dist/main.js",\n    "healthcheckPath": "/health",',
      },
      {
        file: '../../railway.json',
        find: '  "build": {\n    "builder": "DOCKERFILE",',
        replace:
          '  "build": {\n    "watchPatterns": ["apps/api/**"],\n    "builder": "DOCKERFILE",',
      },
    ],
  },
  {
    id: 'deploy.a-heavy-migration-yields-its-parallel-workers',
    statement:
      'A migration that rewrites a column or runs an unbounded UPDATE sets max_parallel_workers_per_gather = 0 and max_parallel_maintenance_workers = 0 ABOVE the heavy statement.',
    incident:
      'Prod postgres has a small /dev/shm, so a heavy migration dies with "could not resize shared memory segment". Migrations run in the container\'s BOOT command, so that is not a failed migration — it is a P3009 crash-loop that takes the whole deploy with it. AUTHORING.md §1 had required the two lines since F303 and nothing enforced it; the heaviest rewrite in the corpus carried the guard zero times. F3914 then found the position hole: a SET below the rewrite protects nothing.',
    level: 'schema',
    mechanism: 'scripts/check-migration-parallel-guard.mjs',
    check: {
      command: 'node ../../scripts/check-migration-parallel-guard.mjs',
      reads:
        'every prisma/migrations/*/migration.sql, guarded or grandfathered',
    },
    mutations: [
      {
        // A NEW migration, because that is the only shape this defect has.
        // Every heavy migration in the corpus today is grandfathered by pinned
        // sha, so editing one proves nothing about what the NEXT author's file
        // would do — and the next author's file is the entire attractor. (This
        // is the mutation the harness grew directory-creation for.)
        file: 'prisma/migrations/29990101000000_invariant_probe_heavy/migration.sql',
        content: 'ALTER TABLE core_entities ALTER COLUMN name TYPE text;\n',
      },
    ],
    legitimate: [
      {
        // The same heavy statement, guarded at the top: the gate must not make
        // the correct migration unwritable.
        file: 'prisma/migrations/29990101000000_invariant_probe_heavy/migration.sql',
        content:
          'SET max_parallel_workers_per_gather = 0;\nSET max_parallel_maintenance_workers = 0;\n\nALTER TABLE core_entities ALTER COLUMN name TYPE text;\n',
      },
    ],
  },
  {
    id: 'lint.a-ban-survives-every-override',
    statement:
      'The repo-root lint standard holds its safety rules at error, and no eslint override scope carries fewer restricted-rule bans than the baseline beside it.',
    incident:
      "ESLint REPLACES a rule's options when a later config block sets the same rule, which silently deleted two door-lock bans (F2050) while their comments still claimed they were live — `yarn lint` was green throughout, because a rule that does not exist reports nothing. Separately (F9100/F9101) the root standard held these rules at `warn`, and NOTHING in this repo fails on warnings: `eslint` exits 0 with any number of them. THIS ENTRY GUARDS THE OTHER ENTRIES — eight invariants above are enforced by eslint, and every one of them is only as alive as this.",
    level: 'lint',
    mechanism: 'scripts/check-lint-ban-inheritance.mjs',
    check: {
      command: 'node ../../scripts/check-lint-ban-inheritance.mjs',
      reads:
        "each override scope's EFFECTIVE eslint config, via --print-config",
    },
    mutations: [
      {
        // The demotion, which is how the two standards arose in the first
        // place: a safety rule at 'warn' is a comment with a severity field.
        file: '../../.eslintrc.js',
        find: "'@typescript-eslint/no-floating-promises': 'error',",
        replace: "'@typescript-eslint/no-floating-promises': 'warn',",
      },
    ],
  },
  {
    id: 'source.every-script-declares-what-runs-it',
    statement:
      'Every file in scripts/ declares @script-class and @run-by, so "wired to nothing" is a statement the repository makes out loud rather than a fact someone discovers.',
    incident:
      "Four gates in this repo were found wired to NOTHING, sitting green for months — F702's 16 rotted checks and F709's dead cluster both hid in what the containment gate's own header calls \"a flat bag of 57 undifferentiated files\". The whole H4 exercise this entry belongs to began by asking which root scanners were wired, and the answer was legible ONLY because this gate had already forced every script to answer.",
    level: 'lint',
    mechanism:
      'scripts/scripts-containment-gate.sh, on scripts/lib/gate-runner.sh',
    check: {
      command: 'bash ../../scripts/scripts-containment-gate.sh',
      reads: 'the class/run-by declaration of every file in scripts/',
    },
    mutations: [
      {
        // A new script that declares nothing — the shape every dead cluster in
        // this repo started as.
        file: '../../scripts/invariant-probe-undeclared.mjs',
        content: "console.log('a script that says nothing about itself');\n",
      },
    ],
  },

  // ── PROMPTS ──────────────────────────────────────────────────────────
  {
    id: 'prompt.the-instruction-describes-the-request-we-send',
    statement:
      'For each entity-match transport, every field name the rendered system instruction mentions is a field that transport actually sends or its schema actually enforces.',
    incident:
      'The canonical .md drifted into describing the BATCH request — "you receive `items`", "one verdict per `index`", output key `candidateId` — while the SINGLE transport sends `{term, kind, candidates}` and enforces a schema whose id field is snake_case `candidate_id`. Both halves were internally consistent and every existing spec was green: the binding spec compared the .md to the OTHER rendered text, never to the bytes on the wire. A model told to key its answer by `index` on a request that has no index is a SILENT-ACCURACY defect — nothing crashes, the corpus just merges worse.',
    level: 'behaviour',
    mechanism:
      "entity-match-payload-conformance.spec.ts — renders each mode's real instruction and captures the real JSON payload by driving matchEntity / matchEntitiesBatch with the transport stubbed at callLLMApi, then cross-checks field names in both directions, case-sensitively (`candidateId` vs `candidate_id` is exactly the drift that shipped).",
    check: {
      command:
        'npx jest src/modules/external-integrations/llm/entity-match-payload-conformance.spec.ts --silent',
      reads: 'the bytes each transport puts on the wire, not a fixture of them',
    },
    mutations: [
      {
        // The drift as it shipped: the single lane's canonical text naming a
        // field that belongs to the batch transport. Editing the .md rather
        // than the envelope is deliberate — the .md is the file a human edits
        // and the prompt-versioning machinery reads, so it is where drift is
        // actually introduced.
        file: 'src/modules/external-integrations/llm/prompts/entity-match-prompt.md',
        find: 'each with an `id`',
        replace: 'each with a `candidateId`',
      },
    ],
  },

  // ── POLLS ────────────────────────────────────────────────────────────
  {
    id: 'polls.ballot-documents-are-excluded-from-source-activity',
    statement:
      'The writer of the ballot marker and the reader that excludes it use one literal.',
    incident:
      "F540 — rename either side and a poll room's A(τ) silently re-weights by turnout.",
    level: 'unrepresentable',
    mechanism: 'ballot-document-marker.ts, imported by both ends',
    check: {
      command: 'npx tsc --noEmit -p tsconfig.json',
      reads: 'the shared constant',
    },
    mutations: [
      {
        file: 'src/modules/polls/supply/ballot-document-marker.ts',
        find: "export const BALLOT_VOTER_MARKER = 'voterUserId';",
        replace: 'export const BALLOT_VOTER_MARKER_RENAMED = 0;',
      },
    ],
  },
];

export const SCRATCH_FILE = SCRATCH;
