import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/**
 * Dietary hardness (spec §1.3, owner-ratified): a curated lifestyle set of
 * attribute entities (vegan / vegetarian / gluten free / halal / kosher,
 * flagged `constraint_class='dietary'` in the vocabulary) that the
 * search may NEVER soften. For a vegan user, softening "vegan" is not
 * degradation — it is a wrong answer.
 *
 * CUTOVER 2026-08-02: the exemption lives in the pooled hard/soft split
 * (executePooledStage): dietary-flagged ids stay in the WHERE membership
 * as walls; every unflagged attribute becomes soft per-row provenance
 * for the richness gate. (The old ladder-stage machinery is deleted.)
 */

@Injectable()
export class DietaryConstraintRegistry {
  private readonly logger: LoggerService;
  private cache: { ids: Set<string>; expiresAt: number } | null = null;
  /** The vocabulary is ~10 rows and changes only by curation; 5 minutes
   *  bounds staleness without a per-search query. */
  private static readonly TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DietaryConstraintRegistry');
  }

  async getDietaryIds(): Promise<ReadonlySet<string>> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.ids;
    }
    try {
      const rows = await this.prisma.entity.findMany({
        where: { constraintClass: 'dietary', status: 'active' },
        select: { entityId: true },
      });
      this.cache = {
        ids: new Set(rows.map((row) => row.entityId)),
        expiresAt: now + DietaryConstraintRegistry.TTL_MS,
      };
      return this.cache.ids;
    } catch (error) {
      // Fail toward TODAY'S behavior (dietary droppable) rather than
      // breaking search: a registry outage must never take the hot path
      // down. Stale cache beats empty when we have one.
      this.logger.warn('Dietary registry load failed (failing soft)', {
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
      return this.cache?.ids ?? new Set();
    }
  }
}
