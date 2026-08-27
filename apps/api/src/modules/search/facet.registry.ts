import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { DietaryConstraintRegistry } from './dietary-constraints';
import { RegistryCache } from './registry-cache';

/**
 * THE FACET REGISTRY (red-team L3 F4, 2026-08-26) — one authority for
 * "what curated facet does this attribute id belong to, and what does the
 * facet buy it".
 *
 * The placement principle (previously hardcoded as tiers in
 * pickPlacedWinner): a curated facet verdict about the VOCABULARY beats
 * the accidental type of whichever entity matched — a junk dish entity
 * literally named "mexican" must not outrank the cuisine reading. Among
 * facets, the more restrictive/safety-bearing verdict wins: dietary is a
 * CORRECTNESS constraint (softening vegan is a wrong answer), cuisine a
 * RELEVANCE one. That ordering is a RANK ON THE FACET — a data row below,
 * not a code tier. A new facet is a new row here, never a new registry
 * class + a new `.find()` tier + a new parameter threaded through every
 * placement call site.
 */
export const FACET_PLACEMENT_RANK: Readonly<Record<string, number>> = {
  /** Correctness/safety verdict — wins outright. */
  dietary: 0,
  /** Relevance verdict — beats the type order, loses to dietary. */
  cuisine: 1,
};

/**
 * THE CANONICAL CUISINE ROW PREDICATE — `core_entities.facet = 'cuisine'`
 * marks the curated cuisine attribute rows (class ② of the 2026-08 data
 * audit; ~89 active rows). Every consumer of "the cuisine vocabulary"
 * reads THIS predicate (the curated-list builder used to derive a second,
 * drifting cuisine set from `restaurant_metadata->'cuisineExtraction'` —
 * F4 killed it).
 *
 * ACTIVE-only (redteam-l2 K5; supersedes an earlier "non-archived" take):
 * `pending` is NOT a curated verdict — it is adjudication's quarantine
 * (editorial mints wait there for the judge). Every write-side projection
 * (`derivePlaceAttributes`, the grain bridge) is active-only, so a pending
 * cuisine admitted here compiles a wall over columns that can never contain
 * it: a query that grounds and returns zero rows. One predicate, shared
 * with the projections (cuisine-attribute.ts holds the composable form).
 */
export const CUISINE_FACET_ROW_WHERE_SQL = `facet = 'cuisine' AND status = 'active'`;

@Injectable()
export class FacetRegistry {
  private readonly logger: LoggerService;
  /** The vocabulary is small and changes only by curation; 5 minutes
   *  bounds staleness without a per-search query. Fail-open to the LAST
   *  GOOD set (or empty when cold) — a read outage degrades to pre-facet
   *  behavior (single-bucket placement, single-column projection), it
   *  does not kill search — installed with a 30s backoff TTL (F7). */
  private readonly cuisineCache = new RegistryCache<ReadonlySet<string>>({
    ttlMs: 5 * 60 * 1000,
    errorTtlMs: 30 * 1000,
    load: async () => {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{ entity_id: string }>
      >(
        `SELECT entity_id FROM core_entities WHERE ${CUISINE_FACET_ROW_WHERE_SQL}`,
      );
      return new Set(rows.map((r) => r.entity_id));
    },
    degrade: (error, stale) => {
      this.logger.error(
        'Cuisine facet load failed — serving the degraded set on a short backoff TTL (single-bucket placement, single-column projection) until a load succeeds',
        error instanceof Error ? error : new Error(String(error)),
      );
      return stale ?? new Set<string>();
    },
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly dietaryConstraints: DietaryConstraintRegistry,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('FacetRegistry');
  }

  /** Active facet='cuisine' attribute entity ids. */
  async getCuisineIds(): Promise<ReadonlySet<string>> {
    return this.cuisineCache.get();
  }

  /**
   * entityId → placement rank, for every faceted id. Placement sorts by
   * (this rank, then the cross-type order); unfaceted ids carry no entry
   * and rank behind every faceted one. Dietary ids come from the ONE
   * dietary derivation (DietaryConstraintRegistry — its fail-closed law
   * is load-bearing and stays there); on overlap the safer rank wins.
   */
  async getPlacementRanks(): Promise<ReadonlyMap<string, number>> {
    const [dietaryIds, cuisineIds] = await Promise.all([
      this.dietaryConstraints.getDietaryIds(),
      this.getCuisineIds(),
    ]);
    const ranks = new Map<string, number>();
    for (const id of cuisineIds) {
      ranks.set(id, FACET_PLACEMENT_RANK.cuisine);
    }
    for (const id of dietaryIds) {
      ranks.set(id, FACET_PLACEMENT_RANK.dietary);
    }
    return ranks;
  }
}
