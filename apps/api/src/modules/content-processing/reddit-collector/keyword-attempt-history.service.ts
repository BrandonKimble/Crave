import { Inject, Injectable } from '@nestjs/common';
import { KeywordAttemptOutcome } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';

/**
 * §11 attempt ledger under the NO-FAKE-ESTIMATES LAW (owner-ratified
 * 2026-07-24): the four cooldown TIMERS (7d success / 60d no-results /
 * 1d error / 6h deferred) are DEAD. What replaces them is a measured
 * HARVEST SNAPSHOT per (engine, term):
 *
 *   lastHarvestAt        — when the query last actually ran against reddit
 *   lastResultCount      — how many posts it returned (0 = measured barren)
 *   corpusDocsAtHarvest  — the source corpus size at that moment
 *
 * Eligibility is then a DERIVATION in slice selection: a term re-enters
 * when (corpusNow − corpusAtHarvest) × (lastResultCount ÷ corpusAtHarvest)
 * ≥ 1 — i.e. the source has produced enough new content that this term's
 * measured match share expects at least one whole new document. Rotation
 * emerges: a just-harvested term's corpus delta is ~0, so it sinks with no
 * timer; hot sources resurface their terms quickly, quiet sources slowly.
 * A measured-barren term (share 0) re-enters only on renewed user demand
 * (the §11 unmet pierce) — known-zero is evidence, not a timeout.
 *
 * §12.3 is now exact: error/deferred outcomes record ONLY lastOutcome /
 * lastAttemptAt (observability) — they never touch the harvest snapshot,
 * so a rate limit or vendor fault cannot re-time a term in any direction.
 */
@Injectable()
export class KeywordAttemptHistoryService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('KeywordAttemptHistoryService');
  }

  /**
   * The source-corpus size the eligibility derivation measures against —
   * posts only (the unit reddit search results and the /new window share).
   * One call per cycle/selection; counted against the durable
   * source_documents substrate.
   */
  async corpusDocsForCommunity(community: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint | number }>>`
      SELECT count(*) AS n FROM collection_source_documents
      WHERE community = ${community}
        AND source_type = 'post'
    `;
    return Number(rows[0]?.n ?? 0);
  }

  async recordAttempt(params: {
    engineName: string;
    /** §11 attempt-ledger key: (engine, term). */
    engineId?: string;
    /**
     * THE LEDGER IDENTITY — the fold. Dedupes two SPELLINGS of one query
     * (case, whitespace, punctuation) into one row. It no longer strips
     * accents: bò and bơ are different words, not spellings, and merging them
     * gave one harvest snapshot to both, last-writer-wins (F7). Still not a
     * query — `term` below is the string that goes on the wire.
     */
    normalizedTerm: string;
    /**
     * THE QUERY — the diacritic-preserving text that was actually sent. The
     * refresh lane re-runs terms straight out of this ledger, so this is the
     * string it must re-send; writing the fold here is what sent every
     * foreign-language term back out mangled in perpetuity.
     */
    term: string;
    /**
     * THE LANGUAGE THE ASK WAS MADE IN. Recorded because the refresh slice
     * re-reads this table minutes-to-days later with no request in scope —
     * a locale not written here is lost, and the generic-token stripper then
     * judges the term in English by default ('top' is an English filler word
     * and a real Vietnamese one; a generic-only term is DELETED).
     *
     * SILENCE NEVER ERASES A DECIDED ANSWER (the same rule the ask ledger
     * carries): an attempt that arrives with no locale — the refresh lane
     * re-running a term, an undecidable one-worder — leaves whatever was
     * recorded alone rather than blanking it.
     */
    locale?: string | null;
    outcome: KeywordAttemptOutcome;
    /** The query's full yield (success/no_results harvests only). */
    resultCount?: number;
    /** Source corpus size at harvest (success/no_results harvests only). */
    corpusDocs?: number;
    attemptedAt?: Date;
  }): Promise<void> {
    const attemptedAt =
      params.attemptedAt instanceof Date &&
      !Number.isNaN(params.attemptedAt.getTime())
        ? params.attemptedAt
        : new Date();
    const engineName = params.engineName.trim().toLowerCase();
    const normalizedTerm = params.normalizedTerm.trim().toLowerCase();
    // The query keeps its diacritics and its case-as-sent; only surrounding
    // whitespace is meaningless. It is never folded — that is the whole point
    // of it being a second column.
    const term = params.term.trim();
    // Normalized like every other locale in the system, and EMPTY MEANS
    // ABSENT — an empty string would be a tag nothing can look up.
    const locale = params.locale?.trim() || null;

    if (!engineName.length || !normalizedTerm.length || !term.length) {
      return;
    }

    // A HARVEST = the query genuinely ran and reddit answered (success or
    // measured-barren). Errors/denials are not harvests — §12.3.
    const isHarvest =
      params.outcome === 'success' || params.outcome === 'no_results';
    const harvestFields = isHarvest
      ? {
          lastHarvestAt: attemptedAt,
          lastResultCount: Math.max(0, Math.floor(params.resultCount ?? 0)),
          corpusDocsAtHarvest:
            typeof params.corpusDocs === 'number' &&
            Number.isFinite(params.corpusDocs) &&
            params.corpusDocs > 0
              ? Math.floor(params.corpusDocs)
              : null,
        }
      : {};

    try {
      await this.prisma.keywordAttemptHistory.upsert({
        where: {
          engineName_normalizedTerm: {
            engineName,
            normalizedTerm,
          },
        },
        create: {
          engineName,
          engineId: params.engineId ?? null,
          normalizedTerm,
          term,
          locale,
          lastAttemptAt: attemptedAt,
          lastOutcome: params.outcome,
          ...harvestFields,
          ...(params.outcome === 'success'
            ? { lastSuccessAt: attemptedAt }
            : {}),
        },
        update: {
          ...(params.engineId ? { engineId: params.engineId } : {}),
          // The query is refreshed to what was ACTUALLY just sent. That is
          // what makes the backfill self-healing: a migrated row carries the
          // fold until the first real attempt under a properly-spelled term
          // replaces it with the true query.
          term,
          // SILENCE NEVER ERASES A DECIDED ANSWER. A refresh re-run carries
          // no locale (there is no request in scope) and must not blank the
          // one the original ask established — which is exactly the row the
          // refresh lane will read next time.
          ...(locale ? { locale } : {}),
          lastAttemptAt: attemptedAt,
          lastOutcome: params.outcome,
          ...harvestFields,
          ...(params.outcome === 'success'
            ? { lastSuccessAt: attemptedAt }
            : {}),
        },
      });
    } catch (error) {
      this.logger.warn('Failed to record keyword attempt history', {
        engineName,
        normalizedTerm,
        outcome: params.outcome,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }
}
