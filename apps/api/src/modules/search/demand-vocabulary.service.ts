import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { LLMService } from '../external-integrations/llm/llm.service';
import { EntityTextSearchService } from '../entity-text-search/entity-text-search.service';
import { addAliases } from '../content-processing/entity-resolver/entity-alias.service';

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
 * alias on a confident match. The term stops being demand and becomes
 * vocabulary; the next user who types it gets an instant lexical hit.
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
 * in the AliasSource union with zero producers, reserved for exactly this —
 * which puts it under P0-b's collision guard, so a learned word that already
 * names a different concept is refused.
 */

/** Terms asked at least this many times before we spend a judge call. */
const MIN_ASKS = 1;

/** Candidates retrieved per unknown term. */
const CANDIDATE_POOL = 8;

export interface DemandVocabularySummary {
  termsConsidered: number;
  judged: number;
  learned: number;
  leftAsDemand: number;
}

@Injectable()
export class DemandVocabularyService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LLMService,
    private readonly entityTextSearch: EntityTextSearchService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DemandVocabularyService');
  }

  async run(
    options: { limit?: number; dryRun?: boolean; locale?: string } = {},
  ): Promise<DemandVocabularySummary> {
    const limit = options.limit ?? 100;
    const dryRun = options.dryRun ?? false;
    const locale = options.locale ?? 'und';
    const summary: DemandVocabularySummary = {
      termsConsidered: 0,
      judged: 0,
      learned: 0,
      leftAsDemand: 0,
    };

    // DISTINCT terms only: 50 users asking the same word is one thing to
    // learn, not fifty. (The ledger deliberately keeps all 50 rows — that is
    // how demand strength is measured — but the LLM call is deduped, exactly
    // as the residue splitter already does.)
    const terms = await this.prisma.$queryRawUnsafe<
      Array<{ term: string; asks: bigint }>
    >(
      `SELECT s.subject_text AS term, count(*)::bigint AS asks
         FROM signals s
        WHERE s.kind = 'on_demand_ask'
          AND s.subject_text IS NOT NULL
          AND btrim(s.subject_text) <> ''
          -- Already known? Then it was learned (or collected) since the ask.
          AND NOT EXISTS (
                SELECT 1 FROM entity_alias ea
                 WHERE ea.form_folded = lower(btrim(s.subject_text))
                   AND ea.status = 'active'
              )
        GROUP BY s.subject_text
       HAVING count(*) >= ${MIN_ASKS}
        ORDER BY count(*) DESC
        LIMIT $1`,
      limit,
    );

    for (const row of terms) {
      summary.termsConsidered += 1;
      const term = row.term.trim();

      const candidates = await this.entityTextSearch.retrieveCandidates(
        term,
        [
          'food',
          'ingredient',
          'food_attribute',
          'restaurant_attribute',
        ] as EntityType[],
        CANDIDATE_POOL,
        { denseMode: 'always' },
      );
      if (!candidates.length) {
        // Nothing to be the same AS. This is real demand — leave it.
        summary.leftAsDemand += 1;
        continue;
      }

      summary.judged += 1;
      let verdict: { decision: string; candidateId: number | null };
      try {
        verdict = await this.llm.matchEntity({
          term,
          kind: 'food',
          candidates: candidates.map((candidate, index) => ({
            id: index,
            name: candidate.name,
            aliases: [],
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
        summary.leftAsDemand += 1;
        continue;
      }

      const matched =
        verdict.decision === 'match' && typeof verdict.candidateId === 'number'
          ? candidates[verdict.candidateId]
          : null;
      if (!matched) {
        summary.leftAsDemand += 1;
        continue;
      }

      summary.learned += 1;
      if (!dryRun) {
        await this.prisma.$transaction(async (tx) => {
          await addAliases(
            tx,
            matched.entityId,
            [{ form: term, locale, source: 'query_banking' as const }],
            { touchLastUpdated: true },
          );
        });
      }
      this.logger.info('Demand term learned as vocabulary', {
        term,
        entity: matched.name,
        asks: Number(row.asks),
        dryRun,
      });
    }

    this.logger.info('Demand vocabulary sweep complete', {
      ...summary,
      dryRun,
    });
    return summary;
  }
}
