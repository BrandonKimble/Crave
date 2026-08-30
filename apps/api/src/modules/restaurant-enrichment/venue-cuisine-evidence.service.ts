/**
 * THE TWO MISSING VENUE-CUISINE EVIDENCE LANES (ideal-architecture D5,
 * owner-blessed 2026-08-30). Both are DETERMINISTIC (no LLM), both write
 * EVIDENCE ROWS into core_restaurant_attribute_evidence — never
 * restaurant_attributes directly (the one-writer law; the read column is
 * derivePlaceAttributes' projection of these rows) — and both are
 * reconciler-shaped: recompute-from-state, wipe-and-rewrite their own
 * source class, idempotent, safe to rerun any night.
 *
 * LANE 1 — 'dish_set': what a restaurant's praised dishes' cuisines imply
 * about the venue. Reads each active (restaurant, dish) connection's dish
 * KNOWLEDGE cuisines (core_entities.knowledge_cuisines — the canonical
 * dish-side home the grain bridge also projects) and claims a venue
 * cuisine when a MAJORITY of the cuisine-attributed connections carry it
 * with at least MIN_SUPPORT distinct connections. A place whose praised
 * dishes are pad thai, khao soi and larb is a thai place even when Google
 * says only "restaurant" and no editorial exists.
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
 * LANE 2 — 'venue_name': a cuisine-vocab word at a word boundary in the
 * venue's own name. Measured ~98% right
 * (plans/cuisine-name-signal-measurement.md); the ~2% wrong are
 * product-word homographs which the PROJECTION outvotes (see
 * place-attribute-projection.ts — corroborated-or-unopposed vote; this
 * lane deliberately writes the row even for "Texas French Bread" so the
 * outvoting stays visible and re-derivable, never a hidden word list).
 * The only write-time gate is venue identity, not vocabulary: a
 * Google-grounded place whose types are ALL non-food (a museum, a park)
 * makes no kitchen claim at all, so its name states no cuisine.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  derivePlaceAttributes,
  VENUE_NAME_SOURCE_CLASS,
} from '../content-processing/reddit-collector/place-attribute-projection';
import { cuisineVocabularySql } from '../content-processing/entity-resolver/cuisine-attribute';
import { GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP } from './google-place-type-attributes';

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
  nameLane: LaneDiff & {
    matchedPairs: number;
    skippedNonFoodVenues: number;
    /** The lane's desired (place, cuisine) pairs — lets the backfill
     *  runner print projection verdicts without writing anything. */
    desiredRows: Array<{ placeId: string; attributeId: string }>;
  };
  dishSetLane: LaneDiff & {
    restaurantsWithCuisineKnowledge: number;
    /** share histogram (bucket floor -> candidate pair count), the
     *  measurement the thresholds must be re-confirmed against. */
    shareDistribution: Record<string, number>;
  };
}

/** Escape a cuisine vocabulary name for use inside a POSIX regex. */
export function escapeCuisineRegex(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** '\m…\M' word-boundary pattern over the lowercased place name — the
 *  exact matcher the 2026-08-29 measurement certified. */
export function buildCuisineNamePattern(name: string): string {
  return `\\m${escapeCuisineRegex(name.toLowerCase())}\\M`;
}

/**
 * Does this stored Google type list describe a FOOD venue? Empty/absent
 * types (an ungrounded place) is treated as "unknown" -> true: the name
 * is then the only knowledge there is, which is exactly where the
 * measured lane helps most (92/719 measured pairs had no other evidence).
 */
export function isFoodVenueTypeList(types: string[]): boolean {
  if (!types.length) return true;
  return types.some((type) => type in GOOGLE_PLACE_TYPE_ATTRIBUTE_MAP);
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
   * Recompute both lanes (optionally scoped to placeIds — tests and
   * targeted repairs; unscoped = the whole active corpus, the nightly
   * shape). Wipe-and-rewrite per lane via diff (only changed rows touch
   * the DB), then re-project every place whose rows changed.
   */
  async reconcile(
    options: { placeIds?: string[]; dryRun?: boolean } = {},
  ): Promise<VenueCuisineEvidenceReport> {
    const dryRun = options.dryRun ?? false;
    const scope = options.placeIds?.length ? options.placeIds : null;

    const nameLane = await this.computeNameLane(scope);
    const dishSetLane = await this.computeDishSetLane(scope);

    const report: VenueCuisineEvidenceReport = {
      dryRun,
      nameLane: {
        ...(await this.applyLaneDiff(
          VENUE_NAME_SOURCE_CLASS,
          nameLane.desired,
          scope,
          dryRun,
        )),
        matchedPairs: nameLane.matchedPairs,
        skippedNonFoodVenues: nameLane.skippedNonFoodVenues,
        desiredRows: nameLane.desired.map((row) => ({
          placeId: row.placeId,
          attributeId: row.attributeId,
        })),
      },
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

    this.logger.info('Venue-cuisine evidence lanes reconciled', {
      dryRun,
      scoped: Boolean(scope),
      nameLane: {
        ...report.nameLane,
        desiredRows: undefined,
      } as unknown as Record<string, unknown>,
      dishSetLane: {
        ...report.dishSetLane,
        shareDistribution: undefined,
      } as unknown as Record<string, unknown>,
    });
    return report;
  }

  /** LANE 2: cuisine-vocab word at a word boundary in the place name. */
  private async computeNameLane(scope: string[] | null): Promise<{
    desired: EvidenceKey[];
    matchedPairs: number;
    skippedNonFoodVenues: number;
  }> {
    const vocab = await this.prisma.$queryRaw<
      Array<{ entity_id: string; name: string }>
    >`
      SELECT e.entity_id, e.name FROM core_entities e
       WHERE ${cuisineVocabularySql('e')}`;
    if (!vocab.length) {
      return { desired: [], matchedPairs: 0, skippedNonFoodVenues: 0 };
    }
    const cuisineIds = vocab.map((row) => row.entity_id);
    const patterns = vocab.map((row) => buildCuisineNamePattern(row.name));

    const scopeSql = scope
      ? Prisma.sql`AND p.entity_id = ANY(${scope}::uuid[])`
      : Prisma.empty;
    const matches = await this.prisma.$queryRaw<
      Array<{ place_id: string; cuisine_id: string; google_types: string[] }>
    >`
      SELECT p.entity_id AS place_id,
             c.cid AS cuisine_id,
             COALESCE(ARRAY(
               SELECT t.value FROM jsonb_array_elements_text(
                 p.restaurant_metadata->'googlePlaces'->'types'
               ) t
             ), ARRAY[]::text[]) AS google_types
        FROM core_entities p
        JOIN unnest(${cuisineIds}::uuid[], ${patterns}::text[]) AS c(cid, pat)
          ON lower(p.name) ~ c.pat
       WHERE p.type = 'place'::entity_type
         AND p.status = 'active'::entity_status
         ${scopeSql}`;

    const desired: EvidenceKey[] = [];
    let skippedNonFoodVenues = 0;
    for (const row of matches) {
      if (!isFoodVenueTypeList(row.google_types)) {
        skippedNonFoodVenues += 1;
        continue;
      }
      desired.push({
        placeId: row.place_id,
        attributeId: row.cuisine_id,
        observations: 1,
      });
    }
    return { desired, matchedPairs: matches.length, skippedNonFoodVenues };
  }

  /** LANE 1: majority cuisine of the dish set's knowledge attributions. */
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
