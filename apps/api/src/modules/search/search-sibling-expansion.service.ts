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

  /**
   * NAME-CONTAINMENT FAILSAFE (owner ruling 2026-07-25, data-proven): of
   * 9,472 variant/base name-containment pairs in the corpus, only 4,112
   * carried a derived category edge — 57% of name-evident relationships
   * ("carbonara udon" → carbonara, "octopus tacos" → octopus) were invisible
   * to id+edge recall. A hungry customer typing "carbonara" wants anything
   * carbonara-shaped; the dish literally SAYING the word is the strongest
   * possible evidence. Word-boundary containment (space-padded LIKE — no
   * regex injection surface), base names ≥ 4 chars, BASE ids only (the same
   * one-hop law as categories: never expand an expansion). Fails open to [].
   */
  async getNameContainmentVariantFoodIds(
    baseFoodIds: string[],
    options: { maxAnchors?: number } = {},
  ): Promise<{ isVariantOf: string[]; mentionsIt: string[] }> {
    // Anchor cap mirrors the dense-sibling cut: this scan is O(foods x
    // anchors) with no index assist (a word-boundary LIKE cannot use the
    // trigram GIN), so an uncapped multi-food query would scale linearly
    // with the catalogue. Cheap today (~9ms at 7.8k foods); the cap is
    // what keeps it cheap at 10x.
    const ids = Array.from(new Set(baseFoodIds.filter(Boolean))).slice(
      0,
      Math.max(1, options.maxAnchors ?? 3),
    );
    if (!ids.length) return { isVariantOf: [], mentionsIt: [] };
    try {
      // HEAD-FINAL RULE (2026-07-27): English compound nouns are head-final,
      // so the position of the query term decides what the variant IS.
      // "chicago deep dish PIZZA" ends with the term -> it IS a pizza (tier 0,
      // beside verified category members). "PIZZA sauce / dough / roll" only
      // MENTIONS it -> a different head noun, so it is related-not-the-thing
      // (tier 1, ranked after). No stoplist: grammar decides, not a word list.
      const rows = await this.prisma.$queryRaw<
        { foodId: string; headFinal: boolean }[]
      >(
        Prisma.sql`
          SELECT DISTINCT v.entity_id AS "foodId",
                 (lower(v.name) LIKE ('%' || ' ' || lower(b.name))) AS "headFinal"
          FROM core_entities v
          JOIN core_entities b
            ON b.entity_id = ANY(${ids}::uuid[])
           AND length(b.name) >= 4
           AND v.entity_id <> b.entity_id
           AND (' ' || lower(v.name) || ' ') LIKE ('%' || ' ' || lower(b.name) || ' ' || '%')
          WHERE v.type = 'food'::entity_type
            AND v.status = 'active'::entity_status
        `,
      );
      const exclude = new Set(ids);
      const isVariantOf = new Set<string>();
      const mentionsIt = new Set<string>();
      for (const row of rows) {
        if (exclude.has(row.foodId)) continue;
        (row.headFinal ? isVariantOf : mentionsIt).add(row.foodId);
      }
      for (const id of isVariantOf) mentionsIt.delete(id);
      return {
        isVariantOf: Array.from(isVariantOf),
        mentionsIt: Array.from(mentionsIt),
      };
    } catch (error) {
      this.logger.warn('Name-containment variant read failed (failing open)', {
        baseCount: ids.length,
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
      return { isVariantOf: [], mentionsIt: [] };
    }
  }

  /**
   * TWIN-INGREDIENT UNION (owner ruling 2026-07-25): a food search whose
   * name also exists as an ingredient entity ("burrata") must union in
   * contained-as-ingredient dishes — the customer who taps burrata is happy
   * with the pizza that contains it. Returns the same-named ingredient
   * entity ids (name or alias equality, both directions); the query builder
   * ORs their containment (evidence + canon tiers) into the food clause.
   */
  async getSameNamedIngredientIds(baseFoodIds: string[]): Promise<string[]> {
    const ids = Array.from(new Set(baseFoodIds.filter(Boolean)));
    if (!ids.length) return [];
    try {
      const rows = await this.prisma.$queryRaw<{ ingredientId: string }[]>(
        Prisma.sql`
          SELECT DISTINCT i.entity_id AS "ingredientId"
          FROM core_entities i
          JOIN core_entities b ON b.entity_id = ANY(${ids}::uuid[])
          WHERE i.type = 'ingredient'::entity_type
            AND i.status = 'active'::entity_status
            AND (
              lower(i.name) = lower(b.name)
              OR lower(b.name) IN (SELECT lower(a) FROM unnest(i.aliases) a)
              OR lower(i.name) IN (SELECT lower(a) FROM unnest(b.aliases) a)
            )
        `,
      );
      return rows.map((r) => r.ingredientId);
    } catch (error) {
      this.logger.warn('Twin-ingredient read failed (failing open)', {
        baseCount: ids.length,
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
      return [];
    }
  }
}
