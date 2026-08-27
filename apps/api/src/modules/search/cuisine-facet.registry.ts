import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/**
 * THE CUISINE VOCABULARY, AS A SET (v17 S4, 2026-08-26).
 *
 * `core_entities.facet = 'cuisine'` marks the canonical cuisine attribute
 * rows (class ② of the 2026-08 data audit; ~89 active rows). Two search
 * decisions key off membership in this set, and both must read the FACET,
 * never an entity's name or whichever type happens to match first:
 *
 *  - PLACEMENT: a span matching both a junk dish entity named "mexican"
 *    and the cuisine attribute must place as the CUISINE — the facet is a
 *    curated verdict about the vocabulary; the junk hub is a data defect.
 *  - PROJECTION: a cuisine id is ONE concept with two storage homes
 *    (dish-side `food_attributes`, restaurant-side `restaurant_attributes`)
 *    and compiles to an OR across both, never a single-column filter and
 *    never two AND'd requirements (F5).
 *
 * Same cache shape as DietaryConstraintRegistry: the vocabulary is small
 * and changes only by curation; 5 minutes bounds staleness without a
 * per-search query. Fail-open to the EMPTY set — a read outage degrades to
 * today's single-bucket behavior, it does not kill search.
 */
@Injectable()
export class CuisineFacetRegistry {
  private readonly logger: LoggerService;
  private cache: { ids: ReadonlySet<string>; expiresAt: number } | null = null;
  private static readonly TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('CuisineFacetRegistry');
  }

  /** Active facet='cuisine' attribute entity ids. */
  async getCuisineIds(): Promise<ReadonlySet<string>> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.ids;
    }
    try {
      const rows = await this.prisma.$queryRaw<Array<{ entity_id: string }>>`
        SELECT entity_id
        FROM core_entities
        WHERE facet = 'cuisine'
          AND status <> 'archived'
      `;
      const ids: ReadonlySet<string> = new Set(rows.map((r) => r.entity_id));
      this.cache = { ids, expiresAt: now + CuisineFacetRegistry.TTL_MS };
      return ids;
    } catch (error) {
      this.logger.error(
        'Cuisine facet load failed — degrading to empty set (single-bucket placement, single-column projection) until the next TTL window',
        error instanceof Error ? error : new Error(String(error)),
      );
      return this.cache?.ids ?? new Set<string>();
    }
  }
}
