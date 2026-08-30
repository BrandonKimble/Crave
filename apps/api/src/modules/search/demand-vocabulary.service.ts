import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdvisoryLockService, LoggerService } from '../../shared';
import { LLMService } from '../external-integrations/llm/llm.service';
import { EntityTextSearchService } from '../entity-text-search/entity-text-search.service';
import { addSurfaces } from '../content-processing/entity-resolver/entity-surface.service';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';
import {
  bankableLanguageTag,
  localeLookupChain,
  recallScope,
} from '../../shared/locale';

/**
 * DEMAND → VOCABULARY (concept-graph plan, build step 6).
 *
 * The system already records every search term it could not ground as an
 * `on_demand_ask` signal. Most of those are genuinely missing concepts and
 * belong to collection. But some are a word we simply do not KNOW for a
 * concept we already HAVE — `gambas` when we hold `shrimp` — and for those the
 * right answer is not to go collect anything; it is to learn the word.
 *
 * This sweep reads that ledger, asks the EXISTING identity judge "is this term
 * the same entity as one of these candidates?", and banks a locale-tagged
 * alias on a confident match — tagged with the language the ASK WAS MADE IN
 * (`signals.detected_locale`), per term. A run-wide `--locale` flag used to
 * decide that for every term at once, which made the tag an operator's guess
 * about other people's words; the ledger already knows. The term stops being
 * demand and becomes vocabulary; the next user who types it gets an instant
 * lexical hit.
 *
 * WHY A SWEEP AND NOT A LIVE CALL. The obvious design — verify during the
 * search — was tested and rejected: it puts an LLM call in the hot path for a
 * latency and cost profile we cannot bound. The obvious second design, a cron
 * over the residue table, was ALSO wrong: single-word residue (`gambas` is one
 * token) records its signal and never reaches that table, so the cron would
 * never see the exact case it was built for. The signals ledger is the one
 * place BOTH residue forks land.
 *
 * WHY THIS IS SAFE WHERE `self-learn` WAS NOT. Banking a raw dense guess was
 * rejected earlier because dense grounding is imprecise (`만두` lands nearer
 * `mantou` than `dumpling`). Here dense only RETRIEVES; the identity judge
 * decides, and it fails closed to `new`. Nothing is banked on a guess.
 *
 * The alias is written with source `query_banking` — a value that has existed
 * in the SurfaceSource union with zero producers, reserved for exactly this —
 * which puts it under P0-b's collision guard, so a learned word that already
 * names a different concept is refused.
 */

/**
 * pg advisory-lock key for the demand-vocabulary sweep — SINGLE SWEEPER
 * ACROSS PROCESSES. Same convention as PROMOTION_DRAIN_ADVISORY_LOCK_KEY
 * (0x706f6c79 'poly') and RESCORE_ADVISORY_LOCK_KEY (0x63726176 'crav');
 * this one spells 'demv'.
 *
 * WHY NOT 'vocb' (rail wiring, 2026-08-30): this key WAS 0x766f6362 'vocb' —
 * the exact key VOCABULARY_MAINTENANCE_LOCK_KEY also spells in
 * vocabulary-maintenance.service.ts. Two different jobs sharing one advisory
 * key means whichever runs second silently skips its pass while the other is
 * mid-flight — and both are scheduled in the same nightly window. The key
 * collision warning in the paragraph below was describing itself.
 *
 * WHY IT IS NEEDED (red team F8). This sweep reads the unmet-ask ledger,
 * computes a known-set in APPLICATION MEMORY (the fold law: 'do we already
 * know this word' cannot be asked in SQL), and then spends an LLM judge call
 * per surviving term. Two sweepers — the worker's cron and an operator
 * running scripts/run-demand-vocabulary.ts, which is exactly how this is
 * used — read the same ledger, build the same known-set BEFORE either has
 * banked anything, and both pay for the same judgement on every term. The
 * known-set is a read-then-write window that no unique constraint closes:
 * `addSurfaces` makes the WRITE idempotent, so nothing is corrupted, but the
 * SPEND is not idempotent at all and that is the whole cost of this lane.
 * The loser skips the pass; the ledger is durable and the next tick retries.
 *
 * Not a product number — what changes it: a key collision with another
 * advisory-locked job, never tuning.
 */
export const DEMAND_VOCABULARY_ADVISORY_LOCK_KEY = 0x64656d76; // 'demv'

/** Terms asked at least this many times before we spend a judge call. */
const MIN_ASKS = 1;

/** Candidates retrieved per unknown term. */
const CANDIDATE_POOL = 8;

/**
 * One term's fate against the vocabulary we already hold (the ONE-INTAKE
 * merge, owner-ordered 2026-08-30). This is the Learner's whole move —
 * fold-known check, dense retrieval, the Same-Thing Judge with alias
 * evidence, collision-guarded locale-tagged banking — extracted so the
 * unknown-search intake can apply it PER PIECE at arrival time instead of
 * every unknown word waiting for the nightly ledger sweep (and for the
 * k-anonymity floor that sweep must respect). One implementation, one
 * ledger discipline; the sweep now runs on the same matcher.
 */
export type VocabularyMatchOutcome =
  /** Its fold already lives in the term's own locale chain — nothing to do. */
  | 'known'
  /** The judge matched and the alias was banked (or would be, on dryRun). */
  | 'learned'
  /** The judge matched but the collision guard refused the write. */
  | 'refused'
  /** No candidates, no match, or a failed judge — this is real demand. */
  | 'left_as_demand';

export interface VocabularyMatchResult {
  outcome: VocabularyMatchOutcome;
  /** Whether an identity-judge call was actually spent. */
  judged: boolean;
  /** The matched entity's canonical name, when there was one. */
  entityName?: string;
}

export interface VocabularyMatcher {
  /** The FREE half of the match: is this fold already vocabulary in the
   *  term's own locale chain? No LLM, no retrieval — callers that cannot
   *  spend a judge call (flag off, budget exhausted) still get this. */
  isKnown(term: string, termLocale: string | null): Promise<boolean>;
  match(
    term: string,
    termLocale: string | null,
  ): Promise<VocabularyMatchResult>;
}

export interface DemandVocabularySummary {
  termsConsidered: number;
  judged: number;
  learned: number;
  /** Judged a match but REFUSED by the collision guard — it already names a
   *  different concept. Reported so the guard's blast radius is visible. */
  refused: number;
  leftAsDemand: number;
}

/** A sweep that did not run reports zeros — never a partial-looking summary
 *  that a caller could mistake for "there was nothing to learn". */
const EMPTY_SUMMARY = (): DemandVocabularySummary => ({
  termsConsidered: 0,
  judged: 0,
  learned: 0,
  refused: 0,
  leftAsDemand: 0,
});

@Injectable()
export class DemandVocabularyService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly entityTextSearch: EntityTextSearchService,
    private readonly advisoryLock: AdvisoryLockService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DemandVocabularyService');
  }

  async run(
    options: { limit?: number; dryRun?: boolean } = {},
  ): Promise<DemandVocabularySummary> {
    // The lock is taken on a DEDICATED session (AdvisoryLockService) — a
    // pooled acquire/release pair strands the lock and disables this lane
    // permanently, which is exactly what it used to do. See R1 there.
    const outcome = await this.advisoryLock.withAdvisoryLock(
      DEMAND_VOCABULARY_ADVISORY_LOCK_KEY,
      () => this.sweep(options),
    );
    if (!outcome.acquired) {
      this.logger.info(
        'Demand vocabulary sweep skipped (another process is sweeping)',
      );
      return EMPTY_SUMMARY();
    }
    return outcome.result;
  }

  private async sweep(options: {
    limit?: number;
    dryRun?: boolean;
  }): Promise<DemandVocabularySummary> {
    const limit = options.limit ?? 100;
    const dryRun = options.dryRun ?? false;
    const summary: DemandVocabularySummary = {
      termsConsidered: 0,
      judged: 0,
      learned: 0,
      refused: 0,
      leftAsDemand: 0,
    };

    // DISTINCT terms only: 50 users asking the same word is one thing to
    // learn, not fifty. (The ledger deliberately keeps all 50 rows — that is
    // how demand strength is measured — but the LLM call is deduped, exactly
    // as the residue splitter already does.)
    const terms = await this.prisma.$queryRawUnsafe<
      Array<{ term: string; asks: bigint; detected_locale: string | null }>
    >(
      `SELECT s.subject_text AS term, count(*)::bigint AS asks,
              -- THE LANGUAGE THE ASK WAS MADE IN, carried on the signal since
              -- the ask lane started stamping it. The MOST RECENT non-null
              -- answer wins: locale is an ATTRIBUTE of a demand, not a
              -- dimension of it (one word asked by a Spanish phone and an
              -- English one is ONE demand), and silence never erases a
              -- decided answer — a bare one-worder whose language is honestly
              -- undecidable must not blank what an earlier full sentence
              -- settled.
              (array_agg(s.detected_locale ORDER BY s.occurred_at DESC)
                 FILTER (WHERE s.detected_locale IS NOT NULL))[1]
                AS detected_locale
         FROM signals s
         -- K-ANONYMITY (signals/subject-text-floor). This lane emits a
         -- person's typed words ACROSS people and then OUTBOUND to an LLM,
         -- and an unmet ask is by construction the most unusual thing anyone
         -- typed — nothing matched it. count(*) >= MIN_ASKS counts ROWS, so
         -- one person asking the same thing MIN_ASKS times clears it on their
         -- own; it is a signal-strength gate, not a privacy floor. The view
         -- is the floor, and joining it is the whole reason the floor is a
         -- database object rather than a convention each reader re-derives.
         JOIN signal_emittable_terms _emit ON _emit.term = s.subject_text
        WHERE s.kind = 'on_demand_ask'
          AND s.subject_text IS NOT NULL
          AND btrim(s.subject_text) <> ''
          -- NOTE: the "do we already know this term?" test is NOT here. It
          -- cannot be: form_folded is written by canonicalFold (NFKD, strip
          -- diacritics, drop apostrophes), and SQL lower() does none of that,
          -- so lower('Crème Brûlée') would never equal the stored
          -- 'creme brulee' and every accented term -- exactly the foreign
          -- words this feature exists for -- would be re-judged forever. The
          -- fold is an APP function, so the filter is applied in TypeScript
          -- below, against the same canonicalFold that wrote the column.
        GROUP BY s.subject_text
       HAVING count(*) >= ${MIN_ASKS}
        ORDER BY count(*) DESC
        LIMIT $1`,
      limit,
    );

    const matcher = await this.createMatcher({ dryRun });

    for (const row of terms) {
      const term = row.term.trim();
      // The locale the ASKER's words were in — never a run-wide flag. A
      // sweep cannot declare what language other people typed in.
      const termLocale = row.detected_locale?.trim() || null;
      const result = await matcher.match(term, termLocale);
      if (result.outcome === 'known') {
        continue;
      }
      summary.termsConsidered += 1;
      if (result.judged) {
        summary.judged += 1;
      }
      switch (result.outcome) {
        case 'learned':
          summary.learned += 1;
          this.logger.info('Demand term learned as vocabulary', {
            term,
            locale: bankableLocale(termLocale) ?? 'und',
            entity: result.entityName,
            asks: Number(row.asks),
            dryRun,
          });
          break;
        case 'refused':
          summary.refused += 1;
          break;
        default:
          summary.leftAsDemand += 1;
          break;
      }
    }

    this.logger.info('Demand vocabulary sweep complete', {
      ...summary,
      dryRun,
    });
    return summary;
  }

  /**
   * Build a matcher over TODAY's known vocabulary. The known-set is loaded
   * once per matcher (it is the whole active recall surface, folded), so a
   * caller processing many terms — the sweep, or one intake drain pass —
   * pays the load exactly once.
   */
  async createMatcher(
    options: { dryRun?: boolean } = {},
  ): Promise<VocabularyMatcher> {
    const dryRun = options.dryRun ?? false;
    // Known surfaces, folded by the SAME function that wrote form_folded,
    // and KEYED BY LOCALE.
    //
    // "Do we already know this word?" is a question about a LANGUAGE, and
    // asking it across all locales at once answered it wrong in the only
    // direction that matters: a Spanish 'camarones' was declared already
    // known because SOME entity holds that form — in Spanish — while an
    // English ask for a word we hold only in Vietnamese was silently
    // suppressed as known and never learned. The chain is the same closed
    // set ingestion grounds through, so a term counts as known when one of
    // ITS OWN locale's rows holds the fold.
    const knownRows = await this.prisma.$queryRawUnsafe<
      Array<{ locale: string; form_folded: string }>
    >(
      // Recall predicate: a display-only surface is a refused recall
      // claim, so it does not make a demand term 'already known'.
      `SELECT DISTINCT LOWER(locale) AS locale, form_folded FROM entity_surface
        WHERE status = 'active' AND role <> 'display'`,
    );
    const knownByLocale = new Map<string, Set<string>>();
    for (const row of knownRows) {
      const bucket = knownByLocale.get(row.locale);
      if (bucket) {
        bucket.add(row.form_folded);
      } else {
        knownByLocale.set(row.locale, new Set([row.form_folded]));
      }
    }
    const isKnownIn = (termLocale: string | null, fold: string): boolean =>
      localeLookupChain(termLocale).some((tag) =>
        knownByLocale.get(tag)?.has(fold),
      );

    const match = async (
      rawTerm: string,
      termLocale: string | null,
    ): Promise<VocabularyMatchResult> => {
      const term = rawTerm.trim();
      // THE FOLD LAW: compare folded-to-folded, never lower()-to-folded.
      if (!term || isKnownIn(termLocale, canonicalFold(term))) {
        return { outcome: 'known', judged: false };
      }

      const candidates = await this.entityTextSearch.retrieveCandidates(
        term,
        // Real enum members, never a cast-hidden string: the R14 rename left
        // a literal 'food' here inside an `as EntityType[]` cast, so every
        // sweep pass sent 'food'::entity_type to Postgres — an invalid enum
        // that errored the probe and killed the whole learn-a-word lane
        // (found + fixed 2026-08-19).
        [
          EntityType.item,
          EntityType.ingredient,
          EntityType.item_attribute,
          EntityType.place_attribute,
        ],
        CANDIDATE_POOL,
        {
          denseMode: 'always',
          // The ask's own language opens the localized-surface lane, so a
          // Spanish term can be recalled against the Spanish words we hold.
          // Without it the judge only ever sees an English shortlist for a
          // foreign ask — the exact case this sweep exists for.
          requestLocale: termLocale,
        },
      );
      if (!candidates.length) {
        // Nothing to be the same AS. This is real demand — leave it.
        return { outcome: 'left_as_demand', judged: false };
      }

      // The SAME alias evidence the resolver's batch judge carries: each
      // candidate's recall surfaces in the ASK's locale chain (red team
      // 2026-08-12 — `aliases: []` here meant a Spanish term was judged
      // against bare English names even when the entity holds the Spanish
      // word as a surface, the exact evidence this sweep exists to use).
      const candidateIds = candidates.map((c) => c.entityId);
      const aliasRows = await this.prisma.$queryRaw<
        Array<{ entity_id: string; forms: string[] }>
      >(Prisma.sql`
        SELECT s.entity_id, array_agg(s.form) AS forms
          FROM entity_surface s
         WHERE s.entity_id = ANY(${candidateIds}::uuid[])
           AND ${recallScope(termLocale)}
         GROUP BY s.entity_id`);
      const aliasesById = new Map(
        aliasRows.map((r) => [r.entity_id, r.forms ?? []]),
      );
      let verdict: { decision: string; candidateId: number | null };
      try {
        verdict = await this.llm.matchEntity({
          term,
          kind: 'item',
          candidates: candidates.map((candidate, index) => ({
            id: index,
            name: candidate.name,
            aliases: (aliasesById.get(candidate.entityId) ?? []).filter(
              (form) => form.toLowerCase() !== candidate.name.toLowerCase(),
            ),
          })),
        });
      } catch (error) {
        // A failed judge leaves the term as demand — never bank on a failure.
        this.logger.warn('Demand judge failed (term left as demand)', {
          term,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        return { outcome: 'left_as_demand', judged: true };
      }

      const matched =
        verdict.decision === 'match' && typeof verdict.candidateId === 'number'
          ? candidates[verdict.candidateId]
          : null;
      if (!matched) {
        return { outcome: 'left_as_demand', judged: true };
      }

      if (!dryRun) {
        // Counted from what the WRITER did, not from the verdict: the guard
        // may refuse a learned term that already names another concept, and
        // counting the verdict would report a refusal as a success.
        const result = await this.prisma.$transaction(async (tx) =>
          addSurfaces(
            tx,
            matched.entityId,
            [
              {
                form: term,
                // Tagged with the language the ASK was made in. `undefined`
                // (an undecidable one-worder) banks 'und' — the universal
                // slice every language's chain ends in, which is the honest
                // answer when nobody can say what language a word was in.
                //
                // LANGUAGE ONLY, NEVER A REGION (red team F8b). An 'es-MX'
                // ask banks 'es'. The reason is the lookup chain, which is
                // the only thing that ever reads this tag:
                // localeLookupChain('es-MX') is ['es-mx','es','und'] and
                // localeLookupChain('es') is ['es','und'] — so a row banked
                // 'es-MX' is reachable ONLY by another es-MX caller, and the
                // word we just paid a judge call to learn would be invisible
                // to every other Spanish speaker and to ingestion out of an
                // 'es' document. A region is real information about the
                // ASKER; it is not information about the WORD, and this row
                // is a claim about a word. (The generator's rows are the
                // same shape for the same reason.)
                locale: bankableLocale(termLocale),
                source: 'query_banking' as const,
              },
            ],
            { touchLastUpdated: true },
          ),
        );
        if (result.blocked.length) {
          return { outcome: 'refused', judged: true, entityName: matched.name };
        }
      }
      return { outcome: 'learned', judged: true, entityName: matched.name };
    };

    return {
      match,
      isKnown: (term, termLocale) =>
        Promise.resolve(isKnownIn(termLocale, canonicalFold(term.trim()))),
    };
  }
}

/**
 * The tag a demand term may be BANKED under: the base language, or nothing.
 * See the banking site for why the region is dropped (F8b) — a region names
 * the asker, and the lookup chain would make an 'es-MX' row unreachable to
 * every other Spanish speaker.
 */
function bankableLocale(detected: string | null): string | undefined {
  // One implementation, shared with every other site that banks a claim
  // about a WORD (A0 R4). The local string-split version also accepted
  // malformed input: 'es_MX' split to 'es' and banked a language nobody had
  // validated. The shared helper normalizes first, so a tag that is not a
  // tag banks as 'und'.
  return bankableLanguageTag(detected);
}
