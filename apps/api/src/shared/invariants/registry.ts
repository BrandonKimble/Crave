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
  | 'lint';

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

  // ── THE LEDGER ───────────────────────────────────────────────────────
  {
    id: 'identity.author-identity-has-one-home',
    statement:
      'Any read that exposes another person\'s name goes through publicAuthorIdentity, so a deleted account renders as "Deleted user" rather than as whatever a component does with a null.',
    incident:
      "Deletion nulls username and displayName. Five surfaces each invented their own fallback — '?', 'user', a seeded pseudo-name, a bare null, a blank byline — and NONE said \"deleted\". Nothing failed; the thread just rendered a nameless comment.",
    level: 'lint',
    mechanism:
      'scripts/check-author-identity.ts — every user-shaped select is either AUTHOR_SELECT-based (which carries deletedAt) and CALLS publicAuthorIdentity, or is classified with a reason. The call, not the identifier: until F2050 this sentence claimed the mapping while the check tested for the bare name, which an unused import satisfied. Text scanning proves at-least-one call, never per-path coverage — the actual enforcement is typing the DTO slot as PublicAuthorIdentity (see ConversationPeerDto), which makes a raw row fail to compile.',
    check: {
      command: 'npx ts-node -T scripts/check-author-identity.ts',
      reads: 'every select in src/ that exposes a username',
    },
    mutations: [
      {
        file: 'src/modules/identity/probe-author.service.ts',
        content:
          'export const sel = { userId: true, username: true, displayName: true, deletedAt: true };\n',
      },
      {
        // F2050: the mutation above was too weak — it never exercised the way
        // the invariant ACTUALLY failed in production. messaging.service.ts
        // imported `publicAuthorIdentity`, never called it, and shipped the raw
        // user row; the scanner tested for the bare identifier, which the
        // import satisfied, and reported OK. This mutation reproduces that
        // exact shape, so a scanner an import can satisfy fails here.
        file: 'src/modules/identity/probe-author.service.ts',
        content:
          "import { publicAuthorIdentity } from './public-author-identity';\n" +
          'export const sel = { userId: true, username: true, displayName: true, deletedAt: true };\n' +
          'export function shipRaw(row: unknown) { return row; }\n',
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
