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
    normalizedTerm: string;
    outcome: KeywordAttemptOutcome;
    /** Posts the query returned (success/no_results harvests only). */
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

    if (!engineName.length || !normalizedTerm.length) {
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
          lastAttemptAt: attemptedAt,
          lastOutcome: params.outcome,
          ...harvestFields,
          ...(params.outcome === 'success'
            ? { lastSuccessAt: attemptedAt }
            : {}),
        },
        update: {
          ...(params.engineId ? { engineId: params.engineId } : {}),
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
