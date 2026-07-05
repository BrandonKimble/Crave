import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

export interface SiblingCutOptions {
  /** Max forward rank (nearest-first position in the anchor's neighborhood). */
  forwardK: number;
  /** Max MUTUAL rank — the anchor's rank inside the sibling's own neighborhood.
   *  The discriminator: junk that interleaves by cosine fails reciprocity. */
  mutualR: number;
  /** Cosine tail guard (NOT a sibling/junk separator — junk interleaves above it). */
  minCosine: number;
  /** Fan-out cap on anchors (first N resolved winners). */
  maxAnchors: number;
}

/**
 * Runtime reader for dense sibling co-inclusion. The heavy lifting (HNSW
 * neighborhoods + mutual ranks) is precomputed offline into
 * `derived_entity_sibling_edges` by EntitySiblingEdgeBuilderService; this is a
 * single indexed read applying the production cut
 * `cosine ≥ floor ∧ forward_rank ≤ K ∧ mutual_rank ≤ R` from env-tunable knobs —
 * zero vector math, zero embedding calls, no per-search model inference.
 *
 * The sibling-side join re-checks `type='food' AND status='active'` so an entity
 * merged/archived after the last nightly rebuild can never surface (read-time
 * staleness guard). Fails open: any error → [] (search runs unwidened).
 */
@Injectable()
export class SearchSiblingExpansionService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchSiblingExpansionService');
  }

  /**
   * Canonical category membership (ONE-HOP rule): given the EXACT query food ids,
   * returns the foods that belong to any of them as a category — read from
   * `derived_food_category_edges` (per-FOOD, reconciled across all mentions), so
   * membership is deterministic per dish, never per-connection mention luck.
   * Called with BASE ids only, never with sibling/expanded ids — that one-hop
   * restriction is what kills the pizza→(sibling flatbread)→(category)→rashoosh
   * transitive fan-out. Fails open to [].
   */
  async getCategoryMemberFoodIds(categoryFoodIds: string[]): Promise<string[]> {
    const ids = Array.from(new Set(categoryFoodIds.filter(Boolean)));
    if (!ids.length) return [];
    try {
      const rows = await this.prisma.$queryRaw<{ foodId: string }[]>(
        Prisma.sql`
          SELECT DISTINCT e.food_id AS "foodId"
          FROM derived_food_category_edges e
          JOIN core_entities f ON f.entity_id = e.food_id
            AND f.type = 'food'::entity_type
            AND f.status = 'active'::entity_status
          WHERE e.category_id = ANY(${ids}::uuid[])
        `,
      );
      const exclude = new Set(ids);
      return rows.map((r) => r.foodId).filter((id) => !exclude.has(id));
    } catch (error) {
      this.logger.warn('Category member read failed (failing open)', {
        categoryCount: ids.length,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return [];
    }
  }

  async getSiblingFoodIds(
    anchorFoodIds: string[],
    options: SiblingCutOptions,
  ): Promise<{ siblingId: string; relevance: number }[]> {
    const anchors = Array.from(new Set(anchorFoodIds.filter(Boolean))).slice(
      0,
      Math.max(1, options.maxAnchors),
    );
    if (!anchors.length) return [];

    try {
      // `relevance` = CEILING-NORMALIZED cosine: this sibling's cosine divided
      // by its anchor's CLOSEST-sibling cosine. Raw cosine is not comparable
      // across queries (per-dish family ceilings span ~0.77–0.95 — the same
      // measurement that made top-K beat a flat floor); normalizing by each
      // anchor's own ceiling makes 0.9 mean "90% as close as this dish's
      // closest relative" for EVERY query. Multi-anchor unions keep the MAX.
      const rows = await this.prisma.$queryRaw<
        { siblingId: string; relevance: number }[]
      >(
        Prisma.sql`
          SELECT "siblingId", MAX(normalized) AS "relevance"
          FROM (
            SELECT
              e.sibling_entity_id AS "siblingId",
              e.cosine / MAX(e.cosine) OVER (PARTITION BY e.anchor_entity_id)
                AS normalized
            FROM derived_entity_sibling_edges e
            JOIN core_entities s ON s.entity_id = e.sibling_entity_id
              AND s.type = 'food'::entity_type
              AND s.status = 'active'::entity_status
            WHERE e.anchor_entity_id = ANY(${anchors}::uuid[])
              AND e.cosine >= ${options.minCosine}
              AND e.forward_rank <= ${options.forwardK}
              AND e.mutual_rank IS NOT NULL
              AND e.mutual_rank <= ${options.mutualR}
          ) sib
          GROUP BY "siblingId"
        `,
      );
      const anchorSet = new Set(anchors);
      return rows
        .filter((r) => !anchorSet.has(r.siblingId))
        .map((r) => ({
          siblingId: r.siblingId,
          relevance: Number(r.relevance),
        }));
    } catch (error) {
      this.logger.warn('Sibling expansion read failed (failing open)', {
        anchorCount: anchors.length,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return [];
    }
  }
}
