import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { identityScope } from '../../shared/locale';
import {
  redirectJoinSql,
  resolvedSubjectSql,
} from '../signals/subject-identity';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/** Request-scoped memoized view of the widening reads (H6). */
export type SiblingExpansionReader = Pick<
  SearchSiblingExpansionService,
  | 'getCategoryMemberItemIds'
  | 'getNameContainmentVariantItemIds'
  | 'getSameNamedIngredientIds'
  | 'getSiblingItemIds'
  | 'getSatisfiesItemIds'
>;

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
 * The sibling-side join re-checks `type='item' AND status='active'` so an entity
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
   * ONE WIDENING RESOLUTION PER REQUEST (audit H6). The pre-probe seed, the
   * similar-ring inside the pooled stage, and the lexical-expansion path all
   * read siblings/satisfies for the SAME anchor set — up to three identical
   * round-trips per search, and the pooled stage can execute more than once
   * (page fill). A request-scoped reader memoizes each read by argument
   * identity, so every consumer sees the same resolution and the DB is
   * asked once. The memo lives and dies with the request — no
   * cross-request staleness surface.
   *
   * Two red-team-proven traps this shape avoids (2026-08-09):
   * - The key preserves ANCHOR ORDER. The underlying reads cap anchors by
   *   insertion order (`.slice(0, maxAnchors)`), so the same id SET in a
   *   different order is a DIFFERENT question (74 vs 77 siblings measured).
   *   A sorted key silently handed the first caller's answer to everyone.
   * - Each consumer gets its OWN shallow copy of the result. The memoized
   *   promise otherwise hands one shared array to every call site, and a
   *   single in-place mutation (sort/splice) would corrupt the others'
   *   view.
   */
  forRequest(): SiblingExpansionReader {
    const memo = new Map<string, Promise<unknown>>();
    const keyed = <T>(
      key: string,
      run: () => Promise<T>,
      copy: (value: T) => T,
    ): Promise<T> => {
      let pending = memo.get(key) as Promise<T> | undefined;
      if (!pending) {
        pending = run();
        memo.set(key, pending);
      }
      return pending.then(copy);
    };
    const idsKey = (ids: string[]): string => ids.filter(Boolean).join(',');
    const copyArray = <T>(rows: T[]): T[] => rows.slice();
    return {
      getCategoryMemberItemIds: (ids) =>
        keyed(
          `cat|${idsKey(ids)}`,
          () => this.getCategoryMemberItemIds(ids),
          copyArray,
        ),
      getNameContainmentVariantItemIds: (ids) =>
        keyed(
          `ncv|${idsKey(ids)}`,
          () => this.getNameContainmentVariantItemIds(ids),
          (value) => ({
            isVariantOf: value.isVariantOf.slice(),
            mentionsIt: value.mentionsIt.slice(),
          }),
        ),
      getSameNamedIngredientIds: (ids) =>
        keyed(
          `twin|${idsKey(ids)}`,
          () => this.getSameNamedIngredientIds(ids),
          copyArray,
        ),
      getSiblingItemIds: (ids, options) =>
        keyed(
          `sib|${idsKey(ids)}|${options.forwardK}|${options.mutualR}|${options.minCosine}|${options.maxAnchors}`,
          () => this.getSiblingItemIds(ids, options),
          copyArray,
        ),
      getSatisfiesItemIds: (ids, options) =>
        keyed(
          `sat|${idsKey(ids)}|${options?.maxAnchors ?? 3}`,
          () => this.getSatisfiesItemIds(ids, options),
          (value) => ({
            satisfies: value.satisfies.slice(),
            cousin: value.cousin.slice(),
          }),
        ),
    };
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
  async getCategoryMemberItemIds(categoryItemIds: string[]): Promise<string[]> {
    const ids = Array.from(new Set(categoryItemIds.filter(Boolean)));
    if (!ids.length) return [];
    try {
      const rows = await this.prisma.$queryRaw<{ itemId: string }[]>(
        Prisma.sql`
          SELECT DISTINCT e.food_id AS "itemId"
          FROM derived_food_category_edges e
          JOIN core_entities f ON f.entity_id = e.food_id
            AND f.type = 'item'::entity_type
            AND f.status = 'active'::entity_status
          WHERE e.category_id = ANY(${ids}::uuid[])
        `,
      );
      const exclude = new Set(ids);
      return rows.map((r) => r.itemId).filter((id) => !exclude.has(id));
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

  async getSiblingItemIds(
    anchorItemIds: string[],
    options: SiblingCutOptions,
  ): Promise<{ siblingId: string; relevance: number }[]> {
    const anchors = Array.from(new Set(anchorItemIds.filter(Boolean))).slice(
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
              AND s.type = 'item'::entity_type
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
  /**
   * LLM-JUDGED SUBSTITUTABILITY (concept-graph plan, rung 4).
   *
   * `satisfies` = "a user who asked for the anchor would be happy with this",
   * so it joins the TIER-0 set beside verified category members and head-final
   * variants. `cousin` = related but a different craving, so it joins the
   * TIER-1 widened set with the dense siblings. Everything else was judged
   * `reject` and is stored precisely so it is never reconsidered.
   *
   * DIRECTED: only edges FROM an anchor are read. The reverse of a satisfies
   * edge is frequently false (`cheese -> cheese pizza` is a fine substitution;
   * `cheese pizza -> cheese` is not), and under the ranking invariant a wrong
   * tier-0 claim with a high Crave Score ranks FIRST.
   *
   * Merged-away targets are followed one hop through `entity_redirects` — the
   * merge pipeline archives a loser and writes a redirect, and nothing prunes
   * this table, so a stale edge must resolve rather than vanish. Archived
   * targets that have no redirect are dropped. ONE HOP from the anchors only:
   * the same law categories and name-containment follow — never expand an
   * expansion.
   */
  async getSatisfiesItemIds(
    baseItemIds: string[],
    options: { maxAnchors?: number } = {},
  ): Promise<{ satisfies: string[]; cousin: string[] }> {
    const ids = Array.from(new Set(baseItemIds.filter(Boolean))).slice(
      0,
      Math.max(1, options.maxAnchors ?? 3),
    );
    if (!ids.length) return { satisfies: [], cousin: [] };
    try {
      const rows = await this.prisma.$queryRaw<
        { itemId: string; relation: string }[]
      >(
        Prisma.sql`
          SELECT ${resolvedSubjectSql('s', 'r', 'to_entity_id')} AS "itemId",
                 s.relation AS "relation"
          FROM entity_satisfies s
          ${redirectJoinSql('s', 'r', 'to_entity_id')}
          JOIN core_entities t
            ON t.entity_id = ${resolvedSubjectSql('s', 'r', 'to_entity_id')}
           AND t.status = 'active'::entity_status
           AND t.type = 'item'::entity_type
          WHERE s.from_entity_id = ANY(${ids}::uuid[])
            AND s.relation IN ('satisfies', 'cousin')
        `,
      );
      const exclude = new Set(ids);
      const satisfies = new Set<string>();
      const cousin = new Set<string>();
      for (const row of rows) {
        if (exclude.has(row.itemId)) continue;
        (row.relation === 'satisfies' ? satisfies : cousin).add(row.itemId);
      }
      // A concept judged BOTH ways across different anchors is treated as the
      // weaker claim — tier 0 is the expensive place to be wrong.
      for (const id of satisfies) cousin.delete(id);
      return { satisfies: Array.from(satisfies), cousin: Array.from(cousin) };
    } catch (error) {
      // FAILS OPEN, like every other expansion read here: a widening that
      // cannot be computed must never take the search down with it.
      this.logger.warn('Satisfies expansion read failed (failing open)', {
        baseCount: ids.length,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return { satisfies: [], cousin: [] };
    }
  }

  async getNameContainmentVariantItemIds(
    baseItemIds: string[],
  ): Promise<{ isVariantOf: string[]; mentionsIt: string[] }> {
    // KL-D: reads the MATERIALIZED rung-2 table — ONE folded-key definition
    // shared with the satisfies judge (the lower(name) live scan diverged
    // from the judge's identity_key comparison: folds-equal/lowers-unequal
    // pairs fell into a hole where neither side produced the relation). The
    // un-indexable word-boundary LIKE and its maxAnchors cap are deleted;
    // this is an indexed lookup now. Read-time status re-check follows the
    // sibling-edge idiom.
    const ids = Array.from(new Set(baseItemIds.filter(Boolean)));
    if (!ids.length) return { isVariantOf: [], mentionsIt: [] };
    try {
      const rows = await this.prisma.$queryRaw<
        { itemId: string; headFinal: boolean }[]
      >(
        Prisma.sql`
          SELECT e.variant_id AS "itemId", bool_or(e.head_final) AS "headFinal"
          FROM derived_name_containment_edges e
          JOIN core_entities v ON v.entity_id = e.variant_id
           AND v.status = 'active'::entity_status
           AND v.type = 'item'::entity_type
          WHERE e.base_id = ANY(${ids}::uuid[])
          GROUP BY e.variant_id
        `,
      );
      const exclude = new Set(ids);
      const isVariantOf = new Set<string>();
      const mentionsIt = new Set<string>();
      for (const row of rows) {
        if (exclude.has(row.itemId)) continue;
        (row.headFinal ? isVariantOf : mentionsIt).add(row.itemId);
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
  async getSameNamedIngredientIds(baseItemIds: string[]): Promise<string[]> {
    const ids = Array.from(new Set(baseItemIds.filter(Boolean)));
    if (!ids.length) return [];
    try {
      const rows = await this.prisma.$queryRaw<{ ingredientId: string }[]>(
        Prisma.sql`
          SELECT DISTINCT i.entity_id AS "ingredientId"
          FROM core_entities i
          JOIN core_entities b ON b.entity_id = ANY(${ids}::uuid[])
          WHERE i.type = 'ingredient'::entity_type
            AND i.status = 'active'::entity_status
            -- FOLD-SYMMETRIC, BOTH SIDES. identity_key IS canonicalFold(name)
            -- (app-written, never a SQL fold — the fold law), and
            -- entity_surface.form_folded is the same function over a surface
            -- form. So the three arms compare like with like: an ingredient
            -- named "Créme Fraîche" now twins a food named "creme fraiche",
            -- which lower() over the unfolded aliases[] array never did.
            AND (
              i.identity_key = b.identity_key
              OR EXISTS (
                SELECT 1 FROM entity_surface s
                 WHERE s.entity_id = i.entity_id
                   AND ${identityScope('s')}
                   AND s.form_folded = b.identity_key
              )
              OR EXISTS (
                SELECT 1 FROM entity_surface s
                 WHERE s.entity_id = b.entity_id
                   AND ${identityScope('s')}
                   AND s.form_folded = i.identity_key
              )
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
