/**
 * THE DISH-SET VENUE-CUISINE EVIDENCE LANE (ideal-architecture D5,
 * owner-blessed 2026-08-30). Deterministic (no LLM), writes EVIDENCE ROWS
 * into core_restaurant_attribute_evidence — never restaurant_attributes
 * directly (the one-writer law; the read column is derivePlaceAttributes'
 * projection of these rows) — and reconciler-shaped: recompute-from-state,
 * wipe-and-rewrite its own source class, idempotent, safe to rerun any
 * night.
 *
 * 'dish_set': what a restaurant's praised dishes' cuisines imply about the
 * venue. Reads each active (restaurant, dish) connection's dish KNOWLEDGE
 * cuisines (core_entities.knowledge_cuisines — the canonical dish-side home
 * the grain bridge also projects) and claims a venue cuisine when a
 * MAJORITY of the cuisine-attributed connections carry it with at least
 * MIN_SUPPORT distinct connections. A place whose praised dishes are pad
 * thai, khao soi and larb is a thai place even when Google says only
 * "restaurant" and no editorial exists.
 *
 * THRESHOLD PROVENANCE (no-fake-estimates law): the share distribution
 * was measured on staging 2026-08-30 and is EMPTY — knowledge_cuisines
 * is unpopulated corpus-wide (every dish stamp is knowledge v1; the v2
 * cuisine widening backfill is still owed, see dish-knowledge-rule.ts).
 * So no data-chosen cutoff exists yet. The defaults are PRINCIPLE-derived,
 * not estimated: MAJORITY (> half of what the kitchen is praised for —
 * plurality is the only scale-free line) and MIN_SUPPORT = 2, the same
 * support floor derived_food_category_edges already uses (>=2 connections
 * before a per-mention claim becomes a concept fact). The backfill runner
 * prints the real distribution on every dry run; re-confirm the constants
 * against it once the v2 backfill lands.
 *
 * HISTORY: this service used to also own a deterministic 'venue_name'
 * lane (cuisine-vocab word in the place name, projected via a
 * corroborated-or-unopposed vote). The owner rejected the vote as
 * unprincipled (2026-08-30): the NAME is now a first-class input of the
 * LLM venue-facts judge (cuisine-prompt.md, PlaceCuisineExtractionService)
 * which rules on the word's JOB in the name — kitchen claim vs product
 * word / proper name / homograph — so the lane and its vote are deleted.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { derivePlaceAttributes } from '../content-processing/reddit-collector/place-attribute-projection';
import { cuisineVocabularySql } from '../content-processing/entity-resolver/cuisine-attribute';

export const DISH_SET_SOURCE_CLASS = 'dish_set';

/** Share of cuisine-attributed connections a cuisine must reach (strict >). */
export const DISH_SET_MAJORITY_SHARE = 0.5;
/** Distinct supporting connections a cuisine must have (>=). */
export const DISH_SET_MIN_SUPPORT = 2;

export interface LaneDiff {
  /** Desired (place, attribute) pairs this recompute derived. */
  desired: number;
  inserted: number;
  deleted: number;
  /** Distinct places whose lane rows changed. */
  placesChanged: number;
}

export interface VenueCuisineEvidenceReport {
  dryRun: boolean;
  dishSetLane: LaneDiff & {
    restaurantsWithCuisineKnowledge: number;
    /** share histogram (bucket floor -> candidate pair count), the
     *  measurement the thresholds must be re-confirmed against. */
    shareDistribution: Record<string, number>;
  };
}

/**
 * Pure threshold rule for the dish-set lane: which cuisines does this
 * restaurant's dish set imply? `counts` maps cuisine id -> distinct
 * supporting connections; `attributedConnections` is the number of
 * distinct connections carrying ANY cuisine knowledge (dishes the
 * knowledge system has not judged yet neither support nor dilute).
 */
export function selectDishSetCuisines(
  counts: Map<string, number>,
  attributedConnections: number,
): Array<{ cuisineId: string; support: number }> {
  if (attributedConnections <= 0) return [];
  const selected: Array<{ cuisineId: string; support: number }> = [];
  for (const [cuisineId, support] of counts) {
    if (support < DISH_SET_MIN_SUPPORT) continue;
    if (support / attributedConnections <= DISH_SET_MAJORITY_SHARE) continue;
    selected.push({ cuisineId, support });
  }
  return selected.sort((a, b) => b.support - a.support);
}

interface EvidenceKey {
  placeId: string;
  attributeId: string;
  observations: number;
}

@Injectable()
export class VenueCuisineEvidenceService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('VenueCuisineEvidence');
  }

  /**
   * Recompute the dish-set lane (optionally scoped to placeIds — tests and
   * targeted repairs; unscoped = the whole active corpus, the nightly
   * shape). Wipe-and-rewrite via diff (only changed rows touch the DB),
   * then re-project every place whose rows changed.
   */
  async reconcile(
    options: { placeIds?: string[]; dryRun?: boolean } = {},
  ): Promise<VenueCuisineEvidenceReport> {
    const dryRun = options.dryRun ?? false;
    const scope = options.placeIds?.length ? options.placeIds : null;

    const dishSetLane = await this.computeDishSetLane(scope);

    const report: VenueCuisineEvidenceReport = {
      dryRun,
      dishSetLane: {
        ...(await this.applyLaneDiff(
          DISH_SET_SOURCE_CLASS,
          dishSetLane.desired,
          scope,
          dryRun,
        )),
        restaurantsWithCuisineKnowledge:
          dishSetLane.restaurantsWithCuisineKnowledge,
        shareDistribution: dishSetLane.shareDistribution,
      },
    };

    this.logger.info('Venue-cuisine evidence lane reconciled', {
      dryRun,
      scoped: Boolean(scope),
      dishSetLane: {
        ...report.dishSetLane,
        shareDistribution: undefined,
      } as unknown as Record<string, unknown>,
    });
    return report;
  }

  /** Majority cuisine of the dish set's knowledge attributions. */
  private async computeDishSetLane(scope: string[] | null): Promise<{
    desired: EvidenceKey[];
    restaurantsWithCuisineKnowledge: number;
    shareDistribution: Record<string, number>;
  }> {
    const scopeSql = scope
      ? Prisma.sql`AND ri.restaurant_id = ANY(${scope}::uuid[])`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{
        restaurant_id: string;
        cuisine_id: string;
        support: number;
        attributed: number;
      }>
    >`
      WITH conn AS (
        SELECT ri.restaurant_id, ri.connection_id, kc.id AS cuisine_id
          FROM core_restaurant_items ri
          JOIN core_entities f ON f.entity_id = ri.food_id
          CROSS JOIN LATERAL unnest(f.knowledge_cuisines) AS kc(id)
          JOIN core_entities ce ON ce.entity_id = kc.id
           AND ${cuisineVocabularySql('ce')}
         WHERE NOT COALESCE(ri.is_category_item, false)
           ${scopeSql}
      ),
      attributed AS (
        SELECT restaurant_id, COUNT(DISTINCT connection_id)::int AS n
          FROM conn GROUP BY restaurant_id
      ),
      per_cuisine AS (
        SELECT restaurant_id, cuisine_id,
               COUNT(DISTINCT connection_id)::int AS k
          FROM conn GROUP BY restaurant_id, cuisine_id
      )
      SELECT p.restaurant_id, p.cuisine_id, p.k AS support, a.n AS attributed
        FROM per_cuisine p
        JOIN attributed a USING (restaurant_id)`;

    const byRestaurant = new Map<
      string,
      { counts: Map<string, number>; attributed: number }
    >();
    const shareDistribution: Record<string, number> = {};
    for (const row of rows) {
      const entry = byRestaurant.get(row.restaurant_id) ?? {
        counts: new Map<string, number>(),
        attributed: row.attributed,
      };
      entry.counts.set(row.cuisine_id, Number(row.support));
      byRestaurant.set(row.restaurant_id, entry);
      const share = Number(row.support) / Number(row.attributed);
      const bucket = (Math.floor(share * 10) / 10).toFixed(1);
      shareDistribution[bucket] = (shareDistribution[bucket] ?? 0) + 1;
    }

    const desired: EvidenceKey[] = [];
    for (const [restaurantId, entry] of byRestaurant) {
      for (const pick of selectDishSetCuisines(
        entry.counts,
        entry.attributed,
      )) {
        desired.push({
          placeId: restaurantId,
          attributeId: pick.cuisineId,
          observations: pick.support,
        });
      }
    }
    return {
      desired,
      restaurantsWithCuisineKnowledge: byRestaurant.size,
      shareDistribution,
    };
  }

  /**
   * Diff the lane's desired rows against its existing source-class rows
   * (scoped when the recompute was scoped), delete the stale, insert the
   * new, refresh changed observation counts, then re-project every place
   * whose lane rows changed. Idempotent: a second run diffs to zero.
   */
  private async applyLaneDiff(
    sourceClass: string,
    desired: EvidenceKey[],
    scope: string[] | null,
    dryRun: boolean,
  ): Promise<LaneDiff> {
    const existing = await this.prisma.placeAttributeEvidence.findMany({
      where: {
        sourceClass,
        ...(scope ? { placeId: { in: scope } } : {}),
      },
      select: { placeId: true, attributeId: true, observations: true },
    });
    const keyOf = (row: { placeId: string; attributeId: string }) =>
      `${row.placeId}:${row.attributeId}`;
    const desiredByKey = new Map(desired.map((row) => [keyOf(row), row]));
    const existingByKey = new Map(existing.map((row) => [keyOf(row), row]));

    const toInsert = desired.filter((row) => !existingByKey.has(keyOf(row)));
    const toDelete = existing.filter((row) => !desiredByKey.has(keyOf(row)));
    const toUpdate = desired.filter((row) => {
      const current = existingByKey.get(keyOf(row));
      return current && current.observations !== row.observations;
    });

    const changedPlaces = new Set<string>([
      ...toInsert.map((row) => row.placeId),
      ...toDelete.map((row) => row.placeId),
      ...toUpdate.map((row) => row.placeId),
    ]);

    if (!dryRun && changedPlaces.size) {
      if (toDelete.length) {
        await this.prisma.placeAttributeEvidence.deleteMany({
          where: {
            sourceClass,
            OR: toDelete.map((row) => ({
              placeId: row.placeId,
              attributeId: row.attributeId,
            })),
          },
        });
      }
      if (toInsert.length) {
        await this.prisma.placeAttributeEvidence.createMany({
          data: toInsert.map((row) => ({
            placeId: row.placeId,
            attributeId: row.attributeId,
            sourceClass,
            observations: row.observations,
          })),
          skipDuplicates: true,
        });
      }
      for (const row of toUpdate) {
        await this.prisma.placeAttributeEvidence.update({
          where: {
            placeId_attributeId_sourceClass: {
              placeId: row.placeId,
              attributeId: row.attributeId,
              sourceClass,
            },
          },
          data: { observations: row.observations },
        });
      }
      await derivePlaceAttributes(this.prisma, [...changedPlaces]);
    }

    return {
      desired: desired.length,
      inserted: toInsert.length,
      deleted: toDelete.length,
      placesChanged: changedPlaces.size,
    };
  }
}
