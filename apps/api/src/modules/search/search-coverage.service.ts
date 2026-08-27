import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { activePlaceEventExistsSql } from '../content-processing/reddit-collector/extraction-scope.service';
import { servablePlaceConditionsSql } from '../restaurant-enrichment/servable-place-scope';

import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  conceptDishAxisSql,
  conceptRestaurantAxisSql,
  cuisineConceptConstraint,
  dietaryWallConcept,
} from './concept-membership.compiler';
import { DietaryConstraintRegistry } from './dietary-constraints';
import { FacetRegistry } from './facet.registry';
import type { ConceptConstraint } from './search-execution-directives';
import type { ShortcutCoverageRequestDto } from './dto/shortcut-coverage.dto';
import {
  buildOperatingMetadataFromLocation,
  evaluateOperatingStatus,
} from './utils/restaurant-status';

type CoveragePlaceRow = {
  location_id?: string | null;
  restaurant_id: string;
  place_name: string;
  longitude: unknown;
  latitude: unknown;
  location_hours?: unknown;
  location_utc_offset_minutes?: unknown;
  location_time_zone?: unknown;
  crave_score: unknown;
  crave_score_exact?: unknown;
  rising: unknown;
  top_connection_id?: unknown;
  top_item_name?: unknown;
  top_item_crave_score?: unknown;
  top_item_crave_score_exact?: unknown;
  top_item_rising?: unknown;
};

/**
 * SAFETY BOUND ON THE COVERAGE READ (F3807), not a ranking cut.
 *
 * DERIVATION, measured 2026-08-06 against the local corpus: the number of
 * locations that satisfy EVERY coverage eligibility predicate (coordinates,
 * google_place_id, address, active entity, public restaurant score) with NO
 * viewport filter at all — i.e. the absolute worst case a maximally
 * zoomed-out request can produce — is 11,141. This cap sits above that, so it
 * cannot truncate any viewport the corpus can currently express; what it
 * bounds is the growth the old unbounded query had no answer to (a second and
 * third city land on the same table, and the bbox is client-supplied).
 *
 * Truncation is never silent: rows are ordered by rank BEFORE the cut, so the
 * dropped dots are the lowest-ranked ones, and the event is logged under the
 * named policy `coverage-row-cap-truncation`.
 */
export const COVERAGE_MAX_ROWS = 15_000;

@Injectable()
export class SearchCoverageService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dietaryConstraints: DietaryConstraintRegistry,
    private readonly facets: FacetRegistry,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchCoverageService');
  }

  async buildShortcutCoverageGeoJson(
    request: ShortcutCoverageRequestDto,
  ): Promise<unknown> {
    const placeEntityIds = this.collectEntityIds(request.entities?.places);
    const itemEntityIds = this.collectEntityIds(request.entities?.items);
    const itemAttributeIds = this.collectEntityIds(
      request.entities?.itemAttributes,
    );
    const placeAttributeIds = this.collectEntityIds(
      request.entities?.placeAttributes,
    );

    const bounds = request.bounds;
    const neLng = bounds?.northEast?.lng;
    const neLat = bounds?.northEast?.lat;
    const swLng = bounds?.southWest?.lng;
    const swLat = bounds?.southWest?.lat;
    const hasBounds =
      typeof neLng === 'number' &&
      typeof neLat === 'number' &&
      typeof swLng === 'number' &&
      typeof swLat === 'number';
    if (!hasBounds) {
      throw new BadRequestException('bounds are required');
    }

    const conditions: Prisma.Sql[] = [
      // THE SERVABLE-PLACE FLOOR, through the one shared fragment (red-team
      // L3 F1) — the coverage/dots layer reads the same core_entities as the
      // ranked list and must carry the same floor, else an archived or
      // out-of-market place leaks onto the map as a dot the ranked list will
      // never show. ARCHIVED IS NEVER PAINTED proven RED by deleting this
      // (search-coverage-archived-leak.integration.spec.ts); MARKET
      // MEMBERSHIP per v17 S4.
      Prisma.raw(servablePlaceConditionsSql('e')),
      // Eligibility = the Crave Score v3 inclusion floor: catalogued dishes OR by-name praise
      // (mirrors the relaxed gate in search-query.builder). Restaurant-mode dots
      // (includeTopDish=false) are colored by the v3 restaurant score, so a dishless-but-praised
      // restaurant should still get a dot. In dish-mode (includeTopDish=true) the INNER top-dish
      // JOIN LATERAL below still requires a matching dish, so dishless restaurants correctly stay
      // off the dish layer.
      Prisma.sql`(EXISTS (SELECT 1 FROM core_restaurant_items c WHERE c.restaurant_id = e.entity_id) OR ${Prisma.raw(activePlaceEventExistsSql('e.entity_id'))})`,
    ];

    // TR5-N: price filter — same semantics as the ranked lane (entity price_level IN set).
    const priceLevels = Array.isArray(request.priceLevels)
      ? request.priceLevels.filter(
          (level) => Number.isInteger(level) && level >= 0 && level <= 4,
        )
      : [];
    if (priceLevels.length) {
      conditions.push(
        Prisma.sql`e.price_level = ANY(ARRAY[${Prisma.join(
          priceLevels,
        )}]::int[])`,
      );
    }

    // CONCEPT WALLS — the ONE shared derivation and the ONE shared
    // renderer (concept-membership.compiler), so the map slices with the
    // cards. Dietary learned this first: this lane used to read
    // request.dietary only, while the ranked lane also raised walls from
    // query-text grounding — typing "vegan tacos" without touching the
    // toggle strip gave a walled card list beside an unwalled map, and
    // the map was the liar. Cuisine then reproduced the same defect
    // (red-team L2 K6): coverage ANDed a cuisine id into the single
    // placement bucket (`e.restaurant_attributes && …`), so "mexican"
    // drew no dot for the Korean spot whose birria taco the list served
    // through the dish-side knowledge arm. Both now compile through the
    // same per-axis concept renderer the ranked builder uses; faceted
    // ids are partitioned OUT of the plain single-column buckets below,
    // exactly as the ranked lane partitions its membership lists.
    const dietaryWalls = await this.dietaryConstraints.resolveDietaryWalls({
      dietary: request.dietary,
      itemAttributeIds,
      placeAttributeIds,
    });
    const cuisineIds = await this.facets.getCuisineIds();
    const dietaryIds = await this.dietaryConstraints.getDietaryIds();
    const cuisineConcepts: ConceptConstraint[] = Array.from(
      new Set(
        [...itemAttributeIds, ...placeAttributeIds].filter(
          (id) => cuisineIds.has(id) && !dietaryIds.has(id),
        ),
      ),
    ).map((id) => cuisineConceptConstraint(id, 'wall'));
    const cuisineIdSet = new Set(cuisineConcepts.map((c) => c.id));
    const plainItemAttributeIds = itemAttributeIds.filter(
      (id) => !cuisineIdSet.has(id) && !dietaryIds.has(id),
    );
    const plainPlaceAttributeIds = placeAttributeIds.filter(
      (id) => !cuisineIdSet.has(id) && !dietaryIds.has(id),
    );
    const conceptWalls: ConceptConstraint[] = [
      ...cuisineConcepts,
      ...dietaryWalls.map(dietaryWallConcept),
    ];
    conditions.push(
      ...conceptWalls
        .map((concept) => conceptRestaurantAxisSql(concept, 'e'))
        .filter((sql): sql is Prisma.Sql => sql !== null),
    );

    if (placeEntityIds.length) {
      conditions.push(
        Prisma.sql`e.entity_id = ANY(ARRAY[${Prisma.join(
          placeEntityIds,
        )}]::uuid[])`,
      );
    }

    if (plainPlaceAttributeIds.length) {
      conditions.push(
        Prisma.sql`e.restaurant_attributes && ARRAY[${Prisma.join(
          plainPlaceAttributeIds,
        )}]::uuid[]`,
      );
    }

    if (itemEntityIds.length) {
      conditions.push(
        Prisma.sql`EXISTS (
          SELECT 1
          FROM core_restaurant_items c
          WHERE c.restaurant_id = e.entity_id
            AND c.food_id = ANY(ARRAY[${Prisma.join(itemEntityIds)}]::uuid[])
        )`,
      );
    }

    if (plainItemAttributeIds.length) {
      conditions.push(
        Prisma.sql`EXISTS (
          SELECT 1
          FROM core_restaurant_items c
          WHERE c.restaurant_id = e.entity_id
            AND c.food_attributes && ARRAY[${Prisma.join(
              plainItemAttributeIds,
            )}]::uuid[]
        )`,
      );
    }

    const minLng = Math.min(swLng, neLng);
    const maxLng = Math.max(swLng, neLng);
    const minLat = Math.min(swLat, neLat);
    const maxLat = Math.max(swLat, neLat);

    // SCREEN-ACCURATE viewport polygon (same as /search/run): the bounds BETWEEN above is the cheap
    // bbox pre-filter (mobile sends bounds = the polygon's bbox), and this ST_Covers trims the
    // off-screen corners so the dots layer is exactly the visible viewport, not the north-up box.
    const viewportPolygon = request.viewportPolygon;
    const viewportPolygonFilterSql =
      Array.isArray(viewportPolygon) &&
      viewportPolygon.length >= 3 &&
      viewportPolygon.every(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          Number.isFinite(point[0]) &&
          Number.isFinite(point[1]),
      )
        ? Prisma.sql`AND ST_Covers(
            ST_SetSRID(
              ST_MakePolygon(
                ST_MakeLine(
                  ARRAY[${Prisma.join(
                    [...viewportPolygon, viewportPolygon[0]].map(
                      ([lng, lat]) =>
                        Prisma.sql`ST_MakePoint(${lng}::double precision, ${lat}::double precision)`,
                    ),
                    ', ',
                  )}]
                )
              ),
              4326
            ),
            ST_SetSRID(
              ST_MakePoint(rl.longitude::double precision, rl.latitude::double precision),
              4326
            )
          )`
        : Prisma.sql``;

    const includeTopDish = request.includeTopDish === true;
    const topDishJoinSql = includeTopDish
      ? this.buildTopDishJoinSql({
          itemEntityIds,
          itemAttributeIds: plainItemAttributeIds,
          // K6: the dot's top dish matches through the SAME dish-axis
          // membership as the list — a cuisine concept reaches it through
          // either home (dietary walls stay off this pick, matching the
          // ranked restaurant card's top-dish lateral).
          cuisineConcepts,
        })
      : Prisma.sql``;
    const topDishSelectSql = includeTopDish
      ? Prisma.sql`,
        td.connection_id AS top_connection_id,
        td.food_name AS top_food_name,
        td.crave_score AS top_food_crave_score,
        td.crave_score_exact AS top_food_crave_score_exact,
        td.rising AS top_food_rising`
      : Prisma.sql``;
    // HIGH-PRECISION coverage order: percentile_rank leads so the dots/markers match the pin+list order.
    // TR5-N: rising is a SORT (matches the ranked lane): rising leads, score breaks ties.
    const risingActive = request.rising === true;
    // F3802/F1902: `e.entity_id ASC` LOOKS unique but the rows are PER
    // LOCATION — `selected_locations` emits one row per
    // core_restaurant_locations row and the join is on
    // `pl.restaurant_id = e.entity_id`, so a multi-location restaurant yields
    // N rows sharing entity_id AND every score value. `rank: index + 1` and
    // the mobile LOD group budget (pin-vs-dot) are computed off this order,
    // so the arbitrary one was user-visible. `pl.location_id ASC` is the
    // unique tail (the same file's lateral already tiebreaks on
    // `c.connection_id ASC`, which marks this as an oversight, not a choice).
    const locationTiebreakSql = Prisma.sql`e.entity_id ASC, pl.location_id ASC`;
    const coverageOrderSql = includeTopDish
      ? risingActive
        ? Prisma.sql`td.rising DESC NULLS LAST, td.crave_score_exact DESC, td.crave_score DESC, ${locationTiebreakSql}`
        : Prisma.sql`td.crave_score_exact DESC, td.crave_score DESC, ${locationTiebreakSql}`
      : risingActive
        ? Prisma.sql`prs.rising DESC NULLS LAST, prs.percentile_rank DESC, prs.display_score DESC, ${locationTiebreakSql}`
        : Prisma.sql`prs.percentile_rank DESC, prs.display_score DESC, ${locationTiebreakSql}`;
    const startedAt = Date.now();
    const rows = await this.prisma.$queryRaw<CoveragePlaceRow[]>(Prisma.sql`
      WITH candidate_locations AS (
        SELECT
          rl.location_id,
          rl.restaurant_id,
          rl.longitude,
          rl.latitude,
          rl.hours,
          rl.utc_offset_minutes,
          rl.time_zone,
          rl.updated_at
        FROM core_restaurant_locations rl
        WHERE rl.longitude IS NOT NULL
          AND rl.latitude IS NOT NULL
          AND rl.google_place_id IS NOT NULL
          AND rl.address IS NOT NULL
          -- VIEWPORT-BOUNDED COVERAGE (ideal-shape migration): coverage is now the in-view DOTS
          -- layer (every restaurant inside the submitted viewport), NOT a whole-market paint. We
          -- ALWAYS filter to the submitted bounds (previously dropped when a marketKey was present,
          -- which made coverage city-wide and polluted the on-screen ranked set). The out-of-region
          -- score-pin concept is gone; dots are strictly in-view.
          AND rl.longitude BETWEEN ${minLng} AND ${maxLng}
          AND rl.latitude BETWEEN ${minLat} AND ${maxLat}
          ${viewportPolygonFilterSql}
      ),
      selected_locations AS (
        -- Dots are PER LOCATION (master plan §7): every eligible in-view
        -- location is a dot; the mobile LOD group budget (keyed restaurantId)
        -- owns pin-vs-dot demotion for multi-location restaurants.
        SELECT
          cl.restaurant_id,
          cl.location_id,
          cl.longitude,
          cl.latitude,
          cl.hours,
          cl.utc_offset_minutes,
          cl.time_zone
        FROM candidate_locations cl
      ),
      geographic_restaurants AS (
        SELECT DISTINCT restaurant_id
        FROM candidate_locations
      ),
      public_restaurant_scores AS (
        SELECT subject_id, display_score, percentile_rank, rising
        FROM core_public_entity_scores
        WHERE subject_type = 'restaurant'
      ),
      public_connection_scores AS (
        SELECT subject_id, display_score, percentile_rank, rising
        FROM core_public_entity_scores
        WHERE subject_type = 'connection'
      )
      SELECT
        e.entity_id AS restaurant_id,
        pl.location_id AS location_id,
        e.name AS restaurant_name,
        pl.longitude AS longitude,
        pl.latitude AS latitude,
        pl.hours AS location_hours,
        pl.utc_offset_minutes AS location_utc_offset_minutes,
        pl.time_zone AS location_time_zone,
        prs.display_score AS crave_score,
        prs.percentile_rank AS crave_score_exact,
        prs.rising AS rising
        ${topDishSelectSql}
      FROM core_entities e
      JOIN selected_locations pl ON pl.restaurant_id = e.entity_id
      JOIN public_restaurant_scores prs
        ON prs.subject_id = e.entity_id
      ${topDishJoinSql}
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${coverageOrderSql}
      -- F3807: THE COVERAGE READ IS BOUNDED. It had no LIMIT at all: every
      -- eligible in-view location was materialized into JS and mapped to a
      -- GeoJSON feature, bounded only by the client-supplied bbox — so a
      -- zoomed-out viewport read whatever the corpus happened to hold. One
      -- extra row is requested as a TRUNCATION SENTINEL (see below).
      LIMIT ${COVERAGE_MAX_ROWS + 1};
    `);
    // The sentinel row is never emitted; it only tells us the cap bit.
    const coverageTruncated = rows.length > COVERAGE_MAX_ROWS;
    if (coverageTruncated) {
      rows.length = COVERAGE_MAX_ROWS;
      this.logger.warn(
        'Shortcut coverage hit the row cap; the lowest-ranked in-view dots were dropped',
        {
          policy: 'coverage-row-cap-truncation',
          cap: COVERAGE_MAX_ROWS,
        },
      );
    }

    // TR5-N: open-now post-filter — the exact machinery the ranked lane uses
    // (evaluateOperatingStatus over the location's hours/timezone). Rows WITHOUT hours data
    // are dropped, matching the executor's semantics (unsupported rows never pass an
    // open-now filter). Rank badges are re-indexed AFTER the filter (features map by index).
    let coverageRows = rows;
    if (request.openNow === true) {
      const referenceDate = new Date();
      const beforeCount = coverageRows.length;
      coverageRows = coverageRows.filter((row) => {
        const metadata = buildOperatingMetadataFromLocation(
          row.location_hours,
          row.location_utc_offset_minutes as never,
          typeof row.location_time_zone === 'string'
            ? row.location_time_zone
            : null,
        );
        if (!metadata) {
          return false;
        }
        const status = evaluateOperatingStatus(metadata, referenceDate);
        return status?.isOpen === true;
      });
      this.logger.debug('Applied open-now filter to shortcut coverage', {
        beforeCount,
        afterCount: coverageRows.length,
      });
    }

    this.logger.debug('Built shortcut coverage restaurants', {
      count: coverageRows.length,
      durationMs: Date.now() - startedAt,
    });

    // Per-feature openness (client derivation support): the mobile resolver derives the
    // open-now variant world CLIENT-SIDE from the base world (instant toggle, background
    // true-up) — that derivation must filter COVERAGE too, so every feature carries the
    // openness the open-now post-filter would have used. null = no hours data (such rows
    // never pass an open-now filter, matching the executor's semantics).
    const opennessReferenceDate = new Date();
    const resolveRowIsOpen = (
      row: (typeof coverageRows)[number],
    ): boolean | null => {
      const metadata = buildOperatingMetadataFromLocation(
        row.location_hours,
        row.location_utc_offset_minutes as never,
        typeof row.location_time_zone === 'string'
          ? row.location_time_zone
          : null,
      );
      if (!metadata) {
        return null;
      }
      const status = evaluateOperatingStatus(metadata, opennessReferenceDate);
      return status?.isOpen === true;
    };

    return {
      type: 'FeatureCollection',
      features: coverageRows
        .map((row, index) => {
          const longitude = Number(row.longitude);
          const latitude = Number(row.latitude);
          if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
            return null;
          }
          const craveScore = this.requirePublicScore(
            row.crave_score,
            `restaurant:${row.restaurant_id}`,
          );
          const craveScoreExact = this.optionalNumber(row.crave_score_exact);
          const rising = this.optionalNumber(row.rising);
          const topConnectionId =
            typeof row.top_connection_id === 'string'
              ? row.top_connection_id
              : null;
          const topItemCraveScore = includeTopDish
            ? this.requirePublicScore(
                row.top_item_crave_score,
                `connection:${topConnectionId ?? 'missing'}`,
              )
            : null;
          const topItemRising = includeTopDish
            ? this.optionalNumber(row.top_item_rising)
            : null;
          const topItemCraveScoreExact = includeTopDish
            ? this.optionalNumber(row.top_item_crave_score_exact)
            : null;
          if (includeTopDish && !topConnectionId) {
            throw new InternalServerErrorException(
              `Missing scored top dish for restaurant:${row.restaurant_id}`,
            );
          }
          const publicScore = includeTopDish ? topItemCraveScore : craveScore;
          const publicScoreExact = includeTopDish
            ? topItemCraveScoreExact
            : craveScoreExact;
          const locationId =
            typeof row.location_id === 'string' && row.location_id.length
              ? row.location_id
              : null;
          return {
            type: 'Feature',
            // Per-location identity: one dot per LOCATION (multi-location
            // restaurants emit N features sharing restaurantId — the mobile
            // visual-identity key is restaurantId:lng:lat, so they coexist).
            id: locationId
              ? `${row.restaurant_id}:${locationId}`
              : row.restaurant_id,
            geometry: { type: 'Point', coordinates: [longitude, latitude] },
            properties: {
              placeId: row.restaurant_id,
              locationId: locationId ?? undefined,
              placeName: row.place_name,
              craveScore: publicScore,
              craveScoreExact: publicScoreExact ?? undefined,
              scoreSubjectType: includeTopDish ? 'connection' : 'restaurant',
              scoreSubjectId: includeTopDish
                ? topConnectionId
                : row.restaurant_id,
              rising: includeTopDish ? topItemRising : rising,
              rank: index + 1,
              placeCraveScore: craveScore,
              isOpen: resolveRowIsOpen(row),
              isDishPin: includeTopDish ? true : undefined,
              dishName:
                includeTopDish && typeof row.top_item_name === 'string'
                  ? row.top_item_name
                  : undefined,
              connectionId:
                includeTopDish && topConnectionId ? topConnectionId : undefined,
              topDishCraveScore: includeTopDish ? topItemCraveScore : null,
            },
          };
        })
        .filter(Boolean),
    };
  }

  private buildTopDishJoinSql(params: {
    itemEntityIds: string[];
    itemAttributeIds: string[];
    cuisineConcepts: ConceptConstraint[];
  }): Prisma.Sql {
    const { itemEntityIds, itemAttributeIds, cuisineConcepts } = params;
    const conditions: Prisma.Sql[] = [
      Prisma.sql`c.restaurant_id = e.entity_id`,
    ];
    if (itemEntityIds.length) {
      conditions.push(
        Prisma.sql`c.food_id = ANY(ARRAY[${Prisma.join(
          itemEntityIds,
        )}]::uuid[])`,
      );
    }
    if (itemAttributeIds.length) {
      conditions.push(
        Prisma.sql`c.food_attributes && ARRAY[${Prisma.join(
          itemAttributeIds,
        )}]::uuid[]`,
      );
    }
    // K6: dish-axis membership through the shared concept renderer — the
    // birria taco at the Korean spot is a valid top dish for a "mexican"
    // dot because the DISH carries the concept, even though the venue
    // array does not.
    conditions.push(
      ...cuisineConcepts
        .map((concept) =>
          conceptDishAxisSql(concept, { connection: 'c', restaurant: 'e' }),
        )
        .filter((sql): sql is Prisma.Sql => sql !== null),
    );
    const orderSql = Prisma.sql`COALESCE(pcs.percentile_rank, -1) DESC, COALESCE(pcs.display_score, -1) DESC, c.connection_id ASC`;

    return Prisma.sql`
      JOIN LATERAL (
        SELECT
          c.connection_id,
          f.name AS food_name,
          pcs.display_score AS crave_score,
          pcs.percentile_rank AS crave_score_exact,
          pcs.rising AS rising
        FROM core_restaurant_items c
        JOIN core_entities f ON f.entity_id = c.food_id
        JOIN public_connection_scores pcs
          ON pcs.subject_id = c.connection_id
        WHERE ${Prisma.join(conditions, ' AND ')}
        ORDER BY ${orderSql}
        LIMIT 1
      ) td ON true
    `;
  }

  private requirePublicScore(value: unknown, label: string): number {
    const parsed = this.optionalNumber(value);
    if (parsed === null) {
      throw new InternalServerErrorException(
        `Missing public Crave Score for ${label}`,
      );
    }
    return parsed;
  }

  private optionalNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (value && typeof value === 'object' && 'toNumber' in value) {
      const parsed = (value as { toNumber: () => number }).toNumber();
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private collectEntityIds(
    value?: Array<{ entityIds: string[] }> | null,
  ): string[] {
    if (!Array.isArray(value) || value.length === 0) {
      return [];
    }
    const ids = value.flatMap((entry) =>
      Array.isArray(entry?.entityIds) ? entry.entityIds : [],
    );
    const unique = new Set<string>();
    for (const id of ids) {
      if (typeof id === 'string' && id.length > 0) {
        unique.add(id);
      }
    }
    return Array.from(unique);
  }
}
