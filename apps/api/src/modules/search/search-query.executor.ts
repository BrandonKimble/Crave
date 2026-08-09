import { isEnvFlagEnabled } from '../../shared/config/env-flag';
import { Injectable } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { Prisma } from '@prisma/client';
import type { OperatingStatus, ScoreInfoSummary } from '@crave-search/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  FoodResultDto,
  QueryPlan,
  RestaurantFoodSnippetDto,
  RestaurantResultDto,
  SearchQueryRequestDto,
} from './dto/search-query.dto';
import {
  SearchQueryBuilder,
  type BuildRestaurantQueryOptions,
} from './search-query.builder';
import type { SearchExecutionDirectives } from './search-execution-directives';
import { renderInlinedSql } from './sql-preview';
import {
  buildOperatingMetadataFromLocation as buildOperatingMetadataFromLocationUtil,
  computeDistanceMiles as computeDistanceMilesUtil,
  evaluateOperatingStatus as evaluateOperatingStatusUtil,
  normalizeUserLocation as normalizeUserLocationUtil,
} from './utils/restaurant-status';

const PRICE_SYMBOLS = ['Free', '$', '$$', '$$$', '$$$$'] as const;
const PRICE_DESCRIPTORS = [
  'Free',
  'Budget friendly',
  'Moderate',
  'Expensive',
  'Very expensive',
] as const;

type RestaurantMetadata = Record<string, unknown> & {
  hours?: Record<string, unknown> | Array<unknown> | string;
  timezone?: string;
  timeZone?: string;
  time_zone?: string;
  tz?: string;
  utc_offset_minutes?: number;
};

/**
 * Row type for restaurant query (Query A) - restaurants with top dishes
 */
interface RestaurantQueryRow {
  match_tier?: number | null;
  restaurant_id: string;
  restaurant_name: string;
  restaurant_metadata?: Prisma.JsonValue | null;
  price_level?: Prisma.Decimal | number | string | null;
  price_level_updated_at?: Date | null;
  crave_score?: Prisma.Decimal | number | string | null;
  crave_score_exact?: Prisma.Decimal | number | string | null;
  rising?: Prisma.Decimal | number | string | null;
  score_info?: Prisma.JsonValue | null;
  score_subject_type?: string | null;
  score_subject_id?: string | null;
  total_upvotes?: Prisma.Decimal | number | string | null;
  total_mentions?: Prisma.Decimal | number | string | null;
  location_id: string;
  google_place_id?: string | null;
  latitude?: Prisma.Decimal | number | string | null;
  longitude?: Prisma.Decimal | number | string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postal_code?: string | null;
  phone_number?: string | null;
  website_url?: string | null;
  hours?: Prisma.JsonValue | null;
  utc_offset_minutes?: Prisma.Decimal | number | string | null;
  time_zone?: string | null;
  is_primary?: boolean;
  last_polled_at?: Date | null;
  location_created_at?: Date | null;
  location_updated_at?: Date | null;
  locations_json?: Prisma.JsonValue | null;
  location_count?: Prisma.Decimal | number | string | null;
  top_dishes?: Prisma.JsonValue | null;
  total_dish_count?: number | null;
  matched_tags?: Prisma.JsonValue | null;
  match_evidence_type?: string | null;
  has_menu_items?: boolean | null;
}

/**
 * Row type for dish query (Query B) - dishes with restaurant data for map pins
 */
interface DishQueryRow {
  match_tier?: number | null;
  connection_id: string;
  restaurant_id: string;
  food_id: string;
  food_attributes: string[];
  is_category_item?: boolean;
  mention_count: number;
  total_upvotes: number;
  last_mentioned_at: Date | null;
  connection_crave_score?: Prisma.Decimal | number | string | null;
  connection_crave_score_exact?: Prisma.Decimal | number | string | null;
  connection_rising?: Prisma.Decimal | number | string | null;
  connection_score_info?: Prisma.JsonValue | null;
  score_subject_type?: string | null;
  score_subject_id?: string | null;
  food_name: string;
  // Restaurant data for map pins
  restaurant_entity_id: string;
  restaurant_name: string;
  restaurant_crave_score?: Prisma.Decimal | number | string | null;
  restaurant_crave_score_exact?: Prisma.Decimal | number | string | null;
  restaurant_rising?: Prisma.Decimal | number | string | null;
  restaurant_score_info?: Prisma.JsonValue | null;
  restaurant_price_level?: Prisma.Decimal | number | string | null;
  restaurant_price_level_updated_at?: Date | null;
  // Location data for map pins
  location_id: string;
  google_place_id?: string | null;
  latitude?: Prisma.Decimal | number | string | null;
  longitude?: Prisma.Decimal | number | string | null;
  address?: string | null;
  city?: string | null;
  hours?: Prisma.JsonValue | null;
  utc_offset_minutes?: Prisma.Decimal | number | string | null;
  time_zone?: string | null;
}

interface UserLocationInput {
  lat: number;
  lng: number;
}

interface RestaurantContext {
  locationId: string;
  operatingStatus: OperatingStatus | null;
  priceLevel: number | null;
  priceSymbol: string | null;
  distanceMiles: number | null;
}

interface ExecuteDualParams {
  plan: QueryPlan;
  request: SearchQueryRequestDto;
  pagination: { skip: number; take: number };
  restaurantPagination?: { skip: number; take: number };
  dishPagination?: { skip: number; take: number };
  topDishesLimit?: number;
  includeSqlPreview?: boolean;
  excludeRestaurantIds?: string[];
  excludeConnectionIds?: string[];
  directives?: SearchExecutionDirectives;
  /**
   * Restrict execution to a subset of axes. Defaults to running BOTH. When an
   * axis is omitted/false its SQL is skipped entirely (no DB round-trip) and it
   * comes back empty (restaurants:[] / dishes:[], count 0). Prefer the
   * {@link SearchQueryExecutor.executeSingle} wrapper for the single-axis case.
   */
  axes?: { restaurant?: boolean; dish?: boolean };
}

interface ExecuteSingleParams extends Omit<ExecuteDualParams, 'axes'> {
  axis: 'restaurant' | 'dish';
}

interface ExecuteDualResult {
  /** STEP-5 per-word starvation provenance (pooled mode only): in-pool
   *  coverage count per soft attribute id, per projection — 0 means "this
   *  WORD found nothing here", the precise demand signal. */
  pooledSoftWordCounts?: {
    dish: Record<string, number> | null;
    restaurant: Record<string, number> | null;
  };
  /** Pooled tier-0 (all-words) counts per projection — the honest
   *  strict-equivalent coverage number (red team C4). */
  pooledFullCounts?: { dishes: number; restaurants: number };
  /** Tier-2 (similar ring) window count from the SAME dish scan — the
   *  Include-similar chip's number is a measured fact, not a subtraction
   *  of two executions (round-5, spec §7.2 dissolved). */
  similarAvailable?: number;
  restaurants: RestaurantResultDto[];
  dishes: FoodResultDto[];
  totalRestaurantCount: number;
  totalDishCount: number;
  metadata: {
    boundsApplied: boolean;
    openNowApplied: boolean;
    priceFilterApplied: boolean;
    minimumVotesApplied: boolean;
  };
  sqlPreview?: string | null;
  timings?: Record<string, number>;
}

@Injectable()
export class SearchQueryExecutor {
  private readonly logger: LoggerService;
  private readonly diagnosticLogging: boolean;
  private readonly includePhaseTimings: boolean;

  constructor(
    loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly queryBuilder: SearchQueryBuilder,
  ) {
    this.logger = loggerService.setContext('SearchQueryExecutor');
    this.diagnosticLogging = isEnvFlagEnabled(
      process.env.SEARCH_VERBOSE_DIAGNOSTICS,
    );
    this.includePhaseTimings = isEnvFlagEnabled(
      process.env.SEARCH_INCLUDE_PHASE_TIMINGS,
    );
  }

  /**
   * Execute a SINGLE axis (restaurant OR dish) and return the same
   * ExecuteDualResult shape with the other axis empty. Use this when the caller
   * only consumes one side so we don't pay for a query whose results are thrown
   * away — e.g. a favorites RESTAURANT list never reads the dish axis.
   */
  async executeSingle(params: ExecuteSingleParams): Promise<ExecuteDualResult> {
    const { axis, ...rest } = params;
    return this.executeDual({
      ...rest,
      axes:
        axis === 'restaurant'
          ? { restaurant: true, dish: false }
          : { restaurant: false, dish: true },
    });
  }

  /**
   * SEE-LOCATIONS lean variant (Leg 2 tail): one restaurant + its locations
   * INSIDE the viewport as pin-ready rows. Skips the ranking pipeline entirely
   * — two indexed reads (restaurant identity/score/locations + top snippets).
   * Membership law: the locations array contains ONLY in-view locations of
   * THIS restaurant (ordered nearest-to-viewport-center, so [0] is the
   * display location); `locationCount` stays the TRUE global count.
   * Null bounds (no committed viewport yet) degrades to all locations.
   */
  async executeSeeLocations(params: {
    restaurantId: string;
    bounds: {
      northEast: { lat: number; lng: number };
      southWest: { lat: number; lng: number };
    } | null;
    userLocation?: { lat?: number; lng?: number } | null;
  }): Promise<{
    restaurant: RestaurantResultDto | null;
    inViewLocationCount: number;
  }> {
    const { restaurantId, bounds } = params;
    const referenceDate = new Date();
    const centerLat =
      bounds == null ? null : (bounds.northEast.lat + bounds.southWest.lat) / 2;
    const centerLng =
      bounds == null ? null : (bounds.northEast.lng + bounds.southWest.lng) / 2;
    const proximityOrderSql =
      centerLat != null && centerLng != null
        ? Prisma.sql`(POWER(rl.latitude - ${centerLat}, 2) + POWER(rl.longitude - ${centerLng}, 2)) ASC, rl.updated_at DESC`
        : Prisma.sql`rl.updated_at DESC`;
    // Wrap-aware longitude membership (west > east = antimeridian viewport).
    const boundsFilterSql =
      bounds == null
        ? Prisma.empty
        : bounds.southWest.lng <= bounds.northEast.lng
          ? Prisma.sql`
      AND rl.latitude BETWEEN ${bounds.southWest.lat} AND ${bounds.northEast.lat}
      AND rl.longitude BETWEEN ${bounds.southWest.lng} AND ${bounds.northEast.lng}`
          : Prisma.sql`
      AND rl.latitude BETWEEN ${bounds.southWest.lat} AND ${bounds.northEast.lat}
      AND (rl.longitude >= ${bounds.southWest.lng} OR rl.longitude <= ${bounds.northEast.lng})`;

    const rows = await this.prisma.$queryRaw<
      Array<{
        entity_id: string;
        name: string;
        price_level: number | null;
        price_level_updated_at: Date | null;
        restaurant_crave_score: Prisma.Decimal | number | string | null;
        restaurant_crave_score_exact: Prisma.Decimal | number | string | null;
        restaurant_rising: Prisma.Decimal | number | string | null;
        restaurant_score_info: Prisma.JsonValue | null;
        location_count: number;
        dish_count: number;
        locations_json: Prisma.JsonValue | null;
      }>
    >(Prisma.sql`
SELECT
  e.entity_id,
  e.name,
  e.price_level,
  e.price_level_updated_at,
  prs.display_score AS restaurant_crave_score,
  prs.percentile_rank AS restaurant_crave_score_exact,
  prs.rising AS restaurant_rising,
  CASE WHEN prs.subject_id IS NULL THEN NULL
       ELSE jsonb_build_object('evidenceCopy', 'Based on community evidence.')
  END AS restaurant_score_info,
  (
    SELECT COUNT(*)::int
    FROM core_restaurant_locations rlc
    WHERE rlc.restaurant_id = e.entity_id
      AND rlc.latitude IS NOT NULL
      AND rlc.longitude IS NOT NULL
      AND rlc.google_place_id IS NOT NULL
      AND rlc.address IS NOT NULL
  ) AS location_count,
  (
    SELECT COUNT(*)::int
    FROM core_restaurant_items ci
    WHERE ci.restaurant_id = e.entity_id
      -- Rollup rows are never dish rows (F9967, all lanes).
      AND NOT ci.is_category_item
  ) AS dish_count,
  (
    SELECT json_agg(
      jsonb_build_object(
        'locationId', rl.location_id,
        'googlePlaceId', rl.google_place_id,
        'latitude', rl.latitude,
        'longitude', rl.longitude,
        'address', rl.address,
        'city', rl.city,
        'region', rl.region,
        'country', rl.country,
        'postalCode', rl.postal_code,
        'phoneNumber', rl.phone_number,
        'websiteUrl', rl.website_url,
        'hours', rl.hours,
        'utcOffsetMinutes', rl.utc_offset_minutes,
        'timeZone', rl.time_zone,
        'isPrimary', rl.is_primary,
        'lastPolledAt', rl.last_polled_at,
        'createdAt', rl.created_at,
        'updatedAt', rl.updated_at
      )
      ORDER BY ${proximityOrderSql}
    )
    FROM core_restaurant_locations rl
    WHERE rl.restaurant_id = e.entity_id
      AND rl.latitude IS NOT NULL
      AND rl.longitude IS NOT NULL
      AND rl.google_place_id IS NOT NULL
      AND rl.address IS NOT NULL${boundsFilterSql}
  ) AS locations_json
FROM core_entities e
LEFT JOIN core_public_entity_scores prs
  ON prs.subject_type = 'restaurant' AND prs.subject_id = e.entity_id
WHERE e.entity_id = ${restaurantId}::uuid
  AND e.type = 'restaurant'
`);

    const row = rows[0];
    if (!row) {
      return { restaurant: null, inViewLocationCount: 0 };
    }

    const locations = this.parseLocationsJson(
      row.locations_json,
      referenceDate,
    );
    const displayLocation = locations[0] ?? null;

    const snippetRows = await this.prisma.$queryRaw<
      Array<{
        connection_id: string;
        food_id: string;
        food_name: string;
        connection_crave_score: Prisma.Decimal | number | string | null;
        connection_rising: Prisma.Decimal | number | string | null;
        connection_score_info: Prisma.JsonValue | null;
      }>
    >(Prisma.sql`
SELECT
  c.connection_id,
  c.food_id,
  f.name AS food_name,
  pcs.display_score AS connection_crave_score,
  pcs.rising AS connection_rising,
  jsonb_build_object('evidenceCopy', 'Based on community evidence.') AS connection_score_info
FROM core_restaurant_items c
JOIN core_entities f ON f.entity_id = c.food_id
JOIN core_public_entity_scores pcs
  ON pcs.subject_type = 'connection' AND pcs.subject_id = c.connection_id
WHERE c.restaurant_id = ${restaurantId}::uuid
  -- Rollup rows are never dish rows (F9967, all lanes).
  AND NOT c.is_category_item
ORDER BY pcs.display_score DESC, c.connection_id ASC
LIMIT 3
`);

    const topFood: RestaurantFoodSnippetDto[] = snippetRows.map((snippet) => ({
      connectionId: snippet.connection_id,
      foodId: snippet.food_id,
      foodName: snippet.food_name,
      scoreSubjectType: 'connection' as const,
      scoreSubjectId: snippet.connection_id,
      craveScore: this.toRequiredPublicScore(
        snippet.connection_crave_score,
        `connection:${snippet.connection_id}`,
      ),
      rising: this.toOptionalNumber(snippet.connection_rising),
      scoreInfo: this.parseScoreInfo(snippet.connection_score_info),
    }));

    const priceLevel = this.toOptionalNumber(row.price_level);
    const priceDetails = this.describePriceLevel(priceLevel);
    const userLocation = normalizeUserLocationUtil(params.userLocation ?? null);
    const distanceMiles =
      userLocation != null &&
      displayLocation?.latitude != null &&
      displayLocation?.longitude != null
        ? computeDistanceMilesUtil(
            userLocation,
            displayLocation.latitude,
            displayLocation.longitude,
          )
        : null;

    const restaurant: RestaurantResultDto = {
      restaurantId: row.entity_id,
      restaurantName: row.name,
      rank: 1,
      scoreSubjectType: 'restaurant' as const,
      scoreSubjectId: row.entity_id,
      // Autocomplete admits unscored restaurants; the lean variant serves
      // null (the client's neutral pin) instead of throwing like the ranked
      // pipeline's toRequiredPublicScore would. `?? 0` here painted unscored
      // restaurants as the WORST tier — bucket 0 — not neutral (F757).
      craveScore: this.toOptionalNumber(row.restaurant_crave_score),
      craveScoreExact:
        this.toOptionalNumber(row.restaurant_crave_score_exact) ?? undefined,
      rising: this.toOptionalNumber(row.restaurant_rising),
      scoreInfo: this.parseScoreInfo(row.restaurant_score_info),
      latitude: displayLocation?.latitude ?? null,
      longitude: displayLocation?.longitude ?? null,
      address: displayLocation?.address ?? null,
      restaurantLocationId: displayLocation?.locationId ?? null,
      priceLevel,
      priceSymbol: priceDetails.symbol,
      priceText: priceDetails.text,
      priceLevelUpdatedAt: row.price_level_updated_at
        ? row.price_level_updated_at.toISOString()
        : null,
      operatingStatus: displayLocation?.operatingStatus ?? null,
      distanceMiles,
      displayLocation,
      locations,
      locationCount: this.toNumber(row.location_count),
      topFood,
      totalDishCount: this.toNumber(row.dish_count),
    };

    return { restaurant, inViewLocationCount: locations.length };
  }

  /**
   * Execute dual parallel queries - one for restaurants, one for dishes
   * This returns independent lists that don't share the same limit.
   */
  async executeDual(params: ExecuteDualParams): Promise<ExecuteDualResult> {
    const {
      plan,
      request,
      pagination,
      restaurantPagination,
      dishPagination,
      topDishesLimit = 3,
      includeSqlPreview,
      excludeRestaurantIds,
      excludeConnectionIds,
      directives,
      axes,
    } = params;

    const runRestaurant = axes?.restaurant ?? true;
    const runDish = axes?.dish ?? true;

    const executeStart = performance.now();
    const searchCenter = this.resolveSearchCenter(request);

    const effectiveRestaurantPagination = restaurantPagination ?? pagination;
    const effectiveDishPagination = dishPagination ?? pagination;

    // Build the enabled queries in parallel. A skipped axis stays null and its
    // SQL is never issued (see the conditional DB execution below).
    const needsOpenFilter = Boolean(request.openNow);
    // Shared restaurant-query options — reused for the Phase-2 hydrate so the open page runs
    // through the identical conditions/ranking as the base list.
    const restaurantQueryOptions: BuildRestaurantQueryOptions = {
      plan,
      pagination: effectiveRestaurantPagination,
      searchCenter,
      topDishesLimit,
      excludeRestaurantIds,
      directives,
    };
    const buildStart = performance.now();
    // B1 (round-5 ideal): openness is a SQL membership predicate over the
    // derived interval table — no candidate SQL, no two-phase machine.
    const restaurantQuery = runRestaurant
      ? this.queryBuilder.buildRestaurantQuery(restaurantQueryOptions)
      : null;
    const dishQuery = runDish
      ? this.queryBuilder.buildDishQuery({
          plan,
          pagination: effectiveDishPagination,
          searchCenter,
          excludeConnectionIds,
          directives,
        })
      : null;
    const buildSqlMs = performance.now() - buildStart;

    const referenceDate = new Date();
    const userLocation = this.normalizeUserLocation(request.userLocation);

    // Execute the enabled queries in parallel. A skipped axis resolves to empty
    // rows + an empty count without touching the DB, so all downstream mapping
    // (contexts, open-now filter, map*) flows through unchanged and returns [].
    const dbStart = performance.now();
    type DishCountRow = {
      total_connections: bigint;
      total_restaurants: bigint;
      full_connections?: bigint | null;
      similar_connections?: bigint | null;
      soft_word_counts?: Record<string, number> | null;
    };
    const runDishQueries = (
      query: NonNullable<typeof dishQuery>,
    ): Promise<[DishQueryRow[], DishCountRow[]]> =>
      Promise.all([
        this.prisma.$queryRaw<DishQueryRow[]>(query.dataSql),
        this.prisma.$queryRaw<DishCountRow[]>(query.countSql),
      ]);
    const emptyDish: [DishQueryRow[], DishCountRow[]] = [[], []];

    // Openness lives in MEMBERSHIP now, so every window count (gate,
    // similar, per-word) is openness-aware inside the one execution — the
    // old two-phase candidate/hydrate machine and the gateFull sequencing
    // (spec §1.4.4a) dissolve.
    const [restaurantAxis, [dishRows, dishCountResult]] = await Promise.all([
      this.resolveRestaurantAxis({ restaurantQuery }),
      dishQuery ? runDishQueries(dishQuery) : Promise.resolve(emptyDish),
    ]);
    const restaurantRows = restaurantAxis.rows;
    const dbQueryMs = performance.now() - dbStart;

    const postProcessStart = performance.now();

    // Build restaurant contexts from both result sets for open now filtering
    const allRestaurantContexts = this.buildRestaurantContextsFromDual(
      restaurantRows,
      dishRows,
      referenceDate,
      userLocation,
    );

    // Openness is applied IN SQL (membership) on both axes — rows arriving
    // here are already open (or the graceful-degradation arm admitted the
    // whole unsupported pool). Pagination and every count are therefore
    // exact, including the dish axis (the old post-LIMIT JS filter made
    // open-now dish pagination only approximately right).
    const filteredRestaurantRows = restaurantRows;
    const filteredDishRows = dishRows;
    const openNowApplied = needsOpenFilter;

    // Map results
    const mapRestaurantStart = performance.now();
    const restaurants = this.mapRestaurantQueryResults(
      filteredRestaurantRows,
      allRestaurantContexts,
      referenceDate,
      userLocation,
      effectiveRestaurantPagination.skip + 1,
    );
    const mapRestaurantMs = performance.now() - mapRestaurantStart;

    const mapDishStart = performance.now();
    const dishes = this.mapDishQueryResults(
      filteredDishRows,
      allRestaurantContexts,
      referenceDate,
    );
    const mapDishMs = performance.now() - mapDishStart;

    const postProcessMs = performance.now() - postProcessStart;
    const executeMs = performance.now() - executeStart;

    const timings = {
      buildSqlMs: Math.round(buildSqlMs),
      dbQueryMs: Math.round(dbQueryMs),
      // No openNowFilterMs: openness is applied in SQL membership (above), so
      // there is no JS open-now filter phase to time. A constant 0 here would
      // report "the open-now filter costs nothing" instead of "no such phase"
      // — a metric that can only show green (F7601).
      mapRestaurantMs: Math.round(mapRestaurantMs),
      mapDishMs: Math.round(mapDishMs),
      postProcessMs: Math.round(postProcessMs),
      executeMs: Math.round(executeMs),
    };

    if (this.includePhaseTimings) {
      this.logger.debug('Search dual executor timings', { timings });
    }

    if (this.diagnosticLogging) {
      this.logger.debug('Search dual executor diagnostics', {
        planFormat: plan.format,
        restaurantRowCount: restaurantRows.length,
        dishRowCount: dishRows.length,
        filteredRestaurantCount: filteredRestaurantRows.length,
        filteredDishCount: filteredDishRows.length,
        openNowApplied,
      });
    }

    // Open-now: the true open total from the candidate pass (pagination spans the open set,
    // not the post-filtered page). Otherwise the base count SQL.
    const totalRestaurantCount = restaurantAxis.total;
    const totalDishCount = Number(dishCountResult[0]?.total_connections ?? 0);

    // Combine SQL previews if requested (only for the axes that actually ran)
    const sqlPreview = includeSqlPreview
      ? [
          restaurantQuery
            ? `-- Restaurant Query:\n${renderInlinedSql(restaurantQuery.dataSql)}`
            : null,
          dishQuery
            ? `-- Dish Query:\n${renderInlinedSql(dishQuery.dataSql)}`
            : null,
        ]
          .filter((part): part is string => part !== null)
          .join('\n\n')
      : null;

    return {
      restaurants,
      dishes,
      totalRestaurantCount,
      totalDishCount,
      pooledSoftWordCounts: directives?.pooledGate
        ? {
            dish: dishCountResult[0]?.soft_word_counts ?? null,
            restaurant: restaurantAxis.softWordCounts ?? null,
          }
        : undefined,
      pooledFullCounts: directives?.pooledGate
        ? {
            dishes: Number(dishCountResult[0]?.full_connections ?? 0),
            restaurants: restaurantAxis.fullRestaurants ?? 0,
          }
        : undefined,
      similarAvailable: directives?.pooledGate
        ? Number(dishCountResult[0]?.similar_connections ?? 0)
        : undefined,
      metadata: {
        boundsApplied:
          (restaurantQuery?.metadata.boundsApplied ?? false) ||
          (dishQuery?.metadata.boundsApplied ?? false),
        openNowApplied,
        priceFilterApplied:
          (restaurantQuery?.metadata.priceFilterApplied ?? false) ||
          (dishQuery?.metadata.priceFilterApplied ?? false),
        minimumVotesApplied:
          (restaurantQuery?.metadata.minimumVotesApplied ?? false) ||
          (dishQuery?.metadata.minimumVotesApplied ?? false),
      },
      sqlPreview,
      timings,
    };
  }

  private normalizeUserLocation(
    input?: { lat?: number; lng?: number } | null,
  ): UserLocationInput | null {
    return normalizeUserLocationUtil(input);
  }

  private resolveSearchCenter(
    request: SearchQueryRequestDto,
  ): UserLocationInput | null {
    const bounds = request.bounds;
    if (
      bounds &&
      Number.isFinite(bounds.northEast?.lat) &&
      Number.isFinite(bounds.northEast?.lng) &&
      Number.isFinite(bounds.southWest?.lat) &&
      Number.isFinite(bounds.southWest?.lng)
    ) {
      return {
        lat: (bounds.northEast.lat + bounds.southWest.lat) / 2,
        lng: (bounds.northEast.lng + bounds.southWest.lng) / 2,
      };
    }
    return this.normalizeUserLocation(request.userLocation);
  }

  private buildOperatingMetadataFromLocation(
    hoursValue: unknown,
    utcOffsetMinutesValue: Prisma.Decimal | number | string | null | undefined,
    timeZoneValue: string | null | undefined,
  ): RestaurantMetadata | null {
    return buildOperatingMetadataFromLocationUtil(
      hoursValue,
      utcOffsetMinutesValue,
      timeZoneValue,
    );
  }

  private evaluateOperatingStatus(
    metadataValue: unknown,
    referenceDate: Date,
  ): OperatingStatus | null {
    return evaluateOperatingStatusUtil(metadataValue, referenceDate, {
      onTimezoneError: ({ timezone, error }) => {
        this.logger.warn('Failed to evaluate timezone for open-now filter', {
          timezone,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      },
    });
  }

  private parseLocationsJson(
    value: Prisma.JsonValue | null | undefined,
    referenceDate: Date,
  ): Array<{
    locationId: string;
    googlePlaceId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    address?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    postalCode?: string | null;
    phoneNumber?: string | null;
    websiteUrl?: string | null;
    hours?: Record<string, unknown> | null;
    utcOffsetMinutes?: number | null;
    timeZone?: string | null;
    operatingStatus?: OperatingStatus | null;
    isPrimary: boolean;
    lastPolledAt?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  }> {
    if (!value || !Array.isArray(value)) {
      return [];
    }

    const results: Array<{
      locationId: string;
      googlePlaceId?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      address?: string | null;
      city?: string | null;
      region?: string | null;
      country?: string | null;
      postalCode?: string | null;
      phoneNumber?: string | null;
      websiteUrl?: string | null;
      hours?: Record<string, unknown> | null;
      utcOffsetMinutes?: number | null;
      timeZone?: string | null;
      operatingStatus?: OperatingStatus | null;
      isPrimary: boolean;
      lastPolledAt?: string | null;
      createdAt?: string | null;
      updatedAt?: string | null;
    }> = [];

    for (const entry of value) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const latitude = this.toOptionalNumber(
        record.latitude as Prisma.Decimal | number | string | null | undefined,
      );
      const longitude = this.toOptionalNumber(
        record.longitude as Prisma.Decimal | number | string | null | undefined,
      );
      const hours = this.coerceRecord(record.hours ?? record.hours_json);
      const utcOffsetMinutes = this.toOptionalNumber(
        record.utcOffsetMinutes as
          | Prisma.Decimal
          | number
          | string
          | null
          | undefined,
      );
      const timeZone =
        typeof record.timeZone === 'string'
          ? record.timeZone
          : typeof record.time_zone === 'string'
            ? record.time_zone
            : null;
      const operatingMetadata = this.buildOperatingMetadataFromLocation(
        hours,
        utcOffsetMinutes,
        timeZone,
      );
      const operatingStatus = operatingMetadata
        ? this.evaluateOperatingStatus(operatingMetadata, referenceDate)
        : null;
      const locationIdValue =
        (record.locationId as string | null) ??
        (record.location_id as string | null) ??
        null;
      if (!locationIdValue) {
        continue;
      }
      results.push({
        locationId: locationIdValue,
        googlePlaceId: (record.googlePlaceId ??
          record.google_place_id ??
          null) as string | null,
        latitude,
        longitude,
        address: (record.address as string | null) ?? null,
        city: (record.city as string | null) ?? null,
        region: (record.region as string | null) ?? null,
        country: (record.country as string | null) ?? null,
        postalCode: (record.postalCode as string | null) ?? null,
        phoneNumber:
          (record.phoneNumber as string | null) ??
          (record.phone_number as string | null) ??
          null,
        websiteUrl:
          (record.websiteUrl as string | null) ??
          (record.website_url as string | null) ??
          null,
        hours,
        utcOffsetMinutes: utcOffsetMinutes ?? null,
        timeZone,
        operatingStatus,
        isPrimary: Boolean(record.isPrimary ?? record.is_primary),
        lastPolledAt: (record.lastPolledAt as string | null) ?? null,
        createdAt: (record.createdAt as string | null) ?? null,
        updatedAt: (record.updatedAt as string | null) ?? null,
      });
    }

    return results;
  }

  private computeDistanceMiles(
    userLocation: UserLocationInput,
    latitude: number,
    longitude: number,
  ): number | null {
    return computeDistanceMilesUtil(userLocation, latitude, longitude);
  }

  private coerceRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private toNumber(value?: Prisma.Decimal | number | string | null): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return Number(value) || 0;
  }

  private toOptionalNumber(
    value?: Prisma.Decimal | number | string | null,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return null;
  }

  private toRequiredPublicScore(
    value: Prisma.Decimal | number | string | null | undefined,
    label: string,
  ): number {
    const parsed = this.toOptionalNumber(value);
    if (parsed === null) {
      throw new Error(`Missing public Crave Score for ${label}`);
    }
    return parsed;
  }

  private parseScoreInfo(
    value: Prisma.JsonValue | null | undefined,
  ): ScoreInfoSummary | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const pollCount = this.toOptionalNumber(
      record.pollCount as Prisma.Decimal | number | string | null,
    );
    const voteCount = this.toOptionalNumber(
      record.voteCount as Prisma.Decimal | number | string | null,
    );
    return {
      evidenceCopy:
        typeof record.evidenceCopy === 'string' &&
        record.evidenceCopy.trim().length
          ? record.evidenceCopy
          : 'Based on Crave polls and votes.',
      pollCount,
      voteCount,
    };
  }

  private describePriceLevel(level: number | null): {
    symbol: string | null;
    text: string | null;
  } {
    if (level === null) {
      return { symbol: null, text: null };
    }

    const normalized = Math.round(level);
    const clamped = Math.max(0, Math.min(PRICE_SYMBOLS.length - 1, normalized));
    return {
      symbol: PRICE_SYMBOLS[clamped],
      text: PRICE_DESCRIPTORS[clamped],
    };
  }

  // ==========================================================================
  // Dual Query Helper Methods
  // ==========================================================================

  private buildRestaurantContextsFromDual(
    restaurantRows: RestaurantQueryRow[],
    dishRows: DishQueryRow[],
    referenceDate: Date,
    userLocation: UserLocationInput | null,
  ): Map<string, RestaurantContext> {
    const contexts = new Map<string, RestaurantContext>();

    // Process restaurant rows first
    for (const row of restaurantRows) {
      const restaurantId = row.restaurant_id;
      if (!restaurantId) continue;

      const latitude = this.toOptionalNumber(row.latitude);
      const longitude = this.toOptionalNumber(row.longitude);
      const parsedPrice = this.toOptionalNumber(row.price_level);
      const priceDetails = this.describePriceLevel(parsedPrice);
      const operatingMetadata = this.buildOperatingMetadataFromLocation(
        row.hours,
        row.utc_offset_minutes,
        row.time_zone,
      );
      const operatingStatus = operatingMetadata
        ? this.evaluateOperatingStatus(operatingMetadata, referenceDate)
        : null;
      const distanceMiles =
        latitude !== null && longitude !== null && userLocation
          ? this.computeDistanceMiles(userLocation, latitude, longitude)
          : null;

      contexts.set(restaurantId, {
        locationId: row.location_id,
        operatingStatus,
        priceLevel: parsedPrice ?? null,
        priceSymbol: priceDetails.symbol ?? null,
        distanceMiles: distanceMiles ?? null,
      });
    }

    // Add any restaurants from dish rows that aren't already in contexts
    for (const row of dishRows) {
      const restaurantId = row.restaurant_id;
      if (!restaurantId || contexts.has(restaurantId)) continue;

      const latitude = this.toOptionalNumber(row.latitude);
      const longitude = this.toOptionalNumber(row.longitude);
      const parsedPrice = this.toOptionalNumber(row.restaurant_price_level);
      const priceDetails = this.describePriceLevel(parsedPrice);
      const operatingMetadata = this.buildOperatingMetadataFromLocation(
        row.hours,
        row.utc_offset_minutes,
        row.time_zone,
      );
      const operatingStatus = operatingMetadata
        ? this.evaluateOperatingStatus(operatingMetadata, referenceDate)
        : null;
      const distanceMiles =
        latitude !== null && longitude !== null && userLocation
          ? this.computeDistanceMiles(userLocation, latitude, longitude)
          : null;

      contexts.set(restaurantId, {
        locationId: row.location_id,
        operatingStatus,
        priceLevel: parsedPrice ?? null,
        priceSymbol: priceDetails.symbol ?? null,
        distanceMiles: distanceMiles ?? null,
      });
    }

    return contexts;
  }

  // OPEN-NOW two-phase axis (the fix for "22 open pins but 1 card"). The legacy path fetched
  // the page-1 rich rows and filtered them to open AFTER pagination — so open restaurants
  // ranked below the page were invisible and the total was the post-filter page count. Here,
  // when open-now is active, Phase 1 ranks + resolves openness over the WHOLE candidate set
  // (lean id+hours query, same conditions), then Phase 2 hydrates ONLY the open page. Same
  // evaluateOperatingStatus the map coverage uses ⇒ list open set == map open set.
  /** B1 (round-5 ideal): openness is a SQL membership predicate — the
   *  restaurant axis is one data query + one count query. The two-phase
   *  candidate/openness/hydrate machine (and its gateFull sequencing) is
   *  deleted; see buildOpenNowPredicateSql in the builder. */
  private async resolveRestaurantAxis(params: {
    restaurantQuery: {
      dataSql: Prisma.Sql;
      countSql: Prisma.Sql;
    } | null;
  }): Promise<{
    rows: RestaurantQueryRow[];
    total: number;
    softWordCounts?: Record<string, number> | null;
    fullRestaurants?: number;
  }> {
    const { restaurantQuery } = params;
    if (!restaurantQuery) {
      return { rows: [], total: 0, softWordCounts: null, fullRestaurants: 0 };
    }
    const [rows, countResult] = await Promise.all([
      this.prisma.$queryRaw<RestaurantQueryRow[]>(restaurantQuery.dataSql),
      this.prisma.$queryRaw<
        Array<{
          total_restaurants: bigint;
          full_restaurants?: bigint | null;
          soft_word_counts?: Record<string, number> | null;
        }>
      >(restaurantQuery.countSql),
    ]);
    return {
      rows,
      total: Number(countResult[0]?.total_restaurants ?? 0),
      softWordCounts: countResult[0]?.soft_word_counts ?? null,
      fullRestaurants: Number(countResult[0]?.full_restaurants ?? 0),
    };
  }

  private mapRestaurantQueryResults(
    rows: RestaurantQueryRow[],
    contexts: Map<string, RestaurantContext>,
    referenceDate: Date,
    userLocation: UserLocationInput | null,
    rankStart: number,
  ): RestaurantResultDto[] {
    return rows.map((row, index) => {
      const context = contexts.get(row.restaurant_id);
      const parsedPrice =
        context?.priceLevel ?? this.toOptionalNumber(row.price_level);
      const priceDetails = this.describePriceLevel(parsedPrice);
      const latitude = this.toOptionalNumber(row.latitude);
      const longitude = this.toOptionalNumber(row.longitude);
      const distanceMiles =
        context?.distanceMiles ??
        (latitude !== null && longitude !== null && userLocation
          ? this.computeDistanceMiles(userLocation, latitude, longitude)
          : null);
      const operatingMetadata = this.buildOperatingMetadataFromLocation(
        row.hours,
        row.utc_offset_minutes,
        row.time_zone,
      );
      const operatingStatus =
        context?.operatingStatus ??
        (operatingMetadata
          ? this.evaluateOperatingStatus(operatingMetadata, referenceDate)
          : null);

      // Parse top_dishes JSON
      const topDishes = this.parseTopDishesJson(row.top_dishes);
      const matchedTags = this.parseMatchedTagsJson(row.matched_tags);

      // Parse locations JSON
      const locations = this.parseLocationsJson(
        row.locations_json,
        referenceDate,
      );

      const displayLocation = {
        locationId: row.location_id,
        googlePlaceId: row.google_place_id ?? null,
        latitude,
        longitude,
        address: row.address ?? null,
        city: row.city ?? null,
        region: row.region ?? null,
        country: row.country ?? null,
        postalCode: row.postal_code ?? null,
        phoneNumber: row.phone_number ?? null,
        websiteUrl: row.website_url ?? null,
        hours: this.coerceRecord(row.hours),
        utcOffsetMinutes: this.toOptionalNumber(row.utc_offset_minutes) ?? null,
        timeZone: row.time_zone ?? null,
        operatingStatus,
        isPrimary: Boolean(row.is_primary),
        lastPolledAt: row.last_polled_at?.toISOString() ?? null,
        createdAt: row.location_created_at?.toISOString() ?? null,
        updatedAt: row.location_updated_at?.toISOString() ?? null,
      };

      if (!locations.length) {
        locations.push(displayLocation);
      }

      const locationCount =
        this.toOptionalNumber(row.location_count) ?? locations.length;
      const totalUpvotes = this.toNumber(row.total_upvotes);
      const totalMentions = this.toNumber(row.total_mentions);

      return {
        restaurantId: row.restaurant_id,
        restaurantName: row.restaurant_name,
        exactMatch:
          row.match_tier === 0
            ? true
            : row.match_tier === 1
              ? false
              : undefined,
        rank: rankStart + index,
        scoreSubjectType: 'restaurant',
        scoreSubjectId: row.restaurant_id,
        craveScore: this.toRequiredPublicScore(
          row.crave_score,
          `restaurant:${row.restaurant_id}`,
        ),
        // High-precision percentile_rank for tie-proof ordering (map badge == list position). Optional:
        // older score rows / paths without the column fall back to craveScore ordering on the client.
        craveScoreExact:
          this.toOptionalNumber(row.crave_score_exact) ?? undefined,
        rising: this.toOptionalNumber(row.rising),
        scoreInfo: this.parseScoreInfo(row.score_info),
        mentionCount: totalMentions,
        totalUpvotes,
        latitude,
        longitude,
        address: row.address ?? null,
        restaurantLocationId: row.location_id,
        priceLevel: parsedPrice ?? null,
        priceSymbol: priceDetails.symbol ?? null,
        priceText: priceDetails.text ?? null,
        priceLevelUpdatedAt: row.price_level_updated_at?.toISOString() ?? null,
        operatingStatus,
        distanceMiles,
        displayLocation,
        locations,
        locationCount,
        topFood: topDishes,
        totalDishCount: row.total_dish_count ?? 0,
        matchedTags,
        matchEvidenceType:
          row.match_evidence_type === 'connection' ||
          row.match_evidence_type === 'tag_signal' ||
          row.match_evidence_type === 'mixed'
            ? row.match_evidence_type
            : null,
        hasMenuItems:
          row.has_menu_items !== null && row.has_menu_items !== undefined
            ? Boolean(row.has_menu_items)
            : (row.total_dish_count ?? 0) > 0,
      };
    });
  }

  private mapDishQueryResults(
    rows: DishQueryRow[],
    contexts: Map<string, RestaurantContext>,
    referenceDate: Date,
  ): FoodResultDto[] {
    return rows.map((row) => {
      const context = contexts.get(row.restaurant_id);
      const parsedPrice =
        context?.priceLevel ??
        this.toOptionalNumber(row.restaurant_price_level);
      const priceDetails = this.describePriceLevel(parsedPrice);
      const operatingMetadata = this.buildOperatingMetadataFromLocation(
        row.hours,
        row.utc_offset_minutes,
        row.time_zone,
      );
      const operatingStatus =
        context?.operatingStatus ??
        (operatingMetadata
          ? this.evaluateOperatingStatus(operatingMetadata, referenceDate)
          : null);
      const latitude = this.toOptionalNumber(row.latitude);
      const longitude = this.toOptionalNumber(row.longitude);

      // Return flat FoodResult-compatible structure
      return {
        connectionId: row.connection_id,
        foodId: row.food_id,
        foodName: row.food_name,
        exactMatch:
          row.match_tier === 0
            ? true
            : row.match_tier === 1
              ? false
              : undefined,
        restaurantId: row.restaurant_entity_id,
        restaurantName: row.restaurant_name,
        restaurantLocationId: row.location_id,
        scoreSubjectType: 'connection',
        scoreSubjectId: row.connection_id,
        craveScore: this.toRequiredPublicScore(
          row.connection_crave_score,
          `connection:${row.connection_id}`,
        ),
        // High-precision percentile_rank — the map ranks pins by this so the badge == the results-list position.
        craveScoreExact:
          this.toOptionalNumber(row.connection_crave_score_exact) ?? undefined,
        rising: this.toOptionalNumber(row.connection_rising),
        scoreInfo: this.parseScoreInfo(row.connection_score_info),
        mentionCount: row.mention_count,
        totalUpvotes: row.total_upvotes,
        lastMentionedAt: row.last_mentioned_at?.toISOString() ?? null,
        foodAttributes: row.food_attributes || [],
        restaurantPriceLevel: parsedPrice ?? null,
        restaurantPriceSymbol: priceDetails.symbol ?? null,
        restaurantDistanceMiles: context?.distanceMiles ?? null,
        restaurantOperatingStatus: operatingStatus,
        restaurantCraveScore: this.toRequiredPublicScore(
          row.restaurant_crave_score,
          `restaurant:${row.restaurant_entity_id}`,
        ),
        restaurantLatitude: latitude,
        restaurantLongitude: longitude,
      };
    });
  }

  private parseTopDishesJson(
    value: Prisma.JsonValue | null | undefined,
  ): RestaurantFoodSnippetDto[] {
    if (!value || !Array.isArray(value)) {
      return [];
    }

    const results: RestaurantFoodSnippetDto[] = [];

    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;

      const record = entry as Record<string, unknown>;
      const connectionId = record.connectionId as string | null;
      const foodId = record.foodId as string | null;
      const foodName = record.foodName as string | null;

      if (!connectionId || !foodId || !foodName) continue;

      results.push({
        connectionId,
        foodId,
        foodName,
        scoreSubjectType: 'connection',
        scoreSubjectId: connectionId,
        craveScore: this.toRequiredPublicScore(
          record.craveScore as Prisma.Decimal | number | string | null,
          `connection:${connectionId}`,
        ),
        rising: this.toOptionalNumber(
          record.rising as Prisma.Decimal | number | string | null,
        ),
        scoreInfo: this.parseScoreInfo(
          record.scoreInfo as Prisma.JsonValue | null,
        ),
      });
    }

    return results;
  }

  private parseMatchedTagsJson(
    value: Prisma.JsonValue | null | undefined,
  ): Array<{
    entityId: string;
    name: string;
    entityType: string;
    mentionCount: number;
  }> {
    if (!value || !Array.isArray(value)) {
      return [];
    }

    const results: Array<{
      entityId: string;
      name: string;
      entityType: string;
      mentionCount: number;
    }> = [];

    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;

      const record = entry as Record<string, unknown>;
      const entityId = record.entityId as string | null;
      const name = record.name as string | null;
      const entityType = record.entityType as string | null;

      if (!entityId || !name || !entityType) continue;

      results.push({
        entityId,
        name,
        entityType,
        mentionCount: this.toNumber(
          record.mentionCount as Prisma.Decimal | number | string | null,
        ),
      });
    }

    return results;
  }
}
