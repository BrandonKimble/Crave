import { Injectable } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { ActivityLevel, Prisma } from '@prisma/client';
import type { OperatingStatus } from '@crave-search/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  FoodResultDto,
  QueryPlan,
  RestaurantFoodSnippetDto,
  RestaurantResultDto,
  SearchQueryRequestDto,
} from './dto/search-query.dto';
import { SearchQueryBuilder } from './search-query.builder';
import {
  buildOperatingMetadata as buildOperatingMetadataUtil,
  buildOperatingMetadataFromLocation as buildOperatingMetadataFromLocationUtil,
  buildOperatingMetadataFromRestaurantMetadata as buildOperatingMetadataFromRestaurantMetadataUtil,
  computeDistanceMiles as computeDistanceMilesUtil,
  evaluateOperatingStatus as evaluateOperatingStatusUtil,
  normalizeUserLocation as normalizeUserLocationUtil,
} from './utils/restaurant-status';

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const TOP_RESTAURANT_FOOD_SNIPPETS = Infinity;
const PRICE_SYMBOLS = ['Free', '$', '$$', '$$$', '$$$$'] as const;
const PRICE_DESCRIPTORS = [
  'Free',
  'Budget friendly',
  'Moderate',
  'Expensive',
  'Very expensive',
] as const;

type DayKey = (typeof DAY_KEYS)[number];

interface DaySegment {
  start: number;
  end: number;
  crossesMidnight: boolean;
}

type DailySchedule = Partial<Record<DayKey, DaySegment[]>>;

interface LocalTimeContext {
  dayKey: DayKey;
  minutes: number;
  timezoneApplied: boolean;
}

type RestaurantMetadata = Record<string, unknown> & {
  hours?: Record<string, unknown> | Array<unknown> | string;
  timezone?: string;
  timeZone?: string;
  time_zone?: string;
  tz?: string;
  utc_offset_minutes?: number;
};

interface QueryResultRow {
  connection_id: string;
  restaurant_id: string;
  food_id: string;
  categories: string[];
  food_attributes: string[];
  mention_count: number;
  total_upvotes: number;
  recent_mention_count: number;
  last_mentioned_at: Date | null;
  activity_level: ActivityLevel;
  food_quality_score: Prisma.Decimal | number | string;
  restaurant_total_upvotes: Prisma.Decimal | number | string;
  restaurant_total_mentions: Prisma.Decimal | number | string;
  restaurant_name: string;
  restaurant_aliases: string[];
  restaurant_quality_score?: Prisma.Decimal | number | string | null;
  restaurant_location_key?: string | null;
  restaurant_display_score?: Prisma.Decimal | number | string | null;
  restaurant_display_percentile?: Prisma.Decimal | number | string | null;
  connection_display_score?: Prisma.Decimal | number | string | null;
  connection_display_percentile?: Prisma.Decimal | number | string | null;
  restaurant_metadata?: Prisma.JsonValue | null;
  restaurant_price_level?: Prisma.Decimal | number | string | null;
  restaurant_price_level_updated_at?: Date | null;
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
  location_is_primary?: boolean;
  location_last_polled_at?: Date | null;
  location_created_at?: Date | null;
  location_updated_at?: Date | null;
  locations_json?: Prisma.JsonValue | null;
  location_count?: Prisma.Decimal | number | string | null;
  restaurant_attributes: string[];
  food_name: string;
  food_aliases: string[];
}

/**
 * Row type for restaurant query (Query A) - restaurants with top dishes
 */
interface RestaurantQueryRow {
  restaurant_id: string;
  restaurant_name: string;
  restaurant_aliases: string[];
  restaurant_quality_score?: Prisma.Decimal | number | string | null;
  location_key?: string | null;
  restaurant_metadata?: Prisma.JsonValue | null;
  price_level?: Prisma.Decimal | number | string | null;
  price_level_updated_at?: Date | null;
  display_score?: Prisma.Decimal | number | string | null;
  display_percentile?: Prisma.Decimal | number | string | null;
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
}

/**
 * Row type for dish query (Query B) - dishes with restaurant data for map pins
 */
interface DishQueryRow {
  connection_id: string;
  restaurant_id: string;
  food_id: string;
  categories: string[];
  food_attributes: string[];
  mention_count: number;
  total_upvotes: number;
  recent_mention_count: number;
  last_mentioned_at: Date | null;
  activity_level: ActivityLevel;
  food_quality_score: Prisma.Decimal | number | string;
  connection_display_score?: Prisma.Decimal | number | string | null;
  connection_display_percentile?: Prisma.Decimal | number | string | null;
  food_name: string;
  food_aliases: string[];
  coverage_key?: string | null;
  // Restaurant data for map pins
  restaurant_entity_id: string;
  restaurant_name: string;
  restaurant_aliases: string[];
  restaurant_display_score?: Prisma.Decimal | number | string | null;
  restaurant_display_percentile?: Prisma.Decimal | number | string | null;
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

interface ExecuteParams {
  plan: QueryPlan;
  request: SearchQueryRequestDto;
  pagination: { skip: number; take: number };
  perRestaurantLimit: number;
  includeSqlPreview?: boolean;
  dbPagination?: { skip: number; take: number };
}

interface ExecuteResult {
  foodResults: FoodResultDto[];
  restaurantResults: RestaurantResultDto[];
  totalFoodCount: number;
  totalRestaurantCount: number;
  metadata: {
    boundsApplied: boolean;
    openNowApplied: boolean;
    openNowSupportedRestaurants: number;
    openNowUnsupportedRestaurants: number;
    openNowUnsupportedRestaurantIds?: string[];
    openNowFilteredOut: number;
    priceFilterApplied: boolean;
    minimumVotesApplied: boolean;
  };
  sqlPreview?: string | null;
  timings?: Record<string, number>;
}

interface ExecuteDualParams {
  plan: QueryPlan;
  request: SearchQueryRequestDto;
  pagination: { skip: number; take: number };
  topDishesLimit?: number;
  includeSqlPreview?: boolean;
}

interface ExecuteDualResult {
  restaurants: RestaurantResultDto[];
  dishes: FoodResultDto[];
  totalRestaurantCount: number;
  totalDishCount: number;
  metadata: {
    boundsApplied: boolean;
    openNowApplied: boolean;
    openNowSupportedRestaurants: number;
    openNowUnsupportedRestaurants: number;
    openNowUnsupportedRestaurantIds?: string[];
    openNowFilteredOut: number;
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
    this.diagnosticLogging =
      (process.env.SEARCH_VERBOSE_DIAGNOSTICS || '').toLowerCase() === 'true';
    this.includePhaseTimings =
      (process.env.SEARCH_INCLUDE_PHASE_TIMINGS || '').toLowerCase() === 'true';
  }

  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const {
      plan,
      request,
      pagination,
      perRestaurantLimit,
      includeSqlPreview,
      dbPagination,
    } = params;

    const executeStart = performance.now();
    const effectivePagination = dbPagination ?? pagination;
    const buildStart = performance.now();
    const query = this.queryBuilder.build({
      plan,
      pagination: effectivePagination,
      searchCenter: this.resolveSearchCenter(request),
    });
    const buildSqlMs = performance.now() - buildStart;

    const referenceDate = new Date();
    const userLocation = this.normalizeUserLocation(request.userLocation);
    const dbStart = performance.now();
    const [connections, totalResult] = await Promise.all([
      this.prisma.$queryRaw<QueryResultRow[]>(query.dataSql),
      this.prisma.$queryRaw<
        Array<{ total_connections: bigint; total_restaurants: bigint }>
      >(query.countSql),
    ]);
    const dbQueryMs = performance.now() - dbStart;

    const postProcessStart = performance.now();
    const totalBeforeFiltering = Number(totalResult[0]?.total_connections ?? 0);
    const restaurantContexts = this.buildRestaurantContexts(
      connections,
      referenceDate,
      userLocation,
    );
    const totalRestaurantCountDb = Number(
      totalResult[0]?.total_restaurants ?? 0,
    );
    const needsOpenFilter = Boolean(request.openNow);

    let openNowFilterMs = 0;
    const openFilter = needsOpenFilter
      ? (() => {
          const openFilterStart = performance.now();
          const filtered = this.filterByOpenNow(
            connections,
            restaurantContexts,
          );
          openNowFilterMs = performance.now() - openFilterStart;
          return filtered;
        })()
      : {
          connections,
          applied: false,
          supportedCount: 0,
          unsupportedCount: 0,
          unsupportedIds: [],
        };

    const filteredConnections = openFilter.connections;
    const totalFoodCount = needsOpenFilter
      ? filteredConnections.length
      : totalBeforeFiltering;

    const openNowFilteredOut = needsOpenFilter
      ? connections.length - filteredConnections.length
      : 0;

    const paginatedConnections = needsOpenFilter
      ? this.applyManualPagination(filteredConnections, pagination)
      : connections;

    const limitedConnections =
      perRestaurantLimit > 0
        ? this.applyPerRestaurantLimit(paginatedConnections, perRestaurantLimit)
        : paginatedConnections;

    const minimumVotes =
      typeof request.minimumVotes === 'number' ? request.minimumVotes : null;

    const mapFoodStart = performance.now();
    const foodResults = this.mapFoodResults(
      limitedConnections,
      restaurantContexts,
      referenceDate,
      minimumVotes,
    );
    const mapFoodMs = performance.now() - mapFoodStart;
    const totalRestaurantCount = needsOpenFilter
      ? this.countDistinctRestaurants(filteredConnections)
      : totalRestaurantCountDb;
    const mapRestaurantStart = performance.now();
    const restaurantResults = this.mapRestaurantResults(
      limitedConnections,
      plan.ranking.restaurantOrder,
      minimumVotes,
      restaurantContexts,
      referenceDate,
    );
    const mapRestaurantMs = performance.now() - mapRestaurantStart;

    await this.attachCoverageNames({
      restaurants: restaurantResults,
      dishes: foodResults,
    });

    const postProcessMs = performance.now() - postProcessStart;
    const executeMs = performance.now() - executeStart;

    const timings = {
      buildSqlMs: Math.round(buildSqlMs),
      dbQueryMs: Math.round(dbQueryMs),
      openNowFilterMs: Math.round(openNowFilterMs),
      mapFoodMs: Math.round(mapFoodMs),
      mapRestaurantMs: Math.round(mapRestaurantMs),
      postProcessMs: Math.round(postProcessMs),
      executeMs: Math.round(executeMs),
    };

    if (this.includePhaseTimings) {
      this.logger.debug('Search executor timings', { timings });
    }

    if (this.diagnosticLogging) {
      this.logger.debug('Search executor diagnostics', {
        planFormat: plan.format,
        totalFetchedConnections: connections.length,
        limitedConnectionCount: limitedConnections.length,
        openNowApplied: openFilter.applied,
        openNowSupported: openFilter.supportedCount,
        openNowUnsupported: openFilter.unsupportedCount,
        openNowFilteredOut,
      });
    }

    return {
      foodResults,
      restaurantResults,
      totalFoodCount,
      totalRestaurantCount,
      metadata: {
        boundsApplied: query.metadata.boundsApplied,
        openNowApplied: openFilter.applied,
        openNowSupportedRestaurants: openFilter.supportedCount,
        openNowUnsupportedRestaurants: openFilter.unsupportedCount,
        openNowUnsupportedRestaurantIds: openFilter.unsupportedIds,
        openNowFilteredOut,
        priceFilterApplied: query.metadata.priceFilterApplied,
        minimumVotesApplied: query.metadata.minimumVotesApplied,
      },
      sqlPreview: includeSqlPreview ? query.preview : null,
      timings,
    };
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
      topDishesLimit = 3,
      includeSqlPreview,
    } = params;

    const executeStart = performance.now();
    const searchCenter = this.resolveSearchCenter(request);

    // Build both queries in parallel
    const buildStart = performance.now();
    const restaurantQuery = this.queryBuilder.buildRestaurantQuery({
      plan,
      pagination,
      searchCenter,
      topDishesLimit,
    });
    const dishQuery = this.queryBuilder.buildDishQuery({
      plan,
      pagination,
      searchCenter,
    });
    const buildSqlMs = performance.now() - buildStart;

    const referenceDate = new Date();
    const userLocation = this.normalizeUserLocation(request.userLocation);

    // Execute both queries in parallel
    const dbStart = performance.now();
    const [
      [restaurantRows, restaurantCountResult],
      [dishRows, dishCountResult],
    ] = await Promise.all([
      Promise.all([
        this.prisma.$queryRaw<RestaurantQueryRow[]>(restaurantQuery.dataSql),
        this.prisma.$queryRaw<Array<{ total_restaurants: bigint }>>(
          restaurantQuery.countSql,
        ),
      ]),
      Promise.all([
        this.prisma.$queryRaw<DishQueryRow[]>(dishQuery.dataSql),
        this.prisma.$queryRaw<
          Array<{ total_connections: bigint; total_restaurants: bigint }>
        >(dishQuery.countSql),
      ]),
    ]);
    const dbQueryMs = performance.now() - dbStart;

    const postProcessStart = performance.now();

    // Build restaurant contexts from both result sets for open now filtering
    const allRestaurantContexts = this.buildRestaurantContextsFromDual(
      restaurantRows,
      dishRows,
      referenceDate,
      userLocation,
    );

    const needsOpenFilter = Boolean(request.openNow);
    let openNowFilterMs = 0;
    let filteredRestaurantRows = restaurantRows;
    let filteredDishRows = dishRows;
    let openNowApplied = false;
    let openNowSupportedCount = 0;
    let openNowUnsupportedCount = 0;
    let openNowUnsupportedIds: string[] = [];
    let openNowFilteredOut = 0;

    if (needsOpenFilter) {
      const openFilterStart = performance.now();

      // Filter restaurants
      const restaurantFilter = this.filterRestaurantRowsByOpenNow(
        restaurantRows,
        allRestaurantContexts,
      );
      filteredRestaurantRows = restaurantFilter.rows;

      // Filter dishes
      const dishFilter = this.filterDishRowsByOpenNow(
        dishRows,
        allRestaurantContexts,
      );
      filteredDishRows = dishFilter.rows;

      openNowApplied = restaurantFilter.applied || dishFilter.applied;
      openNowSupportedCount =
        restaurantFilter.supportedCount + dishFilter.supportedCount;
      openNowUnsupportedCount =
        restaurantFilter.unsupportedCount + dishFilter.unsupportedCount;
      openNowUnsupportedIds = [
        ...new Set([
          ...restaurantFilter.unsupportedIds,
          ...dishFilter.unsupportedIds,
        ]),
      ];
      openNowFilteredOut =
        restaurantRows.length -
        filteredRestaurantRows.length +
        (dishRows.length - filteredDishRows.length);

      openNowFilterMs = performance.now() - openFilterStart;
    }

    // Map results
    const mapRestaurantStart = performance.now();
    const restaurants = this.mapRestaurantQueryResults(
      filteredRestaurantRows,
      allRestaurantContexts,
      referenceDate,
      userLocation,
    );
    const mapRestaurantMs = performance.now() - mapRestaurantStart;

    const mapDishStart = performance.now();
    const dishes = this.mapDishQueryResults(
      filteredDishRows,
      allRestaurantContexts,
      referenceDate,
    );
    const mapDishMs = performance.now() - mapDishStart;

    await this.attachCoverageNames({ restaurants, dishes });

    const postProcessMs = performance.now() - postProcessStart;
    const executeMs = performance.now() - executeStart;

    const timings = {
      buildSqlMs: Math.round(buildSqlMs),
      dbQueryMs: Math.round(dbQueryMs),
      openNowFilterMs: Math.round(openNowFilterMs),
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
        openNowSupportedCount,
        openNowUnsupportedCount,
        openNowFilteredOut,
      });
    }

    const totalRestaurantCount = Number(
      restaurantCountResult[0]?.total_restaurants ?? 0,
    );
    const totalDishCount = Number(dishCountResult[0]?.total_connections ?? 0);

    // Combine SQL previews if requested
    const sqlPreview = includeSqlPreview
      ? `-- Restaurant Query:\n${restaurantQuery.preview}\n\n-- Dish Query:\n${dishQuery.preview}`
      : null;

    return {
      restaurants,
      dishes,
      totalRestaurantCount,
      totalDishCount,
      metadata: {
        boundsApplied:
          restaurantQuery.metadata.boundsApplied ||
          dishQuery.metadata.boundsApplied,
        openNowApplied,
        openNowSupportedRestaurants: openNowSupportedCount,
        openNowUnsupportedRestaurants: openNowUnsupportedCount,
        openNowUnsupportedRestaurantIds: openNowUnsupportedIds,
        openNowFilteredOut,
        priceFilterApplied:
          restaurantQuery.metadata.priceFilterApplied ||
          dishQuery.metadata.priceFilterApplied,
        minimumVotesApplied:
          restaurantQuery.metadata.minimumVotesApplied ||
          dishQuery.metadata.minimumVotesApplied,
      },
      sqlPreview,
      timings,
    };
  }

  private countDistinctRestaurants(connections: QueryResultRow[]): number {
    const ids = new Set<string>();
    for (const connection of connections) {
      if (connection.restaurant_id) {
        ids.add(connection.restaurant_id);
      }
    }
    return ids.size;
  }

  private resolveCoverageName(row: {
    displayName?: string | null;
    locationName?: string | null;
    coverageKey?: string | null;
    name?: string | null;
  }): string | null {
    const displayName = row.displayName?.trim();
    if (displayName) {
      return displayName;
    }
    const locationName = row.locationName?.trim();
    if (locationName) {
      const [first] = locationName.split(',');
      return first?.trim() || locationName;
    }
    const key = row.coverageKey?.trim();
    if (key) {
      return key;
    }
    const name = row.name?.trim();
    return name || null;
  }

  private async attachCoverageNames(payload: {
    restaurants: RestaurantResultDto[];
    dishes: FoodResultDto[];
  }): Promise<void> {
    const coverageKeys = new Set<string>();

    payload.dishes.forEach((dish) => {
      const key =
        typeof dish.coverageKey === 'string' ? dish.coverageKey.trim() : '';
      if (key) {
        coverageKeys.add(key);
      }
    });
    payload.restaurants.forEach((restaurant) => {
      const key =
        typeof restaurant.coverageKey === 'string'
          ? restaurant.coverageKey.trim()
          : '';
      if (key) {
        coverageKeys.add(key);
      }
    });

    if (!coverageKeys.size) {
      return;
    }

    const rows = await this.prisma.coverageArea.findMany({
      where: {
        coverageKey: { in: Array.from(coverageKeys) },
        isActive: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        coverageKey: true,
        displayName: true,
        locationName: true,
        name: true,
      },
    });

    const coverageNameByKey = new Map<string, string>();
    rows.forEach((row) => {
      const key = row.coverageKey?.trim();
      if (!key) {
        return;
      }
      if (coverageNameByKey.has(key)) {
        return;
      }
      const coverageName = this.resolveCoverageName(row);
      if (coverageName) {
        coverageNameByKey.set(key, coverageName);
      }
    });

    if (!coverageNameByKey.size) {
      return;
    }

    payload.dishes.forEach((dish) => {
      if (dish.coverageName) {
        return;
      }
      const key =
        typeof dish.coverageKey === 'string' ? dish.coverageKey.trim() : '';
      if (!key) {
        return;
      }
      const coverageName = coverageNameByKey.get(key);
      if (coverageName) {
        dish.coverageName = coverageName;
      }
    });

    payload.restaurants.forEach((restaurant) => {
      if (restaurant.coverageName) {
        return;
      }
      const key =
        typeof restaurant.coverageKey === 'string'
          ? restaurant.coverageKey.trim()
          : '';
      if (!key) {
        return;
      }
      const coverageName = coverageNameByKey.get(key);
      if (coverageName) {
        restaurant.coverageName = coverageName;
      }
    });
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

  private buildOperatingMetadata(
    connection: QueryResultRow,
  ): RestaurantMetadata | null {
    return buildOperatingMetadataUtil({
      hoursValue: connection.hours,
      utcOffsetMinutesValue: connection.utc_offset_minutes,
      timeZoneValue: connection.time_zone,
      restaurantMetadataValue: connection.restaurant_metadata,
    });
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

  private buildOperatingMetadataFromRestaurantMetadata(
    metadataValue: Prisma.JsonValue | null | undefined,
  ): RestaurantMetadata | null {
    return buildOperatingMetadataFromRestaurantMetadataUtil(metadataValue);
  }

  private buildRestaurantContexts(
    connections: QueryResultRow[],
    referenceDate: Date,
    userLocation: UserLocationInput | null,
  ): Map<string, RestaurantContext> {
    const contexts = new Map<string, RestaurantContext>();

    for (const connection of connections) {
      const restaurantId = connection.restaurant_id;
      if (!restaurantId) {
        continue;
      }

      const existing = contexts.get(restaurantId);
      const locationId = connection.location_id;
      const latitude = this.toOptionalNumber(connection.latitude);
      const longitude = this.toOptionalNumber(connection.longitude);
      const parsedPrice = this.toOptionalNumber(
        connection.restaurant_price_level,
      );
      const priceDetails = this.describePriceLevel(parsedPrice);
      const operatingMetadata = this.buildOperatingMetadata(connection);
      const operatingStatus =
        existing?.operatingStatus ??
        this.evaluateOperatingStatus(operatingMetadata, referenceDate) ??
        null;
      const distanceMiles =
        latitude !== null &&
        latitude !== undefined &&
        longitude !== null &&
        longitude !== undefined &&
        userLocation
          ? this.computeDistanceMiles(userLocation, latitude, longitude)
          : null;

      if (existing) {
        if (existing.priceLevel === null && parsedPrice !== null) {
          existing.priceLevel = parsedPrice;
        }
        if (!existing.priceSymbol && priceDetails.symbol) {
          existing.priceSymbol = priceDetails.symbol;
        }
        if (!existing.operatingStatus && operatingStatus) {
          existing.operatingStatus = operatingStatus;
        }
        if (existing.distanceMiles === null && distanceMiles !== null) {
          existing.distanceMiles = distanceMiles;
        }
        continue;
      }

      contexts.set(restaurantId, {
        locationId,
        operatingStatus,
        priceLevel: parsedPrice ?? null,
        priceSymbol: priceDetails.symbol ?? null,
        distanceMiles: distanceMiles ?? null,
      });
    }

    return contexts;
  }

  private filterByOpenNow(
    connections: QueryResultRow[],
    restaurantContexts: Map<string, RestaurantContext>,
  ): {
    connections: QueryResultRow[];
    applied: boolean;
    supportedCount: number;
    unsupportedCount: number;
    unsupportedIds: string[];
  } {
    const filtered: QueryResultRow[] = [];
    let applied = false;
    let supported = 0;
    let unsupported = 0;
    const unsupportedIds: string[] = [];

    for (const connection of connections) {
      const status = restaurantContexts.get(
        connection.restaurant_id,
      )?.operatingStatus;

      if (!status) {
        unsupported += 1;
        unsupportedIds.push(connection.restaurant_id);
        continue;
      }

      applied = true;
      supported += 1;

      if (status.isOpen) {
        filtered.push(connection);
      }
    }

    if (!applied) {
      return {
        connections,
        applied: false,
        supportedCount: 0,
        unsupportedCount: unsupported,
        unsupportedIds,
      };
    }

    return {
      connections: filtered,
      applied: true,
      supportedCount: supported,
      unsupportedCount: unsupported,
      unsupportedIds,
    };
  }

  private applyManualPagination(
    connections: QueryResultRow[],
    pagination: { skip: number; take: number },
  ): QueryResultRow[] {
    if (pagination.take <= 0) {
      return [];
    }

    if (pagination.skip <= 0 && connections.length <= pagination.take) {
      return connections.slice(0, pagination.take);
    }

    return connections.slice(
      pagination.skip,
      pagination.skip + pagination.take,
    );
  }

  private applyPerRestaurantLimit(
    connections: QueryResultRow[],
    perRestaurantLimit: number,
  ): QueryResultRow[] {
    if (perRestaurantLimit <= 0) {
      return connections;
    }

    const counts = new Map<string, number>();
    const limited: QueryResultRow[] = [];

    for (const connection of connections) {
      const restaurantId = connection.restaurant_id;
      if (!restaurantId) {
        continue;
      }

      const current = counts.get(restaurantId) ?? 0;
      if (current >= perRestaurantLimit) {
        continue;
      }

      counts.set(restaurantId, current + 1);
      limited.push(connection);
    }

    return limited;
  }

  private mapFoodResults(
    connections: QueryResultRow[],
    restaurantContexts: Map<string, RestaurantContext>,
    referenceDate: Date,
    minimumVotes: number | null,
  ): FoodResultDto[] {
    const results: FoodResultDto[] = [];

    for (const connection of connections) {
      if (
        minimumVotes !== null &&
        this.toNumber(connection.restaurant_total_upvotes) < minimumVotes
      ) {
        continue;
      }
      const restaurantContext = restaurantContexts.get(
        connection.restaurant_id,
      );
      const parsedPrice =
        restaurantContext?.priceLevel ??
        this.toOptionalNumber(connection.restaurant_price_level);
      const priceDetails = this.describePriceLevel(parsedPrice);
      const operatingMetadata = this.buildOperatingMetadata(connection);
      const operatingStatus =
        restaurantContext?.operatingStatus ??
        this.evaluateOperatingStatus(operatingMetadata, referenceDate);
      const displayScore = this.toOptionalNumber(
        connection.connection_display_score,
      );
      const displayPercentile = this.toOptionalNumber(
        connection.connection_display_percentile,
      );

      results.push({
        connectionId: connection.connection_id,
        foodId: connection.food_id,
        foodName: connection.food_name,
        foodAliases: connection.food_aliases || [],
        restaurantId: connection.restaurant_id,
        restaurantName: connection.restaurant_name,
        restaurantAliases: connection.restaurant_aliases || [],
        qualityScore: this.toNumber(connection.food_quality_score),
        displayScore,
        displayPercentile,
        coverageKey: connection.restaurant_location_key ?? undefined,
        activityLevel: connection.activity_level,
        mentionCount: connection.mention_count,
        totalUpvotes: connection.total_upvotes,
        recentMentionCount: connection.recent_mention_count,
        lastMentionedAt: connection.last_mentioned_at
          ? connection.last_mentioned_at.toISOString()
          : null,
        categories: connection.categories || [],
        foodAttributes: connection.food_attributes || [],
        restaurantLocationId: connection.location_id,
        restaurantPriceLevel: parsedPrice ?? null,
        restaurantPriceSymbol:
          restaurantContext?.priceSymbol ?? priceDetails.symbol ?? null,
        restaurantDistanceMiles: restaurantContext?.distanceMiles ?? null,
        restaurantOperatingStatus: operatingStatus ?? null,
      });
    }

    return results;
  }

  private mapRestaurantResults(
    connections: QueryResultRow[],
    restaurantOrder: string,
    minimumVotes: number | null,
    restaurantContexts: Map<string, RestaurantContext>,
    referenceDate: Date,
  ): RestaurantResultDto[] {
    const grouped = new Map<
      string,
      {
        restaurantId: string;
        name: string;
        aliases: string[];
        restaurantQualityScore?: Prisma.Decimal | number | string | null;
        restaurantDisplayScore?: number | null;
        restaurantDisplayPercentile?: number | null;
        coverageKey?: string | null;
        latitude?: Prisma.Decimal | number | string | null;
        longitude?: Prisma.Decimal | number | string | null;
        address?: string | null;
        city?: string | null;
        region?: string | null;
        country?: string | null;
        postalCode?: string | null;
        googlePlaceId?: string | null;
        priceLevel?: number | null;
        priceLevelUpdatedAt?: Date | null;
        priceSymbol?: string | null;
        priceText?: string | null;
        locationId: string;
        locationIsPrimary?: boolean | null;
        locationPhoneNumber?: string | null;
        locationWebsiteUrl?: string | null;
        locationHours?: Prisma.JsonValue | null;
        locationUtcOffsetMinutes?: Prisma.Decimal | number | string | null;
        locationTimeZone?: string | null;
        locationLastPolledAt?: Date | null;
        locationCreatedAt?: Date | null;
        locationUpdatedAt?: Date | null;
        locationsJson?: Prisma.JsonValue | null;
        locationCount?: Prisma.Decimal | number | string | null;
        snippets: RestaurantFoodSnippetDto[];
        scoreSum: number;
        count: number;
        totalUpvotes: number;
        totalMentions: number;
      }
    >();

    for (const connection of connections) {
      const snippet: RestaurantFoodSnippetDto = {
        connectionId: connection.connection_id,
        foodId: connection.food_id,
        foodName: connection.food_name,
        qualityScore: this.toNumber(connection.food_quality_score),
        displayScore: this.toOptionalNumber(
          connection.connection_display_score,
        ),
        displayPercentile: this.toOptionalNumber(
          connection.connection_display_percentile,
        ),
        activityLevel: connection.activity_level,
      };

      const restaurantTotalUpvotes = this.toNumber(
        connection.restaurant_total_upvotes,
      );
      const restaurantTotalMentions = this.toNumber(
        connection.restaurant_total_mentions,
      );
      const existing = grouped.get(connection.restaurant_id);
      if (existing) {
        existing.snippets.push(snippet);
        existing.scoreSum += snippet.qualityScore;
        existing.count += 1;
        existing.totalUpvotes = restaurantTotalUpvotes;
        existing.totalMentions = restaurantTotalMentions;
        if (
          (existing.priceLevel === null || existing.priceLevel === undefined) &&
          connection.restaurant_price_level != null
        ) {
          const parsedPrice = this.toOptionalNumber(
            connection.restaurant_price_level,
          );
          const priceDetails = this.describePriceLevel(parsedPrice);
          existing.priceLevel = parsedPrice;
          existing.priceSymbol = priceDetails.symbol;
          existing.priceText = priceDetails.text;
        }
        if (
          !existing.priceLevelUpdatedAt &&
          connection.restaurant_price_level_updated_at
        ) {
          existing.priceLevelUpdatedAt =
            connection.restaurant_price_level_updated_at;
        }
        if (!existing.googlePlaceId && connection.google_place_id) {
          existing.googlePlaceId = connection.google_place_id;
        }
        if (!existing.locationPhoneNumber && connection.phone_number) {
          existing.locationPhoneNumber = connection.phone_number;
        }
        if (!existing.locationWebsiteUrl && connection.website_url) {
          existing.locationWebsiteUrl = connection.website_url;
        }
        if (!existing.locationHours && connection.hours) {
          existing.locationHours = connection.hours;
        }
        if (
          (existing.locationUtcOffsetMinutes === null ||
            existing.locationUtcOffsetMinutes === undefined) &&
          connection.utc_offset_minutes !== null &&
          connection.utc_offset_minutes !== undefined
        ) {
          existing.locationUtcOffsetMinutes = connection.utc_offset_minutes;
        }
        if (!existing.locationTimeZone && connection.time_zone) {
          existing.locationTimeZone = connection.time_zone;
        }
        if (!existing.locationsJson && connection.locations_json) {
          existing.locationsJson = connection.locations_json;
        }
        if (
          (existing.locationCount === null ||
            existing.locationCount === undefined) &&
          connection.location_count !== null &&
          connection.location_count !== undefined
        ) {
          existing.locationCount = connection.location_count;
        }
        if (
          existing.restaurantDisplayScore === null ||
          existing.restaurantDisplayScore === undefined
        ) {
          existing.restaurantDisplayScore = this.toOptionalNumber(
            connection.restaurant_display_score,
          );
        }
        if (
          existing.restaurantDisplayPercentile === null ||
          existing.restaurantDisplayPercentile === undefined
        ) {
          existing.restaurantDisplayPercentile = this.toOptionalNumber(
            connection.restaurant_display_percentile,
          );
        }
        if (!existing.coverageKey && connection.restaurant_location_key) {
          existing.coverageKey = connection.restaurant_location_key;
        }
      } else {
        const parsedPrice = this.toOptionalNumber(
          connection.restaurant_price_level,
        );
        const priceDetails = this.describePriceLevel(parsedPrice);
        grouped.set(connection.restaurant_id, {
          restaurantId: connection.restaurant_id,
          name: connection.restaurant_name,
          aliases: connection.restaurant_aliases || [],
          restaurantQualityScore: connection.restaurant_quality_score,
          restaurantDisplayScore: this.toOptionalNumber(
            connection.restaurant_display_score,
          ),
          restaurantDisplayPercentile: this.toOptionalNumber(
            connection.restaurant_display_percentile,
          ),
          coverageKey: connection.restaurant_location_key ?? null,
          latitude: connection.latitude,
          longitude: connection.longitude,
          address: connection.address,
          city: connection.city ?? null,
          region: connection.region ?? null,
          country: connection.country ?? null,
          postalCode: connection.postal_code ?? null,
          googlePlaceId: connection.google_place_id ?? null,
          priceLevel: parsedPrice,
          priceSymbol: priceDetails.symbol,
          priceText: priceDetails.text,
          priceLevelUpdatedAt:
            connection.restaurant_price_level_updated_at || null,
          locationId: connection.location_id,
          locationIsPrimary: connection.location_is_primary ?? null,
          locationPhoneNumber: connection.phone_number ?? null,
          locationWebsiteUrl: connection.website_url ?? null,
          locationHours: connection.hours ?? null,
          locationUtcOffsetMinutes: connection.utc_offset_minutes ?? null,
          locationTimeZone: connection.time_zone ?? null,
          locationLastPolledAt: connection.location_last_polled_at || null,
          locationCreatedAt: connection.location_created_at || null,
          locationUpdatedAt: connection.location_updated_at || null,
          locationsJson: connection.locations_json ?? null,
          locationCount: connection.location_count ?? null,
          snippets: [snippet],
          scoreSum: snippet.qualityScore,
          count: 1,
          totalUpvotes: restaurantTotalUpvotes,
          totalMentions: restaurantTotalMentions,
        });
      }
    }

    const results = Array.from(grouped.values())
      .filter(
        (restaurant) =>
          minimumVotes === null || restaurant.totalUpvotes >= minimumVotes,
      )
      .map(
        ({
          restaurantId,
          name,
          aliases,
          restaurantQualityScore,
          restaurantDisplayScore,
          restaurantDisplayPercentile,
          coverageKey,
          latitude,
          longitude,
          address,
          city,
          region,
          country,
          postalCode,
          googlePlaceId,
          priceLevel: groupedPriceLevel,
          priceSymbol,
          priceText,
          priceLevelUpdatedAt,
          locationId,
          locationIsPrimary,
          locationPhoneNumber,
          locationWebsiteUrl,
          locationHours,
          locationUtcOffsetMinutes,
          locationTimeZone,
          locationLastPolledAt,
          locationCreatedAt,
          locationUpdatedAt,
          locationsJson,
          locationCount,
          snippets,
          scoreSum,
          count,
          totalUpvotes,
          totalMentions,
        }) => {
          const restaurantContext = restaurantContexts.get(restaurantId);
          const resolvedPriceLevel =
            restaurantContext?.priceLevel ?? groupedPriceLevel ?? null;
          const resolvedPriceSymbol =
            restaurantContext?.priceSymbol ?? priceSymbol ?? null;
          const displayOperatingMetadata =
            this.buildOperatingMetadataFromLocation(
              locationHours,
              locationUtcOffsetMinutes,
              locationTimeZone,
            );
          const operatingStatus =
            restaurantContext?.operatingStatus ??
            (displayOperatingMetadata
              ? this.evaluateOperatingStatus(
                  displayOperatingMetadata,
                  referenceDate,
                )
              : null);
          const distanceMiles = restaurantContext?.distanceMiles ?? null;
          const resolvedPriceText = priceText ?? null;
          const displayLocation = {
            locationId,
            googlePlaceId: googlePlaceId ?? null,
            latitude:
              latitude === null || latitude === undefined
                ? null
                : this.toNumber(latitude),
            longitude:
              longitude === null || longitude === undefined
                ? null
                : this.toNumber(longitude),
            address: address ?? null,
            city: city ?? null,
            region: region ?? null,
            country: country ?? null,
            postalCode: postalCode ?? null,
            phoneNumber: locationPhoneNumber ?? null,
            websiteUrl: locationWebsiteUrl ?? null,
            hours: this.coerceRecord(locationHours),
            utcOffsetMinutes:
              this.toOptionalNumber(locationUtcOffsetMinutes) ?? null,
            timeZone: locationTimeZone ?? null,
            operatingStatus,
            isPrimary: Boolean(locationIsPrimary),
            lastPolledAt: locationLastPolledAt
              ? locationLastPolledAt.toISOString()
              : null,
            createdAt: locationCreatedAt
              ? locationCreatedAt.toISOString()
              : null,
            updatedAt: locationUpdatedAt
              ? locationUpdatedAt.toISOString()
              : null,
          };
          const locations = this.parseLocationsJson(
            locationsJson,
            referenceDate,
          );
          if (!locations.length) {
            locations.push(displayLocation);
          }
          const resolvedLocationCount =
            this.toOptionalNumber(locationCount) ?? locations.length;

          return {
            restaurantId,
            restaurantName: name,
            restaurantAliases: aliases || [],
            contextualScore: count ? scoreSum / count : 0,
            restaurantQualityScore:
              restaurantQualityScore === null ||
              restaurantQualityScore === undefined
                ? null
                : this.toNumber(restaurantQualityScore),
            displayScore: restaurantDisplayScore ?? null,
            displayPercentile: restaurantDisplayPercentile ?? null,
            coverageKey: coverageKey ?? undefined,
            mentionCount:
              totalMentions === undefined || totalMentions === null
                ? undefined
                : this.toNumber(totalMentions),
            totalUpvotes: totalUpvotes,
            latitude:
              latitude === null || latitude === undefined
                ? null
                : this.toNumber(latitude),
            longitude:
              longitude === null || longitude === undefined
                ? null
                : this.toNumber(longitude),
            address: address ?? null,
            restaurantLocationId: locationId,
            priceLevel: resolvedPriceLevel,
            priceSymbol: resolvedPriceSymbol,
            priceText: resolvedPriceText,
            priceLevelUpdatedAt: priceLevelUpdatedAt
              ? priceLevelUpdatedAt.toISOString()
              : null,
            operatingStatus,
            distanceMiles: distanceMiles,
            displayLocation,
            locations,
            locationCount: resolvedLocationCount,
            topFood: snippets
              .sort((a, b) => {
                const scoreA = a.displayScore ?? a.qualityScore;
                const scoreB = b.displayScore ?? b.qualityScore;
                return scoreB - scoreA;
              })
              .slice(0, TOP_RESTAURANT_FOOD_SNIPPETS),
            totalDishCount: count,
          };
        },
      );

    return this.sortRestaurants(results, restaurantOrder);
  }

  private sortRestaurants(
    restaurants: RestaurantResultDto[],
    restaurantOrder: string,
  ): RestaurantResultDto[] {
    const order = restaurantOrder?.toLowerCase() ?? '';
    const isAsc = order.includes('asc');
    const sortByContextual = order.includes('contextual_food_quality');
    const direction = isAsc ? 1 : -1;

    const getScore = (restaurant: RestaurantResultDto): number => {
      if (sortByContextual) {
        return restaurant.contextualScore ?? 0;
      }
      if (restaurant.displayPercentile != null) {
        return restaurant.displayPercentile;
      }
      if (restaurant.displayScore != null) {
        return restaurant.displayScore;
      }
      if (restaurant.restaurantQualityScore != null) {
        return restaurant.restaurantQualityScore;
      }
      return restaurant.contextualScore ?? 0;
    };

    return restaurants.sort((a, b) => {
      const scoreDiff = (getScore(a) - getScore(b)) * direction;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      const upvoteDiff =
        ((a.totalUpvotes ?? 0) - (b.totalUpvotes ?? 0)) * direction;
      if (upvoteDiff !== 0) {
        return upvoteDiff;
      }
      const mentionDiff =
        ((a.mentionCount ?? 0) - (b.mentionCount ?? 0)) * direction;
      if (mentionDiff !== 0) {
        return mentionDiff;
      }
      return a.restaurantId.localeCompare(b.restaurantId);
    });
  }

  private isRestaurantOpenNow(
    metadataValue: unknown,
    referenceDate: Date,
  ): boolean | null {
    const status = this.evaluateOperatingStatus(metadataValue, referenceDate);
    if (!status) {
      return null;
    }
    return status.isOpen;
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

  private findNextOpenDisplay(
    schedule: DailySchedule,
    timeContext: { dayKey: DayKey; minutes: number },
  ): string | null {
    const startDayIndex = DAY_KEYS.indexOf(timeContext.dayKey);
    if (startDayIndex < 0) {
      return null;
    }

    for (let offset = 0; offset < DAY_KEYS.length; offset += 1) {
      const dayIndex = (startDayIndex + offset) % DAY_KEYS.length;
      const dayKey = DAY_KEYS[dayIndex];
      const segments = schedule[dayKey] || [];

      for (const segment of segments) {
        if (offset === 0 && segment.start <= timeContext.minutes) {
          continue;
        }

        const timeLabel = this.formatMinutesToDisplay(segment.start);
        const dayLabel = this.describeDayOffset(dayKey, offset);
        return dayLabel ? `${timeLabel} ${dayLabel}` : timeLabel;
      }
    }

    return null;
  }

  private describeDayOffset(dayKey: DayKey, offset: number): string {
    if (offset === 0) {
      return '';
    }
    if (offset === 1) {
      return 'tomorrow';
    }
    const label = dayKey.slice(0, 3);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  private buildDailySchedule(
    metadata: RestaurantMetadata,
  ): DailySchedule | null {
    const hoursValue = metadata.hours;
    if (!hoursValue) {
      return null;
    }

    const schedule: Partial<Record<DayKey, DaySegment[]>> = {};
    const hoursRecord = this.coerceRecord(hoursValue);

    if (hoursRecord) {
      for (const [rawKey, value] of Object.entries(hoursRecord)) {
        if (this.isHoursMetadataProperty(rawKey)) {
          continue;
        }

        const dayKey = this.normalizeDayKey(rawKey);
        if (!dayKey) {
          continue;
        }

        const segments = this.parseHourValue(value);
        if (segments.length) {
          schedule[dayKey] = segments;
        }
      }
    } else if (Array.isArray(hoursValue)) {
      for (const entry of hoursValue) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const entryRecord = entry as Record<string, unknown>;
        const rawDay = entryRecord.day ?? entryRecord.weekday;
        const dayKey = this.normalizeDayKey(
          typeof rawDay === 'string' ? rawDay : '',
        );
        if (!dayKey) {
          continue;
        }

        const value =
          entryRecord.value ?? entryRecord.hours ?? entryRecord.range ?? entry;
        const segments = this.parseHourValue(value);
        if (segments.length) {
          schedule[dayKey] = segments;
        }
      }
    } else if (typeof hoursValue === 'string') {
      const segments = this.parseHourValue(hoursValue);
      if (segments.length) {
        for (const day of DAY_KEYS) {
          schedule[day] = segments;
        }
      }
    }

    if (Object.keys(schedule).length === 0) {
      return null;
    }

    return schedule as DailySchedule;
  }

  private isHoursMetadataProperty(key: string): boolean {
    const normalized = key.toLowerCase();
    return (
      normalized === 'timezone' ||
      normalized === 'time_zone' ||
      normalized === 'tz' ||
      normalized === 'utc_offset_minutes' ||
      normalized === 'status'
    );
  }

  private parseHourValue(value: unknown): DaySegment[] {
    if (!value) {
      return [];
    }

    if (typeof value === 'string') {
      return this.parseHourString(value);
    }

    if (Array.isArray(value)) {
      return value.flatMap((entry) => this.parseHourValue(entry));
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const openValue = record.open ?? record.start ?? record.opens;
      const closeValue = record.close ?? record.end ?? record.closes;
      if (typeof openValue === 'string' && typeof closeValue === 'string') {
        return [this.buildSegmentFromHHMM(openValue, closeValue)];
      }
    }

    return [];
  }

  private parseHourString(value: string): DaySegment[] {
    const rangeMatch = value.match(
      /(\d{1,2}:?\d{0,2}\s?(am|pm)?)[^\d]+(\d{1,2}:?\d{0,2}\s?(am|pm)?)/i,
    );
    if (!rangeMatch) {
      return [];
    }

    const openRaw = rangeMatch[1];
    const closeRaw = rangeMatch[3];
    return [this.buildSegmentFromHHMM(openRaw, closeRaw)];
  }

  private buildSegmentFromHHMM(openRaw: string, closeRaw: string): DaySegment {
    const openMinutes = this.parseTimeString(openRaw);
    const closeMinutes = this.parseTimeString(closeRaw);

    if (openMinutes === null || closeMinutes === null) {
      return { start: 0, end: 0, crossesMidnight: false };
    }

    if (closeMinutes <= openMinutes) {
      return {
        start: openMinutes,
        end: closeMinutes,
        crossesMidnight: true,
      };
    }

    return {
      start: openMinutes,
      end: closeMinutes,
      crossesMidnight: false,
    };
  }

  private parseTimeString(value: string): number | null {
    const trimmed = value.trim().toLowerCase();
    const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!match) {
      return null;
    }

    let hour = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    const period = match[3];

    if (period === 'pm' && hour < 12) {
      hour += 12;
    } else if (period === 'am' && hour === 12) {
      hour = 0;
    }

    return hour * 60 + minutes;
  }

  private matchesSegment(
    segment: DaySegment,
    minutes: number,
    previousDay: boolean,
  ): boolean {
    if (segment.crossesMidnight) {
      if (previousDay) {
        return minutes < segment.end;
      }
      return minutes >= segment.start;
    }

    return minutes >= segment.start && minutes < segment.end;
  }

  private computeMinutesUntilClose(
    segment: DaySegment,
    minutes: number,
    previousDay: boolean,
  ): number {
    if (segment.crossesMidnight) {
      if (previousDay) {
        return Math.max(segment.end - minutes, 0);
      }
      return Math.max(24 * 60 - minutes + segment.end, 0);
    }

    return Math.max(segment.end - minutes, 0);
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

  private formatMinutesToDisplay(minutes: number): string {
    const totalMinutes = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
    let hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) {
      hour = 12;
    }
    const minuteText = minute.toString().padStart(2, '0');
    return `${hour}:${minuteText} ${period}`;
  }

  private getLocalTimeContext(
    metadata: RestaurantMetadata,
    referenceDate: Date,
  ): LocalTimeContext | null {
    const timezone = this.extractTimeZone(metadata);
    if (timezone) {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          weekday: 'long',
        });
        const parts = formatter.formatToParts(referenceDate);
        const hourPart = parts.find((part) => part.type === 'hour');
        const minutePart = parts.find((part) => part.type === 'minute');
        const weekdayPart = parts.find((part) => part.type === 'weekday');
        if (!hourPart || !minutePart || !weekdayPart) {
          return null;
        }

        const dayKey = this.normalizeDayKey(weekdayPart.value);
        if (!dayKey) {
          return null;
        }

        const hour = Number(hourPart.value);
        const minute = Number(minutePart.value);
        if (Number.isNaN(hour) || Number.isNaN(minute)) {
          return null;
        }

        return {
          dayKey,
          minutes: hour * 60 + minute,
          timezoneApplied: true,
        };
      } catch (error) {
        this.logger.warn('Failed to evaluate timezone for open-now filter', {
          timezone,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      }
    }

    const offset = this.extractUtcOffset(metadata);
    if (offset !== null) {
      const adjusted = new Date(referenceDate.getTime() + offset * 60 * 1000);
      const dayKey = DAY_KEYS[adjusted.getUTCDay()];
      const minutes = adjusted.getUTCHours() * 60 + adjusted.getUTCMinutes();
      return {
        dayKey,
        minutes,
        timezoneApplied: false,
      };
    }

    return null;
  }

  private extractTimeZone(metadata: RestaurantMetadata): string | null {
    const candidates: Array<string | undefined> = [
      metadata.timezone,
      metadata.timeZone,
      metadata.time_zone,
      metadata.tz,
    ];

    const hoursRecord = this.coerceRecord(metadata.hours);
    if (hoursRecord) {
      const nestedCandidate =
        hoursRecord.timezone ??
        hoursRecord.timeZone ??
        hoursRecord.time_zone ??
        hoursRecord.tz;
      if (typeof nestedCandidate === 'string') {
        candidates.push(nestedCandidate);
      }
    }

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    return null;
  }

  private extractUtcOffset(metadata: RestaurantMetadata): number | null {
    const candidates: Array<number | string | undefined> = [
      metadata.utc_offset_minutes,
    ];
    const hoursRecord = this.coerceRecord(metadata.hours);
    if (hoursRecord) {
      const offsetCandidate = (
        hoursRecord as {
          utc_offset_minutes?: unknown;
        }
      ).utc_offset_minutes;
      if (
        typeof offsetCandidate === 'number' ||
        (typeof offsetCandidate === 'string' && offsetCandidate.trim())
      ) {
        candidates.push(offsetCandidate);
      }
    }

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
      if (typeof candidate === 'string' && candidate.trim()) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  private normalizeDayKey(value: string): DayKey | null {
    const normalized = value.trim().toLowerCase();
    const match = DAY_KEYS.find((day) => normalized.startsWith(day));
    return match ?? null;
  }

  private extractPriceRangeText(
    metadata: Record<string, unknown> | null,
  ): string | null {
    if (!metadata) {
      return null;
    }

    const googlePlaces = this.coerceRecord(metadata.googlePlaces);
    const priceRangeCandidate =
      googlePlaces?.priceRange ??
      googlePlaces?.price_range ??
      metadata.priceRange;

    if (typeof priceRangeCandidate === 'string') {
      const trimmed = priceRangeCandidate.trim();
      return trimmed.length ? trimmed : null;
    }

    const priceRangeRecord = this.coerceRecord(priceRangeCandidate);
    if (!priceRangeRecord) {
      return null;
    }

    const min = this.toOptionalNumber(
      priceRangeRecord.min as Prisma.Decimal | number | string | null,
    );
    const max = this.toOptionalNumber(
      priceRangeRecord.max as Prisma.Decimal | number | string | null,
    );

    if (min !== null && max !== null) {
      return `$${min}-${max}`;
    }
    if (max !== null) {
      return `<$${max}`;
    }
    if (min !== null) {
      return `$${min}+`;
    }

    const rawText =
      typeof priceRangeRecord.formattedText === 'string'
        ? priceRangeRecord.formattedText
        : typeof priceRangeRecord.rawText === 'string'
          ? priceRangeRecord.rawText
          : typeof priceRangeRecord.text === 'string'
            ? priceRangeRecord.text
            : null;

    return rawText?.trim() || null;
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

  private filterRestaurantRowsByOpenNow(
    rows: RestaurantQueryRow[],
    contexts: Map<string, RestaurantContext>,
  ): {
    rows: RestaurantQueryRow[];
    applied: boolean;
    supportedCount: number;
    unsupportedCount: number;
    unsupportedIds: string[];
  } {
    const filtered: RestaurantQueryRow[] = [];
    let applied = false;
    let supported = 0;
    let unsupported = 0;
    const unsupportedIds: string[] = [];

    for (const row of rows) {
      const status = contexts.get(row.restaurant_id)?.operatingStatus;

      if (!status) {
        unsupported += 1;
        unsupportedIds.push(row.restaurant_id);
        continue;
      }

      applied = true;
      supported += 1;

      if (status.isOpen) {
        filtered.push(row);
      }
    }

    if (!applied) {
      return {
        rows,
        applied: false,
        supportedCount: 0,
        unsupportedCount: unsupported,
        unsupportedIds,
      };
    }

    return {
      rows: filtered,
      applied: true,
      supportedCount: supported,
      unsupportedCount: unsupported,
      unsupportedIds,
    };
  }

  private filterDishRowsByOpenNow(
    rows: DishQueryRow[],
    contexts: Map<string, RestaurantContext>,
  ): {
    rows: DishQueryRow[];
    applied: boolean;
    supportedCount: number;
    unsupportedCount: number;
    unsupportedIds: string[];
  } {
    const filtered: DishQueryRow[] = [];
    let applied = false;
    let supported = 0;
    let unsupported = 0;
    const unsupportedIds: string[] = [];

    for (const row of rows) {
      const status = contexts.get(row.restaurant_id)?.operatingStatus;

      if (!status) {
        unsupported += 1;
        unsupportedIds.push(row.restaurant_id);
        continue;
      }

      applied = true;
      supported += 1;

      if (status.isOpen) {
        filtered.push(row);
      }
    }

    if (!applied) {
      return {
        rows,
        applied: false,
        supportedCount: 0,
        unsupportedCount: unsupported,
        unsupportedIds,
      };
    }

    return {
      rows: filtered,
      applied: true,
      supportedCount: supported,
      unsupportedCount: unsupported,
      unsupportedIds,
    };
  }

  private mapRestaurantQueryResults(
    rows: RestaurantQueryRow[],
    contexts: Map<string, RestaurantContext>,
    referenceDate: Date,
    userLocation: UserLocationInput | null,
  ): RestaurantResultDto[] {
    return rows.map((row) => {
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
        restaurantAliases: row.restaurant_aliases || [],
        contextualScore: 0, // Not applicable for dual query
        restaurantQualityScore: this.toOptionalNumber(
          row.restaurant_quality_score,
        ),
        displayScore: this.toOptionalNumber(row.display_score),
        displayPercentile: this.toOptionalNumber(row.display_percentile),
        coverageKey: row.location_key ?? undefined,
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
        foodAliases: row.food_aliases || [],
        restaurantId: row.restaurant_entity_id,
        restaurantName: row.restaurant_name,
        restaurantAliases: row.restaurant_aliases || [],
        restaurantLocationId: row.location_id,
        qualityScore: this.toNumber(row.food_quality_score),
        displayScore: this.toOptionalNumber(row.connection_display_score),
        displayPercentile: this.toOptionalNumber(
          row.connection_display_percentile,
        ),
        coverageKey: row.coverage_key ?? undefined,
        activityLevel: row.activity_level,
        mentionCount: row.mention_count,
        totalUpvotes: row.total_upvotes,
        recentMentionCount: row.recent_mention_count,
        lastMentionedAt: row.last_mentioned_at?.toISOString() ?? null,
        categories: row.categories || [],
        foodAttributes: row.food_attributes || [],
        restaurantPriceLevel: parsedPrice ?? null,
        restaurantPriceSymbol: priceDetails.symbol ?? null,
        restaurantDistanceMiles: context?.distanceMiles ?? null,
        restaurantOperatingStatus: operatingStatus,
        // Additional fields for map pins
        restaurantDisplayScore: this.toOptionalNumber(
          row.restaurant_display_score,
        ),
        restaurantDisplayPercentile: this.toOptionalNumber(
          row.restaurant_display_percentile,
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
        qualityScore: this.toNumber(
          record.qualityScore as Prisma.Decimal | number | string | null,
        ),
        displayScore: this.toOptionalNumber(
          record.displayScore as Prisma.Decimal | number | string | null,
        ),
        displayPercentile: this.toOptionalNumber(
          record.displayPercentile as Prisma.Decimal | number | string | null,
        ),
        activityLevel: (record.activityLevel as ActivityLevel) || 'normal',
      });
    }

    return results;
  }
}
