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

  /** The dietary toggle strip's OPTIONS — the curated vocabulary IS the
   *  authority (spec §1.3: "a small CURATED constraintClass flag on the
   *  attribute entities themselves, closed set, owner-approved"). The app
   *  renders whatever this returns, so adding/removing a lifestyle toggle
   *  is a curation act in ONE place, never a hand-list in the client. */
  async listDietaryOptions(): Promise<Array<{ name: string; label: string }>> {
    const pairs = await this.getDietaryPairs();
    return Array.from(pairs.keys())
      .sort()
      .map((name) => ({
        name,
        label: name.replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
  }

  /** One dietary WALL per canonical name, with its per-projection ids
   *  (owner semantics 2026-08-04): the DISH projection requires the
   *  dish-side attribute; the RESTAURANT projection passes on venue-side
   *  attribute OR any dish carrying the dish-side attribute. A name may
   *  lack one side (vegetarian has no venue row today) — the wall then
   *  has only the arms that exist. */
  async getDietaryPairs(): Promise<
    ReadonlyMap<
      string,
      { foodAttributeId?: string; restaurantAttributeId?: string }
    >
  > {
    await this.getDietaryIds(); // refresh shared cache window
    try {
      const rows = await this.prisma.entity.findMany({
        where: { constraintClass: 'dietary', status: 'active' },
        select: { entityId: true, name: true, type: true },
      });
      const pairs = new Map<
        string,
        { foodAttributeId?: string; restaurantAttributeId?: string }
      >();
      for (const row of rows) {
        const key = row.name.toLowerCase();
        const pair = pairs.get(key) ?? {};
        if (row.type === 'food_attribute') pair.foodAttributeId = row.entityId;
        if (row.type === 'restaurant_attribute')
          pair.restaurantAttributeId = row.entityId;
        pairs.set(key, pair);
      }
      return pairs;
    } catch {
      return new Map();
    }
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
